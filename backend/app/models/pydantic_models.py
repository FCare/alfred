"""
Pydantic models for API request/response validation
"""
from pydantic import BaseModel, Field
from typing import Optional, List as TypingList
from datetime import datetime
from enum import Enum


class PermissionLevel(str, Enum):
    """Permission levels for list sharing"""
    READ = "read"
    WRITE = "write"
    ADMIN = "admin"


class ActionType(str, Enum):
    """Activity action types"""
    CREATED = "created"
    UPDATED = "updated"
    DELETED = "deleted"
    SHARED = "shared"
    ITEM_ADDED = "item_added"
    ITEM_UPDATED = "item_updated"
    ITEM_DELETED = "item_deleted"
    ITEM_CHECKED = "item_checked"
    ITEM_UNCHECKED = "item_unchecked"


# Base models
class ListItemBase(BaseModel):
    """Base model for list items"""
    name: str = Field(..., min_length=1, max_length=255, description="Item name")
    quantity: Optional[str] = Field(None, max_length=100, description="Quantity (e.g., '2 kg', '1 box')")
    description: Optional[str] = Field(None, description="Item description")
    is_checked: bool = Field(False, description="Whether item is checked")
    position: int = Field(0, description="Item position in list")


class ListItemCreate(ListItemBase):
    """Model for creating a new list item"""
    pass


class ListItemUpdate(BaseModel):
    """Model for updating a list item"""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    quantity: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = Field(None)
    is_checked: Optional[bool] = None
    position: Optional[int] = None


class ListItem(ListItemBase):
    """Full list item model with database fields"""
    id: int
    list_id: int
    image_path: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# List models
class ListBase(BaseModel):
    """Base model for lists"""
    name: str = Field(..., min_length=1, max_length=255, description="List name")
    description: Optional[str] = Field(None, description="List description")
    is_private: bool = Field(True, description="Whether list is private")


class ListCreate(ListBase):
    """Model for creating a new list"""
    pass


class ListUpdate(BaseModel):
    """Model for updating a list"""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    is_private: Optional[bool] = None


class ListSummary(ListBase):
    """Summary model for lists (without items)"""
    id: int
    owner_id: int
    owner_username: str
    created_at: datetime
    updated_at: datetime
    archived_at: Optional[datetime] = None
    item_count: int = Field(0, description="Number of items in list")
    checked_count: int = Field(0, description="Number of checked items")

    class Config:
        from_attributes = True


class List(ListBase):
    """Full list model with items"""
    id: int
    owner_id: int
    owner_username: str
    created_at: datetime
    updated_at: datetime
    archived_at: Optional[datetime] = None
    items: TypingList[ListItem] = []

    class Config:
        from_attributes = True


# Share models
class ListShareBase(BaseModel):
    """Base model for list sharing"""
    permission_level: PermissionLevel = Field(..., description="Permission level")
    expires_at: Optional[datetime] = Field(None, description="Expiration date")


class ListShareCreate(ListShareBase):
    """Model for creating a list share"""
    shared_with_username: Optional[str] = Field(None, description="Username to share with (None for link sharing)")


class ListShareUpdate(BaseModel):
    """Model for updating a list share"""
    permission_level: Optional[PermissionLevel] = None
    expires_at: Optional[datetime] = None


class ListShare(ListShareBase):
    """Full list share model"""
    id: int
    list_id: int
    shared_with_user_id: Optional[int] = None
    shared_with_username: Optional[str] = None
    shared_by_user_id: int
    shared_by_username: str
    invitation_token: Optional[str] = None
    accepted_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


# Activity models
class ListActivity(BaseModel):
    """Model for list activity"""
    id: int
    list_id: int
    user_id: int
    username: str
    action: ActionType
    details: Optional[dict] = None
    created_at: datetime

    class Config:
        from_attributes = True


# Search models
class SearchResult(BaseModel):
    """Search result model"""
    type: str = Field(..., description="Type of result (list or item)")
    id: int
    name: str
    description: Optional[str] = None
    list_id: Optional[int] = None  # For items
    list_name: Optional[str] = None  # For items
    highlight: Optional[str] = None  # Highlighted text


class SearchResponse(BaseModel):
    """Search response model"""
    query: str
    results: TypingList[SearchResult]
    total: int


# User models (for current user info)
class CurrentUser(BaseModel):
    """Current user information"""
    user_id: int
    username: str
    is_authenticated: bool = True


# Response models
class MessageResponse(BaseModel):
    """Generic message response"""
    message: str
    success: bool = True


class ErrorResponse(BaseModel):
    """Error response model"""
    error: str
    detail: Optional[str] = None
    success: bool = False


# File upload models
class UploadResponse(BaseModel):
    """File upload response"""
    filename: str
    original_filename: str
    size: int
    content_type: str
    url: str


# Invitation models
class InvitationAccept(BaseModel):
    """Model for accepting an invitation"""
    token: str = Field(..., description="Invitation token")


class InvitationResponse(BaseModel):
    """Invitation response model"""
    list_id: int
    list_name: str
    shared_by: str
    permission_level: PermissionLevel
    accepted: bool = True