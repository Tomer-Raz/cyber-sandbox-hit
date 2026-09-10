import logging
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import InvalidCredential, verify_google_id_token
from app.db.session import get_db
from app.models.user import ADMIN_ROLE, USER_ROLE, User
from app.services import admin_directory, audit_service

logger = logging.getLogger(__name__)

_bearer = HTTPBearer(auto_error=True)


# ── Temporary guest access ───────────────────────────────────────────────────
# Lets the project be demonstrated by someone who should not have to hand over
# a Google account. To remove it, delete this block, the branch at the top of
# `get_current_user`, and `guest_mode_enabled` in app.core.config.
#
# The bearer *is* the credential: `guest.<mode>`. There is deliberately no
# endpoint that mints one — the SPA builds the string and sends it to /auth/me
# like any other token, which keeps the sign-in rate limit and every other
# route untouched.
#
# It is not a secret and is not meant to be: the guest buttons must work on the
# first click for a reviewer who has only been given a link, so anything the
# button could send on their behalf would sit in the JS bundle in clear text.
# `guest_mode_enabled` is therefore the entire access control here, and while
# it is on, anyone who can reach the API can obtain an admin session.
_GUEST_PREFIX = "guest."
_GUEST_MODES = {"user": USER_ROLE, "admin": ADMIN_ROLE}
# role -> (google_sub, email, name). `.invalid` is reserved by RFC 2606, so no
# real domain is written into the codebase.
_GUEST_PROFILE = {
    USER_ROLE: ("guest:user", "guest@example.invalid", "Guest"),
    ADMIN_ROLE: ("guest:admin", "guest-admin@example.invalid", "Guest Admin"),
}


def guest_role(token: str) -> str | None:
    """The role a `guest.<mode>` bearer grants, or None if it grants none.

    Returns None whenever `GUEST_MODE_ENABLED` is off, so the guest path does
    not exist at all until it is deliberately switched on.
    """
    if not get_settings().guest_mode_enabled or not token.startswith(_GUEST_PREFIX):
        return None
    return _GUEST_MODES.get(token[len(_GUEST_PREFIX) :])


async def _get_guest_user(role: str, db: AsyncSession) -> User:
    """The single shared row behind a guest mode, created on first use.

    Every guest shares one identity per mode on purpose: their scans stay in
    the database and the admin console shows them all under one "Guest" user,
    instead of accumulating a row per visit.

    No blocked check and no sign-in audit event, unlike the Google path below:
    a guest admin who blocks the guest user would otherwise lock the demo out
    of itself, and a guest bearer carries no `iat` to make sign-in logging
    idempotent, so it would write one event per API call.
    """
    sub, email, name = _GUEST_PROFILE[role]
    result = await db.execute(select(User).where(User.google_sub == sub))
    user = result.scalar_one_or_none()

    if user is None:
        user = User(google_sub=sub, email=email, name=name, role=role)
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user

    # The token decides the role, never the stored row — otherwise editing
    # `users.role` by hand would be enough to turn the guest user into an admin.
    if user.role != role:
        user.role = role
        await db.commit()
        await db.refresh(user)
    return user


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
    # Temporary guest access, checked ahead of Google verification because a
    # guest bearer is not an ID token and could only ever fail it. Inert unless
    # GUEST_MODE_ENABLED is on — see the block above.
    guest = guest_role(credentials.credentials)
    if guest is not None:
        return await _get_guest_user(guest, db)

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
