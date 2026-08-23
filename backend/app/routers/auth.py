from fastapi import APIRouter, Depends

from app.core.deps import get_current_user
from app.core.rate_limit import enforce_login_rate_limit
from app.models.user import User
from app.schemas.user import UserOut

router = APIRouter(prefix="/api/auth", tags=["auth"])


# This is the sign-in endpoint: Google mints the credential in the browser and
# this is the first and only place the backend verifies it. Limited through
# `dependencies` so the check runs ahead of `get_current_user`.
@router.get("/me", response_model=UserOut, dependencies=[Depends(enforce_login_rate_limit)])
def me(user: User = Depends(get_current_user)) -> User:
    return user
