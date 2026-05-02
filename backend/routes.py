"""REST API routes for schedule management."""
import json
import re
import aiosqlite
from datetime import datetime, timedelta
from aiohttp import web
from typing import Any

from . import db
from .models import Event, EventHistory, Goal, GoalConversation, Note, Expense, CATEGORIES, EXPENSE_CATEGORIES, NoteGroup, Budget


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


async def get_events(request: web.Request) -> web.Response:
    """GET /api/events?date=today|week|month|all|YYYY-MM-DD|YYYY-MM - list events."""
    date_filter = request.query.get("date", "today")
    # Accept today/week/month/all or specific date (YYYY-MM-DD) or month (YYYY-MM)
    valid_filters = ("today", "week", "month", "all")
    import re
    if date_filter not in valid_filters and not re.match(r'^\d{4}-\d{2}-\d{2}$', date_filter) and not re.match(r'^\d{4}-\d{2}$', date_filter):
        date_filter = "today"

    try:
        events = await db.get_events(date_filter)
        return json_response([e.to_dict() for e in events])
    except Exception as e:
        return error_response(f"获取事件失败: {str(e)}")


async def create_event(request: web.Request) -> web.Response:
    """POST /api/events - create event."""
    try:
        data = await request.json()
    except json.JSONDecodeError:
        return error_response("无效的JSON数据")

    try:
        # Parse natural language time if start_time not provided
        title = data.get("title", "")
        if data.get("start_time") is None and title:
            from .time_parser import parse_time
            time_result = parse_time(title)
            if time_result:
                data["start_time"] = time_result[0].isoformat()
                if time_result[1]:
                    data["end_time"] = time_result[1].isoformat()

        # Get default reminder setting
        default_reminder = await db.get_setting("default_task_reminder_enabled")
        default_reminder_enabled = default_reminder and default_reminder.lower() == "true"
        reminder_enabled = bool(data.get("reminder_enabled", default_reminder_enabled))

        # Create Event object
        event = Event(
            title=data.get("title", ""),
            start_time=_parse_datetime(data.get("start_time")),
            end_time=_parse_datetime(data.get("end_time")),
            category_id=data.get("category_id", "work"),
            all_day=data.get("all_day", False),
            recurrence=data.get("recurrence", "none"),
            status=data.get("status", "pending"),
            reminder_enabled=reminder_enabled,
            reminder_minutes=data.get("reminder_minutes", 1),
            reminder_sent=data.get("reminder_sent", False),
            is_test=bool(data.get("is_test", False)),
        )

        # Idempotency guard: if exact same pending event exists, return it directly
        duplicate = await db.find_duplicate_event(
            title=event.title,
            start_time=event.start_time,
            end_time=event.end_time,
            status=event.status or "pending",
        )
        if duplicate:
            return json_response(duplicate.to_dict())

        # Conflict guard: block overlapping pending events by default
        skip_conflict_check = bool(data.get("skip_conflict_check", False))
        if event.start_time and not skip_conflict_check:
            overlap_end = event.end_time or event.start_time
            overlaps = await db.find_overlapping_events(event.start_time, overlap_end, status="pending")
            # Exclude exact duplicate match (already handled), any remaining overlap blocks create
            overlaps = [o for o in overlaps if not (o.title == event.title and o.start_time == event.start_time and o.end_time == event.end_time)]
            if overlaps:
                first = overlaps[0]
                conflict_label = first.title
                return error_response(f"时间冲突：与已存在任务“{conflict_label}”重叠", code=409)

        event = await db.create_event(event)
        
        # Log history for event creation
        try:
            history_entry = EventHistory(
                event_id=event.id,
                action="created",
                field_name="",
                old_value="",
                new_value=json.dumps(event.to_dict()),
            )
            await db.create_event_history(history_entry)
        except Exception as hist_err:
            print(f"Failed to log event history: {hist_err}")
        
        return json_response(event.to_dict())
    except Exception as e:
        return error_response(f"创建事件失败: {str(e)}")


async def update_event(request: web.Request) -> web.Response:
    """PUT /api/events/{id} - update event."""
    event_id = int(request.match_info["id"])

    try:
        data = await request.json()
    except json.JSONDecodeError:
        return error_response("无效的JSON数据")

    try:
        existing = await db.get_event(event_id)
        if not existing:
            return error_response("事件不存在", code=404)

        event = Event(
            title=data.get("title", existing.title),
            start_time=_parse_datetime(data.get("start_time")) or existing.start_time,
            end_time=_parse_datetime(data.get("end_time")) or existing.end_time,
            category_id=data.get("category_id", existing.category_id),
            all_day=data.get("all_day", existing.all_day),
            recurrence=data.get("recurrence", existing.recurrence),
            status=data.get("status", existing.status),
            reminder_enabled=data.get("reminder_enabled", existing.reminder_enabled),
            reminder_minutes=data.get("reminder_minutes", existing.reminder_minutes),
            reminder_sent=data.get("reminder_sent", existing.reminder_sent),
        )

        updated = await db.update_event(event_id, event)
        if not updated:
            return error_response("事件不存在", code=404)
        
        # Log history for event update
        try:
            history_entry = EventHistory(
                event_id=event_id,
                action="updated",
                field_name="",
                old_value=json.dumps(existing.to_dict()),
                new_value=json.dumps(updated.to_dict()),
            )
            await db.create_event_history(history_entry)
        except Exception as hist_err:
            print(f"Failed to log event history: {hist_err}")
        
        return json_response(updated.to_dict())
    except Exception as e:
        return error_response(f"更新事件失败: {str(e)}")


async def delete_event(request: web.Request) -> web.Response:
    """DELETE /api/events/{id} - delete event."""
    event_id = int(request.match_info["id"])

    try:
        # Fetch event before deleting for history logging
        existing = await db.get_event(event_id)
        if not existing:
            return error_response("事件不存在", code=404)
        
        success = await db.delete_event(event_id)
        if success:
            # Log history for event deletion
            try:
                history_entry = EventHistory(
                    event_id=event_id,
                    action="deleted",
                    field_name="",
                    old_value=json.dumps(existing.to_dict()),
                    new_value="",
                )
                await db.create_event_history(history_entry)
            except Exception as hist_err:
                print(f"Failed to log event history: {hist_err}")
            
            return json_response({"deleted": True})
        else:
            return error_response("事件不存在", code=404)
    except Exception as e:
        return error_response(f"删除事件失败: {str(e)}")


async def complete_event(request: web.Request) -> web.Response:
    """PUT /api/events/{id}/complete - mark complete."""
    event_id = int(request.match_info["id"])

    try:
        # Get existing event before completing for history
        existing = await db.get_event(event_id)
        event = await db.complete_event(event_id)
        if event:
            # Log history for completion
            try:
                history_entry = EventHistory(
                    event_id=event_id,
                    action="completed",
                    field_name="status",
                    old_value=json.dumps({"status": existing.status}) if existing else "{}",
                    new_value=json.dumps({"status": "done"}),
                )
                await db.create_event_history(history_entry)
            except Exception as hist_err:
                print(f"Failed to log event history: {hist_err}")
            
            return json_response(event.to_dict())
        else:
            return error_response("事件不存在", code=404)
    except Exception as e:
        return error_response(f"完成事件失败: {str(e)}")


async def uncomplete_event(request: web.Request) -> web.Response:
    """PUT /api/events/{id}/uncomplete - mark back to pending (undo)."""
    event_id = int(request.match_info["id"])

    try:
        # Get existing event before uncompleting for history
        existing = await db.get_event(event_id)
        event = await db.uncomplete_event(event_id)
        if event:
            # Log history for uncompletion
            try:
                history_entry = EventHistory(
                    event_id=event_id,
                    action="uncompleted",
                    field_name="status",
                    old_value=json.dumps({"status": existing.status}) if existing else "{}",
                    new_value=json.dumps({"status": "pending"}),
                )
                await db.create_event_history(history_entry)
            except Exception as hist_err:
                print(f"Failed to log event history: {hist_err}")
            
            return json_response(event.to_dict())
        else:
            return error_response("事件不存在", code=404)
    except Exception as e:
        return error_response(f"撤销完成失败: {str(e)}")


