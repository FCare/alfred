"""
FastAPI dependencies for Alfred
"""
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from typing import Optional

from .database import get_db
from .services.auth_service import auth_service
from .models.pydantic_models import CurrentUser
from .models.database_models import List, ListShare
from .models.pydantic_models import PermissionLevel


async def get_current_user(request: Request) -> CurrentUser:
    """
    Dependency to get current authenticated user
    """
    return await auth_service.get_current_user(request)


async def get_optional_user(request: Request) -> Optional[CurrentUser]:
    """
    Dependency to get current user if authenticated (optional)
    """
    return await auth_service.get_current_user(request)


def get_list_with_permission(
    required_permission: PermissionLevel = PermissionLevel.READ
):
    """
    Dependency factory to check list access permissions
    """
    def check_permission(
        list_id: int,
        current_user: CurrentUser = Depends(get_current_user),
        db: Session = Depends(get_db)
    ) -> List:
        """
        Check if user has required permission for list
        """
        # Get the list
        list_obj = db.query(List).filter(List.id == list_id).first()
        if not list_obj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="List not found"
            )
        
        # Check if user is the owner
        if list_obj.owner_id == current_user.user_id:
            return list_obj
        
        # Check shared permissions
        share = db.query(ListShare).filter(
            ListShare.list_id == list_id,
            ListShare.shared_with_user_id == current_user.user_id,
            ListShare.accepted_at.isnot(None)  # Must be accepted
        ).first()
        
        if not share:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have access to this list"
            )
        
        # Check permission level
        permission_hierarchy = {
            PermissionLevel.READ: 1,
            PermissionLevel.WRITE: 2,
            PermissionLevel.ADMIN: 3
        }
        
        user_permission = permission_hierarchy.get(share.permission_level, 0)
        required_permission_level = permission_hierarchy.get(required_permission, 1)
        
        if user_permission < required_permission_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Required: {required_permission}"
            )
        
        return list_obj
    
    return check_permission


def get_list_read_permission(
    list_id: int,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> List:
    """Check read permission for list"""
    return get_list_with_permission(PermissionLevel.READ)(list_id, current_user, db)


def get_list_write_permission(
    list_id: int,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> List:
    """Check write permission for list"""
    return get_list_with_permission(PermissionLevel.WRITE)(list_id, current_user, db)


def get_list_admin_permission(
    list_id: int,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> List:
    """Check admin permission for list"""
    return get_list_with_permission(PermissionLevel.ADMIN)(list_id, current_user, db)