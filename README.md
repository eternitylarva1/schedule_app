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

## 许可证

MIT
