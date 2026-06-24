"""Learning HTTP endpoints."""
from aiohttp import web
from typing import Any
from .. import db
from ._helpers import json_response, error_response


# ============= Learning Handlers =============

"""POST /api/ai/learn - learn from history."""
async def ai_learn_from_history(request: web.Request) -> web.Response:
    """POST /api/ai/learn - Trigger AI to analyze task history and generate patterns."""
    try:
        # Get task durations
        durations = await db.get_task_durations(limit=200)
        if len(durations) < 5:
            return error_response("样本不足，至少需要5条已完成任务记录才能学习。当前有 {} 条。".format(len(durations)), code=400)
        
        # Get existing patterns to avoid duplicates
        existing = await db.get_learning_patterns()
        
        # Prepare data for LLM
        duration_data = [d.to_dict() for d in durations]
        existing_data = [p.to_dict() for p in existing]
        
        # Call AI to analyze
        from .llm_service import llm_service
        result = await llm_service.learn_from_task_history(duration_data, existing_data)
        
        patterns = result.get("patterns", [])
        if not patterns:
            return error_response("AI 未能从数据中总结出可靠规律，可能样本不够典型。", code=400)
        
        # Save new patterns
        saved = []
        for p in patterns:
            if p.get('confidence', 0) >= 0.6:
                saved_pattern = await db.save_learning_pattern(
                    pattern_type=p.get('type', 'duration_estimate'),
                    pattern_text=p.get('text', ''),
                    confidence=p.get('confidence', 0),
                    sample_count=p.get('sample_count', 0)
                )
                saved.append(saved_pattern)
        
        return json_response({
            "message": f"成功从 {len(durations)} 条任务记录中总结出 {len(saved)} 条规律",
            "patterns": [p.to_dict() for p in saved],
            "stats": await db.get_learning_stats()
        })
    except Exception as e:
        return error_response(f"学习失败: {str(e)}")




"""GET /api/ai/patterns - get learning patterns."""
async def get_learning_patterns_handler(request: web.Request) -> web.Response:
    """GET /api/ai/patterns - Get all learning patterns."""
    try:
        patterns = await db.get_learning_patterns()
        stats = await db.get_learning_stats()
        return json_response({"patterns": [p.to_dict() for p in patterns], "stats": stats})
    except Exception as e:
        return error_response(f"获取规律失败: {str(e)}")




"""DELETE /api/ai/patterns/{id} - delete learning pattern."""
async def delete_learning_pattern_handler(request: web.Request) -> web.Response:
    """DELETE /api/ai/patterns/{id} - Delete a learning pattern."""
    try:
        pattern_id = int(request.match_info["id"])
        success = await db.delete_learning_pattern(pattern_id)
        if success:
            return json_response({"message": "已删除"})
        return error_response("删除失败，记录不存在", code=404)
    except Exception as e:
        return error_response(f"删除失败: {str(e)}")




"""GET /api/ai/stats - get learning stats."""
async def get_learning_stats_handler(request: web.Request) -> web.Response:
    """GET /api/ai/stats - Get learning system statistics."""
    try:
        stats = await db.get_learning_stats()
        return json_response(stats)
    except Exception as e:
        return error_response(f"获取统计失败: {str(e)}")





# ============= Route Registration =============

def register_routes(app: web.Application) -> None:
    app.router.add_post("/api/ai/learn", ai_learn_from_history)
    app.router.add_get("/api/ai/patterns", get_learning_patterns_handler)
    app.router.add_delete("/api/ai/patterns/{id}", delete_learning_pattern_handler)
    app.router.add_get("/api/ai/stats", get_learning_stats_handler)
