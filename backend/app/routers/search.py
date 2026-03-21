"""
API endpoints for search functionality
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional

from ..database import get_db
from ..dependencies import get_current_user
from ..models import pydantic_models as schemas
from ..services.search_service import SearchService

router = APIRouter()
search_service = SearchService()


@router.get("", response_model=schemas.SearchResponse)
async def search(
    q: str = Query(..., min_length=1, description="Search query"),
    current_user: schemas.CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = Query(50, ge=1, le=100, description="Maximum number of results"),
    include_items: bool = Query(True, description="Include items in search results"),
    include_lists: bool = Query(True, description="Include lists in search results"),
    list_id: Optional[int] = Query(None, description="Search within specific list only")
):
    """
    Search for lists and items
    """
    return await search_service.search(
        db=db,
        query=q,
        user=current_user,
        limit=limit,
        include_items=include_items,
        include_lists=include_lists,
        list_id=list_id
    )


@router.get("/suggestions")
async def get_search_suggestions(
    q: str = Query(..., min_length=1, description="Partial search query"),
    current_user: schemas.CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = Query(10, ge=1, le=20, description="Maximum number of suggestions")
):
    """
    Get search suggestions based on partial query
    """
    return await search_service.get_suggestions(
        db=db,
        partial_query=q,
        user=current_user,
        limit=limit
    )


@router.get("/recent")
async def get_recent_items(
    current_user: schemas.CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = Query(20, ge=1, le=50, description="Maximum number of recent items")
):
    """
    Get recently added or modified items across all accessible lists
    """
    return await search_service.get_recent_items(
        db=db,
        user=current_user,
        limit=limit
    )


@router.get("/popular")
async def get_popular_items(
    current_user: schemas.CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = Query(20, ge=1, le=50, description="Maximum number of popular items")
):
    """
    Get most frequently used items across user's lists
    """
    return await search_service.get_popular_items(
        db=db,
        user=current_user,
        limit=limit
    )