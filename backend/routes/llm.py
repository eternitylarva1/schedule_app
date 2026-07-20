"""LLM HTTP endpoints."""
import json
import re
from datetime import datetime, timedelta
from aiohttp import web
from typing import Any
from .. import db
from ..models import Expense, Event, CATEGORIES
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
    
    from ..llm_service import llm_service
    from ..db import get_events
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
    
    # 前置检查：输入是否包含时间/日程意图，避免非日程文本浪费 LLM 调用
    if not _has_schedule_input(user_text):
        return error_response("未识别到时间或日程信息，请包含具体时间（如'明天下午3点'）")
    
    try:
        from ..llm_service import llm_service
        from ..db import get_events
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
    
            # Deterministic deadline guard
            if deadline_dt and not has_explicit_clock_time:
                start_time = None
                if deadline_label:
                    title = _append_deadline_label(title, deadline_label)
            
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
                # 去重：跳过 30 秒内相同标题的待创建事件
                import aiosqlite
                from ..db._connection import DB_PATH
                async with aiosqlite.connect(DB_PATH) as dup_db:
                    async with dup_db.execute(
                        "SELECT id FROM events WHERE title = ? AND created_at > datetime('now', '-30 seconds') LIMIT 1",
                        (event.title,)
                    ) as cursor:
                        dup_row = await cursor.fetchone()
                if dup_row:
                    print(f"Skip duplicate event within 30s: {title} (existing id={dup_row[0]})")
                    continue
                event = await db.create_event(event)
                events_list.append(event)
            except Exception as e:
                print(f"Error creating event {title}: {e}")
        
        if not events_list:
            return error_response(f"创建事件失败")
        
        return json_response([e.to_dict() for e in events_list])
    
    except Exception as e:
        print(f"llm_create unexpected error: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        return error_response(f"创建日程失败: {str(e)}")




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

    from ..llm_service import llm_service
    from datetime import datetime

    plan = await llm_service.process_unified_command(user_text)
    if not plan:
        return error_response("LLM命令解析失败，请稍后重试")

    operations = plan.get("operations", [])
    if not isinstance(operations, list) or not operations:
        return error_response("未解析到可执行操作")

    # Retry loop for past-time errors
    max_retries = 3
    original_user_text = user_text

    for retry in range(max_retries):
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
        past_time_errors = []

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
                    if result.get("past_time_error"):
                        past_time_errors.append({
                            "title": result["preview"].get("title", ""),
                            "proposed_start_time": result["preview"].get("start_time"),
                            "current_time": datetime.now().isoformat(),
                            "error_msg": result["preview"].get("past_time_error", "时间已在过去"),
                        })
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

        # Check for past-time errors and retry if needed
        if past_time_errors and not dry_run and retry < max_retries - 1:
            print(f"Past-time errors detected, retry {retry + 1}/{max_retries}: {past_time_errors}")
            new_plan = await llm_service.retry_unified_command_with_errors(original_user_text, past_time_errors)
            if new_plan:
                operations = new_plan.get("operations", [])
                if operations:
                    continue  # Retry with new operations
            # If retry failed or returned no operations, break
            break

        # No past-time errors or dry_run or exhausted retries — return result
        if past_time_errors and retry >= max_retries - 1 and not dry_run:
            return web.json_response({
                "code": -1,
                "message": "多次重试后仍包含过去时间，请重新输入",
                "failed_operations": past_time_errors,
            })

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

    from ..llm_service import llm_service
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
    
    from ..llm_service import llm_service
    
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

    from ..llm_service import llm_service

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


"""POST /api/llm/agent-command - 多轮工具调用（复合操作）"""
async def llm_agent_command(request: web.Request) -> web.Response:
    """POST /api/llm/agent-command — 多轮工具调用

    允许 LLM 先查询再操作，如 "把今天没完成的推到明天" →
    1. query_events(date=today, status=pending) → 得到事件列表
    2. move_event(id, new_start_time=tomorrow 9am) × N

    Body: {"text": "把今天没完成的推到明天早上去做"}
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

    user_text = (data.get("text", "") or "").strip()
    if not user_text:
        return error_response("输入不能为空")

    from ..llm_service import llm_service
    result = await llm_service.agent_command(user_text, db_instance=db)

    if not result:
        return error_response(llm_service.last_error_message or "AI 命令执行失败")

    if result.get("error"):
        return error_response(result["error"])

    return json_response(result)


"""POST /api/llm/test - test AI provider connectivity."""
async def llm_test(request: web.Request) -> web.Response:
    """POST /api/llm/test - test if an AI provider is reachable and working.

    Body: {"api_base": "...", "model": "...", "api_key": "...", "provider_id": optional}
    If provider_id is given and api_key is empty, the saved key is used.
    """
    try:
        body_bytes = await request.read()
        data = json.loads(body_bytes.decode('utf-8'))
    except Exception:
        return error_response("无效的JSON数据")

    provider_id = data.get("provider_id")
    api_base = (data.get("api_base") or "").strip()
    api_key = (data.get("api_key") or "").strip()
    model = (data.get("model") or "").strip()

    # If provider_id given and no explicit key, look up saved key
    if provider_id and not api_key:
        try:
            provider = await db.get_ai_provider(int(provider_id))
            if provider:
                api_key = (provider.get("api_key") or "").strip()
                api_base = api_base or (provider.get("api_base") or "").strip()
                model = model or (provider.get("model") or "").strip()
        except Exception:
            pass

    if not api_base or not api_key or not model:
        return error_response("请填写完整的 API 信息")

    import aiohttp
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{api_base.rstrip('/')}/chat/completions",
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": "Hi"}],
                    "max_tokens": 5,
                },
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                timeout=aiohttp.ClientTimeout(total=15),
            ) as resp:
                resp_text = await resp.text()
                if resp.status == 200:
                    try:
                        resp_data = json.loads(resp_text)
                        content = resp_data.get("choices", [{}])[0].get("message", {}).get("content", "")
                        return json_response({
                            "success": True,
                            "message": f"连接成功！模型 {model} 响应正常",
                            "sample_response": content[:100] if content else "(空)"
                        })
                    except Exception:
                        return json_response({
                            "success": True,
                            "message": f"连接成功！模型 {model} 响应正常",
                        })
                elif resp.status == 401:
                    return error_response(f"API Key 无效（401）")
                elif resp.status == 404:
                    return error_response(f"端点不存在（404），请检查 API 地址")
                else:
                    try:
                        err_data = json.loads(resp_text)
                        err_msg = err_data.get("error", {}).get("message", resp_text[:200])
                    except Exception:
                        err_msg = resp_text[:200]
                    return error_response(f"请求失败 ({resp.status}): {err_msg}")
    except aiohttp.ClientConnectorError:
        return error_response("无法连接到 API 服务器，请检查 API 地址是否正确")
    except aiohttp.ClientTimeoutError:
        return error_response("连接超时，请检查网络或 API 地址")
    except Exception as e:
        return error_response(f"测试失败: {str(e)}")


# ============= Helpers =============

def _has_schedule_input(text: str) -> bool:
    """检查输入是否包含时间或日程信息，避免对纯对话文本调用 LLM 创建日程。"""
    time_patterns = [
        r'(今天|明天|后天|下周|下个月|上午|下午|晚上|今晚|明早|明晚)',
        r'\d{1,2}[点时]\d{0,2}',
        r'\d+月\d+[日号]?',
        r'星期[一二三四五六日天]',
    ]
    if any(re.search(p, text) for p in time_patterns):
        return True
    # 日程动作词
    action_patterns = [
        r'(安排|计划|日程|开会|起床|吃饭|睡觉|准备|打算)',
    ]
    if any(re.search(p, text) for p in action_patterns):
        return True
    return False


# ============= Route Registration =============

def register_routes(app: web.Application) -> None:
    app.router.add_post("/api/llm/chat", llm_chat)
    app.router.add_post("/api/llm/create", llm_create)
    app.router.add_post("/api/llm/command", llm_command)
    app.router.add_post("/api/llm/agent-command", llm_agent_command)
    app.router.add_post("/api/llm/breakdown", llm_breakdown)
    app.router.add_post("/api/llm/parse_expense", llm_parse_expense)
    app.router.add_post("/api/llm/chat-agent", llm_agent_chat)
    app.router.add_post("/api/llm/test", llm_test)
