"""Event HTTP endpoints."""
from aiohttp import web
from typing import Any
from .. import db
from ..models import Event, EventHistory
from ._helpers import (
    json_response, error_response,
    _parse_datetime, _extract_deadline_from_text, _extract_deadline_label_from_text,
    _append_deadline_label, _has_explicit_clock_time_in_text, _parse_date_range,
    _update_event_stats, _handle_event_operation,
)


# ============= Event Handlers =============

"""GET /api/events?date=today|week|month|all|YYYY-MM-DD|YYYY-MM - list events."""
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




"""POST /api/events - create event."""
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
            from ..time_parser import parse_time
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
            priority=data.get("priority", "none"),
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




"""PUT /api/events/{id} - update event."""
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
            priority=data.get("priority", existing.priority),
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




"""DELETE /api/events/{id} - delete event."""
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




"""PUT /api/events/{id}/complete - mark event complete."""
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




"""PUT /api/events/{id}/uncomplete - mark event incomplete."""
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




"""GET /api/events/{id}/history - get event history."""
async def get_event_history(request: web.Request) -> web.Response:
    """GET /api/events/{id}/history - get history for an event."""
    event_id = int(request.match_info["id"])

    try:
        history = await db.get_event_history(event_id)
        return json_response([h.to_dict() for h in history])
    except Exception as e:
        return error_response(f"获取历史记录失败: {str(e)}")




"""GET /api/event-history - get all event history."""
async def get_all_event_history(request: web.Request) -> web.Response:
    """GET /api/event-history - get all event history."""
    try:
        limit = int(request.query.get("limit", 100))
        offset = int(request.query.get("offset", 0))
        history = await db.get_all_event_history(limit=limit, offset=offset)
        return json_response([h.to_dict() for h in history])
    except Exception as e:
        return error_response(f"获取历史记录失败: {str(e)}")




"""GET /api/deleted-events - get deleted events."""
async def get_deleted_events(request: web.Request) -> web.Response:
    """GET /api/deleted-events - get list of deleted events that can be restored."""
    try:
        limit = int(request.query.get("limit", 100))
        deleted = await db.get_deleted_events(limit=limit)
        return json_response(deleted)
    except Exception as e:
        return error_response(f"获取已删除事件失败: {str(e)}")




"""POST /api/deleted-events/{id}/restore - restore deleted event."""
async def restore_deleted_event(request: web.Request) -> web.Response:
    """POST /api/deleted-events/{id}/restore - restore a deleted event."""
    try:
        deleted_id = int(request.match_info.get("id", 0))
        if not deleted_id:
            return error_response("无效的ID")
        
        event = await db.restore_deleted_event(deleted_id)
        if not event:
            return error_response("找不到要恢复的事件")
        
        return json_response({
            "restored": event.to_dict(),
            "message": "事件已恢复"
        })
    except Exception as e:
        return error_response(f"恢复事件失败: {str(e)}")




"""DELETE /api/deleted-events/{id} - permanently delete event."""
async def permanent_delete_event(request: web.Request) -> web.Response:
    """DELETE /api/deleted-events/{id} - permanently delete from backup (cannot restore)."""
    try:
        deleted_id = int(request.match_info.get("id", 0))
        if not deleted_id:
            return error_response("无效的ID")
        
        success = await db.permanent_delete(deleted_id)
        if not success:
            return error_response("找不到要永久删除的事件")
        
        return json_response({"message": "已永久删除"})
    except Exception as e:
        return error_response(f"永久删除失败: {str(e)}")




"""GET /api/event-modifications - get event modifications."""
async def get_event_modifications(request: web.Request) -> web.Response:
    """GET /api/event-modifications - get event modification history for undo."""
    try:
        event_id = request.query.get("event_id")
        limit = int(request.query.get("limit", 100))
        
        if event_id:
            modifications = await db.get_event_modifications(int(event_id), limit)
        else:
            modifications = await db.get_event_modifications(limit=limit)
        
        return json_response(modifications)
    except Exception as e:
        return error_response(f"获取修改历史失败: {str(e)}")




"""POST /api/event-modifications/{id}/undo - undo event modification."""
async def undo_event_modification(request: web.Request) -> web.Response:
    """POST /api/event-modifications/{id}/undo - restore event to previous state."""
    try:
        modification_id = int(request.match_info.get("id", 0))
        if not modification_id:
            return error_response("无效的ID")

        event = await db.undo_event_modification(modification_id)
        if not event:
            return error_response("找不到要撤销的修改")

        return json_response({
            "restored": event.to_dict(),
            "message": "已撤销到之前的版本"
        })
    except Exception as e:
        return error_response(f"撤销修改失败: {str(e)}")




"""POST /api/events/postpone-undo - undo event postpone."""
async def undo_postpone(request: web.Request) -> web.Response:
    """POST /api/events/postpone-undo - undo last postpone operation.

    Body: {"details": [{"id": 123, "old_start": "...", "old_end": "..."}, ...]}
    """
    try:
        body = await request.json()
        details = body.get("details", [])
        if not details or not isinstance(details, list):
            return error_response("无效的撤销数据")

        result = await db.undo_postpone_events(details)
        return json_response({
            "restored": result.get("restored", 0),
            "message": f"已恢复 {result.get('restored', 0)} 个日程的原时间"
        })
    except Exception as e:
        return error_response(f"撤销推迟失败: {str(e)}")




# ============= Route Registration =============

def register_routes(app: web.Application) -> None:
    app.router.add_get("/api/events", get_events)
    app.router.add_post("/api/events", create_event)
    app.router.add_put("/api/events/{id}", update_event)
    app.router.add_delete("/api/events/{id}", delete_event)
    app.router.add_put("/api/events/{id}/complete", complete_event)
    app.router.add_put("/api/events/{id}/uncomplete", uncomplete_event)
    app.router.add_get("/api/events/{id}/history", get_event_history)
    app.router.add_get("/api/event-history", get_all_event_history)
    app.router.add_get("/api/deleted-events", get_deleted_events)
    app.router.add_post("/api/deleted-events/{id}/restore", restore_deleted_event)
    app.router.add_delete("/api/deleted-events/{id}", permanent_delete_event)
    app.router.add_get("/api/event-modifications", get_event_modifications)
    app.router.add_post("/api/event-modifications/{id}/undo", undo_event_modification)
    app.router.add_post("/api/events/postpone-undo", undo_postpone)
