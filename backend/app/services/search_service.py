"""
Business logic for search functionality
"""
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_, text
from typing import List as ListType, Optional, Dict
import logging

from ..models import database_models as db_models
from ..models import pydantic_models as schemas

logger = logging.getLogger(__name__)


class SearchService:
    """
    Service for searching lists and items
    """
    
    async def search(
        self,
        db: Session,
        query: str,
        user: schemas.CurrentUser,
        limit: int = 50,
        include_items: bool = True,
        include_lists: bool = True,
        list_id: Optional[int] = None
    ) -> schemas.SearchResponse:
        """
        Search for lists and items accessible to the user
        """
        results = []
        
        # Clean and prepare search query
        search_terms = self._prepare_search_terms(query)
        
        # Search in lists (if enabled and not searching within specific list)
        if include_lists and list_id is None:
            list_results = await self._search_lists(
                db=db,
                search_terms=search_terms,
                user=user,
                limit=limit // 2 if include_items else limit
            )
            results.extend(list_results)
        
        # Search in items
        if include_items:
            item_results = await self._search_items(
                db=db,
                search_terms=search_terms,
                user=user,
                limit=limit - len(results),
                list_id=list_id
            )
            results.extend(item_results)
        
        # Sort results by relevance (lists first, then items)
        results.sort(key=lambda x: (x.type != "list", x.name.lower()))
        
        return schemas.SearchResponse(
            query=query,
            results=results[:limit],
            total=len(results)
        )
    
    async def get_suggestions(
        self,
        db: Session,
        partial_query: str,
        user: schemas.CurrentUser,
        limit: int = 10
    ) -> ListType[str]:
        """
        Get search suggestions based on partial query
        """
        search_terms = self._prepare_search_terms(partial_query)
        suggestions = set()
        
        # Get accessible lists
        accessible_lists = await self._get_accessible_list_ids(db, user)
        
        if not accessible_lists:
            return []
        
        # Get suggestions from item names
        item_names = db.query(db_models.ListItem.name).filter(
            db_models.ListItem.list_id.in_(accessible_lists)
        ).distinct().all()
        
        # Filter and rank suggestions
        for (name,) in item_names:
            if self._matches_partial_query(name.lower(), search_terms):
                suggestions.add(name)
                if len(suggestions) >= limit:
                    break
        
        return list(suggestions)[:limit]
    
    async def get_recent_items(
        self,
        db: Session,
        user: schemas.CurrentUser,
        limit: int = 20
    ) -> ListType[schemas.SearchResult]:
        """
        Get recently added or modified items across accessible lists
        """
        # Get accessible lists
        accessible_lists = await self._get_accessible_list_ids(db, user)
        
        if not accessible_lists:
            return []
        
        # Get recent items
        recent_items = db.query(db_models.ListItem).join(
            db_models.List
        ).filter(
            db_models.ListItem.list_id.in_(accessible_lists)
        ).order_by(
            db_models.ListItem.updated_at.desc()
        ).limit(limit).all()
        
        # Convert to search results
        results = []
        for item in recent_items:
            result = schemas.SearchResult(
                type="item",
                id=item.id,
                name=item.name,
                description=item.description,
                list_id=item.list_id,
                list_name=item.list.name,
                highlight=None
            )
            results.append(result)
        
        return results
    
    async def get_popular_items(
        self,
        db: Session,
        user: schemas.CurrentUser,
        limit: int = 20
    ) -> ListType[Dict]:
        """
        Get most frequently used items across user's lists
        """
        # Get accessible lists
        accessible_lists = await self._get_accessible_list_ids(db, user)
        
        if not accessible_lists:
            return []
        
        # Count item name frequency
        popular_items = db.query(
            db_models.ListItem.name,
            func.count(db_models.ListItem.id).label('count')
        ).filter(
            db_models.ListItem.list_id.in_(accessible_lists)
        ).group_by(
            db_models.ListItem.name
        ).order_by(
            func.count(db_models.ListItem.id).desc()
        ).limit(limit).all()
        
        # Format results
        results = []
        for name, count in popular_items:
            results.append({
                "name": name,
                "count": count
            })
        
        return results
    
    async def _search_lists(
        self,
        db: Session,
        search_terms: ListType[str],
        user: schemas.CurrentUser,
        limit: int
    ) -> ListType[schemas.SearchResult]:
        """
        Search in list names and descriptions
        """
        # Build search query for lists
        query = db.query(db_models.List).outerjoin(db_models.ListShare)
        
        # Filter accessible lists
        query = query.filter(
            or_(
                db_models.List.owner_id == user.user_id,
                and_(
                    db_models.ListShare.shared_with_user_id == user.user_id,
                    db_models.ListShare.accepted_at.isnot(None)
                )
            )
        )
        
        # Apply search filters
        search_conditions = []
        for term in search_terms:
            term_condition = or_(
                db_models.List.name.ilike(f'%{term}%'),
                db_models.List.description.ilike(f'%{term}%')
            )
            search_conditions.append(term_condition)
        
        if search_conditions:
            query = query.filter(or_(*search_conditions))
        
        # Execute query
        lists = query.distinct().limit(limit).all()
        
        # Convert to search results
        results = []
        for list_obj in lists:
            highlight = self._generate_highlight(
                text=f"{list_obj.name} {list_obj.description or ''}",
                search_terms=search_terms
            )
            
            result = schemas.SearchResult(
                type="list",
                id=list_obj.id,
                name=list_obj.name,
                description=list_obj.description,
                list_id=None,
                list_name=None,
                highlight=highlight
            )
            results.append(result)
        
        return results
    
    async def _search_items(
        self,
        db: Session,
        search_terms: ListType[str],
        user: schemas.CurrentUser,
        limit: int,
        list_id: Optional[int] = None
    ) -> ListType[schemas.SearchResult]:
        """
        Search in item names and descriptions
        """
        # Get accessible lists
        if list_id:
            # Check if user has access to specific list
            accessible_lists = await self._get_accessible_list_ids(db, user)
            if list_id not in accessible_lists:
                return []
            accessible_list_filter = [list_id]
        else:
            accessible_list_filter = await self._get_accessible_list_ids(db, user)
        
        if not accessible_list_filter:
            return []
        
        # Build search query for items
        query = db.query(db_models.ListItem).join(db_models.List).filter(
            db_models.ListItem.list_id.in_(accessible_list_filter)
        )
        
        # Apply search filters
        search_conditions = []
        for term in search_terms:
            term_condition = or_(
                db_models.ListItem.name.ilike(f'%{term}%'),
                db_models.ListItem.description.ilike(f'%{term}%'),
                db_models.ListItem.quantity.ilike(f'%{term}%')
            )
            search_conditions.append(term_condition)
        
        if search_conditions:
            query = query.filter(or_(*search_conditions))
        
        # Execute query
        items = query.limit(limit).all()
        
        # Convert to search results
        results = []
        for item in items:
            highlight = self._generate_highlight(
                text=f"{item.name} {item.description or ''} {item.quantity or ''}",
                search_terms=search_terms
            )
            
            result = schemas.SearchResult(
                type="item",
                id=item.id,
                name=item.name,
                description=item.description,
                list_id=item.list_id,
                list_name=item.list.name,
                highlight=highlight
            )
            results.append(result)
        
        return results
    
    async def _get_accessible_list_ids(
        self,
        db: Session,
        user: schemas.CurrentUser
    ) -> ListType[int]:
        """
        Get list IDs accessible to the user (owned + shared)
        """
        # Owned lists
        owned_lists = db.query(db_models.List.id).filter(
            db_models.List.owner_id == user.user_id
        ).all()
        
        # Shared lists
        shared_lists = db.query(db_models.List.id).join(db_models.ListShare).filter(
            db_models.ListShare.shared_with_user_id == user.user_id,
            db_models.ListShare.accepted_at.isnot(None)
        ).all()
        
        # Combine and return
        all_list_ids = [id for (id,) in owned_lists + shared_lists]
        return list(set(all_list_ids))
    
    def _prepare_search_terms(self, query: str) -> ListType[str]:
        """
        Clean and split search query into terms
        """
        # Remove special characters and split by whitespace
        cleaned = ''.join(c for c in query if c.isalnum() or c.isspace())
        terms = [term.strip().lower() for term in cleaned.split() if term.strip()]
        
        # Remove duplicates while preserving order
        seen = set()
        unique_terms = []
        for term in terms:
            if term not in seen:
                seen.add(term)
                unique_terms.append(term)
        
        return unique_terms
    
    def _matches_partial_query(self, text: str, search_terms: ListType[str]) -> bool:
        """
        Check if text matches any of the search terms (partial match)
        """
        for term in search_terms:
            if term in text:
                return True
        return False
    
    def _generate_highlight(self, text: str, search_terms: ListType[str], max_length: int = 100) -> Optional[str]:
        """
        Generate highlighted text snippet for search results
        """
        if not text or not search_terms:
            return None
        
        text_lower = text.lower()
        
        # Find the first match
        first_match_pos = None
        first_match_term = None
        
        for term in search_terms:
            pos = text_lower.find(term)
            if pos != -1:
                if first_match_pos is None or pos < first_match_pos:
                    first_match_pos = pos
                    first_match_term = term
        
        if first_match_pos is None:
            # No match found, return truncated text
            return text[:max_length] + "..." if len(text) > max_length else text
        
        # Calculate snippet boundaries
        term_length = len(first_match_term)
        start = max(0, first_match_pos - (max_length - term_length) // 2)
        end = min(len(text), start + max_length)
        
        # Adjust start if end reached text limit
        if end == len(text):
            start = max(0, end - max_length)
        
        snippet = text[start:end]
        
        # Add ellipsis if truncated
        if start > 0:
            snippet = "..." + snippet
        if end < len(text):
            snippet = snippet + "..."
        
        return snippet