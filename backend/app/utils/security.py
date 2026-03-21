"""
Security utilities for Alfred
"""
import secrets
import hashlib
from typing import str


def generate_secure_token(length: int = 32) -> str:
    """
    Generate a secure random token
    """
    return secrets.token_urlsafe(length)


def hash_password(password: str) -> str:
    """
    Hash a password using SHA-256 with salt
    Note: In production, use bcrypt or argon2
    """
    salt = secrets.token_hex(16)
    pwd_hash = hashlib.sha256((password + salt).encode()).hexdigest()
    return f"{salt}${pwd_hash}"


def verify_password(password: str, hashed: str) -> bool:
    """
    Verify a password against its hash
    """
    try:
        salt, pwd_hash = hashed.split('$')
        return hashlib.sha256((password + salt).encode()).hexdigest() == pwd_hash
    except (ValueError, AttributeError):
        return False