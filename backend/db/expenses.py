"""Expenses database operations."""
import aiosqlite
from datetime import datetime
from typing import Any, List, Optional

from ..models import Expense
from ._connection import DB_PATH

async def create_expense(expense: Expense) -> Expense:
    """Create a new expense."""
    now = datetime.now()
    now_iso = now.isoformat()
    
    # Use expense_date if provided, otherwise default to today
    expense_date = expense.expense_date if expense.expense_date else now.strftime("%Y-%m-%d")
    
    async with aiosqlite.connect(DB_PATH) as db:
        # Check for duplicate: same amount, category, note, expense_date within last 10 seconds
        ten_secs_ago = (now - timedelta(seconds=10)).isoformat()
        existing = await db.execute(
            """SELECT id FROM expenses 
               WHERE amount = ? AND category = ? AND note = ? AND expense_date = ? 
               AND created_at > ? LIMIT 1""",
            (expense.amount, expense.category, expense.note, expense_date, ten_secs_ago)
        )
        existing_row = await existing.fetchone()
        if existing_row:
            # Duplicate found, return existing without creating new
            expense.id = existing_row[0]
            expense.created_at = now
            return expense
        
        cursor = await db.execute(
            """INSERT INTO expenses (amount, category, note, budget_id, is_test, expense_date, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (expense.amount, expense.category, expense.note, expense.budget_id, 
             1 if expense.is_test else 0, expense_date, now_iso),
        )
        await db.commit()
        expense.id = cursor.lastrowid
        expense.created_at = now
    return expense


async def get_expenses(date_filter: str = "month") -> List[Expense]:
    """Get expenses, optionally filtered by month (YYYY-MM format)."""
    from datetime import timedelta
    
    now = datetime.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    
    # Parse date filter
    import re
    if re.match(r'^\d{4}-\d{2}$', date_filter):
        try:
            year = int(date_filter[:4])
            month = int(date_filter[5:7])
            start = datetime(year, month, 1, 0, 0, 0, 0)
            if month == 12:
                end = datetime(year + 1, 1, 1, 0, 0, 0, 0)
            else:
                end = datetime(year, month + 1, 1, 0, 0, 0, 0)
        except ValueError:
            start = today_start.replace(day=1)
            if start.month == 12:
                end = start.replace(year=start.year + 1, month=1)
            else:
                end = start.replace(month=start.month + 1)
    elif date_filter == "today":
        start = today_start
        end = today_start + timedelta(days=1)
    elif date_filter == "week":
        start = today_start - timedelta(days=now.weekday())
        end = start + timedelta(days=7)
    else:  # default to month
        start = today_start.replace(day=1)
        if start.month == 12:
            end = start.replace(year=start.year + 1, month=1)
        else:
            end = start.replace(month=start.month + 1)
    
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """SELECT * FROM expenses 
               WHERE created_at >= ? AND created_at < ?
               ORDER BY created_at DESC""",
            (start.isoformat(), end.isoformat()),
        ) as cursor:
            rows = await cursor.fetchall()
            expenses = []
            for row in rows:
                row_keys = list(row.keys())
                expenses.append(Expense(
                    id=row["id"],
                    amount=float(row["amount"]) if row["amount"] else 0.0,
                    category=row["category"] or "other",
                    note=row["note"] or "",
                    budget_id=row["budget_id"] if "budget_id" in row_keys else None,
                    is_test=bool(row["is_test"]) if "is_test" in row_keys and row["is_test"] is not None else False,
                    created_at=datetime.fromisoformat(row["created_at"]) if row["created_at"] else None,
                ))
    return expenses


async def get_expense(expense_id: int) -> Optional[Expense]:
    """Get a single expense by ID."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM expenses WHERE id = ?", (expense_id,)) as cursor:
            row = await cursor.fetchone()
            if not row:
                return None
            row_keys = list(row.keys())
            return Expense(
                id=row["id"],
                amount=float(row["amount"]) if row["amount"] else 0.0,
                category=row["category"] or "other",
                note=row["note"] or "",
                budget_id=row["budget_id"] if "budget_id" in row_keys else None,
                is_test=bool(row["is_test"]) if "is_test" in row_keys and row["is_test"] is not None else False,
                created_at=datetime.fromisoformat(row["created_at"]) if row["created_at"] else None,
            )


