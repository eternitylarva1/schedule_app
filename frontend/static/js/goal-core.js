/**
 * Schedule App - Goals Core Module
 * Basic CRUD operations and constants
 */

(function(global) {
    'use strict';

    const getState = () => (global.ScheduleAppCore && global.ScheduleAppCore.state) || {};
    const getElements = () => (global.ScheduleAppCore && global.ScheduleAppCore.elements) || {};
    const getUtils = () => global.ScheduleAppCore || {};

    const GOAL_COLORS = [
        '#4CAF50', '#FF5722', '#9C27B0', '#00BCD4',
        '#FF9800', '#607D8B', '#E91E63', '#3F51B5',
        '#8BC34A', '#795548'
    ];

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
        const { updateGoal: updGoal } = global.ScheduleAppGoals || {};
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
            
            container.querySelectorAll('.goal-deliverable-checkbox').forEach(cb => {
                cb.addEventListener('change', async (e) => {
                    e.stopPropagation();
                    const deliverableId = parseInt(cb.dataset.deliverableId);
                    try {
                        await updateDeliverable(deliverableId, { completed: cb.checked ? 1 : 0 });
                        await renderDeliverablesSection(goalId, container);
                        
                        if (cb.checked && deliverables.length > 0) {
                            const allDone = deliverables.every(d => d.id === deliverableId || d.completed);
                            if (allDone) {
                                const confirmed = await utils.showConfirm('所有交付成果已完成！是否标记目标为已完成？');
                                if (confirmed) {
                                    await (updGoal || updateGoal)(goalId, { status: 'done' });
                                    utils.showToast?.('目标已完成 ✓');
                                    const goalCard = document.querySelector(`[data-goal-id="${goalId}"]`);
                                    if (goalCard) {
                                        goalCard.classList.add('goal-done');
                                        const completeBtn = goalCard.querySelector('.goal-action-btn[data-action="complete"]');
                                        if (completeBtn) {
                                            completeBtn.textContent = '↩';
                                            completeBtn.title = '撤销完成';
                                        }
                                    }
                                }
                            }
                        }
                    } catch (err) {
                        console.error(err);
                        utils.showToast?.('更新失败');
                    }
                });
            });
            
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

    // Export
    global.ScheduleAppGoalCore = {
        createGoal,
        updateGoal,
        deleteGoal,
        GOAL_COLORS,
        escapeHtml,
        formatTime,
        horizonLabel,
        fetchDeliverables,
        createDeliverable,
        updateDeliverable,
        deleteDeliverable,
        renderDeliverablesSection,
    };
})(window);
