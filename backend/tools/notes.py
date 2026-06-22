"""工具：笔记相关"""

from .. import db
from .registry import tool


@tool(
    name="get_note_content",
    description="获取当前笔记的完整内容",
    category="notes",
    parameters={
        "type": "object",
        "properties": {},
        "required": [],
    }
)
async def get_note_content(*, db_instance=None, note_id=None, **kwargs):
    """获取指定笔记的全文"""
    if not note_id:
        return "未指定笔记。"
    try:
        note = await db.get_note(note_id)
        if not note:
            return "笔记不存在。"
        return {
            "id": note.id,
            "title": note.title or "",
            "content": note.content or "",
            "created_at": str(note.created_at) if note.created_at else "",
            "updated_at": str(note.updated_at) if hasattr(note, "updated_at") and note.updated_at else "",
            "color": note.color or "",
            "is_pinned": getattr(note, "is_pinned", False),
            "group_id": note.group_id,
        }
    except Exception as ex:
        return f"获取笔记失败: {ex}"


@tool(
    name="get_notes_list",
    description="获取最近笔记列表（标题+摘要），按修改时间倒序",
    category="notes",
)
async def get_notes_list(*, db_instance=None, **kwargs):
    """获取最近笔记（不含归档）"""
    try:
        notes = await db.get_notes(include_archived=False)
        if not notes:
            return "暂无笔记。"
        # Sort by updated_at if available, else created_at
        def sort_key(n):
            t = getattr(n, "updated_at", None) or n.created_at
            return str(t or "")
        notes.sort(key=sort_key, reverse=True)
        result = []
        for n in notes[:10]:
            content_preview = (n.content or "")[:100].replace("\n", " ")
            result.append({
                "id": n.id,
                "title": n.title or "",
                "preview": content_preview,
                "updated_at": str(getattr(n, "updated_at", None) or n.created_at or ""),
                "group_id": n.group_id,
                "is_pinned": getattr(n, "is_pinned", False),
            })
        return result
    except Exception as ex:
        return f"获取笔记列表失败: {ex}"
