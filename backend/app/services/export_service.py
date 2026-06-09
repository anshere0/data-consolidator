import os
import uuid
import logging
import pandas as pd
from sqlalchemy.orm import Session
from backend.app.core.config import settings
from backend.app.models.models import Dataset, DatasetColumn, DatasetRow, Export

logger = logging.getLogger(__name__)

class ExportService:
    @staticmethod
    def generate_export(db: Session, dataset_id: int, file_type: str) -> Export:
        """
        Generate a physical export file (XLSX or CSV) for a dataset.
        Strictly verifies file creation and logs metadata to DB.
        """
        if file_type not in ("xlsx", "csv"):
            raise ValueError(f"Unsupported export type: {file_type}")

        # 1. Retrieve dataset metadata
        dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
        if not dataset:
            raise ValueError(f"Dataset ID {dataset_id} not found.")

        # Create export record in PENDING state
        export_filename = f"export_{dataset_id}_{uuid.uuid4().hex}.{file_type}"
        export_filepath = os.path.join(settings.EXPORT_DIR, export_filename)
        download_url = f"/api/exports/download/{export_filename}"

        db_export = Export(
            dataset_id=dataset_id,
            filename=export_filename,
            file_type=file_type,
            file_path=export_filepath,
            download_url=download_url,
            row_count=dataset.row_count,
            status="PENDING"
        )
        db.add(db_export)
        db.commit()
        db.refresh(db_export)

        try:
            # 2. Get active columns sorted by position
            columns = db.query(DatasetColumn)\
                .filter(DatasetColumn.dataset_id == dataset_id, DatasetColumn.is_deleted == False)\
                .order_by(DatasetColumn.position.asc())\
                .all()

            if not columns:
                raise ValueError("No active columns found to export.")

            column_id_to_name = {f"col_{col.id}": col.name for col in columns}
            column_ids = [f"col_{col.id}" for col in columns]

            # 3. Retrieve and structure rows
            # We use yield/chunking or standard query for large datasets.
            # To support performance, we load row objects and convert them.
            rows = db.query(DatasetRow).filter(DatasetRow.dataset_id == dataset_id).all()
            
            export_data = []
            for r in rows:
                row_dict = {}
                row_json = r.data
                for col_id in column_ids:
                    display_name = column_name = column_id_to_name[col_id]
                    # Get value or empty string. Keep Gujarati and Unicode byte-for-byte identical.
                    cell_val = row_json.get(col_id, "")
                    row_dict[display_name] = cell_val
                export_data.append(row_dict)

            # 4. Create DataFrame
            df = pd.DataFrame(export_data, columns=[col.name for col in columns])

            # 5. Write to physical location
            if file_type == "csv":
                # utf-8-sig adds BOM (Byte Order Mark) so MS Excel opens Gujarati/Unicode correctly
                df.to_csv(export_filepath, index=False, encoding="utf-8-sig")
            elif file_type == "xlsx":
                df.to_excel(export_filepath, index=False, engine="openpyxl")

            # 6. Audit and Validate physical file
            # Verify file exists
            if not os.path.exists(export_filepath):
                raise FileNotFoundError(f"Export file was not created at: {export_filepath}")
            
            # Verify size > 0
            file_size = os.path.getsize(export_filepath)
            if file_size == 0:
                raise ValueError(f"Export file is empty (size 0 bytes): {export_filepath}")

            # Verify file is readable (try opening it)
            with open(export_filepath, "rb") as test_f:
                # Read first 100 bytes to check accessibility
                header_check = test_f.read(100)
                if not header_check:
                    raise IOError(f"Could not read content from export file: {export_filepath}")

            # 7. Update export record to COMPLETED
            db_export.status = "COMPLETED"
            db.commit()
            logger.info(f"Export file generated successfully: {export_filepath} ({file_size} bytes)")
            
            return db_export

        except Exception as e:
            # Mark export as FAILED and save error details
            db.rollback()
            db_export.status = "FAILED"
            db_export.error_message = str(e)
            db.commit()
            
            logger.error(f"Failed to generate export for Dataset {dataset_id}: {str(e)}")
            
            # If a partial file was created, clean it up
            if os.path.exists(export_filepath):
                try:
                    os.remove(export_filepath)
                except Exception:
                    pass
            
            raise e
