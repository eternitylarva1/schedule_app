# Schedule App API 文档

> 移动端优先的日程管理 Web App API  
> 基础 URL: `http://localhost:8080`  
> 所有请求默认端口: 8080

## 概述

本 API 提供日程、目标、笔记、记账等功能的 CRUD 操作，以及基于 LLM 的自然语言创建和任务拆解能力。

**特性**：
- RESTful API 设计
- CORS 已开启（支持跨域请求）
- 自然语言解析创建日程/记账
- AI 任务拆解

---

## 认证

> ⚠️ 当前版本**暂无认证机制**，请仅在内网环境使用或自行添加认证层。

---

## 通用说明

### 请求格式

- Header: `Content-Type: application/json`
- Body: JSON 格式

### 响应格式

```json
{
  "code": 0,
  "data": { ... }
}
```

| code | 说明 |
|------|------|
| 0 | 成功 |
| 非0 | 失败 |

### 时间格式

- ISO 8601: `2026-04-20T10:00:00`
- 日期: `2026-04-20`

### 通用查询参数

| 参数 | 说明 |
|------|------|
| `date` | 筛选日期，支持 `today`、`week`、`month` 或具体日期 `YYYY-MM-DD` |

---

## 日程 (Events)

### 获取日程列表

```
GET /api/events
```

**查询参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| `date` | string | 筛选日期，`today`/`week`/`month`/具体日期 |

**示例**：
```bash
curl http://localhost:8080/api/events?date=today
```

**响应**：
```json
{
  "code": 0,
  "data": [
    {
      "id": 1,
      "title": "团队会议",
      "start_time": "2026-04-20T10:00:00",
      "end_time": "2026-04-20T11:00:00",
      "all_day": false,
      "status": "pending",
      "category_id": "work",
      "reminder_enabled": true,
      "reminder_minutes": 5
    }
  ]
}
```

---

### 创建日程

```
POST /api/events
```

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `title` | string | ✅ | 日程标题 |
| `start_time` | string | ✅ | 开始时间 (ISO 8601) |
| `end_time` | string | ❌ | 结束时间 |
| `all_day` | boolean | ❌ | 是否全天，默认 false |
| `category_id` | string | ❌ | 分类，如 `work`、`study` |
| `reminder_enabled` | boolean | ❌ | 是否提醒，默认 false |
| `reminder_minutes` | integer | ❌ | 提前分钟数，默认 5 |

**示例**：
```bash
curl -X POST http://localhost:8080/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "title": "团队会议",
    "start_time": "2026-04-20T10:00:00",
    "end_time": "2026-04-20T11:00:00",
    "category_id": "work"
  }'
```

---

### 更新日程

```
PUT /api/events/{id}
```

**请求体**：同创建，支持部分更新

**示例**：
```bash
curl -X PUT http://localhost:8080/api/events/1 \
  -H "Content-Type: application/json" \
  -d '{"title": "更新后的标题"}'
```

---

### 删除日程（软删除）

```
DELETE /api/events/{id}
```

删除后进入垃圾桶，可从垃圾桶恢复。

**示例**：
```bash
curl -X DELETE http://localhost:8080/api/events/1
```

**响应**：
```json
{"code": 0, "data": {"deleted": true}}
```

---

### 标记完成

```
PUT /api/events/{id}/complete
```

---

### 取消完成

```
PUT /api/events/{id}/uncomplete
```

---

## 目标 (Goals)

### 获取目标列表

```
GET /api/goals
```

**查询参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| `horizon` | string | 筛选视野，`short`/`semester`/`long` |

---

### 创建目标

```
POST /api/goals
```

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `title` | string | ✅ | 目标标题 |
| `description` | string | ❌ | 目标描述 |
| `horizon` | string | ❌ | 视野范围，默认 `short` |
| `start_date` | string | ❌ | 开始日期 |
| `end_date` | string | ❌ | 结束日期 |
| `start_time` | string | ❌ | 开始时间（具体时间） |
| `end_time` | string | ❌ | 结束时间（具体时间） |
| `parent_id` | integer | ❌ | 父目标 ID（用于创建子目标） |

---

### 更新目标

```
PUT /api/goals/{id}
```

---

### 删除目标

```
DELETE /api/goals/{id}
```

软删除，包含所有子目标。

---

### AI 讨论目标

```
POST /api/goals/ai/discuss
```

使用 LLM 与目标进行对话，获取任务拆解建议。

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `goal_id` | integer | ✅ | 目标 ID |
| `message` | string | ✅ | 对话内容 |
| `user_context` | string | ❌ | 用户现状背景 |

**响应**：
```json
{
  "code": 0,
  "data": {
    "reply": "根据你的目标，我建议...",
    "subtasks": [
      {"title": "子任务1", "horizon": "short"},
      {"title": "子任务2", "horizon": "short"}
    ]
  }
}
```

---

## 笔记 (Notes)

### 获取笔记

```
GET /api/notes
```

---

### 创建笔记

```
POST /api/notes
```

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `title` | string | ✅ | 笔记标题 |
| `content` | string | ❌ | 笔记内容（支持 Markdown） |
| `group_id` | integer | ❌ | 分组 ID |

---

### 更新笔记

```
PUT /api/notes/{id}
```

---

### 删除笔记

```
DELETE /api/notes/{id}
```

软删除。

---

### AI 聊天

```
POST /api/notes/{id}/chat
```

与笔记内容对话。

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `message` | string | ✅ | 问题内容 |

---

## 记账 (Expenses)

### 获取记账列表

```
GET /api/expenses
```

**查询参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| `start_date` | string | 开始日期 |
| `end_date` | string | 结束日期 |
| `category` | string | 分类筛选 |

---

### 创建记账

