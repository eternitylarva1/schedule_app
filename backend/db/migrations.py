"""
Schema migration system with version tracking.
Each migration is a function that runs only once.
"""
from typing import List, Tuple, Callable

CURRENT_SCHEMA_VERSION = 1


# =============================================================================
# Migration helper
# =============================================================================

async def _column_exists(db, table: str, column: str) -> bool:
    """Check if a column exists in a table using PRAGMA."""
    async with db.execute(f"PRAGMA table_info({table})") as cursor:
        rows = await cursor.fetchall()
    existing_cols = [row[1] for row in rows]  # row[1] is 'name' column in PRAGMA result
    return column in existing_cols


async def _add_column_if_not_exists(db, table: str, column: str, definition: str):
    """Add a column to a table if it doesn't exist."""
    if not await _column_exists(db, table, column):
        await db.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
        await db.commit()


# =============================================================================
# v1 Migrations: Add missing columns to existing tables
# =============================================================================

async def migration_add_reminder_columns(db, conn):
    """v1: Add reminder columns to events table."""
    await _add_column_if_not_exists(db, 'events', 'reminder_enabled', 'INTEGER DEFAULT 0')
    await _add_column_if_not_exists(db, 'events', 'reminder_minutes', 'INTEGER DEFAULT 1')
    await _add_column_if_not_exists(db, 'events', 'reminder_sent', 'INTEGER DEFAULT 0')
    await _add_column_if_not_exists(db, 'events', 'completed_at', 'TEXT')


async def migration_add_goal_columns(db, conn):
    """v1: Add is_test and color columns to goals table."""
    await _add_column_if_not_exists(db, 'goals', 'is_test', 'INTEGER DEFAULT 0')
    await _add_column_if_not_exists(db, 'goals', 'color', 'TEXT DEFAULT \'\'')


async def migration_add_event_goal_columns(db, conn):
    """v1: Add goal_id and is_test columns to events table."""
    await _add_column_if_not_exists(db, 'events', 'goal_id', 'INTEGER')
    await _add_column_if_not_exists(db, 'events', 'is_test', 'INTEGER DEFAULT 0')


async def migration_add_event_priority(db, conn):
    """v1: Add priority column to events table."""
    await _add_column_if_not_exists(db, 'events', 'priority', 'TEXT DEFAULT \'none\'')


async def migration_add_goal_hierarchy(db, conn):
    """v1: Add parent_id, root_goal_id, goal_order, ai_context columns to goals table."""
    await _add_column_if_not_exists(db, 'goals', 'parent_id', 'INTEGER')
    await _add_column_if_not_exists(db, 'goals', 'root_goal_id', 'INTEGER')
    await _add_column_if_not_exists(db, 'goals', 'goal_order', 'INTEGER DEFAULT 0')
    await _add_column_if_not_exists(db, 'goals', 'ai_context', 'TEXT DEFAULT \'\'')


async def migration_add_note_columns(db, conn):
    """v1: Add title, group_id, sort_order, is_pinned, color, is_archived columns to notes table."""
    # Note: title column is added as NOT NULL DEFAULT '' - need to handle carefully
    if not await _column_exists(db, 'notes', 'title'):
        await db.execute("ALTER TABLE notes ADD COLUMN title TEXT NOT NULL DEFAULT ''")
        await db.commit()
    await _add_column_if_not_exists(db, 'notes', 'group_id', 'INTEGER')
    await _add_column_if_not_exists(db, 'notes', 'sort_order', 'INTEGER NOT NULL DEFAULT 0')
    await _add_column_if_not_exists(db, 'notes', 'is_pinned', 'INTEGER DEFAULT 0')
    await _add_column_if_not_exists(db, 'notes', 'color', 'TEXT DEFAULT \'\'')
    await _add_column_if_not_exists(db, 'notes', 'is_archived', 'INTEGER DEFAULT 0')


async def migration_add_expense_date(db, conn):
    """v1: Add expense_date column to expenses table."""
    await _add_column_if_not_exists(db, 'expenses', 'expense_date', 'TEXT DEFAULT \'\'')


async def migration_add_expense_budget_id(db, conn):
    """v1: Add budget_id column to expenses table."""
    await _add_column_if_not_exists(db, 'expenses', 'budget_id', 'INTEGER')


