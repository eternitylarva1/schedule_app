"""SQLite database operations."""
import aiosqlite
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import Any, List, Optional

from .models import Event, Goal, GoalConversation, Note, Expense, NoteGroup, NoteConversation

DB_PATH = Path(__file__).parent / "schedule.db"


async def init_db() -> None:
    """Initialize database and create tables."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                start_time TEXT,
                end_time TEXT,
                category_id TEXT DEFAULT 'work',
                all_day INTEGER DEFAULT 0,
                recurrence TEXT DEFAULT 'none',
                status TEXT DEFAULT 'pending',
                created_at TEXT,
                updated_at TEXT
            )
        """)
        
        # Add new columns to existing tables (SQLite doesn't support IF NOT EXISTS for ADD COLUMN)
        try:
            await db.execute("ALTER TABLE events ADD COLUMN reminder_enabled INTEGER DEFAULT 0")
        except Exception:
            pass  # Column already exists
        try:
            await db.execute("ALTER TABLE events ADD COLUMN reminder_minutes INTEGER DEFAULT 1")
        except Exception:
            pass
        try:
            await db.execute("ALTER TABLE events ADD COLUMN reminder_sent INTEGER DEFAULT 0")
        except Exception:
            pass
        
        # Create settings table
        await db.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        """)

        # Goals table for multi-horizon planning with hierarchical subtasks
        await db.execute("""
            CREATE TABLE IF NOT EXISTS goals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT DEFAULT '',
                horizon TEXT DEFAULT 'short',
                status TEXT DEFAULT 'active',
                start_date TEXT,
                end_date TEXT,
                start_time TEXT,
                end_time TEXT,
                parent_id INTEGER,
                root_goal_id INTEGER,
                goal_order INTEGER DEFAULT 0,
                ai_context TEXT DEFAULT '',
                created_at TEXT,
                updated_at TEXT,
                FOREIGN KEY (parent_id) REFERENCES goals(id) ON DELETE CASCADE,
                FOREIGN KEY (root_goal_id) REFERENCES goals(id) ON DELETE SET NULL
            )
        """)

        # Goal conversations table for storing AI dialogue history
        await db.execute("""
            CREATE TABLE IF NOT EXISTS goal_conversations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                goal_id INTEGER NOT NULL,
                role TEXT DEFAULT 'user',
                content TEXT DEFAULT '',
                created_at TEXT,
                FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE
            )
        """)

        # Link events to goals (optional)
        try:
            await db.execute("ALTER TABLE events ADD COLUMN goal_id INTEGER")
        except Exception:
            pass
        
        # Migrate goals table - add new columns if they don't exist
        try:
            await db.execute("ALTER TABLE goals ADD COLUMN parent_id INTEGER")
        except Exception:
            pass
        try:
            await db.execute("ALTER TABLE goals ADD COLUMN root_goal_id INTEGER")
        except Exception:
            pass
        try:
            await db.execute("ALTER TABLE goals ADD COLUMN goal_order INTEGER DEFAULT 0")
        except Exception:
            pass
        try:
            await db.execute("ALTER TABLE goals ADD COLUMN ai_context TEXT DEFAULT ''")
        except Exception:
            pass
        try:
            await db.execute("ALTER TABLE goals ADD COLUMN start_time TEXT")
        except Exception:
            pass
        try:
            await db.execute("ALTER TABLE goals ADD COLUMN end_time TEXT")
        except Exception:
            pass
        
        # Insert default settings
        await db.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('qq_reminder_enabled', 'true')")
        await db.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('default_task_reminder_enabled', 'true')")
        
        # Notes table for memo/notepad functionality
        await db.execute("""
            CREATE TABLE IF NOT EXISTS notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL DEFAULT '',
                content TEXT NOT NULL DEFAULT '',
                created_at TEXT,
                updated_at TEXT
            )
        """)

        try:
            await db.execute("ALTER TABLE notes ADD COLUMN title TEXT NOT NULL DEFAULT ''")
        except Exception:
            pass
        
        try:
            await db.execute("ALTER TABLE notes ADD COLUMN group_id INTEGER")
        except Exception:
            pass
        
        try:
            await db.execute("ALTER TABLE notes ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0")
        except Exception:
            pass
        
        # Expenses table for expense tracking
        await db.execute("""
            CREATE TABLE IF NOT EXISTS expenses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                amount REAL NOT NULL DEFAULT 0,
                category TEXT DEFAULT 'other',
                note TEXT DEFAULT '',
                created_at TEXT
            )
        """)

        # Note groups table for custom note groupings
        await db.execute("""
            CREATE TABLE IF NOT EXISTS note_groups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                sort_order INTEGER DEFAULT 0,
                created_at TEXT
            )
        """)

        # Note conversations table for AI chat history
        await db.execute("""
            CREATE TABLE IF NOT EXISTS note_conversations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                note_id INTEGER NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                selected_text TEXT DEFAULT '',
                created_at TEXT,
                FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
            )
        """)

        # Add group_id column to notes table
        try:
            await db.execute("ALTER TABLE notes ADD COLUMN group_id INTEGER")
        except Exception:
            pass
        
        # Trash/soft-delete: add is_deleted and deleted_at columns to all deletable tables
        for table in ["events", "goals", "notes", "expenses"]:
            try:
                await db.execute(f"ALTER TABLE {table} ADD COLUMN is_deleted INTEGER DEFAULT 0")
            except Exception:
                pass
            try:
                await db.execute(f"ALTER TABLE {table} ADD COLUMN deleted_at TEXT")
            except Exception:
                pass
        
        # AI Settings table for model configuration
        await db.execute("""
            CREATE TABLE IF NOT EXISTS ai_settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                provider TEXT NOT NULL DEFAULT 'openai',
                api_key TEXT NOT NULL DEFAULT '',
                base_url TEXT NOT NULL DEFAULT '',
                model TEXT NOT NULL DEFAULT '',
                created_at TEXT,
                updated_at TEXT
            )
        """)
        
        # Insert default AI settings if not exists
        try:
            await db.execute("INSERT INTO ai_settings (id, provider, api_key, base_url, model, created_at, updated_at) VALUES (1, 'openai', '', '', '', NULL, NULL)")
        except Exception:
            pass
        
        await db.commit()


async def create_event(event: Event) -> Event:
    """Create a new event."""
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            """INSERT INTO events 
               (title, start_time, end_time, category_id, all_day, recurrence, status, created_at, updated_at, reminder_enabled, reminder_minutes, reminder_sent)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                event.title,
                event.start_time.isoformat() if event.start_time else None,
                event.end_time.isoformat() if event.end_time else None,
                event.category_id,
                1 if event.all_day else 0,
                event.recurrence,
                event.status,
                now,
                now,
                1 if event.reminder_enabled else 0,
                event.reminder_minutes,
                1 if event.reminder_sent else 0,
            ),
        )
        await db.commit()
        event.id = cursor.lastrowid
        event.created_at = datetime.now()
        event.updated_at = datetime.now()
    return event


