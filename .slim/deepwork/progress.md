# Deepwork Progress: 修复添加子任务后展开状态丢失

## Current Phase: Planning

## Task Description
修复目标规划功能中，点击添加子任务后，所有已展开的目标卡片都会收回去的问题。

## Root Cause Analysis
- `renderGoalsList()` 函数全量重绘目标列表时，没有保留 `expanded` 状态
- 顶级目标的 `.goal-children` 在初始渲染时带有 `hidden` class
- 添加子任务后调用 `renderGoalsList()`，所有 DOM 被重新创建，展开状态丢失

## Fix Plan
1. 在 `renderGoalsList()` 开头收集所有已展开的 goal-card ID
2. 在渲染完成后恢复这些卡片的展开状态
3. 确保 toggle 按钮的文字也同步更新

## Dependencies
- None

## Status Log
- 2026-06-18 14:30: Started
- 2026-06-18 14:32: Analyzed code, identified root cause
- 2026-06-18 14:33: Prepared fix plan
