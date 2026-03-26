"""
Authentication service for reading Traefik forward auth headers
"""
from fastapi import Request
import logging
from ..models.pydantic_models import CurrentUser

logger = logging.getLogger(__name__)


class AuthService:
    """
    Service for reading user info from Traefik headers
    Traefik handles authentication, we just read the user identity
    """
    
    async def get_current_user(self, request: Request) -> CurrentUser:
        """
        Get current user from Traefik headers
        Traefik has already validated access, we just extract user info
        
        Args:
            request: FastAPI request object
            
        Returns:
            CurrentUser object with real user info from Traefik
        """
        # Read headers forwarded by Traefik after authentication
        username = request.headers.get("X-Remote-User")
        user_email = request.headers.get("X-Remote-Email")
        user_name = request.headers.get("X-Remote-Name")
        
        if username:
            logger.debug(f"User from Traefik headers: {username}")
            # Generate consistent user_id from username
            user_id = hash(username) % 2147483647  # Keep within int32 range
            
            return CurrentUser(
                user_id=user_id,
                username=username,
                is_authenticated=True
            )
        else:
            # Fallback if no headers (dev environment?)
            logger.warning("No X-Remote-User header found, using fallback user")
            return CurrentUser(
                user_id=1,
                username="dev_user",
                is_authenticated=True
            )


# Create a singleton instance
auth_service = AuthService()