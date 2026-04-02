"""REST API routes for schedule management."""
import json
import aiosqlite
from aiohttp import web
from typing import Any

from . import db
from .models import Event, Goal, CATEGORIES


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


async def get_events(request: web.Request) -> web.Response:
    """GET /api/events?date=today|week|month|YYYY-MM-DD|YYYY-MM - list events."""
    date_filter = request.query.get("date", "today")
    # Accept today/week/month or specific date (YYYY-MM-DD) or month (YYYY-MM)
    valid_filters = ("today", "week", "month")
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

        # Create Event object
        event = Event(
            title=data.get("title", ""),
            start_time=_parse_datetime(data.get("start_time")),
            end_time=_parse_datetime(data.get("end_time")),
            category_id=data.get("category_id", "work"),
            all_day=data.get("all_day", False),
            recurrence=data.get("recurrence", "none"),
            status=data.get("status", "pending"),
            reminder_enabled=data.get("reminder_enabled", False),
            reminder_minutes=data.get("reminder_minutes", 1),
            reminder_sent=data.get("reminder_sent", False),
        )

        event = await db.create_event(event)
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
        return json_response(updated.to_dict())
    except Exception as e:
        return error_response(f"更新事件失败: {str(e)}")


async def delete_event(request: web.Request) -> web.Response:
    """DELETE /api/events/{id} - delete event."""
    event_id = int(request.match_info["id"])

    try:
        success = await db.delete_event(event_id)
        if success:
            return json_response({"deleted": True})
        else:
            return error_response("事件不存在", code=404)
    except Exception as e:
        return error_response(f"删除事件失败: {str(e)}")


async def complete_event(request: web.Request) -> web.Response:
    """PUT /api/events/{id}/complete - mark complete."""
    event_id = int(request.match_info["id"])

    try:
        event = await db.complete_event(event_id)
        if event:
            return json_response(event.to_dict())
        else:
            return error_response("事件不存在", code=404)
    except Exception as e:
        return error_response(f"完成事件失败: {str(e)}")


async def uncomplete_event(request: web.Request) -> web.Response:
    """PUT /api/events/{id}/uncomplete - mark back to pending (undo)."""
    event_id = int(request.match_info["id"])

    try:
        event = await db.uncomplete_event(event_id)
        if event:
            return json_response(event.to_dict())
        else:
            return error_response("事件不存在", code=404)
    except Exception as e:
        return error_response(f"撤销完成失败: {str(e)}")


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
    
    result = await llm_service.process_schedule_command(user_text)
    if result:
        return json_response(result)
    else:
        return error_response("LLM处理失败，请检查API配置或稍后重试")


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
    from datetime import datetime, timedelta
    
    print(f"LLM create request: {user_text}")
    result = await llm_service.process_schedule_command(user_text)
    print(f"LLM create result: {result}")
    
    if not result:
        return error_response("LLM处理失败，请检查网络连接或稍后重试")
    
    # Handle multiple events or single event
    events_list = []
    events_data = result.get("events", [])
    
    if not events_data:
        return error_response("LLM未能解析出日程，请尝试更明确的表达")
    
    # Ensure it's a list
    if isinstance(events_data, dict):
        events_data = [events_data]
    
    # Calculate start time for sequential events
    base_time = datetime.now().replace(second=0, microsecond=0)
    
    for i, event_data in enumerate(events_data):
        title = event_data.get("title", user_text)
        start_time_str = event_data.get("start_time")
        duration_minutes = event_data.get("duration_minutes", 30)
        category_id = event_data.get("category_id", "work")
        
        # Parse start_time
        start_time = None
        if start_time_str:
            start_time = _parse_datetime(start_time_str)
        
        # If no start_time or it's a sequential event after the previous one
        if not start_time and i > 0 and events_list:
            # Start after the previous event
            prev_end = events_list[-1].get("end_time")
            if prev_end:
                start_time = prev_end
        
        if not start_time:
            start_time = base_time
        
        end_time = start_time + timedelta(minutes=duration_minutes)
        
        event = Event(
            title=title,
            start_time=start_time,
            end_time=end_time,
            category_id=category_id,
            all_day=False,
            recurrence="none",
            status="pending",
        )
        
        try:
            event = await db.create_event(event)
            events_list.append(event)
        except Exception as e:
            print(f"Error creating event {title}: {e}")
    
    if not events_list:
        return error_response(f"创建事件失败")
    
    return json_response([e.to_dict() for e in events_list])


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
    if not user_text:
        return error_response("请输入任务描述")
    
    from .llm_service import llm_service
    
    result = await llm_service.breakdown_task(user_text, horizon=horizon)
    if result:
        return json_response(result)
    else:
        return error_response("LLM拆解失败")


async def get_goals(request: web.Request) -> web.Response:
    """GET /api/goals?horizon=short|semester|long - list goals."""
    horizon = request.query.get("horizon")
    try:
        goals = await db.get_goals(horizon)
        return json_response([g.to_dict() for g in goals])
    except Exception as e:
        return error_response(f"获取目标失败: {str(e)}")


async def create_goal(request: web.Request) -> web.Response:
    """POST /api/goals - create goal."""
    try:
        data = await request.json()
    except json.JSONDecodeError:
        return error_response("无效的JSON数据")

    try:
        goal = Goal(
            title=data.get("title", "").strip(),
            description=data.get("description", "").strip(),
            horizon=data.get("horizon", "short"),
            status=data.get("status", "active"),
            start_date=_parse_datetime(data.get("start_date")),
            end_date=_parse_datetime(data.get("end_date")),
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
    """DELETE /api/goals/{id} - delete goal."""
    goal_id = int(request.match_info["id"])
    try:
        success = await db.delete_goal(goal_id)
        if success:
            return json_response({"deleted": True})
        return error_response("目标不存在", code=404)
    except Exception as e:
        return error_response(f"删除目标失败: {str(e)}")


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


def setup_routes(app: web.Application) -> None:
    """Setup all routes."""
    app.router.add_get("/api/events", get_events)
    app.router.add_post("/api/events", create_event)
    app.router.add_put("/api/events/{id}", update_event)
    app.router.add_delete("/api/events/{id}", delete_event)
    app.router.add_put("/api/events/{id}/complete", complete_event)
    app.router.add_put("/api/events/{id}/uncomplete", uncomplete_event)
    app.router.add_get("/api/stats", get_stats)
    app.router.add_get("/api/categories", get_categories)
    # Goals endpoints
    app.router.add_get("/api/goals", get_goals)
    app.router.add_post("/api/goals", create_goal)
    app.router.add_put("/api/goals/{id}", update_goal)
    app.router.add_delete("/api/goals/{id}", delete_goal)
    # Settings endpoints
    app.router.add_get("/api/settings", get_settings)
    app.router.add_put("/api/settings/{key}", update_setting)
    # LLM endpoints
    app.router.add_post("/api/llm/chat", llm_chat)
    app.router.add_post("/api/llm/create", llm_create)
    app.router.add_post("/api/llm/breakdown", llm_breakdown)
