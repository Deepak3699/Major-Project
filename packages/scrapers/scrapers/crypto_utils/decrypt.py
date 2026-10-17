"""
Decrypt API keys stored in the database as AES-256-GCM encrypted strings.

This mirrors the encrypt/decrypt logic in packages/api/src/utils/crypto.ts
so Python workers can read API keys that were encrypted by the Fastify API layer.

Node.js encryption format:
  key = crypto.scryptSync(ENCRYPTION_SECRET, 'salt', 32)
  cipher = crypto.createCipheriv('aes-256-gcm', key, iv)  // iv = 12 random bytes
  output = base64( iv(12) + tag(16) + ciphertext )

Node's scryptSync uses OpenSSL defaults: N=16384, r=8, p=1
"""
import base64
import hashlib
import logging
import os

logger = logging.getLogger(__name__)

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    _AESGCM_AVAILABLE = True
except ImportError:
    _AESGCM_AVAILABLE = False
    logger.warning("cryptography package not available; API key decryption will fail")


_SALT = b"salt"
_KEY_LENGTH = 32
_N = 16384
_R = 8
_P = 1


def _derive_key() -> bytes:
    """Derive the AES-256 key from ENCRYPTION_SECRET env var, matching Node.js scryptSync."""
    secret = os.environ.get(
        "ENCRYPTION_SECRET", "hiregun-encryption-key-change-me-in-production"
    ).encode("utf-8")
    return hashlib.scrypt(
        secret, salt=_SALT, n=_N, r=_R, p=_P, maxmem=0, dklen=_KEY_LENGTH
    )


def decrypt_text(encrypted: str) -> str:
    """Decrypt an AES-256-GCM encrypted string (base64 of IV+tag+ciphertext)."""
    if not _AESGCM_AVAILABLE:
        raise RuntimeError("cryptography package is required for decryption")
    key = _derive_key()
    data = base64.b64decode(encrypted)
    iv = data[:12]
    tag = data[12:28]
    ciphertext = data[28:]
    aesgcm = AESGCM(key)
    plaintext = aesgcm.decrypt(iv, tag + ciphertext, None)
    return plaintext.decode("utf-8")


def decrypt_api_key(encrypted: str) -> str:
    """Decrypt a single API key."""
    return decrypt_text(encrypted)
