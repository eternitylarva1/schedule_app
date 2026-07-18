/**
 * Schedule App - Goals Module
 * Goal planning and management functionality
 */

(function() {
    'use strict';

    const getState = () => (window.ScheduleAppCore && window.ScheduleAppCore.state) || {};
    const getElements = () => (window.ScheduleAppCore && window.ScheduleAppCore.elements) || {};
    const getUtils = () => window.ScheduleAppCore || {};

    // Top-level references (same pattern as main.js for migrated code)
    const state = getState();
    const elements = getElements();
    const {
        apiCall,
        showToast,
        showConfirm,
        fetchGoalConversations,
        createGoalConversation,
        loadData,
    } = getUtils();

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
                                    // In-place update — add .goal-done instead of full re-render
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
                    <div class="goals-more-wrap">
                        <button class="goals-more-btn" id="goalsMoreBtn" title="更多操作">⋯</button>
                        <div class="goals-more-menu hidden" id="goalsMoreMenu">
                            <button class="goals-more-item" data-action="export">📋 导出规划</button>
                        </div>
                    </div>
                </div>
            </div>
            <div class="goals-reference hidden" id="goalsReference"></div>
            <div class="goals-list"></div>
            <!-- Export Modal -->
            <div class="export-modal-backdrop hidden" id="exportModalBackdrop">
                <div class="export-modal-content" id="exportModalContent">
                    <div class="export-modal-header">
                        <span class="export-modal-title">选择性导出</span>
                        <button class="export-modal-close" id="exportModalClose">✕</button>
                    </div>
                    <div class="export-modal-body">
                        <div class="export-options">
                            <label class="export-toggle">
                                <input type="checkbox" id="exportIncludeSubtasks" checked>
                                <span class="export-toggle-label">包含子任务</span>
                            </label>
                            <label class="export-toggle">
                                <input type="checkbox" id="exportIncludeNotes">
                                <span class="export-toggle-label">包含笔记</span>
                            </label>
                        </div>
                        <div class="export-goal-list" id="exportGoalList"></div>
                        <div class="export-preview">
                            <div class="export-preview-label">预览</div>
                            <div class="export-preview-content" id="exportPreviewContent"></div>
                        </div>
                    </div>
                    <div class="export-modal-footer">
                        <button class="export-action-btn primary" id="exportCopyBtn">📋 复制文本</button>
                        <button class="export-action-btn" id="exportDownloadBtn">⬇ 下载 .txt</button>
                    </div>
                </div>
            </div>
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
        
        // ⋯ more menu toggle
        const moreBtn = container.querySelector('#goalsMoreBtn');
        const moreMenu = container.querySelector('#goalsMoreMenu');
        if (moreBtn && moreMenu) {
            moreBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                moreMenu.classList.toggle('hidden');
            });
            // Close when clicking menu items
            moreMenu.querySelectorAll('.goals-more-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const action = item.dataset.action;
                    moreMenu.classList.add('hidden');
                    if (action === 'export') {
                        openExportModal();
                    }
                });
            });
        }
        // Global outside-click close (runs once on document, not per render)
        if (!window._goalsMoreMenuInit) {
            window._goalsMoreMenuInit = true;
            document.addEventListener('click', (e) => {
                const menu = document.getElementById('goalsMoreMenu');
                const btn = document.getElementById('goalsMoreBtn');
                if (menu && btn && !menu.classList.contains('hidden')) {
                    if (!menu.contains(e.target) && e.target !== btn) {
                        menu.classList.add('hidden');
                    }
                }
            });
        }
        
        container.querySelector('#goalsViewToggleBtn').addEventListener('click', async () => {
            state.goalsViewMode = state.goalsViewMode === 'list' ? 'timeline' : 'list';
            elements.goalsView.classList.toggle('timeline-mode', state.goalsViewMode === 'timeline');
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
        const { fetchGoals, updateGoal, deleteGoal, showToast, showToastWithUndo, showConfirm, showPrompt } = utils;

        let listEl = elements.goalsContainer.querySelector('.goals-list');
        if (!listEl) return;
        // Clone+replace to drop accumulated event listeners from previous renders
        const listParent = listEl.parentNode;
        const freshListEl = listEl.cloneNode(false);
        listParent.replaceChild(freshListEl, listEl);
        listEl = freshListEl;
        
        const goals = await fetchGoals(state.goalsHorizon);
        const activeGoals = (goals || []).filter(g => g.status !== 'done' && g.status !== 'cancelled');
        const completedGoals = (goals || []).filter(g => g.status === 'done' || g.status === 'cancelled');
        const goalsSelectionActive = state.selectionMode.active && state.selectionMode.type === 'goals';
        if (goalsSelectionActive) {
            renderSelectionBar('goals');
        }
        
        if (!activeGoals || activeGoals.length === 0) {
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
                                    <button class="goal-action-btn promote-btn" data-action="promote" data-goal-id="${st.id}" title="升级为独立目标">↗️</button>
                                    ${countSubtasks(st) > 0 ? `<button class="goal-action-btn toggle-btn" data-action="toggle" data-goal-id="${st.id}" title="展开">▶</button>` : ''}
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
        
        listEl.innerHTML = activeGoals.map(goal => {
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
                            <button class="goal-action-btn copy-goal-btn" data-action="copygoal" data-goal-id="${goal.id}" title="复制此目标">📋</button>
                            <button class="goal-action-btn discuss-btn" data-action="discuss" data-goal-id="${goal.id}" title="AI讨论">💬</button>
                            <button class="goal-action-btn edit-btn" data-action="edit" data-goal-id="${goal.id}" title="编辑">✏️</button>
                            <button class="goal-action-btn history-btn" data-action="history" data-goal-id="${goal.id}" title="历史">🕘</button>
                            <button class="goal-action-btn toggle-btn" data-action="toggle" data-goal-id="${goal.id}" title="展开">▶</button>
                            <button class="goal-action-btn complete-btn" data-action="complete" data-goal-id="${goal.id}" title="完成">✓</button>
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
        
        // Render completed goals section (collapsed by default)
        if (completedGoals.length > 0) {
            const completedHtml = completedGoals.map(goal => {
                const completedLabel = goal.status === 'cancelled' ? '已取消' : '已完成';
                const cancelledClass = goal.status === 'cancelled' ? 'cancelled' : '';
                return `
                    <div class="goal-card goal-completed ${cancelledClass}" data-goal-id="${goal.id}"${goal.color ? ` style="border-left: 4px solid ${goal.color}"` : ''}>
                        <div class="goal-card-head">
                            <div class="goal-title-wrap">
                                <span class="goal-completed-check">${goal.status === 'cancelled' ? '✕' : '✓'}</span>
                                <div class="goal-title">${escapeHtml(goal.title)}</div>
                            </div>
                            <div class="goal-completed-actions">
                                <button class="goal-action-btn restore-btn" data-action="restore" data-goal-id="${goal.id}" title="恢复为进行中">↩</button>
                                <span class="goal-completed-label">${completedLabel}</span>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
            
            listEl.innerHTML += `
                <div class="goals-completed-section">
                    <button class="goals-completed-toggle" id="goalsCompletedToggle">
                        <span>✅ 已完成 · ${completedGoals.length}项</span>
                        <span class="goals-completed-arrow">▶</span>
                    </button>
                    <div class="goals-completed-list hidden" id="goalsCompletedList">
                        ${completedHtml}
                    </div>
                </div>
            `;
            
            // Toggle handler — bind after DOM insertion
            setTimeout(() => {
                const toggle = document.getElementById('goalsCompletedToggle');
                const list = document.getElementById('goalsCompletedList');
                if (toggle && list) {
                    toggle.addEventListener('click', () => {
                        const expanded = list.classList.toggle('hidden');
                        toggle.querySelector('.goals-completed-arrow').textContent = expanded ? '▶' : '▼';
                        // Auto-scroll into view when expanding
                        if (!expanded) {
                            toggle.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                    });
                }
                
                // Click completed goal → open edit (to un-complete)
                list?.querySelectorAll('.goal-completed').forEach(card => {
                    card.addEventListener('click', (e) => {
                        if (state.selectionMode.active) return;
                        // Ignore clicks on restore button
                        if (e.target.closest('.restore-btn')) return;
                        const goalId = parseInt(card.dataset.goalId);
                        const goal = goals.find(g => g.id === goalId);
                        if (goal) openGoalEditModal(goal);
                    });
                });
                
                // Restore button → set back to active
                list?.querySelectorAll('.restore-btn').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const goalId = parseInt(btn.dataset.goalId);
                        await updateGoal(goalId, { status: 'active' });
                        state.expandedGoalIds.delete(String(goalId));
                        showToast?.('已恢复为进行中 ↩');
                        await renderGoalsList();
                    });
                });
            }, 0);
        }

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
                const result = await createGoal({
                    title,
                    parent_id: goalId,
                    horizon: state.goalsHorizon,
                    start_date: new Date(year, month, day).toISOString(),
                    end_date: new Date(year, month, day).toISOString(),
                    color
                });
                showToast?.('子任务已添加');
                // In-place DOM insert
                const newGoalId = result?.data?.id;
                if (newGoalId) {
                    const dateFmt = `${String(month + 1).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
                    const subHtml = `
                        <div class="goal-card goal-subtask" data-goal-id="${newGoalId}" style="border-left: 4px solid ${color}">
                            <div class="goal-card-head">
                                <div class="goal-title-wrap">
                                    <div class="goal-title">${escapeHtml(title)}</div>
                                    <button class="goal-date-badge goal-date-btn" data-action="setDate" data-goal-id="${newGoalId}"><span class="date-range">📅 ${dateFmt}</span></button>
                                </div>
                                <div class="goal-actions">
                                    <button class="goal-action-btn promote-btn" data-action="promote" data-goal-id="${newGoalId}" title="升级为独立目标">↗️</button>
                                    <button class="goal-action-btn decompose-btn" data-action="decompose" data-goal-id="${newGoalId}" title="AI细分">📋</button>
                                    <button class="goal-action-btn complete-btn" data-action="complete" data-goal-id="${newGoalId}" title="完成">✓</button>
                                    <button class="goal-action-btn delete-btn" data-action="delete" data-goal-id="${newGoalId}" title="删除">🗑️</button>
                                </div>
                            </div>
                            <button class="goal-add-subtask-btn" data-parent-id="${newGoalId}" data-depth="1">+ 添加子任务</button>
                        </div>
                    `;
                    const parentCard = container.closest('.goal-calendar').closest('.goal-card');
                    if (parentCard) {
                        let childrenContainer = parentCard.querySelector('.goal-children');
                        if (!childrenContainer) {
                            childrenContainer = document.createElement('div');
                            childrenContainer.className = 'goal-children';
                            const addBtn = parentCard.querySelector('.goal-add-subtask-btn');
                            if (addBtn) addBtn.parentNode.insertBefore(childrenContainer, addBtn);
                            else parentCard.appendChild(childrenContainer);
                        }
                        let subtasksWrap = childrenContainer.querySelector('.goal-subtasks');
                        if (!subtasksWrap) {
                            subtasksWrap = document.createElement('div');
                            subtasksWrap.className = 'goal-subtasks depth-1';
                            childrenContainer.appendChild(subtasksWrap);
                        }
                        subtasksWrap.insertAdjacentHTML('beforeend', subHtml);
                        childrenContainer.classList.remove('hidden');
                        parentCard.classList.add('expanded');
                    }
                }
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
                                state.expandedGoalIds.add(String(goalId));
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
                    const completedGoalId = parseInt(goalId);
                    
                    // In-place DOM update — no full re-render (preserves scroll)
                    const card = btn.closest('.goal-card');
                    if (card) {
                        // Toggle: if already done, undo; else mark done
                        const wasDone = card.classList.contains('goal-done');
                        if (wasDone) {
                            await updateGoal(completedGoalId, { status: 'active' });
                            card.classList.remove('goal-done');
                            btn.textContent = '✓';
                            btn.title = '完成';
                            showToast?.('已撤销 ↩');
                        } else {
                            await updateGoal(completedGoalId, { status: 'done' });
                            card.classList.add('goal-done');
                            btn.textContent = '↩';
                            btn.title = '撤销完成';
                            showToastWithUndo?.('已完成 ✓', async () => {
                                await updateGoal(completedGoalId, { status: 'active' });
                                card.classList.remove('goal-done');
                                btn.textContent = '✓';
                                btn.title = '完成';
                                showToast?.('已撤销 ↩');
                            });
                        }
                    }
                } else if (action === 'promote') {
                    const confirmed = await showConfirm('将此子任务升级为独立目标？\n它将从当前父目标中移除，成为顶层目标。');
                    if (confirmed) {
                        await updateGoal(parseInt(goalId), { parent_id: null, root_goal_id: null });
                        state.expandedGoalIds.delete(String(goalId));
                        showToast?.('已升级为独立目标 ↗️');
                        await renderGoalsList();
                    }
                } else if (action === 'copygoal') {
                    e.stopPropagation();
                    const gId = parseInt(btn.dataset.goalId);
                    const goal = findGoalById(goals, gId);
                    if (goal) {
                        exportSingleGoal(goal);
                    }
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
                        const result = await createGoal({
                            title: title.trim(),
                            parent_id: parentId,
                            horizon: state.goalsHorizon,
                            color: color
                        });
                        showToast?.('子任务已添加');
                        
                        // In-place DOM insert — no full re-render
                        const newGoalId = result?.data?.id;
                        if (newGoalId) {
                            const subHtml = `
                                <div class="goal-card goal-subtask" data-goal-id="${newGoalId}" style="border-left: 4px solid ${color}">
                                    <div class="goal-card-head">
                                        <div class="goal-title-wrap">
                                            <div class="goal-title">${escapeHtml(title.trim())}</div>
                                        </div>
                                        <div class="goal-actions">
                                            <button class="goal-action-btn promote-btn" data-action="promote" data-goal-id="${newGoalId}" title="升级为独立目标">↗️</button>
                                            <button class="goal-action-btn decompose-btn" data-action="decompose" data-goal-id="${newGoalId}" title="AI细分">📋</button>
                                            <button class="goal-action-btn complete-btn" data-action="complete" data-goal-id="${newGoalId}" title="完成">✓</button>
                                            <button class="goal-action-btn delete-btn" data-action="delete" data-goal-id="${newGoalId}" title="删除">🗑️</button>
                                        </div>
                                    </div>
                                    <button class="goal-add-subtask-btn" data-parent-id="${newGoalId}" data-depth="${parseInt(btn.dataset.depth || '0') + 1}">+ 添加子任务</button>
                                </div>
                            `;
                            
                            const parentCard = btn.closest('.goal-card');
                            // Find or create subtask container
                            let childrenContainer = parentCard.querySelector('.goal-children');
                            if (!childrenContainer) {
                                childrenContainer = document.createElement('div');
                                childrenContainer.className = 'goal-children';
                                // Also need a subtasks wrapper
                                const subtasksWrap = document.createElement('div');
                                subtasksWrap.className = 'goal-subtasks depth-1';
                                childrenContainer.appendChild(subtasksWrap);
                                btn.parentNode.insertBefore(childrenContainer, btn);
                            }
                            let subtasksWrap = childrenContainer.querySelector('.goal-subtasks');
                            if (!subtasksWrap) {
                                subtasksWrap = document.createElement('div');
                                subtasksWrap.className = 'goal-subtasks depth-1';
                                childrenContainer.appendChild(subtasksWrap);
                            }
                            subtasksWrap.insertAdjacentHTML('beforeend', subHtml);
                            childrenContainer.classList.remove('hidden');
                            parentCard.classList.add('expanded');
                            
                            // Bind action handlers to new buttons
                            subtasksWrap.querySelectorAll('.goal-action-btn').forEach(newBtn => {
                                newBtn.addEventListener('click', async (ev) => {
                                    ev.stopPropagation();
                                    const act = newBtn.dataset.action;
                                    const gId = newBtn.dataset.goalId;
                                    if (act === 'promote') {
                                        const confirmed = await showConfirm?.('将此子任务升级为独立目标？');
                                        if (confirmed) {
                                            await updateGoal(parseInt(gId), { parent_id: null, root_goal_id: null });
                                            showToast?.('已升级 ↗️');
                                            await renderGoalsList();
                                        }
                                    } else if (act === 'decompose') {
                                        const { apiCall } = utils;
                                        showToast?.('AI 正在细分任务...');
                                        const r = await apiCall('llm/breakdown', {
                                            method: 'POST', body: JSON.stringify({ text: title.trim(), horizon: state.goalsHorizon || 'short' })
                                        });
                                        if (r?.subtasks) {
                                            for (const st of r.subtasks) {
                                                await createGoal({ title: st.title, parent_id: parseInt(gId), horizon: state.goalsHorizon || 'short', color: GOAL_COLORS[(r.subtasks.indexOf(st)+1) % GOAL_COLORS.length] });
                                            }
                                            showToast?.(`已添加 ${r.subtasks.length} 个子任务`);
                                            await renderGoalsList();
                                        }
                                    } else if (act === 'complete') {
                                        await updateGoal(parseInt(gId), { status: 'done' });
                                        const card = newBtn.closest('.goal-card');
                                        card.classList.add('goal-done');
                                        newBtn.textContent = '↩';
                                        newBtn.title = '撤销完成';
                                        newBtn.addEventListener('click', async () => {
                                            await updateGoal(parseInt(gId), { status: 'active' });
                                            card.classList.remove('goal-done');
                                            newBtn.textContent = '✓';
                                            newBtn.title = '完成';
                                        });
                                    } else if (act === 'delete') {
                                        const confirmed = await showConfirm?.('确定删除？');
                                        if (confirmed) {
                                            await deleteGoal(parseInt(gId));
                                            newBtn.closest('.goal-card').remove();
                                        }
                                    }
                                });
                            });
                        }
                        // Don't call renderGoalsList — preserves scroll
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
        const elements = getElements();
        renderGoalsViewSkeleton();
        // Toggle full-width mode for timeline view
        elements.goalsView.classList.toggle('timeline-mode', state.goalsViewMode === 'timeline');
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
        const colors = (window.ScheduleAppGoals && window.ScheduleAppGoals.GOAL_COLORS) || [
            '#4CAF50', '#FF5722', '#9C27B0', '#00BCD4',
            '#FF9800', '#607D8B', '#E91E63', '#3F51B5',
            '#8BC34A', '#795548'
        ];
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
                                ${colors.map(c => `
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
        
        // Color picker click handler
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
            
            const result = await updateGoal(goal.id, updates);
            if (result) {
                showToast('已保存');
                closeModal();
                // In-place DOM update — no full re-render
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
                const draftGoal = await createGoal({
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
                const draftGoal = await createGoal({
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

        // Bind reschedule button - ask AI to reschedule from global view
        const rescheduleBtn = document.getElementById('discussRescheduleBtn');
        if (rescheduleBtn) {
            rescheduleBtn.addEventListener('click', rescheduleGoalDiscuss);
        }

        // Bind add task button - manually add a task
        const addTaskBtn = document.getElementById('discussAddTaskBtn');
        if (addTaskBtn) {
            addTaskBtn.addEventListener('click', () => showManualAddTask());
        }

        // Bind decompose button for each subtask
        document.querySelectorAll('.discuss-subtask-decompose').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const index = parseInt(e.target.dataset.index);
                await decomposeSubtask(index);
            });
        });

        // Bind import button
        const importBtn = document.getElementById('importSelectedBtn');
        if (importBtn) {
            importBtn.addEventListener('click', () => showImportModal());
        }
    }
    
    function showManualAddTask() {
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
        if (goalDiscussState.goalId && goalDiscussState.mode === 'history') {
            if (goalDiscussState.conversationHistory.length > 0) {
                for (const msg of goalDiscussState.conversationHistory) {
                    await createGoalConversation(goalDiscussState.goalId, {
                        role: msg.role,
                        content: msg.content
                    });
                }
            }
            if (goalDiscussState.currentSubtasks.length > 0) {
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
            let finalGoalId = goalDiscussState.goalId;
            
            if (finalGoalId) {
                await updateGoal(finalGoalId, {
                    title: goalDiscussState.goalContent
                });
            } else {
                const goalResult = await createGoal({
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
                    await createGoal({
                        title: st.title,
                        parent_id: finalGoalId,
                        horizon: state.goalsHorizon,
                        order: i
                    });
                }

                if (goalDiscussState.conversationHistory.length > 0) {
                    for (const msg of goalDiscussState.conversationHistory) {
                        await createGoalConversation(finalGoalId, {
                            role: msg.role,
                            content: msg.content
                        });
                    }
                }
            }

            showToast('目标已保存');
            closeGoalDiscussModal();
            await renderGoalsList();
        } catch (error) {
            console.error('Save goal error:', error);
            showToast('保存失败: ' + error.message);
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

    /**
     * Calculate bar position using percentage-based positioning
     * @param {Date} startDate - Goal start date
     * @param {Date} endDate - Goal end date
     * @param {Date} rangeStart - Timeline range start
     * @param {Date} rangeEnd - Timeline range end
     * @returns {{left: string, width: string}} - Percentages for left and width
     */
    function calcBarPercent(startDate, endDate, rangeStart, rangeEnd) {
        const msPerDay = 86400000;
        const totalDays = (rangeEnd - rangeStart) / msPerDay;
        
        const effectiveStart = startDate || endDate;
        const effectiveEnd = endDate || startDate;
        
        const leftDays = (effectiveStart - rangeStart) / msPerDay;
        const widthDays = (effectiveEnd - effectiveStart) / msPerDay + 1; // inclusive
        
        const leftPct = (leftDays / totalDays * 100).toFixed(1);
        const widthPct = Math.max(widthDays / totalDays * 100, 3).toFixed(1);
        
        return {
            left: leftPct + '%',
            width: widthPct + '%'
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
                
                const baseWidth = horizon === 'long' ? 80 : 100;
                let monthWidth = baseWidth * groupZoom;
                const months = generateTimelineMonths(horizonMinDate, horizonMaxDate, horizon);
                let totalWidth = months.length * monthWidth;
                
                // Responsive: ensure timeline fills at least 85% of typical mobile/desktop view
                // If content is too narrow, scale month width up proportionally
                const minFillWidth = horizon === 'short' ? 750 : horizon === 'semester' ? 800 : 850;
                if (totalWidth < minFillWidth && months.length > 0) {
                    monthWidth = Math.max(monthWidth, minFillWidth / months.length);
                    totalWidth = months.length * monthWidth;
                }
                
                const todayOffset = getMonthDiff(horizonMinDate, today);
                const todayLineLeft = todayOffset * monthWidth + monthWidth / 2;
                const showTodayLine = today >= horizonMinDate && today <= horizonMaxDate;
                
                const goalCount = goals.length;
                const datedCount = goalsWithDates.length;
                
                // Format date range for header
                const headerDateRange = goalsWithDates.length > 0 
                    ? ` · ${formatGoalDate(horizonMinDate, horizonMaxDate)}` 
                    : '';
                
                html += `
                    <div class="timeline-group" data-horizon="${horizon}" style="border-left: 3px solid ${horizonColor};">
                        <div class="timeline-group-header">
                            <div class="timeline-group-info">
                                <span class="timeline-group-title">${horizonGroupLabel(horizon)}</span>
                                <span class="timeline-group-count">${datedCount > 0 ? datedCount : goalCount > 0 ? goalCount : 0} 个目标</span>
                                ${headerDateRange ? `<span class="timeline-group-daterange">${headerDateRange}</span>` : ''}
                            </div>
                            <div class="timeline-group-controls">
                                <button class="timeline-today-btn" data-horizon="${horizon}" data-scroll-to="${todayLineLeft}" title="回到今天">📍 今天</button>
                                <div class="timeline-zoom-slider-wrap">
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
                            <div class="timeline-empty-hint">设定日期后可在此查看时间规划</div>
                            <button class="timeline-empty-add-btn" data-horizon="${horizon}">+ 添加目标</button>
                        </div>
                    `;
                } else if (goalsWithDates.length === 0) {
                    html += `
                        <div class="timeline-empty">
                            <div class="timeline-empty-icon">📋</div>
                            <div>暂无有日期的目标</div>
                            <div class="timeline-empty-hint">为目标设置开始/结束日期后，将在时间轴上显示</div>
                        </div>
                    `;
                } else {
                    // Render row-based timeline (Plan A: Label First + Abbreviated Gantt)
                    html += `
                        <div class="timeline-rows-container">
                            <div class="timeline-header-row">
                                <div class="timeline-months-row">
                                    ${months.map(m => `
                                        <div class="tl-month-cell">
                                            <span class="tl-month-label">${m.getFullYear()}/${m.getMonth() + 1}</span>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                            <div class="timeline-goals-list">
                    `;
                    
                    // Process goals with subtasks
                    const processedIds = new Set();
                    
                    goalsWithDates.forEach((goal, index) => {
                        if (processedIds.has(goal.id)) return;
                        processedIds.add(goal.id);
                        
                        const isDone = goal.status === 'done';
                        const isCancelled = goal.status === 'cancelled';
                        const barColor = goal.color || GOAL_COLORS[index % GOAL_COLORS.length];
                        
                        // Find subtasks of this goal
                        const subtasks = goalsWithDates.filter(g => g.parentTitle === goal.title && !processedIds.has(g.id));
                        subtasks.forEach(st => processedIds.add(st.id));
                        
                        // Calculate bar percentages
                        const barPos = calcBarPercent(
                            parseDate(goal.start_date),
                            parseDate(goal.end_date),
                            horizonMinDate,
                            horizonMaxDate
                        );
                        
                        // Format date range for display
                        const startDt = parseDate(goal.start_date);
                        const endDt = parseDate(goal.end_date);
                        const dateDisplay = startDt && endDt
                            ? `${String(startDt.getMonth() + 1).padStart(2, '0')}/${String(startDt.getDate()).padStart(2, '0')} — ${String(endDt.getMonth() + 1).padStart(2, '0')}/${String(endDt.getDate()).padStart(2, '0')}`
                            : startDt
                                ? `${String(startDt.getMonth() + 1).padStart(2, '0')}/${String(startDt.getDate()).padStart(2, '0')}`
                                : '未设日期';
                        
                        // Render parent goal (3-row structure)
                        html += `
                            <div class="tl-goal ${isDone ? 'done' : ''} ${isCancelled ? 'cancelled' : ''}"
                                 data-goal-id="${goal.id}">
                                <div class="tl-goal-title">${escapeHtml(goal.title)}</div>
                                <div class="tl-goal-dates">${dateDisplay}</div>
                                <div class="tl-goal-bar-wrap">
                                    <div class="tl-goal-bar" style="left: ${barPos.left}; width: ${barPos.width}; --bar-color: ${barColor};"></div>
                                </div>
                            </div>
                        `;
                        
                        // Render subtask rows (3-row structure, indented)
                        subtasks.forEach(st => {
                            const stIsDone = st.status === 'done';
                            const stIsCancelled = st.status === 'cancelled';
                            const stBarColor = st.color || barColor;
                            
                            const stBarPos = calcBarPercent(
                                parseDate(st.start_date),
                                parseDate(st.end_date),
                                horizonMinDate,
                                horizonMaxDate
                            );
                            
                            const stStartDt = parseDate(st.start_date);
                            const stEndDt = parseDate(st.end_date);
                            const stDateDisplay = stStartDt && stEndDt
                                ? `${String(stStartDt.getMonth() + 1).padStart(2, '0')}/${String(stStartDt.getDate()).padStart(2, '0')} — ${String(stEndDt.getMonth() + 1).padStart(2, '0')}/${String(stEndDt.getDate()).padStart(2, '0')}`
                                : stStartDt
                                    ? `${String(stStartDt.getMonth() + 1).padStart(2, '0')}/${String(stStartDt.getDate()).padStart(2, '0')}`
                                    : '未设日期';
                            
                            html += `
                                <div class="tl-goal tl-goal-sub ${stIsDone ? 'done' : ''} ${stIsCancelled ? 'cancelled' : ''}"
                                     data-goal-id="${st.id}">
                                    <div class="tl-goal-title">└ ${escapeHtml(st.title)} <button class="tl-promote-btn" data-action="promote" data-goal-id="${st.id}" title="升级为独立目标">↗️</button></div>
                                    <div class="tl-goal-dates">${stDateDisplay}</div>
                                    <div class="tl-goal-bar-wrap">
                                        <div class="tl-goal-bar" style="left: ${stBarPos.left}; width: ${stBarPos.width}; --bar-color: ${stBarColor};"></div>
                                    </div>
                                </div>
                            `;
                        });
                    });
                    
                    // Add today divider at the end of the list
                    if (showTodayLine) {
                        html += `
                            <div class="tl-today-divider">
                                <span class="tl-today-divider-text">📍 今天</span>
                            </div>
                        `;
                    }
                    
                    html += `
                            </div><!-- end timeline-goals-list -->
                        </div><!-- end timeline-rows-container -->
                    `;
                }
                
                html += `
                        </div><!-- end timeline-group-content -->
                    </div><!-- end timeline-group -->
                `;
            });
            
            listEl.innerHTML = html;
            
            // Add click handlers for goal blocks
            listEl.querySelectorAll('.tl-goal').forEach(goalEl => {
                goalEl.addEventListener('click', (e) => {
                    const goalId = parseInt(goalEl.dataset.goalId);
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
            
            // Add click handlers for promote buttons in timeline view
            listEl.querySelectorAll('.tl-promote-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const goalId = parseInt(btn.dataset.goalId);
                    if (isNaN(goalId)) return;
                    const { showConfirm } = utils;
                    const confirmed = await showConfirm('将此子任务升级为独立目标？\n它将从当前父目标中移除，成为顶层目标。');
                    if (confirmed) {
                        await updateGoal(goalId, { parent_id: null, root_goal_id: null });
                        showToast?.('已升级为独立目标 ↗️');
                        await renderTimelineView();
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
            
            // Add "Back to Today" button handler - scroll header row to show today marker
            listEl.querySelectorAll('.timeline-today-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const container = listEl.querySelector('.timeline-rows-container');
                    const todayMarker = container?.querySelector('.tl-today-marker');
                    if (todayMarker) {
                        const markerLeft = parseFloat(todayMarker.style.left);
                        container.scrollTo({
                            left: (markerLeft / 100) * container.scrollWidth - container.clientWidth / 2,
                            behavior: 'smooth'
                        });
                    }
                });
            });
            
        } catch (error) {
            console.error('Error rendering timeline view:', error);
            listEl.innerHTML = '<div class="goals-timeline-error">加载失败</div>';
            showToast?.('加载失败');
        }
    }

    // Track export modal state
    let _exportModalInitialized = false;
    
    function initExportModal() {
        if (_exportModalInitialized) return;
        _exportModalInitialized = true;
        
        const backdrop = document.getElementById('exportModalBackdrop');
        const closeBtn = document.getElementById('exportModalClose');
        const includeSubtasks = document.getElementById('exportIncludeSubtasks');
        const includeNotes = document.getElementById('exportIncludeNotes');
        const goalList = document.getElementById('exportGoalList');
        const preview = document.getElementById('exportPreviewContent');
        const copyBtn = document.getElementById('exportCopyBtn');
        const downloadBtn = document.getElementById('exportDownloadBtn');
        
        if (!backdrop) return;
        
        const close = () => { backdrop.classList.add('hidden'); };
        backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
        closeBtn.addEventListener('click', close);
        
        function updatePreview() {
            const checked = goalList.querySelectorAll('.export-goal-item.selected');
            const includeSt = includeSubtasks.checked;
            const includeNt = includeNotes.checked;
            
            let text = '';
            checked.forEach(item => {
                const goalId = parseInt(item.dataset.goalId);
                const goal = _exportAllGoals.find(g => g.id === goalId);
                if (!goal) return;
                
                const horizonLabel = goal.horizon === 'short' ? '短期' : goal.horizon === 'semester' ? '学期' : '长期';
                text += `▸ ${goal.title} (${horizonLabel})\n`;
                
                if (includeSt && goal.subtasks) {
                    goal.subtasks.forEach(st => {
                        const tag = st.status === 'done' ? ' [done]' : st.status === 'cancelled' ? ' [cancelled]' : '';
                        text += `  ├─ ${st.title}${tag}\n`;
                    });
                }
                text += '\n';
            });
            
            preview.textContent = text || '(未选择目标)';
        }
        
        function getExportText() {
            const checked = goalList.querySelectorAll('.export-goal-item.selected');
            const includeSt = includeSubtasks.checked;
            const includeNt = includeNotes.checked;
            const now = new Date();
            const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
            
            let text = `【我的规划快照 - ${dateStr}】\n\n`;
            
            checked.forEach(item => {
                const goalId = parseInt(item.dataset.goalId);
                const goal = _exportAllGoals.find(g => g.id === goalId);
                if (!goal) return;
                
                const horizonLabel = goal.horizon === 'short' ? '短期' : goal.horizon === 'semester' ? '学期' : '长期';
                text += `▸ ${goal.title} (${horizonLabel})\n`;
                
                if (includeSt && goal.subtasks) {
                    goal.subtasks.forEach((st, i) => {
                        const isLast = i === goal.subtasks.length - 1;
                        const prefix = isLast ? '  └─ ' : '  ├─ ';
                        const tag = st.status === 'done' ? ' [done]' : st.status === 'cancelled' ? ' [cancelled]' : '';
                        text += `${prefix}${st.title}${tag}\n`;
                    });
                }
                text += '\n';
            });
            
            text += '— 由 Schedule App 导出';
            return text;
        }
        
        includeSubtasks.addEventListener('change', updatePreview);
        includeNotes.addEventListener('change', updatePreview);
        
        goalList.addEventListener('click', (e) => {
            const item = e.target.closest('.export-goal-item');
            if (!item) return;
            item.classList.toggle('selected');
            item.querySelector('.export-goal-check').textContent = 
                item.classList.contains('selected') ? '☑' : '☐';
            updatePreview();
        });
        
        copyBtn.addEventListener('click', async () => {
            const text = getExportText();
            try {
                await navigator.clipboard.writeText(text);
                getUtils().showToast?.('已复制 📋');
            } catch (err) {
                getUtils().showToast?.('复制失败');
            }
        });
        
        downloadBtn.addEventListener('click', () => {
            const text = getExportText();
            const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `规划快照_${new Date().toISOString().slice(0, 10)}.txt`;
            a.click();
            URL.revokeObjectURL(url);
        });
    }
    
    let _exportAllGoals = [];
    
    async function exportSingleGoal(goal) {
        const { showToast } = getUtils();
        const now = new Date();
        const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
        
        const horizonLabel = goal.horizon === 'short' ? '短期' : goal.horizon === 'semester' ? '学期' : '长期';
        let text = `【${goal.title} - ${dateStr}】\n\n`;
        
        text += `${goal.title} (${horizonLabel})\n`;
        if (goal.description) text += `${goal.description}\n`;
        
        if (goal.subtasks && goal.subtasks.length > 0) {
            goal.subtasks.forEach((st, i) => {
                const isLast = i === goal.subtasks.length - 1;
                const prefix = isLast ? '└─ ' : '├─ ';
                const tag = st.status === 'done' ? ' [done]' : st.status === 'cancelled' ? ' [cancelled]' : '';
                text += `${prefix}${st.title}${tag}\n`;
                if (st.subtasks) {
                    st.subtasks.forEach((sst, j) => {
                        const isLastSst = j === st.subtasks.length - 1;
                        const sprefix = '   ' + (isLast ? '  ' : '│ ') + (isLastSst ? '└─ ' : '├─ ');
                        const sstTag = sst.status === 'done' ? ' [done]' : '';
                        text += `${sprefix}${sst.title}${sstTag}\n`;
                    });
                }
            });
        }
        
        text += '\n— 由 Schedule App 导出';
        
        try {
            await navigator.clipboard.writeText(text);
            showToast?.('已复制 📋');
        } catch (err) {
            showToast?.('复制失败');
        }
    }
    
    async function openExportModal() {
        const { fetchGoals, showToast } = getUtils();
        
        try {
            const [shortGoals, semesterGoals, longGoals] = await Promise.all([
                fetchGoals('short'),
                fetchGoals('semester'),
                fetchGoals('long')
            ]);
            
            _exportAllGoals = [...(shortGoals || []), ...(semesterGoals || []), ...(longGoals || [])];
            
            const goalList = document.getElementById('exportGoalList');
            if (!goalList) return;
            
            goalList.innerHTML = _exportAllGoals.map(goal => `
                <div class="export-goal-item selected" data-goal-id="${goal.id}">
                    <span class="export-goal-check">☑</span>
                    <span class="export-goal-title">${escapeHtml(goal.title)}<span class="export-goal-horizon">${goal.horizon === 'short' ? '短期' : goal.horizon === 'semester' ? '学期' : '长期'}</span></span>
                </div>
            `).join('');
            
            // Show modal
            const backdrop = document.getElementById('exportModalBackdrop');
            backdrop.classList.remove('hidden');
            
            // Init handlers (only once)
            initExportModal();
            
            // Trigger initial preview
            const includeSubtasks = document.getElementById('exportIncludeSubtasks');
            includeSubtasks.dispatchEvent(new Event('change'));
        } catch (err) {
            console.error('Export modal error:', err);
            getUtils().showToast?.('加载失败');
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
        closeGoalDiscussModal,
        showAddGoalModal,
        createGoal,
        updateGoal,
        deleteGoal,
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
        startGoalDiscuss,
        saveGoalDiscuss,
        GOAL_COLORS: GOAL_COLORS,
    };

    // Global for inline onclick handlers (Breakdown items)
    window.updateBreakdownItem = function(idx, field, value) {
        state.breakdownItems[idx][field] = value;
    };

})();
