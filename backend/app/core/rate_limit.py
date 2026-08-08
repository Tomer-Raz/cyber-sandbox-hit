from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

def get_user_or_ip_key(request: Request) -> str:
    """
    Identifies the requester for rate limiting.
    Uses authenticated user ID if present in request state,
    otherwise falls back to IP address.
    """
    user = getattr(request.state, "user", None)
    if user and hasattr(user, "id"):
        return str(user.id)
    return get_remote_address(request)

# Global Limiter instance
limiter = Limiter(key_func=get_user_or_ip_key, default_limits=["100/minute"])