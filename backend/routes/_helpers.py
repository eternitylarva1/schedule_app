"""Shared helpers for route handlers."""
from aiohttp import web
from typing import Any
from datetime import datetime, timedelta

"""Imports from parent backend package."""
from .. import db
from ..models import Event, EventHistory, Goal, GoalConversation, Note, Expense, CATEGORIES, EXPENSE_CATEGORIES, NoteGroup, Budget, ErrorLog


# ============= Top-level helpers (L13-37) =============

"""json_response and error_response."""
def json_response(data: Any, code: int = 0) -> web.Response:
    """Create JSON response with standard format."""
    return web.json_response({
        "code": code,
        "data": data,
    })


def error_response(message: str, code: int = 1) -> web.Response:
    """Create error JSON response."""
    return web.json_response({
        "code": code,
        "message": message,
    })


def _sanitize_ai_provider(provider: dict) -> dict:
    """Hide sensitive api_key when returning provider payload."""
    safe = dict(provider)
    raw_key = (safe.get("api_key") or "").strip()
    safe["has_api_key"] = bool(raw_key)
    safe["api_key"] = f"{raw_key[:3]}-****" if raw_key else ""
    return safe





# ============= Internal helpers (L704-755) =============

"""Stats update helpers called by LLM operations."""

def _update_event_stats(stats, action, affected):
    if action == "event_create":
        stats["events_created"] += affected
    elif action == "event_update":
        stats["events_updated"] += affected
    elif action == "event_move":
        stats["events_moved"] += affected
    elif action == "event_delete":
        stats["events_deleted"] += affected
    elif action == "event_complete":
        stats["events_completed"] += affected
    elif action == "event_uncomplete":
        stats["events_uncompleted"] += affected
    elif action == "event_query":
        stats["events_queried"] += affected
    elif action == "event_postpone":
        stats["events_moved"] += affected


def _update_expense_stats(stats, action, affected):
    if action == "expense_create":
        stats["expenses_created"] += affected
    elif action == "expense_update":
        stats["expenses_updated"] += affected
    elif action == "expense_delete":
        stats["expenses_deleted"] += affected
    elif action == "expense_query":
        stats["expenses_queried"] += affected


def _update_note_stats(stats, action, affected):
    if action == "note_create":
        stats["notes_created"] += affected
    elif action == "note_update":
        stats["notes_updated"] += affected
    elif action == "note_delete":
        stats["notes_deleted"] += affected
    elif action == "note_query":
        stats["notes_queried"] += affected


def _update_goal_stats(stats, action, affected):
    if action == "goal_create":
        stats["goals_created"] += affected
    elif action == "goal_update":
        stats["goals_updated"] += affected
    elif action == "goal_delete":
        stats["goals_deleted"] += affected
    elif action == "goal_query":
        stats["goals_queried"] += affected





# ============= Operation handlers (L756-1306) =============

"""Generic operation handlers used by LLM modules (_handle_event_operation, _handle_expense_operation, _handle_note_operation, _handle_goal_operation)."""

