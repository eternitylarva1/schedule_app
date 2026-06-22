"""
AI Tool System — 可复用的智能体工具库

用法：
    from backend.tools import get_tools, execute_tool

    tools = get_tools()                           # 全部工具
    tools = get_tools(categories=["events"])      # 按分类
    tools = get_tools(tool_names=["my_tool"])     # 按名称
    result = await execute_tool("my_tool", db=db)
"""

from .registry import tool, get_tools, execute_tool  # noqa: F401
from . import events, goals, budgets, notes          # noqa: F401 — 触发 @tool 注册
