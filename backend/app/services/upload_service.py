"""
Business logic for file upload management
"""
from fastapi import HTTPException, status, UploadFile
from sqlalchemy.orm import Session
from pathlib import Path
from typing import List as ListType
import uuid
import aiofiles
from PIL import Image
import logging
import os

from ..models import database_models as db_models
from ..models import pydantic_models as schemas
from ..config import settings

logger = logging.getLogger(__name__)


class UploadService:
    """
    Service for managing file uploads (primarily images)
    """
    
    def __init__(self):
        self.upload_path = Path(settings.upload_path)
        self.max_file_size = settings.max_upload_size
        self.allowed_types = settings.allowed_image_types
        
        # Ensure upload directory exists
        self.upload_path.mkdir(parents=True, exist_ok=True)
    
    async def upload_image(
        self,
        file: UploadFile,
        user: schemas.CurrentUser,
        db: Session
    ) -> schemas.UploadResponse:
        """
        Upload and process an image file
        """
        # Validate file type
        if file.content_type not in self.allowed_types:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported file type. Allowed types: {', '.join(self.allowed_types)}"
            )
        
        # Read file content
        file_content = await file.read()
        
        # Validate file size
        if len(file_content) > self.max_file_size:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File too large. Maximum size: {self.max_file_size // (1024*1024)}MB"
            )
        
        # Generate unique filename
        file_extension = Path(file.filename or "image.jpg").suffix.lower()
        if not file_extension:
            file_extension = self._get_extension_from_content_type(file.content_type)
        
        unique_filename = f"{uuid.uuid4().hex}{file_extension}"
        file_path = self.upload_path / unique_filename
        
        try:
            # Save original file
            async with aiofiles.open(file_path, 'wb') as f:
                await f.write(file_content)
            
            # Process image (resize if too large, optimize)
            await self._process_image(file_path)
            
            # Get final file size after processing
            final_size = file_path.stat().st_size
            
            logger.info(f"Uploaded image '{unique_filename}' for user {user.username}")
            
            # Create response
            return schemas.UploadResponse(
                filename=unique_filename,
                original_filename=file.filename or "unknown",
                size=final_size,
                content_type=file.content_type,
                url=f"/api/v1/upload/image/{unique_filename}"
            )
            
        except Exception as e:
            # Clean up file if something went wrong
            if file_path.exists():
                file_path.unlink()
            
            logger.error(f"Failed to upload image: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to process uploaded file"
            )
    
    async def delete_image(
        self,
        filename: str,
        user: schemas.CurrentUser,
        db: Session
    ) -> bool:
        """
        Delete an uploaded image
        """
        file_path = self.upload_path / filename
        
        if not file_path.exists():
            return False
        
        # Security check: ensure file is within upload directory
        try:
            file_path.resolve().relative_to(self.upload_path.resolve())
        except ValueError:
            logger.warning(f"Attempt to delete file outside upload directory: {filename}")
            return False
        
        # Check if image is being used by any items that the user has access to
        items_using_image = db.query(db_models.ListItem).filter(
            db_models.ListItem.image_path == filename
        ).all()
        
        # For each item using this image, check if user has permission
        for item in items_using_image:
            if not await self._check_item_permission(db, item.id, user):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Cannot delete image: it's used in items you don't have access to"
                )
        
        try:
            # Remove image from all items that use it
            for item in items_using_image:
                item.image_path = None
            
            db.commit()
            
            # Delete the file
            file_path.unlink()
            
            logger.info(f"Deleted image '{filename}' for user {user.username}")
            return True
            
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to delete image '{filename}': {e}")
            return False
    
    async def get_user_images(
        self,
        user: schemas.CurrentUser,
        db: Session
    ) -> ListType[schemas.UploadResponse]:
        """
        Get all images uploaded by or accessible to the user
        """
        # Get all items the user has access to with images
        user_items = db.query(db_models.ListItem).join(
            db_models.List
        ).filter(
            db_models.ListItem.image_path.isnot(None),
            db_models.List.owner_id == user.user_id
        ).all()
        
        # Also get shared lists items
        shared_items = db.query(db_models.ListItem).join(
            db_models.List
        ).join(
            db_models.ListShare
        ).filter(
            db_models.ListItem.image_path.isnot(None),
            db_models.ListShare.shared_with_user_id == user.user_id,
            db_models.ListShare.accepted_at.isnot(None)
        ).all()
        
        all_items = user_items + shared_items
        
        # Extract unique image filenames
        image_filenames = set()
        for item in all_items:
            if item.image_path:
                image_filenames.add(item.image_path)
        
        # Build response for existing files
        images = []
        for filename in image_filenames:
            file_path = self.upload_path / filename
            if file_path.exists():
                try:
                    file_size = file_path.stat().st_size
                    file_extension = file_path.suffix.lower()
                    content_type = self._get_content_type_from_extension(file_extension)
                    
                    images.append(schemas.UploadResponse(
                        filename=filename,
                        original_filename=filename,
                        size=file_size,
                        content_type=content_type,
                        url=f"/api/v1/upload/image/{filename}"
                    ))
                except Exception as e:
                    logger.warning(f"Error reading image file '{filename}': {e}")
                    continue
        
        return images
    
    async def attach_image_to_item(
        self,
        item_id: int,
        filename: str,
        user: schemas.CurrentUser,
        db: Session
    ):
        """
        Attach an uploaded image to a shopping list item
        """
        # Verify image exists
        file_path = self.upload_path / filename
        if not file_path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Image not found"
            )
        
        # Get the item and check permissions
        item = db.query(db_models.ListItem).filter(
            db_models.ListItem.id == item_id
        ).first()
        
        if not item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Item not found"
            )
        
        # Check if user has write permission for this item's list
        if not await self._check_item_permission(db, item_id, user, schemas.PermissionLevel.WRITE):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have permission to modify this item"
            )
        
        # Attach the image
        item.image_path = filename
        db.commit()
        
        logger.info(f"Attached image '{filename}' to item {item_id} by user {user.username}")
    
    async def detach_image_from_item(
        self,
        item_id: int,
        user: schemas.CurrentUser,
        db: Session
    ):
        """
        Remove image attachment from a shopping list item
        """
        # Get the item and check permissions
        item = db.query(db_models.ListItem).filter(
            db_models.ListItem.id == item_id
        ).first()
        
        if not item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Item not found"
            )
        
        # Check if user has write permission for this item's list
        if not await self._check_item_permission(db, item_id, user, schemas.PermissionLevel.WRITE):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have permission to modify this item"
            )
        
        # Detach the image
        old_image = item.image_path
        item.image_path = None
        db.commit()
        
        logger.info(f"Detached image '{old_image}' from item {item_id} by user {user.username}")
    
    async def _process_image(self, file_path: Path):
        """
        Process uploaded image (resize, optimize)
        """
        try:
            with Image.open(file_path) as img:
                # Convert to RGB if necessary (for JPEG output)
                if img.mode in ('RGBA', 'LA', 'P'):
                    # Create white background
                    background = Image.new('RGB', img.size, (255, 255, 255))
                    if img.mode == 'P':
                        img = img.convert('RGBA')
                    background.paste(img, mask=img.split()[-1] if img.mode in ('RGBA', 'LA') else None)
                    img = background
                elif img.mode != 'RGB':
                    img = img.convert('RGB')
                
                # Resize if image is too large
                max_dimension = 1200
                if img.width > max_dimension or img.height > max_dimension:
                    img.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)
                
                # Save optimized image
                img.save(
                    file_path,
                    format='JPEG',
                    quality=85,
                    optimize=True
                )
                
                logger.debug(f"Processed image: {file_path}")
                
        except Exception as e:
            logger.error(f"Failed to process image {file_path}: {e}")
            # If processing fails, keep the original file
            pass
    
    async def _check_item_permission(
        self,
        db: Session,
        item_id: int,
        user: schemas.CurrentUser,
        required_permission: schemas.PermissionLevel = schemas.PermissionLevel.READ
    ) -> bool:
        """
        Check if user has permission for an item
        """
        # Get item with its list
        item = db.query(db_models.ListItem).join(
            db_models.List
        ).filter(db_models.ListItem.id == item_id).first()
        
        if not item:
            return False
        
        # Check if user is the owner
        if item.list.owner_id == user.user_id:
            return True
        
        # Check shared permissions
        share = db.query(db_models.ListShare).filter(
            db_models.ListShare.list_id == item.list_id,
            db_models.ListShare.shared_with_user_id == user.user_id,
            db_models.ListShare.accepted_at.isnot(None)
        ).first()
        
        if not share:
            return False
        
        # Check permission level
        permission_hierarchy = {
            schemas.PermissionLevel.READ: 1,
            schemas.PermissionLevel.WRITE: 2,
            schemas.PermissionLevel.ADMIN: 3
        }
        
        user_permission = permission_hierarchy.get(schemas.PermissionLevel(share.permission_level), 0)
        required_permission_level = permission_hierarchy.get(required_permission, 1)
        
        return user_permission >= required_permission_level
    
    def _get_extension_from_content_type(self, content_type: str) -> str:
        """
        Get file extension from content type
        """
        type_map = {
            'image/jpeg': '.jpg',
            'image/png': '.png',
            'image/gif': '.gif',
            'image/webp': '.webp'
        }
        return type_map.get(content_type, '.jpg')
    
    def _get_content_type_from_extension(self, extension: str) -> str:
        """
        Get content type from file extension
        """
        extension_map = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp'
        }
        return extension_map.get(extension.lower(), 'application/octet-stream')