"""aiohttp server entry point."""
import asyncio
import logging
from pathlib import Path

from aiohttp import web
import aiohttp_cors

from . import db
from .routes import setup_routes
from .reminder_service import ReminderService
from .llm_service import llm_service


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


async def service_worker(request: web.Request) -> web.StreamResponse:
    """Serve service-worker.js from frontend root with no-cache headers."""
    sw_path = FRONTEND_DIR / "service-worker.js"
    if not sw_path.exists():
        raise web.HTTPNotFound()
    response = web.FileResponse(sw_path)
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


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

    # Initialize default AI provider from environment variables if none exists
    providers = await db.get_ai_providers()
    if len(providers) == 0:
        # Create default provider from environment variables (if configured)
        import os
        default_api_key = (os.getenv("LLM_API_KEY") or "").strip()
        if default_api_key:
            default_name = "默认 (env)"
            default_api_base = os.getenv("LLM_API_BASE", "https://open.cherryin.net/v1")
            default_model = os.getenv("LLM_MODEL", "minimax/minimax-m2.5-highspeed")

            provider = await db.create_ai_provider(
                name=default_name,
                api_base=default_api_base,
                model=default_model,
                api_key=default_api_key
            )
            await db.activate_ai_provider(provider["id"])

    app = web.Application()
    
    # Set LLM service database path for runtime configuration
    llm_service.set_db_path(str(db.DB_PATH))

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
        # Add index for root - but NOT a catch-all to avoid intercepting /api/*
        app.router.add_get("/", index)
        app.router.add_get("/service-worker.js", service_worker)

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
