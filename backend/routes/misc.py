"""Misc HTTP endpoints (cleanup, errors, test, search)."""
from aiohttp import web
from typing import Any
from .. import db
from ._helpers import json_response, error_response


# ============= Misc Handlers =============

"""GET /api/search?q=keyword - global search across events, notes, goals."""
async def global_search(request: web.Request) -> web.Response:
    """GET /api/search?q=keyword - search events, notes, goals."""
    q = request.query.get("q", "").strip()
    if not q:
        return json_response({"events": [], "notes": [], "goals": []})

    try:
        events = await db.search_events(q)
        notes = await db.search_notes(q)
        goals = await db.search_goals(q)
        return json_response({
            "events": [e.to_dict() for e in events],
            "notes": [n.to_dict() for n in notes],
            "goals": [g.to_dict() for g in goals],
        })
    except Exception as e:
        return error_response(f"搜索失败: {str(e)}")


"""POST /api/settings/cleanup_test_entries - cleanup test entries."""
async def cleanup_test_entries(request: web.Request) -> web.Response:
    """POST /api/settings/cleanup_test_entries - cleanup test/demo/debug data."""
    try:
        result = await db.cleanup_test_entries()
        return json_response(result)
    except Exception as e:
        return error_response(f"清理测试条目失败: {str(e)}")




"""POST /api/errors/log - log error."""
async def log_error(request: web.Request) -> web.Response:
    """POST /api/errors/log - log a client-side error."""
    try:
        body_bytes = await request.read()
        try:
            body = json.loads(body_bytes.decode()) if body_bytes else {}
        except (ValueError, UnicodeDecodeError):
            return error_response("无效的 JSON")
        
        error_log = ErrorLog(
            message=body.get("message", ""),
            stack=body.get("stack", ""),
            source=body.get("source", ""),
            user_agent=body.get("user_agent", ""),
            url=body.get("url", ""),
        )
        result = await db.create_error_log(error_log)
        
        # Send QQ notification for errors
        try:
            import sys
            sys.path.insert(0, '/home/gaoming/AI_Planner')
            from send_message import send_private_message
            msg = f"[计划助手错误报告]\n来源: {error_log.source}\n页面: {error_log.url}\n错误: {error_log.message}"
            if error_log.stack:
                msg += f"\n堆栈: {error_log.stack[:200]}"
            send_private_message(user_id=2674610176, message=msg)
        except Exception:
            pass  # Don't fail if QQ notification fails
        
        return json_response(result.to_dict())
    except Exception as e:
        return error_response(f"记录错误失败: {str(e)}")




"""GET /api/errors - get error logs."""
async def get_error_logs(request: web.Request) -> web.Response:
    """GET /api/errors - get recent error logs."""
    try:
        limit = int(request.query.get("limit", 50))
        offset = int(request.query.get("offset", 0))
        logs = await db.get_error_logs(limit=limit, offset=offset)
        return json_response([log.to_dict() for log in logs])
    except Exception as e:
        return error_response(f"获取错误日志失败: {str(e)}")




"""DELETE /api/errors - delete error logs."""
async def delete_error_logs(request: web.Request) -> web.Response:
    """DELETE /api/errors - delete error logs by IDs."""
    try:
        body_bytes = await request.read()
        body = json.loads(body_bytes.decode()) if body_bytes else {}
        ids = body.get("ids", [])
        if not isinstance(ids, list):
            return error_response("ids must be an array")
        count = await db.delete_error_logs(ids)
        return json_response({"deleted": count})
    except Exception as e:
        return error_response(f"删除错误日志失败: {str(e)}")




"""POST /api/test-qq-channel - test QQ channel."""
async def test_qq_channel(request: web.Request) -> web.Response:
    """POST /api/test-qq-channel - send test message to QQ to verify channel."""
    try:
        import sys
        sys.path.insert(0, '/home/gaoming/AI_Planner')
        from send_message import send_private_message
        
        result = send_private_message(
            user_id=2674610176,
            message='[计划助手] 这是一条测试消息，验证 QQ 信道是否通畅。'
        )
        
        if result and result.get('status') == 'ok':
            return json_response({"code": 0, "message": "测试消息已发送"})
        else:
            return json_response({"code": -1, "message": result.get('message', '发送失败')})
    except Exception as e:
        return json_response({"code": -1, "message": str(e)})


"""GET /api/search - search across events, notes, and goals."""
async def search_handler(request: web.Request) -> web.Response:
    """GET /api/search?q=keyword - search events, notes, goals."""
    try:
        keyword = request.query.get("q", "").strip()
        if not keyword:
            return json_response({"events": [], "notes": [], "goals": []})
        
        keyword_like = f"%{keyword}%"
        
        async with aiosqlite.connect(DB_PATH) as db:
            db.row_factory = aiosqlite.Row
            
            # Search events (title模糊匹配)
            async with db.execute(
                """SELECT id, title, start_time, category_id FROM events
                   WHERE title LIKE ? COLLATE NOCASE
                   ORDER BY start_time DESC LIMIT 10""",
                (keyword_like,),
            ) as cursor:
                event_rows = await cursor.fetchall()
            events = [
                {"id": row["id"], "title": row["title"], "start_time": row["start_time"], "category_id": row["category_id"]}
                for row in event_rows
            ]
            
            # Search notes (title + content模糊匹配)
            async with db.execute(
                """SELECT id, title, content FROM notes
                   WHERE title LIKE ? COLLATE NOCASE OR content LIKE ? COLLATE NOCASE
                   ORDER BY updated_at DESC LIMIT 10""",
                (keyword_like, keyword_like),
            ) as cursor:
                note_rows = await cursor.fetchall()
            notes = [
                {"id": row["id"], "title": row["title"], "content_preview": (row["content"] or "")[:100]}
                for row in note_rows
            ]
            
            # Search goals (title模糊匹配)
            async with db.execute(
                """SELECT id, title, horizon FROM goals
                   WHERE title LIKE ? COLLATE NOCASE
                   ORDER BY created_at DESC LIMIT 10""",
                (keyword_like,),
            ) as cursor:
                goal_rows = await cursor.fetchall()
            goals = [
                {"id": row["id"], "title": row["title"], "horizon": row["horizon"]}
                for row in goal_rows
            ]
        
        return json_response({"events": events, "notes": notes, "goals": goals})
    except Exception as e:
        return error_response(f"搜索失败: {str(e)}")







# ============= Route Registration =============

def register_routes(app: web.Application) -> None:
    app.router.add_get("/api/search", search_handler)
    app.router.add_post("/api/settings/cleanup_test_entries", cleanup_test_entries)
    app.router.add_post("/api/test-qq-channel", test_qq_channel)
    app.router.add_post("/api/errors/log", log_error)
    app.router.add_get("/api/errors", get_error_logs)
    app.router.add_delete("/api/errors", delete_error_logs)
