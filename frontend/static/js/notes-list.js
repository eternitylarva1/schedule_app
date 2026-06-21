/**
 * Schedule App - Notes List Module
 * Renders the note list (groups + ungrouped), handles click/swipe/drag events.
 * Refactored from notepad.js (line 306-722) as part of NOTES_REFACTOR stage 1.
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

    function truncate2Lines(text, maxChars = 50) {
        if (!text) return '';
        const lines = text.split('\n');
        let result = '';
        for (const line of lines) {
            if (result) result += ' ';
            result += line;
            if (result.length > maxChars) {
                return result.substring(0, maxChars) + '...';
            }
        }
        return result;
    }

    function isSameDay(date1, date2) {
        if (!date1 || !date2) return false;
        const d1 = new Date(date1);
        const d2 = new Date(date2);
        return d1.getFullYear() === d2.getFullYear() &&
               d1.getMonth() === d2.getMonth() &&
               d1.getDate() === d2.getDate();
    }

    function formatNoteTime(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const now = new Date();
        const isToday = isSameDay(date, now);
        const yesterday = new Date(now.getTime() - 86400000);
        const isYesterday = isSameDay(date, yesterday);

        if (isToday) {
            return `今天 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
        } else if (isYesterday) {
            return `昨天 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
        } else {
            return `${date.getMonth() + 1}月${date.getDate()}日 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
        }
    }

    // --- drag state (closure private) ---
    let noteDragState = {
        draggedNoteId: null,
        draggedElement: null,
        sourceGroupId: null,
        dragOverGroupId: null,
        dragOverNoteId: null,
        selectedGroupId: null,
    };

    const EDGE_THRESHOLD = 80;
    const SCROLL_SPEED = 15;
    let autoScrollInterval = null;
    let lastDragY = null;

    async function renderNotesList() {
        const state = getState();
        const elements = getElements();
        const { fetchNotes, fetchNoteGroups, deleteNoteGroup, showToast, showConfirm, deleteNote, updateNote } = getUtils();

        const container = elements.notepadContainer;
        const notes = await fetchNotes();
        const groups = await fetchNoteGroups() || [];

        if (state.expandedGroups.size === 0 && groups.length > 0) {
            groups.forEach((g) => {
                state.expandedGroups.add(String(g.id));
            });
            state.expandedGroups.add('ungrouped');
        }

        if ((!notes || notes.length === 0) && (!groups || groups.length === 0)) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📝</div>
                    <div class="empty-text">暂无笔记</div>
                    <div class="empty-hint">在上方输入内容添加笔记</div>
                </div>
            `;
            return;
        }

        const groupMap = {};
        groups.forEach(g => {
            groupMap[g.id] = { ...g, notes: [] };
        });

        const ungroupedNotes = [];
        notes.forEach(note => {
            if (note.group_id && groupMap[note.group_id]) {
                groupMap[note.group_id].notes.push(note);
            } else {
                ungroupedNotes.push(note);
            }
        });

        let html = '';

        const sortedGroups = groups.sort((a, b) => a.sort_order - b.sort_order);
        sortedGroups.forEach(group => {
            const isExpanded = state.expandedGroups.has(String(group.id));
            const groupData = groupMap[group.id] || { notes: [] };
            const noteCount = groupData.notes.length;

            html += `
                <details class="note-group" data-group-id="${group.id}" ${isExpanded ? 'open' : ''}>
                    <summary class="note-group-header" data-group-id="${group.id}">
                        <span class="note-group-toggle">${isExpanded ? '▼' : '▶'}</span>
                        <span class="note-group-name">${escapeHtml(group.name)}</span>
                        <span class="note-group-count">${noteCount}</span>
                        <button class="note-group-delete" data-group-id="${group.id}" title="删除分组">×</button>
                    </summary>
                    <div class="note-group-content ${isExpanded ? '' : 'collapsed'}">
                        ${noteCount > 0 ? groupData.notes.map(note => renderNoteItem(note)).join('') : '<div class="note-group-empty">暂无笔记</div>'}
                    </div>
                </details>
            `;
        });

        const ungroupedExpanded = state.expandedGroups.has('ungrouped');
        if (ungroupedNotes.length > 0) {
            html += `
                <details class="note-group" data-group-id="ungrouped" ${ungroupedExpanded ? 'open' : ''}>
                    <summary class="note-group-header" data-group-id="ungrouped">
                        <span class="note-group-toggle">${ungroupedExpanded ? '▼' : '▶'}</span>
                        <span class="note-group-name">未分组</span>
                        <span class="note-group-count">${ungroupedNotes.length}</span>
                    </summary>
                    <div class="note-group-content ${ungroupedExpanded ? '' : 'collapsed'}">
                        ${ungroupedNotes.map(note => renderNoteItem(note)).join('')}
                    </div>
                </details>
            `;
        }

        html += `
            <div class="add-group-container">
                <button class="add-group-btn" id="addGroupBtn">
                    <span>+</span> 新建分组
                </button>
            </div>
        `;

        container.innerHTML = html;

        container.querySelectorAll('.note-group-delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                e.preventDefault();
                const groupId = parseInt(btn.dataset.groupId);
                const confirmed = await showConfirm('删除分组？分组内的笔记将移至"未分组"。');
                if (confirmed) {
                    await deleteNoteGroup(groupId);
                    showToast('分组已删除');
                    await renderNotesList();
                }
            });
        });

        const addGroupBtn = document.getElementById('addGroupBtn');
        if (addGroupBtn) {
            addGroupBtn.addEventListener('click', () => {
                showAddGroupPrompt();
            });
        }

        container.querySelectorAll('.note-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('.swipe-action')) return;
                const parentSwipe = item.closest('.swipe-item');
                if (parentSwipe && parentSwipe.classList.contains('swipe-open')) {
                    if (getUtils().closeAllOpenSwipeItems) {
                        getUtils().closeAllOpenSwipeItems();
                    }
                    return;
                }
                const noteId = parseInt(item.dataset.noteId);
                const note = state.notes.find(n => n.id === noteId);
                if (note) {
                    state.selectedNote = note;
                    const aiOpen = window.ScheduleAppNoteAI && window.ScheduleAppNoteAI.isOpen && window.ScheduleAppNoteAI.isOpen();
                    if (aiOpen) {
                        const contextContent = document.getElementById('aiChatContextContent');
                        if (contextContent) {
                            contextContent.textContent = note.content || '（空笔记）';
                        }
                        setTimeout(() => {
                            const input = document.getElementById('aiChatInput');
                            if (input) input.focus();
                        }, 100);
                    } else {
                        const editor = window.ScheduleAppNoteEditor;
                        if (editor && typeof editor.showNoteDetail === 'function') {
                            editor.showNoteDetail(note);
                        }
                    }
                }
            });
        });

        container.querySelectorAll('.note-swipe .swipe-action').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                const noteId = parseInt(btn.dataset.noteId);
                const editor = window.ScheduleAppNoteEditor;
                const { deleteNote, showToast, showConfirm } = getUtils();

                if (action === 'edit') {
                    const note = state.notes.find(n => n.id === noteId);
                    if (note && editor && typeof editor.showNoteEdit === 'function') {
                        editor.showNoteEdit(note);
                    }
                } else if (action === 'delete') {
                    const confirmed = await showConfirm('确定删除这条笔记吗？');
                    if (confirmed) {
                        await deleteNote(noteId);
                        showToast('已删除');
                        await renderNotesList();
                    }
                }
            });
        });

        container.querySelectorAll('.note-group-header').forEach(header => {
            header.addEventListener('click', (e) => {
                if (noteDragState.draggedNoteId && !e.target.closest('.note-group-delete')) {
                    e.preventDefault();
                    const groupIdStr = header.dataset.groupId;
                    document.querySelectorAll('.note-group.selected-group').forEach(el => {
                        el.classList.remove('selected-group');
                    });
                    const groupEl = header.closest('.note-group');
                    if (groupEl) {
                        groupEl.classList.add('selected-group');
                        noteDragState.selectedGroupId = groupIdStr === 'ungrouped' ? -1 : parseInt(groupIdStr);
                    }
                }
            });
        });

        initNoteDragDrop();
    }

    function renderNoteItem(note) {
        return `
            <div class="swipe-item note-swipe" data-note-id="${note.id}" draggable="true">
                <div class="swipe-action swipe-action-left" data-action="edit" data-note-id="${note.id}">✏️ 编辑</div>
                <div class="swipe-action swipe-action-right" data-action="delete" data-note-id="${note.id}">🗑️ 删除</div>
                <div class="swipe-content">
                    <div class="note-item" data-note-id="${note.id}">
                        <div class="note-drag-handle" title="拖动排序">⋮⋮</div>
                        ${note.title ? `<div class="note-title">${escapeHtml(note.title)}</div>` : ''}
                        <div class="note-content">${escapeHtml(truncate2Lines(note.content))}</div>
                        <div class="note-meta">
                            <span class="note-time">${formatNoteTime(note.created_at)}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async function showAddGroupPrompt() {
        const { createNoteGroup, showToast, showPrompt } = getUtils();
        const name = await showPrompt('请输入分组名称：', { placeholder: '例如：项目灵感' });
        if (name && name.trim()) {
            const result = await createNoteGroup(name.trim());
            if (result) {
                showToast('分组已创建');
                const state = getState();
                state.expandedGroups.add(String(result.id));
                await renderNotesList();
            }
        }
    }

    function initNoteDragDrop() {
        const container = getElements().notepadContainer;
        if (!container) return;

        container.addEventListener('dragstart', handleNoteDragStart, false);
        container.addEventListener('dragover', handleNoteDragOver, false);
        container.addEventListener('dragenter', handleNoteDragEnter, false);
        container.addEventListener('dragleave', handleNoteDragLeave, false);
        container.addEventListener('drop', handleNoteDrop, false);
        container.addEventListener('dragend', handleNoteDragEnd, false);
    }

    function handleNoteDragStart(e) {
        const swipeItem = e.target.closest('.note-swipe');
        if (!swipeItem) return;

        noteDragState.draggedNoteId = parseInt(swipeItem.dataset.noteId);
        noteDragState.draggedElement = swipeItem;
        noteDragState.dragOverGroupId = null;
        noteDragState.dragOverNoteId = null;

        swipeItem.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', swipeItem.dataset.noteId);

        if (swipeItem.closest('.note-group')) {
            noteDragState.sourceGroupId = parseInt(swipeItem.closest('.note-group').dataset.groupId);
        }

        startAutoScroll();
    }

    function startAutoScroll() {
        if (autoScrollInterval) return;
        autoScrollInterval = setInterval(() => {
            if (!noteDragState.draggedNoteId) {
                stopAutoScroll();
                return;
            }
            const container = getElements().notepadContainer;
            if (!container) return;

            const rect = container.getBoundingClientRect();
            const pointerY = lastDragY || (rect.top + rect.height / 2);
            const relY = pointerY - rect.top;

            if (relY < EDGE_THRESHOLD) {
                container.scrollTop -= SCROLL_SPEED;
            } else if (relY > rect.height - EDGE_THRESHOLD) {
                container.scrollTop += SCROLL_SPEED;
            }
        }, 16);
    }

    function stopAutoScroll() {
        if (autoScrollInterval) {
            clearInterval(autoScrollInterval);
            autoScrollInterval = null;
        }
    }

    function handleNoteDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        lastDragY = e.clientY || e.touches?.[0]?.clientY;

        const swipeItem = e.target.closest('.note-swipe');
        const groupHeader = e.target.closest('.note-group-header');

        if (groupHeader) {
            noteDragState.dragOverGroupId = groupHeader.closest('.note-group')?.dataset.groupId || null;
            noteDragState.dragOverNoteId = null;
            return;
        }

        if (swipeItem && swipeItem !== noteDragState.draggedElement) {
            noteDragState.dragOverNoteId = parseInt(swipeItem.dataset.noteId);
            noteDragState.dragOverGroupId = null;
        }
    }

    function handleNoteDragEnter(e) {
        const swipeItem = e.target.closest('.note-swipe');
        const groupHeader = e.target.closest('.note-group-header');

        if (groupHeader) {
            document.querySelectorAll('.note-group.drag-over').forEach(el => {
                el.classList.remove('drag-over');
            });
            const groupEl = groupHeader.closest('.note-group');
            if (groupEl) {
                groupEl.classList.add('drag-over');
            }
            noteDragState.dragOverGroupId = groupEl?.dataset.groupId || null;
            noteDragState.dragOverNoteId = null;
            return;
        }

        if (!swipeItem || swipeItem === noteDragState.draggedElement) {
            return;
        }

        e.preventDefault();

        document.querySelectorAll('.note-swipe.drag-over').forEach(el => {
            el.classList.remove('drag-over');
        });

        swipeItem.classList.add('drag-over');
        noteDragState.dragOverNoteId = parseInt(swipeItem.dataset.noteId);
        noteDragState.dragOverGroupId = null;
    }

    function handleNoteDragLeave(e) {
        const groupHeader = e.target.closest('.note-group-header');
        const swipeItem = e.target.closest('.note-swipe');

        if (!e.relatedTarget || !e.currentTarget.contains(e.relatedTarget)) {
            document.querySelectorAll('.note-swipe.drag-over').forEach(el => {
                el.classList.remove('drag-over');
            });
            document.querySelectorAll('.note-group.drag-over').forEach(el => {
                el.classList.remove('drag-over');
            });
            noteDragState.dragOverGroupId = null;
            noteDragState.dragOverNoteId = null;
        }
    }

    async function handleNoteDrop(e) {
        e.preventDefault();

        document.querySelectorAll('.note-swipe.drag-over').forEach(el => {
            el.classList.remove('drag-over');
        });
        document.querySelectorAll('.note-group.drag-over').forEach(el => {
            el.classList.remove('drag-over');
        });

        const noteId = noteDragState.draggedNoteId;
        let targetGroupId = null;

        if (noteDragState.dragOverGroupId) {
            targetGroupId = noteDragState.dragOverGroupId === 'ungrouped' ? null : parseInt(noteDragState.dragOverGroupId);
        } else if (noteDragState.selectedGroupId) {
            targetGroupId = noteDragState.selectedGroupId === -1 ? null : noteDragState.selectedGroupId;
        } else if (noteDragState.dragOverNoteId) {
            const overSwipe = document.querySelector(`.note-swipe[data-note-id="${noteDragState.dragOverNoteId}"]`);
            if (overSwipe && overSwipe.closest('.note-group')) {
                targetGroupId = parseInt(overSwipe.closest('.note-group').dataset.groupId);
            }
        }

        noteDragState.selectedGroupId = null;

        if (noteId && targetGroupId !== noteDragState.sourceGroupId) {
            const { updateNote, showToast } = getUtils();
            await updateNote(noteId, { group_id: targetGroupId });
            showToast('笔记已移动');
            await renderNotesList();
        }

        noteDragState = { draggedNoteId: null, draggedElement: null, sourceGroupId: null, dragOverGroupId: null, dragOverNoteId: null, selectedGroupId: null };
    }

    function handleNoteDragEnd(e) {
        stopAutoScroll();
        lastDragY = null;

        document.querySelectorAll('.note-swipe.drag-over').forEach(el => {
            el.classList.remove('drag-over');
        });
        document.querySelectorAll('.note-group.drag-over').forEach(el => {
            el.classList.remove('drag-over');
        });
        document.querySelectorAll('.note-group.selected-group').forEach(el => {
            el.classList.remove('selected-group');
        });

        if (noteDragState.draggedElement) {
            noteDragState.draggedElement.classList.remove('dragging');
        }

        noteDragState = { draggedNoteId: null, draggedElement: null, sourceGroupId: null, dragOverGroupId: null, dragOverNoteId: null, selectedGroupId: null };
    }

    window.ScheduleAppNotesList = {
        renderNotesList,
        renderNoteItem,
        showAddGroupPrompt,
        initNoteDragDrop,
    };

})();
