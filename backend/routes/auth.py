"""Auth routes for login, logout, password setup and changes."""
import os
import time
from aiohttp import web

from .response import json_response, error_response
from ..db import auth as auth_db

# Login lockout state (module-level, in-memory)
_LOCKOUT_UNTIL: float = 0.0          # monotonic timestamp, 0 = not locked
_FAILURE_COUNT: int = 0             # consecutive wrong-password attempts

# Configurable via environment variable
LOCKOUT_SECONDS = int(os.environ.get("LOCKOUT_SECONDS", "30"))
MAX_FAILURES = 3


def _check_lockout() -> tuple[bool, int]:
    """Return (is_locked, remaining_seconds)."""
    global _LOCKOUT_UNTIL, _FAILURE_COUNT
    if _LOCKOUT_UNTIL <= 0:
        return False, 0
    remaining = _LOCKOUT_UNTIL - time.monotonic()
    if remaining <= 0:
        _LOCKOUT_UNTIL = 0.0
        _FAILURE_COUNT = 0
        return False, 0
    return True, int(remaining)


def _record_failure():
    """Record a wrong password attempt. Triggers lockout on MAX_FAILURES."""
    global _LOCKOUT_UNTIL, _FAILURE_COUNT
    _FAILURE_COUNT += 1
    if _FAILURE_COUNT >= MAX_FAILURES:
        _LOCKOUT_UNTIL = time.monotonic() + LOCKOUT_SECONDS


def _reset_lockout():
    """Reset on successful login."""
    global _LOCKOUT_UNTIL, _FAILURE_COUNT
    _LOCKOUT_UNTIL = 0.0
    _FAILURE_COUNT = 0


def register_routes(app: web.Application) -> None:
    """Register auth routes."""
    app.router.add_post("/api/auth/status", handle_status)
    app.router.add_get("/api/auth/status", handle_status)
    app.router.add_post("/api/auth/setup", handle_setup)
    app.router.add_post("/api/auth/login", handle_login)
    app.router.add_post("/api/auth/logout", handle_logout)
    app.router.add_put("/api/auth/password", handle_password_change)


async def _get_token_from_request(request: web.Request) -> str | None:
    """Extract Bearer token from Authorization header."""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[7:]
    return None


async def handle_status(request: web.Request) -> web.Response:
    """GET/POST /api/auth/status — check if setup is needed and if currently authenticated."""
    auth_record = await auth_db.get_auth()
    needs_setup = auth_record is None

    if needs_setup:
        return json_response({"needs_setup": True, "authenticated": False})

    # Check if current request has a valid token
    token = await _get_token_from_request(request)
    fingerprint = request.headers.get("X-Device-Fingerprint", "")

    if not token or not fingerprint:
        return json_response({"needs_setup": False, "authenticated": False})

    authenticated = await auth_db.verify_token(token, fingerprint)
    return json_response({"needs_setup": False, "authenticated": authenticated})


async def handle_setup(request: web.Request) -> web.Response:
    """POST /api/auth/setup — set initial password (only when no auth exists)."""
    try:
        data = await request.json()
    except Exception:
        return error_response("无效的请求体", 400)

    password = data.get("password", "").strip()
    if len(password) < 6:
        return error_response("密码至少需要 6 位", 400)

    auth_record = await auth_db.get_auth()
    if auth_record is not None:
        return error_response("密码已设置，请使用登录接口", 400)

    await auth_db.create_auth(password)
    return json_response({"needs_setup": False})


async def handle_login(request: web.Request) -> web.Response:
    """POST /api/auth/login — authenticate and return token."""
    try:
        data = await request.json()
    except Exception:
        return error_response("无效的请求体", 400)

    password = data.get("password", "").strip()
    fingerprint = data.get("fingerprint", "").strip()

    if not password:
        return error_response("密码不能为空", 400)

    # Check lockout before any password verification
    locked, remaining = _check_lockout()
    if locked:
        return error_response(f"尝试次数过多，请 {remaining} 秒后重试", 429)

    auth_record = await auth_db.get_auth()
    if auth_record is None:
        return error_response("请先设置密码", 401)

    # Verify password
    if not auth_db.verify_password(password, auth_record["password_hash"]):
        _record_failure()
        locked_now, remaining_now = _check_lockout()
        if locked_now:
            return error_response(f"密码错误次数过多，请 {remaining_now} 秒后重试", 429)
        return error_response("密码错误", 401)

    if not fingerprint:
        return error_response("设备指纹不能为空", 400)

    # Login success — reset lockout and create token
    _reset_lockout()
    token, expires_at = await auth_db.create_token(fingerprint)
    from datetime import datetime
    expires_in = int((expires_at - datetime.now()).total_seconds())

    return json_response({
        "token": token,
        "expires_in": expires_in,
    })


async def handle_logout(request: web.Request) -> web.Response:
    """POST /api/auth/logout — delete the current token."""
    token = await _get_token_from_request(request)
    if token:
        await auth_db.delete_token(token)
    return json_response({"success": True})


async def handle_password_change(request: web.Request) -> web.Response:
    """PUT /api/auth/password — change password, invalidate other sessions."""
    try:
        data = await request.json()
    except Exception:
        return error_response("无效的请求体", 400)

    old_password = data.get("old_password", "").strip()
    new_password = data.get("new_password", "").strip()

    if not old_password or not new_password:
        return error_response("旧密码和新密码都不能为空", 400)

    if len(new_password) < 6:
        return error_response("新密码至少需要 6 位", 400)

    auth_record = await auth_db.get_auth()
    if auth_record is None:
        return error_response("请先设置密码", 400)

    if not auth_db.verify_password(old_password, auth_record["password_hash"]):
        return error_response("旧密码错误", 401)

    # Update password
    await auth_db.update_auth_password(new_password)

    # Delete all tokens except the current one (keep current session valid)
    token = await _get_token_from_request(request)
    if token:
        deleted = await auth_db.delete_all_tokens_except(token)

    return json_response({"success": True})