async def get_events(date_filter: str = "today") -> List[Event]:
    """Get events filtered by date (today/week/month/YYYY-MM-DD)."""
    from datetime import timedelta
    import re

    now = datetime.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # Check if date_filter is a specific date (YYYY-MM-DD format) or month (YYYY-MM format)
    if re.match(r'^\d{4}-\d{2}-\d{2}$', date_filter):
        try:
            target_date = datetime.strptime(date_filter, '%Y-%m-%d')
            start = target_date.replace(hour=0, minute=0, second=0, microsecond=0)
            end = start + timedelta(days=1)
        except ValueError:
            # Invalid date format, fallback to today
            start = today_start
            end = today_start + timedelta(days=1)
    elif re.match(r'^\d{4}-\d{2}$', date_filter):
        # YYYY-MM format - get events for the entire month
        try:
            year = int(date_filter[:4])
            month = int(date_filter[5:7])
            start = datetime(year, month, 1, 0, 0, 0, 0)
            if month == 12:
                end = datetime(year + 1, 1, 1, 0, 0, 0, 0)
            else:
                end = datetime(year, month + 1, 1, 0, 0, 0, 0)
        except ValueError:
            # Invalid month format, fallback to current month
            start = today_start.replace(day=1)
            if start.month == 12:
                end = start.replace(year=start.year + 1, month=1)
            else:
                end = start.replace(month=start.month + 1)
    elif date_filter == "today":
        start = today_start
        end = today_start + timedelta(days=1)
    elif date_filter == "week":
        # Start from Monday
        start = today_start - timedelta(days=now.weekday())
        end = start + timedelta(days=7)
    elif date_filter == "month":
        start = today_start.replace(day=1)
        if start.month == 12:
            end = start.replace(year=start.year + 1, month=1)
        else:
            end = start.replace(month=start.month + 1)
    else:
        start = today_start
        end = today_start + timedelta(days=1)

    # Include no-time items in month-style queries (used by todo list)
    include_no_time = (date_filter == "month") or bool(re.match(r'^\d{4}-\d{2}$', date_filter))

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        if include_no_time:
            query = """SELECT * FROM events
                       WHERE is_deleted = 0 AND ((start_time >= ? AND start_time < ?) OR start_time IS NULL)
                       ORDER BY CASE WHEN start_time IS NULL THEN 1 ELSE 0 END, start_time"""
        else:
            query = """SELECT * FROM events
                       WHERE is_deleted = 0 AND start_time >= ? AND start_time < ?
                       ORDER BY start_time"""

        async with db.execute(
            query,
            (start.isoformat(), end.isoformat()),
        ) as cursor:
            rows = await cursor.fetchall()
            events = []
            for row in rows:
                events.append(Event(
                    id=row["id"],
                    title=row["title"],
                    start_time=datetime.fromisoformat(row["start_time"]) if row["start_time"] else None,
                    end_time=datetime.fromisoformat(row["end_time"]) if row["end_time"] else None,
                    category_id=row["category_id"],
                    all_day=bool(row["all_day"]),
                    recurrence=row["recurrence"],
                    status=row["status"],
                    created_at=datetime.fromisoformat(row["created_at"]) if row["created_at"] else None,
                    updated_at=datetime.fromisoformat(row["updated_at"]) if row["updated_at"] else None,
                    reminder_enabled=bool(row["reminder_enabled"]) if "reminder_enabled" in list(row.keys()) and row["reminder_enabled"] is not None else False,
                    reminder_minutes=int(row["reminder_minutes"]) if "reminder_minutes" in list(row.keys()) and row["reminder_minutes"] is not None else 1,
                    reminder_sent=bool(row["reminder_sent"]) if "reminder_sent" in list(row.keys()) and row["reminder_sent"] is not None else False,
                ))
    return events


