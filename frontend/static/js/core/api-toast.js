/**
 * Extracted API + toast layer (no behavior change).
 */
(function(global){
    'use strict';
    const state = global.ScheduleAppCore.state;
    const elements = global.ScheduleAppCore.elements;

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
            if (error && error.name === 'AbortError') {
                console.log('API aborted:', endpoint);
                return null;
            }
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

    async function fetchGoalConversations(goalId) {
        return await apiCall(`goals/${goalId}/conversations`);
    }

    async function createGoalConversation(goalId, payload) {
        return await apiCall(`goals/${goalId}/conversations`, {
            method: 'POST',
            body: JSON.stringify(payload)
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

    async function cleanupTestEntries() {
        return await apiCall('settings/cleanup_test_entries', {
            method: 'POST',
            body: JSON.stringify({})
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

    async function executeUnifiedLlmCommand(text, dryRun = false, signal = null) {
        return await apiCall('llm/command', {
            method: 'POST',
            body: JSON.stringify({ text: text, dry_run: !!dryRun }),
            signal,
        });
    }

    // ============================================
    // Notes API Functions
    // ============================================
    async function fetchNotes() {
        const data = await apiCall('notes');
        if (data) {
            state.notes = data;
            return data;
        }
        return [];
    }

    async function createNote(noteInput) {
        const payload = typeof noteInput === 'string'
            ? { title: '', content: noteInput }
            : {
                title: (noteInput?.title || '').trim(),
                content: (noteInput?.content || '').trim(),
                group_id: noteInput?.group_id || null,
            };
        return await apiCall('notes', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }

    async function updateNote(noteId, noteInput) {
        const payload = typeof noteInput === 'string'
            ? { title: '', content: noteInput }
            : {
                title: (noteInput?.title || '').trim(),
                content: (noteInput?.content || '').trim(),
                group_id: noteInput?.group_id !== undefined ? noteInput.group_id : undefined,
                sort_order: noteInput?.sort_order !== undefined ? noteInput.sort_order : undefined,
            };
        return await apiCall(`notes/${noteId}`, {
            method: 'PUT',
            body: JSON.stringify(payload)
        });
    }

    async function deleteNote(noteId) {
        return await apiCall(`notes/${noteId}`, {
            method: 'DELETE'
        });
    }

    // ============================================
    // Note Groups API Functions
    // ============================================
    async function fetchNoteGroups() {
        const data = await apiCall('note-groups');
        if (data) {
            state.noteGroups = data;
            return data;
        }
        return [];
    }

    async function createNoteGroup(name) {
        return await apiCall('note-groups', {
            method: 'POST',
            body: JSON.stringify({ name: name, sort_order: state.noteGroups.length })
        });
    }

    async function updateNoteGroup(groupId, groupData) {
        return await apiCall(`note-groups/${groupId}`, {
            method: 'PUT',
            body: JSON.stringify(groupData)
        });
    }

    async function deleteNoteGroup(groupId) {
        return await apiCall(`note-groups/${groupId}`, {
            method: 'DELETE'
        });
    }

    // ============================================
    // Note AI Chat API Functions
    // ============================================
    async function fetchNoteConversations(noteId) {
        return await apiCall(`notes/${noteId}/conversations`);
    }

    async function chatWithNote(noteId, message, selectedText = '') {
        return await apiCall(`notes/${noteId}/chat`, {
            method: 'POST',
            body: JSON.stringify({
                message: message,
                selected_text: selectedText
            })
        });
    }

    async function clearNoteConversations(noteId) {
        return await apiCall(`notes/${noteId}/conversations`, {
            method: 'DELETE'
        });
    }

    // ============================================
    // Expenses API Functions
    // ============================================
    async function fetchExpenses(dateFilter = 'month') {
        const data = await apiCall(`expenses?date=${dateFilter}`);
        if (data) {
            state.expenses = data;
            return data;
        }
        return [];
    }

    async function createExpense(expenseData) {
        return await apiCall('expenses', {
            method: 'POST',
            body: JSON.stringify(expenseData)
        });
    }

    async function updateExpense(expenseId, expenseData) {
        return await apiCall(`expenses/${expenseId}`, {
            method: 'PUT',
            body: JSON.stringify(expenseData)
        });
    }

    async function deleteExpense(expenseId) {
        return await apiCall(`expenses/${expenseId}`, {
            method: 'DELETE'
        });
    }

    async function fetchExpenseStats(dateFilter = 'month') {
        const data = await apiCall(`expenses/stats?date=${dateFilter}`);
        if (data) {
            state.expenseStats = data;
            return data;
        }
        return { total: 0, by_category: {} };
    }

    async function parseExpenseWithLLM(text) {
        return await apiCall('llm/parse_expense', {
            method: 'POST',
            body: JSON.stringify({ text: text })
        });
    }

    // ============================================
    // Trash API Functions
    // ============================================
    async function fetchTrash() {
        const data = await apiCall('trash');
        if (data) {
            return data;
        }
        return { events: [], goals: [], notes: [], expenses: [] };
    }

    async function fetchTrashCount() {
        const data = await apiCall('trash/count');
        if (data) {
            return data;
        }
        return { events: 0, goals: 0, notes: 0, expenses: 0, total: 0 };
    }

    async function restoreTrashItem(type, id) {
        return await apiCall(`trash/${type}/${id}/restore`, {
            method: 'POST'
        });
    }

    async function permanentlyDeleteTrashItem(type, id) {
        return await apiCall(`trash/${type}/${id}`, {
            method: 'DELETE'
        });
    }

    async function emptyTrash() {
        return await apiCall('trash', {
            method: 'DELETE'
        });
    }

    async function batchPermanentlyDeleteTrashItems(items) {
        return await apiCall('trash/batch-delete', {
            method: 'POST',
            body: JSON.stringify({ items: items })
        });
    }

    // ============================================
    // AI Settings API Functions
    // ============================================
    async function fetchAISettings() {
        return await apiCall('ai-settings');
    }

    async function updateAISettings(settings) {
        return await apiCall('ai-settings', {
            method: 'PUT',
            body: JSON.stringify(settings)
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


    global.ScheduleAppCore = {
        ...(global.ScheduleAppCore || {}),
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
        batchPermanentlyDeleteTrashItems,
        emptyTrash,
        fetchAISettings,
        updateAISettings,
        showToast,
        showConfirm,
    };
})(window);
