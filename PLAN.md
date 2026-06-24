# main.js 拆分重构计划

> 目标：将 `frontend/static/js/main.js` (~5387行) 中本不属于编排层的业务逻辑归位到对应模块，使其缩减至约1200行，同时不改变任何功能。

---

## 一、现状分析

### main.js 当前结构（5387行）

| 段号 | 行范围 | 内容 | 职责 | 目标位置 |
|------|--------|------|------|----------|
| S1 | 1–47 | IIFE 包装、App Version、State/DOM 导入、API别名抽取 | 基础设施 | **保留** |
| S2 | 47–125 | Utility 别名、Selection 配置 | 基础设施 | **保留** |
| S3 | 126–828 | ✅ 视图渲染（Header、Calendar/Todo 渲染、Swipe 交互） | 核心编排 | **保留** (减少内联, 已委托) |
| S4 | 828–851 | Goals View 委托调用 | 编排 | **保留** |
| S5 | 851–1002 | Notepad View + Note/Expense 委托 + QuickNoteCreate | 编排+笔记UI | **保留** (ShowQuickNote→notepad.js) |
| S6 | 1002–1165 | Stats + CategorySelector | 编排 | **保留** |
| S7 | 1165–1407 | View Switching (switchView / navigateDate) | 核心编排 | **保留** |
| S8 | 1407–1695 | Event Modal (CRUD + Detail) | 事件UI | **保留** (或未来→events.js) |
| S9 | 1696–3127 | 🚨 **Goal AI Discuss (~1430行)** | Goals | → **goals.js** |
| S10 | 3129–3386 | 🚨 **Settings Modal / AI Providers / User Contexts** | Settings | → **settings.js** |
| S11 | 3386–3545 | 🚨 **Setting Toggle Handlers + Error Logs** | Settings | → **settings.js** |
| S12 | 3545–3850 | 🚨 **Breakdown / Import (~300行)** | Goals | → **goals.js** |
| S13 | 3851–4198 | 🚨 **LLM Queue / Input Handling (~350行)** | LLM队列 | → **llm-queue.js (新)** |
| S14 | 4200–4510 | Touch/Pull/Scroll 交互处理 | 交互层 | **保留** |
| S15 | 4510–4850 | Event Listeners (bindEvents, ~340行) | 事件绑定 | **保留** (引用迁移) |
| S16 | 4850–5013 | Infra (debounce, 错误处理, Toast styles, Hash路由) | 基础设施 | **保留** |
| S17 | 5013–5387 | init + EventHistory/Deleted + Window exports | 初始化+设置历史 | → **settings.js** (历史) |

### 模块现有导出

| 模块 | 现有导出 | 需要补充 |
|------|----------|----------|
| **goals.js** (1535行) | `renderGoalsView*`, `openGoalDiscussModal`, `openGoalHistoryModal`, `openGoalEditModal`, `showAddGoalModal`, `createGoal` / `updateGoal` / `deleteGoal` | `startGoalDiscuss`, `continueGoalDiscuss`, `saveGoalDiscuss`, `openBreakdownModal`, `closeBreakdownModal`, `analyzeBreakdown`, `renderBreakdownResults`, `breakdownImport`, discuss UI helpers, `rescheduleGoalDiscuss`, `showImportModal`, `goalDiscussState` |
| **settings.js** (436行) | `openSettingsView`, `closeSettingsView`, `handleSettingChange`, `saveSettings`, `loadUserContexts`, `saveUserContext` | `openSettingsModal`, `closeSettingsModal`, AI Providers (load/render/save/activate/delete), User Contexts (render/select/open/save/delete/updateSelfDesc), toggle handlers (QQ/DragResize/DefaultReminder/AutoBudget/TestQQ), Error Logs, Cleanup, 事件/支出历史(loadDeleted/restore/permanentDelete/undo), `showSemanticHelpModal` |
| **新建 llm-queue.js** | — | `updateLlmQueueIndicator`, `updateLlmQueueStatusBar`, `cancelLlmGeneration`, `enqueueLlmRequest`, `processSingleLlmRequest`, `processLlmQueue`, `handleLlmSubmit`, `showLlmFailedBanner`, `hideLlmFailedBanner`, `restoreLlmFailedToInput`, `restoreLlmFailedFromStorage` |
| **notepad.js** (360行) | `renderNotepadView`, `renderNotepadContent`, `handleNotepadAdd` | (可选) `showQuickNoteCreateModal` |

