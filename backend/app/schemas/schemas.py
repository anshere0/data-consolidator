from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
import datetime

# User / Auth
class UserBase(BaseModel):
    username: str

class UserCreate(UserBase):
    password: str

class UserResponse(UserBase):
    id: int
    role: str
    created_at: datetime.datetime

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

# File Upload / Process
class FileResponse(BaseModel):
    id: int
    filename: str
    file_type: str
    sheet_names: Optional[List[str]] = None
    row_count: int
    column_count: int
    status: str
    created_at: datetime.datetime

    class Config:
        from_attributes = True

class UploadResponse(BaseModel):
    id: int
    status: str
    error_message: Optional[str] = None
    created_at: datetime.datetime
    files: List[FileResponse] = []

    class Config:
        from_attributes = True

# Dataset
class DatasetCreate(BaseModel):
    name: str

class DatasetResponse(BaseModel):
    id: int
    name: str
    row_count: int
    column_count: int
    created_at: datetime.datetime
    updated_at: datetime.datetime

    class Config:
        from_attributes = True

# Dataset Column
class ColumnResponse(BaseModel):
    id: int
    name: str
    original_name: str
    position: int
    is_deleted: bool

    class Config:
        from_attributes = True

class ColumnCreate(BaseModel):
    name: str
    original_name: str
    position: int

class ColumnUpdate(BaseModel):
    name: Optional[str] = None
    position: Optional[int] = None

# Dataset Row
class RowResponse(BaseModel):
    id: int
    data: Dict[str, Any]
    source_file_id: Optional[int] = None
    created_at: datetime.datetime

    class Config:
        from_attributes = True

class RowCreate(BaseModel):
    data: Dict[str, Any]

class RowUpdate(BaseModel):
    data: Dict[str, Any]

class PaginatedRows(BaseModel):
    total: int
    rows: List[RowResponse]
    columns: List[ColumnResponse]

# Duplicates review
class DuplicateGroup(BaseModel):
    row_ids: List[int]
    data: Dict[str, Any]
    occurrence_count: int

class DuplicateReviewResponse(BaseModel):
    total_groups: int
    duplicate_rows_count: int
    groups: List[DuplicateGroup]

# Export
class ExportResponse(BaseModel):
    id: int
    dataset_id: int
    filename: str
    file_type: str
    download_url: str
    row_count: int
    status: str
    error_message: Optional[str] = None
    created_at: datetime.datetime

    class Config:
        from_attributes = True
