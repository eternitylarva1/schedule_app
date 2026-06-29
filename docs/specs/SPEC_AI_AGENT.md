# AI Agent 工具系统设计方案（最终版）

## 结构：`backend/tools/` — 可复用的工具库

```
backend/tools/
├── __init__.py      # Tool 基类 + ToolRegistry + @tool 注册器
├── events.py        # 📅 日程事件工具
├── goals.py         # 🎯 目标工具
├── budgets.py       # 💰 预算支出工具
├── notes.py         # 📝 笔记工具
└── __pycache__/
```

## 核心机制

### 1. 工具定义（装饰器模式）

```python
# tools/events.py
from . import tool

@tool(
    name="get_today_events",
    description="获取今天的日程事件列表（含已完成和待办）",
    category="events",
    parameters={
        "type": "object",
        "properties": {},
        "required": []
    }
)
async def get_today_events(*, db, **kwargs):
    """实际处理函数 — 从 db 读取今日事件并格式化返回"""
    events = await db.get_events("today")
    return [{"time": e.start_time, "title": e.title, "status": e.status} for e in events]
```

### 2. 注册器（自动扫描）

```python
# tools/__init__.py
from dataclasses import dataclass, field
from typing import Callable, Any

tool_registry: dict[str, dict] = {}

def tool(name, description, category="general", parameters=None):
    """Decorator: 把一个函数注册为AI可用工具"""
    def decorator(func):
        tool_registry[name] = {
            "name": name,
            "description": description,
            "category": category,
            "parameters": parameters or {},
            "handler": func,
        }
        return func
    return decorator

def get_tools(categories: list[str] | None = None, tool_names: list[str] | None = None) -> list[dict]:
    """
    获取工具列表，三种模式：
    - categories=["events", "goals"] → 按分类筛选
    - tool_names=["get_today_events"] → 按名称筛选
    - 两者都为 None → 返回全部工具
    """
    tools = tool_registry.values()
    if categories:
        tools = [t for t in tools if t["category"] in categories]
    if tool_names:
        tools = [t for t in tools if t["name"] in tool_names]
    return [{"name": t["name"], "description": t["description"], "parameters": t["parameters"]} for t in tools]

async def execute_tool(name: str, **kwargs) -> Any:
    """执行指定工具"""
    tool = tool_registry.get(name)
    if not tool:
        raise ValueError(f"工具 {name} 不存在")
    return await tool["handler"](**kwargs)
```

### 3. 场景控制（前/后端都可约束）

```python
# 预定义场景 — 可在前端传入 scenarios 参数
SCENARIOS = {
    "note_chat": None,               # AI抽屉：全部工具可用
    "note_slash": ["get_note_content"],  # /a指令：默认只允许笔记工具
    "general": None,                 # 通用：全部
}

# 前端调用时可覆盖：
# POST /api/llm/chat-agent
# { message: "...", note_id: 123, tools: ["get_today_events"] }
# 如果 tools=null 或未传 → 使用场景默认值
```

## 工具清单（初版 7 个）

| 工具名 | 分类 | 描述 |
|--------|------|------|
| `get_today_events` | events | 今日日程事件 |
| `get_upcoming_events` | events | 未来7天日程 |
| `get_goals` | goals | 活跃目标及进度 |
| `get_budgets` | budgets | 预算及支出统计 |
| `get_recent_expenses` | budgets | 本月支出明细 |
| `get_note_content` | notes | 当前笔记全文 |
| `get_notes_list` | notes | 最近笔记列表 |

## LLM 服务层改动

```python
# llm_service.py 新增
async def chat_with_agent(self, message, note_id=None, selected_text="", tools=None):
    """
    tools: None=全部可用, [] = 不允许工具, ["a","b"] = 仅可用这些
    """
    # 1. 获取可用的工具定义列表
    available_tools = get_tools(tool_names=tools) if tools else get_tools()
    
    # 2. Pass 1: LLM 选择工具
    chosen = await self._determine_tools(message, available_tools)
    
    # 3. 执行选中的工具
    context = {}
    for name in chosen:
        result = await execute_tool(name, db=db, note_id=note_id)
        context[name] = result
    
    # 4. Pass 2: LLM 回答
    return await self._answer_with_context(message, context, selected_text)
```

## 前端改动

```javascript
// note-ai.js (AI抽屉) — 全场景
apiCall('llm/chat-agent', {
    method: 'POST',
    body: JSON.stringify({
        message: msg,
        note_id: currentNoteId,
        tools: null  // 全部可用
    })
})

// note-editor.js (/a指令) — 限笔记场景
apiCall('llm/chat-agent', {
    method: 'POST',
    body: JSON.stringify({
        message: prompt,
        note_id: note.id,
        tools: ["get_note_content"]  // 只读笔记
    })
})
```

## 好处

- ✅ **可复用**：任何需要 AI 的地方都可以调入工具
- ✅ **插件式**：加一个新工具只需新建一个函数+装饰器
- ✅ **场景可控**：/a 指令默认只给笔记工具，AI抽屉全部可用
- ✅ **前端可覆盖**：前端可以指定允许哪些工具
- ✅ **无外部依赖**：纯 Python，不引入任何新库

---

等确认后开工。