async def get_event_history(request: web.Request) -> web.Response:
    """GET /api/events/{id}/history - get history for an event."""
    event_id = int(request.match_info["id"])

    try:
        history = await db.get_event_history(event_id)
        return json_response([h.to_dict() for h in history])
    except Exception as e:
        return error_response(f"获取历史记录失败: {str(e)}")


async def get_all_event_history(request: web.Request) -> web.Response:
    """GET /api/event-history - get all event history."""
    try:
        limit = int(request.query.get("limit", 100))
        offset = int(request.query.get("offset", 0))
        history = await db.get_all_event_history(limit=limit, offset=offset)
        return json_response([h.to_dict() for h in history])
    except Exception as e:
        return error_response(f"获取历史记录失败: {str(e)}")


async def get_stats(request: web.Request) -> web.Response:
    """GET /api/stats?date=today - get statistics."""
    date_filter = request.query.get("date", "today")
    valid_filters = {"today", "week", "month"}
    if date_filter not in valid_filters:
        date_filter = "today"

    try:
        stats = await db.get_stats(date_filter)
        return json_response(stats)
    except Exception as e:
        return error_response(f"获取统计失败: {str(e)}")


async def get_categories(request: web.Request) -> web.Response:
    """GET /api/categories - list categories."""
    return json_response(CATEGORIES)


async def llm_chat(request: web.Request) -> web.Response:
    """POST /api/llm/chat - process natural language with LLM.
    
    Body: {"text": "明天上午8点开会2小时"}
    Returns: {"title": "...", "start_time": "...", "end_time": "...", "category_id": "..."}
    """
    try:
        data = await request.json()
    except json.JSONDecodeError:
        return error_response("无效的JSON数据")
    
    user_text = data.get("text", "").strip()
    if not user_text:
        return error_response("输入不能为空")
    
    from .llm_service import llm_service
    from .db import get_events
    from datetime import datetime
    
    # 获取当天已有事件
    today_str = datetime.now().strftime("%Y-%m-%d")
    today_events = await get_events(today_str)
    existing_events = [
        {
            "title": ev.title,
            "start_time": ev.start_time.isoformat() if ev.start_time else "",
            "end_time": ev.end_time.isoformat() if ev.end_time else "",
        }
        for ev in today_events
    ] if today_events else []
    
    result = await llm_service.process_schedule_command(user_text, existing_events)
    if result:
        return json_response(result)
    else:
        return error_response(llm_service.last_error_message or "LLM处理失败，请检查API配置或稍后重试")


async def llm_create(request: web.Request) -> web.Response:
    """POST /api/llm/create - process with LLM and create event directly.
    
    Body: {"text": "明天上午8点开会2小时"}
    Returns: created event
    """
    print(f"=== llm_create called ===")
    print(f"Headers: {dict(request.headers)}")
    
    try:
        # Read body as bytes and decode manually to handle encoding issues
        body_bytes = await request.read()
        print(f"Body bytes: {body_bytes[:100]}")
        
        # Try UTF-8 first, then fallback to other encodings
        try:
            body_str = body_bytes.decode('utf-8')
        except UnicodeDecodeError:
            try:
                body_str = body_bytes.decode('gbk')
            except UnicodeDecodeError:
                body_str = body_bytes.decode('latin-1')
        
        data = json.loads(body_str)
        print(f"Received data: {data}")
    except Exception as e:
        print(f"JSON decode error: {e}")
        return error_response("无效的JSON数据")
    
    user_text = data.get("text", "").strip()
    if not user_text:
        return error_response("输入不能为空")
    
    from .llm_service import llm_service
    from .db import get_events
    from datetime import datetime
    
    # 获取当天已有事件
    today_str = datetime.now().strftime("%Y-%m-%d")
    today_events = await get_events(today_str)
    existing_events = [
        {
            "title": ev.title,
            "start_time": ev.start_time.isoformat() if ev.start_time else "",
            "end_time": ev.end_time.isoformat() if ev.end_time else "",
        }
        for ev in today_events
    ] if today_events else []
    
    print(f"LLM create request: {user_text}")
    result = await llm_service.process_schedule_command(user_text, existing_events)
    print(f"LLM create result: {result}")
    
    if not result:
        return error_response(llm_service.last_error_message or "LLM处理失败，请检查网络连接或稍后重试")
    
    # Handle multiple events or single event
    events_list = []
    events_data = result.get("events", [])
    
    if not events_data:
        return error_response("LLM未能解析出日程，请尝试更明确的表达")
    
    # Ensure it's a list
    if isinstance(events_data, dict):
        events_data = [events_data]
    
    deadline_dt = _extract_deadline_from_text(user_text)
    deadline_label = _extract_deadline_label_from_text(user_text)
    has_explicit_clock_time = _has_explicit_clock_time_in_text(user_text)

    # Get default reminder setting
    default_reminder = await db.get_setting("default_task_reminder_enabled")
    default_reminder_enabled = default_reminder and default_reminder.lower() == "true"

    for i, event_data in enumerate(events_data):
        title = event_data.get("title", user_text)
        start_time_str = event_data.get("start_time")
        duration_minutes = event_data.get("duration_minutes", 30)
        category_id = event_data.get("category_id", "work")
        
        # Parse start_time
        start_time = None
        if start_time_str:
            start_time = _parse_datetime(start_time_str)

        # Deterministic deadline guard:
        # For "X月X号前/之前/以前" without explicit clock time, treat as deadline-type todo
        # (no concrete timeslot) and preserve warning semantics in title.
        if deadline_dt and not has_explicit_clock_time:
            start_time = None
            if deadline_label:
                title = _append_deadline_label(title, deadline_label)
        
        # Keep no-time/ambiguous-time events as pending-time items.
        # Only compute end_time when start_time is explicit.
        end_time = None
        if start_time:
            end_time = start_time + timedelta(minutes=duration_minutes)
        
        event = Event(
            title=title,
            start_time=start_time,
            end_time=end_time,
            category_id=category_id,
            all_day=False,
            recurrence="none",
            status="pending",
            reminder_enabled=default_reminder_enabled,
        )
        
        try:
            event = await db.create_event(event)
            events_list.append(event)
        except Exception as e:
            print(f"Error creating event {title}: {e}")
    
    if not events_list:
        return error_response(f"创建事件失败")
    
    return json_response([e.to_dict() for e in events_list])


