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
| `routes/` | REST API 路由（按功能拆分 12 个子模块：events/goals/notes/expenses/budgets/llm/settings/等） |
| `db/` | SQLite CRUD 操作（按表拆分 12 个子模块：events/goals/notes/expenses/budgets/settings/等） |
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
- `backend/routes/` — 所有 API 端点（按功能拆分为 12 个子模块）
- `backend/llm_service.py` — 所有 AI 交互 prompt 模板
- `docs/specs/SPEC.md` — 项目规范（交互设计、优先级、注意事项）
- `docs/guides/DEBUG_WORKFLOW.md` — 调试流程文档（强制执行）
- `docs/REQUIREMENT_ANALYSIS.md` — 需求缺口分析（对标市面产品）

## Development Guidelines

1. **调试流程**：必须遵循 `docs/guides/DEBUG_WORKFLOW.md`
2. **提交规范**：每次完成后 `git add . && git commit -m "描述" && git push origin main`
3. **浏览器调试**：使用 `browser-harness` skill，设置 `BU_CDP_URL` 环境变量
4. **不要暴露 API Key**：AI key 优先从环境变量读取
5. **QQ 提醒**：每次 commit 并 push 后必须用 qq-notify skill 发送 QQ 通知
6. **Service Worker 缓存同步**：每次新增/删除 JS 或 CSS 文件，或更新 `?v=` 版本号后，必须同步更新 `service-worker.js`：
   ```bash
   python3 scripts/sync_sw_cache.py --write
   ```
   dry-run 预览：`python3 scripts/sync_sw_cache.py`（不加 --write）

## ⚠️ Agent 必读：常见陷阱（每次修改前必须检查）

以下陷阱曾导致线上 bug，**任何 Agent 在执行修改时必须注意**：

### 前端陷阱

1. **`apiCall()` 已解包 `json.data`**
   - `apiCall('events', {method:'POST'})` 返回的是 `json.data`（纯数据），不是 `{code, data}` 完整响应
   - ❌ `resp.data` — 错误，`resp` 就是 data
   - ✅ `resp` 或 `Array.isArray(resp) ? resp : []` — 正确

2. **calendar-views 渲染函数需要 `deps` 参数**
   - `renderTimeline(deps)`, `renderWeekView(deps)`, `renderMonthView(deps)`, `renderAgendaList(mode, deps)` — 都需要传 `deps`
   - 如果从 `app-init.js` 调用，必须传完整 deps 或调用 `getDefaultDeps()`（已在 calendar-views.js 中提供）
   - 新增调用点不要漏传参数

3. **事件监听只绑定一次**
   - `app-init.js:8` 的 `bindEvents()` 已设 `st()._eventsBound = true` 防止重复绑定
   - 新增事件监听优先加到 `app-init.js` 而非 `main.js`
   - 不要在模块初始化时绑定全局事件（会被重复调用）

4. **标题输入监听器会自动 POST `_parse:true`**
   - `app-init.js:334-354` 的 debounced input 监听器会 POST `/api/events` 带 `_parse: true`
   - 后端 `routes/events.py` 识别该标志，只解析不保存
   - 不要修改这个行为——它是自动时间解析功能

5. **模块导出到 `window.ScheduleAppXxx`**
   - 遵循 IIFE + `window.ScheduleAppXxx = {...}` 模式
   - 依赖通过 `window.ScheduleAppCore` 获取，不直接 import
   - 新增模块必须同步更新 `service-worker.js` 缓存列表

### 后端陷阱

1. **`init_db()` 返回 connection，必须捕获**
   - 旧版 `init_db` 是 void，新版返回 `aiosqlite.Connection`
   - 不要用 `except Exception: pass` 吞迁移错误
   - 新增表/列通过 `migrations.py` 版本化迁移，不要直接改 `_connection.py`

2. **`error_response()` 默认 code=400（HTTP 状态码）**
   - 不是 code=1 了
   - 支持 `error_type` 和 `details` 字段结构化错误
   - `_helpers.py` 是 facade，修改去 `response.py`

3. **`_parse: true` 只解析不保存**
   - `routes/events.py` 创建事件前检查此标志
   - 前端用它实现输入时的时间预览，不应产生持久化事件

### 通用陷阱

1. **代码拆分 ≠ 逻辑修改**
   - 提取函数到新文件时，不要顺便改逻辑
   - 跨文件引用用 `window.ScheduleAppXxx`，不是直接函数名

2. **修改后必须跑冒烟测试**
   - 至少点一遍所有标签页确认无 JS 报错
   - `curl http://localhost:8080/api/events?date=month` 验证 API 正常

3. **调试数据必须清理**
   - 调试产生的测试数据用 `POST /api/settings/cleanup_test_entries` 清理
   - 标题带 `test/demo/debug/trace/dup/bug/repro` 的事件会被自动清理

## Browser-Harness 使用流程

### 1. 连接已有 Chrome（优先）

用户已打开的 Chrome 可以直接连接，无需启动新窗口：

```bash
export BU_CDP_URL="http://localhost:9222"
# 或用户自定义端口
export BU_CDP_URL="http://localhost:9228"
```

验证存活：`browser-harness -c 'print(page_info())'`

### 2. 启动新 Chrome（无可用 Chrome 时）

```bash
# 用 run_background_process 启动（非前台 &）
run_background_process(
    command="chromium --remote-debugging-port=9227 --user-data-dir=/tmp/chrome-test",
    title="Chrome Debug"
)

# 验证端口监听
lsof -i:9227

# 连接
export BU_CDP_URL="http://localhost:9227"
```

### 3. 验证 Chrome 存活

```bash
browser-harness -c 'print(page_info())'
# 正常返回: {'url': '...', 'title': '...', 'w': xxx, 'h': xxx}
# 如果卡住或超时，说明 Chrome 未正常运行
```

### 4. 常用命令

```bash
# 导航 + 等待
goto_url("http://localhost:8080")
wait_for_load()

# JS 操作（click / value / querySelector）
js('document.querySelector("#tabNotepad").click()')
js('return document.querySelector(".item").textContent')

# 截图（仅必要时）
capture_screenshot()

# 页面信息
print(page_info())
```

### 5. 注意事项

- 用 `run_background_process` 启动 Chrome，不要用前台 `&`
- js() 返回值为空是正常的（不代表失败），用 `&& echo "done"` 确认执行
- 先用 `print(page_info())` 验证页面加载，再进行下一步操作
- 不要每步都截图，只在需要验证时才截
