from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, JSON, Text
from sqlalchemy.orm import relationship
import datetime
from app.core.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, default="user", nullable=False)  # "admin", "user"
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    activity_logs = relationship("ActivityLog", back_populates="user", cascade="all, delete-orphan")

class Upload(Base):
    __tablename__ = "uploads"

    id = Column(Integer, primary_key=True, index=True)
    status = Column(String, default="PENDING", nullable=False)  # PENDING, PROCESSING, COMPLETED, FAILED
    error_message = Column(Text, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    files = relationship("File", back_populates="upload", cascade="all, delete-orphan")

class File(Base):
    __tablename__ = "files"

    id = Column(Integer, primary_key=True, index=True)
    upload_id = Column(Integer, ForeignKey("uploads.id"), nullable=False)
    filename = Column(String, nullable=False)
    file_type = Column(String, nullable=False)  # xlsx, xls, csv, pdf
    storage_path = Column(String, nullable=False)
    sheet_names = Column(JSON, nullable=True)  # list of sheet names if Excel
    row_count = Column(Integer, default=0)
    column_count = Column(Integer, default=0)
    status = Column(String, default="UPLOADED", nullable=False)  # UPLOADED, PROCESSED, FAILED
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    upload = relationship("Upload", back_populates="files")
    rows = relationship("DatasetRow", back_populates="source_file")

class Dataset(Base):
    __tablename__ = "datasets"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    row_count = Column(Integer, default=0)
    column_count = Column(Integer, default=0)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    columns = relationship("DatasetColumn", back_populates="dataset", cascade="all, delete-orphan")
    rows = relationship("DatasetRow", back_populates="dataset", cascade="all, delete-orphan")
    exports = relationship("Export", back_populates="dataset", cascade="all, delete-orphan")

class DatasetColumn(Base):
    __tablename__ = "dataset_columns"

    id = Column(Integer, primary_key=True, index=True)
    dataset_id = Column(Integer, ForeignKey("datasets.id"), nullable=False)
    name = Column(String, nullable=False)            # Dynamic mapped name (e.g. "Full Name")
    original_name = Column(String, nullable=False)   # Source header name (e.g. "Name")
    position = Column(Integer, nullable=False)       # Display order index (0, 1, 2...)
    is_deleted = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    dataset = relationship("Dataset", back_populates="columns")

class DatasetRow(Base):
    __tablename__ = "dataset_rows"

    id = Column(Integer, primary_key=True, index=True)
    dataset_id = Column(Integer, ForeignKey("datasets.id"), nullable=False)
    source_file_id = Column(Integer, ForeignKey("files.id"), nullable=True)
    data = Column(JSON, nullable=False)              # e.g., {"col_1": "અમદાવાદ", "col_2": "rajesh"}
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    dataset = relationship("Dataset", back_populates="rows")
    source_file = relationship("File", back_populates="rows")

class Export(Base):
    __tablename__ = "exports"

    id = Column(Integer, primary_key=True, index=True)
    dataset_id = Column(Integer, ForeignKey("datasets.id"), nullable=False)
    filename = Column(String, nullable=False)
    file_type = Column(String, nullable=False)       # xlsx, csv
    file_path = Column(String, nullable=False)       # Absolute server path
    download_url = Column(String, nullable=False)    # /api/exports/download/{filename}
    row_count = Column(Integer, default=0)
    status = Column(String, default="PENDING", nullable=False)  # PENDING, COMPLETED, FAILED
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    dataset = relationship("Dataset", back_populates="exports")

class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(String, nullable=False)          # e.g. "UPLOAD_FILE", "RENAME_COLUMN"
    details = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", back_populates="activity_logs")
