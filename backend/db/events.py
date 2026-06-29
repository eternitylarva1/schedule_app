"""Events database operations."""
import aiosqlite
from datetime import datetime, timedelta
from typing import Any, List, Optional

from ..models import Event, EventHistory
from ._connection import DB_PATH

async def create_event(event: Event) -> Event:
    """Create a new event."""
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            """INSERT INTO events 
               (title, start_time, end_time, category_id, all_day, recurrence, status, created_at, updated_at, reminder_enabled, reminder_minutes, reminder_sent, priority, is_test)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
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
                event.priority,
                1 if event.is_test else 0,
            ),
        )
        await db.commit()
        event.id = cursor.lastrowid
        event.created_at = datetime.now()
        event.updated_at = datetime.now()
    return event


async def search_events(q: str, limit: int = 20) -> List[Event]:
    """Search events by title."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        rows = await db.execute(
            """SELECT * FROM events WHERE title LIKE ? AND status != 'hidden' ORDER BY start_time DESC LIMIT ?""",
            (f"%{q}%", limit)
        )
        rows = await rows.fetchall()
        return [Event.from_dict(dict(row)) for row in rows]


async def get_events(date_filter: str = "today") -> List[Event]:
    """Get events filtered by date (today/week/month/YYYY-MM-DD/YYYY-MM)."""
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
    include_no_time = (date_filter == "month") or (date_filter == "all") or bool(re.match(r'^\d{4}-\d{2}$', date_filter))
    
    # For "all" filter, don't apply date filtering
    is_all_filter = (date_filter == "all")

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        if is_all_filter:
            query = """SELECT * FROM events
                       ORDER BY CASE WHEN start_time IS NULL THEN 1 ELSE 0 END, start_time"""
            async with db.execute(query) as cursor:
                rows = await cursor.fetchall()
        elif include_no_time:
            query = """SELECT * FROM events
                       WHERE (start_time >= ? AND start_time < ?) OR start_time IS NULL
                       ORDER BY CASE WHEN start_time IS NULL THEN 1 ELSE 0 END, start_time"""
            async with db.execute(
                query,
                (start.isoformat(), end.isoformat()),
            ) as cursor:
                rows = await cursor.fetchall()
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
            row_keys = list(row.keys())
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
                reminder_enabled=bool(row["reminder_enabled"]) if "reminder_enabled" in row_keys and row["reminder_enabled"] is not None else False,
                reminder_minutes=int(row["reminder_minutes"]) if "reminder_minutes" in row_keys and row["reminder_minutes"] is not None else 1,
                reminder_sent=bool(row["reminder_sent"]) if "reminder_sent" in row_keys and row["reminder_sent"] is not None else False,
                priority=row["priority"] if "priority" in row_keys else "none",
                is_test=bool(row["is_test"]) if "is_test" in row_keys and row["is_test"] is not None else False,
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
            row_keys = list(row.keys())
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
                reminder_enabled=bool(row["reminder_enabled"]) if "reminder_enabled" in row_keys and row["reminder_enabled"] is not None else False,
                reminder_minutes=int(row["reminder_minutes"]) if "reminder_minutes" in row_keys and row["reminder_minutes"] is not None else 1,
                reminder_sent=bool(row["reminder_sent"]) if "reminder_sent" in row_keys and row["reminder_sent"] is not None else False,
                priority=row["priority"] if "priority" in row_keys else "none",
                is_test=bool(row["is_test"]) if "is_test" in row_keys and row["is_test"] is not None else False,
                completed_at=datetime.fromisoformat(row["completed_at"]) if row["completed_at"] else None,
            )


