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
        currentView: 'day',
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
            isSwiping: false
        },
        // Breakdown state
        breakdownItems: [],
        breakdownId: null,  // ID for saved breakdowns
        // Settings
        enableDragResize: false  // Drag to resize events - default off
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
        weekHeader: document.getElementById('weekHeader'),
        weekGrid: document.getElementById('weekGrid'),
        todoView: document.getElementById('todoView'),
        todoContainer: document.getElementById('todoContainer'),
        statsView: document.getElementById('statsView'),
        statsContainer: document.getElementById('statsContainer'),
        timeline: document.getElementById('timeline'),
        weekTimeAxis: document.getElementById('weekTimeAxis'),
        completeEventBtn: document.getElementById('completeEventBtn'),
        ptrIndicator: document.getElementById('ptrIndicator'),
        tabDay: document.getElementById('tabDay'),
        tabWeek: document.getElementById('tabWeek'),
        tabTodo: document.getElementById('tabTodo'),
        tabAdd: document.getElementById('tabAdd'),
        tabStats: document.getElementById('tabStats'),
        mainContent: document.getElementById('mainContent'),
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
        appVersion: document.getElementById('appVersion'),
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
                    recurrence: event.recurrence
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
            if (isToday(date)) {
                elements.headerTitle.textContent = '今天';
            } else {
                elements.headerTitle.textContent = formatDate(date);
            }
        } else if (state.currentView === 'week') {
            const weekDates = getWeekDates(date);
            const start = weekDates[0];
            const end = weekDates[6];
            
            if (start.getMonth() === end.getMonth()) {
                elements.headerTitle.textContent = `${start.getMonth() + 1}月`;
            } else {
                elements.headerTitle.textContent = `${start.getMonth() + 1}/${end.getMonth() + 1}月`;
            }
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
            `;
            
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
            
            // Position each event by time (assuming each cell is ~120px for 24 hours = 5px per hour)
            const CELL_HEIGHT_PER_HOUR = 5; // pixels
            const CELL_HEIGHT = 120; // total cell height for 24 hours
            
            dayEvents.forEach(event => {
                const eventStart = new Date(event.start_time);
                const startHour = eventStart.getHours();
                const startMinute = eventStart.getMinutes();
                const topPercent = ((startHour * 60 + startMinute) / (24 * 60)) * 100;
                
                let endHour = startHour + 1; // default 1 hour
                let endMinute = startMinute;
                if (event.end_time) {
                    const eventEnd = new Date(event.end_time);
                    endHour = eventEnd.getHours();
                    endMinute = eventEnd.getMinutes();
                }
                const durationMinutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
                const heightPercent = Math.max((durationMinutes / (24 * 60)) * 100, 3); // minimum 3%
                
                const eventEl = document.createElement('div');
                eventEl.className = 'week-event';
                eventEl.style.background = getCategoryColor(event.category_id);
                eventEl.style.top = `${topPercent}%`;
                eventEl.style.height = `${heightPercent}%`;
                eventEl.style.minHeight = '12px';
                
                const titleEl = document.createElement('div');
                titleEl.className = 'week-event-title';
                titleEl.textContent = event.title;
                
                const timeEl = document.createElement('div');
                timeEl.className = 'week-event-time';
                timeEl.textContent = formatTimeRange(event);
                
                eventEl.appendChild(titleEl);
                if (heightPercent > 4) {
                    eventEl.appendChild(timeEl);
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
                }, { passive: true });
                
                eventEl.addEventListener('touchmove', (e) => {
                    if (!swiping) return;
                    
                    const deltaX = e.touches[0].clientX - swipeStartX;
                    const deltaY = e.touches[0].clientY - swipeStartY;
                    swipeDeltaX = deltaX;
                    
                    // Determine swipe direction on first significant move
                    if (isHorizontalSwipe === null && (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10)) {
                        isHorizontalSwipe = Math.abs(deltaX) > Math.abs(deltaY);
                    }
                    
                    // Only handle horizontal swipe
                    if (isHorizontalSwipe) {
                        e.preventDefault(); // Prevent page scroll
                        
                        if (deltaX < -30) {
                            // Progressive opacity fade as user swipes left
                            // deltaX goes from -30 to -150, opacity goes from 1 to 0
                            const fadeProgress = Math.min(Math.max((-deltaX - 30) / 120, 0), 1);
                            const opacity = 1 - (fadeProgress * 0.7); // 1 to 0.3
                            eventEl.style.opacity = opacity;
                            
                            if (-deltaX >= 100) {
                                // Threshold reached - auto delete
                                eventEl.classList.add('swiped');
                            } else {
                                eventEl.classList.remove('swiped');
                            }
                        } else if (deltaX > 30) {
                            // Swipe right - Progressive opacity fade for delete
                            // deltaX goes from 30 to 150, opacity goes from 1 to 0.3
                            const fadeProgress = Math.min(Math.max((deltaX - 30) / 120, 0), 1);
                            const opacity = 1 - (fadeProgress * 0.7); // 1 to 0.3
                            eventEl.style.opacity = opacity;
                            eventEl.classList.remove('swiped');
                        }
                    }
                }, { passive: false });
                
                eventEl.addEventListener('touchend', async () => {
                    if (!swiping) return;
                    
                    // If swiped left past threshold, auto delete
                    if (swipeDeltaX < -100) {
                        // Auto delete
                        eventEl.style.opacity = '0';
                        await deleteEvent(event.id);
                        showToast('已删除');
                        renderTodoView();
                    } else if (swipeDeltaX < -30) {
                        // Partial swipe - just show actions
                        eventEl.classList.add('swiped');
                    } else if (swipeDeltaX > 100) {
                        // Swipe right past threshold - auto delete
                        eventEl.style.opacity = '0';
                        await deleteEvent(event.id);
                        showToast('已删除');
                        renderTodoView();
                    } else if (swipeDeltaX > 30) {
                        // Partial right swipe - just fade
                        eventEl.style.opacity = '';
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

    function renderStatsView() {
        const stats = state.stats;
        const container = elements.statsContainer;
        
        container.innerHTML = `
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
        elements.todoView.classList.add('hidden');
        elements.statsView.classList.add('hidden');
        
        // Show active view
        switch (view) {
            case 'day':
                elements.dayView.classList.remove('hidden');
                renderTimeline();
                // Scroll to current time if viewing today
                if (isToday(state.currentDate)) {
                    const now = new Date();
                    const currentMinutes = now.getHours() * 60 + now.getMinutes();
                    const scrollTop = Math.max(0, currentMinutes - 60); // Show 1 hour before current
                    elements.dayView.scrollTop = scrollTop;
                }
                break;
            case 'week':
                elements.weekView.classList.remove('hidden');
                renderWeekView();
                break;
            case 'todo':
                elements.todoView.classList.remove('hidden');
                await renderTodoView();
                break;
            case 'stats':
                elements.statsView.classList.remove('hidden');
                renderStatsView();
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
        
        const date = state.currentDate;
        
        if (state.currentView === 'day') {
            date.setDate(date.getDate() + direction);
        } else if (state.currentView === 'week') {
            date.setDate(date.getDate() + (direction * 7));
        }
        
        state.currentDate = new Date(date);
        loadData();
        
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
        
        const eventData = {
            title: title,
            start_time: elements.startTime.value || null,
            end_time: elements.endTime.value || null,
            category_id: state.selectedCategory,
            all_day: elements.allDayCheck.checked,
            status: 'pending'
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
        `;
        
        // Update button states
        elements.completeEventBtn.style.display = event.status === 'done' ? 'none' : 'flex';
        
        elements.detailModal.classList.remove('hidden');
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
    function openBreakdownModal() {
        elements.breakdownInput.value = '';
        state.breakdownItems = [];
        state.breakdownId = 'breakdown_' + Date.now();
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
    function openSettingsModal() {
        // Load setting from localStorage
        const saved = localStorage.getItem('enableDragResize');
        state.enableDragResize = saved === 'true';
        elements.enableDragResize.checked = state.enableDragResize;
        
        // Set version
        elements.appVersion.textContent = 'v' + APP_VERSION;
        
        elements.settingsModal.classList.remove('hidden');
    }

    function closeSettingsModal() {
        elements.settingsModal.classList.add('hidden');
    }

    function handleDragResizeToggle(e) {
        state.enableDragResize = e.target.checked;
        localStorage.setItem('enableDragResize', state.enableDragResize);
        // Re-render timeline to show/hide resize handles
        if (state.currentView === 'day') {
            renderTimeline();
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
                body: JSON.stringify({ text: text })
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
        
        if (keys.length === 0) {
            showToast('没有保存的拆解');
            return;
        }
        
        // Show most recent first
        keys.sort((a, b) => new Date(saved[b].savedAt) - new Date(saved[a].savedAt));
        
        // Render the list
        if (keys.length === 0) {
            elements.savedBreakdownsList.innerHTML = '<div class="empty-state"><div class="empty-text">没有保存的拆解</div></div>';
        } else {
            elements.savedBreakdownsList.innerHTML = keys.map((k, i) => `
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

    function handlePullTouchMove(e) {
        // Don't trigger pull-to-refresh during event drag
        if (state.dragState.event) return;
        
        // Only trigger when at top of content and pulling down
        if (elements.mainContent.scrollTop > 0) return;
        
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
        const resistance = 0.5;
        const distance = Math.min(deltaY * resistance, 150); // Cap at 150px
        state.pullToRefresh.pullDistance = distance;
        
        // Add pulling class to disable transitions
        elements.app.classList.add('pulling');
        elements.app.style.transform = `translateY(${distance}px)`;
        
        // Update indicator
        if (distance > 20) {
            elements.ptrIndicator.classList.add('visible');
        }
        if (distance > 60) {
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
        
        if (distance > 60) {
            // Refresh triggered - show spinner
            elements.app.style.transform = 'translateY(60px)';
            elements.ptrIndicator.classList.remove('visible');
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
        
        // Always fetch month data to keep all events in sync
        const dateFilter = 'month';
        
        try {
            await Promise.all([
                fetchCategories(),
                fetchEvents(dateFilter),
                fetchStats('today')
            ]);
            
            console.log('loadData fetched events:', state.events.length);
            renderHeaderTitle();
            
            if (state.currentView === 'day') {
                renderTimeline();
            } else if (state.currentView === 'week') {
                renderWeekView();
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
    }

    function handleTouchMove(e) {
        // Don't handle swipe/pull during event drag
        if (state.dragState.event) return;
        
        if (!state.swipe.isSwiping) return;
        
        const deltaX = e.touches[0].clientX - state.swipe.startX;
        const deltaY = e.touches[0].clientY - state.swipe.startY;
        
        // Pull to refresh (vertical swipe down at top)
        if (state.mainContent.scrollTop === 0 && deltaY > 0) {
            const pullDistance = deltaY;
            if (pullDistance > 30 && !state.pullToRefresh.isRefreshing) {
                elements.ptrIndicator.classList.add('visible');
                elements.ptrIndicator.classList.add('refreshing');
                state.pullToRefresh.isRefreshing = true;
                loadData().then(() => {
                    elements.ptrIndicator.classList.remove('visible', 'refreshing');
                    state.pullToRefresh.isRefreshing = false;
                });
            }
        }
    }

    function handleTouchEnd(e) {
        if (!state.swipe.isSwiping) return;
        
        const deltaX = e.changedTouches[0].clientX - state.swipe.startX;
        
        // Horizontal swipe for date navigation
        if (Math.abs(deltaX) > 50) {
            if (deltaX > 0) {
                navigateDate(-1); // Swipe right = go to previous
            } else {
                navigateDate(1); // Swipe left = go to next
            }
        }
        
        state.swipe.isSwiping = false;
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
        
        // Tab bar
        elements.tabDay.addEventListener('click', () => switchView('day'));
        elements.tabWeek.addEventListener('click', () => switchView('week'));
        elements.tabTodo.addEventListener('click', () => switchView('todo'));
        elements.tabAdd.addEventListener('click', () => openEventModal());
        elements.tabStats.addEventListener('click', () => switchView('stats'));
        
        // Event modal
        elements.modalBackdrop.addEventListener('click', closeEventModal);
        elements.modalClose.addEventListener('click', closeEventModal);
        elements.cancelEventBtn.addEventListener('click', closeEventModal);
        elements.saveEventBtn.addEventListener('click', saveEvent);
        
        // Detail modal
        elements.detailBackdrop.addEventListener('click', closeDetailModal);
        elements.detailClose.addEventListener('click', closeDetailModal);
        elements.deleteEventBtn.addEventListener('click', deleteSelectedEvent);
        elements.completeEventBtn.addEventListener('click', completeSelectedEvent);
        
        // Touch gestures
        elements.mainContent.addEventListener('touchstart', handleTouchStart, { passive: true });
        elements.mainContent.addEventListener('touchmove', handleTouchMove, { passive: true });
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
        
        // Load last view from localStorage (default to 'day' or 'week')
        const lastView = localStorage.getItem('lastView') || 'week';
        
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
