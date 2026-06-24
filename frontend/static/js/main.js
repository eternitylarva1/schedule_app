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
    const getSelectionSet = (...args) => window.ScheduleAppSelection?.getSelectionSet?.(...args);
    const exitSelectionMode = (...args) => window.ScheduleAppSelection?.exitSelectionMode?.(...args);
    const enterSelectionMode = (...args) => window.ScheduleAppSelection?.enterSelectionMode?.(...args);
    const toggleSelection = (...args) => window.ScheduleAppSelection?.toggleSelection?.(...args);
    const renderSelectionBar = (...args) => window.ScheduleAppSelection?.renderSelectionBar?.(...args);

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
    function renderHeaderTitle() {
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
        return {
            state,
            elements,
            formatDate,
            isSameDay,
            isToday,
            getWeekDates,
            getCompactTitle,
            getEventTop,
            getEventHeight,
            getCategoryColor,
            formatTimeRange,
            handleEventDragStart,
            showEventDetail,
            markEventDoneQuick,
            switchView,
            escapeHtml,
        };
    }

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

    async function renderTodoView() {
        const container = elements.todoContainer;
        // 保存滚动位置
        const scrollParent = container.parentElement;
        const scrollTop = scrollParent ? scrollParent.scrollTop : 0;
        
        container.innerHTML = '<div class="loading">加载中...</div>';

        const deadlineRegex = /截止\s*(\d{1,2})月(\d{1,2})日/;
        const endOfDayHour = 23;
        const endOfDayMinute = 59;
        const deadlineMeta = (event) => {
            const title = String(event?.title || '');
            const match = title.match(deadlineRegex);
            if (!match) {
                return {
                    hasDeadlineLabel: false,
                    deadlineDate: null,
                    treatAsDeadlineWarning: false
                };
            }

            const month = Number(match[1]);
            const day = Number(match[2]);
            const base = event?.start_time ? new Date(event.start_time) : new Date();
            const year = Number.isFinite(base.getFullYear()) ? base.getFullYear() : new Date().getFullYear();
            const deadlineDate = new Date(year, month - 1, day, endOfDayHour, endOfDayMinute, 0, 0);

            const isNoTime = !event?.start_time;
            const startDate = event?.start_time ? new Date(event.start_time) : null;
            const isLegacyDeadlineTime = !!(
                startDate &&
                !Number.isNaN(startDate.getTime()) &&
                startDate.getHours() === endOfDayHour &&
                startDate.getMinutes() === endOfDayMinute
            );

            return {
                hasDeadlineLabel: true,
                deadlineDate,
                treatAsDeadlineWarning: isNoTime || isLegacyDeadlineTime
            };
        };
        
        // Fetch events based on todoSubview filter
        const data = await apiCall('events?date=' + state.todoSubview);
        
        if (!data || data.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📝</div>
                    <div class="empty-text">暂无待办事项</div>
                </div>
            `;
            // 恢复滚动位置
            if (scrollParent) scrollParent.scrollTop = scrollTop;
            return;
        }
        
        container.innerHTML = '';
        
        // Get all events (pending AND completed), including items without explicit time
        const allEvents = data
            .filter(e => e.status !== 'hidden')
            .sort((a, b) => {
                // Done events always at the end
                if (a.status === 'done' && b.status !== 'done') return 1;
                if (b.status === 'done' && a.status !== 'done') return -1;
                if (a.status === 'done' && b.status === 'done') return 0;

                const aMeta = deadlineMeta(a);
                const bMeta = deadlineMeta(b);
                const aNoTimeLike = !a.start_time || aMeta.treatAsDeadlineWarning;
                const bNoTimeLike = !b.start_time || bMeta.treatAsDeadlineWarning;
                // Timed events first, no-time-like items later
                if (aNoTimeLike && bNoTimeLike) return 0;
                if (aNoTimeLike) return 1;
                if (bNoTimeLike) return -1;

                return new Date(a.start_time) - new Date(b.start_time);
            });
        
        if (allEvents.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📝</div>
                    <div class="empty-text">暂无待办事项</div>
                </div>
            `;
            // 恢复滚动位置
            if (scrollParent) scrollParent.scrollTop = scrollTop;
            return;
        }

        const todoSelectionActive = state.selectionMode.active && state.selectionMode.type === 'todo';
        if (todoSelectionActive) {
            renderSelectionBar('todo');
        }

        const applyTodoSelectionVisual = (itemEl, eventId) => {
            const selected = state.selectionMode.todoIds.has(String(eventId));
            itemEl.classList.add('selection-mode');
            itemEl.classList.toggle('selected', selected);
            const cb = itemEl.querySelector('.todo-checkbox');
            if (cb) cb.classList.toggle('checked', selected);
            renderSelectionBar('todo');
        };
         
        // Group by date (+ one special group for no-time tasks and completed)
        const NO_TIME_KEY = '__no_time__';
        const DONE_KEY = '__done__';
        const grouped = {};
        allEvents.forEach(event => {
            let dateKey;
            // Done events go to special DONE_KEY group
            if (event.status === 'done') {
                dateKey = DONE_KEY;
            } else if (!event.start_time) {
                // Only put items with NO start_time in NO_TIME_KEY
                dateKey = NO_TIME_KEY;
            } else {
                const date = new Date(event.start_time);
                dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
            }
            if (!grouped[dateKey]) {
                grouped[dateKey] = [];
            }
            grouped[dateKey].push(event);
        });
        
        // Render groups - DONE_KEY always last
        const sortedKeys = Object.keys(grouped).sort((a, b) => {
            if (a === DONE_KEY) return 1;
            if (b === DONE_KEY) return -1;
            if (a === NO_TIME_KEY) return -1;
            if (b === NO_TIME_KEY) return 1;
            // Put past dates (before today) after today, but before future dates
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const parseDateKey = (key) => {
                const [y, m, d] = key.split('-').map(Number);
                // Note: key uses getMonth() (0-indexed), so use m directly without -1
                return new Date(y, m, d);
            };
            const dateA = parseDateKey(a);
            const dateB = parseDateKey(b);
            const isPastA = dateA < today;
            const isPastB = dateB < today;
            const isTodayA = isSameDay(dateA, today);
            const isTodayB = isSameDay(dateB, today);
            // Today always first among non-NO_TIME groups
            if (isTodayA && !isTodayB) return -1;
            if (isTodayB && !isTodayA) return 1;
            // After today: past pending events next, then future events
            if (isPastA && !isPastB) return -1;  // past → before future
            if (isPastB && !isPastA) return 1;   // future → after past
            // Both past or both future - sort by date
            return dateA - dateB;
        });
        
        let doneCount = 0;
        sortedKeys.forEach(dateKey => {
            const events = grouped[dateKey];
            const firstEvent = events[0];
            const isNoTimeGroup = dateKey === NO_TIME_KEY;
            const isDoneGroup = dateKey === DONE_KEY;
            const date = !isNoTimeGroup && !isDoneGroup ? new Date(firstEvent.start_time) : null;
            const today = new Date();
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            
            let dateLabel;
            if (isDoneGroup) {
                doneCount = events.length;
                dateLabel = `已完成 (${events.length})`;
            } else if (isNoTimeGroup) {
                dateLabel = '截止提醒 / 无明确时间';
            } else if (isSameDay(date, today)) {
                dateLabel = '今天';
            } else if (isSameDay(date, tomorrow)) {
                dateLabel = '明天';
            } else {
                dateLabel = formatDate(date, 'month-day');
            }

            if (isNoTimeGroup) {
                // Put explicit deadline items first within no-time group
                events.sort((a, b) => {
                    const aMeta = deadlineMeta(a);
                    const bMeta = deadlineMeta(b);
                    if (aMeta.hasDeadlineLabel && bMeta.hasDeadlineLabel && aMeta.deadlineDate && bMeta.deadlineDate) {
                        return aMeta.deadlineDate - bMeta.deadlineDate;
                    }
                    if (aMeta.hasDeadlineLabel === bMeta.hasDeadlineLabel) return 0;
                    return aMeta.hasDeadlineLabel ? -1 : 1;
                });
            }
            
            const groupEl = document.createElement('div');
            groupEl.className = 'todo-date-group' + (isDoneGroup ? ' todo-date-group-done' : '');
            groupEl.dataset.dateKey = dateKey;
            const selectAllBtn = !isNoTimeGroup && !isDoneGroup ?
                `<button class="todo-select-all-btn" data-date-key="${dateKey}">全选</button>` : '';
            groupEl.innerHTML = `<div class="todo-date-header"><span class="todo-date-label">${dateLabel}</span>${selectAllBtn}</div>`;
            
            events.forEach(event => {
                const isSelected = state.selectionMode.todoIds.has(String(event.id));
                const eventEl = document.createElement('div');
                eventEl.className = 'todo-item'
                    + (event.status === 'done' ? ' done' : '')
                    + (todoSelectionActive ? ' selection-mode' : '')
                    + (isSelected ? ' selected' : '');
                eventEl.dataset.eventId = event.id;
                
                let timeStr = '无明确时间';
                const meta = deadlineMeta(event);
                if (event.start_time && !meta.treatAsDeadlineWarning) {
                    const startTime = formatTime(event.start_time);
                    const endTime = event.end_time ? formatTime(event.end_time) : '';
                    timeStr = endTime ? `${startTime} - ${endTime}` : startTime;
                }
                
                // Swipe action buttons
                eventEl.innerHTML = `
                    <div class="todo-actions">
                        <button class="todo-action-btn edit-btn" data-action="edit" data-event-id="${event.id}">✏️</button>
                        <button class="todo-action-btn delete-btn" data-action="delete" data-event-id="${event.id}">🗑️</button>
                    </div>
                    <div class="todo-main-content">
                        <div class="todo-checkbox" data-event-id="${event.id}"></div>
                        <div class="todo-item-content">
                            <div class="todo-item-title">${escapeHtml(event.title)}</div>
                            <div class="todo-item-time">${timeStr}</div>
                        </div>
                        <div class="todo-item-category" style="background: ${getCategoryColor(event.category_id)}"></div>
                    </div>
                `;
                 
                // Checkbox click handler - TOGGLE: pending->done, done->pending
                const checkbox = eventEl.querySelector('.todo-checkbox');
                if (todoSelectionActive) {
                    // In selection mode, don't show completion status - use .selected for selection
                    checkbox.classList.remove('checked');
                    if (isSelected) {
                        checkbox.classList.add('selected');
                    } else {
                        checkbox.classList.remove('selected');
                    }
                } else if (event.status === 'done') {
                    checkbox.classList.add('checked');
                }
                checkbox.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    e.preventDefault();

                    if (state.selectionMode.active && state.selectionMode.type === 'todo') {
                        toggleSelection('todo', event.id);
                        applyTodoSelectionVisual(eventEl, event.id);
                        return;
                    }
                    
                    if (event.status === 'done') {
                        // Already done - undo (uncomplete)
                        checkbox.classList.remove('checked');
                        eventEl.classList.remove('done');
                        event.status = 'pending';
                        await uncompleteEvent(event.id);
                        showToast('已撤销完成');
                    } else {
                        // Pending - mark as done
                        checkbox.classList.add('checked');
                        eventEl.classList.add('done');
                        event.status = 'done';
                        await completeEvent(event.id);
                        showToast('已完成 ✓');
                    }
                });
                
                // Swipe gesture for action buttons
                let swipeStartX = 0;
                let swipeStartY = 0;
                let swiping = false;
                let isHorizontalSwipe = null;
                let swipeDeltaX = 0;
                let mainContent = null; // Cache reference
                let longPressTimer = null;
                
                eventEl.addEventListener('touchstart', (e) => {
                    if (state.selectionMode.active && state.selectionMode.type === 'todo') {
                        return;
                    }

                    const touchX = e.touches[0].clientX;
                    const touchY = e.touches[0].clientY;
                    longPressTimer = setTimeout(async () => {
                        state.selectionMode.longPressTriggered = true;
                        enterSelectionMode('todo', event.id);
                        if (navigator.vibrate) navigator.vibrate(20);
                        container.querySelectorAll('.todo-item').forEach((el) => {
                            el.classList.add('selection-mode');
                            // Hide completion checkmark in selection mode
                            const cb = el.querySelector('.todo-checkbox');
                            if (cb) {
                                cb.classList.remove('checked');
                                cb.classList.remove('selected');
                            }
                        });
                        applyTodoSelectionVisual(eventEl, event.id);
                    }, 450);

                    swipeStartX = e.touches[0].clientX;
                    swipeStartY = e.touches[0].clientY;
                    swiping = true;
                    isHorizontalSwipe = null;
                    swipeDeltaX = 0;
                    eventEl.classList.remove('swiped');
                    // Cache and disable transition during drag
                    mainContent = eventEl.querySelector('.todo-main-content');
                    if (mainContent) {
                        mainContent.style.transition = 'none';
                    }
                }, { passive: false }); // Must be non-passive to allow preventDefault
                
                eventEl.addEventListener('touchmove', (e) => {
                    if (!swiping) return;
                    
                    const deltaX = e.touches[0].clientX - swipeStartX;
                    const deltaY = e.touches[0].clientY - swipeStartY;
                    swipeDeltaX = deltaX;

                    if (longPressTimer && (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8)) {
                        clearTimeout(longPressTimer);
                        longPressTimer = null;
                    }

                    if (state.selectionMode.active && state.selectionMode.type === 'todo') {
                        return;
                    }
                    
                    // Determine swipe direction on first significant move
                    if (isHorizontalSwipe === null && (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10)) {
                        isHorizontalSwipe = Math.abs(deltaX) > Math.abs(deltaY);
                        // Immediately prevent default to stop page scrolling
                        if (isHorizontalSwipe) {
                            e.preventDefault();
                        }
                    }
                    
                    // Only handle horizontal swipe
                    if (isHorizontalSwipe && mainContent) {
                        // Already prevented above
                        if (deltaX < 0) {
                            // Swipe left - reveal actions
                            const moveX = Math.max(deltaX, -90); // Limit to -90px
                            mainContent.style.transform = `translateX(${moveX}px)`;
                        } else if (deltaX > 0) {
                            // Swipe right - prepare delete
                            const moveX = Math.min(deltaX, 150); // Limit to 150px
                            mainContent.style.transform = `translateX(${moveX}px)`;
                        }
                    }
                }, { passive: false });
                
                eventEl.addEventListener('touchend', async (e) => {
                    if (longPressTimer) {
                        clearTimeout(longPressTimer);
                        longPressTimer = null;
                    }
                    if (state.selectionMode.longPressTriggered) {
                        state.selectionMode.longPressTriggered = false;
                        swiping = false;
                        return;
                    }
                    if (state.selectionMode.active && state.selectionMode.type === 'todo') {
                        return;
                    }

                    if (!swiping) return;
                    
                    if (mainContent) {
                        // CRITICAL: Disable transition BEFORE clearing transform to prevent animation lag
                        mainContent.style.transition = 'none';
                        mainContent.style.transform = '';
                    }
                    
                    if (swipeDeltaX < -90) {
                        // Swiped left past threshold - keep actions visible
                        eventEl.classList.add('swiped');
                    } else if (swipeDeltaX > 100) {
                        // Swipe right past threshold - auto delete
                        await deleteEvent(event.id);
                        showToast('已删除');
                        renderTodoView();
                    } else {
                        // Reset - instant snap, not animated
                        eventEl.classList.remove('swiped');
                    }
                    
                    swiping = false;
                    isHorizontalSwipe = null;
                    swipeDeltaX = 0;
                    mainContent = null;
                    
                    // 阻止后续可能触发的 click 事件
                    e.stopPropagation();
                }, { passive: true });
                
                // Also handle mouse events for desktop - mousedown to start long press
                eventEl.addEventListener('mousedown', (e) => {
                    if (state.selectionMode.active && state.selectionMode.type === 'todo') {
                        return;
                    }

                    longPressTimer = setTimeout(async () => {
                        state.selectionMode.longPressTriggered = true;
                        enterSelectionMode('todo', event.id);
                        container.querySelectorAll('.todo-item').forEach((el) => {
                            el.classList.add('selection-mode');
                            // Hide completion checkmark in selection mode
                            const cb = el.querySelector('.todo-checkbox');
                            if (cb) {
                                cb.classList.remove('checked');
                                cb.classList.remove('selected');
                            }
                        });
                        applyTodoSelectionVisual(eventEl, event.id);
                    }, 450);

                    swipeStartX = e.clientX;
                    swipeStartY = e.clientY;
                    swiping = true;
                    isHorizontalSwipe = null;
                    swipeDeltaX = 0;
                    eventEl.classList.remove('swiped');
                    mainContent = eventEl.querySelector('.todo-main-content');
                    if (mainContent) {
                        mainContent.style.transition = 'none';
                    }
                });
                
                eventEl.addEventListener('mousemove', (e) => {
                    if (!swiping) return;
                    
                    const deltaX = e.clientX - swipeStartX;
                    const deltaY = e.clientY - swipeStartY;
                    swipeDeltaX = deltaX;

                    if (longPressTimer && (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8)) {
                        clearTimeout(longPressTimer);
                        longPressTimer = null;
                    }
                    
                    if (isHorizontalSwipe === null && (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10)) {
                        isHorizontalSwipe = Math.abs(deltaX) > Math.abs(deltaY);
                    }
                    
                    if (isHorizontalSwipe && mainContent) {
                        if (deltaX < 0) {
                            const moveX = Math.max(deltaX, -90);
                            mainContent.style.transform = `translateX(${moveX}px)`;
                        } else if (deltaX > 0) {
                            const moveX = Math.min(deltaX, 150);
                            mainContent.style.transform = `translateX(${moveX}px)`;
                        }
                    }
                });
                
                eventEl.addEventListener('mouseup', async (e) => {
                    if (longPressTimer) {
                        clearTimeout(longPressTimer);
                        longPressTimer = null;
                    }
                    if (state.selectionMode.longPressTriggered) {
                        state.selectionMode.longPressTriggered = false;
                        swiping = false;
                        return;
                    }
                    if (state.selectionMode.active && state.selectionMode.type === 'todo') {
                        return;
                    }

                    if (!swiping) return;
                    
                    if (mainContent) {
                        mainContent.style.transition = 'none';
                        mainContent.style.transform = '';
                    }
                    
                    if (swipeDeltaX < -90) {
                        eventEl.classList.add('swiped');
                    } else if (swipeDeltaX > 100) {
                        await deleteEvent(event.id);
                        showToast('已删除');
                        await renderTodoView();
                    } else {
                        eventEl.classList.remove('swiped');
                    }
                    
                    swiping = false;
                    isHorizontalSwipe = null;
                    swipeDeltaX = 0;
                    mainContent = null;
                    
                    // 阻止后续可能触发的 click 事件
                    e.stopPropagation();
                });
                
                // Also handle mouse events for desktop testing
                eventEl.addEventListener('mouseleave', () => {
                    if (swiping && mainContent) {
                        // Instant reset on mouse leave during drag
                        mainContent.style.transform = '';
                        mainContent.style.transition = '';
                        eventEl.classList.remove('swiped');
                        swiping = false;
                        isHorizontalSwipe = null;
                        swipeDeltaX = 0;
                        mainContent = null;
                    }
                });
                
                // Action button handlers
                eventEl.querySelector('.edit-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (state.selectionMode.active && state.selectionMode.type === 'todo') return;
                    openEventModal(event); // Edit existing event
                });
                
                eventEl.querySelector('.delete-btn').addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (state.selectionMode.active && state.selectionMode.type === 'todo') return;
                    const confirmed = await showConfirm('确定删除这个日程吗？');
                    if (confirmed) {
                        await deleteEvent(event.id);
                        showToast('已删除');
                        renderTodoView(); // Refresh
                    }
                });
                
                // Click on item (not checkbox or actions) - direct edit (including time)
                eventEl.addEventListener('click', (e) => {
                    if (state.selectionMode.active && state.selectionMode.type === 'todo') {
                        toggleSelection('todo', event.id);
                        applyTodoSelectionVisual(eventEl, event.id);
                        return;
                    }
                    // Don't trigger if clicking on actions or checkbox
                    if (e.target.closest('.todo-actions') || e.target.closest('.todo-checkbox')) return;
                    openEventModal(event);
                });
                
                // Double click on checkbox area to toggle
                checkbox.addEventListener('dblclick', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                });
                
                groupEl.appendChild(eventEl);
            });
            
            container.appendChild(groupEl);
        });
        
