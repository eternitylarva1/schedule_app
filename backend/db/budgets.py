"""Budgets database operations."""
import aiosqlite
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from ..models import Budget, Expense
from ._connection import DB_PATH

async def create_budget(budget: Budget) -> Budget:
    """Create a new budget."""
    now = datetime.now().isoformat()
    period_start = budget.period_start.isoformat() if budget.period_start else None
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            """INSERT INTO budgets (name, amount, color, period, auto_reset, rollover, rollover_limit, rollover_amount, period_start, is_test, created_at) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (budget.name, budget.amount, budget.color, budget.period, 
             1 if budget.auto_reset else 0, 1 if budget.rollover else 0,
             budget.rollover_limit, budget.rollover_amount, period_start, 
             1 if budget.is_test else 0, now)
        )
        await db.commit()
        budget.id = cursor.lastrowid
        budget.created_at = datetime.now()
        return budget


async def get_budget(budget_id: int) -> Optional[Budget]:
    """Get a budget by ID."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM budgets WHERE id = ?", (budget_id,)) as cursor:
            row = await cursor.fetchone()
            if not row:
                return None
            row_keys = list(row.keys())
            period=row["period"] if "period" in row_keys else "none"
            auto_reset=bool(row["auto_reset"]) if "auto_reset" in row_keys and row["auto_reset"] is not None else False
            rollover=bool(row["rollover"]) if "rollover" in row_keys and row["rollover"] is not None else False
            rollover_limit=row["rollover_limit"] if "rollover_limit" in row_keys and row["rollover_limit"] is not None else None
            rollover_amount=row["rollover_amount"] if "rollover_amount" in row_keys and row["rollover_amount"] is not None else 0.0
            period_start=datetime.fromisoformat(row["period_start"]) if "period_start" in row_keys and row["period_start"] else None
            return Budget(
                id=row["id"],
                name=row["name"],
                amount=row["amount"],
                color=row["color"],
                period=period,
                auto_reset=auto_reset,
                rollover=rollover,
                rollover_limit=rollover_limit,
                rollover_amount=rollover_amount,
                period_start=period_start,
                is_test=bool(row["is_test"]) if "is_test" in row_keys and row["is_test"] is not None else False,
                created_at=datetime.fromisoformat(row["created_at"]) if row["created_at"] else None
            )