async def llm_command(request: web.Request) -> web.Response:
    """POST /api/llm/command - unified natural language command executor.

    Body: {"text": "今天2点开会，花50块买书", "dry_run": true|false}
    
    Supports multi-domain operations: events, expenses, notes, goals.
    """
    try:
        body_bytes = await request.read()
        try:
            body_str = body_bytes.decode('utf-8')
        except UnicodeDecodeError:
            try:
                body_str = body_bytes.decode('gbk')
            except UnicodeDecodeError:
                body_str = body_bytes.decode('latin-1')
        data = json.loads(body_str)
    except Exception:
        return error_response("无效的JSON数据")

    user_text = (data.get("text", "") or "").strip()
    if not user_text:
        return error_response("输入不能为空")

    dry_run = bool(data.get("dry_run", False))

    from .llm_service import llm_service
    plan = await llm_service.process_unified_command(user_text)
    if not plan:
        return error_response("LLM命令解析失败，请稍后重试")

    operations = plan.get("operations", [])
    if not isinstance(operations, list) or not operations:
        return error_response("未解析到可执行操作")

    preview_ops = []
    created_items = []
    queried_items = []
    stats = {
        "events_created": 0,
        "events_updated": 0,
        "events_moved": 0,
        "events_deleted": 0,
        "events_completed": 0,
        "events_uncompleted": 0,
        "events_queried": 0,
        "expenses_created": 0,
        "expenses_updated": 0,
        "expenses_deleted": 0,
        "expenses_queried": 0,
        "notes_created": 0,
        "notes_updated": 0,
        "notes_deleted": 0,
        "notes_queried": 0,
        "goals_created": 0,
        "goals_updated": 0,
        "goals_deleted": 0,
        "goals_queried": 0,
    }

    for op in operations:
        if not isinstance(op, dict):
            continue

        action = str(op.get("action", "")).strip().lower()
        domain = str(op.get("domain", "")).strip().lower()
        
        # Handle event operations
        if domain == "event":
            result = await _handle_event_operation(op, action, user_text, dry_run)
            if result:
                preview_ops.append(result["preview"])
                if not dry_run and result.get("affected"):
                    _update_event_stats(stats, action, result["affected"])
                if result.get("created"):
                    created_items.append(result["created"])
                if result.get("data"):
                    queried_items.append({"domain": domain, "data": result["data"]})
            continue
        
        # Handle expense operations
        if domain == "expense":
            result = await _handle_expense_operation(op, action, user_text, dry_run)
            if result:
                preview_ops.append(result["preview"])
                if not dry_run and result.get("affected"):
                    _update_expense_stats(stats, action, result["affected"])
                if result.get("created"):
                    created_items.append(result["created"])
                if result.get("data"):
                    queried_items.append({"domain": domain, "data": result["data"]})
            continue
        
        # Handle note operations
        if domain == "note":
            result = await _handle_note_operation(op, action, user_text, dry_run)
            if result:
                preview_ops.append(result["preview"])
                if not dry_run and result.get("affected"):
                    _update_note_stats(stats, action, result["affected"])
                if result.get("created"):
                    created_items.append(result["created"])
                if result.get("data"):
                    queried_items.append({"domain": domain, "data": result["data"]})
            continue
        
        # Handle goal operations
        if domain == "goal":
            result = await _handle_goal_operation(op, action, user_text, dry_run)
            if result:
                preview_ops.append(result["preview"])
                if not dry_run and result.get("affected"):
                    _update_goal_stats(stats, action, result["affected"])
                if result.get("created"):
                    created_items.append(result["created"])
                if result.get("data"):
                    queried_items.append({"domain": domain, "data": result["data"]})
            continue

    return json_response({
        "dry_run": dry_run,
        "summary": plan.get("summary", ""),
        "operations": preview_ops,
        "stats": stats,
        "created_items": created_items,
        "queried_items": queried_items,
    })


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
    from .models import Expense
    
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
    from .models import Note
    
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
    from .models import Goal
    
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


async def llm_breakdown(request: web.Request) -> web.Response:
    """POST /api/llm/breakdown - break down a task into subtasks."""
    try:
        body_bytes = await request.read()
        try:
            body_str = body_bytes.decode('utf-8')
        except UnicodeDecodeError:
            try:
                body_str = body_bytes.decode('gbk')
            except UnicodeDecodeError:
                body_str = body_bytes.decode('latin-1')
        data = json.loads(body_str)
    except Exception as e:
        return error_response("无效的请求")
    
    user_text = data.get("text", "").strip()
    horizon = data.get("horizon", "short")
    self_description = data.get("self_description", "").strip()
    if not user_text:
        return error_response("请输入任务描述")
    
    from .llm_service import llm_service
    
    result = await llm_service.breakdown_task(user_text, horizon=horizon, self_description=self_description)
    if result:
        return json_response(result)
    else:
        return error_response(llm_service.last_error_message or "LLM拆解失败")


async def get_goals(request: web.Request) -> web.Response:
    """GET /api/goals?horizon=short|semester|long - list top-level goals with subtasks."""
    horizon = request.query.get("horizon")
    try:
        goals = await db.get_goals(horizon, include_subtasks=False)
        # For each goal, get its subtasks
        result = []
        for goal in goals:
            goal_dict = goal.to_dict()
            goal_dict["subtasks"] = []
            # Get direct subtasks (only if goal.id is not None)
            if goal.id is not None:
                subtasks = await db.get_goal_subtasks(goal.id)
                for subtask in subtasks:
                    subtask_dict = subtask.to_dict()
                    # Get sub-subtasks (depth = 2)
                    if subtask.id is not None:
                        sub_subtasks = await db.get_goal_subtasks(subtask.id)
                        subtask_dict["subtasks"] = [s.to_dict() for s in sub_subtasks]
                    else:
                        subtask_dict["subtasks"] = []
                    goal_dict["subtasks"].append(subtask_dict)
            result.append(goal_dict)
        return json_response(result)
    except Exception as e:
        return error_response(f"获取目标失败: {str(e)}")


async def get_goal_tree(request: web.Request) -> web.Response:
    """GET /api/goals/{id}/tree - get goal with full subtask tree."""
    goal_id = int(request.match_info["id"])
    try:
        tree = await db.get_goal_tree(goal_id, max_depth=3)
        if not tree:
            return error_response("目标不存在", code=404)
        return json_response(tree)
    except Exception as e:
        return error_response(f"获取目标树失败: {str(e)}")


async def get_goal_subtasks(request: web.Request) -> web.Response:
    """GET /api/goals/{id}/subtasks - get direct subtasks of a goal."""
    goal_id = int(request.match_info["id"])
    try:
        subtasks = await db.get_goal_subtasks(goal_id)
        return json_response([s.to_dict() for s in subtasks])
    except Exception as e:
        return error_response(f"获取子任务失败: {str(e)}")


async def create_goal(request: web.Request) -> web.Response:
    """POST /api/goals - create goal (top-level or subtask)."""
    try:
        data = await request.json()
    except json.JSONDecodeError:
        return error_response("无效的JSON数据")

    try:
        parent_id = data.get("parent_id")
        horizon = data.get("horizon", "short")
        
        # Validate parent exists if parent_id provided
        if parent_id:
            parent = await db.get_goal(parent_id)
            if not parent:
                return error_response("父目标不存在", code=404)
            # Inherit horizon from parent if creating subtask
            horizon = parent.horizon
        
        goal = Goal(
            title=data.get("title", "").strip(),
            description=data.get("description", "").strip(),
            horizon=horizon,
            status=data.get("status", "active"),
            start_date=_parse_datetime(data.get("start_date")),
            end_date=_parse_datetime(data.get("end_date")),
            parent_id=parent_id,
            root_goal_id=data.get("root_goal_id"),
            order=data.get("order", 0),
            ai_context=data.get("ai_context", ""),
            is_test=bool(data.get("is_test", False)),
        )
        if not goal.title:
            return error_response("目标标题不能为空")
        if goal.horizon not in {"short", "semester", "long"}:
            return error_response("无效目标类型")

        created = await db.create_goal(goal)
        return json_response(created.to_dict())
    except Exception as e:
        return error_response(f"创建目标失败: {str(e)}")


async def update_goal(request: web.Request) -> web.Response:
    """PUT /api/goals/{id} - update goal."""
    goal_id = int(request.match_info["id"])
    try:
        data = await request.json()
    except json.JSONDecodeError:
        return error_response("无效的JSON数据")

    try:
        existing = await db.get_goal(goal_id)
        if not existing:
            return error_response("目标不存在", code=404)

        updated_goal = Goal(
            title=data.get("title", existing.title).strip(),
            description=data.get("description", existing.description).strip(),
            horizon=data.get("horizon", existing.horizon),
            status=data.get("status", existing.status),
            start_date=_parse_datetime(data.get("start_date")) or existing.start_date,
            end_date=_parse_datetime(data.get("end_date")) or existing.end_date,
            parent_id=data.get("parent_id", existing.parent_id),
            root_goal_id=data.get("root_goal_id", existing.root_goal_id),
            order=data.get("order", existing.order),
            ai_context=data.get("ai_context", existing.ai_context),
            is_test=data.get("is_test", existing.is_test),
        )
        if not updated_goal.title:
            return error_response("目标标题不能为空")
        if updated_goal.horizon not in {"short", "semester", "long"}:
            return error_response("无效目标类型")

        result = await db.update_goal(goal_id, updated_goal)
        if not result:
            return error_response("目标不存在", code=404)
        return json_response(result.to_dict())
    except Exception as e:
        return error_response(f"更新目标失败: {str(e)}")