async def _handle_event_operation(op, action, user_text, dry_run):
    """Handle event domain operations."""
    # event_create
    if action == "event_create":
        title = (op.get("title") or user_text).strip()
        category_id = str(op.get("category_id") or "work")
        if category_id not in {"work", "life", "study", "health"}:
            category_id = "work"

        start_time = _parse_datetime(op.get("start_time"))
        if not start_time:
            deadline_dt = _extract_deadline_from_text(user_text)
            if deadline_dt and not _has_explicit_clock_time_in_text(user_text):
                start_time = None
        
        if not start_time:
            now = datetime.now()
            import re
            user_text_lower = user_text.lower()
            if '今晚' in user_text or '今晚' in user_text_lower:
                hour = 20
                hour_match = re.search(r'(\d{1,2})\s*点', user_text)
                if hour_match:
                    hour = int(hour_match.group(1))
                is_today = '今' in user_text[:3] or '今天' in user_text
                start_time = now.replace(hour=hour, minute=0, second=0, microsecond=0) if is_today else now.replace(hour=hour, minute=0, second=0, microsecond=0) + timedelta(days=1 if now.hour > hour else 0)
            elif '明晚' in user_text or '明晚' in user_text_lower:
                start_time = now.replace(hour=20, minute=0, second=0, microsecond=0) + timedelta(days=1)
            elif '晚上' in user_text or '晚上' in user_text_lower:
                hour_match = re.search(r'(\d{1,2})\s*点', user_text)
                hour = int(hour_match.group(1)) if hour_match else 18
                start_time = now.replace(hour=hour, minute=0, second=0, microsecond=0)

        if not start_time:
            deadline_label = _extract_deadline_label_from_text(user_text)
            if deadline_label and not _has_explicit_clock_time_in_text(user_text):
                title = _append_deadline_label(title, deadline_label)

        try:
            duration_minutes = int(op.get("duration_minutes", 30))
        except Exception:
            duration_minutes = 30
        duration_minutes = max(5, min(24 * 60, duration_minutes))

        end_time = start_time + timedelta(minutes=duration_minutes) if start_time else None

        preview = {
            "domain": "event",
            "action": "event_create",
            "title": title,
            "start_time": start_time.isoformat() if start_time else None,
            "duration_minutes": duration_minutes,
            "category_id": category_id,
        }
        
        if dry_run:
            return {"preview": preview}
        
        event = Event(
            title=title,
            start_time=start_time,
            end_time=end_time,
            category_id=category_id,
            all_day=False,
            recurrence="none",
            status="pending",
        )
        created = await db.create_event(event)
        preview["id"] = created.id
        return {"preview": preview, "created": created.to_dict(), "affected": 1}
    
    # event_update
    if action == "event_update":
        original_title = (op.get("original_title") or "").strip()
        new_title = (op.get("title") or original_title).strip()
        new_start_time = _parse_datetime(op.get("start_time"))
        duration_minutes = op.get("duration_minutes")
        if duration_minutes is not None:
            try:
                duration_minutes = int(duration_minutes)
            except (ValueError, TypeError):
                duration_minutes = None

        if not new_start_time and (new_title == original_title or not new_title) and duration_minutes is None:
            return {"preview": {"domain": "event", "action": "event_update", "error": "缺少要修改的内容"}}

        preview = {
            "domain": "event",
            "action": "event_update",
            "title": new_title,
            "original_title": original_title,
            "start_time": new_start_time.isoformat() if new_start_time else None,
            "duration_minutes": duration_minutes,
        }
        
        if dry_run:
            return {"preview": preview}
        
        affected = await db.update_event_by_title(original_title, new_title, new_start_time, duration_minutes)
        return {"preview": preview, "affected": affected}
    
    # event_move
    if action == "event_move":
        original_title = (op.get("original_title") or "").strip()
        new_start_time = _parse_datetime(op.get("start_time"))
        if not new_start_time:
            return {"preview": {"domain": "event", "action": "event_move", "error": "缺少目标时间"}}

        preview = {
            "domain": "event",
            "action": "event_move",
            "original_title": original_title,
            "start_time": new_start_time.isoformat(),
        }
        
        if dry_run:
            return {"preview": preview}
        
        affected = await db.move_event_by_title(original_title, new_start_time)
        return {"preview": preview, "affected": affected}
    
    # event_query
    if action == "event_query":
        target_title = (op.get("target_title") or "").strip()
        date_range = str(op.get("date_range") or "all").strip().lower()
        scope = str(op.get("scope") or date_range or "all").strip().lower()
        
        preview = {
            "domain": "event",
            "action": "event_query",
            "target_title": target_title if target_title else None,
            "date_range": scope,
        }
        
        if dry_run:
            return {"preview": preview}
        
        # Get events based on filter
        events = await db.get_events(scope if scope in ("today", "week", "month", "all") else "all")
        # Filter by title if provided
        if target_title:
            events = [e for e in events if target_title in (e.title or "")]
        
        return {"preview": preview, "affected": len(events), "data": [e.to_dict() for e in events]}
    
    # event_postpone
    if action == "event_postpone":
        preview = {
            "domain": "event",
            "action": "event_postpone",
        }
        target_date = op.get("target_date", "").strip() or None
        target_time = op.get("target_time", "09:00").strip() or "09:00"
        
        if dry_run:
            result = await db.postpone_remaining_events_preview(
                target_date=target_date, target_time=target_time)
            preview["affected"] = result.get("moved", 0)
            preview["details"] = result.get("details", [])[:3]
            preview["message"] = result.get("message", "")
            return {"preview": preview}

        from datetime import date
        result = await db.postpone_remaining_events(
            target_date=target_date, target_time=target_time)
        return {"preview": {**preview, **result}, "affected": result.get("moved", 0)}
    
    # event_delete / event_complete / event_uncomplete
    if action in ("event_delete", "event_complete", "event_uncomplete"):
        target_title = (op.get("target_title") or op.get("title") or "").strip()
        scope = str(op.get("scope") or "title").strip().lower()
        
        if not target_title and scope == "title":
            import re
            match = re.search(r'[删完]除.*?的[待办事]', user_text)
            if match:
                title_match = re.search(r'[删完]除(.+?)的', match.group())
                if title_match:
                    target_title = title_match.group(1).strip()

        preview = {
            "domain": "event",
            "action": action,
            "target_title": target_title if target_title else None,
            "scope": scope,
        }
        
        if dry_run:
            return {"preview": preview}
        
        if target_title:
            if action == "event_delete":
                affected = await db.delete_events_by_title(target_title)
            elif action == "event_complete":
                affected = await db.complete_events_by_title(target_title)
            else:
                affected = await db.uncomplete_events_by_title(target_title)
        else:
            if action == "event_delete":
                affected = await db.batch_delete_events(None, None)
            elif action == "event_complete":
                affected = await db.batch_complete_events(None, None)
            else:
                affected = await db.batch_uncomplete_events(None, None)
        
        return {"preview": preview, "affected": affected}
    
    return None


