"""
Business logic for shopping lists management
"""
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import func, or_, and_
from typing import List as ListType, Optional
from datetime import datetime
import logging

from ..models import database_models as db_models
from ..models import pydantic_models as schemas

logger = logging.getLogger(__name__)


class ListService:
    """
    Service for managing shopping lists
    """
    
    async def get_user_lists(
        self,
        db: Session,
        user: schemas.CurrentUser,
        include_shared: bool = True,
        include_archived: bool = False,
        list_type: Optional[schemas.ListType] = None
    ) -> ListType[schemas.ListSummary]:
        """
        Get all lists for a user (owned and shared)
        Optionally filter by list type
        """
        query = db.query(db_models.List)
        
        if include_shared:
            # Get lists owned by user OR shared with user
            query = query.outerjoin(db_models.ListShare).filter(
                or_(
                    db_models.List.owner_id == user.user_id,
                    and_(
                        db_models.ListShare.shared_with_user_id == user.user_id,
                        db_models.ListShare.accepted_at.isnot(None)
                    )
                )
            )
        else:
            # Only owned lists
            query = query.filter(db_models.List.owner_id == user.user_id)
        
        # Filter by list type
        if list_type:
            query = query.filter(db_models.List.list_type == list_type)
        
        # Filter archived/unarchived
        if not include_archived:
            query = query.filter(db_models.List.archived_at.is_(None))
        
        lists = query.distinct().order_by(db_models.List.updated_at.desc()).all()
        
        # Convert to ListSummary with item counts
        result = []
        for list_obj in lists:
            item_count = db.query(func.count(db_models.ListItem.id)).filter(
                db_models.ListItem.list_id == list_obj.id
            ).scalar()
            
            checked_count = db.query(func.count(db_models.ListItem.id)).filter(
                db_models.ListItem.list_id == list_obj.id,
                db_models.ListItem.is_checked == True
            ).scalar()
            
            list_summary = schemas.ListSummary(
                id=list_obj.id,
                name=list_obj.name,
                description=list_obj.description,
                is_private=list_obj.is_private,
                owner_id=list_obj.owner_id,
                owner_username=list_obj.owner_username,
                created_at=list_obj.created_at,
                updated_at=list_obj.updated_at,
                archived_at=list_obj.archived_at,
                item_count=item_count or 0,
                checked_count=checked_count or 0
            )
            result.append(list_summary)
        
        return result
    
    async def get_list_with_items(
        self,
        db: Session,
        list_obj: db_models.List
    ) -> schemas.List:
        """
        Get a list with all its items
        """
        # Eager load items
        list_with_items = db.query(db_models.List).options(
            selectinload(db_models.List.items)
        ).filter(db_models.List.id == list_obj.id).first()
        
        # Sort items by position, then by created_at
        if list_with_items.items:
            list_with_items.items.sort(key=lambda x: (x.position, x.created_at))
        
        return schemas.List.from_orm(list_with_items)
    
    async def create_list(
        self,
        db: Session,
        list_data: schemas.ListCreate,
        owner: schemas.CurrentUser
    ) -> schemas.List:
        """
        Create a new shopping list
        """
        # Create the list
        db_list = db_models.List(
            name=list_data.name,
            description=list_data.description,
            is_private=list_data.is_private,
            owner_id=owner.user_id,
            owner_username=owner.username
        )
        
        db.add(db_list)
        db.commit()
        db.refresh(db_list)
        
        # Log activity
        await self._log_activity(
            db=db,
            list_id=db_list.id,
            user=owner,
            action=schemas.ActionType.CREATED,
            details={"list_name": list_data.name}
        )
        
        logger.info(f"Created list '{list_data.name}' for user {owner.username}")
        
        return schemas.List.from_orm(db_list)
    
    async def update_list(
        self,
        db: Session,
        list_obj: db_models.List,
        list_data: schemas.ListUpdate,
        user: schemas.CurrentUser
    ) -> schemas.List:
        """
        Update a shopping list
        """
        old_name = list_obj.name
        changes = {}
        
        # Update fields that are provided
        if list_data.name is not None:
            list_obj.name = list_data.name
            changes["name"] = {"old": old_name, "new": list_data.name}
        
        if list_data.description is not None:
            list_obj.description = list_data.description
            changes["description"] = list_data.description
        
        if list_data.is_private is not None:
            list_obj.is_private = list_data.is_private
            changes["is_private"] = list_data.is_private
        
        list_obj.updated_at = datetime.utcnow()
        
        db.commit()
        db.refresh(list_obj)
        
        # Log activity
        await self._log_activity(
            db=db,
            list_id=list_obj.id,
            user=user,
            action=schemas.ActionType.UPDATED,
            details={"changes": changes}
        )
        
        logger.info(f"Updated list {list_obj.id} by user {user.username}")
        
        return await self.get_list_with_items(db, list_obj)
    
    async def delete_list(
        self,
        db: Session,
        list_obj: db_models.List,
        user: schemas.CurrentUser
    ):
        """
        Delete a shopping list
        """
        list_name = list_obj.name
        list_id = list_obj.id
        
        # Delete the list (cascade will handle items, shares, activities)
        db.delete(list_obj)
        db.commit()
        
        logger.info(f"Deleted list '{list_name}' (id: {list_id}) by user {user.username}")
    
    async def archive_list(
        self,
        db: Session,
        list_obj: db_models.List,
        user: schemas.CurrentUser
    ):
        """
        Archive a shopping list
        """
        list_obj.archived_at = datetime.utcnow()
        list_obj.updated_at = datetime.utcnow()
        
        db.commit()
        
        # Log activity
        await self._log_activity(
            db=db,
            list_id=list_obj.id,
            user=user,
            action=schemas.ActionType.UPDATED,
            details={"action": "archived"}
        )
        
        logger.info(f"Archived list {list_obj.id} by user {user.username}")
    
    async def unarchive_list(
        self,
        db: Session,
        list_obj: db_models.List,
        user: schemas.CurrentUser
    ):
        """
        Unarchive a shopping list
        """
        list_obj.archived_at = None
        list_obj.updated_at = datetime.utcnow()
        
        db.commit()
        
        # Log activity
        await self._log_activity(
            db=db,
            list_id=list_obj.id,
            user=user,
            action=schemas.ActionType.UPDATED,
            details={"action": "unarchived"}
        )
        
        logger.info(f"Unarchived list {list_obj.id} by user {user.username}")
    
    async def duplicate_list(
        self,
        db: Session,
        list_obj: db_models.List,
        owner: schemas.CurrentUser,
        new_name: Optional[str] = None
    ) -> schemas.List:
        """
        Duplicate a list with all its items
        """
        # Create new list
        duplicated_name = new_name or f"{list_obj.name} (Copy)"
        
        new_list = db_models.List(
            name=duplicated_name,
            description=list_obj.description,
            is_private=list_obj.is_private,
            owner_id=owner.user_id,
            owner_username=owner.username
        )
        
        db.add(new_list)
        db.flush()  # Get the new list ID
        
        # Copy all items
        items = db.query(db_models.ListItem).filter(
            db_models.ListItem.list_id == list_obj.id
        ).all()
        
        for item in items:
            new_item = db_models.ListItem(
                list_id=new_list.id,
                name=item.name,
                quantity=item.quantity,
                description=item.description,
                image_path=item.image_path,  # Note: Images are shared, not copied
                is_checked=False,  # Reset checked status
                position=item.position
            )
            db.add(new_item)
        
        db.commit()
        db.refresh(new_list)
        
        # Log activity
        await self._log_activity(
            db=db,
            list_id=new_list.id,
            user=owner,
            action=schemas.ActionType.CREATED,
            details={
                "duplicated_from": list_obj.id,
                "original_name": list_obj.name,
                "items_copied": len(items)
            }
        )
        
        logger.info(f"Duplicated list {list_obj.id} to {new_list.id} for user {owner.username}")
        
        return await self.get_list_with_items(db, new_list)
    
    async def get_list_activity(
        self,
        db: Session,
        list_id: int,
        limit: int = 50
    ) -> ListType[schemas.ListActivity]:
        """
        Get activity history for a list
        """
        activities = db.query(db_models.ListActivity).filter(
            db_models.ListActivity.list_id == list_id
        ).order_by(
            db_models.ListActivity.created_at.desc()
        ).limit(limit).all()
        
        return [schemas.ListActivity.from_orm(activity) for activity in activities]
    
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