/**
 * Schedule App - Goals List Module
 * List/group view rendering and selection
 */

(function(global) {
    'use strict';

    const getState = () => (global.ScheduleAppCore && global.ScheduleAppCore.state) || {};
    const getElements = () => (global.ScheduleAppCore && global.ScheduleAppCore.elements) || {};
    const getUtils = () => global.ScheduleAppCore || {};

    // Cross-module reference accessor (avoids circular dependency issues)
    const Goals = () => global.ScheduleAppGoals || {};

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
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
                Goals().renderGoalsViewSkeleton();
                if (state.goalsViewMode === 'list') {
                    await Goals().renderGoalsList();
                } else {
                    await Goals().renderTimelineView();
                }
            });
        });
        
        container.querySelector('#goalsAddBtn').addEventListener('click', () => {
            Goals().showAddGoalModal();
        });
        
        container.querySelector('#goalsDiscussBtn').addEventListener('click', () => {
            Goals().openGoalDiscussModal();
        });
        
        const moreBtn = container.querySelector('#goalsMoreBtn');
        const moreMenu = container.querySelector('#goalsMoreMenu');
        if (moreBtn && moreMenu) {
            moreBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                moreMenu.classList.toggle('hidden');
            });
            moreMenu.querySelectorAll('.goals-more-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const action = item.dataset.action;
                    moreMenu.classList.add('hidden');
                    if (action === 'export') {
                        Goals().openExportModal && Goals().openExportModal();
                    }
                });
            });
        }
        
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
            Goals().renderGoalsViewSkeleton();
            if (state.goalsViewMode === 'list') {
                await Goals().renderGoalsList();
            } else {
                await Goals().renderTimelineView();
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

    function formatTime(date) {
        if (!date) return '';
        const d = new Date(date);
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    
    async function renderGoalsList() {
        const state = getState();
        const elements = getElements();
        const utils = getUtils();
        const { fetchGoals, showToast, showToastWithUndo, showConfirm, showPrompt } = utils;
        const G = Goals();

        let listEl = elements.goalsContainer.querySelector('.goals-list');
        if (!listEl) return;
        const listParent = listEl.parentNode;
        const freshListEl = listEl.cloneNode(false);
        listParent.replaceChild(freshListEl, listEl);
        listEl = freshListEl;
        
        const goals = await fetchGoals(state.goalsHorizon);
        const activeGoals = (goals || []).filter(g => g.status !== 'done' && g.status !== 'cancelled');
        const completedGoals = (goals || []).filter(g => g.status === 'done' || g.status === 'cancelled');
        const goalsSelectionActive = state.selectionMode.active && state.selectionMode.type === 'goals';
        if (goalsSelectionActive) {
            G.renderSelectionBar && G.renderSelectionBar('goals');
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
                if (btn) btn.addEventListener('click', () => G.openGoalDiscussModal && G.openGoalDiscussModal());
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

        function parseDate(d) {
            if (!d) return null;
            const date = new Date(d);
            return isNaN(date.getTime()) ? null : date;
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

        function horizonLabel(horizon) {
            const labels = { short: '短期目标', semester: '学期目标', long: '长期目标' };
            return labels[horizon] || '目标';
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
            if (!subtasks || subtasks.length === 0) return '';
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
                            <button class="goal-add-subtask-btn" data-action="addsubtask" data-parent-id="${st.id}" data-depth="${depth}">+ 添加子任务</button>
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
                        <button class="goal-add-subtask-btn" data-action="addsubtask" data-parent-id="${goal.id}">+ 添加子任务</button>
                    </div>
                </div>
            `;
        }).join('');
        
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
            
            setTimeout(() => {
                const toggle = document.getElementById('goalsCompletedToggle');
                const list = document.getElementById('goalsCompletedList');
                if (toggle && list) {
                    toggle.addEventListener('click', () => {
                        const expanded = list.classList.toggle('hidden');
                        toggle.querySelector('.goals-completed-arrow').textContent = expanded ? '▶' : '▼';
                        if (!expanded) {
                            toggle.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                    });
                }
                
                list?.querySelectorAll('.goal-completed').forEach(card => {
                    card.addEventListener('click', (e) => {
                        if (state.selectionMode.active) return;
                        if (e.target.closest('.restore-btn')) return;
                        const goalId = parseInt(card.dataset.goalId);
                        const goal = goals.find(g => g.id === goalId);
                        if (goal && G.openGoalEditModal) G.openGoalEditModal(goal);
                    });
                });
                
                list?.querySelectorAll('.restore-btn').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const goalId = parseInt(btn.dataset.goalId);
                        await G.updateGoal(goalId, { status: 'active' });
                        state.expandedGoalIds.delete(String(goalId));
                        showToast?.('已恢复为进行中 ↩');
                        await G.renderGoalsList();
                    });
                });
            }, 0);
        }

        restoreGoalExpandedState(listEl);

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

        listEl.addEventListener('click', (e) => {
            const btn = e.target.closest('.goal-date-btn');
            if (!btn) return;
            if (state.selectionMode.active && state.selectionMode.type === 'goals') return;
            e.stopPropagation();
            const goalId = parseInt(btn.dataset.goalId);
            const goal = findGoalById(goals, goalId);
            if (!goal) return;
            const core = global.ScheduleAppCore;
            if (core && typeof core.openGoalEditModal === 'function') {
                core.openGoalEditModal(goal);
            }
        });

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
                const GOAL_COLORS = (G.GOAL_COLORS || []);
                const color = GOAL_COLORS[existingCount % GOAL_COLORS.length];
                const result = await G.createGoal({
                    title,
                    parent_id: goalId,
                    horizon: state.goalsHorizon,
                    start_date: new Date(year, month, day).toISOString(),
                    end_date: new Date(year, month, day).toISOString(),
                    color
                });
                showToast?.('子任务已添加');
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
                        
                        subtasksWrap.querySelectorAll('.goal-add-subtask-btn').forEach(addBtn => {
                            addBtn.addEventListener('click', async (ev) => {
                                ev.stopPropagation();
                                const pId = parseInt(addBtn.dataset.parentId);
                                const stTitle = await showPrompt?.('输入子任务名称：');
                                if (!stTitle?.trim()) return;
                                const GOAL_COLORS2 = (G.GOAL_COLORS || []);
                                await G.createGoal({ title: stTitle.trim(), parent_id: pId, horizon: state.goalsHorizon, color: GOAL_COLORS2[Math.floor(Math.random() * GOAL_COLORS2.length)] });
                                showToast?.('子任务已添加');
                                await G.renderGoalsList();
                            });
                        });
                    }
                }
            } catch (err) {
                console.error(err);
                showToast?.('添加失败');
            }
        });

        listEl.addEventListener('click', async (e) => {
            const actionBtn = e.target.closest('[data-action]');
            if (!actionBtn) return;
            if (state.selectionMode.active && state.selectionMode.type === 'goals') return;
            
            e.stopPropagation();
            const action = actionBtn.dataset.action;
            const goalId = actionBtn.dataset.goalId ? parseInt(actionBtn.dataset.goalId) : null;
            
            if (action === 'discuss') {
                G.openGoalDiscussModal && G.openGoalDiscussModal(goalId);
            } else if (action === 'history') {
                await (G.openGoalHistoryModal && G.openGoalHistoryModal(goalId));
            } else if (action === 'toggle') {
                const card = actionBtn.closest('.goal-card');
                const children = card.querySelector('.goal-children');
                const expanded = card.classList.toggle('expanded');
                children.classList.toggle('hidden', !expanded);
                actionBtn.textContent = expanded ? '▼' : '▶';
                if (expanded) state.expandedGoalIds.add(String(goalId));
                else state.expandedGoalIds.delete(String(goalId));
            } else if (action === 'complete') {
                const card = actionBtn.closest('.goal-card');
                const wasDone = card.classList.contains('goal-done');
                if (wasDone) {
                    await G.updateGoal(goalId, { status: 'active' });
                    card.classList.remove('goal-done');
                    actionBtn.textContent = '✓';
                    actionBtn.title = '完成';
                    showToast?.('已撤销 ↩');
                } else {
                    await G.updateGoal(goalId, { status: 'done' });
                    card.classList.add('goal-done');
                    actionBtn.textContent = '↩';
                    actionBtn.title = '撤销完成';
                    showToastWithUndo?.('已完成 ✓', async () => {
                        await G.updateGoal(goalId, { status: 'active' });
                        card.classList.remove('goal-done');
                        actionBtn.textContent = '✓';
                        actionBtn.title = '完成';
                        showToast?.('已撤销 ↩');
                    });
                }
            } else if (action === 'delete') {
                const confirmed = await showConfirm('确定删除这个目标吗？');
                if (confirmed) {
                    await G.deleteGoal(goalId);
                    state.expandedGoalIds.delete(String(goalId));
                    actionBtn.closest('.goal-card')?.remove();
                    showToast?.('已删除');
                    if (!document.querySelector('.goal-card:not(.goal-completed)')) {
                        await G.renderGoalsList();
                    }
                }
            } else if (action === 'promote') {
                const confirmed = await showConfirm('将此子任务升级为独立目标？\n它将从当前父目标中移除，成为顶层目标。');
                if (confirmed) {
                    await G.updateGoal(goalId, { parent_id: null, root_goal_id: null });
                    showToast?.('已升级为独立目标 ↗️');
                    await G.renderGoalsList();
                }
            } else if (action === 'edit') {
                const goal = (state.goals || goals).find(g => g.id === goalId);
                if (goal && G.openGoalEditModal) await G.openGoalEditModal(goal);
            } else if (action === 'copygoal') {
                const goal = findGoalById(goals, goalId);
                if (goal && G.exportSingleGoal) G.exportSingleGoal(goal);
            } else if (action === 'decompose') {
                const { apiCall } = utils;
                showToast?.('AI 正在细分任务...');
                const titleEl = actionBtn.closest('.goal-card')?.querySelector('.goal-title');
                const targetTitle = (titleEl?.textContent || '').replace(/^└ /, '');
                const result = await apiCall('llm/breakdown', {
                    method: 'POST',
                    body: JSON.stringify({ text: targetTitle, horizon: state.goalsHorizon || 'short' })
                });
                if (result?.subtasks) {
                    const GOAL_COLORS3 = (G.GOAL_COLORS || []);
                    for (let i = 0; i < result.subtasks.length; i++) {
                        await G.createGoal({
                            title: result.subtasks[i].title,
                            parent_id: goalId,
                            horizon: state.goalsHorizon || 'short',
                            color: GOAL_COLORS3[(i + 1) % GOAL_COLORS3.length]
                        });
                    }
                    showToast?.(`已添加 ${result.subtasks.length} 个子任务`);
                    await G.renderGoalsList();
                }
            } else if (action === 'addsubtask') {
                const parentId = parseInt(actionBtn.dataset.parentId);
                const depth = parseInt(actionBtn.dataset.depth || '0');
                const title = await showPrompt('输入子任务名称：', { placeholder: '例如：完成第一章复习' });
                if (!title?.trim()) return;
                try {
                    const GOAL_COLORS4 = (G.GOAL_COLORS || []);
                    const color = GOAL_COLORS4[Math.floor(Math.random() * GOAL_COLORS4.length)];
                    const result = await G.createGoal({ title: title.trim(), parent_id: parentId, horizon: state.goalsHorizon, color });
                    showToast?.('子任务已添加');
                    const newId = result?.data?.id;
                    if (newId) {
                        const subHtml = [
                            '<div class="goal-card goal-subtask" data-goal-id="' + newId + '" style="border-left: 4px solid ' + color + '">',
                            '  <div class="goal-card-head">',
                            '    <div class="goal-title-wrap">',
                            '      <div class="goal-title">' + escapeHtml(title.trim()) + '</div>',
                            '    </div>',
                            '    <div class="goal-actions">',
                            '      <button class="goal-action-btn promote-btn" data-action="promote" data-goal-id="' + newId + '" title="升级为独立目标">↗️</button>',
                            '      <button class="goal-action-btn decompose-btn" data-action="decompose" data-goal-id="' + newId + '" title="AI细分">📋</button>',
                            '      <button class="goal-action-btn complete-btn" data-action="complete" data-goal-id="' + newId + '" title="完成">✓</button>',
                            '      <button class="goal-action-btn delete-btn" data-action="delete" data-goal-id="' + newId + '" title="删除">🗑️</button>',
                            '    </div>',
                            '  </div>',
                            '  <button class="goal-add-subtask-btn" data-action="addsubtask" data-parent-id="' + newId + '" data-depth="' + (depth + 1) + '">+ 添加子任务</button>',
                            '</div>'
                        ].join('\n');
                        
                        const parentCard = document.querySelector('[data-goal-id="' + parentId + '"]');
                        if (parentCard) {
                            let children = parentCard.querySelector('.goal-children');
                            if (!children) {
                                children = document.createElement('div');
                                children.className = 'goal-children';
                                const addBtn = parentCard.querySelector('.goal-add-subtask-btn');
                                if (addBtn) addBtn.before(children);
                                else parentCard.appendChild(children);
                            }
                            let wrap = children.querySelector('.goal-subtasks');
                            if (!wrap) {
                                wrap = document.createElement('div');
                                wrap.className = 'goal-subtasks depth-' + (depth + 1);
                                children.appendChild(wrap);
                            }
                            wrap.insertAdjacentHTML('beforeend', subHtml);
                            children.classList.remove('hidden');
                            parentCard.classList.add('expanded');
                        }
                    }
                } catch (err) {
                    console.error(err);
                    showToast?.('添加失败');
                }
            }
        });

        for (const goal of goals) {
            const container = document.getElementById(`deliverables-${goal.id}`);
            if (container && G.renderDeliverablesSection) {
                await G.renderDeliverablesSection(goal.id, container);
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
                G.renderSelectionBar && G.renderSelectionBar('goals');
            };

            card.addEventListener('touchstart', (e) => {
                if (state.selectionMode.active && state.selectionMode.type === 'goals') return;
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
                timer = setTimeout(async () => {
                    state.selectionMode.longPressTriggered = true;
                    G.enterSelectionMode && G.enterSelectionMode('goals', goalId);
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
                    G.toggleSelection && G.toggleSelection('goals', goalId);
                    applyGoalSelectionVisual();
                }
            });
        });
    }

    function renderSelectionBar(type) {
        const sel = global.ScheduleAppSelection;
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
        const G = Goals();
        
        if (selectAllBtn) {
            selectAllBtn.onclick = async () => {
                if (type === 'goals') {
                    state.goals.forEach(g => { state.selectionMode.goalIds.add(String(g.id)); });
                    await G.renderGoalsList();
                }
            };
        }
        
        if (completeBtn) {
            completeBtn.onclick = async () => {
                if (type === 'goals') {
                    for (const goalId of state.selectionMode.goalIds) {
                        await G.updateGoal(parseInt(goalId), { status: 'done' });
                    }
                    showToast?.(`已完成 ${count} 项`);
                    G.exitSelectionMode && G.exitSelectionMode();
                    await G.renderGoalsList();
                }
            };
        }
    }

    function enterSelectionMode(type, seedId = null) {
        const sel = global.ScheduleAppSelection;
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
        const sel = global.ScheduleAppSelection;
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
        const sel = global.ScheduleAppSelection;
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
                    function renderSub(g, indent, isLastSibling, prevIndent) {
                        const tag = g.status === 'done' ? ' [done]' : g.status === 'cancelled' ? ' [cancelled]' : '';
                        text += prevIndent + (isLastSibling ? '└─ ' : '├─ ') + g.title + tag + '\n';
                        if (g.subtasks && g.subtasks.length > 0) {
                            const newIndent = prevIndent + (isLastSibling ? '   ' : '│  ');
                            g.subtasks.forEach((sst, j) => {
                                renderSub(sst, j, j === g.subtasks.length - 1, newIndent);
                            });
                        }
                    }
                    goal.subtasks.forEach((st, i) => {
                        renderSub(st, i, i === goal.subtasks.length - 1, '  ');
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
        const utils = getUtils();
        const { showToast } = utils;
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
                        const sstTag = sst.status === 'done' ? ' [done]' : sst.status === 'cancelled' ? ' [cancelled]' : '';
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
        const utils = getUtils();
        const { fetchGoals, showToast } = utils;
        
        try {
            const [shortGoals, semesterGoals, longGoals] = await Promise.all([
                fetchGoals('short'),
                fetchGoals('semester'),
                fetchGoals('long')
            ]);
            
            _exportAllGoals = [...(shortGoals || []), ...(semesterGoals || []), ...(longGoals || [])];
            
            const goalListEl = document.getElementById('exportGoalList');
            if (!goalListEl) return;
            
            goalListEl.innerHTML = _exportAllGoals.map(goal => `
                <div class="export-goal-item selected" data-goal-id="${goal.id}">
                    <span class="export-goal-check">☑</span>
                    <span class="export-goal-title">${escapeHtml(goal.title)}<span class="export-goal-horizon">${goal.horizon === 'short' ? '短期' : goal.horizon === 'semester' ? '学期' : '长期'}</span></span>
                </div>
            `).join('');
            
            const backdrop = document.getElementById('exportModalBackdrop');
            backdrop.classList.remove('hidden');
            
            initExportModal();
            
            const includeSubtasks = document.getElementById('exportIncludeSubtasks');
            includeSubtasks.dispatchEvent(new Event('change'));
        } catch (err) {
            console.error('Export modal error:', err);
            getUtils().showToast?.('加载失败');
        }
    }

    // Export
    global.ScheduleAppGoalList = {
        renderGoalsViewSkeleton,
        renderGoalsReference,
        renderGoalsList,
        renderSelectionBar,
        enterSelectionMode,
        toggleSelection,
        exitSelectionMode,
        exportSingleGoal,
        openExportModal,
    };
})(window);
