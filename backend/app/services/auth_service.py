"""
Authentication service for integrating with Voight-Kampff
"""
import httpx
from fastapi import HTTPException, Request, status
from typing import Optional, Tuple
import logging

from ..config import settings
from ..models.pydantic_models import CurrentUser

logger = logging.getLogger(__name__)


class AuthService:
    """
    Service for handling authentication with Voight-Kampff
    """
    
    def __init__(self):
        self.vk_url = settings.voight_kampff_url
        self.verify_endpoint = settings.voight_kampff_verify_endpoint
        
    async def verify_session(self, request: Request, service_name: str = "alfred") -> Optional[CurrentUser]:
        """
        Verify user session with Voight-Kampff
        
        Args:
            request: FastAPI request object
            service_name: Service name for verification
            
        Returns:
            CurrentUser object if authenticated, None otherwise
        """
        try:
            # Extract session cookie
            session_cookie = request.cookies.get("vk_session")
            if not session_cookie:
                logger.debug("No session cookie found")
                return None
            
            # Prepare headers for VK verification
            headers = {
                "X-Forwarded-Host": f"{service_name}.caronboulme.fr",
                "Cookie": f"vk_session={session_cookie}",
                "User-Agent": request.headers.get("user-agent", "Alfred-Backend/1.0"),
                "X-Forwarded-For": self._get_client_ip(request),
            }
            
            # Verify with Voight-Kampff
            verify_url = f"{self.vk_url}{self.verify_endpoint}"
            
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(verify_url, headers=headers)
                
            if response.status_code == 200:
                data = response.json()
                if data.get("valid"):
                    # Extract user information
                    username = data.get("user")
                    if username and username != "unknown":
                        # For now, use a simple user_id based on username
                        # In a real system, you might want to maintain a user mapping
                        user_id = hash(username) % 2147483647  # Keep within int32 range
                        
                        return CurrentUser(
                            user_id=user_id,
                            username=username,
                            is_authenticated=True
                        )
            
            logger.debug(f"VK verification failed: {response.status_code} - {response.text}")
            return None
            
        except httpx.RequestError as e:
            logger.error(f"Error connecting to Voight-Kampff: {e}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error in authentication: {e}")
            return None
    
    async def require_authentication(self, request: Request, service_name: str = "alfred") -> CurrentUser:
        """
        Require authentication for a request
        
        Args:
            request: FastAPI request object
            service_name: Service name for verification
            
        Returns:
            CurrentUser object
            
        Raises:
            HTTPException: If authentication fails
        """
        current_user = await self.verify_session(request, service_name)
        
        if not current_user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required. Please login through Voight-Kampff.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        return current_user
    
    def _get_client_ip(self, request: Request) -> str:
        """
        Extract client IP from request headers
        """
        # Check for forwarded headers first (from proxies like Traefik)
        forwarded_for = request.headers.get("x-forwarded-for")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()
        
        real_ip = request.headers.get("x-real-ip")
        if real_ip:
            return real_ip.strip()
        
        # Fallback to direct connection
        return getattr(request.client, "host", "unknown") if request.client else "unknown"


# Create a singleton instance
auth_service = AuthService()