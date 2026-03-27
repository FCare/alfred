"""
Business logic for shopping list items management
"""
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_
from typing import List as ListType, Optional
from fastapi import HTTPException, status
import logging

from ..models import database_models as db_models
from ..models import pydantic_models as schemas

logger = logging.getLogger(__name__)


class ItemService:
    """
    Service for managing shopping list items
    """
    
    async def get_list_items(
        self,
        db: Session,
        list_id: int
    ) -> ListType[schemas.ListItem]:
        """
        Get all items from a specific list
        """
        items = db.query(db_models.ListItem).filter(
            db_models.ListItem.list_id == list_id
        ).order_by(
            db_models.ListItem.position,
            db_models.ListItem.created_at
        ).all()
        
        return [schemas.ListItem.from_orm(item) for item in items]
    
    async def get_item_with_permission(
        self,
        db: Session,
        item_id: int,
        user: schemas.CurrentUser
    ) -> schemas.ListItem:
        """
        Get an item with permission check
        """
        # Get item with its list to check permissions
        item = db.query(db_models.ListItem).options(
            joinedload(db_models.ListItem.list)
        ).filter(db_models.ListItem.id == item_id).first()
        
        if not item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Item not found"
            )
        
        # Check if user has access to the list
        if not await self._check_list_permission(db, item.list_id, user, schemas.PermissionLevel.READ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have access to this item"
            )
        
        return schemas.ListItem.from_orm(item)
    
    async def create_item(
        self,
        db: Session,
        list_id: int,
        item_data: schemas.ListItemCreate,
        user: schemas.CurrentUser
    ) -> schemas.ListItem:
        """
        Create a new item in a list
        """
        # Get the next position for the item
        max_position = db.query(db_models.ListItem).filter(
            db_models.ListItem.list_id == list_id
        ).count()
        
        # Create the item
        db_item = db_models.ListItem(
            list_id=list_id,
            name=item_data.name,
            quantity=item_data.quantity,
            description=item_data.description,
            image_path=item_data.image_path,
            is_checked=item_data.is_checked,
            position=item_data.position if item_data.position is not None else max_position
        )
        
        db.add(db_item)
        db.commit()
        db.refresh(db_item)
        
        # Log activity
        await self._log_activity(
            db=db,
            list_id=list_id,
            user=user,
            action=schemas.ActionType.ITEM_ADDED,
            details={
                "item_id": db_item.id,
                "item_name": item_data.name,
                "quantity": item_data.quantity
            }
        )
        
        logger.info(f"Created item '{item_data.name}' in list {list_id} by user {user.username}")
        
        return schemas.ListItem.from_orm(db_item)
    
    async def update_item(
        self,
        db: Session,
        item_id: int,
        item_data: schemas.ListItemUpdate,
        user: schemas.CurrentUser
    ) -> schemas.ListItem:
        """
        Update an existing item
        """
        # Get item and check permissions
        item = db.query(db_models.ListItem).filter(
            db_models.ListItem.id == item_id
        ).first()
        
        if not item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Item not found"
            )
        
        # Check write permission
        if not await self._check_list_permission(db, item.list_id, user, schemas.PermissionLevel.WRITE):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have permission to modify this item"
            )
        
        # Track changes
        old_values = {
            "name": item.name,
            "quantity": item.quantity,
            "description": item.description,
            "image_path": item.image_path,
            "is_checked": item.is_checked,
            "position": item.position
        }
        changes = {}
        
        # Get explicitly set fields to handle None values correctly
        set_fields = item_data.model_dump(exclude_unset=True)
        
        # Update fields that are provided
        if item_data.name is not None:
            item.name = item_data.name
            changes["name"] = {"old": old_values["name"], "new": item_data.name}
        
        if item_data.quantity is not None:
            item.quantity = item_data.quantity
            changes["quantity"] = {"old": old_values["quantity"], "new": item_data.quantity}
        
        if item_data.description is not None:
            item.description = item_data.description
            changes["description"] = {"old": old_values["description"], "new": item_data.description}
        
        # For image_path, handle None as a valid value (to remove the image)
        if 'image_path' in set_fields:
            item.image_path = item_data.image_path
            changes["image_path"] = {"old": old_values["image_path"], "new": item_data.image_path}
        
        if item_data.is_checked is not None:
            old_checked = item.is_checked
            item.is_checked = item_data.is_checked
            changes["is_checked"] = {"old": old_checked, "new": item_data.is_checked}
            
            # Log specific check/uncheck action
            check_action = schemas.ActionType.ITEM_CHECKED if item_data.is_checked else schemas.ActionType.ITEM_UNCHECKED
            await self._log_activity(
                db=db,
                list_id=item.list_id,
                user=user,
                action=check_action,
                details={"item_id": item.id, "item_name": item.name}
            )
        
        if item_data.position is not None:
            item.position = item_data.position
            changes["position"] = {"old": old_values["position"], "new": item_data.position}
        
        db.commit()
        db.refresh(item)
        
        # Log general update activity if there were changes other than just checking
        if any(key != "is_checked" for key in changes.keys()):
            await self._log_activity(
                db=db,
                list_id=item.list_id,
                user=user,
                action=schemas.ActionType.ITEM_UPDATED,
                details={
                    "item_id": item.id,
                    "item_name": item.name,
                    "changes": changes
                }
            )
        
        logger.info(f"Updated item {item_id} by user {user.username}")
        
        return schemas.ListItem.from_orm(item)
    
    async def delete_item(
        self,
        db: Session,
        item_id: int,
        user: schemas.CurrentUser
    ) -> str:
        """
        Delete an item from a list
        """
        # Get item and check permissions
        item = db.query(db_models.ListItem).filter(
            db_models.ListItem.id == item_id
        ).first()
        
        if not item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Item not found"
            )
        
        # Check write permission
        if not await self._check_list_permission(db, item.list_id, user, schemas.PermissionLevel.WRITE):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have permission to delete this item"
            )
        
        item_name = item.name
        list_id = item.list_id
        
        # Delete the item
        db.delete(item)
        db.commit()
        
        # Log activity
        await self._log_activity(
            db=db,
            list_id=list_id,
            user=user,
            action=schemas.ActionType.ITEM_DELETED,
            details={
                "item_id": item_id,
                "item_name": item_name
            }
        )
        
        logger.info(f"Deleted item '{item_name}' (id: {item_id}) by user {user.username}")
        
        return item_name
    
    async def toggle_item_check(
        self,
        db: Session,
        item_id: int,
        checked: bool,
        user: schemas.CurrentUser
    ) -> schemas.ListItem:
        """
        Check or uncheck an item
        """
        # Use update_item for consistency
        item_update = schemas.ListItemUpdate(is_checked=checked)
        return await self.update_item(db, item_id, item_update, user)
    
    async def reorder_items(
        self,
        db: Session,
        list_id: int,
        item_orders: ListType[dict],
        user: schemas.CurrentUser
    ):
        """
        Reorder items in a list
        """
        # Validate and update positions
        for order in item_orders:
            item_id = order.get("id")
            position = order.get("position")
            
            if item_id is None or position is None:
                continue
            
            item = db.query(db_models.ListItem).filter(
                db_models.ListItem.id == item_id,
                db_models.ListItem.list_id == list_id
            ).first()
            
            if item:
                item.position = position
        
        db.commit()
        
        # Log activity
        await self._log_activity(
            db=db,
            list_id=list_id,
            user=user,
            action=schemas.ActionType.UPDATED,
            details={
                "action": "items_reordered",
                "item_count": len(item_orders)
            }
        )
        
        logger.info(f"Reordered {len(item_orders)} items in list {list_id} by user {user.username}")
    
    async def duplicate_item(
        self,
        db: Session,
        item_id: int,
        user: schemas.CurrentUser
    ) -> schemas.ListItem:
        """
        Duplicate an item in the same list
        """
        # Get original item
        original_item = await self.get_item_with_permission(db, item_id, user)
        
        # Create new item data
        item_data = schemas.ListItemCreate(
            name=f"{original_item.name} (Copy)",
            quantity=original_item.quantity,
            description=original_item.description,
            is_checked=False,  # Reset checked status
            position=original_item.position + 1
        )
        
        return await self.create_item(db, original_item.list_id, item_data, user)
    
    async def move_item_to_list(
        self,
        db: Session,
        item_id: int,
        target_list_id: int,
        user: schemas.CurrentUser
    ) -> schemas.ListItem:
        """
        Move an item to another list
        """
        # Get item and check permissions on source list
        item = db.query(db_models.ListItem).filter(
            db_models.ListItem.id == item_id
        ).first()
        
        if not item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Item not found"
            )
        
        # Check write permission on source list
        if not await self._check_list_permission(db, item.list_id, user, schemas.PermissionLevel.WRITE):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have permission to move this item"
            )
        
        # Check write permission on target list
        if not await self._check_list_permission(db, target_list_id, user, schemas.PermissionLevel.WRITE):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have permission to add items to the target list"
            )
        
        old_list_id = item.list_id
        
        # Get next position in target list
        max_position = db.query(db_models.ListItem).filter(
            db_models.ListItem.list_id == target_list_id
        ).count()
        
        # Move the item
        item.list_id = target_list_id
        item.position = max_position
        
        db.commit()
        db.refresh(item)
        
        # Log activity in both lists
        await self._log_activity(
            db=db,
            list_id=old_list_id,
            user=user,
            action=schemas.ActionType.ITEM_DELETED,
            details={
                "item_id": item_id,
                "item_name": item.name,
                "moved_to_list": target_list_id
            }
        )
        
        await self._log_activity(
            db=db,
            list_id=target_list_id,
            user=user,
            action=schemas.ActionType.ITEM_ADDED,
            details={
                "item_id": item_id,
                "item_name": item.name,
                "moved_from_list": old_list_id
            }
        )
        
        logger.info(f"Moved item {item_id} from list {old_list_id} to {target_list_id} by user {user.username}")
        
        return schemas.ListItem.from_orm(item)
    
    async def clear_checked_items(
        self,
        db: Session,
        list_id: int,
        user: schemas.CurrentUser
    ) -> int:
        """
        Remove all checked items from a list
        """
        # Get all checked items
        checked_items = db.query(db_models.ListItem).filter(
            db_models.ListItem.list_id == list_id,
            db_models.ListItem.is_checked == True
        ).all()
        
        count = len(checked_items)
        
        if count > 0:
            # Delete all checked items
            for item in checked_items:
                db.delete(item)
            
            db.commit()
            
            # Log activity
            await self._log_activity(
                db=db,
                list_id=list_id,
                user=user,
                action=schemas.ActionType.UPDATED,
                details={
                    "action": "cleared_checked_items",
                    "items_removed": count
                }
            )
            
            logger.info(f"Cleared {count} checked items from list {list_id} by user {user.username}")
        
        return count
    
    async def _check_list_permission(
        self,
        db: Session,
        list_id: int,
        user: schemas.CurrentUser,
        required_permission: schemas.PermissionLevel
    ) -> bool:
        """
        Check if user has permission for a list
        """
        # Get the list
        list_obj = db.query(db_models.List).filter(db_models.List.id == list_id).first()
        if not list_obj:
            return False
        
        # Check if user is the owner
        if list_obj.owner_id == user.user_id:
            return True
        
        # Check shared permissions
        share = db.query(db_models.ListShare).filter(
            db_models.ListShare.list_id == list_id,
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
        
        user_permission = permission_hierarchy.get(share.permission_level, 0)
        required_permission_level = permission_hierarchy.get(required_permission, 1)
        
        return user_permission >= required_permission_level
    
    async def _log_activity(
        self,
        db: Session,
        list_id: int,
        user: schemas.CurrentUser,
        action: schemas.ActionType,
        details: Optional[dict] = None
    ):
        """
        Log an activity for a list
        """
        activity = db_models.ListActivity(
            list_id=list_id,
            user_id=user.user_id,
            username=user.username,
            action=action.value,
            details=details
        )
        
        db.add(activity)
        # Don't commit here, let the caller handle it