async def get_budgets() -> List[Budget]:
    """Get all budgets."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM budgets ORDER BY created_at DESC") as cursor:
            rows = await cursor.fetchall()
            budgets = []
            for row in rows:
                row_keys = list(row.keys())
                period=row["period"] if "period" in row_keys else "none"
                auto_reset=bool(row["auto_reset"]) if "auto_reset" in row_keys and row["auto_reset"] is not None else False
                rollover=bool(row["rollover"]) if "rollover" in row_keys and row["rollover"] is not None else False
                rollover_limit=row["rollover_limit"] if "rollover_limit" in row_keys and row["rollover_limit"] is not None else None
                rollover_amount=row["rollover_amount"] if "rollover_amount" in row_keys and row["rollover_amount"] is not None else 0.0
                period_start=datetime.fromisoformat(row["period_start"]) if "period_start" in row_keys and row["period_start"] else None
                budgets.append(Budget(
                    id=row["id"],
                    name=row["name"],
                    amount=row["amount"],
                    color=row["color"],
                    period=period,
                    auto_reset=auto_reset,
                    rollover=rollover,
                    rollover_limit=rollover_limit,
                    rollover_amount=rollover_amount,
                    period_start=period_start,
                    is_test=bool(row["is_test"]) if "is_test" in row_keys and row["is_test"] is not None else False,
                    created_at=datetime.fromisoformat(row["created_at"]) if row["created_at"] else None
                ))
            return budgets


async def update_budget(budget_id: int, budget: Budget) -> Optional[Budget]:
    """Update a budget."""
    period_start = budget.period_start.isoformat() if budget.period_start else None
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            """UPDATE budgets SET name = ?, amount = ?, color = ?, period = ?, auto_reset = ?, 
               rollover = ?, rollover_limit = ?, rollover_amount = ?, period_start = ?, is_test = ? WHERE id = ?""",
            (budget.name, budget.amount, budget.color, budget.period,
             1 if budget.auto_reset else 0, 1 if budget.rollover else 0,
             budget.rollover_limit, budget.rollover_amount, period_start, 
             1 if budget.is_test else 0, budget_id)
        )
        await db.commit()
        if cursor.rowcount == 0:
            return None
        return await get_budget(budget_id)


async def delete_budget(budget_id: int) -> bool:
    """Delete a budget."""
    async with aiosqlite.connect(DB_PATH) as db:
        # First, unlink expenses from this budget
        await db.execute("UPDATE expenses SET budget_id = NULL WHERE budget_id = ?", (budget_id,))
        cursor = await db.execute("DELETE FROM budgets WHERE id = ?", (budget_id,))
        await db.commit()
        return cursor.rowcount > 0


async def get_budget_spent(budget_id: int, period_start: Optional[datetime] = None) -> float:
    """Get total spent amount for a budget.

    If period_start is provided, only sum expenses with expense_date >= period_start.
    For expenses with empty expense_date, use created_at date as fallback (so legacy
    expenses are attributed to the period when they were actually created).
    """
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        if period_start:
            # Use COALESCE to fall back to created_at for empty expense_date
            period_str = period_start.strftime("%Y-%m-%d")
            async with db.execute(
                """SELECT COALESCE(SUM(amount), 0) as total FROM expenses
                   WHERE budget_id = ?
                   AND COALESCE(NULLIF(expense_date, ''), date(created_at)) >= ?""",
                (budget_id, period_str)
            ) as cursor:
                row = await cursor.fetchone()
        else:
            async with db.execute(
                "SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE budget_id = ?",
                (budget_id,)
            ) as cursor:
                row = await cursor.fetchone()
        return row["total"] if row else 0.0


def get_next_period_start(period_start: datetime, period: str) -> datetime:
    """Calculate the start of the next period."""
    if period == "weekly":
        # Next week starts 7 days later
        return period_start + timedelta(weeks=1)
    elif period == "monthly":
        # Next month: add one month
        month = period_start.month
        year = period_start.year
        month += 1
        if month > 12:
            month = 1
            year += 1
        # Keep the same day, but cap at the number of days in the new month
        day = min(period_start.day, [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1])
        return datetime(year, month, day, period_start.hour, period_start.minute, period_start.second)
    elif period == "quarterly":
        # Next quarter: add 3 months
        month = period_start.month
        year = period_start.year
        month += 3
        if month > 12:
            month -= 12
            year += 1
        day = min(period_start.day, [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1])
        return datetime(year, month, day, period_start.hour, period_start.minute, period_start.second)
    elif period == "yearly":
        # Next year
        return datetime(period_start.year + 1, period_start.month, period_start.day, period_start.hour, period_start.minute, period_start.second)
    else:
        # No period or unknown period - no automatic reset
        return period_start


async def check_and_reset_budget_period(budget_id: int) -> Optional[Budget]:
    """Check if budget period has ended and perform reset if needed.

    Handles multiple missed periods (offline for 2+ periods): loops and
    advances period_start until current, but only applies rollover once
    for the most recent missed period.

    Returns the updated budget, or None if budget doesn't exist.
    """
    budget = await get_budget(budget_id)
    if not budget:
        return None

    # Skip if no period is set
    if not budget.period or budget.period == "none":
        return budget

    # If no period_start, set it to now
    if not budget.period_start:
        budget.period_start = datetime.now()
        return await update_budget(budget_id, budget)

    # Loop: keep advancing period_start until we're in the current period
    now = datetime.now()
    rollover_applied = False
    while True:
        next_start = get_next_period_start(budget.period_start, budget.period)

        # If still within the current period, stop
        if now < next_start:
            break

        # Apply rollover only once for the first (most recent missed) period
        # Don't accumulate rollover for multiple missed periods — that would
        # cause runaway growth (e.g., missed 3 months = 8x budget rollover)
        if budget.auto_reset and budget.rollover and not rollover_applied:
            # Calculate spent within the current period (before advancing)
            spent = await get_budget_spent(budget_id, period_start=budget.period_start)
            remaining = budget.amount - spent
            if remaining > 0:
                new_rollover = budget.rollover_amount + remaining
                if budget.rollover_limit is not None:
                    max_rollover = budget.amount * budget.rollover_limit
                    new_rollover = min(new_rollover, max_rollover)
                budget.rollover_amount = new_rollover
            rollover_applied = True
        elif not budget.auto_reset:
            # auto_reset=False: just advance the window, no rollover
            pass

        # Advance to next period
        budget.period_start = next_start

    # Save changes
    return await update_budget(budget_id, budget)


async def get_budget_with_stats(budget_id: int) -> Optional[dict]:
    """Get budget with spent and remaining amounts. Auto-resets if period has ended."""
    # Check and perform period reset if needed
    budget = await check_and_reset_budget_period(budget_id)
    if not budget:
        return None
    # Filter spent by current period so it resets visually on period roll-over
    spent = await get_budget_spent(budget_id, period_start=budget.period_start)
    # Effective amount includes rollover
    effective_amount = budget.amount + budget.rollover_amount
    return {
        "id": budget.id,
        "name": budget.name,
        "amount": budget.amount,
        "effective_amount": effective_amount,
        "spent": spent,
        "remaining": effective_amount - spent,
        "color": budget.color,
        "period": budget.period,
        "auto_reset": budget.auto_reset,
        "rollover": budget.rollover,
        "rollover_limit": budget.rollover_limit,
        "rollover_amount": budget.rollover_amount,
        "period_start": budget.period_start.isoformat() if budget.period_start else None,
        "created_at": budget.created_at.isoformat() if budget.created_at else None
    }


async def get_budgets_with_stats() -> List[dict]:
    """Get all budgets with spent and remaining amounts. Auto-resets periods if needed."""
    budgets = await get_budgets()
    result = []
    for budget in budgets:
        # Check and perform period reset if needed
        if budget.id is not None:
            reset_budget = await check_and_reset_budget_period(budget.id)
            if reset_budget is None:
                continue  # Skip if budget was deleted
            budget = reset_budget
            budget_id_for_spent = reset_budget.id
            # Filter spent by current period so it resets visually on period roll-over
            spent = await get_budget_spent(budget_id_for_spent, period_start=budget.period_start) if budget_id_for_spent is not None else 0.0
        else:
            spent = 0.0
        # Effective amount includes rollover
        effective_amount = budget.amount + budget.rollover_amount
        result.append({
            "id": budget.id,
            "name": budget.name,
            "amount": budget.amount,
            "effective_amount": effective_amount,
            "spent": spent,
            "remaining": effective_amount - spent,
            "color": budget.color,
            "period": budget.period,
            "auto_reset": budget.auto_reset,
            "rollover": budget.rollover,
            "rollover_limit": budget.rollover_limit,
            "rollover_amount": budget.rollover_amount,
            "period_start": budget.period_start.isoformat() if budget.period_start else None,
            "created_at": budget.created_at.isoformat() if budget.created_at else None
        })
    return result


async def get_expenses_by_budget(budget_id: int) -> List[Expense]:
    """Get all expenses for a specific budget."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM expenses WHERE budget_id = ? ORDER BY created_at DESC",
            (budget_id,)
        ) as cursor:
            rows = await cursor.fetchall()
            expenses = []
            for row in rows:
                expenses.append(Expense(
                    id=row["id"],
                    amount=row["amount"],
                    category=row["category"],
                    note=row["note"],
                    budget_id=row["budget_id"] if "budget_id" in row.keys() else None,
                    created_at=datetime.fromisoformat(row["created_at"]) if row["created_at"] else None
                ))
            return expenses


