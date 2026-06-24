# 回归测试报告

## Phase 1: LLM 队列提取 → llm-queue.js

**日期**: 2026-06-24
**状态**: ✅ **全部通过**

### 测试范围

| 测试项 | 结果 | 备注 |
|--------|------|------|
| Tab 导航切换（Day/Todo/Goals/Notepad） | ✅ | 4个视图均正常切换 |
| LLM 模块加载 | ✅ | `window.ScheduleAppLlmQueue` 已存在 |
| `handleLlmSubmit` 函数可用 | ✅ | |
| `cancelLlmGeneration` 函数可用 | ✅ | |
| `init` 函数可用 | ✅ | |
| `enqueueLlmRequest` 函数可用 | ✅ | |
| `restoreLlmFailedToInput` 函数可用 | ✅ | |
| `window.restoreLlmFailedToInput` 全局导出 | ✅ | 保持 onclick 兼容 |
| `window.hideLlmFailedBanner` 全局导出 | ✅ | 保持 onclick 兼容 |
| `window.switchView` 全局导出 | ✅ | |
| `ScheduleAppCore.loadData` 可用 | ✅ | 新暴露，供 llm-queue 使用 |
| `ScheduleAppCore.apiCall` 可用 | ✅ | |
| `ScheduleAppCore.showToast` 可用 | ✅ | |
| `ScheduleAppCore.executeUnifiedLlmCommand` 可用 | ✅ | |
| LLM 提交 → processing 状态 | ✅ | 提交后按钮显示 processing |
| LLM 取消 → processing 停止 | ✅ | 取消后恢复正常状态 |
| 浏览器控制台无报错 | ✅ | |

### 影响节点复核

| 节点 | 状态 | 说明 |
|------|------|------|
| `main.js:bindEvents()` LLM 部分 | ✅ | 改用 `llmQueue.xxx()` 委托调用 |
| `main.js:init()` | ✅ | `restoreLlmFailedFromStorage()` → `llmQueue.init()` |
| `main.js` window exports | ✅ | 保持 `restoreLlmFailedToInput`/`hideLlmFailedBanner` 兼容 |
| `main.js` ScheduleAppCore exports | ✅ | 新增 `loadData` 暴露 |
| `index.html` 加载顺序 | ✅ | `llm-queue.js` 在 `main.js` 之前加载 |

### 发现的问题

无。

### 结论

Phase 1 迁移完成，LLM 队列功能已从 main.js 成功提取到 `llm-queue.js`，所有功能正常工作，无回归问题。
