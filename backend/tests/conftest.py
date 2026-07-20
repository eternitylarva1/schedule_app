import pytest
import asyncio
import sys
import os

# Add parent dir to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


@pytest.fixture(scope="session")
def event_loop():
    """Create an event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
async def db():
    """In-memory SQLite database for testing."""
    import aiosqlite
    db = await aiosqlite.connect(':memory:')
    db.row_factory = aiosqlite.Row

    # Create minimal schema for testing
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
            updated_at TEXT,
            reminder_enabled INTEGER DEFAULT 0,
            reminder_minutes INTEGER DEFAULT 1,
            reminder_sent INTEGER DEFAULT 0,
            priority TEXT DEFAULT 'none',
            is_test INTEGER DEFAULT 0,
            goal_id INTEGER,
            completed_at TEXT
        )
    """)
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
    await db.commit()

    yield db

    await db.close()


@pytest.fixture
async def app(db):
    """Minimal aiohttp app for testing routes."""
    from aiohttp import web

    async def get_db(request):
        request['db'] = db
        return db

    app = web.Application()
    app['db'] = db
    app.router.add_get('/api/test-db', get_db)
    return app


@pytest.fixture
async def client(app, aiohttp_client):
    return await aiohttp_client(app)