async def _handle_expense_operation(op, action, user_text, dry_run):
    """Handle expense domain operations."""
    from ..models import Expense
    
    # expense_create
    if action == "expense_create":
        amount = op.get("amount")
        if amount is not None:
            try:
                amount = float(amount)
            except (ValueError, TypeError):
                amount = 0.0
        
        expense_category = str(op.get("expense_category") or "other")
        if expense_category not in {"food", "transport", "shopping", "other"}:
            expense_category = "other"
        
        note = op.get("note") or op.get("title") or ""
        
        preview = {
            "domain": "expense",
            "action": "expense_create",
            "amount": amount,
            "expense_category": expense_category,
            "note": note,
        }
        
        if dry_run:
            return {"preview": preview}
        
        expense = Expense(
            amount=amount,
            category=expense_category,
            note=note,
        )
        created = await db.create_expense(expense)
        preview["id"] = created.id
        return {"preview": preview, "created": created.to_dict(), "affected": 1}
    
    # expense_update
    if action == "expense_update":
        target_title = (op.get("target_title") or op.get("note") or "").strip()
        if not target_title:
            target_title = op.get("title") or ""
        
        updates = {}
        if op.get("amount") is not None:
            try:
                updates["amount"] = float(op["amount"])
            except (ValueError, TypeError):
                pass
        if op.get("expense_category"):
            updates["category"] = op["expense_category"]
        if op.get("note"):
            updates["note"] = op["note"]
        
        preview = {
            "domain": "expense",
            "action": "expense_update",
            "target_title": target_title,
            "updates": updates,
        }
        
        if dry_run:
            return {"preview": preview}
        
        # Find and update expense by note content
        expenses = await db.get_expenses_by_note(target_title)
        affected = 0
        for exp in expenses:
            for key, value in updates.items():
                setattr(exp, key, value)
            await db.update_expense(exp.id, exp)
            affected += 1
        
        return {"preview": preview, "affected": affected}
    
    # expense_query
    if action == "expense_query":
        target_title = (op.get("target_title") or op.get("note") or "").strip()
        expense_category = str(op.get("expense_category") or "").strip()
        
        preview = {
            "domain": "expense",
            "action": "expense_query",
            "target_title": target_title if target_title else None,
            "expense_category": expense_category if expense_category else None,
        }
        
        if dry_run:
            return {"preview": preview}
        
        expenses = await db.get_expenses("month")
        # Filter by note if provided
        if target_title:
            expenses = [e for e in expenses if target_title in (e.note or "")]
        # Filter by category if provided
        if expense_category:
            expenses = [e for e in expenses if e.category == expense_category]
        
        return {"preview": preview, "affected": len(expenses), "data": [e.to_dict() for e in expenses]}
    
    # expense_delete
    if action == "expense_delete":
        target_title = (op.get("target_title") or op.get("note") or "").strip()
        if not target_title:
            target_title = op.get("title") or ""
        
        preview = {
            "domain": "expense",
            "action": "expense_delete",
            "target_title": target_title,
        }
        
        if dry_run:
            return {"preview": preview}
        
        expenses = await db.get_expenses_by_note(target_title)
        affected = 0
        for exp in expenses:
            await db.delete_expense(exp.id)
            affected += 1
        
        return {"preview": preview, "affected": affected}
    
    return None