async def delete_goal(request: web.Request) -> web.Response:
    """DELETE /api/goals/{id} - delete goal and all subtasks."""
    goal_id = int(request.match_info["id"])
    try:
        success = await db.delete_goal(goal_id)
        if success:
            return json_response({"deleted": True})
        return error_response("目标不存在", code=404)
    except Exception as e:
        return error_response(f"删除目标失败: {str(e)}")


# ============ Goal Conversations ============

async def get_goal_conversations(request: web.Request) -> web.Response:
    """GET /api/goals/{id}/conversations - get conversation history."""
    goal_id = int(request.match_info["id"])
    try:
        conversations = await db.get_goal_conversations(goal_id)
        return json_response([c.to_dict() for c in conversations])
    except Exception as e:
        return error_response(f"获取对话历史失败: {str(e)}")


async def create_goal_conversation(request: web.Request) -> web.Response:
    """POST /api/goals/{id}/conversations - add conversation message."""
    goal_id = int(request.match_info["id"])
    try:
        data = await request.json()
    except json.JSONDecodeError:
        return error_response("无效的JSON数据")

    try:
        # Verify goal exists
        goal = await db.get_goal(goal_id)
        if not goal:
            return error_response("目标不存在", code=404)

        conversation = GoalConversation(
            goal_id=goal_id,
            role=data.get("role", "user"),
            content=data.get("content", "").strip(),
        )
        if not conversation.content:
            return error_response("对话内容不能为空")

        created = await db.create_goal_conversation(conversation)
        return json_response(created.to_dict())
    except Exception as e:
        return error_response(f"创建对话失败: {str(e)}")


# ============ Goal Deliverables ============

async def get_goal_deliverables(request: web.Request) -> web.Response:
    """GET /api/goals/{id}/deliverables - Get all deliverables for a goal."""
    try:
        goal_id = int(request.match_info["id"])
        deliverables = await db.get_goal_deliverables(goal_id)
        return json_response([d.__dict__ for d in deliverables])
    except Exception as e:
        return error_response(f"获取交付成果失败: {str(e)}")


async def create_goal_deliverable(request: web.Request) -> web.Response:
    """POST /api/goals/{id}/deliverables - Create a deliverable for a goal."""
    try:
        goal_id = int(request.match_info["id"])
        data = await request.json()
        title = data.get("title", "").strip()
        if not title:
            return error_response("交付成果标题不能为空")
        
        deliverable = db.GoalDeliverable(
            goal_id=goal_id,
            title=title,
            description=data.get("description", "").strip(),
            completed=0,
        )
        created = await db.create_goal_deliverable(deliverable)
        return json_response(created.__dict__)
    except Exception as e:
        return error_response(f"创建交付成果失败: {str(e)}")


async def update_goal_deliverable(request: web.Request) -> web.Response:
    """PUT /api/goals/deliverables/{id} - Update a deliverable."""
    try:
        deliverable_id = int(request.match_info["id"])
        data = await request.json()
        updated = await db.update_goal_deliverable(deliverable_id, data)
        if updated:
            return json_response(updated.__dict__)
        return error_response("交付成果不存在")
    except Exception as e:
        return error_response(f"更新交付成果失败: {str(e)}")


async def delete_goal_deliverable(request: web.Request) -> web.Response:
    """DELETE /api/goals/deliverables/{id} - Delete a deliverable."""
    try:
        deliverable_id = int(request.match_info["id"])
        await db.delete_goal_deliverable(deliverable_id)
        return json_response({"success": True})
    except Exception as e:
        return error_response(f"删除交付成果失败: {str(e)}")


# ============ AI Conversational Breakdown ============

async def ai_discuss_goal(request: web.Request) -> web.Response:
    """POST /api/goals/ai/discuss - AI conversational goal breakdown.
    
    This endpoint maintains a conversation with the user to understand their goal
    better through questions, then generates a subtask breakdown.
    """
    try:
        data = await request.json()
    except json.JSONDecodeError:
        return error_response("无效的JSON数据")
    
    try:
        goal_content = data.get("goal_content", "").strip()
        user_input = data.get("user_input", "").strip()
        conversation_history = data.get("conversation_history", [])
        
        if not goal_content and not user_input:
            return error_response("目标内容或用户输入不能为空")
        
        # Get user's self description from settings
        self_description = await db.get_setting("self_description") or await db.get_setting("user_self_description") or ""
        
        # Get this week's events for context
        from datetime import timedelta
        now = datetime.now()
        week_start = now - timedelta(days=now.weekday())
        week_end = week_start + timedelta(days=7)
        events = await db.get_events("week")
        week_events_str = ""
        if events:
            for e in events[:10]:  # Limit to 10 events
                week_events_str += f"- {e.title}: {e.start_time.strftime('%m/%d %H:%M') if e.start_time else 'TBD'}\n"
        else:
            week_events_str = "本周暂无日程安排"
        
        # Get todo items for context
        todo_items = await db.get_events("today")
        todo_str = ""
        if todo_items:
            for t in todo_items[:5]:
                todo_str += f"- {t.title}\n"
        else:
            todo_str = "今日暂无待办"
        
        # Import LLM service
        from .llm_service import llm_service
        
        # Build conversation context
        history_context = ""
        for msg in conversation_history[-6:]:  # Last 6 messages
            role = "用户" if msg.get("role") == "user" else "AI"
            history_context += f"{role}: {msg.get('content', '')}\n"
        
        # Call LLM for conversational breakdown
        result = await llm_service.discuss_goal(
            goal_content=goal_content,
            user_input=user_input,
            history_context=history_context,
            self_description=self_description,
            week_events=week_events_str,
            todo_items=todo_str,
        )
        
        if not result:
            return error_response(llm_service.last_error_message or "AI 响应失败，请稍后重试")
        
        return json_response(result)
    
    except Exception as e:
        import traceback
        traceback.print_exc()
        return error_response(f"AI 讨论失败: {str(e)}")


async def ai_reschedule_goal(request: web.Request) -> web.Response:
    """POST /api/goals/ai/reschedule - AI reschedule existing subtasks from global view.
    
    This endpoint takes existing subtasks and asks AI to optimize their time allocation
    from a global perspective.
    """
    try:
        data = await request.json()
    except json.JSONDecodeError:
        return error_response("无效的JSON数据")
    
    try:
        goal_content = data.get("goal_content", "").strip()
        current_subtasks = data.get("current_subtasks", [])
        conversation_history = data.get("conversation_history", [])
        
        if not current_subtasks:
            return error_response("没有可重新分配的任务")
        
        # Get user's self description from settings
        self_description = await db.get_setting("self_description") or await db.get_setting("user_self_description") or ""
        
        # Get this week's events for context
        from datetime import timedelta
        now = datetime.now()
        week_start = now - timedelta(days=now.weekday())
        week_end = week_start + timedelta(days=7)
        events = await db.get_events("week")
        week_events_str = ""
        if events:
            for e in events[:10]:
                week_events_str += f"- {e.title}: {e.start_time.strftime('%m/%d %H:%M') if e.start_time else 'TBD'}\n"
        else:
            week_events_str = "本周暂无日程安排"
        
        # Build conversation context
        history_context = ""
        for msg in conversation_history[-6:]:
            role = "用户" if msg.get("role") == "user" else "AI"
            history_context += f"{role}: {msg.get('content', '')}\n"
        
        # Import LLM service
        from .llm_service import llm_service
        
        # Call LLM for rescheduling
        result = await llm_service.reschedule_goal(
            goal_content=goal_content,
            current_subtasks=current_subtasks,
            history_context=history_context,
            self_description=self_description,
            week_events=week_events_str,
        )
        
        if not result:
            return error_response(llm_service.last_error_message or "AI 响应失败，请稍后重试")
        
        return json_response(result)
    
    except Exception as e:
        import traceback
        traceback.print_exc()
        return error_response(f"AI 重新分配失败: {str(e)}")


