"""SQLite database operations."""
import aiosqlite
from datetime import datetime
from pathlib import Path
from typing import Any, List, Optional

from .models import Event, Goal, GoalConversation

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

    # Include no-time items in month-style queries (used by todo list)
    include_no_time = (date_filter == "month") or bool(re.match(r'^\d{4}-\d{2}$', date_filter))

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        if include_no_time:
            query = """SELECT * FROM events
                       WHERE (start_time >= ? AND start_time < ?) OR start_time IS NULL
                       ORDER BY CASE WHEN start_time IS NULL THEN 1 ELSE 0 END, start_time"""
        else:
            query = """SELECT * FROM events
                       WHERE start_time >= ? AND start_time < ?
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
                parent_id, root_goal_id, goal_order, ai_context, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                goal.title,
                goal.description,
                goal.horizon,
                goal.status,
                goal.start_date.isoformat() if goal.start_date else None,
                goal.end_date.isoformat() if goal.end_date else None,
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
               start_date = ?, end_date = ?, parent_id = ?, root_goal_id = ?,
               goal_order = ?, ai_context = ?, updated_at = ?
               WHERE id = ?""",
            (
                goal.title,
                goal.description,
                goal.horizon,
                goal.status,
                goal.start_date.isoformat() if goal.start_date else None,
                goal.end_date.isoformat() if goal.end_date else None,
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
    """Delete a goal, its subtasks, and unlink its events."""
    async with aiosqlite.connect(DB_PATH) as db:
        # First get all descendant goal IDs (recursive delete)
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
                    # Recursively get children
                    child_descendants = await get_descendant_ids(child_id)
                    ids.extend(child_descendants)
            return ids
        
        # Get all descendant IDs
        all_ids = [goal_id] + await get_descendant_ids(goal_id)
        
        # Unlink events
        placeholders = ",".join("?" * len(all_ids))
        await db.execute(f"UPDATE events SET goal_id = NULL WHERE goal_id IN ({placeholders})", all_ids)
        
        # Delete conversations first
        await db.execute(f"DELETE FROM goal_conversations WHERE goal_id IN ({placeholders})", all_ids)
        
        # Delete goals
        await db.execute(f"DELETE FROM goals WHERE id IN ({placeholders})", all_ids)
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
