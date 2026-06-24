"""Backup database operations."""
import aiosqlite
from datetime import datetime
from ._connection import DB_PATH

async def export_all_data() -> dict:
    """Export all database tables to a dict for backup."""
    async with aiosqlite.connect(DB_PATH) as db:
        tables = {}
        async with db.execute("SELECT name FROM sqlite_master WHERE type='table'") as cursor:
            rows = await cursor.fetchall()
            for (table_name,) in rows:
                if table_name in ('sqlite_sequence',):
                    continue
                async with db.execute(f"SELECT * FROM {table_name}") as sel:
                    cols = [desc[0] for desc in sel.description]
                    rows_data = await sel.fetchall()
                    tables[table_name] = [dict(zip(cols, row)) for row in rows_data]
        return {
            "version": APP_VERSION if 'APP_VERSION' in dir() else "1.0.0",
            "exported_at": datetime.now().isoformat(),
            "tables": tables
        }


async def import_all_data(data: dict, clear: bool = False) -> dict:
    """Import data from backup dict. If clear=True, truncate all tables first."""
    if "tables" not in data:
        raise ValueError("Invalid backup format: missing tables")
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("PRAGMA foreign_keys = OFF")
        if clear:
            async with db.execute("SELECT name FROM sqlite_master WHERE type='table'") as cursor:
                rows = await cursor.fetchall()
            for (table_name,) in rows:
                if table_name in ('sqlite_sequence',):
                    continue
                await db.execute(f"DELETE FROM {table_name}")
        for table_name, rows in data["tables"].items():
            if table_name in ('sqlite_sequence',):
                continue
            if not rows:
                continue
            for row in rows:
                placeholders = ", ".join(["?"] * len(row))
                cols = ", ".join(row.keys())
                sql = f"INSERT INTO {table_name} ({cols}) VALUES ({placeholders})"
                try:
                    await db.execute(sql, list(row.values()))
                except Exception:
                    pass  # Skip duplicate or invalid rows
        await db.commit()
        return {"imported": True, "tables": list(data["tables"].keys())}


APP_VERSION = "1.0.0"
