"""Goals database operations."""
import aiosqlite
from dataclasses import dataclass
from datetime import datetime
from typing import Any, List, Optional

from ..models import Goal, GoalConversation
from ._connection import DB_PATH

async def create_goal(goal: Goal) -> Goal:
    """Create a new goal with hierarchy support."""
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        # Calculate root_goal_id for hierarchy
        root_goal_id = goal.root_goal_id
        if goal.parent_id is not None and root_goal_id is None:
            # If this is a subtask and no root is set, find the root
            parent = await get_goal(goal.parent_id)
            if parent:
                root_goal_id = parent.root_goal_id or parent.id
        
        cursor = await db.execute(
            """INSERT INTO goals
               (title, description, horizon, status, start_date, end_date,
                parent_id, root_goal_id, goal_order, color, ai_context, is_test, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                goal.title,
                goal.description,
                goal.horizon,
                goal.status,
                goal.start_date.isoformat() if goal.start_date else None,
                goal.end_date.isoformat() if goal.end_date else None,
                goal.parent_id,
                root_goal_id,
                goal.order,
                goal.color,
                goal.ai_context,
                1 if goal.is_test else 0,
                now,
                now,
            ),
        )
        await db.commit()
        goal.id = cursor.lastrowid
        goal.created_at = datetime.now()
        goal.updated_at = datetime.now()
    return goal


async def get_goals(horizon: str | None = None, include_subtasks: bool = True) -> List[Goal]:
    """Get goals, optionally filtered by horizon.
    
    Args:
        horizon: Filter by short/semester/long. None means all.
        include_subtasks: If True, return all goals including subtasks.
                        If False, return only top-level goals.
    """
    query = "SELECT * FROM goals"
    conditions = []
    params: tuple[Any, ...] = ()
    
    if horizon in {"short", "semester", "long"}:
        conditions.append("horizon = ?")
        params = (horizon,)
    
    if not include_subtasks:
        conditions.append("parent_id IS NULL")
    
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    
    query += " ORDER BY goal_order ASC, created_at DESC"

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(query, params) as cursor:
            rows = await cursor.fetchall()
            goals: List[Goal] = []
            for row in rows:
                goals.append(Goal(
                    id=row["id"],
                    title=row["title"],
                    description=row["description"] or "",
                    horizon=row["horizon"] or "short",
                    status=row["status"] or "active",
                    start_date=datetime.fromisoformat(row["start_date"]) if row["start_date"] else None,
                    end_date=datetime.fromisoformat(row["end_date"]) if row["end_date"] else None,
                    parent_id=row["parent_id"],
                    root_goal_id=row["root_goal_id"],
                    order=row["goal_order"] or 0,
                    color=row["color"] or "",
                    ai_context=row["ai_context"] or "",
                    is_test=bool(row["is_test"]) if "is_test" in row.keys() and row["is_test"] is not None else False,
                    created_at=datetime.fromisoformat(row["created_at"]) if row["created_at"] else None,
                    updated_at=datetime.fromisoformat(row["updated_at"]) if row["updated_at"] else None,
                ))
    return goals


async def search_goals(q: str, limit: int = 20) -> List[Goal]:
    """Search goals by title or description."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """SELECT * FROM goals WHERE (title LIKE ? OR description LIKE ?) ORDER BY goal_order ASC, created_at DESC LIMIT ?""",
            (f"%{q}%", f"%{q}%", limit)
        ) as cursor:
            rows = await cursor.fetchall()
            goals: List[Goal] = []
            for row in rows:
                goals.append(Goal(
                    id=row["id"],
                    title=row["title"],
                    description=row["description"] or "",
                    horizon=row["horizon"] or "short",
                    status=row["status"] or "active",
                    start_date=datetime.fromisoformat(row["start_date"]) if row["start_date"] else None,
                    end_date=datetime.fromisoformat(row["end_date"]) if row["end_date"] else None,
                    parent_id=row["parent_id"],
                    root_goal_id=row["root_goal_id"],
                    order=row["goal_order"] or 0,
                    color=row["color"] or "",
                    ai_context=row["ai_context"] or "",
                    is_test=bool(row["is_test"]) if "is_test" in row.keys() and row["is_test"] is not None else False,
                    created_at=datetime.fromisoformat(row["created_at"]) if row["created_at"] else None,
                    updated_at=datetime.fromisoformat(row["updated_at"]) if row["updated_at"] else None,
                ))
    return goals


async def get_goal(goal_id: int) -> Optional[Goal]:
    """Get a single goal by ID."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM goals WHERE id = ?", (goal_id,)) as cursor:
            row = await cursor.fetchone()
            if not row:
                return None
            return Goal(
                id=row["id"],
                title=row["title"],
                description=row["description"] or "",
                horizon=row["horizon"] or "short",
                status=row["status"] or "active",
                start_date=datetime.fromisoformat(row["start_date"]) if row["start_date"] else None,
                end_date=datetime.fromisoformat(row["end_date"]) if row["end_date"] else None,
                parent_id=row["parent_id"],
                root_goal_id=row["root_goal_id"],
                order=row["goal_order"] or 0,
                color=row["color"] or "",
                ai_context=row["ai_context"] or "",
                is_test=bool(row["is_test"]) if "is_test" in row.keys() and row["is_test"] is not None else False,
                created_at=datetime.fromisoformat(row["created_at"]) if row["created_at"] else None,
                updated_at=datetime.fromisoformat(row["updated_at"]) if row["updated_at"] else None,
            )


