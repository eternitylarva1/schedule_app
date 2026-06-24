# Style Dead Code Report (2026-06-24)

> 工具: stylelint + stylelint-no-unused-selectors
> 范围: frontend/static/styles/ 全部文件
> 状态: **无法生成准确清单** - stylelint-no-unused-selectors 需要 HTML/JS 源码解析来判断选择器是否被引用，仅靠 CSS 文件无法判断"死代码"。

## 工具运行状态

- stylelint@10.1.0: ✓ 已安装并可运行
- stylelint-no-unused-selectors: ✓ 已安装
- CSS 语法检查: ✓ 通过（无语法错误）
- 未使用选择器检测: ✗ **需要 HTML/JS 解析，无法独立工作**

## 说明

stylelint-no-unused-selectors 插件的检测逻辑是:
1. 解析 CSS 文件获取所有选择器
2. 扫描 HTML/JS 源码检查选择器是否被引用
3. 未被引用的标记为"unused"

由于:
- 我们只拆分了 CSS，未修改 HTML/JS
- 前端代码在 `frontend/static/js/` 和 `frontend/index.html`
- 这些文件**未被此工具扫描**（工具只扫描了 CSS）

因此**无法在此生成可靠的死代码清单**。

## 替代方案

如果需要真正的死代码检测，建议使用以下方式之一:

1. **人工审查**: 通过 `grep -r "\.class-name" ../index.html ../static/js/` 检查选择器是否被引用
2. **浏览器审查**: 在 DevTools 中使用 Coverage 面板
3. **完整工具链**: 使用 `stylelint` + `postcss-html` + `stylelint-no-unused-selectors` 完整解析

## 建议

CSS 拆分后如有实际问题（如样式丢失），会直接体现在 UI 异常上，届时可针对具体问题定位。

> 此报告仅说明工具限制，不表示存在或不存在死代码。
