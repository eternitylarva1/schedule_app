# Schedule App 功能调试流程（Debug Workflow）

> 目标：建立一套**可重复、可定位、可回归**的调试流程，覆盖本项目主要功能（日历/待办/规划/记事本/LLM/提醒）。

## 目录

1. [适用范围](#0-适用范围)
2. [调试总流程](#1-调试总流程统一模板)
3. [快速健康检查](#2-快速健康检查3-分钟)
4. [分层调试清单](#3-分层调试清单定位根因)
5. [功能级调试流程](#4-功能级调试流程按模块)
6. [常见故障](#5-常见故障-直接处理策略)
7. [回归测试矩阵](#6-回归测试矩阵每次修复后必跑)
8. [标准收尾动作](#7-标准收尾动作修复完成后)
9. [测试数据清理](#8-测试数据清理)
10. [推荐调试顺序](#9-推荐调试顺序避免来回跳)
11. [维护建议](#10-维护建议)

---

## 0. 适用范围

- 项目：`schedule_app`
- 后端：`aiohttp + sqlite`
- 前端：`原生 HTML/CSS/JS`
- 主要入口：
  - 后端：`backend/main.py`
  - 前端：`frontend/index.html`, `frontend/static/js/main.js`（核心逻辑）, `frontend/static/js/core/`（模块）

---

## 1. 调试总流程（统一模板）

每个功能都按以下 8 步执行，避免“改一点、测一点、漏很多”。

1. **复现问题（Reproduce）**
   - 记录：操作路径、预期、实际结果、是否稳定复现。
2. **分层定位（Layer Split）**
   - 先判定是：前端渲染 / 前端状态 / API 请求 / 后端逻辑 / 数据库。
3. **API 验证（Contract Check）**
   - 用 `curl` 直接打接口，确认 JSON 结构和字段。
4. **状态验证（State Check）**
   - 检查前端 `state` 与当前 DOM 是否一致（view/subview/date/filter）。
5. **最小修复（Minimal Fix）**
   - 只改最小必要范围，避免一次性重构。
6. **回归测试（Regression）**
   - 相关功能 + 相邻功能全部跑一遍（见第 6 节矩阵）。
7. **部署动作（Operational）**
   - 重启后端，确认服务可达。
8. **结果通知（Report）**
   - 记录修复点、验证结果、未解决项。

---

## 2. 快速健康检查（3 分钟）

### 2.1 后端存活

```bash
curl -s http://localhost:8080/api/events?date=today
```

预期：返回 `{"code":0,"data":[...]}`。

### 2.2 页面基础元素是否就绪

检查 DOM（至少包含）：
- `#dayView`, `#weekView`, `#monthView`, `#todoView`
- `#calendarSegmented`, `#daySlider`, `#timeline`, `#weekGrid`, `#monthGrid`

### 2.3 核心前端函数是否可用

`app.js` 至少应存在：
- `switchView`
- `loadData`
- `renderTimeline`
- `renderWeekView`
- `renderMonthView`
- `renderTodoView`
- `bindEvents`

> 若缺任一函数，优先修复结构完整性，再继续功能调试。

### 2.4 浏览器自动化健康检查（agent-browser）

使用 `agent-browser` CLI 进行前端调试。安装方式：

```bash
npm i -g agent-browser
agent-browser install  # 首次安装需要
```

**常用命令：**

| 命令 | 作用 |
|------|------|
| `agent-browser open <url>` | 打开 URL |
| `agent-browser snapshot` | 获取无障碍树快照（含 @eN 元素引用）|
| `agent-browser click <sel>` | 点击元素（支持 CSS selector 或 @ref）|
| `agent-browser get text <sel>` | 获取元素文本 |
| `agent-browser errors` | 查看页面 JS 错误 |
| `agent-browser console` | 查看控制台日志 |
| `agent-browser screenshot` | 截图 |

**调试流程：**

1. **打开页面**
   ```bash
   agent-browser open http://localhost:8080
   ```

2. **获取快照确认元素**
   ```bash
   agent-browser snapshot
   ```
   找到要操作的元素引用（如 `@e8` 表示"待办"按钮）

3. **执行操作**
   ```bash
   agent-browser click @e8  # 点击待办tab
   agent-browser snapshot    # 确认切换结果
   ```

4. **检查错误**
   ```bash
   agent-browser errors      # 查看 JS 错误
   agent-browser console     # 查看 console 日志
   ```

**注意：**
- agent-browser 使用独立 Chrome 进程，不依赖浏览器扩展
- 若需重置状态：`agent-browser close --all` 后重新 `open`
- 查看所有命令：`agent-browser --help`

**Windows Git Bash / WSL 环境注意事项：**

直接执行 `agent-browser open <url>` 会阻塞终端。必须使用 `start /b` 后台启动：

```bash
# 1. 后台启动浏览器（关键！）
start /b agent-browser open http://localhost:8080

# 2. 后续命令独立执行
start /b agent-browser snapshot
start /b agent-browser click "#selector"
start /b agent-browser screenshot

# 3. 结束调试时关闭会话
agent-browser close --all
```

| 问题现象 | 原因 | 解决方案 |
|---------|------|---------|
| 命令执行后卡住不返回 | agent-browser 默认保持会话，阻塞终端 | 使用 `start /b agent-browser <command>` |
| 每次命令都需要重新 open | 未理解会话保持机制 | 后台启动后持续交互，最后 close |

**为什么需要 start /b：**
- agent-browser 设计为持续会话模式，打开后等待后续命令
- 在 Windows bash 环境中，不使用 `start /b` 会导致进程占用终端无法释放
- `start /b` 将命令转为后台执行，允许终端继续接受新命令

---

## 3. 分层调试清单（定位根因）

## A. 前端事件绑定层

检查 `bindEvents()`：
- tab 切换：`tabDay/tabTodo/tabGoals/tabNotepad`
- 分段切换：`#calendarSegmented` 点击后更新 `state.calendarSubview`

常见故障：
- DOM id 变更后，`elements.xxx` 未同步（如 `daySlider` 漏映射）
- 事件绑定目标不存在，导致静默失败

---

## B. 前端状态层

重点状态：
- `state.currentView`
- `state.calendarSubview`（day/week/month）
- `state.currentDate`
- `state.currentMonth`

检查点：
- `switchView('day')` 时，是否按 subview 显示正确容器：
  - day: `daySlider` 显示，week/month 隐藏
  - week: `weekView` 显示
  - month: `monthView` 显示

---

## C. API 层

核心接口验证：

```bash
curl -s "http://localhost:8080/api/events?date=today"
curl -s "http://localhost:8080/api/events?date=week"
curl -s "http://localhost:8080/api/events?date=month"
curl -s "http://localhost:8080/api/events?date=2026-04"
curl -s "http://localhost:8080/api/stats?date=today"
curl -s "http://localhost:8080/api/goals?horizon=short"
```

检查：
- JSON 可解析（不是 HTML）
- 字段完整（如 stats 需 `completion_rate`）

---

## D. 后端路由层

检查 `backend/routes.py`：
- `/api/events`, `/api/stats`, `/api/goals`, `/api/llm/*` 已注册
- date 参数支持：`today/week/month/YYYY-MM-DD/YYYY-MM`

检查 `backend/main.py`：
- 不允许存在会吞 API 的 catch-all 路由
- static 与 `/` 首页路由不影响 `/api/*`

---

## E. 数据层（SQLite）

重点确认：
- 新建事件后 `start_time/end_time/status/category_id` 正常
- `complete/uncomplete` 状态切换后查询结果同步
- goals/settings 表可读写

---

## 4. 功能级调试流程（按模块）

## 4.1 日历（日/周/月）

1. 打开“日历”tab。
2. 点分段按钮：日 → 周 → 月。
3. 验证：
   - 标题随 subview 变化（今天 / X月 / YYYY年M月）
   - 对应容器显示、其他容器隐藏
   - 左右切换按钮日期推进逻辑正确

若失败优先看：
- `elements.daySlider` 是否存在
- `state.calendarSubview` 是否更新
- `renderWeekView/renderMonthView` 是否执行

---

## 4.2 待办视图

1. 切到待办。
2. 勾选完成、反悔取消、左滑操作、编辑删除。
3. 验证日历视图是否同步变化。

---

## 4.3 规划（Goals）

1. 切 short / semester / long。
2. 新增/编辑/删除目标。
3. 验证 reference 区域加载是否正常。

---

## 4.4 记事本

1. 打开记事本页面。
2. 验证：笔记/记账分段可切换。
3. 验证：分组展开/收起、编辑、删除、拖拽排序交互可用。

---

## 4.5 LLM 创建与拆解

1. 输入自然语言创建日程。
2. 任务拆解并导入。
3. 验证失败时 toast 错误信息可读。

---

## 4.6 提醒（含 QQ 开关）

1. 检查设置页提醒开关。
2. 创建“1分钟后提醒”的测试事件。
3. 验证 reminder service 在 startup 后运行。

---

## 5. 常见故障 → 直接处理策略

- **页面空白或日历不渲染**
  - 先检查 `renderTimeline/renderWeekView/renderMonthView` 是否存在
  - 再检查 `elements` 映射是否缺失关键节点

- **切换按钮点了没反应**
  - 检查事件绑定是否命中正确 selector
  - 检查点击后 state 是否变化

- **`Unexpected token <`**
  - API 被 HTML 响应替代，检查路由拦截/catch-all

- **`Failed to fetch`**
  - 后端没启动或端口不可达
  - 先 `curl` 验活再看前端

- **记事本数据未渲染或交互失效**
  - 先看分段状态（notes/bills）是否更新，再看列表渲染与事件绑定是否命中

---

## 6. 回归测试矩阵（每次修复后必跑）

至少跑下面 10 项：

1. 日历 tab 可进
2. 日/周/月分段可切换
3. 左右日期导航正常
4. 待办列表可渲染
5. 待办完成/反悔可用
6. 规划列表可渲染
7. 记事本页可渲染且可交互
8. 新建日程可保存
9. 详情弹窗可打开
10. 刷新后状态保持（lastView 等）

---

## 7. 标准收尾动作（修复完成后）

1. **清理测试数据**
   - 方法见第 8 节「测试数据清理」
2. **提交代码**（仅在确认修复后）
3. **推送**
4. **重启后端**
5. **验活 API**：

```bash
curl -s http://localhost:8080/api/events?date=today
```

6. **发送更新通知（QQ）**

使用 NapCat API 发送私聊消息：

```bash
curl -s -X POST "http://127.0.0.1:3000/send_private_msg" \
  -H "Content-Type: application/json" \
  -d "{\"user_id\":2674610176,\"message\":[{\"type\":\"text\",\"data\":{\"text\":\"[计划助手更新通知]\n- 修复点1\n- 修复点2\n- 验证结果\n\n仓库: https://github.com/eternitylarva1/schedule_app\"}}]}"
```

或使用项目上级目录的 `send_message.py`：

```bash
python ../send_message.py
```

通知模板：

```text
[计划助手更新通知]
- 修复点1
- 修复点2
- 验证结果

仓库: https://github.com/eternitylarva1/schedule_app
```

---

## 8. 测试数据清理

### 8.1 手动清理（API）

**一键清理所有测试数据**（关键词 + is_test 标记）：

```bash
curl -s -X POST http://localhost:8080/api/settings/cleanup_test_entries \
  -H "Content-Type: application/json" \
  -d "{}"
```

返回示例：
```json
{
  "code": 0,
  "data": {
    "events_deleted": 1,
    "notes_deleted": 0,
    "expenses_deleted": 2,
    "budgets_deleted": 1
  }
}
```

### 8.2 手动清理（数据库）

```bash
# 删除 events 中标题含测试关键词的记录
curl -s -X POST http://localhost:8080/api/settings/cleanup_test_entries \
  -H "Content-Type: application/json" -d "{}"
```

### 8.3 清理范围

| 类型 | 关键词匹配 | is_test 标记 |
|------|----------|--------------|
| Events | ✅ 标题含：测试/test/debug/demo/样例/示例/tmp/临时 | ✅ |
| Notes | ✅ 标题或内容含上述关键词 | - |
| Expenses | ✅ 备注含上述关键词 | ✅ |
| Budgets | - | ✅ |

### 8.4 创建测试数据时标记

调试时创建测试数据，建议加上 `is_test: true` 标记，方便后续精准清理：

**Events：**
```bash
curl -s -X POST http://localhost:8080/api/events \
  -H "Content-Type: application/json" \
  -d '{"title":"测试日程","is_test":true,"skip_conflict_check":true}'
```

**Expenses：**
```bash
curl -s -X POST http://localhost:8080/api/expenses \
  -H "Content-Type: application/json" \
  -d '{"amount":1,"category":"food","note":"测试记账","is_test":true}'
```

**Budgets：**
```bash
curl -s -X POST http://localhost:8080/api/budgets \
  -H "Content-Type: application/json" \
  -d '{"name":"测试预算","amount":100,"is_test":true}'
```

### 8.5 前端测试标记

前端界面也支持测试标记：
- **记账弹窗**：勾选「标记为测试」
- **预算编辑**：支持 `is_test` 字段

---

## 9. 推荐调试顺序（避免来回跳）

**先活性，再接口，再状态，再UI**：

1. 服务是否活着（backend）
2. API 是否返回正确 JSON
3. 前端 state 是否变化
4. 最后看 DOM 与样式

这个顺序能显著减少无效排查时间。

---

## 10. 维护建议

- 每次重构 UI/视图切换时，先跑"第 6 节回归矩阵"。
- 给关键节点加"存在性断言"（如 `daySlider`）可提前暴露问题。
- 发生线上事故时，先按第 2 节做 3 分钟快检，再深挖。
