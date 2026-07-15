"""Budget HTTP endpoints."""
from aiohttp import web
from typing import Any
from .. import db
from ..models import Budget
from ._helpers import json_response, error_response


# ============= Budget Handlers =============

"""GET /api/budgets - list budgets."""
async def get_budgets(request: web.Request) -> web.Response:
    """GET /api/budgets - list all budgets with spent/remaining stats."""
    try:
        budgets = await db.get_budgets_with_stats()
        return json_response(budgets)
    except Exception as e:
        return error_response(f"获取预算失败: {str(e)}")




"""GET /api/budgets/{id} - get budget."""
async def get_budget(request: web.Request) -> web.Response:
    """GET /api/budgets/{id} - get a single budget with spent/remaining stats."""
    budget_id = int(request.match_info["id"])
    try:
        budget_with_stats = await db.get_budget_with_stats(budget_id)
        if budget_with_stats is None:
            return error_response("预算不存在", code=404)
        return json_response(budget_with_stats)
    except Exception as e:
        return error_response(f"获取预算失败: {str(e)}")




"""POST /api/budgets - create budget."""
async def create_budget(request: web.Request) -> web.Response:
    """POST /api/budgets - create a new budget."""
    try:
        body_bytes = await request.read()
        try:
            body_str = body_bytes.decode('utf-8')
        except UnicodeDecodeError:
            body_str = body_bytes.decode('gbk', errors='replace')
        data = json.loads(body_str)
    except Exception:
        return error_response("无效的JSON数据")

    try:
        # Parse period_start if provided
        period_start = None
        if data.get("period_start"):
            from datetime import datetime
            period_start = datetime.fromisoformat(data.get("period_start").replace("Z", "+00:00"))
        
        budget = Budget(
            name=(data.get("name", "") or "").strip(),
            amount=float(data.get("amount", 0)),
            color=data.get("color", "#3B82F6"),
            period=data.get("period", "none"),
            auto_reset=bool(data.get("auto_reset", False)),
            rollover=bool(data.get("rollover", False)),
            rollover_limit=data.get("rollover_limit"),
            period_start=period_start,
            is_test=bool(data.get("is_test", False)),
        )
        if not budget.name:
            return error_response("预算名称不能为空")
        if budget.amount <= 0:
            return error_response("预算金额必须大于0")
        created = await db.create_budget(budget)
        return json_response(created.to_dict())
    except Exception as e:
        return error_response(f"创建预算失败: {str(e)}")




"""PUT /api/budgets/{id} - update budget."""
async def update_budget(request: web.Request) -> web.Response:
    """PUT /api/budgets/{id} - update a budget."""
    budget_id = int(request.match_info["id"])
    try:
        body_bytes = await request.read()
        try:
            body_str = body_bytes.decode('utf-8')
        except UnicodeDecodeError:
            body_str = body_bytes.decode('gbk', errors='replace')
        data = json.loads(body_str)
    except Exception:
        return error_response("无效的JSON数据")

    try:
        existing = await db.get_budget(budget_id)
        if not existing:
            return error_response("预算不存在", code=404)
        
        # Parse period_start if provided
        period_start = existing.period_start
        if "period_start" in data and data.get("period_start"):
            from datetime import datetime
            period_start = datetime.fromisoformat(data.get("period_start").replace("Z", "+00:00"))
        
        budget = Budget(
            name=(data.get("name", existing.name) or "").strip(),
            amount=float(data.get("amount", existing.amount)),
            color=data.get("color", existing.color),
            period=data.get("period", existing.period),
            auto_reset=bool(data.get("auto_reset", existing.auto_reset)),
            rollover=bool(data.get("rollover", existing.rollover)),
            rollover_limit=data.get("rollover_limit") if "rollover_limit" in data else existing.rollover_limit,
            rollover_amount=data.get("rollover_amount", existing.rollover_amount),
            period_start=period_start,
        )
        if not budget.name:
            return error_response("预算名称不能为空")
        if budget.amount <= 0:
            return error_response("预算金额必须大于0")
        updated = await db.update_budget(budget_id, budget)
        return json_response(updated.to_dict())
    except Exception as e:
        return error_response(f"更新预算失败: {str(e)}")




