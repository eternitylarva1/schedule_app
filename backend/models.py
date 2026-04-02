"""Data models for schedule and planning."""
from dataclasses import dataclass, asdict
from datetime import datetime
from typing import Any


@dataclass
class Event:
    """Event model for schedule management."""
    id: int | None = None
    title: str = ""
    start_time: datetime | None = None
    end_time: datetime | None = None
    category_id: str = "work"
    all_day: bool = False
    recurrence: str = "none"  # none/daily/weekly/monthly
    status: str = "pending"  # pending/done/cancelled
    created_at: datetime | None = None
    updated_at: datetime | None = None
    reminder_enabled: bool = False
    reminder_minutes: int = 1
    reminder_sent: bool = False

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        d = asdict(self)
        # Convert datetime to ISO string
        for key in ['start_time', 'end_time', 'created_at', 'updated_at']:
            if d.get(key) and isinstance(d[key], datetime):
                d[key] = d[key].isoformat()
        return d

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "Event":
        """Create Event from dictionary."""
        # Parse datetime fields
        for key in ['start_time', 'end_time', 'created_at', 'updated_at']:
            if d.get(key) and isinstance(d[key], str):
                d[key] = datetime.fromisoformat(d[key])
        # Parse boolean fields
        if 'reminder_enabled' in d:
            d['reminder_enabled'] = bool(d['reminder_enabled'])
        if 'reminder_sent' in d:
            d['reminder_sent'] = bool(d['reminder_sent'])
        if 'reminder_minutes' in d and d['reminder_minutes'] is not None:
            d['reminder_minutes'] = int(d['reminder_minutes'])
        # Remove None values for optional fields
        d = {k: v for k, v in d.items() if v is not None}
        return cls(**d)


@dataclass
class Goal:
    """Goal model for multi-horizon planning."""
    id: int | None = None
    title: str = ""
    description: str = ""
    horizon: str = "short"  # short/semester/long
    status: str = "active"  # active/done/cancelled
    start_date: datetime | None = None
    end_date: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        d = asdict(self)
        for key in ["start_date", "end_date", "created_at", "updated_at"]:
            if d.get(key) and isinstance(d[key], datetime):
                d[key] = d[key].isoformat()
        return d

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "Goal":
        """Create Goal from dictionary."""
        for key in ["start_date", "end_date", "created_at", "updated_at"]:
            if d.get(key) and isinstance(d[key], str):
                d[key] = datetime.fromisoformat(d[key])
        d = {k: v for k, v in d.items() if v is not None}
        return cls(**d)


# Default categories
CATEGORIES = [
    {"id": "work", "name": "工作", "color": "#4285F4"},
    {"id": "life", "name": "生活", "color": "#34A853"},
    {"id": "study", "name": "学习", "color": "#FBBC04"},
    {"id": "health", "name": "健康", "color": "#EA4335"},
]
