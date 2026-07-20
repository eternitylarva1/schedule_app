(function(global){
    'use strict';
    const state = (global.ScheduleAppCore && global.ScheduleAppCore.state) || {};
    const elements = (global.ScheduleAppCore && global.ScheduleAppCore.elements) || {};
    const core = global.ScheduleAppCore || {};
    const selection = global.ScheduleAppSelection || {};
    
    const {
        formatDate, isSameDay, formatTime, getCategoryColor, escapeHtml,
        apiCall, showToast, showConfirm,
    } = core;
    const { completeEvent, uncompleteEvent, deleteEvent } = core;
    const { enterSelectionMode, toggleSelection, renderSelectionBar } = selection;

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
                const priorityLabel = event.priority && event.priority !== 'none' 
                    ? `<span class="todo-priority todo-priority-${event.priority}">${event.priority === 'high' ? '高' : event.priority === 'medium' ? '中' : '低'}</span>` 
                    : '';
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
                        ${priorityLabel}
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

    global.ScheduleAppTodoList = { renderTodoView };
})(window);