---

## 二、迁移阶段计划

### Phase 0: 准备工作
- [x] 完成代码分析
- [ ] 创建 PLAN.md（本文档）
- [ ] 安装依赖并确认 `python -m backend.main` 可正常启动
- [ ] 启动 Chrome 并连接 CDP
- [ ] 前端各页面截图（回归基线）

---

### Phase 1: LLM 队列提取 → `frontend/static/js/llm-queue.js`

**迁移内容**（main.js S13，约350行）：
- `state.llmQueue*` 相关状态操作
- `updateLlmQueueIndicator()`, `updateLlmQueueStatusBar()`
- `cancelLlmGeneration()`
- `enqueueLlmRequest()`
- `processSingleLlmRequest()`
- `processLlmQueue()`
- `handleLlmSubmit()`
- `showLlmFailedBanner()`, `hideLlmFailedBanner()`
- `restoreLlmFailedToInput()`, `restoreLlmFailedFromStorage()`

**导出接口**：
```javascript
window.ScheduleAppLlmQueue = {
    init,                   // 初始化 + 恢复失败状态
    handleLlmSubmit,
    cancelLlmGeneration,
    enqueueLlmRequest,
    updateLlmQueueIndicator,
    updateLlmQueueStatusBar,
    restoreLlmFailedToInput,
};
```

**关联节点**（迁移后需修改 main.js 的位置）：
| main.js 位置 | 修改内容 |
|-------------|----------|
| S15 `bindEvents()` LLM部分 | 改调用 `window.ScheduleAppLlmQueue.handleLlmSubmit` / `cancelLlmGeneration` |
| S16 `init()` 中 `restoreLlmFailedFromStorage()` | 改调 `window.ScheduleAppLlmQueue.init()` |
| S17 `window.restoreLlmFailedToInput` / `window.hideLlmFailedBanner` | 改从 llm-queue 模块引用 |
| index.html | 在 `main.js` 之前添加 `<script src="llm-queue.js">` |

**回归测试**：
1. LLM 输入框输入文字，提交 → 队列显示
2. 点击取消 → 生成取消
3. 模拟失败 → FailedBanner 显示，重试/取消按钮工作
4. 刷新页面 → 失败内容从 localStorage 恢复

---

### Phase 2: Settings 功能迁移 → `settings.js`

**迁移内容**（main.js S10+S11+S17，约700行）：

组A — Settings Modal：
- `openSettingsModal()`, `closeSettingsModal()`

组B — AI Providers：
- `loadAiProviders()`, `renderAiProviders()`
- `openAiProviderModal()`, `closeAiProviderModal()`
- `saveAiProvider()`, `activateAiProvider()`, `deleteAiProvider()`

组C — User Contexts：
- `renderUserContexts()`, `selectUserContext()`
- `openUserContextModal()`, `closeUserContextModal()`
- `saveUserContext()`, `deleteUserContext()`
- `updateSelfDescriptionForLlm()`

组D — Setting Toggle Handlers：
- `handleQQReminderToggle()`, `handleDragResizeToggle()`
- `handleDefaultTaskReminderToggle()`, `handleAutoAssignBudgetToggle()`
- `handleTestQQChannel()`

组E — Error Logs：
- `handleViewErrorLogs()`, `loadErrorLogs()`, `handleClearErrorLogs()`

组F — Cleanup：
- `handleCleanupTestEntries()`

组G — Semantic Help：
- `showSemanticHelpModal()`

组H — 事件/支出历史管理（S17的函数）：
- `loadEventHistoryAll()`, `loadDeletedEvents()`, `restoreDeletedEvent()`, `permanentDeleteEvent()`
- `loadEventModifications()`, `undoEventModification()`
- `loadExpenseOperationLogs()`, `undoExpenseOperation()`
- `loadDeletedExpenses()`, `restoreDeletedExpense()`
- `escapeHtml()`, `escHtml()`（工具函数）

