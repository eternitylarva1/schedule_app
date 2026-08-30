/**
 * Schedule App - Goal Calendar View Module
 * Drag-to-schedule calendar interface for the goals view.
 *
 * Data model (in-memory):
 *   data.scheduled: [{ id, title, color, start, end, tasks: [{id, title, start, end}] }]
 *   data.unscheduled: [{ id, title, color }]
 *
 * v0.1: Local mock data (no API persistence). Will wire to /api/goals next.
 */
(function (global) {
    'use strict';

    const BaseColW = 48;
    const ColorPalette = ['#6366f1','#10b981','#f59e0b','#ec4899','#06b6d4','#a855f7','#f97316','#84cc16'];
    const DragThreshold = 5;

    let container = null;          // root .goal-calendar-view element
    let data = { scheduled: [], unscheduled: [] };
    let scale = 1;
    let rangeStart = null;
    let rangeEnd = null;
    let viewOffsetDays = 0;
    let selectedBarId = null;
    let drag = null;       // bar drag (resize/move)
    let poolDrag = null;   // pool → calendar drag

    function ymd(d) {
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }
    function addDays(s, n) {
        const d = typeof s === 'string' ? new Date(s) : new Date(s);
        d.setDate(d.getDate() + n);
        return ymd(d);
    }
    function daysBetween(a, b) {
        return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
    }
    function today() { return ymd(new Date()); }
    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }
    function showToast(msg) {
        const core = global.ScheduleAppCore || {};
        if (typeof core.showToast === 'function') { core.showToast(msg); return; }
        // Fallback: inline toast
        let t = container?.querySelector('.gc-toast');
        if (!t && container) {
            t = document.createElement('div');
            t.className = 'gc-toast';
            container.appendChild(t);
        }
        if (!t) return;
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(t._timer);
        t._timer = setTimeout(() => t.classList.remove('show'), 2200);
    }

    function seedMockData() {
        data = {
            scheduled: [
                { id: 1, title: '毕业设计', color: '#6366f1', start: '2026-08-25', end: '2026-09-30',
                  tasks: [
                    { id: 11, title: '需求分析', start: '2026-08-25', end: '2026-09-02' },
                    { id: 12, title: '系统设计', start: '2026-09-03', end: '2026-09-12' },
                    { id: 13, title: '编码实现', start: '2026-09-13', end: '2026-09-25' },
                    { id: 14, title: '测试与答辩', start: '2026-09-26', end: '2026-09-30' },
                  ] },
                { id: 2, title: '考研复习', color: '#10b981', start: '2026-08-20', end: '2026-11-15',
                  tasks: [
                    { id: 21, title: '英语阅读', start: '2026-08-20', end: '2026-09-20' },
                    { id: 22, title: '数学基础', start: '2026-08-25', end: '2026-10-15' },
                    { id: 23, title: '政治冲刺', start: '2026-10-20', end: '2026-11-15' },
                  ] },
                { id: 3, title: '健身计划', color: '#f59e0b', start: '2026-08-26', end: '2026-10-30',
                  tasks: [
                    { id: 31, title: '增肌期', start: '2026-08-26', end: '2026-09-30' },
                    { id: 32, title: '减脂期', start: '2026-10-01', end: '2026-10-30' },
                  ] },
            ],
            unscheduled: [
                { id: 101, title: '阅读《代码大全》', color: '#ec4899' },
                { id: 102, title: '准备周报', color: '#06b6d4' },
                { id: 103, title: '复盘本月工作', color: '#a855f7' },
                { id: 104, title: '联系导师', color: '#f97316' },
                { id: 105, title: '买跑鞋', color: '#84cc16' },
            ],
        };
    }

    function recomputeRange() {
        const all = [];
        data.scheduled.forEach(g => {
            all.push(g.start, g.end);
            g.tasks.forEach(t => all.push(t.start, t.end));
        });
        let baseStart, baseEnd;
        if (all.length === 0) {
            const t = new Date();
            baseStart = ymd(t);
            baseEnd = ymd(t);
        } else {
            const min = all.reduce((a, b) => a < b ? a : b);
            const max = all.reduce((a, b) => a > b ? a : b);
            baseStart = addDays(min, -5);
            baseEnd = addDays(max, 5);
        }
        rangeStart = addDays(baseStart, viewOffsetDays);
        rangeEnd = addDays(baseEnd, viewOffsetDays);
    }

    function renderShell() {
        container.classList.add('goal-calendar-view');
        container.innerHTML = `
            <div class="gc-toolbar">
                <h1>🎯 目标日历</h1>
                <span class="desc">从左侧拖入日历分配时间</span>
                <div class="gc-controls">
                    <div class="gc-scale" data-role="scale">
                        <button data-scale="0.5">×0.5</button>
                        <button data-scale="1" class="active">×1</button>
                        <button data-scale="2">×2</button>
                    </div>
                    <button class="gc-btn ghost" data-role="prev">‹</button>
                    <button class="gc-btn" data-role="today">今天</button>
                    <button class="gc-btn ghost" data-role="next">›</button>
                    <button class="gc-btn primary" data-role="add-task">+ 任务</button>
                    <button class="gc-btn primary" data-role="add-goal">+ 目标</button>
                </div>
            </div>
            <div class="gc-workspace">
                <aside class="gc-pool">
                    <div class="gc-pool-header">
                        <h2>未分配时间</h2>
                        <span class="gc-pool-count" data-role="pool-count">0</span>
                    </div>
                    <div class="gc-pool-list" data-role="pool-list"></div>
                </aside>
                <div class="gc-calendar" data-role="calendar">
                    <div class="gc-cal-grid" data-role="grid"></div>
                </div>
            </div>
            <div class="gc-legend">
                <span><kbd>拖池子</kbd> 分配时间</span>
                <span><kbd>拖两端</kbd> 改时长</span>
                <span><kbd>拖中间</kbd> 平移</span>
                <span><kbd>双击块</kbd> 编辑</span>
                <span class="gc-status" data-role="status"></span>
            </div>
            <div class="gc-toast"></div>
        `;
        bindShellEvents();
    }

    function $(role) { return container.querySelector(`[data-role="${role}"]`); }

    function bindShellEvents() {
        $('scale').addEventListener('click', e => {
            const btn = e.target.closest('button[data-scale]');
            if (!btn) return;
            $('scale').querySelectorAll('button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            scale = parseFloat(btn.dataset.scale);
            render();
        });
        $('today').addEventListener('click', () => { viewOffsetDays = 0; render(); });
        $('prev').addEventListener('click', () => { viewOffsetDays -= 14; render(); });
        $('next').addEventListener('click', () => { viewOffsetDays += 14; render(); });
        $('add-task').addEventListener('click', addTaskToPool);
        $('add-goal').addEventListener('click', openGoalCreator);
    }

    function setStatus(msg) { const s = $('status'); if (s) s.textContent = msg; }

    function render() {
        if (!container) return;
        recomputeRange();
        const totalDays = daysBetween(rangeStart, rangeEnd) + 1;
        const cellW = BaseColW * scale;
        const grid = $('grid');
        $('calendar').style.setProperty('--cell-w', cellW + 'px');

        let html = '<div class="gc-cal-header">';
        for (let i = 0; i < totalDays; i++) {
            const d = addDays(rangeStart, i);
            const dt = new Date(d);
            const dow = dt.getDay();
            const isWeekend = dow === 0 || dow === 6;
            const isToday = d === today();
            const dowLabel = ['日','一','二','三','四','五','六'][dow];
            const showMonth = i === 0 || dt.getDate() === 1;
            html += `<div class="gc-cal-header-cell${isWeekend?' weekend':''}${isToday?' today':''}">
                <span class="dow">${dowLabel}${showMonth ? ' · ' + (dt.getMonth()+1) + '月' : ''}</span>
                <span class="num">${dt.getDate()}</span>
            </div>`;
        }
        html += '</div>';

        data.scheduled.forEach(g => {
            html += `<div class="gc-row-group" data-group-id="${g.id}">`;
            html += `<div class="gc-row-group-header" style="grid-column: 1 / span ${totalDays}" data-group-id="${g.id}">
                <span class="dot" style="background:${g.color}"></span>
                <span class="name">${escapeHtml(g.title)}</span>
                <span class="meta">${g.start} ~ ${g.end} · ${daysBetween(g.start, g.end) + 1}天 · ${g.tasks.length}项任务</span>
                <button class="group-delete" title="删除整个目标">×</button>
            </div>`;
            g.tasks.forEach(t => {
                const startIdx = daysBetween(rangeStart, t.start);
                const span = daysBetween(t.start, t.end) + 1;
                const left = startIdx * cellW;
                const width = span * cellW;
                html += `<div class="gc-row" style="grid-column: ${startIdx + 1} / span ${span}" data-group-id="${g.id}">
                    <div class="gc-bar" data-id="${t.id}" data-group="${g.id}"
                         style="left:${left}px;width:${width}px;background:${g.color}"
                         title="${escapeHtml(t.title)} (${t.start} ~ ${t.end})">
                        <span class="bar-text">${escapeHtml(t.title)}</span>
                        <button class="bar-delete" title="删除任务">×</button>
                        <div class="handle left" data-handle="left"></div>
                        <div class="handle right" data-handle="right"></div>
                    </div>
                </div>`;
            });
            html += '</div>';
        });

        if (data.scheduled.length === 0) {
            html += `<div style="grid-column: 1 / span ${totalDays}; padding: 60px; text-align:center; color: var(--text-muted)">
                把左侧任务拖到这里来分配时间
            </div>`;
        }

        grid.innerHTML = html;

        const todayIdx = daysBetween(rangeStart, today());
        const todayX = todayIdx * cellW;
        let line = grid.querySelector('.gc-today-line');
        if (!line) {
            line = document.createElement('div');
            line.className = 'gc-today-line';
            grid.appendChild(line);
        }
        line.style.left = todayX + 'px';
        line.style.height = grid.offsetHeight + 'px';

        grid.querySelectorAll('.gc-row').forEach(row => {
            row.addEventListener('dragover', onRowDragOver);
            row.addEventListener('dragleave', onRowDragLeave);
            row.addEventListener('drop', onRowDrop);
        });

        grid.querySelectorAll('.gc-bar').forEach(bar => {
            bar.addEventListener('pointerdown', onBarPointerDown);
            bar.addEventListener('dblclick', onBarDblClick);
            bar.addEventListener('click', onBarClick);
            const del = bar.querySelector('.bar-delete');
            if (del) del.addEventListener('click', e => {
                e.stopPropagation();
                deleteTask(bar);
            });
        });

        grid.querySelectorAll('.gc-row-group-header').forEach(hdr => {
            const btn = hdr.querySelector('.group-delete');
            if (btn) btn.addEventListener('click', e => {
                e.stopPropagation();
                deleteGroup(hdr);
            });
        });

        if (selectedBarId != null) {
            const bar = grid.querySelector(`.gc-bar[data-id="${selectedBarId}"]`);
            if (bar) selectBar(bar);
        }

        renderPool();
        restoreScroll();
    }

    function deleteTask(bar) {
        const taskId = parseInt(bar.dataset.id);
        const groupId = parseInt(bar.dataset.group);
        const group = data.scheduled.find(g => g.id === groupId);
        if (!group) return;
        group.tasks = group.tasks.filter(t => t.id !== taskId);
        if (group.tasks.length === 0) {
            data.scheduled = data.scheduled.filter(g => g.id !== groupId);
        }
        if (selectedBarId === taskId) selectedBarId = null;
        render();
        showToast('已删除任务');
    }

    function deleteGroup(hdr) {
        const groupId = parseInt(hdr.dataset.groupId);
        const group = data.scheduled.find(g => g.id === groupId);
        if (!group) return;
        group.tasks.forEach(t => {
            data.unscheduled.push({ id: t.id, title: t.title, color: group.color });
        });
        data.scheduled = data.scheduled.filter(g => g.id !== groupId);
        selectedBarId = null;
        render();
        showToast(`已删除目标: ${group.title}`);
    }

    function renderPool() {
        if (!container) return;
        const list = $('pool-list');
        const count = $('pool-count');
        count.textContent = data.unscheduled.length;

        if (data.unscheduled.length === 0) {
            list.innerHTML = '<div class="gc-pool-empty">全部任务都已分配时间 ✨</div>';
            return;
        }
        list.innerHTML = data.unscheduled.map(item => `
            <div class="gc-pool-item" data-id="${item.id}"
                 style="border-left-color: ${item.color}">
                <span class="dot" style="background:${item.color}"></span>
                <span class="name" spellcheck="false">${escapeHtml(item.title)}</span>
                <button class="delete" title="删除">×</button>
            </div>
        `).join('');

        list.querySelectorAll('.gc-pool-item').forEach(el => {
            const nameEl = el.querySelector('.name');
            const item = data.unscheduled.find(x => x.id === parseInt(el.dataset.id));
            if (!item) return;

            el.addEventListener('pointerdown', e => {
                if (e.target.closest('.delete')) return;
                if (nameEl.getAttribute('contenteditable') === 'true') return;
                startPoolDrag(e, el, item);
            });

            nameEl.addEventListener('dblclick', e => {
                e.stopPropagation();
                nameEl.setAttribute('contenteditable', 'true');
                nameEl.focus();
                const range = document.createRange();
                range.selectNodeContents(nameEl);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
            });

            nameEl.addEventListener('input', () => {
                const v = nameEl.textContent.trim();
                if (v) item.title = v;
            });

            nameEl.addEventListener('blur', () => {
                if (nameEl.getAttribute('contenteditable') === 'true') {
                    nameEl.removeAttribute('contenteditable');
                    const v = nameEl.textContent.trim();
                    if (!v) nameEl.textContent = item.title;
                    else item.title = v;
                    renderPool();
                }
            });
            nameEl.addEventListener('keydown', e => {
                if (e.key === 'Enter') { e.preventDefault(); nameEl.blur(); }
                else if (e.key === 'Escape') { nameEl.textContent = item.title; nameEl.blur(); }
            });

            el.querySelector('.delete').addEventListener('click', e => {
                e.stopPropagation();
                data.unscheduled = data.unscheduled.filter(x => x.id !== item.id);
                renderPool();
                showToast(`已删除: ${item.title}`);
            });
        });
    }

    // ---- Pool → calendar drag (delayed activation) ----
    function startPoolDrag(e, el, item) {
        poolDrag = {
            el, item,
            ghost: null,
            pointerId: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            active: false,
        };
        el.addEventListener('pointermove', onPoolPointerMove);
        el.addEventListener('pointerup', onPoolPointerUp);
        el.addEventListener('pointercancel', onPoolPointerUp);
    }

    function onPoolPointerMove(e) {
        if (!poolDrag) return;
        if (!poolDrag.active) {
            const dx = e.clientX - poolDrag.startX;
            const dy = e.clientY - poolDrag.startY;
            if (Math.hypot(dx, dy) < DragThreshold) return;
            poolDrag.active = true;
            e.preventDefault();
            try { poolDrag.el.setPointerCapture(poolDrag.pointerId); } catch (_) {}
            poolDrag.el.classList.add('dragging');
            const ghost = document.createElement('div');
            ghost.className = 'gc-drag-ghost';
            ghost.textContent = poolDrag.item.title;
            document.body.appendChild(ghost);
            ghost.style.left = e.clientX + 'px';
            ghost.style.top = e.clientY + 'px';
            poolDrag.ghost = ghost;
        }
        if (poolDrag.ghost) {
            poolDrag.ghost.style.left = e.clientX + 'px';
            poolDrag.ghost.style.top = e.clientY + 'px';
        }
        container.querySelectorAll('.gc-row.drop-target').forEach(el => el.classList.remove('drop-target'));
        const elUnder = document.elementFromPoint(e.clientX, e.clientY);
        const row = elUnder?.closest('.gc-row');
        if (row) row.classList.add('drop-target');
    }

    function onPoolPointerUp(e) {
        if (!poolDrag) return;
        const { el, item, ghost, active } = poolDrag;
        if (active) {
            try { el.releasePointerCapture(poolDrag.pointerId); } catch (_) {}
        }
        el.removeEventListener('pointermove', onPoolPointerMove);
        el.removeEventListener('pointerup', onPoolPointerUp);
        el.removeEventListener('pointercancel', onPoolPointerUp);
        if (!active) {
            el.classList.remove('dragging');
            poolDrag = null;
            return;
        }
        el.classList.remove('dragging');
        if (ghost) ghost.remove();
        container.querySelectorAll('.gc-row.drop-target').forEach(el => el.classList.remove('drop-target'));

        const elUnder = document.elementFromPoint(e.clientX, e.clientY);
        const row = elUnder?.closest('.gc-row');
        if (row) {
            const cellW = BaseColW * scale;
            const rect = row.getBoundingClientRect();
            const dayIdx = Math.floor((e.clientX - rect.left) / cellW);
            const start = addDays(rangeStart, dayIdx);
            const end = addDays(start, 2);
            data.unscheduled = data.unscheduled.filter(x => x.id !== item.id);
            const newTask = { id: item.id, title: item.title, start, end };
            const groupId = parseInt(row.dataset.groupId);
            const targetGroup = data.scheduled.find(g => g.id === groupId);
            if (targetGroup) {
                targetGroup.tasks.push(newTask);
            } else if (data.scheduled.length === 0) {
                data.scheduled.push({
                    id: (Date.now() & 0xffff) + 1000,
                    title: '新目标',
                    color: item.color,
                    start, end,
                    tasks: [newTask],
                });
            } else {
                data.scheduled[0].tasks.push(newTask);
            }
            render();
            showToast(`已分配: ${item.title} → ${targetGroup ? targetGroup.title : '新目标'}`);
        }
        poolDrag = null;
    }

    // Legacy HTML5 drop targets (kept for safety)
    function onRowDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        e.currentTarget.classList.add('drop-target');
    }
    function onRowDragLeave(e) {
        if (!e.currentTarget.contains(e.relatedTarget)) {
            e.currentTarget.classList.remove('drop-target');
        }
    }
    function onRowDrop(e) {
        e.preventDefault();
        e.currentTarget.classList.remove('drop-target');
        // Pointer-drag path handles drops; this is a fallback for HTML5 drag.
    }

    // ---- Bar selection / drag ----
    function onBarClick(e) {
        if (e.detail === 2) return;
        selectBar(e.currentTarget);
    }

    function selectBar(bar) {
        container.querySelectorAll('.gc-cal-header-cell.bar-start, .gc-cal-header-cell.bar-end')
            .forEach(el => el.classList.remove('bar-start', 'bar-end'));
        container.querySelectorAll('.gc-bar.selected').forEach(el => el.classList.remove('selected'));
        bar.classList.add('selected');
        selectedBarId = parseInt(bar.dataset.id);

        const taskId = parseInt(bar.dataset.id);
        const groupId = parseInt(bar.dataset.group);
        const group = data.scheduled.find(g => g.id === groupId);
        const task = group?.tasks.find(t => t.id === taskId);
        if (!task) return;

        const startIdx = daysBetween(rangeStart, task.start);
        const endIdx = daysBetween(rangeStart, task.end);
        const headerCells = container.querySelectorAll('.gc-cal-header-cell');
        if (headerCells[startIdx]) headerCells[startIdx].classList.add('bar-start');
        if (headerCells[endIdx]) headerCells[endIdx].classList.add('bar-end');

        setStatus(`${task.title}: ${task.start} → ${task.end}`);
    }

    function onBarPointerDown(e) {
        if (e.button !== undefined && e.button !== 0) return;
        const bar = e.currentTarget;
        if (e.target.closest('.bar-delete')) return;
        const handle = e.target.closest('.handle');
        const taskId = parseInt(bar.dataset.id);
        const groupId = parseInt(bar.dataset.group);
        const group = data.scheduled.find(g => g.id === groupId);
        const task = group?.tasks.find(t => t.id === taskId);
        if (!group || !task) return;

        e.preventDefault();
        e.stopPropagation();
        try { bar.setPointerCapture(e.pointerId); } catch (_) {}
        bar.classList.add('dragging');
        drag = {
            bar, task, group,
            handle: handle ? handle.dataset.handle : 'body',
            startX: e.clientX,
            origStart: task.start,
            origEnd: task.end,
            moved: false,
        };
        bar.addEventListener('pointermove', onBarPointerMove);
        bar.addEventListener('pointerup', onBarPointerUp);
        bar.addEventListener('pointercancel', onBarPointerUp);
    }

    function onBarPointerMove(e) {
        if (!drag) return;
        const cellW = BaseColW * scale;
        const dx = e.clientX - drag.startX;
        const delta = Math.round(dx / cellW);
        if (delta === 0) return;

        let s = drag.origStart, en = drag.origEnd;
        if (drag.handle === 'left') {
            s = addDays(drag.origStart, delta);
            if (new Date(s) > new Date(en)) return;
        } else if (drag.handle === 'right') {
            en = addDays(drag.origEnd, delta);
            if (new Date(en) < new Date(s)) return;
        } else {
            s = addDays(drag.origStart, delta);
            en = addDays(drag.origEnd, delta);
        }
        drag.task.start = s;
        drag.task.end = en;
        drag.moved = true;
        drag.group.start = data.scheduled.map(g => g.start).reduce((a,b) => a < b ? a : b);
        drag.group.end = data.scheduled.map(g => g.end).reduce((a,b) => a > b ? a : b);

        const startIdx = daysBetween(rangeStart, s);
        const span = daysBetween(s, en) + 1;
        drag.bar.style.left = (startIdx * cellW) + 'px';
        drag.bar.style.width = (span * cellW) + 'px';
        drag.bar.title = `${drag.task.title} (${s} ~ ${en})`;
        setStatus(`${s} ~ ${en}`);
    }

    function onBarPointerUp(e) {
        if (!drag) return;
        const moved = drag.moved;
        const title = drag.task.title;
        const start = drag.task.start;
        const end = drag.task.end;
        drag.bar.classList.remove('dragging');
        try { drag.bar.releasePointerCapture(e.pointerId); } catch (_) {}
        drag.bar.removeEventListener('pointermove', onBarPointerMove);
        drag.bar.removeEventListener('pointerup', onBarPointerUp);
        drag.bar.removeEventListener('pointercancel', onBarPointerUp);
        setStatus('');
        if (moved) showToast(`已更新: ${title} (${start} ~ ${end})`);
        selectBar(drag.bar);
        drag = null;
    }

    function onBarDblClick(e) {
        const bar = e.currentTarget;
        const taskId = parseInt(bar.dataset.id);
        const groupId = parseInt(bar.dataset.group);
        const group = data.scheduled.find(g => g.id === groupId);
        const task = group?.tasks.find(t => t.id === taskId);
        if (!task) return;
        openInlineEditor(bar, task, group);
    }

    // Global fallback for contenteditable blur
    document.addEventListener('pointerdown', e => {
        const active = document.activeElement;
        if (active && active.getAttribute('contenteditable') === 'true' && !active.contains(e.target)) {
            active.blur();
        }
    }, true);

    function openInlineEditor(bar, task, group) {
        document.querySelectorAll('.gc-inline-editor').forEach(el => el.remove());

        const editor = document.createElement('div');
        editor.className = 'gc-inline-editor';
        const barRect = bar.getBoundingClientRect();
        editor.style.left = barRect.left + 'px';
        editor.style.top = barRect.top + 'px';
        editor.style.width = Math.max(barRect.width, 200) + 'px';
        editor.style.height = barRect.height + 'px';

        const input = document.createElement('input');
        input.type = 'text';
        input.value = task.title;
        const dateInput = document.createElement('input');
        dateInput.type = 'date';
        dateInput.value = task.start;
        dateInput.title = '修改开始日期';
        const delBtn = document.createElement('button');
        delBtn.textContent = '×';
        delBtn.title = '删除';

        const saveAndClose = () => {
            const newTitle = input.value.trim();
            if (newTitle) task.title = newTitle;
            if (dateInput.value) {
                task.start = dateInput.value;
                if (new Date(task.end) < new Date(task.start)) task.end = task.start;
            }
            if (group.tasks.length > 0) {
                group.start = group.tasks.reduce((a, t) => a < t.start ? a : t.start, group.tasks[0].start);
                group.end = group.tasks.reduce((a, t) => a > t.end ? a : t.end, group.tasks[0].end);
            }
            editor.remove();
            render();
            showToast(`已保存: ${task.title}`);
        };
        const cancel = () => editor.remove();
        const remove = () => {
            group.tasks = group.tasks.filter(t => t.id !== task.id);
            if (group.tasks.length === 0) {
                data.scheduled = data.scheduled.filter(g => g.id !== group.id);
                data.unscheduled.push({ id: task.id, title: task.title, color: group.color });
            }
            editor.remove();
            render();
            showToast(`已移除: ${task.title}`);
        };

        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') saveAndClose();
            else if (e.key === 'Escape') cancel();
            e.stopPropagation();
        });
        input.addEventListener('blur', saveAndClose);
        dateInput.addEventListener('keydown', e => e.stopPropagation());
        dateInput.addEventListener('change', saveAndClose);
        dateInput.addEventListener('focus', () => input.removeEventListener('blur', saveAndClose));
        delBtn.addEventListener('focus', () => input.removeEventListener('blur', saveAndClose));
        delBtn.addEventListener('click', e => { e.stopPropagation(); remove(); });

        editor.appendChild(input);
        editor.appendChild(dateInput);
        editor.appendChild(delBtn);
        document.body.appendChild(editor);
        input.focus();
        input.select();
    }

    function restoreScroll() {
        const cal = $('calendar');
        if (!cal) return;
        const todayIdx = daysBetween(rangeStart, today());
        const cellW = BaseColW * scale;
        cal.scrollLeft = Math.max(0, (todayIdx - 5) * cellW);
    }

    function addTaskToPool() {
        const id = Date.now() & 0xffff;
        data.unscheduled.push({
            id,
            title: '新任务',
            color: ColorPalette[data.unscheduled.length % ColorPalette.length],
        });
        renderPool();
        setTimeout(() => {
            const el = container.querySelector(`.gc-pool-item[data-id="${id}"] .name`);
            if (el) {
                el.setAttribute('contenteditable', 'true');
                el.focus();
                const range = document.createRange();
                range.selectNodeContents(el);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
            }
        }, 50);
    }

    function openGoalCreator() {
        document.querySelectorAll('.gc-modal-backdrop').forEach(el => el.remove());
        const backdrop = document.createElement('div');
        backdrop.className = 'gc-modal-backdrop';

        const dialog = document.createElement('div');
        dialog.className = 'gc-modal';
        dialog.innerHTML = `
            <h3>新建目标</h3>
            <div style="margin-bottom:var(--space-sm)">
                <label>目标名称</label>
                <input type="text" placeholder="例如：毕业设计" />
            </div>
            <div style="margin-bottom:var(--space-sm)">
                <label>起始日期</label>
                <input type="date" />
            </div>
            <div style="margin-bottom:var(--space-md)">
                <label>颜色</label>
                <div class="gc-color-picker"></div>
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end">
                <button class="gc-btn" data-role="m-cancel">取消</button>
                <button class="gc-btn primary" data-role="m-confirm">创建</button>
            </div>
        `;
        backdrop.appendChild(dialog);
        document.body.appendChild(backdrop);

        let pickedColor = ColorPalette[0];
        const colorBox = dialog.querySelector('.gc-color-picker');
        ColorPalette.forEach(c => {
            const sw = document.createElement('div');
            sw.className = 'gc-color-swatch';
            if (c === pickedColor) sw.classList.add('selected');
            sw.style.background = c;
            sw.addEventListener('click', () => {
                pickedColor = c;
                colorBox.querySelectorAll('.gc-color-swatch').forEach(x => x.classList.remove('selected'));
                sw.classList.add('selected');
            });
            colorBox.appendChild(sw);
        });

        const nameInput = dialog.querySelector('input[type="text"]');
        const startInput = dialog.querySelector('input[type="date"]');
        startInput.value = today();

        const cleanup = () => backdrop.remove();
        dialog.querySelector('[data-role="m-cancel"]').addEventListener('click', cleanup);
        backdrop.addEventListener('click', e => { if (e.target === backdrop) cleanup(); });

        const create = () => {
            const title = nameInput.value.trim();
            if (!title) { nameInput.focus(); return; }
            const start = startInput.value || today();
            const id = (Date.now() & 0xffff) + 1000;
            data.scheduled.push({
                id, title, color: pickedColor,
                start, end: addDays(start, 6),
                tasks: [],
            });
            viewOffsetDays = 0;
            cleanup();
            render();
            showToast(`已创建目标: ${title}`);
        };
        dialog.querySelector('[data-role="m-confirm"]').addEventListener('click', create);
        nameInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') create();
            else if (e.key === 'Escape') cleanup();
        });
        setTimeout(() => nameInput.focus(), 50);
    }

    function renderCalendarView(rootEl) {
        container = rootEl;
        if (!container) return;
        if (data.scheduled.length === 0 && data.unscheduled.length === 0) {
            seedMockData();
        }
        renderShell();
        render();
    }

    global.ScheduleAppGoalCalendar = {
        renderCalendarView,
        // exposed for debugging
        _data: () => data,
    };

})(window);