async def update_expense(expense_id: int, expense: Expense) -> Optional[Expense]:
    """Update an existing expense."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE expenses SET amount = ?, category = ?, note = ?, budget_id = ?, is_test = ? WHERE id = ?",
            (expense.amount, expense.category, expense.note, expense.budget_id, 1 if expense.is_test else 0, expense_id),
        )
        await db.commit()
    return await get_expense(expense_id)


async def delete_expense(expense_id: int) -> bool:
    """Delete an expense (hard delete)."""
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("DELETE FROM expenses WHERE id = ?", (expense_id,))
        await db.commit()
        return cursor.rowcount > 0


async def soft_delete_expense(expense_id: int) -> bool:
    """Soft delete an expense by moving to deleted_expenses table."""
    expense = await get_expense(expense_id)
    if not expense:
        return False
    
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO deleted_expenses 
               (original_id, amount, category, note, expense_date, budget_id, is_test, created_at, deleted_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (expense.id, expense.amount, expense.category, expense.note, 
             expense.expense_date or '', expense.budget_id, 1 if expense.is_test else 0,
             expense.created_at.isoformat() if expense.created_at else now, now),
        )
        await db.execute("DELETE FROM expenses WHERE id = ?", (expense_id,))
        await db.commit()
    return True


async def restore_expense(deleted_expense_id: int) -> Optional[Expense]:
    """Restore a soft-deleted expense."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM deleted_expenses WHERE id = ?", (deleted_expense_id,)) as cursor:
            row = await cursor.fetchone()
            if not row:
                return None
        
        # Restore to expenses table with same original_id if possible
        now = datetime.now().isoformat()
        cursor = await db.execute(
            """INSERT INTO expenses (id, amount, category, note, expense_date, budget_id, is_test, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (row["original_id"], row["amount"], row["category"], row["note"],
             row["expense_date"], row["budget_id"], row["is_test"], row["created_at"]),
        )
        await db.commit()
        new_id = cursor.lastrowid
        
        # Remove from deleted_expenses
        await db.execute("DELETE FROM deleted_expenses WHERE id = ?", (deleted_expense_id,))
        await db.commit()
        
        return await get_expense(int(new_id))


async def get_deleted_expenses() -> List[dict]:
    """Get all soft-deleted expenses."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM deleted_expenses ORDER BY deleted_at DESC") as cursor:
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]


async def log_operation(
    entity_type: str,
    entity_id: int,
    operation: str,
    old_data: dict | None,
    new_data: dict | None,
    field_changes: list[dict] | None = None,
    expense_date: str | None = None,
    operator: str = "user"
) -> int:
    """Create an operation log entry."""
    import json
    now = datetime.now()
    now_iso = now.isoformat()
    
    old_json = json.dumps(old_data) if old_data else ''
    new_json = json.dumps(new_data) if new_data else ''
    changes_json = json.dumps(field_changes) if field_changes else ''
    
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            """INSERT INTO operation_logs 
               (entity_type, entity_id, operation, old_data, new_data, field_changes, expense_date, created_at, operator)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (entity_type, entity_id, operation, old_json, new_json, changes_json, 
             expense_date or '', now_iso, operator),
        )
        await db.commit()
        return cursor.lastrowid


async def get_operation_logs(
    entity_type: str = "expense",
    operation: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    search: str | None = None,
    limit: int = 50,
    offset: int = 0
) -> List[dict]:
    """Get operation logs with filters."""
    import json
    
    conditions = ["entity_type = ?"]
    params = [entity_type]
    
    if operation:
        conditions.append("operation = ?")
        params.append(operation)
    
    if start_date:
        conditions.append("expense_date >= ?")
        params.append(start_date)
    
    if end_date:
        conditions.append("expense_date <= ?")
        params.append(end_date)
    
    if search:
        conditions.append("(old_data LIKE ? OR new_data LIKE ?)")
        params.append(f"%{search}%")
        params.append(f"%{search}%")
    
    where_clause = " AND ".join(conditions) if conditions else "1=1"
    
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            f"""SELECT * FROM operation_logs 
                WHERE {where_clause}
                ORDER BY created_at DESC
                LIMIT ? OFFSET ?""",
            params + [limit, offset],
        ) as cursor:
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]


async def get_operation_log(log_id: int) -> Optional[dict]:
    """Get a single operation log by ID."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM operation_logs WHERE id = ?", (log_id,)) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None


async def get_expense_operation_logs(expense_id: int) -> List[dict]:
    """Get all operation logs for a specific expense."""
    return await get_operation_logs(entity_type="expense", search=None, limit=100)


