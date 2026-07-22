import pytest
from google.auth.exceptions import GoogleAuthError

from app.core import security


def test_verify_google_id_token_success(monkeypatch):
    fake_claims = {
        "sub": "1234567890",
        "email": "student@hit.ac.il",
        "name": "Jane Student",
        "iss": "https://accounts.google.com",
        "aud": "test-client-id.apps.googleusercontent.com",
        "exp": 9999999999,
    }
    monkeypatch.setattr(security.id_token, "verify_oauth2_token", lambda *a, **k: fake_claims)

    claims = security.verify_google_id_token("some-jwt")

    assert claims == fake_claims


def test_verify_google_id_token_rejects_bad_signature(monkeypatch):
    def raise_invalid(*a, **k):
        raise ValueError("Token verification failed")

    monkeypatch.setattr(security.id_token, "verify_oauth2_token", raise_invalid)

    with pytest.raises(security.InvalidCredential):
        security.verify_google_id_token("garbage")


def test_verify_google_id_token_rejects_google_auth_error(monkeypatch):
    def raise_auth_error(*a, **k):
        raise GoogleAuthError("expired")

    monkeypatch.setattr(security.id_token, "verify_oauth2_token", raise_auth_error)

    with pytest.raises(security.InvalidCredential):
        security.verify_google_id_token("expired-token")


def test_verify_google_id_token_rejects_wrong_issuer(monkeypatch):
    # Signature/audience checked out, but the issuer isn't Google — this is
    # what stops a token minted for a different identity provider entirely.
    fake_claims = {
        "sub": "1234567890",
        "email": "attacker@evil.example",
        "iss": "https://evil.example",
        "aud": "test-client-id.apps.googleusercontent.com",
    }
    monkeypatch.setattr(security.id_token, "verify_oauth2_token", lambda *a, **k: fake_claims)

    with pytest.raises(security.InvalidCredential):
        security.verify_google_id_token("some-jwt")
