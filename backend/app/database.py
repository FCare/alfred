"""
Database configuration and session management for Alfred
"""
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool
from pathlib import Path
import os

from .config import settings

# Ensure data directory exists
data_dir = Path("./data")
data_dir.mkdir(exist_ok=True)

# Database engine configuration
if settings.database_url.startswith("sqlite"):
    # SQLite specific configuration
    engine = create_engine(
        settings.database_url,
        poolclass=StaticPool,
        connect_args={
            "check_same_thread": False,  # Allow multi-threading
            "timeout": 20  # Timeout in seconds
        },
        echo=settings.debug  # Log SQL queries in debug mode
    )
else:
    # PostgreSQL or other databases
    engine = create_engine(
        settings.database_url,
        echo=settings.debug
    )

# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for all models
Base = declarative_base()

def get_db():
    """
    Dependency to get database session
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def create_tables():
    """
    Create all tables in the database
    """
    Base.metadata.create_all(bind=engine)