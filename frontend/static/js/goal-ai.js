/**
 * Schedule App - Goals AI Module
 * AI discuss, breakdown, and related functionality
 */

(function(global) {
    'use strict';

    const getState = () => (global.ScheduleAppCore && global.ScheduleAppCore.state) || {};
    const getElements = () => (global.ScheduleAppCore && global.ScheduleAppCore.elements) || {};
    const getUtils = () => global.ScheduleAppCore || {};
    const toLocalDatetime = (date) => {
        const d = new Date(date);
        const offset = d.getTimezoneOffset();
        const local = new Date(d.getTime() - offset * 60000);
        return local.toISOString().slice(0, 16);
    };

    const Goals = () => global.ScheduleAppGoals || {};

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function openBreakdownModal(options = {}) {
        const elements = getElements();
        const state = getState();
        elements.breakdownInput.value = options.text || '';
        state.breakdownItems = [];
        state.breakdownId = 'breakdown_' + Date.now();
        state.breakdownHorizon = options.horizon || state.goalsHorizon || 'short';
        if (elements.breakdownHorizon) elements.breakdownHorizon.value = state.breakdownHorizon;
        const today = new Date();
        elements.breakdownDate.value = today.toISOString().split('T')[0];
        elements.breakdownResults.innerHTML = '<div class="breakdown-empty">输入任务描述，点击"AI拆解"按钮分解任务</div>';
        elements.breakdownModal.classList.remove('hidden');
    }

    function closeBreakdownModal() {
        const elements = getElements();
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
        const elements = getElements();
        const state = getState();
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
        const elements = getElements();
        const state = getState();
        const utils = getUtils();
        const { fetchGoalConversations } = utils;
        
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
        const elements = getElements();
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
        const elements = getElements();
        const GOAL_COLORS = (global.ScheduleAppGoalCore && global.ScheduleAppGoalCore.GOAL_COLORS) || [
            '#4CAF50', '#FF5722', '#9C27B0', '#00BCD4',
            '#FF9800', '#607D8B', '#E91E63', '#3F51B5',
            '#8BC34A', '#795548'
        ];
        const utils = getUtils();
        const { showToast } = utils;
        
        const formatGoalDate = (start, end) => {
            const fmt = (d) => {
                if (!d) return '';
                const dt = new Date(d);
                if (isNaN(dt.getTime())) return '';
                return `${String(dt.getMonth() + 1).padStart(2, '0')}/${String(dt.getDate()).padStart(2, '0')}`;
            };
            const s = fmt(start), e = fmt(end);
            if (s && e) return s + '-' + e;
            if (s) return s;
            if (e) return '~' + e;
            return '';
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
                        <div class="form-group">
                            <label>颜色</label>
                            <div class="goal-color-picker">
                                <button class="goal-color-option no-color${!goal.color ? ' selected' : ''}" data-color="">无</button>
                                ${GOAL_COLORS.map(c => `
                                    <button class="goal-color-option${goal.color === c ? ' selected' : ''}" data-color="${c}" style="background:${c}"></button>
                                `).join('')}
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
        
        modal.querySelectorAll('.goal-color-option').forEach(opt => {
            opt.addEventListener('click', () => {
                modal.querySelectorAll('.goal-color-option').forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');
            });
        });
        
        const closeModal = () => modal.remove();
        backdrop.addEventListener('click', closeModal);
        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);
        
        const G = Goals();
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
            
            const selectedColor = modal.querySelector('.goal-color-option.selected');
            if (selectedColor) {
                updates.color = selectedColor.dataset.color || '';
            }
            
            const result = await G.updateGoal(goal.id, updates);
            if (result) {
                showToast('已保存');
                closeModal();
                const goalCard = document.querySelector(`[data-goal-id="${goal.id}"]`);
                if (goalCard) {
                    const titleEl = goalCard.querySelector('.goal-title');
                    if (titleEl && updates.title) titleEl.textContent = updates.title;
                    const dateBadge = goalCard.querySelector('.goal-date-badge .date-range');
                    if (dateBadge) {
                        if (updates.start_date || updates.end_date) {
                            dateBadge.textContent = '📅 ' + formatGoalDate(updates.start_date || goal.start_date, updates.end_date || goal.end_date);
                            goalCard.querySelector('.goal-date-badge')?.classList.remove('goal-date-placeholder');
                        }
                    }
                }
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
        const utils = getUtils();
        const { createGoalConversation } = utils;
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
        const state = getState();
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
        const elements = getElements();
        const state = getState();
        const utils = getUtils();
        const { apiCall, showToast } = utils;
        const G = Goals();
        
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
                const draftGoal = await G.createGoal({
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
        const elements = getElements();
        const state = getState();
        const utils = getUtils();
        const { apiCall, showToast } = utils;
        const G = Goals();
        
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
                const draftGoal = await G.createGoal({
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
        const elements = getElements();
        const msgEl = document.createElement('div');
        msgEl.className = 'discuss-message ' + role;
        msgEl.innerHTML = `<div class="discuss-role">${role === 'user' ? '我' : 'AI'}:</div><div class="discuss-content">${escapeHtml(content)}</div>`;
        elements.goalDiscussConversation.appendChild(msgEl);
        elements.goalDiscussConversation.scrollTop = elements.goalDiscussConversation.scrollHeight;
    }

    function showDiscussLoading() {
        const elements = getElements();
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
        const elements = getElements();
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
        const elements = getElements();
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
        const elements = getElements();
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
        const elements = getElements();
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
                        <div class="discuss-subtask-actions">
                            <button class="btn btn-xs btn-outline discuss-subtask-decompose" data-index="${i}" title="细分此任务">📋</button>
                            <label class="discuss-subtask-select">
                                <input type="checkbox" data-index="${i}" checked>
                            </label>
                        </div>
                    </div>
                `).join('')}
            </div>
            <div class="discuss-results-actions">
                <button class="btn btn-secondary" id="discussRefineBtn">继续细化</button>
                <button class="btn btn-secondary" id="discussRescheduleBtn">🔄 重新分配时间</button>
                <button class="btn btn-secondary" id="discussAddTaskBtn">+ 添加任务</button>
                <button class="btn btn-primary" id="importSelectedBtn">导入到日程</button>
            </div>
        `;

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
                showDiscussInput('继续细化这些任务，或者让AI调整时间分配...');
            });
        }

        const rescheduleBtn = document.getElementById('discussRescheduleBtn');
        if (rescheduleBtn) {
            rescheduleBtn.addEventListener('click', rescheduleGoalDiscuss);
        }

        const addTaskBtn = document.getElementById('discussAddTaskBtn');
        if (addTaskBtn) {
            addTaskBtn.addEventListener('click', () => showManualAddTask());
        }

        document.querySelectorAll('.discuss-subtask-decompose').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const index = parseInt(e.target.dataset.index);
                await decomposeSubtask(index);
            });
        });

        const importBtn = document.getElementById('importSelectedBtn');
        if (importBtn) {
            importBtn.addEventListener('click', () => showImportModal());
        }
    }
    
    function showManualAddTask() {
        const utils = getUtils();
        const { showToast } = utils;
        
        const inputHtml = `
            <div class="modal" id="addTaskModal">
                <div class="modal-backdrop" id="addTaskBackdrop"></div>
                <div class="modal-content">
                    <div class="modal-header">
                        <h2>添加任务</h2>
                        <button class="modal-close" id="addTaskClose">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label for="addTaskTitle">任务标题</label>
                            <input type="text" id="addTaskTitle" placeholder="输入任务标题..." />
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label for="addTaskDate">日期</label>
                                <input type="date" id="addTaskDate" />
                            </div>
                            <div class="form-group">
                                <label for="addTaskStart">开始时间</label>
                                <input type="time" id="addTaskStart" />
                            </div>
                            <div class="form-group">
                                <label for="addTaskEnd">结束时间</label>
                                <input type="time" id="addTaskEnd" />
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn" id="addTaskCancel">取消</button>
                        <button class="btn btn-primary" id="addTaskConfirm">添加</button>
                    </div>
                </div>
            </div>
        `;
        
        const existingModal = document.getElementById('addTaskModal');
        if (existingModal) existingModal.remove();
        
        document.body.insertAdjacentHTML('beforeend', inputHtml);
        
        const modal = document.getElementById('addTaskModal');
        const backdrop = document.getElementById('addTaskBackdrop');
        const closeBtn = document.getElementById('addTaskClose');
        const cancelBtn = document.getElementById('addTaskCancel');
        const confirmBtn = document.getElementById('addTaskConfirm');
        const titleInput = document.getElementById('addTaskTitle');
        
        const closeModal = () => modal.remove();
        backdrop.addEventListener('click', closeModal);
        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);
        
        confirmBtn.addEventListener('click', () => {
            const title = titleInput.value.trim();
            if (!title) {
                showToast('请输入任务标题');
                return;
            }
            
            const date = document.getElementById('addTaskDate').value;
            const startTime = document.getElementById('addTaskStart').value;
            const endTime = document.getElementById('addTaskEnd').value;
            
            const newTask = { title };
            if (date) newTask.date = date;
            if (startTime) newTask.start_time = startTime;
            if (endTime) newTask.end_time = endTime;
            
            goalDiscussState.currentSubtasks.push(newTask);
            closeModal();
            showDiscussResults();
        });
        
        requestAnimationFrame(() => {
            modal.classList.remove('hidden');
            titleInput.focus();
        });
    }
    
    async function decomposeSubtask(index) {
        if (goalDiscussState.isRequesting) return;
        const subtask = goalDiscussState.currentSubtasks[index];
        if (!subtask) return;
        
        const subtaskItem = document.querySelector(`.discuss-subtask[data-index="${index}"]`);
        if (!subtaskItem) return;
        
        const existingInput = subtaskItem.querySelector('.subtask-decompose-input');
        if (existingInput) {
            existingInput.focus();
            return;
        }
        
        subtaskItem.querySelector('.discuss-subtask-actions').insertAdjacentHTML(
            'beforeend',
            `<div class="subtask-decompose-input">
                <input type="text" placeholder="如何细分这个任务？" value="${escapeHtml(subtask.title)}" />
                <button class="btn btn-xs btn-primary decompose-confirm">AI分解</button>
                <button class="btn btn-xs btn-outline decompose-add">+手动添加</button>
                <button class="btn btn-xs btn-outline decompose-cancel">取消</button>
            </div>`
        );
        
        const inputEl = subtaskItem.querySelector('.subtask-decompose-input input');
        const confirmBtn = subtaskItem.querySelector('.subtask-decompose-input .decompose-confirm');
        const addBtn = subtaskItem.querySelector('.subtask-decompose-input .decompose-add');
        const cancelBtn = subtaskItem.querySelector('.subtask-decompose-input .decompose-cancel');
        
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                subtaskItem.querySelector('.subtask-decompose-input')?.remove();
            });
        }
        
        if (confirmBtn) {
            confirmBtn.addEventListener('click', async () => {
                const taskDesc = inputEl.value.trim();
                if (!taskDesc) return;
                await performSubtaskDecompose(index, taskDesc);
            });
        }
        
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                subtaskItem.querySelector('.subtask-decompose-input')?.remove();
                showManualAddSubtask(index);
            });
        }
        
        if (inputEl) {
            inputEl.focus();
            inputEl.setSelectionRange(0, inputEl.value.length);
        }
    }
    
    function showManualAddSubtask(parentIndex) {
        const subtaskItem = document.querySelector(`.discuss-subtask[data-index="${parentIndex}"]`);
        if (!subtaskItem) return;
        
        subtaskItem.insertAdjacentHTML('beforeend',
            `<div class="subtask-decompose-input manual-add">
                <input type="text" class="manual-subtask-title" placeholder="输入子任务标题..." />
                <button class="btn btn-xs btn-primary manual-subtask-add">添加</button>
                <button class="btn btn-xs btn-outline manual-subtask-cancel">取消</button>
            </div>`
        );
        
        const titleInput = subtaskItem.querySelector('.manual-subtask-title');
        const addBtn = subtaskItem.querySelector('.manual-subtask-add');
        const cancelBtn = subtaskItem.querySelector('.manual-subtask-cancel');
        
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                subtaskItem.querySelector('.subtask-decompose-input')?.remove();
            });
        }
        
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                const title = titleInput.value.trim();
                if (!title) return;
                addManualSubtask(parentIndex, title);
            });
        }
        
        if (titleInput) {
            titleInput.focus();
        }
    }
    
    function addManualSubtask(parentIndex, title) {
        const subtaskItem = document.querySelector(`.discuss-subtask[data-index="${parentIndex}"]`);
        if (!subtaskItem) return;
        
        subtaskItem.querySelector('.subtask-decompose-input')?.remove();
        
        let childrenContainer = subtaskItem.querySelector('.subtask-children');
        if (!childrenContainer) {
            childrenContainer = document.createElement('div');
            childrenContainer.className = 'subtask-children';
            childrenContainer.innerHTML = '<div class="subtask-children-title">子任务：</div>';
            subtaskItem.appendChild(childrenContainer);
        }
        
        if (!goalDiscussState.currentSubtasks[parentIndex]._children) {
            goalDiscussState.currentSubtasks[parentIndex]._children = [];
        }
        
        const childIndex = goalDiscussState.currentSubtasks[parentIndex]._children.length;
        goalDiscussState.currentSubtasks[parentIndex]._children.push({ title });
        
        const childEl = document.createElement('div');
        childEl.className = 'discuss-subtask discuss-subtask-child';
        childEl.dataset.parent = parentIndex;
        childEl.dataset.index = childIndex;
        childEl.innerHTML = `
            <div class="discuss-subtask-num">${childIndex + 1}</div>
            <div class="discuss-subtask-content">
                <div class="discuss-subtask-title">${escapeHtml(title)}</div>
            </div>
        `;
        childrenContainer.appendChild(childEl);
    }
    
    async function performSubtaskDecompose(index, taskDesc) {
        if (goalDiscussState.isRequesting) return;
        const utils = getUtils();
        const { apiCall, showToast } = utils;
        const state = getState();
        
        goalDiscussState.isRequesting = true;
        const subtask = goalDiscussState.currentSubtasks[index];
        const subtaskItem = document.querySelector(`.discuss-subtask[data-index="${index}"]`);
        
        subtaskItem.querySelector('.subtask-decompose-input')?.remove();
        subtaskItem.insertAdjacentHTML('beforeend', '<div class="subtask-decompose-loading">🤔 分解中...</div>');
        
        try {
            const result = await apiCall('llm/breakdown', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: taskDesc,
                    horizon: state.goalsHorizon || 'short'
                })
            });
            
            subtaskItem.querySelector('.subtask-decompose-loading')?.remove();
            
            if (result && result.subtasks && result.subtasks.length > 0) {
                const subtaskId = `subtask-${index}`;
                const childrenContainer = document.createElement('div');
                childrenContainer.className = 'subtask-children';
                childrenContainer.id = subtaskId;
                childrenContainer.innerHTML = `<div class="subtask-children-title">子任务：</div>` + 
                    result.subtasks.map((st, i) => `
                        <div class="discuss-subtask discuss-subtask-child" data-parent="${index}" data-index="${i}">
                            <div class="discuss-subtask-num">${i + 1}</div>
                            <div class="discuss-subtask-content">
                                <div class="discuss-subtask-title">${escapeHtml(st.title)}</div>
                                ${(st.date && st.start_time && st.end_time) ? `<div class="discuss-subtask-hint">🗓️ ${escapeHtml(st.date)} ${escapeHtml(st.start_time)} - ${escapeHtml(st.end_time)}</div>` : ''}
                            </div>
                        </div>
                    `).join('');
                subtaskItem.appendChild(childrenContainer);
                
                goalDiscussState.currentSubtasks[index]._children = result.subtasks;
            } else {
                showToast('无法分解此任务');
            }
        } catch (error) {
            console.error('Decompose error:', error);
            subtaskItem.querySelector('.subtask-decompose-loading')?.remove();
            showToast('分解失败: ' + error.message);
        } finally {
            goalDiscussState.isRequesting = false;
        }
    }
    
    async function rescheduleGoalDiscuss() {
        if (goalDiscussState.isRequesting) return;
        const elements = getElements();
        const state = getState();
        const utils = getUtils();
        const { apiCall } = utils;
        
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
        const utils = getUtils();
        const { showToast, showConfirm } = utils;
        const state = getState();
        const G = Goals();
        
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
            const { apiCall: apiCallFn, loadData } = utils;

            try {
                let imported = 0;
                let failed = 0;
                for (const item of draftItems) {
                    const result = await apiCallFn('events', {
                        method: 'POST',
                        body: JSON.stringify({
                            title: item.title,
                            start_time: item.start_time,
                            end_time: item.end_time,
                            category_id: 'work'
                        })
                    });
                    if (result) imported++;
                    else failed++;
                }

                if (imported > 0) {
                    showToast(`已导入 ${imported} 个日程${failed ? `，失败${failed}个` : ''}`);
                    closeModal();
                    await loadData();
                    if (goalDiscussState.mode !== 'history') {
                        await G.saveGoalDiscuss();
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
        const state = getState();
        const utils = getUtils();
        const { showToast } = utils;
        const G = Goals();
        
        if (goalDiscussState.goalId && goalDiscussState.mode === 'history') {
            if (goalDiscussState.conversationHistory.length > 0) {
                for (const msg of goalDiscussState.conversationHistory) {
                    await utils.createGoalConversation(goalDiscussState.goalId, {
                        role: msg.role,
                        content: msg.content
                    });
                }
            }
            if (goalDiscussState.currentSubtasks.length > 0) {
                const existingGoal = state.goals.find(g => String(g.id) === String(goalDiscussState.goalId));
                if (existingGoal && existingGoal.subtasks) {
                    for (const st of existingGoal.subtasks) {
                        await G.deleteGoal(st.id);
                    }
                }
                for (let i = 0; i < goalDiscussState.currentSubtasks.length; i++) {
                    await G.createGoal({
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
                await G.updateGoal(finalGoalId, {
                    title: goalDiscussState.goalContent
                });
            } else {
                const goalResult = await G.createGoal({
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
                    await G.createGoal({
                        title: st.title,
                        parent_id: finalGoalId,
                        horizon: state.goalsHorizon,
                        order: i
                    });
                }

                if (goalDiscussState.conversationHistory.length > 0) {
                    for (const msg of goalDiscussState.conversationHistory) {
                        await utils.createGoalConversation(finalGoalId, {
                            role: msg.role,
                            content: msg.content
                        });
                    }
                }
            }

            showToast('目标已保存');
            closeGoalDiscussModal();
            await G.renderGoalsList();
        } catch (error) {
            console.error('Save goal error:', error);
            showToast('保存失败: ' + error.message);
        }
    }

    async function analyzeBreakdown() {
        const elements = getElements();
        const state = getState();
        const utils = getUtils();
        const { apiCall, showToast } = utils;
        
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
        const elements = getElements();
        const state = getState();

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
        
        elements.breakdownResults.addEventListener('click', (e) => {
            const btn = e.target.closest('.breakdown-remove-btn');
            if (!btn) return;
            
            const idx = parseInt(btn.dataset.idx);
            if (isNaN(idx)) return;
            
            removeBreakdownItem(idx);
        });
    }

    function removeBreakdownItem(idx) {
        const state = getState();
        state.breakdownItems.splice(idx, 1);
        renderBreakdownResults();
    }

    function addBreakdownItem() {
        const elements = getElements();
        const state = getState();
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

    function loadSavedBreakdowns() {
        const elements = getElements();
        const state = getState();
        const utils = getUtils();
        const { showToast } = utils;
        
        const saved = JSON.parse(localStorage.getItem('breakdowns') || '{}');
        const keys = Object.keys(saved);
        
        const currentHorizon = state.breakdownHorizon || 'short';
        const filteredKeys = keys.filter(k => saved[k].horizon === currentHorizon);
        
        if (filteredKeys.length === 0) {
            showToast('没有保存的拆解');
            return;
        }
        
        filteredKeys.sort((a, b) => new Date(saved[b].savedAt) - new Date(saved[a].savedAt));
        
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
        const elements = getElements();
        elements.savedBreakdownsModal.classList.add('hidden');
    }

    function saveBreakdowns() {
        const elements = getElements();
        const state = getState();
        const utils = getUtils();
        const { showToast } = utils;
        
        if (state.breakdownItems.length === 0) {
            showToast('没有保存的内容');
            return;
        }

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
        const elements = getElements();
        const state = getState();
        const utils = getUtils();
        const { apiCall, showToast, loadData } = utils;
        
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

    function showAddGoalModal() {
        const utils = getUtils();
        const state = getState();
        const { showToast } = utils;
        const G = Goals();
        const GOAL_COLORS = (G.GOAL_COLORS || []);
        
        const modalHtml = `
            <div class="modal" id="addGoalModal">
                <div class="modal-backdrop" id="addGoalBackdrop"></div>
                <div class="modal-content">
                    <div class="modal-header">
                        <h2>添加目标</h2>
                        <button class="modal-close" id="addGoalClose">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label for="addGoalTitle">目标内容</label>
                            <input type="text" id="addGoalTitle" placeholder="输入目标内容..." />
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn" id="addGoalCancel">取消</button>
                        <button class="btn btn-primary" id="addGoalConfirm">添加</button>
                    </div>
                </div>
            </div>
        `;
        
        const existingModal = document.getElementById('addGoalModal');
        if (existingModal) existingModal.remove();
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        const modal = document.getElementById('addGoalModal');
        const backdrop = document.getElementById('addGoalBackdrop');
        const closeBtn = document.getElementById('addGoalClose');
        const cancelBtn = document.getElementById('addGoalCancel');
        const confirmBtn = document.getElementById('addGoalConfirm');
        const titleInput = document.getElementById('addGoalTitle');
        
        const closeModal = () => modal.remove();
        backdrop.addEventListener('click', closeModal);
        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);
        
        confirmBtn.addEventListener('click', async () => {
            const title = titleInput.value.trim();
            if (!title) {
                showToast?.('请输入目标内容');
                return;
            }
            
            try {
                await G.createGoal({
                    title: title,
                    horizon: state.goalsHorizon || 'short',
                    color: GOAL_COLORS[0]
                });
                closeModal();
                if (state.goalsViewMode === 'timeline') {
                    await G.renderTimelineView();
                } else {
                    await G.renderGoalsList();
                }
                showToast?.('目标已添加');
            } catch (error) {
                console.error('Create goal error:', error);
                showToast?.('添加失败');
            }
        });
        
        requestAnimationFrame(() => {
            modal.classList.remove('hidden');
            titleInput.focus();
        });
    }

    async function renderGoalsView() {
        const state = getState();
        const elements = getElements();
        const G = Goals();
        G.renderGoalsViewSkeleton();
        elements.goalsView.classList.toggle('timeline-mode', state.goalsViewMode === 'timeline');
        if (state.goalsViewMode === 'timeline') {
            await G.renderTimelineView();
        } else {
            await G.renderGoalsList();
        }
    }

    // Global function for inline onchange handlers
    global.updateBreakdownItem = function(idx, field, value) {
        const state = getState();
        state.breakdownItems[idx][field] = value;
    };

    // Export
    global.ScheduleAppGoalAI = {
        openGoalDiscussModal,
        openGoalHistoryModal,
        closeGoalDiscussModal,
        openGoalEditModal,
        showAddGoalModal,
        startGoalDiscuss,
        saveGoalDiscuss,
        openBreakdownModal,
        closeBreakdownModal,
        analyzeBreakdown,
        renderBreakdownResults,
        addBreakdownItem,
        removeBreakdownItem,
        loadSavedBreakdowns,
        closeSavedBreakdownsModal,
        saveBreakdowns,
        importBreakdowns,
        rescheduleGoalDiscuss,
        renderGoalsView,
    };
})(window);
