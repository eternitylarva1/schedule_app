/**
 * Schedule App - View Controller Module
 * Centralizes view/subview switching and date navigation behavior.
 */

(function (global) {
    'use strict';

    function createViewController(deps) {
        const {
            state,
            elements,
            formatDate,
            isToday,
            getWeekDates,
            loadData,
            renderTimeline,
            renderWeekView,
            renderMonthView,
            renderTodoView,
            renderNotepadView,
            renderGoalsView,
            openSettingsView,
            openEventModal,
            hideAIFloatingWindow,
            stopStatsClock,
            exitSelectionMode,
        } = deps;

        function renderHeaderTitle() {
            const date = state.currentDate;

            if (state.currentView === 'day') {
                if (state.calendarSubview === 'day') {
                    elements.headerTitle.textContent = isToday(date) ? '今天' : formatDate(date);
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

        function applyViewState(nextView, appState, dom) {
            document.querySelectorAll('.tab-item').forEach((tab) => {
                tab.classList.toggle('active', tab.getAttribute('data-view') === nextView);
            });

            [
                dom.dayView,
                dom.weekView,
                dom.monthView,
                dom.todoView,
                dom.goalsView,
                dom.statsView,
                dom.notepadView,
                dom.settingsView,
            ].forEach((viewEl) => viewEl && viewEl.classList.add('hidden'));

            stopStatsClock();

            if (dom.app) {
                dom.app.classList.toggle('notepad-immersive', nextView === 'notepad');
            }

            if (nextView === 'day' || nextView === 'todo' || nextView === 'notepad') {
                dom.contentAddBtn.classList.remove('hidden');
                dom.contentAddBtn.textContent = '+';
                dom.contentAddBtn.title = nextView === 'notepad'
                    ? (appState.notepadSubview === 'expense' ? '快速记账' : '新建笔记')
                    : '新建日程';
            } else {
                dom.contentAddBtn.classList.add('hidden');
            }

            if (nextView !== 'notepad') {
                hideAIFloatingWindow();
                const aiFloatBtn = document.getElementById('aiChatFloatBtn');
                if (aiFloatBtn) aiFloatBtn.classList.add('hidden');
            }

            renderHeaderTitle();
        }

        async function applyCalendarSubview(subview, options = {}) {
            const { shouldLoadData = true } = options;

            state.calendarSubview = subview;

            document.querySelectorAll('.cal-segment').forEach((seg) => {
                seg.classList.toggle('active', seg.dataset.subview === state.calendarSubview);
            });

            elements.dayView.classList.add('hidden');
            elements.weekView.classList.add('hidden');
            elements.monthView.classList.add('hidden');
            elements.daySlider.classList.add('hidden');

            if (state.calendarSubview === 'day') {
                elements.dayView.classList.remove('hidden');
                elements.daySlider.classList.remove('hidden');
                renderTimeline();

                if (isToday(state.currentDate)) {
                    const now = new Date();
                    const currentMinutes = now.getHours() * 60 + now.getMinutes();
                    const scrollTop = Math.max(0, currentMinutes - 60);
                    elements.dayView.scrollTop = scrollTop;
                }
            } else if (state.calendarSubview === 'week') {
                elements.weekView.classList.remove('hidden');
                renderWeekView();
            } else if (state.calendarSubview === 'month') {
                elements.monthView.classList.remove('hidden');
                state.currentMonth = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
                renderMonthView();
            }

            renderHeaderTitle();

            if (shouldLoadData) {
                await loadData();
            }
        }

        async function switchView(view) {
            if (state.selectionMode.active && !['todo', 'goals'].includes(view)) {
                exitSelectionMode();
            }

            state.currentView = view;
            localStorage.setItem('lastView', view);
            applyViewState(view, state, elements);

            switch (view) {
                case 'day':
                    await applyCalendarSubview(state.calendarSubview, { shouldLoadData: false });
                    break;
                case 'todo':
                    elements.todoView.classList.remove('hidden');
                    await renderTodoView();
                    break;
                case 'notepad':
                    elements.notepadView?.classList.remove('hidden');
                    await renderNotepadView();
                    break;
                case 'goals':
                    elements.goalsView.classList.remove('hidden');
                    await renderGoalsView();
                    break;
                case 'stats':
                    elements.statsView?.classList.remove('hidden');
                    break;
                case 'settings':
                    elements.settingsView?.classList.remove('hidden');
                    await openSettingsView();
                    break;
                case 'add':
                    openEventModal();
                    return;
                default:
                    break;
            }

            renderHeaderTitle();
        }

        function navigateDate(direction) {
            if (state.isNavigating) return;
            state.isNavigating = true;

            const previousYear = state.currentDate.getFullYear();
            const previousMonth = state.currentDate.getMonth();
            const date = state.currentDate;

            if (state.currentView === 'day') {
                if (state.calendarSubview === 'day') {
                    date.setDate(date.getDate() + direction);
                } else if (state.calendarSubview === 'week') {
                    date.setDate(date.getDate() + (direction * 7));
                } else if (state.calendarSubview === 'month') {
                    state.currentMonth.setMonth(state.currentMonth.getMonth() + direction);
                    state.currentMonth = new Date(state.currentMonth);
                    state.currentDate = new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth(), 1);
                }
            }

            state.currentDate = new Date(date);

            if (state.currentView === 'day') {
                const slider = document.getElementById('daySlider');

                if (state.calendarSubview === 'day') {
                    const monthChanged = state.currentDate.getFullYear() !== previousYear || state.currentDate.getMonth() !== previousMonth;
                    if (monthChanged) {
                        loadData();
                    } else if (slider) {
                        slider.classList.remove('animating');
                        slider.style.transform = `translateX(${-direction * 100}%)`;
                        renderTimeline();
                        renderHeaderTitle();
                        requestAnimationFrame(() => {
                            slider.classList.add('animating');
                            slider.style.transform = 'translateX(0)';
                        });
                        setTimeout(() => {
                            slider.classList.remove('animating');
                            slider.style.transform = '';
                        }, 300);
                    } else {
                        loadData();
                    }
                } else {
                    loadData();
                }
            } else {
                loadData();
            }

            setTimeout(() => {
                state.isNavigating = false;
            }, 300);
        }

        return {
            switchView,
            navigateDate,
            renderHeaderTitle,
            applyViewState,
            applyCalendarSubview,
        };
    }

    global.ScheduleAppViewController = {
        createViewController,
    };
})(window);
