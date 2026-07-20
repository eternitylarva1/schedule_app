"""Auto-backup manager with rotation."""
import aiosqlite
import os
import shutil
import asyncio
from datetime import datetime
from pathlib import Path
from ._connection import DB_PATH

BACKUP_DIR = Path(__file__).parent.parent / "backups"

# Default settings
DEFAULT_MAX_BACKUPS = 5
DEFAULT_BACKUP_INTERVAL_MINUTES = 60  # hourly

async def ensure_backup_dir():
    """Create backup directory if not exists."""
    os.makedirs(BACKUP_DIR, exist_ok=True)

async def create_backup() -> dict:
    """Create a .db backup file and rotate old ones."""
    await ensure_backup_dir()
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_name = f"schedule_{timestamp}.db"
    backup_path = BACKUP_DIR / backup_name
    
    # Copy the database file (SQLite supports this safely)
    shutil.copy2(str(DB_PATH), str(backup_path))
    
    # Rotate: keep only last N backups
    backups = sorted(BACKUP_DIR.glob("schedule_*.db"))
    max_keep = await get_setting_int("backup_max_count", DEFAULT_MAX_BACKUPS)
    
    while len(backups) > max_keep:
        oldest = backups.pop(0)
        os.remove(oldest)
    
    return {
        "name": backup_name,
        "path": str(backup_path),
        "size": os.path.getsize(backup_path),
        "created_at": datetime.now().isoformat(),
    }

async def list_backups() -> list:
    """List all backup files."""
    await ensure_backup_dir()
    backups = sorted(BACKUP_DIR.glob("schedule_*.db"), reverse=True)
    return [{
        "name": b.name,
        "size": os.path.getsize(b),
        "created_at": datetime.fromtimestamp(os.path.getmtime(b)).isoformat(),
    } for b in backups]

async def restore_backup(filename: str) -> dict:
    """Restore from a backup file. This REPLACES the current database."""
    await ensure_backup_dir()
    source = BACKUP_DIR / filename
    if not source.exists():
        raise FileNotFoundError(f"Backup {filename} not found")
    
    # First create a safety backup of current DB
    safety_name = f"before_restore_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db"
    safety_path = BACKUP_DIR / safety_name
    if os.path.exists(DB_PATH):
        shutil.copy2(str(DB_PATH), str(safety_path))
    
    # Replace current DB with backup
    shutil.copy2(str(source), str(DB_PATH))
    
    return {"restored": True, "from": filename, "safety_backup": safety_name}

async def delete_backup(filename: str) -> dict:
    """Delete a specific backup file."""
    await ensure_backup_dir()
    backup_path = BACKUP_DIR / filename
    if not backup_path.exists():
        raise FileNotFoundError(f"Backup {filename} not found")
    os.remove(backup_path)
    return {"deleted": filename}

async def get_setting_int(key: str, default: int) -> int:
    """Get int setting from DB."""
    from .settings import get_setting
    try:
        val = await get_setting(key)
        return int(val) if val else default
    except:
        return default

async def get_backup_config() -> dict:
    """Get current backup configuration."""
    return {
        "enabled": await get_setting_int("backup_enabled", 1) == 1,
        "max_count": await get_setting_int("backup_max_count", DEFAULT_MAX_BACKUPS),
        "interval_minutes": await get_setting_int("backup_interval_minutes", DEFAULT_BACKUP_INTERVAL_MINUTES),
    }

class BackupScheduler:
    """Background scheduler for auto-backup."""
    
    def __init__(self, db_path: str = None):
        self.db_path = db_path or str(DB_PATH)
        self._task = None
        self._running = False
    
    async def start(self):
        """Start auto-backup timer."""
        self._running = True
        await create_backup()  # Immediate backup on start
        self._task = asyncio.create_task(self._run_loop())
    
    async def stop(self):
        """Stop auto-backup timer."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
    
    async def _run_loop(self):
        """Main backup loop."""
        while self._running:
            try:
                interval = await get_setting_int("backup_interval_minutes", DEFAULT_BACKUP_INTERVAL_MINUTES)
                enabled = await get_setting_int("backup_enabled", 1) == 1
                if enabled:
                    await asyncio.sleep(max(interval * 60, 60))  # Min 1 minute
                    if self._running:
                        try:
                            await create_backup()
                            print(f"[BackupScheduler] Auto-backup completed")
                        except Exception as e:
                            print(f"[BackupScheduler] Backup failed: {e}")
                else:
                    await asyncio.sleep(60)  # Check config every minute
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"[BackupScheduler] Error: {e}")
                await asyncio.sleep(60)