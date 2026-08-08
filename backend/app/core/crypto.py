import os
import base64
import json
import bcrypt
from typing import Tuple
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives import hashes, serialization


class SymmetricCrypto:
    """Symmetric Encryption using AES-256-GCM for sensitive Firestore data."""
    def __init__(self, key_b64: str = None):
        if key_b64:
            self.key = base64.b64decode(key_b64)
        else:
            self.key = AESGCM.generate_key(bit_length=256)

    def encrypt_data(self, plaintext_data: dict) -> dict:
        aesgcm = AESGCM(self.key)
        nonce = os.urandom(12)  # 96-bit nonce for GCM
        data_bytes = json.dumps(plaintext_data).encode("utf-8")
        ciphertext = aesgcm.encrypt(nonce, data_bytes, associated_data=None)
        
        return {
            "nonce": base64.b64encode(nonce).decode("utf-8"),
            "ciphertext": base64.b64encode(ciphertext).decode("utf-8")
        }

    def decrypt_data(self, encrypted_payload: dict) -> dict:
        aesgcm = AESGCM(self.key)
        nonce = base64.b64decode(encrypted_payload["nonce"])
        ciphertext = base64.b64decode(encrypted_payload["ciphertext"])
        
        decrypted_bytes = aesgcm.decrypt(nonce, ciphertext, associated_data=None)
        return json.loads(decrypted_bytes.decode("utf-8"))


class APIKeyManager:
    """Salt + Hash management for user API keys using native bcrypt."""
    @staticmethod
    def generate_api_key() -> Tuple[str, str]:
        raw_key = f"sbx_{base64.urlsafe_b64encode(os.urandom(32)).decode('utf-8').rstrip('=')}"
        salt = bcrypt.gensalt()
        hashed_bytes = bcrypt.hashpw(raw_key.encode("utf-8"), salt)
        return raw_key, hashed_bytes.decode("utf-8")

    @staticmethod
    def verify_api_key(raw_key: str, hashed_key_from_db: str) -> bool:
        try:
            return bcrypt.checkpw(
                raw_key.encode("utf-8"),
                hashed_key_from_db.encode("utf-8")
            )
        except Exception:
            return False


class ReportSigner:
    """Asymmetric Digital Signatures (RSA-SHA256) for PDF/JSON reports."""
    def __init__(self, private_key_pem: bytes = None):
        if private_key_pem:
            self.private_key = serialization.load_pem_private_key(
                private_key_pem, password=None
            )
        else:
            self.private_key = rsa.generate_private_key(
                public_exponent=65537,
                key_size=2048
            )
        self.public_key = self.private_key.public_key()

    def sign_report(self, report_bytes: bytes) -> str:
        signature = self.private_key.sign(
            report_bytes,
            padding.PSS(
                mgf=padding.MGF1(hashes.SHA256()),
                salt_length=padding.PSS.MAX_LENGTH
            ),
            hashes.SHA256()
        )
        return base64.b64encode(signature).decode("utf-8")

    def verify_report_signature(self, report_bytes: bytes, signature_b64: str) -> bool:
        try:
            signature = base64.b64decode(signature_b64)
            self.public_key.verify(
                signature,
                report_bytes,
                padding.PSS(
                    mgf=padding.MGF1(hashes.SHA256()),
                    salt_length=padding.PSS.MAX_LENGTH
                ),
                hashes.SHA256()
            )
            return True
        except Exception:
            return False

    def export_public_key_pem(self) -> str:
        """Exports public key in PEM format."""
        pem = self.public_key.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo
        )
        return pem.decode("utf-8")