async def migration_add_note_group_id_2(db, conn):
    """v1: Add group_id column to notes table (second occurrence - consolidated)."""
    # This is a duplicate of part of migration_add_note_columns, consolidated
    await _add_column_if_not_exists(db, 'notes', 'group_id', 'INTEGER')


async def migration_add_budget_period(db, conn):
    """v1: Add period, auto_reset, rollover, rollover_limit, rollover_amount, period_start columns to budgets table."""
    await _add_column_if_not_exists(db, 'budgets', 'period', 'TEXT DEFAULT \'none\'')
    await _add_column_if_not_exists(db, 'budgets', 'auto_reset', 'INTEGER DEFAULT 0')
    await _add_column_if_not_exists(db, 'budgets', 'rollover', 'INTEGER DEFAULT 0')
    await _add_column_if_not_exists(db, 'budgets', 'rollover_limit', 'INTEGER')
    await _add_column_if_not_exists(db, 'budgets', 'rollover_amount', 'REAL DEFAULT 0')
    await _add_column_if_not_exists(db, 'budgets', 'period_start', 'TEXT')


async def migration_add_is_test(db, conn):
    """v1: Add is_test column to budgets and expenses tables."""
    await _add_column_if_not_exists(db, 'budgets', 'is_test', 'INTEGER DEFAULT 0')
    await _add_column_if_not_exists(db, 'expenses', 'is_test', 'INTEGER DEFAULT 0')


async def migration_add_expense_recurring(db, conn):
    """v1: Add is_recurring and recurrence_period columns to expenses table."""
    await _add_column_if_not_exists(db, 'expenses', 'is_recurring', 'INTEGER DEFAULT 0')
    await _add_column_if_not_exists(db, 'expenses', 'recurrence_period', 'TEXT DEFAULT \'monthly\'')


# =============================================================================
# Migration registry
# =============================================================================

MIGRATIONS: List[Tuple[int, str, Callable]] = [
    # v1 migrations - add missing columns to existing tables
    (1, "Add reminder columns to events", migration_add_reminder_columns),
    (1, "Add is_test and color to goals", migration_add_goal_columns),
    (1, "Add goal_id and is_test to events", migration_add_event_goal_columns),
    (1, "Add priority to events", migration_add_event_priority),
    (1, "Add parent_id, root_goal_id, goal_order, ai_context to goals", migration_add_goal_hierarchy),
    (1, "Add title, group_id, sort_order, is_pinned, color, is_archived to notes", migration_add_note_columns),
    (1, "Add expense_date to expenses", migration_add_expense_date),
    (1, "Add budget_id to expenses", migration_add_expense_budget_id),
    (1, "Add group_id to notes (second occurrence - consolidated)", migration_add_note_group_id_2),
    (1, "Add period, auto_reset, rollover, rollover_limit, rollover_amount, period_start to budgets", migration_add_budget_period),
    (1, "Add is_test to budgets and expenses", migration_add_is_test),
    (1, "Add is_recurring and recurrence_period to expenses", migration_add_expense_recurring),
]


# =============================================================================
# Schema version management
# =============================================================================

def get_schema_version(db) -> int:
    """Get current schema version from DB, returns 0 if not set."""
    import asyncio
    async def _get():
        try:
            async with db.execute("SELECT value FROM settings WHERE key = 'schema_version'") as cursor:
                row = await cursor.fetchone()
            return int(row['value']) if row else 0
        except:
            return 0
    loop = asyncio.get_event_loop()
    return loop.run_until_complete(_get())


def set_schema_version(db, version: int):
    """Set schema version in DB."""
    import asyncio
    async def _set():
        await db.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('schema_version', ?)",
            (str(version),)
        )
        await db.commit()
    loop = asyncio.get_event_loop()
    loop.run_until_complete(_set())


async def run_migrations(db, conn):
    """
    Run all migrations not yet applied.
    Each migration: (version, description, function)
    """
    # Ensure settings table exists (needed for schema_version)
    await db.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    """)
    await db.commit()

    async with db.execute("SELECT value FROM settings WHERE key = 'schema_version'") as cursor:
        current_version_row = await cursor.fetchone()
    current_version = int(current_version_row['value']) if current_version_row else 0

    for version, desc, migrate_fn in MIGRATIONS:
        if version > current_version:
            print(f"Running migration v{version}: {desc}")
            await migrate_fn(db, conn)
            await db.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES ('schema_version', ?)",
                (str(version),)
            )
            await db.commit()
            print(f"Migration v{version} complete")
