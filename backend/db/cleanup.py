"""Cleanup database operations."""
import aiosqlite
from ._connection import DB_PATH

async def cleanup_test_entries() -> dict[str, int]:
    """Delete test/demo/debug entries across events, notes, expenses, budgets and goals.

    Cleans by:
    1. Keyword matching (测试/test/debug/demo/etc) in title/content
    2. is_test flag for events, expenses, budgets and goals
    """
    patterns = [
        "%测试%", "%test%", "%debug%", "%demo%", "%样例%", "%示例%", "%tmp%", "%临时%"
    ]

    async with aiosqlite.connect(DB_PATH) as db:
        # Events by title OR is_test flag
        event_keyword_where = " OR ".join(["LOWER(title) LIKE LOWER(?)" for _ in patterns])
        event_result = await db.execute(
            f"DELETE FROM events WHERE ({event_keyword_where}) OR is_test = 1",
            patterns,
        )

        # Notes by title/content
        note_title_where = " OR ".join(["LOWER(title) LIKE LOWER(?)" for _ in patterns])
        note_content_where = " OR ".join(["LOWER(content) LIKE LOWER(?)" for _ in patterns])
        note_result = await db.execute(
            f"DELETE FROM notes WHERE ({note_title_where}) OR ({note_content_where})",
            patterns + patterns,
        )

        # Expenses by note OR is_test flag
        expense_keyword_where = " OR ".join(["LOWER(note) LIKE LOWER(?)" for _ in patterns])
        expense_result = await db.execute(
            f"DELETE FROM expenses WHERE ({expense_keyword_where}) OR is_test = 1",
            patterns,
        )

        # Budgets by is_test flag
        budget_result = await db.execute(
            "DELETE FROM budgets WHERE is_test = 1",
        )

        # Goals by title OR is_test flag
        goal_keyword_where = " OR ".join(["LOWER(title) LIKE LOWER(?)" for _ in patterns])
        goal_result = await db.execute(
            f"DELETE FROM goals WHERE ({goal_keyword_where}) OR is_test = 1",
            patterns,
        )

        await db.commit()

    return {
        "events_deleted": event_result.rowcount or 0,
        "notes_deleted": note_result.rowcount or 0,
        "expenses_deleted": expense_result.rowcount or 0,
        "budgets_deleted": budget_result.rowcount or 0,
        "goals_deleted": goal_result.rowcount or 0,
    }


# ============ Error Log CRUD ============
