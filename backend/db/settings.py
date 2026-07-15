"""Settings database operations."""
import aiosqlite
from datetime import datetime
from typing import List, Optional

from ._connection import DB_PATH

async def get_setting(key: str) -> Optional[str]:
    """Get a setting value by key."""
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute("SELECT value FROM settings WHERE key = ?", (key,)) as cursor:
            row = await cursor.fetchone()
            return row[0] if row else None


async def set_setting(key: str, value: str) -> None:
    """Set a setting value."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
            (key, value),
        )
        await db.commit()


async def get_ai_providers() -> list[dict]:
    """Get all AI providers."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM ai_providers ORDER BY is_active DESC, id ASC") as cursor:
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]


async def get_active_ai_provider() -> Optional[dict]:
    """Get the currently active AI provider."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM ai_providers WHERE is_active = 1 LIMIT 1") as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None


async def get_ai_provider(provider_id: int) -> Optional[dict]:
    """Get an AI provider by id."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM ai_providers WHERE id = ?", (provider_id,)) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None


async def create_ai_provider(name: str, api_base: str, model: str, api_key: str) -> dict:
    """Create a new AI provider."""
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            """INSERT INTO ai_providers (name, api_base, model, api_key, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (name, api_base, model, api_key, now, now),
        )
        await db.commit()
        provider_id = cursor.lastrowid
        return {
            "id": provider_id,
            "name": name,
            "api_base": api_base,
            "model": model,
            "api_key": api_key,
            "is_active": 0,
            "created_at": now,
            "updated_at": now,
        }


async def update_ai_provider(
    provider_id: int,
    name: str,
    api_base: str,
    model: str,
    api_key: Optional[str] = None,
) -> Optional[dict]:
    """Update an AI provider."""
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        if api_key is None:
            await db.execute(
                """UPDATE ai_providers SET name = ?, api_base = ?, model = ?, updated_at = ?
                   WHERE id = ?""",
                (name, api_base, model, now, provider_id),
            )
        else:
            await db.execute(
                """UPDATE ai_providers SET name = ?, api_base = ?, model = ?, api_key = ?, updated_at = ?
                   WHERE id = ?""",
                (name, api_base, model, api_key, now, provider_id),
            )
        await db.commit()
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM ai_providers WHERE id = ?", (provider_id,)) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None


async def delete_ai_provider(provider_id: int) -> bool:
    """Delete an AI provider."""
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("DELETE FROM ai_providers WHERE id = ?", (provider_id,))
        await db.commit()
        return cursor.rowcount > 0


async def activate_ai_provider(provider_id: int) -> bool:
    """Set an AI provider as active (deactivate all others)."""
    async with aiosqlite.connect(DB_PATH) as db:
        # Deactivate all
        await db.execute("UPDATE ai_providers SET is_active = 0")
        # Activate the selected one
        await db.execute("UPDATE ai_providers SET is_active = 1 WHERE id = ?", (provider_id,))
        await db.commit()
        return True


async def get_user_contexts() -> list[dict]:
    """Get all user contexts ordered by sort_order."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM user_contexts ORDER BY sort_order ASC, id ASC") as cursor:
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]


async def create_user_context(content: str) -> dict:
    """Create a new user context."""
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            """INSERT INTO user_contexts (content, sort_order, created_at, updated_at)
               VALUES (?, ?, ?, ?)""",
            (content, 0, now, now),
        )
        await db.commit()
        context_id = cursor.lastrowid
        return {
            "id": context_id,
            "content": content,
            "sort_order": 0,
            "created_at": now,
            "updated_at": now,
        }


async def update_user_context(context_id: int, content: str) -> Optional[dict]:
    """Update a user context."""
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """UPDATE user_contexts SET content = ?, updated_at = ? WHERE id = ?""",
            (content, now, context_id),
        )
        await db.commit()
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM user_contexts WHERE id = ?", (context_id,)) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None


async def delete_user_context(context_id: int) -> bool:
    """Delete a user context."""
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("DELETE FROM user_contexts WHERE id = ?", (context_id,))
        await db.commit()
        return cursor.rowcount > 0


async def reorder_user_contexts(context_ids: list[int]) -> bool:
    """Reorder user contexts by updating sort_order based on position in list."""
    async with aiosqlite.connect(DB_PATH) as db:
        for idx, ctx_id in enumerate(context_ids):
            await db.execute("UPDATE user_contexts SET sort_order = ? WHERE id = ?", (idx, ctx_id))
        await db.commit()
        return True