async def _handle_note_operation(op, action, user_text, dry_run):
    """Handle note domain operations."""
    from ..models import Note
    
    # note_create
    if action == "note_create":
        title = op.get("title") or user_text
        content = op.get("note_content") or op.get("content") or ""
        
        preview = {
            "domain": "note",
            "action": "note_create",
            "title": title,
            "note_content": content,
        }
        
        if dry_run:
            return {"preview": preview}
        
        note = Note(title=title, content=content)
        created = await db.create_note(note)
        preview["id"] = created.id
        return {"preview": preview, "created": created.to_dict(), "affected": 1}
    
    # note_update
    if action == "note_update":
        target_title = (op.get("target_title") or "").strip()
        if not target_title:
            target_title = op.get("title") or ""
        
        updates = {}
        if op.get("title"):
            updates["title"] = op["title"]
        if op.get("note_content") or op.get("content"):
            updates["content"] = op.get("note_content") or op.get("content")
        
        preview = {
            "domain": "note",
            "action": "note_update",
            "target_title": target_title,
            "updates": updates,
        }
        
        if dry_run:
            return {"preview": preview}
        
        notes = await db.get_notes_by_title(target_title)
        affected = 0
        for n in notes:
            for key, value in updates.items():
                setattr(n, key, value)
            await db.update_note(n.id, n)
            affected += 1
        
        return {"preview": preview, "affected": affected}
    
    # note_query
    if action == "note_query":
        target_title = (op.get("target_title") or "").strip()
        
        preview = {
            "domain": "note",
            "action": "note_query",
            "target_title": target_title if target_title else None,
        }
        
        if dry_run:
            return {"preview": preview}
        
        notes = await db.get_notes()
        # Filter by title if provided
        if target_title:
            notes = [n for n in notes if target_title in (n.title or "") or target_title in (n.content or "")]
        
        return {"preview": preview, "affected": len(notes), "data": [n.to_dict() for n in notes]}
    
    # note_delete
    if action == "note_delete":
        target_title = (op.get("target_title") or "").strip()
        if not target_title:
            target_title = op.get("title") or ""
        
        preview = {
            "domain": "note",
            "action": "note_delete",
            "target_title": target_title,
        }
        
        if dry_run:
            return {"preview": preview}
        
        notes = await db.get_notes_by_title(target_title)
        affected = 0
        for n in notes:
            await db.delete_note(n.id)
            affected += 1
        
        return {"preview": preview, "affected": affected}
    
    return None


