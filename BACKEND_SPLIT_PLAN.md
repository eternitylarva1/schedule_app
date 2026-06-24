# 后端拆分方案 (routes.py + db.py)

> 目标:把 `backend/routes.py` (3235 行 / 111 函数) 和 `backend/db.py` (3491 行 / 123 函数)
> 拆为按功能/按表的子模块,便于 AI 编程定位,延续 CSS 拆分的设计原则。

---

## 0. 设计原则

1. **物理切分为主,逻辑改写为辅** — Python 模块不能像 CSS 那样"纯 sed 切",需要正确的 `__init__.py` facade 暴露公共 API,保证 `from . import db` / `from .routes import setup_routes` 仍然 work。
2. **不破坏 main.py 的导入** — `main.py` 第 16 行 `from . import db` 和第 17 行 `from .routes import setup_routes` 必须**不改动**,facade 必须完全兼容。
3. **零行为变化** — 端点路径、HTTP 方法、请求/响应 schema 全部保持不变。
4. **当前 8080 进程不重启** — 已加载旧代码的进程继续跑,新代码仅在下次重启/测试实例生效。
5. **回归测试用 8090 端口** — 临时起 aiohttp 实例,跑 curl 端点,验证完即 kill。

---

## 1. 目标结构

```
backend/
├── main.py                    # 不动(已用 facade-friendly import)
├── models.py                  # 不动
├── llm_service.py             # 不动
├── reminder_service.py        # 不动
├── time_parser.py             # 不动
├── restart_backend.py         # 不动
├── tools/                     # 不动(LLM tool 框架,独立)
├── routes/                    # NEW: 从 routes.py 拆出
│   ├── __init__.py            # 暴露 setup_routes(app)
│   ├── _helpers.py            # 共享: json_response / error_response / _parse_datetime / ...
│   ├── events.py              # /api/events/*
│   ├── goals.py               # /api/goals/*
│   ├── notes.py               # /api/notes/* + /api/note-groups/* + note conversations
│   ├── expenses.py            # /api/expenses/* + expense categories + operation logs
│   ├── budgets.py             # /api/budgets/* + budget templates
│   ├── llm.py                 # /api/llm/* (chat, create, command, breakdown, parse_expense, agent)
│   ├── settings.py            # /api/settings/* + /api/ai-providers/* + /api/user-contexts/*
│   ├── learning.py            # /api/ai/learn + /api/ai/patterns + /api/ai/stats
│   ├── backup.py              # /api/backup/* (export + import)
│   ├── stats.py               # /api/stats + /api/categories
│   └── misc.py                # cleanup / errors / test-qq-channel / _sanitize_ai_provider
└── db/                        # NEW: 从 db.py 拆出
    ├── __init__.py            # facade: re-export 所有公共函数 + DB_PATH + init_db
    ├── _connection.py         # DB_PATH + init_db() + 共享 connect() 助手
    ├── events.py              # events CRUD + history + modifications + 批量 + 重复检测
    ├── goals.py               # goals CRUD + conversations + deliverables
    ├── notes.py               # notes + note_groups + note_conversations
    ├── expenses.py            # expenses + categories + operation logs + soft delete
    ├── budgets.py             # budgets + templates + period reset
    ├── settings.py            # settings + ai_providers + user_contexts
    ├── learning.py            # learning_patterns + task_durations
    ├── error_logs.py          # error_logs
    ├── backup.py              # export_all_data + import_all_data
    └── cleanup.py             # cleanup_test_entries
```

**总新文件**: routes 目录 12 个 + db 目录 12 个 = 24 个 Python 文件

---

## 2. routes 拆分详解

### 2.1 `routes/__init__.py` (新)

```python
"""REST API routes for schedule management."""
from ._helpers import json_response, error_response
from .events import register_routes as _register_events
from .goals import register_routes as _register_goals
from .notes import register_routes as _register_notes
from .expenses import register_routes as _register_expenses
from .budgets import register_routes as _register_budgets
from .llm import register_routes as _register_llm
from .settings import register_routes as _register_settings
from .learning import register_routes as _register_learning
from .backup import register_routes as _register_backup
from .stats import register_routes as _register_stats
from .misc import register_routes as _register_misc

__all__ = ["setup_routes", "json_response", "error_response"]

def setup_routes(app):
    _register_events(app)
    _register_goals(app)
    _register_notes(app)
    _register_expenses(app)
    _register_budgets(app)
    _register_llm(app)
    _register_settings(app)
    _register_learning(app)
    _register_backup(app)
    _register_stats(app)
    _register_misc(app)
```

### 2.2 `routes/_helpers.py`

提取共享工具:
- `json_response(data, code=0)`
- `error_response(message, code=1)`
- `_parse_datetime(value)`
- `_extract_deadline_from_text(text)`
- `_extract_deadline_label_from_text(text)`
- `_append_deadline_label(title, deadline_label)`
- `_has_explicit_clock_time_in_text(text)`
- `_parse_date_range(date_str)`
- `_sanitize_ai_provider(provider)`

### 2.3 各子模块的 `register_routes(app)`

