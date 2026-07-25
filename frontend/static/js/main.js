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
    // Event Listeners
    // ============================================
    function bindEvents() {
        if (state._eventsBound) {
            return;
        }
        state._eventsBound = true;

        // Refresh button
        elements.refreshBtn.addEventListener('click', () => {
            elements.refreshBtn.classList.add('rotating');
            loadData().then(() => {
                elements.refreshBtn.classList.remove('rotating');
            });
        });
        
        // Prev/Next navigation buttons
        elements.prevBtn.addEventListener('click', () => navigateDate(-1));
        elements.nextBtn.addEventListener('click', () => navigateDate(1));
        
        // LLM input
        elements.llmBtn.addEventListener('click', () => llmQueue.handleLlmSubmit());
        elements.llmInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                llmQueue.handleLlmSubmit();
            }
        });
        if (elements.llmQueueCancelBtn) {
            elements.llmQueueCancelBtn.addEventListener('click', () => llmQueue.cancelLlmGeneration(true));
        }

        // Failed banner buttons
        if (elements.llmInputFailed) {
            elements.llmInputFailed.querySelector('.llm-input-failed-retry')?.addEventListener('click', () => {
                // Put text back into input and retry
                const text = localStorage.getItem('llm_failed_text') || '';
                if (text && elements.llmInput) {
                    elements.llmInput.value = text;
                    llmQueue.hideLlmFailedBanner();
                    elements.llmInput.focus();
                    llmQueue.handleLlmSubmit();
                }
            });
            elements.llmInputFailed.querySelector('.llm-input-failed-cancel')?.addEventListener('click', () => {
                llmQueue.hideLlmFailedBanner();
            });
        }

        // 复制按钮：将当前处理的文本复制到剪贴板
        if (elements.llmQueueCopyBtn) {
            elements.llmQueueCopyBtn.addEventListener('click', async () => {
                const textToCopy = state.llmActiveRequest?.text || state.llmLastSubmittedText || '';
                if (!textToCopy) {
                    showToast('没有可复制的内容');
                    return;
                }
                try {
                    await navigator.clipboard.writeText(textToCopy);
                    showToast('已复制到剪贴板');
                } catch (err) {
                    // 降级方案：使用传统方法
                    const textarea = document.createElement('textarea');
                    textarea.value = textToCopy;
                    textarea.style.position = 'fixed';
                    textarea.style.opacity = '0';
                    document.body.appendChild(textarea);
                    textarea.select();
                    try {
                        document.execCommand('copy');
                        showToast('已复制到剪贴板');
                    } catch (e) {
                        showToast('复制失败，请手动选择文本');
                    }
                    document.body.removeChild(textarea);
                }
            });
        }
        
        // Breakdown modal events (delegated to goals.js)
        const goals = window.ScheduleAppGoals;
        elements.breakdownBackdrop.addEventListener('click', () => goals?.closeBreakdownModal?.());
        elements.breakdownClose.addEventListener('click', () => goals?.closeBreakdownModal?.());
        elements.breakdownAnalyzeBtn.addEventListener('click', () => goals?.analyzeBreakdown?.());
        elements.breakdownSaveBtn.addEventListener('click', () => goals?.saveBreakdowns?.());
        elements.breakdownImportBtn.addEventListener('click', () => goals?.importBreakdowns?.());
        elements.breakdownLoadBtn.addEventListener('click', () => goals?.loadSavedBreakdowns?.());
        elements.breakdownAddBtn.addEventListener('click', () => goals?.addBreakdownItem?.());
        
        // Saved breakdowns modal events
        elements.savedBreakdownsBackdrop.addEventListener('click', () => goals?.closeSavedBreakdownsModal?.());
        elements.savedBreakdownsClose.addEventListener('click', () => goals?.closeSavedBreakdownsModal?.());
        
        // Goal discuss modal events (delegated to goals.js)
        elements.goalDiscussBackdrop.addEventListener('click', () => goals?.closeGoalDiscussModal?.());
        elements.goalDiscussClose.addEventListener('click', () => goals?.closeGoalDiscussModal?.());
        elements.goalDiscussStartBtn.addEventListener('click', () => goals?.startGoalDiscuss?.());
        elements.goalDiscussInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                goals?.startGoalDiscuss?.();
            }
        });
        elements.goalDiscussCancelBtn.addEventListener('click', () => goals?.closeGoalDiscussModal?.());
        elements.goalDiscussSaveBtn.addEventListener('click', () => goals?.saveGoalDiscuss?.());
        
        // Settings view events
        elements.settingsBtn.addEventListener('click', () => {
            window.location.hash = '';
            window.location.hash = '/settings';
        });
        elements.settingsBackBtn?.addEventListener('click', () => {
            window.location.hash = '';
        });
        const settings = window.ScheduleAppSettings;
        elements.enableDragResize.addEventListener('change', (e) => settings?.handleDragResizeToggle?.(e));
        elements.enableQQReminder.addEventListener('change', (e) => settings?.handleQQReminderToggle?.(e));
        elements.defaultTaskReminderEnabled.addEventListener('change', (e) => settings?.handleDefaultTaskReminderToggle?.(e));
        elements.autoAssignBudgetFromLlm.addEventListener('change', (e) => settings?.handleAutoAssignBudgetToggle?.(e));
        document.getElementById('cleanupTestEntriesBtn')?.addEventListener('click', () => settings?.handleCleanupTestEntries?.());
        document.getElementById('testQQChannelBtn')?.addEventListener('click', () => settings?.handleTestQQChannel?.());
        document.getElementById('viewErrorLogsBtn')?.addEventListener('click', () => settings?.handleViewErrorLogs?.());
        document.getElementById('semanticHelpBtn')?.addEventListener('click', () => settings?.showSemanticHelpModal?.());
        elements.openUserContextBtn?.addEventListener('click', () => {
            settings?.openUserContextModal?.();
        });
        
        // Event History in Settings
        document.getElementById('openEventHistoryBtn')?.addEventListener('click', () => {
            settings?.loadEventHistoryAll?.();
        });
        
        // Deleted Events in Settings
        document.getElementById('openDeletedEventsBtn')?.addEventListener('click', () => {
            settings?.loadDeletedEvents?.();
        });
        
        // Event Modifications in Settings
        document.getElementById('openModificationsBtn')?.addEventListener('click', () => {
            settings?.loadEventModifications?.();
        });
        
        // Expense Operation Logs in Settings
        document.getElementById('openExpenseHistoryBtn')?.addEventListener('click', () => {
            settings?.loadExpenseOperationLogs?.();
        });
        
        // Deleted Expenses in Settings
        document.getElementById('openDeletedExpensesBtn')?.addEventListener('click', () => {
            settings?.loadDeletedExpenses?.();
        });
        
        // Settings modal backdrop tap-to-close
        elements.settingsBackdrop?.addEventListener('click', () => settings?.closeSettingsModal?.());
        elements.settingsClose?.addEventListener('click', () => settings?.closeSettingsModal?.());
        
        // AI Provider modal events
        elements.addAiProviderBtn?.addEventListener('click', () => settings?.openAiProviderModal?.());
        elements.aiProviderBackdrop?.addEventListener('click', () => settings?.closeAiProviderModal?.());
        elements.aiProviderClose?.addEventListener('click', () => settings?.closeAiProviderModal?.());
        elements.aiProviderCancelBtn?.addEventListener('click', () => settings?.closeAiProviderModal?.());
        elements.aiProviderSaveBtn?.addEventListener('click', () => settings?.saveAiProvider?.());
        document.getElementById('aiProviderTestBtn')?.addEventListener('click', () => settings?.testAiProvider?.());
        
        // User Context modal events
        elements.userContextAddBtn?.addEventListener('click', () => settings?.openUserContextModal?.());
        elements.userContextBackdrop?.addEventListener('click', () => settings?.closeUserContextModal?.());
        elements.userContextClose?.addEventListener('click', () => settings?.closeUserContextModal?.());
        elements.userContextCancelBtn?.addEventListener('click', () => settings?.closeUserContextModal?.());
        elements.userContextSaveBtn?.addEventListener('click', () => settings?.saveUserContext?.());
        elements.userContextDeleteBtn?.addEventListener('click', () => settings?.deleteUserContext?.());
        
        // Budget modal events
        elements.budgetBackdrop?.addEventListener('click', closeBudgetModal);
        elements.budgetClose?.addEventListener('click', closeBudgetModal);
        elements.budgetCancelBtn?.addEventListener('click', closeBudgetModal);
        elements.budgetSaveBtn?.addEventListener('click', handleBudgetSave);
        
        // Budget period buttons
        elements.budgetPeriodGroup?.querySelectorAll('.period-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                setSelectedBudgetPeriod?.(btn.dataset.period);
                updatePeriodButtons();
            });
        });
        
        // Budget rollover checkbox toggle
        elements.budgetRollover?.addEventListener('change', () => {
            elements.budgetRolloverLimitGroup.style.display = elements.budgetRollover.checked ? 'block' : 'none';
        });
        
        // Expense modal events
        elements.expenseBackdrop?.addEventListener('click', closeExpenseModal);
        elements.expenseClose?.addEventListener('click', closeExpenseModal);
        elements.expenseCancelBtn?.addEventListener('click', closeExpenseModal);
        elements.expenseSaveBtn?.addEventListener('click', handleExpenseSave);
        
        // Tab bar
        elements.tabDay.addEventListener('click', () => {
            window.location.hash = '';
            switchView('day');
        });
        elements.tabTodo.addEventListener('click', () => {
            window.location.hash = '';
            switchView('todo');
        });
        elements.tabGoals.addEventListener('click', () => {
            window.location.hash = '';
            switchView('goals');
        });
        elements.tabNotepad.addEventListener('click', () => {
            window.location.hash = '';
            switchView('notepad');
        });

        // Calendar segmented control (in day view)
        document.getElementById('calendarSegmented')?.addEventListener('click', async (e) => {
            const seg = e.target.closest('.cal-segment');
            if (!seg) return;
            state.calendarSubview = seg.dataset.subview;
            // Update active states
            document.querySelectorAll('.cal-segment').forEach(s => {
                s.classList.toggle('active', s.dataset.subview === state.calendarSubview);
            });
            // Show/hide prev/next nav buttons for week/month
            const showNavArrows = state.calendarSubview === 'week' || state.calendarSubview === 'month';
            if (elements.prevBtn) {
                elements.prevBtn.classList.toggle('hidden', !showNavArrows);
            }
            if (elements.nextBtn) {
                elements.nextBtn.classList.toggle('hidden', !showNavArrows);
            }
            // Re-render based on subview
            if (state.calendarSubview === 'day') {
                elements.dayView.classList.remove('hidden');
                elements.daySlider.classList.remove('hidden');
                elements.weekView.classList.add('hidden');
                elements.monthView.classList.add('hidden');
                renderTimeline();
            } else if (state.calendarSubview === 'week') {
                elements.dayView.classList.add('hidden');
                elements.daySlider.classList.add('hidden');
                elements.weekView.classList.remove('hidden');
                elements.monthView.classList.add('hidden');
                renderWeekView();
            } else if (state.calendarSubview === 'month') {
                elements.dayView.classList.add('hidden');
                elements.daySlider.classList.add('hidden');
                elements.weekView.classList.add('hidden');
                elements.monthView.classList.remove('hidden');
                // Keep month alignment: state.currentMonth = first day
                state.currentMonth = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
                renderMonthView();
            }
            await loadData();
        });

        // Todo segmented control
        document.getElementById('todoSegmented')?.addEventListener('click', async (e) => {
            const seg = e.target.closest('.cal-segment');
            if (!seg) return;
            state.todoSubview = seg.dataset.subview;
            // Update active states
            document.querySelectorAll('#todoSegmented .cal-segment').forEach(s => {
                s.classList.toggle('active', s.dataset.subview === state.todoSubview);
            });
            // Re-render todo view with new filter
            await renderTodoView();
        });

        // Todo view mode switcher (list / quadrant)
        document.getElementById('todoViewMode')?.addEventListener('click', async (e) => {
            const btn = e.target.closest('.todo-view-mode-btn');
            if (!btn) return;
            state.todoViewMode = btn.dataset.mode;
            document.querySelectorAll('#todoViewMode .todo-view-mode-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.mode === state.todoViewMode);
            });
            await renderTodoView();
        });

        // Floating add button (content area, visible in day/todo)
        elements.contentAddBtn.addEventListener('click', async () => {
            if (state.currentView === 'notepad') {
                if (state.notepadSubview === 'expense') {
                    openExpenseModal();
                    return;
                }
                await showQuickNoteCreateModal();
                return;
            }
            openEventModal();
        });
        
        // Event modal
        elements.modalBackdrop.addEventListener('click', closeEventModal);
        elements.modalClose.addEventListener('click', closeEventModal);
        elements.cancelEventBtn.addEventListener('click', closeEventModal);
        elements.saveEventBtn.addEventListener('click', saveEvent);
        elements.pendingTimeCheck.addEventListener('change', syncPendingTimeState);
        if (elements.recurrenceSelect) {
            elements.recurrenceSelect.addEventListener('change', (e) => window.ScheduleAppRecurrenceUI?.applyRecurrenceUI?.(e.target.value));
        }
        
        // Detail modal
        elements.detailBackdrop.addEventListener('click', closeDetailModal);
        elements.detailClose.addEventListener('click', closeDetailModal);
        elements.deleteEventBtn.addEventListener('click', deleteSelectedEvent);
        elements.saveDetailBtn.addEventListener('click', saveDetailChanges);
        
        // Touch gestures
        elements.mainContent.addEventListener('touchstart', handleTouchStart, { passive: true });
        elements.mainContent.addEventListener('touchmove', handleTouchMove, { passive: false });
        elements.mainContent.addEventListener('touchend', handleTouchEnd, { passive: true });
        
        // Pull-to-refresh (attached to document for better detection)
        document.addEventListener('touchstart', handlePullTouchStart, { passive: true });
        document.addEventListener('touchmove', handlePullTouchMove, { passive: true });
        document.addEventListener('touchend', handlePullTouchEnd, { passive: true });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeEventModal();
                closeDetailModal();
            }
        });
        
        // Natural language parsing for title input
        elements.eventTitle.addEventListener('input', debounce(async (e) => {
            const text = e.target.value.trim();
            if (text.length > 3 && !elements.startTime.value) {
                // Try to parse time from natural language
                try {
                    const result = await apiCall('events', {
                        method: 'POST',
                        body: JSON.stringify({ title: text, _parse: true })
                    });
                    if (result && result.parsed) {
                        if (result.parsed.start_time) {
                            elements.startTime.value = toLocalDatetime(result.parsed.start_time);
                        }
                        if (result.parsed.end_time) {
                            elements.endTime.value = toLocalDatetime(result.parsed.end_time);
                        }
                        if (result.parsed.category_id) {
                            state.selectedCategory = result.parsed.category_id;
                            renderCategorySelector();
                        }
                    }
                } catch (err) {
                    // Silent fail for time parsing
                }
            }
        }, 500));
    }

    // ============================================
    // Utility Functions
    // ============================================

    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    function showFatalDebugBanner(message) {
        const id = 'fatalDebugBanner';
        let banner = document.getElementById(id);
        if (!banner) {
            banner = document.createElement('div');
            banner.id = id;
            banner.style.position = 'fixed';
            banner.style.top = '0';
            banner.style.left = '0';
            banner.style.right = '0';
            banner.style.zIndex = '99999';
            banner.style.padding = '10px 12px';
            banner.style.background = '#b91c1c';
            banner.style.color = '#fff';
            banner.style.fontSize = '12px';
            banner.style.lineHeight = '1.4';
            banner.style.whiteSpace = 'pre-wrap';
            document.body.appendChild(banner);
        }
        banner.textContent = `前端错误: ${message}`;
    }

    function registerGlobalErrorHandlers() {
        window.addEventListener('error', async (event) => {
            const msg = event?.error?.message || event?.message || 'Unknown Error';
            const stack = event?.error?.stack || '';
            console.error('[GlobalError]', event.error || event);
            showToast(`页面错误: ${msg}`);
            showFatalDebugBanner(msg);
            // Send error to server for notification
            try {
                await apiCall('errors/log', {
                    method: 'POST',
                    body: JSON.stringify({
                        message: msg,
                        stack: stack,
                        source: 'window.onerror',
                        url: window.location.href
                    })
                });
            } catch (e) {
                console.error('[ErrorLog] Failed to send:', e);
            }
        });

        window.addEventListener('unhandledrejection', async (event) => {
            const reason = event?.reason;
            const msg = typeof reason === 'string' ? reason : (reason?.message || 'Unhandled Promise Rejection');
            const stack = reason?.stack || '';
            console.error('[UnhandledRejection]', reason);
            showToast(`异步错误: ${msg}`);
            showFatalDebugBanner(msg);
            // Send error to server for notification
            try {
                await apiCall('errors/log', {
                    method: 'POST',
                    body: JSON.stringify({
                        message: msg,
                        stack: stack,
                        source: 'unhandledrejection',
                        url: window.location.href
                    })
                });
            } catch (e) {
                console.error('[ErrorLog] Failed to send:', e);
            }
        });
    }

    // ============================================
    // Toast CSS
    // ============================================
    function injectToastStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .toast {
                position: fixed;
                bottom: calc(var(--tab-bar-height) + 20px);
                left: 50%;
                transform: translateX(-50%) translateY(100px);
                background: var(--bg-card);
                color: var(--text-primary);
                padding: 12px 24px;
                border-radius: var(--radius-md);
                box-shadow: var(--shadow-lg);
                font-size: var(--font-size-md);
                z-index: 2000;
                opacity: 0;
                transition: transform var(--transition-normal), opacity var(--transition-normal);
            }
.toast.visible {
    transform: translateX(-50%) translateY(0);
    opacity: 1;
}
.toast-with-undo {
    display: flex;
    align-items: center;
    gap: 12px;
    white-space: nowrap;
}
.toast-msg {
    flex: 1;
}
.toast-undo-btn {
    background: var(--primary, #4f46e5);
    color: #fff;
    border: none;
    border-radius: 4px;
    padding: 4px 12px;
    font-size: var(--font-size-sm, 13px);
    cursor: pointer;
    flex-shrink: 0;
}
.toast-undo-btn:active {
    opacity: 0.8;
}
        `;
        document.head.appendChild(style);
    }

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

    // Start the app
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
