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
    // State Management
    // ============================================
    const state = {
        currentDate: new Date(),
        currentMonth: new Date(),  // Track current displayed month in month view
        currentView: 'day',
        calendarSubview: 'day',  // 'day' | 'week' | 'month' - sub-view within calendar tab
        events: [],
        categories: [
            { id: 'work', name: '工作', color: '#4285F4' },
            { id: 'life', name: '生活', color: '#34A853' },
            { id: 'study', name: '学习', color: '#FBBC04' },
            { id: 'health', name: '健康', color: '#EA4335' }
        ],
        stats: {
            total: 0,
            completed: 0,
            pending: 0,
            completion_rate: 0
        },
        selectedCategory: 'work',
        selectedEvent: null,
        isLoading: false,
        isLlmProcessing: false,
        isNavigating: false,
        // Drag state for event resizing
        dragState: {
            event: null,
            type: null, // 'start' or 'end'
            originalStart: null,
            originalEnd: null,
            startY: 0
        },
        pullToRefresh: {
            startY: 0,
            isRefreshing: false
        },
        swipe: {
            startX: 0,
            startY: 0,
            isSwiping: false,
            deltaX: 0,
            isHorizontal: false
        },
        // Breakdown state
        breakdownItems: [],
        breakdownId: null,  // ID for saved breakdowns
        breakdownHorizon: 'short',
        goals: [],
        goalsHorizon: 'short',
        // Settings
        enableDragResize: false,  // Drag to resize events - default off
        qqReminderEnabled: false,  // QQ reminder default off
        defaultTaskReminderEnabled: true,
        userSelfDescription: '',  // User's current status for task breakdown
        statsClockTimer: null,
    };

    // ============================================
    // DOM Elements
    // ============================================
    const elements = {
        app: document.getElementById('app'),
        headerTitle: document.getElementById('headerTitle'),
        prevBtn: document.getElementById('prevBtn'),
        nextBtn: document.getElementById('nextBtn'),
        refreshBtn: document.getElementById('refreshBtn'),
        llmInput: document.getElementById('llmInput'),
        llmBtn: document.getElementById('llmBtn'),
        breakdownBtn: document.getElementById('breakdownBtn'),
        llmInputArea: document.getElementById('llmInputArea'),
        dayView: document.getElementById('dayView'),
        weekView: document.getElementById('weekView'),
        monthView: document.getElementById('monthView'),
        monthHeader: document.getElementById('monthHeader'),
        monthGrid: document.getElementById('monthGrid'),
        weekHeader: document.getElementById('weekHeader'),
        weekGrid: document.getElementById('weekGrid'),
        todoView: document.getElementById('todoView'),
        todoContainer: document.getElementById('todoContainer'),
        goalsView: document.getElementById('goalsView'),
        goalsContainer: document.getElementById('goalsContainer'),
        statsView: document.getElementById('statsView'),
        statsContainer: document.getElementById('statsContainer'),
        timeline: document.getElementById('timeline'),
        daySlider: document.getElementById('daySlider'),
        weekTimeAxis: document.getElementById('weekTimeAxis'),
        ptrIndicator: document.getElementById('ptrIndicator'),
        tabDay: document.getElementById('tabDay'),
        tabWeek: document.getElementById('tabWeek'),
        tabMonth: document.getElementById('tabMonth'),
        tabTodo: document.getElementById('tabTodo'),
        tabGoals: document.getElementById('tabGoals'),
        tabAdd: document.getElementById('tabAdd'),
        tabStats: document.getElementById('tabStats'),
        mainContent: document.getElementById('mainContent'),
        contentAddBtn: document.getElementById('contentAddBtn'),
        // Event modal
        eventModal: document.getElementById('eventModal'),
        modalBackdrop: document.getElementById('modalBackdrop'),
        modalClose: document.getElementById('modalClose'),
        eventTitle: document.getElementById('eventTitle'),
        startTime: document.getElementById('startTime'),
        endTime: document.getElementById('endTime'),
        allDayCheck: document.getElementById('allDayCheck'),
        categorySelector: document.getElementById('categorySelector'),
        cancelEventBtn: document.getElementById('cancelEventBtn'),
        saveEventBtn: document.getElementById('saveEventBtn'),
        // Detail modal
        detailModal: document.getElementById('detailModal'),
        detailBackdrop: document.getElementById('detailBackdrop'),
        detailClose: document.getElementById('detailClose'),
        detailContent: document.getElementById('detailContent'),
        deleteEventBtn: document.getElementById('deleteEventBtn'),
        // Breakdown modal
        breakdownModal: document.getElementById('breakdownModal'),
        breakdownBackdrop: document.getElementById('breakdownBackdrop'),
        breakdownInput: document.getElementById('breakdownInput'),
        breakdownAnalyzeBtn: document.getElementById('breakdownAnalyzeBtn'),
        breakdownResults: document.getElementById('breakdownResults'),
        breakdownDate: document.getElementById('breakdownDate'),
        breakdownHorizon: document.getElementById('breakdownHorizon'),
        breakdownSaveBtn: document.getElementById('breakdownSaveBtn'),
        breakdownImportBtn: document.getElementById('breakdownImportBtn'),
        breakdownLoadBtn: document.getElementById('breakdownLoadBtn'),
        breakdownAddBtn: document.getElementById('breakdownAddBtn'),
        breakdownClose: document.getElementById('breakdownClose'),
        // Saved breakdowns modal
        savedBreakdownsModal: document.getElementById('savedBreakdownsModal'),
        savedBreakdownsBackdrop: document.getElementById('savedBreakdownsBackdrop'),
        savedBreakdownsClose: document.getElementById('savedBreakdownsClose'),
        savedBreakdownsList: document.getElementById('savedBreakdownsList'),
        // Settings modal
        settingsModal: document.getElementById('settingsModal'),
        settingsBackdrop: document.getElementById('settingsBackdrop'),
        settingsClose: document.getElementById('settingsClose'),
        settingsBtn: document.getElementById('settingsBtn'),
        enableDragResize: document.getElementById('enableDragResize'),
        enableQQReminder: document.getElementById('enableQQReminder'),
        defaultTaskReminderEnabled: document.getElementById('defaultTaskReminderEnabled'),
        userSelfDescription: document.getElementById('userSelfDescription'),
        appVersion: document.getElementById('appVersion'),
        // Event modal - reminder fields
        reminderEnabled: document.getElementById('reminderEnabled'),
        saveDetailBtn: document.getElementById('saveDetailBtn'),
    };

    // ============================================
    // Utility Functions
    // ============================================
    function formatDate(date, format = 'full') {
        const d = new Date(date);
        const year = d.getFullYear();
        const month = d.getMonth();
        const day = d.getDate();
        const weekday = d.getDay();
        
        const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        const months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
        
        if (format === 'full') {
            return `${year}年${months[month]}${day}日 ${weekdays[weekday]}`;
        } else if (format === 'month-day') {
            return `${months[month]}${day}日`;
        } else if (format === 'weekday') {
            return weekdays[weekday];
        } else if (format === 'short') {
            return `${month + 1}/${day}`;
        }
        return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    function formatDateForApi(date) {
        const d = new Date(date);
        const year = d.getFullYear();
        const month = d.getMonth();
        const day = d.getDate();
        return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    function isSameDay(date1, date2) {
        const d1 = new Date(date1);
        const d2 = new Date(date2);
        // Normalize to midnight local time to avoid timezone issues
        d1.setHours(0, 0, 0, 0);
        d2.setHours(0, 0, 0, 0);
        return d1.getTime() === d2.getTime();
    }

    function isToday(date) {
        return isSameDay(date, new Date());
    }

    function getWeekDates(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day;
        const dates = [];
        
        for (let i = 0; i < 7; i++) {
            const date = new Date(d);
            date.setDate(diff + i);
            dates.push(date);
        }
        return dates;
    }

    function getEventTop(event) {
        if (!event.start_time) return 0;
        const start = new Date(event.start_time);
        const hours = start.getHours();
        const minutes = start.getMinutes();
        const totalMinutes = hours * 60 + minutes;
        const pixelsPerMinute = 1; // 60px per hour / 60 minutes = 1px per minute
        return totalMinutes * pixelsPerMinute;
    }

    function getEventHeight(event) {
        if (!event.start_time || !event.end_time) return 30;
        const start = new Date(event.start_time);
        const end = new Date(event.end_time);
        const durationMinutes = (end - start) / (1000 * 60);
        return Math.max(30, durationMinutes);
    }

    function getCategoryColor(categoryId) {
        const category = state.categories.find(c => c.id === categoryId);
        return category ? category.color : '#4285F4';
    }

    function getCategoryName(categoryId) {
        const category = state.categories.find(c => c.id === categoryId);
        return category ? category.name : categoryId;
    }

    function formatTimeRange(event) {
        if (!event.start_time) return '';
        const start = new Date(event.start_time);
        const startTime = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
        
        if (!event.end_time) return startTime;
        const end = new Date(event.end_time);
        const endTime = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
        
        return `${startTime} - ${endTime}`;
    }

    function horizonLabel(horizon) {
        if (horizon === 'semester') return '学期目标';
        if (horizon === 'long') return '长期目标';
        return '短期目标';
    }

    async function markEventDoneQuick(eventId) {
        const result = await completeEvent(eventId);
        if (!result) return;
        showToast('已完成 ✓');
        await loadData();
        if (state.currentView === 'todo') await renderTodoView();
        else if (state.currentView === 'goals') await renderGoalsView();
    }

    // ============================================
    // Event Drag/Resize Handling
    // ============================================
    function handleEventDragStart(e, event, type) {
        // Stop event from bubbling to touch handlers
        e.stopPropagation();
        e.preventDefault();
        
        state.dragState = {
            event: event,
            type: type,
            originalStart: event.start_time ? new Date(event.start_time) : null,
            originalEnd: event.end_time ? new Date(event.end_time) : null,
            startY: e.clientY || e.touches[0].clientY
        };
        
        document.addEventListener('mousemove', handleEventDragMove);
        document.addEventListener('mouseup', handleEventDragEnd);
        document.addEventListener('touchmove', handleEventDragMove, { passive: false });
        document.addEventListener('touchend', handleEventDragEnd);
    }

    function handleEventDragMove(e) {
        if (!state.dragState.event) return;
        
        // Prevent default to stop page scroll
        e.preventDefault();
        
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        if (clientY === undefined) return;
        
        const deltaY = clientY - state.dragState.startY;
        const deltaMinutes = Math.round(deltaY); // 1px = 1 minute
        
        const event = state.dragState.event;
        const originalStart = state.dragState.originalStart;
        const originalEnd = state.dragState.originalEnd;
        
        // Get all events on the same day for boundary detection
        const dayEvents = state.events.filter(ev => {
            if (!ev.start_time || ev.id === event.id) return false;
            return isSameDay(ev.start_time, event.start_time);
        });
        
        if (state.dragState.type === 'start' && originalStart) {
            // Adjust start time
            let newStart = new Date(originalStart.getTime() + deltaMinutes * 60 * 1000);
            
            // Check boundary: don't go past end time
            if (originalEnd && newStart >= originalEnd) {
                newStart = new Date(originalEnd.getTime() - 15 * 60 * 1000);
            }
            
            // Check boundary: don't overlap with other events
            for (const other of dayEvents) {
                if (!other.end_time) continue;
                const otherEnd = new Date(other.end_time);
                if (newStart >= otherEnd && newStart < originalEnd) {
                    // Snap to end of the previous event
                    newStart = new Date(otherEnd.getTime());
                }
            }
            
            event.start_time = newStart.toISOString();
            event._localModified = true; // Mark as locally modified
        } else if (state.dragState.type === 'end' && originalEnd) {
            // Adjust end time
            let newEnd = new Date(originalEnd.getTime() + deltaMinutes * 60 * 1000);
            
            // Check boundary: don't go before start time
            if (originalStart && newEnd <= originalStart) {
                newEnd = new Date(originalStart.getTime() + 15 * 60 * 1000);
            }
            
            // Check boundary: don't overlap with other events
            for (const other of dayEvents) {
                if (!other.start_time) continue;
                const otherStart = new Date(other.start_time);
                if (newEnd <= otherStart && newEnd > originalEnd) {
                    // Snap to start of the next event
                    newEnd = new Date(otherStart.getTime());
                }
            }
            
            event.end_time = newEnd.toISOString();
            event._localModified = true; // Mark as locally modified
        }
        
        // Update the event element visual
        updateEventElementVisual(event);
    }

    function updateEventElementVisual(event) {
        const eventEl = document.querySelector(`[data-event-id="${event.id}"]`);
        if (!eventEl) return;
        
        eventEl.style.top = `${getEventTop(event)}px`;
        eventEl.style.height = `${getEventHeight(event)}px`;
        
        const timeEl = eventEl.querySelector('.timeline-event-time');
        if (timeEl) {
            timeEl.textContent = formatTimeRange(event);
        }
    }

    async function handleEventDragEnd() {
        if (!state.dragState.event) return;
        
        const event = state.dragState.event;
        
        // Remove listeners first
        document.removeEventListener('mousemove', handleEventDragMove);
        document.removeEventListener('mouseup', handleEventDragEnd);
        document.removeEventListener('touchmove', handleEventDragMove);
        document.removeEventListener('touchend', handleEventDragEnd);
        
        // Call API to update event and wait for result
        await updateEventAPI(event);
        
        // Reset drag state
        state.dragState = {
            event: null,
            type: null,
            originalStart: null,
            originalEnd: null,
            startY: 0
        };
    }

    async function updateEventAPI(event) {
        console.log('updateEventAPI called for event:', event.id, event.start_time, event.end_time);
        try {
            const result = await apiCall(`events/${event.id}`, {
                method: 'PUT',
                body: JSON.stringify({
                    title: event.title,
                    start_time: event.start_time,
                    end_time: event.end_time,
                    category_id: event.category_id,
                    all_day: event.all_day,
                    recurrence: event.recurrence,
                    reminder_enabled: event.reminder_enabled,
                    reminder_minutes: event.reminder_minutes
                })
            });
            console.log('updateEventAPI result:', result);
            if (result) {
                // Update local event with server response
                event.start_time = result.start_time;
                event.end_time = result.end_time;
            }
            return result;
        } catch (error) {
            console.error('Failed to update event:', error);
            showToast('更新失败');
            return null;
        }
    }

    function formatTime(date) {
        const d = new Date(date);
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }

    function toLocalDatetime(date) {
        const d = new Date(date);
        const offset = d.getTimezoneOffset();
        const local = new Date(d.getTime() - offset * 60000);
        return local.toISOString().slice(0, 16);
    }

    // ============================================
    // API Functions
    // ============================================
    async function apiCall(endpoint, options = {}) {
        const url = `/api/${endpoint}`;
        console.log('API call:', options.method || 'GET', url);
        
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json'
            }
        };
        
        try {
            const response = await fetch(url, { ...defaultOptions, ...options });
            console.log('Response status:', response.status);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('HTTP Error:', response.status, errorText);
                showToast(`请求失败 (${response.status})`);
                return null;
            }
            
            const json = await response.json();
            console.log('Response JSON:', json);
            
            if (json.code === 0) {
                return json.data;
            } else {
                console.error('API Error:', json.message);
                showToast(json.message || '请求失败');
                return null;
            }
        } catch (error) {
            console.error('Network Error:', error);
            showToast('网络错误: ' + (error.message || '请检查连接'));
            return null;
        }
    }

    async function fetchEvents(dateFilter = 'today') {
        const data = await apiCall(`events?date=${dateFilter}`);
        if (data) {
            // Merge: keep local changes if event was recently dragged but not yet in DB
            const mergedEvents = data.map(apiEvent => {
                // Check if we have a local version with modified times
                const localEvent = state.events.find(e => e.id === apiEvent.id);
                if (localEvent && localEvent._localModified) {
                    // Use local modified times
                    return { ...apiEvent, ...localEvent };
                }
                return apiEvent;
            });
            state.events = mergedEvents;
            return mergedEvents;
        }
        return [];
    }

    async function fetchStats(dateFilter = 'today') {
        const data = await apiCall(`stats?date=${dateFilter}`);
        if (data) {
            state.stats = data;
            return data;
        }
        return null;
    }

    async function fetchCategories() {
        const data = await apiCall('categories');
        if (data) {
            state.categories = data;
            return data;
        }
        return state.categories;
    }

    async function createEvent(eventData) {
        return await apiCall('events', {
            method: 'POST',
            body: JSON.stringify(eventData)
        });
    }

    async function updateEvent(eventId, eventData) {
        return await apiCall(`events/${eventId}`, {
            method: 'PUT',
            body: JSON.stringify(eventData)
        });
    }

    async function fetchGoals(horizon = 'short') {
        const data = await apiCall(`goals?horizon=${horizon}`);
        if (data) {
            state.goals = data;
            return data;
        }
        return [];
    }

    async function createGoal(goalData) {
        return await apiCall('goals', {
            method: 'POST',
            body: JSON.stringify(goalData)
        });
    }

    async function updateGoal(goalId, goalData) {
        return await apiCall(`goals/${goalId}`, {
            method: 'PUT',
            body: JSON.stringify(goalData)
        });
    }

    async function deleteGoal(goalId) {
        return await apiCall(`goals/${goalId}`, {
            method: 'DELETE'
        });
    }

    async function fetchSettings() {
        const data = await apiCall('settings');
        if (data) {
            // Handle qq_reminder_enabled setting
            if (data.qq_reminder_enabled !== undefined) {
                state.qqReminderEnabled = data.qq_reminder_enabled === 'true';
            }
            if (data.default_task_reminder_enabled !== undefined) {
                state.defaultTaskReminderEnabled = data.default_task_reminder_enabled === 'true';
            }
        }
        return data;
    }

    async function updateSetting(key, value) {
        return await apiCall(`settings/${key}`, {
            method: 'PUT',
            body: JSON.stringify({ value: value })
        });
    }

    async function deleteEvent(eventId) {
        return await apiCall(`events/${eventId}`, {
            method: 'DELETE'
        });
    }

    async function completeEvent(eventId) {
        return await apiCall(`events/${eventId}/complete`, {
            method: 'PUT'
        });
    }

    async function uncompleteEvent(eventId) {
        return await apiCall(`events/${eventId}/uncomplete`, {
            method: 'PUT'
        });
    }

    async function createEventWithLLM(text) {
        return await apiCall('llm/create', {
            method: 'POST',
            body: JSON.stringify({ text: text })
        });
    }

    // ============================================
    // Toast Notifications
    // ============================================
    let toastTimeout = null;

    function showToast(message) {
        // Remove existing toast
        const existing = document.querySelector('.toast');
        if (existing) {
            existing.remove();
        }

        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        document.body.appendChild(toast);

        // Trigger animation
        requestAnimationFrame(() => {
            toast.classList.add('visible');
        });

        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            toast.classList.remove('visible');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // Custom confirm dialog
    function showConfirm(message) {
        return new Promise((resolve) => {
            const backdrop = document.createElement('div');
            backdrop.className = 'confirm-backdrop';
            
            const dialog = document.createElement('div');
            dialog.className = 'confirm-dialog';
            
            dialog.innerHTML = `
                <div class="confirm-message">${message}</div>
                <div class="confirm-buttons">
                    <button class="confirm-btn confirm-cancel">取消</button>
                    <button class="confirm-btn confirm-ok">确定</button>
                </div>
            `;
            
            backdrop.appendChild(dialog);
            document.body.appendChild(backdrop);
            
            // Animate in
            requestAnimationFrame(() => {
                backdrop.classList.add('visible');
                dialog.classList.add('visible');
            });
            
            const cleanup = (result) => {
                backdrop.classList.remove('visible');
                dialog.classList.remove('visible');
                setTimeout(() => {
                    backdrop.remove();
                    resolve(result);
                }, 200);
            };
            
            dialog.querySelector('.confirm-cancel').addEventListener('click', () => cleanup(false));
            dialog.querySelector('.confirm-ok').addEventListener('click', () => cleanup(true));
            backdrop.addEventListener('click', (e) => {
                if (e.target === backdrop) cleanup(false);
            });
        });
    }

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

    function renderWeekView() {
        const weekDates = getWeekDates(state.currentDate);
        
        // Render time axis on the left
        const weekTimeAxis = elements.weekTimeAxis;
        weekTimeAxis.innerHTML = '';
        
        // Show hours: 0, 6, 12, 18 (every 6 hours)
        [0, 6, 12, 18, 24].forEach(hour => {
            const label = document.createElement('div');
            label.className = 'week-time-label';
            const topPercent = (hour / 24) * 100;
            label.style.top = `${topPercent}%`;
            label.textContent = `${String(hour).padStart(2, '0')}:00`;
            weekTimeAxis.appendChild(label);
        });
        
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
            
            // Get events for this day (all events, not just 3)
            const dayEvents = state.events.filter(event => {
                if (!event.start_time) return false;
                return isSameDay(event.start_time, date);
            });
            
            // Create events container
            const eventsDiv = document.createElement('div');
            eventsDiv.className = 'week-cell-events';
            
            dayEvents.forEach(event => {
                const eventEl = document.createElement('div');
                eventEl.className = 'week-event';
                eventEl.style.setProperty('--event-color', getCategoryColor(event.category_id));
                
                const titleEl = document.createElement('div');
                titleEl.className = 'week-event-title';
                titleEl.textContent = event.title;
                
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
                switchView('day');
            });
            
            weekGrid.appendChild(cell);
        });

        // Ensure users can see current-time events (e.g. evening tasks) on first entry
        scrollWeekViewToCurrentTime(weekDates);
    }

    function scrollWeekViewToCurrentTime(weekDates) {
        const weekBody = document.querySelector('.week-body');
        if (!weekBody) return;

        const now = new Date();
        const isCurrentWeek = weekDates.some(d => isSameDay(d, now));
        if (!isCurrentWeek) {
            weekBody.scrollTop = 0;
            return;
        }

        // Keep current-time area visible (renderer uses ~120px for 24h in each cell)
        const totalMinutes = now.getHours() * 60 + now.getMinutes();
        const targetTop = Math.max(0, Math.floor((totalMinutes / (24 * 60)) * 120) - 40);
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
                    <div class="month-event-title">${escapeHtml(event.title)}</div>
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
                switchView('day');
            });
            
            monthGrid.appendChild(cell);
        });
    }

    async function renderTodoView() {
        const container = elements.todoContainer;
        container.innerHTML = '<div class="loading">加载中...</div>';
        
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
        
        // Get all events (pending AND completed) sorted by date and time
        const allEvents = data
            .filter(e => e.status !== 'hidden' && e.start_time)
            .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
        
        if (allEvents.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📝</div>
                    <div class="empty-text">暂无待办事项</div>
                </div>
            `;
            return;
        }
        
        // Group by date
        const grouped = {};
        allEvents.forEach(event => {
            const date = new Date(event.start_time);
            const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
            if (!grouped[dateKey]) {
                grouped[dateKey] = [];
            }
            grouped[dateKey].push(event);
        });
        
        // Render groups
        Object.keys(grouped).sort().forEach(dateKey => {
            const events = grouped[dateKey];
            const firstEvent = events[0];
            const date = new Date(firstEvent.start_time);
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
            
            const groupEl = document.createElement('div');
            groupEl.className = 'todo-date-group';
            groupEl.innerHTML = `<div class="todo-date-header">${dateLabel}</div>`;
            
            events.forEach(event => {
                const eventEl = document.createElement('div');
                eventEl.className = 'todo-item' + (event.status === 'done' ? ' done' : '');
                eventEl.dataset.eventId = event.id;
                
                const startTime = formatTime(event.start_time);
                const endTime = event.end_time ? formatTime(event.end_time) : '';
                const timeStr = endTime ? `${startTime} - ${endTime}` : startTime;
                
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
                if (event.status === 'done') {
                    checkbox.classList.add('checked');
                }
                checkbox.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    
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
                
                eventEl.addEventListener('touchstart', (e) => {
                    swipeStartX = e.touches[0].clientX;
                    swipeStartY = e.touches[0].clientY;
                    swiping = true;
                    isHorizontalSwipe = null;
                    swipeDeltaX = 0;
                    eventEl.style.opacity = '';
                    eventEl.classList.remove('swiped');
                }, { passive: false }); // Must be non-passive to allow preventDefault
                
                eventEl.addEventListener('touchmove', (e) => {
                    if (!swiping) return;
                    
                    const deltaX = e.touches[0].clientX - swipeStartX;
                    const deltaY = e.touches[0].clientY - swipeStartY;
                    swipeDeltaX = deltaX;
                    
                    // Determine swipe direction on first significant move
                    if (isHorizontalSwipe === null && (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10)) {
                        isHorizontalSwipe = Math.abs(deltaX) > Math.abs(deltaY);
                        // Immediately prevent default to stop page scrolling
                        if (isHorizontalSwipe) {
                            e.preventDefault();
                        }
                    }
                    
                    // Only handle horizontal swipe
                    if (isHorizontalSwipe) {
                        // Already prevented above
                        const mainContent = eventEl.querySelector('.todo-main-content');
                        
                        if (deltaX < 0) {
                            // Swipe left - show actions with progressive opacity
                            const moveX = Math.max(deltaX, -90); // Limit to -90px
                            const fadeProgress = Math.min(Math.max((-deltaX - 30) / 60, 0), 1);
                            const opacity = 1 - (fadeProgress * 0.7); // 1 to 0.3
                            mainContent.style.transform = `translateX(${moveX}px)`;
                            eventEl.style.opacity = opacity;
                        } else if (deltaX > 0) {
                            // Swipe right - delete with progressive opacity
                            const fadeProgress = Math.min(Math.max((deltaX - 30) / 120, 0), 1);
                            const opacity = 1 - (fadeProgress * 0.7); // 1 to 0.3
                            const moveX = Math.min(deltaX, 150); // Limit to 150px
                            mainContent.style.transform = `translateX(${moveX}px)`;
                            eventEl.style.opacity = opacity;
                        }
                    }
                }, { passive: false });
                
                eventEl.addEventListener('touchend', async () => {
                    if (!swiping) return;
                    
                    if (swipeDeltaX < -90) {
                        // Swiped left past threshold - keep actions visible
                        eventEl.classList.add('swiped');
                    } else if (swipeDeltaX > 100) {
                        // Swipe right past threshold - auto delete
                        eventEl.style.opacity = '0';
                        await deleteEvent(event.id);
                        showToast('已删除');
                        renderTodoView();
                    } else {
                        // Reset
                        eventEl.style.opacity = '';
                        eventEl.classList.remove('swiped');
                    }
                    
                    swiping = false;
                    isHorizontalSwipe = null;
                    swipeDeltaX = 0;
                }, { passive: true });
                
                // Action button handlers
                eventEl.querySelector('.edit-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    openEventModal(event); // Edit existing event
                });
                
                eventEl.querySelector('.delete-btn').addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const confirmed = await showConfirm('确定删除这个日程吗？');
                    if (confirmed) {
                        await deleteEvent(event.id);
                        showToast('已删除');
                        renderTodoView(); // Refresh
                    }
                });
                
                // Click on item (not checkbox or actions) - show detail
                eventEl.addEventListener('click', (e) => {
                    // Don't trigger if clicking on actions or checkbox
                    if (e.target.closest('.todo-actions') || e.target.closest('.todo-checkbox')) return;
                    showEventDetail(event);
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
                <button class="goals-ref-toggle" id="goalsRefToggle">📅 参考</button>
                <button class="goals-add-btn">+ 添加目标</button>
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
        
        // Bind add button
        container.querySelector('.goals-add-btn').addEventListener('click', () => {
            openBreakdownModal({ horizon: state.goalsHorizon, text: '' });
        });
        
        // Bind reference toggle
        const refToggle = container.querySelector('#goalsRefToggle');
        const refContainer = container.querySelector('#goalsReference');
        refToggle.addEventListener('click', async () => {
            refContainer.classList.toggle('hidden');
            if (!refContainer.classList.contains('hidden')) {
                await renderGoalsReference();
            }
        });
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
        
        if (!goals || goals.length === 0) {
            listEl.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🎯</div>
                    <div class="empty-text">暂无${horizonLabel(state.goalsHorizon)}</div>
                </div>
            `;
            return;
        }
        
        listEl.innerHTML = goals.map(goal => `
            <div class="goal-card" data-goal-id="${goal.id}">
                <div class="goal-card-head">
                    <div class="goal-title-wrap">
                        <div class="goal-title">${escapeHtml(goal.title)}</div>
                        <div class="goal-meta">${horizonLabel(goal.horizon)} · ${goal.subtask_count || 0}项</div>
                    </div>
                    <div class="goal-actions">
                        <button class="goal-action-btn decompose-btn" data-action="decompose" data-goal-id="${goal.id}" title="拆解">📋</button>
                        <button class="goal-action-btn toggle-btn" data-action="toggle" data-goal-id="${goal.id}" title="展开">▶</button>
                        <button class="goal-action-btn delete-btn" data-action="delete" data-goal-id="${goal.id}" title="删除">🗑️</button>
                    </div>
                </div>
                ${goal.description ? `<div class="goal-desc">${escapeHtml(goal.description)}</div>` : ''}
            </div>
        `).join('');
        
        // Bind goal card events
        listEl.querySelectorAll('.goal-action-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                const goalId = btn.dataset.goalId;
                
                if (action === 'decompose') {
                    openBreakdownModal({ horizon: state.goalsHorizon, text: '' });
                } else if (action === 'delete') {
                    const confirmed = await showConfirm('确定删除这个目标吗？');
                    if (confirmed) {
                        await deleteGoal(goalId);
                        showToast('已删除');
                        await renderGoalsList();
                    }
                } else if (action === 'toggle') {
                    const card = btn.closest('.goal-card');
                    card.classList.toggle('expanded');
                    btn.textContent = card.classList.contains('expanded') ? '▼' : '▶';
                }
            });
        });
    }
    
    async function renderGoalsView() {
        renderGoalsViewSkeleton();
        await renderGoalsList();
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
        elements.statsView.classList.add('hidden');
        
        stopStatsClock();

        // Show/hide floating add button (in calendar subviews or todo)
        if (view === 'day' || view === 'todo') {
            elements.contentAddBtn.classList.remove('hidden');
        } else {
            elements.contentAddBtn.classList.add('hidden');
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
                    elements.daySlider.classList.remove('hidden');
                    renderTimeline();
                    // Scroll to current time if viewing today
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
                    // Keep month panel aligned with currently selected date
                    state.currentMonth = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
                    elements.monthView.classList.remove('hidden');
                    renderMonthView();
                }
                break;
            case 'todo':
                elements.todoView.classList.remove('hidden');
                await renderTodoView();
                break;
            case 'stats':
                elements.statsView.classList.remove('hidden');
                renderStatsView();
                startStatsClock();
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
        
        // Reset form
        elements.eventTitle.value = event ? event.title : '';
        elements.startTime.value = event && event.start_time ? toLocalDatetime(event.start_time) : '';
        elements.endTime.value = event && event.end_time ? toLocalDatetime(event.end_time) : '';
        elements.allDayCheck.checked = event ? event.all_day : false;
        
        // Reset reminder fields
        elements.reminderEnabled.checked = event
            ? (event.reminder_enabled === true || event.reminder_enabled === 'true')
            : state.defaultTaskReminderEnabled;
        
        renderCategorySelector();
        
        elements.eventModal.classList.remove('hidden');
        
        // Focus title input
        setTimeout(() => elements.eventTitle.focus(), 100);
    }
    
    function closeEventModal() {
        elements.eventModal.classList.add('hidden');
        state.selectedEvent = null;
    }

    async function saveEvent() {
        const title = elements.eventTitle.value.trim();
        if (!title) {
            showToast('请输入日程内容');
            return;
        }
        
        // Validate end time >= start time
        const startTime = elements.startTime.value;
        const endTime = elements.endTime.value;
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
            status: 'pending',
            reminder_enabled: elements.reminderEnabled.checked,
            reminder_minutes: elements.reminderEnabled.checked ? 1 : 0
        };
        
        const result = await createEvent(eventData);
        if (result) {
            showToast('日程已创建');
            closeEventModal();
            loadData();
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
    async function handleLlmSubmit() {
        const text = elements.llmInput.value.trim();
        if (!text) {
            showToast('请输入日程内容');
            return;
        }
        
        if (state.isLlmProcessing) {
            return;
        }
        
        state.isLlmProcessing = true;
        elements.llmBtn.classList.add('processing');
        elements.llmBtn.disabled = true;
        elements.llmBtn.textContent = '⏳';
        
        try {
            const result = await createEventWithLLM(text);
            if (result) {
                const count = Array.isArray(result) ? result.length : 1;
                if (count > 1) {
                    showToast(`✅ ${count}个日程已创建`);
                } else {
                    showToast('✅ 日程已创建');
                }
                elements.llmInput.value = '';
                await loadData();
            }
        } catch (error) {
            console.error('LLM Error:', error);
            showToast('❌ 创建失败: ' + (error.message || '未知错误'));
        } finally {
            state.isLlmProcessing = false;
            elements.llmBtn.classList.remove('processing');
            elements.llmBtn.disabled = false;
            elements.llmBtn.textContent = '🤖';
        }
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
        state.isLoading = true;
        
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
            
            if (state.currentView === 'day') {
                if (state.calendarSubview === 'day') {
                    renderTimeline();
                } else if (state.calendarSubview === 'week') {
                    renderWeekView();
                } else if (state.calendarSubview === 'month') {
                    renderMonthView();
                }
            } else if (state.currentView === 'stats') {
                renderStatsView();
            }
        } catch (error) {
            console.error('Load data error:', error);
        }
        
        state.isLoading = false;
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
            
            // Update date
            state.currentDate.setDate(state.currentDate.getDate() + direction);
            renderTimeline();
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
        // Header navigation
        elements.prevBtn.addEventListener('click', () => navigateDate(-1));
        elements.nextBtn.addEventListener('click', () => navigateDate(1));
        
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
        
        // Breakdown button
        elements.breakdownBtn.addEventListener('click', openBreakdownModal);
        
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
        
        // Settings modal events
        elements.settingsBtn.addEventListener('click', openSettingsModal);
        elements.settingsBackdrop.addEventListener('click', closeSettingsModal);
        elements.settingsClose.addEventListener('click', closeSettingsModal);
        elements.enableDragResize.addEventListener('change', handleDragResizeToggle);
        elements.enableQQReminder.addEventListener('change', handleQQReminderToggle);
        elements.defaultTaskReminderEnabled.addEventListener('change', handleDefaultTaskReminderToggle);
        
        // Tab bar
        elements.tabDay.addEventListener('click', () => switchView('day'));
        elements.tabTodo.addEventListener('click', () => switchView('todo'));
        elements.tabGoals.addEventListener('click', () => switchView('goals'));
        elements.tabStats.addEventListener('click', () => switchView('stats'));

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
                elements.daySlider.classList.remove('hidden');
                elements.weekView.classList.add('hidden');
                elements.monthView.classList.add('hidden');
            } else if (state.calendarSubview === 'week') {
                elements.daySlider.classList.add('hidden');
                elements.weekView.classList.remove('hidden');
                elements.monthView.classList.add('hidden');
            } else if (state.calendarSubview === 'month') {
                elements.daySlider.classList.add('hidden');
                elements.weekView.classList.add('hidden');
                // Keep month panel aligned with currently selected date
                state.currentMonth = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
                elements.monthView.classList.remove('hidden');
            }
            await loadData();
        });

        // Floating add button (content area, visible in day/todo)
        elements.contentAddBtn.addEventListener('click', () => openEventModal());
        
        // Event modal
        elements.modalBackdrop.addEventListener('click', closeEventModal);
        elements.modalClose.addEventListener('click', closeEventModal);
        elements.cancelEventBtn.addEventListener('click', closeEventModal);
        elements.saveEventBtn.addEventListener('click', saveEvent);
        
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
        bindEvents();
        renderCategorySelector();
        
        // Load last view from localStorage (tab bar supports: day/todo/goals/stats)
        const allowedViews = new Set(['day', 'todo', 'goals', 'stats']);
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
