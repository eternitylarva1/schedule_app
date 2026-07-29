"""LLM input/output audit log CRUD."""
import aiosqlite
from ._connection import DB_PATH


async def log_llm_call(user_input: str, parsed_result: str = "", operation_count: int = 0, source: str = "") -> None:
    """Record an LLM call for auditing."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO llm_logs (user_input, parsed_result, operation_count, source) VALUES (?, ?, ?, ?)",
            (user_input or "", parsed_result or "", operation_count, source or ""),
        )
        await db.commit()


async def get_llm_logs(limit: int = 20) -> list:
    """Get recent LLM call logs."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM llm_logs ORDER BY id DESC LIMIT ?",
            (limit,),
        ) as cursor:
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]
