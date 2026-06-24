"""Notes database operations."""
import aiosqlite
from datetime import datetime
from typing import List, Optional

from ..models import Note, NoteConversation, NoteGroup
from ._connection import DB_PATH

async def create_note_conversation(conversation: "NoteConversation") -> "NoteConversation":
    """Create a new note conversation message."""
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            """INSERT INTO note_conversations (note_id, role, content, selected_text, created_at)
               VALUES (?, ?, ?, ?, ?)""",
            (conversation.note_id, conversation.role, conversation.content, conversation.selected_text, now),
        )
        await db.commit()
        conversation.id = cursor.lastrowid
        conversation.created_at = datetime.now()
    return conversation


async def get_note_conversations(note_id: int) -> List["NoteConversation"]:
    """Get all conversation messages for a note, ordered by creation time."""
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            """SELECT id, note_id, role, content, selected_text, created_at 
               FROM note_conversations 
               WHERE note_id = ? 
               ORDER BY created_at ASC""",
            (note_id,),
        )
        rows = await cursor.fetchall()
        return [
            NoteConversation(
                id=row[0],
                note_id=row[1],
                role=row[2],
                content=row[3],
                selected_text=row[4] or "",
                created_at=datetime.fromisoformat(row[5]) if row[5] else None,
            )
            for row in rows
        ]


async def delete_note_conversations(note_id: int) -> bool:
    """Delete all conversation messages for a note."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM note_conversations WHERE note_id = ?", (note_id,))
        await db.commit()
    return True




# Notes CRUD + Groups
async def create_note(note: Note) -> Note:
    """Create a new note."""
    async with aiosqlite.connect(DB_PATH) as db:
        now = datetime.now().isoformat()
        cursor = await db.execute(
            "INSERT INTO notes (title, content, group_id, sort_order, is_pinned, color, is_archived, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (note.title, note.content, note.group_id, note.sort_order or 0, 1 if note.is_pinned else 0, note.color or '', 1 if note.is_archived else 0, now, now),
        )
        await db.commit()
        note.id = cursor.lastrowid
        note.created_at = datetime.now()
        note.updated_at = datetime.now()
        return note


async def get_notes(include_archived: bool = False) -> list[Note]:
    """Get all notes ordered by created_at desc."""
    async with aiosqlite.connect(DB_PATH) as db:
        conditions = []
        params = []
        if not include_archived:
            conditions.append("is_archived = 0")
        
        where_clause = ""
        if conditions:
            where_clause = " WHERE " + " AND ".join(conditions)
        
        async with db.execute(
            f"SELECT id, title, content, group_id, sort_order, is_pinned, color, is_archived, created_at, updated_at FROM notes{where_clause} ORDER BY is_pinned DESC, created_at DESC"
        ) as cursor:
            rows = await cursor.fetchall()
            return [
                Note(
                    id=row[0],
                    title=row[1],
                    content=row[2],
                    group_id=row[3],
                    sort_order=row[4] if row[4] is not None else 0,
                    is_pinned=bool(row[5]) if row[5] is not None else False,
                    color=row[6] if row[6] is not None else "",
                    is_archived=bool(row[7]) if row[7] is not None else False,
                    created_at=datetime.fromisoformat(row[8]) if row[8] else None,
                    updated_at=datetime.fromisoformat(row[9]) if row[9] else None,
                )
                for row in rows
            ]


async def get_note(note_id: int) -> Optional[Note]:
    """Get a single note by ID."""
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT id, title, content, group_id, sort_order, is_pinned, color, is_archived, created_at, updated_at FROM notes WHERE id = ?",
            (note_id,),
        ) as cursor:
            row = await cursor.fetchone()
            if row:
                return Note(
                    id=row[0],
                    title=row[1],
                    content=row[2],
                    group_id=row[3],
                    sort_order=row[4] if row[4] is not None else 0,
                    is_pinned=bool(row[5]) if row[5] is not None else False,
                    color=row[6] if row[6] is not None else "",
                    is_archived=bool(row[7]) if row[7] is not None else False,
                    created_at=datetime.fromisoformat(row[8]) if row[8] else None,
                    updated_at=datetime.fromisoformat(row[9]) if row[9] else None,
                )
            return None


async def update_note(note_id: int, note: Note) -> Optional[Note]:
    """Update an existing note."""
    existing = await get_note(note_id)
    if not existing:
        return None
    
    sort_order_to_use = note.sort_order if note.sort_order is not None else existing.sort_order
    is_pinned_to_use = note.is_pinned if note.is_pinned is not None else existing.is_pinned
    color_to_use = note.color if note.color is not None else existing.color
    is_archived_to_use = note.is_archived if note.is_archived is not None else existing.is_archived
    
    async with aiosqlite.connect(DB_PATH) as db:
        now = datetime.now().isoformat()
        await db.execute(
            "UPDATE notes SET title = ?, content = ?, group_id = ?, sort_order = ?, is_pinned = ?, color = ?, is_archived = ?, updated_at = ? WHERE id = ?",
            (
                note.title if note.title else existing.title,
                note.content if note.content else existing.content,
                note.group_id if note.group_id is not None else existing.group_id,
                sort_order_to_use,
                1 if is_pinned_to_use else 0,
                color_to_use or '',
                1 if is_archived_to_use else 0,
                now,
                note_id,
            ),
        )
        await db.commit()
    
    return await get_note(note_id)


async def delete_note(note_id: int) -> bool:
    """Delete a note."""
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("DELETE FROM notes WHERE id = ?", (note_id,))
        await db.commit()
        return cursor.rowcount > 0


async def get_notes_by_title(keyword: str) -> List[Note]:
    """Get all notes matching title keyword (partial match)."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM notes WHERE title LIKE ? OR content LIKE ? ORDER BY updated_at DESC",
            (f"%{keyword}%", f"%{keyword}%"),
        ) as cursor:
            rows = await cursor.fetchall()
            return [Note(**dict(row)) for row in rows]