async def get_goal_subtasks(goal_id: int) -> List[Goal]:
    """Get direct subtasks of a goal."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM goals WHERE parent_id = ? ORDER BY goal_order ASC, created_at ASC",
            (goal_id,)
        ) as cursor:
            rows = await cursor.fetchall()
            subtasks: List[Goal] = []
            for row in rows:
                subtasks.append(Goal(
                    id=row["id"],
                    title=row["title"],
                    description=row["description"] or "",
                    horizon=row["horizon"] or "short",
                    status=row["status"] or "active",
                    start_date=datetime.fromisoformat(row["start_date"]) if row["start_date"] else None,
                    end_date=datetime.fromisoformat(row["end_date"]) if row["end_date"] else None,
                    parent_id=row["parent_id"],
                    root_goal_id=row["root_goal_id"],
                    order=row["goal_order"] or 0,
                    color=row["color"] or "",
                    ai_context=row["ai_context"] or "",
                    is_test=bool(row["is_test"]) if "is_test" in row.keys() and row["is_test"] is not None else False,
                    created_at=datetime.fromisoformat(row["created_at"]) if row["created_at"] else None,
                    updated_at=datetime.fromisoformat(row["updated_at"]) if row["updated_at"] else None,
                ))
    return subtasks


async def get_goal_tree(goal_id: int, max_depth: int = 3) -> dict[str, Any] | None:
    """Get a goal with its full subtask tree.
    
    Args:
        goal_id: The root goal ID
        max_depth: Maximum depth to traverse (3 levels = goal -> subtask -> sub-subtask)
    
    Returns:
        dict with goal and nested subtasks
    """
    goal = await get_goal(goal_id)
    if not goal:
        return None
    
    async def build_tree(g: Goal, current_depth: int) -> dict[str, Any]:
        result = g.to_dict()
        if current_depth < max_depth:
            if g.id is None:
                result["subtasks"] = []
            else:
                subtasks = await get_goal_subtasks(g.id)
                result["subtasks"] = [await build_tree(s, current_depth + 1) for s in subtasks]
        else:
            result["subtasks"] = []
        return result
    
    return await build_tree(goal, 0)


async def update_goal(goal_id: int, goal: Goal) -> Optional[Goal]:
    """Update an existing goal."""
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """UPDATE goals SET
               title = ?, description = ?, horizon = ?, status = ?,
               start_date = ?, end_date = ?, parent_id = ?, root_goal_id = ?,
               goal_order = ?, color = ?, ai_context = ?, is_test = ?, updated_at = ?
               WHERE id = ?""",
            (
                goal.title,
                goal.description,
                goal.horizon,
                goal.status,
                goal.start_date.isoformat() if goal.start_date else None,
                goal.end_date.isoformat() if goal.end_date else None,
                goal.parent_id,
                goal.root_goal_id,
                goal.order,
                goal.color,
                goal.ai_context,
                1 if goal.is_test else 0,
                now,
                goal_id,
            ),
        )
        await db.commit()
    return await get_goal(goal_id)


async def delete_goal(goal_id: int) -> bool:
    """Delete a goal, its subtasks, and unlink its events."""
    async with aiosqlite.connect(DB_PATH) as db:
        # First get all descendant goal IDs (recursive delete)
        async def get_descendant_ids(parent_id: int) -> List[int]:
            ids = []
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT id FROM goals WHERE parent_id = ?", (parent_id,)
            ) as cursor:
                rows = await cursor.fetchall()
                for row in rows:
                    child_id = row["id"]
                    ids.append(child_id)
                    # Recursively get children
                    child_descendants = await get_descendant_ids(child_id)
                    ids.extend(child_descendants)
            return ids
        
        # Get all descendant IDs
        all_ids = [goal_id] + await get_descendant_ids(goal_id)
        
        # Unlink events
        placeholders = ",".join("?" * len(all_ids))
        await db.execute(f"UPDATE events SET goal_id = NULL WHERE goal_id IN ({placeholders})", all_ids)
        
        # Delete conversations first
        await db.execute(f"DELETE FROM goal_conversations WHERE goal_id IN ({placeholders})", all_ids)
        
        # Delete goals
        await db.execute(f"DELETE FROM goals WHERE id IN ({placeholders})", all_ids)
        await db.commit()
        return True


async def get_goals_by_title(keyword: str) -> List[Goal]:
    """Get all goals matching title keyword (partial match)."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM goals WHERE title LIKE ? ORDER BY created_at DESC",
            (f"%{keyword}%",),
        ) as cursor:
            rows = await cursor.fetchall()
            return [Goal(**dict(row)) for row in rows]


