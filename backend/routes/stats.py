"""Stats HTTP endpoints."""
from aiohttp import web
from typing import Any
from .. import db
from ._helpers import json_response, error_response


# ============= Stats Handlers =============

"""GET /api/stats - get statistics."""
async def get_stats(request: web.Request) -> web.Response:
    """GET /api/stats?date=today - get statistics."""
    date_filter = request.query.get("date", "today")
    valid_filters = {"today", "week", "month"}
    if date_filter not in valid_filters:
        date_filter = "today"

    try:
        stats = await db.get_stats(date_filter)
        return json_response(stats)
    except Exception as e:
        return error_response(f"获取统计失败: {str(e)}")




# ============= Route Registration =============

def register_routes(app: web.Application) -> None:
    app.router.add_get("/api/stats", get_stats)
