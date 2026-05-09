# Schedule App 功能调试流程（Debug Workflow）

> 目标：建立一套**可重复、可定位**的调试流程，覆盖本项目主要功能（日历/待办/规划/记事本/LLM/提醒）。

## 目录

1. [适用范围](#0-适用范围)
2. [调试总流程](#1-调试总流程统一模板)
3. [快速健康检查](#2-快速健康检查3-分钟)
4. [分层调试清单](#3-分层调试清单定位根因)
5. [功能级调试流程](#4-功能级调试流程按模块)
6. [常见故障](#5-常见故障-直接处理策略)
7. [标准收尾动作](#6-标准收尾动作修复完成后)
8. [测试数据清理](#7-测试数据清理)
9. [维护建议](#8-维护建议)

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

### 2.4 浏览器自动化操作（browser-harness skill）

使用 `browser-harness` skill 进行前端自动化操作。

**第一步：优先连接已有 Chrome**
```bash
export BU_CDP_URL="http://localhost:9222"  # 或 9228
browser-harness -c 'print(page_info())'
```
如果返回页面信息，说明已有 Chrome 可用。

**第二步：无可用 Chrome 时启动新的**

用 `run_background_process` 启动 Chrome（后台运行，不是前台 `&`）：
```bash
run_background_process(
    command="chromium --remote-debugging-port=9227 --user-data-dir=/tmp/chrome-test",
    title="Chrome Debug"
)
# 或指定端口
run_background_process(
    command="chromium --remote-debugging-port=9228 --user-data-dir=/tmp/chrome-test",
    title="Chrome Debug"
)
```

**验证 Chrome 存活：**
```bash
lsof -i:9227  # 检查端口是否在监听
browser-harness -c 'print(page_info())'
# 正常返回: {'url': '...', 'title': '...', 'w': xxx, 'h': xxx}
```

**Setup（连接 Chrome）：**
```bash
export BU_CDP_URL="http://localhost:9227"  # Linux/Mac
# Windows: $env:BU_CDP_URL = "http://127.0.0.1:9227"
```

---

## 核心工作流程（循环）

```
┌─────────────────────────────────────────────────────────┐
│ 探索页面 → 获取页面文本/元素列表                         │
│    ↓                                                    │
│ 根据信息决定操作                                         │
│    ↓                                                    │
│ 执行操作（js() click / value / ...）                    │
│    ↓                                                    │
│ 验证结果（js()查询状态 / 截图读取 / API验证）            │
│    ↓                                                    │
│ 结果符合预期? ──否──→ 重新探索页面 → 继续操作            │
│    │                                                  │
│   是                                                   │
│    ↓                                                    │
│ 任务完成? ──否──→ 继续探索 → 操作 → 验证（循环）       │
│    │                                                  │
│   是                                                   │
└─────────────────────────────────────────────────────────┘
```

---

## 1. 探索页面（第一步必做）

**目的**：了解页面当前有什么元素

```bash
# 方法A: 获取页面所有文本（初步了解）
page_text = js('document.body.innerText')

# 方法B: 获取元素列表（精确找到目标）
elements = js('''
(function() {
  const result = [];
  document.querySelectorAll("button, a, div, span, input").forEach(function(el) {
    const text = el.textContent.trim().replace(/\\s+/g, " ");
    if (text && text.length > 0) {
      result.push({tag: el.tagName, text: text.substring(0, 50), class: el.className});
    }
  });
  return result;
})()
''')
print(elements)
```

---

## 2. 执行操作（第二步）

### 常用操作代码

| 操作 | 代码 |
|------|------|
| 点击元素 | `js('element.click()')` |
| 获取输入值 | `js('document.getElementById("id").value')` |
| 设置输入值 | `js('document.getElementById("id").value = "text"')` |
| 勾选checkbox | `js('document.getElementById("id").click()')` |
| 检查是否选中 | `js('document.getElementById("id").checked')` |
| 检查是否禁用 | `js('document.getElementById("id").disabled')` |
| 检查display | `js('window.getComputedStyle(element).display')` |
| 滚动区域 | `js('document.querySelector(".modal-body").scrollTop = 400')` |
| 按ESC关闭弹窗 | `press_key("Escape")` |

### 代码示例

```bash
# 已知元素时直接操作
js('document.querySelector(".btn-save").click()')

# 未知元素时先找到再操作
js('''
(function() {
  const items = document.querySelectorAll(".expense-item");
  for (let item of items) {
    if (item.textContent.includes("目标文本")) {
      item.click();
      break;
    }
  }
})()
''')

# 找第N个匹配的（索引从0开始）
js('''
(function() {
  const items = document.querySelectorAll(".item");
  let count = 0;
  for (let item of items) {
    if (item.textContent.includes("目标")) {
      if (count === 1) {  // 第2个
        item.click();
        break;
      }
      count++;
    }
  }
})()
''')
```

---

## 3. 验证结果（第三步）

```bash
# 方法A: js()查询状态
result = js('document.getElementById("result").value')
if result != 'expected':
    # 验证失败，重新探索
    page_text = js('document.body.innerText')

# 方法B: 截图读取（找不到元素时用）
capture_screenshot()
read /tmp/shot.png  # AI自行读取判断

# 方法C: API验证后端
curl -s http://localhost:8080/api/endpoint
```

---

## 4. 标准等待

```bash
import time; time.sleep(0.3)  # 简单操作后
import time; time.sleep(0.5)  # 涉及页面跳转后
```

---

## 5. 完整执行模板

```bash
browser-harness -c "
print('=== 任务开始 ===')

# ===== 步骤1: 探索页面 =====
page_text = js('document.body.innerText')
print('页面内容预览:', page_text[:300])

# ===== 步骤2: 找到并操作目标 =====
# 点击目标元素
js('''
(function() {
  const items = document.querySelectorAll(\".target\");
  for (let item of items) {
    if (item.textContent.includes(\"目标\")) {
      item.click();
      break;
    }
  }
})()
''')
import time; time.sleep(0.5)

# ===== 步骤3: 验证结果 =====
# 验证操作是否成功
modal_display = js('window.getComputedStyle(document.getElementById(\"modal\")).display')
print('Modal状态:', modal_display)

# ===== 步骤4: 截图读取（备用） =====
capture_screenshot()
# read /tmp/shot.png

# ===== 步骤5: API验证（最终确认） =====
# curl -s http://localhost:8080/api/endpoint

print('=== 任务完成 ===')
"
```

---

## 6. 注意事项

| 注意事项 | 说明 |
|---------|------|
| **第一步必做** | 先探索页面，再决定操作 |
| **验证是核心** | 每步操作后都要验证，不验证不知道成功没 |
| **验证失败要重试** | 操作没生效时，重新探索页面判断状态 |
| **截图是验证手段之一** | 不是必须，只有js()不行时才用 |
| **用js()内直接.click()** | 不用 click_at_xy() 坐标点击 |
| **IIFE写法** | 避免变量名冲突：`(function() { ... })()` |
| **用 goto_url()** | 在自动化测试标签页中导航，不会覆盖用户标签 |

| 问题现象 | 原因 | 解决方案 |
|---------|------|----------|
| 命令执行后卡住 | CDP 未连接 | 确认 Chrome 远程调试已启动 |
| 页面无法加载 | 端口被占用 | 检查端口是否被占用 |
| js()找不到元素 | 元素还没渲染 | 加 wait_for_load() 等待 |
| 操作没生效 | 元素状态不对 | 重新探索页面判断 |
| js()返回空 | 输出被截断 | 用 && echo "done" 确认执行成功 |

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

## 6. 标准收尾动作（修复完成后）

1. **清理测试数据**
   - 方法见第 7 节「测试数据清理」
2. **提交代码**（仅在确认修复后）
3. **推送**
4. **重启后端**
5. **验活 API**：

```bash
curl -s http://localhost:8080/api/events?date=today
```

6. **发送更新通知（QQ）**

使用项目目录的 `send_message.py` 发送私聊消息：

```python
import sys
sys.path.insert(0, '/home/gaoming/AI_Planner')
from send_message import send_private_message

result = send_private_message(
    user_id=2674610176,
    message='''[计划助手更新通知]
- 修复点1
- 修复点2
- 验证结果

仓库: https://github.com/eternitylarva1/schedule_app'''
)
print(result)
```

或直接运行脚本（发送默认测试消息）：

```bash
python3 /home/gaoming/AI_Planner/send_message.py
```

通知模板：

```
[计划助手更新通知]
- 修复点1
- 修复点2
- 验证结果

仓库: https://github.com/eternitylarva1/schedule_app
```

---

## 7. 测试数据清理

### 7.1 一键清理（API）

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
    "budgets_deleted": 1,
    "goals_deleted": 0
  }
}
```

### 7.2 清理范围

| 类型 | 关键词匹配 | is_test 标记 |
|------|----------|--------------|
| Events | ✅ 标题含：测试/test/debug/demo/样例/示例/tmp/临时 | ✅ |
| Notes | ✅ 标题或内容含上述关键词 | - |
| Expenses | ✅ 备注含上述关键词 | ✅ |
| Budgets | - | ✅ |
| Goals | ✅ 标题含上述关键词 | ✅ |

### 7.1 创建测试数据时标记

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

### 7.2 前端测试标记

前端界面也支持测试标记：
- **记账弹窗**：勾选「标记为测试」
- **预算编辑**：支持 `is_test` 字段

---

## 8. 维护建议

- 调试流程详细说明见本文件各章节
- 发生问题时，先按第 2 节做 3 分钟快检，再深挖
