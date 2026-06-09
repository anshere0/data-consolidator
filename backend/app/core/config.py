import os

BASE_DIR = os.path.dirname(
    os.path.dirname(
        os.path.dirname(os.path.abspath(__file__))
    )
)

class Settings:
    PROJECT_NAME: str = "Data Consolidation & Master Excel Generator"
    SECRET_KEY: str = os.getenv("SECRET_KEY", "supersecret-jwt-signing-key-for-token-generation-key-key")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 1 day

    # Database URLs
    # Will use SQLite by default if DATABASE_URL is not set
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        f"sqlite:///{os.path.join(BASE_DIR, 'data.db').replace(os.sep, '/')}"
    )

    # Storage paths
    BASE_DIR: str = BASE_DIR
    UPLOAD_DIR: str = os.path.join(BASE_DIR, "uploads")
    EXPORT_DIR: str = os.path.join(BASE_DIR, "exports")

    # Performance / Constraints
    MAX_FILE_SIZE_MB: int = 100
    ALLOWED_EXTENSIONS: set = {"xlsx", "xls", "csv", "pdf"}

settings = Settings()

# Startup diagnostics
print("Current working directory:", os.getcwd())
print("Database URL:", settings.DATABASE_URL)
print("Database file exists:", os.path.exists(os.path.join(BASE_DIR, "data.db")))

# Ensure directories exist
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs(settings.EXPORT_DIR, exist_ok=True)