```
POST /api/expenses
```

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `amount` | number | ✅ | 金额 |
| `category` | string | ✅ | 分类 |
| `note` | string | ❌ | 备注 |
| `date` | string | ❌ | 日期，默认今天 |

**示例**：
```bash
curl -X POST http://localhost:8080/api/expenses \
  -H "Content-Type: application/json" \
  -d '{"amount": 25.5, "category": "food", "note": "午餐"}'
```

---

### 更新记账

```
PUT /api/expenses/{id}
```

---

### 删除记账

```
DELETE /api/expenses/{id}
```

软删除。

---

### 记账统计

```
GET /api/expenses/stats
```

**查询参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| `start_date` | string | 开始日期 |
| `end_date` | string | 结束日期 |

---

## 垃圾桶 (Trash)

### 获取垃圾桶内容

```
GET /api/trash
```

**响应**：
```json
{
  "code": 0,
  "data": {
    "events": [...],
    "goals": [...],
    "notes": [...],
    "expenses": [...]
  }
}
```

---

### 获取垃圾桶数量

```
GET /api/trash/count
```

---

### 恢复项目

```
POST /api/trash/{type}/{id}/restore
```

**路径参数**：

| 参数 | 说明 |
|------|------|
| `type` | 项目类型：`event`/`goal`/`note`/`expense` |
| `id` | 项目 ID |

**示例**：
```bash
curl -X POST http://localhost:8080/api/trash/event/5/restore
```

---

### 彻底删除

```
DELETE /api/trash/{type}/{id}
```

**示例**：
```bash
curl -X DELETE http://localhost:8080/api/trash/event/5
```

---

### 清空垃圾桶

```
DELETE /api/trash
```

永久删除所有已删除项目。

---

## LLM / AI

### 自然语言创建

```
POST /api/llm/create
```

输入自然语言，自动创建日程。

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `text` | string | ✅ | 自然语言描述 |

**示例**：
```bash
curl -X POST http://localhost:8080/api/llm/create \
  -H "Content-Type: application/json" \
  -d '{"text": "明天下午3点开会讨论项目进度"}'
```

---

### 自然语言对话

```
POST /api/llm/chat
```

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `text` | string | ✅ | 自然语言输入 |

---

### 统一命令

```
POST /api/llm/command
```

支持创建日程、目标、记账等多种操作的统一入口。

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `text` | string | ✅ | 自然语言命令 |
| `user_context` | string | ❌ | 用户背景信息 |

---

### 任务拆解

```
POST /api/llm/breakdown
```

将复杂目标拆解为可执行的子任务。

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `text` | string | ✅ | 目标描述 |
| `user_context` | string | ❌ | 用户现状 |

---

### 解析记账

```
POST /api/llm/parse_expense
```

从自然语言中提取记账信息。

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `text` | string | ✅ | 自然语言记账描述 |

**示例**：
```bash
curl -X POST http://localhost:8080/api/llm/parse_expense \
  -H "Content-Type: application/json" \
  -d '{"text": "今天中午吃火锅花了150元"}'
```

---

## 统计与分类

### 获取统计数据

```
GET /api/stats
```

**查询参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| `date` | string | 筛选日期 |

---

### 获取分类列表

```
GET /api/categories
```

---

## 设置 (Settings)

### 获取设置

```
GET /api/settings
```

---

### 更新设置

```
PUT /api/settings/{key}
```

**请求体**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `value` | string | 设置值 |

---

### 清理测试数据

```
POST /api/settings/cleanup_test_entries
```

一键删除所有测试/示例/demo 相关的数据。

---

## 数据模型

### Event (日程)

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | integer | 唯一标识 |
| `title` | string | 标题 |
| `description` | string | 描述 |
| `start_time` | datetime | 开始时间 |
| `end_time` | datetime | 结束时间 |
| `all_day` | boolean | 全天日程 |
| `category_id` | string | 分类 |
| `status` | string | `pending`/`completed` |
| `reminder_enabled` | boolean | 开启提醒 |
| `reminder_minutes` | integer | 提前分钟数 |
| `is_deleted` | boolean | 是否已删除 |
| `deleted_at` | datetime | 删除时间 |
| `goal_id` | integer | 关联目标 ID |

### Goal (目标)

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | integer | 唯一标识 |
| `title` | string | 标题 |
| `description` | string | 描述 |
| `horizon` | string | `short`/`semester`/`long` |
| `status` | string | `active`/`done`/`cancelled` |
| `start_date` | date | 开始日期 |
| `end_date` | date | 结束日期 |
| `start_time` | datetime | 具体开始时间 |
| `end_time` | datetime | 具体结束时间 |
| `parent_id` | integer | 父目标 ID |
| `root_goal_id` | integer | 根目标 ID |
| `is_deleted` | boolean | 是否已删除 |
| `deleted_at` | datetime | 删除时间 |

### Note (笔记)

| 字段 | 类型 | 说明 |
|------|------|------|------|
| `id` | integer | 唯一标识 |
| `title` | string | 标题 |
| `content` | string | 内容 (Markdown) |
| `group_id` | integer | 分组 ID |
| `is_deleted` | boolean | 是否已删除 |
| `deleted_at` | datetime | 删除时间 |

### Expense (记账)

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | integer | 唯一标识 |
| `amount` | number | 金额 |
| `category` | string | 分类 |
| `note` | string | 备注 |
| `date` | date | 日期 |
| `is_deleted` | boolean | 是否已删除 |
| `deleted_at` | datetime | 删除时间 |

---

## 错误码

| code | 说明 |
|------|------|
| 0 | 成功 |
| 400 | 请求参数错误 |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |

---

## 联系方式

- 项目地址: https://github.com/eternitylarva1/schedule_app
