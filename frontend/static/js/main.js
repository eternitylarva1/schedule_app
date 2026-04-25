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


    const selection = window.ScheduleAppSelection || {};
    const markEventDoneQuick = (...args) => selection.markEventDoneQuick?.(...args);
    const getSelectionSet = (...args) => selection.getSelectionSet?.(...args);
    const exitSelectionMode = (...args) => selection.exitSelectionMode?.(...args);
    const enterSelectionMode = (...args) => selection.enterSelectionMode?.(...args);
    const toggleSelection = (...args) => selection.toggleSelection?.(...args);
    const renderSelectionBar = (...args) => selection.renderSelectionBar?.(...args);

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
        createEventWithLLM,
        executeUnifiedLlmCommand,
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

    selection.configure?.({
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

    function renderTimeline() {
        const timeline = elements.timeline;
        timeline.innerHTML = '';
        
        // Create hour markers
        for (let i = 0; i < 24; i++) {
            const hour = document.createElement('div');
            hour.className = 'timeline-hour';
            hour.setAttribute('data-hour', `${String(i).padStart(2, '0')}:00`);
            timeline.appendChild(hour);
        }
        
        // Add current time indicator
        if (isToday(state.currentDate)) {
            const now = new Date();
            const currentMinutes = now.getHours() * 60 + now.getMinutes();
            const currentTop = currentMinutes;
            
            const timeLine = document.createElement('div');
            timeLine.className = 'current-time-line';
            timeLine.style.top = `${currentTop}px`;
            timeline.appendChild(timeLine);
        }
        
        // Render events for today
        const dayEvents = state.events.filter(event => {
            if (!event.start_time) return false;
            return isSameDay(event.start_time, state.currentDate);
        });
        
        dayEvents.forEach(event => {
            const eventEl = document.createElement('div');
            eventEl.className = 'timeline-event';
            eventEl.dataset.eventId = event.id;
            eventEl.style.top = `${getEventTop(event)}px`;
            eventEl.style.height = `${getEventHeight(event)}px`;
            eventEl.style.setProperty('--event-color', getCategoryColor(event.category_id));
            
            if (event.status === 'done') {
                eventEl.classList.add('completed');
            }
            
            // Create resize handles only if enabled in settings
            let resizeTop, resizeBottom;
            if (state.enableDragResize) {
                resizeTop = document.createElement('div');
                resizeTop.className = 'event-resize-handle resize-top';
                
                resizeBottom = document.createElement('div');
                resizeBottom.className = 'event-resize-handle resize-bottom';
            }
            
            eventEl.innerHTML = `
                <div class="timeline-event-title">${escapeHtml(event.title)}</div>
                <div class="timeline-event-time">${formatTimeRange(event)}</div>
                ${event.status !== 'done' ? '<button class="event-quick-complete" title="快速完成">✓</button>' : ''}
            `;
            
            // Add quick complete handler
            const quickCompleteBtn = eventEl.querySelector('.event-quick-complete');
            if (quickCompleteBtn) {
                quickCompleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    markEventDoneQuick(event.id);
                });
            }
            
            // Add resize handles if enabled
            if (state.enableDragResize) {
                eventEl.appendChild(resizeTop);
                eventEl.appendChild(resizeBottom);
                
                // Add drag handlers
                resizeTop.addEventListener('mousedown', (e) => handleEventDragStart(e, event, 'start'));
                resizeTop.addEventListener('touchstart', (e) => handleEventDragStart(e, event, 'start'));
                resizeBottom.addEventListener('mousedown', (e) => handleEventDragStart(e, event, 'end'));
                resizeBottom.addEventListener('touchstart', (e) => handleEventDragStart(e, event, 'end'));
            }
            
            eventEl.addEventListener('click', (e) => {
                // Don't show detail if clicking resize handles
                if (e.target.closest('.event-resize-handle')) return;
                showEventDetail(event);
            });
            timeline.appendChild(eventEl);
        });
    }

    function renderAgendaList(mode) {
        const timeline = elements.timeline;
        timeline.innerHTML = '';
        
        let dates = [];
        if (mode === 'week') {
            dates = getWeekDates(state.currentDate);
        } else if (mode === 'month') {
            const month = state.currentMonth;
            const year = month.getFullYear();
            const monthIndex = month.getMonth();
            const firstDay = new Date(year, monthIndex, 1);
            const lastDay = new Date(year, monthIndex + 1, 0);
            const daysInMonth = lastDay.getDate();
            
            for (let i = 1; i <= daysInMonth; i++) {
                dates.push(new Date(year, monthIndex, i));
            }
        }
        
        // Group events by day
        const groupedEvents = {};
        dates.forEach(date => {
            const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
            groupedEvents[dateKey] = [];
        });
        
        state.events.forEach(event => {
            if (!event.start_time) return;
            const eventDate = new Date(event.start_time);
            const dateKey = `${eventDate.getFullYear()}-${eventDate.getMonth()}-${eventDate.getDate()}`;
            if (groupedEvents[dateKey]) {
                groupedEvents[dateKey].push(event);
            }
        });
        
        // Sort events within each day by start time
        Object.keys(groupedEvents).forEach(key => {
            groupedEvents[key].sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
        });
        
        const listEl = document.createElement('div');
        listEl.className = 'agenda-list';
        
        let hasAnyEvents = false;
        
        dates.forEach(date => {
            const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
            const dayEvents = groupedEvents[dateKey] || [];
            
            if (dayEvents.length > 0) {
                hasAnyEvents = true;
            }
            
            const sectionEl = document.createElement('div');
            sectionEl.className = 'agenda-day-section';
            
            // Day header
            const headerEl = document.createElement('div');
            headerEl.className = 'agenda-day-header';
            
            const today = new Date();
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            
            let dateLabel;
            if (isSameDay(date, today)) {
                dateLabel = '今天';
            } else if (isSameDay(date, tomorrow)) {
                dateLabel = '明天';
            } else {
                dateLabel = formatDate(date, 'month-day');
            }
            
            headerEl.textContent = dateLabel;
            sectionEl.appendChild(headerEl);
            
            // Day items
            const itemsEl = document.createElement('div');
            itemsEl.className = 'agenda-day-items';
            
            if (dayEvents.length === 0) {
                const emptyEl = document.createElement('div');
                emptyEl.className = 'agenda-empty';
                emptyEl.textContent = '暂无日程';
                itemsEl.appendChild(emptyEl);
            } else {
                dayEvents.forEach(event => {
                    const eventEl = document.createElement('div');
                    eventEl.className = 'agenda-event';
                    eventEl.style.setProperty('--event-color', getCategoryColor(event.category_id));
                    
                    if (event.status === 'done') {
                        eventEl.classList.add('completed');
                    }
                    
                    eventEl.innerHTML = `
                        <div class="agenda-event-title">${escapeHtml(event.title)}</div>
                        <div class="agenda-event-time">${formatTimeRange(event)}</div>
                    `;
                    
                    eventEl.addEventListener('click', () => {
                        showEventDetail(event);
                    });
                    
                    itemsEl.appendChild(eventEl);
                });
            }
            
            sectionEl.appendChild(itemsEl);
            listEl.appendChild(sectionEl);
        });
        
        timeline.appendChild(listEl);
    }

    function renderWeekView() {
        const weekDates = getWeekDates(state.currentDate);
        const weekHourHeight = 48;
        const clampMinutes = (minutes) => Math.max(0, Math.min(24 * 60, minutes));
        const weekBody = document.querySelector('.week-body');
        
        // Render time axis on the left
        const weekTimeAxis = elements.weekTimeAxis;
        weekTimeAxis.innerHTML = '';

        // Keep time axis inside the same scroll container as week grid
        if (weekBody && weekTimeAxis.parentElement !== weekBody) {
            weekBody.prepend(weekTimeAxis);
        }
        
        // Show hours every 2h to keep temporal relation clear
        for (let hour = 0; hour <= 24; hour += 2) {
            const label = document.createElement('div');
            label.className = 'week-time-label';
            label.style.top = `${hour * weekHourHeight}px`;
            if (hour === 24) {
                label.classList.add('is-end');
            }
            label.textContent = `${String(hour).padStart(2, '0')}:00`;
            weekTimeAxis.appendChild(label);
        }
        
        // Render week header
        const weekHeader = elements.weekHeader;
        weekHeader.innerHTML = '';
        
        weekDates.forEach(date => {
            const dayEl = document.createElement('div');
            dayEl.className = 'week-header-day';
            if (isToday(date)) {
                dayEl.classList.add('today');
            }
            dayEl.innerHTML = `
                <span>${formatDate(date, 'weekday')}</span>
                <span class="week-header-date">${date.getDate()}</span>
            `;
            weekHeader.appendChild(dayEl);
        });
        
        // Render week grid
        const weekGrid = elements.weekGrid;
        weekGrid.innerHTML = '';
        
        weekDates.forEach(date => {
            const cell = document.createElement('div');
            cell.className = 'week-cell';
            
            // Check if this is other month
            const currentMonth = state.currentDate.getMonth();
            if (date.getMonth() !== currentMonth) {
                cell.classList.add('other-month');
            }
            
            if (isToday(date)) {
                cell.classList.add('today');
            }
            
            // Get events for this day
            const dayEvents = state.events.filter(event => {
                if (!event.start_time) return false;
                return isSameDay(event.start_time, date);
            }).sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
            
            // Create events container
            const eventsDiv = document.createElement('div');
            eventsDiv.className = 'week-cell-events';
            
            let prevEventEndMinutes = -1;
            
            dayEvents.forEach(event => {
                const start = new Date(event.start_time);
                const fallbackEnd = new Date(start.getTime() + 30 * 60 * 1000);
                const end = event.end_time ? new Date(event.end_time) : fallbackEnd;

                const startMinutes = clampMinutes(start.getHours() * 60 + start.getMinutes());
                let endMinutes = clampMinutes(end.getHours() * 60 + end.getMinutes());
                if (endMinutes <= startMinutes) {
                    endMinutes = clampMinutes(startMinutes + 30);
                }

                const topPx = (startMinutes / 60) * weekHourHeight;
                let heightPx = Math.max(20, ((endMinutes - startMinutes) / 60) * weekHourHeight);
                
                // Add spacing between consecutive events (regardless of category)
                const gap = 3; // pixels
                const isConsecutive = prevEventEndMinutes === startMinutes;
                
                if (isConsecutive) {
                    // Reduce height slightly to account for the gap, keeping time accurate
                    heightPx = Math.max(16, heightPx - gap);
                }

                const eventEl = document.createElement('div');
                eventEl.className = 'week-event';
                eventEl.style.setProperty('--event-color', getCategoryColor(event.category_id));
                eventEl.style.top = `${topPx}px`;
                eventEl.style.height = `${heightPx}px`;
                
                // Add top margin for consecutive events
                if (isConsecutive) {
                    eventEl.style.marginTop = `${gap}px`;
                }
                
                const titleEl = document.createElement('div');
                titleEl.className = 'week-event-title';
                titleEl.textContent = getCompactTitle(event.title, 8);
                
                const timeEl = document.createElement('div');
                timeEl.className = 'week-event-time';
                timeEl.textContent = formatTimeRange(event);
                
                eventEl.appendChild(titleEl);
                eventEl.appendChild(timeEl);
                
                // Add quick complete button for pending events
                if (event.status !== 'done') {
                    const quickCompleteBtn = document.createElement('button');
                    quickCompleteBtn.className = 'week-event-complete';
                    quickCompleteBtn.textContent = '✓';
                    quickCompleteBtn.title = '快速完成';
                    quickCompleteBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        markEventDoneQuick(event.id);
                    });
                    eventEl.appendChild(quickCompleteBtn);
                }
                
                // Click on event to show detail
                eventEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    showEventDetail(event);
                });
                
                eventsDiv.appendChild(eventEl);
                
                // Track for next iteration
                prevEventEndMinutes = endMinutes;
            });
            
            cell.appendChild(eventsDiv);
            
            // Click to switch to day view (not on events)
            cell.addEventListener('click', (e) => {
                if (e.target.closest('.week-event')) return;
                state.currentDate = new Date(date);
                state.calendarSubview = 'day';
                switchView('day');
            });
            
            weekGrid.appendChild(cell);
        });

        // Current time marker in week view (today's column)
        const oldNowLine = weekBody?.querySelector('.week-now-line');
        if (oldNowLine) oldNowLine.remove();

        const now = new Date();
        const todayIndex = weekDates.findIndex(d => isSameDay(d, now));
        if (weekBody && todayIndex >= 0) {
            const nowMinutes = clampMinutes(now.getHours() * 60 + now.getMinutes());
            const nowTopPx = (nowMinutes / 60) * weekHourHeight;

            const nowLine = document.createElement('div');
            nowLine.className = 'week-now-line';
            nowLine.style.top = `${nowTopPx}px`;
            nowLine.style.left = `calc(52px + (${todayIndex} * (100% - 52px) / 7))`;
            nowLine.style.width = `calc((100% - 52px) / 7)`;

            const nowLabel = document.createElement('span');
            nowLabel.className = 'week-now-label';
            nowLabel.textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

            nowLine.appendChild(nowLabel);
            weekBody.appendChild(nowLine);
        }

        // Ensure users can see current-time events (e.g. evening tasks) on first entry
        scrollWeekViewToCurrentTime(weekDates);
    }

    function scrollWeekViewToCurrentTime(weekDates) {
        const weekBody = document.querySelector('.week-body');
        if (!weekBody) return;

        const weekHourHeight = 48;

        const now = new Date();
        const isCurrentWeek = weekDates.some(d => isSameDay(d, now));
        if (!isCurrentWeek) {
            weekBody.scrollTop = 0;
            return;
        }

        // Keep current-time area visible in the 24h timeline
        const totalMinutes = now.getHours() * 60 + now.getMinutes();
        const targetTop = Math.max(0, Math.floor((totalMinutes / 60) * weekHourHeight) - weekHourHeight * 2);
        weekBody.scrollTop = targetTop;
    }

    function renderMonthView() {
        const month = state.currentMonth;
        const year = month.getFullYear();
        const monthIndex = month.getMonth();
        
        // Render month header (weekday names)
        const monthHeader = elements.monthHeader;
        monthHeader.innerHTML = '';
        const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
        weekdays.forEach((day, index) => {
            const dayEl = document.createElement('div');
            dayEl.className = 'month-header-day' + (index === 0 || index === 6 ? ' weekend' : '');
            dayEl.textContent = day;
            monthHeader.appendChild(dayEl);
        });
        
        // Calculate days in month
        const firstDayOfMonth = new Date(year, monthIndex, 1);
        const lastDayOfMonth = new Date(year, monthIndex + 1, 0);
        const daysInMonth = lastDayOfMonth.getDate();
        const startDayOfWeek = firstDayOfMonth.getDay(); // 0 = Sunday
        
        // Create array of all days to display (including padding from prev/next month)
        const days = [];
        
        // Previous month padding
        const prevMonth = new Date(year, monthIndex, 0);
        const daysInPrevMonth = prevMonth.getDate();
        for (let i = startDayOfWeek - 1; i >= 0; i--) {
            days.push({
                date: new Date(year, monthIndex - 1, daysInPrevMonth - i),
                isCurrentMonth: false
            });
        }
        
        // Current month days
        for (let i = 1; i <= daysInMonth; i++) {
            days.push({
                date: new Date(year, monthIndex, i),
                isCurrentMonth: true
            });
        }
        
        // Next month padding to complete the last week
        const remainingDays = 7 - (days.length % 7);
        if (remainingDays < 7) {
            for (let i = 1; i <= remainingDays; i++) {
                days.push({
                    date: new Date(year, monthIndex + 1, i),
                    isCurrentMonth: false
                });
            }
        }
        
        // Render month grid
        const monthGrid = elements.monthGrid;
        monthGrid.innerHTML = '';
        
        days.forEach(dayInfo => {
            const cell = document.createElement('div');
            cell.className = 'month-cell';
            
            if (!dayInfo.isCurrentMonth) {
                cell.classList.add('other-month');
            }
            
            if (isToday(dayInfo.date)) {
                cell.classList.add('today');
            }
            
            // Day number
            const dayNumber = document.createElement('div');
            dayNumber.className = 'month-day-number';
            dayNumber.textContent = dayInfo.date.getDate();
            cell.appendChild(dayNumber);
            
            // Events container
            const eventsContainer = document.createElement('div');
            eventsContainer.className = 'month-events';
            
            // Get events for this day
            const dayEvents = state.events.filter(event => {
                if (!event.start_time) return false;
                return isSameDay(event.start_time, dayInfo.date);
            });
            
            // Sort events by start time
            dayEvents.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
            
            // Show up to 3 events, then +more
            const MAX_EVENTS = 3;
            dayEvents.slice(0, MAX_EVENTS).forEach(event => {
                const eventEl = document.createElement('div');
                eventEl.className = 'month-event';
                eventEl.style.setProperty('--event-color', getCategoryColor(event.category_id));
                eventEl.innerHTML = `
                    <div class="month-event-title">${escapeHtml(getCompactTitle(event.title, 6))}</div>
                    <div class="month-event-time">${escapeHtml(formatTimeRange(event))}</div>
                `;
                
                // Click on event to show detail
                eventEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    showEventDetail(event);
                });
                
                eventsContainer.appendChild(eventEl);
            });
            
            if (dayEvents.length > MAX_EVENTS) {
                const moreEl = document.createElement('div');
                moreEl.className = 'month-more';
                moreEl.textContent = `+${dayEvents.length - MAX_EVENTS}更多`;
                eventsContainer.appendChild(moreEl);
            }
            
            cell.appendChild(eventsContainer);
            
            // Click on cell to switch to day view
            cell.addEventListener('click', () => {
                state.currentDate = new Date(dayInfo.date);
                state.calendarSubview = 'day';
                switchView('day');
            });
            
            monthGrid.appendChild(cell);
        });
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
            return a.localeCompare(b);
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
            groupEl.innerHTML = `<div class="todo-date-header">${dateLabel}</div>`;
            
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
        
        // 恢复滚动位置
        if (scrollParent) scrollParent.scrollTop = scrollTop;
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

    // ============================================
    // Notepad View (Notes + Expense)
    // ============================================
    async function renderNotepadView() {
        return await window.ScheduleAppNotepad?.renderNotepadView?.();
    }

    async function renderNotepadContent() {
        return await window.ScheduleAppNotepad?.renderNotepadContent?.();
    }

    async function handleNotepadAdd() {
        return await window.ScheduleAppNotepad?.handleNotepadAdd?.();
    }

    async function renderNotesList() {
        const container = elements.notepadContainer;
        const notes = await fetchNotes();
        const groups = await fetchNoteGroups() || [];
        
        // Initialize expandedGroups on first load (when set is empty)
        if (state.expandedGroups.size === 0 && groups.length > 0) {
            groups.forEach((g) => {
                state.expandedGroups.add(String(g.id));
            });
            // Also add 'ungrouped' by default
            state.expandedGroups.add('ungrouped');
        }
        
        // If no notes at all
        if ((!notes || notes.length === 0) && (!groups || groups.length === 0)) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📝</div>
                    <div class="empty-text">暂无笔记</div>
                    <div class="empty-hint">在上方输入内容添加笔记</div>
                </div>
            `;
            return;
        }
        
        // Build group map
        const groupMap = {};
        groups.forEach(g => {
            groupMap[g.id] = { ...g, notes: [] };
        });
        
        // Separate notes into groups
        const ungroupedNotes = [];
        notes.forEach(note => {
            if (note.group_id && groupMap[note.group_id]) {
                groupMap[note.group_id].notes.push(note);
            } else {
                ungroupedNotes.push(note);
            }
        });
        
        // Build HTML with groups
        let html = '';
        
        // Render each group (sorted by sort_order)
        const sortedGroups = groups.sort((a, b) => a.sort_order - b.sort_order);
        sortedGroups.forEach(group => {
            const isExpanded = state.expandedGroups.has(String(group.id));
            const groupData = groupMap[group.id] || { notes: [] };
            const noteCount = groupData.notes.length;
            
            html += `
                <details class="note-group" data-group-id="${group.id}" ${isExpanded ? 'open' : ''}>
                    <summary class="note-group-header" data-group-id="${group.id}">
                        <span class="note-group-toggle">${isExpanded ? '▼' : '▶'}</span>
                        <span class="note-group-name">${escapeHtml(group.name)}</span>
                        <span class="note-group-count">${noteCount}</span>
                        <button class="note-group-delete" data-group-id="${group.id}" title="删除分组">×</button>
                    </summary>
                    <div class="note-group-content ${isExpanded ? '' : 'collapsed'}">
                        ${noteCount > 0 ? groupData.notes.map(note => renderNoteItem(note)).join('') : '<div class="note-group-empty">暂无笔记</div>'}
                    </div>
                </details>
            `;
        });
        
        // Render ungrouped notes (collapsible)
        const ungroupedExpanded = state.expandedGroups.has('ungrouped');
        if (ungroupedNotes.length > 0) {
            html += `
                <details class="note-group" data-group-id="ungrouped" ${ungroupedExpanded ? 'open' : ''}>
                    <summary class="note-group-header" data-group-id="ungrouped">
                        <span class="note-group-toggle">${ungroupedExpanded ? '▼' : '▶'}</span>
                        <span class="note-group-name">未分组</span>
                        <span class="note-group-count">${ungroupedNotes.length}</span>
                    </summary>
                    <div class="note-group-content ${ungroupedExpanded ? '' : 'collapsed'}">
                        ${ungroupedNotes.map(note => renderNoteItem(note)).join('')}
                    </div>
                </details>
            `;
        }
        
        // Add "Add Group" button at the end
        html += `
            <div class="add-group-container">
                <button class="add-group-btn" id="addGroupBtn">
                    <span>+</span> 新建分组
                </button>
            </div>
        `;

        container.innerHTML = html;

        // Bind group delete events
        container.querySelectorAll('.note-group-delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                e.preventDefault();
                const groupId = parseInt(btn.dataset.groupId);
                const confirmed = await showConfirm('删除分组？分组内的笔记将移至"未分组"。');
                if (confirmed) {
                    await deleteNoteGroup(groupId);
                    showToast('分组已删除');
                    await renderNotesList();
                }
            });
        });
        
        // Bind add group button
        const addGroupBtn = document.getElementById('addGroupBtn');
        if (addGroupBtn) {
            addGroupBtn.addEventListener('click', () => {
                showAddGroupPrompt();
            });
        }
        
        // Bind note item events
        container.querySelectorAll('.note-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('.swipe-action')) return;
                const parentSwipe = item.closest('.swipe-item');
                if (parentSwipe && parentSwipe.classList.contains('swipe-open')) {
                    closeAllOpenSwipeItems();
                    return;
                }
                const noteId = parseInt(item.dataset.noteId);
                const note = state.notes.find(n => n.id === noteId);
                if (note) {
                    state.selectedNote = note;
                    // If AI chat panel is open, update panel context instead of showing modal
                    if (aiChatState.isOpen) {
                        const contextContent = document.getElementById('aiChatContextContent');
                        if (contextContent) {
                            contextContent.textContent = note.content || '（空笔记）';
                        }
                        // Focus input for chat
                        setTimeout(() => {
                            const input = document.getElementById('aiChatInput');
                            if (input) input.focus();
                        }, 100);
                    } else {
                        showNoteDetail(note);
                    }
                }
            });
        });
        
        // Swipe actions
        container.querySelectorAll('.note-swipe').forEach(bindSwipeItem);
        container.querySelectorAll('.note-swipe .swipe-action').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                const noteId = parseInt(btn.dataset.noteId);
                
                if (action === 'edit') {
                    const note = state.notes.find(n => n.id === noteId);
                    if (note) showNoteEdit(note);
                } else if (action === 'delete') {
                    const confirmed = await showConfirm('确定删除这条笔记吗？');
                    if (confirmed) {
                        await deleteNote(noteId);
                        showToast('已删除');
                        await renderNotesList();
                    }
                }
            });
        });
        
        // Drag-and-drop temporarily disabled for stability
    }
    
    function renderNoteItem(note) {
        // Truncate content to 2 lines (approx 100 chars)
        const truncate2Lines = (text) => {
            if (!text) return '';
            const lines = text.split('\n').slice(0, 2);
            let result = lines.join('\n');
            if (result.length > 100) {
                result = result.substring(0, 100) + '...';
            } else if (text.split('\n').length > 2) {
                result += '...';
            }
            return result;
        };
        return `
            <div class="swipe-item note-swipe" data-note-id="${note.id}" draggable="true">
                <div class="swipe-action swipe-action-left" data-action="edit" data-note-id="${note.id}">✏️ 编辑</div>
                <div class="swipe-action swipe-action-right" data-action="delete" data-note-id="${note.id}">🗑️ 删除</div>
                <div class="swipe-content">
                    <div class="note-item" data-note-id="${note.id}">
                        <div class="note-drag-handle" title="拖动排序">⋮⋮</div>
                        ${note.title ? `<div class="note-title">${escapeHtml(note.title)}</div>` : ''}
                        <div class="note-content">${escapeHtml(truncate2Lines(note.content))}</div>
                        <div class="note-meta">
                            <span class="note-time">${formatNoteTime(note.created_at)}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    async function showAddGroupPrompt() {
        const name = await showPrompt('请输入分组名称：', { placeholder: '例如：项目灵感' });
        if (name && name.trim()) {
            const result = await createNoteGroup(name.trim());
            if (result) {
                showToast('分组已创建');
                state.expandedGroups.add(String(result.id));
                await renderNotesList();
            }
        }
    }

    // ============================================
    // Note Drag and Drop
    // ============================================
    let noteDragState = {
        draggedNoteId: null,
        draggedElement: null,
        sourceGroupId: null,
        dragOverGroupId: null,
        dragOverNoteId: null,
    };

    function initNoteDragDrop() {
        const container = elements.notepadContainer;
        if (!container) return;

        // Use native drag events only
        container.addEventListener('dragstart', handleNoteDragStart, false);
        container.addEventListener('dragover', handleNoteDragOver, false);
        container.addEventListener('dragenter', handleNoteDragEnter, false);
        container.addEventListener('dragleave', handleNoteDragLeave, false);
        container.addEventListener('drop', handleNoteDrop, false);
        container.addEventListener('dragend', handleNoteDragEnd, false);
    }

    // ============================================
    // AI Floating Window for Notes
    // ============================================
    let aiChatState = {
        isOpen: false,
        currentNote: null,
        conversations: [],
        isLoading: false,
        isMinimized: false,
        isDragging: false,
        offsetX: 0,
        offsetY: 0
    };

    function initAIChatPanel() {
        const floatingWindow = document.getElementById('aiFloatingWindow');
        const minimizeBtn = document.getElementById('aiFloatingMinimize');
        const sendBtn = document.getElementById('aiFloatingSend');
        const input = document.getElementById('aiFloatingInput');
        const header = document.getElementById('aiFloatingHeader');

        if (!floatingWindow) return;

        // Hide by default
        floatingWindow.style.display = 'none';

        // Minimize/maximize toggle
        if (minimizeBtn) {
            minimizeBtn.addEventListener('click', () => {
                aiChatState.isMinimized = !aiChatState.isMinimized;
                if (aiChatState.isMinimized) {
                    floatingWindow.classList.add('minimized');
                    minimizeBtn.textContent = '□';
                } else {
                    floatingWindow.classList.remove('minimized');
                    minimizeBtn.textContent = '─';
                }
            });
        }

        // Send message on button click
        if (sendBtn) {
            sendBtn.addEventListener('click', () => sendAIChatMessage());
        }

        // Send on Enter key
        if (input) {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    sendAIChatMessage();
                }
            });
        }

        // Event delegation for insert buttons
        const history = document.getElementById('aiFloatingHistory');
        if (history) {
            history.addEventListener('click', (e) => {
                const insertBtn = e.target.closest('.ai-floating-insert-btn');
                if (insertBtn) {
                    const content = decodeURIComponent(insertBtn.dataset.content);
                    insertAIResponseToNote(content);
                }
            });
        }

        // Drag functionality
        if (header) {
            header.addEventListener('mousedown', startDrag);
            header.addEventListener('touchstart', startDrag, { passive: false });
        }

        document.addEventListener('mousemove', drag);
        document.addEventListener('touchmove', drag, { passive: false });
        document.addEventListener('mouseup', stopDrag);
        document.addEventListener('touchend', stopDrag);
    }

    function startDrag(e) {
        const floatingWindow = document.getElementById('aiFloatingWindow');
        if (!floatingWindow) return;

        aiChatState.isDragging = true;
        const rect = floatingWindow.getBoundingClientRect();

        if (e.type === 'touchstart') {
            aiChatState.offsetX = e.touches[0].clientX - rect.left;
            aiChatState.offsetY = e.touches[0].clientY - rect.top;
        } else {
            aiChatState.offsetX = e.clientX - rect.left;
            aiChatState.offsetY = e.clientY - rect.top;
        }
    }

    function drag(e) {
        if (!aiChatState.isDragging) return;

        const floatingWindow = document.getElementById('aiFloatingWindow');
        if (!floatingWindow) return;

        let clientX, clientY;
        if (e.type === 'touchmove') {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        const newLeft = clientX - aiChatState.offsetX;
        const newTop = clientY - aiChatState.offsetY;

        // Keep within viewport
        const maxLeft = window.innerWidth - floatingWindow.offsetWidth;
        const maxTop = window.innerHeight - floatingWindow.offsetHeight;

        floatingWindow.style.left = Math.max(0, Math.min(newLeft, maxLeft)) + 'px';
        floatingWindow.style.top = Math.max(0, Math.min(newTop, maxTop)) + 'px';
        floatingWindow.style.right = 'auto';

        e.preventDefault();
    }

    function stopDrag() {
        aiChatState.isDragging = false;
    }

    function showAIFloatingWindow(note) {
        const floatingWindow = document.getElementById('aiFloatingWindow');
        const context = document.getElementById('aiFloatingContext');
        const history = document.getElementById('aiFloatingHistory');
        const input = document.getElementById('aiFloatingInput');

        if (!floatingWindow) return;

        aiChatState.isOpen = true;
        aiChatState.currentNote = note;
        aiChatState.isMinimized = false;

        floatingWindow.style.display = 'flex';
        floatingWindow.classList.remove('minimized');
        const minimizeBtn = document.getElementById('aiFloatingMinimize');
        if (minimizeBtn) minimizeBtn.textContent = '─';

        // Show note context
        if (context) {
            context.textContent = note.content ? note.content.substring(0, 200) + (note.content.length > 200 ? '...' : '') : '（空笔记）';
        }

        // Load conversation history
        loadAIChatHistory();

        // Focus input
        setTimeout(() => {
            if (input) {
                input.focus();
            }
        }, 100);
    }

    function hideAIFloatingWindow() {
        const floatingWindow = document.getElementById('aiFloatingWindow');
        if (!floatingWindow) return;

        aiChatState.isOpen = false;
        aiChatState.currentNote = null;
        aiChatState.conversations = [];
        floatingWindow.style.display = 'none';
    }

    async function loadAIChatHistory() {
        if (!aiChatState.currentNote) return;

        try {
            const conversations = await fetchNoteConversations(aiChatState.currentNote.id);
            aiChatState.conversations = conversations || [];
            renderAIChatHistory();
        } catch (error) {
            console.error('Failed to load chat history:', error);
        }
    }

    function renderAIChatHistory() {
        const container = document.getElementById('aiFloatingHistory');
        if (!container) return;

        if (aiChatState.conversations.length === 0) {
            container.innerHTML = '<div class="ai-floating-empty">发送消息开始对话</div>';
            return;
        }

        container.innerHTML = aiChatState.conversations.map(conv => `
            <div class="ai-floating-message ${conv.role}">
                <div class="ai-floating-bubble">
                    ${escapeHtml(conv.content)}
                    ${conv.role === 'assistant' ? `<button class="ai-floating-insert-btn" data-content="${encodeURIComponent(conv.content)}">↩ 插入</button>` : ''}
                </div>
            </div>
        `).join('');

        // Scroll to bottom
        container.scrollTop = container.scrollHeight;
    }

    async function sendAIChatMessage() {
        if (!aiChatState.currentNote || aiChatState.isLoading) return;

        const input = document.getElementById('aiFloatingInput');
        const message = input?.value.trim();
        if (!message) return;

        const container = document.getElementById('aiFloatingHistory');
        aiChatState.isLoading = true;
        input.value = '';

        // Show user message immediately
        if (container) {
            container.innerHTML += `
                <div class="ai-floating-message user">
                    <div class="ai-floating-bubble">${escapeHtml(message)}</div>
                </div>
                <div class="ai-floating-message assistant">
                    <div class="ai-floating-bubble" style="color: var(--text-muted);">思考中...</div>
                </div>
            `;
            container.scrollTop = container.scrollHeight;
        }

        try {
            const response = await chatWithNote(aiChatState.currentNote.id, message);

            if (response) {
                // Remove thinking message and add response
                const thinkingEl = container?.querySelector('.ai-floating-message.assistant:last-child');
                if (thinkingEl) {
                    thinkingEl.innerHTML = `
                        <div class="ai-floating-bubble">${escapeHtml(response.content)}<button class="ai-floating-insert-btn" data-content="${encodeURIComponent(response.content)}">↩ 插入</button></div>
                    `;
                }

                // Add to state
                aiChatState.conversations.push({ role: 'user', content: message });
                aiChatState.conversations.push({ role: 'assistant', content: response.content });
            }
        } catch (error) {
            console.error('Chat error:', error);
            showToast('AI 对话失败，请重试');

            // Remove thinking message
            const thinkingEl = container?.querySelector('.ai-floating-message.assistant:last-child');
            if (thinkingEl) thinkingEl.remove();
        } finally {
            aiChatState.isLoading = false;
        }
    }

    async function insertAIResponseToNote(content) {
        if (!aiChatState.currentNote) return;

        const currentContent = aiChatState.currentNote.content || '';
        const newContent = currentContent
            ? currentContent + '\n\n---\nAI 回答：\n' + content
            : 'AI 回答：\n' + content;

        try {
            await updateNote(aiChatState.currentNote.id, { content: newContent });
            aiChatState.currentNote.content = newContent;

            // Update the textarea in the edit modal (use last one to avoid duplicate modal issues)
            const textareas = document.querySelectorAll('#noteEditTextarea');
            const textarea = textareas[textareas.length - 1];
            if (textarea) {
                textarea.value = newContent;
            }

            // Update context display
            const context = document.getElementById('aiFloatingContext');
            if (context) {
                context.textContent = newContent.substring(0, 200) + (newContent.length > 200 ? '...' : '');
            }

            showToast('已插入到笔记');
        } catch (error) {
            console.error('Failed to insert to note:', error);
            showToast('插入失败');
        }
    }

    // Make insert function globally accessible
    window.insertAIResponseToNote = insertAIResponseToNote;

    function handleNoteDragStart(e) {
        console.log('[DragStart] Firing!');
        
        // Find the swipe-item being dragged
        const swipeItem = e.target.closest('.note-swipe');
        if (!swipeItem) {
            console.log('[DragStart] No swipe-item found');
            return;
        }
        
        // Don't start drag if clicking on swipe actions (edit/delete buttons)
        if (e.target.closest('.swipe-action')) {
            console.log('[DragStart] Clicked on swipe action');
            return;
        }

        noteDragState.draggedNoteId = parseInt(swipeItem.dataset.noteId);
        noteDragState.draggedElement = swipeItem;
        
        // Find source group
        const groupEl = swipeItem.closest('.note-group');
        if (groupEl) {
            const groupId = groupEl.dataset.groupId;
            noteDragState.sourceGroupId = groupId === 'ungrouped' ? null : parseInt(groupId);
        }
        
        console.log('[DragStart] Started dragging note:', noteDragState.draggedNoteId, 'from group:', noteDragState.sourceGroupId);

        swipeItem.classList.add('dragging');
        
        // Set drag data
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', noteDragState.draggedNoteId);
        
        // Make drag image slightly transparent
        setTimeout(() => {
            swipeItem.style.opacity = '0.5';
        }, 0);
    }

    function handleNoteDragOver(e) {
        const swipeItem = e.target.closest('.note-swipe');
        const groupHeader = e.target.closest('.note-group-header');
        
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        
        if (noteDragState.draggedNoteId === null) {
            console.log('[DragOver] No dragged note yet');
            return;
        }
        
        if (groupHeader) {
            noteDragState.dragOverGroupId = groupHeader.closest('.note-group')?.dataset.groupId || null;
            noteDragState.dragOverNoteId = null;
            console.log('[DragOver] Over group header:', noteDragState.dragOverGroupId);
            return;
        }
        
        if (swipeItem && swipeItem !== noteDragState.draggedElement) {
            noteDragState.dragOverNoteId = parseInt(swipeItem.dataset.noteId);
            noteDragState.dragOverGroupId = null;
            console.log('[DragOver] Over note:', noteDragState.dragOverNoteId);
        }
    }

    function handleNoteDragEnter(e) {
        const swipeItem = e.target.closest('.note-swipe');
        const groupHeader = e.target.closest('.note-group-header');
        
        console.log('[DragEnter] Target:', e.target?.className, 'swipeItem:', swipeItem?.className);
        
        if (groupHeader) {
            // Highlight the group as drop target
            document.querySelectorAll('.note-group.drag-over').forEach(el => {
                el.classList.remove('drag-over');
            });
            const groupEl = groupHeader.closest('.note-group');
            if (groupEl) {
                groupEl.classList.add('drag-over');
            }
            noteDragState.dragOverGroupId = groupEl?.dataset.groupId || null;
            noteDragState.dragOverNoteId = null;
            console.log('[DragEnter] Entered group:', noteDragState.dragOverGroupId);
            return;
        }
        
        if (!swipeItem || swipeItem === noteDragState.draggedElement) {
            return;
        }
        
        e.preventDefault();
        
        // Remove drag-over from all
        document.querySelectorAll('.note-swipe.drag-over').forEach(el => {
            el.classList.remove('drag-over');
        });
        
        swipeItem.classList.add('drag-over');
        noteDragState.dragOverNoteId = parseInt(swipeItem.dataset.noteId);
        noteDragState.dragOverGroupId = null;
        console.log('[DragEnter] Entered note:', noteDragState.dragOverNoteId);
    }

    function handleNoteDragLeave(e) {
        const groupHeader = e.target.closest('.note-group-header');
        const swipeItem = e.target.closest('.note-swipe');
        
        // Only clear if leaving the container
        if (!e.relatedTarget || !e.currentTarget.contains(e.relatedTarget)) {
            document.querySelectorAll('.note-swipe.drag-over').forEach(el => {
                el.classList.remove('drag-over');
            });
            document.querySelectorAll('.note-group.drag-over').forEach(el => {
                el.classList.remove('drag-over');
            });
            noteDragState.dragOverGroupId = null;
            noteDragState.dragOverNoteId = null;
        }
    }

    async function handleNoteDrop(e) {
        e.preventDefault();
        console.log('[Drop] Fired! dragState:', noteDragState);
        
        // Clean up highlights
        document.querySelectorAll('.note-swipe.drag-over').forEach(el => {
            el.classList.remove('drag-over');
        });
        document.querySelectorAll('.note-group.drag-over').forEach(el => {
            el.classList.remove('drag-over');
        });
        
        // Only process drop if we actually started a drag
        if (!noteDragState.draggedNoteId) {
            console.log('[Drop] No dragged note ID (not a real drag)');
            return;
        }
        
        let targetGroupId = noteDragState.sourceGroupId;
        let targetSortOrder = 0;
        
        // Use tracked drag-over state
        if (noteDragState.dragOverGroupId !== null) {
            // Dropped on group header
            const groupId = noteDragState.dragOverGroupId;
            targetGroupId = groupId === 'ungrouped' ? null : parseInt(groupId);
            
            // Get notes in target group to determine sort order
            const groupNotes = state.notes.filter(n => n.group_id === targetGroupId);
            targetSortOrder = groupNotes.length;
        } else if (noteDragState.dragOverNoteId !== null) {
            // Dropped on another note
            const targetNoteId = noteDragState.dragOverNoteId;
            const targetNote = state.notes.find(n => n.id === targetNoteId);
            
            if (targetNote) {
                targetGroupId = targetNote.group_id;
                
                // Calculate sort order based on target position
                const groupNotes = state.notes
                    .filter(n => n.group_id === targetGroupId)
                    .sort((a, b) => a.sort_order - b.sort_order);
                
                const targetIndex = groupNotes.findIndex(n => n.id === targetNoteId);
                targetSortOrder = targetIndex;
            }
        }
        
        // Update note via API
        if (noteDragState.draggedNoteId) {
            console.log('[Drop] Updating note:', noteDragState.draggedNoteId, 'to group:', targetGroupId, 'sort:', targetSortOrder);
            await updateNote(noteDragState.draggedNoteId, {
                group_id: targetGroupId,
                sort_order: targetSortOrder
            });
            
            // Refresh notes
            await fetchNotes();
            await renderNotesList();
            console.log('[Drop] Done!');
        }
    }

    function handleNoteDragEnd(e) {
        console.log('[DragEnd] Fired!');
        
        // Clean up
        document.querySelectorAll('.note-swipe.dragging').forEach(el => {
            el.classList.remove('dragging');
            el.style.opacity = '';
        });
        document.querySelectorAll('.note-swipe.drag-over').forEach(el => {
            el.classList.remove('drag-over');
        });
        document.querySelectorAll('.note-group.drag-over').forEach(el => {
            el.classList.remove('drag-over');
        });
        
        noteDragState = {
            draggedNoteId: null,
            draggedElement: null,
            sourceGroupId: null,
            dragOverGroupId: null,
            dragOverNoteId: null,
        };
    }

    function formatNoteTime(isoString) {
        if (!isoString) return '';
        const date = new Date(isoString);
        const now = new Date();
        const isToday = isSameDay(date, now);
        const isYesterday = isSameDay(date, new Date(now.getTime() - 86400000));
        
        if (isToday) {
            return `今天 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
        } else if (isYesterday) {
            return `昨天 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
        } else {
            return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
        }
    }

    async function showNoteDetail(note) {
        state.selectedNote = note;
        const content = `
            <div class="note-detail-content">${escapeHtml(note.content)}</div>
            <div class="note-detail-time">${formatNoteTime(note.created_at)}</div>
        `;
        
        const detailHtml = `
            <div class="modal" id="noteDetailModal">
                <div class="modal-backdrop" id="noteDetailBackdrop"></div>
                <div class="modal-content">
                    <div class="modal-header">
                        <h2>笔记详情</h2>
                        <button class="modal-close" id="noteDetailClose">×</button>
                    </div>
                    <div class="modal-body">
                        ${note.title ? `<div class="note-detail-title">${escapeHtml(note.title)}</div>` : ''}
                        <div class="note-detail-content">${escapeHtml(note.content)}</div>
                        <div class="note-detail-time">${formatNoteTime(note.created_at)}</div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" id="noteDetailEditBtn">编辑</button>
                        <button class="btn btn-danger" id="noteDetailDeleteBtn">删除</button>
                    </div>
                </div>
            </div>
        `;
        
        // Remove existing modal if any
        const existingModal = document.getElementById('noteDetailModal');
        if (existingModal) existingModal.remove();
        
        document.body.insertAdjacentHTML('beforeend', detailHtml);
        
        const modal = document.getElementById('noteDetailModal');
        const backdrop = document.getElementById('noteDetailBackdrop');
        const closeBtn = document.getElementById('noteDetailClose');
        const editBtn = document.getElementById('noteDetailEditBtn');
        const deleteBtn = document.getElementById('noteDetailDeleteBtn');
        
        const closeModal = () => {
            modal.remove();
            state.selectedNote = null;
            // If AI window is showing this note, close it
            if (aiChatState.currentNote && aiChatState.currentNote.id === note.id) {
                hideAIFloatingWindow();
            }
        };
        
        backdrop.addEventListener('click', closeModal);
        closeBtn.addEventListener('click', closeModal);
        
        editBtn.addEventListener('click', () => {
            closeModal();
            showNoteEdit(note);
        });
        
        deleteBtn.addEventListener('click', async () => {
            const confirmed = await showConfirm('确定删除这条笔记吗？');
            if (confirmed) {
                await deleteNote(note.id);
                showToast('已删除');
                closeModal();
                await renderNotesList();
            }
        });
        
        // Show modal
        requestAnimationFrame(() => {
            modal.classList.remove('hidden');
        });
    }

    async function showNoteEdit(note) {
        // Remove ALL existing note edit modals (getElementById only returns first)
        document.querySelectorAll('#noteEditModal').forEach(m => { m.remove(); });

        // Get groups for selector
        const groups = await fetchNoteGroups();
        
        // Build group options
        let groupOptions = '<option value="">未分组</option>';
        groups.forEach(g => {
            const selected = note.group_id === g.id ? 'selected' : '';
            groupOptions += `<option value="${g.id}" ${selected}>${escapeHtml(g.name)}</option>`;
        });

        const editHtml = `
            <div class="modal" id="noteEditModal">
                <div class="modal-backdrop" id="noteEditBackdrop"></div>
                <div class="modal-content">
                    <div class="modal-header">
                        <h2>编辑笔记</h2>
                        <button class="modal-close" id="noteEditClose">×</button>
                    </div>
                    <div class="modal-body">
                        <input type="text" id="noteEditTitle" class="note-edit-title-input" placeholder="标题（可选）" value="${escapeHtml(note.title || '')}">
                        <div class="note-edit-row">
                            <select id="noteEditGroup" class="note-edit-group-select">
                                ${groupOptions}
                            </select>
                            <button class="btn btn-secondary note-edit-ai-btn" id="noteEditAiBtn" title="AI 对话">🤖 AI</button>
                        </div>
                        <textarea id="noteEditTextarea" class="note-edit-textarea">${escapeHtml(note.content)}</textarea>
                    </div>
                    <div class="modal-footer">
                        <button class="btn" id="noteEditCancel">取消</button>
                        <button class="btn btn-primary" id="noteEditSave">保存</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', editHtml);

        const modal = document.getElementById('noteEditModal');
        const backdrop = document.getElementById('noteEditBackdrop');
        const closeBtn = document.getElementById('noteEditClose');
        const cancelBtn = document.getElementById('noteEditCancel');
        const saveBtn = document.getElementById('noteEditSave');
        const titleInput = document.getElementById('noteEditTitle');
        const groupSelect = document.getElementById('noteEditGroup');
        const textarea = document.getElementById('noteEditTextarea');
        const floatBtn = document.getElementById('aiChatFloatBtn');

        // Hide float button when edit modal is open
        if (floatBtn) floatBtn.classList.add('hidden');

        const closeModal = () => {
            modal.remove();
            // If AI window is showing this note, close it
            if (aiChatState.currentNote && aiChatState.currentNote.id === note.id) {
                hideAIFloatingWindow();
            }
        };
        backdrop.addEventListener('click', closeModal);
        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);

        // AI chat button handler
        const aiBtn = document.getElementById('noteEditAiBtn');
        if (aiBtn) {
            aiBtn.addEventListener('click', () => {
                // Set this note as selected for AI chat
                state.selectedNote = note;
                // Show floating AI window
                showAIFloatingWindow(note);
            });
        }

        saveBtn.addEventListener('click', async () => {
            const newContent = textarea.value.trim();
            const newTitle = (titleInput?.value || '').trim();
            const newGroupId = groupSelect.value ? parseInt(groupSelect.value) : null;
            
            if (!newContent) {
                showToast('内容不能为空');
                return;
            }
            if (newContent === note.content && newTitle === (note.title || '') && newGroupId === note.group_id) {
                closeModal();
                return;
            }
            const result = await updateNote(note.id, {
                title: newTitle,
                content: newContent,
                group_id: newGroupId,
            });
            if (result) {
                showToast('笔记已更新');
                // Update AI window if showing this note
                if (aiChatState.currentNote && aiChatState.currentNote.id === note.id) {
                    aiChatState.currentNote.content = newContent;
                    const context = document.getElementById('aiFloatingContext');
                    if (context) {
                        context.textContent = newContent ? newContent.substring(0, 200) + (newContent.length > 200 ? '...' : '') : '（空笔记）';
                    }
                }
                closeModal();
                await renderNotesList();
            }
        });

        requestAnimationFrame(() => {
            modal.classList.remove('hidden');
            textarea.focus();
            textarea.selectionStart = textarea.value.length;
        });
    }

    function getTextColorForBackground(bgColor) {
        const hex = bgColor.replace('#', '');
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        return brightness > 128 ? '#333333' : '#ffffff';
    }

    async function renderExpenseList() {
        return await window.ScheduleAppNotepad?.renderExpenseList?.();
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
            hideAIFloatingWindow();
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
                    elements.daySlider.classList.remove('hidden');
                    elements.weekView.classList.add('hidden');
                    elements.monthView.classList.add('hidden');
                    renderTimeline();
                    // Scroll to current time if viewing today
                    if (isToday(state.currentDate)) {
                        const now = new Date();
                        const currentMinutes = now.getHours() * 60 + now.getMinutes();
                        const scrollTop = Math.max(0, currentMinutes - 60);
                        elements.dayView.scrollTop = scrollTop;
                    }
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
                break;
            case 'todo':
                elements.todoView.classList.remove('hidden');
                await renderTodoView();
                break;
            case 'notepad':
                if (elements.notepadView) {
                    elements.notepadView.classList.remove('hidden');
                    await renderNotepadView();
                }
                break;
            case 'goals':
                elements.goalsView.classList.remove('hidden');
                await renderGoalsView();
                break;
            case 'settings':
                if (elements.settingsView) {
                    elements.settingsView.classList.remove('hidden');
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

    function showEventDetail(event) {
        state.selectedEvent = event;
        
        const content = elements.detailContent;
        const reminderEnabled = event.reminder_enabled === true || event.reminder_enabled === 'true';
        
        content.innerHTML = `
            <div class="detail-row">
                <span class="detail-label">标题</span>
                <span class="detail-value">${escapeHtml(event.title)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">时间</span>
                <span class="detail-value">${formatTimeRange(event)}</span>
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
                <span class="detail-label">提醒</span>
                <span class="detail-value">${reminderEnabled ? '开始前1分钟' : '未开启'}</span>
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
    
    async function saveDetailReminder() {
        if (!state.selectedEvent || !state.selectedEvent.id) return;
        
        const detailReminderEnabled = document.getElementById('detailReminderEnabled');
        if (!detailReminderEnabled) return;
        
        const reminderEnabled = detailReminderEnabled.checked;
        const reminderMinutes = reminderEnabled ? 1 : 0;
        
        const result = await updateEvent(state.selectedEvent.id, {
            reminder_enabled: reminderEnabled,
            reminder_minutes: reminderMinutes
        });
        
        if (result) {
            showToast('提醒已更新');
            // Update local state
            state.selectedEvent.reminder_enabled = reminderEnabled;
            state.selectedEvent.reminder_minutes = reminderMinutes;
            // Also update event in state.events array so it persists across tab switches
            const idx = state.events.findIndex(e => e.id === state.selectedEvent.id);
            if (idx !== -1) {
                state.events[idx].reminder_enabled = reminderEnabled;
                state.events[idx].reminder_minutes = reminderMinutes;
            }
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
    function openBreakdownModal(options = {}) {
        elements.breakdownInput.value = options.text || '';
        state.breakdownItems = [];
        state.breakdownId = 'breakdown_' + Date.now();
        state.breakdownHorizon = options.horizon || state.goalsHorizon || 'short';
        if (elements.breakdownHorizon) elements.breakdownHorizon.value = state.breakdownHorizon;
        // Set default date to today
        const today = new Date();
        elements.breakdownDate.value = today.toISOString().split('T')[0];
        elements.breakdownResults.innerHTML = '<div class="breakdown-empty">输入任务描述，点击"AI拆解"按钮分解任务</div>';
        elements.breakdownModal.classList.remove('hidden');
    }

    function closeBreakdownModal() {
        elements.breakdownModal.classList.add('hidden');
    }

    // ============================================
    // Goal AI Discuss Modal
    // ============================================
    let goalDiscussState = {
        goalId: null,
        goalContent: '',
        conversationHistory: [],
        currentSubtasks: [],
        isComplete: false,
        mode: 'discuss',
        isRequesting: false,
        abortController: null,
        loadingStartTime: null,
        loadingMessageId: null,
        lastUserMessage: ''
    };

    function openGoalDiscussModal(goalId = null) {
        goalDiscussState = {
            goalId: goalId,
            goalContent: '',
            conversationHistory: [],
            currentSubtasks: [],
            isComplete: false,
            mode: 'discuss',
            isRequesting: false,
            abortController: null,
            loadingStartTime: null,
            loadingMessageId: null,
            lastUserMessage: ''
        };
        
        // Show intro, hide conversation and results
        elements.goalDiscussModal.querySelector('.goal-discuss-intro').classList.remove('hidden');
        elements.goalDiscussModal.querySelector('.goal-discuss-input-area').classList.remove('hidden');
        elements.goalDiscussConversation.classList.add('hidden');
        elements.goalDiscussResults.classList.add('hidden');
        elements.goalDiscussFooter.classList.add('hidden');
        
        elements.goalDiscussInput.value = '';
        elements.goalDiscussConversation.innerHTML = '';
        elements.goalDiscussResults.innerHTML = '';
        const titleEl = elements.goalDiscussModal.querySelector('.modal-header h2');
        if (titleEl) titleEl.textContent = '💬 AI 目标规划';
        
        elements.goalDiscussModal.classList.remove('hidden');
        elements.goalDiscussInput.focus();
    }

    async function openGoalHistoryModal(goalId) {
        const goal = state.goals.find(g => String(g.id) === String(goalId));

        goalDiscussState = {
            goalId,
            goalContent: goal ? goal.title : '',
            conversationHistory: [],
            currentSubtasks: [],
            isComplete: false,
            mode: 'history',
            isRequesting: false,
            abortController: null,
            loadingStartTime: null,
            loadingMessageId: null,
            lastUserMessage: ''
        };

        const titleEl = elements.goalDiscussModal.querySelector('.modal-header h2');
        if (titleEl) titleEl.textContent = '🕘 目标对话历史';

        elements.goalDiscussModal.querySelector('.goal-discuss-intro').classList.add('hidden');
        elements.goalDiscussModal.querySelector('.goal-discuss-input-area').classList.add('hidden');
        elements.goalDiscussResults.classList.add('hidden');
        elements.goalDiscussConversation.classList.remove('hidden');
        elements.goalDiscussConversation.innerHTML = '<div class="discuss-loading">加载历史中...</div>';

        // Dynamically rebuild footer for history mode
        elements.goalDiscussFooter.classList.remove('hidden');
        elements.goalDiscussFooter.innerHTML = `
            <button class="btn btn-secondary" id="goalDiscussCancelBtn">取消</button>
            <button class="btn btn-secondary" id="goalDiscussContinueBtn">继续对话</button>
            <button class="btn btn-primary" id="goalDiscussSaveBtn">保存目标</button>
        `;
        document.getElementById('goalDiscussCancelBtn')?.addEventListener('click', closeGoalDiscussModal);
        document.getElementById('goalDiscussContinueBtn')?.addEventListener('click', () => {
            goalDiscussState.mode = 'discuss';
            elements.goalDiscussConversation.classList.remove('hidden');
            elements.goalDiscussResults.classList.add('hidden');
            elements.goalDiscussFooter.classList.add('hidden');
            elements.goalDiscussConversation.querySelectorAll('.discuss-loading, .discuss-input-area').forEach((el) => {
                el.remove();
            });
            showDiscussInput();
        });
        document.getElementById('goalDiscussSaveBtn')?.addEventListener('click', saveGoalDiscuss);

        try {
            const conversations = await fetchGoalConversations(goalId);
            elements.goalDiscussConversation.innerHTML = '';
            if (!conversations || conversations.length === 0) {
                elements.goalDiscussConversation.innerHTML = '<div class="discuss-empty">暂无对话历史</div>';
            } else {
                conversations.forEach((msg) => {
                    addDiscussMessage(msg.role, msg.content);
                });
                goalDiscussState.conversationHistory = conversations.map((msg) => ({
                    role: msg.role,
                    content: msg.content
                }));
            }
        } catch (error) {
            console.error('Load conversations error:', error);
            elements.goalDiscussConversation.innerHTML = '<div class="discuss-error">加载失败</div>';
        }

        elements.goalDiscussModal.classList.remove('hidden');
    }

    function closeGoalDiscussModal() {
        if (goalDiscussState.abortController) {
            goalDiscussState.abortController.abort();
            goalDiscussState.abortController = null;
        }
        if (loadingTimerInterval) {
            clearInterval(loadingTimerInterval);
            loadingTimerInterval = null;
        }
        elements.goalDiscussModal.classList.add('hidden');
    }
    
    async function openGoalEditModal(goal) {
        const editHtml = `
            <div class="modal" id="goalEditModal">
                <div class="modal-backdrop" id="goalEditBackdrop"></div>
                <div class="modal-content">
                    <div class="modal-header">
                        <h2>编辑目标</h2>
                        <button class="modal-close" id="goalEditClose">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label for="goalEditTitle">目标内容</label>
                            <input type="text" id="goalEditTitle" value="${escapeHtml(goal.title || '')}">
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label for="goalEditStart">开始日期</label>
                                <input type="date" id="goalEditStart" value="${goal.start_date ? new Date(goal.start_date).toISOString().slice(0, 10) : ''}">
                            </div>
                            <div class="form-group">
                                <label for="goalEditEnd">截止日期</label>
                                <input type="date" id="goalEditEnd" value="${goal.end_date ? new Date(goal.end_date).toISOString().slice(0, 10) : ''}">
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn" id="goalEditCancel">取消</button>
                        <button class="btn btn-primary" id="goalEditSave">保存</button>
                    </div>
                </div>
            </div>
        `;
        
        const existingModal = document.getElementById('goalEditModal');
        if (existingModal) existingModal.remove();
        
        document.body.insertAdjacentHTML('beforeend', editHtml);
        
        const modal = document.getElementById('goalEditModal');
        const backdrop = document.getElementById('goalEditBackdrop');
        const closeBtn = document.getElementById('goalEditClose');
        const cancelBtn = document.getElementById('goalEditCancel');
        const saveBtn = document.getElementById('goalEditSave');
        const titleInput = document.getElementById('goalEditTitle');
        const startInput = document.getElementById('goalEditStart');
        const endInput = document.getElementById('goalEditEnd');
        
        const closeModal = () => modal.remove();
        backdrop.addEventListener('click', closeModal);
        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);
        
        saveBtn.addEventListener('click', async () => {
            const newTitle = titleInput.value.trim();
            if (!newTitle) {
                showToast('目标内容不能为空');
                return;
            }
            
            const updates = { title: newTitle };
            if (startInput.value) {
                updates.start_date = new Date(startInput.value).toISOString();
            }
            if (endInput.value) {
                updates.end_date = new Date(endInput.value).toISOString();
            }
            
            const result = await updateGoal(goal.id, updates);
            if (result) {
                showToast('已保存');
                closeModal();
                await renderGoalsList();
            }
        });
        
        requestAnimationFrame(() => {
            modal.classList.remove('hidden');
            titleInput.focus();
        });
    }

    async function persistDiscussMessage(role, content) {
        if (!goalDiscussState.goalId) return;
        if (!content || !String(content).trim()) return;
        try {
            await createGoalConversation(goalDiscussState.goalId, {
                role,
                content: String(content).trim()
            });
        } catch (error) {
            console.error('Persist conversation failed:', error);
        }
    }

    function normalizeSubtasksNoConflict(subtasks) {
        const items = Array.isArray(subtasks) ? subtasks.map((s) => ({ ...s })) : [];
        const toDateTime = (dateStr, timeStr) => {
            if (!dateStr || !timeStr) return null;
            const dt = new Date(`${dateStr}T${timeStr}`);
            return Number.isNaN(dt.getTime()) ? null : dt;
        };
        const toDateStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const toTimeStr = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

        const occupied = state.events
            .filter((e) => e.status !== 'done' && e.start_time)
            .map((e) => {
                const start = new Date(e.start_time);
                const end = e.end_time ? new Date(e.end_time) : new Date(e.start_time);
                return Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) ? null : { start, end };
            })
            .filter(Boolean);

        const hasOverlap = (start, end) => {
            for (const iv of occupied) {
                if (!(iv.end <= start || iv.start >= end)) return true;
            }
            return false;
        };

        for (const st of items) {
            let start = toDateTime(st.date, st.start_time);
            let end = toDateTime(st.date, st.end_time);
            if (!start) continue;
            if (!end || end <= start) {
                end = new Date(start.getTime() + 60 * 60 * 1000);
            }
            const duration = Math.max(30 * 60 * 1000, end.getTime() - start.getTime());

            let attempts = 0;
            while (hasOverlap(start, end) && attempts < 24 * 14) {
                start = new Date(start.getTime() + 60 * 60 * 1000);
                end = new Date(start.getTime() + duration);
                attempts += 1;
            }

            st.date = toDateStr(start);
            st.start_time = toTimeStr(start);
            st.end_time = toTimeStr(end);
            occupied.push({ start, end });
        }

        return items;
    }

    async function startGoalDiscuss() {
        if (goalDiscussState.isRequesting) return;
        const input = elements.goalDiscussInput.value.trim();
        if (!input) {
            showToast('请输入你的目标');
            return;
        }

        if (goalDiscussState.abortController) {
            goalDiscussState.abortController.abort();
        }
        goalDiscussState.abortController = new AbortController();
        goalDiscussState.isRequesting = true;
        goalDiscussState.lastUserMessage = input;
        elements.goalDiscussStartBtn.disabled = true;
        elements.goalDiscussInput.disabled = true;
        
        goalDiscussState.goalContent = input;
        goalDiscussState.conversationHistory = [];
        
        let draftGoalId = goalDiscussState.goalId;
        if (!draftGoalId) {
            try {
                const draftGoal = await createGoal({
                    title: input.slice(0, 50) + (input.length > 50 ? '...' : ''),
                    horizon: state.goalsHorizon
                });
                if (draftGoal && draftGoal.id) {
                    draftGoalId = draftGoal.id;
                    goalDiscussState.goalId = draftGoalId;
                }
            } catch (e) {
                console.error('Create draft goal failed:', e);
            }
        }
        
        elements.goalDiscussModal.querySelector('.goal-discuss-intro').classList.add('hidden');
        elements.goalDiscussModal.querySelector('.goal-discuss-input-area').classList.add('hidden');
        elements.goalDiscussConversation.classList.remove('hidden');
        
        addDiscussMessage('user', input);
        goalDiscussState.conversationHistory.push({ role: 'user', content: input });
        await persistDiscussMessage('user', input);
        
        showDiscussLoading();
        
        try {
            const result = await apiCall('goals/ai/discuss', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    goal_content: input,
                    user_input: '',
                    conversation_history: []
                })
            }, goalDiscussState.abortController.signal);
            
            elements.goalDiscussConversation.querySelectorAll('.discuss-loading').forEach((el) => {
                el.remove();
            });
            if (loadingTimerInterval) {
                clearInterval(loadingTimerInterval);
                loadingTimerInterval = null;
            }
            
            if (result) {
                if (result.type === 'question') {
                    addDiscussMessage('assistant', result.message);
                    goalDiscussState.conversationHistory.push({ role: 'assistant', content: result.message });
                    await persistDiscussMessage('assistant', result.message);
                    showDiscussInput();
                } else if (result.type === 'subtasks') {
                    goalDiscussState.currentSubtasks = normalizeSubtasksNoConflict(result.subtasks || []);
                    goalDiscussState.isComplete = true;
                    showDiscussResults();
                }
            } else {
                showDiscussError('AI响应失败，请稍后重试');
            }
        } catch (error) {
            if (error.name === 'AbortError' || error.message === 'The user aborted a request.') {
                elements.goalDiscussConversation.querySelectorAll('.discuss-loading').forEach((el) => {
                    el.remove();
                });
                showDiscussInputForRetry();
                return;
            }
            console.error('Discuss error:', error);
            showDiscussError(error.message || '请求失败');
        } finally {
            goalDiscussState.isRequesting = false;
            goalDiscussState.abortController = null;
            elements.goalDiscussStartBtn.disabled = false;
            elements.goalDiscussInput.disabled = false;
        }
    }

    async function continueGoalDiscuss() {
        if (goalDiscussState.isRequesting) return;
        const inputNodes = elements.goalDiscussConversation.querySelectorAll('.discuss-input-area input');
        const continueInputEl = inputNodes.length > 0 ? inputNodes[inputNodes.length - 1] : null;
        const input = continueInputEl ? continueInputEl.value.trim() : '';
        if (!input) return;

        if (goalDiscussState.abortController) {
            goalDiscussState.abortController.abort();
        }
        goalDiscussState.abortController = new AbortController();
        goalDiscussState.isRequesting = true;
        goalDiscussState.lastUserMessage = input;
        const continueBtnEl = continueInputEl ? continueInputEl.closest('.discuss-input-area')?.querySelector('.discuss-continue-btn') : null;
        if (continueInputEl) continueInputEl.disabled = true;
        if (continueBtnEl) continueBtnEl.disabled = true;

        const inputWrapper = continueInputEl ? continueInputEl.closest('.discuss-input-area') : null;
        if (inputWrapper) {
            inputWrapper.remove();
        }
        
        let draftGoalId = goalDiscussState.goalId;
        if (!draftGoalId) {
            try {
                const draftGoal = await createGoal({
                    title: goalDiscussState.goalContent.slice(0, 50) + (goalDiscussState.goalContent.length > 50 ? '...' : ''),
                    horizon: state.goalsHorizon
                });
                if (draftGoal && draftGoal.id) {
                    draftGoalId = draftGoal.id;
                    goalDiscussState.goalId = draftGoalId;
                }
            } catch (e) {
                console.error('Create draft goal failed:', e);
            }
        }
        
        addDiscussMessage('user', input);
        goalDiscussState.conversationHistory.push({ role: 'user', content: input });
        await persistDiscussMessage('user', input);
        
        showDiscussLoading();
        
        try {
            const result = await apiCall('goals/ai/discuss', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    goal_content: goalDiscussState.goalContent,
                    user_input: input,
                    conversation_history: goalDiscussState.conversationHistory.slice(-6)
                })
            }, goalDiscussState.abortController.signal);
            
            elements.goalDiscussConversation.querySelectorAll('.discuss-loading').forEach((el) => {
                el.remove();
            });
            if (loadingTimerInterval) {
                clearInterval(loadingTimerInterval);
                loadingTimerInterval = null;
            }
            
            if (result) {
                if (result.type === 'question') {
                    addDiscussMessage('assistant', result.message);
                    goalDiscussState.conversationHistory.push({ role: 'assistant', content: result.message });
                    await persistDiscussMessage('assistant', result.message);
                    showDiscussInput();
                } else if (result.type === 'subtasks') {
                    goalDiscussState.currentSubtasks = normalizeSubtasksNoConflict(result.subtasks || []);
                    goalDiscussState.isComplete = true;
                    showDiscussResults();
                } else {
                    showToast('AI未返回可继续内容，请重试');
                }
            }
        } catch (error) {
            if (error.name === 'AbortError' || error.message === 'The user aborted a request.') {
                elements.goalDiscussConversation.querySelectorAll('.discuss-loading').forEach((el) => {
                    el.remove();
                });
                showDiscussInputForRetry();
                return;
            }
            console.error('Continue discuss error:', error);
            showDiscussError(error.message || '请求失败');
        } finally {
            goalDiscussState.isRequesting = false;
            goalDiscussState.abortController = null;
        }
    }

    function addDiscussMessage(role, content) {
        const msgEl = document.createElement('div');
        msgEl.className = 'discuss-message ' + role;
        msgEl.innerHTML = `<div class="discuss-role">${role === 'user' ? '我' : 'AI'}:</div><div class="discuss-content">${escapeHtml(content)}</div>`;
        elements.goalDiscussConversation.appendChild(msgEl);
        elements.goalDiscussConversation.scrollTop = elements.goalDiscussConversation.scrollHeight;
    }

    function showDiscussLoading() {
        elements.goalDiscussConversation.querySelectorAll('.discuss-loading').forEach((el) => {
            el.remove();
        });
        const loadingId = 'loading-' + Date.now();
        goalDiscussState.loadingMessageId = loadingId;
        goalDiscussState.loadingStartTime = Date.now();
        
        const wrapper = document.createElement('div');
        wrapper.className = 'discuss-loading';
        wrapper.id = loadingId;
        wrapper.innerHTML = `
            <span class="loading-text">🤔 AI思考中...</span>
            <span class="loading-time"></span>
            <button class="btn btn-secondary btn-sm loading-stop-btn" style="margin-left: 8px;">停止</button>
        `;
        elements.goalDiscussConversation.appendChild(wrapper);
        
        const stopBtn = wrapper.querySelector('.loading-stop-btn');
        if (stopBtn) {
            stopBtn.addEventListener('click', () => {
                if (goalDiscussState.abortController) {
                    goalDiscussState.abortController.abort();
                }
            });
        }
        
        updateLoadingTime(loadingId);
        elements.goalDiscussConversation.scrollTop = elements.goalDiscussConversation.scrollHeight;
    }
    
    let loadingTimerInterval = null;
    
    function updateLoadingTime(loadingId) {
        if (loadingTimerInterval) {
            clearInterval(loadingTimerInterval);
        }
        loadingTimerInterval = setInterval(() => {
            const loadingEl = document.getElementById(loadingId);
            if (!loadingEl || !goalDiscussState.loadingStartTime) {
                clearInterval(loadingTimerInterval);
                return;
            }
            const elapsed = Math.floor((Date.now() - goalDiscussState.loadingStartTime) / 1000);
            const timeEl = loadingEl.querySelector('.loading-time');
            if (timeEl) {
                timeEl.textContent = `${elapsed}s`;
            }
            if (elapsed >= 30 && !loadingEl.querySelector('.loading-retry-btn')) {
                clearInterval(loadingTimerInterval);
                showDiscussTimeout(loadingId);
            }
        }, 1000);
    }
    
    function showDiscussTimeout(loadingId) {
        const loadingEl = document.getElementById(loadingId);
        if (!loadingEl) return;
        loadingEl.innerHTML = `
            <span class="loading-text">⏱️ AI响应超时</span>
            <button class="btn btn-primary btn-sm loading-retry-btn" style="margin-left: 8px;">重试</button>
            <button class="btn btn-secondary btn-sm loading-edit-btn" style="margin-left: 4px;">修改内容</button>
        `;
        const retryBtn = loadingEl.querySelector('.loading-retry-btn');
        const editBtn = loadingEl.querySelector('.loading-edit-btn');
        if (retryBtn) {
            retryBtn.addEventListener('click', () => {
                goalDiscussState.abortController = null;
                if (goalDiscussState.goalContent && !goalDiscussState.lastUserMessage) {
                    startGoalDiscuss();
                } else {
                    continueGoalDiscuss();
                }
            });
        }
        if (editBtn) {
            editBtn.addEventListener('click', () => {
                goalDiscussState.abortController = null;
                showDiscussInputForRetry();
            });
        }
    }
    
    function showDiscussError(message, isTimeout = false) {
        elements.goalDiscussConversation.querySelectorAll('.discuss-loading').forEach((el) => {
            el.remove();
        });
        const errorId = 'error-' + Date.now();
        const errorEl = document.createElement('div');
        errorEl.className = 'discuss-loading';
        errorEl.id = errorId;
        errorEl.innerHTML = `
            <span class="loading-text">❌ ${escapeHtml(message)}</span>
            <button class="btn btn-primary btn-sm loading-retry-btn" style="margin-left: 8px;">重试</button>
            <button class="btn btn-secondary btn-sm loading-edit-btn" style="margin-left: 4px;">修改内容</button>
        `;
        elements.goalDiscussConversation.appendChild(errorEl);
        
        const retryBtn = errorEl.querySelector('.loading-retry-btn');
        const editBtn = errorEl.querySelector('.loading-edit-btn');
        if (retryBtn) {
            retryBtn.addEventListener('click', () => {
                goalDiscussState.abortController = null;
                if (goalDiscussState.goalContent && !goalDiscussState.lastUserMessage) {
                    startGoalDiscuss();
                } else {
                    continueGoalDiscuss();
                }
            });
        }
        if (editBtn) {
            editBtn.addEventListener('click', () => {
                goalDiscussState.abortController = null;
                showDiscussInputForRetry();
            });
        }
        elements.goalDiscussConversation.scrollTop = elements.goalDiscussConversation.scrollHeight;
    }
    
    function showDiscussInputForRetry() {
        elements.goalDiscussConversation.querySelectorAll('.discuss-loading').forEach((el) => {
            el.remove();
        });
        elements.goalDiscussConversation.querySelectorAll('.discuss-input-area').forEach((el) => {
            el.remove();
        });
        const wrapper = document.createElement('div');
        wrapper.className = 'discuss-input-area';
        wrapper.innerHTML = `
            <input type="text" class="discuss-continue-input" placeholder="修改内容后重试..." value="${escapeHtml(goalDiscussState.lastUserMessage || '')}" />
            <button class="btn btn-primary discuss-continue-btn">重新发送</button>
        `;
        elements.goalDiscussConversation.appendChild(wrapper);
        const inputEl = wrapper.querySelector('.discuss-continue-input');
        const btnEl = wrapper.querySelector('.discuss-continue-btn');
        if (btnEl) btnEl.addEventListener('click', () => {
            const newInput = inputEl.value.trim();
            if (newInput && newInput !== goalDiscussState.lastUserMessage) {
                if (goalDiscussState.conversationHistory.length > 0) {
                    goalDiscussState.conversationHistory.pop();
                }
                goalDiscussState.lastUserMessage = newInput;
            }
            continueGoalDiscuss();
        });
        if (inputEl) {
            inputEl.focus();
            inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
        }
    }

    function showDiscussInput(placeholder = '回答AI的问题...') {
        // Keep exactly one active follow-up input row
        elements.goalDiscussConversation.querySelectorAll('.discuss-input-area').forEach((el) => {
            el.remove();
        });
        const wrapper = document.createElement('div');
        wrapper.className = 'discuss-input-area';
        wrapper.innerHTML = `
            <input type="text" class="discuss-continue-input" placeholder="${placeholder}" />
            <button class="btn btn-primary discuss-continue-btn">发送</button>
        `;
        elements.goalDiscussConversation.appendChild(wrapper);
        const inputEl = wrapper.querySelector('.discuss-continue-input');
        const btnEl = wrapper.querySelector('.discuss-continue-btn');
        if (btnEl) btnEl.addEventListener('click', continueGoalDiscuss);
        if (inputEl) {
            inputEl.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') continueGoalDiscuss();
            });
            inputEl.focus();
        }
    }

    function showDiscussResults() {
        // Clear transient rows before switching to results view
        elements.goalDiscussConversation.querySelectorAll('.discuss-loading, .discuss-input-area').forEach((el) => {
            el.remove();
        });
        elements.goalDiscussConversation.classList.add('hidden');
        elements.goalDiscussResults.classList.remove('hidden');
        elements.goalDiscussFooter.classList.remove('hidden');
        
        if (goalDiscussState.currentSubtasks.length === 0) {
            elements.goalDiscussResults.innerHTML = '<div class="discuss-empty">AI未能生成有效的任务拆解</div>';
            return;
        }
        
        elements.goalDiscussResults.innerHTML = `
            <div class="discuss-results-title">💡 建议的任务拆解</div>
            <div class="discuss-subtasks">
                ${goalDiscussState.currentSubtasks.map((st, i) => `
                    <div class="discuss-subtask" data-index="${i}">
                        <div class="discuss-subtask-num">${i + 1}</div>
                        <div class="discuss-subtask-content">
                            <div class="discuss-subtask-title">${escapeHtml(st.title)}</div>
                            ${(st.date && st.start_time && st.end_time) ? `<div class="discuss-subtask-hint">🗓️ ${escapeHtml(st.date)} ${escapeHtml(st.start_time)} - ${escapeHtml(st.end_time)}</div>` : ''}
                            ${st.duration_hint ? `<div class="discuss-subtask-hint">⏱️ ${escapeHtml(st.duration_hint)}</div>` : ''}
                        </div>
                        <label class="discuss-subtask-select">
                            <input type="checkbox" data-index="${i}" checked>
                        </label>
                    </div>
                `).join('')}
            </div>
            <div class="discuss-results-actions">
                <button class="btn btn-secondary" id="discussRefineBtn">继续细化</button>
                <button class="btn btn-secondary" id="discussRescheduleBtn">🔄 重新分配时间</button>
                <button class="btn btn-primary" id="importSelectedBtn">导入到日程</button>
            </div>
        `;

        // Bind refine button - switch back to conversation to continue refining
        const refineBtn = document.getElementById('discussRefineBtn');
        if (refineBtn) {
            refineBtn.addEventListener('click', () => {
                goalDiscussState.mode = 'discuss';
                elements.goalDiscussConversation.classList.remove('hidden');
                elements.goalDiscussResults.classList.add('hidden');
                elements.goalDiscussFooter.classList.add('hidden');
                elements.goalDiscussConversation.querySelectorAll('.discuss-input-area').forEach((el) => {
                    el.remove();
                });
                // Show input with context-aware placeholder
                showDiscussInput('继续细化这些任务，或者让AI调整时间分配...');
            });
        }

        // Bind reschedule button - ask AI to reschedule from global view
        const rescheduleBtn = document.getElementById('discussRescheduleBtn');
        if (rescheduleBtn) {
            rescheduleBtn.addEventListener('click', rescheduleGoalDiscuss);
        }

        // Bind import button
        const importBtn = document.getElementById('importSelectedBtn');
        if (importBtn) {
            importBtn.addEventListener('click', () => showImportModal());
        }
    }
    
    async function rescheduleGoalDiscuss() {
        if (goalDiscussState.isRequesting) return;
        
        goalDiscussState.isRequesting = true;
        const rescheduleBtn = document.getElementById('discussRescheduleBtn');
        if (rescheduleBtn) {
            rescheduleBtn.disabled = true;
            rescheduleBtn.textContent = '🔄 重新分配中...';
        }
        
        elements.goalDiscussResults.classList.add('hidden');
        elements.goalDiscussConversation.classList.remove('hidden');
        elements.goalDiscussConversation.querySelectorAll('.discuss-loading, .discuss-input-area').forEach((el) => {
            el.remove();
        });
        
        addDiscussMessage('user', '请根据当前的任务拆解结果，从全局角度重新优化时间分配。如果有不合理的地方请调整。');
        goalDiscussState.conversationHistory.push({ role: 'user', content: '请根据当前的任务拆解结果，从全局角度重新优化时间分配。如果有不合理的地方请调整。' });
        
        showDiscussLoading();
        
        try {
            const result = await apiCall('goals/ai/reschedule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    goal_content: goalDiscussState.goalContent,
                    current_subtasks: goalDiscussState.currentSubtasks,
                    conversation_history: goalDiscussState.conversationHistory.slice(-8)
                })
            });
            
            elements.goalDiscussConversation.querySelectorAll('.discuss-loading').forEach((el) => {
                el.remove();
            });
            if (loadingTimerInterval) {
                clearInterval(loadingTimerInterval);
                loadingTimerInterval = null;
            }
            
            if (result) {
                if (result.type === 'question') {
                    addDiscussMessage('assistant', result.message);
                    goalDiscussState.conversationHistory.push({ role: 'assistant', content: result.message });
                    await persistDiscussMessage('assistant', result.message);
                    showDiscussInput();
                } else if (result.type === 'subtasks') {
                    goalDiscussState.currentSubtasks = normalizeSubtasksNoConflict(result.subtasks || []);
                    addDiscussMessage('assistant', result.message || '时间已重新分配，请查看结果。');
                    goalDiscussState.conversationHistory.push({ role: 'assistant', content: result.message || '时间已重新分配，请查看结果。' });
                    await persistDiscussMessage('assistant', result.message || '时间已重新分配');
                    showDiscussResults();
                } else if (result.type === 'message') {
                    addDiscussMessage('assistant', result.message);
                    goalDiscussState.conversationHistory.push({ role: 'assistant', content: result.message });
                    await persistDiscussMessage('assistant', result.message);
                    showDiscussInput();
                }
            } else {
                showDiscussError('重新分配失败，请稍后重试');
            }
        } catch (error) {
            if (error.name === 'AbortError' || error.message === 'The user aborted a request.') {
                elements.goalDiscussConversation.querySelectorAll('.discuss-loading').forEach((el) => {
                    el.remove();
                });
                elements.goalDiscussResults.classList.remove('hidden');
                return;
            }
            console.error('Reschedule error:', error);
            showDiscussError(error.message || '重新分配失败');
        } finally {
            goalDiscussState.isRequesting = false;
            const btn = document.getElementById('discussRescheduleBtn');
            if (btn) {
                btn.disabled = false;
                btn.textContent = '🔄 重新分配时间';
            }
        }
    }
    
    async function showImportModal() {
        const selectedSubtasks = goalDiscussState.currentSubtasks.filter((st, i) => {
            const checkbox = document.querySelector(`input[data-index="${i}"]`);
            return checkbox && checkbox.checked;
        });
        
        if (selectedSubtasks.length === 0) {
            showToast('请选择要导入的任务');
            return;
        }

        const toDateTimeLocal = (dateStr, timeStr) => {
            if (!dateStr || !timeStr) return '';
            return `${dateStr}T${timeStr}`;
        };

        const fallbackStart = new Date().toISOString().slice(0, 16);
        const fallbackEnd = new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16);
        
        const importHtml = `
            <div class="modal" id="importModal">
                <div class="modal-backdrop" id="importBackdrop"></div>
                <div class="modal-content">
                    <div class="modal-header">
                        <h2>导入到日程</h2>
                        <button class="modal-close" id="importClose">×</button>
                    </div>
                    <div class="modal-body">
                        <p class="import-tip">为选中的任务设置时间：</p>
                        <div class="import-subtasks-list">
                            ${selectedSubtasks.map((st, i) => `
                                <div class="import-task-item" data-index="${i}">
                                    <div class="import-task-title">${escapeHtml(st.title)}</div>
                                    <div class="import-task-time">
                                        <input type="datetime-local" class="import-start-time" value="${toDateTimeLocal(st.date, st.start_time) || fallbackStart}">
                                        <span>至</span>
                                        <input type="datetime-local" class="import-end-time" value="${toDateTimeLocal(st.date, st.end_time) || fallbackEnd}">
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn" id="importCancel">取消</button>
                        <button class="btn btn-primary" id="importConfirm">确认导入</button>
                    </div>
                </div>
            </div>
        `;
        
        const existingModal = document.getElementById('importModal');
        if (existingModal) existingModal.remove();
        
        document.body.insertAdjacentHTML('beforeend', importHtml);
        
        const modal = document.getElementById('importModal');
        const backdrop = document.getElementById('importBackdrop');
        const closeBtn = document.getElementById('importClose');
        const cancelBtn = document.getElementById('importCancel');
        const confirmBtn = document.getElementById('importConfirm');
        let isImporting = false;
        
        const closeModal = () => modal.remove();
        backdrop.addEventListener('click', closeModal);
        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);
        
        confirmBtn.addEventListener('click', async () => {
            if (isImporting) return;

            const parseLocal = (v) => (v ? new Date(v) : null);
            const toLocalInputValue = (d) => {
                const pad = (n) => String(n).padStart(2, '0');
                return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
            };
            const existingPending = state.events.filter(e => e.status !== 'done' && e.start_time);
            const draftItems = [];
            const draftKeys = new Set();

            for (let i = 0; i < selectedSubtasks.length; i++) {
                const item = document.querySelector(`.import-task-item[data-index="${i}"]`);
                if (!item) continue;
                const startTime = item.querySelector('.import-start-time').value;
                const endTime = item.querySelector('.import-end-time').value;
                if (!startTime) continue;

                const startDt = parseLocal(startTime);
                const endDt = parseLocal(endTime) || startDt;
                if (endDt < startDt) {
                    showToast(`任务「${selectedSubtasks[i].title}」结束时间不能早于开始时间`);
                    return;
                }

                const dedupeKey = `${selectedSubtasks[i].title}||${startTime}||${endTime || ''}`;
                if (draftKeys.has(dedupeKey)) {
                    continue;
                }
                draftKeys.add(dedupeKey);

                draftItems.push({
                    title: selectedSubtasks[i].title,
                    start_time: startTime,
                    end_time: endTime || null,
                    startDt,
                    endDt,
                });
            }

            if (draftItems.length === 0) {
                showToast('请至少设置一个开始时间');
                return;
            }

            // Conflict checks against existing pending events and within this batch
            const conflicts = [];
            for (let i = 0; i < draftItems.length; i++) {
                const cur = draftItems[i];

                for (const e of existingPending) {
                    const eStart = parseLocal(toLocalDatetime(e.start_time));
                    const eEnd = e.end_time ? parseLocal(toLocalDatetime(e.end_time)) : eStart;
                    if (!eStart || !eEnd) continue;

                    const overlap = !(eEnd <= cur.startDt || eStart >= cur.endDt);
                    if (overlap) {
                        conflicts.push(`「${cur.title}」与「${e.title}」时间冲突`);
                        break;
                    }
                }

                for (let j = i + 1; j < draftItems.length; j++) {
                    const other = draftItems[j];
                    const overlap = !(other.endDt <= cur.startDt || other.startDt >= cur.endDt);
                    if (overlap) {
                        conflicts.push(`导入项内部冲突：「${cur.title}」与「${other.title}」`);
                    }
                }
            }

            if (conflicts.length > 0) {
                const shouldAutoResolve = await showConfirm(`发现 ${conflicts.length} 个时间冲突。是否自动顺延到最近可用时段？`);
                if (!shouldAutoResolve) {
                    showToast(conflicts[0]);
                    return;
                }

                const fixedIntervals = existingPending.map((e) => {
                    const s = parseLocal(toLocalDatetime(e.start_time));
                    const t = e.end_time ? parseLocal(toLocalDatetime(e.end_time)) : s;
                    return s && t ? { start: s, end: t } : null;
                }).filter(Boolean);

                const hasOverlap = (start, end, intervals) => {
                    for (const iv of intervals) {
                        if (!(iv.end <= start || iv.start >= end)) {
                            return true;
                        }
                    }
                    return false;
                };

                for (let i = 0; i < draftItems.length; i++) {
                    const cur = draftItems[i];
                    const durationMs = Math.max(30 * 60 * 1000, cur.endDt.getTime() - cur.startDt.getTime());
                    let probeStart = new Date(cur.startDt);
                    let probeEnd = new Date(probeStart.getTime() + durationMs);
                    let attempts = 0;
                    while (hasOverlap(probeStart, probeEnd, fixedIntervals) && attempts < 24 * 7) {
                        probeStart = new Date(probeStart.getTime() + 60 * 60 * 1000);
                        probeEnd = new Date(probeStart.getTime() + durationMs);
                        attempts += 1;
                    }
                    cur.startDt = probeStart;
                    cur.endDt = probeEnd;
                    cur.start_time = toLocalInputValue(probeStart);
                    cur.end_time = toLocalInputValue(probeEnd);
                    fixedIntervals.push({ start: probeStart, end: probeEnd });

                    const row = document.querySelector(`.import-task-item[data-index="${i}"]`);
                    if (row) {
                        const sInput = row.querySelector('.import-start-time');
                        const eInput = row.querySelector('.import-end-time');
                        if (sInput) sInput.value = cur.start_time;
                        if (eInput) eInput.value = cur.end_time;
                    }
                }

                showToast('已自动顺延冲突任务，请确认时间后再导入');
                return;
            }

            isImporting = true;
            confirmBtn.disabled = true;

            try {
                let imported = 0;
                let failed = 0;
                for (const item of draftItems) {
                    const result = await createEvent({
                        title: item.title,
                        start_time: item.start_time,
                        end_time: item.end_time,
                        category_id: 'work'
                    });
                    if (result) imported++;
                    else failed++;
                }

                if (imported > 0) {
                    showToast(`已导入 ${imported} 个日程${failed ? `，失败${failed}个` : ''}`);
                    closeModal();
                    await loadData();
                    // In discuss mode (new goal), also save the goal/subtasks.
                    // In history mode, the goal already exists - just close.
                    if (goalDiscussState.mode !== 'history') {
                        await saveGoalDiscuss();
                    } else {
                        closeGoalDiscussModal();
                    }
                } else {
                    showToast('未成功导入，请检查时间冲突或网络状态');
                }
            } finally {
                isImporting = false;
                confirmBtn.disabled = false;
            }
        });
        
        requestAnimationFrame(() => {
            modal.classList.remove('hidden');
        });
    }

    async function saveGoalDiscuss() {
        if (goalDiscussState.goalId && goalDiscussState.mode === 'history') {
            if (goalDiscussState.conversationHistory.length > 0) {
                for (const msg of goalDiscussState.conversationHistory) {
                    await createGoalConversation(goalDiscussState.goalId, {
                        role: msg.role,
                        content: msg.content
                    });
                }
            }
            if (goalDiscussState.currentSubtasks.length > 0) {
                const existingGoal = state.goals.find(g => String(g.id) === String(goalDiscussState.goalId));
                if (existingGoal && existingGoal.subtasks) {
                    for (const st of existingGoal.subtasks) {
                        await deleteGoal(st.id);
                    }
                }
                for (let i = 0; i < goalDiscussState.currentSubtasks.length; i++) {
                    await createGoal({
                        title: goalDiscussState.currentSubtasks[i].title,
                        parent_id: goalDiscussState.goalId,
                        horizon: state.goalsHorizon,
                        order: i
                    });
                }
            }
            showToast('目标已更新');
            closeGoalDiscussModal();
            return;
        }

        if (!goalDiscussState.goalContent || goalDiscussState.currentSubtasks.length === 0) {
            showToast('没有可保存的内容');
            return;
        }

        try {
            let finalGoalId = goalDiscussState.goalId;
            
            if (finalGoalId) {
                await updateGoal(finalGoalId, {
                    title: goalDiscussState.goalContent
                });
            } else {
                const goalResult = await createGoal({
                    title: goalDiscussState.goalContent,
                    horizon: state.goalsHorizon
                });
                if (goalResult && goalResult.id) {
                    finalGoalId = goalResult.id;
                }
            }

            if (finalGoalId) {
                for (let i = 0; i < goalDiscussState.currentSubtasks.length; i++) {
                    const st = goalDiscussState.currentSubtasks[i];
                    await createGoal({
                        title: st.title,
                        parent_id: finalGoalId,
                        horizon: state.goalsHorizon,
                        order: i
                    });
                }

                if (goalDiscussState.conversationHistory.length > 0) {
                    for (const msg of goalDiscussState.conversationHistory) {
                        await createGoalConversation(finalGoalId, {
                            role: msg.role,
                            content: msg.content
                        });
                    }
                }
            }

            showToast('目标已保存');
            closeGoalDiscussModal();
            await renderGoalsList();
        } catch (error) {
            console.error('Save goal error:', error);
            showToast('保存失败: ' + error.message);
        }
    }

    // ============================================
    // Settings View
    // ============================================
    async function openSettingsView() {
        return await window.ScheduleAppSettings?.openSettingsView?.();
    }

    // ============================================
    // Settings Modal (Legacy - kept for reference)
    // ============================================
    async function openSettingsModal() {
        const saved = localStorage.getItem('enableDragResize');
        state.enableDragResize = saved === 'true';
        elements.enableDragResize.checked = state.enableDragResize;
        
        await fetchSettings();
        elements.enableQQReminder.checked = state.qqReminderEnabled;
        elements.defaultTaskReminderEnabled.checked = state.defaultTaskReminderEnabled;
        elements.autoAssignBudgetFromLlm.checked = state.autoAssignBudgetFromLlm;
        
        await loadUserContexts();
        await loadAiProviders();
        
        elements.appVersion.textContent = 'v' + APP_VERSION;
        
        elements.settingsModal.classList.remove('hidden');
    }

    function closeSettingsModal() {
        elements.settingsModal.classList.add('hidden');
    }

    // ============ AI Providers ============
    async function loadAiProviders() {
        try {
            const providers = await apiCall('ai-providers');
            state.aiProviders = providers || [];
            renderAiProviders(providers || []);
        } catch (e) {
            console.error('Failed to load AI providers:', e);
            state.aiProviders = [];
            renderAiProviders([]);
        }
    }

    function renderAiProviders(providers) {
        const list = elements.aiProvidersList;
        if (!providers || providers.length === 0) {
            list.innerHTML = '<div class="ai-provider-empty">暂无配置的 AI，点击下方添加</div>';
            return;
        }
        
        list.innerHTML = providers.map(p => `
            <div class="ai-provider-item ${p.is_active ? 'active' : ''}" data-id="${p.id}">
                <div class="ai-provider-info">
                    <span class="ai-provider-name">${escapeHtml(p.name)}${p.is_active ? ' ✓' : ''}</span>
                    <span class="ai-provider-model">${escapeHtml(p.model)} · ${escapeHtml(p.api_base)}</span>
                </div>
                <div class="ai-provider-actions">
                    <button class="ai-provider-activate-btn" ${p.is_active ? 'disabled' : ''} onclick="ScheduleApp.activateAiProvider(${p.id})">
                        ${p.is_active ? '使用中' : '使用'}
                    </button>
                    <button class="ai-provider-edit-btn" onclick="ScheduleApp.editAiProvider(${p.id})">编辑</button>
                    <button class="ai-provider-delete-btn" onclick="ScheduleApp.deleteAiProvider(${p.id})">删除</button>
                </div>
            </div>
        `).join('');
    }

    function openAiProviderModal(id = null) {
        const provider = id ? (state.aiProviders || []).find((p) => p.id === id) : null;
        elements.aiProviderId.value = id || '';
        elements.aiProviderModalTitle.textContent = id ? '编辑 AI 提供商' : '添加 AI 提供商';
        elements.aiProviderName.value = provider?.name || '';
        elements.aiProviderApiBase.value = provider?.api_base || '';
        elements.aiProviderModel.value = provider?.model || '';
        // 编辑默认不展示明文密钥，仅显示掩码提示；留空表示保持原值
        elements.aiProviderApiKey.value = '';
        elements.aiProviderApiKey.placeholder = provider?.has_api_key ? (provider.api_key || 'sk-****') : '请输入 API Key';
        elements.aiProviderModal.classList.remove('hidden');
    }

    function closeAiProviderModal() {
        elements.aiProviderModal.classList.add('hidden');
    }

    async function saveAiProvider() {
        const id = elements.aiProviderId.value;
        const name = elements.aiProviderName.value.trim();
        const apiBase = elements.aiProviderApiBase.value.trim();
        const model = elements.aiProviderModel.value.trim();
        const apiKey = elements.aiProviderApiKey.value.trim();
        
        if (!name || !apiBase || !model) {
            showToast('请填写完整信息');
            return;
        }
        
        try {
            let result;
            if (id) {
                result = await apiCall(`ai-providers/${id}`, 'PUT', { name, api_base: apiBase, model, api_key: apiKey });
            } else {
                if (!apiKey) {
                    showToast('请填写 API Key');
                    return;
                }
                result = await apiCall('ai-providers', 'POST', { name, api_base: apiBase, model, api_key: apiKey });
            }
            
            if (result && !result.error) {
                showToast(id ? 'AI配置已更新' : 'AI配置已添加');
                closeAiProviderModal();
                await loadAiProviders();
            } else {
                showToast(result?.message || '保存失败');
            }
        } catch (e) {
            showToast('保存失败');
            console.error(e);
        }
    }

    async function activateAiProvider(id) {
        try {
            const result = await apiCall(`ai-providers/${id}/activate`, 'PUT');
            if (result && !result.error) {
                showToast('已切换到该AI');
                await loadAiProviders();
            } else {
                showToast('切换失败');
            }
        } catch (e) {
            showToast('切换失败');
            console.error(e);
        }
    }

    async function deleteAiProvider(id) {
        const confirmed = await showConfirm('确定删除该AI配置？');
        if (!confirmed) return;
        
        try {
            const result = await apiCall(`ai-providers/${id}`, 'DELETE');
            if (result && !result.error) {
                showToast('AI配置已删除');
                await loadAiProviders();
            } else {
                showToast('删除失败');
            }
        } catch (e) {
            showToast('删除失败');
            console.error(e);
        }
    }

    // ============ User Contexts (我的现状) ============
    async function loadUserContexts() {
        return await window.ScheduleAppSettings?.loadUserContexts?.();
    }

    function renderUserContexts() {
        const list = elements.userContextList;
        if (!state.userContexts || state.userContexts.length === 0) {
            list.innerHTML = '<div class="user-context-empty">暂无现状描述<br>点击上方"添加"新增</div>';
            return;
        }
        
        list.innerHTML = state.userContexts.map(ctx => `
            <div class="user-context-item ${ctx.id === state.selectedUserContextId ? 'selected' : ''}" data-id="${ctx.id}">
                <div class="user-context-item-content">${escapeHtml(ctx.content)}</div>
            </div>
        `).join('');
        
        list.querySelectorAll('.user-context-item').forEach(item => {
            item.addEventListener('click', () => {
                const id = parseInt(item.dataset.id);
                selectUserContext(id);
            });
        });
    }

    function selectUserContext(id) {
        state.selectedUserContextId = id;
        const context = state.userContexts.find(c => c.id === id);
        
        if (context) {
            elements.userContextEditTitle.textContent = '编辑现状';
            elements.userContextContent.value = context.content;
            elements.userContextDeleteBtn.classList.remove('hidden');
        }
        
        renderUserContexts();
    }

    async function openUserContextModal() {
        state.selectedUserContextId = null;
        elements.userContextEditTitle.textContent = '添加新现状';
        elements.userContextContent.value = '';
        elements.userContextDeleteBtn.classList.add('hidden');
        if (!state.userContexts || state.userContexts.length === 0) {
            await loadUserContexts();
        }
        renderUserContexts();
        elements.userContextModal.classList.remove('hidden');
    }

    function closeUserContextModal() {
        elements.userContextModal.classList.add('hidden');
    }

    async function saveUserContext() {
        return await window.ScheduleAppSettings?.saveUserContext?.();
    }

    async function deleteUserContext() {
        if (!state.selectedUserContextId) return;
        
        const confirmed = await showConfirm('确定删除该现状？');
        if (!confirmed) return;
        
        try {
            const result = await apiCall(`user-contexts/${state.selectedUserContextId}`, 'DELETE');
            if (result && !result.error) {
                showToast('现状已删除');
                state.selectedUserContextId = null;
                elements.userContextEditTitle.textContent = '添加新现状';
                elements.userContextContent.value = '';
                elements.userContextDeleteBtn.classList.add('hidden');
                await loadUserContexts();
                await updateSelfDescriptionForLlm();
            } else {
                showToast('删除失败');
            }
        } catch (e) {
            showToast('删除失败');
            console.error(e);
        }
    }

    async function updateSelfDescriptionForLlm() {
        const allContent = state.userContexts.map(c => c.content).filter(Boolean).join('\n');
        state.userSelfDescription = allContent;
        await updateSetting('self_description', allContent);
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Make functions globally accessible for inline onclick
    window.ScheduleApp = {
        ...(window.ScheduleApp || {}),
        activateAiProvider,
        editAiProvider: openAiProviderModal,
        deleteAiProvider,
    };

    async function handleQQReminderToggle(e) {
        const enabled = e.target.checked;
        state.qqReminderEnabled = enabled;
        
        // Save to API
        const result = await updateSetting('qq_reminder_enabled', enabled ? 'true' : 'false');
        if (result) {
            showToast(enabled ? 'QQ提醒已开启' : 'QQ提醒已关闭');
        } else {
            // Revert on failure
            e.target.checked = !enabled;
            state.qqReminderEnabled = !enabled;
        }
    }

    function handleDragResizeToggle(e) {
        state.enableDragResize = e.target.checked;
        localStorage.setItem('enableDragResize', state.enableDragResize);
        // Re-render timeline to show/hide resize handles
        if (state.currentView === 'day') {
            renderTimeline();
        }
    }

    async function handleDefaultTaskReminderToggle(e) {
        const enabled = e.target.checked;
        state.defaultTaskReminderEnabled = enabled;

        const result = await updateSetting('default_task_reminder_enabled', enabled ? 'true' : 'false');
        if (result) {
            showToast(enabled ? '新任务默认提醒已开启' : '新任务默认提醒已关闭');
        } else {
            e.target.checked = !enabled;
            state.defaultTaskReminderEnabled = !enabled;
        }
    }

    async function handleAutoAssignBudgetToggle(e) {
        const enabled = e.target.checked;
        state.autoAssignBudgetFromLlm = enabled;
        
        const result = await updateSetting('auto_assign_budget_from_llm', enabled ? 'true' : 'false');
        if (result) {
            showToast(enabled ? 'AI记账将自动加入相关预算' : 'AI记账不会自动加入预算');
        } else {
            e.target.checked = !enabled;
            state.autoAssignBudgetFromLlm = !enabled;
        }
    }

    async function handleCleanupTestEntries() {
        const confirmed = await showConfirm('确定一键清理测试条目吗？\n将删除包含“测试/test/demo/debug/样例/示例/tmp/临时”等关键词的日程、笔记和记账条目。');
        if (!confirmed) return;

        const result = await cleanupTestEntries();
        if (!result) {
            showToast('清理失败，请稍后重试');
            return;
        }

        const eventsDeleted = Number(result.events_deleted || 0);
        const notesDeleted = Number(result.notes_deleted || 0);
        const expensesDeleted = Number(result.expenses_deleted || 0);
        const totalDeleted = eventsDeleted + notesDeleted + expensesDeleted;

        showToast(`已清理 ${totalDeleted} 条（日程${eventsDeleted} / 笔记${notesDeleted} / 记账${expensesDeleted}）`);

        await loadData();
        if (state.currentView === 'notepad') {
            await renderNotepadView();
        }
    }

    function showSemanticHelpModal() {
        const existing = document.getElementById('semanticHelpModal');
        if (existing) existing.remove();

        const helpHtml = `
            <div class="modal" id="semanticHelpModal">
                <div class="modal-backdrop" id="semanticHelpBackdrop"></div>
                <div class="modal-content">
                    <div class="modal-header">
                        <h2>统一语义解析说明</h2>
                        <button class="modal-close" id="semanticHelpClose">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="settings-item-desc" style="line-height:1.7; color:var(--text-primary)">
                            当前支持你在顶部自然语言输入框里，直接用一句话执行日程/待办操作：
                        </div>
                        <ul style="margin:10px 0 0 18px; padding:0; line-height:1.8; color:var(--text-primary)">
                            <li><strong>创建任务</strong>：如“明天下午3点开组会”</li>
                            <li><strong>删除任务</strong>：如“删除所有4月5号的代办”</li>
                            <li><strong>完成任务</strong>：如“完成所有代办”</li>
                            <li><strong>撤销完成</strong>：如“把今天完成的都改回待办”</li>
                            <li><strong>批量多操作</strong>：一条输入可解析为多个顺序操作</li>
                            <li><strong>安全确认</strong>：删除/批量状态变更会先弹窗确认</li>
                            <li><strong>时间语义</strong>：
                                “4月17号前”按 4/17 23:59 处理；
                                “4月17号之前/以前”按 4/16 23:59 处理；
                                没有明确时间可保留为无明确时间
                            </li>
                        </ul>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-primary" id="semanticHelpOk">我知道了</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', helpHtml);

        const modal = document.getElementById('semanticHelpModal');
        const backdrop = document.getElementById('semanticHelpBackdrop');
        const closeBtn = document.getElementById('semanticHelpClose');
        const okBtn = document.getElementById('semanticHelpOk');

        const closeModal = () => modal?.remove();
        backdrop?.addEventListener('click', closeModal);
        closeBtn?.addEventListener('click', closeModal);
        okBtn?.addEventListener('click', closeModal);

        requestAnimationFrame(() => {
            modal?.classList.remove('hidden');
        });
    }

    async function analyzeBreakdown() {
        const text = elements.breakdownInput.value.trim();
        if (!text) {
            showToast('请输入任务描述');
            return;
        }

        elements.breakdownAnalyzeBtn.disabled = true;
        elements.breakdownAnalyzeBtn.textContent = '🤖 拆解中...';
        elements.breakdownResults.innerHTML = '<div class="breakdown-empty">🤖 思考中...</div>';

        try {
            const result = await apiCall('llm/breakdown', {
                method: 'POST',
                body: JSON.stringify({ 
                    text: text,
                    horizon: state.breakdownHorizon || 'short',
                    self_description: state.userSelfDescription || ''
                })
            });

            if (result && result.subtasks) {
                state.breakdownItems = result.subtasks.map((item, idx) => ({
                    id: idx + 1,
                    title: item.title || item.name || '',
                    date: item.date || elements.breakdownDate.value || '',
                    startTime: item.start_time || item.startTime || '',
                    duration: item.duration_minutes || item.duration || 30,
                    category_id: item.category_id || 'work'
                }));
                renderBreakdownResults();
            } else {
                elements.breakdownResults.innerHTML = '<div class="breakdown-empty">拆解失败，请重试</div>';
            }
        } catch (error) {
            console.error('Breakdown error:', error);
            elements.breakdownResults.innerHTML = '<div class="breakdown-empty">拆解失败</div>';
        } finally {
            elements.breakdownAnalyzeBtn.disabled = false;
            elements.breakdownAnalyzeBtn.textContent = '🤖 AI拆解';
        }
    }

    function renderBreakdownResults() {
        if (state.breakdownItems.length === 0) {
            elements.breakdownResults.innerHTML = '<div class="breakdown-empty">输入任务描述，点击"AI拆解"按钮分解任务</div>';
            return;
        }

        const html = state.breakdownItems.map((item, idx) => `
            <div class="breakdown-item" data-idx="${idx}">
                <div class="breakdown-item-title">
                    <input type="text" value="${escapeHtml(item.title)}" 
                        onchange="updateBreakdownItem(${idx}, 'title', this.value)">
                </div>
                <div class="breakdown-item-time">
                    <input type="date" value="${item.date || ''}" 
                        onchange="updateBreakdownItem(${idx}, 'date', this.value)"
                        class="breakdown-date-input">
                    <input type="time" value="${item.startTime || ''}" 
                        onchange="updateBreakdownItem(${idx}, 'startTime', this.value)"
                        class="breakdown-time-input">
                    <span>时长:</span>
                    <input type="number" value="${item.duration || 30}" min="5" max="480"
                        onchange="updateBreakdownItem(${idx}, 'duration', parseInt(this.value))">
                    <span>分钟</span>
                    <button class="breakdown-remove-btn" data-idx="${idx}" style="margin-left:auto;color:var(--accent-danger)">✕</button>
                </div>
            </div>
        `).join('');

        elements.breakdownResults.innerHTML = html;
        
        // Add click handlers for remove buttons using event delegation
        elements.breakdownResults.addEventListener('click', (e) => {
            const btn = e.target.closest('.breakdown-remove-btn');
            if (!btn) return;
            
            const idx = parseInt(btn.dataset.idx);
            if (isNaN(idx)) return;
            
            removeBreakdownItem(idx);
        });
    }

    function removeBreakdownItem(idx) {
        state.breakdownItems.splice(idx, 1);
        renderBreakdownResults();
    }

    function addBreakdownItem() {
        state.breakdownItems.push({
            id: state.breakdownItems.length + 1,
            title: '',
            date: elements.breakdownDate.value || new Date().toISOString().split('T')[0],
            startTime: '',
            duration: 30,
            category_id: 'work'
        });
        renderBreakdownResults();
    }

    // Global function for inline onchange handlers
    window.updateBreakdownItem = function(idx, field, value) {
        state.breakdownItems[idx][field] = value;
    };

    function loadSavedBreakdowns() {
        const saved = JSON.parse(localStorage.getItem('breakdowns') || '{}');
        const keys = Object.keys(saved);
        
        // Filter by current horizon
        const currentHorizon = state.breakdownHorizon || 'short';
        const filteredKeys = keys.filter(k => saved[k].horizon === currentHorizon);
        
        if (filteredKeys.length === 0) {
            showToast('没有保存的拆解');
            return;
        }
        
        // Show most recent first
        filteredKeys.sort((a, b) => new Date(saved[b].savedAt) - new Date(saved[a].savedAt));
        
        // Render the list
        if (filteredKeys.length === 0) {
            elements.savedBreakdownsList.innerHTML = '<div class="empty-state"><div class="empty-text">没有保存的拆解</div></div>';
        } else {
            elements.savedBreakdownsList.innerHTML = filteredKeys.map((k, i) => `
                <div class="saved-breakdown-item" data-key="${k}">
                    <div class="saved-breakdown-info">
                        <div class="saved-breakdown-text">${escapeHtml(saved[k].text.substring(0, 50))}${saved[k].text.length > 50 ? '...' : ''}</div>
                        <div class="saved-breakdown-meta">${saved[k].items.length}项 · ${new Date(saved[k].savedAt).toLocaleDateString()}</div>
                    </div>
                    <button class="btn btn-secondary saved-breakdown-load-btn">加载</button>
                </div>
            `).join('');
            
            // Add click handlers
            elements.savedBreakdownsList.querySelectorAll('.saved-breakdown-load-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const key = e.target.closest('.saved-breakdown-item').dataset.key;
                    const selected = saved[key];
                    state.breakdownId = key;
                    elements.breakdownInput.value = selected.text;
                    state.breakdownItems = [...selected.items];
                    state.breakdownHorizon = selected.horizon || 'short';
                    if (elements.breakdownHorizon) elements.breakdownHorizon.value = state.breakdownHorizon;
                    renderBreakdownResults();
                    closeSavedBreakdownsModal();
                    showToast(`已加载: ${selected.items.length}项`);
                });
            });
        }
        
        elements.savedBreakdownsModal.classList.remove('hidden');
    }

    function closeSavedBreakdownsModal() {
        elements.savedBreakdownsModal.classList.add('hidden');
    }

    function saveBreakdowns() {
        if (state.breakdownItems.length === 0) {
            showToast('没有保存的内容');
            return;
        }

        // Save to localStorage
        const saved = JSON.parse(localStorage.getItem('breakdowns') || '{}');
        saved[state.breakdownId] = {
            id: state.breakdownId,
            text: elements.breakdownInput.value,
            items: state.breakdownItems,
            horizon: state.breakdownHorizon || 'short',
            savedAt: new Date().toISOString()
        };
        localStorage.setItem('breakdowns', JSON.stringify(saved));
        showToast('已保存');
        closeBreakdownModal();
    }

    async function importBreakdowns() {
        if (state.breakdownItems.length === 0) {
            showToast('没有导入的内容');
            return;
        }

        console.log('Importing breakdown items:', state.breakdownItems);
        
        const globalDate = elements.breakdownDate.value;
        let imported = 0;
        let failed = 0;

        for (const item of state.breakdownItems) {
            if (!item.title || !item.startTime) {
                console.log('Skipping item missing title or startTime:', item);
                failed++;
                continue;
            }

            // Use per-item date if available, otherwise use global date
            const dateValue = item.date || globalDate;
            if (!dateValue) {
                console.log('Skipping item missing date:', item);
                failed++;
                continue;
            }
            
            const [year, month, day] = dateValue.split('-').map(Number);
            const [hours, minutes] = item.startTime.split(':').map(Number);
            const startTime = new Date(year, month - 1, day, hours, minutes, 0, 0);

            const endTime = new Date(startTime.getTime() + (item.duration || 30) * 60 * 1000);

            const eventData = {
                title: item.title,
                start_time: startTime.toISOString(),
                end_time: endTime.toISOString(),
                category_id: item.category_id || 'work',
                all_day: false,
                recurrence: 'none'
            };

            console.log('Creating event:', eventData);
            
            try {
                const result = await apiCall('events', {
                    method: 'POST',
                    body: JSON.stringify(eventData)
                });
                console.log('Event created result:', result);
                
                if (result) {
                    imported++;
                } else {
                    failed++;
                }
            } catch (error) {
                console.error('Failed to create event:', error);
                failed++;
            }
        }

        if (imported > 0) {
            showToast(`导入了${imported}个日程`);
            closeBreakdownModal();
            await loadData();
        } else {
            showToast(failed > 0 ? '导入失败，请检查数据' : '没有可导入的日程');
        }
    }

    // ============================================
    // LLM Input Handling
    // ============================================
    function updateLlmQueueIndicator() {
        const waitingCount = state.llmQueue.length;
        const isRunning = state.llmQueueRunning;

        elements.llmBtn.classList.toggle('processing', isRunning);
        elements.llmBtn.disabled = false;

        if (waitingCount > 0) {
            elements.llmBtn.classList.add('has-queue');
            elements.llmBtn.setAttribute('data-queue-count', String(waitingCount));
        } else {
            elements.llmBtn.classList.remove('has-queue');
            elements.llmBtn.removeAttribute('data-queue-count');
        }
    }

    function updateLlmQueueStatusBar() {
        if (!elements.llmQueueStatus || !elements.llmQueueText || !elements.llmQueueMeta || !elements.llmQueueProgressBar) {
            return;
        }

        const hasActive = !!state.llmActiveRequest;
        const waiting = state.llmQueue.length;
        const inFlight = hasActive || waiting > 0;

        clearTimeout(state.llmStatusHideTimer);
        state.llmStatusHideTimer = null;

        if (!inFlight && !state.llmLastStatusText) {
            elements.llmQueueStatus.classList.add('hidden');
            return;
        }

        elements.llmQueueStatus.classList.remove('hidden');

        // 更新详情区域：显示当前处理的完整文本和队列中的项目
        if (elements.llmQueueDetail) {
            let detailHtml = '';
            
            // 当前正在处理的项目
            if (hasActive && state.llmActiveRequest) {
                detailHtml += `<div class="llm-queue-item llm-queue-item-active">
                    <span class="llm-queue-item-label">处理中</span>
                    <span class="llm-queue-item-text">${escapeHtml(state.llmActiveRequest.text)}</span>
                </div>`;
            }
            
            // 队列中等待的项目
            if (waiting > 0) {
                state.llmQueue.forEach((item, idx) => {
                    detailHtml += `<div class="llm-queue-item">
                        <span class="llm-queue-item-label">排队${idx + 1}</span>
                        <span class="llm-queue-item-text">${escapeHtml(item.text)}</span>
                    </div>`;
                });
            }
            
            elements.llmQueueDetail.innerHTML = detailHtml;
        }

        if (hasActive) {
            const current = state.llmCycleDone + 1;
            const total = Math.max(state.llmCycleTotal, current);
            elements.llmQueueText.textContent = `AI处理中 ${current}/${total}`;
            elements.llmQueueMeta.textContent = waiting > 0 ? `排队 ${waiting} 项` : '进行中';

            const progress = Math.max(4, Math.min(96, ((state.llmCycleDone + 0.5) / Math.max(1, total)) * 100));
            elements.llmQueueProgressBar.style.width = `${progress}%`;
            if (elements.llmQueueCancelBtn) elements.llmQueueCancelBtn.classList.remove('hidden');
            return;
        }

        elements.llmQueueText.textContent = state.llmLastStatusText;
        elements.llmQueueMeta.textContent = '完成';
        elements.llmQueueProgressBar.style.width = '100%';
        if (elements.llmQueueCancelBtn) elements.llmQueueCancelBtn.classList.add('hidden');

        state.llmStatusHideTimer = setTimeout(() => {
            state.llmLastStatusText = '';
            elements.llmQueueStatus.classList.add('hidden');
            elements.llmQueueProgressBar.style.width = '0%';
        }, 3500);
    }

    function cancelLlmGeneration(clearQueued = true) {
        state.llmCancelRequested = true;
        if (clearQueued) {
            state.llmQueue = [];
        }
        if (state.llmAbortController) {
            try {
                state.llmAbortController.abort();
            } catch (_) {
                // no-op
            }
        }
        state.llmLastStatusText = clearQueued ? '已取消当前生成并清空排队' : '已取消当前生成';
        updateLlmQueueIndicator();
        updateLlmQueueStatusBar();
        showToast('已取消AI生成');
    }

    function enqueueLlmRequest(text) {
        const normalizedText = String(text || '').trim();
        if (!normalizedText) return;

        const isNewCycle = !state.llmQueueRunning && !state.llmActiveRequest && state.llmQueue.length === 0;
        if (isNewCycle) {
            state.llmCycleTotal = 0;
            state.llmCycleDone = 0;
            state.llmCycleSucceeded = 0;
            state.llmCycleFailed = 0;
            state.llmLastStatusText = '';
            state.llmCancelRequested = false;
        }

        state.llmQueue.push({
            id: `llm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            text: normalizedText
        });
        state.llmCycleTotal += 1;

        updateLlmQueueIndicator();
        updateLlmQueueStatusBar();

        const waiting = state.llmQueue.length;
        if (state.llmQueueRunning) {
            showToast(`已加入队列（前方${Math.max(0, waiting - 1)}条）`);
        }

        void processLlmQueue();
    }

    async function processSingleLlmRequest(request) {
        const text = request.text;
        state.llmAbortController = new AbortController();

        // Unified path: supports create/delete/complete/uncomplete and multi-ops.
        const preview = await executeUnifiedLlmCommand(text, true, state.llmAbortController.signal);
        if (state.llmCancelRequested) {
            return false;
        }
        if (!preview) {
            throw new Error('AI解析失败');
        }

        const operations = Array.isArray(preview.operations) ? preview.operations : [];
        if (operations.length === 0) {
            throw new Error('未解析到可执行操作');
        }

        // For destructive or bulk updates, require confirmation after preview.
        const hasMutatingBatch = operations.some((op) => op.action !== 'create');
        if (hasMutatingBatch) {
            const summary = preview.summary || operations.map((op) => {
                if (op.action === 'create') return `创建 ${op.title || '日程'}`;
                if (op.scope === 'date') return `${op.action} ${op.date || ''}`;
                return `${op.action} 全部`;
            }).join('；');
            const confirmed = await showConfirm(`将执行以下操作：\n${summary}\n\n确认执行吗？`);
            if (!confirmed) {
                showToast('已取消该条AI操作');
                return false;
            }
        }

        const result = await executeUnifiedLlmCommand(text, false, state.llmAbortController.signal);
        if (state.llmCancelRequested) {
            return false;
        }
        if (!result) {
            throw new Error('执行失败');
        }

        const stats = result.stats || {};
        const created = Number(stats.created || 0);
        const deleted = Number(stats.deleted || 0);
        const completed = Number(stats.completed || 0);
        const uncompleted = Number(stats.uncompleted || 0);

        if (deleted > 0 || completed > 0 || uncompleted > 0) {
            const parts = [];
            if (created > 0) parts.push(`创建${created}`);
            if (deleted > 0) parts.push(`删除${deleted}`);
            if (completed > 0) parts.push(`完成${completed}`);
            if (uncompleted > 0) parts.push(`撤销完成${uncompleted}`);
            showToast(`✅ 已执行：${parts.join(' / ')}`);
        } else {
            if (created > 1) showToast(`✅ ${created}个日程已创建`);
            else if (created === 1) showToast('✅ 日程已创建');
            else showToast('✅ 已执行');
        }

        await loadData();
        return true;
    }

    async function processLlmQueue() {
        if (state.llmQueueRunning) return;

        state.llmQueueRunning = true;
        updateLlmQueueIndicator();
        updateLlmQueueStatusBar();

        while (state.llmQueue.length > 0) {
            if (state.llmCancelRequested) {
                break;
            }
            const request = state.llmQueue.shift();
            if (!request) continue;

            state.llmActiveRequest = request;
            updateLlmQueueIndicator();
            updateLlmQueueStatusBar();

            try {
                const success = await processSingleLlmRequest(request);
                if (success) {
                    state.llmCycleSucceeded += 1;
                } else {
                    state.llmCycleFailed += 1;
                }
            } catch (error) {
                if (state.llmCancelRequested) {
                    // user canceled in-flight request
                    state.llmCycleFailed += 0;
                } else {
                console.error('LLM Error:', error);
                showToast(`❌ 执行失败: ${error.message || '未知错误'}`);
                state.llmCycleFailed += 1;
                }
            } finally {
                state.llmCycleDone += 1;
                state.llmActiveRequest = null;
                state.llmAbortController = null;
                updateLlmQueueIndicator();
                updateLlmQueueStatusBar();
            }
        }

        state.llmQueueRunning = false;
        if (!state.llmLastStatusText) {
            state.llmLastStatusText = `本轮完成：成功${state.llmCycleSucceeded}，失败${state.llmCycleFailed}`;
        }
        updateLlmQueueIndicator();
        updateLlmQueueStatusBar();
        state.llmCancelRequested = false;
    }

    async function handleLlmSubmit(e) {
        if (e && e.preventDefault) {
            e.preventDefault();
        }
        
        const text = elements.llmInput.value.trim();
        if (!text) {
            showToast('请输入日程内容');
            return;
        }

        // 保存提交的文本，便于用户复制和编辑
        state.llmLastSubmittedText = text;
        
        enqueueLlmRequest(text);
        // 清空输入框
        elements.llmInput.value = '';
        elements.llmInput.focus();
    }

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
        // Refresh button
        elements.refreshBtn.addEventListener('click', () => {
            elements.refreshBtn.classList.add('rotating');
            loadData().then(() => {
                elements.refreshBtn.classList.remove('rotating');
            });
        });
        
        // LLM input
        elements.llmBtn.addEventListener('click', handleLlmSubmit);
        elements.llmInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleLlmSubmit();
            }
        });
        if (elements.llmQueueCancelBtn) {
            elements.llmQueueCancelBtn.addEventListener('click', () => cancelLlmGeneration(true));
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
        
        // Breakdown modal events
        elements.breakdownBackdrop.addEventListener('click', closeBreakdownModal);
        elements.breakdownClose.addEventListener('click', closeBreakdownModal);
        elements.breakdownAnalyzeBtn.addEventListener('click', analyzeBreakdown);
        elements.breakdownSaveBtn.addEventListener('click', saveBreakdowns);
        elements.breakdownImportBtn.addEventListener('click', importBreakdowns);
        elements.breakdownLoadBtn.addEventListener('click', loadSavedBreakdowns);
        elements.breakdownAddBtn.addEventListener('click', addBreakdownItem);
        
        // Saved breakdowns modal events
        elements.savedBreakdownsBackdrop.addEventListener('click', closeSavedBreakdownsModal);
        elements.savedBreakdownsClose.addEventListener('click', closeSavedBreakdownsModal);
        
        // Goal discuss modal events
        elements.goalDiscussBackdrop.addEventListener('click', closeGoalDiscussModal);
        elements.goalDiscussClose.addEventListener('click', closeGoalDiscussModal);
        elements.goalDiscussStartBtn.addEventListener('click', startGoalDiscuss);
        elements.goalDiscussInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                startGoalDiscuss();
            }
        });
        elements.goalDiscussCancelBtn.addEventListener('click', closeGoalDiscussModal);
        elements.goalDiscussSaveBtn.addEventListener('click', saveGoalDiscuss);
        
        // Settings view events
        elements.settingsBtn.addEventListener('click', () => {
            window.location.hash = '/settings';
        });
        elements.settingsBackBtn?.addEventListener('click', () => {
            window.history.back();
        });
        elements.enableDragResize.addEventListener('change', handleDragResizeToggle);
        elements.enableQQReminder.addEventListener('change', handleQQReminderToggle);
        elements.defaultTaskReminderEnabled.addEventListener('change', handleDefaultTaskReminderToggle);
        elements.autoAssignBudgetFromLlm.addEventListener('change', handleAutoAssignBudgetToggle);
        document.getElementById('cleanupTestEntriesBtn')?.addEventListener('click', handleCleanupTestEntries);
        document.getElementById('semanticHelpBtn')?.addEventListener('click', showSemanticHelpModal);
        elements.openUserContextBtn?.addEventListener('click', () => {
            openUserContextModal();
        });
        
        // AI Provider modal events
        elements.addAiProviderBtn?.addEventListener('click', () => openAiProviderModal());
        elements.aiProviderBackdrop?.addEventListener('click', closeAiProviderModal);
        elements.aiProviderClose?.addEventListener('click', closeAiProviderModal);
        elements.aiProviderCancelBtn?.addEventListener('click', closeAiProviderModal);
        elements.aiProviderSaveBtn?.addEventListener('click', saveAiProvider);
        
        // User Context modal events
        elements.userContextAddBtn?.addEventListener('click', openUserContextModal);
        elements.userContextBackdrop?.addEventListener('click', closeUserContextModal);
        elements.userContextClose?.addEventListener('click', closeUserContextModal);
        elements.userContextCancelBtn?.addEventListener('click', closeUserContextModal);
        elements.userContextSaveBtn?.addEventListener('click', saveUserContext);
        elements.userContextDeleteBtn?.addEventListener('click', deleteUserContext);
        
        // Budget modal events
        elements.budgetBackdrop?.addEventListener('click', closeBudgetModal);
        elements.budgetClose?.addEventListener('click', closeBudgetModal);
        elements.budgetCancelBtn?.addEventListener('click', closeBudgetModal);
        elements.budgetSaveBtn?.addEventListener('click', handleBudgetSave);
        
        // Budget period buttons
        elements.budgetPeriodGroup?.querySelectorAll('.period-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                selectedBudgetPeriod = btn.dataset.period;
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
        elements.tabDay.addEventListener('click', () => switchView('day'));
        elements.tabTodo.addEventListener('click', () => switchView('todo'));
        elements.tabGoals.addEventListener('click', () => switchView('goals'));
        elements.tabNotepad.addEventListener('click', () => switchView('notepad'));

        // Calendar segmented control (in day view)
        document.getElementById('calendarSegmented')?.addEventListener('click', async (e) => {
            const seg = e.target.closest('.cal-segment');
            if (!seg) return;
            state.calendarSubview = seg.dataset.subview;
            // Update active states
            document.querySelectorAll('.cal-segment').forEach(s => {
                s.classList.toggle('active', s.dataset.subview === state.calendarSubview);
            });
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
        elements.saveDetailBtn.addEventListener('click', saveDetailReminder);
        
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
        window.addEventListener('error', (event) => {
            const msg = event?.error?.message || event?.message || 'Unknown Error';
            console.error('[GlobalError]', event.error || event);
            showToast(`页面错误: ${msg}`);
            showFatalDebugBanner(msg);
        });

        window.addEventListener('unhandledrejection', (event) => {
            const reason = event?.reason;
            const msg = typeof reason === 'string' ? reason : (reason?.message || 'Unhandled Promise Rejection');
            console.error('[UnhandledRejection]', reason);
            showToast(`异步错误: ${msg}`);
            showFatalDebugBanner(msg);
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
        initAIChatPanel();
        
        // Listen for hash changes
        window.addEventListener('hashchange', handleHashRoute);
        
        await loadData();
        
        // Check if there's a hash route
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
        
        // Expose to window for external tools (Playwright, etc.)
        window.switchView = switchView;
        window.scheduleAppState = state;
        
        // Expose budget functions for module system
        window.ScheduleAppBudget = {
            bindBudgetEvents,
            showAllBudgetsList,
            showBudgetExpenses,
            openExpenseModalForBudget,
            openBudgetModal,
            updatePeriodButtons,
            closeBudgetModal,
            handleBudgetSave,
            openExpenseModal,
            renderExpenseBudgetSelector,
            closeExpenseModal,
            renderExpenseCategorySelector,
            handleExpenseSave,
            get selectedExpenseBudgetId() { return selectedExpenseBudgetId; },
            set selectedExpenseBudgetId(v) { selectedExpenseBudgetId = v; },
        };
        
        console.log('Schedule App ready!');
    }

    // Apply module overrides - use functions from budget.js
    const {
        bindBudgetEvents,
        showAllBudgetsList,
        showBudgetExpenses,
        openBudgetModal,
        updatePeriodButtons,
        closeBudgetModal,
        handleBudgetSave,
        openExpenseModal,
        renderExpenseBudgetSelector,
        closeExpenseModal,
        renderExpenseCategorySelector,
        handleExpenseSave,
        openExpenseModalForBudget,
    } = window.ScheduleAppBudget || {};

    // Start the app
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
