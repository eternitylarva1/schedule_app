"""工具：预算与支出相关"""

from .. import db
from .registry import tool


@tool(
    name="get_budgets",
    description="获取所有预算及其当前支出统计（总额、已花、剩余、周期）",
    category="budgets",
)
async def get_budgets(*, db_instance=None, **kwargs):
    """获取预算及支出统计"""
    try:
        budgets = await db.get_budgets_with_stats()
        if not budgets:
            return "暂无预算。"
        result = []
        for b in budgets:
            result.append({
                "name": b["name"],
                "amount": b["amount"],
                "spent": b["spent"],
                "remaining": b["remaining"],
                "period": b.get("period", "none"),
                "auto_reset": b.get("auto_reset", False),
                "effective_amount": b.get("effective_amount", b["amount"]),
            })
        return result
    except Exception as ex:
        return f"获取预算失败: {ex}"


@tool(
    name="get_recent_expenses",
    description="获取本月支出明细（按日期倒序），含金额、分类、备注",
    category="budgets",
)
async def get_recent_expenses(*, db_instance=None, **kwargs):
    """获取本月支出"""
    try:
        expenses = await db.get_expenses("month")
        if not expenses:
            return "本月暂无支出。"
        result = []
        for e in expenses:
            result.append({
                "amount": e.amount,
                "category": e.category,
                "note": e.note,
                "date": e.expense_date or e.created_at[:10] if e.created_at else "",
                "budget_id": e.budget_id,
            })
        return result
    except Exception as ex:
        return f"获取支出失败: {ex}"
