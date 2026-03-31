# Schedule App 项目规范

## 1. 项目概述

**项目名称**: Schedule App  
**项目类型**: 移动端优先的日程管理 Web App  
**技术栈**: Python (aiohttp) + HTML/CSS/JavaScript (原生)  
**仓库**: https://github.com/eternitylarva1/schedule_app

### 核心功能
- 日视图、周视图、代办视图
- LLM 自然语言创建日程
- 任务拆解功能 (AI 分解复杂任务为子任务)
- 统计页面

---

## 2. 开发规范

### 2.1 提交规范
- **每次完成后必须提交并推送**: `git add . && git commit -m "描述" && git push origin main`
- **提交后必须通过 QQ 脚本通知用户**: 使用 `scripts/send_msg.py` 发送更新内容

### 2.2 QQ 通知格式
```
[计划助手更新通知]
- 更新内容1
- 更新内容2
- 更新内容3

仓库: https://github.com/eternitylarva1/schedule_app
```

---

## 3. 交互设计规范

### 3.1 下拉刷新
- **必须在页面顶部才能触发**: 检查 `scrollTop === 0`
- **必须能检测当前视图是否可滚动**: 如果视图可以滚动且不在顶部，不触发刷新
- **阻力系数**: 0.3 (不要过于灵敏)
- **触发阈值**: 30px visual 以上才触发刷新
- **拖动时禁用**: 拖动日程边缘调整时间时，禁止触发下拉刷新

### 3.2 日视图拖动调整时间
- **默认关闭**: 在设置中提供开关，用户手动开启
- **边界检测**: 拖动时不能穿过其他日程
- **防止页面滚动**: 拖动时使用 `e.preventDefault()` 和 `{ passive: false }`
- **状态持久化**: 拖动后保存到服务器，切换视图后保持

### 3.3 代办视图
- **勾选反悔**: 点击已完成的项目可以撤销回到未完成
- **勾选样式**: 完成后 checkbox 变绿色，文字添加删除线，整体透明度降低
- **左滑操作**: 左滑显示编辑和删除按钮
- **数据同步**: 代办/日/周视图共享同一数据源

### 3.4 周视图
- **左侧时间轴**: 显示 0:00, 6:00, 12:00, 18:00, 24:00
- **点击事件**: 点击事件应显示详情弹窗
- **时间位置**: 按实际时间 positioning，不应堆叠

### 3.5 按钮样式
- **顶栏箭头**: 白色圆形背景
- **拆解按钮**: 绿色渐变背景
- **设置按钮**: 通用图标 ⚙️

### 3.6 弹窗
- **禁止使用浏览器原生 alert/confirm**: 使用自定义模态框
- **样式**: 移动端友好的圆角、居中、带 backdrop

---

## 4. 功能优先级

### 高优先级
- [x] 日/周/代办视图切换
- [x] LLM 自然语言创建日程
- [x] 记住上一次视图 (localStorage)
- [x] Pull-to-refresh 优化
- [x] 设置页面 - 拖动调整时间开关

### 中优先级
- [x] 任务拆解功能
- [x] 周视图时间轴
- [x] 周视图事件点击详情

### 待修复/优化
- [ ] 拖动调整时间功能 (目前不稳定，默认关闭)
- [ ] 日视图拖动边界检测优化

---

## 5. 文件结构

```
schedule_app/
├── backend/
│   ├── main.py          # aiohttp 服务器入口
│   ├── routes.py        # API 路由
│   ├── db.py            # SQLite 操作
│   ├── models.py        # 数据模型
│   ├── llm_service.py  # LLM 集成
│   └── time_parser.py   # 时间解析
├── frontend/
│   ├── index.html       # 主页面 HTML
│   └── static/
│       ├── app.js      # 前端逻辑
│       └── style.css   # 样式
├── requirements.txt     # Python 依赖
└── .gitignore
```

---

## 6. 启动方式

```bash
cd schedule_app
pip install -r requirements.txt
python backend/main.py
# 访问 http://localhost:8080
```

---

## 7. 用户通知脚本

位置: `astrbot_plugin_planner/scripts/send_msg.py`

使用方式:
```bash
python -c "
import requests
import json

payload = {
    'message_type': 'private',
    'user_id': 2674610176,
    'message': '更新内容'
}
data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
requests.post('http://127.0.0.1:3000/send_private_msg', data=data, 
    headers={'Content-Type': 'application/json; charset=utf-8'})
"
```

---

## 8. 注意事项

1. **不要在生产环境暴露 API Key**: LLM key 应从环境变量读取
2. **移动端优先**: 所有交互优先考虑触摸操作
3. **性能**: 避免频繁的 API 调用，使用本地状态管理
4. **错误处理**: 所有 API 调用应有 try-catch 和用户提示