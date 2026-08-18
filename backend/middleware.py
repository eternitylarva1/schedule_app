"""Auth middleware for protecting API routes."""
import os

from aiohttp import web

from .routes.response import error_response
from .db import auth as auth_db
from .db.settings import get_api_key


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
    token_valid = False
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        if token:
            fingerprint = request.headers.get("X-Device-Fingerprint", "")
            if fingerprint:
                token_valid = await auth_db.verify_token(token, fingerprint)

    # Special case for /api/images/{id} GET: allow token+fp from query params
    # (browser <img> tags can't send custom headers)
    if not token_valid and request.method == "GET" and path.startswith("/api/images/"):
        query_token = request.query.get("token", "").strip()
        query_fp = request.query.get("fp", "").strip()
        if query_token and query_fp:
            token_valid = await auth_db.verify_token(query_token, query_fp)

    if not token_valid:
        # Fallback: check static API key from X-API-Key header
        api_key = request.headers.get("X-API-Key", "").strip()
        if api_key:
            stored_key = await get_api_key()
            if stored_key and api_key == stored_key:
                return await handler(request)
        return error_response("未登录或登录已过期", 401)

    return await handler(request)
