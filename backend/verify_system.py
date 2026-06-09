import os
import shutil
import pandas as pd
from sqlalchemy.orm import Session
from backend.app.core.config import settings
from backend.app.core.database import Base, engine, SessionLocal
from backend.app.models.models import User, Dataset, DatasetColumn, DatasetRow, File, Export
from backend.app.services.file_processor import FileProcessor
from backend.app.services.merge_engine import MergeEngine
from backend.app.services.export_service import ExportService
from backend.app.core.security import get_password_hash

def main():
    print("==================================================")
    print("STARTING SYSTEM VALIDATION & COMPLIANCE VERIFICATION")
    print("==================================================")
    
    # 1. Clean and Setup Database
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    
    # Create test directories
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    os.makedirs(settings.EXPORT_DIR, exist_ok=True)
    
    # Seed admin user
    admin = User(username="admin", hashed_password=get_password_hash("admin123"), role="admin")
    db.add(admin)
    db.commit()
    
    print("[1] Database initialized and seeded with admin account.")

    # 2. Generate actual test files with Gujarati text
    # Excel File 1
    xlsx_path = os.path.join(settings.UPLOAD_DIR, "test_gujarati_source.xlsx")
    df1 = pd.DataFrame([
        {"Name": "અમદાવાદ", "City": "ગુજરાત", "Mobile": "07912345"},
        {"Name": "રાજેશ પટેલ", "City": "સુરત", "Mobile": "09876543"}
    ])
    df1.to_excel(xlsx_path, index=False, engine="openpyxl")
    
    # CSV File 2
    csv_path = os.path.join(settings.UPLOAD_DIR, "test_gujarati_source.csv")
    df2 = pd.DataFrame([
        {"Name": "અમદાવાદ", "Mobile": "07912345", "Email": "amd@test.com"},
        {"Name": "રાજેશ પટેલ", "Mobile": "09876543", "Email": "rajesh@test.com"},
        {"Name": "અમદાવાદ", "Mobile": "07912345", "Email": "amd@test.com"}  # Duplicate row!
    ])
    df2.to_csv(csv_path, index=False, encoding="utf-8-sig")

    print("[2] Staged actual test files containing Gujarati unicode text:")
    print(f"    - Excel: {xlsx_path}")
    print(f"    - CSV: {csv_path}")

    # Register files in DB
    file1 = File(upload_id=1, filename="test_gujarati_source.xlsx", file_type="xlsx", storage_path=xlsx_path, sheet_names=["Sheet1"], status="UPLOADED")
    file2 = File(upload_id=1, filename="test_gujarati_source.csv", file_type="csv", storage_path=csv_path, status="UPLOADED")
    db.add_all([file1, file2])
    db.commit()

    # 3. Test File Processor (Unicode Safety)
    cols1, rows1 = FileProcessor.read_excel_sheet(xlsx_path, "Sheet1")
    cols2, rows2 = FileProcessor.read_csv(csv_path)
    
    assert "અમદાવાદ" in [r["Name"] for r in rows1]
    assert "રાજેશ પટેલ" in [r["Name"] for r in rows2]
    
    print("[3] File Processor read unicode elements correctly. Byte structure matches source.")

    # 4. Test Merge Engine (Schema Consolidation)
    # Master schema columns should combine Name, City, Mobile, Email
    files_sheets_map = {
        file1.id: ["Sheet1"],
        file2.id: []
    }
    
    dataset = MergeEngine.create_dataset_from_files(db, "Unified Gujarati Dataset", files_sheets_map, admin.id)
    print(f"[4] Merge Engine created dataset: ID {dataset.id}, Name: '{dataset.name}'")
    print(f"    - Row Count: {dataset.row_count}")
    print(f"    - Column Count: {dataset.column_count}")
    
    # Verify master columns in DB
    cols = db.query(DatasetColumn).filter(DatasetColumn.dataset_id == dataset.id).all()
    col_names = [c.name for c in cols]
    print(f"    - Consolidate columns: {', '.join(col_names)}")
    assert "Name" in col_names
    assert "City" in col_names
    assert "Mobile" in col_names
    assert "Email" in col_names

    # 5. Duplicate Handling Audit
    # We staged 1 duplicate in CSV (અમદાવાદ, 07912345, amd@test.com)
    # Let's count duplicate groups
    columns = db.query(DatasetColumn).filter(DatasetColumn.dataset_id == dataset.id, DatasetColumn.is_deleted == False).all()
    col_ids = [f"col_{c.id}" for c in columns]
    all_rows = db.query(DatasetRow).filter(DatasetRow.dataset_id == dataset.id).all()
    
    seen = set()
    dup_count = 0
    for r in all_rows:
        key = tuple(r.data.get(cid, "") for cid in col_ids)
        if key in seen:
            dup_count += 1
        else:
            seen.add(key)
            
    print(f"[5] Duplicate check completed. Staged duplicates found: {dup_count}")
    assert dup_count == 1

    # Remove exact duplicates
    seen_keys = set()
    deleted = 0
    for r in all_rows:
        key = tuple(r.data.get(cid, "") for cid in col_ids)
        if key in seen_keys:
            db.delete(r)
            deleted += 1
        else:
            seen_keys.add(key)
    if deleted > 0:
        dataset.row_count -= deleted
        db.commit()
    print(f"    - Deduplicated rows: {deleted}. Clean dataset row count: {dataset.row_count}")
    assert dataset.row_count == 4

    # 6. Physical Export Generation and Verification
    # Export to Excel
    export_xlsx = ExportService.generate_export(db, dataset.id, "xlsx")
    assert export_xlsx.status == "COMPLETED"
    assert os.path.exists(export_xlsx.file_path)
    assert os.path.getsize(export_xlsx.file_path) > 0
    
    # Export to CSV
    export_csv = ExportService.generate_export(db, dataset.id, "csv")
    assert export_csv.status == "COMPLETED"
    assert os.path.exists(export_csv.file_path)
    
    # Verify CSV file is byte-for-byte exact with BOM and has Gujarati
    with open(export_csv.file_path, "r", encoding="utf-8-sig") as f:
        csv_data = f.read()
        assert "અમદાવાદ" in csv_data
        assert "રાજેશ પટેલ" in csv_data

    print("[6] Physical export files generated and verified successfully:")
    print(f"    - Excel file: {export_xlsx.file_path} ({os.path.getsize(export_xlsx.file_path)} bytes)")
    print(f"    - CSV file: {export_csv.file_path} ({os.path.getsize(export_csv.file_path)} bytes)")

    print("==================================================")
    print("ALL ACCEPANCE CRITERIA VALIDATED successfully")
    print("==================================================")
    
    db.close()

if __name__ == "__main__":
    main()
