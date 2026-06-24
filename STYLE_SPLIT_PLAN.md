# style.css 拆分方案

> 目标:把 7765 行 / 175KB 的 `frontend/static/style.css` 拆成 18-20 个小文件,便于 AI 编程时按视图/组件快速定位。

---

## 0. 设计原则

1. **视图对齐 JS 模块** — CSS 文件名尽量与 `frontend/static/js/*.js` 一一对应(`goals.css` ↔ `goals.js`),AI 找代码时一个文件打开另一个即可。
2. **单一职责** — 单文件 ≤ 600 行,AI 一次性上下文能装下。
3. **稳定前置** — tokens / reset / 通用组件必须先加载(被所有视图引用)。
4. **零全局污染** — 跨文件组件样式集中在 `_shared/` 体系。
5. **物理切分不改类名** — 拆分是"搬砖"不是"重构",0 改动 JS 风险。
6. **不改选择器、不合并、不优化** — 重复定义/重复规则留到拆分完成后的清理阶段。

---

## 1. 目标目录结构

```
frontend/static/
├── style.css                    # 旧文件,拆分完成后删除(或保留为转发壳)
└── styles/                      # 新目录
    ├── main.css                 # 入口文件(@import 所有子文件,顺序敏感)
    ├── _tokens.css              # CSS 变量与设计 token
    ├── _reset.css               # 浏览器 reset & 基础排版
    ├── _shared.css              # 通用组件:按钮、表单、模态壳、loading、empty、toast、ptr、confirm
    ├── header.css               # 顶部 header + 分段控件 + 导航按钮
    ├── llm-input.css            # 底部 LLM 输入区
    ├── calendar-day.css         # 日视图(时间轴、事件卡片、resize handle、segmented)
    ├── calendar-week.css        # 周视图
    ├── calendar-month.css       # 月视图
    ├── calendar-agenda.css      # 日程列表(周/月共享)
    ├── todo.css                 # 代办视图(滑动、多选、批量)
    ├── stats.css                # 统计视图
    ├── goals.css                # 规划视图(目标、对话、拆解、timeline 重设计、mini calendar)
    ├── notepad.css              # 记事本主视图(notepad tabs、容器、input)
    ├── notes.css                # 笔记(编辑器、上下文菜单、AI drawer、deep dark theme、image resize)
    ├── note-groups.css          # 笔记分组
    ├── settings.css             # 设置(弹窗 + 设置页 + AI providers + user context)
    └── modals.css               # 弹层(breakdown、confirm、event detail)
```

**文件总数:19 个**(主入口 1 + 内容文件 18)

---

## 2. main.css 入口

**位置**:`frontend/static/styles/main.css`

```css
/* ============================================
   Schedule App - Styles Entry
   加载顺序敏感:tokens → reset → shared → views
   ============================================ */

/* 1. 基础层(token 必须先加载) */
@import url('./_tokens.css');
@import url('./_reset.css');

/* 2. 通用组件层(被多个视图引用) */
@import url('./_shared.css');
@import url('./modals.css');

/* 3. 全局布局 */
@import url('./header.css');
@import url('./llm-input.css');

/* 4. 视图层(按 Tab 顺序) */
@import url('./calendar-day.css');
@import url('./calendar-week.css');
@import url('./calendar-month.css');
@import url('./calendar-agenda.css');
@import url('./todo.css');
@import url('./stats.css');
@import url('./goals.css');
@import url('./notepad.css');
@import url('./notes.css');
@import url('./note-groups.css');
@import url('./settings.css');
```

> `@import` 必须在文件最前面,且不能写在其他规则之后。HTTP/2 下浏览器会并行下载所有子 CSS。

---

## 3. 精确切分行号映射

源文件 `frontend/static/style.css`(7765 行)。下表给出每个目标文件的**精确行号区间**和**章节标题**。

