/**
 * Schedule App - Selection Module
 * Shared selection bar and batch actions for todo/goals
 */

(function() {
    'use strict';

    const getState = () => (window.ScheduleAppCore && window.ScheduleAppCore.state) || {};

    const deps = {
        loadData: async () => {},
        renderTodoView: async () => {},
        renderGoalsView: async () => {},
        completeEvent: async () => null,
        updateGoal: async () => null,
        deleteEvent: async () => null,
        deleteGoal: async () => null,
        showToast: () => {},
        showConfirm: async () => false,
    };

    function getSelectionSet(type) {
        const state = getState();
        return type === 'goals' ? state.selectionMode.goalIds : state.selectionMode.todoIds;
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

    function enterSelectionMode(type, seedId = null) {
        const state = getState();
        state.selectionMode.active = true;
        state.selectionMode.type = type;
        if (type === 'todo') state.selectionMode.goalIds.clear();
        if (type === 'goals') state.selectionMode.todoIds.clear();
        const set = getSelectionSet(type);
        if (seedId !== null && seedId !== undefined) set.add(String(seedId));
        renderSelectionBar(type);
    }

    function toggleSelection(type, id) {
        const set = getSelectionSet(type);
        const key = String(id);
        if (set.has(key)) set.delete(key);
        else set.add(key);
        renderSelectionBar(type);
    }

    function ensureSelectionBar() {
        let bar = document.getElementById('selectionBar');
        if (bar) return bar;
        bar = document.createElement('div');
        bar.id = 'selectionBar';
        bar.className = 'selection-bar hidden';
        bar.innerHTML = `
            <div class="selection-count" id="selectionCount">已选择 0 项</div>
            <div class="selection-actions">
                <button class="btn btn-secondary" id="selectionSelectAll">全选</button>
                <button class="btn btn-secondary" id="selectionComplete">完成</button>
                <button class="btn btn-danger" id="selectionDelete">删除</button>
                <button class="btn" id="selectionExit">退出</button>
            </div>
        `;
        const appEl = document.getElementById('app') || document.body;
        appEl.appendChild(bar);

        document.getElementById('selectionExit')?.addEventListener('click', async () => {
            const state = getState();
            exitSelectionMode();
            if (state.currentView === 'todo') await deps.renderTodoView();
            if (state.currentView === 'goals') await deps.renderGoalsView();
        });

        document.getElementById('selectionSelectAll')?.addEventListener('click', async () => {
            const state = getState();
            const type = state.selectionMode.type;
            if (!type) return;
            const set = getSelectionSet(type);
            set.clear();
            if (type === 'todo') {
                state.events.forEach((e) => {
                    set.add(String(e.id));
                });
                await deps.renderTodoView();
            } else {
                const allIds = new Set();
                const collect = (gs) => {
                    (gs || []).forEach((g) => {
                        allIds.add(String(g.id));
                        if (g.subtasks && g.subtasks.length) collect(g.subtasks);
                    });
                };
                collect(state.goals || []);
                allIds.forEach((id) => {
                    set.add(id);
                });
                await deps.renderGoalsView();
            }
            renderSelectionBar(type);
        });

        document.getElementById('selectionComplete')?.addEventListener('click', async () => {
            const state = getState();
            const type = state.selectionMode.type;
            if (!type) return;
            const ids = Array.from(getSelectionSet(type));
            if (ids.length === 0) return;
            if (type === 'todo') {
                for (const id of ids) {
                    await deps.completeEvent(id);
                }
                deps.showToast(`已完成 ${ids.length} 项`);
                await deps.loadData();
                await deps.renderTodoView();
            } else {
                for (const id of ids) {
                    await deps.updateGoal(id, { status: 'done' });
                }
                deps.showToast(`已完成 ${ids.length} 项目标`);
                await deps.renderGoalsView();
            }
            exitSelectionMode();
        });

        document.getElementById('selectionDelete')?.addEventListener('click', async () => {
            const state = getState();
            const type = state.selectionMode.type;
            if (!type) return;
            const ids = Array.from(getSelectionSet(type));
            if (ids.length === 0) return;
            const ok = await deps.showConfirm(`确定删除选中的 ${ids.length} 项吗？`);
            if (!ok) return;
            if (type === 'todo') {
                for (const id of ids) {
                    await deps.deleteEvent(id);
                }
                deps.showToast(`已删除 ${ids.length} 项`);
                await deps.loadData();
                await deps.renderTodoView();
            } else {
                for (const id of ids) {
                    await deps.deleteGoal(id);
                }
                deps.showToast(`已删除 ${ids.length} 项目标`);
                await deps.renderGoalsView();
            }
            exitSelectionMode();
        });

        return bar;
    }

    function renderSelectionBar(type) {
        const bar = ensureSelectionBar();
        const set = getSelectionSet(type);
        const countEl = document.getElementById('selectionCount');
        const completeBtn = document.getElementById('selectionComplete');
        if (countEl) countEl.textContent = `已选择 ${set.size} 项`;
        if (completeBtn) completeBtn.textContent = type === 'goals' ? '完成目标' : '完成';
        bar.classList.remove('hidden');
    }

    async function markEventDoneQuick(eventId) {
        const state = getState();
        const result = await deps.completeEvent(eventId);
        if (!result) return;
        deps.showToast('已完成 ✓');
        await deps.loadData();
        if (state.currentView === 'todo') await deps.renderTodoView();
        else if (state.currentView === 'goals') await deps.renderGoalsView();
    }

    function configure(nextDeps = {}) {
        Object.assign(deps, nextDeps);
    }

    window.ScheduleAppSelection = {
        configure,
        markEventDoneQuick,
        getSelectionSet,
        exitSelectionMode,
        enterSelectionMode,
        toggleSelection,
        ensureSelectionBar,
        renderSelectionBar,
    };
})();
