from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
import datetime

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import User, Dataset, DatasetColumn, DatasetRow, ActivityLog
from app.schemas.schemas import (
    DatasetResponse,
    ColumnResponse,
    ColumnUpdate,
    PaginatedRows,
    RowResponse,
    RowCreate,
    RowUpdate,
    DuplicateReviewResponse,
    DuplicateGroup
)
from app.services.merge_engine import MergeEngine

router = APIRouter(prefix="/datasets", tags=["Datasets"])

@router.post("/", response_model=DatasetResponse, status_code=status.HTTP_201_CREATED)
def merge_datasets(
    name: str,
    files_sheets_map: Dict[int, List[str]],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Merge uploaded files and sheets into a consolidated Dataset."""
    try:
        dataset = MergeEngine.create_dataset_from_files(
            db=db,
            name=name,
            files_sheets_map=files_sheets_map,
            user_id=current_user.id
        )
        # Log activity
        log = ActivityLog(
            user_id=current_user.id,
            action="MERGE_DATASET",
            details=f"Merged dataset '{name}' (ID: {dataset.id})."
        )
        db.add(log)
        db.commit()
        return dataset
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Merge operation failed: {str(e)}")

@router.get("/", response_model=List[DatasetResponse])
def list_datasets(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """List all consolidated datasets."""
    return db.query(Dataset).order_by(Dataset.created_at.desc()).all()

@router.get("/{dataset_id}", response_model=DatasetResponse)
def get_dataset(dataset_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Fetch dataset metadata."""
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dataset

@router.delete("/{dataset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dataset(dataset_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Delete a dataset and its columns/rows."""
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    
    # Log activity
    log = ActivityLog(
        user_id=current_user.id,
        action="DELETE_DATASET",
        details=f"Deleted dataset '{dataset.name}' (ID: {dataset.id})."
    )
    db.add(log)
    
    db.delete(dataset)
    db.commit()
    return

@router.get("/{dataset_id}/columns", response_model=List[ColumnResponse])
def get_dataset_columns(
    dataset_id: int,
    include_deleted: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retrieve all columns associated with a dataset, sorted by display position."""
    query = db.query(DatasetColumn).filter(DatasetColumn.dataset_id == dataset_id)
    if not include_deleted:
        query = query.filter(DatasetColumn.is_deleted == False)
    return query.order_by(DatasetColumn.position.asc()).all()

@router.put("/{dataset_id}/columns", response_model=List[ColumnResponse])
def update_dataset_columns(
    dataset_id: int,
    columns_in: List[Dict[str, Any]],  # Expect [{id: int, name: opt_str, position: opt_int, is_deleted: opt_bool}]
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Bulk update column attributes (rename, reorder, delete).
    This operation only modifies column metadata, guaranteeing imported cell values remain byte-for-byte identical.
    """
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    updated_cols = []
    for col_data in columns_in:
        col_id = col_data.get("id")
        if col_id is None or (isinstance(col_id, int) and col_id < 0):
            # Create a brand new column
            db_col = DatasetColumn(
                dataset_id=dataset_id,
                name=col_data.get("name", "New Column").strip(),
                original_name=col_data.get("name", "New Column").strip(),
                position=col_data.get("position", 0),
                is_deleted=col_data.get("is_deleted", False)
            )
            db.add(db_col)
            db.flush()
            
            # Initialize this new column key to empty string in all rows
            col_key = f"col_{db_col.id}"
            rows = db.query(DatasetRow).filter(DatasetRow.dataset_id == dataset_id).all()
            for r in rows:
                new_row_data = dict(r.data)
                new_row_data[col_key] = ""
                r.data = new_row_data
        else:
            db_col = db.query(DatasetColumn).filter(
                DatasetColumn.id == col_id,
                DatasetColumn.dataset_id == dataset_id
            ).first()
            
            if not db_col:
                continue
                
            if "name" in col_data and col_data["name"]:
                db_col.name = col_data["name"].strip()
            if "position" in col_data:
                db_col.position = col_data["position"]
            if "is_deleted" in col_data:
                db_col.is_deleted = col_data["is_deleted"]
                
        updated_cols.append(db_col)
    
    # Recalculate columns count
    active_count = db.query(DatasetColumn).filter(
        DatasetColumn.dataset_id == dataset_id,
        DatasetColumn.is_deleted == False
    ).count()
    dataset.column_count = active_count
    
    # Log activity
    log = ActivityLog(
        user_id=current_user.id,
        action="UPDATE_COLUMNS",
        details=f"Modified column metadata for dataset {dataset.name}."
    )
    db.add(log)
    db.commit()
    
    # Return all remaining columns
    return db.query(DatasetColumn).filter(
        DatasetColumn.dataset_id == dataset_id,
        DatasetColumn.is_deleted == False
    ).order_by(DatasetColumn.position.asc()).all()

@router.get("/{dataset_id}/rows", response_model=PaginatedRows)
def get_dataset_rows(
    dataset_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=1000),
    search: Optional[str] = None,
    sort_by: Optional[int] = None,  # Represents the Column ID (metadata ID)
    sort_order: str = Query("asc", pattern="^(asc|desc)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get paginated, searchable, sorted dataset rows.
    Search scans all visible column values.
    """
    # 1. Fetch active columns to map IDs and restrict row searches
    columns = db.query(DatasetColumn).filter(
        DatasetColumn.dataset_id == dataset_id,
        DatasetColumn.is_deleted == False
    ).order_by(DatasetColumn.position.asc()).all()
    
    column_ids = {f"col_{c.id}" for c in columns}

    # 2. Query all rows for sorting/filtering
    # (Since dataset sizes are moderate, standard in-memory operations on DB query is extremely robust)
    all_rows = db.query(DatasetRow).filter(DatasetRow.dataset_id == dataset_id).all()
    
    # 3. Apply Search Filter
    filtered_rows = []
    if search:
        search_lower = search.lower()
        for row in all_rows:
            # Check if search term matches any active column cell value
            match = False
            for col_id in column_ids:
                val = str(row.data.get(col_id, "")).lower()
                if search_lower in val:
                    match = True
                    break
            if match:
                filtered_rows.append(row)
    else:
        filtered_rows = all_rows

    # 4. Apply Sort
    if sort_by:
        sort_col_key = f"col_{sort_by}"
        if sort_col_key in column_ids:
            reverse = (sort_order == "desc")
            
            # Key handles natural sorting or fallback to string sorting
            def get_sort_key(row_obj):
                val = str(row_obj.data.get(sort_col_key, ""))
                # Handle numeric comparison safely if values represent numbers
                try:
                    return (0, float(val))
                except ValueError:
                    return (1, val)
            
            filtered_rows.sort(key=get_sort_key, reverse=reverse)

    # 5. Paginate
    total = len(filtered_rows)
    start = (page - 1) * page_size
    paginated = filtered_rows[start : start + page_size]

    return {
        "total": total,
        "rows": paginated,
        "columns": columns
    }

@router.post("/{dataset_id}/rows", response_model=RowResponse, status_code=status.HTTP_201_CREATED)
def add_dataset_row(
    dataset_id: int,
    row_in: RowCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Add a new empty or prefilled row to a dataset."""
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
        
    # Standardize data: ensure all active columns have a key in the inserted JSON
    columns = db.query(DatasetColumn).filter(
        DatasetColumn.dataset_id == dataset_id,
        DatasetColumn.is_deleted == False
    ).all()
    
    row_data = {}
    for col in columns:
        key = f"col_{col.id}"
        # Keep value byte-for-byte identical. Unicode/Gujarati preserved.
        row_data[key] = str(row_in.data.get(key, ""))
        
    db_row = DatasetRow(
        dataset_id=dataset_id,
        data=row_data
    )
    db.add(db_row)
    
    # Increment row count
    dataset.row_count += 1
    
    # Log activity
    log = ActivityLog(
        user_id=current_user.id,
        action="ADD_ROW",
        details=f"Added row in dataset ID {dataset_id}."
    )
    db.add(log)
    db.commit()
    db.refresh(db_row)
    return db_row

@router.put("/{dataset_id}/rows/{row_id}", response_model=RowResponse)
def update_dataset_row(
    dataset_id: int,
    row_id: int,
    row_in: RowUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Edit row cell values. Strictly preserves byte-for-byte Unicode."""
    db_row = db.query(DatasetRow).filter(
        DatasetRow.id == row_id,
        DatasetRow.dataset_id == dataset_id
    ).first()
    
    if not db_row:
        raise HTTPException(status_code=404, detail="Row not found")

    # Update cell values in JSON
    new_data = dict(db_row.data)
    for col_key, val in row_in.data.items():
        # Keep value byte-for-byte identical. Unicode/Gujarati preserved.
        new_data[col_key] = str(val) if val is not None else ""
        
    db_row.data = new_data
    
    # Update dataset modified timestamp
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if dataset:
        dataset.updated_at = datetime.datetime.utcnow()
        
    db.commit()
    db.refresh(db_row)
    return db_row

@router.delete("/{dataset_id}/rows/{row_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dataset_row(
    dataset_id: int,
    row_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a row from a dataset."""
    db_row = db.query(DatasetRow).filter(
        DatasetRow.id == row_id,
        DatasetRow.dataset_id == dataset_id
    ).first()
    
    if not db_row:
        raise HTTPException(status_code=404, detail="Row not found")
        
    db.delete(db_row)
    
    # Decrement row count
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if dataset:
        dataset.row_count = max(0, dataset.row_count - 1)
        dataset.updated_at = datetime.datetime.utcnow()
        
    db.commit()
    return

@router.get("/{dataset_id}/duplicates", response_model=DuplicateReviewResponse)
def review_duplicates(
    dataset_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Scans dataset and groups exact duplicate rows.
    Rows are duplicates if all their active column cell values are identical.
    """
    # 1. Fetch active columns
    columns = db.query(DatasetColumn).filter(
        DatasetColumn.dataset_id == dataset_id,
        DatasetColumn.is_deleted == False
    ).order_by(DatasetColumn.position.asc()).all()
    
    col_ids = [f"col_{c.id}" for c in columns]
    col_names = {f"col_{c.id}": c.name for c in columns}

    # 2. Get all rows
    rows = db.query(DatasetRow).filter(DatasetRow.dataset_id == dataset_id).all()
    
    # 3. Group rows
    groups_dict = {}
    for r in rows:
        # Extract row data for active columns
        active_vals = []
        for cid in col_ids:
            active_vals.append((cid, r.data.get(cid, "")))
        
        # Serialize to hashable key
        key = tuple(active_vals)
        if key not in groups_dict:
            groups_dict[key] = []
        groups_dict[key].append(r)

    # 4. Filter groups with duplicates (> 1 rows)
    dup_groups = []
    total_dup_rows = 0
    
    for key, row_list in groups_dict.items():
        if len(row_list) > 1:
            row_ids = [r.id for r in row_list]
            total_dup_rows += len(row_list)
            
            # Readable data preview using column display names
            preview_data = {}
            for cid, val in key:
                preview_data[col_names[cid]] = val

            dup_groups.append(
                DuplicateGroup(
                    row_ids=row_ids,
                    data=preview_data,
                    occurrence_count=len(row_list)
                )
            )

    return {
        "total_groups": len(dup_groups),
        "duplicate_rows_count": total_dup_rows,
        "groups": dup_groups
    }

@router.post("/{dataset_id}/deduplicate", status_code=status.HTTP_200_OK)
def run_deduplicate(
    dataset_id: int,
    selected_row_ids: Optional[List[int]] = None,  # If provided, only deletes these row IDs
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Deduplicate dataset. Never runs automatically; requires user invocation.
    If selected_row_ids is provided, deletes those specific duplicate rows.
    If not provided, automatically removes all exact duplicates, keeping only the first occurrence (minimum ID).
    """
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    deleted_count = 0
    if selected_row_ids:
        # Delete user-selected duplicate rows
        rows_to_delete = db.query(DatasetRow).filter(
            DatasetRow.id.in_(selected_row_ids),
            DatasetRow.dataset_id == dataset_id
        ).all()
        for r in rows_to_delete:
            db.delete(r)
            deleted_count += 1
    else:
        # Auto deduplicate all: keep first, delete others
        columns = db.query(DatasetColumn).filter(
            DatasetColumn.dataset_id == dataset_id,
            DatasetColumn.is_deleted == False
        ).all()
        col_ids = [f"col_{c.id}" for c in columns]
        
        rows = db.query(DatasetRow).filter(DatasetRow.dataset_id == dataset_id).all()
        
        seen_keys = set()
        for r in rows:
            # Construct comparison key
            key_vals = tuple((cid, r.data.get(cid, "")) for cid in col_ids)
            if key_vals in seen_keys:
                db.delete(r)
                deleted_count += 1
            else:
                seen_keys.add(key_vals)
                
    if deleted_count > 0:
        dataset.row_count = max(0, dataset.row_count - deleted_count)
        dataset.updated_at = datetime.datetime.utcnow()
        
        # Log activity
        log = ActivityLog(
            user_id=current_user.id,
            action="DEDUPLICATE",
            details=f"Removed {deleted_count} duplicate rows from dataset {dataset.name}."
        )
        db.add(log)
        db.commit()
        
    return {"message": f"Successfully removed {deleted_count} duplicate rows."}
