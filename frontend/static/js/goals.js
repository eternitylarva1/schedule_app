/**
 * Schedule App - Goals Module
 * Goal planning and management functionality
 */

(function() {
    'use strict';

    const getState = () => (window.ScheduleAppCore && window.ScheduleAppCore.state) || {};
    const getElements = () => (window.ScheduleAppCore && window.ScheduleAppCore.elements) || {};
    const getUtils = () => window.ScheduleAppCore || {};

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async function createGoal(goalData) {
        const utils = getUtils();
        const apiCallFn = (utils || {}).apiCall;
        if (apiCallFn) {
            return await apiCallFn('goals', {
                method: 'POST',
                body: JSON.stringify(goalData)
            });
        }
        throw new Error('apiCall not available');
    }

    async function updateGoal(goalId, updates) {
        const utils = getUtils();
        const apiCallFn = (utils || {}).apiCall;
        if (apiCallFn) {
            return await apiCallFn(`goals/${goalId}`, {
                method: 'PUT',
                body: JSON.stringify(updates)
            });
        }
        throw new Error('apiCall not available');
    }

    async function deleteGoal(goalId) {
        const utils = getUtils();
        const apiCallFn = (utils || {}).apiCall;
        if (apiCallFn) {
            return await apiCallFn(`goals/${goalId}`, {
                method: 'DELETE'
            });
        }
        throw new Error('apiCall not available');
    }

    // ============ Goal Deliverables ============

    async function fetchDeliverables(goalId) {
        const utils = getUtils();
        const apiCallFn = (utils || {}).apiCall;
        if (apiCallFn) {
            return await apiCallFn(`goals/${goalId}/deliverables`, { method: 'GET' });
        }
        return [];
    }

    async function createDeliverable(goalId, data) {
        const utils = getUtils();
        const apiCallFn = (utils || {}).apiCall;
        if (apiCallFn) {
            return await apiCallFn(`goals/${goalId}/deliverables`, {
                method: 'POST',
                body: JSON.stringify(data)
            });
        }
        throw new Error('apiCall not available');
    }

    async function updateDeliverable(deliverableId, data) {
        const utils = getUtils();
        const apiCallFn = (utils || {}).apiCall;
        if (apiCallFn) {
            return await apiCallFn(`goals/deliverables/${deliverableId}`, {
                method: 'PUT',
                body: JSON.stringify(data)
            });
        }
        throw new Error('apiCall not available');
    }

    async function deleteDeliverable(deliverableId) {
        const utils = getUtils();
        const apiCallFn = (utils || {}).apiCall;
        if (apiCallFn) {
            return await apiCallFn(`goals/deliverables/${deliverableId}`, { method: 'DELETE' });
        }
        throw new Error('apiCall not available');
    }

    async function renderDeliverablesSection(goalId, container) {
        const utils = getUtils();
        const { showPrompt } = utils;
        try {
            const deliverables = await fetchDeliverables(goalId) || [];
            const completed = deliverables.filter(d => d.completed).length;
            const total = deliverables.length;
            
            container.innerHTML = `
                <div class="goal-deliverables-header">
                    <span class="goal-deliverables-title">📋 交付成果</span>
                    <span class="goal-deliverables-count">${total > 0 ? `(${completed}/${total})` : ''}</span>
                    <button class="goal-deliverables-add-btn" data-goal-id="${goalId}">+ 添加</button>
                </div>
                ${total > 0 ? `<div class="goal-deliverables-list">${deliverables.map(d => `
                    <div class="goal-deliverable-item ${d.completed ? 'completed' : ''}" data-deliverable-id="${d.id}">
                        <input type="checkbox" class="goal-deliverable-checkbox" ${d.completed ? 'checked' : ''} data-deliverable-id="${d.id}">
                        <span class="goal-deliverable-title">${escapeHtml(d.title)}</span>
                        <button class="goal-deliverable-delete-btn" data-deliverable-id="${d.id}" title="删除">×</button>
                    </div>
                `).join('')}</div>` : ''}
            `;
            
            // Add click handler for add button
            container.querySelector('.goal-deliverables-add-btn')?.addEventListener('click', async (e) => {
                e.stopPropagation();
                const title = await showPrompt('输入交付成果名称：', { placeholder: '例如：完成项目报告' });
                if (title && title.trim()) {
                    try {
                        await createDeliverable(goalId, { title: title.trim(), description: '' });
                        await renderDeliverablesSection(goalId, container);
                    } catch (err) {
                        console.error(err);
                        utils.showToast?.('添加失败');
                    }
                }
            });
            
            // Add click handler for checkboxes
            container.querySelectorAll('.goal-deliverable-checkbox').forEach(cb => {
                cb.addEventListener('change', async (e) => {
                    e.stopPropagation();
                    const deliverableId = parseInt(cb.dataset.deliverableId);
                    try {
                        await updateDeliverable(deliverableId, { completed: cb.checked ? 1 : 0 });
                        await renderDeliverablesSection(goalId, container);
                        
                        // Check if all completed - prompt to mark goal done
                        if (cb.checked && deliverables.length > 0) {
                            const allDone = deliverables.every(d => d.id === deliverableId || d.completed);
                            if (allDone) {
                                const confirmed = await utils.showConfirm('所有交付成果已完成！是否标记目标为已完成？');
                                if (confirmed) {
                                    await updateGoal(goalId, { status: 'done' });
                                    utils.showToast?.('目标已完成 ✓');
                                    await renderGoalsList();
                                }
                            }
                        }
                    } catch (err) {
                        console.error(err);
                        utils.showToast?.('更新失败');
                    }
                });
            });
            
            // Add click handler for delete buttons
            container.querySelectorAll('.goal-deliverable-delete-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const deliverableId = parseInt(btn.dataset.deliverableId);
                    const confirmed = await utils.showConfirm('确定删除这个交付成果吗？');
                    if (confirmed) {
                        try {
                            await deleteDeliverable(deliverableId);
                            await renderDeliverablesSection(goalId, container);
                        } catch (err) {
                            console.error(err);
                            utils.showToast?.('删除失败');
                        }
                    }
                });
            });
        } catch (err) {
            console.error('Failed to load deliverables:', err);
            container.innerHTML = '<div class="goal-deliverables-error">加载失败</div>';
        }
    }

    function formatTime(date) {
        if (!date) return '';
        const d = new Date(date);
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }

    function horizonLabel(horizon) {
        const labels = { short: '短期目标', semester: '学期目标', long: '长期目标' };
        return labels[horizon] || '目标';
    }

    function renderGoalsViewSkeleton() {
        const state = getState();
        const elements = getElements();
        const container = elements.goalsContainer;
        
        container.innerHTML = `
            <div class="goals-toolbar">
                <div class="goals-horizon-tabs">
                    <button class="goals-horizon-tab ${state.goalsHorizon === 'short' ? 'active' : ''}" data-horizon="short">短期</button>
                    <button class="goals-horizon-tab ${state.goalsHorizon === 'semester' ? 'active' : ''}" data-horizon="semester">学期</button>
                    <button class="goals-horizon-tab ${state.goalsHorizon === 'long' ? 'active' : ''}" data-horizon="long">长期</button>
                </div>
                <div class="goals-toolbar-right">
                    <button class="goals-add-btn" id="goalsAddBtn">+ 添加目标</button>
                    <button class="goals-discuss-btn" id="goalsDiscussBtn">💬 AI规划</button>
                </div>
            </div>
            <div class="goals-reference hidden" id="goalsReference"></div>
            <div class="goals-list"></div>
        `;
        
        container.querySelectorAll('.goals-horizon-tab').forEach(tab => {
            tab.addEventListener('click', async (e) => {
                const horizon = e.target.dataset.horizon;
                state.goalsHorizon = horizon;
                renderGoalsViewSkeleton();
                await renderGoalsList();
            });
        });
        
        container.querySelector('#goalsAddBtn').addEventListener('click', () => {
            showAddGoalModal();
        });
        
        container.querySelector('#goalsDiscussBtn').addEventListener('click', () => {
            openGoalDiscussModal();
        });
    }
    
    async function renderGoalsReference() {
        const elements = getElements();
        const utils = getUtils();
        const { fetchEvents } = utils;

        const refContainer = elements.goalsContainer.querySelector('#goalsReference');
        if (!refContainer) return;
        
        refContainer.innerHTML = '<div class="goals-ref-loading">加载中...</div>';
        
        try {
            const [weekEvents, monthEvents] = await Promise.all([
                fetchEvents('week'),
                fetchEvents('month')
            ]);
            
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
        const state = getState();
        const elements = getElements();
        const utils = getUtils();
        const { fetchGoals, updateGoal, deleteGoal, showToast, showConfirm, showPrompt } = utils;

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
            setTimeout(() => {
                const btn = listEl.querySelector('#goalsEmptyDiscussBtn');
                if (btn) btn.addEventListener('click', () => openGoalDiscussModal());
            }, 0);
            return;
        }
        
        function countSubtasks(goal) {
            if (!goal.subtasks || goal.subtasks.length === 0) return 0;
            let count = goal.subtasks.length;
            goal.subtasks.forEach(st => {
                count += countSubtasks(st);
            });
            return count;
        }
        
        function renderSubtasks(subtasks, depth = 1, parentId = null) {
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
                                    <button class="goal-action-btn decompose-btn" data-action="decompose" data-goal-id="${st.id}" title="AI细分">📋</button>
                                    <button class="goal-action-btn complete-btn" data-action="complete" data-goal-id="${st.id}" title="完成">✓</button>
                                    <button class="goal-action-btn delete-btn" data-action="delete" data-goal-id="${st.id}" title="删除">🗑️</button>
                                </div>
                            </div>
                            ${countSubtasks(st) > 0 ? `<div class="goal-children hidden">${renderSubtasks(st.subtasks, depth + 1, st.id)}</div>` : ''}
                            <button class="goal-add-subtask-btn" data-parent-id="${st.id}" data-depth="${depth}">+ 添加子任务</button>
                        </div>
                    `).join('')}
                </div>
            `;
        }
        
        listEl.innerHTML = goals.map(goal => {
            const subtaskCount = countSubtasks(goal);
            const selectedClass = goalsSelectionActive && state.selectionMode.goalIds.has(String(goal.id)) ? ' selected' : '';
            const selectionClass = goalsSelectionActive ? ' selection-mode' : '';
            return `
                <div class="goal-card${selectionClass}${selectedClass}" data-goal-id="${goal.id}">
                    <div class="goal-card-head">
                        <div class="goal-title-wrap">
                            <div class="goal-title">${escapeHtml(goal.title)}</div>
                            <div class="goal-meta">${subtaskCount > 0 ? subtaskCount + '项' : ''}</div>
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
                        <div class="goal-deliverables-section" id="deliverables-${goal.id}"></div>
                        ${renderSubtasks(goal.subtasks)}
                        <button class="goal-add-subtask-btn" data-parent-id="${goal.id}">+ 添加子任务</button>
                    </div>
                </div>
            `;
        }).join('');
        
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
                    const goal = state.goals.find(g => g.id === parseInt(goalId));
                    const parentGoal = goal || (() => {
                        for (const g of state.goals) {
                            const found = findGoalInTree(g, parseInt(goalId));
                            if (found) return found;
                        }
                        return null;
                    })();
                    
                    function findGoalInTree(g, id) {
                        if (g.id === id) return g;
                        if (g.subtasks) {
                            for (const st of g.subtasks) {
                                const found = findGoalInTree(st, id);
                                if (found) return found;
                            }
                        }
                        return null;
                    }
                    
                    if (parentGoal) {
                        const title = parentGoal.title;
                        const { apiCall } = utils;
                        try {
                            showToast?.('AI 正在细分任务...');
                            const result = await apiCall('llm/breakdown', {
                                method: 'POST',
                                body: JSON.stringify({ text: title, horizon: state.goalsHorizon || 'short' })
                            });
                            if (result && result.subtasks) {
                                for (const st of result.subtasks) {
                                    await createGoal({
                                        title: st.title,
                                        parent_id: parseInt(goalId),
                                        horizon: state.goalsHorizon || 'short'
                                    });
                                }
                                showToast?.(`已添加 ${result.subtasks.length} 个子任务`);
                                await renderGoalsList();
                            } else {
                                showToast?.('AI 细分失败');
                            }
                        } catch (err) {
                            console.error('Decompose error:', err);
                            showToast?.('细分失败');
                        }
                    }
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
                    await updateGoal(goalId, { status: 'done' });
                    showToast?.('已完成 ✓');
                    await renderGoalsList();
                } else if (action === 'edit') {
                    const goal = state.goals.find(g => g.id === parseInt(goalId));
                    if (goal) {
                        await openGoalEditModal(goal);
                    }
                }
            });
        });
        
        listEl.querySelectorAll('.goal-add-subtask-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                if (state.selectionMode.active && state.selectionMode.type === 'goals') return;
                const parentId = parseInt(btn.dataset.parentId);
                const utils = getUtils();
                const { showPrompt } = utils;
                const title = await showPrompt('输入子任务名称：', { placeholder: '例如：完成第一章复习' });
                if (title && title.trim()) {
                    try {
                        await createGoal({
                            title: title.trim(),
                            parent_id: parentId,
                            horizon: state.goalsHorizon,
                        });
                        showToast?.('子任务已添加');
                        await renderGoalsList();
                    } catch (err) {
                        console.error(err);
                        showToast?.('添加失败');
                    }
                }
            });
        });

        // Load and render deliverables for each goal
        for (const goal of goals) {
            const container = document.getElementById(`deliverables-${goal.id}`);
            if (container) {
                await renderDeliverablesSection(goal.id, container);
            }
        }
        
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

    function renderSelectionBar(type) {
        const state = getState();
        let bar = document.getElementById('selectionBar');
        if (!bar) return;
        
        const set = type === 'goals' ? state.selectionMode.goalIds : state.selectionMode.todoIds;
        const count = set.size;
        
        bar.classList.remove('hidden');
        const countEl = document.getElementById('selectionCount');
        if (countEl) countEl.textContent = `已选择 ${count} 项`;
        
        const selectAllBtn = document.getElementById('selectionSelectAll');
        const completeBtn = document.getElementById('selectionComplete');
        
        if (selectAllBtn) {
            selectAllBtn.onclick = async () => {
                if (type === 'goals') {
                    state.goals.forEach(g => { state.selectionMode.goalIds.add(String(g.id)); });
                    await renderGoalsList();
                }
            };
        }
        
        if (completeBtn) {
            completeBtn.onclick = async () => {
                if (type === 'goals') {
                    for (const goalId of state.selectionMode.goalIds) {
                        await updateGoal(parseInt(goalId), { status: 'done' });
                    }
                    showToast(`已完成 ${count} 项`);
                    exitSelectionMode();
                    await renderGoalsList();
                }
            };
        }
    }

    function enterSelectionMode(type, seedId = null) {
        const state = getState();
        state.selectionMode.active = true;
        state.selectionMode.type = type;
        if (type === 'todo') state.selectionMode.goalIds.clear();
        if (type === 'goals') state.selectionMode.todoIds.clear();
        const set = type === 'goals' ? state.selectionMode.goalIds : state.selectionMode.todoIds;
        if (seedId !== null && seedId !== undefined) set.add(String(seedId));
        renderSelectionBar(type);
    }

    function toggleSelection(type, id) {
        const state = getState();
        const set = type === 'goals' ? state.selectionMode.goalIds : state.selectionMode.todoIds;
        const key = String(id);
        if (set.has(key)) set.delete(key);
        else set.add(key);
        renderSelectionBar(type);
    }

    function exitSelectionMode() {
        const state = getState();
        state.selectionMode.active = false;
        state.selectionMode.type = null;
        state.selectionMode.todoIds.clear();
        state.selectionMode.goalIds.clear();
        const bar = document.getElementById('selectionBar');
        if (bar) bar.classList.add('hidden');
    }

