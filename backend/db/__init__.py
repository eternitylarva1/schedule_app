"""SQLite database operations - facade re-exporting all sub-modules."""

from ._connection import DB_PATH, init_db
from .events import (
    create_event, get_events, get_event, update_event, delete_event,
    delete_events_by_title, backup_deleted_event, get_deleted_events,
    restore_deleted_event, permanent_delete, backup_event_modification,
    get_event_modifications, undo_event_modification, create_event_history,
    get_event_history, get_all_event_history, delete_event_history,
    complete_events_by_title, uncomplete_events_by_title,
    update_event_time_by_title, update_event_by_title, move_event_by_title,
    postpone_remaining_events_preview, postpone_remaining_events,
    undo_postpone_events, get_events_by_title, complete_event, uncomplete_event,
    get_task_durations, record_task_duration, get_learning_patterns,
    save_learning_pattern, delete_learning_pattern, get_learning_stats,
    batch_complete_events, find_duplicate_event, find_overlapping_events,
    batch_uncomplete_events, batch_delete_events, get_stats,
    search_events,
)
from .settings import (
    get_setting, set_setting,
    get_ai_providers, get_active_ai_provider, get_ai_provider,
    create_ai_provider, update_ai_provider, delete_ai_provider, activate_ai_provider,
    get_user_contexts, create_user_context, update_user_context,
    delete_user_context, reorder_user_contexts,
)
from .goals import (
    create_goal, get_goals, get_goal, get_goal_subtasks, get_goal_tree,
    update_goal, delete_goal, get_goals_by_title, search_goals,
    create_goal_conversation, get_goal_conversations, delete_goal_conversations,
    create_goal_deliverable, get_goal_deliverables, update_goal_deliverable,
    delete_goal_deliverable,
)
from .notes import (
    create_note, get_notes, get_note, update_note, delete_note, search_notes,
    create_note_conversation, get_note_conversations, delete_note_conversations,
    get_notes_by_title, create_note_group, get_note_groups, get_note_group,
    update_note_group, delete_note_group, reorder_notes,
)
from .expenses import (
    create_expense, get_expenses, get_expense, update_expense, delete_expense,
    soft_delete_expense, restore_expense,
    get_deleted_expenses, log_operation, get_operation_logs, get_operation_log,
    get_expense_operation_logs, undo_expense_operation, get_expenses_by_note,
    get_expense_stats,
    get_expense_categories, create_expense_category, update_expense_category,
    delete_expense_category,
)
from .cleanup import cleanup_test_entries
from .error_logs import create_error_log, get_error_logs, delete_error_logs
from .budgets import (
    create_budget, get_budget, get_budgets, update_budget, delete_budget,
    get_budget_spent, get_next_period_start, check_and_reset_budget_period,
    get_budget_with_stats, get_budgets_with_stats, get_expenses_by_budget,
    create_budget_template, get_budget_templates, delete_budget_template,
)
from .backup import export_all_data, import_all_data

__all__ = [
    # Connection
    "DB_PATH", "init_db",
    # Events
    "create_event", "get_events", "get_event", "update_event", "delete_event",
    "delete_events_by_title", "backup_deleted_event", "get_deleted_events",
    "restore_deleted_event", "permanent_delete", "backup_event_modification",
    "get_event_modifications", "undo_event_modification", "create_event_history",
    "get_event_history", "get_all_event_history", "delete_event_history",
    "complete_events_by_title", "uncomplete_events_by_title",
    "update_event_time_by_title", "update_event_by_title", "move_event_by_title",
    "postpone_remaining_events_preview", "postpone_remaining_events",
    "undo_postpone_events", "get_events_by_title", "complete_event", "uncomplete_event",
    "get_task_durations", "record_task_duration", "get_learning_patterns",
    "save_learning_pattern", "delete_learning_pattern", "get_learning_stats",
    "batch_complete_events", "find_duplicate_event", "find_overlapping_events",
    "batch_uncomplete_events", "batch_delete_events", "get_stats",
    "search_events",
    # Settings
    "get_setting", "set_setting",
    "get_ai_providers", "get_active_ai_provider", "get_ai_provider",
    "create_ai_provider", "update_ai_provider", "delete_ai_provider", "activate_ai_provider",
    "get_user_contexts", "create_user_context", "update_user_context",
    "delete_user_context", "reorder_user_contexts",
    # Goals
    "create_goal", "get_goals", "get_goal", "get_goal_subtasks", "get_goal_tree",
    "update_goal", "delete_goal", "get_goals_by_title", "search_goals",
    "create_goal_conversation", "get_goal_conversations", "delete_goal_conversations",
    "create_goal_deliverable", "get_goal_deliverables", "update_goal_deliverable",
    "delete_goal_deliverable",
    # Notes
    "create_note", "get_notes", "get_note", "update_note", "delete_note", "search_notes",
    "create_note_conversation", "get_note_conversations", "delete_note_conversations",
    "get_notes_by_title", "create_note_group", "get_note_groups", "get_note_group",
    "update_note_group", "delete_note_group", "reorder_notes",
    # Expenses
    "create_expense", "get_expenses", "get_expense", "update_expense", "delete_expense",
    "soft_delete_expense", "restore_expense",
    "get_deleted_expenses", "log_operation", "get_operation_logs", "get_operation_log",
    "get_expense_operation_logs", "undo_expense_operation", "get_expenses_by_note",
    "get_expense_stats",
    "get_expense_categories", "create_expense_category", "update_expense_category",
    "delete_expense_category",
    # Cleanup
    "cleanup_test_entries",
    # Error logs
    "create_error_log", "get_error_logs", "delete_error_logs",
    # Budgets
    "create_budget", "get_budget", "get_budgets", "update_budget", "delete_budget",
    "get_budget_spent", "get_next_period_start", "check_and_reset_budget_period",
    "get_budget_with_stats", "get_budgets_with_stats", "get_expenses_by_budget",
    "create_budget_template", "get_budget_templates", "delete_budget_template",
    # Backup
    "export_all_data", "import_all_data",
]
