"""LLM HTTP endpoints."""
import json
from aiohttp import web
from typing import Any
from .. import db
from ..models import Expense
from ._helpers import (
    json_response, error_response, _sanitize_ai_provider,
    _update_event_stats, _update_expense_stats, _update_note_stats, _update_goal_stats,
    _handle_event_operation, _handle_expense_operation, _handle_note_operation, _handle_goal_operation,
    _parse_datetime, _extract_deadline_from_text, _extract_deadline_label_from_text,
    _append_deadline_label, _has_explicit_clock_time_in_text,
)


# ============= LLM Handlers =============

"""POST /api/llm/chat - chat with LLM."""
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




"""POST /api/llm/create - create with LLM."""
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




"""POST /api/llm/command - execute command via LLM."""
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




"""POST /api/llm/chat-agent - chat with LLM agent."""
async def llm_agent_chat(request: web.Request) -> web.Response:
    """POST /api/llm/chat-agent — 两步 AI Agent 工具调用

    Body:
    {
        "message": "我今天有什么安排？",
        "note_id": 123,          // 可选
        "selected_text": "",     // 可选
        "referenced_notes": [],  // 可选，引用笔记 ID 列表
        "tools": null            // null=全部，["get_note_content"]=仅这些
    }
    """
    try:
        body_bytes = await request.read()
        try:
            body_str = body_bytes.decode('utf-8')
        except UnicodeDecodeError:
            body_str = body_bytes.decode('gbk', errors='replace')
        data = json.loads(body_str)
    except Exception:
        return error_response("无效的JSON数据")

    message = (data.get("message", "") or "").strip()
    if not message:
        return error_response("消息内容不能为空")

    from .llm_service import llm_service
    referenced_notes = data.get("referenced_notes")  # optional list[int]
    response = await llm_service.chat_with_agent(
        message=message,
        note_id=data.get("note_id"),
        selected_text=data.get("selected_text", ""),
        referenced_notes=referenced_notes,
        tools=data.get("tools"),  # None = 全部可用
        db_instance=db,
    )

    if not response:
        return error_response(llm_service.last_error_message or "AI 响应失败")

    # Save conversation history if note_id is provided
    note_id = data.get("note_id")
    if note_id:
        try:
            user_conv = db.NoteConversation(
                note_id=note_id,
                role="user",
                content=message,
                selected_text=data.get("selected_text", "") or ""
            )
            await db.create_note_conversation(user_conv)
            ai_conv = db.NoteConversation(
                note_id=note_id,
                role="assistant",
                content=response,
                selected_text=""
            )
            await db.create_note_conversation(ai_conv)
        except Exception as e:
            print(f"Failed to save conversation: {e}")

    return json_response({"content": response})




"""POST /api/llm/breakdown - breakdown task via LLM."""
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







# ============= Expense Parsing =============

"""POST /api/llm/parse_expense - parse expense via LLM."""
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
                expense_date=exp_data.get("expense_date"),
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


# ============= Route Registration =============

def register_routes(app: web.Application) -> None:
    app.router.add_post("/api/llm/chat", llm_chat)
    app.router.add_post("/api/llm/create", llm_create)
    app.router.add_post("/api/llm/command", llm_command)
    app.router.add_post("/api/llm/breakdown", llm_breakdown)
    app.router.add_post("/api/llm/parse_expense", llm_parse_expense)
    app.router.add_post("/api/llm/chat-agent", llm_agent_chat)
