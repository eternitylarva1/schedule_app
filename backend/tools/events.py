"""工具：日程事件相关"""
from datetime import datetime, timedelta
from .. import db
from .registry import tool


# ========== 查询工具 ==========

@tool(
    name="query_events",
    description="查询日程事件。参数: date(日期YYYY-MM-DD, 或 today/week/month/all), status(pending/done/all)",
    category="events",
)
async def query_events(*, db_instance=None, date="today", status="all", **kwargs):
    """查询事件列表，返回 id/title/start_time/end_time/status/priority"""
    try:
        events = await db.get_events(date)
        result = []
        for e in events:
            if status != "all" and e.status != status:
                continue
            result.append({
                "id": e.id,
                "title": e.title,
                "start_time": e.start_time.isoformat() if hasattr(e.start_time, 'isoformat') else str(e.start_time) if e.start_time else None,
                "end_time": e.end_time.isoformat() if hasattr(e.end_time, 'isoformat') else str(e.end_time) if e.end_time else None,
                "status": e.status,
                "priority": getattr(e, "priority", "none"),
                "category_id": e.category_id,
            })
        return result if result else f"{date} 没有符合条件的日程"
    except Exception as ex:
        return f"查询失败: {ex}"


# ========== 操作工具 ==========

@tool(
    name="move_event",
    description="移动一个日程到新的开始时间。参数: event_id(事件ID), new_start_time(新开始时间 ISO格式如2026-07-01T09:00:00)",
    category="events",
)
async def move_event(*, db_instance=None, event_id=0, new_start_time="", **kwargs):
    """移动单个事件到新时间"""
    try:
        event = await db.get_event(int(event_id))
        if not event:
            return f"事件 {event_id} 不存在"
        old_start = event.start_time
        old_end = event.end_time
        duration = timedelta(minutes=30)
        if old_start and old_end:
            duration = old_end - old_start
        new_start = datetime.fromisoformat(new_start_time)
        new_end = new_start + duration
        event.start_time = new_start
        event.end_time = new_end
        await db.update_event(event)
        return {"ok": True, "event_id": event_id, "title": event.title,
                "old_start": str(old_start), "new_start": new_start.isoformat(),
                "new_end": new_end.isoformat()}
    except Exception as ex:
        return f"移动事件失败: {ex}"


@tool(
    name="complete_event",
    description="标记一个日程为已完成。参数: event_id(事件ID)",
    category="events",
)
async def complete_event(*, db_instance=None, event_id=0, **kwargs):
    """完成事件"""
    try:
        event = await db.get_event(int(event_id))
        if not event:
            return f"事件 {event_id} 不存在"
        event.status = "done"
        await db.update_event(event)
        return {"ok": True, "event_id": event_id, "title": event.title, "status": "done"}
    except Exception as ex:
        return f"完成事件失败: {ex}"


@tool(
    name="delete_event",
    description="删除一个日程。参数: event_id(事件ID)",
    category="events",
)
async def delete_event(*, db_instance=None, event_id=0, **kwargs):
    """删除事件"""
    try:
        event = await db.get_event(int(event_id))
        if not event:
            return f"事件 {event_id} 不存在"
        await db.delete_event(int(event_id))
        return {"ok": True, "event_id": event_id, "title": event.title, "deleted": True}
    except Exception as ex:
        return f"删除事件失败: {ex}"


@tool(
    name="create_event",
    description="创建一个新日程。参数: title(标题), start_time(开始时间ISO格式), end_time(可选结束时间), category_id(可选: work/life/study/health)",
    category="events",
)
async def create_event(*, db_instance=None, title="", start_time="", end_time="", category_id="work", **kwargs):
    """创建事件"""
    try:
        from ..models import Event
        ev = Event(
            title=title,
            start_time=datetime.fromisoformat(start_time) if start_time else None,
            end_time=datetime.fromisoformat(end_time) if end_time else None,
            category_id=category_id or "work",
            status="pending",
        )
        result = await db.create_event(ev)
        return {"ok": True, "event_id": result.id, "title": result.title,
                "start_time": result.start_time.isoformat() if result.start_time else None}
    except Exception as ex:
        return f"创建事件失败: {ex}"


# ========== 兼容旧工具名 ==========

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
