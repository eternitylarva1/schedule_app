(function () {
    'use strict';

    const core = () => window.ScheduleAppCore || {};
    const st  = () => core().state || {};
    const el  = () => core().elements || {};

    // ============================================
    // View Router - extracted from main.js
    // ============================================

    function renderHeaderTitle() {
        const state = st();
        const elements = el();
        const { isToday, formatDate, getWeekDates } = core();

        const date = state.currentDate;

        if (state.currentView === 'day') {
            // For calendar tab, show based on subview
            if (state.calendarSubview === 'day') {
                if (isToday(date)) {
                    elements.headerTitle.textContent = '今天';
                } else {
                    elements.headerTitle.textContent = formatDate(date);
                }
            } else if (state.calendarSubview === 'week') {
                const weekDates = getWeekDates(date);
                const start = weekDates[0];
                const end = weekDates[6];

                if (start.getMonth() === end.getMonth()) {
                    elements.headerTitle.textContent = `${start.getMonth() + 1}月`;
                } else {
                    elements.headerTitle.textContent = `${start.getMonth() + 1}/${end.getMonth() + 1}月`;
                }
            } else if (state.calendarSubview === 'month') {
                const month = state.currentMonth;
                elements.headerTitle.textContent = `${month.getFullYear()}年${month.getMonth() + 1}月`;
            }
        } else if (state.currentView === 'goals') {
            elements.headerTitle.textContent = '规划';
        } else if (state.currentView === 'stats') {
            elements.headerTitle.textContent = '统计';
        } else if (state.currentView === 'notepad') {
            elements.headerTitle.textContent = state.notepadSubview === 'expense' ? '记账' : '笔记';
        }
    }

    function getCalendarViewDeps() {
        const c = core();
        return {
            state: st(),
            elements: el(),
            formatDate: c.formatDate,
            isSameDay: c.isSameDay,
            isToday: c.isToday,
            getWeekDates: c.getWeekDates,
            getCompactTitle: c.getCompactTitle,
            getEventTop: c.getEventTop,
            getEventHeight: c.getEventHeight,
            getCategoryColor: c.getCategoryColor,
            formatTimeRange: c.formatTimeRange,
            handleEventDragStart: c.handleEventDragStart,
            showEventDetail: () => window.ScheduleAppEventModal?.showEventDetail?.(),
            markEventDoneQuick: () => window.ScheduleAppSelection?.markEventDoneQuick?.(),
            switchView,
            escapeHtml,
        };
    }

    function startStatsClock() {
        stopStatsClock();
        const state = st();
        state.statsClockTimer = setInterval(() => {
            if (state.currentView === 'stats') {
                // renderStatsView is defined in main.js
                window.ScheduleApp?.renderStatsView?.();
            }
        }, 1000);
    }

    function stopStatsClock() {
        const state = st();
        if (state.statsClockTimer) {
            clearInterval(state.statsClockTimer);
            state.statsClockTimer = null;
        }
    }

    async function switchView(view) {
        const state = st();
        const elements = el();
        const exitSelectionMode = () => window.ScheduleAppSelection?.exitSelectionMode?.();
        const openSettingsView = () => window.ScheduleAppSettings?.openSettingsView?.();
        const renderGoalsView = () => window.ScheduleAppGoals?.renderGoalsView?.();
        const renderNotepadView = () => window.ScheduleAppNotepad?.renderNotepadView?.();
        const renderTodoView = () => window.ScheduleAppTodoView?.renderTodoView?.();
        const openEventModal = () => window.ScheduleAppEventModal?.openEventModal?.();

        if (state.selectionMode.active && !['todo', 'goals'].includes(view)) {
            exitSelectionMode();
        }
        state.currentView = view;

        // Save to localStorage
        localStorage.setItem('lastView', view);

        // Update tab bar
        document.querySelectorAll('.tab-item').forEach(tab => {
            tab.classList.remove('active');
            if (tab.getAttribute('data-view') === view) {
                tab.classList.add('active');
            }
        });

        // Hide all views
        elements.dayView.classList.add('hidden');
        elements.weekView.classList.add('hidden');
        elements.monthView.classList.add('hidden');
        elements.todoView.classList.add('hidden');
        elements.goalsView.classList.add('hidden');
        elements.statsView && elements.statsView.classList.add('hidden');
        elements.notepadView.classList.add('hidden');
        elements.settingsView && elements.settingsView.classList.add('hidden');

        stopStatsClock();

        // Immersive notepad mode: hide top chrome and keep scrolling local
        if (elements.app) {
            elements.app.classList.toggle('notepad-immersive', view === 'notepad');
        }

        // Show/hide prev/next navigation buttons (only for day view with week/month subview)
        const showNavArrows = view === 'day' && (state.calendarSubview === 'week' || state.calendarSubview === 'month');
        if (elements.prevBtn) {
            elements.prevBtn.classList.toggle('hidden', !showNavArrows);
        }
        if (elements.nextBtn) {
            elements.nextBtn.classList.toggle('hidden', !showNavArrows);
        }

        // Show/hide floating add button (day/todo/notepad)
        if (view === 'day' || view === 'todo' || view === 'notepad') {
            elements.contentAddBtn.classList.remove('hidden');
            elements.contentAddBtn.textContent = '+';
            elements.contentAddBtn.title = view === 'notepad'
                ? (state.notepadSubview === 'expense' ? '快速记账' : '新建笔记')
                : '新建日程';
        } else {
            elements.contentAddBtn.classList.add('hidden');
        }

        // Close AI chat panel when switching away from notepad
        if (view !== 'notepad') {
            if (window.ScheduleAppNoteAI && typeof window.ScheduleAppNoteAI.hideAIFloatingWindow === 'function') {
                window.ScheduleAppNoteAI.hideAIFloatingWindow();
            }
            const aiFloatBtn = document.getElementById('aiChatFloatBtn');
            if (aiFloatBtn) aiFloatBtn.classList.add('hidden');
        }

        // Show active view
        switch (view) {
            case 'day':
                elements.dayView.classList.remove('hidden');
                // Update segmented control active state
                document.querySelectorAll('.cal-segment').forEach(seg => {
                    seg.classList.toggle('active', seg.dataset.subview === state.calendarSubview);
                });
                // Hide week/month views by default, show based on calendar subview
                elements.weekView.classList.add('hidden');
                elements.monthView.classList.add('hidden');
                elements.daySlider.classList.add('hidden');

                // Render based on calendar subview
                if (state.calendarSubview === 'day') {
                    elements.dayView.classList.remove('hidden');
                    elements.dayView.classList.add('view-enter');
                    setTimeout(() => elements.dayView.classList.remove('view-enter'), 300);
                    elements.daySlider.classList.remove('hidden');
                    elements.weekView.classList.add('hidden');
                    elements.monthView.classList.add('hidden');
                    elements.timeline.innerHTML = '<div class="skeleton" style="height:200px;margin:12px;"></div>';
                    renderTimeline();
                    // Scroll to current time if viewing today
                    if (isToday(state.currentDate)) {
                        const now = new Date();
                        const currentMinutes = now.getHours() * 60 + now.getMinutes();
                        // Position current time line at top of viewport for better visibility
                        const scrollTop = Math.max(0, currentMinutes - 30);
                        elements.dayView.scrollTop = scrollTop;
                        // Start real-time clock for current time line
                        if (state.currentTimeTimer) clearInterval(state.currentTimeTimer);
                        state.currentTimeTimer = setInterval(() => {
                            if (state.currentView === 'day' && state.calendarSubview === 'day' && isToday(state.currentDate)) {
                                window.ScheduleAppCalendarViews?.updateCurrentTimeLine?.(getCalendarViewDeps());
                            } else {
                                clearInterval(state.currentTimeTimer);
                                state.currentTimeTimer = null;
                            }
                        }, 60000);
                    } else {
                        if (state.currentTimeTimer) {
                            clearInterval(state.currentTimeTimer);
                            state.currentTimeTimer = null;
                        }
                    }
                } else if (state.calendarSubview === 'week') {
                    elements.dayView.classList.add('hidden');
                    elements.daySlider.classList.add('hidden');
                    elements.weekView.classList.remove('hidden');
                    elements.weekView.classList.add('view-enter');
                    setTimeout(() => elements.weekView.classList.remove('view-enter'), 300);
                    elements.monthView.classList.add('hidden');
                    elements.weekGrid.innerHTML = '<div class="skeleton" style="height:200px;margin:12px;"></div>';
                    renderWeekView();
                } else if (state.calendarSubview === 'month') {
                    elements.dayView.classList.add('hidden');
                    elements.daySlider.classList.add('hidden');
                    elements.weekView.classList.add('hidden');
                    elements.monthView.classList.remove('hidden');
                    elements.monthView.classList.add('view-enter');
                    setTimeout(() => elements.monthView.classList.remove('view-enter'), 300);
                    // Keep month alignment: state.currentMonth = first day
                    state.currentMonth = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
                    elements.monthGrid.innerHTML = '<div class="skeleton" style="height:200px;margin:12px;"></div>';
                    renderMonthView();
                }
                break;
            case 'todo':
                elements.todoView.classList.remove('hidden');
                elements.todoView.classList.add('view-enter');
                setTimeout(() => elements.todoView.classList.remove('view-enter'), 300);
                await renderTodoView();
                break;
            case 'notepad':
                if (elements.notepadView) {
                    elements.notepadView.classList.remove('hidden');
                    elements.notepadView.classList.add('view-enter');
                    setTimeout(() => elements.notepadView.classList.remove('view-enter'), 300);
                    await renderNotepadView();
                }
                break;
            case 'goals':
                elements.goalsView.classList.remove('hidden');
                elements.goalsView.classList.add('view-enter');
                setTimeout(() => elements.goalsView.classList.remove('view-enter'), 300);
                await renderGoalsView();
                break;
            case 'settings':
                if (elements.settingsView) {
                    elements.settingsView.classList.remove('hidden');
                    elements.settingsView.classList.add('view-enter');
                    setTimeout(() => elements.settingsView.classList.remove('view-enter'), 300);
                }
                await openSettingsView();
                break;
            case 'add':
                openEventModal();
                return; // Don't update header for add
        }

        renderHeaderTitle();
    }

    function navigateDate(direction) {
        const state = st();
        const loadData = () => core().loadData();

        // Debounce - prevent rapid navigation
        if (state.isNavigating) return;
        state.isNavigating = true;
        const previousYear = state.currentDate.getFullYear();
        const previousMonth = state.currentDate.getMonth();

        const date = state.currentDate;

        if (state.currentView === 'day') {
            // Navigate based on calendar subview
            if (state.calendarSubview === 'day') {
                date.setDate(date.getDate() + direction);
            } else if (state.calendarSubview === 'week') {
                date.setDate(date.getDate() + (direction * 7));
            } else if (state.calendarSubview === 'month') {
                // Navigate by month
                state.currentMonth.setMonth(state.currentMonth.getMonth() + direction);
                state.currentMonth = new Date(state.currentMonth);
                // Also update currentDate to first day of the month for consistency
                state.currentDate = new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth(), 1);
            }
        }

        state.currentDate = new Date(date);

        // Add slide animation for day view
        if (state.currentView === 'day') {
            const slider = document.getElementById('daySlider');

            // Render based on subview
            if (state.calendarSubview === 'day') {
                const monthChanged = state.currentDate.getFullYear() !== previousYear || state.currentDate.getMonth() !== previousMonth;
                if (monthChanged) {
                    loadData();
                } else if (slider) {
                    slider.classList.remove('animating');
                    slider.style.transform = `translateX(${-direction * 100}%)`;

                    // Render new content
                    renderTimeline();
                    renderHeaderTitle();

                    // Animate to center
                    requestAnimationFrame(() => {
                        slider.classList.add('animating');
                        slider.style.transform = 'translateX(0)';
                    });

                    // Clean up animation class
                    setTimeout(() => {
                        slider.classList.remove('animating');
                        slider.style.transform = '';
                    }, 300);
                } else {
                    loadData();
                }
            } else if (state.calendarSubview === 'week') {
                loadData();
            } else if (state.calendarSubview === 'month') {
                loadData();
            }
        } else {
            loadData();
        }

        // Re-enable after debounce delay
        setTimeout(() => {
            state.isNavigating = false;
        }, 300);
    }

    async function renderActiveViewAfterDataLoad() {
        const state = st();
        const renderGoalsView = () => window.ScheduleAppGoals?.renderGoalsView?.();
        const renderNotepadView = () => window.ScheduleAppNotepad?.renderNotepadView?.();
        const renderTodoView = () => window.ScheduleAppTodoView?.renderTodoView?.();

        if (state.currentView === 'day') {
            if (state.calendarSubview === 'day') {
                renderTimeline();
            } else if (state.calendarSubview === 'week') {
                renderWeekView();
            } else if (state.calendarSubview === 'month') {
                renderMonthView();
            }
            return;
        }

        if (state.currentView === 'todo') {
            await renderTodoView();
            return;
        }

        if (state.currentView === 'notepad') {
            await renderNotepadView();
            return;
        }

        if (state.currentView === 'goals') {
            await renderGoalsView();
            return;
        }

        if (state.currentView === 'stats') {
            // renderStatsView is defined in main.js
            window.ScheduleApp?.renderStatsView?.();
        }
    }

    function parseHashRoute() {
        const hash = window.location.hash;
        if (hash === '' || hash === '#' || hash === '#/') {
            return null;
        }
        const match = hash.match(/^#\/(.+)$/);
        return match ? match[1] : null;
    }

    async function handleHashRoute() {
        const route = parseHashRoute();
        if (route === 'settings') {
            await switchView('settings');
        } else {
            // Clear hash or unknown route - restore last view
            const allowedViews = new Set(['day', 'todo', 'goals', 'notepad']);
            const savedView = localStorage.getItem('lastView') || 'day';
            const lastView = allowedViews.has(savedView) ? savedView : 'day';
            await switchView(lastView);
        }
    }

    // ============================================
    // Local helpers (same module)
    // ============================================
    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function renderTimeline() {
        return window.ScheduleAppCalendarViews?.renderTimeline?.(getCalendarViewDeps());
    }

    function renderWeekView() {
        return window.ScheduleAppCalendarViews?.renderWeekView?.(getCalendarViewDeps());
    }

    function renderMonthView() {
        return window.ScheduleAppCalendarViews?.renderMonthView?.(getCalendarViewDeps());
    }

    function isToday(date) {
        return core().isToday(date);
    }

    // ============================================
    // Export
    // ============================================
    window.ScheduleAppViewRouter = {
        renderHeaderTitle,
        getCalendarViewDeps,
        startStatsClock,
        stopStatsClock,
        switchView,
        navigateDate,
        renderActiveViewAfterDataLoad,
        parseHashRoute,
        handleHashRoute,
    };
})();