async def get_event(event_id: int) -> Optional[Event]:
    """Get a single event by ID (excludes soft-deleted)."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM events WHERE id = ? AND is_deleted = 0", (event_id,)) as cursor:
            row = await cursor.fetchone()
            if not row:
                return None
            return Event(
                id=row["id"],
                title=row["title"],
                start_time=datetime.fromisoformat(row["start_time"]) if row["start_time"] else None,
                end_time=datetime.fromisoformat(row["end_time"]) if row["end_time"] else None,
                category_id=row["category_id"],
                all_day=bool(row["all_day"]),
                recurrence=row["recurrence"],
                status=row["status"],
                created_at=datetime.fromisoformat(row["created_at"]) if row["created_at"] else None,
                updated_at=datetime.fromisoformat(row["updated_at"]) if row["updated_at"] else None,
                reminder_enabled=bool(row["reminder_enabled"]) if "reminder_enabled" in list(row.keys()) and row["reminder_enabled"] is not None else False,
                reminder_minutes=int(row["reminder_minutes"]) if "reminder_minutes" in list(row.keys()) and row["reminder_minutes"] is not None else 1,
                reminder_sent=bool(row["reminder_sent"]) if "reminder_sent" in list(row.keys()) and row["reminder_sent"] is not None else False,
            )


async def update_event(event_id: int, event: Event) -> Optional[Event]:
    """Update an existing event."""
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """UPDATE events SET 
               title = ?, start_time = ?, end_time = ?, category_id = ?, 
               all_day = ?, recurrence = ?, status = ?, updated_at = ?,
               reminder_enabled = ?, reminder_minutes = ?, reminder_sent = ?
               WHERE id = ?""",
            (
                event.title,
                event.start_time.isoformat() if event.start_time else None,
                event.end_time.isoformat() if event.end_time else None,
                event.category_id,
                1 if event.all_day else 0,
                event.recurrence,
                event.status,
                now,
                1 if event.reminder_enabled else 0,
                event.reminder_minutes,
                1 if event.reminder_sent else 0,
                event_id,
            ),
        )
        await db.commit()
    return await get_event(event_id)


async def delete_event(event_id: int) -> bool:
    """Soft-delete an event (move to trash)."""
    async with aiosqlite.connect(DB_PATH) as db:
        now = datetime.now().isoformat()
        cursor = await db.execute(
            "UPDATE events SET is_deleted = 1, deleted_at = ? WHERE id = ? AND is_deleted = 0",
            (now, event_id)
        )
        await db.commit()
        return cursor.rowcount > 0


async def permanently_delete_event(event_id: int) -> bool:
    """Permanently delete an event from trash."""
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("DELETE FROM events WHERE id = ? AND is_deleted = 1", (event_id,))
        await db.commit()
        return cursor.rowcount > 0


async def restore_event(event_id: int) -> bool:
    """Restore a soft-deleted event from trash."""
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "UPDATE events SET is_deleted = 0, deleted_at = NULL WHERE id = ? AND is_deleted = 1",
            (event_id,)
        )
        await db.commit()
        return cursor.rowcount > 0


async def complete_event(event_id: int) -> Optional[Event]:
    """Mark an event as completed."""
    event = await get_event(event_id)
    if not event:
        return None
    event.status = "done"
    return await update_event(event_id, event)


async def uncomplete_event(event_id: int) -> Optional[Event]:
    """Mark an event back to pending (undo completion)."""
    event = await get_event(event_id)
    if not event:
        return None
    event.status = "pending"
    return await update_event(event_id, event)


async def batch_complete_events(start: datetime | None = None, end: datetime | None = None) -> int:
    """Batch mark events as done. Returns affected row count."""
    async with aiosqlite.connect(DB_PATH) as db:
        if start and end:
            cursor = await db.execute(
                """UPDATE events
                   SET status = 'done', updated_at = ?
                   WHERE start_time >= ? AND start_time < ? AND status != 'done'""",
                (datetime.now().isoformat(), start.isoformat(), end.isoformat()),
            )
        else:
            cursor = await db.execute(
                """UPDATE events
                   SET status = 'done', updated_at = ?
                   WHERE status != 'done'""",
                (datetime.now().isoformat(),),
            )
        await db.commit()
        return cursor.rowcount or 0


async def find_duplicate_event(title: str, start_time: datetime | None, end_time: datetime | None, status: str = "pending") -> Optional[Event]:
    """Find an exact duplicate event by title/start/end/status."""
    if not title or not start_time:
        return None
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """SELECT * FROM events
               WHERE title = ?
                 AND start_time = ?
                 AND ((end_time IS NULL AND ? IS NULL) OR end_time = ?)
                 AND status = ?
               ORDER BY id ASC
               LIMIT 1""",
            (
                title,
                start_time.isoformat(),
                end_time.isoformat() if end_time else None,
                end_time.isoformat() if end_time else None,
                status,
            ),
        ) as cursor:
            row = await cursor.fetchone()
            if not row:
                return None
            return Event(
                id=row["id"],
                title=row["title"],
                start_time=datetime.fromisoformat(row["start_time"]) if row["start_time"] else None,
                end_time=datetime.fromisoformat(row["end_time"]) if row["end_time"] else None,
                category_id=row["category_id"],
                all_day=bool(row["all_day"]),
                recurrence=row["recurrence"],
                status=row["status"],
                created_at=datetime.fromisoformat(row["created_at"]) if row["created_at"] else None,
                updated_at=datetime.fromisoformat(row["updated_at"]) if row["updated_at"] else None,
                reminder_enabled=bool(row["reminder_enabled"]) if "reminder_enabled" in list(row.keys()) and row["reminder_enabled"] is not None else False,
                reminder_minutes=int(row["reminder_minutes"]) if "reminder_minutes" in list(row.keys()) and row["reminder_minutes"] is not None else 1,
                reminder_sent=bool(row["reminder_sent"]) if "reminder_sent" in list(row.keys()) and row["reminder_sent"] is not None else False,
            )


async def find_overlapping_events(start_time: datetime, end_time: datetime, status: str = "pending") -> List[Event]:
    """Find events that overlap with [start_time, end_time)."""
    if not start_time:
        return []
    if not end_time:
        end_time = start_time

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """SELECT * FROM events
               WHERE start_time IS NOT NULL
                 AND status = ?
                 AND NOT (COALESCE(end_time, start_time) <= ? OR start_time >= ?)
               ORDER BY start_time ASC""",
            (status, start_time.isoformat(), end_time.isoformat()),
        ) as cursor:
            rows = await cursor.fetchall()
            result: List[Event] = []
            for row in rows:
                result.append(Event(
                    id=row["id"],
                    title=row["title"],
                    start_time=datetime.fromisoformat(row["start_time"]) if row["start_time"] else None,
                    end_time=datetime.fromisoformat(row["end_time"]) if row["end_time"] else None,
                    category_id=row["category_id"],
                    all_day=bool(row["all_day"]),
                    recurrence=row["recurrence"],
                    status=row["status"],
                    created_at=datetime.fromisoformat(row["created_at"]) if row["created_at"] else None,
                    updated_at=datetime.fromisoformat(row["updated_at"]) if row["updated_at"] else None,
                    reminder_enabled=bool(row["reminder_enabled"]) if "reminder_enabled" in list(row.keys()) and row["reminder_enabled"] is not None else False,
                    reminder_minutes=int(row["reminder_minutes"]) if "reminder_minutes" in list(row.keys()) and row["reminder_minutes"] is not None else 1,
                    reminder_sent=bool(row["reminder_sent"]) if "reminder_sent" in list(row.keys()) and row["reminder_sent"] is not None else False,
                ))
            return result


async def batch_uncomplete_events(start: datetime | None = None, end: datetime | None = None) -> int:
    """Batch mark done events back to pending. Returns affected row count."""
    async with aiosqlite.connect(DB_PATH) as db:
        if start and end:
            cursor = await db.execute(
                """UPDATE events
                   SET status = 'pending', updated_at = ?
                   WHERE start_time >= ? AND start_time < ? AND status = 'done'""",
                (datetime.now().isoformat(), start.isoformat(), end.isoformat()),
            )
        else:
            cursor = await db.execute(
                """UPDATE events
                   SET status = 'pending', updated_at = ?
                   WHERE status = 'done'""",
                (datetime.now().isoformat(),),
            )
        await db.commit()
        return cursor.rowcount or 0


async def batch_delete_events(start: datetime | None = None, end: datetime | None = None) -> int:
    """Batch soft-delete events (move to trash). Returns affected row count."""
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        if start and end:
            cursor = await db.execute(
                "UPDATE events SET is_deleted = 1, deleted_at = ? WHERE is_deleted = 0 AND start_time >= ? AND start_time < ?",
                (now, start.isoformat(), end.isoformat()),
            )
        else:
            cursor = await db.execute(
                "UPDATE events SET is_deleted = 1, deleted_at = ? WHERE is_deleted = 0",
                (now,)
            )
        await db.commit()
        return cursor.rowcount or 0


async def get_stats(date_filter: str = "today") -> dict[str, int | dict[str, int]]:
    """Get event statistics."""
    from datetime import timedelta

    now = datetime.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    if date_filter == "today":
        start = today_start
        end = today_start + timedelta(days=1)
    elif date_filter == "week":
        start = today_start - timedelta(days=now.weekday())
        end = start + timedelta(days=7)
    elif date_filter == "month":
        start = today_start.replace(day=1)
        if start.month == 12:
            end = start.replace(year=start.year + 1, month=1)
        else:
            end = start.replace(month=start.month + 1)
    else:
        start = today_start
        end = today_start + timedelta(days=1)

    async with aiosqlite.connect(DB_PATH) as db:
        # Total count
        async with db.execute(
            "SELECT COUNT(*) as count FROM events WHERE start_time >= ? AND start_time < ?",
            (start.isoformat(), end.isoformat()),
        ) as cursor:
            total_row = await cursor.fetchone()
            total = total_row[0] if total_row else 0

        # Completed count
        async with db.execute(
            """SELECT COUNT(*) as count FROM events 
               WHERE start_time >= ? AND start_time < ? AND status = 'done'""",
            (start.isoformat(), end.isoformat()),
        ) as cursor:
            completed_row = await cursor.fetchone()
            completed = completed_row[0] if completed_row else 0

        # By category
        async with db.execute(
            """SELECT category_id, COUNT(*) as count 
               FROM events WHERE start_time >= ? AND start_time < ?
               GROUP BY category_id""",
            (start.isoformat(), end.isoformat()),
        ) as cursor:
            rows = await cursor.fetchall()
            by_category = {row[0]: row[1] for row in rows}

    # Calculate completion rate
    completion_rate = round((completed / total * 100)) if total > 0 else 0

    return {
        "total": total,
        "completed": completed,
        "pending": total - completed,
        "completion_rate": completion_rate,
        "by_category": by_category,
    }


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


async def create_goal(goal: Goal) -> Goal:
    """Create a new goal with hierarchy support."""
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        # Calculate root_goal_id for hierarchy
        root_goal_id = goal.root_goal_id
        if goal.parent_id is not None and root_goal_id is None:
            # If this is a subtask and no root is set, find the root
            parent = await get_goal(goal.parent_id)
            if parent:
                root_goal_id = parent.root_goal_id or parent.id
        
        cursor = await db.execute(
            """INSERT INTO goals
               (title, description, horizon, status, start_date, end_date, 
                start_time, end_time,
                parent_id, root_goal_id, goal_order, ai_context, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                goal.title,
                goal.description,
                goal.horizon,
                goal.status,
                goal.start_date.isoformat() if goal.start_date else None,
                goal.end_date.isoformat() if goal.end_date else None,
                goal.start_time.isoformat() if goal.start_time else None,
                goal.end_time.isoformat() if goal.end_time else None,
                goal.parent_id,
                root_goal_id,
                goal.order,
                goal.ai_context,
                now,
                now,
            ),
        )
        await db.commit()
        goal.id = cursor.lastrowid
        goal.created_at = datetime.now()
        goal.updated_at = datetime.now()
    return goal


