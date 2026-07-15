"""Note HTTP endpoints."""
import json
from aiohttp import web
from typing import Any
from .. import db
from ..models import Note, NoteGroup
from ._helpers import (
    json_response, error_response, _sanitize_ai_provider,
    _update_note_stats, _handle_note_operation,
)


# ============= Note Handlers =============

"""GET /api/notes/{note_id}/conversations - get note conversations."""
async def get_note_conversations(request: web.Request) -> web.Response:
    """GET /api/notes/{note_id}/conversations - get conversation history for a note."""
    note_id = int(request.match_info["note_id"])
    try:
        conversations = await db.get_note_conversations(note_id)
        return json_response([c.to_dict() for c in conversations])
    except Exception as e:
        return error_response(f"获取对话历史失败: {str(e)}")




"""POST /api/notes/{note_id}/chat - chat with note."""
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
        from ..llm_service import llm_service
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




"""DELETE /api/notes/{note_id}/conversations - delete note conversations."""
async def delete_note_conversations(request: web.Request) -> web.Response:
    """DELETE /api/notes/{note_id}/conversations - clear conversation history for a note."""
    note_id = int(request.match_info["note_id"])
    try:
        await db.delete_note_conversations(note_id)
        return json_response({"deleted": True})
    except Exception as e:
        return error_response(f"清空对话历史失败: {str(e)}")


# ============ Expenses Endpoints ============



"""GET /api/notes - list notes."""
async def get_notes(request: web.Request) -> web.Response:
    """GET /api/notes?include_archived=true|false - list all notes."""
    try:
        include_archived_str = request.query.get("include_archived", "false").lower()
        include_archived = include_archived_str in ("true", "1")
        notes = await db.get_notes(include_archived=include_archived)
        return json_response([n.to_dict() for n in notes])
    except Exception as e:
        return error_response(f"获取笔记失败: {str(e)}")




"""POST /api/notes - create note."""
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
            is_pinned=bool(data.get("is_pinned", False)),
            color=data.get("color", ""),
            is_archived=bool(data.get("is_archived", False)),
        )
        note = await db.create_note(note)
        return json_response(note.to_dict())
    except Exception as e:
        return error_response(f"创建笔记失败: {str(e)}")




"""PUT /api/notes/{id} - update note."""
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
        
        # Handle new fields - use new value if provided, otherwise keep existing
        is_pinned = data.get("is_pinned")
        if is_pinned is None:
            is_pinned = existing.is_pinned
        
        color = data.get("color")
        if color is None:
            color = existing.color
        
        is_archived = data.get("is_archived")
        if is_archived is None:
            is_archived = existing.is_archived
        
        note = Note(
            title=data.get("title", existing.title) or existing.title,
            content=data.get("content", existing.content) or existing.content,
            group_id=data.get("group_id", existing.group_id),
            sort_order=sort_order,
            is_pinned=is_pinned,
            color=color,
            is_archived=is_archived,
        )
        result = await db.update_note(note_id, note)
        if not result:
            return error_response("笔记不存在", code=404)
        return json_response(result.to_dict())
    except Exception as e:
        return error_response(f"更新笔记失败: {str(e)}")




"""DELETE /api/notes/{id} - delete note."""
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



"""GET /api/note-groups - list note groups."""
async def get_note_groups(request: web.Request) -> web.Response:
    """GET /api/note-groups - list all note groups."""
    try:
        groups = await db.get_note_groups()
        return json_response([g.to_dict() for g in groups])
    except Exception as e:
        return error_response(f"获取笔记分组失败: {str(e)}")




"""POST /api/note-groups - create note group."""
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




"""PUT /api/note-groups/{id} - update note group."""
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




"""DELETE /api/note-groups/{id} - delete note group."""
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


"""PUT /api/notes/reorder - batch reorder notes."""
async def reorder_notes(request: web.Request) -> web.Response:
    try:
        data = await request.json()
    except json.JSONDecodeError:
        return error_response("无效的JSON数据")
    note_ids = data.get("note_ids")
    if not note_ids or not isinstance(note_ids, list):
        return error_response("缺少 note_ids 数组")
    try:
        await db.reorder_notes([int(n) for n in note_ids])
        return json_response({"success": True, "count": len(note_ids)})
    except Exception as e:
        return error_response(f"排序保存失败: {str(e)}")


# ============= Route Registration =============

def register_routes(app: web.Application) -> None:
    app.router.add_get("/api/notes", get_notes)
    app.router.add_post("/api/notes", create_note)
    app.router.add_put("/api/notes/{id}", update_note)
    app.router.add_delete("/api/notes/{id}", delete_note)
    app.router.add_get("/api/notes/{note_id}/conversations", get_note_conversations)
    app.router.add_post("/api/notes/{note_id}/chat", chat_note)
    app.router.add_delete("/api/notes/{note_id}/conversations", delete_note_conversations)
    app.router.add_get("/api/note-groups", get_note_groups)
    app.router.add_post("/api/note-groups", create_note_group)
    app.router.add_put("/api/note-groups/{id}", update_note_group)
    app.router.add_delete("/api/note-groups/{id}", delete_note_group)
    app.router.add_put("/api/notes/reorder", reorder_notes)
