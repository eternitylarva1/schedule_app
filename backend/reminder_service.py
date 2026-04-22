"""QQ reminder notification service."""
import asyncio
import aiohttp
import aiosqlite
from datetime import datetime, timedelta
from typing import Optional, Any

from . import db
from .models import Event

# QQ bot configuration
QQ_API_URL = "http://127.0.0.1:3000/send_private_msg"
QQ_USER_ID = 2674610176


class ReminderService:
    """Background service that checks for upcoming events and sends QQ notifications."""
    
    def __init__(self, app):
        """Initialize the reminder service.
        
        Args:
            app: The aiohttp application instance.
        """
        self.app = app
        self._task: Optional[asyncio.Task[Any]] = None
        self._running = False
        self._session: Optional[aiohttp.ClientSession] = None
    
    def start(self):
        """Start the background reminder checking task."""
        if self._running:
            return
        
        self._running = True
        self._task = asyncio.create_task(self._run())
        print("Reminder service started")
    
    async def stop(self):
        """Stop the background reminder checking task."""
        self._running = False
        
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        
        if self._session and not self._session.closed:
            await self._session.close()
        
        print("Reminder service stopped")
    
    async def _run(self):
        """Main loop that runs every 30 seconds to check for reminders."""
        self._session = aiohttp.ClientSession()
        
        while self._running:
            try:
                await self._check_reminders()
            except Exception as e:
                print(f"Error checking reminders: {e}")
            
            # Wait 30 seconds before next check
            await asyncio.sleep(30)
    
    async def _check_reminders(self):
        """Check for events that need reminders and send QQ notifications."""
        # Check if reminders are enabled globally
        enabled = await db.get_setting("qq_reminder_enabled")
        if enabled and enabled.lower() != "true":
            return
        
        now = datetime.now()
        
        # Query events where:
        # - reminder_enabled = 1
        # - status = 'pending'
        # - start_time is within reminder_minutes from now
        # - reminder_sent = 0
        
        async with aiosqlite.connect(db.DB_PATH) as db_conn:
            db_conn.row_factory = aiosqlite.Row
            async with db_conn.execute(
                """SELECT * FROM events 
                   WHERE reminder_enabled = 1 
                   AND status = 'pending' 
                   AND reminder_sent = 0 
                   AND start_time IS NOT NULL""",
            ) as cursor:
                rows = await cursor.fetchall()
            
            for row in rows:
                start_time = datetime.fromisoformat(row["start_time"])
                reminder_minutes = row["reminder_minutes"] if "reminder_minutes" in row.keys() else 1
                
                # Check if event is within reminder window
                time_until_event = start_time - now
                minutes_until_event = time_until_event.total_seconds() / 60
                
                if 0 < minutes_until_event <= reminder_minutes:
                    # Send QQ notification
                    await send_notification(row["title"], start_time)
                    
                    # Mark reminder as sent
                    await db_conn.execute(
                        "UPDATE events SET reminder_sent = 1 WHERE id = ?",
                        (row["id"],)
                    )
                    await db_conn.commit()


async def send_notification(title: str, start_time: datetime):
    """Send QQ notification for an event.
    
    Args:
        title: Event title.
        start_time: Event start time.
    """
    # Format the start time for display
    start_time_formatted = start_time.strftime("%Y-%m-%d %H:%M")
    
    message = f"⏰ 提醒: {title}\n{start_time_formatted}"
    
    payload = {
        "message_type": "private",
        "user_id": QQ_USER_ID,
        "message": [
            {
                "type": "text",
                "data": {
                    "text": message
                }
            }
        ],
    }
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(QQ_API_URL, json=payload) as response:
                if response.status == 200:
                    print(f"QQ notification sent for event: {title}")
                else:
                    print(f"Failed to send QQ notification: {response.status}")
    except Exception as e:
        print(f"Error sending QQ notification: {e}")