async def get_settings(request: web.Request) -> web.Response:
    """GET /api/settings - get all settings."""
    try:
        # Get all settings
        settings = {}
        async with aiosqlite.connect(db.DB_PATH) as conn:
            conn.row_factory = aiosqlite.Row
            async with conn.execute("SELECT key, value FROM settings") as cursor:
                rows = await cursor.fetchall()
                for row in rows:
                    settings[row["key"]] = row["value"]
        return json_response(settings)
    except Exception as e:
        return error_response(f"获取设置失败: {str(e)}")


async def update_setting(request: web.Request) -> web.Response:
    """PUT /api/settings/{key} - update a setting."""
    key = request.match_info["key"]
    
    try:
        data = await request.json()
    except json.JSONDecodeError:
        return error_response("无效的JSON数据")
    
    value = data.get("value")
    if value is None:
        return error_response("缺少value字段")
    
    try:
        await db.set_setting(key, str(value))
        return json_response({"key": key, "value": str(value)})
    except Exception as e:
        return error_response(f"更新设置失败: {str(e)}")


# ============ AI Providers Endpoints ============

async def get_ai_providers(request: web.Request) -> web.Response:
    """GET /api/ai-providers - list all AI providers."""
    try:
        providers = await db.get_ai_providers()
        return json_response([_sanitize_ai_provider(provider) for provider in providers])
    except Exception as e:
        return error_response(f"获取AI配置失败: {str(e)}")


async def create_ai_provider(request: web.Request) -> web.Response:
    """POST /api/ai-providers - create a new AI provider."""
    try:
        data = await request.json()
    except json.JSONDecodeError:
        return error_response("无效的JSON数据")
    
    try:
        api_key = data.get("api_key", "").strip()
        if not api_key:
            return error_response("API Key 不能为空，请在设置页填写有效密钥")

        provider = await db.create_ai_provider(
            name=data.get("name", "").strip(),
            api_base=data.get("api_base", "").strip(),
            model=data.get("model", "").strip(),
            api_key=api_key,
        )
        return json_response(_sanitize_ai_provider(provider))
    except Exception as e:
        return error_response(f"创建AI配置失败: {str(e)}")


async def update_ai_provider(request: web.Request) -> web.Response:
    """PUT /api/ai-providers/{id} - update an AI provider."""
    provider_id = int(request.match_info["id"])
    
    try:
        data = await request.json()
    except json.JSONDecodeError:
        return error_response("无效的JSON数据")
    
    try:
        api_key_value = data.get("api_key")
        normalized_api_key = None
        if api_key_value is not None:
            normalized_value = str(api_key_value).strip()
            if normalized_value != "":
                normalized_api_key = normalized_value

        provider = await db.update_ai_provider(
            provider_id=provider_id,
            name=data.get("name", "").strip(),
            api_base=data.get("api_base", "").strip(),
            model=data.get("model", "").strip(),
            api_key=normalized_api_key,
        )
        if provider:
            return json_response(_sanitize_ai_provider(provider))
        else:
            return error_response("AI配置不存在", code=404)
    except Exception as e:
        return error_response(f"更新AI配置失败: {str(e)}")


async def delete_ai_provider(request: web.Request) -> web.Response:
    """DELETE /api/ai-providers/{id} - delete an AI provider."""
    provider_id = int(request.match_info["id"])
    
    try:
        success = await db.delete_ai_provider(provider_id)
        if success:
            return json_response({"deleted": True})
        else:
            return error_response("AI配置不存在", code=404)
    except Exception as e:
        return error_response(f"删除AI配置失败: {str(e)}")


async def activate_ai_provider(request: web.Request) -> web.Response:
    """PUT /api/ai-providers/{id}/activate - set as active AI provider."""
    provider_id = int(request.match_info["id"])
    
    try:
        await db.activate_ai_provider(provider_id)
        return json_response({"activated": True})
    except Exception as e:
        return error_response(f"激活AI配置失败: {str(e)}")


# ============ User Contexts Endpoints (我的现状) ============

async def get_user_contexts(request: web.Request) -> web.Response:
    """GET /api/user-contexts - list all user contexts."""
    try:
        contexts = await db.get_user_contexts()
        return json_response(contexts)
    except Exception as e:
        return error_response(f"获取现状失败: {str(e)}")


async def create_user_context(request: web.Request) -> web.Response:
    """POST /api/user-contexts - create a new user context."""
    try:
        data = await request.json()
    except json.JSONDecodeError:
        return error_response("无效的JSON数据")
    
    try:
        context = await db.create_user_context(
            content=data.get("content", "").strip(),
        )
        return json_response(context)
    except Exception as e:
        return error_response(f"创建现状失败: {str(e)}")


async def update_user_context(request: web.Request) -> web.Response:
    """PUT /api/user-contexts/{id} - update a user context."""
    context_id = int(request.match_info["id"])
    
    try:
        data = await request.json()
    except json.JSONDecodeError:
        return error_response("无效的JSON数据")
    
    try:
        context = await db.update_user_context(
            context_id=context_id,
            content=data.get("content", "").strip(),
        )
        if context:
            return json_response(context)
        else:
            return error_response("现状不存在", code=404)
    except Exception as e:
        return error_response(f"更新现状失败: {str(e)}")


async def delete_user_context(request: web.Request) -> web.Response:
    """DELETE /api/user-contexts/{id} - delete a user context."""
    context_id = int(request.match_info["id"])
    
    try:
        success = await db.delete_user_context(context_id)
        if success:
            return json_response({"deleted": True})
        else:
            return error_response("现状不存在", code=404)
    except Exception as e:
        return error_response(f"删除现状失败: {str(e)}")


async def reorder_user_contexts(request: web.Request) -> web.Response:
    """PUT /api/user-contexts/reorder - reorder user contexts."""
    try:
        data = await request.json()
        context_ids = data.get("context_ids", [])
        if not isinstance(context_ids, list):
            return error_response("context_ids must be an array")
        await db.reorder_user_contexts(context_ids)
        return json_response({"reordered": True})
    except Exception as e:
        return error_response(f"重排现状失败: {str(e)}")


# ============ Note Conversations Endpoints (AI Chat) ============

async def get_note_conversations(request: web.Request) -> web.Response:
    """GET /api/notes/{note_id}/conversations - get conversation history for a note."""
    note_id = int(request.match_info["note_id"])
    try:
        conversations = await db.get_note_conversations(note_id)
        return json_response([c.to_dict() for c in conversations])
    except Exception as e:
        return error_response(f"获取对话历史失败: {str(e)}")


async def chat_note(request: web.Request) -> web.Response:
    """POST /api/notes/{note_id}/chat - chat with AI about a note."""
    note_id = int(request.match_info["note_id"])
    
    try:
        body_bytes = await request.read()
        try:
            body_str = body_bytes.decode('utf-8')
        except UnicodeDecodeError:
            body_str = body_bytes.decode('gbk', errors='replace')
        data = json.loads(body_str)
    except Exception as e:
        return error_response("无效的JSON数据")
    
    try:
        # Get the note content
        note = await db.get_note(note_id)
        if not note:
            return error_response("笔记不存在", code=404)
        
        user_message = data.get("message", "").strip()
        if not user_message:
            return error_response("消息内容不能为空")
        
        selected_text = data.get("selected_text", "")
        
        # Get conversation history for context
        conversations = await db.get_note_conversations(note_id)
        history_str = ""
        if conversations:
            history_lines = []
            for c in conversations:
                role_label = "用户" if c.role == "user" else "AI"
                history_lines.append(f"{role_label}：{c.content}")
            history_str = "\n".join(history_lines)
        
        # Call LLM service
        from .llm_service import llm_service
        ai_response = await llm_service.chat_about_note(
            note_content=note.content,
            user_message=user_message,
            selected_text=selected_text,
            conversation_history=history_str
        )
        
        if not ai_response:
            return error_response(llm_service.last_error_message or "AI 响应失败，请重试")
        
        # Save user message to history
        user_conv = db.NoteConversation(
            note_id=note_id,
            role="user",
            content=user_message,
            selected_text=selected_text or ""
        )
        await db.create_note_conversation(user_conv)
        
        # Save AI response to history
        ai_conv = db.NoteConversation(
            note_id=note_id,
            role="assistant",
            content=ai_response,
            selected_text=""
        )
        saved_ai = await db.create_note_conversation(ai_conv)
        
        return json_response(saved_ai.to_dict())
    except Exception as e:
        return error_response(f"AI 对话失败: {str(e)}")


