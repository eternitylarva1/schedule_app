"""Goal HTTP endpoints."""
from aiohttp import web
from typing import Any
from .. import db
from ..models import Goal, GoalConversation
from ._helpers import (
    json_response, error_response, _sanitize_ai_provider,
    _handle_goal_operation, _update_goal_stats,
    _parse_datetime, _extract_deadline_from_text, _extract_deadline_label_from_text,
    _append_deadline_label, _has_explicit_clock_time_in_text,
)


# ============= Goal Handlers =============

"""GET /api/goals - list goals."""
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




"""GET /api/goals/{id}/tree - get goal tree."""
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




"""GET /api/goals/{id}/subtasks - get goal subtasks."""
async def get_goal_subtasks(request: web.Request) -> web.Response:
    """GET /api/goals/{id}/subtasks - get direct subtasks of a goal."""
    goal_id = int(request.match_info["id"])
    try:
        subtasks = await db.get_goal_subtasks(goal_id)
        return json_response([s.to_dict() for s in subtasks])
    except Exception as e:
        return error_response(f"获取子任务失败: {str(e)}")




"""POST /api/goals - create goal."""
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
            color=data.get("color", ""),
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




"""PUT /api/goals/{id} - update goal."""
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
            color=data.get("color", existing.color),
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




"""DELETE /api/goals/{id} - delete goal."""
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



"""GET /api/goals/{id}/conversations - get goal conversations."""
async def get_goal_conversations(request: web.Request) -> web.Response:
    """GET /api/goals/{id}/conversations - get conversation history."""
    goal_id = int(request.match_info["id"])
    try:
        conversations = await db.get_goal_conversations(goal_id)
        return json_response([c.to_dict() for c in conversations])
    except Exception as e:
        return error_response(f"获取对话历史失败: {str(e)}")




"""POST /api/goals/{id}/conversations - create goal conversation."""
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



"""GET /api/goals/{id}/deliverables - get goal deliverables."""
async def get_goal_deliverables(request: web.Request) -> web.Response:
    """GET /api/goals/{id}/deliverables - Get all deliverables for a goal."""
    try:
        goal_id = int(request.match_info["id"])
        deliverables = await db.get_goal_deliverables(goal_id)
        return json_response([d.__dict__ for d in deliverables])
    except Exception as e:
        return error_response(f"获取交付成果失败: {str(e)}")




"""POST /api/goals/{id}/deliverables - create goal deliverable."""
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




"""PUT /api/goals/deliverables/{id} - update goal deliverable."""
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




"""DELETE /api/goals/deliverables/{id} - delete goal deliverable."""
async def delete_goal_deliverable(request: web.Request) -> web.Response:
    """DELETE /api/goals/deliverables/{id} - Delete a deliverable."""
    try:
        deliverable_id = int(request.match_info["id"])
        await db.delete_goal_deliverable(deliverable_id)
        return json_response({"success": True})
    except Exception as e:
        return error_response(f"删除交付成果失败: {str(e)}")


# ============ AI Conversational Breakdown ============



"""POST /api/goals/ai/discuss - AI discuss goal."""
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
        from ..llm_service import llm_service
        
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




"""POST /api/goals/ai/reschedule - AI reschedule goal."""
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
        from ..llm_service import llm_service
        
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





# ============= Route Registration =============

def register_routes(app: web.Application) -> None:
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
