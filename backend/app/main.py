"""
Alfred Backend - Main FastAPI application
"""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
import logging

from .config import settings
from .database import create_tables
from .routers import lists, items, shares, upload, search

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title=settings.app_name,
    description="A modern shopping list manager with sharing capabilities",
    version=settings.app_version,
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Mount static files for uploads
uploads_path = Path(settings.upload_path)
if uploads_path.exists():
    app.mount("/uploads", StaticFiles(directory=str(uploads_path)), name="uploads")

# Include API routers
app.include_router(
    lists.router,
    prefix=f"{settings.api_v1_prefix}/lists",
    tags=["lists"]
)

app.include_router(
    items.router,
    prefix=f"{settings.api_v1_prefix}/items",
    tags=["items"]
)

app.include_router(
    shares.router,
    prefix=f"{settings.api_v1_prefix}/shares",
    tags=["sharing"]
)

app.include_router(
    upload.router,
    prefix=f"{settings.api_v1_prefix}/upload",
    tags=["uploads"]
)

app.include_router(
    search.router,
    prefix=f"{settings.api_v1_prefix}/search",
    tags=["search"]
)


@app.on_event("startup")
async def startup_event():
    """Initialize application on startup"""
    logger.info("Starting Alfred Backend...")
    
    # Create database tables
    create_tables()
    logger.info("Database tables created/verified")
    
    # Ensure upload directory exists
    uploads_path = Path(settings.upload_path)
    uploads_path.mkdir(parents=True, exist_ok=True)
    logger.info(f"Upload directory ready: {uploads_path}")
    
    logger.info(f"Alfred Backend started successfully on port {settings.api_v1_prefix}")


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Alfred Shopping List Manager API",
        "version": settings.app_version,
        "docs": "/docs" if settings.debug else "Documentation not available in production"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "alfred-backend",
        "version": settings.app_version
    }


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler for debugging"""
    if settings.debug:
        logger.error(f"Unhandled exception: {exc}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "error": "Internal server error",
                "detail": str(exc) if settings.debug else "An error occurred"
            }
        )
    else:
        logger.error(f"Unhandled exception: {exc}")
        return JSONResponse(
            status_code=500,
            content={
                "error": "Internal server error",
                "detail": "An unexpected error occurred"
            }
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=5213,
        reload=settings.debug,
        log_level="info"
    )