# ============================================
# NoteGroup CRUD functions
# ============================================

async def create_note_group(note_group: NoteGroup) -> NoteGroup:
    """Create a new note group."""
    async with aiosqlite.connect(DB_PATH) as db:
        now = datetime.now().isoformat()
        cursor = await db.execute(
            "INSERT INTO note_groups (name, sort_order, created_at) VALUES (?, ?, ?)",
            (note_group.name, note_group.sort_order, now),
        )
        await db.commit()
        note_group.id = cursor.lastrowid
        note_group.created_at = datetime.now()
        return note_group


async def get_note_groups() -> list[NoteGroup]:
    """Get all note groups ordered by sort_order."""
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT id, name, sort_order, created_at FROM note_groups ORDER BY sort_order"
        ) as cursor:
            rows = await cursor.fetchall()
            return [
                NoteGroup(
                    id=row[0],
                    name=row[1],
                    sort_order=row[2],
                    created_at=datetime.fromisoformat(row[3]) if row[3] else None,
                )
                for row in rows
            ]


async def get_note_group(group_id: int) -> Optional[NoteGroup]:
    """Get a single note group by ID."""
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT id, name, sort_order, created_at FROM note_groups WHERE id = ?",
            (group_id,),
        ) as cursor:
            row = await cursor.fetchone()
            if row:
                return NoteGroup(
                    id=row[0],
                    name=row[1],
                    sort_order=row[2],
                    created_at=datetime.fromisoformat(row[3]) if row[3] else None,
                )
            return None


async def update_note_group(group_id: int, note_group: NoteGroup) -> Optional[NoteGroup]:
    """Update an existing note group."""
    existing = await get_note_group(group_id)
    if not existing:
        return None
    
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE note_groups SET name = ?, sort_order = ? WHERE id = ?",
            (
                note_group.name if note_group.name else existing.name,
                note_group.sort_order if note_group.sort_order != existing.sort_order else existing.sort_order,
                group_id,
            ),
        )
        await db.commit()
    
    return await get_note_group(group_id)


async def delete_note_group(group_id: int) -> bool:
    """Delete a note group. Notes in the group will have group_id set to NULL."""
    async with aiosqlite.connect(DB_PATH) as db:
        # First set notes in this group to NULL
        await db.execute("UPDATE notes SET group_id = NULL WHERE group_id = ?", (group_id,))
        # Then delete the group
        cursor = await db.execute("DELETE FROM note_groups WHERE id = ?", (group_id,))
        await db.commit()
        return cursor.rowcount > 0

