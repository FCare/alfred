"""
API endpoints for shopping list items management
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List as ListType

from ..database import get_db
from ..dependencies import get_current_user, get_list_write_permission, get_list_read_permission
from ..models import database_models as db_models
from ..models import pydantic_models as schemas
from ..services.item_service import ItemService

router = APIRouter()
item_service = ItemService()


@router.get("/list/{list_id}", response_model=ListType[schemas.ListItem])
async def get_list_items(
    list_obj: db_models.List = Depends(get_list_read_permission),
    db: Session = Depends(get_db)
):
    """
    Get all items from a specific list
    """
    return await item_service.get_list_items(db=db, list_id=list_obj.id)


@router.get("/{item_id}", response_model=schemas.ListItem)
async def get_item(
    item_id: int,
    current_user: schemas.CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get a specific item (with permission check)
    """
    return await item_service.get_item_with_permission(
        db=db,
        item_id=item_id,
        user=current_user
    )


@router.post("/list/{list_id}", response_model=schemas.ListItem, status_code=status.HTTP_201_CREATED)
async def create_item(
    item_data: schemas.ListItemCreate,
    list_obj: db_models.List = Depends(get_list_write_permission),
    current_user: schemas.CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Add a new item to a list
    """
    return await item_service.create_item(
        db=db,
        list_id=list_obj.id,
        item_data=item_data,
        user=current_user
    )


@router.put("/{item_id}", response_model=schemas.ListItem)
async def update_item(
    item_id: int,
    item_data: schemas.ListItemUpdate,
    current_user: schemas.CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update an existing item
    """
    return await item_service.update_item(
        db=db,
        item_id=item_id,
        item_data=item_data,
        user=current_user
    )


@router.delete("/{item_id}", response_model=schemas.MessageResponse)
async def delete_item(
    item_id: int,
    current_user: schemas.CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Delete an item from a list
    """
    item_name = await item_service.delete_item(
        db=db,
        item_id=item_id,
        user=current_user
    )
    
    return schemas.MessageResponse(
        message=f"Item '{item_name}' deleted successfully"
    )


@router.post("/{item_id}/check", response_model=schemas.ListItem)
async def toggle_item_check(
    item_id: int,
    checked: bool = True,
    current_user: schemas.CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Check or uncheck an item
    """
    return await item_service.toggle_item_check(
        db=db,
        item_id=item_id,
        checked=checked,
        user=current_user
    )


@router.post("/list/{list_id}/reorder", response_model=schemas.MessageResponse)
async def reorder_items(
    item_orders: ListType[dict],  # [{"id": 1, "position": 0}, {"id": 2, "position": 1}, ...]
    list_obj: db_models.List = Depends(get_list_write_permission),
    current_user: schemas.CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Reorder items in a list
    """
    await item_service.reorder_items(
        db=db,
        list_id=list_obj.id,
        item_orders=item_orders,
        user=current_user
    )
    
    return schemas.MessageResponse(
        message="Items reordered successfully"
    )


@router.post("/{item_id}/duplicate", response_model=schemas.ListItem, status_code=status.HTTP_201_CREATED)
async def duplicate_item(
    item_id: int,
    current_user: schemas.CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Duplicate an item in the same list
    """
    return await item_service.duplicate_item(
        db=db,
        item_id=item_id,
        user=current_user
    )


@router.post("/{item_id}/move", response_model=schemas.ListItem)
async def move_item_to_list(
    item_id: int,
    target_list_id: int,
    current_user: schemas.CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Move an item to another list
    """
    return await item_service.move_item_to_list(
        db=db,
        item_id=item_id,
        target_list_id=target_list_id,
        user=current_user
    )


@router.post("/list/{list_id}/clear-checked", response_model=schemas.MessageResponse)
async def clear_checked_items(
    list_obj: db_models.List = Depends(get_list_write_permission),
    current_user: schemas.CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Remove all checked items from a list
    """
    count = await item_service.clear_checked_items(
        db=db,
        list_id=list_obj.id,
        user=current_user
    )
    
    return schemas.MessageResponse(
        message=f"Removed {count} checked items from list"
    )