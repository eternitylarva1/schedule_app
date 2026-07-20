/**
 * Schedule App - Goals Timeline Module
 * Gantt-style timeline view
 */

(function(global) {
    'use strict';

    const getState = () => (global.ScheduleAppCore && global.ScheduleAppCore.state) || {};
    const getElements = () => (global.ScheduleAppCore && global.ScheduleAppCore.elements) || {};
    const getUtils = () => global.ScheduleAppCore || {};

    const Goals = () => global.ScheduleAppGoals || {};

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

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
        return 80;
    }

    function calcBarPercent(startDate, endDate, rangeStart, rangeEnd) {
        const msPerDay = 86400000;
        const totalDays = (rangeEnd - rangeStart) / msPerDay;
        
        const effectiveStart = startDate || endDate;
        const effectiveEnd = endDate || startDate;
        
        const leftDays = (effectiveStart - rangeStart) / msPerDay;
        const widthDays = (effectiveEnd - effectiveStart) / msPerDay + 1;
        
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
        const G = Goals();
        
        let listEl = elements.goalsContainer.querySelector('.goals-list');
        if (!listEl) return;
        
        const listParent = listEl.parentNode;
        const freshListEl = listEl.cloneNode(false);
        listParent.replaceChild(freshListEl, listEl);
        listEl = freshListEl;
        
        listEl.innerHTML = '<div class="goals-timeline-loading">加载中...</div>';
        
        try {
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
                short: '#6366f1',
                semester: '#8b5cf6',
                long: '#0ea5e9'
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
                
                const headerDateRange = goalsWithDates.length > 0 
                    ? ` · ${formatGoalDate(horizonMinDate, horizonMaxDate)}` 
                    : '';
                
                const GOAL_COLORS = (G.GOAL_COLORS || []);
                
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
                    
                    const processedIds = new Set();
                    
                    goalsWithDates.forEach((goal, index) => {
                        if (processedIds.has(goal.id)) return;
                        processedIds.add(goal.id);
                        
                        const isDone = goal.status === 'done';
                        const isCancelled = goal.status === 'cancelled';
                        const barColor = goal.color || GOAL_COLORS[index % GOAL_COLORS.length];
                        
                        const subtasks = goalsWithDates.filter(g => g.parentTitle === goal.title && !processedIds.has(g.id));
                        subtasks.forEach(st => processedIds.add(st.id));
                        
                        const barPos = calcBarPercent(
                            parseDate(goal.start_date),
                            parseDate(goal.end_date),
                            horizonMinDate,
                            horizonMaxDate
                        );
                        
                        const startDt = parseDate(goal.start_date);
                        const endDt = parseDate(goal.end_date);
                        const dateDisplay = startDt && endDt
                            ? `${String(startDt.getMonth() + 1).padStart(2, '0')}/${String(startDt.getDate()).padStart(2, '0')} — ${String(endDt.getMonth() + 1).padStart(2, '0')}/${String(endDt.getDate()).padStart(2, '0')}`
                            : startDt
                                ? `${String(startDt.getMonth() + 1).padStart(2, '0')}/${String(startDt.getDate()).padStart(2, '0')}`
                                : '未设日期';
                        
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
                    
                    if (goal && G.openGoalEditModal) {
                        G.openGoalEditModal(goal);
                    }
                });
            });
            
            listEl.querySelectorAll('.tl-promote-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const goalId = parseInt(btn.dataset.goalId);
                    if (isNaN(goalId)) return;
                    const { showConfirm } = utils;
                    const confirmed = await showConfirm('将此子任务升级为独立目标？\n它将从当前父目标中移除，成为顶层目标。');
                    if (confirmed) {
                        await G.updateGoal(goalId, { parent_id: null, root_goal_id: null });
                        showToast?.('已升级为独立目标 ↗️');
                        await G.renderTimelineView();
                    }
                });
            });
            
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
            
            listEl.querySelectorAll('.timeline-zoom-slider').forEach(slider => {
                slider.addEventListener('input', (e) => {
                    const horizon = slider.dataset.horizon;
                    const value = parseFloat(slider.value);
                    state.timelineZoom[horizon] = value;
                    slider.nextElementSibling.textContent = Math.round(value * 100) + '%';
                });
                
                slider.addEventListener('change', async (e) => {
                    await G.renderTimelineView();
                });
            });
            
            listEl.querySelectorAll('.timeline-empty-add-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    G.showAddGoalModal && G.showAddGoalModal();
                });
            });
            
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

    // Export
    global.ScheduleAppGoalTimeline = {
        renderTimelineView,
    };
})(window);
