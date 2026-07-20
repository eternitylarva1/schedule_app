"""Categories HTTP endpoints."""
import json
from aiohttp import web
from .. import db
from ..db.categories import get_categories, create_category, update_category, delete_category
from ._helpers import json_response, error_response


async def get_all(request):
    """GET /api/categories - get all categories."""
    try:
        cats = await db.get_categories()
        return json_response(cats)
    except Exception as e:
        return error_response(f"获取分类失败: {str(e)}")


async def create(request):
    """POST /api/categories - create a new category."""
    try:
        data = await request.json()
    except json.JSONDecodeError:
        return error_response("无效的JSON数据")

    if not data.get('id'):
        return error_response("分类ID不能为空")
    if not data.get('name'):
        return error_response("分类名称不能为空")
    if not data.get('color'):
        return error_response("分类颜色不能为空")

    try:
        cat = await db.create_category(data)
        return json_response(cat)
    except Exception as e:
        return error_response(f"创建分类失败: {str(e)}")


async def update(request):
    """PUT /api/categories/{id} - update a category."""
    cat_id = request.match_info['id']

    try:
        data = await request.json()
    except json.JSONDecodeError:
        return error_response("无效的JSON数据")

    try:
        cat = await db.update_category(cat_id, data)
        if cat:
            return json_response(cat)
        else:
            return error_response("分类不存在", code=404)
    except Exception as e:
        return error_response(f"更新分类失败: {str(e)}")


async def delete(request):
    """DELETE /api/categories/{id} - delete a category."""
    cat_id = request.match_info['id']

    try:
        await db.delete_category(cat_id)
        return json_response({"deleted": True})
    except Exception as e:
        return error_response(f"删除分类失败: {str(e)}")


def register_routes(app: web.Application) -> None:
    """Register category routes."""
    app.router.add_get("/api/categories", get_all)
    app.router.add_post("/api/categories", create)
    app.router.add_put("/api/categories/{id}", update)
    app.router.add_delete("/api/categories/{id}", delete)
