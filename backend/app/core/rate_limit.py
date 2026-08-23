"""Rate limiting for the sign-in endpoint.

Enforced as a FastAPI dependency rather than a decorator. The endpoint's real
work happens in `get_current_user`, which rejects a bad credential *before* the
route function is ever called — so a wrapper around the route function would
only ever throttle successful sign-ins and would miss a flood of invalid ones
entirely. Listing this in the route's `dependencies` runs it ahead of
`get_current_user`, which is the only ordering that throttles the attack.
"""

from fastapi import Depends, HTTPException, Request, status
from limits import parse
from limits.storage import MemoryStorage
from limits.strategies import MovingWindowRateLimiter

from app.core.deps import get_current_user
from app.models.user import User

# Google verifies the credential, not us, so there is nothing here to guess and
# no reason for a tight per-attempt limit. This exists to cap flooding, and is
# deliberately loose enough that a room full of people behind one campus NAT
# can all sign in at once.
LOGIN_LIMIT = parse("100/minute")

# The endpoints that create things. Registering a target or starting a scan is
# a deliberate human action, so this is far above real use and only bites a
# script. Keyed on the user id, not the address: these run after authentication,
# so one account cannot spend the budget of everyone else behind a shared NAT.
WRITE_LIMIT = parse("20/minute")

# Per-process, so each Cloud Run instance counts separately and the real
# ceiling is this times the instance count. Enough to damp abuse; it is not an
# exact quota and would need shared storage to become one.
_storage = MemoryStorage()
_limiter = MovingWindowRateLimiter(_storage)


def client_ip(request: Request) -> str:
    """The caller's address, taken from the *last* X-Forwarded-For entry.

    Cloud Run appends the real client address to whatever the caller sent, so
    only the right-hand entry is beyond the caller's control. `request.client`
    is unusable here: uvicorn runs with `--forwarded-allow-ips='*'` (Dockerfile)
    and rewrites it to the *first* entry, which any caller can set to anything,
    making a per-IP limit trivial to rotate past.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        candidate = forwarded.rsplit(",", 1)[-1].strip()
        if candidate:
            return candidate
    return request.client.host if request.client else "unknown"


def enforce_login_rate_limit(request: Request) -> None:
    if not _limiter.hit(LOGIN_LIMIT, "login", client_ip(request)):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many sign-in attempts. Please wait a minute and try again.",
            headers={"Retry-After": "60"},
        )


def enforce_write_rate_limit(user: User = Depends(get_current_user)) -> None:
    if not _limiter.hit(WRITE_LIMIT, "write", str(user.id)):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please wait a minute and try again.",
            headers={"Retry-After": "60"},
        )


def reset() -> None:
    """Drops all counters, so one test's flood cannot fail the next."""
    _storage.reset()
