"""Expense HTTP endpoints."""
from aiohttp import web
from typing import Any
from .. import db
from ._helpers import (
    json_response, error_response, _sanitize_ai_provider,
    _update_expense_stats, _handle_expense_operation,
)


# ============= Expense Handlers =============

"""GET /api/expenses - list expenses."""
async def get_expenses(request: web.Request) -> web.Response:
    """GET /api/expenses?date=month - list expenses."""
    date_filter = request.query.get("date", "month")
    try:
        expenses = await db.get_expenses(date_filter)
        return json_response([e.to_dict() for e in expenses])
    except Exception as e:
        return error_response(f"获取支出记录失败: {str(e)}")




"""POST /api/expenses - create expense."""
async def create_expense(request: web.Request) -> web.Response:
    """POST /api/expenses - create an expense."""
    try:
        body_bytes = await request.read()
        try:
            body_str = body_bytes.decode('utf-8')
        except UnicodeDecodeError:
            body_str = body_bytes.decode('gbk', errors='replace')
        data = json.loads(body_str)
    except Exception as e:
        return error_response("无效的JSON数据")

    try:
        expense = Expense(
            amount=float(data.get("amount", 0)),
            category=data.get("category", "other"),
            note=data.get("note", "").strip(),
            budget_id=data.get("budget_id"),
            is_test=bool(data.get("is_test", False)),
            expense_date=data.get("expense_date"),
        )
        if expense.amount <= 0:
            return error_response("金额必须大于0")
        
        # Get old_data before create (null for new)
        old_data = None
        
        created = await db.create_expense(expense)
        
        # Log the operation
        await db.log_operation(
            entity_type="expense",
            entity_id=created.id or 0,
            operation="create",
            old_data=old_data,
            new_data=created.to_dict(),
            field_changes=None,
            expense_date=created.expense_date,
        )
        
        return json_response(created.to_dict())
    except Exception as e:
        return error_response(f"创建支出记录失败: {str(e)}")




"""PUT /api/expenses/{id} - update expense."""
async def update_expense(request: web.Request) -> web.Response:
    """PUT /api/expenses/{id} - update an expense."""
    expense_id = int(request.match_info["id"])
    try:
        body_bytes = await request.read()
        try:
            body_str = body_bytes.decode('utf-8')
        except UnicodeDecodeError:
            body_str = body_bytes.decode('gbk', errors='replace')
        data = json.loads(body_str)
    except Exception as e:
        return error_response("无效的JSON数据")

    try:
        existing = await db.get_expense(expense_id)
        if not existing:
            return error_response("支出记录不存在", code=404)
        
        old_data = existing.to_dict()
        
        # Track field changes
        field_changes = []
        new_amount = float(data.get("amount", existing.amount))
        new_category = data.get("category", existing.category)
        new_note = data.get("note", existing.note).strip()
        new_is_test = data.get("is_test", existing.is_test)
        new_expense_date = data.get("expense_date", existing.expense_date)
        
        if new_amount != existing.amount:
            field_changes.append({"field": "amount", "old_value": str(existing.amount), "new_value": str(new_amount)})
        if new_category != existing.category:
            field_changes.append({"field": "category", "old_value": existing.category, "new_value": new_category})
        if new_note != existing.note:
            field_changes.append({"field": "note", "old_value": existing.note, "new_value": new_note})
        if new_is_test != existing.is_test:
            field_changes.append({"field": "is_test", "old_value": str(existing.is_test), "new_value": str(new_is_test)})
        
        expense = Expense(
            amount=new_amount,
            category=new_category,
            note=new_note,
            budget_id=data.get("budget_id", existing.budget_id),
            is_test=new_is_test,
            expense_date=new_expense_date,
        )
        updated = await db.update_expense(expense_id, expense)
        if not updated:
            return error_response("支出记录不存在", code=404)
        
        # Log the operation
        await db.log_operation(
            entity_type="expense",
            entity_id=expense_id,
            operation="update",
            old_data=old_data,
            new_data=updated.to_dict(),
            field_changes=field_changes if field_changes else None,
            expense_date=updated.expense_date,
        )
        
        return json_response(updated.to_dict())
    except Exception as e:
        return error_response(f"更新支出记录失败: {str(e)}")




