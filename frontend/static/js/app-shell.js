(function() {
    'use strict';

    const shell = {
        _deps: null,

        parseHashRoute() {
            const hash = window.location.hash;
            if (hash === '' || hash === '#' || hash === '#/') return null;
            const match = hash.match(/^#\/(.+)$/);
            return match ? match[1] : null;
        },

        async handleHashRoute() {
            const { controllers } = this._deps;
            const route = this.parseHashRoute();
            if (route === 'settings') {
                await controllers.switchView('settings');
                return;
            }
            const allowedViews = new Set(['day', 'todo', 'goals', 'notepad']);
            const savedView = localStorage.getItem('lastView') || 'day';
            const lastView = allowedViews.has(savedView) ? savedView : 'day';
            await controllers.switchView(lastView);
        },

        async renderActiveViewAfterDataLoad() {
            const { state, views, controllers } = this._deps;
            if (state.currentView === 'day') {
                if (state.calendarSubview === 'day') views.renderTimeline();
                else if (state.calendarSubview === 'week') views.renderWeekView();
                else if (state.calendarSubview === 'month') views.renderMonthView();
                return;
            }
            if (state.currentView === 'todo') return controllers.renderTodoView();
            if (state.currentView === 'notepad') return controllers.renderNotepadView();
            if (state.currentView === 'goals') return controllers.renderGoalsView();
            if (state.currentView === 'stats') views.renderStatsView();
        },

        async loadData() {
            const { state, services, views } = this._deps;
            if (state.isLoading) {
                state.reloadRequested = true;
                return state.loadPromise || Promise.resolve();
            }
            state.isLoading = true;
            state.loadPromise = (async () => {
                do {
                    state.reloadRequested = false;
                    let dateFilter = 'month';
                    if (state.currentView === 'day') {
                        if (state.calendarSubview === 'month') {
                            const year = state.currentMonth.getFullYear();
                            const month = state.currentMonth.getMonth() + 1;
                            dateFilter = `${year}-${String(month).padStart(2, '0')}`;
                        } else {
                            const year = state.currentDate.getFullYear();
                            const month = state.currentDate.getMonth() + 1;
                            dateFilter = `${year}-${String(month).padStart(2, '0')}`;
                        }
                    }
                    try {
                        await Promise.all([
                            services.fetchCategories(),
                            services.fetchEvents(dateFilter),
                            services.fetchStats('today')
                        ]);
                        views.renderHeaderTitle();
                        await this.renderActiveViewAfterDataLoad();
                    } catch (error) {
                        console.error('Load data error:', error);
                    }
                } while (state.reloadRequested);
            })().finally(() => {
                state.isLoading = false;
                state.loadPromise = null;
                state.reloadRequested = false;
            });
            return state.loadPromise;
        },

        bindEvents() {
            const { state, controllers } = this._deps;
            if (state._eventsBound) return;
            state._eventsBound = true;
            controllers.bindEvents();
        },

        async init(deps) {
            this._deps = deps;
            const { state, controllers } = deps;

            controllers.injectToastStyles();
            controllers.registerGlobalErrorHandlers();
            this.bindEvents();
            controllers.renderCategorySelector();
            controllers.syncPendingTimeState();
            controllers.initAIChatPanel();

            window.addEventListener('hashchange', () => this.handleHashRoute());

            await this.loadData();
            const route = this.parseHashRoute();
            if (route === 'settings') {
                await controllers.switchView('settings');
            } else {
                const allowedViews = new Set(['day', 'todo', 'goals', 'notepad']);
                const savedView = localStorage.getItem('lastView') || 'day';
                const lastView = allowedViews.has(savedView) ? savedView : 'day';
                await controllers.switchView(lastView);
            }

            window.switchView = controllers.switchView;
            window.scheduleAppState = state;
        }
    };

    window.ScheduleAppShell = shell;
})();
