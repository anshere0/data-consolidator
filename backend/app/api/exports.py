import os
import json
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import User, Export, ActivityLog
from app.schemas.schemas import ExportResponse
from app.services.export_service import ExportService

router = APIRouter(prefix="/exports", tags=["Exports"])

@router.post("/", response_model=ExportResponse, status_code=status.HTTP_201_CREATED)
def trigger_export(
    dataset_id: int,
    file_type: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Trigger the creation of a physical export file (XLSX or CSV)."""
    if file_type not in ("xlsx", "csv"):
        raise HTTPException(status_code=400, detail="Unsupported export type. Only 'xlsx' or 'csv' are allowed.")
    
    try:
        export_rec = ExportService.generate_export(db, dataset_id, file_type)
        
        # Log activity
        log = ActivityLog(
            user_id=current_user.id,
            action="GENERATE_EXPORT",
            details=f"Generated {file_type.upper()} export for dataset ID {dataset_id}."
        )
        db.add(log)
        db.commit()
        
        return export_rec
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Export generation failed: {str(e)}")

@router.get("/dataset/{dataset_id}", response_model=List[ExportResponse])
def list_exports(
    dataset_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all generated exports for a dataset."""
    return db.query(Export).filter(Export.dataset_id == dataset_id).order_by(Export.created_at.desc()).all()

@router.get("/download/{filename}")
def download_export_file(
    filename: str,
    db: Session = Depends(get_db)
    # Note: Authentication can be bypassed or used via token parameter for direct browser downloads.
    # We will allow download by filename but strictly validate the file path to prevent directory traversal.
):
    """
    Serve physical export downloads using FastAPI FileResponse.
    Strictly audits file existence, size, readability, and path constraints before serving.
    """
    # 1. Resolve path using pathlib Path to handle casing, symlinks, and directory normalization on Windows
    export_dir = Path(settings.EXPORT_DIR).resolve()
    filepath = (export_dir / filename).resolve()

    # Path traversal check using is_relative_to (which handles Windows casing variations natively)
    if not filepath.is_relative_to(export_dir):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Access denied. Invalid export file path structure."
        )

    # 2. Verify file exists
    file_exists = filepath.exists() and filepath.is_file()
    if not file_exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The requested export file does not exist on the server."
        )

    # 3. Verify file size > 0
    file_size = filepath.stat().st_size
    if file_size == 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The requested export file is corrupted (0 bytes)."
        )

    # 4. Verify file is readable
    can_read = False
    try:
        with open(filepath, "rb") as f:
            f.read(10)
        can_read = True
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"The requested export file is not readable: {str(e)}"
        )

    # Determine media type
    ext = filepath.suffix.lower()
    media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" if ext == ".xlsx" else "text/csv"

    # Query the db to find the export_id matching this filename
    export_rec = db.query(Export).filter(Export.filename == filename).first()
    export_id = str(export_rec.id) if export_rec else "unknown"

    # Generate temporary diagnostic report
    debug_report = {
        "export_id": export_id,
        "absolute_path": str(filepath),
        "file_exists": file_exists,
        "file_size": file_size,
        "mime_type": media_type,
        "download_url": f"/api/exports/download/{filename}",
        "can_read": can_read
    }
    
    # Save the diagnostic report to exports/export_debug_report.json
    try:
        report_path = export_dir / "export_debug_report.json"
        with open(report_path, "w", encoding="utf-8") as rf:
            json.dump(debug_report, rf, indent=2)
    except Exception:
        pass  # Safe fallback if write fails

    # Return download FileResponse
    return FileResponse(
        path=str(filepath),
        media_type=media_type,
        filename=filename
    )

