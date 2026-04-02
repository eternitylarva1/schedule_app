"""aiohttp server entry point."""
import asyncio
import logging
from pathlib import Path

from aiohttp import web
import aiohttp_cors

from . import db
from .routes import setup_routes
from .reminder_service import ReminderService


PROJECT_ROOT = Path(__file__).parent.parent
FRONTEND_DIR = PROJECT_ROOT / "frontend"

# Enable logging to see requests
logging.basicConfig(level=logging.INFO)


async def index(request: web.Request) -> web.StreamResponse:
    """Serve index.html for root path."""
    index_path = FRONTEND_DIR / "index.html"
    if index_path.exists():
        return web.FileResponse(FRONTEND_DIR / "index.html")
    return web.json_response({"message": "Schedule App API"}, status=200)


@web.middleware
async def log_middleware(request, handler):
    """Log all requests."""
    logging.info(f"Request: {request.method} {request.path}")
    try:
        response = await handler(request)
        logging.info(f"Response: {response.status}")
        return response
    except Exception as e:
        logging.error(f"Error: {e}")
        raise


async def init_app() -> web.Application:
    """Initialize the aiohttp application."""
    # Initialize database
    await db.init_db()

    app = web.Application()

    # Add logging middleware
    app.middlewares.append(log_middleware)

    # Setup API routes
    setup_routes(app)

    # Register reminder service lifecycle hooks (must run on web.run_app event loop)
    app["reminder_service"] = ReminderService(app)

    async def _on_startup(_: web.Application) -> None:
        app["reminder_service"].start()

    async def _on_cleanup(_: web.Application) -> None:
        await app["reminder_service"].stop()

    app.on_startup.append(_on_startup)
    app.on_cleanup.append(_on_cleanup)

    # Serve static files from frontend directory
    if FRONTEND_DIR.exists():
        app.router.add_static("/static/", FRONTEND_DIR / "static", show_index=True)
        app.router.add_get("/", index)
        app.router.add_get("/{path:.*}", index)

    # CORS setup
    cors = aiohttp_cors.setup(app, defaults={
        "*": aiohttp_cors.ResourceOptions(
            allow_credentials=True,
            expose_headers="*",
            allow_headers="*",
            allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        )
    })

    # Add CORS to ALL routes - make a copy of the list first
    resources = list(app.router.resources())
    for resource in resources:
        try:
            for route in list(resource):
                cors.add(route)
        except RuntimeError:
            # Skip if dictionary changed during iteration
            pass

    return app


def main():
    """Run the server."""
    app = asyncio.run(init_app())
    web.run_app(app, host="0.0.0.0", port=8080)


if __name__ == "__main__":
    main()
