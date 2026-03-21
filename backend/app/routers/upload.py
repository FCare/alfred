"""
API endpoints for file uploads
"""
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pathlib import Path
import os

from ..database import get_db
from ..dependencies import get_current_user
from ..models import pydantic_models as schemas
from ..services.upload_service import UploadService
from ..config import settings

router = APIRouter()
upload_service = UploadService()


@router.post("/image", response_model=schemas.UploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_image(
    file: UploadFile = File(...),
    current_user: schemas.CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Upload an image file for use in shopping list items
    """
    if not file:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No file provided"
        )
    
    return await upload_service.upload_image(
        file=file,
        user=current_user,
        db=db
    )


@router.get("/image/{filename}")
async def get_image(filename: str):
    """
    Serve an uploaded image
    """
    file_path = Path(settings.upload_path) / filename
    
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Image not found"
        )
    
    # Security check: ensure file is within upload directory
    try:
        file_path.resolve().relative_to(Path(settings.upload_path).resolve())
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    # Determine media type
    file_extension = file_path.suffix.lower()
    media_type_map = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp'
    }
    
    media_type = media_type_map.get(file_extension, 'application/octet-stream')
    
    return FileResponse(
        path=str(file_path),
        media_type=media_type,
        filename=filename
    )


@router.delete("/image/{filename}", response_model=schemas.MessageResponse)
async def delete_image(
    filename: str,
    current_user: schemas.CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Delete an uploaded image
    """
    success = await upload_service.delete_image(
        filename=filename,
        user=current_user,
        db=db
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Image not found or you don't have permission to delete it"
        )
    
    return schemas.MessageResponse(
        message=f"Image '{filename}' deleted successfully"
    )


@router.get("/user-images", response_model=list[schemas.UploadResponse])
async def get_user_images(
    current_user: schemas.CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get all images uploaded by the current user
    """
    return await upload_service.get_user_images(
        user=current_user,
        db=db
    )


@router.post("/image/{item_id}/attach", response_model=schemas.MessageResponse)
async def attach_image_to_item(
    item_id: int,
    filename: str,
    current_user: schemas.CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Attach an uploaded image to a shopping list item
    """
    await upload_service.attach_image_to_item(
        item_id=item_id,
        filename=filename,
        user=current_user,
        db=db
    )
    
    return schemas.MessageResponse(
        message=f"Image '{filename}' attached to item successfully"
    )


@router.delete("/image/{item_id}/detach", response_model=schemas.MessageResponse)
async def detach_image_from_item(
    item_id: int,
    current_user: schemas.CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Remove image attachment from a shopping list item
    """
    await upload_service.detach_image_from_item(
        item_id=item_id,
        user=current_user,
        db=db
    )
    
    return schemas.MessageResponse(
        message="Image detached from item successfully"
    )