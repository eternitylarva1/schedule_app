# Reflections

## 经验教训

### 1. 全链路测试，别走捷径

`curl` 调用 API 正常不代表功能正常。如果前端 `api-toast.js` 的 `updateNote` 把字段吞了，API 和 DB 再好也没用。

**以后做**：从 UI 操作 → 网络请求 → DB → 重新渲染 → DOM 检查，全链路验证。

### 2. 加字段要搜所有 CRUD 路径

新增模型字段时，fixer 只改了后端（model/route/db），前端 CRUD 函数里的 payload 手工白名单极易遗漏。Stage 2 的 `color`/`is_pinned`/`is_archived` 就是因此丢掉。

**以后做**：字段变更后，搜索所有 payload 构造点（`JSON.stringify`、手动 `payload = {…}`、`apiCall` 调用处），确认新字段都能送出去。

### 3. 白名单 payload 是脆弱模式

```javascript
const payload = { title, content, group_id, sort_order };
// 漏了 is_pinned / color / is_archived —— 每加一个字段都要来这里补
```

**以后做**：用 `{...noteInput}` 透传，或在统一的 `apiCall` 封装层做字段过滤，不在散布的 CRUD 函数里手动构造。

### 4. getComputedStyle 验证不够

通过 DOM 属性看到颜色值是 `rgb(76,175,80)`，以为功能正常，但那只是之前 API 预设的数据，不是 UI 操作产生的。

**以后做**：不能截图时，至少保证测试脚本完全模拟用户操作，不要依赖 API 预设数据来验证 UI 功能。

### 5. debug log 不提交

连着的 commit 里都是 `console.log`，污染历史。

**以后做**：本地加 log → 定位问题 → `git checkout -- <file>` 撤掉再提交。

### 6. 调 CSS 之前先查数据层

用户反馈"颜色竖条看不到"，花了数小时调 CSS 样式（宽、阴影、动画），结果根因是 `api-toast.js` 一行代码——字段没发出去。

**以后做**：功能"没反应"优先级：数据是否送达（检查网络请求）→ 是否入库 → 渲染条件 — 最后才动 UI 细节。