async def update_event(event_id: int, event: Event) -> Optional[Event]:
    """Update an existing event and save modification backup for undo."""
    existing = await get_event(event_id)
    if existing:
        await backup_event_modification(existing, "updated")
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """UPDATE events SET 
               title = ?, start_time = ?, end_time = ?, category_id = ?, 
               all_day = ?, recurrence = ?, status = ?, updated_at = ?,
               reminder_enabled = ?, reminder_minutes = ?, reminder_sent = ?, priority = ?, is_test = ?,
               completed_at = ?
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
                event.priority,
                1 if event.is_test else 0,
                event.completed_at.isoformat() if event.completed_at else None,
                event_id,
            ),
        )
        await db.commit()
    return await get_event(event_id)


async def delete_event(event_id: int) -> bool:
    """Delete an event and save backup to deleted_events table."""
    event = await get_event(event_id)
    if event:
        await backup_deleted_event(event)
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("DELETE FROM events WHERE id = ?", (event_id,))
        await db.commit()
        return cursor.rowcount > 0


async def delete_events_by_title(title: str) -> int:
    """Delete all events matching title (supports partial match) and save backups."""
    events = await get_events_by_title(title)
    for event in events:
        await backup_deleted_event(event)
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "DELETE FROM events WHERE title LIKE ?",
            (f"%{title}%",)
        )
        await db.commit()
        return cursor.rowcount


async def backup_deleted_event(event: Event) -> None:
    """Save a deleted event to the backup table for potential restore."""
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO deleted_events 
               (original_id, title, start_time, end_time, category_id, all_day, recurrence, status, 
                reminder_enabled, reminder_minutes, is_test, goal_id, created_at, updated_at, deleted_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                event.id,
                event.title,
                event.start_time.isoformat() if event.start_time else None,
                event.end_time.isoformat() if event.end_time else None,
                event.category_id,
                1 if event.all_day else 0,
                event.recurrence,
                event.status,
                1 if event.reminder_enabled else 0,
                event.reminder_minutes,
                1 if event.is_test else 0,
                event.goal_id,
                event.created_at,
                event.updated_at,
                now
            )
        )
        await db.commit()


async def get_deleted_events(limit: int = 100) -> List[dict]:
    """Get list of deleted events that can be restored."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM deleted_events ORDER BY deleted_at DESC LIMIT ?",
            (limit,)
        ) as cursor:
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]


async def restore_deleted_event(deleted_id: int) -> Optional[Event]:
    """Restore an event from the deleted_events backup table."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM deleted_events WHERE id = ?",
            (deleted_id,)
        ) as cursor:
            row = await cursor.fetchone()
            if not row:
                return None
            
            row_dict = dict(row)
            # Create new event with original data
            event = Event(
                title=row_dict['title'],
                start_time=datetime.fromisoformat(row_dict['start_time']) if row_dict['start_time'] else None,
                end_time=datetime.fromisoformat(row_dict['end_time']) if row_dict['end_time'] else None,
                category_id=row_dict['category_id'],
                all_day=bool(row_dict['all_day']),
                recurrence=row_dict['recurrence'],
                status=row_dict['status'],
                reminder_enabled=bool(row_dict['reminder_enabled']),
                reminder_minutes=row_dict['reminder_minutes'],
                is_test=bool(row_dict['is_test']),
                goal_id=row_dict['goal_id'],
            )
            
            created = await create_event(event)
            
            # Remove from deleted_events backup
            await db.execute("DELETE FROM deleted_events WHERE id = ?", (deleted_id,))
            await db.commit()
            
            return created


async def permanent_delete(deleted_id: int) -> bool:
    """Permanently delete an event from backup table (cannot restore)."""
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("DELETE FROM deleted_events WHERE id = ?", (deleted_id,))
        await db.commit()
        return cursor.rowcount > 0


async def backup_event_modification(event: Event, action_type: str = "updated") -> None:
    """Save event state before modification for potential undo."""
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO event_modifications 
               (event_id, title, start_time, end_time, category_id, all_day, recurrence, status, 
                reminder_enabled, reminder_minutes, is_test, goal_id, created_at, updated_at, action_type, modified_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                event.id,
                event.title,
                event.start_time.isoformat() if event.start_time else None,
                event.end_time.isoformat() if event.end_time else None,
                event.category_id,
                1 if event.all_day else 0,
                event.recurrence,
                event.status,
                1 if event.reminder_enabled else 0,
                event.reminder_minutes,
                1 if event.is_test else 0,
                event.goal_id,
                event.created_at,
                event.updated_at,
                action_type,
                now
            )
        )
        await db.commit()


async def get_event_modifications(event_id: int = None, limit: int = 100) -> List[dict]:
    """Get event modification history for undo."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        if event_id:
            async with db.execute(
                "SELECT * FROM event_modifications WHERE event_id = ? ORDER BY modified_at DESC LIMIT ?",
                (event_id, limit)
            ) as cursor:
                rows = await cursor.fetchall()
        else:
            async with db.execute(
                "SELECT * FROM event_modifications ORDER BY modified_at DESC LIMIT ?",
                (limit,)
            ) as cursor:
                rows = await cursor.fetchall()
        return [dict(row) for row in rows]