async def delete_note_conversations(request: web.Request) -> web.Response:
    """DELETE /api/notes/{note_id}/conversations - clear conversation history for a note."""
    note_id = int(request.match_info["note_id"])
    try:
        await db.delete_note_conversations(note_id)
        return json_response({"deleted": True})
    except Exception as e:
        return error_response(f"清空对话历史失败: {str(e)}")


# ============ Expenses Endpoints ============

async def get_expenses(request: web.Request) -> web.Response:
    """GET /api/expenses?date=month - list expenses."""
    date_filter = request.query.get("date", "month")
    try:
        expenses = await db.get_expenses(date_filter)
        return json_response([e.to_dict() for e in expenses])
    except Exception as e:
        return error_response(f"获取支出记录失败: {str(e)}")


async def create_expense(request: web.Request) -> web.Response:
    """POST /api/expenses - create an expense."""
    try:
        body_bytes = await request.read()
        try:
            body_str = body_bytes.decode('utf-8')
        except UnicodeDecodeError:
            body_str = body_bytes.decode('gbk', errors='replace')
        data = json.loads(body_str)
    except Exception as e:
        return error_response("无效的JSON数据")

    try:
        expense = Expense(
            amount=float(data.get("amount", 0)),
            category=data.get("category", "other"),
            note=data.get("note", "").strip(),
            budget_id=data.get("budget_id"),
            is_test=bool(data.get("is_test", False)),
        )
        if expense.amount <= 0:
            return error_response("金额必须大于0")
        created = await db.create_expense(expense)
        return json_response(created.to_dict())
    except Exception as e:
        return error_response(f"创建支出记录失败: {str(e)}")


async def update_expense(request: web.Request) -> web.Response:
    """PUT /api/expenses/{id} - update an expense."""
    expense_id = int(request.match_info["id"])
    try:
        body_bytes = await request.read()
        try:
            body_str = body_bytes.decode('utf-8')
        except UnicodeDecodeError:
            body_str = body_bytes.decode('gbk', errors='replace')
        data = json.loads(body_str)
    except Exception as e:
        return error_response("无效的JSON数据")

    try:
        existing = await db.get_expense(expense_id)
        if not existing:
            return error_response("支出记录不存在", code=404)
        expense = Expense(
            amount=float(data.get("amount", existing.amount)),
            category=data.get("category", existing.category),
            note=data.get("note", existing.note).strip(),
            budget_id=data.get("budget_id", existing.budget_id),
            is_test=data.get("is_test", existing.is_test),
        )
        updated = await db.update_expense(expense_id, expense)
        if not updated:
            return error_response("支出记录不存在", code=404)
        return json_response(updated.to_dict())
    except Exception as e:
        return error_response(f"更新支出记录失败: {str(e)}")


async def delete_expense(request: web.Request) -> web.Response:
    """DELETE /api/expenses/{id} - delete an expense."""
    expense_id = int(request.match_info["id"])
    try:
        success = await db.delete_expense(expense_id)
        if success:
            return json_response({"deleted": True})
        return error_response("支出记录不存在", code=404)
    except Exception as e:
        return error_response(f"删除支出记录失败: {str(e)}")


async def get_expense_stats(request: web.Request) -> web.Response:
    """GET /api/expenses/stats?date=month - get expense statistics."""
    date_filter = request.query.get("date", "month")
    try:
        stats = await db.get_expense_stats(date_filter)
        return json_response(stats)
    except Exception as e:
        return error_response(f"获取支出统计失败: {str(e)}")


async def get_expense_categories(request: web.Request) -> web.Response:
    """GET /api/expenses/categories - list expense categories (merged default + custom)."""
    try:
        custom_cats = await db.get_expense_categories()
        merged = list(EXPENSE_CATEGORIES) + custom_cats
        return json_response(merged)
    except Exception as e:
        return error_response(f"获取分类失败: {str(e)}")


async def create_expense_category(request: web.Request) -> web.Response:
    """POST /api/expenses/categories - create a new expense category."""
    try:
        data = await request.json()
        name = data.get("name", "").strip()
        color = data.get("color", "#6B7280")
        if not name:
            return error_response("分类名称不能为空")
        cat = await db.create_expense_category(name, color)
        return json_response(cat)
    except Exception as e:
        return error_response(f"创建分类失败: {str(e)}")


async def update_expense_category(request: web.Request) -> web.Response:
    """PUT /api/expenses/categories/{id} - update an expense category."""
    cat_id = int(request.match_info["id"])
    try:
        data = await request.json()
        name = data.get("name", "").strip()
        color = data.get("color", "#6B7280")
        if not name:
            return error_response("分类名称不能为空")
        cat = await db.update_expense_category(cat_id, name, color)
        if cat:
            return json_response(cat)
        return error_response("分类不存在", code=404)
    except Exception as e:
        return error_response(f"更新分类失败: {str(e)}")


async def delete_expense_category(request: web.Request) -> web.Response:
    """DELETE /api/expenses/categories/{id} - delete an expense category."""
    cat_id = int(request.match_info["id"])
    try:
        deleted = await db.delete_expense_category(cat_id)
        if deleted:
            return json_response({"success": True})
        return error_response("分类不存在", code=404)
    except Exception as e:
        return error_response(f"删除分类失败: {str(e)}")


# ============================================
# Budgets API
# ============================================

async def get_budgets(request: web.Request) -> web.Response:
    """GET /api/budgets - list all budgets with spent/remaining stats."""
    try:
        budgets = await db.get_budgets_with_stats()
        return json_response(budgets)
    except Exception as e:
        return error_response(f"获取预算失败: {str(e)}")


async def get_budget(request: web.Request) -> web.Response:
    """GET /api/budgets/{id} - get a single budget with spent/remaining stats."""
    budget_id = int(request.match_info["id"])
    try:
        budget_with_stats = await db.get_budget_with_stats(budget_id)
        if budget_with_stats is None:
            return error_response("预算不存在", code=404)
        return json_response(budget_with_stats)
    except Exception as e:
        return error_response(f"获取预算失败: {str(e)}")


async def create_budget(request: web.Request) -> web.Response:
    """POST /api/budgets - create a new budget."""
    try:
        body_bytes = await request.read()
        try:
            body_str = body_bytes.decode('utf-8')
        except UnicodeDecodeError:
            body_str = body_bytes.decode('gbk', errors='replace')
        data = json.loads(body_str)
    except Exception:
        return error_response("无效的JSON数据")

    try:
        # Parse period_start if provided
        period_start = None
        if data.get("period_start"):
            from datetime import datetime
            period_start = datetime.fromisoformat(data.get("period_start").replace("Z", "+00:00"))
        
        budget = Budget(
            name=(data.get("name", "") or "").strip(),
            amount=float(data.get("amount", 0)),
            color=data.get("color", "#3B82F6"),
            period=data.get("period", "none"),
            auto_reset=bool(data.get("auto_reset", False)),
            rollover=bool(data.get("rollover", False)),
            rollover_limit=data.get("rollover_limit"),
            period_start=period_start,
            is_test=bool(data.get("is_test", False)),
        )
        if not budget.name:
            return error_response("预算名称不能为空")
        if budget.amount <= 0:
            return error_response("预算金额必须大于0")
        created = await db.create_budget(budget)
        return json_response(created.to_dict())
    except Exception as e:
        return error_response(f"创建预算失败: {str(e)}")


