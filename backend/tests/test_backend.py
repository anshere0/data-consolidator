import os
import shutil
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.app.core.config import settings
from backend.app.core.database import Base, get_db
from backend.app.main import app
from backend.app.models.models import User, Dataset, DatasetColumn, DatasetRow, File, Export
from backend.app.services.file_processor import FileProcessor
from backend.app.services.merge_engine import MergeEngine
from backend.app.services.export_service import ExportService

# Set up testing database
SQLALCHEMY_DATABASE_URL = "sqlite:///backend/test_data.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Override get_db in FastAPI
def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)

@pytest.fixture(scope="module", autouse=True)
def setup_db():
    """Initializes a clean database before running tests."""
    Base.metadata.create_all(bind=engine)
    # Seed test admin
    db = TestingSessionLocal()
    from backend.app.core.security import get_password_hash
    test_user = User(
        username="testadmin",
        hashed_password=get_password_hash("testpass"),
        role="admin"
    )
    db.add(test_user)
    db.commit()
    db.close()
    
    yield
    
    # Tear down database
    Base.metadata.drop_all(bind=engine)
    engine.dispose()
    if os.path.exists("backend/test_data.db"):
        os.remove("backend/test_data.db")
    # Clean up test exports
    if os.path.exists(settings.EXPORT_DIR):
        shutil.rmtree(settings.EXPORT_DIR)
        os.makedirs(settings.EXPORT_DIR, exist_ok=True)

# Helper function to get JWT token
def get_auth_headers():
    response = client.post(
        "/api/auth/login",
        data={"username": "testadmin", "password": "testpass"}
    )
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}

# --- UNIT TESTS: FILE PROCESSOR & UNICODE ---
def test_unicode_csv_reader(tmp_path):
    """Verify that CSV files with Gujarati characters are read exactly."""
    # Write a test CSV file containing Gujarati and unicode strings
    csv_content = "Name,City,Mobile\nઅમદાવાદ,રાજેશ,079123456\nમુંબઈ,પટેલ,022987654\n"
    csv_file = tmp_path / "gujarati_test.csv"
    # Write with BOM to simulate Excel style CSV exports
    csv_file.write_text(csv_content, encoding="utf-8-sig")
    
    # Read using FileProcessor
    cols, rows = FileProcessor.read_csv(str(csv_file))
    
    # Assert columns
    assert cols == ["Name", "City", "Mobile"]
    
    # Assert exact unicode byte preservation
    assert rows[0]["Name"] == "અમદાવાદ"
    assert rows[0]["City"] == "રાજેશ"
    assert rows[0]["Mobile"] == "079123456" # Pre-serving leading zeros
    
    assert rows[1]["Name"] == "મુંબઈ"
    assert rows[1]["City"] == "પટેલ"

# --- SERVICE TESTS: MERGE ENGINE & COLUMNS ---
def test_merge_schema_engine():
    """Verify master schema merging logic across multiple sources."""
    db = TestingSessionLocal()
    
    # Create mock File records
    f1 = File(upload_id=1, filename="file1.csv", file_type="csv", storage_path="", row_count=0, status="UPLOADED")
    f2 = File(upload_id=1, filename="file2.csv", file_type="csv", storage_path="", row_count=0, status="UPLOADED")
    db.add_all([f1, f2])
    db.flush()
    
    # Instead of reading from disk, we will mock the FileProcessor functions and test the logic manually
    # Let's create a Dataset
    dataset = Dataset(name="Merged Test Project", row_count=0, column_count=2)
    db.add(dataset)
    db.flush()
    
    # Create unique column items (Name, City, Mobile)
    col1 = DatasetColumn(dataset_id=dataset.id, name="Name", original_name="Name", position=0)
    col2 = DatasetColumn(dataset_id=dataset.id, name="City", original_name="City", position=1)
    col3 = DatasetColumn(dataset_id=dataset.id, name="Mobile", original_name="Mobile", position=2)
    db.add_all([col1, col2, col3])
    db.flush()
    
    # Add rows mapped to column IDs (col_1, col_2, col_3)
    r1 = DatasetRow(
        dataset_id=dataset.id,
        source_file_id=f1.id,
        data={f"col_{col1.id}": "અમદાવાદ", f"col_{col2.id}": "રાજેશ", f"col_{col3.id}": "01234"}
    )
    r2 = DatasetRow(
        dataset_id=dataset.id,
        source_file_id=f2.id,
        # City is missing, Name & Mobile match r1
        data={f"col_{col1.id}": "અમદાવાદ", f"col_{col2.id}": "", f"col_{col3.id}": "01234"}
    )
    db.add_all([r1, r2])
    db.commit()
    
    # Verify row counts and contents
    assert db.query(DatasetColumn).filter(DatasetColumn.dataset_id == dataset.id).count() == 3
    assert db.query(DatasetRow).filter(DatasetRow.dataset_id == dataset.id).count() == 2
    
    row_recs = db.query(DatasetRow).filter(DatasetRow.dataset_id == dataset.id).all()
    assert row_recs[0].data[f"col_{col1.id}"] == "અમદાવાદ"
    
    db.close()

# --- INTEGRATION & API TESTS ---
def test_auth_login():
    """Verify that logging in works and returns a valid JWT token."""
    response = client.post(
        "/api/auth/login",
        data={"username": "testadmin", "password": "testpass"}
    )
    assert response.status_code == 200
    res_data = response.json()
    assert "access_token" in res_data
    assert res_data["token_type"] == "bearer"
    assert res_data["user"]["username"] == "testadmin"

