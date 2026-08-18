"""Auth database operations."""
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta
from typing import Optional

import aiosqlite

from ._connection import DB_PATH


# Token validity period: 30 days
TOKEN_VALIDITY_SECONDS = 30 * 24 * 60 * 60  # 2592000


def hash_password(password: str, salt: str) -> str:
    """Hash password using PBKDF2-HMAC-SHA256 with given salt."""
    return hashlib.pbkdf2_hmac(
        'sha256',
        password.encode(),
        salt.encode(),
        100_000,
    ).hex()


def verify_password(password: str, stored: str) -> bool:
    """Verify password against stored 'salt:hash' format."""
    try:
        salt, stored_hash = stored.split(':')
        computed_hash = hash_password(password, salt)
        return hmac.compare_digest(computed_hash, stored_hash)
    except (ValueError, AttributeError):
        return False


def make_password_hash(password: str) -> str:
    """Create 'salt:hash' string for storing in DB."""
    salt = secrets.token_hex(16)
    pw_hash = hash_password(password, salt)
    return f"{salt}:{pw_hash}"


def hash_token(token: str) -> str:
    """Hash a token with sha256."""
    return hashlib.sha256(token.encode()).hexdigest()


def make_token() -> str:
    """Generate a new random token."""
    return secrets.token_urlsafe(32)


async def get_auth() -> Optional[dict]:
    """Get the auth record (there's only ever one)."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM auth LIMIT 1") as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None


async def create_auth(password: str) -> dict:
    """Create auth record with hashed password."""
    password_hash = make_password_hash(password)
    now = datetime.now().isoformat()
    # salt is stored inside password_hash as "salt:hash", put placeholder here
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "INSERT INTO auth (password_hash, salt, created_at) VALUES (?, ?, ?)",
            (password_hash, "-", now),
        )
        await db.commit()
        return {
            "id": cursor.lastrowid,
            "password_hash": password_hash,
            "created_at": now,
        }


async def update_auth_password(password: str) -> bool:
    """Update the auth password hash."""
    password_hash = make_password_hash(password)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE auth SET password_hash = ? WHERE id = (SELECT id FROM auth LIMIT 1)",
            (password_hash,),
        )
        await db.commit()
        return True


async def create_token(fingerprint: str) -> tuple[str, datetime]:
    """Create a new auth token, returning (token, expires_at)."""
    token = make_token()
    token_hash = hash_token(token)
    fingerprint_hash = hashlib.sha256(fingerprint.encode()).hexdigest()
    now = datetime.now()
    expires_at = now + timedelta(seconds=TOKEN_VALIDITY_SECONDS)

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO auth_tokens (token_hash, fingerprint_hash, created_at, expires_at)
               VALUES (?, ?, ?, ?)""",
            (token_hash, fingerprint_hash, now.isoformat(), expires_at.isoformat()),
        )
        await db.commit()

    return token, expires_at


async def verify_token(token: str, fingerprint: str) -> bool:
    """Verify a token and fingerprint match a valid session."""
    token_hash = hash_token(token)
    fingerprint_hash = hashlib.sha256(fingerprint.encode()).hexdigest()
    now = datetime.now().isoformat()

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """SELECT * FROM auth_tokens
               WHERE token_hash = ? AND fingerprint_hash = ? AND expires_at > ?""",
            (token_hash, fingerprint_hash, now),
        ) as cursor:
            row = await cursor.fetchone()
            return row is not None


async def delete_token(token: str) -> bool:
    """Delete a specific token."""
    token_hash = hash_token(token)
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "DELETE FROM auth_tokens WHERE token_hash = ?",
            (token_hash,),
        )
        await db.commit()
        return cursor.rowcount > 0


async def delete_all_tokens_except(token: str) -> int:
    """Delete all tokens except the specified one. Returns count of deleted."""
    token_hash = hash_token(token)
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "DELETE FROM auth_tokens WHERE token_hash != ?",
            (token_hash,),
        )
        await db.commit()
        return cursor.rowcount


async def delete_expired_tokens() -> int:
    """Delete all expired tokens. Returns count of deleted."""
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "DELETE FROM auth_tokens WHERE expires_at <= ?",
            (now,),
        )
        await db.commit()
        return cursor.rowcount