# ============ Goal Conversation Functions ============

async def create_goal_conversation(conversation: GoalConversation) -> GoalConversation:
    """Create a new goal conversation message."""
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            """INSERT INTO goal_conversations
               (goal_id, role, content, created_at)
               VALUES (?, ?, ?, ?)""",
            (
                conversation.goal_id,
                conversation.role,
                conversation.content,
                now,
            ),
        )
        await db.commit()
        conversation.id = cursor.lastrowid
        conversation.created_at = datetime.now()
    return conversation


async def get_goal_conversations(goal_id: int) -> List[GoalConversation]:
    """Get all conversation messages for a goal."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM goal_conversations WHERE goal_id = ? ORDER BY created_at ASC",
            (goal_id,)
        ) as cursor:
            rows = await cursor.fetchall()
            conversations: List[GoalConversation] = []
            for row in rows:
                conversations.append(GoalConversation(
                    id=row["id"],
                    goal_id=row["goal_id"],
                    role=row["role"],
                    content=row["content"],
                    created_at=datetime.fromisoformat(row["created_at"]) if row["created_at"] else None,
                ))
    return conversations


async def delete_goal_conversations(goal_id: int) -> bool:
    """Delete all conversation messages for a goal."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM goal_conversations WHERE goal_id = ?", (goal_id,))
        await db.commit()
        return True


# ============ Goal Deliverables Functions ============

@dataclass
class GoalDeliverable:
    """Model for goal deliverable/output tracking."""
    id: int | None = None
    goal_id: int | None = None
    title: str = ""
    description: str = ""
    completed: int = 0
    created_at: str | None = None
    updated_at: str | None = None


async def create_goal_deliverable(deliverable: GoalDeliverable) -> GoalDeliverable:
    """Create a new deliverable for a goal."""
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            """INSERT INTO goal_deliverables (goal_id, title, description, completed, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (deliverable.goal_id, deliverable.title, deliverable.description, deliverable.completed, now, now),
        )
        await db.commit()
        deliverable.id = cursor.lastrowid
        deliverable.created_at = now
        deliverable.updated_at = now
    return deliverable


async def get_goal_deliverables(goal_id: int) -> List[GoalDeliverable]:
    """Get all deliverables for a goal."""
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            """SELECT id, goal_id, title, description, completed, created_at, updated_at 
               FROM goal_deliverables 
               WHERE goal_id = ? 
               ORDER BY created_at ASC""",
            (goal_id,),
        )
        rows = await cursor.fetchall()
        return [
            GoalDeliverable(
                id=row[0],
                goal_id=row[1],
                title=row[2],
                description=row[3],
                completed=row[4],
                created_at=row[5],
                updated_at=row[6],
            )
            for row in rows
        ]


async def update_goal_deliverable(deliverable_id: int, updates: dict) -> GoalDeliverable | None:
    """Update a deliverable."""
    now = datetime.now().isoformat()
    fields = []
    values = []
    for key in ['title', 'description', 'completed']:
        if key in updates:
            fields.append(f"{key} = ?")
            values.append(updates[key])
    fields.append("updated_at = ?")
    values.append(now)
    values.append(deliverable_id)
    
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            f"UPDATE goal_deliverables SET {', '.join(fields)} WHERE id = ?",
            values,
        )
        await db.commit()
        
        cursor = await db.execute(
            """SELECT id, goal_id, title, description, completed, created_at, updated_at 
               FROM goal_deliverables WHERE id = ?""",
            (deliverable_id,),
        )
        row = await cursor.fetchone()
        if row:
            return GoalDeliverable(
                id=row[0],
                goal_id=row[1],
                title=row[2],
                description=row[3],
                completed=row[4],
                created_at=row[5],
                updated_at=row[6],
            )
    return None


async def delete_goal_deliverable(deliverable_id: int) -> bool:
    """Delete a deliverable."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM goal_deliverables WHERE id = ?", (deliverable_id,))
        await db.commit()
        return True


