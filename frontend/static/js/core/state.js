/**
 * Shared app state and DOM references
 * Non-module global namespace for legacy script runtime.
 */
(function (global) {
  'use strict';

  const state = {
    currentDate: new Date(),
    currentMonth: new Date(),
    currentView: 'day',
    calendarSubview: 'day',
    todoSubview: 'all',
    events: [],
    categories: [],
    stats: { total: 0, completed: 0, pending: 0, completion_rate: 0 },
    selectedCategory: 'work',
    selectedEvent: null,
    isSavingEvent: false,
    isLoading: false,
    loadPromise: null,
    reloadRequested: false,
    isLlmProcessing: false,
    llmQueue: [],
    llmQueueRunning: false,
    llmActiveRequest: null,
    llmCycleTotal: 0,
    llmCycleDone: 0,
    llmCycleSucceeded: 0,
    llmCycleFailed: 0,
    llmStatusHideTimer: null,
    llmLastStatusText: '',
    llmLastSubmittedText: '',  // 保存最后提交的文本，便于复制和编辑
    llmAbortController: null,
    llmCancelRequested: false,
    isNavigating: false,
    dragState: { event: null, type: null, originalStart: null, originalEnd: null, startY: 0 },
    pullToRefresh: { startY: 0, isRefreshing: false },
    swipe: { startX: 0, startY: 0, isSwiping: false, deltaX: 0, isHorizontal: false },
    breakdownItems: [],
    breakdownId: null,
    breakdownHorizon: 'short',
    goals: [],
    goalsHorizon: 'short',
    goalsViewMode: 'list',  // 'list' | 'timeline'
    timelineZoom: { short: 1, semester: 1, long: 1 },  // per-group zoom factors
    expandedGoalIds: new Set(),
    enableDragResize: false,
    qqReminderEnabled: false,
    defaultTaskReminderEnabled: true,
    llmApiBase: '',
    llmModel: '',
    llmApiKey: '',
    userSelfDescription: '',
    userContexts: [],
    selectedUserContextId: null,
    statsClockTimer: null,
    currentTimeTimer: null,
    notepadSubview: 'notes',
    notes: [],
    noteGroups: [],
    expandedGroups: new Set(),
    expenses: [],
    expenseDateFilter: 'month',  // 'month', 'YYYY-MM' format
    expenseMonthSelectorInitialized: false,
    selectionMode: {
      active: false,
      type: null,
      todoIds: new Set(),
      goalIds: new Set(),
      longPressTimer: null,
      longPressTriggered: false,
      startX: 0,
      startY: 0,
    },
    expenseCategories: [],
    expenseStats: { total: 0, by_category: {} },
    budgets: [],
    budgetView: 'cards',
    selectedNote: null,
    notepadSwipeGlobalBound: false,
  };

  // Load categories from API
  async function loadCategories() {
    try {
      const response = await fetch('/api/categories');
      const json = await response.json();
      if (json && json.code === 0 && Array.isArray(json.data)) {
        state.categories = json.data.filter(c => c.type === 'event');
        state.expenseCategories = json.data.filter(c => c.type === 'expense');
      }
    } catch(e) {
      console.warn('Failed to load categories, using defaults', e);
    }
  }

  // Initialize categories on load
  loadCategories();

  global.ScheduleAppCore = {
    ...(global.ScheduleAppCore || {}),
    state,
    loadCategories,
  };
})(window);