async function openGoalDiscussModal(goalId = null) {
        const utils = getUtils();
        if (utils.openGoalDiscussModal) {
            utils.openGoalDiscussModal(goalId);
        } else {
            console.log('openGoalDiscussModal from main.js not available');
        }
    }
    
    async function openGoalHistoryModal(goalId) {
        const utils = getUtils();
        if (utils.openGoalHistoryModal) {
            utils.openGoalHistoryModal(goalId);
        } else {
            console.log('openGoalHistoryModal from main.js not available');
        }
    }
    
    async function openGoalEditModal(goal) {
        const utils = getUtils();
        if (utils.openGoalEditModal) {
            utils.openGoalEditModal(goal);
        } else {
            console.log('openGoalEditModal from main.js not available');
        }
    }
    
    function showAddGoalModal() {
        const utils = getUtils();
        const state = getState();
        const { showToast } = utils;
        
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
                await createGoal({
                    title: title,
                    horizon: state.goalsHorizon || 'short'
                });
                closeModal();
                await renderGoalsList();
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

window.ScheduleAppGoals = {
        renderGoalsViewSkeleton,
        renderGoalsReference,
        renderGoalsList,
        renderGoalsView,
        renderSelectionBar,
        enterSelectionMode,
        toggleSelection,
        exitSelectionMode,
        openGoalDiscussModal,
        openGoalHistoryModal,
        openGoalEditModal,
        showAddGoalModal,
        createGoal,
        updateGoal,
        deleteGoal,
    };

})();
