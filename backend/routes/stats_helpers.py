"""Stats tracking helpers."""
def _update_event_stats(stats, action, affected):
    if action == "event_create":
        stats["events_created"] += affected
    elif action == "event_update":
        stats["events_updated"] += affected
    elif action == "event_move":
        stats["events_moved"] += affected
    elif action == "event_delete":
        stats["events_deleted"] += affected
    elif action == "event_complete":
        stats["events_completed"] += affected
    elif action == "event_uncomplete":
        stats["events_uncompleted"] += affected
    elif action == "event_query":
        stats["events_queried"] += affected
    elif action == "event_postpone":
        stats["events_moved"] += affected


def _update_expense_stats(stats, action, affected):
    if action == "expense_create":
        stats["expenses_created"] += affected
    elif action == "expense_update":
        stats["expenses_updated"] += affected
    elif action == "expense_delete":
        stats["expenses_deleted"] += affected
    elif action == "expense_query":
        stats["expenses_queried"] += affected


def _update_note_stats(stats, action, affected):
    if action == "note_create":
        stats["notes_created"] += affected
    elif action == "note_update":
        stats["notes_updated"] += affected
    elif action == "note_delete":
        stats["notes_deleted"] += affected
    elif action == "note_query":
        stats["notes_queried"] += affected


def _update_goal_stats(stats, action, affected):
    if action == "goal_create":
        stats["goals_created"] += affected
    elif action == "goal_update":
        stats["goals_updated"] += affected
    elif action == "goal_delete":
        stats["goals_deleted"] += affected
    elif action == "goal_query":
        stats["goals_queried"] += affected