"""DELETE /api/expenses/{id} - delete expense."""
async def delete_expense(request: web.Request) -> web.Response:
    """DELETE /api/expenses/{id} - delete an expense (soft delete for recovery)."""
    expense_id = int(request.match_info["id"])
    try:
        existing = await db.get_expense(expense_id)
        if not existing:
            return error_response("支出记录不存在", code=404)
        
        old_data = existing.to_dict()
        
        # Use soft delete for recoverability
        success = await db.soft_delete_expense(expense_id)
        
        if success:
            # Log the operation
            await db.log_operation(
                entity_type="expense",
                entity_id=expense_id,
                operation="delete",
                old_data=old_data,
                new_data=None,
                field_changes=None,
                expense_date=existing.expense_date,
            )
            return json_response({"deleted": True, "soft_delete": True})
        return error_response("支出记录不存在", code=404)
    except Exception as e:
        return error_response(f"删除支出记录失败: {str(e)}")


# ============ Expense Operation Logs & Deleted Expenses ============



"""GET /api/expense-operation-logs - get expense operation logs."""
async def get_expense_operation_logs(request: web.Request) -> web.Response:
    """GET /api/expense-operation-logs - list operation logs with filters."""
    operation = request.query.get("operation")
    start_date = request.query.get("start_date")
    end_date = request.query.get("end_date")
    search = request.query.get("search")
    limit = int(request.query.get("limit", 50))
    offset = int(request.query.get("offset", 0))
    
    try:
        logs = await db.get_operation_logs(
            entity_type="expense",
            operation=operation,
            start_date=start_date,
            end_date=end_date,
            search=search,
            limit=limit,
            offset=offset,
        )
        return json_response(logs)
    except Exception as e:
        return error_response(f"获取操作记录失败: {str(e)}")




"""GET /api/expense-operation-logs/{id} - get expense operation log detail."""
async def get_expense_operation_log_detail(request: web.Request) -> web.Response:
    """GET /api/expense-operation-logs/{id} - get single operation log detail."""
    log_id = int(request.match_info["id"])
    try:
        log = await db.get_operation_log(log_id)
        if not log:
            return error_response("操作记录不存在", code=404)
        return json_response(log)
    except Exception as e:
        return error_response(f"获取操作记录详情失败: {str(e)}")




"""POST /api/expense-operation-logs/{id}/undo - undo expense operation."""
async def undo_expense_operation_log(request: web.Request) -> web.Response:
    """POST /api/expense-operation-logs/{id}/undo - undo an expense operation."""
    log_id = int(request.match_info["id"])
    try:
        restored = await db.undo_expense_operation(log_id)
        if not restored:
            return error_response("无法撤销该操作（非更新操作或记录不存在）", code=400)
        
        # Log the restore operation
        await db.log_operation(
            entity_type="expense",
            entity_id=restored.id or 0,
            operation="restore",
            old_data=None,
            new_data=restored.to_dict(),
            field_changes=[{"field": "undo", "old_value": str(log_id), "new_value": "restored"}],
            expense_date=restored.expense_date,
        )
        
        return json_response(restored.to_dict())
    except Exception as e:
        return error_response(f"撤销操作失败: {str(e)}")




"""GET /api/deleted-expenses - get deleted expenses."""
async def get_deleted_expenses_list(request: web.Request) -> web.Response:
    """GET /api/deleted-expenses - list soft-deleted expenses."""
    try:
        deleted = await db.get_deleted_expenses()
        return json_response(deleted)
    except Exception as e:
        return error_response(f"获取已删除记录失败: {str(e)}")




