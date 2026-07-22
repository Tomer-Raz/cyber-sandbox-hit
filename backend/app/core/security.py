from google.auth.exceptions import GoogleAuthError
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from app.core.config import settings

_ALLOWED_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}
_google_request = google_requests.Request()


class InvalidCredential(Exception):
    """Raised for any ID token that fails verification, for any reason."""


def verify_google_id_token(token: str) -> dict:
    """Verifies signature, expiry and audience against our OAuth client ID.

    Deliberately does NOT call the `userinfo` endpoint — that accepts an access
    token minted for *any* Google OAuth client, so an unrelated app's token
    would authenticate as our user. The audience check here is the whole
    defence, and only ID tokens carry an audience.
    """
    try:
        claims = id_token.verify_oauth2_token(
            token, _google_request, settings.google_oauth_client_id
        )
    except (GoogleAuthError, ValueError) as exc:
        raise InvalidCredential(str(exc)) from exc

    if claims.get("iss") not in _ALLOWED_ISSUERS:
        raise InvalidCredential(f"unexpected issuer: {claims.get('iss')!r}")

    return claims
