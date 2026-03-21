"""
Configuration settings for Alfred backend
"""
import os
from pathlib import Path
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # Database
    database_url: str = "sqlite:///./data/alfred.db"
    
    # Voight-Kampff integration
    voight_kampff_url: str = "http://voight-kampff:8080"
    voight_kampff_verify_endpoint: str = "/verify"
    
    # File uploads
    upload_path: str = "./uploads"
    max_upload_size: int = 10 * 1024 * 1024  # 10MB
    allowed_image_types: list[str] = ["image/jpeg", "image/png", "image/gif", "image/webp"]
    
    # API Configuration
    api_v1_prefix: str = "/api/v1"
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:8000",
        "https://alfred.caronboulme.fr",
        "https://auth.caronboulme.fr"
    ]
    
    # Security
    secret_key: str = "alfred-secret-key-change-in-production"
    
    # Application
    app_name: str = "Alfred - Shopping Lists Manager"
    app_version: str = "1.0.0"
    debug: bool = False
    
    class Config:
        env_file = ".env"

# Create settings instance
settings = Settings()

# Ensure upload directory exists
upload_dir = Path(settings.upload_path)
upload_dir.mkdir(parents=True, exist_ok=True)