"""POST /api/deleted-expenses/{id}/restore - restore deleted expense."""
async def restore_deleted_expense(request: web.Request) -> web.Response:
    """POST /api/deleted-expenses/{id}/restore - restore a soft-deleted expense."""
    deleted_id = int(request.match_info["id"])
    try:
        restored = await db.restore_expense(deleted_id)
        if not restored:
            return error_response("已删除记录不存在", code=404)
        
        # Log the restore operation
        await db.log_operation(
            entity_type="expense",
            entity_id=restored.id or 0,
            operation="restore",
            old_data=None,
            new_data=restored.to_dict(),
            field_changes=None,
            expense_date=restored.expense_date,
        )
        
        return json_response(restored.to_dict())
    except Exception as e:
        return error_response(f"恢复记录失败: {str(e)}")




"""GET /api/expenses/stats - get expense stats."""
async def get_expense_stats(request: web.Request) -> web.Response:
    """GET /api/expenses/stats?date=month - get expense statistics."""
    date_filter = request.query.get("date", "month")
    try:
        stats = await db.get_expense_stats(date_filter)
        return json_response(stats)
    except Exception as e:
        return error_response(f"获取支出统计失败: {str(e)}")




"""GET /api/expenses/categories - get expense categories."""
async def get_expense_categories(request: web.Request) -> web.Response:
    """GET /api/expenses/categories - list expense categories (merged default + custom)."""
    try:
        custom_cats = await db.get_expense_categories()
        merged = list(EXPENSE_CATEGORIES) + custom_cats
        return json_response(merged)
    except Exception as e:
        return error_response(f"获取分类失败: {str(e)}")




"""POST /api/expenses/categories - create expense category."""
async def create_expense_category(request: web.Request) -> web.Response:
    """POST /api/expenses/categories - create a new expense category."""
    try:
        data = await request.json()
        name = data.get("name", "").strip()
        color = data.get("color", "#6B7280")
        if not name:
            return error_response("分类名称不能为空")
        cat = await db.create_expense_category(name, color)
        return json_response(cat)
    except Exception as e:
        return error_response(f"创建分类失败: {str(e)}")




"""PUT /api/expenses/categories/{id} - update expense category."""
async def update_expense_category(request: web.Request) -> web.Response:
    """PUT /api/expenses/categories/{id} - update an expense category."""
    cat_id = int(request.match_info["id"])
    try:
        data = await request.json()
        name = data.get("name", "").strip()
        color = data.get("color", "#6B7280")
        if not name:
            return error_response("分类名称不能为空")
        cat = await db.update_expense_category(cat_id, name, color)
        if cat:
            return json_response(cat)
        return error_response("分类不存在", code=404)
    except Exception as e:
        return error_response(f"更新分类失败: {str(e)}")




"""DELETE /api/expenses/categories/{id} - delete expense category."""
async def delete_expense_category(request: web.Request) -> web.Response:
    """DELETE /api/expenses/categories/{id} - delete an expense category."""
    cat_id = int(request.match_info["id"])
    try:
        deleted = await db.delete_expense_category(cat_id)
        if deleted:
            return json_response({"success": True})
        return error_response("分类不存在", code=404)
    except Exception as e:
        return error_response(f"删除分类失败: {str(e)}")


# ============================================
# Budgets API
# ============================================




# ============= Route Registration =============

def register_routes(app: web.Application) -> None:
    app.router.add_get("/api/expenses", get_expenses)
    app.router.add_post("/api/expenses", create_expense)
    app.router.add_put("/api/expenses/{id}", update_expense)
    app.router.add_delete("/api/expenses/{id}", delete_expense)
    app.router.add_get("/api/expense-operation-logs", get_expense_operation_logs)
    app.router.add_get("/api/expense-operation-logs/{id}", get_expense_operation_log_detail)
    app.router.add_post("/api/expense-operation-logs/{id}/undo", undo_expense_operation_log)
    app.router.add_get("/api/deleted-expenses", get_deleted_expenses_list)
    app.router.add_post("/api/deleted-expenses/{id}/restore", restore_deleted_expense)
    app.router.add_get("/api/expenses/stats", get_expense_stats)
    app.router.add_get("/api/expenses/categories", get_expense_categories)
    app.router.add_post("/api/expenses/categories", create_expense_category)
    app.router.add_put("/api/expenses/categories/{id}", update_expense_category)
    app.router.add_delete("/api/expenses/categories/{id}", delete_expense_category)