async def update_budget(request: web.Request) -> web.Response:
    """PUT /api/budgets/{id} - update a budget."""
    budget_id = int(request.match_info["id"])
    try:
        body_bytes = await request.read()
        try:
            body_str = body_bytes.decode('utf-8')
        except UnicodeDecodeError:
            body_str = body_bytes.decode('gbk', errors='replace')
        data = json.loads(body_str)
    except Exception:
        return error_response("无效的JSON数据")

    try:
        existing = await db.get_budget(budget_id)
        if not existing:
            return error_response("预算不存在", code=404)
        
        # Parse period_start if provided
        period_start = existing.period_start
        if "period_start" in data and data.get("period_start"):
            from datetime import datetime
            period_start = datetime.fromisoformat(data.get("period_start").replace("Z", "+00:00"))
        
        budget = Budget(
            name=(data.get("name", existing.name) or "").strip(),
            amount=float(data.get("amount", existing.amount)),
            color=data.get("color", existing.color),
            period=data.get("period", existing.period),
            auto_reset=bool(data.get("auto_reset", existing.auto_reset)),
            rollover=bool(data.get("rollover", existing.rollover)),
            rollover_limit=data.get("rollover_limit") if "rollover_limit" in data else existing.rollover_limit,
            rollover_amount=data.get("rollover_amount", existing.rollover_amount),
            period_start=period_start,
        )
        if not budget.name:
            return error_response("预算名称不能为空")
        if budget.amount <= 0:
            return error_response("预算金额必须大于0")
        updated = await db.update_budget(budget_id, budget)
        return json_response(updated.to_dict())
    except Exception as e:
        return error_response(f"更新预算失败: {str(e)}")


async def delete_budget(request: web.Request) -> web.Response:
    """DELETE /api/budgets/{id} - delete a budget."""
    budget_id = int(request.match_info["id"])
    try:
        success = await db.delete_budget(budget_id)
        if success:
            return json_response({"deleted": True})
        return error_response("预算不存在", code=404)
    except Exception as e:
        return error_response(f"删除预算失败: {str(e)}")


async def get_budget_expenses(request: web.Request) -> web.Response:
    """GET /api/budgets/{id}/expenses - get expenses for a specific budget."""
    budget_id = int(request.match_info["id"])
    try:
        budget = await db.get_budget(budget_id)
        if not budget:
            return error_response("预算不存在", code=404)
        expenses = await db.get_expenses_by_budget(budget_id)
        return json_response([e.to_dict() for e in expenses])
    except Exception as e:
        return error_response(f"获取预算支出失败: {str(e)}")


# ============================================
# Budget Templates API
# ============================================

async def get_budget_templates(request: web.Request) -> web.Response:
    """GET /api/budget-templates - list all budget templates."""
    try:
        templates = await db.get_budget_templates()
        return json_response([t.to_dict() for t in templates])
    except Exception as e:
        return error_response(f"获取预算模板失败: {str(e)}")


async def create_budget_template(request: web.Request) -> web.Response:
    """POST /api/budget-templates - create a new budget template."""
    try:
        data = await request.json()
    except json.JSONDecodeError:
        return error_response("无效的JSON数据")
    
    try:
        template = db.BudgetTemplate(
            name=(data.get("name", "") or "").strip(),
            amount=float(data.get("amount", 0)),
            color=data.get("color", "#3B82F6"),
            period=data.get("period", "none"),
            auto_reset=bool(data.get("auto_reset", False)),
            rollover=bool(data.get("rollover", False)),
            rollover_limit=data.get("rollover_limit"),
        )
        if not template.name:
            return error_response("模板名称不能为空")
        if template.amount <= 0:
            return error_response("模板金额必须大于0")
        created = await db.create_budget_template(template)
        return json_response(created.to_dict())
    except Exception as e:
        return error_response(f"创建预算模板失败: {str(e)}")


async def delete_budget_template(request: web.Request) -> web.Response:
    """DELETE /api/budget-templates/{id} - delete a budget template."""
    template_id = int(request.match_info["id"])
    try:
        success = await db.delete_budget_template(template_id)
        if success:
            return json_response({"deleted": True})
        return error_response("模板不存在", code=404)
    except Exception as e:
        return error_response(f"删除预算模板失败: {str(e)}")


# ============================================
# Notes API
# ============================================

async def get_notes(request: web.Request) -> web.Response:
    """GET /api/notes - list all notes."""
    try:
        notes = await db.get_notes()
        return json_response([n.to_dict() for n in notes])
    except Exception as e:
        return error_response(f"获取笔记失败: {str(e)}")


async def create_note(request: web.Request) -> web.Response:
    """POST /api/notes - create a new note."""
    try:
        data = await request.json()
    except json.JSONDecodeError:
        return error_response("无效的JSON数据")
    
    try:
        note = Note(
            title=data.get("title", ""),
            content=data.get("content", ""),
            group_id=data.get("group_id"),
        )
        note = await db.create_note(note)
        return json_response(note.to_dict())
    except Exception as e:
        return error_response(f"创建笔记失败: {str(e)}")


async def update_note(request: web.Request) -> web.Response:
    """PUT /api/notes/{id} - update a note."""
    note_id = int(request.match_info["id"])
    
    try:
        data = await request.json()
    except json.JSONDecodeError:
        return error_response("无效的JSON数据")
    
    try:
        existing = await db.get_note(note_id)
        if not existing:
            return error_response("笔记不存在", code=404)
        
        # Handle sort_order - use new value if provided, otherwise keep existing
        sort_order = data.get("sort_order")
        if sort_order is None:
            sort_order = existing.sort_order
        
        note = Note(
            title=data.get("title", existing.title) or existing.title,
            content=data.get("content", existing.content) or existing.content,
            group_id=data.get("group_id", existing.group_id),
            sort_order=sort_order,
        )
        result = await db.update_note(note_id, note)
        if not result:
            return error_response("笔记不存在", code=404)
        return json_response(result.to_dict())
    except Exception as e:
        return error_response(f"更新笔记失败: {str(e)}")


async def delete_note(request: web.Request) -> web.Response:
    """DELETE /api/notes/{id} - delete a note."""
    note_id = int(request.match_info["id"])
    
    try:
        success = await db.delete_note(note_id)
        if not success:
            return error_response("笔记不存在", code=404)
        return json_response({"success": True})
    except Exception as e:
        return error_response(f"删除笔记失败: {str(e)}")


# ============================================
# Note Groups API
# ============================================

async def get_note_groups(request: web.Request) -> web.Response:
    """GET /api/note-groups - list all note groups."""
    try:
        groups = await db.get_note_groups()
        return json_response([g.to_dict() for g in groups])
    except Exception as e:
        return error_response(f"获取笔记分组失败: {str(e)}")


async def create_note_group(request: web.Request) -> web.Response:
    """POST /api/note-groups - create a new note group."""
    try:
        data = await request.json()
    except json.JSONDecodeError:
        return error_response("无效的JSON数据")
    
    try:
        note_group = NoteGroup(
            name=data.get("name", ""),
            sort_order=data.get("sort_order", 0),
        )
        note_group = await db.create_note_group(note_group)
        return json_response(note_group.to_dict())
    except Exception as e:
        return error_response(f"创建笔记分组失败: {str(e)}")


async def update_note_group(request: web.Request) -> web.Response:
    """PUT /api/note-groups/{id} - update a note group."""
    group_id = int(request.match_info["id"])
    
    try:
        data = await request.json()
    except json.JSONDecodeError:
        return error_response("无效的JSON数据")
    
    try:
        note_group = NoteGroup(
            name=data.get("name", ""),
            sort_order=data.get("sort_order", 0),
        )
        result = await db.update_note_group(group_id, note_group)
        if not result:
            return error_response("笔记分组不存在", code=404)
        return json_response(result.to_dict())
    except Exception as e:
        return error_response(f"更新笔记分组失败: {str(e)}")


async def delete_note_group(request: web.Request) -> web.Response:
    """DELETE /api/note-groups/{id} - delete a note group."""
    group_id = int(request.match_info["id"])
    
    try:
        success = await db.delete_note_group(group_id)
        if not success:
            return error_response("笔记分组不存在", code=404)
        return json_response({"success": True})
    except Exception as e:
        return error_response(f"删除笔记分组失败: {str(e)}")


