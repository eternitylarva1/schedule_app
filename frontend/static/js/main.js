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


    async function markEventDoneQuick(eventId) {
        const result = await completeEvent(eventId);
        if (!result) return;
        showToast('已完成 ✓');
        await loadData();
        if (state.currentView === 'todo') await renderTodoView();
        else if (state.currentView === 'goals') await renderGoalsView();
    }

    function getSelectionSet(type) {
        return type === 'goals' ? state.selectionMode.goalIds : state.selectionMode.todoIds;
    }

    function exitSelectionMode() {
        state.selectionMode.active = false;
        state.selectionMode.type = null;
        state.selectionMode.todoIds.clear();
        state.selectionMode.goalIds.clear();
        const bar = document.getElementById('selectionBar');
        if (bar) bar.classList.add('hidden');
    }

    function enterSelectionMode(type, seedId = null) {
        state.selectionMode.active = true;
        state.selectionMode.type = type;
        if (type === 'todo') state.selectionMode.goalIds.clear();
        if (type === 'goals') state.selectionMode.todoIds.clear();
        const set = getSelectionSet(type);
        if (seedId !== null && seedId !== undefined) set.add(String(seedId));
        renderSelectionBar(type);
    }

    function toggleSelection(type, id) {
        const set = getSelectionSet(type);
        const key = String(id);
        if (set.has(key)) set.delete(key);
        else set.add(key);
        renderSelectionBar(type);
    }

    function ensureSelectionBar() {
        let bar = document.getElementById('selectionBar');
        if (bar) return bar;
        bar = document.createElement('div');
        bar.id = 'selectionBar';
        bar.className = 'selection-bar hidden';
        bar.innerHTML = `
            <div class="selection-count" id="selectionCount">已选择 0 项</div>
            <div class="selection-actions">
                <button class="btn btn-secondary" id="selectionSelectAll">全选</button>
                <button class="btn btn-secondary" id="selectionComplete">完成</button>
                <button class="btn btn-danger" id="selectionDelete">删除</button>
                <button class="btn" id="selectionExit">退出</button>
            </div>
        `;
        const appEl = document.getElementById('app') || document.body;
        appEl.appendChild(bar);

        document.getElementById('selectionExit')?.addEventListener('click', async () => {
            exitSelectionMode();
            if (state.currentView === 'todo') await renderTodoView();
            if (state.currentView === 'goals') await renderGoalsView();
        });

        document.getElementById('selectionSelectAll')?.addEventListener('click', async () => {
            const type = state.selectionMode.type;
            if (!type) return;
            const set = getSelectionSet(type);
            set.clear();
            if (type === 'todo') {
                state.events.forEach((e) => {
                    set.add(String(e.id));
                });
                await renderTodoView();
            } else {
                const allIds = new Set();
                const collect = (gs) => {
                    (gs || []).forEach(g => {
                        allIds.add(String(g.id));
                        if (g.subtasks && g.subtasks.length) collect(g.subtasks);
                    });
                };
                collect(state.goals || []);
                allIds.forEach((id) => {
                    set.add(id);
                });
                await renderGoalsView();
            }
            renderSelectionBar(type);
        });

        document.getElementById('selectionComplete')?.addEventListener('click', async () => {
            const type = state.selectionMode.type;
            if (!type) return;
            const ids = Array.from(getSelectionSet(type));
            if (ids.length === 0) return;
            if (type === 'todo') {
                for (const id of ids) {
                    await completeEvent(id);
                }
                showToast(`已完成 ${ids.length} 项`);
                await loadData();
                await renderTodoView();
            } else {
                for (const id of ids) {
                    await updateGoal(id, { status: 'done' });
                }
                showToast(`已完成 ${ids.length} 项目标`);
                await renderGoalsView();
            }
            exitSelectionMode();
        });

        document.getElementById('selectionDelete')?.addEventListener('click', async () => {
            const type = state.selectionMode.type;
            if (!type) return;
            const ids = Array.from(getSelectionSet(type));
            if (ids.length === 0) return;
            const ok = window.confirm(`确定删除选中的 ${ids.length} 项吗？`);
            if (!ok) return;
            if (type === 'todo') {
                for (const id of ids) {
                    await deleteEvent(id);
                }
                showToast(`已删除 ${ids.length} 项`);
                await loadData();
                await renderTodoView();
            } else {
                for (const id of ids) {
                    await deleteGoal(id);
                }
                showToast(`已删除 ${ids.length} 项目标`);
                await renderGoalsView();
            }
            exitSelectionMode();
        });

        return bar;
    }

    function renderSelectionBar(type) {
        const bar = ensureSelectionBar();
        const set = getSelectionSet(type);
        const countEl = document.getElementById('selectionCount');
        const completeBtn = document.getElementById('selectionComplete');
        if (countEl) countEl.textContent = `已选择 ${set.size} 项`;
        if (completeBtn) completeBtn.textContent = type === 'goals' ? '完成目标' : '完成';
        bar.classList.remove('hidden');
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
        fetchTrash,
        fetchTrashCount,
        restoreTrashItem,
        permanentlyDeleteTrashItem,
        emptyTrash,
        fetchAISettings,
        updateAISettings,
        showToast,
        showConfirm,
    } = window.ScheduleAppCore;

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
                const heightPx = Math.max(20, ((endMinutes - startMinutes) / 60) * weekHourHeight);

                const eventEl = document.createElement('div');
                eventEl.className = 'week-event';
                eventEl.style.setProperty('--event-color', getCategoryColor(event.category_id));
                eventEl.style.top = `${topPx}px`;
                eventEl.style.height = `${heightPx}px`;
                
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
        
        // Fetch all events (use month filter to get more events)
        const data = await apiCall('events?date=month');
        
        if (!data || data.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📝</div>
                    <div class="empty-text">暂无待办事项</div>
                </div>
            `;
            return;
        }
        
        container.innerHTML = '';
        
        // Get all events (pending AND completed), including items without explicit time
        const allEvents = data
            .filter(e => e.status !== 'hidden')
            .sort((a, b) => {
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
         
        // Group by date (+ one special group for no-time tasks)
        const NO_TIME_KEY = '__no_time__';
        const grouped = {};
        allEvents.forEach(event => {
            let dateKey;
            // Only put items with NO start_time in NO_TIME_KEY
            // (deadline warnings with actual times should stay in their date group)
            if (!event.start_time) {
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
        
        // Render groups
        Object.keys(grouped)
            .sort((a, b) => {
                // Keep no-time/deadline warnings pinned at the top for daily visibility
                if (a === NO_TIME_KEY) return -1;
                if (b === NO_TIME_KEY) return 1;
                return a.localeCompare(b);
            })
            .forEach(dateKey => {
            const events = grouped[dateKey];
            const firstEvent = events[0];
            const isNoTimeGroup = dateKey === NO_TIME_KEY;
            const date = !isNoTimeGroup ? new Date(firstEvent.start_time) : null;
            const today = new Date();
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            
            let dateLabel;
            if (isNoTimeGroup) {
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
            groupEl.className = 'todo-date-group';
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
                
                eventEl.addEventListener('touchend', async () => {
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
                        renderTodoView();
                    } else {
                        eventEl.classList.remove('swiped');
                    }
                    
                    swiping = false;
                    isHorizontalSwipe = null;
                    swipeDeltaX = 0;
                    mainContent = null;
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
    }

    // ============================================
    // Goals View
    // ============================================
    function renderGoalsViewSkeleton() {
        const container = elements.goalsContainer;
        
        container.innerHTML = `
            <div class="goals-toolbar">
                <div class="goals-horizon-tabs">
                    <button class="goals-horizon-tab ${state.goalsHorizon === 'short' ? 'active' : ''}" data-horizon="short">短期</button>
                    <button class="goals-horizon-tab ${state.goalsHorizon === 'semester' ? 'active' : ''}" data-horizon="semester">学期</button>
                    <button class="goals-horizon-tab ${state.goalsHorizon === 'long' ? 'active' : ''}" data-horizon="long">长期</button>
                </div>
                <button class="goals-discuss-btn" id="goalsDiscussBtn">💬 AI规划</button>
            </div>
            <div class="goals-reference hidden" id="goalsReference"></div>
            <div class="goals-list"></div>
        `;
        
        // Bind horizon tab clicks
        container.querySelectorAll('.goals-horizon-tab').forEach(tab => {
            tab.addEventListener('click', async (e) => {
                const horizon = e.target.dataset.horizon;
                state.goalsHorizon = horizon;
                renderGoalsViewSkeleton();
                await renderGoalsList();
            });
        });
        
        // Bind AI discuss button
        container.querySelector('#goalsDiscussBtn').addEventListener('click', () => {
            openGoalDiscussModal();
        });
        
        // Bind reference toggle (removed for simplicity)
    }
    
    async function renderGoalsReference() {
        const refContainer = elements.goalsContainer.querySelector('#goalsReference');
        if (!refContainer) return;
        
        refContainer.innerHTML = '<div class="goals-ref-loading">加载中...</div>';
        
        try {
            // Fetch week and month events in parallel
            const [weekEvents, monthEvents] = await Promise.all([
                fetchEvents('week'),
                fetchEvents('month')
            ]);
            
            // Filter pending events (not completed)
            const pendingWeekEvents = (weekEvents || []).filter(e => e.status !== 'completed').slice(0, 5);
            const pendingMonthEvents = monthEvents || [];
            const pendingMonthTotal = pendingMonthEvents.filter(e => e.status !== 'completed').length;
            const completedMonthCount = pendingMonthEvents.filter(e => e.status === 'completed').length;
            
            const weekHtml = pendingWeekEvents.length > 0 
                ? pendingWeekEvents.map(event => {
                    const eventDate = new Date(event.start_time);
                    const dayName = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][eventDate.getDay()];
                    const timeStr = event.all_day ? '全天' : formatTime(eventDate);
                    return `
                        <div class="goals-ref-event">
                            <span class="goals-ref-event-title">${escapeHtml(event.title)}</span>
                            <span class="goals-ref-event-time">${dayName} ${timeStr}</span>
                        </div>
                    `;
                }).join('')
                : '<div class="goals-ref-empty">本周暂无待办日程</div>';
            
            const monthHtml = pendingMonthTotal > 0
                ? `<div class="goals-ref-summary">共${pendingMonthTotal}个日程，${completedMonthCount}个已完成</div>`
                : '<div class="goals-ref-empty">本月暂无待办日程</div>';
            
            refContainer.innerHTML = `
                <div class="goals-ref-section">
                    <div class="goals-ref-title">📅 本周日程</div>
                    <div class="goals-ref-list">${weekHtml}</div>
                </div>
                <div class="goals-ref-section">
                    <div class="goals-ref-title">📆 本月日程</div>
                    ${monthHtml}
                </div>
            `;
        } catch (error) {
            console.error('Error loading reference events:', error);
            refContainer.innerHTML = '<div class="goals-ref-empty">加载失败</div>';
        }
    }
    
    async function renderGoalsList() {
        const listEl = elements.goalsContainer.querySelector('.goals-list');
        if (!listEl) return;
        
        const goals = await fetchGoals(state.goalsHorizon);
        const goalsSelectionActive = state.selectionMode.active && state.selectionMode.type === 'goals';
        if (goalsSelectionActive) {
            renderSelectionBar('goals');
        }
        
        if (!goals || goals.length === 0) {
            listEl.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🎯</div>
                    <div class="empty-text">暂无${horizonLabel(state.goalsHorizon)}</div>
                    <button class="btn btn-primary" id="goalsEmptyDiscussBtn">开始规划</button>
                </div>
            `;
            // Bind event after innerHTML to avoid inline onclick scope issue
            setTimeout(() => {
                const btn = listEl.querySelector('#goalsEmptyDiscussBtn');
                if (btn) btn.addEventListener('click', () => openGoalDiscussModal());
            }, 0);
            return;
        }
        
        // Count subtasks recursively
        function countSubtasks(goal) {
            if (!goal.subtasks || goal.subtasks.length === 0) return 0;
            let count = goal.subtasks.length;
            goal.subtasks.forEach(st => {
                count += countSubtasks(st);
            });
            return count;
        }
        
        // Render subtasks recursively
        function renderSubtasks(subtasks, depth = 1) {
            if (!subtasks || subtasks.length === 0 || depth > 2) return '';
            return `
                <div class="goal-subtasks depth-${depth}">
                    ${subtasks.map(st => `
                        <div class="goal-card goal-subtask${goalsSelectionActive ? ' selection-mode' : ''}${(goalsSelectionActive && state.selectionMode.goalIds.has(String(st.id))) ? ' selected' : ''}" data-goal-id="${st.id}">
                            <div class="goal-card-head">
                                <div class="goal-title-wrap">
                                    <div class="goal-title">${escapeHtml(st.title)}</div>
                                    <div class="goal-meta">${countSubtasks(st) > 0 ? countSubtasks(st) + '项' : ''}</div>
                                </div>
                                <div class="goal-actions">
                                    <button class="goal-action-btn decompose-btn" data-action="decompose" data-goal-id="${st.id}" title="细分">📋</button>
                                    <button class="goal-action-btn complete-btn" data-action="complete" data-goal-id="${st.id}" title="完成">✓</button>
                                    <button class="goal-action-btn delete-btn" data-action="delete" data-goal-id="${st.id}" title="删除">🗑️</button>
                                </div>
                            </div>
                            ${renderSubtasks(st.subtasks, depth + 1)}
                        </div>
                    `).join('')}
                </div>
            `;
        }
        
        listEl.innerHTML = goals.map(goal => {
            const subtaskCount = countSubtasks(goal);
            const selectedClass = goalsSelectionActive && state.selectionMode.goalIds.has(String(goal.id)) ? ' selected' : '';
            const selectionClass = goalsSelectionActive ? ' selection-mode' : '';
            // Format time display for goal
            const timeDisplay = (goal.start_time || goal.end_time) ? (
                goal.start_time && goal.end_time
                    ? `${formatTime(goal.start_time)} - ${formatTime(goal.end_time)}`
                    : goal.start_time
                        ? `从 ${formatTime(goal.start_time)}`
                        : `至 ${formatTime(goal.end_time)}`
            ) : '';
            return `
                <div class="goal-card${selectionClass}${selectedClass}" data-goal-id="${goal.id}">
                    <div class="goal-card-head">
                        <div class="goal-title-wrap">
                            <div class="goal-title">${escapeHtml(goal.title)}</div>
                            <div class="goal-meta">
                                ${subtaskCount > 0 ? '<span class="goal-meta-item">' + subtaskCount + '项</span>' : ''}
                                ${timeDisplay ? '<span class="goal-meta-item goal-time">' + timeDisplay + '</span>' : ''}
                            </div>
                        </div>
                        <div class="goal-actions">
                            <button class="goal-action-btn discuss-btn" data-action="discuss" data-goal-id="${goal.id}" title="AI讨论">💬</button>
                            <button class="goal-action-btn edit-btn" data-action="edit" data-goal-id="${goal.id}" title="编辑">✏️</button>
                            <button class="goal-action-btn history-btn" data-action="history" data-goal-id="${goal.id}" title="历史">🕘</button>
                            <button class="goal-action-btn toggle-btn" data-action="toggle" data-goal-id="${goal.id}" title="展开">▶</button>
                            <button class="goal-action-btn delete-btn" data-action="delete" data-goal-id="${goal.id}" title="删除">🗑️</button>
                        </div>
                    </div>
                    <div class="goal-children hidden">
                        ${renderSubtasks(goal.subtasks)}
                        <button class="goal-add-subtask-btn" data-parent-id="${goal.id}">+ 添加子任务</button>
                    </div>
                </div>
            `;
        }).join('');
        
        // Bind goal card events
        listEl.querySelectorAll('.goal-action-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (state.selectionMode.active && state.selectionMode.type === 'goals') return;
                const action = btn.dataset.action;
                const goalId = btn.dataset.goalId;
                
                if (action === 'discuss') {
                    openGoalDiscussModal(goalId);
                } else if (action === 'history') {
                    await openGoalHistoryModal(goalId);
                } else if (action === 'decompose') {
                    openGoalDiscussModal(goalId);
                } else if (action === 'delete') {
                    const confirmed = await showConfirm('确定删除这个目标吗？');
                    if (confirmed) {
                        await deleteGoal(goalId);
                        showToast('已删除');
                        await renderGoalsList();
                    }
                } else if (action === 'toggle') {
                    const card = btn.closest('.goal-card');
                    const children = card.querySelector('.goal-children');
                    card.classList.toggle('expanded');
                    children.classList.toggle('hidden');
                    btn.textContent = card.classList.contains('expanded') ? '▼' : '▶';
                } else if (action === 'complete') {
                    // Mark as done
                    await updateGoal(goalId, { status: 'done' });
                    showToast('已完成 ✓');
                    await renderGoalsList();
                } else if (action === 'edit') {
                    const goal = state.goals.find(g => g.id === parseInt(goalId));
                    if (goal) {
                        await openGoalEditModal(goal);
                    }
                }
            });
        });
        
        // Bind add subtask buttons
        listEl.querySelectorAll('.goal-add-subtask-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                if (state.selectionMode.active && state.selectionMode.type === 'goals') return;
                const parentId = parseInt(btn.dataset.parentId);
                const title = prompt('输入子任务名称：');
                if (title && title.trim()) {
                    await createGoal({
                        title: title.trim(),
                        parent_id: parentId,
                        horizon: state.goalsHorizon
                    });
                    await renderGoalsList();
                }
            });
        });

        // Long-press/click selection for goal cards (mobile UX)
        listEl.querySelectorAll('.goal-card[data-goal-id]').forEach((card) => {
            const goalId = card.dataset.goalId;
            let timer = null;
            let startX = 0;
            let startY = 0;

            const applyGoalSelectionVisual = () => {
                card.classList.add('selection-mode');
                card.classList.toggle('selected', state.selectionMode.goalIds.has(String(goalId)));
                renderSelectionBar('goals');
            };

            card.addEventListener('touchstart', (e) => {
                if (state.selectionMode.active && state.selectionMode.type === 'goals') return;
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
                timer = setTimeout(async () => {
                    state.selectionMode.longPressTriggered = true;
                    enterSelectionMode('goals', goalId);
                    if (navigator.vibrate) navigator.vibrate(20);
                    listEl.querySelectorAll('.goal-card[data-goal-id]').forEach((el) => {
                        el.classList.add('selection-mode');
                    });
                    applyGoalSelectionVisual();
                }, 450);
            }, { passive: true });

            card.addEventListener('touchmove', (e) => {
                if (!timer) return;
                const dx = e.touches[0].clientX - startX;
                const dy = e.touches[0].clientY - startY;
                if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
                    clearTimeout(timer);
                    timer = null;
                }
            }, { passive: true });

            card.addEventListener('touchend', () => {
                if (timer) {
                    clearTimeout(timer);
                    timer = null;
                }
            }, { passive: true });

            card.addEventListener('click', async (e) => {
                if (state.selectionMode.longPressTriggered) {
                    state.selectionMode.longPressTriggered = false;
                    return;
                }
                if (state.selectionMode.active && state.selectionMode.type === 'goals') {
                    if (e.target.closest('.goal-action-btn') || e.target.closest('.goal-add-subtask-btn')) return;
                    toggleSelection('goals', goalId);
                    applyGoalSelectionVisual();
                }
            });
        });
    }
    
    async function renderGoalsView() {
        renderGoalsViewSkeleton();
        await renderGoalsList();
    }

    // ============================================
    // Notepad View (Notes + Expense)
    // ============================================
    async function renderNotepadView() {
        try {
            // Guard against null elements
            if (!elements.notepadTabs || !elements.notepadContainer) {
                console.error('Notepad elements not found:', {
                    notepadTabs: elements.notepadTabs,
                    notepadContainer: elements.notepadContainer,
                    notepadView: elements.notepadView
                });
                elements.notepadContainer.innerHTML = '<div class="empty-state"><div class="empty-text">页面加载中...</div></div>';
                return;
            }
            
            // Bind tab switching
            const tabs = elements.notepadTabs.querySelectorAll('.notepad-tab');
            tabs.forEach(tab => {
                tab.addEventListener('click', async () => {
                    const subtype = tab.dataset.subtype;
                    state.notepadSubview = subtype;
                    tabs.forEach((t) => {
                        t.classList.remove('active');
                    });
                    tab.classList.add('active');
                    await renderNotepadContent();
                });
            });
            
            // Bind input area
            if (elements.notepadInput && elements.notepadAddBtn) {
                elements.notepadAddBtn.addEventListener('click', handleNotepadAdd);
                elements.notepadInput.addEventListener('keypress', async (e) => {
                    if (e.key === 'Enter') {
                        await handleNotepadAdd();
                    }
                });
            }
            
            // Render content based on subview
            await renderNotepadContent();

            // Update FAB style for notepad mode
            if (elements.contentAddBtn) {
                elements.contentAddBtn.textContent = '+';
                elements.contentAddBtn.title = state.notepadSubview === 'expense' ? '快速记账' : '新建笔记';
            }

            // Show AI chat button when in notes subview
            const aiFloatBtn = document.getElementById('aiChatFloatBtn');
            if (aiFloatBtn) {
                if (state.notepadSubview === 'notes') {
                    aiFloatBtn.classList.remove('hidden');
                } else {
                    aiFloatBtn.classList.add('hidden');
                    hideAIFloatingWindow();
                }
            }
        } catch (err) {
            console.error('renderNotepadView error:', err);
            if (elements.notepadContainer) {
                elements.notepadContainer.innerHTML = '<div class="empty-state"><div class="empty-text">加载出错: ' + err.message + '</div></div>';
            }
        }
    }

    async function renderNotepadContent() {
        const container = elements.notepadContainer;
        const subtype = state.notepadSubview;
        
        // Update header title
        elements.headerTitle.textContent = subtype === 'notes' ? '笔记' : '记账';
        
        // Update input placeholder
        if (elements.notepadInput) {
            if (subtype === 'notes') {
                elements.notepadInput.placeholder = '输入内容，AI帮你整理...';
            } else {
                elements.notepadInput.placeholder = '输入如：中午吃面15块...';
            }
        }
        
        if (subtype === 'notes') {
            await renderNotesList();
        } else {
            await renderExpenseList();
        }
    }

    async function handleNotepadAdd() {
        const input = elements.notepadInput;
        if (!input || !input.value.trim()) return;
        
        const text = input.value.trim();
        input.value = '';
        
        if (state.notepadSubview === 'notes') {
            // Create note directly
            const result = await createNote(text);
            if (result) {
                showToast('笔记已保存');
                await renderNotesList();
            }
        } else {
            // Parse expense with AI
            state.isLlmProcessing = true;
            showToast('AI解析中...');
            
            const parsed = await parseExpenseWithLLM(text);
            if (parsed) {
                const result = await createExpense({
                    amount: parsed.amount,
                    category: parsed.category,
                    note: parsed.note || text
                });
                if (result) {
                    showToast(`已记录：${parsed.amount}元`);
                    await renderExpenseList();
                }
            } else {
                showToast('AI解析失败，请重试');
            }
            
            state.isLlmProcessing = false;
        }
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
        const name = prompt('请输入分组名称：');
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

    async function renderExpenseList() {
        const container = elements.notepadContainer;
        
        // Fetch expenses and stats
        const [expenses, stats] = await Promise.all([
            fetchExpenses('month'),
            fetchExpenseStats('month')
        ]);
        
        // Render stats summary
        const statsHtml = `
            <div class="expense-stats-card">
                <div class="expense-total">
                    <span class="expense-total-label">本月支出</span>
                    <span class="expense-total-value">¥${stats.total.toFixed(1)}</span>
                </div>
                <div class="expense-category-summary">
                    ${state.expenseCategories.map(cat => {
                        const amount = stats.by_category[cat.id] || 0;
                        return amount > 0 ? `
                            <div class="expense-cat-item">
                                <span class="expense-cat-dot" style="background: ${cat.color}"></span>
                                <span class="expense-cat-name">${cat.name}</span>
                                <span class="expense-cat-amount">¥${amount.toFixed(1)}</span>
                            </div>
                        ` : '';
                    }).join('')}
                </div>
            </div>
        `;
        
        if (!expenses || expenses.length === 0) {
            container.innerHTML = statsHtml + `
                <div class="empty-state">
                    <div class="empty-icon">💰</div>
                    <div class="empty-text">暂无记账记录</div>
                    <div class="empty-hint">输入如：中午吃面15块</div>
                </div>
            `;
            return;
        }
        
        // Group expenses by date
        const grouped = {};
        expenses.forEach(exp => {
            const dateKey = exp.created_at ? exp.created_at.split('T')[0] : 'unknown';
            if (!grouped[dateKey]) grouped[dateKey] = [];
            grouped[dateKey].push(exp);
        });
        
        let listHtml = statsHtml + '<div class="expense-list">';
        
        Object.keys(grouped).sort((a, b) => b.localeCompare(a)).forEach(dateKey => {
            const dayExpenses = grouped[dateKey];
            const date = new Date(dateKey);
            const now = new Date();
            const isToday = isSameDay(date, now);
            const isYesterday = isSameDay(date, new Date(now.getTime() - 86400000));
            
            let dateLabel;
            if (isToday) dateLabel = '今天';
            else if (isYesterday) dateLabel = '昨天';
            else dateLabel = `${date.getMonth() + 1}月${date.getDate()}日`;
            
            listHtml += `
                <div class="expense-day-group">
                    <div class="expense-day-header">${dateLabel}</div>
                    ${dayExpenses.map(exp => {
                        const cat = state.expenseCategories.find(c => c.id === exp.category) || { name: '其他', color: '#6B7280' };
                        return `
                            <div class="swipe-item expense-swipe" data-expense-id="${exp.id}">
                                <div class="swipe-action swipe-action-left" data-action="reuse" data-expense-id="${exp.id}">↺ 复用</div>
                                <div class="swipe-action swipe-action-right" data-action="delete" data-expense-id="${exp.id}">🗑️ 删除</div>
                                <div class="swipe-content">
                                    <div class="expense-item" data-expense-id="${exp.id}">
                                        <div class="expense-item-left">
                                            <span class="expense-item-cat" style="background: ${cat.color}20; color: ${cat.color}">${cat.name}</span>
                                            <span class="expense-item-note">${escapeHtml(exp.note || '')}</span>
                                        </div>
                                        <div class="expense-item-right">
                                            <span class="expense-item-amount">¥${exp.amount.toFixed(1)}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        });
        
        listHtml += '</div>';
        container.innerHTML = listHtml;
        
        // Swipe actions for expenses
        container.querySelectorAll('.expense-swipe').forEach(bindSwipeItem);
        // Swipe actions for notes
        container.querySelectorAll('.note-swipe').forEach(bindSwipeItem);
        container.querySelectorAll('.note-swipe .swipe-action').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                const noteId = parseInt(btn.dataset.noteId);
                if (!noteId) return;

                if (action === 'edit') {
                    const note = state.notes.find(n => n.id === noteId);
                    if (note) {
                        await showNoteEdit(note);
                    }
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
        container.querySelectorAll('.expense-swipe .swipe-action').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                const expenseId = parseInt(btn.dataset.expenseId);
                const exp = state.expenses.find(x => x.id === expenseId);
                if (!exp) return;

                if (action === 'reuse') {
                    if (elements.notepadInput) {
                        elements.notepadInput.value = `${exp.note || ''}${exp.amount ? ` ${exp.amount}块` : ''}`.trim();
                        elements.notepadInput.focus();
                    }
                    showToast('已填入输入框，可直接调整后添加');
                } else if (action === 'delete') {
                    const confirmed = await showConfirm('确定删除这条记账记录吗？');
                    if (confirmed) {
                        await deleteExpense(expenseId);
                        showToast('已删除');
                        await renderExpenseList();
                    }
                }
            });
        });
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
        goalId: null,        // null for new goal, goalId for existing
        goalContent: '',
        conversationHistory: [],
        currentSubtasks: [],
        isComplete: false,
        mode: 'discuss',
        isRequesting: false
    };

    function openGoalDiscussModal(goalId = null) {
        goalDiscussState = {
            goalId: goalId,
            goalContent: '',
            conversationHistory: [],
            currentSubtasks: [],
            isComplete: false,
            mode: 'discuss',
            isRequesting: false
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
            isRequesting: false
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
        elements.goalDiscussModal.classList.add('hidden');
    }
    
    async function openGoalEditModal(goal) {
        // Helper to format time for datetime-local input
        const toDatetimeLocal = (dt) => {
            if (!dt) return '';
            const d = new Date(dt);
            if (isNaN(d.getTime())) return '';
            const pad = (n) => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        };
        
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
                        <div class="form-row">
                            <div class="form-group">
                                <label for="goalEditStartTime">开始时间</label>
                                <input type="time" id="goalEditStartTime" value="${goal.start_time ? toDatetimeLocal(goal.start_time).slice(11, 16) : ''}">
                            </div>
                            <div class="form-group">
                                <label for="goalEditEndTime">结束时间</label>
                                <input type="time" id="goalEditEndTime" value="${goal.end_time ? toDatetimeLocal(goal.end_time).slice(11, 16) : ''}">
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
        const startTimeInput = document.getElementById('goalEditStartTime');
        const endTimeInput = document.getElementById('goalEditEndTime');
        
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
            // Combine date and time for start_time/end_time
            if (startInput.value && startTimeInput.value) {
                updates.start_time = new Date(`${startInput.value}T${startTimeInput.value}`).toISOString();
            }
            if (endInput.value && endTimeInput.value) {
                updates.end_time = new Date(`${endInput.value}T${endTimeInput.value}`).toISOString();
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

        goalDiscussState.isRequesting = true;
        elements.goalDiscussStartBtn.disabled = true;
        elements.goalDiscussInput.disabled = true;
        
        goalDiscussState.goalContent = input;
        goalDiscussState.conversationHistory = [];
        
        // Hide intro, show conversation
        elements.goalDiscussModal.querySelector('.goal-discuss-intro').classList.add('hidden');
        elements.goalDiscussModal.querySelector('.goal-discuss-input-area').classList.add('hidden');
        elements.goalDiscussConversation.classList.remove('hidden');
        
        // Add user message
        addDiscussMessage('user', input);
        goalDiscussState.conversationHistory.push({ role: 'user', content: input });
        await persistDiscussMessage('user', input);
        
        // Show loading
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
            });
            
            if (result) {
                elements.goalDiscussConversation.querySelectorAll('.discuss-loading').forEach((el) => {
                    el.remove();
                });
                if (result.type === 'question') {
                    // AI asked a question
                    addDiscussMessage('assistant', result.message);
                    goalDiscussState.conversationHistory.push({ role: 'assistant', content: result.message });
                    await persistDiscussMessage('assistant', result.message);
                    showDiscussInput();
                } else if (result.type === 'subtasks') {
                    // AI generated subtasks
                    goalDiscussState.currentSubtasks = normalizeSubtasksNoConflict(result.subtasks || []);
                    goalDiscussState.isComplete = true;
                    showDiscussResults();
                }
            } else {
                elements.goalDiscussConversation.innerHTML = '<div class="discuss-error">AI响应失败，请稍后重试</div>';
            }
        } catch (error) {
            console.error('Discuss error:', error);
            elements.goalDiscussConversation.innerHTML = '<div class="discuss-error">请求失败: ' + error.message + '</div>';
        } finally {
            goalDiscussState.isRequesting = false;
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

        goalDiscussState.isRequesting = true;
        const continueBtnEl = continueInputEl ? continueInputEl.closest('.discuss-input-area')?.querySelector('.discuss-continue-btn') : null;
        if (continueInputEl) continueInputEl.disabled = true;
        if (continueBtnEl) continueBtnEl.disabled = true;

        // Remove old input row immediately to avoid accumulating empty dialog rows
        const inputWrapper = continueInputEl ? continueInputEl.closest('.discuss-input-area') : null;
        if (inputWrapper) {
            inputWrapper.remove();
        }
        
        // Add user message
        addDiscussMessage('user', input);
        goalDiscussState.conversationHistory.push({ role: 'user', content: input });
        await persistDiscussMessage('user', input);
        
        // Show loading
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
            });
            
            if (result) {
                elements.goalDiscussConversation.querySelectorAll('.discuss-loading').forEach((el) => {
                    el.remove();
                });
                if (result.type === 'question') {
                    // AI asked another question
                    addDiscussMessage('assistant', result.message);
                    goalDiscussState.conversationHistory.push({ role: 'assistant', content: result.message });
                    await persistDiscussMessage('assistant', result.message);
                    showDiscussInput();
                } else if (result.type === 'subtasks') {
                    // AI generated subtasks
                    goalDiscussState.currentSubtasks = normalizeSubtasksNoConflict(result.subtasks || []);
                    goalDiscussState.isComplete = true;
                    showDiscussResults();
                } else {
                    showToast('AI未返回可继续内容，请重试');
                }
            }
        } catch (error) {
            console.error('Continue discuss error:', error);
            elements.goalDiscussConversation.innerHTML += '<div class="discuss-error">请求失败: ' + error.message + '</div>';
        } finally {
            goalDiscussState.isRequesting = false;
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
        elements.goalDiscussConversation.innerHTML += '<div class="discuss-loading">🤔 AI思考中...</div>';
        elements.goalDiscussConversation.scrollTop = elements.goalDiscussConversation.scrollHeight;
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

        // Bind import button
        const importBtn = document.getElementById('importSelectedBtn');
        if (importBtn) {
            importBtn.addEventListener('click', () => showImportModal());
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
                const shouldAutoResolve = window.confirm(`发现 ${conflicts.length} 个时间冲突。是否自动顺延到最近可用时段？`);
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
        // In history mode (goalId set), save conversation history to existing goal, update subtasks
        if (goalDiscussState.goalId && goalDiscussState.mode === 'history') {
            // Save conversation history
            if (goalDiscussState.conversationHistory.length > 0) {
                for (const msg of goalDiscussState.conversationHistory) {
                    await createGoalConversation(goalDiscussState.goalId, {
                        role: msg.role,
                        content: msg.content
                    });
                }
            }
            // Update goal with new subtasks if refined
            if (goalDiscussState.currentSubtasks.length > 0) {
                // Delete existing subtasks and recreate
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
            // Create main goal
            const goalResult = await createGoal({
                title: goalDiscussState.goalContent,
                horizon: state.goalsHorizon
            });

            if (goalResult && goalResult.id) {
                // Create subtasks
                for (let i = 0; i < goalDiscussState.currentSubtasks.length; i++) {
                    const st = goalDiscussState.currentSubtasks[i];
                    await createGoal({
                        title: st.title,
                        parent_id: goalResult.id,
                        horizon: state.goalsHorizon,
                        order: i
                    });
                }

                // Save conversation history
                if (goalDiscussState.conversationHistory.length > 0) {
                    for (const msg of goalDiscussState.conversationHistory) {
                        await createGoalConversation(goalResult.id, {
                            role: msg.role,
                            content: msg.content
                        });
                    }
                }

                showToast('目标已保存');
                closeGoalDiscussModal();
                await renderGoalsList();
            }
        } catch (error) {
            console.error('Save goal error:', error);
            showToast('保存失败: ' + error.message);
        }
    }

    // ============================================
    // Settings Modal
    // ============================================
    async function openSettingsModal() {
        // Load setting from localStorage
        const saved = localStorage.getItem('enableDragResize');
        state.enableDragResize = saved === 'true';
        elements.enableDragResize.checked = state.enableDragResize;
        
        // Load QQ reminder setting from API
        await fetchSettings();
        elements.enableQQReminder.checked = state.qqReminderEnabled;
        elements.defaultTaskReminderEnabled.checked = state.defaultTaskReminderEnabled;
        
        // Load user self description from API
        const settings = await apiCall('settings');
        if (settings && settings.self_description) {
            state.userSelfDescription = settings.self_description;
            elements.userSelfDescription.value = settings.self_description;
        } else {
            state.userSelfDescription = '';
            elements.userSelfDescription.value = '';
        }
        
        // Set version
        elements.appVersion.textContent = 'v' + APP_VERSION;
        
        elements.settingsModal.classList.remove('hidden');
    }

    async function openTrashModal() {
        // Close settings modal first
        closeSettingsModal();
        
        // Load trash count to update settings display
        await updateTrashCount();
        
        // Load and render trash list
        const trash = await fetchTrash();
        renderTrashList(trash);
        
        document.getElementById('trashModal')?.classList.remove('hidden');
    }

    function closeTrashModal() {
        document.getElementById('trashModal')?.classList.add('hidden');
    }

    async function updateTrashCount() {
        const count = await fetchTrashCount();
        const trashCountEl = document.getElementById('trashCount');
        if (trashCountEl) {
            trashCountEl.textContent = `已删除 ${count.total} 个项目`;
        }
    }

    function renderTrashList(trash) {
        const container = document.getElementById('trashList');
        if (!container) return;
        
        const allItems = [
            ...(trash.events || []).map(item => ({ ...item, typeLabel: '日程' })),
            ...(trash.goals || []).map(item => ({ ...item, typeLabel: '目标' })),
            ...(trash.notes || []).map(item => ({ ...item, typeLabel: '笔记' })),
            ...(trash.expenses || []).map(item => ({ ...item, typeLabel: '记账' })),
        ].sort((a, b) => {
            // Sort by deleted_at descending (newest first)
            return new Date(b.deleted_at) - new Date(a.deleted_at);
        });
        
        if (allItems.length === 0) {
            container.innerHTML = '<div class="empty-text">垃圾桶是空的</div>';
            return;
        }
        
        const formatDate = (dateStr) => {
            if (!dateStr) return '';
            const d = new Date(dateStr);
            return `${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
        };
        
        container.innerHTML = allItems.map(item => `
            <div class="trash-item" data-type="${item.type}" data-id="${item.id}">
                <div class="trash-item-info">
                    <div class="trash-item-title">${escapeHtml(item.title || '(无标题)')}</div>
                    <div class="trash-item-meta">
                        <span class="trash-item-type">${item.typeLabel}</span>
                        <span class="trash-item-date">删除于 ${formatDate(item.deleted_at)}</span>
                    </div>
                </div>
                <div class="trash-item-actions">
                    <button class="btn btn-secondary trash-restore-btn">恢复</button>
                    <button class="btn btn-danger trash-delete-btn">彻底删除</button>
                </div>
            </div>
        `).join('');
        
        // Bind restore buttons
        container.querySelectorAll('.trash-restore-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const item = e.target.closest('.trash-item');
                const type = item.dataset.type;
                const id = parseInt(item.dataset.id);
                
                const confirmed = await showConfirm('确定恢复这个项目吗？');
                if (!confirmed) return;
                
                const result = await restoreTrashItem(type, id);
                if (result) {
                    showToast('已恢复');
                    await updateTrashCount();
                    const trash = await fetchTrash();
                    renderTrashList(trash);
                    // Refresh current view
                    await loadData();
                    if (state.currentView === 'todo') {
                        await renderTodoView();
                    } else if (state.currentView === 'goals') {
                        await renderGoalsView();
                    }
                }
            });
        });

        // Bind permanently delete buttons
        container.querySelectorAll('.trash-delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const item = e.target.closest('.trash-item');
                const type = item.dataset.type;
                const id = parseInt(item.dataset.id);
                
                const confirmed = await showConfirm('彻底删除后无法恢复，确定删除吗？');
                if (!confirmed) return;
                
                const result = await permanentlyDeleteTrashItem(type, id);
                if (result) {
                    showToast('已彻底删除');
                    await updateTrashCount();
                    const trash = await fetchTrash();
                    renderTrashList(trash);
                }
            });
        });
    }

    async function handleEmptyTrash() {
        const count = await fetchTrashCount();
        if (count.total === 0) {
            showToast('垃圾桶已经是空的');
            return;
        }
        
        const confirmed = await showConfirm(`确定清空垃圾桶吗？将永久删除 ${count.total} 个项目，无法恢复。`);
        if (!confirmed) return;
        
        const result = await emptyTrash();
        if (result) {
            showToast('垃圾桶已清空');
            await updateTrashCount();
            renderTrashList({ events: [], goals: [], notes: [], expenses: [] });
        }
    }

    async function openAISettingsModal() {
        // Close settings modal first
        closeSettingsModal();
        
        // Load current AI settings
        const settings = await fetchAISettings();
        if (settings) {
            document.getElementById('aiProvider').value = settings.provider || 'openai';
            document.getElementById('aiApiKey').value = settings.api_key || '';
            document.getElementById('aiBaseUrl').value = settings.base_url || '';
            document.getElementById('aiModel').value = settings.model || '';
        }
        
        document.getElementById('aiSettingsModal')?.classList.remove('hidden');
    }

    function closeAISettingsModal() {
        document.getElementById('aiSettingsModal')?.classList.add('hidden');
    }

    async function saveAISettings() {
        const provider = document.getElementById('aiProvider').value;
        const apiKey = document.getElementById('aiApiKey').value;
        const baseUrl = document.getElementById('aiBaseUrl').value;
        const model = document.getElementById('aiModel').value;
        
        const result = await updateAISettings({
            provider,
            api_key: apiKey,
            base_url: baseUrl,
            model,
        });
        
        if (result) {
            showToast('AI 配置已保存');
            closeAISettingsModal();
        } else {
            showToast('保存失败');
        }
    }

    function closeSettingsModal() {
        // Save user self description to API
        const desc = elements.userSelfDescription.value.trim();
        if (desc !== state.userSelfDescription) {
            state.userSelfDescription = desc;
            updateSetting('self_description', desc);
        }
        
        elements.settingsModal.classList.add('hidden');
    }

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

        if (hasActive) {
            const current = state.llmCycleDone + 1;
            const total = Math.max(state.llmCycleTotal, current);
            const previewText = String(state.llmActiveRequest.text || '').slice(0, 18);
            elements.llmQueueText.textContent = `AI处理中 ${current}/${total}：${previewText}${state.llmActiveRequest.text.length > 18 ? '…' : ''}`;
            elements.llmQueueMeta.textContent = waiting > 0 ? `排队 ${waiting}` : '进行中';

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

    async function handleLlmSubmit() {
        const text = elements.llmInput.value.trim();
        if (!text) {
            showToast('请输入日程内容');
            return;
        }

        enqueueLlmRequest(text);
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
        
        // Settings modal events
        elements.settingsBtn.addEventListener('click', openSettingsModal);
        elements.settingsBackdrop.addEventListener('click', closeSettingsModal);
        elements.settingsClose.addEventListener('click', closeSettingsModal);
        elements.enableDragResize.addEventListener('change', handleDragResizeToggle);
        elements.enableQQReminder.addEventListener('change', handleQQReminderToggle);
        elements.defaultTaskReminderEnabled.addEventListener('change', handleDefaultTaskReminderToggle);
        document.getElementById('cleanupTestEntriesBtn')?.addEventListener('click', handleCleanupTestEntries);
        document.getElementById('semanticHelpBtn')?.addEventListener('click', showSemanticHelpModal);
        document.getElementById('openTrashBtn')?.addEventListener('click', openTrashModal);
        document.getElementById('trashClose')?.addEventListener('click', closeTrashModal);
        document.getElementById('trashBackdrop')?.addEventListener('click', closeTrashModal);
        document.getElementById('trashEmptyBtn')?.addEventListener('click', handleEmptyTrash);
        document.getElementById('openAISettingsBtn')?.addEventListener('click', openAISettingsModal);
        document.getElementById('aiSettingsClose')?.addEventListener('click', closeAISettingsModal);
        document.getElementById('aiSettingsBackdrop')?.addEventListener('click', closeAISettingsModal);
        document.getElementById('aiSettingsCancel')?.addEventListener('click', closeAISettingsModal);
        document.getElementById('aiSettingsSave')?.addEventListener('click', saveAISettings);
        
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

        // Floating add button (content area, visible in day/todo)
        elements.contentAddBtn.addEventListener('click', async () => {
            if (state.currentView === 'notepad') {
                if (state.notepadSubview === 'expense') {
                    elements.notepadInput?.focus();
                    showToast('在输入框描述消费，AI会帮你结构化记账');
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
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

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
        
        // Load last view from localStorage (tab bar supports: day/todo/goals/notepad)
        const allowedViews = new Set(['day', 'todo', 'goals', 'notepad']);
        const savedView = localStorage.getItem('lastView') || 'day';
        const lastView = allowedViews.has(savedView) ? savedView : 'day';
        
        await loadData();
        
        // Switch to last view (this also saves it again)
        await switchView(lastView);
        
        console.log('Schedule App ready!');
    }

    // Start the app
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
