"""
API endpoints for shopping lists management
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List as ListType

from ..database import get_db
from ..dependencies import get_current_user, get_list_read_permission, get_list_admin_permission
from ..models import database_models as db_models
from ..models import pydantic_models as schemas
from ..services.list_service import ListService

router = APIRouter()
list_service = ListService()


@router.get("/", response_model=ListType[schemas.ListSummary])
async def get_user_lists(
    current_user: schemas.CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
    include_shared: bool = True,
    archived: bool = False
):
    """
    Get all lists for the current user (owned + shared)
    """
    return await list_service.get_user_lists(
        db=db,
        user=current_user,
        include_shared=include_shared,
        include_archived=archived
    )


@router.get("/{list_id}", response_model=schemas.List)
async def get_list(
    list_obj: db_models.List = Depends(get_list_read_permission),
    db: Session = Depends(get_db)
):
    """
    Get a specific list with all its items
    """
    return await list_service.get_list_with_items(db=db, list_obj=list_obj)


@router.post("/", response_model=schemas.List, status_code=status.HTTP_201_CREATED)
async def create_list(
    list_data: schemas.ListCreate,
    current_user: schemas.CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Create a new shopping list
    """
    return await list_service.create_list(
        db=db,
        list_data=list_data,
        owner=current_user
    )


@router.put("/{list_id}", response_model=schemas.List)
async def update_list(
    list_data: schemas.ListUpdate,
    list_obj: db_models.List = Depends(get_list_admin_permission),
    current_user: schemas.CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update a shopping list (admin permission required)
    """
    return await list_service.update_list(
        db=db,
        list_obj=list_obj,
        list_data=list_data,
        user=current_user
    )


@router.delete("/{list_id}", response_model=schemas.MessageResponse)
async def delete_list(
    list_obj: db_models.List = Depends(get_list_admin_permission),
    current_user: schemas.CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Delete a shopping list (admin permission required)
    """
    await list_service.delete_list(
        db=db,
        list_obj=list_obj,
        user=current_user
    )
    
    return schemas.MessageResponse(
        message=f"List '{list_obj.name}' deleted successfully"
    )


@router.post("/{list_id}/archive", response_model=schemas.MessageResponse)
async def archive_list(
    list_obj: db_models.List = Depends(get_list_admin_permission),
    current_user: schemas.CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Archive a shopping list (admin permission required)
    """
    await list_service.archive_list(
        db=db,
        list_obj=list_obj,
        user=current_user
    )
    
    return schemas.MessageResponse(
        message=f"List '{list_obj.name}' archived successfully"
    )


@router.post("/{list_id}/unarchive", response_model=schemas.MessageResponse)
async def unarchive_list(
    list_obj: db_models.List = Depends(get_list_admin_permission),
    current_user: schemas.CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Unarchive a shopping list (admin permission required)
    """
    await list_service.unarchive_list(
        db=db,
        list_obj=list_obj,
        user=current_user
    )
    
    return schemas.MessageResponse(
        message=f"List '{list_obj.name}' unarchived successfully"
    )


@router.get("/{list_id}/activity", response_model=ListType[schemas.ListActivity])
async def get_list_activity(
    list_obj: db_models.List = Depends(get_list_read_permission),
    db: Session = Depends(get_db),
    limit: int = 50
):
    """
    Get activity history for a list
    """
    return await list_service.get_list_activity(
        db=db,
        list_id=list_obj.id,
        limit=limit
    )


@router.post("/{list_id}/duplicate", response_model=schemas.List, status_code=status.HTTP_201_CREATED)
async def duplicate_list(
    list_obj: db_models.List = Depends(get_list_read_permission),
    current_user: schemas.CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
    new_name: str = None
):
    """
    Duplicate a list (copy all items to a new list)
    """
    return await list_service.duplicate_list(
        db=db,
        list_obj=list_obj,
        owner=current_user,
        new_name=new_name
    )