async def get_goals(horizon: str | None = None, include_subtasks: bool = True) -> List[Goal]:
    """Get goals, optionally filtered by horizon.
    
    Args:
        horizon: Filter by short/semester/long. None means all.
        include_subtasks: If True, return all goals including subtasks.
                        If False, return only top-level goals.
    """
    query = "SELECT * FROM goals"
    conditions = []
    params: tuple[Any, ...] = ()
    
    if horizon in {"short", "semester", "long"}:
        conditions.append("horizon = ?")
        params = (horizon,)
    
    if not include_subtasks:
        conditions.append("parent_id IS NULL")
    
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    
    query += " ORDER BY goal_order ASC, created_at DESC"

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(query, params) as cursor:
            rows = await cursor.fetchall()
            goals: List[Goal] = []
            for row in rows:
                goals.append(Goal(
                    id=row["id"],
                    title=row["title"],
                    description=row["description"] or "",
                    horizon=row["horizon"] or "short",
                    status=row["status"] or "active",
                    start_date=datetime.fromisoformat(row["start_date"]) if row["start_date"] else None,
                    end_date=datetime.fromisoformat(row["end_date"]) if row["end_date"] else None,
                    start_time=datetime.fromisoformat(row["start_time"]) if row["start_time"] else None,
                    end_time=datetime.fromisoformat(row["end_time"]) if row["end_time"] else None,
                    parent_id=row["parent_id"],
                    root_goal_id=row["root_goal_id"],
                    order=row["goal_order"] or 0,
                    ai_context=row["ai_context"] or "",
                    created_at=datetime.fromisoformat(row["created_at"]) if row["created_at"] else None,
                    updated_at=datetime.fromisoformat(row["updated_at"]) if row["updated_at"] else None,
                ))
    return goals


async def get_goal(goal_id: int) -> Optional[Goal]:
    """Get a single goal by ID."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM goals WHERE id = ?", (goal_id,)) as cursor:
            row = await cursor.fetchone()
            if not row:
                return None
            return Goal(
                id=row["id"],
                title=row["title"],
                description=row["description"] or "",
                horizon=row["horizon"] or "short",
                status=row["status"] or "active",
                start_date=datetime.fromisoformat(row["start_date"]) if row["start_date"] else None,
                end_date=datetime.fromisoformat(row["end_date"]) if row["end_date"] else None,
                start_time=datetime.fromisoformat(row["start_time"]) if row["start_time"] else None,
                end_time=datetime.fromisoformat(row["end_time"]) if row["end_time"] else None,
                parent_id=row["parent_id"],
                root_goal_id=row["root_goal_id"],
                order=row["goal_order"] or 0,
                ai_context=row["ai_context"] or "",
                created_at=datetime.fromisoformat(row["created_at"]) if row["created_at"] else None,
                updated_at=datetime.fromisoformat(row["updated_at"]) if row["updated_at"] else None,
            )


async def get_goal_subtasks(goal_id: int) -> List[Goal]:
    """Get direct subtasks of a goal."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM goals WHERE parent_id = ? ORDER BY goal_order ASC, created_at ASC",
            (goal_id,)
        ) as cursor:
            rows = await cursor.fetchall()
            subtasks: List[Goal] = []
            for row in rows:
                subtasks.append(Goal(
                    id=row["id"],
                    title=row["title"],
                    description=row["description"] or "",
                    horizon=row["horizon"] or "short",
                    status=row["status"] or "active",
                    start_date=datetime.fromisoformat(row["start_date"]) if row["start_date"] else None,
                    end_date=datetime.fromisoformat(row["end_date"]) if row["end_date"] else None,
                    start_time=datetime.fromisoformat(row["start_time"]) if row["start_time"] else None,
                    end_time=datetime.fromisoformat(row["end_time"]) if row["end_time"] else None,
                    parent_id=row["parent_id"],
                    root_goal_id=row["root_goal_id"],
                    order=row["goal_order"] or 0,
                    ai_context=row["ai_context"] or "",
                    created_at=datetime.fromisoformat(row["created_at"]) if row["created_at"] else None,
                    updated_at=datetime.fromisoformat(row["updated_at"]) if row["updated_at"] else None,
                ))
    return subtasks


async def get_goal_tree(goal_id: int, max_depth: int = 3) -> dict[str, Any] | None:
    """Get a goal with its full subtask tree.
    
    Args:
        goal_id: The root goal ID
        max_depth: Maximum depth to traverse (3 levels = goal -> subtask -> sub-subtask)
    
    Returns:
        dict with goal and nested subtasks
    """
    goal = await get_goal(goal_id)
    if not goal:
        return None
    
    async def build_tree(g: Goal, current_depth: int) -> dict[str, Any]:
        result = g.to_dict()
        if current_depth < max_depth:
            if g.id is None:
                result["subtasks"] = []
            else:
                subtasks = await get_goal_subtasks(g.id)
                result["subtasks"] = [await build_tree(s, current_depth + 1) for s in subtasks]
        else:
            result["subtasks"] = []
        return result
    
    return await build_tree(goal, 0)


async def update_goal(goal_id: int, goal: Goal) -> Optional[Goal]:
    """Update an existing goal."""
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """UPDATE goals SET
               title = ?, description = ?, horizon = ?, status = ?,
               start_date = ?, end_date = ?, start_time = ?, end_time = ?,
               parent_id = ?, root_goal_id = ?,
               goal_order = ?, ai_context = ?, updated_at = ?
               WHERE id = ?""",
            (
                goal.title,
                goal.description,
                goal.horizon,
                goal.status,
                goal.start_date.isoformat() if goal.start_date else None,
                goal.end_date.isoformat() if goal.end_date else None,
                goal.start_time.isoformat() if goal.start_time else None,
                goal.end_time.isoformat() if goal.end_time else None,
                goal.parent_id,
                goal.root_goal_id,
                goal.order,
                goal.ai_context,
                now,
                goal_id,
            ),
        )
        await db.commit()
    return await get_goal(goal_id)


async def delete_goal(goal_id: int) -> bool:
    """Soft-delete a goal and its subtasks (move to trash)."""
    async with aiosqlite.connect(DB_PATH) as db:
        now = datetime.now().isoformat()
        
        # First get all descendant goal IDs (recursive)
        async def get_descendant_ids(parent_id: int) -> List[int]:
            ids = []
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT id FROM goals WHERE parent_id = ?", (parent_id,)
            ) as cursor:
                rows = await cursor.fetchall()
                for row in rows:
                    child_id = row["id"]
                    ids.append(child_id)
                    child_descendants = await get_descendant_ids(child_id)
                    ids.extend(child_descendants)
            return ids
        
        # Get all descendant IDs
        all_ids = [goal_id] + await get_descendant_ids(goal_id)
        
        # Soft-delete goals and subtasks
        placeholders = ",".join("?" * len(all_ids))
        await db.execute(
            f"UPDATE goals SET is_deleted = 1, deleted_at = ? WHERE id IN ({placeholders}) AND is_deleted = 0",
            [now] + all_ids
        )
        await db.commit()
        return True


