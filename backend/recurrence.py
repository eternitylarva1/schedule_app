"""Recurrence rule expansion.

Supports two formats:
1. Simple tokens (legacy): 'none', 'daily', 'weekly', 'monthly', 'workdays'
2. JSON rules: '{"freq":"weekly","days":[2,4]}' (Tue+Thu)
                '{"freq":"monthly","nth":1,"day":0}' (1st Monday)

Day numbering: 0=Monday ... 6=Sunday (ISO standard).
"""
from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from typing import List, Optional


VALID_TOKENS = {"none", "daily", "weekly", "monthly", "workdays"}


def parse_rule(recurrence: Optional[str]) -> Optional[dict]:
    """Parse a recurrence string into a normalized rule dict.

    Returns None for 'none' or falsy. For simple tokens, returns a
    {"freq": "..."} dict. For JSON, returns parsed dict.
    """
    if not recurrence or recurrence == "none":
        return None
    if recurrence in ("daily", "weekly", "monthly", "workdays"):
        return {"freq": recurrence}
    if recurrence.startswith("{"):
        try:
            rule = json.loads(recurrence)
            return rule if isinstance(rule, dict) else None
        except (json.JSONDecodeError, ValueError):
            return None
    return None


def _date_range(start: date, end: date) -> List[date]:
    """List of dates from start (inclusive) to end (exclusive).

    range_end is treated as a half-open bound — typical for date ranges
    that represent a [start, end) interval. The caller is responsible
    for passing end as the day AFTER the last day to include.
    """
    if end <= start:
        return []
    days = (end - start).days
    return [start + timedelta(days=i) for i in range(days)]


def _nth_weekday_of_month(target: date, weekday: int, nth: int) -> bool:
    """Check if target is the nth occurrence of `weekday` in its month.

    nth: 1..5 (5 means "last occurrence even if 5th doesn't exist")
    weekday: 0=Mon .. 6=Sun
    """
    if nth < 1 or nth > 5:
        return False
    if target.weekday() != weekday:
        return False
    first_day = target.replace(day=1)
    first_weekday = first_day.weekday()
    delta = (weekday - first_weekday) % 7
    first_occurrence_day = 1 + delta
    occurrence_num = (target.day - first_occurrence_day) // 7 + 1
    if occurrence_num == nth:
        return True
    # nth=5 means "last occurrence" — accept any occurrence_num >= 5
    if nth == 5 and occurrence_num >= 5:
        return True
    return False


def occurs_on(recurrence: Optional[str], start_time: datetime, target: date) -> bool:
    """Whether a recurring event starting at start_time occurs on target date.

    The start_time of the original event is treated as the first occurrence
    — events don't generate instances before the original.
    """
    rule = parse_rule(recurrence)
    if rule is None:
        return target == start_time.date()

    start_date = start_time.date()
    if target < start_date:
        return False

    freq = rule.get("freq")

    if freq == "daily":
        return True
    if freq == "workdays":
        return target.weekday() < 5
    if freq == "weekly":
        days = rule.get("days")
        if days:
            return target.weekday() in set(days)
        return target.weekday() == start_date.weekday()
    if freq == "monthly":
        if "nth" in rule and "day" in rule:
            return _nth_weekday_of_month(target, int(rule["day"]), int(rule["nth"]))
        if "days" in rule:
            return target.day in set(rule["days"])
        return target.day == start_date.day

    return False


def expand_event(
    event_start: datetime,
    event_end: Optional[datetime],
    recurrence: Optional[str],
    range_start: date,
    range_end: date,
) -> List[dict]:
    """Expand a single recurring event into actual instances within a date range.

    Returns a list of dicts with keys: start_time, end_time (or None for all-day).
    Only days where the event occurs are included.
    """
    if event_end is not None and event_end < event_start:
        event_end = event_start  # safety
    duration = (event_end - event_start) if event_end is not None else None
    rule = parse_rule(recurrence)
    if rule is None:
        if range_start <= event_start.date() <= range_end:
            return [{"start_time": event_start, "end_time": event_end}]
        return []

    instances: List[dict] = []
    for day in _date_range(range_start, range_end):
        if not occurs_on(recurrence, event_start, day):
            continue
        new_start = event_start.replace(
            year=day.year, month=day.month, day=day.day
        )
        if duration is not None:
            new_end = new_start + duration
        else:
            new_end = None
        instances.append({"start_time": new_start, "end_time": new_end})
    return instances


