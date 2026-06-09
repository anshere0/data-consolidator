import logging
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Tuple
from app.models.models import Dataset, DatasetColumn, DatasetRow, File
from app.services.file_processor import FileProcessor

logger = logging.getLogger(__name__)

class MergeEngine:
    @staticmethod
    def create_dataset_from_files(
        db: Session,
        name: str,
        files_sheets_map: Dict[int, List[str]],
        user_id: int = None
    ) -> Dataset:
        """
        Create a merged master dataset from multiple uploaded files.
        files_sheets_map: Dict of file_id -> list of sheet names (empty list for CSV/PDF)
        """
        try:
            # 1. Retrieve all files and verify they exist
            db_files = {}
            for file_id in files_sheets_map.keys():
                file_rec = db.query(File).filter(File.id == file_id).first()
                if not file_rec:
                    raise ValueError(f"File ID {file_id} not found in database.")
                db_files[file_id] = file_rec

            # 2. Extract columns and rows from all files & sheets
            all_file_data = []  # List of dicts: {"file_id": file_id, "sheet": sheet, "cols": [...], "rows": [...]}
            master_column_names = []
            seen_columns = set()

            for file_id, sheets in files_sheets_map.items():
                file_rec = db_files[file_id]
                
                # Determine how to read the file
                if file_rec.file_type in ("xlsx", "xls"):
                    # If Excel and sheets is empty, read all sheets
                    target_sheets = sheets if sheets else file_rec.sheet_names
                    if not target_sheets:
                        target_sheets = FileProcessor.get_excel_sheets(file_rec.storage_path)
                    
                    for sheet in target_sheets:
                        cols, rows = FileProcessor.read_excel_sheet(file_rec.storage_path, sheet)
                        all_file_data.append({
                            "file_id": file_id,
                            "sheet": sheet,
                            "cols": cols,
                            "rows": rows
                        })
                        for col in cols:
                            if col not in seen_columns:
                                seen_columns.add(col)
                                master_column_names.append(col)
                
                elif file_rec.file_type == "csv":
                    cols, rows = FileProcessor.read_csv(file_rec.storage_path)
                    all_file_data.append({
                        "file_id": file_id,
                        "sheet": "",
                        "cols": cols,
                        "rows": rows
                    })
                    for col in cols:
                        if col not in seen_columns:
                            seen_columns.add(col)
                            master_column_names.append(col)
                
                elif file_rec.file_type == "pdf":
                    cols, rows = FileProcessor.read_pdf_tables(file_rec.storage_path)
                    all_file_data.append({
                        "file_id": file_id,
                        "sheet": "",
                        "cols": cols,
                        "rows": rows
                    })
                    for col in cols:
                        if col not in seen_columns:
                            seen_columns.add(col)
                            master_column_names.append(col)

            if not master_column_names:
                raise ValueError("No columns detected in the selected files.")

            # 3. Create the Dataset master record
            dataset = Dataset(
                name=name,
                user_id=user_id,
                row_count=0,
                column_count=len(master_column_names)
            )
            db.add(dataset)
            db.flush()  # Generates dataset.id

            # 4. Create DatasetColumn records & map names to Column IDs (col_1, col_2...)
            column_name_to_id = {}
            db_columns = []
            
            for idx, col_name in enumerate(master_column_names):
                db_col = DatasetColumn(
                    dataset_id=dataset.id,
                    name=col_name,
                    original_name=col_name,
                    position=idx,
                    is_deleted=False
                )
                db_columns.append(db_col)
                db.add(db_col)
            
            db.flush()  # Generates database ids for columns
            
            # Map column original name -> metadata column ID (col_<db_id>)
            for col_rec in db_columns:
                column_name_to_id[col_rec.original_name] = f"col_{col_rec.id}"

            # 5. Process and map every row's values to the generated metadata column IDs
            rows_to_insert = []
            total_rows = 0

            for data_block in all_file_data:
                file_id = data_block["file_id"]
                rows = data_block["rows"]
                
                for row in rows:
                    # Construct row JSON data mapping column_id -> cell value
                    row_data = {}
                    for original_col_name, val in row.items():
                        col_id = column_name_to_id.get(original_col_name)
                        if col_id:
                            # Keep value byte-for-byte identical. Gujarati/Unicode preserved.
                            row_data[col_id] = str(val) if val is not None else ""
                    
                    # Fill missing columns as empty strings
                    for col_id in column_name_to_id.values():
                        if col_id not in row_data:
                            row_data[col_id] = ""

                    rows_to_insert.append({
                        "dataset_id": dataset.id,
                        "source_file_id": file_id,
                        "data": row_data
                    })
                    total_rows += 1

            # 6. Bulk insert rows for massive performance gain
            if rows_to_insert:
                db.bulk_insert_mappings(DatasetRow, rows_to_insert)
            
            # 7. Update Dataset metrics and set source file states to PROCESSED
            dataset.row_count = total_rows
            
            for file_rec in db_files.values():
                file_rec.status = "PROCESSED"
                
            db.commit()
            
            logger.info(f"Merged {len(files_sheets_map)} files into Dataset ID {dataset.id} containing {total_rows} rows.")
            return dataset
        except Exception as e:
            db.rollback()
            logger.error(f"Merge engine failed: {str(e)}")
            raise e
