"""REST API routes for schedule management."""
import json
import re
import aiosqlite
from datetime import datetime, timedelta
from aiohttp import web
from typing import Any

from . import db
from .models import Event, Goal, GoalConversation, Note, Expense, CATEGORIES, EXPENSE_CATEGORIES


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
    
    deadline_dt = _extract_deadline_from_text(user_text)
    deadline_label = _extract_deadline_label_from_text(user_text)
    has_explicit_clock_time = _has_explicit_clock_time_in_text(user_text)

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

    Body: {"text": "删除所有4月5号的代办", "dry_run": true|false}
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
    created_events = []
    stats = {
        "created": 0,
        "deleted": 0,
        "completed": 0,
        "uncompleted": 0,
    }

    for op in operations:
        if not isinstance(op, dict):
            continue

        action = str(op.get("action", "")).strip().lower()
        if action not in {"create", "delete", "complete", "uncomplete"}:
            continue

        if action == "create":
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
                deadline_label = _extract_deadline_label_from_text(user_text)
                if deadline_label and not _has_explicit_clock_time_in_text(user_text):
                    title = _append_deadline_label(title, deadline_label)

            try:
                duration_minutes = int(op.get("duration_minutes", 30))
            except Exception:
                duration_minutes = 30
            duration_minutes = max(5, min(24 * 60, duration_minutes))

            end_time = start_time + timedelta(minutes=duration_minutes) if start_time else None

            preview_item = {
                "action": "create",
                "title": title,
                "start_time": start_time.isoformat() if start_time else None,
                "duration_minutes": duration_minutes,
                "category_id": category_id,
            }

            if not dry_run:
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
                created_events.append(created.to_dict())
                stats["created"] += 1
                preview_item["id"] = created.id

            preview_ops.append(preview_item)
            continue

        scope = str(op.get("scope") or "all").strip().lower()
        date_str = (op.get("date") or "").strip() if scope == "date" else ""

        start = None
        end = None
        if scope == "date":
            start, end = _parse_date_range(date_str)
            if not start or not end:
                preview_ops.append({
                    "action": action,
                    "scope": "date",
                    "date": date_str,
                    "error": "日期格式无效，应为YYYY-MM-DD",
                })
                continue

        preview_item = {
            "action": action,
            "scope": scope,
            "date": date_str if scope == "date" else None,
        }

        if not dry_run:
            if action == "delete":
                affected = await db.batch_delete_events(start, end)
                stats["deleted"] += affected
            elif action == "complete":
                affected = await db.batch_complete_events(start, end)
                stats["completed"] += affected
            else:  # uncomplete
                affected = await db.batch_uncomplete_events(start, end)
                stats["uncompleted"] += affected
            preview_item["affected"] = affected

        preview_ops.append(preview_item)

    return json_response({
        "dry_run": dry_run,
        "summary": plan.get("summary", ""),
        "operations": preview_ops,
        "stats": stats,
        "created_events": created_events,
    })


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
        return error_response("LLM拆解失败")


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
            return error_response("AI 响应失败，请稍后重试")
        
        return json_response(result)
    
    except Exception as e:
        import traceback
        traceback.print_exc()
        return error_response(f"AI 讨论失败: {str(e)}")


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


# ============ Notes Endpoints ============

async def get_notes(request: web.Request) -> web.Response:
    """GET /api/notes - list all notes."""
    try:
        notes = await db.get_notes()
        return json_response([n.to_dict() for n in notes])
    except Exception as e:
        return error_response(f"获取笔记失败: {str(e)}")


async def create_note(request: web.Request) -> web.Response:
    """POST /api/notes - create a note."""
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
        note = Note(
            title=(data.get("title", "") or "").strip(),
            content=(data.get("content", "") or "").strip(),
        )
        if not note.content:
            return error_response("笔记内容不能为空")
        created = await db.create_note(note)
        return json_response(created.to_dict())
    except Exception as e:
        return error_response(f"创建笔记失败: {str(e)}")


async def update_note(request: web.Request) -> web.Response:
    """PUT /api/notes/{id} - update a note."""
    note_id = int(request.match_info["id"])
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
        existing = await db.get_note(note_id)
        if not existing:
            return error_response("笔记不存在", code=404)
        note = Note(
            title=(data.get("title", existing.title) or "").strip(),
            content=(data.get("content", existing.content) or "").strip(),
        )
        updated = await db.update_note(note_id, note)
        if not updated:
            return error_response("笔记不存在", code=404)
        return json_response(updated.to_dict())
    except Exception as e:
        return error_response(f"更新笔记失败: {str(e)}")


async def delete_note(request: web.Request) -> web.Response:
    """DELETE /api/notes/{id} - delete a note."""
    note_id = int(request.match_info["id"])
    try:
        success = await db.delete_note(note_id)
        if success:
            return json_response({"deleted": True})
        return error_response("笔记不存在", code=404)
    except Exception as e:
        return error_response(f"删除笔记失败: {str(e)}")


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
    """GET /api/expenses/categories - list expense categories."""
    return json_response(EXPENSE_CATEGORIES)


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
    Returns: {"amount": 15, "category": "food", "note": "吃面"}
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
    
    from .llm_service import llm_service
    
    result = await llm_service.parse_expense(user_text)
    if result:
        return json_response(result)
    else:
        return error_response("AI解析失败，请检查网络连接或稍后重试")


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
    # AI conversational breakdown endpoint
    app.router.add_post("/api/goals/ai/discuss", ai_discuss_goal)
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
    # Expenses endpoints
    app.router.add_get("/api/expenses", get_expenses)
    app.router.add_post("/api/expenses", create_expense)
    app.router.add_put("/api/expenses/{id}", update_expense)
    app.router.add_delete("/api/expenses/{id}", delete_expense)
    app.router.add_get("/api/expenses/stats", get_expense_stats)
    app.router.add_get("/api/expenses/categories", get_expense_categories)