async def permanently_delete_goal(goal_id: int) -> bool:
    """Permanently delete a goal from trash."""
    async with aiosqlite.connect(DB_PATH) as db:
        async def get_descendant_ids(parent_id: int) -> List[int]:
            ids = []
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT id FROM goals WHERE parent_id = ?", (parent_id,)
            ) as cursor:
                rows = await cursor.fetchall()
                for row in rows:
                    child_id = row["id"]
                    ids.append(child_id)
                    child_descendants = await get_descendant_ids(child_id)
                    ids.extend(child_descendants)
            return ids
        
        all_ids = [goal_id] + await get_descendant_ids(goal_id)
        
        # Unlink events
        placeholders = ",".join("?" * len(all_ids))
        await db.execute(f"UPDATE events SET goal_id = NULL WHERE goal_id IN ({placeholders})", all_ids)
        
        # Delete conversations first
        await db.execute(f"DELETE FROM goal_conversations WHERE goal_id IN ({placeholders})", all_ids)
        
        # Permanently delete goals
        await db.execute(f"DELETE FROM goals WHERE id IN ({placeholders}) AND is_deleted = 1", all_ids)
        await db.commit()
        return True


async def restore_goal(goal_id: int) -> bool:
    """Restore a soft-deleted goal and its subtasks from trash."""
    async with aiosqlite.connect(DB_PATH) as db:
        async def get_descendant_ids(parent_id: int) -> List[int]:
            ids = []
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT id FROM goals WHERE parent_id = ?", (parent_id,)
            ) as cursor:
                rows = await cursor.fetchall()
                for row in rows:
                    child_id = row["id"]
                    ids.append(child_id)
                    child_descendants = await get_descendant_ids(child_id)
                    ids.extend(child_descendants)
            return ids
        
        all_ids = [goal_id] + await get_descendant_ids(goal_id)
        
        placeholders = ",".join("?" * len(all_ids))
        await db.execute(
            f"UPDATE goals SET is_deleted = 0, deleted_at = NULL WHERE id IN ({placeholders}) AND is_deleted = 1",
            all_ids
        )
        await db.commit()
        return True


# ============ Goal Conversation Functions ============

async def create_goal_conversation(conversation: GoalConversation) -> GoalConversation:
    """Create a new goal conversation message."""
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            """INSERT INTO goal_conversations
               (goal_id, role, content, created_at)
               VALUES (?, ?, ?, ?)""",
            (
                conversation.goal_id,
                conversation.role,
                conversation.content,
                now,
            ),
        )
        await db.commit()
        conversation.id = cursor.lastrowid
        conversation.created_at = datetime.now()
    return conversation


async def get_goal_conversations(goal_id: int) -> List[GoalConversation]:
    """Get all conversation messages for a goal."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM goal_conversations WHERE goal_id = ? ORDER BY created_at ASC",
            (goal_id,)
        ) as cursor:
            rows = await cursor.fetchall()
            conversations: List[GoalConversation] = []
            for row in rows:
                conversations.append(GoalConversation(
                    id=row["id"],
                    goal_id=row["goal_id"],
                    role=row["role"],
                    content=row["content"],
                    created_at=datetime.fromisoformat(row["created_at"]) if row["created_at"] else None,
                ))
    return conversations


async def delete_goal_conversations(goal_id: int) -> bool:
    """Delete all conversation messages for a goal."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM goal_conversations WHERE goal_id = ?", (goal_id,))
        await db.commit()
        return True


# ============ Notes Functions ============

async def create_note(note: Note) -> Note:
    """Create a new note with sort_order set to highest + 1 in its group."""
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        # Get max sort_order in the same group
        group_filter = "group_id IS NULL" if note.group_id is None else f"group_id = {note.group_id}"
        async with db.execute(f"SELECT MAX(sort_order) FROM notes WHERE {group_filter}") as cursor:
            row = await cursor.fetchone()
            max_order = row[0] if row and row[0] is not None else -1
            note.sort_order = max_order + 1
        
        cursor = await db.execute(
            """INSERT INTO notes (title, content, group_id, sort_order, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (note.title, note.content, note.group_id, note.sort_order, now, now),
        )
        await db.commit()
        note.id = cursor.lastrowid
        note.created_at = datetime.now()
        note.updated_at = datetime.now()
    return note


async def get_notes() -> List[Note]:
    """Get all notes, ordered by sort_order then most recent first."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM notes ORDER BY sort_order ASC, created_at DESC"
        ) as cursor:
            rows = await cursor.fetchall()
            notes = []
            for row in rows:
                notes.append(Note(
                    id=row["id"],
                    title=row["title"] or "",
                    content=row["content"] or "",
                    group_id=row["group_id"] if "group_id" in row.keys() else None,
                    sort_order=row["sort_order"] if "sort_order" in row.keys() else 0,
                    created_at=datetime.fromisoformat(row["created_at"]) if row["created_at"] else None,
                    updated_at=datetime.fromisoformat(row["updated_at"]) if row["updated_at"] else None,
                ))
    return notes


async def get_note(note_id: int) -> Optional[Note]:
    """Get a single note by ID."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM notes WHERE id = ?", (note_id,)) as cursor:
            row = await cursor.fetchone()
            if not row:
                return None
            return Note(
                id=row["id"],
                title=row["title"] or "",
                content=row["content"] or "",
                group_id=row["group_id"] if "group_id" in row.keys() and row["group_id"] is not None else None,
                sort_order=row["sort_order"] if "sort_order" in row.keys() else 0,
                created_at=datetime.fromisoformat(row["created_at"]) if row["created_at"] else None,
                updated_at=datetime.fromisoformat(row["updated_at"]) if row["updated_at"] else None,
            )


async def update_note(note_id: int, note: Note) -> Optional[Note]:
    """Update an existing note."""
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE notes SET title = ?, content = ?, group_id = ?, sort_order = ?, updated_at = ? WHERE id = ?",
            (note.title, note.content, note.group_id, note.sort_order, now, note_id),
        )
        await db.commit()
    return await get_note(note_id)


async def delete_note(note_id: int) -> bool:
    """Soft-delete a note (move to trash)."""
    async with aiosqlite.connect(DB_PATH) as db:
        now = datetime.now().isoformat()
        cursor = await db.execute(
            "UPDATE notes SET is_deleted = 1, deleted_at = ? WHERE id = ? AND is_deleted = 0",
            (now, note_id)
        )
        await db.commit()
        return cursor.rowcount > 0


async def permanently_delete_note(note_id: int) -> bool:
    """Permanently delete a note from trash."""
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("DELETE FROM notes WHERE id = ? AND is_deleted = 1", (note_id,))
        await db.commit()
        return cursor.rowcount > 0


async def restore_note(note_id: int) -> bool:
    """Restore a soft-deleted note from trash."""
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "UPDATE notes SET is_deleted = 0, deleted_at = NULL WHERE id = ? AND is_deleted = 1",
            (note_id,)
        )
        await db.commit()
        return cursor.rowcount > 0


# ============ Note Groups Functions ============

async def create_note_group(group: NoteGroup) -> NoteGroup:
    """Create a new note group."""
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            """INSERT INTO note_groups (name, sort_order, created_at)
               VALUES (?, ?, ?)""",
            (group.name, group.sort_order, now),
        )
        await db.commit()
        group.id = cursor.lastrowid
        group.created_at = datetime.now()
    return group


async def get_note_groups() -> List[NoteGroup]:
    """Get all note groups, ordered by sort_order."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM note_groups ORDER BY sort_order ASC, created_at DESC"
        ) as cursor:
            rows = await cursor.fetchall()
            groups = []
            for row in rows:
                groups.append(NoteGroup(
                    id=row["id"],
                    name=row["name"] or "",
                    sort_order=row["sort_order"] or 0,
                    created_at=datetime.fromisoformat(row["created_at"]) if row["created_at"] else None,
                ))
    return groups