# ============ Budget Templates CRUD ============

@dataclass
class BudgetTemplate:
    """Budget template for quick budget creation."""
    id: int | None = None
    name: str = ""
    amount: float = 0.0
    color: str = "#3B82F6"
    period: str = "none"
    auto_reset: bool = False
    rollover: bool = False
    rollover_limit: int | None = None
    created_at: datetime | None = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        d = asdict(self)
        if d.get("created_at") and isinstance(d["created_at"], datetime):
            d["created_at"] = d["created_at"].isoformat()
        return d


async def create_budget_template(template: BudgetTemplate) -> BudgetTemplate:
    """Create a new budget template."""
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            """INSERT INTO budget_templates (name, amount, color, period, auto_reset, rollover, rollover_limit, created_at) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (template.name, template.amount, template.color, template.period,
             1 if template.auto_reset else 0, 1 if template.rollover else 0,
             template.rollover_limit, now)
        )
        await db.commit()
        template.id = cursor.lastrowid
        template.created_at = datetime.now()
        return template


async def get_budget_templates() -> List[BudgetTemplate]:
    """Get all budget templates."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM budget_templates ORDER BY created_at DESC") as cursor:
            rows = await cursor.fetchall()
            templates = []
            for row in rows:
                row_keys = list(row.keys())
                templates.append(BudgetTemplate(
                    id=row["id"],
                    name=row["name"],
                    amount=row["amount"],
                    color=row["color"] if "color" in row.keys() and row["color"] else "#3B82F6",
                    period=row["period"] if "period" in row.keys() and row["period"] else "none",
                    auto_reset=bool(row["auto_reset"]) if "auto_reset" in row.keys() else False,
                    rollover=bool(row["rollover"]) if "rollover" in row.keys() else False,
                    rollover_limit=row["rollover_limit"] if "rollover_limit" in row.keys() else None,
                    created_at=datetime.fromisoformat(row["created_at"]) if row["created_at"] else None
                ))
            return templates


async def delete_budget_template(template_id: int) -> bool:
    """Delete a budget template."""
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("DELETE FROM budget_templates WHERE id = ?", (template_id,))
        await db.commit()
        return cursor.rowcount > 0


# Expense categories CRUD
