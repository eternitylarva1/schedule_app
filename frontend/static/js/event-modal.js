(function () {
    'use strict';

    const core = () => window.ScheduleAppCore || {};
    const st  = () => core().state || {};
    const el  = () => core().elements || {};

    function openEventModal(event = null) {
        const state = st();
        const elements = el();
        const toLocalDatetime = core().toLocalDatetime;

        state.selectedEvent = event;

        const getDefaultEditableTimes = () => {
            const now = new Date();
            const minutes = now.getMinutes();
            const roundedMinutes = Math.ceil(minutes / 30) * 30;
            const baseDate = new Date(now);
            baseDate.setMinutes(roundedMinutes, 0, 0);
            const end = new Date(baseDate.getTime() + 30 * 60 * 1000);
            return { start: toLocalDatetime(baseDate), end: toLocalDatetime(end) };
        };

        if (elements.eventModalTitle) {
            elements.eventModalTitle.textContent = event ? '编辑日程' : '新建日程';
        }

        elements.eventTitle.value = event ? event.title : '';
        const defaultTimes = getDefaultEditableTimes();
        elements.startTime.value = event && event.start_time ? toLocalDatetime(event.start_time) : defaultTimes.start;
        elements.endTime.value = event && event.end_time ? toLocalDatetime(event.end_time) : defaultTimes.end;
        elements.pendingTimeCheck.checked = !event || !event.start_time;
        elements.allDayCheck.checked = event ? event.all_day : false;

        if (elements.recurrenceSelect) {
            elements.recurrenceSelect.value = event ? (event.recurrence || 'none') : 'none';
            const recUI = window.ScheduleAppRecurrenceUI;
            if (recUI) recUI.applyRecurrenceUI(event ? (event.recurrence || 'none') : 'none');
        }
        if (elements.prioritySelect) {
            elements.prioritySelect.value = event ? (event.priority || 'none') : 'none';
            if (elements.importanceSelect) elements.importanceSelect.value = String(event ? (event.importance || 0) : 0);
            if (elements.urgencySelect) elements.urgencySelect.value = String(event ? (event.urgency || 0) : 0);
        }

        elements.reminderEnabled.checked = event
            ? (event.reminder_enabled === true || event.reminder_enabled === 'true')
            : state.defaultTaskReminderEnabled;

        if (typeof window._renderCategorySelector === 'function') window._renderCategorySelector();
        syncPendingTimeState();

        elements.eventModal.classList.remove('hidden');
        setTimeout(() => elements.eventTitle.focus(), 100);
    }

    function closeEventModal() {
        const elements = el();
        const state = st();
        elements.eventModal.classList.add('hidden');
        state.selectedEvent = null;
    }

    function syncPendingTimeState() {
        const elements = el();
        const pending = !!elements.pendingTimeCheck.checked;
        elements.startTime.disabled = pending;
        elements.endTime.disabled = pending;
        if (pending) {
            elements.startTime.value = '';
            elements.endTime.value = '';
        }
    }

    async function saveEvent() {
        const state = st();
        const elements = el();
        const api = core();
        const showToast = api.showToast;
        const createEvent = api.createEvent;
        const updateEvent = api.updateEvent;

        if (state.isSavingEvent || elements.saveEventBtn.disabled) return;
        state.isSavingEvent = true;
        elements.saveEventBtn.disabled = true;

        const title = elements.eventTitle.value.trim();
        if (!title) {
            showToast('请输入日程内容');
            state.isSavingEvent = false;
            elements.saveEventBtn.disabled = false;
            return;
        }

        const isPendingTime = !!elements.pendingTimeCheck.checked;
        const startTime = isPendingTime ? '' : elements.startTime.value;
        const endTime = isPendingTime ? '' : elements.endTime.value;
        if (startTime && endTime && new Date(endTime) < new Date(startTime)) {
            showToast('结束时间不能早于开始时间');
            state.isSavingEvent = false;
            elements.saveEventBtn.disabled = false;
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
            reminder_minutes: elements.reminderEnabled.checked ? 1 : 0,
            recurrence: (window.ScheduleAppRecurrenceUI?.collectRecurrenceFromUI?.() || 'none'),
            priority: elements.prioritySelect ? elements.prioritySelect.value : 'none',
            importance: elements.importanceSelect ? parseInt(elements.importanceSelect.value, 10) || 0 : 0,
            urgency: elements.urgencySelect ? parseInt(elements.urgencySelect.value, 10) || 0 : 0,
        };

        try {
            let result;
            if (state.selectedEvent && state.selectedEvent.id) {
                result = await updateEvent(state.selectedEvent.id, eventData);
                if (result) {
                    showToast('日程已更新');
                    closeEventModal();
                    if (api.loadData) await api.loadData();
                }
            } else {
                result = await createEvent(eventData);
                if (result) {
                    showToast('日程已创建');
                    closeEventModal();
                    if (api.loadData) await api.loadData();
                }
            }
        } finally {
            state.isSavingEvent = false;
            elements.saveEventBtn.disabled = false;
        }
    }

    async function showEventDetail(event) {
        const state = st();
        const elements = el();
        const api = core();
        const escapeHtml = api.escapeHtml || (window.ScheduleAppUtils ? window.ScheduleAppUtils.escapeHtml : function(t) { return String(t); });
        const getCategoryColor = api.getCategoryColor;
        const getCategoryName = api.getCategoryName;

        state.selectedEvent = event;

        const startTime = event.start_time ? event.start_time.slice(0, 16) : '';
        const endTime = event.end_time ? event.end_time.slice(0, 16) : '';
        const reminderEnabled = event.reminder_enabled === true || event.reminder_enabled === 'true';
        const recDisplay = (window.ScheduleAppRecurrenceUI?.formatRecurrenceDisplay?.(event.recurrence) || '不重复');

        elements.detailContent.innerHTML = [
            '<div class="detail-row"><span class="detail-label">标题</span><span class="detail-value">', escapeHtml(event.title), '</span></div>',
            '<div class="detail-row detail-time-row">',
              '<div class="detail-time-item"><span class="detail-label">开始</span><input type="datetime-local" id="detailStartTime" value="', startTime, '"></div>',
              '<div class="detail-time-item"><span class="detail-label">结束</span><input type="datetime-local" id="detailEndTime" value="', endTime, '"></div>',
            '</div>',
            '<div class="detail-row"><span class="detail-label">分类</span><span class="detail-category" style="background: ', getCategoryColor(event.category_id), '20; color: ', getCategoryColor(event.category_id), '">', getCategoryName(event.category_id), '</span></div>',
            '<div class="detail-row"><span class="detail-label">状态</span><span class="detail-value">', event.status === 'done' ? '已完成' : '待完成', '</span></div>',
            '<div class="detail-row"><span class="detail-label">重复</span><span class="detail-value">', recDisplay, '</span></div>',
            '<div class="detail-row"><span class="detail-label">提醒开关</span><label class="switch"><input type="checkbox" id="detailReminderEnabled" ', reminderEnabled ? 'checked' : '', '><span class="switch-slider"></span></label></div>',
        ].join('');

        elements.detailModal.classList.remove('hidden');
    }

    function getActionLabel(action) {
        const labels = { 'created': '创建', 'updated': '修改', 'deleted': '删除', 'completed': '完成', 'uncompleted': '撤销完成' };
        return labels[action] || action;
    }

    function formatHistoryTime(timeStr) {
        if (!timeStr) return '';
        try {
            const d = new Date(timeStr);
            return d.toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' });
        } catch { return timeStr; }
    }

    function formatHistoryDiff(history) {
        try {
            if (history.action === 'updated' && history.old_value && history.new_value) {
                const old = JSON.parse(history.old_value);
                const newVal = JSON.parse(history.new_value);
                const changes = [];
                for (const key of Object.keys(newVal)) {
                    if (JSON.stringify(old[key]) !== JSON.stringify(newVal[key])) {
                        changes.push(key + ': ' + (old[key] || '(空)') + ' → ' + (newVal[key] || '(空)'));
                    }
                }
                return changes.join(', ');
            }
        } catch {}
        return '';
    }

    async function saveDetailChanges() {
        const state = st();
        const elements = el();
        const api = core();
        const showToast = api.showToast;
        const updateEvent = api.updateEvent;
        if (!state.selectedEvent || !state.selectedEvent.id) return;
        const detailStartTime = document.getElementById('detailStartTime');
        const detailEndTime = document.getElementById('detailEndTime');
        const detailReminderEnabled = document.getElementById('detailReminderEnabled');
        if (!detailStartTime || !detailEndTime || !detailReminderEnabled) return;
        const startTime = detailStartTime.value || null;
        const endTime = detailEndTime.value || null;
        const reminderEnabled = detailReminderEnabled.checked;
        const result = await updateEvent(state.selectedEvent.id, {
            start_time: startTime, end_time: endTime,
            reminder_enabled: reminderEnabled, reminder_minutes: reminderEnabled ? 1 : 0
        });
        if (result) {
            showToast('日程已更新');
            state.selectedEvent.start_time = startTime;
            state.selectedEvent.end_time = endTime;
            state.selectedEvent.reminder_enabled = reminderEnabled;
            state.selectedEvent.reminder_minutes = reminderEnabled ? 1 : 0;
            const idx = state.events.findIndex(e => e.id === state.selectedEvent.id);
            if (idx !== -1) {
                state.events[idx].start_time = startTime;
                state.events[idx].end_time = endTime;
                state.events[idx].reminder_enabled = reminderEnabled;
                state.events[idx].reminder_minutes = reminderEnabled ? 1 : 0;
            }
            if (state.currentView === 'day') {
                const cv = window.ScheduleAppCalendarViews;
                if (state.calendarSubview === 'day' && cv?.renderTimeline) cv.renderTimeline();
                else if (state.calendarSubview === 'week' && cv?.renderWeekView) cv.renderWeekView();
                else if (state.calendarSubview === 'month' && cv?.renderMonthView) cv.renderMonthView();
            }
            closeDetailModal();
        }
    }

    function closeDetailModal() {
        const elements = el();
        const state = st();
        elements.detailModal.classList.add('hidden');
        state.selectedEvent = null;
    }

    async function deleteSelectedEvent() {
        const state = st();
        const api = core();
        if (!state.selectedEvent || !state.selectedEvent.id) return;
        const result = await api.deleteEvent(state.selectedEvent.id);
        if (result) {
            api.showToast('日程已删除');
            closeDetailModal();
            if (api.loadData) await api.loadData();
        }
    }

    async function completeSelectedEvent() {
        const state = st();
        const api = core();
        if (!state.selectedEvent || !state.selectedEvent.id) return;
        const result = await api.completeEvent(state.selectedEvent.id);
        if (result) {
            api.showToast('日程已完成');
            closeDetailModal();
            if (api.loadData) await api.loadData();
        }
    }

    window.ScheduleAppEventModal = {
        openEventModal,
        closeEventModal,
        saveEvent,
        syncPendingTimeState,
        showEventDetail,
        saveDetailChanges,
        closeDetailModal,
        deleteSelectedEvent,
        completeSelectedEvent,
        getActionLabel,
        formatHistoryTime,
        formatHistoryDiff,
    };
})();
