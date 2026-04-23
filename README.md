# Schedule App - 智能日程管理

移动端优先的日程管理 Web App，支持自然语言创建日程、AI 任务拆解、目标规划、笔记和记账功能。

## 功能特点

### 📅 日历视图
- **日/周/月视图切换**：在日历 Tab 内通过分段控制器切换
- **拖动调整时间**：在设置中开启后，可在日视图中拖动任务边缘调整时间
- **下拉刷新**：在页面顶部向下拉即可刷新数据
- **当前时间指示线**：日视图和周视图中显示当前时间位置

### ✅ 代办视图
- 勾选完成/反悔撤销
- 左滑编辑或删除
- 长按进入多选模式，批量操作
- 支持按日期分组显示

### 🎯 规划视图
- 短期/学期/长期目标分层管理
- AI 目标规划对话：通过几个问题帮你理清思路，拆解为可执行的小任务
- 任务拆解：AI 分解复杂任务为子任务

### 📓 记事本
- **笔记**：支持分组管理、AI 对话整理
- **记账**：AI 智能解析记账内容（如"中午吃面15块"）

### 🤖 AI 功能
- 自然语言创建日程（如"明天上午9点开会"）
- 任务拆解
- 记账智能解析
- 笔记 AI 对话整理

## 技术栈

- **后端**：Python (aiohttp) + SQLite
- **前端**：原生 HTML/CSS/JavaScript（移动端优先）
- **AI**：支持多种 LLM 接口

## 快速开始

### 1. 安装依赖

```bash
cd schedule_app
pip install -r requirements.txt
```

### 2. 启动服务

```bash
python -m backend.main
```

### 3. 访问

打开浏览器访问 http://localhost:8080

## 项目结构

```
schedule_app/
├── backend/
│   ├── main.py              # aiohttp 服务器入口
│   ├── routes.py            # API 路由
│   ├── db.py                # SQLite 操作
│   ├── models.py            # 数据模型
│   ├── llm_service.py       # LLM 集成
│   ├── time_parser.py       # 时间解析
│   └── reminder_service.py  # 提醒服务
├── frontend/
│   ├── index.html           # 主页面 HTML
│   ├── service-worker.js    # PWA Service Worker
│   └── static/
│       ├── style.css        # 样式
│       ├── app.js           # 入口加载器
│       └── js/
│           ├── main.js          # 主逻辑
│           └── core/            # 核心模块
├── requirements.txt
└── .gitignore
```

## 开发规范

- 遵循 `SPEC.md` 中的交互设计规范
- 使用 `DEBUG_WORKFLOW.md` 中的调试流程
- 提交前必须通过调试回归测试
- 提交后通过 QQ 发送更新通知

## API 接口文档

基础 URL: `http://localhost:8080/api`

所有接口返回格式：
```json
{
  "code": 0,       // 0 表示成功，非 0 表示错误
  "data": {...},   // 返回数据
  "message": "..." // 错误信息（仅错误时）
}
```

---

### 📅 日历事件 (Events)

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/events?date=today\|week\|month\|all\|YYYY-MM-DD` | 获取事件列表 |
| POST | `/events` | 创建事件 |
| PUT | `/events/{id}` | 更新事件 |
| DELETE | `/events/{id}` | 删除事件 |
| PUT | `/events/{id}/complete` | 标记完成 |
| PUT | `/events/{id}/uncomplete` | 撤销完成 |
| GET | `/categories` | 获取事件分类 |

**创建事件 POST /events**
```json
{
  "title": "会议",
  "start_time": "2026-04-23T10:00:00",
  "end_time": "2026-04-23T11:00:00",
  "category_id": "work",
  "reminder_enabled": true
}
```

---

### 🎯 目标规划 (Goals)

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/goals?horizon=short\|semester\|long` | 获取目标列表 |
| POST | `/goals` | 创建目标 |
| PUT | `/goals/{id}` | 更新目标 |
| DELETE | `/goals/{id}` | 删除目标 |
| GET | `/goals/{id}/tree` | 获取目标完整树 |
| GET | `/goals/{id}/subtasks` | 获取子任务 |
| GET | `/goals/{id}/conversations` | 获取对话历史 |
| POST | `/goals/{id}/conversations` | 添加对话消息 |
| POST | `/goals/ai/discuss` | AI 目标规划对话 |

---

### 📓 笔记 (Notes)

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/notes` | 获取所有笔记 |
| POST | `/notes` | 创建笔记 |
| PUT | `/notes/{id}` | 更新笔记 |
| DELETE | `/notes/{id}` | 删除笔记 |
| GET | `/notes/{note_id}/conversations` | 获取对话历史 |
| POST | `/notes/{note_id}/chat` | 与 AI 对话 |
| DELETE | `/notes/{note_id}/conversations` | 清空对话历史 |

### 📂 笔记分组 (Note Groups)

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/note-groups` | 获取所有分组 |
| POST | `/note-groups` | 创建分组 |
| PUT | `/note-groups/{id}` | 更新分组 |
| DELETE | `/note-groups/{id}` | 删除分组 |

---

### 💰 记账 (Expenses)

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/expenses?date=month` | 获取支出记录 |
| POST | `/expenses` | 创建支出 |
| PUT | `/expenses/{id}` | 更新支出 |
| DELETE | `/expenses/{id}` | 删除支出 |
| GET | `/expenses/stats?date=month` | 获取支出统计 |
| GET | `/expenses/categories` | 获取支出分类 |

**创建支出 POST /expenses**
```json
{
  "amount": 15.5,
  "category": "food",
  "note": "午餐",
  "budget_id": 1
}
```

---

### 🎒 预算 (Budgets)

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/budgets` | 获取所有预算（含已用/剩余） |
| POST | `/budgets` | 创建预算 |
| PUT | `/budgets/{id}` | 更新预算 |
| DELETE | `/budgets/{id}` | 删除预算 |
| GET | `/budgets/{id}/expenses` | 获取某预算下的支出 |

**创建预算 POST /budgets**
```json
{
  "name": "毕业设计",
  "amount": 5000,
  "color": "#3B82F6"
}
```

**GET /budgets 返回示例**
```json
{
  "id": 1,
  "name": "毕业设计",
  "amount": 5000,
  "spent": 150,
  "remaining": 4850,
  "color": "#3B82F6"
}
```

---

### 🤖 AI 接口 (LLM)

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/llm/chat` | 解析自然语言为日程（不创建） |
| POST | `/llm/create` | 解析并创建日程 |
| POST | `/llm/command` | 统一命令执行（如"删除4月5号的代办"） |
| POST | `/llm/breakdown` | AI 任务拆解 |
| POST | `/llm/parse_expense` | AI 记账解析 |

**POST /llm/create 示例**
```json
{
  "text": "明天上午9点开会"
}
```

---

### ⚙️ 设置 (Settings)

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/settings` | 获取所有设置 |
| PUT | `/settings/{key}` | 更新设置 |
| POST | `/settings/cleanup_test_entries` | 清理测试数据 |

---

### 🔧 AI 提供商 (AI Providers)

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/ai-providers` | 获取所有配置 |
| POST | `/ai-providers` | 创建配置 |
| PUT | `/ai-providers/{id}` | 更新配置 |
| DELETE | `/ai-providers/{id}` | 删除配置 |
| PUT | `/ai-providers/{id}/activate` | 激活配置 |

---

### 📊 统计 (Stats)

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/stats?date=today\|week\|month` | 获取完成率统计 |

---

## 许可证

MIT
