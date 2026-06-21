# 笔记界面重构规划

> 本文档记录笔记（Notepad）模块重构的整体目标、分阶段规划、测试要求。
> **核心约束：每个阶段必须完成测试验证后才能进入下一阶段。**

---

## 目录

1. [背景与动机](#1-背景与动机)
2. [整体目标](#2-整体目标)
3. [目标交互](#3-目标交互)
4. [分阶段规划](#4-分阶段规划)
   - [阶段 1：清理死代码 + 架构修正](#阶段-1清理死代码--架构修正)
   - [阶段 2：数据模型扩展](#阶段-2数据模型扩展)
   - [阶段 3：新 UI 布局（双栏）](#阶段-3新-ui-布局双栏)
   - [阶段 4：AI 浮窗整合](#阶段-4ai-浮窗整合)
   - [阶段 5：体验打磨](#阶段-5体验打磨)
5. [每阶段必须完成的测试清单](#5-每阶段必须完成的测试清单)
6. [风险与缓解](#6-风险与缓解)
7. [范围外](#7-范围外)

---

## 1. 背景与动机

### 当前问题（基于 2026-06-20 全量探索）

| 类别 | 问题 | 影响 |
|------|------|------|
| **代码架构** | `renderNotesList` / `renderNoteItem` / 拖拽逻辑在 `main.js` 和 `notepad.js` **双份存在** | 220+ 行死代码，修改易遗漏 |
| **关注点混合** | `notepad.js` 1227 行装了 5 个特性：笔记渲染/CRUD、记账、AI 浮窗、拖拽、月份选择器 | 单文件过大，难维护 |
| **模态拆分** | `showNoteDetail` 和 `showNoteEdit` 在 `main.js` 里，剩余在 `notepad.js` | 模块边界被打破 |
| **数据模型** | 没有 `is_pinned` / `color` / `is_archived`，`sort_order` 字段在但拖拽不改它 | 笔记无法区分重要性 |
| **交互繁琐** | 编辑要：点笔记 → 弹详情 → 弹编辑 → 修改 → 关闭（两步模态） | 移动端 3 次点击 + 1 次关闭 |
| **无搜索** | 后端有 `get_notes_by_title`，前端没 UI | 笔记多了找不到 |
| **无 optimistic update** | 每次 CRUD 都要等服务端 | 移动端延迟感 |
| **AI 浮窗无目标也显示** | 笔记 Tab 上永远显示 🤖，没选笔记时也能点 | 误触 |
| **删除分组静默** | 删组后笔记移到「未分组」，无 undo | 误操作无法挽回 |

### 重构原则

- **行为不变优先**：每阶段都保持现有功能正常，逐步改善
- **测试驱动**：每阶段结束前必须跑通 [测试清单](#5-每阶段必须完成的测试清单)
- **可回滚**：每阶段独立 commit，可独立 revert
- **不破坏现有数据**：DB 字段加 `DEFAULT` 兼容旧数据

---

## 2. 整体目标

> **「类 Notion / Apple Notes：左分组右笔记详情，零模态编辑，所见即所得」**

### 设计原则

1. **所见即所得**：直接在笔记详情面板编辑，去除「详情 → 编辑」两步模态
2. **零次要弹窗**：所有操作侧边/底栏触发（颜色、分组、固定、归档）
3. **移动优先**：单页内 Tab 切换（列表/笔记），避免路由跳转
4. **可恢复**：所有破坏性操作可撤销（Toast undo / 废纸篓）
5. **状态可读**：UI 反映数据状态（固定项置顶、归档进废纸篓）

### 重构后的非功能性目标

- 单文件不超过 500 行
- 笔记 CRUD 接口仍走 REST，无重大协议变更
- 移动端首屏加载 < 1.5s（网络好时）
- 搜索响应 < 100ms（本地过滤）

---

## 3. 目标交互

### 双栏布局（移动端单页内 Tab 切换）

```
┌──────────────────────────────────────────┐
│  📓 笔记        🔍 [搜索]  +  │
├──────────┬────────────────────────────────┤
│ ▼ 工作    │  ▌6/20 周报复盘    ⋮   │
│  • 6/20  │  ┌─────────────────────────┐  │
│  • 6/19  │  │ # 本周完成              │  │
│  • 6/15  │  │ - 提交周报              │  │
│ ─────    │  │ - 修复登录 bug          │  │
│ ▶ 学习   │  │                         │  │
│ ─────    │  │ # 下周计划              │  │
│  + 新分组 │  │ - 启动 Q3 项目          │  │
│  ＋新笔记 │  └─────────────────────────┘  │
│  📌 已固定│  📌 固定 | 🏷 工作  ●●●●●      │
│  🗑 废纸篓│  2026-06-20 21:30  ·  3 次对话 │
└──────────┴────────────────────────────────┘
```

- **左侧栏**：分组列表 + 分组内笔记条目（按更新时间倒序）
- **右侧主区**：当前笔记 content，contenteditable 直接编辑
- **顶栏**：搜索 + 新建按钮
- **底部 toolbar**：分组 / 颜色 / 📌 固定 / AI 抽屉触发

### 关键交互细节

| 操作 | 旧流程 | 新流程 |
|------|--------|--------|
| 创建笔记 | 输入框 + 点 + | 顶栏 + → 立即聚焦右侧编辑 |
| 编辑笔记 | 点 → 详情 → 编辑 | 直接在右侧编辑（失焦自动保存） |
| 删除笔记 | 左滑 → 删除 | 左滑 → 归档（可在废纸篓恢复） |
| 搜索 | 无 | 顶栏搜索框，实时过滤 |
| 切换分组 | 模态下拉 | 底部 toolbar 下拉 |
| AI 助手 | 全局浮窗（无目标时也可点） | 笔记右侧抽屉，无笔记时隐藏触发按钮 |

---

## 4. 分阶段规划

### 阶段 1：清理死代码 + 架构修正

> **目标**：让后续改动不被旧代码干扰
> **风险等级**：低（纯重构）
> **可独立回滚**：✅

#### 改动清单

| # | 改动 | 文件 | 行数变化 |
|---|------|------|----------|
| 1.1 | 删除 main.js 里的 `renderNotesList` 副本（约 line 860-1082） | main.js | -220 |
| 1.2 | 删除 main.js 里的 `renderNoteItem` 副本 | main.js | -30 |
| 1.3 | 删除 main.js 里的笔记拖拽代码（约 line 1084, 1400-1520） | main.js | -440 |
| 1.4 | 把 `showNoteDetail` 搬到 notepad.js | main.js → notepad.js | 净 -30 |
| 1.5 | 把 `showNoteEdit` 搬到 notepad.js | main.js → notepad.js | 净 -30 |
| 1.6 | notepad.js 按特性拆文件：`notes-list.js` + `note-editor.js` + `note-ai.js` | 新建 | 重新组织 |
| 1.7 | 抽出 expense 相关代码到 `expense.js` | notepad.js → expense.js | 净 -250 |
| 1.8 | `aiChatState` / `noteDragState` 改为闭包私有，不再 export | notepad.js | -2 行 export |

#### 拆分目标

```
frontend/static/js/
├── notepad.js           # 主入口 (~150 行)
│                         职责：路由、初始化、组合子模块
├── notes-list.js        # 笔记列表渲染、CRUD 事件
├── note-editor.js       # 笔记编辑（详情/编辑模态）
├── note-ai.js           # AI 对话逻辑（保留浮窗，本阶段不动）
└── expense.js           # 记账功能（已存在 budget.js，迁移过去）
```

#### 命名空间重构

```javascript
// 旧
window.ScheduleAppNotepad = {
    renderNotepadView,
    renderNotesList,
    showNoteDetail,
    showNoteEdit,
    ...
};

// 新（各模块独立命名空间）
window.ScheduleAppNotesList = { renderNotesList, ... };
window.ScheduleAppNoteEditor = { showNoteDetail, showNoteEdit, ... };
window.ScheduleAppNoteAI = { initAIChatPanel, ... };
window.ScheduleAppNotepad = { renderNotepadView, renderNotepadContent, ... }; // 主入口
```

#### 完成标准

- ✅ 所有原功能行为不变
- ✅ main.js 删除约 720 行
- ✅ notepad.js 缩到约 200 行（只剩路由和初始化）
- ✅ 新建 3 个子文件
- ✅ 移动端/桌面端渲染、CRUD、拖拽、搜索、模态全部正常

---

### 阶段 2：数据模型扩展

> **目标**：给笔记加「pinned / color / archived」能力
> **风险等级**：低（向前兼容）
> **可独立回滚**：✅

#### 改动清单

| # | 改动 | 文件 |
|---|------|------|
| 2.1 | `Note` 模型加 `is_pinned: bool = False` | `backend/models.py` |
| 2.2 | `Note` 模型加 `color: str = ""` | `backend/models.py` |
| 2.3 | `Note` 模型加 `is_archived: bool = False` | `backend/models.py` |
| 2.4 | 三个字段 ALTER TABLE 迁移 | `backend/db.py` |
| 2.5 | CREATE TABLE schema 加新字段 | `backend/db.py` |
| 2.6 | `create_note` / `update_note` 接受新字段 | `backend/db.py` |
| 2.7 | `update_note` route 接受新字段 | `backend/routes.py` |
| 2.8 | `create_note` route 接受新字段 | `backend/routes.py` |
| 2.9 | `get_notes` 支持 `?include_archived=true/false` | `backend/routes.py` |

#### DB 迁移模式

复用 `goals` 表加 `color` 的迁移模式：

```python
# in init_db()
try:
    await db.execute("ALTER TABLE notes ADD COLUMN is_pinned INTEGER DEFAULT 0")
except Exception:
    pass
try:
    await db.execute("ALTER TABLE notes ADD COLUMN color TEXT DEFAULT ''")
except Exception:
    pass
try:
    await db.execute("ALTER TABLE notes ADD COLUMN is_archived INTEGER DEFAULT 0")
except Exception:
    pass
```

#### API 字段

```javascript
// 笔记对象 (前端)
{
    id, title, content, group_id, sort_order,
    is_pinned, color, is_archived,       // 新
    created_at, updated_at
}

// GET /api/notes?include_archived=false  // 默认不返回归档
// GET /api/notes?include_archived=true   // 包含归档（废纸篓视图用）
```

#### 完成标准

- ✅ 旧笔记（无新字段）正常显示，`is_pinned=false`、`color=""`、`is_archived=false`
- ✅ 新建笔记可设置三个字段
- ✅ 编辑可更新三个字段
- ✅ 归档笔记默认不返回，含参数可返回
- ✅ 现有 UI 不变（前端忽略新字段）

---

### 阶段 3：新 UI 布局（双栏）

> **目标**：类 Notion 双栏，所见即所得
> **风险等级**：中（前端大改）
> **可独立回滚**：✅（旧 HTML/CSS 保留作为回滚路径）

#### 改动清单

| # | 改动 | 文件 |
|---|------|------|
| 3.1 | 新增 `.notes-app` 容器，`.notes-sidebar` + `.notes-main` 双栏 HTML | `frontend/index.html` |
| 3.2 | 移动端：单页内 Tab 切换（列表/笔记） | `frontend/index.html` + CSS |
| 3.3 | 列表项卡片：title（首行）、preview（content 截 2 行）、时间、📌 标记、彩色左边条 | CSS + JS |
| 3.4 | 编辑器：替换 textarea → contenteditable div；标题行内编辑 | note-editor.js |
| 3.5 | 底部 toolbar：分组下拉 / 颜色选择 / 📌 固定 / AI 按钮 | note-editor.js + CSS |
| 3.6 | 列表项左滑：「归档」（非删除）；归档后进入「废纸篓」分组 | notes-list.js |
| 3.7 | 键盘快捷键：↑/↓ 切换笔记，Enter 编辑，Cmd+N 新建 | notes-list.js |
| 3.8 | Pinned 置顶分组，永远在顶部 | notes-list.js |
| 3.9 | 6-8 色调色板（与目标同款） | note-editor.js |
| 3.10 | 顶栏搜索框，实时过滤 title+content，键盘 Esc 清除 | notes-list.js |

#### UI 行为

**新建笔记**：
- 顶栏 `+` → 立即创建空笔记 → 右侧聚焦编辑

**编辑笔记**：
- 右侧 contenteditable，直接输入
- 防抖 800ms 自动保存
- 失焦也保存
- Esc 取消当前编辑（保留旧内容）

**归档笔记**：
- 列表项左滑显示「归档」按钮
- 归档后笔记从分组消失，进入「废纸篓」分组
- 废纸篓分组：可恢复（取消归档）或永久删除

**搜索**：
- 顶栏搜索框输入 → 即时过滤（防抖 200ms）
- 过滤 title + content
- Esc 清空，恢复全部
- 显示匹配数量

#### 完成标准

- ✅ 双栏布局在桌面端正常显示
- ✅ 移动端单页内 Tab 切换正常
- ✅ 笔记可直接编辑，800ms 防抖自动保存
- ✅ 左滑归档能恢复和永久删除
- ✅ 搜索能过滤 title 和 content
- ✅ 键盘快捷键正常
- ✅ 颜色选择器可用
- ✅ Pinned 笔记置顶

---

### 阶段 4：AI 浮窗整合

> **目标**：AI 对话变成「笔记右侧抽屉」而不是全局浮窗
> **风险等级**：低（移除一个独立浮窗）
> **可独立回滚**：✅

#### 改动清单

| # | 改动 | 文件 |
|---|------|------|
| 4.1 | 删除全局 `aiFloatingWindow` DOM 和 JS | notepad.js + index.html |
| 4.2 | 删除 `aiChatState` 模块级单例，改为闭包私有 | note-ai.js |
| 4.3 | 新增笔记详情右侧「AI 助手」抽屉 UI | note-ai.js + CSS |
| 4.4 | 当前笔记 context 全量显示（不再 200 字符截断） | note-ai.js |
| 4.5 | AI 响应「插入笔记」按钮：append 到 content 自动保存 | note-ai.js |
| 4.6 | 抽屉可拖拽改变宽度（移动端全屏，桌面端 30%） | CSS |
| 4.7 | 抽屉打开/关闭状态保留（不每次重渲染） | note-ai.js |

#### 触发条件

- **触发按钮位置**：笔记底部 toolbar 右侧「🤖 AI 助手」按钮
- **隐藏条件**：未选中任何笔记时，按钮 disabled
- **关闭方式**：点击抽屉外区域、按 Esc、点击工具栏按钮再点一次

#### 完成标准

- ✅ 旧全局浮窗完全移除（无 DOM 残留）
- ✅ 选中笔记时可打开 AI 抽屉
- ✅ 未选中笔记时按钮 disabled
- ✅ 上下文显示完整内容
- ✅ AI 响应可一键插入笔记
- ✅ 抽屉开关流畅，无全局干扰

---

### 阶段 5：体验打磨

> **目标**：移动端丝滑
> **风险等级**：低（增量改进）
> **可独立回滚**：✅

#### 改动清单

| # | 改动 | 文件 |
|---|------|------|
| 5.1 | Optimistic update：创建/删除/移动后立即更新 UI，失败再回滚 | notes-list.js |
| 5.2 | Loading 骨架屏：网络慢时显示笔记列表骨架 | notes-list.js + CSS |
| 5.3 | 空状态：「还没有笔记，开始记录第一条吧」+ 引导按钮 | notes-list.js + CSS |
| 5.4 | 删除分组：弹 confirm + 显示「含 N 条笔记，归档到未分组」 | notes-list.js |
| 5.5 | Pinned/Color 选择器：复用目标的色板组件 | 抽公共组件 |
| 5.6 | Toast undo：所有破坏性操作 5s 内可撤销 | api-toast.js |
| 5.7 | 性能：列表超过 50 条时分页或虚拟滚动 | notes-list.js |
| 5.8 | a11y：键盘导航、ARIA 标签、focus 管理 | notes-list.js + HTML |

#### Optimistic update 模式

```javascript
async function deleteNote(noteId) {
    // 1. 立即从 DOM 移除
    const el = document.querySelector(`[data-note-id="${noteId}"]`);
    el?.remove();

    // 2. 显示可撤销 toast
    showToastWithUndo('已归档', async () => {
        // 用户点 undo：重新插入
    });

    // 3. 后台同步
    try {
        await apiCall(`notes/${noteId}`, { method: 'DELETE' });
    } catch (err) {
        // 失败回滚
        await renderNotesList();
        showToast('归档失败，请重试');
    }
}
```

#### 完成标准

- ✅ 创建/删除/归档后 UI 立即更新（不等待服务端）
- ✅ 网络慢时显示骨架屏
- ✅ 空状态有引导
- ✅ 删除分组有二次确认
- ✅ 5s 内所有破坏性操作可撤销
- ✅ 列表 50+ 条时滚动流畅

---

## 5. 每阶段必须完成的测试清单

> **强约束：每个阶段必须跑完对应测试才能进入下一阶段。**

### 通用测试（所有阶段都要跑）

```
□ 启动后端 python -m backend.main
□ 打开浏览器，导航到 http://localhost:8080
□ 点击「笔记」Tab
□ 笔记 Tab 正常加载
□ 现有笔记正常显示
```

### 阶段 1 测试

```
□ 笔记列表正常渲染
□ 创建笔记：输入框 + 点 + → 笔记出现在列表
□ 编辑笔记：点击 → 弹详情 → 弹编辑 → 修改 → 保存 → 内容更新
□ 删除笔记：左滑 → 删除 → 笔记消失
□ 创建分组：+ 新分组 → 输入名称 → 分组出现
□ 删除分组：× → 笔记移到未分组
□ 拖拽笔记到其他分组：笔记移到目标分组
□ 顶栏「+ 添加」按钮正常工作
□ 切换「笔记 / 记账」Tab 正常
□ 控制台无 JS 错误
□ main.js 总行数减少约 700+ 行
□ notepad.js 总行数减少约 1000+ 行
```

### 阶段 2 测试

```
□ 旧笔记正常显示（is_pinned=false, color="", is_archived=false）
□ API 返回新字段：curl GET /api/notes | jq '.[0] | keys' 应包含 is_pinned, color, is_archived
□ 新建笔记带 is_pinned=true 能正常返回
□ API 更新 is_pinned / color / is_archived 字段
□ GET /api/notes 默认不返回归档
□ GET /api/notes?include_archived=true 返回归档
□ 现有 UI 完全不变（前端忽略新字段）
```

### 阶段 3 测试

```
□ 桌面端双栏布局正常
□ 移动端单页内 Tab 切换正常
□ 顶栏 + 创建笔记：右侧立即聚焦编辑
□ 直接在右侧编辑：800ms 后自动保存
□ 失焦自动保存
□ 列表项左滑显示「归档」按钮
□ 归档笔记进入「废纸篓」分组
□ 废纸篓分组可恢复和永久删除
□ 顶栏搜索框能过滤
□ ↑/↓ 切换笔记正常
□ Enter 触发编辑
□ Cmd+N 新建笔记
□ 颜色选择器可用（6-8 色）
□ Pinned 笔记置顶显示
□ 移动端单列布局无溢出
```

### 阶段 4 测试

```
□ 旧 aiFloatingWindow DOM 完全移除
□ 选中笔记时 AI 抽屉按钮可点击
□ 未选中笔记时 AI 抽屉按钮 disabled
□ AI 抽屉打开正常
□ 上下文显示完整内容（不再 200 字符截断）
□ 发送消息 → AI 响应正常显示
□ 「插入笔记」按钮：内容追加并自动保存
□ 抽屉可关闭（Esc、点外、点按钮再点一次）
□ 抽屉打开/关闭无全局干扰
```

### 阶段 5 测试

```
□ 创建笔记：UI 立即更新（不等待服务端）
□ 删除笔记：UI 立即更新
□ 归档笔记：UI 立即更新
□ 网络断开时操作有错误提示和回滚
□ 5s 内可撤销最近一次操作
□ 网络慢时显示骨架屏（断点 throttle 测）
□ 空状态：「还没有笔记」+ 引导按钮
□ 删除分组：confirm 显示「含 N 条笔记」
□ 列表 50+ 条时滚动流畅（Chrome DevTools Performance 测）
□ 键盘 Tab 键能聚焦所有交互元素
□ 屏幕阅读器（VoiceOver/NVDA）能读出笔记标题和内容
```

---

## 6. 风险与缓解

| 风险 | 等级 | 缓解 |
|------|------|------|
| 旧笔记无 `is_pinned/color/is_archived` 字段 | 低 | 迁移时 `DEFAULT 0/''/0` |
| 拖拽删除死代码引发回归 | 中 | 阶段 1 跑完整冒烟测试再合 |
| 移动端单/双栏布局兼容 | 中 | 用 `matchMedia` 检测，先单列 |
| 编辑器换 contenteditable 后性能 | 低 | 只在右侧打开时实例化 |
| AI 浮窗改成抽屉影响现有使用 | 低 | 阶段 4 单独 PR |
| Optimistic update 失败回滚逻辑 | 中 | 阶段 5 仔细测试，保留服务端数据为权威 |
| 50+ 笔记性能 | 低 | 阶段 5 评估，超限才加虚拟滚动 |
| 多 Tab 同时编辑同一笔记冲突 | 中 | 后续阶段考虑，本规划范围外 |

---

## 7. 范围外

以下功能**不在本次重构范围**，记录备查：

- 笔记富文本格式（Markdown / 粗体 / 斜体 / 链接）
- 笔记版本历史（git-like diff）
- 笔记多端同步（云端账号）
- 笔记导出（PDF / Markdown / 纯文本）
- 笔记全文搜索（SQLite FTS5）
- 笔记标签系统（多标签 / 嵌套标签）
- 笔记与日程/目标的链接
- 笔记附件上传（图片 / 文件）
- 多人协作编辑（CRDT）
- 笔记密码 / 加密

这些可在未来根据用户需求单独规划。

---

## 附录 A：每阶段预估工作量

| 阶段 | 改动量 | 复杂度 | 预估工时 |
|------|--------|--------|----------|
| 1 | 删 ~700 行 + 拆 3 文件 | 中 | 2-3 小时 |
| 2 | DB + 模型 + API 8 处 | 低 | 1 小时 |
| 3 | HTML + CSS + JS 大改 | 高 | 4-6 小时 |
| 4 | 删除浮窗 + 新抽屉 | 中 | 2-3 小时 |
| 5 | 体验打磨 8 项 | 中 | 2-3 小时 |
| **总计** | | | **11-16 小时** |

## 附录 B：每阶段独立可合并点

| 阶段 | commit 标题 | 关联 |
|------|-------------|------|
| 1 | `refactor(notes): 拆 notepad.js，删 main.js 死代码` | 纯重构 |
| 2 | `feat(notes): 数据模型加 is_pinned/color/is_archived` | 后端 |
| 3 | `feat(notes): 双栏 UI 重构，所见即所得` | 前端大改 |
| 4 | `refactor(notes): AI 浮窗改右侧抽屉` | 移除 + 新增 |
| 5 | `polish(notes): optimistic update + 骨架屏 + a11y` | 体验 |
