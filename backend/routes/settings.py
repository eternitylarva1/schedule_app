"""Settings HTTP endpoints."""
import json
import aiosqlite
from aiohttp import web
from typing import Any
from .. import db
from ._helpers import json_response, error_response, _sanitize_ai_provider


# ============= Settings Handlers =============

"""GET /api/settings - get settings."""
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




"""PUT /api/settings/{key} - update setting."""
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



"""GET /api/ai-providers - get AI providers."""
async def get_ai_providers(request: web.Request) -> web.Response:
    """GET /api/ai-providers - list all AI providers."""
    try:
        providers = await db.get_ai_providers()
        return json_response([_sanitize_ai_provider(provider) for provider in providers])
    except Exception as e:
        return error_response(f"获取AI配置失败: {str(e)}")




"""POST /api/ai-providers - create AI provider."""
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




"""PUT /api/ai-providers/{id} - update AI provider."""
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




"""DELETE /api/ai-providers/{id} - delete AI provider."""
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




"""PUT /api/ai-providers/{id}/activate - activate AI provider."""
async def activate_ai_provider(request: web.Request) -> web.Response:
    """PUT /api/ai-providers/{id}/activate - set as active AI provider."""
    provider_id = int(request.match_info["id"])
    
    try:
        await db.activate_ai_provider(provider_id)
        return json_response({"activated": True})
    except Exception as e:
        return error_response(f"激活AI配置失败: {str(e)}")


# ============ User Contexts Endpoints (我的现状) ============



"""GET /api/user-contexts - get user contexts."""
async def get_user_contexts(request: web.Request) -> web.Response:
    """GET /api/user-contexts - list all user contexts."""
    try:
        contexts = await db.get_user_contexts()
        return json_response(contexts)
    except Exception as e:
        return error_response(f"获取现状失败: {str(e)}")




"""POST /api/user-contexts - create user context."""
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




"""PUT /api/user-contexts/{id} - update user context."""
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




"""DELETE /api/user-contexts/{id} - delete user context."""
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




"""PUT /api/user-contexts/reorder - reorder user contexts."""
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



# ============ Prompt Templates Endpoints ============

PROMPT_KEYS = [
    "schedule_command", "breakdown_task",
    "discuss_goal_user", "discuss_goal_followup", "discuss_goal_system",
    "discuss_goal_scheduling", "discuss_goal_scheduling_system",
    "reschedule_goal", "reschedule_goal_system",
    "learn_from_tasks",
    "parse_expense", "parse_expense_system",
    "chat_note", "chat_note_system",
    "unified_command", "unified_command_system",
    "unified_retry", "unified_retry_system",
    "agent_system",
    "determine_tools", "determine_tools_system",
    "answer_with_context", "answer_with_context_system",
]


async def get_prompts(request: web.Request) -> web.Response:
    """GET /api/settings/prompt - get all saved prompts."""
    try:
        prompts = {}
        for key in PROMPT_KEYS:
            val = await db.get_setting(f"prompt_{key}")
            prompts[key] = val or ""
        return json_response(prompts)
    except Exception as e:
        return error_response(str(e))


async def save_prompt(request: web.Request) -> web.Response:
    """POST /api/settings/prompt - save a prompt template."""
    try:
        body = await request.json()
        key = body.get("key", "")
        value = body.get("value", "")
        if not key:
            return error_response("缺少 key 参数")
        if key not in PROMPT_KEYS:
            return error_response(f"未知的 prompt key: {key}")
        await db.set_setting(f"prompt_{key}", value)
        return json_response({"key": key, "saved": True})
    except Exception as e:
        return error_response(str(e))


# ============ Note Conversations Endpoints (AI Chat) ============




# ============= Route Registration =============

def register_routes(app: web.Application) -> None:
    app.router.add_get("/api/settings", get_settings)
    app.router.add_put("/api/settings/{key}", update_setting)
    app.router.add_get("/api/ai-providers", get_ai_providers)
    app.router.add_post("/api/ai-providers", create_ai_provider)
    app.router.add_put("/api/ai-providers/{id}", update_ai_provider)
    app.router.add_delete("/api/ai-providers/{id}", delete_ai_provider)
    app.router.add_put("/api/ai-providers/{id}/activate", activate_ai_provider)
    app.router.add_get("/api/user-contexts", get_user_contexts)
    app.router.add_post("/api/user-contexts", create_user_context)
    app.router.add_put("/api/user-contexts/{id}", update_user_context)
    app.router.add_delete("/api/user-contexts/{id}", delete_user_context)
    app.router.add_put("/api/user-contexts/reorder", reorder_user_contexts)
    app.router.add_get("/api/settings/prompt", get_prompts)
    app.router.add_post("/api/settings/prompt", save_prompt)