| # | 目标文件 | 源行号区间 | 行数 | 来源章节标题 |
|---|----------|-----------|-----|------------|
| 1 | `_tokens.css` | 3-77 | 75 | CSS Variables & Design Tokens |
| 2 | `_reset.css` | 78-117 | 40 | Reset & Base |
| 3 | `header.css` | 118-289 | 172 | Header(含 @keyframes rotate) |
| 4 | `llm-input.css` | 290-583 | 294 | LLM Input Area |
| 5 | `_shared.css` | 1672-1768 + 1849-1904 + 2005-2062 | ~300 | Modal 壳 + Checkbox/Buttons + Pull-to-refresh |
| 6 | `calendar-day.css` | 642-908 + 2064-2098 | ~302 | Day View Timeline + Segmented Control |
| 7 | `calendar-week.css` | 909-1141 | 233 | Week View |
| 8 | `calendar-month.css` | 4006-4163 | 158 | Month View |
| 9 | `calendar-agenda.css` | 1142-1225 | 84 | Agenda List(周/月共享) |
| 10 | `todo.css` | 1226-1537 | 312 | Todo View |
| 11 | `stats.css` | 1538-1671 | 134 | Stats View |
| 12 | `modals.css` | 2587-2720 + 2721-2815 | ~228 | Breakdown Modal + Custom Confirm Dialog |
| 13 | `goals.css` | 3479-4005 + 5560-5794 + 7163-7765 | ~1265 | Goals View + Mini Calendar + Timeline Redesign |
| 14 | `notepad.css` | 4164-5164 | 1001 | Notepad View(含 note inline editor、sort bar、空状态) |
| 15 | `notes.css` | 2382-2530 + 5302-5559 + 5796-6637 + 6277-7104 + 7137-7162 | ~1980 | Note context menu + AI Drawer + Deep Dark Theme + AI inline + Image Resize |
| 16 | `note-groups.css` | 5165-5301 | 137 | Note Groups |
| 17 | `settings.css` | 2816-3430 + 3431-3478 | ~262 | Settings Modal + Settings View |
| 18 | `responsive.css` | 2531-2586 | 56 | Touch Gestures + Responsive Adjustments |
| 19 | `main.css` | (新文件) | ~30 | 入口(@import 列表) |

**说明**:
- 表中 `_shared.css` 跨三段(1672-1768、1849-1904、2005-2062),在拆分时需要把内容**打散重组**到一个新文件里,但行号无需严格连续(物理切分可接受非连续)。
- `notes.css` 同样跨多段,内容来自多个分散章节,按归属归并。
- `Main Content` 节(584-641)、`Bottom Tab Bar` 节(2099-2153)、`Floating Add Button` 节(2154-2211)、`Utility Classes` 节(2212-2381)按其内具体选择器语义分配到对应视图文件,**不**单独成文件(避免过碎)。

---

## 4. 各文件职责详细说明

### 4.1 `_tokens.css` (L3-77)
- `:root` 中所有 CSS 变量
- 设计 token 集中地,**任何文件修改样式应优先看这里有没有可复用的变量**
- **不要**在此文件写具体选择器

### 4.2 `_reset.css` (L78-117)
- `*` 通用重置
- `body`、`html` 基础排版
- 全局 box-sizing

### 4.3 `_shared.css` (跨段)
内容来源:
- **Modal 壳** (1672-1768):`.modal`、`.modal-backdrop`、`.modal-content`、`.modal-header`、`.modal-body`、`.modal-footer`、`.modal-close`、`@keyframes slideUp`
- **表单/checkbox/buttons** (1849-1904):`.form-group`、`.category-selector`、`.category-pill`、`.checkbox-label`、`.btn` 及变体
- **Pull-to-refresh** (2005-2062):`.ptr-indicator`、`.ptr-icon`、`.ptr-arrow`、`@keyframes spin`

