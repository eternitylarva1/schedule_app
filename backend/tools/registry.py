"""
工具注册表 — 核心数据结构，与 __init__.py 分离以避免循环导入
"""

from typing import Any, Optional

_tool_registry: dict[str, dict] = {}

def tool(name: str, description: str, category: str = "general", parameters: Optional[dict] = None):
    """装饰器：注册一个 AI 可用工具"""
    def decorator(func):
        _tool_registry[name] = {
            "name": name,
            "description": description,
            "category": category,
            "parameters": parameters or {"type": "object", "properties": {}, "required": []},
            "handler": func,
        }
        return func
    return decorator


def get_tools(
    categories: Optional[list[str]] = None,
    tool_names: Optional[list[str]] = None,
) -> list[dict]:
    """获取工具列表（用于 LLM Pass 1）"""
    tools = list(_tool_registry.values())
    if categories:
        tools = [t for t in tools if t["category"] in categories]
    if tool_names:
        tools = [t for t in tools if t["name"] in tool_names]
    return [
        {"name": t["name"], "description": t["description"], "parameters": t["parameters"]}
        for t in tools
    ]


async def execute_tool(name: str, **kwargs) -> Any:
    """执行指定工具"""
    t = _tool_registry.get(name)
    if not t:
        raise ValueError(f"工具不存在: {name}")
    return await t["handler"](**kwargs)
