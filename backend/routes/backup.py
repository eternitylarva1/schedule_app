"""Backup HTTP endpoints."""
from aiohttp import web
from typing import Any
from .. import db
from ._helpers import json_response, error_response


# ============= Backup Handlers =============

"""GET /api/backup/export - export backup."""
async def export_backup(request: web.Request) -> web.Response:
    """GET /api/backup/export - export all data as JSON for backup."""
    try:
        data = await db.export_all_data()
        return web.json_response({
            "code": 0,
            "data": data,
            "message": "导出成功"
        })
    except Exception as e:
        return error_response(f"导出失败: {str(e)}")




"""POST /api/backup/import - import backup."""
async def import_backup(request: web.Request) -> web.Response:
    """POST /api/backup/import - import data from JSON backup."""
    try:
        body = await request.json()
        clear = body.get("clear", False)
        data = body.get("data")
        if not data:
            return error_response("缺少 data 字段")
        result = await db.import_all_data(data, clear=clear)
        return json_response({
            "code": 0,
            "data": result,
            "message": "导入成功"
        })
    except ValueError as e:
        return error_response(str(e))
    except Exception as e:
        return error_response(f"导入失败: {str(e)}")


# ============================================
# Notes API
# ============================================




# ============= Route Registration =============

def register_routes(app: web.Application) -> None:
    app.router.add_get("/api/backup/export", export_backup)
    app.router.add_post("/api/backup/import", import_backup)
