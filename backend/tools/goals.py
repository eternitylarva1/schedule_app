"""工具：目标相关"""

from .. import db
from .registry import tool


@tool(
    name="get_goals",
    description="获取所有活跃目标及其进度、子任务、截止时间",
    category="goals",
)
async def get_goals(*, db_instance=None, **kwargs):
    """获取活跃目标树"""
    try:
        goals = await db.get_goals(horizon="all", include_subtasks=True)
        if not goals:
            return "暂无活跃目标。"
        result = []
        parent_map = {}
        for g in goals:
            parent_map.setdefault(g.parent_id or 0, []).append(g)
        
        def format_goal(g, depth=0):
            prefix = "  " * depth
            items = {
                "name": f"{prefix}{g.title}",
                "progress": f"{g.progress or 0}%" if hasattr(g, "progress") and g.progress is not None else "未开始",
                "deadline": g.deadline if hasattr(g, "deadline") and g.deadline else "无截止日",
            }
            children = parent_map.get(g.id, [])
            if children:
                items["subtasks"] = [format_goal(c, depth + 1) for c in children]
            return items
        
        for g in goals:
            if g.parent_id is None or g.parent_id == 0:
                result.append(format_goal(g))
        return result
    except Exception as ex:
        return f"获取目标失败: {ex}"
