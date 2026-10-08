"""Password hashing, JWT issuance/verification, and credential encryption."""

import base64
import hashlib
import uuid
from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, VerifyMismatchError
from cryptography.fernet import Fernet

from contentcal.config import get_settings

_settings = get_settings()
_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError):
        return False


def create_access_token(user_id: uuid.UUID) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "type": "access",
        "iat": now,
        "exp": now + timedelta(minutes=_settings.access_token_ttl_minutes),
    }
    return jwt.encode(payload, _settings.jwt_secret_key, algorithm=_settings.jwt_algorithm)


def create_refresh_token(user_id: uuid.UUID) -> tuple[str, datetime]:
    now = datetime.now(UTC)
    exp = now + timedelta(days=_settings.refresh_token_ttl_days)
    payload = {"sub": str(user_id), "type": "refresh", "iat": now, "exp": exp, "jti": str(uuid.uuid4())}
    return jwt.encode(payload, _settings.jwt_secret_key, algorithm=_settings.jwt_algorithm), exp


def decode_token(token: str, expected_type: str = "access") -> uuid.UUID:
    payload = jwt.decode(token, _settings.jwt_secret_key, algorithms=[_settings.jwt_algorithm])
    if payload.get("type") != expected_type:
        raise jwt.InvalidTokenError("wrong token type")
    return uuid.UUID(payload["sub"])


def _fernet() -> Fernet:
    key = _settings.token_encryption_key
    # Accept 64-hex-char keys locally and any non-empty string from hosted
    # secret generators (e.g. Render's generateValue).
    try:
        material = bytes.fromhex(key)
    except ValueError:
        material = key.encode()
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(material).digest()))


def encrypt_secret(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt_secret(ciphertext: str) -> str:
    return _fernet().decrypt(ciphertext.encode()).decode()