### 4.4 `header.css` (L118-289)
- `.header`、`.header-btn` 及四色变体(`.header-btn-purple/blue/green/orange`)
- `.header-title`、`.header-right`、`.header-center`
- `.nav-arrow-btn`、`.refresh-btn`、`.refresh-btn.rotating`
- `@keyframes rotate`
- **注意**:此节内有重复的 `.header-btn svg` 块(L168-177 与 L184-193 内容相同) — **保留,不合并**(清理阶段再处理)

### 4.5 `llm-input.css` (L290-583)
- LLM 输入栏(`.llm-input-bar`、`.llm-input`、发送按钮、附件、快捷提示等)
- "队列详情区域" 样式(L378+)
- 复制按钮(L418+)

### 4.6 `calendar-day.css` (跨段)
内容来源:
- **Day View Timeline** (642-908):`.day-view`、`.timeline-column`、`.hour-marker`、`.timeline-event`、resize handle
- **Segmented Control** (2064-2098):`.day-segmented`、`.day-segment`、`.day-segment.active`

### 4.7 `calendar-week.css` (L909-1141)
- `.week-view`、`.week-day-column`、`.week-time-slot`、`.week-event`、周内时间轴

### 4.8 `calendar-month.css` (L4006-4163)
- `.month-view`、`.month-header`、`.month-grid`、`.month-cell`、`.month-event`、`.month-more`

### 4.9 `calendar-agenda.css` (L1142-1225)
- `.agenda-list`、`.agenda-item`、`.agenda-time`、`.agenda-title` 等(周/月共享的列表)

### 4.10 `todo.css` (L1226-1537)
- `.todo-item`、滑动操作、checkbox、selection mode
- 多选底部操作栏(L1471+)
- 分类统计(L1641+ — 等等,该行号实际在 stats 节后面,需核对)

### 4.11 `stats.css` (L1538-1671)
- 统计视图:完成率、分类占比等

### 4.12 `modals.css` (跨段)
内容来源:
- **Breakdown Modal** (2587-2720):`.breakdown-results`、`.breakdown-item`、`.saved-breakdown-*`、`.breakdown-empty`
- **Custom Confirm Dialog** (2721-2815):`.confirm-backdrop`、`.confirm-dialog`、`.confirm-btn` 等
- **Event Detail Modal** (1905-2003):`.detail-content`、`.detail-row`、`.detail-history-*`

### 4.13 `goals.css` (跨段,大文件 ~1265 行)
内容来源:
- **Goals View** (3479-4005):`.goals-view`、`.goal-card`、`.goal-children`、`.goal-discuss-*`、`.subtask-depth-*`
- **Goal Mini Calendar** (5560-5794):`.goal-mini-calendar`、`.mini-cal-day` 等
- **Goals Timeline** (7163-7765):`.timeline-group`、`.timeline-scroll-container`、`.timeline-zoom-slider-wrap`、`.timeline-goals-list`、`.tl-goal` 及所有 `@keyframes timelineBarAppear`

### 4.14 `notepad.css` (L4164-5164, ~1000 行)
- `.notepad-view`、`.notepad-tabs`、`.notepad-input-area`、`.notepad-add-btn`、`.notepad-container`
- 笔记内联编辑、sort bar、empty state、loading skeleton
- 上下文菜单(L2382-2530 中属笔记部分)
- **可考虑进一步拆分**为 `notepad-shell.css` + `note-inline.css`,但本阶段先合在一起,后续视情况再分

### 4.15 `notes.css` (跨段, ~1980 行 — 最大的文件)
内容来源:
- **Note context menu** (2382-2530)
- **AI Drawer for Notes** (5302-5559):`.ai-drawer`、`.ai-message` 等
- **Notes App Deep Dark Theme** (5796-6637):`.note-app`、`.note-list`、`.note-card`、`.note-editor`、`.note-toolbar`
- **AI inline edit** (6277-6344)
- **Image Resize Overlay** (7137-7162)
- **警告**:此文件接近 2000 行,**未来若继续增长应再次拆分**(如拆出 `note-editor.css`、`note-theme.css`)