// Bind select-all buttons
        container.querySelectorAll('.todo-select-all-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                try {
                    console.log('[SelectAll] click fired');
                    e.stopPropagation();
                    e.preventDefault();
                    const dateKey = btn.dataset.dateKey;
                    console.log('[SelectAll] dateKey=', dateKey);
                    const group = container.querySelector(`.todo-date-group[data-date-key="${dateKey}"]`);
                    console.log('[SelectAll] group found=', !!group);
                    if (!group) {
                        return;
                    }
                    const itemIds = Array.from(group.querySelectorAll('.todo-item')).map(el => el.dataset.eventId);
                    console.log('[SelectAll] itemIds=', itemIds);
                    const pending = itemIds.filter(id => {
                        const ev = state.events.find(e => String(e.id) === String(id));
                        return ev && ev.status !== 'done';
                    });
                    console.log('[SelectAll] pending=', pending);
                    if (pending.length === 0) {
                        showToast('该日期没有待完成项');
                        return;
                    }
                    console.log('[SelectAll] calling enterSelectionMode');
                    enterSelectionMode('todo', null);
                    console.log('[SelectAll] after enter, active=', state.selectionMode.active);
                    pending.forEach(id => {
                        console.log('[SelectAll] toggling', id);
                        toggleSelection('todo', id);
                        console.log('[SelectAll] size now', state.selectionMode.todoIds.size);
                    });
                    group.querySelectorAll('.todo-item').forEach(el => {
                        el.classList.add('selection-mode');
                        const cb = el.querySelector('.todo-checkbox');
                        if (cb) {
                            const isSelected = state.selectionMode.todoIds.has(el.dataset.eventId);
                            cb.classList.toggle('selected', isSelected);
                            el.classList.toggle('selected', isSelected);
                        }
                    });
                    renderSelectionBar('todo');
                    console.log('[SelectAll] done, final size=', state.selectionMode.todoIds.size);
                } catch(err) {
                    console.error('[SelectAll] Error:', err.message, err.stack);
                }
            });
        });
        
        // 恢复滚动位置
        if (scrollParent) scrollParent.scrollTop = scrollTop;

        // Show swipe hint on first visit
        if (!localStorage.getItem('swipe_hint_seen') && container.children.length > 0) {
            localStorage.setItem('swipe_hint_seen', '1');
            const hint = document.createElement('div');
            hint.className = 'swipe-hint left visible';
            hint.textContent = '← 左滑编辑/删除';
            hint.style.cssText = 'top:40%;left:16px;opacity:1;';
            elements.app.appendChild(hint);
            setTimeout(() => hint.remove(), 3000);
        }
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

    function startStatsClock() {
        stopStatsClock();
        state.statsClockTimer = setInterval(() => {
            if (state.currentView === 'stats') {
                renderStatsView();
            }
        }, 1000);
    }

    function stopStatsClock() {
        if (state.statsClockTimer) {
            clearInterval(state.statsClockTimer);
            state.statsClockTimer = null;
        }
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
    // View Switching
    // ============================================
    async function switchView(view) {
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

    // ============================================
    // Modal Functions
    // ============================================
    function openEventModal(event = null) {
        state.selectedEvent = event;
        state.selectedCategory = event ? event.category_id : 'work';

        const getDefaultEditableTimes = () => {
            const baseDate = new Date(state.currentDate || new Date());
            const now = new Date();
            if (isToday(baseDate)) {
                baseDate.setHours(now.getHours(), now.getMinutes(), 0, 0);
            } else {
                baseDate.setHours(9, 0, 0, 0);
            }

            const minutes = baseDate.getMinutes();
            const rounded = minutes <= 30 ? 30 : 60;
            baseDate.setMinutes(rounded, 0, 0);
            if (rounded === 60) {
                baseDate.setHours(baseDate.getHours() + 1, 0, 0, 0);
            }

            const end = new Date(baseDate.getTime() + 30 * 60 * 1000);
            return {
                start: toLocalDatetime(baseDate),
                end: toLocalDatetime(end)
            };
        };
        
        // Update modal title based on create vs edit
        if (elements.eventModalTitle) {
            elements.eventModalTitle.textContent = event ? '编辑日程' : '新建日程';
        }
         
        // Reset form
        elements.eventTitle.value = event ? event.title : '';
        const defaultTimes = getDefaultEditableTimes();
        elements.startTime.value = event && event.start_time ? toLocalDatetime(event.start_time) : defaultTimes.start;
        elements.endTime.value = event && event.end_time ? toLocalDatetime(event.end_time) : defaultTimes.end;
        // If event has no start_time, mark as pending time
        elements.pendingTimeCheck.checked = !event || !event.start_time;
        elements.allDayCheck.checked = event ? event.all_day : false;
        
        // Reset reminder fields
        elements.reminderEnabled.checked = event
            ? (event.reminder_enabled === true || event.reminder_enabled === 'true')
            : state.defaultTaskReminderEnabled;
        
        renderCategorySelector();
        syncPendingTimeState();

        elements.eventModal.classList.remove('hidden');
        
        // Focus title input
        setTimeout(() => elements.eventTitle.focus(), 100);
    }
    
    function closeEventModal() {
        elements.eventModal.classList.add('hidden');
        state.selectedEvent = null;
    }

    function syncPendingTimeState() {
        const pending = !!elements.pendingTimeCheck.checked;
        elements.startTime.disabled = pending;
        elements.endTime.disabled = pending;
        if (pending) {
            elements.startTime.value = '';
            elements.endTime.value = '';
        }
    }

    async function saveEvent() {
        if (state.isSavingEvent) {
            return;
        }

        const title = elements.eventTitle.value.trim();
        if (!title) {
            showToast('请输入日程内容');
            return;
        }
        
        // Validate end time >= start time
        const isPendingTime = !!elements.pendingTimeCheck.checked;
        const startTime = isPendingTime ? '' : elements.startTime.value;
        const endTime = isPendingTime ? '' : elements.endTime.value;
        if (startTime && endTime && new Date(endTime) < new Date(startTime)) {
            showToast('结束时间不能早于开始时间');
            return;
        }
        
        const eventData = {
            title: title,
            start_time: startTime || null,
            end_time: endTime || null,
            category_id: state.selectedCategory,
            all_day: elements.allDayCheck.checked,
            status: state.selectedEvent?.status || 'pending',
            reminder_enabled: elements.reminderEnabled.checked,
            reminder_minutes: elements.reminderEnabled.checked ? 1 : 0
        };
        
        state.isSavingEvent = true;
        elements.saveEventBtn.disabled = true;

        try {
            let result;
            if (state.selectedEvent && state.selectedEvent.id) {
                // Update existing event
                result = await updateEvent(state.selectedEvent.id, eventData);
                if (result) {
                    showToast('日程已更新');
                    closeEventModal();
                    await loadData();
                }
            } else {
                // Create new event
                result = await createEvent(eventData);
                if (result) {
                    showToast('日程已创建');
                    closeEventModal();
                    await loadData();
                }
            }
        } finally {
            state.isSavingEvent = false;
            elements.saveEventBtn.disabled = false;
        }
    }

    async function showEventDetail(event) {
        state.selectedEvent = event;

        const content = elements.detailContent;
        const reminderEnabled = event.reminder_enabled === true || event.reminder_enabled === 'true';

        const startTime = event.start_time ? event.start_time.slice(0, 16) : '';
        const endTime = event.end_time ? event.end_time.slice(0, 16) : '';

        content.innerHTML = `
            <div class="detail-row">
                <span class="detail-label">标题</span>
                <span class="detail-value">${escapeHtml(event.title)}</span>
            </div>
            <div class="detail-row detail-time-row">
                <div class="detail-time-item">
                    <span class="detail-label">开始</span>
                    <input type="datetime-local" id="detailStartTime" value="${startTime}">
                </div>
                <div class="detail-time-item">
                    <span class="detail-label">结束</span>
                    <input type="datetime-local" id="detailEndTime" value="${endTime}">
                </div>
            </div>
            <div class="detail-row">
                <span class="detail-label">分类</span>
                <span class="detail-category" style="background: ${getCategoryColor(event.category_id)}20; color: ${getCategoryColor(event.category_id)}">
                    ${getCategoryName(event.category_id)}
                </span>
            </div>
            <div class="detail-row">
                <span class="detail-label">状态</span>
                <span class="detail-value">${event.status === 'done' ? '已完成' : '待完成'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">提醒开关</span>
                <label class="switch">
                    <input type="checkbox" id="detailReminderEnabled" ${reminderEnabled ? 'checked' : ''}>
                    <span class="switch-slider"></span>
                </label>
            </div>
        `;

        elements.detailModal.classList.remove('hidden');
    }
    
    function getActionLabel(action) {
        const labels = {
            'created': '创建',
            'updated': '修改',
            'deleted': '删除',
            'completed': '完成',
            'uncompleted': '撤销完成'
        };
        return labels[action] || action;
    }
    
    function formatHistoryTime(timeStr) {
        if (!timeStr) return '';
        try {
            const d = new Date(timeStr);
            return d.toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' });
        } catch {
            return timeStr;
        }
    }
    
    function formatHistoryDiff(history) {
        try {
            if (history.action === 'updated' && history.old_value && history.new_value) {
                const old = JSON.parse(history.old_value);
                const newVal = JSON.parse(history.new_value);
                const changes = [];
                for (const key of Object.keys(newVal)) {
                    if (JSON.stringify(old[key]) !== JSON.stringify(newVal[key])) {
                        changes.push(`${key}: ${old[key] || '(空)'} → ${newVal[key] || '(空)'}`);
                    }
                }
                return changes.join(', ');
            }
        } catch {}
        return '';
    }
    
    async function saveDetailChanges() {
        if (!state.selectedEvent || !state.selectedEvent.id) return;

        const detailStartTime = document.getElementById('detailStartTime');
        const detailEndTime = document.getElementById('detailEndTime');
        const detailReminderEnabled = document.getElementById('detailReminderEnabled');

        if (!detailStartTime || !detailEndTime || !detailReminderEnabled) return;

        const startTime = detailStartTime.value || null;
        const endTime = detailEndTime.value || null;
        const reminderEnabled = detailReminderEnabled.checked;
        const reminderMinutes = reminderEnabled ? 1 : 0;

        const result = await updateEvent(state.selectedEvent.id, {
            start_time: startTime,
            end_time: endTime,
            reminder_enabled: reminderEnabled,
            reminder_minutes: reminderMinutes
        });

        if (result) {
            showToast('日程已更新');
            // Update local state
            state.selectedEvent.start_time = startTime;
            state.selectedEvent.end_time = endTime;
            state.selectedEvent.reminder_enabled = reminderEnabled;
            state.selectedEvent.reminder_minutes = reminderMinutes;
            // Also update event in state.events array so it persists across tab switches
            const idx = state.events.findIndex(e => e.id === state.selectedEvent.id);
            if (idx !== -1) {
                state.events[idx].start_time = startTime;
                state.events[idx].end_time = endTime;
                state.events[idx].reminder_enabled = reminderEnabled;
                state.events[idx].reminder_minutes = reminderMinutes;
            }
            // Re-render current view
            if (state.currentView === 'day') {
                if (state.calendarSubview === 'day') renderTimeline();
                else if (state.calendarSubview === 'week') renderWeekView();
                else if (state.calendarSubview === 'month') renderMonthView();
            }
            closeDetailModal();
        }
    }

    function closeDetailModal() {
        elements.detailModal.classList.add('hidden');
        state.selectedEvent = null;
    }

    async function deleteSelectedEvent() {
        if (!state.selectedEvent || !state.selectedEvent.id) return;
        
        const result = await deleteEvent(state.selectedEvent.id);
        if (result) {
            showToast('日程已删除');
            closeDetailModal();
            loadData();
        }
    }

    async function completeSelectedEvent() {
        if (!state.selectedEvent || !state.selectedEvent.id) return;
        
        const result = await completeEvent(state.selectedEvent.id);
        if (result) {
            showToast('日程已完成');
            closeDetailModal();
            loadData();
        }
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
    async function renderActiveViewAfterDataLoad() {
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
            renderStatsView();
        }
    }

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
    // Hash Router
    // ============================================
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
    // Initialization
    // ============================================
    async function init() {
        console.log('Initializing Schedule App...');
        
        injectToastStyles();
        registerGlobalErrorHandlers();
        bindEvents();
        renderCategorySelector();
        syncPendingTimeState();
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
