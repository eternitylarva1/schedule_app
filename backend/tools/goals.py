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
            status_map = {"active": "进行中", "done": "已完成", "cancelled": "已取消"}
            deadline = g.end_date.isoformat()[:10] if hasattr(g.end_date, 'isoformat') and g.end_date else \
                       (str(g.end_date)[:10] if g.end_date else "无截止日")
            items = {
                "name": f"{prefix}{g.title}",
                "status": status_map.get(g.status, g.status),
                "horizon": g.horizon,
                "deadline": deadline,
                "color": g.color or "",
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