async def get_note_group(group_id: int) -> Optional[NoteGroup]:
    """Get a single note group by ID."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM note_groups WHERE id = ?", (group_id,)) as cursor:
            row = await cursor.fetchone()
            if not row:
                return None
            return NoteGroup(
                id=row["id"],
                name=row["name"] or "",
                sort_order=row["sort_order"] or 0,
                created_at=datetime.fromisoformat(row["created_at"]) if row["created_at"] else None,
            )


async def update_note_group(group_id: int, group: NoteGroup) -> Optional[NoteGroup]:
    """Update an existing note group."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE note_groups SET name = ?, sort_order = ? WHERE id = ?",
            (group.name, group.sort_order, group_id),
        )
        await db.commit()
    return await get_note_group(group_id)


async def delete_note_group(group_id: int) -> bool:
    """Delete a note group (notes retain, group_id set to null)."""
    async with aiosqlite.connect(DB_PATH) as db:
        # Set group_id to null for all notes in this group
        await db.execute("UPDATE notes SET group_id = NULL WHERE group_id = ?", (group_id,))
        # Delete the group
        cursor = await db.execute("DELETE FROM note_groups WHERE id = ?", (group_id,))
        await db.commit()
        return cursor.rowcount > 0


# ============ Note Conversations Functions ============

async def create_note_conversation(conversation: "NoteConversation") -> "NoteConversation":
    """Create a new note conversation message."""
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            """INSERT INTO note_conversations (note_id, role, content, selected_text, created_at)
               VALUES (?, ?, ?, ?, ?)""",
            (conversation.note_id, conversation.role, conversation.content, conversation.selected_text, now),
        )
        await db.commit()
        conversation.id = cursor.lastrowid
        conversation.created_at = datetime.now()
    return conversation


async def get_note_conversations(note_id: int) -> List["NoteConversation"]:
    """Get all conversation messages for a note, ordered by creation time."""
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            """SELECT id, note_id, role, content, selected_text, created_at 
               FROM note_conversations 
               WHERE note_id = ? 
               ORDER BY created_at ASC""",
            (note_id,),
        )
        rows = await cursor.fetchall()
        return [
            NoteConversation(
                id=row[0],
                note_id=row[1],
                role=row[2],
                content=row[3],
                selected_text=row[4] or "",
                created_at=datetime.fromisoformat(row[5]) if row[5] else None,
            )
            for row in rows
        ]


async def delete_note_conversations(note_id: int) -> bool:
    """Delete all conversation messages for a note."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM note_conversations WHERE note_id = ?", (note_id,))
        await db.commit()
    return True


# ============ Expenses Functions ============

async def create_expense(expense: Expense) -> Expense:
    """Create a new expense."""
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            """INSERT INTO expenses (amount, category, note, created_at)
               VALUES (?, ?, ?, ?)""",
            (expense.amount, expense.category, expense.note, now),
        )
        await db.commit()
        expense.id = cursor.lastrowid
        expense.created_at = datetime.now()
    return expense


async def get_expenses(date_filter: str = "month") -> List[Expense]:
    """Get expenses, optionally filtered by month (YYYY-MM format)."""
    from datetime import timedelta
    
    now = datetime.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    
    # Parse date filter
    import re
    if re.match(r'^\d{4}-\d{2}$', date_filter):
        try:
            year = int(date_filter[:4])
            month = int(date_filter[5:7])
            start = datetime(year, month, 1, 0, 0, 0, 0)
            if month == 12:
                end = datetime(year + 1, 1, 1, 0, 0, 0, 0)
            else:
                end = datetime(year, month + 1, 1, 0, 0, 0, 0)
        except ValueError:
            start = today_start.replace(day=1)
            if start.month == 12:
                end = start.replace(year=start.year + 1, month=1)
            else:
                end = start.replace(month=start.month + 1)
    elif date_filter == "today":
        start = today_start
        end = today_start + timedelta(days=1)
    elif date_filter == "week":
        start = today_start - timedelta(days=now.weekday())
        end = start + timedelta(days=7)
    else:  # default to month
        start = today_start.replace(day=1)
        if start.month == 12:
            end = start.replace(year=start.year + 1, month=1)
        else:
            end = start.replace(month=start.month + 1)
    
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """SELECT * FROM expenses 
               WHERE created_at >= ? AND created_at < ?
               ORDER BY created_at DESC""",
            (start.isoformat(), end.isoformat()),
        ) as cursor:
            rows = await cursor.fetchall()
            expenses = []
            for row in rows:
                expenses.append(Expense(
                    id=row["id"],
                    amount=float(row["amount"]) if row["amount"] else 0.0,
                    category=row["category"] or "other",
                    note=row["note"] or "",
                    created_at=datetime.fromisoformat(row["created_at"]) if row["created_at"] else None,
                ))
    return expenses


async def get_expense(expense_id: int) -> Optional[Expense]:
    """Get a single expense by ID."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM expenses WHERE id = ?", (expense_id,)) as cursor:
            row = await cursor.fetchone()
            if not row:
                return None
            return Expense(
                id=row["id"],
                amount=float(row["amount"]) if row["amount"] else 0.0,
                category=row["category"] or "other",
                note=row["note"] or "",
                created_at=datetime.fromisoformat(row["created_at"]) if row["created_at"] else None,
            )