async def cleanup_test_entries(request: web.Request) -> web.Response:
    """POST /api/settings/cleanup_test_entries - cleanup test/demo/debug data."""
    try:
        result = await db.cleanup_test_entries()
        return json_response(result)
    except Exception as e:
        return error_response(f"清理测试条目失败: {str(e)}")


async def llm_parse_expense(request: web.Request) -> web.Response:
    """POST /api/llm/parse_expense - parse natural language expense into structured data.
    
    Body: {"text": "中午吃面15块"}
    Returns: {"amount": 15, "category": "food", "note": "吃面", "budget_id": null or 1}
    """
    try:
        body_bytes = await request.read()
        try:
            body_str = body_bytes.decode('utf-8')
        except UnicodeDecodeError:
            try:
                body_str = body_bytes.decode('gbk')
            except UnicodeDecodeError:
                body_str = body_bytes.decode('latin-1')
        data = json.loads(body_str)
    except Exception as e:
        return error_response("无效的请求")
    
    user_text = data.get("text", "").strip()
    if not user_text:
        return error_response("输入不能为空")
    
    # Get existing budgets for context
    budgets = await db.get_budgets_with_stats()
    budget_list = [{"id": b["id"], "name": b["name"], "color": b["color"]} for b in budgets if b.get("id")]
    
    # Get auto_assign setting
    auto_assign = await db.get_setting("auto_assign_budget_from_llm")
    auto_assign_budget = bool(auto_assign and auto_assign.lower() == "true")
    
    from .llm_service import llm_service
    
    parsed = await llm_service.parse_expense(user_text, budgets=budget_list, auto_assign_budget=auto_assign_budget)
    if not parsed:
        return error_response(llm_service.last_error_message or "AI解析失败，请检查网络连接或稍后重试")
    
    # Ensure it's a list
    if isinstance(parsed, dict) and "expenses" in parsed:
        expenses_list = parsed["expenses"]
    elif isinstance(parsed, list):
        expenses_list = parsed
    else:
        expenses_list = [parsed]
    
    # Create each expense
    created_expenses = []
    for exp_data in expenses_list:
        try:
            expense = Expense(
                amount=float(exp_data.get("amount", 0)),
                category=exp_data.get("category", "other"),
                note=exp_data.get("note", "").strip() or "记账",
                budget_id=exp_data.get("budget_id"),
                is_test=bool(exp_data.get("is_test", False)),
            )
            if expense.amount > 0:
                created = await db.create_expense(expense)
                created_expenses.append(created.to_dict())
        except (ValueError, TypeError):
            continue
    
    if not created_expenses:
        return error_response("没有有效的支出记录")
    
    return json_response({
        "count": len(created_expenses),
        "expenses": created_expenses
    })


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


def setup_routes(app: web.Application) -> None:
    """Setup all routes."""
    app.router.add_get("/api/events", get_events)
    app.router.add_post("/api/events", create_event)
    app.router.add_put("/api/events/{id}", update_event)
    app.router.add_delete("/api/events/{id}", delete_event)
    app.router.add_put("/api/events/{id}/complete", complete_event)
    app.router.add_put("/api/events/{id}/uncomplete", uncomplete_event)
    app.router.add_get("/api/events/{id}/history", get_event_history)
    app.router.add_get("/api/event-history", get_all_event_history)
    app.router.add_get("/api/stats", get_stats)
    app.router.add_get("/api/categories", get_categories)
    # Goals endpoints
    app.router.add_get("/api/goals", get_goals)
    app.router.add_post("/api/goals", create_goal)
    app.router.add_put("/api/goals/{id}", update_goal)
    app.router.add_delete("/api/goals/{id}", delete_goal)
    app.router.add_get("/api/goals/{id}/tree", get_goal_tree)
    app.router.add_get("/api/goals/{id}/subtasks", get_goal_subtasks)
    app.router.add_get("/api/goals/{id}/conversations", get_goal_conversations)
    app.router.add_post("/api/goals/{id}/conversations", create_goal_conversation)
    app.router.add_get("/api/goals/{id}/deliverables", get_goal_deliverables)
    app.router.add_post("/api/goals/{id}/deliverables", create_goal_deliverable)
    app.router.add_put("/api/goals/deliverables/{id}", update_goal_deliverable)
    app.router.add_delete("/api/goals/deliverables/{id}", delete_goal_deliverable)
    app.router.add_post("/api/goals/ai/discuss", ai_discuss_goal)
    app.router.add_post("/api/goals/ai/reschedule", ai_reschedule_goal)
    # Settings endpoints
    app.router.add_get("/api/settings", get_settings)
    app.router.add_put("/api/settings/{key}", update_setting)
    app.router.add_post("/api/settings/cleanup_test_entries", cleanup_test_entries)
    # LLM endpoints
    app.router.add_post("/api/llm/chat", llm_chat)
    app.router.add_post("/api/llm/create", llm_create)
    app.router.add_post("/api/llm/command", llm_command)
    app.router.add_post("/api/llm/breakdown", llm_breakdown)
    app.router.add_post("/api/llm/parse_expense", llm_parse_expense)
    # Notes endpoints
    app.router.add_get("/api/notes", get_notes)
    app.router.add_post("/api/notes", create_note)
    app.router.add_put("/api/notes/{id}", update_note)
    app.router.add_delete("/api/notes/{id}", delete_note)
    # Note groups endpoints
    app.router.add_get("/api/note-groups", get_note_groups)
    app.router.add_post("/api/note-groups", create_note_group)
    app.router.add_put("/api/note-groups/{id}", update_note_group)
    app.router.add_delete("/api/note-groups/{id}", delete_note_group)
    # Note conversations (AI chat) endpoints
    app.router.add_get("/api/notes/{note_id}/conversations", get_note_conversations)
    app.router.add_post("/api/notes/{note_id}/chat", chat_note)
    app.router.add_delete("/api/notes/{note_id}/conversations", delete_note_conversations)
    # Expenses endpoints
    app.router.add_get("/api/expenses", get_expenses)
    app.router.add_post("/api/expenses", create_expense)
    app.router.add_put("/api/expenses/{id}", update_expense)
    app.router.add_delete("/api/expenses/{id}", delete_expense)
    app.router.add_get("/api/expenses/stats", get_expense_stats)
    app.router.add_get("/api/expenses/categories", get_expense_categories)
    app.router.add_post("/api/expenses/categories", create_expense_category)
    app.router.add_put("/api/expenses/categories/{id}", update_expense_category)
    app.router.add_delete("/api/expenses/categories/{id}", delete_expense_category)

    # AI Providers
    app.router.add_get("/api/ai-providers", get_ai_providers)
    app.router.add_post("/api/ai-providers", create_ai_provider)
    app.router.add_put("/api/ai-providers/{id}", update_ai_provider)
    app.router.add_delete("/api/ai-providers/{id}", delete_ai_provider)
    app.router.add_put("/api/ai-providers/{id}/activate", activate_ai_provider)
    
    # User Contexts (我的现状)
    app.router.add_get("/api/user-contexts", get_user_contexts)
    app.router.add_post("/api/user-contexts", create_user_context)
    app.router.add_put("/api/user-contexts/{id}", update_user_context)
    app.router.add_delete("/api/user-contexts/{id}", delete_user_context)
    app.router.add_put("/api/user-contexts/reorder", reorder_user_contexts)
    # Budgets endpoints
    app.router.add_get("/api/budgets", get_budgets)
    app.router.add_post("/api/budgets", create_budget)
    app.router.add_get("/api/budgets/{id}", get_budget)
    app.router.add_put("/api/budgets/{id}", update_budget)
    app.router.add_delete("/api/budgets/{id}", delete_budget)
    app.router.add_get("/api/budgets/{id}/expenses", get_budget_expenses)
    # Budget templates endpoints
    app.router.add_get("/api/budget-templates", get_budget_templates)
    app.router.add_post("/api/budget-templates", create_budget_template)
    app.router.add_delete("/api/budget-templates/{id}", delete_budget_template)
