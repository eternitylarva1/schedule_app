# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

移动端优先的日程管理 Web App，支持自然语言创建日程、AI 任务拆解、目标规划、笔记和记账功能。

- **后端**: Python (aiohttp) + SQLite
- **前端**: 原生 HTML/CSS/JavaScript（移动端优先）
- **AI**: 支持多种 LLM 接口（OpenAI 兼容）

## Build and Run Commands

```bash
cd schedule_app
pip install -r requirements.txt
python -m backend.main
# 访问 http://localhost:8080
```

## Architecture

### Backend (`backend/`)

| File | Purpose |
|------|---------|
| `main.py` | aiohttp 服务器入口，初始化数据库、AI 提供商、CORS |
| `routes.py` | 所有 REST API 路由（约 2000 行），包含 events/goals/notes/expenses/budgets/llm |
| `db.py` | SQLite 所有 CRUD 操作（约 2100 行），使用 aiosqlite |
| `llm_service.py` | LLM 集成，统一调用 OpenAI 兼容 API，支持多提供商动态切换 |
| `models.py` | 数据模型（Event, Goal, Note, Expense, Budget 等） |
| `time_parser.py` | 时间解析工具 |
| `reminder_service.py` | 提醒服务（后台定时检查） |

### Frontend (`frontend/`)

**编排层** `frontend/static/js/main.js`：只负责视图切换、跨模块协调，不承载具体业务渲染。

**模块层**（通过命名空间导出）：

| Module | Export | File |
|--------|--------|------|
| Goals | `window.ScheduleAppGoals` | `goals.js` |
| Notepad | `window.ScheduleAppNotepad` | `notepad.js` |
| Settings | `window.ScheduleAppSettings` | `settings.js` |
| Budget | `window.ScheduleAppBudget` | `budget.js` |

`main.js` 只通过以上命名空间调用模块能力，避免"双份定义"同名功能。

**核心模块** `frontend/static/js/core/`：
- `state-elements.js` — 状态与 DOM 元素映射
- `utils.js` — 工具函数
- `api-toast.js` — API 调用与 Toast
- `drag.js` — 拖拽处理

### Database

SQLite 文件：`backend/schedule.db`

主要表：events, goals, notes, expenses, budgets, settings, ai_providers, user_contexts, note_groups, goal_conversations, note_conversations

## API Design

基础 URL: `http://localhost:8080/api`

统一响应格式：
```json
{ "code": 0, "data": {...}, "message": "..." }
```

关键端点：
- **Events**: `GET/POST /api/events`, `PUT/DELETE /api/events/{id}`, `PUT /api/events/{id}/complete`
- **Goals**: `GET/POST /api/goals`, `GET /api/goals/{id}/tree`, `POST /api/goals/ai/discuss`
- **LLM**: `POST /api/llm/chat`, `POST /api/llm/create`, `POST /api/llm/command`, `POST /api/llm/breakdown`
- **Notes/Budgets/Expenses**: 见 README.md API 章节

## Key Conventions

### 前端模块导出约定
每个模块统一导出到 `window` 对象：
```javascript
window.ScheduleAppGoals = { renderGoalsView, ... };
```

### AI 提供商配置
- 环境变量兜底：`LLM_API_KEY`, `LLM_API_BASE`, `LLM_MODEL`
- 数据库动态配置：用户可通过设置页添加多个 AI 提供商并切换
- LLM service 在运行时从 DB 加载活跃提供商配置

### 时间冲突检测
`routes.py` 中 `create_event` 有冲突检测逻辑，发现重叠 pending 事件会返回 409。

### 测试数据清理
`POST /api/settings/cleanup_test_entries` 可一键清理含"测试/test/debug/demo"关键词或 `is_test=true` 的数据。

## Important Files to Review

- `frontend/index.html` — 单页应用入口，所有视图的 HTML 结构
- `frontend/static/js/main.js` — 主逻辑，视图切换路由
- `backend/routes.py` — 所有 API 端点（按功能分组，约 2000 行）
- `backend/llm_service.py` — 所有 AI 交互 prompt 模板
- `SPEC.md` — 项目规范（交互设计、优先级、注意事项）
- `DEBUG_WORKFLOW.md` — 调试流程文档（强制执行）

## Development Guidelines

1. **调试流程**：必须遵循 `DEBUG_WORKFLOW.md`，禁止跳过"复现 → 分层定位 → API校验 → 状态校验 → 回归"
2. **提交规范**：每次完成后 `git add . && git commit -m "描述" && git push origin main`
3. **浏览器调试**：使用 `agent-browser`，Windows 环境必须用 `start /b agent-browser <command>`
4. **回归测试**：每次修复后必须跑回归矩阵（见 DEBUG_WORKFLOW.md 第 6 节）
5. **不要暴露 API Key**：AI key 优先从环境变量读取