**导出接口**（追加到现有 `window.ScheduleAppSettings`）：
```javascript
window.ScheduleAppSettings = {
    ...existingExports,
    openSettingsModal,
    closeSettingsModal,
    loadAiProviders,
    saveAiProvider,
    activateAiProvider,
    deleteAiProvider,
    openAiProviderModal,
    saveUserContext,
    deleteUserContext,
    selectUserContext,
    handleQQReminderToggle,
    handleDragResizeToggle,
    handleDefaultTaskReminderToggle,
    handleAutoAssignBudgetToggle,
    handleTestQQChannel,
    handleCleanupTestEntries,
    showSemanticHelpModal,
    loadEventHistoryAll,
    loadDeletedEvents,
    restoreDeletedEvent,
    permanentDeleteEvent,
    loadEventModifications,
    undoEventModification,
    loadExpenseOperationLogs,
    undoExpenseOperation,
    loadDeletedExpenses,
    restoreDeletedExpense,
};
```

**关联节点**：
| main.js 位置 | 修改内容 |
|-------------|----------|
| S15 `bindEvents()` 中所有 Settings 相关事件绑定 | 改调 `window.ScheduleAppSettings.xxx` |
| S14 `renderActiveViewAfterDataLoad()` 中 `renderStatsView()` | 仍在 main.js，不变 |
| S17 `window.ScheduleApp`（`activateAiProvider`等） | 改从 settings.js 引用 |
| S17 `window.ScheduleAppCore.loadAiProviders` | 改为 `ScheduleAppSettings.loadAiProviders` |
| S17 `window.restoreDeletedEvent` 等全局暴露 | 改为 `ScheduleAppSettings` 引用 |
| S17 `window.ScheduleAppCore.loadEventHistoryAll` | 改为从 settings.js 引用 |
| index.html | settings.js 排在 main.js 之前 |

**回归测试**：
1. 点击设置按钮 → Settings 页面正确渲染
2. AI Providers 列表/添加/激活/删除
3. User Contexts 添加/编辑/删除
4. QQ提醒/拖拽/默认提醒 开关切换
5. 测试QQ信道
6. 清理测试条目
7. 事件历史/已删除/修改记录的加载和恢复
8. 支出历史/已删除/撤销

---

### Phase 3: Goal Discuss + Breakdown 迁移 → `goals.js`

**迁移内容**（main.js S9+S12，约1700行）：

组A — Breakdown：
- `openBreakdownModal()`, `closeBreakdownModal()`
- `analyzeBreakdown()`, `renderBreakdownResults()`
- `removeBreakdownItem()`, `addBreakdownItem()`
- `loadSavedBreakdowns()`, `closeSavedBreakdownsModal()`
- `saveBreakdowns()`, `importBreakdowns()`

组B — Goal Discuss State Machine：
- `goalDiscussState`（状态对象）
- `openGoalDiscussModal()`, `openGoalHistoryModal()`, `closeGoalDiscussModal()`
- `openGoalEditModal()`
- `persistDiscussMessage()`, `normalizeSubtasksNoConflict()`
- `startGoalDiscuss()`, `continueGoalDiscuss()`
- 所有 Discuss UI Helpers（addDiscussMessage, showDiscussLoading, updateLoadingTime, showDiscussTimeout, showDiscussError, showDiscussInputForRetry, showDiscussInput, showDiscussResults, showManualAddTask, decomposeSubtask, showManualAddSubtask, addManualSubtask, performSubtaskDecompose）
- `rescheduleGoalDiscuss()`, `showImportModal()`, `saveGoalDiscuss()`

**导出接口**（追加到现有 `window.ScheduleAppGoals`）：
```javascript
window.ScheduleAppGoals = {
    ...existingExports,
    openBreakdownModal,
    closeBreakdownModal,
    analyzeBreakdown,
    renderBreakdownResults,
    addBreakdownItem,
    removeBreakdownItem,
    loadSavedBreakdowns,
    closeSavedBreakdownsModal,
    saveBreakdowns,
    importBreakdowns,
    closeGoalDiscussModal,
    saveGoalDiscuss,
    startGoalDiscuss,
    continueGoalDiscuss,
    openGoalEditModal,
    rescheduleGoalDiscuss,
    showImportModal,
};
```

