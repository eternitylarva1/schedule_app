# Testing Plan and Acceptance Criteria

- Scope:
  - Budget module rendering
  - AI provider list integration
  - 现状 (我的现状) management (load, edit, delete, refresh)
  - QQ notification end-to-end path
- Test Types:
  - Unit tests for budget APIs
  - Integration tests for budget/AI/provider interactions
  - End-to-end UI smoke tests across browsers
- Acceptance Criteria:
  - All tests pass in CI with 0 failing tests
  - UI renders budgets and AI providers consistently across browsers
  - QQ notifications reach the test endpoint and logs show success
- Evidence:
  - Screenshots and video recordings of failing/passing tests
  - Logs from CI runs
