"""Date/time parsing helpers."""
import re
from datetime import datetime, timedelta
from typing import Any


def _parse_datetime(value: Any):
    """Parse datetime from string."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            return None
    return None


def _extract_deadline_from_text(text: str):
    """Extract absolute deadline datetime for Chinese 'X月X日前/之前' phrases.

    Semantics:
    - "前" (without "之前") => inclusive end-of-day of the target date (23:59)
    - "之前" => exclusive of target date, mapped to previous day 23:59
    """
    if not text:
        return None

    now = datetime.now()
    # Optional year: 2026年4月17号前 / 4月17日前 / 4月17日之前
    pattern = re.compile(
        r"(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?\s*(之前|以前|前)"
    )
    m = pattern.search(text)
    if not m:
        return None

    year_str, month_str, day_str, qualifier = m.groups()
    year = int(year_str) if year_str else now.year
    month = int(month_str)
    day = int(day_str)

    try:
        base = datetime(year, month, day, 23, 59, 0)
    except ValueError:
        return None

    # If year omitted and parsed date already passed this year, roll to next year.
    if not year_str and base < now - timedelta(days=1):
        try:
            base = datetime(year + 1, month, day, 23, 59, 0)
        except ValueError:
            return None

    if qualifier in {"之前", "以前"}:
        return base - timedelta(days=1)
    return base


def _extract_deadline_label_from_text(text: str) -> str:
    """Return a user-facing deadline label like '截止4月17日'."""
    dt = _extract_deadline_from_text(text)
    if not dt:
        return ""

    now = datetime.now()
    if dt.year == now.year:
        return f"截止{dt.month}月{dt.day}日"
    return f"截止{dt.year}年{dt.month}月{dt.day}日"


def _append_deadline_label(title: str, deadline_label: str) -> str:
    """Append deadline label to title once."""
    safe_title = (title or "").strip() or "待办"
    if not deadline_label:
        return safe_title
    if deadline_label in safe_title:
        return safe_title
    return f"{safe_title}（{deadline_label}）"


def _has_explicit_clock_time_in_text(text: str) -> bool:
    """Whether input includes explicit clock time (e.g. 15:30, 下午3点)."""
    if not text:
        return False

    return bool(re.search(
        r"(\d{1,2}:\d{2})|((?:上午|下午|早上|晚上|中午)?\s*\d{1,2}\s*点(?:半|\d{1,2}\s*分?)?)",
        text,
    ))


def _parse_date_range(date_str: str):
    """Parse YYYY-MM-DD into [start_of_day, next_day_start)."""
    if not date_str:
        return None, None
    try:
        day = datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        return None, None
    start = day.replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=1)
    return start, end
