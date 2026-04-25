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
                <button class="goals-discuss-btn" id="goalsDiscussBtn">💬 AI规划</button>
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
        const { fetchGoals, updateGoal, deleteGoal, showToast, showConfirm } = utils;

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
        
        listEl.querySelectorAll('.goal-add-subtask-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                if (state.selectionMode.active && state.selectionMode.type === 'goals') return;
                const parentId = parseInt(btn.dataset.parentId);
                const title = prompt('输入子任务名称：');
                if (title && title.trim()) {
                    await createGoal({
                        title: title.trim(),
                        parent_id: parentId,
                        horizon: state.goalsHorizon,
                    });
                    showToast('子任务已添加');
                    await renderGoalsList();
                }
            });
        });
        
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
        console.log('openGoalDiscussModal - goalId:', goalId);
    }

    async function openGoalHistoryModal(goalId) {
        console.log('openGoalHistoryModal - goalId:', goalId);
    }

    async function openGoalEditModal(goal) {
        console.log('openGoalEditModal - goal:', goal);
    }

    async function createGoal(data) {
        const utils = getUtils();
        const { createGoal: apiCreateGoal } = utils;
        if (apiCreateGoal) {
            return await apiCreateGoal(data);
        }
    }

    async function updateGoal(id, data) {
        const utils = getUtils();
        const { updateGoal: apiUpdateGoal } = utils;
        if (apiUpdateGoal) {
            return await apiUpdateGoal(id, data);
        }
    }

    function showToast(message) {
        const utils = getUtils();
        if (utils.showToast) {
            utils.showToast(message);
        }
    }

    function showConfirm(message) {
        const utils = getUtils();
        if (utils.showConfirm) {
            return utils.showConfirm(message);
        }
        return Promise.resolve(true);
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
        createGoal,
        updateGoal,
    };

})();
