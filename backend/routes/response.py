"""Standard JSON response helpers."""
from aiohttp import web
from typing import Any


def json_response(data: Any, code: int = 0) -> web.Response:
    """Create JSON response with standard format."""
    return web.json_response({
        "code": code,
        "data": data,
    })


def error_response(message: str, code: int = 1) -> web.Response:
    """Create error JSON response."""
    return web.json_response({
        "code": code,
        "message": message,
    })


def _sanitize_ai_provider(provider: dict) -> dict:
    """Hide sensitive api_key when returning provider payload."""
    safe = dict(provider)
    raw_key = (safe.get("api_key") or "").strip()
    safe["has_api_key"] = bool(raw_key)
    safe["api_key"] = f"{raw_key[:3]}-****" if raw_key else ""
    return safe