async def undo_event_modification(modification_id: int) -> Optional[Event]:
    """Restore an event to a previous state from modification backup."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM event_modifications WHERE id = ?",
            (modification_id,)
        ) as cursor:
            row = await cursor.fetchone()
            if not row:
                return None
            
            row_dict = dict(row)
            # Restore event to previous state
            event_id = row_dict['event_id']
            existing = await get_event(event_id)
            if not existing:
                return None
            
            restored_event = Event(
                id=event_id,
                title=row_dict['title'],
                start_time=datetime.fromisoformat(row_dict['start_time']) if row_dict['start_time'] else None,
                end_time=datetime.fromisoformat(row_dict['end_time']) if row_dict['end_time'] else None,
                category_id=row_dict['category_id'],
                all_day=bool(row_dict['all_day']),
                recurrence=row_dict['recurrence'],
                status=row_dict['status'],
                reminder_enabled=bool(row_dict['reminder_enabled']),
                reminder_minutes=row_dict['reminder_minutes'],
                is_test=bool(row_dict['is_test']),
                goal_id=row_dict['goal_id'],
                created_at=datetime.fromisoformat(row_dict['created_at']) if row_dict['created_at'] else existing.created_at,
                updated_at=datetime.now(),
            )
            
            updated = await update_event(event_id, restored_event)
            
            # Remove this modification from history (since we're back to that state)
            await db.execute("DELETE FROM event_modifications WHERE id = ?", (modification_id,))
            await db.commit()
            
            return updated


async def create_event_history(history: EventHistory) -> EventHistory:
    """Create a new event history entry."""
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            """INSERT INTO event_history (event_id, action, field_name, old_value, new_value, created_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                history.event_id,
                history.action,
                history.field_name,
                history.old_value,
                history.new_value,
                now,
            ),
        )
        await db.commit()
        history.id = cursor.lastrowid
        history.created_at = datetime.now()
    return history


