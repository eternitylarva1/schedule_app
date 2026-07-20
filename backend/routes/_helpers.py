"""Shared helpers — re-exported from sub-modules for backward compatibility."""
from .response import json_response, error_response, _sanitize_ai_provider
from .parse_helpers import (
    _parse_datetime, _extract_deadline_from_text,
    _extract_deadline_label_from_text, _append_deadline_label,
    _has_explicit_clock_time_in_text, _parse_date_range,
)
from .operation_handlers import (
    _handle_event_operation, _handle_expense_operation,
    _handle_note_operation, _handle_goal_operation,
)
from .stats_helpers import (
    _update_event_stats, _update_expense_stats,
    _update_note_stats, _update_goal_stats,
)

__all__ = [
    "json_response", "error_response", "_sanitize_ai_provider",
    "_parse_datetime", "_extract_deadline_from_text",
    "_extract_deadline_label_from_text", "_append_deadline_label",
    "_has_explicit_clock_time_in_text", "_parse_date_range",
    "_handle_event_operation", "_handle_expense_operation",
    "_handle_note_operation", "_handle_goal_operation",
    "_update_event_stats", "_update_expense_stats",
    "_update_note_stats", "_update_goal_stats",
]
