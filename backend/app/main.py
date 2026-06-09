import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.app.core.config import settings
from backend.app.core.database import engine, Base, SessionLocal
from backend.app.api import auth, uploads, datasets, exports
from backend.app.models.models import User
from backend.app.core.security import get_password_hash

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger("main")

# Auto-create tables on startup
try:
    logger.info("Initializing database tables...")
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables initialized successfully.")
except Exception as db_err:
    logger.error(f"Failed to auto-create database tables: {str(db_err)}")

# Seed database with a default admin user if empty
db = SessionLocal()
try:
    admin_exists = db.query(User).filter(User.username == "admin").first()
    if not admin_exists:
        logger.info("Seeding default admin user...")
        default_admin = User(
            username="admin",
            hashed_password=get_password_hash("admin123"),
            role="admin"
        )
        db.add(default_admin)
        db.commit()
        logger.info("Default admin user created: admin / admin123")
except Exception as seed_err:
    logger.error(f"Failed to seed database: {str(seed_err)}")
finally:
    db.close()

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Data Consolidation & Master Excel Generator Backend",
    version="1.0.0"
)

# Configure CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development; restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Routers
app.include_router(auth.router, prefix="/api")
app.include_router(uploads.router, prefix="/api")
app.include_router(datasets.router, prefix="/api")
app.include_router(exports.router, prefix="/api")

@app.get("/")
def read_root():
    return {
        "status": "online",
        "project": settings.PROJECT_NAME,
        "database": "connected"
    }