每个文件末尾:
```python
def register_routes(app):
    app.router.add_get("/api/events", get_events)
    app.router.add_post("/api/events", create_event)
    # ... 全部本模块端点
```

### 2.4 端点分配(权威清单,基于 routes.py L3116-L3235)

| 子模块 | 端点 | 行号 |
|---|---|---|
| **events.py** | GET/POST/PUT/DELETE `/api/events` + complete/uncomplete + history + deleted + modifications + undo | L38-394 |
| **stats.py** | GET `/api/stats` + GET `/api/categories` | L395-413 |
| **llm.py** | `/api/llm/chat` + `/api/llm/create` + `/api/llm/command` + `/api/llm/breakdown` + `/api/llm/parse_expense` + `/api/llm/chat-agent` | L414-1400, L2942-3013 |
| **goals.py** | 全部 `/api/goals/*` + `/api/goals/ai/*` | L1401-1782 |
| **settings.py** | `/api/settings/*` + `/api/ai-providers/*` + `/api/user-contexts/*` | L1783-1987 |
| **notes.py** | `/api/notes/*` + `/api/note-groups/*` + note conversations(`/api/notes/{id}/conversations`) | L1988-2080, L2617-2777 |
| **expenses.py** | `/api/expenses/*` + `/api/expense-categories/*` + `/api/expense-operation-logs/*` | L2081-2392 |
| **budgets.py** | `/api/budgets/*` + `/api/budget-templates/*` | L2393-2579 |
| **backup.py** | `/api/backup/*` | L2580-2616 |
| **learning.py** | `/api/ai/learn` + `/api/ai/patterns` + `/api/ai/stats` | L2778-2852 |
| **misc.py** | `/api/settings/cleanup_test_entries` + `/api/test-qq-channel` + `/api/errors/*` | L2853-2921 |

---

## 3. db 拆分详解

### 3.1 `db/__init__.py` (facade,新)

```python
"""SQLite database operations."""
from ._connection import DB_PATH, init_db, _connect
from .events import (
    create_event, get_events, get_event, update_event, delete_event,
    delete_events_by_title, backup_deleted_event, get_deleted_events,
    restore_deleted_event, permanent_delete, backup_event_modification,
    get_event_modifications, undo_event_modification, create_event_history,
    get_event_history, get_all_event_history, delete_event_history,
    complete_events_by_title, uncomplete_events_by_title,
    update_event_time_by_title, update_event_by_title, move_event_by_title,
    postpone_remaining_events_preview, postpone_remaining_events,
    undo_postpone_events, get_events_by_title, complete_event, uncomplete_event,
    get_task_durations, record_task_duration, get_learning_patterns,
    save_learning_pattern, delete_learning_pattern, get_learning_stats,
    batch_complete_events, find_duplicate_event, find_overlapping_events,
    batch_uncomplete_events, batch_delete_events, get_stats,
)
# ... 其他模块
```

**关键**: re-export 所有原来从 `backend.db` 直接 import 的符号。
main.py 用了 `db.init_db()` / `db.get_ai_providers()` / `db.create_ai_provider()` / `db.activate_ai_provider()` / `db.DB_PATH` — 都必须在 facade 暴露。

### 3.2 函数分配(权威清单,基于 db.py 全文)

| 子模块 | 函数 | 来源行号 |
|---|---|---|
| **_connection.py** | `DB_PATH`, `init_db()`, `_connect()` helper | L1-12 + L13 + 共享连接 |
| **events.py** | events CRUD + history + modifications + bulk + duplicate/overlap + learning patterns + task_durations + stats | L476-1662 |
| **settings.py** | `get_setting` / `set_setting` + `get_ai_providers` / `create` / `update` / `delete` / `activate` + `get_active_ai_provider` + `get_user_contexts` / CRUD / `reorder` | L1663-1838 |
| **goals.py** | goals CRUD + tree + subtasks + conversations + deliverables | L1840-2249 |
| **notes.py** | note conversations + notes by title + note groups | L2252-2896 |
| **cleanup.py** | `cleanup_test_entries` | L2898-2955 |
| **error_logs.py** | error_logs CRUD | L2957-3001 |
| **budgets.py** | budgets + templates + period reset | L3003-3390 |
| **expenses.py** | expenses + categories + soft delete + restore + operation logs | L2301-2458, L3392-3439 |
| **backup.py** | `export_all_data` + `import_all_data` | L3441-end |

**注意**: `expenses.py` 和 `budgets.py` 在 db.py 中位置不连续(被 goals/notes 隔开),需要在拆时按归属搬到对应子文件。

---

## 4. main.py 改动

**理论上不动**。`from . import db` 和 `from .routes import setup_routes` 都通过 facade 工作。

**验证**: 拆分后 import 链:
- `from . import db` → `backend/db/__init__.py` → re-export 全部
- `from .routes import setup_routes` → `backend/routes/__init__.py` → 调用各 register_*

---

## 5. 回归测试方案

### 5.1 测试实例(端口 8090)