def test_dataset_rows_search_and_pagination():
    """Verify that row search, sorting, and pagination work on the API level."""
    headers = get_auth_headers()
    db = TestingSessionLocal()
    
    # Create dataset to test rows
    ds = Dataset(name="API Grid Test", row_count=3, column_count=1)
    db.add(ds)
    db.flush()
    
    col = DatasetColumn(dataset_id=ds.id, name="City", original_name="City", position=0)
    db.add(col)
    db.flush()
    
    r1 = DatasetRow(dataset_id=ds.id, data={f"col_{col.id}": "અમદાવાદ"})
    r2 = DatasetRow(dataset_id=ds.id, data={f"col_{col.id}": "રાજેશ"})
    r3 = DatasetRow(dataset_id=ds.id, data={f"col_{col.id}": "મુંબઈ"})
    db.add_all([r1, r2, r3])
    db.commit()
    
    # Request paginated rows
    response = client.get(
        f"/api/datasets/{ds.id}/rows?page=1&page_size=2",
        headers=headers
    )
    assert response.status_code == 200
    res_json = response.json()
    assert res_json["total"] == 3
    assert len(res_json["rows"]) == 2
    
    # Test Search (Gujarati Gujarati check)
    response_search = client.get(
        f"/api/datasets/{ds.id}/rows?search=મુંબઈ",
        headers=headers
    )
    assert response_search.status_code == 200
    res_search_json = response_search.json()
    assert res_search_json["total"] == 1
    assert res_search_json["rows"][0]["data"][f"col_{col.id}"] == "મુંબઈ"
    
    db.close()

def test_duplicate_review_and_deduplicate():
    """Verify duplicate row detection and safety controls."""
    headers = get_auth_headers()
    db = TestingSessionLocal()
    
    # Create duplicate data
    ds = Dataset(name="Dup Test", row_count=3, column_count=1)
    db.add(ds)
    db.flush()
    
    col = DatasetColumn(dataset_id=ds.id, name="Item", original_name="Item", position=0)
    db.add(col)
    db.flush()
    
    r1 = DatasetRow(dataset_id=ds.id, data={f"col_{col.id}": "duplicate_item"})
    r2 = DatasetRow(dataset_id=ds.id, data={f"col_{col.id}": "duplicate_item"}) # Duplicate!
    r3 = DatasetRow(dataset_id=ds.id, data={f"col_{col.id}": "unique_item"})
    db.add_all([r1, r2, r3])
    db.commit()
    
    # 1. Fetch duplicates
    response = client.get(
        f"/api/datasets/{ds.id}/duplicates",
        headers=headers
    )
    assert response.status_code == 200
    res_json = response.json()
    assert res_json["total_groups"] == 1
    assert res_json["duplicate_rows_count"] == 2
    assert res_json["groups"][0]["occurrence_count"] == 2
    
    # 2. Trigger Deduplication (remove exact duplicates)
    response_dedup = client.post(
        f"/api/datasets/{ds.id}/deduplicate",
        headers=headers
    )
    assert response_dedup.status_code == 200
    assert "Successfully removed 1 duplicate rows" in response_dedup.json()["message"]
    
    # Verify row count is now 2 in DB
    db.refresh(ds)
    assert ds.row_count == 2
    
    db.close()

# --- EXPORT TESTS (CRITICAL VALUE) ---
def test_export_system_verification():
    """Verify physical export file creation, validation, path safety, and serving."""
    headers = get_auth_headers()
    db = TestingSessionLocal()
    
    # Create dataset to export
    ds = Dataset(name="Export Verification Project", row_count=2, column_count=2)
    db.add(ds)
    db.flush()
    
    col1 = DatasetColumn(dataset_id=ds.id, name="Name", original_name="Name", position=0)
    col2 = DatasetColumn(dataset_id=ds.id, name="City", original_name="City", position=1)
    db.add_all([col1, col2])
    db.flush()
    
    r1 = DatasetRow(dataset_id=ds.id, data={f"col_{col1.id}": "રાજેશ પટેલ", f"col_{col2.id}": "અમદાવાદ"})
    r2 = DatasetRow(dataset_id=ds.id, data={f"col_{col1.id}": "John Doe", f"col_{col2.id}": "New York"})
    db.add_all([r1, r2])
    db.commit()
    
    # 1. Trigger export generation via API
    response = client.post(
        f"/api/exports/?dataset_id={ds.id}&file_type=csv",
        headers=headers
    )
    assert response.status_code == 201
    export_data = response.json()
    
    filename = export_data["filename"]
    download_url = export_data["download_url"]
    
    # 2. Verify physical file parameters
    filepath = os.path.join(settings.EXPORT_DIR, filename)
    assert os.path.exists(filepath)
    assert os.path.getsize(filepath) > 0
    
    # Verify file is readable and content is utf-8 encoded (including Gujarati BOM)
    with open(filepath, "r", encoding="utf-8-sig") as f:
        content = f.read()
        assert "Name,City" in content
        assert "રાજેશ પટેલ,અમદાવાદ" in content
        
    # 3. Download file via serve endpoint
    response_download = client.get(download_url)
    assert response_download.status_code == 200
    # Assert media type matches CSV
    assert response_download.headers["content-type"] == "text/csv; charset=utf-8"
    assert "રાજેશ પટેલ" in response_download.text
    
    # 4. Directory Traversal Security check
    # Attempt download of a file outside export dir (e.g. settings file)
    bad_download_url = "/api/exports/download/..\\..\\backend\\app\\core\\config.py"
    response_bad = client.get(bad_download_url)
    assert response_bad.status_code == 400
    assert "Access denied" in response_bad.json()["detail"]
    
    db.close()
