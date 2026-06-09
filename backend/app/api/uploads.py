import os
import uuid
import shutil
from fastapi import APIRouter, Depends, UploadFile, File as FastAPIFile, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from backend.app.core.config import settings
from backend.app.core.database import get_db
from backend.app.core.security import get_current_user
from backend.app.models.models import User, Upload, File as DbFile, ActivityLog
from backend.app.schemas.schemas import UploadResponse, FileResponse
from backend.app.services.file_processor import FileProcessor

router = APIRouter(prefix="/uploads", tags=["Uploads"])

def validate_file(filename: str, file_size: int) -> str:
    """Validate file extension and file size."""
    ext = filename.split(".")[-1].lower()
    if ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type: .{ext}. Allowed: {', '.join(settings.ALLOWED_EXTENSIONS)}"
        )
    
    # Check max file size (default 100MB)
    max_bytes = settings.MAX_FILE_SIZE_MB * 1024 * 1024
    if file_size > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Max size allowed is {settings.MAX_FILE_SIZE_MB}MB."
        )
    
    return ext

@router.post("/", response_model=UploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_files(
    files: List[UploadFile] = FastAPIFile(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Upload multiple spreadsheet files (XLSX, XLS, CSV, PDF).
    Saves them to disk, extracts metadata (sheets, sizes), and registers in DB.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded.")
        
    upload_session = Upload(status="PENDING", user_id=current_user.id)
    db.add(upload_session)
    db.flush()  # Generates upload_session.id

    db_files = []
    
    for f in files:
        # Read a small chunk or check size from headers
        # Since FastAPI UploadFile holds a file-like object, we can seek to find size
        f.file.seek(0, os.SEEK_END)
        file_size = f.file.tell()
        f.file.seek(0)
        
        try:
            ext = validate_file(f.filename, file_size)
        except HTTPException as he:
            # Mark upload session as failed
            upload_session.status = "FAILED"
            upload_session.error_message = he.detail
            db.commit()
            raise he

        # Generate unique local storage filename
        stored_filename = f"upload_{upload_session.id}_{uuid.uuid4().hex}.{ext}"
        storage_path = os.path.join(settings.UPLOAD_DIR, stored_filename)
        
        # Save physical file to disk
        try:
            with open(storage_path, "wb") as buffer:
                shutil.copyfileobj(f.file, buffer)
        except Exception as e:
            upload_session.status = "FAILED"
            upload_session.error_message = f"Disk write failed: {str(e)}"
            db.commit()
            raise HTTPException(status_code=500, detail=f"Failed to write file to disk: {str(e)}")

        # Extract sheets and headers for previews
        sheet_names = None
        row_count = 0
        column_count = 0
        
        try:
            if ext in ("xlsx", "xls"):
                sheet_names = FileProcessor.get_excel_sheets(storage_path)
                # Parse the first sheet to get quick metadata counts
                if sheet_names:
                    cols, rows = FileProcessor.read_excel_sheet(storage_path, sheet_names[0])
                    row_count = len(rows)
                    column_count = len(cols)
            elif ext == "csv":
                cols, rows = FileProcessor.read_csv(storage_path)
                row_count = len(rows)
                column_count = len(cols)
            elif ext == "pdf":
                cols, rows = FileProcessor.read_pdf_tables(storage_path)
                row_count = len(rows)
                column_count = len(cols)
        except Exception as pe:
            # Logging error but keeping file entry (user can review upload status)
            db_file = DbFile(
                upload_id=upload_session.id,
                filename=f.filename,
                file_type=ext,
                storage_path=storage_path,
                status="FAILED",
                row_count=0,
                column_count=0
            )
            db.add(db_file)
            db.flush()
            continue

        # Register file record in DB
        db_file = DbFile(
            upload_id=upload_session.id,
            filename=f.filename,
            file_type=ext,
            storage_path=storage_path,
            sheet_names=sheet_names,
            row_count=row_count,
            column_count=column_count,
            status="UPLOADED"
        )
        db.add(db_file)
        db.flush()
        db_files.append(db_file)

    # Check if all files failed
    all_failed = len(db_files) == 0 and len(files) > 0
    upload_session.status = "FAILED" if all_failed else "COMPLETED"
    
    # Log action
    log = ActivityLog(
        user_id=current_user.id,
        action="UPLOAD_FILES",
        details=f"Uploaded {len(files)} file(s). Session ID: {upload_session.id}."
    )
    db.add(log)
    db.commit()
    db.refresh(upload_session)
    
    return upload_session

@router.get("/session/{upload_id}", response_model=UploadResponse)
def get_upload_session(upload_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Fetch status and files of an upload session."""
    session = db.query(Upload).filter(Upload.id == upload_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Upload session not found")
    return session