async def _handle_goal_operation(op, action, user_text, dry_run):
    """Handle goal domain operations."""
    from ..models import Goal
    
    # goal_create
    if action == "goal_create":
        title = op.get("title") or user_text
        description = op.get("description") or ""
        horizon = op.get("horizon") or "short"
        if horizon not in {"short", "semester", "long"}:
            horizon = "short"
        
        preview = {
            "domain": "goal",
            "action": "goal_create",
            "title": title,
            "description": description,
            "horizon": horizon,
        }
        
        if dry_run:
            return {"preview": preview}
        
        goal = Goal(
            title=title,
            description=description,
            horizon=horizon,
            status="active",
        )
        created = await db.create_goal(goal)
        preview["id"] = created.id
        return {"preview": preview, "created": created.to_dict(), "affected": 1}
    
    # goal_update
    if action == "goal_update":
        target_title = (op.get("target_title") or "").strip()
        if not target_title:
            target_title = op.get("title") or ""
        
        goal_status = op.get("goal_status")
        if goal_status and goal_status not in {"active", "done", "cancelled"}:
            goal_status = "active"
        
        preview = {
            "domain": "goal",
            "action": "goal_update",
            "target_title": target_title,
            "goal_status": goal_status,
        }
        
        if dry_run:
            return {"preview": preview}
        
        goals = await db.get_goals_by_title(target_title)
        affected = 0
        for g in goals:
            if goal_status:
                g.status = goal_status
            await db.update_goal(g.id, g)
            affected += 1
        
        return {"preview": preview, "affected": affected}
    
    # goal_query
    if action == "goal_query":
        target_title = (op.get("target_title") or "").strip()
        horizon = str(op.get("horizon") or "").strip()
        goal_status = str(op.get("goal_status") or "").strip()
        
        preview = {
            "domain": "goal",
            "action": "goal_query",
            "target_title": target_title if target_title else None,
            "horizon": horizon if horizon else None,
            "goal_status": goal_status if goal_status else None,
        }
        
        if dry_run:
            return {"preview": preview}
        
        goals = await db.get_goals(horizon if horizon in ("short", "semester", "long") else None)
        # Filter by title if provided
        if target_title:
            goals = [g for g in goals if target_title in (g.title or "")]
        # Filter by status if provided
        if goal_status:
            goals = [g for g in goals if g.status == goal_status]
        
        return {"preview": preview, "affected": len(goals), "data": [g.to_dict() for g in goals]}
    
    # goal_delete
    if action == "goal_delete":
        target_title = (op.get("target_title") or "").strip()
        if not target_title:
            target_title = op.get("title") or ""
        
        preview = {
            "domain": "goal",
            "action": "goal_delete",
            "target_title": target_title,
        }
        
        if dry_run:
            return {"preview": preview}
        
        goals = await db.get_goals_by_title(target_title)
        affected = 0
        for g in goals:
            await db.delete_goal(g.id)
            affected += 1
        
        return {"preview": preview, "affected": affected}
    
    return None





# ============= Middle helpers (L3014-3114) =============

"""Date/time parsing helpers."""

def _parse_datetime(value: Any):
    """Parse datetime from string."""
    from datetime import datetime
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            return None
    return None


def _extract_deadline_from_text(text: str):
    """Extract absolute deadline datetime for Chinese 'X月X日前/之前' phrases.

    Semantics:
    - "前" (without "之前") => inclusive end-of-day of the target date (23:59)
    - "之前" => exclusive of target date, mapped to previous day 23:59
    """
    if not text:
        return None

    now = datetime.now()
    # Optional year: 2026年4月17号前 / 4月17日前 / 4月17日之前
    pattern = re.compile(
        r"(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?\s*(之前|以前|前)"
    )
    m = pattern.search(text)
    if not m:
        return None

    year_str, month_str, day_str, qualifier = m.groups()
    year = int(year_str) if year_str else now.year
    month = int(month_str)
    day = int(day_str)

    try:
        base = datetime(year, month, day, 23, 59, 0)
    except ValueError:
        return None

    # If year omitted and parsed date already passed this year, roll to next year.
    if not year_str and base < now - timedelta(days=1):
        try:
            base = datetime(year + 1, month, day, 23, 59, 0)
        except ValueError:
            return None

    if qualifier in {"之前", "以前"}:
        return base - timedelta(days=1)
    return base


def _extract_deadline_label_from_text(text: str) -> str:
    """Return a user-facing deadline label like '截止4月17日'."""
    dt = _extract_deadline_from_text(text)
    if not dt:
        return ""

    now = datetime.now()
    if dt.year == now.year:
        return f"截止{dt.month}月{dt.day}日"
    return f"截止{dt.year}年{dt.month}月{dt.day}日"


def _append_deadline_label(title: str, deadline_label: str) -> str:
    """Append deadline label to title once."""
    safe_title = (title or "").strip() or "待办"
    if not deadline_label:
        return safe_title
    if deadline_label in safe_title:
        return safe_title
    return f"{safe_title}（{deadline_label}）"


def _has_explicit_clock_time_in_text(text: str) -> bool:
    """Whether input includes explicit clock time (e.g. 15:30, 下午3点)."""
    if not text:
        return False

    return bool(re.search(
        r"(\d{1,2}:\d{2})|((?:上午|下午|早上|晚上|中午)?\s*\d{1,2}\s*点(?:半|\d{1,2}\s*分?)?)",
        text,
    ))


def _parse_date_range(date_str: str):
    """Parse YYYY-MM-DD into [start_of_day, next_day_start)."""
    if not date_str:
        return None, None
    try:
        day = datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        return None, None
    start = day.replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=1)
    return start, end