async def get_event_history(event_id: int) -> List[EventHistory]:
    """Get all history entries for a specific event."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """SELECT * FROM event_history WHERE event_id = ? ORDER BY created_at DESC""",
            (event_id,),
        ) as cursor:
            rows = await cursor.fetchall()
            return [
                EventHistory(
                    id=row["id"],
                    event_id=row["event_id"],
                    action=row["action"],
                    field_name=row["field_name"] or "",
                    old_value=row["old_value"] or "",
                    new_value=row["new_value"] or "",
                    created_at=datetime.fromisoformat(row["created_at"]) if row["created_at"] else None,
                )
                for row in rows
            ]


async def get_all_event_history(limit: int = 100, offset: int = 0) -> List[EventHistory]:
    """Get all history entries across all events."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """SELECT * FROM event_history ORDER BY created_at DESC LIMIT ? OFFSET ?""",
            (limit, offset),
        ) as cursor:
            rows = await cursor.fetchall()
            return [
                EventHistory(
                    id=row["id"],
                    event_id=row["event_id"],
                    action=row["action"],
                    field_name=row["field_name"] or "",
                    old_value=row["old_value"] or "",
                    new_value=row["new_value"] or "",
                    created_at=datetime.fromisoformat(row["created_at"]) if row["created_at"] else None,
                )
                for row in rows
            ]


async def delete_event_history(event_id: int) -> int:
    """Delete all history for a specific event."""
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "DELETE FROM event_history WHERE event_id = ?",
            (event_id,),
        )
        await db.commit()
        return cursor.rowcount


async def complete_events_by_title(title: str) -> int:
    """Mark all pending events matching title as completed."""
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "UPDATE events SET status = 'done', updated_at = ? WHERE title LIKE ? AND status = 'pending'",
            (now, f"%{title}%")
        )
        await db.commit()
        return cursor.rowcount


async def uncomplete_events_by_title(title: str) -> int:
    """Mark all done events matching title as pending."""
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "UPDATE events SET status = 'pending', updated_at = ? WHERE title LIKE ? AND status = 'done'",
            (now, f"%{title}%")
        )
        await db.commit()
        return cursor.rowcount


async def update_event_time_by_title(title: str, new_start_time: datetime) -> int:
    """Update start_time of the first pending event matching title."""
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            """UPDATE events SET start_time = ?, updated_at = ?
               WHERE title = ? AND status = 'pending' AND id = (
                   SELECT id FROM events WHERE title = ? AND status = 'pending' LIMIT 1
               )""",
            (new_start_time.isoformat(), now, title, title),
        )
        await db.commit()
        return cursor.rowcount


async def update_event_by_title(title: str, new_title: str = None, new_start_time: datetime = None, duration_minutes: int = None) -> int:
    """Update event fields (title/time/duration) by title keyword.
    
    Args:
        title: Original title to match (partial match)
        new_title: New title (if None, keep original)
        new_start_time: New start time (if None, keep original)
        duration_minutes: New duration (if None, keep original)
    
    Returns:
        Number of events updated
    """
    now = datetime.now().isoformat()
    
    # Build dynamic UPDATE query
    updates = ["updated_at = ?"]
    params = [now]
    
    if new_title and new_title != title:
        updates.append("title = ?")
        params.append(new_title)
    
    if new_start_time:
        updates.append("start_time = ?")
        params.append(new_start_time.isoformat())
        # Also update end_time if start_time changes
        if duration_minutes is not None:
            new_end_time = new_start_time + timedelta(minutes=duration_minutes)
            updates.append("end_time = ?")
            params.append(new_end_time.isoformat())
    
    # Find and update the first matching pending event
    async with aiosqlite.connect(DB_PATH) as db:
        # Build WHERE clause to find the event
        where_clause = "title LIKE ? AND status = 'pending'"
        where_params = [f"%{title}%"]
        
        query = f"""UPDATE events SET {', '.join(updates)}
                    WHERE {where_clause} AND id = (
                        SELECT id FROM events WHERE {where_clause} LIMIT 1
                    )"""
        params.extend(where_params)
        
        cursor = await db.execute(query, params)
        await db.commit()
        return cursor.rowcount


async def move_event_by_title(title: str, new_start_time: datetime) -> int:
    """Move event to a different day while keeping the time.
    
    Args:
        title: Title to match (partial match)
        new_start_time: New datetime (date changed, time typically preserved)
    
    Returns:
        Number of events updated
    """
    now = datetime.now().isoformat()
    
    # Get the original event to preserve time
    events = await get_events_by_title(title)
    if not events:
        return 0
    
    # Find the first pending event
    original = None
    for e in events:
        if e.status == "pending":
            original = e
            break
    
    if not original:
        return 0
    
    # Extract hour and minute from original, apply to new date
    orig_start = original.start_time
    orig_end = original.end_time
    
    # Parse datetime strings to datetime objects if needed
    if isinstance(orig_start, str):
        orig_start_dt = datetime.fromisoformat(orig_start)
    else:
        orig_start_dt = orig_start
    
    if orig_end:
        if isinstance(orig_end, str):
            orig_end_dt = datetime.fromisoformat(orig_end)
        else:
            orig_end_dt = orig_end
    else:
        orig_end_dt = None
    
    if orig_start_dt:
        new_dt = new_start_time.replace(hour=orig_start_dt.hour, minute=orig_start_dt.minute, second=orig_start_dt.second)
    else:
        new_dt = new_start_time.replace(hour=9, minute=0, second=0)
    
    # Calculate new end_time if original had duration
    new_end_time = None
    if orig_start_dt and orig_end_dt:
        duration = orig_end_dt - orig_start_dt
        new_end_time = new_dt + duration
    elif orig_start_dt:
        # Default 30 min duration
        new_end_time = new_dt + timedelta(minutes=30)
    
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            """UPDATE events SET start_time = ?, end_time = ?, updated_at = ?
               WHERE id = ?""",
            (new_dt.isoformat(), new_end_time.isoformat() if new_end_time else None, now, original.id),
        )
        await db.commit()
        return cursor.rowcount


async def postpone_remaining_events_preview(today_str: Optional[str] = None, from_time: Optional[str] = None,
                                              target_date: Optional[str] = None, target_time: str = "09:00") -> dict:
    """Preview what postpone_remaining_events would do, without modifying the database.

    Args:
        target_date: If set, push events to this date (YYYY-MM-DD) instead of starting from now.
        target_time: Starting time on target_date (default 09:00).

    Returns:
        {"moved": int, "details": [...], "message": str}
    """
    from datetime import date
    now = datetime.now()
    if not today_str:
        today_str = date.today().isoformat()
    if not from_time:
        from_time = now.strftime("%H:%M")

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """SELECT id, title, start_time, end_time, is_test
            FROM events WHERE status = 'pending'
            AND start_time >= ? AND start_time <= ?
            ORDER BY start_time ASC""",
            (f"{today_str}T00:00:00", f"{today_str}T23:59:59"),
        ) as cursor:
            rows = await cursor.fetchall()

    # Calculate anchor time: if target_date is provided, start from that date
    if target_date:
        anchor_dt = datetime.fromisoformat(f"{target_date}T{target_time}:00")
    else:
        anchor_dt = now

    remaining = rows
    if not remaining:
        return {"moved": 0, "details": [], "message": "今天没有待进行的日程"}

    cursor_time = anchor_dt
    details = []
    for row in remaining:
        event_start = datetime.fromisoformat(row["start_time"]) if isinstance(row["start_time"], str) else row["start_time"]
        event_end = datetime.fromisoformat(row["end_time"]) if row["end_time"] and isinstance(row["end_time"], str) else None
        if event_end is None:
            duration = timedelta(minutes=30)
        else:
            ev_end = datetime.fromisoformat(row["end_time"]) if isinstance(row["end_time"], str) else row["end_time"]
            duration = ev_end - event_start

        new_start = cursor_time
        new_end = new_start + duration
        details.append({
            "id": row["id"],
            "title": row["title"],
            "old_start": event_start.isoformat() if isinstance(event_start, datetime) else str(event_start),
            "new_start": new_start.isoformat(),
        })
        cursor_time = new_end

    return {"moved": len(details), "details": details[:3], "message": ""}


async def postpone_remaining_events(today_str: Optional[str] = None, from_time: Optional[str] = None,
                                     target_date: Optional[str] = None, target_time: str = "09:00") -> dict:
    """Postpone all pending events today after 'from_time' to start sequentially from now.
    
    Args:
        today_str: Date string 'YYYY-MM-DD', defaults to today
        from_time: 'HH:MM' to identify which events remain (after this time)
        target_date: If set, push events to this date instead of starting from now.
        target_time: Starting time on target_date (default 09:00).
    
    Returns:
        {"moved": int, "details": [...]}
    """
    from datetime import date
    now = datetime.now()
    if not today_str:
        today_str = date.today().isoformat()
    if not from_time:
        from_time = now.strftime("%H:%M")
    
    # Parse from_time to a datetime for comparison
    from_dt = datetime.fromisoformat(f"{today_str}T{from_time}:00")
    
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        # First check: any events at all today?
        async with db.execute(
            """SELECT id FROM events
            WHERE start_time >= ? AND start_time <= ?
            LIMIT 1""",
            (f"{today_str}T00:00:00", f"{today_str}T23:59:59"),
        ) as cursor:
            has_any = await cursor.fetchone()
        
        async with db.execute(
            """SELECT id, title, start_time, end_time, is_test
               FROM events WHERE status = 'pending'
               AND start_time >= ? AND start_time <= ?
               ORDER BY start_time ASC""",
            (f"{today_str}T00:00:00", f"{today_str}T23:59:59"),
        ) as cursor:
            rows = await cursor.fetchall()
    
    # Filter: include all pending events (user may have overslept and wants ALL remaining to shift)
    remaining = rows
    
    if not remaining:
        if not has_any:
            return {"moved": 0, "details": [], "message": "今天没有任何日程"}
        return {"moved": 0, "details": [], "message": "今天没有待进行的日程"}
    # Calculate anchor time: if target_date is specified, start from that date morning
    if target_date:
        anchor_dt = datetime.fromisoformat(f"{target_date}T{target_time}:00")
    else:
        anchor_dt = now
    
    # Calculate deltas: each event shifts from where its predecessor would end
    cursor_time = anchor_dt
    details = []
    moved = 0
    updated_at = datetime.now().isoformat()
    
    async with aiosqlite.connect(DB_PATH) as db:
        for row in remaining:
            event_start = datetime.fromisoformat(row["start_time"]) if isinstance(row["start_time"], str) else row["start_time"]
            event_end = datetime.fromisoformat(row["end_time"]) if row["end_time"] and (isinstance(row["end_time"], str) or True) else None
            if event_end is None:
                duration = timedelta(minutes=30)
            else:
                end_str = row["end_time"]
                ev_end = datetime.fromisoformat(end_str) if isinstance(end_str, str) else end_str
                duration = ev_end - event_start
            
            new_start = cursor_time
            new_end = new_start + duration
            
            await db.execute(
                """UPDATE events SET start_time = ?, end_time = ?, updated_at = ? WHERE id = ?""",
                (new_start.isoformat(), new_end.isoformat(), updated_at, row["id"]),
            )
            details.append({
                "id": row["id"],
                "title": row["title"],
                "old_start": event_start.isoformat() if isinstance(event_start, datetime) else str(event_start),
                "old_end": (event_start + duration).isoformat(),
                "new_start": new_start.isoformat(),
                "new_end": new_end.isoformat(),
            })
            cursor_time = new_end
            moved += 1
        await db.commit()
    
    return {"moved": moved, "details": details}


async def undo_postpone_events(details: list) -> dict:
    """Undo a postpone operation by restoring original start/end times.

    Args:
        details: List of dicts with {id, old_start, old_end} to restore.

    Returns:
        {"restored": int}
    """
    restored = 0
    updated_at = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        for item in details:
            event_id = item.get("id")
            old_start = item.get("old_start")
            if not event_id or not old_start:
                continue
            # Calculate old_end from old_start + duration, or use provided old_end
            old_end = item.get("old_end")
            if not old_end:
                # Default: keep 1 hour if no end time stored
                old_start_dt = datetime.fromisoformat(old_start) if isinstance(old_start, str) else old_start
                old_end = (old_start_dt + timedelta(hours=1)).isoformat()
            await db.execute(
                """UPDATE events SET start_time = ?, end_time = ?, updated_at = ? WHERE id = ?""",
                (old_start, old_end, updated_at, event_id),
            )
            restored += 1
        await db.commit()
    return {"restored": restored}


async def get_events_by_title(title: str) -> List["Event"]:
    """Get all events matching title (partial match)."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """SELECT id, title, start_time, end_time, category_id, all_day, 
               recurrence, status, created_at, updated_at, 
               reminder_enabled, reminder_minutes, reminder_sent, is_test
               FROM events WHERE title LIKE ? ORDER BY start_time""",
            (f"%{title}%",),
        ) as cursor:
            rows = await cursor.fetchall()
            return [Event(**dict(row)) for row in rows]


async def complete_event(event_id: int) -> Optional[Event]:
    """Mark an event as completed and record duration for learning."""
    event = await get_event(event_id)
    if not event:
        return None
    event.status = "done"
    event.completed_at = datetime.now()
    updated = await update_event(event_id, event)
    
    # Record duration for learning (only if event had a start_time)
    if event.start_time:
        estimated = None
        if event.end_time and event.start_time:
            estimated = int((event.end_time - event.start_time).total_seconds() / 60)
        actual = int((event.completed_at - event.start_time).total_seconds() / 60) if event.completed_at else None
        
        await record_task_duration(
            title=event.title,
            category_id=event.category_id or "work",
            estimated_minutes=estimated,
            actual_minutes=actual if actual is not None and actual >= 0 else None,
            start_time=event.start_time,
            completed_at=event.completed_at,
            status="done"
        )
    
    return updated


async def uncomplete_event(event_id: int) -> Optional[Event]:
    """Mark an event back to pending (undo completion)."""
    event = await get_event(event_id)
    if not event:
        return None
    event.status = "pending"
    event.completed_at = None
    return await update_event(event_id, event)


async def get_task_durations(category: str | None = None, limit: int = 200) -> list:
    """Get task duration records for learning."""
    from .models import TaskDuration
    async with aiosqlite.connect(DB_PATH) as db:
        if category:
            cursor = await db.execute(
                "SELECT * FROM task_durations WHERE category_id = ? ORDER BY created_at DESC LIMIT ?",
                (category, limit)
            )
        else:
            cursor = await db.execute(
                "SELECT * FROM task_durations ORDER BY created_at DESC LIMIT ?",
                (limit,)
            )
        rows = await cursor.fetchall()
        return [TaskDuration(**dict(zip([col[0] for col in cursor.description], row))) for row in rows]


async def record_task_duration(title: str, category_id: str, estimated_minutes: int | None, 
                                actual_minutes: int | None, start_time: datetime, 
                                completed_at: datetime, status: str) -> TaskDuration:
    """Record a completed task's duration for future learning."""
    from .models import TaskDuration
    async with aiosqlite.connect(DB_PATH) as db:
        now = datetime.now().isoformat()
        cursor = await db.execute(
            """INSERT INTO task_durations (title, category_id, estimated_minutes, actual_minutes, start_time, completed_at, created_at, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (title.lower().strip(), category_id, estimated_minutes, actual_minutes, 
             start_time.isoformat() if start_time else None, completed_at.isoformat() if completed_at else None, now, status)
        )
        await db.commit()
        row_id = cursor.lastrowid
        return TaskDuration(id=row_id, title=title.lower().strip(), category_id=category_id,
                           estimated_minutes=estimated_minutes, actual_minutes=actual_minutes,
                           start_time=start_time, completed_at=completed_at, created_at=datetime.now(), status=status)


async def get_learning_patterns() -> list:
    """Get all learning patterns."""
    from .models import LearningPattern
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("SELECT * FROM learning_patterns ORDER BY confidence DESC")
        rows = await cursor.fetchall()
        return [LearningPattern(**dict(zip([col[0] for col in cursor.description], row))) for row in rows]


async def save_learning_pattern(pattern_type: str, pattern_text: str, confidence: float, sample_count: int):
    """Save a new learning pattern."""
    from .models import LearningPattern
    async with aiosqlite.connect(DB_PATH) as db:
        now = datetime.now().isoformat()
        cursor = await db.execute(
            """INSERT INTO learning_patterns (pattern_type, pattern_text, confidence, sample_count, created_at)
               VALUES (?, ?, ?, ?, ?)""",
            (pattern_type, pattern_text, confidence, sample_count, now)
        )
        await db.commit()
        return LearningPattern(id=cursor.lastrowid, pattern_type=pattern_type, pattern_text=pattern_text,
                              confidence=confidence, sample_count=sample_count, created_at=datetime.now())


async def delete_learning_pattern(pattern_id: int) -> bool:
    """Delete a learning pattern."""
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("DELETE FROM learning_patterns WHERE id = ?", (pattern_id,))
        await db.commit()
        return cursor.rowcount > 0


async def get_learning_stats() -> dict:
    """Get learning system statistics."""
    async with aiosqlite.connect(DB_PATH) as db:
        cur1 = await db.execute("SELECT COUNT(*) FROM task_durations")
        duration_count = (await cur1.fetchone())[0]
        cur2 = await db.execute("SELECT COUNT(*) FROM learning_patterns")
        pattern_count = (await cur2.fetchone())[0]
        cur3 = await db.execute("SELECT AVG(actual_minutes) FROM task_durations WHERE actual_minutes IS NOT NULL")
        avg_actual = (await cur3.fetchone())[0]
        return {
            "total_records": duration_count,
            "total_patterns": pattern_count,
            "avg_actual_duration": round(avg_actual, 1) if avg_actual else 0
        }


async def batch_complete_events(start: datetime | None = None, end: datetime | None = None) -> int:
    """Batch mark events as done. Returns affected row count."""
    now = datetime.now()
    async with aiosqlite.connect(DB_PATH) as db:
        if start and end:
            # Get matching events first for duration recording
            rows = await db.execute(
                "SELECT * FROM events WHERE start_time >= ? AND start_time < ? AND status != 'done'",
                (start.isoformat(), end.isoformat())
            )
        else:
            rows = await db.execute(
                "SELECT * FROM events WHERE status != 'done'"
            )
        events = await rows.fetchall()
        
        if not events:
            return 0
        
        # Record durations for all events being completed
        for event_row in events:
            event_start = datetime.fromisoformat(event_row['start_time']) if event_row['start_time'] else None
            estimated = None
            if event_start and event_row['end_time']:
                event_end = datetime.fromisoformat(event_row['end_time'])
                estimated = int((event_end - event_start).total_seconds() / 60)
            
            actual = int((now - event_start).total_seconds() / 60) if event_start else None
            
            # Record duration if we have a start_time
            if event_start:
                await db.execute(
                    """INSERT INTO task_durations (title, category_id, estimated_minutes, actual_minutes, start_time, completed_at, created_at, status)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                    (event_row['title'].lower().strip(), event_row['category_id'] or 'work', estimated,
                     actual if actual is not None and actual >= 0 else None, event_start.isoformat(), now.isoformat(), now.isoformat(), 'done')
                )
        
        # Now batch update
        if start and end:
            cursor = await db.execute(
                """UPDATE events
                   SET status = 'done', updated_at = ?, completed_at = ?
                   WHERE start_time >= ? AND start_time < ? AND status != 'done'""",
                (now.isoformat(), now.isoformat(), start.isoformat(), end.isoformat())
            )
        else:
            cursor = await db.execute(
                """UPDATE events
                   SET status = 'done', updated_at = ?, completed_at = ?
                   WHERE status != 'done'""",
                (now.isoformat(), now.isoformat())
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
                priority=row["priority"] if "priority" in list(row.keys()) else "none",
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
                    priority=row["priority"] if "priority" in list(row.keys()) else "none",
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
    """Batch delete events. Returns affected row count."""
    async with aiosqlite.connect(DB_PATH) as db:
        if start and end:
            cursor = await db.execute(
                "DELETE FROM events WHERE start_time >= ? AND start_time < ?",
                (start.isoformat(), end.isoformat()),
            )
        else:
            cursor = await db.execute("DELETE FROM events")
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


