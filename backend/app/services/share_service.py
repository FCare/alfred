"""
Business logic for list sharing management
"""
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, or_
from typing import List as ListType, Optional, Dict
from fastapi import HTTPException, status
from datetime import datetime, timedelta
import secrets
import logging

from ..models import database_models as db_models
from ..models import pydantic_models as schemas

logger = logging.getLogger(__name__)


class ShareService:
    """
    Service for managing list sharing and permissions
    """
    
    async def get_user_invitations(
        self,
        db: Session,
        user: schemas.CurrentUser,
        pending_only: bool = True
    ) -> ListType[schemas.ListShare]:
        """
        Get all invitations for a user
        """
        query = db.query(db_models.ListShare).options(
            joinedload(db_models.ListShare.list)
        ).filter(
            db_models.ListShare.shared_with_user_id == user.user_id
        )
        
        if pending_only:
            query = query.filter(db_models.ListShare.accepted_at.is_(None))
        
        shares = query.order_by(db_models.ListShare.created_at.desc()).all()
        
        return [schemas.ListShare.from_orm(share) for share in shares]
    
    async def get_list_shares(
        self,
        db: Session,
        list_id: int
    ) -> ListType[schemas.ListShare]:
        """
        Get all shares for a specific list
        """
        shares = db.query(db_models.ListShare).filter(
            db_models.ListShare.list_id == list_id
        ).order_by(db_models.ListShare.created_at.desc()).all()
        
        return [schemas.ListShare.from_orm(share) for share in shares]
    
    async def share_list(
        self,
        db: Session,
        list_obj: db_models.List,
        share_data: schemas.ListShareCreate,
        sharer: schemas.CurrentUser
    ) -> schemas.ListShare:
        """
        Share a list with another user or create a shareable link
        """
        # Check if sharing with specific user
        shared_with_user_id = None
        if share_data.shared_with_username:
            # In a real implementation, you would look up the user in voight-kampff
            # For now, we'll use a simple hash to simulate user IDs
            shared_with_user_id = hash(share_data.shared_with_username) % 2147483647
            
            # Check if already shared with this user
            existing_share = db.query(db_models.ListShare).filter(
                db_models.ListShare.list_id == list_obj.id,
                db_models.ListShare.shared_with_user_id == shared_with_user_id
            ).first()
            
            if existing_share:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"List is already shared with {share_data.shared_with_username}"
                )
        
        # Generate invitation token
        invitation_token = secrets.token_urlsafe(32)
        
        # Calculate expiration
        expires_at = None
        if share_data.expires_at:
            expires_at = share_data.expires_at
        
        # Create the share
        db_share = db_models.ListShare(
            list_id=list_obj.id,
            shared_with_user_id=shared_with_user_id,
            shared_with_username=share_data.shared_with_username,
            permission_level=share_data.permission_level.value,
            shared_by_user_id=sharer.user_id,
            shared_by_username=sharer.username,
            invitation_token=invitation_token,
            expires_at=expires_at
        )
        
        db.add(db_share)
        db.commit()
        db.refresh(db_share)
        
        # Auto-accept if sharing with specific user who doesn't exist yet
        # In a real system, you'd send them an invitation email
        if shared_with_user_id and not share_data.shared_with_username:
            db_share.accepted_at = datetime.utcnow()
            db.commit()
        
        # Log activity
        await self._log_activity(
            db=db,
            list_id=list_obj.id,
            user=sharer,
            action=schemas.ActionType.SHARED,
            details={
                "shared_with": share_data.shared_with_username or "public_link",
                "permission_level": share_data.permission_level.value,
                "invitation_token": invitation_token[:8] + "..."  # Only log part of token
            }
        )
        
        logger.info(f"Shared list {list_obj.id} with {share_data.shared_with_username or 'public link'} by user {sharer.username}")
        
        return schemas.ListShare.from_orm(db_share)
    
    async def accept_invitation(
        self,
        db: Session,
        invitation_token: str,
        user: schemas.CurrentUser
    ) -> schemas.InvitationResponse:
        """
        Accept a list sharing invitation
        """
        # Find the invitation
        share = db.query(db_models.ListShare).options(
            joinedload(db_models.ListShare.list)
        ).filter(
            db_models.ListShare.invitation_token == invitation_token
        ).first()
        
        if not share:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Invitation not found or expired"
            )
        
        # Check if invitation has expired
        if share.expires_at and share.expires_at < datetime.utcnow():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invitation has expired"
            )
        
        # Check if already accepted
        if share.accepted_at:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invitation already accepted"
            )
        
        # If invitation is for a specific user, verify it's the right user
        if share.shared_with_user_id and share.shared_with_user_id != user.user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This invitation is not for you"
            )
        
        # Accept the invitation
        share.shared_with_user_id = user.user_id
        share.shared_with_username = user.username
        share.accepted_at = datetime.utcnow()
        
        db.commit()
        
        # Log activity
        await self._log_activity(
            db=db,
            list_id=share.list_id,
            user=user,
            action=schemas.ActionType.SHARED,
            details={
                "action": "invitation_accepted",
                "permission_level": share.permission_level
            }
        )
        
        logger.info(f"User {user.username} accepted invitation for list {share.list_id}")
        
        return schemas.InvitationResponse(
            list_id=share.list_id,
            list_name=share.list.name,
            shared_by=share.shared_by_username,
            permission_level=schemas.PermissionLevel(share.permission_level),
            accepted=True
        )
    
    async def revoke_share(
        self,
        db: Session,
        share_id: int,
        user: schemas.CurrentUser
    ) -> Dict[str, str]:
        """
        Revoke a list share
        """
        # Get the share
        share = db.query(db_models.ListShare).options(
            joinedload(db_models.ListShare.list)
        ).filter(db_models.ListShare.id == share_id).first()
        
        if not share:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Share not found"
            )
        
        # Check if user has permission to revoke (must be list owner or the share creator)
        if share.list.owner_id != user.user_id and share.shared_by_user_id != user.user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have permission to revoke this share"
            )
        
        shared_with = share.shared_with_username or f"Token {share.invitation_token[:8]}..."
        list_name = share.list.name
        
        # Delete the share
        db.delete(share)
        db.commit()
        
        # Log activity
        await self._log_activity(
            db=db,
            list_id=share.list_id,
            user=user,
            action=schemas.ActionType.UPDATED,
            details={
                "action": "share_revoked",
                "revoked_for": shared_with
            }
        )
        
        logger.info(f"Revoked share {share_id} for {shared_with} by user {user.username}")
        
        return {
            "shared_with": shared_with,
            "list_name": list_name
        }
    
    async def update_share_permissions(
        self,
        db: Session,
        share_id: int,
        share_data: schemas.ListShareUpdate,
        user: schemas.CurrentUser
    ) -> schemas.ListShare:
        """
        Update permissions for a list share
        """
        # Get the share
        share = db.query(db_models.ListShare).options(
            joinedload(db_models.ListShare.list)
        ).filter(db_models.ListShare.id == share_id).first()
        
        if not share:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Share not found"
            )
        
        # Check if user has permission (must be list owner)
        if share.list.owner_id != user.user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only list owner can update share permissions"
            )
        
        # Update permissions
        old_permission = share.permission_level
        changes = {}
        
        if share_data.permission_level:
            share.permission_level = share_data.permission_level.value
            changes["permission_level"] = {
                "old": old_permission,
                "new": share_data.permission_level.value
            }
        
        if share_data.expires_at is not None:
            share.expires_at = share_data.expires_at
            changes["expires_at"] = share_data.expires_at
        
        db.commit()
        db.refresh(share)
        
        # Log activity
        await self._log_activity(
            db=db,
            list_id=share.list_id,
            user=user,
            action=schemas.ActionType.UPDATED,
            details={
                "action": "share_permissions_updated",
                "share_id": share_id,
                "changes": changes
            }
        )
        
        logger.info(f"Updated share permissions for share {share_id} by user {user.username}")
        
        return schemas.ListShare.from_orm(share)
    
    async def create_public_link(
        self,
        db: Session,
        list_obj: db_models.List,
        permission_level: schemas.PermissionLevel,
        expires_hours: Optional[int],
        sharer: schemas.CurrentUser
    ) -> schemas.ListShare:
        """
        Create a public shareable link
        """
        expires_at = None
        if expires_hours:
            expires_at = datetime.utcnow() + timedelta(hours=expires_hours)
        
        share_data = schemas.ListShareCreate(
            shared_with_username=None,  # Public link
            permission_level=permission_level,
            expires_at=expires_at
        )
        
        return await self.share_list(db, list_obj, share_data, sharer)
    
    async def get_public_link_info(
        self,
        db: Session,
        invitation_token: str
    ) -> Dict:
        """
        Get information about a public link
        """
        share = db.query(db_models.ListShare).options(
            joinedload(db_models.ListShare.list)
        ).filter(
            db_models.ListShare.invitation_token == invitation_token,
            db_models.ListShare.shared_with_user_id.is_(None)  # Public link
        ).first()
        
        if not share:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Public link not found"
            )
        
        # Check if expired
        if share.expires_at and share.expires_at < datetime.utcnow():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Public link has expired"
            )
        
        return {
            "list_id": share.list_id,
            "list_name": share.list.name,
            "list_description": share.list.description,
            "shared_by": share.shared_by_username,
            "permission_level": share.permission_level,
            "expires_at": share.expires_at,
            "is_expired": False
        }
    
    async def leave_shared_list(
        self,
        db: Session,
        list_id: int,
        user: schemas.CurrentUser
    ) -> str:
        """
        Leave a shared list (remove own access)
        """
        # Get the list to check if user is not the owner
        list_obj = db.query(db_models.List).filter(db_models.List.id == list_id).first()
        if not list_obj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="List not found"
            )
        
        if list_obj.owner_id == user.user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot leave your own list. Transfer ownership or delete the list instead."
            )
        
        # Find the user's share
        share = db.query(db_models.ListShare).filter(
            db_models.ListShare.list_id == list_id,
            db_models.ListShare.shared_with_user_id == user.user_id
        ).first()
        
        if not share:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="You don't have access to this list"
            )
        
        list_name = list_obj.name
        
        # Remove the share
        db.delete(share)
        db.commit()
        
        # Log activity
        await self._log_activity(
            db=db,
            list_id=list_id,
            user=user,
            action=schemas.ActionType.UPDATED,
            details={
                "action": "left_shared_list"
            }
        )
        
        logger.info(f"User {user.username} left shared list {list_id}")
        
        return list_name
    
    async def get_list_collaborators(
        self,
        db: Session,
        list_id: int
    ) -> ListType[Dict]:
        """
        Get all collaborators for a list
        """
        # Get list owner
        list_obj = db.query(db_models.List).filter(db_models.List.id == list_id).first()
        if not list_obj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="List not found"
            )
        
        collaborators = [{
            "user_id": list_obj.owner_id,
            "username": list_obj.owner_username,
            "permission_level": "owner",
            "is_owner": True,
            "joined_at": list_obj.created_at,
            "status": "active"
        }]
        
        # Get all accepted shares
        shares = db.query(db_models.ListShare).filter(
            db_models.ListShare.list_id == list_id,
            db_models.ListShare.accepted_at.isnot(None)
        ).all()
        
        for share in shares:
            collaborators.append({
                "user_id": share.shared_with_user_id,
                "username": share.shared_with_username,
                "permission_level": share.permission_level,
                "is_owner": False,
                "joined_at": share.accepted_at,
                "status": "active" if not share.expires_at or share.expires_at > datetime.utcnow() else "expired"
            })
        
        return collaborators
    
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