### 4.16 `note-groups.css` (L5165-5301)
- `.note-group`、`.note-group-header`、`.note-group-toggle`、`.note-group-content`、`.note-group-empty`、`.add-group-container`
- **等等**:Notepad View 章节(L4164-)内也含 `.note-group-*`(L4241+),**重复定义**!需在拆分时合并二选一
- 决定:统一保留在 `note-groups.css`,`notepad.css` 中的同名块**删除**

### 4.17 `settings.css` (跨段)
内容来源:
- **Settings Modal** (2816-3430):`.settings-list`、`.settings-item`、`.toggle-switch`、AI Providers 列表、AI Learning、Event History/Deleted/Modifications、User Context
- **Settings View** (3431-3478):设置页面布局

### 4.18 `responsive.css` (L2531-2586)
- `@media` 查询:触摸手势、响应式调整
- 暗黑模式 OLED 适配(L2580+)
- 也可放不同屏幕尺寸的断点

### 4.19 `main.css` (新文件)
- 入口,只含 `@import` 列表,**不**写其他规则

---

## 5. 入口与缓存迁移

### 5.1 `index.html` 改 1 行

**原(L11)**:
```html
<link rel="stylesheet" href="/static/style.css?v=20260623-03">
```

**改后**:
```html
<link rel="stylesheet" href="/static/styles/main.css?v=20260624-01">
```

### 5.2 `service-worker.js` 改 1 行

**原(L5)**:
```js
'/static/style.css?v=20260623-01',
```

**改后**:
```js
'/static/styles/main.css?v=20260624-01',
```

并把 `CACHE_NAME` 从 `'schedule-app-v25'` 升到 `'schedule-app-v26'`,触发旧缓存清理。

### 5.3 旧 `style.css` 处理
- 方案 A(推荐):**直接删除** `frontend/static/style.css`。
- 方案 B:保留作为重定向壳(用 `@import url('./styles/main.css');`)。收益小,不推荐。

---

## 6. 执行步骤(具体操作)

> 拆分纯物理切分,执行期间不修改任何选择器、不改任何规则。**每完成一步本地手动 commit 一次**,方便回滚。

### 步骤 0:备份
```bash
cp frontend/static/style.css /tmp/style.css.bak
git add -A && git commit -m "chore: 拆分前备份 style.css"
```

### 步骤 1:创建目录
```bash
mkdir -p frontend/static/styles
```

### 步骤 2:物理切分(用 sed/awk 按行号切)
对每个目标文件,执行 `sed -n '起始行,结束行p' style.css > styles/目标文件.css`。

**示例**:
```bash
sed -n '3,77p' frontend/static/style.css > frontend/static/styles/_tokens.css
sed -n '78,117p' frontend/static/style.css > frontend/static/styles/_reset.css
# ... 依此类推
```

**对跨段文件**(如 `_shared.css`):
```bash
{
  sed -n '1672,1768p' frontend/static/style.css
  echo ''
  sed -n '1849,1904p' frontend/static/style.css
  echo ''
  sed -n '2005,2062p' frontend/static/style.css
} > frontend/static/styles/_shared.css
```

**对需要删除重复块的文件**(如 `notepad.css` 移除 note-group 重复):
- 先按行号切
- 再用 `sed -i '/重复的 .note-group 起始/,/重复的 .note-group 结束/d'` 删除

### 步骤 3:写 `main.css` 入口
按 §2 模板创建。

### 步骤 4:更新 `index.html` + `service-worker.js`
按 §5 修改。

### 步骤 5:删除旧 `style.css`
```bash
git rm frontend/static/style.css
```

### 步骤 6:本地验证(用 browser-harness)
- 打开 http://localhost:8080
- 视觉与拆分前完全一致
- DevTools → Network:所有子 CSS 200
- DevTools → Coverage:规则总数不变(可作为硬指标)
- 切换每个 Tab、打开每个 Modal、滚动月视图 → 无样式丢失

