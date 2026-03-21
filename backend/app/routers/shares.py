"""
API endpoints for list sharing management
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List as ListType, Optional

from ..database import get_db
from ..dependencies import get_current_user, get_list_admin_permission, get_list_read_permission
from ..models import database_models as db_models
from ..models import pydantic_models as schemas
from ..services.share_service import ShareService

router = APIRouter()
share_service = ShareService()


@router.get("/invitations", response_model=ListType[schemas.ListShare])
async def get_user_invitations(
    current_user: schemas.CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
    pending_only: bool = Query(True, description="Show only pending invitations")
):
    """
    Get all invitations for the current user
    """
    return await share_service.get_user_invitations(
        db=db,
        user=current_user,
        pending_only=pending_only
    )


@router.get("/list/{list_id}", response_model=ListType[schemas.ListShare])
async def get_list_shares(
    list_obj: db_models.List = Depends(get_list_read_permission),
    db: Session = Depends(get_db)
):
    """
    Get all shares for a specific list
    """
    return await share_service.get_list_shares(db=db, list_id=list_obj.id)


@router.post("/list/{list_id}", response_model=schemas.ListShare, status_code=status.HTTP_201_CREATED)
async def share_list(
    share_data: schemas.ListShareCreate,
    list_obj: db_models.List = Depends(get_list_admin_permission),
    current_user: schemas.CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Share a list with another user or create a shareable link
    """
    return await share_service.share_list(
        db=db,
        list_obj=list_obj,
        share_data=share_data,
        sharer=current_user
    )


@router.post("/accept/{invitation_token}", response_model=schemas.InvitationResponse)
async def accept_invitation(
    invitation_token: str,
    current_user: schemas.CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Accept a list sharing invitation using a token
    """
    return await share_service.accept_invitation(
        db=db,
        invitation_token=invitation_token,
        user=current_user
    )


@router.delete("/{share_id}", response_model=schemas.MessageResponse)
async def revoke_share(
    share_id: int,
    current_user: schemas.CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Revoke a list share (admin permission required)
    """
    share_info = await share_service.revoke_share(
        db=db,
        share_id=share_id,
        user=current_user
    )
    
    return schemas.MessageResponse(
        message=f"Share revoked for {share_info['shared_with']} on list '{share_info['list_name']}'"
    )


@router.put("/{share_id}", response_model=schemas.ListShare)
async def update_share_permissions(
    share_id: int,
    share_data: schemas.ListShareUpdate,
    current_user: schemas.CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update permissions for a list share (admin permission required)
    """
    return await share_service.update_share_permissions(
        db=db,
        share_id=share_id,
        share_data=share_data,
        user=current_user
    )


@router.post("/list/{list_id}/public-link", response_model=schemas.ListShare, status_code=status.HTTP_201_CREATED)
async def create_public_link(
    permission_level: schemas.PermissionLevel = Query(schemas.PermissionLevel.READ, description="Permission level for the link"),
    expires_hours: Optional[int] = Query(None, description="Link expiration in hours"),
    list_obj: db_models.List = Depends(get_list_admin_permission),
    current_user: schemas.CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Create a public shareable link for a list
    """
    return await share_service.create_public_link(
        db=db,
        list_obj=list_obj,
        permission_level=permission_level,
        expires_hours=expires_hours,
        sharer=current_user
    )


@router.get("/public/{invitation_token}", response_model=dict)
async def get_public_link_info(
    invitation_token: str,
    db: Session = Depends(get_db)
):
    """
    Get information about a public link (without accepting it)
    """
    return await share_service.get_public_link_info(
        db=db,
        invitation_token=invitation_token
    )


@router.delete("/list/{list_id}/leave", response_model=schemas.MessageResponse)
async def leave_shared_list(
    list_obj: db_models.List = Depends(get_list_read_permission),
    current_user: schemas.CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Leave a shared list (remove your own access)
    """
    list_name = await share_service.leave_shared_list(
        db=db,
        list_id=list_obj.id,
        user=current_user
    )
    
    return schemas.MessageResponse(
        message=f"You have left the shared list '{list_name}'"
    )


@router.get("/list/{list_id}/collaborators", response_model=ListType[dict])
async def get_list_collaborators(
    list_obj: db_models.List = Depends(get_list_read_permission),
    db: Session = Depends(get_db)
):
    """
    Get all collaborators for a list with their permissions
    """
    return await share_service.get_list_collaborators(
        db=db,
        list_id=list_obj.id
    )