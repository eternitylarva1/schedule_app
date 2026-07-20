"""SQLite database operations."""
import aiosqlite
import os
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, List, Optional

from ..models import Event, EventHistory, Goal, GoalConversation, Note, Expense, NoteGroup, NoteConversation, Budget, TaskDuration, LearningPattern, ErrorLog

DB_PATH = Path(__file__).parent.parent / "schedule.db"


async def init_db(db_path: str = None) -> aiosqlite.Connection:
    """Initialize database with versioned migrations."""
    if db_path is None:
        db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'schedule.db')

    conn = await aiosqlite.connect(db_path)
    conn.row_factory = aiosqlite.Row

    # Run CREATE TABLE statements (baseline schema, version 0)
    await create_baseline_schema(conn)

    # Run versioned migrations
    from .migrations import run_migrations
    await run_migrations(conn, conn)

    return conn


async def create_baseline_schema(db):
    """All CREATE TABLE IF NOT EXISTS statements — the baseline schema."""
    # Events table
    await db.execute("""
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            start_time TEXT,
            end_time TEXT,
            category_id TEXT DEFAULT 'work',
            all_day INTEGER DEFAULT 0,
            recurrence TEXT DEFAULT 'none',
            status TEXT DEFAULT 'pending',
            created_at TEXT,
            updated_at TEXT
        )
    """)

    # Event history table for tracking changes
    await db.execute("""
        CREATE TABLE IF NOT EXISTS event_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id INTEGER NOT NULL,
            action TEXT NOT NULL,
            field_name TEXT DEFAULT '',
            old_value TEXT DEFAULT '',
            new_value TEXT DEFAULT '',
            created_at TEXT,
            FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
        )
    """)

    # Deleted events backup table for restore functionality
    await db.execute("""
        CREATE TABLE IF NOT EXISTS deleted_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            original_id INTEGER,
            title TEXT NOT NULL,
            start_time TEXT,
            end_time TEXT,
            category_id TEXT,
            all_day INTEGER DEFAULT 0,
            recurrence TEXT DEFAULT 'none',
            status TEXT DEFAULT 'pending',
            reminder_enabled INTEGER DEFAULT 0,
            reminder_minutes INTEGER DEFAULT 1,
            is_test INTEGER DEFAULT 0,
            goal_id INTEGER,
            created_at TEXT,
            updated_at TEXT,
            deleted_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Event modifications backup table for undo functionality
    await db.execute("""
        CREATE TABLE IF NOT EXISTS event_modifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            start_time TEXT,
            end_time TEXT,
            category_id TEXT,
            all_day INTEGER DEFAULT 0,
            recurrence TEXT DEFAULT 'none',
            status TEXT DEFAULT 'pending',
            reminder_enabled INTEGER DEFAULT 0,
            reminder_minutes INTEGER DEFAULT 1,
            is_test INTEGER DEFAULT 0,
            goal_id INTEGER,
            created_at TEXT,
            updated_at TEXT,
            action_type TEXT NOT NULL,
            modified_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Settings table
    await db.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    """)

    # AI providers table for multiple AI configurations
    await db.execute("""
        CREATE TABLE IF NOT EXISTS ai_providers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            api_base TEXT NOT NULL,
            model TEXT NOT NULL,
            api_key TEXT NOT NULL,
            is_active INTEGER DEFAULT 0,
            created_at TEXT,
            updated_at TEXT
        )
    """)

    # Goals table for multi-horizon planning with hierarchical subtasks
    await db.execute("""
        CREATE TABLE IF NOT EXISTS goals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            horizon TEXT DEFAULT 'short',
            status TEXT DEFAULT 'active',
            start_date TEXT,
            end_date TEXT,
            parent_id INTEGER,
            root_goal_id INTEGER,
            goal_order INTEGER DEFAULT 0,
            color TEXT DEFAULT '',
            ai_context TEXT DEFAULT '',
            created_at TEXT,
            updated_at TEXT,
            FOREIGN KEY (parent_id) REFERENCES goals(id) ON DELETE CASCADE,
            FOREIGN KEY (root_goal_id) REFERENCES goals(id) ON DELETE SET NULL
        )
    """)

    # Goal conversations table for storing AI dialogue history
    await db.execute("""
        CREATE TABLE IF NOT EXISTS goal_conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            goal_id INTEGER NOT NULL,
            role TEXT DEFAULT 'user',
            content TEXT DEFAULT '',
            created_at TEXT,
            FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE
        )
    """)

    # Goal deliverables table for tracking outputs/deliverables
    await db.execute("""
        CREATE TABLE IF NOT EXISTS goal_deliverables (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            goal_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            completed INTEGER DEFAULT 0,
            created_at TEXT,
            updated_at TEXT,
            FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE
        )
    """)

    # Insert default settings
    await db.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('qq_reminder_enabled', 'true')")
    await db.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('default_task_reminder_enabled', 'true')")

    # User contexts table for multiple self-description entries
    await db.execute("""
        CREATE TABLE IF NOT EXISTS user_contexts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL DEFAULT '',
            sort_order INTEGER DEFAULT 0,
            created_at TEXT,
            updated_at TEXT
        )
    """)

    # Notes table for memo/notepad functionality
    await db.execute("""
        CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL DEFAULT '',
            content TEXT NOT NULL DEFAULT '',
            group_id INTEGER,
            sort_order INTEGER DEFAULT 0,
            is_pinned INTEGER DEFAULT 0,
            color TEXT DEFAULT '',
            is_archived INTEGER DEFAULT 0,
            created_at TEXT,
            updated_at TEXT
        )
    """)

    # Expenses table for expense tracking
    await db.execute("""
        CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            amount REAL NOT NULL DEFAULT 0,
            category TEXT DEFAULT 'other',
            note TEXT DEFAULT '',
            expense_date TEXT DEFAULT '',
            created_at TEXT
        )
    """)

    # Budgets table for expense budgeting
    await db.execute("""
        CREATE TABLE IF NOT EXISTS budgets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            amount REAL NOT NULL DEFAULT 0,
            color TEXT DEFAULT '#3B82F6',
            created_at TEXT
        )
    """)

    # Note groups table for custom note groupings
    await db.execute("""
        CREATE TABLE IF NOT EXISTS note_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            sort_order INTEGER DEFAULT 0,
            created_at TEXT
        )
    """)

    # Note conversations table for AI chat history
    await db.execute("""
        CREATE TABLE IF NOT EXISTS note_conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            note_id INTEGER NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            selected_text TEXT DEFAULT '',
            created_at TEXT,
            FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
        )
    """)

    # Budget templates table
    await db.execute("""
        CREATE TABLE IF NOT EXISTS budget_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            amount REAL NOT NULL DEFAULT 0,
            color TEXT DEFAULT '#3B82F6',
            period TEXT DEFAULT 'none',
            auto_reset INTEGER DEFAULT 0,
            rollover INTEGER DEFAULT 0,
            rollover_limit INTEGER,
            created_at TEXT
        )
    """)

    # Expense categories table (custom user categories)
    await db.execute("""
        CREATE TABLE IF NOT EXISTS expense_categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            color TEXT NOT NULL,
            created_at TEXT
        )
    """)

    # Operation logs table (extensible: expenses, goals, notes, etc.)
    await db.execute("""
        CREATE TABLE IF NOT EXISTS operation_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_type TEXT NOT NULL DEFAULT '',
            entity_id INTEGER,
            operation TEXT NOT NULL DEFAULT '',
            old_data TEXT DEFAULT '',
            new_data TEXT DEFAULT '',
            field_changes TEXT DEFAULT '',
            expense_date TEXT DEFAULT '',
            created_at TEXT,
            operator TEXT DEFAULT 'user'
        )
    """)

    # Deleted expenses table (soft delete for recovery)
    await db.execute("""
        CREATE TABLE IF NOT EXISTS deleted_expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            original_id INTEGER,
            amount REAL NOT NULL DEFAULT 0,
            category TEXT DEFAULT 'other',
            note TEXT DEFAULT '',
            expense_date TEXT DEFAULT '',
            budget_id INTEGER,
            is_test INTEGER DEFAULT 0,
            created_at TEXT,
            deleted_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Task duration tracking for AI learning
    await db.execute("""
        CREATE TABLE IF NOT EXISTS task_durations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            category_id TEXT DEFAULT 'work',
            estimated_minutes INTEGER,
            actual_minutes INTEGER,
            status TEXT DEFAULT 'pending',
            start_time TEXT,
            completed_at TEXT,
            created_at TEXT
        )
    """)

    # AI-generated learning patterns
    await db.execute("""
        CREATE TABLE IF NOT EXISTS learning_patterns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pattern_type TEXT NOT NULL,
            pattern_text TEXT NOT NULL,
            confidence REAL DEFAULT 0.0,
            sample_count INTEGER DEFAULT 0,
            created_at TEXT
        )
    """)

    # Client-side error logs
    await db.execute("""
        CREATE TABLE IF NOT EXISTS error_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message TEXT NOT NULL,
            stack TEXT DEFAULT '',
            source TEXT DEFAULT '',
            user_agent TEXT DEFAULT '',
            url TEXT DEFAULT '',
            timestamp TEXT
        )
    """)

    # Categories table (event categories + expense categories unified)
    await db.execute("""
        CREATE TABLE IF NOT EXISTS categories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            color TEXT NOT NULL,
            type TEXT NOT NULL DEFAULT 'event',
            sort_order INTEGER DEFAULT 0,
            created_at TEXT
        )
    """)

    # Seed default categories
    default_categories = [
        ('work', '工作', '#4285F4', 'event', 0),
        ('life', '生活', '#34A853', 'event', 1),
        ('study', '学习', '#FBBC04', 'event', 2),
        ('health', '健康', '#EA4335', 'event', 3),
        ('food', '餐饮', '#F97316', 'expense', 0),
        ('transport', '交通', '#3B82F6', 'expense', 1),
        ('shopping', '购物', '#EC4899', 'expense', 2),
        ('other', '其他', '#6B7280', 'expense', 3),
    ]
    for cat in default_categories:
        await db.execute(
            "INSERT OR IGNORE INTO categories (id, name, color, type, sort_order, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))",
            cat
        )

    await db.commit()