async def update_expense(expense_id: int, expense: Expense) -> Optional[Expense]:
    """Update an existing expense."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE expenses SET amount = ?, category = ?, note = ? WHERE id = ?",
            (expense.amount, expense.category, expense.note, expense_id),
        )
        await db.commit()
    return await get_expense(expense_id)


async def delete_expense(expense_id: int) -> bool:
    """Soft-delete an expense (move to trash)."""
    async with aiosqlite.connect(DB_PATH) as db:
        now = datetime.now().isoformat()
        cursor = await db.execute(
            "UPDATE expenses SET is_deleted = 1, deleted_at = ? WHERE id = ? AND is_deleted = 0",
            (now, expense_id)
        )
        await db.commit()
        return cursor.rowcount > 0


async def permanently_delete_expense(expense_id: int) -> bool:
    """Permanently delete an expense from trash."""
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("DELETE FROM expenses WHERE id = ? AND is_deleted = 1", (expense_id,))
        await db.commit()
        return cursor.rowcount > 0


async def restore_expense(expense_id: int) -> bool:
    """Restore a soft-deleted expense from trash."""
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "UPDATE expenses SET is_deleted = 0, deleted_at = NULL WHERE id = ? AND is_deleted = 1",
            (expense_id,)
        )
        await db.commit()
        return cursor.rowcount > 0


async def get_expense_stats(date_filter: str = "month") -> dict[str, Any]:
    """Get expense statistics by category."""
    from datetime import timedelta
    
    now = datetime.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    
    # Parse date filter
    import re
    if re.match(r'^\d{4}-\d{2}$', date_filter):
        try:
            year = int(date_filter[:4])
            month = int(date_filter[5:7])
            start = datetime(year, month, 1, 0, 0, 0, 0)
            if month == 12:
                end = datetime(year + 1, 1, 1, 0, 0, 0, 0)
            else:
                end = datetime(year, month + 1, 1, 0, 0, 0, 0)
        except ValueError:
            start = today_start.replace(day=1)
            if start.month == 12:
                end = start.replace(year=start.year + 1, month=1)
            else:
                end = start.replace(month=start.month + 1)
    elif date_filter == "today":
        start = today_start
        end = today_start + timedelta(days=1)
    elif date_filter == "week":
        start = today_start - timedelta(days=now.weekday())
        end = start + timedelta(days=7)
    else:  # default to month
        start = today_start.replace(day=1)
        if start.month == 12:
            end = start.replace(year=start.year + 1, month=1)
        else:
            end = start.replace(month=start.month + 1)
    
    async with aiosqlite.connect(DB_PATH) as db:
        # Total amount
        async with db.execute(
            """SELECT COALESCE(SUM(amount), 0) as total 
               FROM expenses WHERE created_at >= ? AND created_at < ?""",
            (start.isoformat(), end.isoformat()),
        ) as cursor:
            total_row = await cursor.fetchone()
            total = float(total_row[0]) if total_row else 0.0
        
        # By category
        async with db.execute(
            """SELECT category, COALESCE(SUM(amount), 0) as total 
               FROM expenses WHERE created_at >= ? AND created_at < ?
               GROUP BY category""",
            (start.isoformat(), end.isoformat()),
        ) as cursor:
            rows = await cursor.fetchall()
            by_category = {row[0]: float(row[1]) for row in rows}
    
    return {
        "total": total,
        "by_category": by_category,
    }


# ============================================
# Note CRUD functions
# ============================================

async def create_note(note: Note) -> Note:
    """Create a new note."""
    async with aiosqlite.connect(DB_PATH) as db:
        now = datetime.now().isoformat()
        cursor = await db.execute(
            "INSERT INTO notes (title, content, group_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (note.title, note.content, note.group_id, now, now),
        )
        await db.commit()
        note.id = cursor.lastrowid
        note.created_at = datetime.now()
        note.updated_at = datetime.now()
        return note


async def get_notes() -> list[Note]:
    """Get all notes ordered by created_at desc."""
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT id, title, content, group_id, created_at, updated_at FROM notes ORDER BY created_at DESC"
        ) as cursor:
            rows = await cursor.fetchall()
            return [
                Note(
                    id=row[0],
                    title=row[1],
                    content=row[2],
                    group_id=row[3],
                    created_at=datetime.fromisoformat(row[4]) if row[4] else None,
                    updated_at=datetime.fromisoformat(row[5]) if row[5] else None,
                )
                for row in rows
            ]


async def get_note(note_id: int) -> Optional[Note]:
    """Get a single note by ID."""
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT id, title, content, group_id, sort_order, created_at, updated_at FROM notes WHERE id = ?",
            (note_id,),
        ) as cursor:
            row = await cursor.fetchone()
            if row:
                return Note(
                    id=row[0],
                    title=row[1],
                    content=row[2],
                    group_id=row[3],
                    sort_order=row[4] if row[4] is not None else 0,
                    created_at=datetime.fromisoformat(row[5]) if row[5] else None,
                    updated_at=datetime.fromisoformat(row[6]) if row[6] else None,
                )
            return None


async def update_note(note_id: int, note: Note) -> Optional[Note]:
    """Update an existing note."""
    existing = await get_note(note_id)
    if not existing:
        return None
    
    sort_order_to_use = note.sort_order if note.sort_order is not None else existing.sort_order
    
    async with aiosqlite.connect(DB_PATH) as db:
        now = datetime.now().isoformat()
        await db.execute(
            "UPDATE notes SET title = ?, content = ?, group_id = ?, sort_order = ?, updated_at = ? WHERE id = ?",
            (
                note.title if note.title else existing.title,
                note.content if note.content else existing.content,
                note.group_id if note.group_id is not None else existing.group_id,
                sort_order_to_use,
                now,
                note_id,
            ),
        )
        await db.commit()
    
    return await get_note(note_id)


async def delete_note(note_id: int) -> bool:
    """Delete a note."""
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("DELETE FROM notes WHERE id = ?", (note_id,))
        await db.commit()
        return cursor.rowcount > 0


# ============================================
# NoteGroup CRUD functions
# ============================================

async def create_note_group(note_group: NoteGroup) -> NoteGroup:
    """Create a new note group."""
    async with aiosqlite.connect(DB_PATH) as db:
        now = datetime.now().isoformat()
        cursor = await db.execute(
            "INSERT INTO note_groups (name, sort_order, created_at) VALUES (?, ?, ?)",
            (note_group.name, note_group.sort_order, now),
        )
        await db.commit()
        note_group.id = cursor.lastrowid
        note_group.created_at = datetime.now()
        return note_group


async def get_note_groups() -> list[NoteGroup]:
    """Get all note groups ordered by sort_order."""
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT id, name, sort_order, created_at FROM note_groups ORDER BY sort_order"
        ) as cursor:
            rows = await cursor.fetchall()
            return [
                NoteGroup(
                    id=row[0],
                    name=row[1],
                    sort_order=row[2],
                    created_at=datetime.fromisoformat(row[3]) if row[3] else None,
                )
                for row in rows
            ]


async def get_note_group(group_id: int) -> Optional[NoteGroup]:
    """Get a single note group by ID."""
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT id, name, sort_order, created_at FROM note_groups WHERE id = ?",
            (group_id,),
        ) as cursor:
            row = await cursor.fetchone()
            if row:
                return NoteGroup(
                    id=row[0],
                    name=row[1],
                    sort_order=row[2],
                    created_at=datetime.fromisoformat(row[3]) if row[3] else None,
                )
            return None


async def update_note_group(group_id: int, note_group: NoteGroup) -> Optional[NoteGroup]:
    """Update an existing note group."""
    existing = await get_note_group(group_id)
    if not existing:
        return None
    
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE note_groups SET name = ?, sort_order = ? WHERE id = ?",
            (
                note_group.name if note_group.name else existing.name,
                note_group.sort_order if note_group.sort_order != existing.sort_order else existing.sort_order,
                group_id,
            ),
        )
        await db.commit()
    
    return await get_note_group(group_id)


async def delete_note_group(group_id: int) -> bool:
    """Delete a note group. Notes in the group will have group_id set to NULL."""
    async with aiosqlite.connect(DB_PATH) as db:
        # First set notes in this group to NULL
        await db.execute("UPDATE notes SET group_id = NULL WHERE group_id = ?", (group_id,))
        # Then delete the group
        cursor = await db.execute("DELETE FROM note_groups WHERE id = ?", (group_id,))
        await db.commit()
        return cursor.rowcount > 0


async def cleanup_test_entries() -> dict[str, int]:
    """Delete test/demo/debug entries across events, notes and expenses."""
    patterns = [
        "%测试%", "%test%", "%debug%", "%demo%", "%样例%", "%示例%", "%tmp%", "%临时%"
    ]

    async with aiosqlite.connect(DB_PATH) as db:
        # Events by title
        event_where = " OR ".join(["LOWER(title) LIKE LOWER(?)" for _ in patterns])
        event_result = await db.execute(
            f"DELETE FROM events WHERE {event_where}",
            patterns,
        )

        # Notes by title/content
        note_title_where = " OR ".join(["LOWER(title) LIKE LOWER(?)" for _ in patterns])
        note_content_where = " OR ".join(["LOWER(content) LIKE LOWER(?)" for _ in patterns])
        note_result = await db.execute(
            f"DELETE FROM notes WHERE ({note_title_where}) OR ({note_content_where})",
            patterns + patterns,
        )

        # Expenses by note
        expense_where = " OR ".join(["LOWER(note) LIKE LOWER(?)" for _ in patterns])
        expense_result = await db.execute(
            f"DELETE FROM expenses WHERE {expense_where}",
            patterns,
        )

        await db.commit()

    return {
        "events_deleted": event_result.rowcount or 0,
        "notes_deleted": note_result.rowcount or 0,
        "expenses_deleted": expense_result.rowcount or 0,
    }


# ============ Trash Functions ============

async def get_trash() -> dict[str, list]:
    """Get all soft-deleted items from all tables."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        
        # Get deleted events
        async with db.execute(
            "SELECT * FROM events WHERE is_deleted = 1 ORDER BY deleted_at DESC"
        ) as cursor:
            events = []
            async for row in cursor:
                events.append({
                    "id": row["id"],
                    "type": "event",
                    "title": row["title"],
                    "deleted_at": row["deleted_at"],
                    "data": dict(row),
                })
        
        # Get deleted goals
        async with db.execute(
            "SELECT * FROM goals WHERE is_deleted = 1 ORDER BY deleted_at DESC"
        ) as cursor:
            goals = []
            async for row in cursor:
                goals.append({
                    "id": row["id"],
                    "type": "goal",
                    "title": row["title"],
                    "deleted_at": row["deleted_at"],
                    "data": dict(row),
                })
        
        # Get deleted notes
        async with db.execute(
            "SELECT * FROM notes WHERE is_deleted = 1 ORDER BY deleted_at DESC"
        ) as cursor:
            notes = []
            async for row in cursor:
                notes.append({
                    "id": row["id"],
                    "type": "note",
                    "title": row["title"],
                    "deleted_at": row["deleted_at"],
                    "data": dict(row),
                })
        
        # Get deleted expenses
        async with db.execute(
            "SELECT * FROM expenses WHERE is_deleted = 1 ORDER BY deleted_at DESC"
        ) as cursor:
            expenses = []
            async for row in cursor:
                expenses.append({
                    "id": row["id"],
                    "type": "expense",
                    "title": f"{row['amount']}元 - {row['note'][:20] if row['note'] else row['category']}",
                    "deleted_at": row["deleted_at"],
                    "data": dict(row),
                })
        
        return {
            "events": events,
            "goals": goals,
            "notes": notes,
            "expenses": expenses,
        }


