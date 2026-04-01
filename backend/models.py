"""Event dataclass model."""
from dataclasses import dataclass, field, asdict
from datetime import datetime
from typing import Optional


@dataclass
class Event:
    """Event model for schedule management."""
    id: Optional[int] = None
    title: str = ""
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    category_id: str = "work"
    all_day: bool = False
    recurrence: str = "none"  # none/daily/weekly/monthly
    status: str = "pending"  # pending/done/cancelled
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    reminder_enabled: bool = False
    reminder_minutes: int = 10
    reminder_sent: bool = False

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        d = asdict(self)
        # Convert datetime to ISO string
        for key in ['start_time', 'end_time', 'created_at', 'updated_at']:
            if d.get(key) and isinstance(d[key], datetime):
                d[key] = d[key].isoformat()
        return d

    @classmethod
    def from_dict(cls, d: dict) -> "Event":
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


# Default categories
CATEGORIES = [
    {"id": "work", "name": "工作", "color": "#4285F4"},
    {"id": "life", "name": "生活", "color": "#34A853"},
    {"id": "study", "name": "学习", "color": "#FBBC04"},
    {"id": "health", "name": "健康", "color": "#EA4335"},
]