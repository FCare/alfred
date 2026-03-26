"""
Authentication service for reading Traefik forward auth headers
"""
from fastapi import HTTPException, Request, status
from typing import Optional
import logging

from ..models.pydantic_models import CurrentUser

logger = logging.getLogger(__name__)


class AuthService:
    """
    Service for handling authentication via Traefik headers
    Traefik calls Voight-Kampff /verify and forwards headers to us
    """
    
    def get_user_from_headers(self, request: Request) -> Optional[CurrentUser]:
        """
        Extract user information from Traefik forward auth headers
        
        Args:
            request: FastAPI request object
            
        Returns:
            CurrentUser object if authenticated, None otherwise
        """
        # Read headers set by Traefik after successful Voight-Kampff verification
        username = request.headers.get("X-Remote-User")
        user_email = request.headers.get("X-Remote-Email")
        user_name = request.headers.get("X-Remote-Name")
        
        if not username:
            logger.debug("No X-Remote-User header found - not authenticated")
            return None
            
        logger.debug(f"Authenticated user from headers: {username}")
        
        # Generate consistent user_id from username
        user_id = hash(username) % 2147483647  # Keep within int32 range
        
        return CurrentUser(
            user_id=user_id,
            username=username,
            is_authenticated=True
        )
    
    async def verify_session(self, request: Request) -> Optional[CurrentUser]:
        """
        Verify user session by reading Traefik headers
        
        Args:
            request: FastAPI request object
            
        Returns:
            CurrentUser object if authenticated, None otherwise
        """
        return self.get_user_from_headers(request)
    
    async def require_authentication(self, request: Request) -> CurrentUser:
        """
        Require authentication for a request
        
        Args:
            request: FastAPI request object
            
        Returns:
            CurrentUser object
            
        Raises:
            HTTPException: If authentication fails
        """
        current_user = self.get_user_from_headers(request)
        
        if not current_user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required. Please login through Voight-Kampff.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        return current_user


# Create a singleton instance
auth_service = AuthService()