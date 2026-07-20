"""Categories database operations."""
import aiosqlite
from ._connection import DB_PATH


async def get_categories():
    """Get all categories ordered by type and sort_order."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT id, name, color, type, sort_order FROM categories ORDER BY type, sort_order"
        ) as cursor:
            rows = await cursor.fetchall()
        return [dict(row) for row in rows]


async def create_category(data):
    """Create a new category."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO categories (id, name, color, type, sort_order) VALUES (?, ?, ?, ?, ?)",
            (data['id'], data['name'], data['color'], data.get('type', 'event'), data.get('sort_order', 0))
        )
        await db.commit()
        return data


async def update_category(cat_id, data):
    """Update a category."""
    async with aiosqlite.connect(DB_PATH) as db:
        fields = []
        vals = []
        for f in ['name', 'color', 'sort_order']:
            if f in data:
                fields.append(f"{f} = ?")
                vals.append(data[f])
        if fields:
            vals.append(cat_id)
            await db.execute(f"UPDATE categories SET {', '.join(fields)} WHERE id = ?", vals)
            await db.commit()
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM categories WHERE id = ?", (cat_id,)) as cursor:
            row = await cursor.fetchone()
        return dict(row) if row else None


async def delete_category(cat_id):
    """Delete a category."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM categories WHERE id = ?", (cat_id,))
        await db.commit()