async def undo_expense_operation(log_id: int) -> Optional[Expense]:
    """Undo an expense operation by restoring to old_data state."""
    import json
    
    log = await get_operation_log(log_id)
    if not log or log["entity_type"] != "expense":
        return None
    
    if log["operation"] == "update" and log["old_data"]:
        old_data = json.loads(log["old_data"])
        expense = Expense(
            id=log["entity_id"],
            amount=old_data.get("amount", 0),
            category=old_data.get("category", "other"),
            note=old_data.get("note", ""),
            budget_id=old_data.get("budget_id"),
            is_test=old_data.get("is_test", False),
            expense_date=old_data.get("expense_date"),
        )
        return await update_expense(log["entity_id"], expense)
    
    return None


async def get_expenses_by_note(keyword: str) -> List[Expense]:
    """Get all expenses matching note keyword (partial match)."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM expenses WHERE note LIKE ? ORDER BY created_at DESC",
            (f"%{keyword}%",),
        ) as cursor:
            rows = await cursor.fetchall()
            return [Expense(**dict(row)) for row in rows]




async def get_expense_stats(date_filter: str = "month") -> dict[str, Any]:
    """Get expense statistics by category."""
    from datetime import timedelta
    
    now = datetime.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    
    # Parse date filter
    import re
    if re.match(r'^\d{4}-\d{2}$', date_filter):
        try:
            year = int(date_filter[:4])
            month = int(date_filter[5:7])
            start = datetime(year, month, 1, 0, 0, 0, 0)
            if month == 12:
                end = datetime(year + 1, 1, 1, 0, 0, 0, 0)
            else:
                end = datetime(year, month + 1, 1, 0, 0, 0, 0)
        except ValueError:
            start = today_start.replace(day=1)
            if start.month == 12:
                end = start.replace(year=start.year + 1, month=1)
            else:
                end = start.replace(month=start.month + 1)
    elif date_filter == "today":
        start = today_start
        end = today_start + timedelta(days=1)
    elif date_filter == "week":
        start = today_start - timedelta(days=now.weekday())
        end = start + timedelta(days=7)
    else:  # default to month
        start = today_start.replace(day=1)
        if start.month == 12:
            end = start.replace(year=start.year + 1, month=1)
        else:
            end = start.replace(month=start.month + 1)
    
    async with aiosqlite.connect(DB_PATH) as db:
        # Total amount
        async with db.execute(
            """SELECT COALESCE(SUM(amount), 0) as total 
               FROM expenses WHERE created_at >= ? AND created_at < ?""",
            (start.isoformat(), end.isoformat()),
        ) as cursor:
            total_row = await cursor.fetchone()
            total = float(total_row[0]) if total_row else 0.0
        
        # By category
        async with db.execute(
            """SELECT category, COALESCE(SUM(amount), 0) as total 
               FROM expenses WHERE created_at >= ? AND created_at < ?
               GROUP BY category""",
            (start.isoformat(), end.isoformat()),
        ) as cursor:
            rows = await cursor.fetchall()
            by_category = {row[0]: float(row[1]) for row in rows}
    
    return {
        "total": total,
        "by_category": by_category,
    }


# ============================================
# Note CRUD functions
# ============================================


# Expense categories
async def get_expense_categories() -> List[dict]:
    """Get all custom expense categories."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM expense_categories ORDER BY id ASC") as cursor:
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]


async def create_expense_category(name: str, color: str) -> dict:
    """Create a new expense category."""
    async with aiosqlite.connect(DB_PATH) as db:
        now = datetime.now().isoformat()
        cursor = await db.execute(
            "INSERT INTO expense_categories (name, color, created_at) VALUES (?, ?, ?)",
            (name, color, now)
        )
        await db.commit()
        return {"id": cursor.lastrowid, "name": name, "color": color, "created_at": now}


async def update_expense_category(cat_id: int, name: str, color: str) -> Optional[dict]:
    """Update an expense category."""
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "UPDATE expense_categories SET name = ?, color = ? WHERE id = ?",
            (name, color, cat_id)
        )
        await db.commit()
        if cursor.rowcount > 0:
            async with db.execute("SELECT * FROM expense_categories WHERE id = ?", (cat_id,)) as sel:
                row = await sel.fetchone()
                if row:
                    return dict(row)
        return None


async def delete_expense_category(cat_id: int) -> bool:
    """Delete an expense category."""
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("DELETE FROM expense_categories WHERE id = ?", (cat_id,))
        await db.commit()
        return cursor.rowcount > 0


# ============================================
# Backup / Export / Import
# ============================================