**关联节点**：
| main.js 位置 | 修改内容 |
|-------------|----------|
| S15 `bindEvents()` 中所有 Breakdown/GoalDiscuss 事件绑定 | 改调 `window.ScheduleAppGoals.xxx` |
| S16 `init()` 无直接引用 | — |
| S17 `ScheduleAppCore.openGoalEditModal/openGoalDiscussModal/showAddGoalModal` | 改从 goals.js 引用 |
| S3 `renderGoalsViewSkeleton/renderGoalsReference/renderGoalsList/renderGoalsView/showAddGoalModal` | 已经是委托，保持 |

**回归测试**：
1. 目标列表 → 点击目标 → Discuss 弹窗打开
2. 开始讨论 → AI 回复 → 继续对话
3. 保存讨论 → 目标创建/更新
4. 拆解任务 → 子任务显示
5. Breakdown 弹窗 → AI 拆解 → 导入
6. 保存/加载已保存的拆解
7. 目标编辑、历史记录

---

### Phase 4（可选）: Notepad QuickNote → notepad.js

**迁移内容**：
- `showQuickNoteCreateModal()`（S5 中 ~140行）

**优先级**: 低，仅 140 行，且与 notepad.js 高度耦合。

---

## 三、回归测试策略

### 每阶段测试流程

```
1. 提取代码到目标文件 ✓
2. 修改 main.js 中的引用为模块调用 ✓
3. 更新 index.html 加载顺序 ✓
4. git add + git commit  ✅
5. 重启后端 (python -m backend.main)
6. 浏览器打开前端 → 核心功能回归测试
7. 记录测试结果到 TEST_REPORT.md
8. 如有问题 → 修复 → 回到步骤4
9. git add + git commit (fix) ✅
```

### 全局回归检查清单（每阶段均执行）

- [ ] Tab 切换：day / todo / goals / notepad
- [ ] 日程 CRUD（创建/编辑/删除/完成）
- [ ] LLM 输入（提交/队列/失败/重试）
- [ ] 设置页 / AI Providers / User Contexts
- [ ] 目标列表 + Discuss 讨论 + Breakdown 拆解
- [ ] 笔记列表 + 编辑器
- [ ] 记账/预算
- [ ] 浏览器控制台无报错

### 测试报告模板（每阶段完成时产出）

```markdown
## Phase N 回归测试报告
日期: YYYY-MM-DD
状态: ✅ PASS / ⚠️ 部分通过 / ❌ 失败

### 测试范围
- [功能清单...]

### 测试结果
| 测试项 | 结果 | 备注 |
|--------|------|------|
| xxx | ✅ | |
| xxx | ✅ | |

### 发现的问题
- (无)

### 影响节点复核
- main.js:bindEvents() ... 已正确修改
- index.html: 加载顺序已更新
```

---

## 四、风险与注意事项

1. **函数引用链**：部分函数在 main.js 内外互相调用（如 `handleLlmSubmit` → `enqueueLlmRequest` → `processLlmQueue`），迁移时必须整组提取，不能半切。
2. **state/elements 依赖**：所有模块都通过 `window.ScheduleAppCore.state` 和 `.elements` 访问全局状态，提取后保持不变。
3. **bindEvents 耦合**：`bindEvents()` 中所有事件回调直接引用 main.js 内的闭包函数。迁移后需改为 `window.ScheduleAppXxx.fn` 调用。
4. **window 暴露**：`window.restoreDeletedEvent` 等用于 `onclick` 的属性必须保留同名导出。迁移后通过模块引用。
5. **加载顺序**：新文件必须加在 `main.js` 之前（因 main.js 的 `init()` 中直接调用模块方法）。
6. **版本缓存**：所有 script 标签已有 `?v=2026...` 后缀，可能需更新以避免浏览器缓存。

## 五、预期成果

| 阶段 | 后 main.js 行数 | 状态 |
|------|----------------|------|
| 原始 | 5387 | 🚨 |
| 后 Phase 1 (LLM) | ~5037 | 🟡 |
| 后 Phase 2 (Settings) | ~4300 | 🟡 |
| 后 Phase 3 (Goals) | ~2600 | 🟢 |
| 最终 (清理+收尾) | ~1500-1800 | ✅ |

各模块最终行数预计：
- main.js: ~1500-1800（编排+交互+事件绑定）
- goals.js: ~2500-2800（原有1535 + Phase3）
- settings.js: ~1000-1200（原有436 + Phase2）
- llm-queue.js: ~350（新文件）
- 其余模块: 不变
