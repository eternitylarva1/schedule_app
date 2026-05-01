// Guard against duplicate AI provider rendering in Settings UI
;(function() {
  try {
    if (window.__settings_ai_guard_initialized) return;
  } catch (e) {
    // ignore
  }
  window.__settings_ai_guard_initialized = true;

  // Simple idempotent guard: if provider list already rendered, do nothing
  // Uses actual DOM id and class names from the codebase (not non-existent data-testid)
  var canRenderProviders = function() {
    var list = document.getElementById('aiProvidersList');
    if (!list) return false;
    // consider rendered if at least one provider item exists
    var hasItem = !!list.querySelector('.ai-provider-item');
    return !hasItem;
  };

  // If a global render function exists, wrap it to guard duplication
  var originalRender = window.renderAiProviders;
  window.renderAiProviders = function(providers) {
    if (!canRenderProviders()) {
      // Skip rendering to avoid duplicates
      return;
    }
    if (typeof originalRender === 'function') {
      originalRender(providers);
    }
  };
})();
