/**
 * Schedule App - Goals Module
 * Goal planning and management functionality
 */

(function() {
    'use strict';

    const getState = () => (window.ScheduleAppCore && window.ScheduleAppCore.state) || {};
    const getElements = () => (window.ScheduleAppCore && window.ScheduleAppCore.elements) || {};
    const getUtils = () => window.ScheduleAppCore || {};

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
                    <button class="goals-view-toggle-btn ${state.goalsViewMode === 'timeline' ? 'active' : ''}" id="goalsViewToggleBtn">
                        ${state.goalsViewMode === 'timeline' ? '📋 列表' : '📊 总览'}
                    </button>
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
                state.expandedGoalIds.clear();
                renderGoalsViewSkeleton();
                if (state.goalsViewMode === 'list') {
                    await renderGoalsList();
                } else {
                    await renderTimelineView();
                }
            });
        });
        
        container.querySelector('#goalsAddBtn').addEventListener('click', () => {
            showAddGoalModal();
        });
        
        container.querySelector('#goalsDiscussBtn').addEventListener('click', () => {
            openGoalDiscussModal();
        });
        
        container.querySelector('#goalsViewToggleBtn').addEventListener('click', async () => {
            state.goalsViewMode = state.goalsViewMode === 'list' ? 'timeline' : 'list';
            renderGoalsViewSkeleton();
            if (state.goalsViewMode === 'list') {
                await renderGoalsList();
            } else {
                await renderTimelineView();
            }
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

        let listEl = elements.goalsContainer.querySelector('.goals-list');
        if (!listEl) return;
        // Clone+replace to drop accumulated event listeners from previous renders
        const listParent = listEl.parentNode;
        const freshListEl = listEl.cloneNode(false);
        listParent.replaceChild(freshListEl, listEl);
        listEl = freshListEl;
        
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

        function findGoalById(goals, id) {
            for (const g of goals) {
                if (g.id === id) return g;
                if (g.subtasks && g.subtasks.length) {
                    const found = findGoalById(g.subtasks, id);
                    if (found) return found;
                }
            }
            return null;
        }

        function formatGoalDate(start, end) {
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
        }

        function markRange(start, end, set) {
            if (!start || isNaN(start.getTime())) return;
            const e = (end && !isNaN(end.getTime())) ? end : start;
            const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
            const limit = new Date(e.getFullYear(), e.getMonth(), e.getDate() + 1);
            while (cur < limit) {
                set.add(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`);
                cur.setDate(cur.getDate() + 1);
            }
        }

        function markRangeMap(start, end, map, subtask) {
            if (!start || isNaN(start.getTime())) return;
            const e = (end && !isNaN(end.getTime())) ? end : start;
            const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
            const limit = new Date(e.getFullYear(), e.getMonth(), e.getDate() + 1);
            while (cur < limit) {
                const ds = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
                if (!map.has(ds)) map.set(ds, []);
                map.get(ds).push({ color: subtask.color || '#3b82f6', title: subtask.title, id: subtask.id });
                cur.setDate(cur.getDate() + 1);
            }
        }

        function renderMiniCalendar(goal, allGoals, year, month) {
            if (!goal.start_date && !goal.end_date) return '';
            if (year === undefined || month === undefined) {
                const sd = goal.start_date ? new Date(goal.start_date) : new Date();
                year = sd.getFullYear();
                month = sd.getMonth();
            }
            const today = new Date();

            const covered = new Set();
            const subCoveredMap = new Map();
            const others = new Set();
            if (goal.start_date || goal.end_date) {
                markRange(parseDate(goal.start_date), parseDate(goal.end_date), covered);
            }
            if (goal.subtasks) {
                for (const st of goal.subtasks) {
                    if (st.start_date || st.end_date) {
                        markRangeMap(parseDate(st.start_date), parseDate(st.end_date), subCoveredMap, st);
                    }
                }
            }
            for (const g of allGoals) {
                if (g.id === goal.id) continue;
                if (g.start_date || g.end_date) {
                    markRange(parseDate(g.start_date), parseDate(g.end_date), others);
                }
            }

            const firstDay = new Date(year, month, 1);
            const startDow = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
            const daysInMonth = new Date(year, month + 1, 0).getDate();

            let cells = '';
            for (let i = 0; i < startDow; i++) {
                cells += '<div class="goal-calendar-cell outside"></div>';
            }
            for (let d = 1; d <= daysInMonth; d++) {
                const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                let cls = 'goal-calendar-cell';
                if (covered.has(ds)) cls += ' covered';
                const subInfos = subCoveredMap.get(ds);
                if (subInfos && subInfos.length > 0) {
                    cls += ' sub-covered';
                    if (others.has(ds)) cls += ' other';
                    if (year === today.getFullYear() && month === today.getMonth() && d === today.getDate()) cls += ' today';
                    const visible = subInfos.slice(0, 3);
                    const dots = visible.map(si => `<span class="goal-calendar-dot" style="background:${si.color}"></span>`).join('');
                    const more = subInfos.length > 3 ? `<span class="goal-calendar-dot-more">+${subInfos.length - 3}</span>` : '';
                    cells += `<div class="${cls}"><span class="goal-calendar-dots">${dots}${more}</span><span class="day-num">${d}</span></div>`;
                } else {
                    if (others.has(ds)) cls += ' other';
                    if (year === today.getFullYear() && month === today.getMonth() && d === today.getDate()) cls += ' today';
                    cells += `<div class="${cls}"><span class="day-num">${d}</span></div>`;
                }
            }

            return `<div class="goal-calendar" data-goal-id="${goal.id}" data-year="${year}" data-month="${month}">
                <div class="goal-calendar-nav">
                    <button class="goal-calendar-nav-btn cal-prev" data-goal-id="${goal.id}">◀</button>
                    <span>${year}年${month + 1}月</span>
                    <button class="goal-calendar-nav-btn cal-next" data-goal-id="${goal.id}">▶</button>
                </div>
                <div class="goal-calendar-grid">
                    <div class="goal-calendar-day-header">一</div>
                    <div class="goal-calendar-day-header">二</div>
                    <div class="goal-calendar-day-header">三</div>
                    <div class="goal-calendar-day-header">四</div>
                    <div class="goal-calendar-day-header">五</div>
                    <div class="goal-calendar-day-header weekend">六</div>
                    <div class="goal-calendar-day-header weekend">日</div>
                    ${cells}
                </div>
            </div>`;
        }

        function parseDate(d) {
            if (!d) return null;
            const date = new Date(d);
            return isNaN(date.getTime()) ? null : date;
        }

        function restoreGoalExpandedState(listEl) {
            if (!state.expandedGoalIds || state.expandedGoalIds.size === 0) return;
            state.expandedGoalIds.forEach(id => {
                const card = listEl.querySelector(`.goal-card[data-goal-id="${id}"]`);
                if (!card) return;
                card.classList.add('expanded');
                const children = card.querySelector('.goal-children');
                if (children) children.classList.remove('hidden');
                const toggleBtn = card.querySelector('.goal-action-btn[data-action="toggle"]');
                if (toggleBtn) toggleBtn.textContent = '▼';
            });
        }
        
        function renderSubtasks(subtasks, depth = 1, parentId = null) {
            if (!subtasks || subtasks.length === 0 || depth > 2) return '';
            return `
                <div class="goal-subtasks depth-${depth}">
                    ${subtasks.map(st => `
                        <div class="goal-card goal-subtask${goalsSelectionActive ? ' selection-mode' : ''}${(goalsSelectionActive && state.selectionMode.goalIds.has(String(st.id))) ? ' selected' : ''}" data-goal-id="${st.id}"${st.color ? ` style="border-left: 4px solid ${st.color}"` : ''}>
                            <div class="goal-card-head">
                                <div class="goal-title-wrap">
                                    <div class="goal-title">${escapeHtml(st.title)}</div>
                                    <div class="goal-meta">${countSubtasks(st) > 0 ? countSubtasks(st) + '项' : ''}</div>
                                    ${st.start_date || st.end_date
                                        ? `<button class="goal-date-badge goal-date-btn" data-action="setDate" data-goal-id="${st.id}" title="点击设置日期"><span class="date-range">📅 ${formatGoalDate(st.start_date, st.end_date)}</span></button>`
                                        : `<button class="goal-date-badge goal-date-btn goal-date-placeholder" data-action="setDate" data-goal-id="${st.id}" title="点击设置日期">📅 设置日期</button>`}
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
                <div class="goal-card${selectionClass}${selectedClass}" data-goal-id="${goal.id}"${goal.color ? ` style="border-left: 4px solid ${goal.color}"` : ''}>
                    <div class="goal-card-head">
                        <div class="goal-title-wrap">
                            <div class="goal-title">${escapeHtml(goal.title)}</div>
                            <div class="goal-meta">${subtaskCount > 0 ? subtaskCount + '项' : ''}</div>
                            ${goal.start_date || goal.end_date
                                ? `<button class="goal-date-badge goal-date-btn" data-action="setDate" data-goal-id="${goal.id}" title="点击设置日期"><span class="date-range">📅 ${formatGoalDate(goal.start_date, goal.end_date)}</span></button>`
                                : `<button class="goal-date-badge goal-date-btn goal-date-placeholder" data-action="setDate" data-goal-id="${goal.id}" title="点击设置日期">📅 设置日期</button>`}
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
                        ${renderMiniCalendar(goal, goals)}
                        <div class="goal-deliverables-section" id="deliverables-${goal.id}"></div>
                        ${renderSubtasks(goal.subtasks)}
                        <button class="goal-add-subtask-btn" data-parent-id="${goal.id}">+ 添加子任务</button>
                    </div>
                </div>
            `;
        }).join('');

        restoreGoalExpandedState(listEl);

        // Calendar nav button delegation (◀ ▶)
        listEl.addEventListener('click', (e) => {
            const navBtn = e.target.closest('.goal-calendar-nav-btn');
            if (!navBtn) return;
            e.stopPropagation();
            const container = navBtn.closest('.goal-calendar');
            if (!container) return;
            const goalId = parseInt(navBtn.dataset.goalId);
            let newMonth = parseInt(container.dataset.month, 10);
            let newYear = parseInt(container.dataset.year, 10);
            if (navBtn.classList.contains('cal-prev')) {
                newMonth--;
                if (newMonth < 0) { newMonth = 11; newYear--; }
            } else {
                newMonth++;
                if (newMonth > 11) { newMonth = 0; newYear++; }
            }
            const goal = goals.find(g => g.id === goalId);
            if (goal) {
                container.outerHTML = renderMiniCalendar(goal, goals, newYear, newMonth);
            }
        });

        // Date badge click → open edit modal
        listEl.addEventListener('click', (e) => {
            const btn = e.target.closest('.goal-date-btn');
            if (!btn) return;
            if (state.selectionMode.active && state.selectionMode.type === 'goals') return;
            e.stopPropagation();
            const goalId = parseInt(btn.dataset.goalId);
            const goal = findGoalById(goals, goalId);
            if (!goal) return;
            const core = window.ScheduleAppCore;
            if (core && typeof core.openGoalEditModal === 'function') {
                core.openGoalEditModal(goal);
            }
        });

        // Calendar cell click → add subtask for empty date
        listEl.addEventListener('click', async (e) => {
            const cell = e.target.closest('.goal-calendar-cell');
            if (!cell) return;
            if (cell.classList.contains('sub-covered') || cell.classList.contains('outside')) return;
            if (e.target.closest('.goal-calendar-nav-btn')) return;
            if (e.target.closest('.goal-date-btn')) return;
            e.stopPropagation();
            if (state.selectionMode.active) return;
            const container = cell.closest('.goal-calendar');
            if (!container) return;
            const goalId = parseInt(container.dataset.goalId, 10);
            const year = parseInt(container.dataset.year, 10);
            const month = parseInt(container.dataset.month, 10);
            const day = parseInt(cell.querySelector('.day-num').textContent, 10);
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const title = await showPrompt(`添加子任务 (${dateStr})：`, { placeholder: '例如：调研竞品' });
            if (!title) return;
            try {
                const parentGoal = findGoalById(goals, goalId);
                const existingCount = parentGoal ? (parentGoal.subtasks?.length || 0) : 0;
                const color = GOAL_COLORS[existingCount % GOAL_COLORS.length];
                await createGoal({
                    title,
                    parent_id: goalId,
                    horizon: state.goalsHorizon,
                    start_date: new Date(year, month, day).toISOString(),
                    end_date: new Date(year, month, day).toISOString(),
                    color
                });
                showToast?.('子任务已添加');
                await renderGoalsList();
            } catch (err) {
                console.error(err);
                showToast?.('添加失败');
            }
        });

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
                                const existingSubtasks = (parentGoal && parentGoal.subtasks) || [];
                                for (let i = 0; i < result.subtasks.length; i++) {
                                    const st = result.subtasks[i];
                                    const colorIndex = (existingSubtasks.length + i) % GOAL_COLORS.length;
                                    await createGoal({
                                        title: st.title,
                                        parent_id: parseInt(goalId),
                                        horizon: state.goalsHorizon || 'short',
                                        color: GOAL_COLORS[colorIndex]
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
                        state.expandedGoalIds.delete(String(goalId));
                        showToast?.('已删除');
                        await renderGoalsList();
                    }
                } else if (action === 'toggle') {
                    const card = btn.closest('.goal-card');
                    const children = card.querySelector('.goal-children');
                    const isExpanded = card.classList.toggle('expanded');
                    children.classList.toggle('hidden', !isExpanded);
                    btn.textContent = isExpanded ? '▼' : '▶';
                    if (isExpanded) {
                        state.expandedGoalIds.add(String(goalId));
                    } else {
                        state.expandedGoalIds.delete(String(goalId));
                    }
                } else if (action === 'complete') {
                    await updateGoal(goalId, { status: 'done' });
                    state.expandedGoalIds.delete(String(goalId));
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
                        // auto-assign color based on existing sibling count
                        let color = '';
                        const parentG = findGoalById(goals, parentId);
                        if (parentG) {
                            const existingCount = (parentG.subtasks || []).length;
                            color = GOAL_COLORS[existingCount % GOAL_COLORS.length];
                        }
                        await createGoal({
                            title: title.trim(),
                            parent_id: parentId,
                            horizon: state.goalsHorizon,
                            color: color
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
        const state = getState();
        renderGoalsViewSkeleton();
        if (state.goalsViewMode === 'timeline') {
            await renderTimelineView();
        } else {
            await renderGoalsList();
        }
    }

    function renderSelectionBar(type) {
        // Use shared selection module if available
        const sel = window.ScheduleAppSelection;
        if (sel?.renderSelectionBar) {
            sel.renderSelectionBar(type);
            return;
        }
        
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
                    showToast?.(`已完成 ${count} 项`);
                    exitSelectionMode();
                    await renderGoalsList();
                }
            };
        }
    }

    function enterSelectionMode(type, seedId = null) {
        const sel = window.ScheduleAppSelection;
        if (sel?.enterSelectionMode) {
            sel.enterSelectionMode(type, seedId);
            return;
        }
        
        const state = getState();
        state.selectionMode.active = true;
        state.selectionMode.type = type;
        if (type === 'todo') state.selectionMode.goalIds.clear();
        if (type === 'goals') state.selectionMode.todoIds.clear();
        const set = type === 'goals' ? state.selectionMode.goalIds : state.selectionMode.todoIds;
        if (seedId !== null && seedId !== undefined) set.add(String(seedId));
        renderSelectionBar(type);
    }

    function exitSelectionMode() {
        const sel = window.ScheduleAppSelection;
        if (sel?.exitSelectionMode) {
            sel.exitSelectionMode();
            return;
        }
        
        const state = getState();
        state.selectionMode.active = false;
        state.selectionMode.type = null;
        state.selectionMode.todoIds.clear();
        state.selectionMode.goalIds.clear();
        const bar = document.getElementById('selectionBar');
        if (bar) bar.classList.add('hidden');
    }

    function toggleSelection(type, id) {
        const sel = window.ScheduleAppSelection;
        if (sel?.toggleSelection) {
            sel.toggleSelection(type, id);
            return;
        }
        
        const state = getState();
        const set = type === 'goals' ? state.selectionMode.goalIds : state.selectionMode.todoIds;
        const key = String(id);
        if (set.has(key)) set.delete(key);
        else set.add(key);
        renderSelectionBar(type);
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
                    horizon: state.goalsHorizon || 'short',
                    color: GOAL_COLORS[0]
                });
                closeModal();
                if (state.goalsViewMode === 'timeline') {
                    await renderTimelineView();
                } else {
                    await renderGoalsList();
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

    // ============ Timeline View (Gantt-style) ============

    function parseDate(d) {
        if (!d) return null;
        const date = new Date(d);
        return isNaN(date.getTime()) ? null : date;
    }

    function formatGoalDate(start, end) {
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
    }

    function horizonGroupLabel(horizon) {
        const labels = { short: '📅 短期目标', semester: '📆 学期目标', long: '🎯 长期目标' };
        return labels[horizon] || '目标';
    }

    function getTimelineRange(goals) {
        let minDate = null;
        let maxDate = null;
        
        function processGoal(g) {
            if (g.start_date) {
                const d = parseDate(g.start_date);
                if (d && (!minDate || d < minDate)) minDate = d;
                if (d && (!maxDate || d > maxDate)) maxDate = d;
            }
            if (g.end_date) {
                const d = parseDate(g.end_date);
                if (d && (!minDate || d < minDate)) minDate = d;
                if (d && (!maxDate || d > maxDate)) maxDate = d;
            }
            if (g.subtasks) {
                g.subtasks.forEach(st => processGoal(st));
            }
        }
        
        goals.forEach(g => processGoal(g));
        
        // Default range if no dates
        if (!minDate || !maxDate) {
            const today = new Date();
            minDate = new Date(today.getFullYear(), today.getMonth(), 1);
            maxDate = new Date(today.getFullYear(), today.getMonth() + 6, 0);
        }
        
        return { minDate, maxDate };
    }

    function generateTimelineMonths(minDate, maxDate, horizon) {
        const months = [];
        const cur = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
        const end = new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, 1);
        
        while (cur < end) {
            months.push(new Date(cur));
            cur.setMonth(cur.getMonth() + 1);
        }
        
        return months;
    }

    function getMonthWidth() {
        // Mobile-first: ~80px per month for short/semester, ~60px for long
        return 80;
    }

    function calculateGoalBarPosition(goal, minDate, monthWidth, horizon) {
        const startDate = parseDate(goal.start_date);
        const endDate = parseDate(goal.end_date);
        
        if (!startDate && !endDate) {
            return null; // Goals without dates are filtered out upstream
        }
        
        const effectiveStart = startDate || endDate;
        const effectiveEnd = endDate || startDate;
        
        const totalMonths = getMonthDiff(minDate, effectiveEnd) + 1;
        const startOffset = getMonthDiff(minDate, effectiveStart);
        
        return {
            left: startOffset * monthWidth,
            width: Math.max(totalMonths * monthWidth, monthWidth * 0.5) // Min width 0.5 month
        };
    }

    function getMonthDiff(d1, d2) {
        let months = (d2.getFullYear() - d1.getFullYear()) * 12;
        months += d2.getMonth() - d1.getMonth();
        return Math.max(0, months);
    }

    function flattenGoalsWithSubtasks(goals, parentTitle = '') {
        const result = [];
        
        function process(g, pTitle = '') {
            const item = { ...g, parentTitle: pTitle };
            result.push(item);
            if (g.subtasks && g.subtasks.length > 0) {
                g.subtasks.forEach(st => process(st, g.title));
            }
        }
        
        goals.forEach(g => process(g));
        return result;
    }

    async function renderTimelineView() {
        const state = getState();
        const elements = getElements();
        const utils = getUtils();
        const { fetchGoals, showToast } = utils;
        
        let listEl = elements.goalsContainer.querySelector('.goals-list');
        if (!listEl) return;
        
        // Clone+replace to drop accumulated event listeners
        const listParent = listEl.parentNode;
        const freshListEl = listEl.cloneNode(false);
        listParent.replaceChild(freshListEl, listEl);
        listEl = freshListEl;
        
        listEl.innerHTML = '<div class="goals-timeline-loading">加载中...</div>';
        
        try {
            // Fetch all goals from all horizons
            const [shortGoals, semesterGoals, longGoals] = await Promise.all([
                fetchGoals('short'),
                fetchGoals('semester'),
                fetchGoals('long')
            ]);
            
            const allGoalsByHorizon = {
                short: shortGoals || [],
                semester: semesterGoals || [],
                long: longGoals || []
            };
            
            const today = new Date();
            const zoom = state.timelineZoom || { short: 1, semester: 1, long: 1 };
            
            const horizonDefaults = {
                short: { backMonths: 1, forwardMonths: 3 },
                semester: { backMonths: 2, forwardMonths: 10 },
                long: { backMonths: 6, forwardMonths: 30 }
            };
            
            const horizonColors = {
                short: '#6366f1',      // Indigo
                semester: '#8b5cf6',   // Purple
                long: '#0ea5e9'        // Sky blue
            };
            
            const horizonBgGradients = {
                short: 'linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(99,102,241,0.05) 100%)',
                semester: 'linear-gradient(135deg, rgba(139,92,246,0.15) 0%, rgba(139,92,246,0.05) 100%)',
                long: 'linear-gradient(135deg, rgba(14,165,233,0.15) 0%, rgba(14,165,233,0.05) 100%)'
            };
            
            let html = '';
            
            ['short', 'semester', 'long'].forEach(horizon => {
                const goals = allGoalsByHorizon[horizon];
                const flatGoals = flattenGoalsWithSubtasks(goals);
                const goalsWithDates = flatGoals.filter(g => g.start_date || g.end_date);
                
                const groupZoom = zoom[horizon] || 1;
                const horizonColor = horizonColors[horizon];
                const horizonBg = horizonBgGradients[horizon];
                
                let horizonMinDate, horizonMaxDate;
                
                if (goalsWithDates.length > 0) {
                    const { minDate, maxDate } = getTimelineRange(goalsWithDates);
                    horizonMinDate = minDate;
                    horizonMaxDate = maxDate;
                } else {
                    const defaults = horizonDefaults[horizon];
                    horizonMinDate = new Date(today.getFullYear(), today.getMonth() - defaults.backMonths, 1);
                    horizonMaxDate = new Date(today.getFullYear(), today.getMonth() + defaults.forwardMonths + 1, 0);
                }
                
                const paddingBack = horizon === 'short' ? 1 : horizon === 'semester' ? 2 : 6;
                const paddingForward = horizon === 'short' ? 2 : horizon === 'semester' ? 3 : 6;
                horizonMinDate = new Date(horizonMinDate.getFullYear(), horizonMinDate.getMonth() - paddingBack, 1);
                horizonMaxDate = new Date(horizonMaxDate.getFullYear(), horizonMaxDate.getMonth() + paddingForward + 1, 0);
                
                const baseWidth = horizon === 'long' ? 50 : 70;
                const monthWidth = baseWidth * groupZoom;
                const months = generateTimelineMonths(horizonMinDate, horizonMaxDate, horizon);
                const totalWidth = months.length * monthWidth;
                
                const todayOffset = getMonthDiff(horizonMinDate, today);
                const todayLineLeft = todayOffset * monthWidth + monthWidth / 2;
                const showTodayLine = today >= horizonMinDate && today <= horizonMaxDate;
                
                const goalCount = goals.length;
                const datedCount = goalsWithDates.length;
                
                html += `
                    <div class="timeline-group" data-horizon="${horizon}" style="border-left: 3px solid ${horizonColor};">
                        <div class="timeline-group-header">
                            <div class="timeline-group-info">
                                <span class="timeline-group-title">${horizonGroupLabel(horizon)}</span>
                                <span class="timeline-group-count">${datedCount > 0 ? datedCount : goalCount > 0 ? goalCount : 0} 个目标</span>
                            </div>
                            <div class="timeline-group-controls">
                                <div class="timeline-zoom-slider-wrap">
                                    <span class="timeline-zoom-label">缩放</span>
                                    <input type="range" class="timeline-zoom-slider" 
                                           data-horizon="${horizon}" 
                                           min="0.25" max="4" step="0.25" 
                                           value="${groupZoom}">
                                    <span class="timeline-zoom-value">${Math.round(groupZoom * 100)}%</span>
                                </div>
                                <button class="timeline-group-toggle active" data-horizon="${horizon}">▼</button>
                            </div>
                        </div>
                        <div class="timeline-group-content" id="timeline-content-${horizon}" style="background: ${horizonBg};">
                `;
                
                if (goals.length === 0) {
                    html += `
                        <div class="timeline-empty">
                            <div class="timeline-empty-icon">${horizon === 'short' ? '📅' : horizon === 'semester' ? '📆' : '🎯'}</div>
                            <div>暂无${horizon === 'short' ? '短期' : horizon === 'semester' ? '学期' : '长期'}目标</div>
                            <button class="timeline-empty-add-btn" data-horizon="${horizon}">+ 添加目标</button>
                        </div>
                    `;
                } else if (goalsWithDates.length === 0) {
                    html += `
                        <div class="timeline-empty">
                            <div class="timeline-empty-icon">📋</div>
                            <div>暂无有日期的目标</div>
                        </div>
                    `;
                } else {
                    // Render timeline with today line inside scrollable content
                    html += `
                        <div class="timeline-scroll-container">
                            <div class="timeline-inner" style="width: ${totalWidth}px; min-width: 100%;">
                                <div class="timeline-header-row">
                                    <div class="timeline-months-row">
                                        ${months.map(m => `
                                            <div class="timeline-month-cell" style="width: ${monthWidth}px;">
                                                <span class="timeline-month-label">${m.getFullYear()}/${m.getMonth() + 1}</span>
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                                <div class="timeline-body-row">
                                    <div class="timeline-grid-row" style="width: ${totalWidth}px;">
                                        ${months.map((m, i) => `
                                            <div class="timeline-grid-cell" style="width: ${monthWidth}px; left: ${i * monthWidth}px;"></div>
                                        `).join('')}
                                    </div>
                                    ${showTodayLine ? `
                                        <div class="timeline-today-vline" style="left: ${todayLineLeft}px;">
                                            <span class="timeline-today-tag">今天</span>
                                        </div>
                                    ` : ''}
                                    <div class="timeline-bars-row">
                    `;
                    
                    goalsWithDates.forEach((goal, index) => {
                        const pos = calculateGoalBarPosition(goal, horizonMinDate, monthWidth, horizon);
                        if (!pos) return;
                        
                        const isDone = goal.status === 'done';
                        const isCancelled = goal.status === 'cancelled';
                        const barColor = goal.color || GOAL_COLORS[index % GOAL_COLORS.length];
                        const isSubtask = !!goal.parentTitle;
                        
                        const dateRangeText = formatGoalDate(goal.start_date, goal.end_date);
                        
                        html += `
                            <div class="timeline-bar ${isDone ? 'done' : ''} ${isCancelled ? 'cancelled' : ''} ${isSubtask ? 'subtask' : ''}"
                                 style="left: ${pos.left}px; width: ${pos.width}px; --bar-color: ${barColor};"
                                 data-goal-id="${goal.id}">
                                <div class="timeline-bar-inner">
                                    <span class="timeline-bar-title">${escapeHtml(goal.title)}</span>
                                </div>
                                <div class="timeline-bar-dates">${dateRangeText}</div>
                            </div>
                        `;
                    });
                    
                    html += `
                                    </div><!-- end timeline-bars-row -->
                                </div><!-- end timeline-body-row -->
                            </div><!-- end timeline-inner -->
                        </div><!-- end timeline-scroll-container -->
                    `;
                }
                
                html += `
                        </div><!-- end timeline-group-content -->
                    </div><!-- end timeline-group -->
                `;
            });
            
            listEl.innerHTML = html;
            
            // Add click handlers for goal bars
            listEl.querySelectorAll('.timeline-bar').forEach(bar => {
                bar.addEventListener('click', (e) => {
                    const goalId = parseInt(bar.dataset.goalId);
                    if (isNaN(goalId)) return;
                    
                    let goal = null;
                    Object.values(allGoalsByHorizon).forEach(horizonGoals => {
                        if (goal) return;
                        function findGoal(goals) {
                            for (const g of goals) {
                                if (g.id === goalId) { goal = g; return; }
                                if (g.subtasks) findGoal(g.subtasks);
                            }
                        }
                        findGoal(horizonGoals);
                    });
                    
                    if (goal) {
                        openGoalEditModal(goal);
                    }
                });
            });
            
            // Add toggle handlers for group collapse/expand
            listEl.querySelectorAll('.timeline-group-toggle').forEach(toggle => {
                toggle.addEventListener('click', (e) => {
                    const horizon = toggle.dataset.horizon;
                    const content = document.getElementById(`timeline-content-${horizon}`);
                    if (!content) return;
                    
                    const isExpanded = toggle.classList.toggle('active');
                    toggle.textContent = isExpanded ? '▼' : '▶';
                    content.classList.toggle('collapsed', !isExpanded);
                });
            });
            
            // Add zoom slider handlers
            listEl.querySelectorAll('.timeline-zoom-slider').forEach(slider => {
                slider.addEventListener('input', (e) => {
                    const horizon = slider.dataset.horizon;
                    const value = parseFloat(slider.value);
                    state.timelineZoom[horizon] = value;
                    slider.nextElementSibling.textContent = Math.round(value * 100) + '%';
                });
                
                slider.addEventListener('change', async (e) => {
                    await renderTimelineView();
                });
            });
            
            // Add empty state add button handler
            listEl.querySelectorAll('.timeline-empty-add-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    showAddGoalModal();
                });
            });
            
        } catch (error) {
            console.error('Error rendering timeline view:', error);
            listEl.innerHTML = '<div class="goals-timeline-error">加载失败</div>';
            showToast?.('加载失败');
        }
    }

window.ScheduleAppGoals = {
        renderGoalsViewSkeleton,
        renderGoalsReference,
        renderGoalsList,
        renderGoalsView,
        renderTimelineView,
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
        GOAL_COLORS: GOAL_COLORS,
    };

})();
