"""Backup HTTP endpoints."""
from aiohttp import web
from typing import Any
from .. import db
from ..db.backup_manager import list_backups, create_backup, restore_backup, delete_backup, get_backup_config
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


# ============= Auto-Backup Management =============

async def list_backup_files(request: web.Request) -> web.Response:
    """GET /api/backup/list - list all backup files."""
    try:
        backups = await list_backups()
        return json_response(backups)
    except Exception as e:
        return error_response(f"获取备份列表失败: {str(e)}")

async def create_backup_now(request: web.Request) -> web.Response:
    """POST /api/backup/create - create a backup now."""
    try:
        result = await create_backup()
        return web.json_response({
            "code": 0,
            "data": result,
            "message": "备份已创建"
        })
    except Exception as e:
        return error_response(f"创建备份失败: {str(e)}")

async def restore_backup_file(request: web.Request) -> web.Response:
    """POST /api/backup/restore - restore from a backup file."""
    try:
        body = await request.json()
        filename = body.get("filename", "")
        if not filename:
            return error_response("缺少 filename 参数")
        result = await restore_backup(filename)
        return web.json_response({
            "code": 0,
            "data": result,
            "message": "正在从备份恢复，请重启服务"
        })
    except FileNotFoundError as e:
        return error_response(str(e))
    except Exception as e:
        return error_response(f"恢复失败: {str(e)}")

async def delete_backup_file(request: web.Request) -> web.Response:
    """POST /api/backup/delete - delete a backup file."""
    try:
        body = await request.json()
        filename = body.get("filename", "")
        if not filename:
            return error_response("缺少 filename 参数")
        result = await delete_backup(filename)
        return json_response(result)
    except FileNotFoundError as e:
        return error_response(str(e))
    except Exception as e:
        return error_response(f"删除失败: {str(e)}")

async def get_backup_config_endpoint(request: web.Request) -> web.Response:
    """GET /api/backup/config - get backup settings."""
    try:
        config = await get_backup_config()
        return json_response(config)
    except Exception as e:
        return error_response(str(e))


# ============================================
# Notes API
# ============================================




# ============= Route Registration =============

def register_routes(app: web.Application) -> None:
    app.router.add_get("/api/backup/export", export_backup)
    app.router.add_post("/api/backup/import", import_backup)
    app.router.add_get("/api/backup/list", list_backup_files)
    app.router.add_post("/api/backup/create", create_backup_now)
    app.router.add_post("/api/backup/restore", restore_backup_file)
    app.router.add_post("/api/backup/delete", delete_backup_file)
    app.router.add_get("/api/backup/config", get_backup_config_endpoint)
