// Lightweight guard to prevent duplicate budget renderings in Settings
(function(){
  if (window.__budget_render_guard_initialized) return;
  window.__budget_render_guard_initialized = true;

  // Wrap potential render call for budget list to prevent duplicates
  if (typeof window.renderBudgetList === 'function') {
    const original = window.renderBudgetList;
    window.renderBudgetList = function(budgets){
      if (document.querySelector('[data-testid="budget-list"][data-done]')) return;
      original.apply(this, arguments);
      // mark as rendered
      const list = document.querySelector('[data-testid="budget-list"]');
      if (list) list.setAttribute('data-done', 'true');
    };
  }
})();