临时脚本 `backend/_test_split_runner.py`:
```python
"""临时回归测试入口 - 仅用于验证拆分正确性,用完删除。"""
import asyncio
import sys
from pathlib import Path

# 把 schedule.db 临时替换为 test_split.db
import backend.db as _db
_db.DB_PATH = Path(__file__).parent / "test_split.db"

from backend.main import init_app

if __name__ == "__main__":
    from aiohttp import web
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    app = loop.run_until_complete(init_app())
    print("=== 测试实例启动在 8090 ===")
    web.run_app(app, host="127.0.0.1", port=8090, loop=loop)
```

### 5.2 curl 回归测试

```bash
# 起测试实例(后台)
cd /home/gaoming/AI_Planner/schedule_app
python backend/_test_split_runner.py &
TEST_PID=$!
sleep 3

# 跑核心 GET 端点(应全 200)
ENDPOINTS=(
  "/api/events?date=today"
  "/api/goals?horizon=short"
  "/api/notes"
  "/api/expenses?date=month"
  "/api/budgets"
  "/api/settings"
  "/api/ai-providers"
  "/api/user-contexts"
  "/api/categories"
  "/api/stats?date=today"
  "/api/expense-categories"
  "/api/expense-operation-logs"
  "/api/expense-stats"
  "/api/deleted-events"
  "/api/event-modifications"
  "/api/notes?group_id=1"  # 测试 note_groups
  "/api/goals/1/tree"  # 测试 goals tree
  "/api/llm/chat" -X POST -d '{"text":"test"}'  # POST 测试(可能 400,但应能响应)
)

for ep in "${ENDPOINTS[@]}"; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:8090$ep")
  echo "$STATUS  $ep"
done

# kill 测试实例
kill $TEST_PID
wait $TEST_PID 2>/dev/null
rm backend/_test_split_runner.py
rm backend/test_split.db
```

**预期**: 所有 GET 端点返回 200 (有 data: [] / data: {} / data: null 都算正常)。POST 端点即使返回 4xx 也算"路由可访问"。

### 5.3 端口验证

- 8080: 旧后端进程未动,继续服务
- 8090: 测试实例,跑完即 kill
- 9227: Chrome 调试,未动

---

## 6. 执行步骤

### 步骤 0: 备份
```bash
cp backend/routes.py /tmp/routes.py.original.bak
cp backend/db.py /tmp/db.py.original.bak
```

### 步骤 1: 派 fixer 拆 routes
- 创建 `backend/routes/` 目录
- 拆出 12 个子文件
- 创建 `backend/routes/__init__.py` facade
- 删除 `backend/routes.py`

### 步骤 2: 验证 routes
```bash
python -c "from backend.routes import setup_routes; print('OK')"
python -m py_compile backend/routes/*.py  # 全部应通过
# 起 8090 测试,curl 测端点
```

### 步骤 3: 派 fixer 拆 db
- 创建 `backend/db/` 目录
- 拆出 12 个子文件
- 创建 `backend/db/__init__.py` facade
- 删除 `backend/db.py`

### 步骤 4: 验证 db
```bash
python -c "from backend import db; print(db.DB_PATH, db.init_db)"
python -m py_compile backend/db/*.py
# 起 8090 测试,curl 测端点
```

### 步骤 5: commit + push
```bash
git add -A
git commit -m "refactor(backend): 拆分 routes.py + db.py 为按功能/按表的子模块"
git push origin main
```

### 步骤 6: QQ 通知

---

## 7. 风险与约束

| 风险 | 缓解 |
|------|------|
| facade 漏导出导致 main.py import 失败 | py_compile + import test + 起 8090 实测 |
| 端点路径/方法配错 | routes 拆分时用 sed 按行号切,逐文件验证 |
| 当前 8080 进程崩溃 | 不动 8080,新代码仅在 8090 测试实例生效 |
| SQLite 锁冲突(8090 测时 8080 也在用) | 测试用 test_split.db 独立文件,不动真实 schedule.db |
| 跨模块依赖(例如 goals 引用 events) | 全部分析好,只移动不重写,import 关系保持 |

---

## 8. 不做的事(明确边界)

- ❌ 不改端点路径/方法
- ❌ 不改 main.py (除 import 已兼容)
- ❌ 不合并函数/不改函数签名
- ❌ 不删除任何 handler/db 函数
- ❌ 不改 SQL 语句
- ❌ 不改 models.py
- ❌ 不重启 8080 进程
- ❌ 不动 9227 Chrome
- ❌ 不发 QQ(由 orchestrator 发)

---

## 9. 验收清单

- [ ] `backend/routes/` 目录存在,含 12 个文件
- [ ] `backend/db/` 目录存在,含 12 个文件
- [ ] `backend/routes.py` 已删除
- [ ] `backend/db.py` 已删除
- [ ] `python -c "from backend.routes import setup_routes"` 成功
- [ ] `python -c "from backend import db; print(db.init_db, db.DB_PATH)"` 成功
- [ ] `python -m py_compile backend/routes/*.py backend/db/*.py` 全通过
- [ ] 8090 测试实例启动成功
- [ ] curl 跑全部核心 GET 端点,全 200
- [ ] 8080 进程仍跑(未重启)
- [ ] git commit + push 完成
- [ ] QQ 通知已发送
