from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import InvalidCredential, verify_google_id_token
from app.db.session import get_db
from app.models.user import ADMIN_ROLE, USER_ROLE, User
from app.services import admin_directory

_bearer = HTTPBearer(auto_error=True)


async def resolve_role(claims: dict) -> str:
    """Derives a role from the ID token, against the admin role's IAM members.

    Requires `email_verified`: Google only sets it once the address is proven
    to belong to the account, and without that check any account that merely
    *asserts* an admin's email would inherit the role.
    """
    if not claims.get("email_verified"):
        return USER_ROLE
    email = (claims.get("email") or "").casefold()
    if not email:
        return USER_ROLE
    return ADMIN_ROLE if email in await admin_directory.admin_emails() else USER_ROLE


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    try:
        claims = verify_google_id_token(credentials.credentials)
    except InvalidCredential as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired credential",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    sub = claims["sub"]
    result = await db.execute(select(User).where(User.google_sub == sub))
    user = result.scalar_one_or_none()

    claim_email = claims.get("email") or ""
    role = await resolve_role(claims)

    if user is None:
        user = User(
            google_sub=sub,
            email=claim_email,
            name=claims.get("name") or claim_email or "Member",
            role=role,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user

    # Google (and, for role, IAM) is authoritative for all three, so a drifted
    # row — renamed account, or a principal bound to / unbound from the admin
    # role — self-corrects on the owner's next request. That's also why
    # granting admin needs no migration and revoking it needs no cleanup.
    email = claim_email or user.email
    name = claims.get("name") or user.name
    if (user.email, user.name, user.role) != (email, name, role):
        user.email = email
        user.name = name
        user.role = role
        await db.commit()
        await db.refresh(user)

    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    """Gate for the admin-only routes.

    403 rather than the 404 used for per-scan ownership: which scans exist is
    another user's business, but the admin area's existence isn't a secret.
    """
    if user.role != ADMIN_ROLE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator access required",
        )
    return user