def expand_events(
    events: List,
    range_start: date,
    range_end: date,
) -> List:
    """Expand a list of Event objects (or dicts) within a date range.

    Each input event must have: start_time, end_time, recurrence, id, title, etc.
    Returns a new list of Event objects with same fields but updated times.
    Non-recurring events are passed through unchanged if in range.
    """
    out: List = []
    for ev in events:
        if isinstance(ev, dict):
            rec = ev.get("recurrence") or "none"
            start = ev.get("start_time")
            end = ev.get("end_time")
            if isinstance(start, str):
                start = datetime.fromisoformat(start)
            if isinstance(end, str):
                end = datetime.fromisoformat(end)
            orig_rec = rec
        else:
            rec = getattr(ev, "recurrence", "none") or "none"
            start = ev.start_time
            end = ev.end_time
            orig_rec = rec

        rule = parse_rule(rec)
        if rule is None:
            if start is not None and range_start <= start.date() <= range_end:
                out.append(ev)
            continue

        if start is None:
            continue
        instances = expand_event(start, end, rec, range_start, range_end)
        for inst in instances:
            if isinstance(ev, dict):
                new_ev = dict(ev)
                new_ev["start_time"] = inst["start_time"]
                new_ev["end_time"] = inst["end_time"]
                new_ev["_is_recurring"] = True
                new_ev["_recurrence"] = orig_rec
                out.append(new_ev)
            else:
                # Build a new Event-like object with same fields, updated times
                try:
                    new_ev = type(ev)(
                        id=ev.id,
                        title=ev.title,
                        start_time=inst["start_time"],
                        end_time=inst["end_time"],
                        category_id=ev.category_id,
                        all_day=ev.all_day,
                        recurrence=orig_rec,
                        status=ev.status,
                        created_at=ev.created_at,
                        updated_at=ev.updated_at,
                        reminder_enabled=ev.reminder_enabled,
                        reminder_minutes=ev.reminder_minutes,
                        reminder_sent=ev.reminder_sent,
                        priority=ev.priority,
                        is_test=ev.is_test,
                        goal_id=getattr(ev, "goal_id", None),
                    )
                except TypeError:
                    # Fall back to copying and mutating
                    import copy
                    new_ev = copy.copy(ev)
                    new_ev.start_time = inst["start_time"]
                    new_ev.end_time = inst["end_time"]
                out.append(new_ev)
    return out


def format_rule_for_display(recurrence: Optional[str]) -> str:
    """Human-readable description of a recurrence rule."""
    rule = parse_rule(recurrence)
    if rule is None:
        return "不重复"
    freq = rule.get("freq")
    if freq == "daily":
        return "每天"
    if freq == "workdays":
        return "每个工作日（一/二/三/四/五）"
    if freq == "weekly":
        days = rule.get("days")
        if days:
            day_names = ["一", "二", "三", "四", "五", "六", "日"]
            return f"每周 {''.join('周' + day_names[d] for d in days)}"
        return "每周"
    if freq == "monthly":
        if "nth" in rule and "day" in rule:
            day_names = ["一", "二", "三", "四", "五", "六", "日"]
            nth_labels = {1: "第1个", 2: "第2个", 3: "第3个", 4: "第4个", 5: "最后一个"}
            nth = rule["nth"]
            day = rule["day"]
            return f"每月 {nth_labels.get(nth, f'第{nth}个')} 周{day_names[day]}"
        if "days" in rule:
            return f"每月 {rule['days']} 号"
        return "每月"
    return recurrence or "不重复"
