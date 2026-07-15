"""Error logs database operations."""
import aiosqlite
from datetime import datetime
from typing import List

from ..models import ErrorLog
from ._connection import DB_PATH

async def create_error_log(error_log: ErrorLog) -> ErrorLog:
    """Create a new error log entry."""
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            """INSERT INTO error_logs (message, stack, source, user_agent, url, timestamp)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (error_log.message, error_log.stack, error_log.source,
             error_log.user_agent, error_log.url, now),
        )
        await db.commit()
        error_log.id = cursor.lastrowid
        error_log.timestamp = datetime.now()
    return error_log


async def get_error_logs(limit: int = 50, offset: int = 0) -> List[ErrorLog]:
    """Get recent error logs, newest first."""
    async with aiosqlite.connect(DB_PATH) as db:
        rows = await db.execute_fetchall(
            """SELECT id, message, stack, source, user_agent, url, timestamp
               FROM error_logs ORDER BY timestamp DESC LIMIT ? OFFSET ?""",
            (limit, offset),
        )
    return [ErrorLog(
        id=row[0], message=row[1], stack=row[2] or "", source=row[3] or "",
        user_agent=row[4] or "", url=row[5] or "",
        timestamp=datetime.fromisoformat(row[6]) if row[6] else None
    ) for row in rows]


async def delete_error_logs(ids: List[int]) -> int:
    """Delete error logs by IDs. Returns count of deleted."""
    if not ids:
        return 0
    placeholders = ",".join(["?" for _ in ids])
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            f"DELETE FROM error_logs WHERE id IN ({placeholders})", ids
        )
        await db.commit()
        return cursor.rowcount


# ============ Budget CRUD ============