"""DELETE /api/budgets/{id} - delete budget."""
async def delete_budget(request: web.Request) -> web.Response:
    """DELETE /api/budgets/{id} - delete a budget."""
    budget_id = int(request.match_info["id"])
    try:
        success = await db.delete_budget(budget_id)
        if success:
            return json_response({"deleted": True})
        return error_response("预算不存在", code=404)
    except Exception as e:
        return error_response(f"删除预算失败: {str(e)}")




"""GET /api/budgets/{id}/expenses - get budget expenses."""
async def get_budget_expenses(request: web.Request) -> web.Response:
    """GET /api/budgets/{id}/expenses - get expenses for a specific budget."""
    budget_id = int(request.match_info["id"])
    try:
        budget = await db.get_budget(budget_id)
        if not budget:
            return error_response("预算不存在", code=404)
        expenses = await db.get_expenses_by_budget(budget_id)
        return json_response([e.to_dict() for e in expenses])
    except Exception as e:
        return error_response(f"获取预算支出失败: {str(e)}")


# ============================================
# Budget Templates API
# ============================================



"""GET /api/budget-templates - list budget templates."""
async def get_budget_templates(request: web.Request) -> web.Response:
    """GET /api/budget-templates - list all budget templates."""
    try:
        templates = await db.get_budget_templates()
        return json_response([t.to_dict() for t in templates])
    except Exception as e:
        return error_response(f"获取预算模板失败: {str(e)}")




"""POST /api/budget-templates - create budget template."""
async def create_budget_template(request: web.Request) -> web.Response:
    """POST /api/budget-templates - create a new budget template."""
    try:
        data = await request.json()
    except json.JSONDecodeError:
        return error_response("无效的JSON数据")
    
    try:
        template = db.BudgetTemplate(
            name=(data.get("name", "") or "").strip(),
            amount=float(data.get("amount", 0)),
            color=data.get("color", "#3B82F6"),
            period=data.get("period", "none"),
            auto_reset=bool(data.get("auto_reset", False)),
            rollover=bool(data.get("rollover", False)),
            rollover_limit=data.get("rollover_limit"),
        )
        if not template.name:
            return error_response("模板名称不能为空")
        if template.amount <= 0:
            return error_response("模板金额必须大于0")
        created = await db.create_budget_template(template)
        return json_response(created.to_dict())
    except Exception as e:
        return error_response(f"创建预算模板失败: {str(e)}")




"""DELETE /api/budget-templates/{id} - delete budget template."""
async def delete_budget_template(request: web.Request) -> web.Response:
    """DELETE /api/budget-templates/{id} - delete a budget template."""
    template_id = int(request.match_info["id"])
    try:
        success = await db.delete_budget_template(template_id)
        if success:
            return json_response({"deleted": True})
        return error_response("模板不存在", code=404)
    except Exception as e:
        return error_response(f"删除预算模板失败: {str(e)}")


# ============================================
# Backup / Export / Import API
# ============================================




# ============= Route Registration =============

def register_routes(app: web.Application) -> None:
    app.router.add_get("/api/budgets", get_budgets)
    app.router.add_post("/api/budgets", create_budget)
    app.router.add_get("/api/budgets/{id}", get_budget)
    app.router.add_put("/api/budgets/{id}", update_budget)
    app.router.add_delete("/api/budgets/{id}", delete_budget)
    app.router.add_get("/api/budgets/{id}/expenses", get_budget_expenses)
    app.router.add_get("/api/budget-templates", get_budget_templates)
    app.router.add_post("/api/budget-templates", create_budget_template)
    app.router.add_delete("/api/budget-templates/{id}", delete_budget_template)
