"""SQLite database operations."""
import aiosqlite
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from .models import Event, Goal

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

        # Goals table for multi-horizon planning
        await db.execute("""
            CREATE TABLE IF NOT EXISTS goals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT DEFAULT '',
                horizon TEXT DEFAULT 'short',
                status TEXT DEFAULT 'active',
                start_date TEXT,
                end_date TEXT,
                created_at TEXT,
                updated_at TEXT
            )
        """)

        # Link events to goals (optional)
        try:
            await db.execute("ALTER TABLE events ADD COLUMN goal_id INTEGER")
        except Exception:
            pass
        
        # Insert default settings
        await db.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('qq_reminder_enabled', 'true')")
        await db.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('default_task_reminder_enabled', 'true')")
        
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

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """SELECT * FROM events 
               WHERE start_time >= ? AND start_time < ?
               ORDER BY start_time""",
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
    """Get a single event by ID."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM events WHERE id = ?", (event_id,)) as cursor:
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
    """Delete an event."""
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("DELETE FROM events WHERE id = ?", (event_id,))
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
    """Create a new goal."""
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            """INSERT INTO goals
               (title, description, horizon, status, start_date, end_date, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                goal.title,
                goal.description,
                goal.horizon,
                goal.status,
                goal.start_date.isoformat() if goal.start_date else None,
                goal.end_date.isoformat() if goal.end_date else None,
                now,
                now,
            ),
        )
        await db.commit()
        goal.id = cursor.lastrowid
        goal.created_at = datetime.now()
        goal.updated_at = datetime.now()
    return goal


async def get_goals(horizon: str | None = None) -> List[Goal]:
    """Get goals, optionally filtered by horizon."""
    query = "SELECT * FROM goals"
    params: tuple = ()
    if horizon in {"short", "semester", "long"}:
        query += " WHERE horizon = ?"
        params = (horizon,)
    query += " ORDER BY created_at DESC"

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
                created_at=datetime.fromisoformat(row["created_at"]) if row["created_at"] else None,
                updated_at=datetime.fromisoformat(row["updated_at"]) if row["updated_at"] else None,
            )


async def update_goal(goal_id: int, goal: Goal) -> Optional[Goal]:
    """Update an existing goal."""
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """UPDATE goals SET
               title = ?, description = ?, horizon = ?, status = ?,
               start_date = ?, end_date = ?, updated_at = ?
               WHERE id = ?""",
            (
                goal.title,
                goal.description,
                goal.horizon,
                goal.status,
                goal.start_date.isoformat() if goal.start_date else None,
                goal.end_date.isoformat() if goal.end_date else None,
                now,
                goal_id,
            ),
        )
        await db.commit()
    return await get_goal(goal_id)


async def delete_goal(goal_id: int) -> bool:
    """Delete a goal and unlink its events."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("UPDATE events SET goal_id = NULL WHERE goal_id = ?", (goal_id,))
        cursor = await db.execute("DELETE FROM goals WHERE id = ?", (goal_id,))
        await db.commit()
        return cursor.rowcount > 0
