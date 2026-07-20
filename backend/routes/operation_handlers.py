"""Operation handlers for LLM-driven event/expense/note/goal CRUD."""
import re
from datetime import datetime, timedelta

from .. import db
from ..models import Event, Goal, Note, Expense

from .parse_helpers import (
    _parse_datetime, _extract_deadline_from_text,
    _extract_deadline_label_from_text, _append_deadline_label,
    _has_explicit_clock_time_in_text,
)


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

        # Past-time guard: only reject if BOTH start and end are in the past.
        # Allow start_time < now if end_time is still in the future (user may already be doing it).
        if start_time is not None:
            now = datetime.now()
            end_time_check = start_time + timedelta(minutes=duration_minutes)
            if end_time_check < now:
                preview["past_time_error"] = f"结束时间 {end_time_check.isoformat()} 已在过去（当前 {now.isoformat()}）"
                return {"preview": preview, "past_time_error": True}

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

# Past-time guard for start_time change: only reject if more than 24h in past.
        # Allow updating ongoing or recent past events.
        if new_start_time is not None:
            cutoff = datetime.now() - timedelta(hours=24)
            if new_start_time < cutoff:
                preview["past_time_error"] = f"开始时间 {new_start_time.isoformat()} 已在过去超过 24 小时"
                return {"preview": preview, "past_time_error": True}

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

        # Past-time guard: only reject if more than 24h in past
        cutoff = datetime.now() - timedelta(hours=24)
        if new_start_time < cutoff:
            preview["past_time_error"] = f"开始时间 {new_start_time.isoformat()} 已在过去超过 24 小时"
            return {"preview": preview, "past_time_error": True}

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
        source_date = op.get("source_date", "").strip() or None  # 指定查询哪天的pending事件
        
        if dry_run:
            result = await db.postpone_remaining_events_preview(
                today_str=source_date, target_date=target_date, target_time=target_time)
            preview["affected"] = result.get("moved", 0)
            preview["details"] = result.get("details", [])[:3]
            preview["message"] = result.get("message", "")
            return {"preview": preview}

        from datetime import date
        result = await db.postpone_remaining_events(
            today_str=source_date, target_date=target_date, target_time=target_time)
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