async def get_trash_count() -> dict[str, int]:
    """Get count of items in trash by type."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        
        events_count = 0
        goals_count = 0
        notes_count = 0
        expenses_count = 0
        
        async with db.execute("SELECT COUNT(*) as cnt FROM events WHERE is_deleted = 1") as cursor:
            row = await cursor.fetchone()
            events_count = row["cnt"] if row else 0
        
        async with db.execute("SELECT COUNT(*) as cnt FROM goals WHERE is_deleted = 1") as cursor:
            row = await cursor.fetchone()
            goals_count = row["cnt"] if row else 0
        
        async with db.execute("SELECT COUNT(*) as cnt FROM notes WHERE is_deleted = 1") as cursor:
            row = await cursor.fetchone()
            notes_count = row["cnt"] if row else 0
        
        async with db.execute("SELECT COUNT(*) as cnt FROM expenses WHERE is_deleted = 1") as cursor:
            row = await cursor.fetchone()
            expenses_count = row["cnt"] if row else 0
        
        return {
            "events": events_count,
            "goals": goals_count,
            "notes": notes_count,
            "expenses": expenses_count,
            "total": events_count + goals_count + notes_count + expenses_count,
        }


async def empty_trash() -> dict[str, int]:
    """Permanently delete all items in trash. Returns counts of deleted items."""
    async with aiosqlite.connect(DB_PATH) as db:
        # Get counts before deletion
        async with db.execute("SELECT COUNT(*) as cnt FROM events WHERE is_deleted = 1") as cursor:
            row = await cursor.fetchone()
            events_count = row["cnt"] if row else 0
        
        async with db.execute("SELECT COUNT(*) as cnt FROM goals WHERE is_deleted = 1") as cursor:
            row = await cursor.fetchone()
            goals_count = row["cnt"] if row else 0
        
        async with db.execute("SELECT COUNT(*) as cnt FROM notes WHERE is_deleted = 1") as cursor:
            row = await cursor.fetchone()
            notes_count = row["cnt"] if row else 0
        
        async with db.execute("SELECT COUNT(*) as cnt FROM expenses WHERE is_deleted = 1") as cursor:
            row = await cursor.fetchone()
            expenses_count = row["cnt"] if row else 0
        
        # Permanently delete
        await db.execute("DELETE FROM events WHERE is_deleted = 1")
        await db.execute("DELETE FROM goals WHERE is_deleted = 1")
        await db.execute("DELETE FROM notes WHERE is_deleted = 1")
        await db.execute("DELETE FROM expenses WHERE is_deleted = 1")
        await db.commit()
        
        return {
            "events_deleted": events_count,
            "goals_deleted": goals_count,
            "notes_deleted": notes_count,
            "expenses_deleted": expenses_count,
        }


# ============ AI Settings Functions ============

@dataclass
class AISettings:
    """AI settings model for LLM provider configuration."""
    id: int | None = None
    provider: str = "openai"
    api_key: str = ""
    base_url: str = ""
    model: str = ""
    created_at: datetime | None = None
    updated_at: datetime | None = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        d = asdict(self)
        for key in ["created_at", "updated_at"]:
            if d.get(key) and isinstance(d[key], datetime):
                d[key] = d[key].isoformat()
        return d


async def get_ai_settings() -> Optional[AISettings]:
    """Get AI settings (single row, id=1)."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM ai_settings WHERE id = 1") as cursor:
            row = await cursor.fetchone()
            if not row:
                return None
            return AISettings(
                id=row["id"],
                provider=row["provider"] or "openai",
                api_key=row["api_key"] or "",
                base_url=row["base_url"] or "",
                model=row["model"] or "",
                created_at=datetime.fromisoformat(row["created_at"]) if row["created_at"] else None,
                updated_at=datetime.fromisoformat(row["updated_at"]) if row["updated_at"] else None,
            )


async def update_ai_settings(settings: AISettings) -> Optional[AISettings]:
    """Update AI settings."""
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """UPDATE ai_settings SET 
               provider = ?, api_key = ?, base_url = ?, model = ?, updated_at = ?
               WHERE id = 1""",
            (
                settings.provider,
                settings.api_key,
                settings.base_url,
                settings.model,
                now,
            ),
        )
        await db.commit()
    return await get_ai_settings()
