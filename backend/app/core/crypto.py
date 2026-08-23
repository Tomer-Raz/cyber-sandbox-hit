"""Signing for exported reports.

A signature is only worth anything if the key outlives the request. This used to
build a `ReportSigner()` per export with no key material, which generated a
throwaway RSA keypair and returned both the signature and its public key in the
same response — so anyone who edited a report could mint a fresh pair, re-sign,
and swap both headers. That is not weak tamper detection, it is none.

The key now comes from config (Secret Manager, like DB_PASSWORD) and is loaded
once. When it is not configured the export carries no signature headers, rather
than one that certifies itself.
"""

import base64
from functools import lru_cache

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa

from app.core.config import get_settings

_PSS = padding.PSS(mgf=padding.MGF1(hashes.SHA256()), salt_length=padding.PSS.MAX_LENGTH)


class ReportSigner:
    """RSA-PSS-SHA256 over the exact bytes returned to the caller."""

    def __init__(self, private_key_pem: bytes):
        key = serialization.load_pem_private_key(private_key_pem, password=None)
        if not isinstance(key, rsa.RSAPrivateKey):
            raise ValueError("Report signing key must be an RSA private key")
        self.private_key = key
        self.public_key = key.public_key()

    def sign_report(self, report_bytes: bytes) -> str:
        return base64.b64encode(
            self.private_key.sign(report_bytes, _PSS, hashes.SHA256())
        ).decode("utf-8")

    def verify_report_signature(self, report_bytes: bytes, signature_b64: str) -> bool:
        try:
            self.public_key.verify(
                base64.b64decode(signature_b64), report_bytes, _PSS, hashes.SHA256()
            )
            return True
        except Exception:
            return False

    def export_public_key_pem(self) -> str:
        return self.public_key.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        ).decode("utf-8")


@lru_cache
def get_report_signer() -> ReportSigner | None:
    """The signer for this process, or None when no key is configured.

    Cached: loading the key per request also meant generating one per request,
    which cost ~50ms of RSA keygen on every export.
    """
    pem = get_settings().report_signing_key.strip()
    if not pem:
        return None
    return ReportSigner(pem.encode("utf-8"))
