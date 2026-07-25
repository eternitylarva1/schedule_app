/**
 * Schedule Management Mobile SPA
 * State management, API calls, views, and touch interactions
 */

(function() {
    'use strict';

    // ============================================
    // App Version
    // ============================================
    const APP_VERSION = '1.0.0';

    // ============================================
    // State & DOM (externalized)
    // ============================================
    const state = (window.ScheduleAppCore && window.ScheduleAppCore.state) || {};
    const elements = (window.ScheduleAppCore && window.ScheduleAppCore.elements) || {};

    const {
        formatDate,
        formatDateForApi,
        isSameDay,
        isToday,
        getWeekDates,
        getCompactTitle,
        getEventTop,
        getEventHeight,
        getCategoryColor,
        getCategoryName,
        formatTimeRange,
        horizonLabel,
        formatTime,
        toLocalDatetime,
    } = window.ScheduleAppCore;

    const {
        handleEventDragStart,
        handleEventDragMove,
        updateEventElementVisual,
        handleEventDragEnd,
        updateEventAPI,
    } = window.ScheduleAppCore;

// ============================================
    // Utility Functions
    // ============================================


    const markEventDoneQuick = (...args) => window.ScheduleAppSelection?.markEventDoneQuick?.(...args);
    const applyRecurrenceUI = (...args) => window.ScheduleAppRecurrenceUI?.applyRecurrenceUI?.(...args);
    const collectRecurrenceFromUI = (...args) => window.ScheduleAppRecurrenceUI?.collectRecurrenceFromUI?.(...args);
    const formatRecurrenceDisplay = (...args) => window.ScheduleAppRecurrenceUI?.formatRecurrenceDisplay?.(...args);
    const openEventModal = (...args) => window.ScheduleAppEventModal?.openEventModal?.(...args);
    const closeEventModal = (...args) => window.ScheduleAppEventModal?.closeEventModal?.(...args);
    const saveEvent = (...args) => window.ScheduleAppEventModal?.saveEvent?.(...args);
    const syncPendingTimeState = (...args) => window.ScheduleAppEventModal?.syncPendingTimeState?.(...args);
    const showEventDetail = (...args) => window.ScheduleAppEventModal?.showEventDetail?.(...args);
    const saveDetailChanges = (...args) => window.ScheduleAppEventModal?.saveDetailChanges?.(...args);
    const closeDetailModal = (...args) => window.ScheduleAppEventModal?.closeDetailModal?.(...args);
    const deleteSelectedEvent = (...args) => window.ScheduleAppEventModal?.deleteSelectedEvent?.(...args);
    const completeSelectedEvent = (...args) => window.ScheduleAppEventModal?.completeSelectedEvent?.(...args);
    const getActionLabel = (...args) => window.ScheduleAppEventModal?.getActionLabel?.(...args);
    const formatHistoryTime = (...args) => window.ScheduleAppEventModal?.formatHistoryTime?.(...args);
    const formatHistoryDiff = (...args) => window.ScheduleAppEventModal?.formatHistoryDiff?.(...args);
    const getSelectionSet = (...args) => window.ScheduleAppSelection?.getSelectionSet?.(...args);
    const exitSelectionMode = (...args) => window.ScheduleAppSelection?.exitSelectionMode?.(...args);
    const enterSelectionMode = (...args) => window.ScheduleAppSelection?.enterSelectionMode?.(...args);
    const toggleSelection = (...args) => window.ScheduleAppSelection?.toggleSelection?.(...args);
    const renderSelectionBar = (...args) => window.ScheduleAppSelection?.renderSelectionBar?.(...args);
    const renderQuadrantView = (...args) => window.ScheduleAppTodoView?.renderQuadrantView?.(...args);
    const renderTodoView = (...args) => window.ScheduleAppTodoView?.renderTodoView?.(...args);

    // View router proxies (lazy-load from view-router.js)
    const renderHeaderTitle = (...args) => window.ScheduleAppViewRouter?.renderHeaderTitle?.(...args);
    const getCalendarViewDeps = (...args) => window.ScheduleAppViewRouter?.getCalendarViewDeps?.(...args);
    const startStatsClock = (...args) => window.ScheduleAppViewRouter?.startStatsClock?.(...args);
    const stopStatsClock = (...args) => window.ScheduleAppViewRouter?.stopStatsClock?.(...args);
    const switchView = (...args) => window.ScheduleAppViewRouter?.switchView?.(...args);
    const navigateDate = (...args) => window.ScheduleAppViewRouter?.navigateDate?.(...args);
    const renderActiveViewAfterDataLoad = (...args) => window.ScheduleAppViewRouter?.renderActiveViewAfterDataLoad?.(...args);
    const parseHashRoute = (...args) => window.ScheduleAppViewRouter?.parseHashRoute?.(...args);
    const handleHashRoute = (...args) => window.ScheduleAppViewRouter?.handleHashRoute?.(...args);

    // Lazy reference to app-init.js bindEvents
    const bindEvents = (...args) => window.ScheduleAppInit?.bindEvents?.(...args);

    // Search module proxies
    const initSearch = (...args) => window.ScheduleAppSearch?.initSearch?.(...args);
    const closeSearch = (...args) => window.ScheduleAppSearch?.closeSearch?.(...args);
    const performSearch = (...args) => window.ScheduleAppSearch?.performSearch?.(...args);
    const renderSearchResults = (...args) => window.ScheduleAppSearch?.renderSearchResults?.(...args);
    const formatSearchTime = (...args) => window.ScheduleAppSearch?.formatSearchTime?.(...args);

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Lazy references to utils2.js duplicate functions
    const debounce = (...args) => window.ScheduleAppUtils?.debounce?.(...args);
    const registerGlobalErrorHandlers = () => window.ScheduleAppUtils?.registerGlobalErrorHandlers?.();
    const injectToastStyles = () => window.ScheduleAppUtils?.injectToastStyles?.();
    const showFatalDebugBanner = (...args) => window.ScheduleAppUtils?.showFatalDebugBanner?.(...args);

    // ============================================
    // Event Drag/Resize Handling

    // ============================================



    // ============================================
    // API/Toast aliases (externalized)
    // ============================================
    const {
        apiCall,
        fetchEvents,
        fetchStats,
        fetchCategories,
        createEvent,
        updateEvent,
        fetchGoals,
        createGoal,
        updateGoal,
        deleteGoal,
        fetchGoalConversations,
        createGoalConversation,
        fetchSettings,
        updateSetting,
        cleanupTestEntries,
        deleteEvent,
        completeEvent,
        uncompleteEvent,

        fetchNotes,
        createNote,
        updateNote,
        deleteNote,
        fetchNoteGroups,
        createNoteGroup,
        updateNoteGroup,
        deleteNoteGroup,
        fetchNoteConversations,
        chatWithNote,
        clearNoteConversations,
        fetchExpenses,
        createExpense,
        updateExpense,
        deleteExpense,
        fetchExpenseStats,
        parseExpenseWithLLM,
        fetchBudgets,
        createBudget,
        updateBudget,
        deleteBudget,
        showToast,
        showConfirm,
        showPrompt,
    } = window.ScheduleAppCore;

    window.ScheduleAppSelection?.configure?.({
        loadData,
        renderTodoView,
        renderGoalsView,
        completeEvent,
        updateGoal,
        deleteEvent,
        deleteGoal,
        showToast,
        showConfirm,
    });

    // ============================================
    // View Rendering
    // ============================================
    function renderTimeline() {
        return window.ScheduleAppCalendarViews?.renderTimeline?.(getCalendarViewDeps());
    }

    function renderAgendaList(mode) {
        return window.ScheduleAppCalendarViews?.renderAgendaList?.(mode, getCalendarViewDeps());
    }

    function renderWeekView() {
        return window.ScheduleAppCalendarViews?.renderWeekView?.(getCalendarViewDeps());
    }

    function renderMonthView() {
        return window.ScheduleAppCalendarViews?.renderMonthView?.(getCalendarViewDeps());
    }

    // ============================================
    // Goals View
    // ============================================
    function renderGoalsViewSkeleton() {
        return window.ScheduleAppGoals?.renderGoalsViewSkeleton?.();
    }

    async function renderGoalsReference() {
        return await window.ScheduleAppGoals?.renderGoalsReference?.();
    }

    async function renderGoalsList() {
        return await window.ScheduleAppGoals?.renderGoalsList?.();
    }

    async function renderGoalsView() {
        return await window.ScheduleAppGoals?.renderGoalsView?.();
    }

    function showAddGoalModal() {
        return window.ScheduleAppGoals?.showAddGoalModal?.();
    }

    // ============================================
    // Notepad View (Notes + Expense)
    // ============================================
    async function renderNotepadView() {
        return await window.ScheduleAppNotepad?.renderNotepadView?.();
    }

    async function renderNotepadContent() {
        return await window.ScheduleAppNotepad?.renderNotepadContent?.();
    }

    async function renderNotesList() {
        return await window.ScheduleAppNotesList?.renderNotesList?.();
    }

    async function renderExpenseList() {
        return await window.ScheduleAppExpense?.renderExpenseList?.();
    }

    function closeAllOpenSwipeItems(exceptEl = null) {
        document.querySelectorAll('.swipe-item.swipe-open').forEach((openEl) => {
            if (exceptEl && openEl === exceptEl) return;
            const openContent = openEl.querySelector('.swipe-content');
            if (openContent) {
                openContent.style.transform = 'translateX(0px)';
            }
            openEl.classList.remove('swipe-open', 'swipe-open-left', 'swipe-open-right');
        });
    }

    function bindSwipeItem(itemEl) {
        if (!itemEl || itemEl.dataset.swipeBound === '1') return;
        itemEl.dataset.swipeBound = '1';

        const contentEl = itemEl.querySelector('.swipe-content');
        if (!contentEl) return;

        const actionWidth = 82;
        const openThreshold = 50;
        const axisLockThreshold = 8;

        let startX = 0;
        let startY = 0;
        let currentX = 0;
        let baseX = 0;
        let dragging = false;
        let axisLocked = false;
        let horizontalDrag = false;

        const setTranslate = (x) => {
            contentEl.style.transform = `translateX(${x}px)`;
        };

        const openTo = (x) => {
            const finalX = Math.max(-actionWidth, Math.min(actionWidth, x));
            setTranslate(finalX);
            itemEl.classList.toggle('swipe-open', finalX !== 0);
            itemEl.classList.toggle('swipe-open-left', finalX > 0);
            itemEl.classList.toggle('swipe-open-right', finalX < 0);
        };

        const closeSelf = () => {
            openTo(0);
        };

        const onStart = (clientX, clientY) => {
            closeAllOpenSwipeItems(itemEl);
            dragging = true;
            startX = clientX;
            startY = clientY;
            axisLocked = false;
            horizontalDrag = false;
            baseX = itemEl.classList.contains('swipe-open-left')
                ? actionWidth
                : itemEl.classList.contains('swipe-open-right')
                    ? -actionWidth
                    : 0;
            currentX = baseX;
            contentEl.classList.add('dragging');
        };

        const onMove = (clientX, clientY, originalEvent = null) => {
            if (!dragging) return;

            const deltaX = clientX - startX;
            const deltaY = clientY - startY;

            if (!axisLocked && (Math.abs(deltaX) > axisLockThreshold || Math.abs(deltaY) > axisLockThreshold)) {
                axisLocked = true;
                horizontalDrag = Math.abs(deltaX) >= Math.abs(deltaY);
                // Mark as dragged so click doesn't fire after swipe
                if (horizontalDrag) {
                    itemEl.classList.add('swipe-just-dragged');
                }
            }

            if (!horizontalDrag) return;

            if (originalEvent && typeof originalEvent.preventDefault === 'function' && originalEvent.cancelable) {
                originalEvent.preventDefault();
            }

            currentX = Math.max(-actionWidth, Math.min(actionWidth, baseX + deltaX));
            setTranslate(currentX);
        };

        const onEnd = () => {
            if (!dragging) return;
            dragging = false;
            contentEl.classList.remove('dragging');

            if (!horizontalDrag) {
                setTranslate(baseX);
                return;
            }

            if (currentX > openThreshold) {
                openTo(actionWidth);
            } else if (currentX < -openThreshold) {
                openTo(-actionWidth);
            } else {
                closeSelf();
            }

            axisLocked = false;
            horizontalDrag = false;

            // Remove swipe-just-dragged after a short delay to prevent click
            setTimeout(() => {
                itemEl.classList.remove('swipe-just-dragged');
            }, 50);
        };

        contentEl.addEventListener('touchstart', (e) => onStart(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
        contentEl.addEventListener('touchmove', (e) => onMove(e.touches[0].clientX, e.touches[0].clientY, e), { passive: false });
        contentEl.addEventListener('touchend', onEnd, { passive: true });
        contentEl.addEventListener('touchcancel', onEnd, { passive: true });

        contentEl.addEventListener('mousedown', (e) => onStart(e.clientX, e.clientY));
        contentEl.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY, e));
        contentEl.addEventListener('mouseup', onEnd);
        contentEl.addEventListener('mouseleave', onEnd);

        if (!state.notepadSwipeGlobalBound) {
            document.addEventListener('click', (e) => {
                if (!(e.target instanceof Element)) return;
                if (e.target.closest('.swipe-item')) return;
                closeAllOpenSwipeItems();
            }, true);
            state.notepadSwipeGlobalBound = true;
        }
    }

    async function showQuickNoteCreateModal() {
        const existingModal = document.getElementById('quickNoteCreateModal');
        if (existingModal) existingModal.remove();

        const createHtml = `
            <div class="modal" id="quickNoteCreateModal">
                <div class="modal-backdrop" id="quickNoteCreateBackdrop"></div>
                <div class="modal-content">
                    <div class="modal-header">
                        <h2>新建笔记</h2>
                        <button class="modal-close" id="quickNoteCreateClose">×</button>
                    </div>
                    <div class="modal-body">
                        <input type="text" id="quickNoteTitle" class="note-edit-title-input" placeholder="标题（可选）" />
                        <textarea id="quickNoteContent" class="note-edit-textarea" placeholder="输入笔记内容..."></textarea>
                    </div>
                    <div class="modal-footer">
                        <button class="btn" id="quickNoteCancel">取消</button>
                        <button class="btn btn-primary" id="quickNoteSave">保存</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', createHtml);

        const modal = document.getElementById('quickNoteCreateModal');
        const backdrop = document.getElementById('quickNoteCreateBackdrop');
        const closeBtn = document.getElementById('quickNoteCreateClose');
        const cancelBtn = document.getElementById('quickNoteCancel');
        const saveBtn = document.getElementById('quickNoteSave');
        const titleInput = document.getElementById('quickNoteTitle');
        const contentInput = document.getElementById('quickNoteContent');

        const closeModal = () => modal.remove();
        backdrop.addEventListener('click', closeModal);
        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);

        saveBtn.addEventListener('click', async () => {
            const title = (titleInput?.value || '').trim();
            const content = (contentInput?.value || '').trim();
            if (!content) {
                showToast('请输入笔记内容');
                return;
            }
            const result = await createNote({ title, content });
            if (result) {
                showToast('笔记已保存');
                closeModal();
                await renderNotesList();
            }
        });

        requestAnimationFrame(() => {
            modal.classList.remove('hidden');
            contentInput.focus();
        });
    }

    function renderStatsView() {
        const stats = state.stats;
        const container = elements.statsContainer;
        const now = new Date();
        const currentTime = `${formatDate(now, 'full')} ${formatTime(now)}`;
        
        container.innerHTML = `
            <div class="stats-card stats-clock-card">
                <h3 class="stats-title">当前时间</h3>
                <div class="stats-clock-value">${currentTime}</div>
            </div>

            <div class="stats-card">
                <h3 class="stats-title">今日概览</h3>
                <div class="stats-grid">
                    <div class="stats-item">
                        <span class="stats-value">${stats.total}</span>
                        <span class="stats-label">总日程</span>
                    </div>
                    <div class="stats-item">
                        <span class="stats-value">${stats.completed}</span>
                        <span class="stats-label">已完成</span>
                    </div>
                    <div class="stats-item">
                        <span class="stats-value">${stats.pending}</span>
                        <span class="stats-label">待完成</span>
                    </div>
                    <div class="stats-item">
                        <span class="stats-value">${stats.completion_rate}%</span>
                        <span class="stats-label">完成率</span>
                    </div>
                </div>
            </div>
            
            <div class="stats-card">
                <h3 class="stats-title">完成率</h3>
                <div class="stats-rate">
                    <div class="stats-rate-circle" style="--rate: ${stats.completion_rate}">
                        <span class="stats-rate-value">${stats.completion_rate}%</span>
                    </div>
                </div>
            </div>
            
            <div class="stats-card">
                <h3 class="stats-title">分类统计</h3>
                <div class="category-stats">
                    ${state.categories.map(cat => {
                        const count = state.events.filter(e => e.category_id === cat.id).length;
                        return `
                            <div class="category-stat-row">
                                <div class="category-color-dot" style="background: ${cat.color}"></div>
                                <span class="category-stat-name">${cat.name}</span>
                                <span class="category-stat-count">${count}个</span>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    function renderCategorySelector() {
        const selector = elements.categorySelector;
        selector.innerHTML = '';
        
        state.categories.forEach(category => {
            const pill = document.createElement('button');
            pill.className = 'category-pill';
            pill.setAttribute('data-category', category.id);
            pill.style.setProperty('--event-color', category.color);
            pill.textContent = category.name;
            
            if (category.id === state.selectedCategory) {
                pill.classList.add('selected');
            }
            
            pill.addEventListener('click', () => {
                state.selectedCategory = category.id;
                renderCategorySelector();
            });
            
            selector.appendChild(pill);
        });
    }

    // ============================================
    // Breakdown Functions
    // ============================================
    // ============================================
    // Settings View (delegated to settings.js)
    // ============================================
    async function openSettingsView() {
        return await window.ScheduleAppSettings?.openSettingsView?.();
    }

    async function loadUserContexts() {
        return await window.ScheduleAppSettings?.loadUserContexts?.();
    }

    async function saveUserContext() {
        return await window.ScheduleAppSettings?.saveUserContext?.();
    }

    // Make settings functions globally accessible for inline onclick
    window.ScheduleApp = {
        ...(window.ScheduleApp || {}),
        activateAiProvider: (id) => window.ScheduleAppSettings?.activateAiProvider?.(id),
        editAiProvider: (id) => window.ScheduleAppSettings?.openAiProviderModal?.(id),
        deleteAiProvider: (id) => window.ScheduleAppSettings?.deleteAiProvider?.(id),
    };

    // ============================================

    // ============================================
    // LLM Input Handling (delegated to llm-queue.js)
    // ============================================
    const llmQueue = window.ScheduleAppLlmQueue;

    // ============================================
    // Touch Event Handlers for Pull-to-refresh (WeChat style)
    // ============================================
    function getCurrentScrollElement() {
        // Get the currently visible view
        const views = document.querySelectorAll('.view:not(.hidden)');
        if (views.length > 0) {
            return views[0];
        }
        return elements.mainContent;
    }

    function handlePullTouchStart(e) {
        // Don't track pull-to-refresh during event drag
        if (state.dragState.event) return;

        // Notepad/Week should scroll only inside their own content area
        if (state.currentView === 'notepad' || (state.currentView === 'day' && state.calendarSubview === 'week')) {
            state.pullToRefresh.isAtTop = false;
            return;
        }
        
        // Check if current view can scroll - only enable pull-to-refresh when at top
        const scrollEl = getCurrentScrollElement();
        
        // If element has scrollable content AND is not at top, don't track
        if (scrollEl.scrollHeight > scrollEl.clientHeight && scrollEl.scrollTop > 0) {
            state.pullToRefresh.isAtTop = false;
            return;
        }
        
        // At top or not scrollable
        state.pullToRefresh.isAtTop = true;
        state.pullToRefresh.startY = e.touches[0].clientY;
        state.pullToRefresh.pullDistance = 0;
    }

    function handlePullTouchMove(e) {
        // Don't trigger pull-to-refresh during event drag
        if (state.dragState.event) return;

        if (state.currentView === 'notepad' || (state.currentView === 'day' && state.calendarSubview === 'week')) {
            elements.app.classList.remove('pulling');
            elements.app.style.transform = '';
            elements.ptrIndicator.classList.remove('visible', 'enough');
            return;
        }
        
        // Must be at top AND user must be pulling DOWN
        if (!state.pullToRefresh.isAtTop) return;
        
        const currentY = e.touches[0].clientY;
        const deltaY = currentY - state.pullToRefresh.startY;
        
        // Only allow pull down (positive delta)
        if (deltaY <= 0) {
            // Reset if pulling up
            elements.app.classList.remove('pulling');
            elements.app.style.transform = '';
            return;
        }
        
        // Apply resistance - make it harder to pull as you go deeper
        const resistance = 0.3; // More resistance
        const distance = Math.min(deltaY * resistance, 150); // Cap at 150px
        state.pullToRefresh.pullDistance = distance;
        
        // Add pulling class to disable transitions
        elements.app.classList.add('pulling');
        elements.app.style.transform = `translateY(${distance}px)`;
        
        // Only show indicator when pulled enough (80px real pull = ~24px visual)
        if (distance > 15) {
            elements.ptrIndicator.classList.add('visible');
        }
        // Only show "enough" state when pulled significantly (150px real pull = ~45px visual)
        if (distance > 30) {
            elements.ptrIndicator.classList.add('enough');
        } else {
            elements.ptrIndicator.classList.remove('enough');
        }
    }

    function handlePullTouchEnd(e) {
        // Don't handle pull-to-refresh during event drag
        if (state.dragState.event) return;

        if (state.currentView === 'notepad' || (state.currentView === 'day' && state.calendarSubview === 'week')) {
            elements.app.classList.remove('pulling');
            elements.app.style.transform = '';
            elements.ptrIndicator.classList.remove('visible', 'enough', 'refreshing');
            state.pullToRefresh.pullDistance = 0;
            state.pullToRefresh.isRefreshing = false;
            return;
        }
        
        // Remove pulling class to enable transitions
        elements.app.classList.remove('pulling');
        
        const distance = state.pullToRefresh.pullDistance;
        
        // Require significant pull to refresh (30px visual = ~100px real)
        if (distance > 30 && !state.pullToRefresh.isRefreshing) {
            // Refresh triggered - show spinner
            elements.app.style.transform = 'translateY(60px)';
            elements.ptrIndicator.classList.remove('visible', 'enough');
            elements.ptrIndicator.classList.add('refreshing');
            state.pullToRefresh.isRefreshing = true;
            
            loadData().then(() => {
                elements.app.style.transform = '';
                elements.ptrIndicator.classList.remove('refreshing', 'enough');
                state.pullToRefresh.isRefreshing = false;
                state.pullToRefresh.pullDistance = 0;
            });
        } else {
            // Spring back
            elements.app.style.transform = '';
            elements.ptrIndicator.classList.remove('visible', 'enough');
        }
    }

    // ============================================
    // Data Loading
    // ============================================
    async function loadData() {
        if (state.isLoading) {
            state.reloadRequested = true;
            return state.loadPromise || Promise.resolve();
        }

        state.isLoading = true;
        state.loadPromise = (async () => {
            do {
                state.reloadRequested = false;

                // Determine date filter based on active tab + calendar subview
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
                        fetchCategories(),
                        fetchEvents(dateFilter),
                        fetchStats('today')
                    ]);

                    console.log('loadData fetched events:', state.events.length);
                    renderHeaderTitle();
                    await renderActiveViewAfterDataLoad();
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
    }

    // ============================================
    // Touch & Gesture Handling
    // ============================================
    function handleTouchStart(e) {
        // Don't track swipe if we're dragging an event resize handle
        if (state.dragState.event) return;
        
        state.swipe.startX = e.touches[0].clientX;
        state.swipe.startY = e.touches[0].clientY;
        state.swipe.isSwiping = true;
        state.swipe.deltaX = 0;
        state.swipe.isHorizontal = false;
        
        // For day view - prepare for slide animation
        if (state.currentView === 'day') {
            const slider = document.getElementById('daySlider');
            if (slider) {
                slider.classList.remove('animating');
                slider.style.transition = 'none';
            }
        }
    }

    function handleTouchMove(e) {
        // Don't handle swipe/pull during event drag
        if (state.dragState.event) return;
        
        if (!state.swipe.isSwiping) return;
        
        const deltaX = e.touches[0].clientX - state.swipe.startX;
        const deltaY = e.touches[0].clientY - state.swipe.startY;
        state.swipe.deltaX = deltaX;
        
        // Determine swipe direction with low threshold for faster response
        if (state.swipe.isHorizontal === false && (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5)) {
            state.swipe.isHorizontal = Math.abs(deltaX) > Math.abs(deltaY);
        }
        
        // Day view horizontal swipe - follow finger and prevent scroll
        if (state.currentView === 'day' && state.swipe.isHorizontal) {
            e.preventDefault();
            const slider = document.getElementById('daySlider');
            if (slider) {
                // Direct 1:1 movement for smooth feel
                const movePercent = (deltaX / window.innerWidth) * 100;
                slider.style.transform = `translateX(${movePercent}%)`;
            }
        }
    }

    function handleTouchEnd(e) {
        if (!state.swipe.isSwiping) return;
        
        const deltaX = state.swipe.deltaX || (e.changedTouches[0].clientX - state.swipe.startX);
        
        // Day view horizontal swipe - follow finger
        if (state.currentView === 'day' && state.swipe.isHorizontal && Math.abs(deltaX) > 50) {
            const direction = deltaX > 0 ? -1 : 1;
            const slider = document.getElementById('daySlider');
            
            // Update date based on calendarSubview
            if (state.calendarSubview === 'day') {
                state.currentDate.setDate(state.currentDate.getDate() + direction);
                renderTimeline();
            } else if (state.calendarSubview === 'week') {
                state.currentDate.setDate(state.currentDate.getDate() + (direction * 7));
                renderWeekView();
            } else if (state.calendarSubview === 'month') {
                // Navigate by month
                state.currentMonth.setMonth(state.currentMonth.getMonth() + direction);
                state.currentMonth = new Date(state.currentMonth);
                state.currentDate = new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth(), 1);
                renderMonthView();
            }
            renderHeaderTitle();
            
            // Animate to center
            if (slider) {
                slider.classList.add('animating');
                slider.style.transform = 'translateX(0)';
                setTimeout(() => {
                    slider.classList.remove('animating');
                    slider.style.transform = '';
                }, 300);
            }
        } else {
            // Reset position
            if (state.currentView === 'day') {
                const slider = document.getElementById('daySlider');
                if (slider) {
                    slider.classList.add('animating');
                    slider.style.transform = 'translateX(0)';
                    setTimeout(() => {
                        slider.classList.remove('animating');
                        slider.style.transform = '';
                    }, 300);
                }
            }
        }
        
        state.swipe.isSwiping = false;
        state.swipe.deltaX = 0;
        state.swipe.isHorizontal = false;
    }

    // ============================================
    // Utility Functions
    // ============================================

    // ============================================
    // Initialization
    // ============================================
    async function init() {
        console.log('Initializing Schedule App...');
        
        injectToastStyles();
        registerGlobalErrorHandlers();
        bindEvents();
        initSearch();
        renderCategorySelector();
        window.ScheduleAppEventModal?.syncPendingTimeState?.();
        if (window.ScheduleAppNoteAI && typeof window.ScheduleAppNoteAI.initAIChatPanel === 'function') {
            window.ScheduleAppNoteAI.initAIChatPanel();
        }
        
        // Listen for hash changes
        window.addEventListener('hashchange', handleHashRoute);
        
        await loadData();
        
        // Restore failed LLM text from localStorage (survives refresh)
        llmQueue.init();
        const route = parseHashRoute();
        if (route === 'settings') {
            await switchView('settings');
        } else {
            // Load last view from localStorage (tab bar supports: day/todo/goals/notepad)
            const allowedViews = new Set(['day', 'todo', 'goals', 'notepad']);
            const savedView = localStorage.getItem('lastView') || 'day';
            const lastView = allowedViews.has(savedView) ? savedView : 'day';
            await switchView(lastView);
        }
        
        // FAB discoverability: pulse on first visit
        if (!localStorage.getItem('fab_seen') && elements.contentAddBtn) {
            elements.contentAddBtn.classList.add('pulse-once');
            setTimeout(() => elements.contentAddBtn.classList.remove('pulse-once'), 2000);
            localStorage.setItem('fab_seen', '1');
        }
        
        // Expose to window for external tools (Playwright, etc.)
        window.switchView = switchView;
        window.scheduleAppState = state;
        window.restoreLlmFailedToInput = () => llmQueue.restoreLlmFailedToInput();
        window.hideLlmFailedBanner = () => llmQueue.hideLlmFailedBanner();
        window.ScheduleApp = window.ScheduleApp || {};
        window.ScheduleApp.renderStatsView = renderStatsView;
        
        // Expose budget functions for module system
        window.ScheduleAppBudget = {
            bindBudgetEvents,
            showAllBudgetsList,
            showBudgetExpenses,
            openExpenseModalForBudget,
            openBudgetModal,
            updatePeriodButtons,
            setSelectedBudgetPeriod,
            closeBudgetModal,
            handleBudgetSave,
            openExpenseModal,
            renderExpenseBudgetSelector,
            closeExpenseModal,
            renderExpenseCategorySelector,
            handleExpenseSave,
        };
        
        console.log('Schedule App ready!');
    }

    // Global event history loading for Settings

    // Apply module overrides - use functions from budget.js
    const {
        bindBudgetEvents,
        showAllBudgetsList,
        showBudgetExpenses,
        openBudgetModal,
        updatePeriodButtons,
        setSelectedBudgetPeriod,
        closeBudgetModal,
        handleBudgetSave,
        openExpenseModal,
        renderExpenseBudgetSelector,
        closeExpenseModal,
        renderExpenseCategorySelector,
        handleExpenseSave,
        openExpenseModalForBudget,
    } = window.ScheduleAppBudget || {};

    // Expose expense and note functions to ScheduleAppCore for notepad.js
    window.ScheduleAppCore = window.ScheduleAppCore || {};
    window.ScheduleAppCore.loadData = loadData;
    window._renderCategorySelector = renderCategorySelector;
    window.ScheduleAppCore.openExpenseModal = openExpenseModal;
    window.ScheduleAppCore.openGoalEditModal = (...args) => window.ScheduleAppGoals?.openGoalEditModal?.(...args);
    window.ScheduleAppCore.openGoalDiscussModal = (...args) => window.ScheduleAppGoals?.openGoalDiscussModal?.(...args);
    window.ScheduleAppCore.showAddGoalModal = (...args) => window.ScheduleAppGoals?.showAddGoalModal?.(...args);
    window.ScheduleAppCore.createGoal = function(payload) {
        return window.ScheduleAppGoals?.createGoal?.(payload);
    };
    window.ScheduleAppCore.bindSwipeItem = bindSwipeItem;
    window.ScheduleAppCore.closeAllOpenSwipeItems = closeAllOpenSwipeItems;
    window.ScheduleAppCore.loadAiProviders = (...args) => window.ScheduleAppSettings?.loadAiProviders?.(...args);
    window.ScheduleAppCore.loadEventHistoryAll = (...args) => window.ScheduleAppSettings?.loadEventHistoryAll?.(...args);
    window.ScheduleAppCore.loadData = loadData;

    // Expose touch handlers for app-init.js
    window.ScheduleAppCore.handleTouchStart = handleTouchStart;
    window.ScheduleAppCore.handleTouchMove = handleTouchMove;
    window.ScheduleAppCore.handleTouchEnd = handleTouchEnd;
    window.ScheduleAppCore.handlePullTouchStart = handlePullTouchStart;
    window.ScheduleAppCore.handlePullTouchMove = handlePullTouchMove;
    window.ScheduleAppCore.handlePullTouchEnd = handlePullTouchEnd;
    window.ScheduleAppCore.showQuickNoteCreateModal = showQuickNoteCreateModal;

    // Start the app
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
