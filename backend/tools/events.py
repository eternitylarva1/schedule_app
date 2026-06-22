"""工具：日程事件相关"""

from datetime import datetime
from .. import db
from .registry import tool


@tool(
    name="get_today_events",
    description="获取今天的日程事件列表（含已完成和待办），包括时间、标题、状态",
    category="events",
)
async def get_today_events(*, db_instance=None, **kwargs):
    """获取今日日程"""
    try:
        events = await db.get_events("today")
        if not events:
            return "今天没有日程事件。"
        result = []
        for e in events:
            time_str = e.start_time.isoformat() if hasattr(e.start_time, 'isoformat') else (e.start_time or "未设置时间")
            result.append({
                "time": time_str,
                "title": e.title,
                "status": e.status,
                "priority": getattr(e, "priority", ""),
            })
        return result
    except Exception as ex:
        return f"获取今日事件失败: {ex}"


@tool(
    name="get_upcoming_events",
    description="获取未来7天的日程事件，按日期分组，包括时间、标题、状态",
    category="events",
)
async def get_upcoming_events(*, db_instance=None, **kwargs):
    """获取未来7天日程"""
    try:
        events = await db.get_events("week")
        if not events:
            return "未来 7 天没有日程。"
        grouped = {}
        for e in events:
            time_str = e.start_time.isoformat() if hasattr(e.start_time, 'isoformat') else (e.start_time or "")
            if time_str:
                day = time_str[:10]
            else:
                day = "未设置日期"
            if day not in grouped:
                grouped[day] = []
            grouped[day].append({
                "time": time_str or "未设置时间",
                "title": e.title,
                "status": e.status,
            })
        return grouped
    except Exception as ex:
        return f"获取未来事件失败: {ex}"