### 步骤 7:提交推送
```bash
git add -A
git commit -m "refactor(css): 拆分 style.css 为 19 个按视图组织的子文件

- 新增 frontend/static/styles/ 目录,19 个 CSS 文件
- main.css 用 @import 串起所有子文件
- 物理切分,不改类名/不改选择器,0 行为变化
- index.html / service-worker.js 入口路径同步更新
- CACHE_NAME 升 v26,触发旧缓存清理
- 后续清理任务:合并重复定义(.note-group、.header-btn svg 等)
"
git push origin main
```

### 步骤 8:QQ 通知
按 `SPEC.md §2.2` 格式发送:
```
[计划助手更新通知]
- 重构:拆分 style.css(7765 行)为 19 个按视图/组件组织的子文件
- 新增 frontend/static/styles/ 目录,main.css 入口
- 物理切分,不改类名/不改选择器,0 行为变化
- 验证:DevTools 规则数不变、浏览器视觉无差异
- 后续:合并重复定义

仓库: https://github.com/eternitylarva1/schedule_app
```

---

## 7. 风险与约束

| 风险 | 缓解 |
|------|------|
| `@import` 串行加载性能 | HTTP/2 下浏览器实际并发请求所有 `@import` 目标;文件 18 个都是小文件(平均 300 行) |
| 拆分期间线上访问旧路径 | 步骤 4 同步更新 index.html 后再删除旧 style.css,中间无空档 |
| 跨段文件拼装错位 | 严格按行号区间,切完后 `wc -l` 校验总行数 = 7765 - (跳过的重复块行数) |
| 旧版 service-worker 缓存 | 升 CACHE_NAME 至 v26,旧缓存自动清理 |
| 重复定义未清理导致部分规则被覆盖 | 本阶段保留所有重复,**只**消除 note-group 等明确归属冲突的块;完整清理留到下一任务 |
| 移动端首屏闪烁(FOUC) | CSS 文件都阻塞渲染,与单文件等价;HTTP/2 多文件加载在多数网络下 < 50ms |

---

## 8. 不做的事(明确边界)

本任务**不**做以下事情(留到后续专项任务):

1. ❌ 不合并重复定义(`.header-btn svg` 重复块、`.note-group` 跨节重复等)
2. ❌ 不引入 CSS 预处理器(Sass/Less)
3. ❌ 不引入 CSS Modules / CSS-in-JS
4. ❌ 不改任何类名、选择器、媒体查询
5. ❌ 不删除未使用的类(可能 JS 运行时动态生成)
6. ❌ 不修改 JS 文件
7. ❌ 不重新组织文件命名风格(用 kebab-case 一致即可)

---

## 9. 后续清理任务(拆分完成后另开)

```markdown
任务:清理 style.css 拆分后的重复定义
来源:STYLE_SPLIT_PLAN.md §7
目标:
  1. 合并 .header-btn svg 重复块(L168-177 ≈ L184-193)
  2. 合并 .notepad-view 章节内的 .note-group 重复(L4241+ 与 note-groups.css)
  3. 检查 .breakdown-item-title input 重复块(L2638-2646 ≈ L2653-2661)
  4. 用 stylelint/css-tree 工具扫描死代码
  5. 估计可减少 ~150-300 行
```

---

## 10. 验收清单

- [ ] `frontend/static/styles/` 目录存在,含 19 个 CSS 文件
- [ ] `main.css` 通过 `@import` 串起所有子文件
- [ ] `frontend/static/style.css` 已删除
- [ ] `index.html` 引用新路径
- [ ] `service-worker.js` 引用新路径 + CACHE_NAME v26
- [ ] 浏览器打开应用:所有 Tab、Modal、视图视觉与拆分前一致
- [ ] DevTools → Network:全部 CSS 200
- [ ] DevTools → Coverage:解析后规则总数不变
- [ ] git commit & push 完成
- [ ] QQ 通知已发送
