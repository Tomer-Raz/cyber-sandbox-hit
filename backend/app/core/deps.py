import logging
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import InvalidCredential, verify_google_id_token
from app.db.session import get_db
from app.models.user import ADMIN_ROLE, USER_ROLE, User
from app.services import admin_directory, audit_service

logger = logging.getLogger(__name__)

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


def _issued_at(claims: dict) -> datetime | None:
    """When Google minted this credential, from the `iat` claim."""
    iat = claims.get("iat")
    if not isinstance(iat, (int, float)):
        return None
    return datetime.fromtimestamp(iat, tz=timezone.utc)


async def _record_sign_in(user: User, claims: dict) -> bool:
    """Records a sign-in the first time a freshly issued credential is seen.

    `get_current_user` runs on every authenticated request, so the trigger is a
    credential newer than the last one recorded rather than the request itself.
    Google ID tokens last an hour, which puts a natural ceiling of roughly one
    event per user per hour instead of one per API call.

    Returns whether `user` was modified, so the caller knows to commit.
    """
    issued_at = _issued_at(claims)
    if issued_at is None:
        return False
    if user.last_login_at is not None and issued_at <= user.last_login_at:
        return False

    user.last_login_at = issued_at
    try:
        await audit_service.log_audit_event(
            user_id=str(user.id), action="signed_in", email=user.email
        )
    except Exception:  # noqa: BLE001 - the audit log must never break sign-in
        logger.warning("Could not record sign-in for %s", user.id, exc_info=True)
    return True


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
        # Flushed rather than committed so the row has an id for the audit
        # event while both still land in one transaction.
        await db.flush()
        await _record_sign_in(user, claims)
        await db.commit()
        await db.refresh(user)
        return user

    # Checked before anything else is written: a blocked account should leave
    # no trace beyond the rejection, and none of the syncing below is worth
    # doing for someone who cannot use the API anyway.
    if user.is_blocked:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been blocked by an administrator",
        )

    # Google (and, for role, IAM) is authoritative for all three, so a drifted
    # row — renamed account, or a principal bound to / unbound from the admin
    # role — self-corrects on the owner's next request. That's also why
    # granting admin needs no migration and revoking it needs no cleanup.
    email = claim_email or user.email
    name = claims.get("name") or user.name
    drifted = (user.email, user.name, user.role) != (email, name, role)
    if drifted:
        user.email = email
        user.name = name
        user.role = role

    signed_in = await _record_sign_in(user, claims)
    if drifted or signed_in:
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
