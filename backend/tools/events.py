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
    description="移动一个日程到新的开始时间。参数: event_id(事件ID), new_start_time(新开始时间 ISO格式如2026-07-01T09:00:00)。内部调用 update_event。",
    category="events",
)
async def move_event(*, db_instance=None, event_id=0, new_start_time="", **kwargs):
    """移动单个事件到新时间 — 内部调用 update_event"""
    return await update_event_impl(event_id=int(event_id), changes={"start_time": new_start_time, "end_time": None})


@tool(
    name="complete_event",
    description="标记一个日程为已完成。参数: event_id(事件ID)。内部调用 update_event。",
    category="events",
)
async def complete_event(*, db_instance=None, event_id=0, **kwargs):
    """完成事件 — 内部调用 update_event"""
    return await update_event_impl(event_id=int(event_id), changes={"status": "done"})


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
    name="batch_move",
    description="""批量移动多个事件到指定日期，自动依次排开时间避免重叠。
参数: event_ids(事件ID列表), target_date(目标日期如2026-07-01), target_time(从几点开始默认09:00)。
自动按原顺序依次排列，每个事件紧跟上一个结束时间。适用于"把今天所有待办推到明天"这类场景。""",
    category="events",
)
async def batch_move(*, db_instance=None, event_ids=None, target_date="", target_time="09:00", **kwargs):
    """批量移动事件，自动依次排开"""
    from datetime import datetime, timedelta
    if not event_ids or not isinstance(event_ids, list):
        return {"ok": False, "error": "缺少 event_ids 列表"}
    if not target_date:
        return {"ok": False, "error": "缺少 target_date"}

    try:
        cursor = datetime.fromisoformat(f"{target_date}T{target_time}:00")
        results = []

        for eid in event_ids:
            event = await db.get_event(int(eid))
            if not event:
                continue
            old_start = event.start_time
            old_end = event.end_time
            duration = timedelta(minutes=30)
            if old_start and old_end:
                if isinstance(old_end, str):
                    old_end = datetime.fromisoformat(old_end)
                if isinstance(old_start, str):
                    old_start = datetime.fromisoformat(old_start)
                duration = old_end - old_start

            new_start = cursor
            new_end = cursor + duration
            event.start_time = new_start
            event.end_time = new_end
            await db.update_event(int(eid), event)
            results.append({
                "ok": True, "event_id": eid, "title": event.title,
                "old_start": str(old_start),
                "new_start": new_start.isoformat(),
                "new_end": new_end.isoformat(),
            })
            cursor = new_end

        return {"ok": True, "moved": len(results), "results": results}
    except Exception as ex:
        return f"批量移动失败: {ex}"


@tool(
    name="update_event",
    description="""修改一个日程的任意字段。参数: event_id(事件ID), changes(要修改的字段字典)。

可修改字段：
- title: 标题
- start_time: 开始时间 (ISO格式如 2026-07-01T09:00:00)
- end_time: 结束时间 (ISO格式，可选)
- status: 状态 (pending/done/cancelled)
- priority: 优先级 (none/low/medium/high)
- category_id: 分类 (work/life/study/health)

示例: changes={"start_time": "2026-07-01T15:00:00", "priority": "high"}""",
    category="events",
)
async def update_event(*, db_instance=None, event_id=0, changes=None, **kwargs):
    """通用事件修改工具"""
    return await update_event_impl(event_id=int(event_id), changes=changes or {})


# ========== 内部实现 ==========

async def update_event_impl(event_id: int, changes: dict):
    """统一的事件更新逻辑，被 move_event/complete_event/update_event 复用"""
    if not changes:
        return {"ok": False, "error": "没有指定要修改的字段"}

    try:
        event = await db.get_event(event_id)
        if not event:
            return f"事件 {event_id} 不存在"

        old_values = {}
        applied = {}

        for field, value in changes.items():
            if value is None:
                continue
            if field == "title":
                old_values[field] = event.title
                event.title = str(value)
                applied[field] = event.title
            elif field == "start_time":
                old_values[field] = str(event.start_time) if event.start_time else None
                from datetime import datetime
                event.start_time = datetime.fromisoformat(str(value))
                applied[field] = event.start_time.isoformat()
            elif field == "end_time":
                old_values[field] = str(event.end_time) if event.end_time else None
                from datetime import datetime
                event.end_time = datetime.fromisoformat(str(value))
                applied[field] = event.end_time.isoformat()
            elif field == "status":
                old_values[field] = event.status
                event.status = str(value)
                applied[field] = event.status
            elif field == "priority":
                old_values[field] = getattr(event, "priority", "none")
                event.priority = str(value)
                applied[field] = event.priority
            elif field == "category_id":
                old_values[field] = event.category_id
                event.category_id = str(value)
                applied[field] = event.category_id

        if not applied:
            return {"ok": False, "error": "没有有效字段被修改"}

        await db.update_event(event_id, event)
        return {
            "ok": True,
            "event_id": event_id,
            "title": event.title,
            "changes": applied,
            "old": old_values,
        }
    except Exception as ex:
        return f"修改事件失败: {ex}"


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
