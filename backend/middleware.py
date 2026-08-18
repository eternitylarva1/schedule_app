"""Auth middleware for protecting API routes."""
import hashlib
import os

from aiohttp import web

from .routes.response import error_response
from .db import auth as auth_db


AUTH_DISABLED = os.environ.get("AUTH_DISABLED", "").strip().lower() in ("1", "true", "yes")


@web.middleware
async def auth_middleware(request: web.Request, handler):
    """Middleware that protects /api/* routes with Bearer token + fingerprint."""
    # Allow bypass via environment variable (keeps pytest tests working)
    if AUTH_DISABLED:
        return await handler(request)

    # Allow CORS preflight (OPTIONS) without auth
    if request.method == "OPTIONS":
        return await handler(request)

    path = request.path

    # Allow all auth routes without authentication
    if path.startswith("/api/auth"):
        return await handler(request)

    # Only protect /api/* routes
    if not path.startswith("/api"):
        return await handler(request)

    # Extract Bearer token
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return error_response("未登录或登录已过期", 401)

    token = auth_header[7:]  # strip "Bearer "
    if not token:
        return error_response("未登录或登录已过期", 401)

    # Extract fingerprint header
    fingerprint = request.headers.get("X-Device-Fingerprint", "")
    if not fingerprint:
        return error_response("未登录或登录已过期", 401)

    # Verify token + fingerprint
    valid = await auth_db.verify_token(token, fingerprint)
    if not valid:
        return error_response("未登录或登录已过期", 401)

    return await handler(request)
