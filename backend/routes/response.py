"""Standard JSON response helpers."""
from aiohttp import web
from typing import Any


def json_response(data: Any, code: int = 0) -> web.Response:
    """Create JSON response with standard format."""
    return web.json_response({
        "code": code,
        "data": data,
    })


def error_response(message: str, code: int = 400, error_type: str = None, details: dict = None) -> web.Response:
    """Create error JSON response with optional structured error fields."""
    body = {"code": code, "message": message}
    if error_type:
        body["error_type"] = error_type
    if details:
        body["details"] = details
    status = code if 100 <= code < 600 else 400
    return web.json_response(body, status=status)


def _sanitize_ai_provider(provider: dict) -> dict:
    """Hide sensitive api_key when returning provider payload."""
    safe = dict(provider)
    raw_key = (safe.get("api_key") or "").strip()
    safe["has_api_key"] = bool(raw_key)
    safe["api_key"] = f"{raw_key[:3]}-****" if raw_key else ""
    return safe
