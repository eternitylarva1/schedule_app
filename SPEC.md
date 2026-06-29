# Schedule App 项目规范（现状文档）

> **本文档描述项目的当前状态**，而非理想目标。如需修改请在对应位置标注 `[待改]` 标签。

## 目录

1. [项目概述](#1-项目概述)
2. [开发规范](#2-开发规范)
3. [交互设计规范](#3-交互设计规范)
4. [功能优先级与实现状态](#4-功能优先级与实现状态)
5. [文件结构（现状）](#5-文件结构现状)
6. [启动方式](#6-启动方式)
7. [用户通知](#7-用户通知)
8. [注意事项](#8-注意事项)

---

## 1. 项目概述

**项目名称**: Schedule App  
**项目类型**: 移动端优先的日程管理 Web App  
**技术栈**: Python (aiohttp 3.x) + SQLite + HTML/CSS/JavaScript (原生)  
**仓库**: https://github.com/eternitylarva1/schedule_app

### 核心功能
- **日历**: 日/周/月三视图（日历 Tab 内分段控制切换）
- **待办**: 独立 Tab，事件列表 + 勾选/反悔/左滑操作
- **规划**: 独立 Tab，目标管理 + AI 规划对话 + 任务拆解
- **记事本**: 独立 Tab，笔记（内联编辑器 + AI 抽屉对话）+ 记账/预算
- **LLM 入口**: 底部输入栏，自然语言创建/修改/删除日程
- **设置**: AI 提供商配置、User Contexts、QQ 提醒、数据清理、操作历史查看等

---

## 2. 开发规范

### 2.1 提交规范
- **每次完成后必须提交并推送**: `git add . && git commit -m "描述" && git push origin main`
- **提交后必须通过 QQ 通知用户**

### 2.2 QQ 通知格式
```
[计划助手更新通知]
- 更新内容1
- 更新内容2

仓库: https://github.com/eternitylarva1/schedule_app
```

### 2.3 调试规范（强制）

1. **统一调试流程必须执行**
   - 所有功能开发/修复都必须遵循：`DEBUG_WORKFLOW.md`
   - 禁止跳过流程：复现 → 分层定位 → API校验 → 状态校验 → 修复 → 验证

2. **新增功能后必须同步更新调试规范**
   - 每次新增功能后，必须在调试文档中补充对应检查项

3. **调试收尾动作（与发布动作绑定）**
   - 完成调试后才允许提交推送
   - 提交后必须重启后端并验活 API
   - 最后发送 QQ 更新通知

4. **浏览器调试工具要求**
   - 使用 `browser-harness`（已安装为系统命令）
   - 连接用户已有的 Chrome 远程调试端口（如 `localhost:9227`）
   - 调试时至少包含：
     - 页面导航与关键交互复现
     - 页面数据提取验证关键节点是否渲染
     - 检查前端报错

---

## 3. 交互设计规范

### 3.1 下拉刷新
- **必须在页面顶部才能触发**: 检查 `scrollTop === 0`
- **必须能检测当前视图是否可滚动**: 如果视图可以滚动且不在顶部，不触发刷新
- **阻力系数**: 0.3
- **触发阈值**: 30px visual 以上才触发刷新
- **拖动时禁用**: 拖动日程边缘调整时间时，禁止触发下拉刷新

### 3.2 日视图拖动调整时间
- **默认关闭**: 在设置中提供开关，用户手动开启
- **边界检测**: 拖动时不能穿过其他日程（当前实现不稳定）
- **防止页面滚动**: 拖动时使用 `e.preventDefault()` 和 `{ passive: false }`
- **状态持久化**: 拖动后保存到服务器，切换视图后保持

### 3.3 待办视图
- **勾选反悔**: 点击已完成的项目可以撤销回到未完成
- **勾选样式**: 完成后 checkbox 变绿色，文字添加删除线，整体透明度降低
- **左滑操作**: 左滑显示编辑和删除按钮
- **数据同步**: 待办/日/周视图共享同一数据源

### 3.4 周视图
- **左侧时间轴**: 显示 0:00, 2:00, 4:00, ... 24:00（每2小时）
- **点击事件**: 点击事件应显示详情弹窗
- **时间位置**: 按实际时间 positioning，不应堆叠
- **当前时间指示线**: 实时显示当前时间位置

### 3.5 弹窗
- **禁止使用浏览器原生 alert/confirm**: 使用自定义模态框
- **样式**: 移动端友好的圆角、居中、带 backdrop

### 3.6 移动端优先
- 所有交互优先考虑触摸操作
- 底部 Tab 栏 4 个：日历 / 待办 / 规划 / 记事本
- 日历内分段控制：日/周/月

---

## 4. 功能优先级与实现状态

### ✅ 已实现
- 日/周/月视图切换（日历 Tab 内分段控制）
- 待办视图（独立 Tab，含勾选/反悔/左滑）
- 规划视图（独立 Tab，目标 CRUD + Timeline 甘特图）
- 记事本视图（独立 Tab，含笔记内联编辑 + 记账预算）
- LLM 自然语言创建/修改/删除日程（底部输入栏 + 队列处理）
- AI 规划对话（Goal Discuss 状态机 + 任务拆解 Breakdown）
- AI 笔记对话（笔记右侧抽屉）
- AI 提供商多配置管理 + 动态切换
- User Contexts（我的现状）
- QQ 提醒（任务前 1 分钟）
- Pull-to-refresh
- 记住上一次视图 (localStorage)
- 设置页面（含 AI 学习、数据备份/恢复、操作历史查看）
- 一键清理测试条目
- 预算管理（含周期滚转）
- PWA 支持（Service Worker）

### ⚠️ 已实现但不稳定
- 日视图拖动调整时间（默认关闭，边界检测待优化）

### 📋 规划中 / 待讨论
> 以下功能有设计方案但尚未实施

- **Notes 阶段 2**: 数据模型扩展（`is_pinned`/`color`/`is_archived` 字段）
- **Notes 阶段 3**: 双栏 UI 重构（类 Notion 的所见即所得编辑器）
- **Notes 阶段 4**: AI 抽屉整合（当前已实现抽屉，全浮窗已移除）
- **Notes 阶段 5**: 体验打磨（Optimistic update、骨架屏、空状态引导等）
- **AI UX 改进**: 流式输出、思考过程展示、Diff 对比、接受/拒绝机制、多版本建议（方案见 `SPEC_AI_UX.md`）

---

## 5. 文件结构（现状）

```
schedule_app/
├── backend/
│   ├── main.py                 # aiohttp 服务器入口
│   ├── models.py               # 数据模型（Event/Goal/Note/Expense/Budget 等）
│   ├── llm_service.py          # LLM 集成（OpenAI 兼容 API）
│   ├── time_parser.py          # 时间解析工具
│   ├── reminder_service.py     # 提醒服务（后台定时检查）
│   ├── restart_backend.py      # 后端重启脚本
│   ├── routes/                 # API 路由（12 个子模块）
│   │   ├── __init__.py         # facade, 暴露 setup_routes(app)
│   │   ├── _helpers.py         # 共享: json_response / error_response 等
│   │   ├── events.py / goals.py / notes.py
│   │   ├── expenses.py / budgets.py
│   │   ├── llm.py / settings.py / learning.py
│   │   ├── stats.py / backup.py / misc.py
│   ├── db/                     # SQLite 操作（12 个子模块）
│   │   ├── __init__.py         # facade, re-export 所有函数
│   │   ├── _connection.py      # DB_PATH + init_db + connect() 助手
│   │   ├── events.py / goals.py / notes.py / expenses.py / budgets.py
│   │   ├── settings.py / learning.py / cleanup.py / error_logs.py
│   │   ├── backup.py
│   ├── tools/                  # AI Agent 工具系统
│       ├── __init__.py + registry.py  # @tool 装饰器 + 注册器
│       ├── events.py / goals.py / notes.py / budgets.py
├── frontend/
│   ├── index.html              # SPA 入口
│   ├── manifest.json           # PWA manifest
│   ├── service-worker.js       # Service Worker
│   └── static/
│       ├── styles/             # CSS（20 个文件，按视图/组件组织）
│       │   ├── main.css        # 入口（@import 串起所有子文件）
│       │   ├── _tokens.css / _reset.css / _shared.css  # 基础层
│       │   ├── header.css / llm-input.css / modals.css
│       │   ├── calendar-*.css / todo.css / stats.css
│       │   ├── goals.css / notepad.css / notes.css / note-groups.css
│       │   └── settings.css / responsive.css
│       └── js/
│           ├── main.js                 # 编排层: 视图切换 + 事件绑定 + 初始化
│           ├── core/
│           │   ├── state-elements.js   # 状态与 DOM 元素映射
│           │   ├── utils.js            # 工具函数
│           │   ├── api-toast.js        # API 调用封装 + Toast
│           │   └── drag.js             # 拖拽处理
│           ├── calendar-views.js       # 日/周/月视图渲染
│           ├── goals.js                # 规划: 目标 CRUD + Timeline + AI 讨论 + 拆解
│           ├── settings.js             # 设置: AI 提供商 / User Contexts / 历史管理等
│           ├── llm-queue.js            # LLM 队列: 输入提交 + 队列处理 + 失败恢复
│           ├── notepad.js              # 记事本主入口（路由、初始化）
│           ├── notes-list.js           # 笔记列表渲染 + 拖拽 + 分组
│           ├── note-editor.js          # 笔记内联编辑器 + AI /a 指令
│           ├── note-ai.js              # AI 抽屉对话
│           ├── expense.js              # 记账模块
│           ├── budget.js               # 预算管理
│           └── selection.js            # 多选模式
├── requirements.txt            # Python 依赖
├── CLAUDE.md                   # AI 编程指引
├── SPEC.md                     # 本文档
├── PLAN.md                     # 拆分计划
└── DEBUG_WORKFLOW.md           # 调试流程
```

---

## 6. 启动方式

```bash
cd schedule_app
pip install -r requirements.txt
python -m backend.main
# 访问 http://localhost:8080
```

---

## 7. 用户通知

QQ 通知通过 NapCat HTTP API 发送，skill 封装在 `~/.opencode/skills/qq-notify/`。

使用方式:
```python
import sys
sys.path.insert(0, '~/.opencode/skills/qq-notify')
from send_message import send_private_message

send_private_message(
    user_id=2674610176,
    message='[计划助手更新通知]\n- 更新内容\n\n仓库: https://github.com/eternitylarva1/schedule_app'
)
```

---

## 8. 注意事项

1. **不要暴露 API Key**: LLM key 优先从环境变量（`LLM_API_KEY`）读取
2. **移动端优先**: 所有交互优先考虑触摸操作
3. **性能**: 避免频繁的 API 调用，使用本地状态管理
4. **错误处理**: 所有 API 调用应有 try-catch 和用户提示
5. **缓存清除**: 前端文件更新后记得递增 `?v=` 版本号避免浏览器缓存
6. **模块命名规则**: 每个前端模块通过 `window.ScheduleAppXxx` 命名空间导出
7. **调试执行**: 调试流程以 `DEBUG_WORKFLOW.md` 为唯一基线
8. **跨文件修改**: 涉及多个模块的改动（如加字段）需排查所有 CRUD 路径和 payload 构造点

---

## 9. 时间轴总视图开发教训（2026-06-23）

时间轴 Gantt 视图是近期改动最大的功能，以下是反复踩坑后的设计原则和排查清单。

### 9.1 缓存刷新三板斧

浏览器缓存 + Service Worker 双缓存常导致"代码改了但不生效"。每次 JS/CSS 改动后必须：

1. **递增 HTML 版本号**: `index.html` 中 `?v=` 参数
2. **如果文件列表有变化**: 同步更新 `service-worker.js` 的 `CACHE_NAME` 和 `STATIC_ASSETS` 的 `?v=`
3. **验证**: `curl -s http://localhost:8080/static/js/goals.js | grep "新增关键字"`

参见 `scripts/sync_sw_cache.py` 自动同步。

### 9.2 浏览器测试选择器验证

用 `querySelectorAll` 验证时，**CSS 类名必须与实际渲染的 HTML 一致**。不要凭记忆写选择器。

错误示例：
- 代码用 `.timeline-bar-dates-inline`，测试查 `.timeline-bar-dates` → 误报 MISSING
- 代码用 `.timeline-today-btn`，测试查 `.timeline-group-scroll-today` → 误报 not found

**正确做法**: 测试前先用 `element.innerHTML.substring(0,300)` 打印实际 HTML 结构。

### 9.3 设计稿 vs 施工结果核对

委托 @designer 产出后，**必须逐行对比设计稿和实际渲染**：

| 检查项 | 方法 |
|--------|------|
| DOM 结构层级 | `element.children[0].className` 递归 |
| 每行排版（几行） | `element.querySelectorAll(':scope > div').length` |
| 字体大小 | `getComputedStyle(el).fontSize` |
| 间距/padding | `getComputedStyle(el).padding` |
| 颜色 | `getComputedStyle(el).color` 或 `backgroundColor` |

不要只看 JS 数据正确就过。视觉还原度与数据正确性同等重要。

### 9.4 绝对定位必须有 x 和 y

使用 `position: absolute` 定位元素时，只设 `left/width` 不设 `top`，所有元素会堆叠在 `top: 0`。

**教训**: 每个 absolute 元素必须显式设 `top` 或 `bottom`，或用 JS 计算 `top: ${index * height}px`。

### 9.5 子树渲染完整性

渲染层级树时，必须验证**每个节点都能被独立展开**：

- 顶层节点有 `▶` 按钮 → ✅
- 子节点有 `▶` 按钮（当它有子级时）→ ❌ 最初遗漏
- 孙节点有 `▶` 按钮 → 如果深度限制为 2，则不需要

**教训**: 不要只给顶层加 toggle 按钮。写递归渲染时，toggle 按钮也应该是递归的。

### 9.6 时间跨度计算用日精度

`getMonthDiff()` 只到月粒度，同一个月内不同日期的任务宽度相同。

**教训**: 甘特条宽度计算用 `(endDate - startDate) / msPerDay` 的日精度，不要用月粒度。对于小时级任务，需要更细的刻度体系（见方案 A/B/C 讨论）。

### 9.7 列表视图展开后内容不可见

`.goal-children` 默认 `hidden`，添加子任务后 `renderGoalsList()` 重渲染，新内容在 DOM 但不可见。

**教训**: 任何"添加后刷新列表"的操作，必须在刷新前把父节点 ID 加入 `expandedGoalIds`。

### 9.8 已完成区域展开不滚动

完成后目标移入底部折叠区，展开时内容被推出视口。需要在展开时触发 `scrollIntoView()`。

**通用原则**: 任何折叠面板展开时，如果面板在视口外，应自动滚动到可见位置。
