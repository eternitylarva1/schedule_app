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
        const { fetchNotes, fetchNoteGroups, deleteNoteGroup, showToast, showToastWithUndo, showConfirm, deleteNote, updateNote } = getUtils();

        const container = document.getElementById('notesListScroll') || elements.notepadContainer;

        // Stage 5.2: Show loading skeleton before fetching
        container.innerHTML = `
            <div class="notes-skeleton">
                <div class="skeleton-item"></div>
                <div class="skeleton-item"></div>
                <div class="skeleton-item"></div>
            </div>
        `;

        const notes = await fetchNotes();
        const groups = await fetchNoteGroups() || [];

        // Phase 3.3: also fetch archived notes for trash group
        let archivedNotes = [];
        try {
            archivedNotes = await fetchNotes(true);
            archivedNotes = (archivedNotes || []).filter(n => n.is_archived);
        } catch (e) {
            // ignore
        }

        if (state.expandedGroups.size === 0 && groups.length > 0) {
            groups.forEach((g) => {
                state.expandedGroups.add(String(g.id));
            });
            state.expandedGroups.add('ungrouped');
        }

        if ((!notes || notes.length === 0) && (!groups || groups.length === 0)) {
            container.innerHTML = `
                <div class="notes-empty">
                    <div class="notes-empty-icon">📝</div>
                    <div class="notes-empty-text">暂无笔记</div>
                    <div class="notes-empty-hint">在底部输入框添加一条</div>
                    <button class="notes-empty-guide-btn" id="notesEmptyGuideBtn">开始记录</button>
                </div>
            `;
            // Stage 5.3: Guide button focuses the input
            document.getElementById('notesEmptyGuideBtn')?.addEventListener('click', () => {
                const input = document.getElementById('notepadInput');
                if (input) {
                    input.focus();
                    const notesApp = document.getElementById('notesApp');
                    if (notesApp) notesApp.dataset.active = 'list';
                }
            });
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

        // Phase 3.1: pinned notes are shown at the top in a "📌 固定" group
        const pinnedNotes = notes.filter(n => n.is_pinned);
        if (pinnedNotes.length > 0) {
            html += `
                <details class="note-group" data-group-id="__pinned" open>
                    <summary class="note-group-header" data-group-id="__pinned">
                        <span class="note-group-toggle">▼</span>
                        <span class="note-group-name">📌 固定</span>
                        <span class="note-group-count">${pinnedNotes.length}</span>
                    </summary>
                    <div class="note-group-content">
                        ${pinnedNotes.map(note => renderNoteItem(note)).join('')}
                    </div>
                </details>
            `;
        }

        const sortedGroups = groups.sort((a, b) => a.sort_order - b.sort_order);
        sortedGroups.forEach(group => {
            const isExpanded = state.expandedGroups.has(String(group.id));
            const groupData = groupMap[group.id] || { notes: [] };
            // Skip pinned notes in regular groups (shown in 📌 固定 instead)
            const unpinnedNotes = groupData.notes.filter(n => !n.is_pinned);
            const noteCount = unpinnedNotes.length;

            if (noteCount === 0 && groupData.notes.filter(n => n.is_pinned).length === 0) return; // skip empty groups (pinned notes moved to pinned group)

            html += `
                <details class="note-group" data-group-id="${group.id}" ${isExpanded ? 'open' : ''}>
                    <summary class="note-group-header" data-group-id="${group.id}">
                        <span class="note-group-toggle">${isExpanded ? '▼' : '▶'}</span>
                        <span class="note-group-name">${escapeHtml(group.name)}</span>
                        <span class="note-group-count">${noteCount}</span>
                        <button class="note-group-delete" data-group-id="${group.id}" title="删除分组">×</button>
                    </summary>
                    <div class="note-group-content ${isExpanded ? '' : 'collapsed'}">
                        ${unpinnedNotes.length > 0 ? unpinnedNotes.map(note => renderNoteItem(note)).join('') : '<div class="note-group-empty">暂无笔记</div>'}
                    </div>
                </details>
            `;
        });

        const ungroupedExpanded = state.expandedGroups.has('ungrouped');
        const ungroupedUnpinned = ungroupedNotes.filter(n => !n.is_pinned);
        if (ungroupedUnpinned.length > 0) {
            html += `
                <details class="note-group" data-group-id="ungrouped" ${ungroupedExpanded ? 'open' : ''}>
                    <summary class="note-group-header" data-group-id="ungrouped">
                        <span class="note-group-toggle">${ungroupedExpanded ? '▼' : '▶'}</span>
                        <span class="note-group-name">未分组</span>
                        <span class="note-group-count">${ungroupedUnpinned.length}</span>
                    </summary>
                    <div class="note-group-content ${ungroupedExpanded ? '' : 'collapsed'}">
                        ${ungroupedUnpinned.map(note => renderNoteItem(note)).join('')}
                    </div>
                </details>
            `;
        }

        // Phase 3.3: trash group (archived notes, collapsed by default)
        const trashExpanded = state.expandedGroups.has('trash');
        if (archivedNotes.length > 0) {
            html += `
                <details class="note-group note-group-trash" data-group-id="trash" ${trashExpanded ? 'open' : ''}>
                    <summary class="note-group-header" data-group-id="trash">
                        <span class="note-group-toggle">${trashExpanded ? '▼' : '▶'}</span>
                        <span class="note-group-name" style="color:var(--text-muted);">🗑 废纸篓</span>
                        <span class="note-group-count">${archivedNotes.length}</span>
                    </summary>
                    <div class="note-group-content ${trashExpanded ? '' : 'collapsed'}">
                        ${archivedNotes.map(note => renderNoteItem(note, true)).join('')}
                    </div>
                </details>
            `;
        }

        container.innerHTML = html;
        container.setAttribute('role', 'listbox');
        container.setAttribute('aria-label', '笔记列表');

        container.querySelectorAll('.note-group-delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                e.preventDefault();
                const groupId = parseInt(btn.dataset.groupId);
                const confirmed = await showConfirm('删除分组？分组内的笔记将移至"未分组"。');
                if (confirmed) {
                    await deleteNoteGroup(groupId);
                    showToastWithUndo('分组已删除', null);
                    await renderNotesList();
                }
            });
        });

        // New sidebar "add group" button (footer)
        const newAddGroupBtn = document.getElementById('notesAddGroupBtn');
        if (newAddGroupBtn && newAddGroupBtn.dataset.bound !== '1') {
            newAddGroupBtn.dataset.bound = '1';
            newAddGroupBtn.addEventListener('click', () => {
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
                    // Save current inline editor before switching
                    const editor = window.ScheduleAppNoteEditor;
                    if (editor) {
                        const currentId = typeof editor.getCurrentInlineNoteId === 'function' ? editor.getCurrentInlineNoteId() : null;
                        if (currentId !== null && currentId !== noteId && typeof editor.flushAutoSave === 'function') {
                            const currentNote = state.notes.find(n => n.id === currentId);
                            if (currentNote) editor.flushAutoSave(currentNote);
                        }
                    }

                    state.selectedNote = note;
                    // Phase 3.1: highlight active note
                    container.querySelectorAll('.note-item.active').forEach(el => el.classList.remove('active'));
                    item.classList.add('active');
                    // Phase 3.1: switch to detail tab on mobile
                    const notesApp = document.getElementById('notesApp');
                    if (notesApp) notesApp.dataset.active = 'detail';
                    const subtabs = document.querySelectorAll('.notes-mobile-subtab');
                    subtabs.forEach(t => t.classList.toggle('active', t.dataset.mobileSubtab === 'detail'));

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
                        // Phase 3.2: render inline editor (instead of modal)
                        if (editor && typeof editor.renderInlineEditor === 'function') {
                            editor.renderInlineEditor(note);
                        } else if (editor && typeof editor.showNoteDetail === 'function') {
                            // Fallback to modal
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
                    if (note && editor && typeof editor.renderInlineEditor === 'function') {
                        editor.renderInlineEditor(note);
                    } else if (note && editor && typeof editor.showNoteEdit === 'function') {
                        editor.showNoteEdit(note);
                    }
                } else if (action === 'archive') {
                    // Stage 5.1 + 5.6: Optimistic update — immediately remove DOM element
                    const swipeEl = btn.closest('.note-swipe');
                    if (swipeEl) swipeEl.style.display = 'none';

                    showToastWithUndo('已归档', async () => {
                        // Undo: restore the note
                        await updateNote(noteId, { is_archived: false });
                        await renderNotesList();
                    });

                    // Background API call
                    try {
                        await updateNote(noteId, { is_archived: true });
                        // Clear stale editor if showing this note
                        if (editor && typeof editor.clearInlineEditor === 'function') {
                            const ai = window.ScheduleAppNoteAI;
                            if (ai && ai.getCurrentNoteId && ai.getCurrentNoteId() === noteId) {
                                editor.clearInlineEditor();
                            }
                        }
                    } catch (e) {
                        // On failure: show error and re-render
                        swipeEl.style.display = '';
                        getUtils().showToast('归档失败');
                        await renderNotesList();
                    }
                } else if (action === 'restore') {
                    await updateNote(noteId, { is_archived: false });
                    showToast('已恢复');
                    await renderNotesList();
                } else if (action === 'delete') {
                    const confirmed = await showConfirm('确定永久删除这条笔记吗？');
                    if (confirmed) {
                        // Stage 5.1 + 5.6: Optimistic update — immediately remove DOM element
                        const swipeEl = btn.closest('.note-swipe');
                        if (swipeEl) swipeEl.style.display = 'none';

                        showToastWithUndo('已删除', () => {
                            // Cannot undo permanent delete — show feedback
                            getUtils().showToast('无法撤销');
                        });

                        // Background API call
                        try {
                            await deleteNote(noteId);
                            if (editor && typeof editor.clearInlineEditor === 'function') {
                                editor.clearInlineEditor();
                            }
                        } catch (e) {
                            // On failure: show error and re-render
                            swipeEl.style.display = '';
                            getUtils().showToast('删除失败');
                            await renderNotesList();
                        }
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

        // Phase 3.3: keyboard shortcuts
        function handleNotesKeydown(e) {
            const sidebar = document.getElementById('notesListScroll');
            if (!sidebar) return;

            // Cmd+N / Ctrl+N → create new note
            if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
                e.preventDefault();
                const input = document.getElementById('notepadInput');
                if (input) input.focus();
                return;
            }

            // Esc → clear search
            if (e.key === 'Escape') {
                const searchInput = document.getElementById('notesSearchInput');
                if (searchInput && searchInput.value) {
                    searchInput.value = '';
                    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                    searchInput.blur();
                }
                return;
            }

            // ↑/↓ → navigate between note items
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                const items = Array.from(sidebar.querySelectorAll('.note-item'));
                if (!items.length) return;
                const current = sidebar.querySelector('.note-item.active');
                const idx = current ? items.indexOf(current) : -1;
                const nextIdx = e.key === 'ArrowDown'
                    ? Math.min(idx + 1, items.length - 1)
                    : Math.max(idx - 1, 0);
                if (nextIdx !== idx) {
                    e.preventDefault();
                    items[nextIdx].click();
                }
            }
        }

        // Remove old listener if any, then add new one
        if (container._notesKeydownHandler) {
            document.removeEventListener('keydown', container._notesKeydownHandler);
        }
        container._notesKeydownHandler = handleNotesKeydown;
        document.addEventListener('keydown', handleNotesKeydown);
    }

    function renderNoteItem(note, isTrash = false) {
        const isPinned = !!note.is_pinned;
        const noteColor = note.color || '';
        const inlineColor = noteColor ? ` style="--note-color: ${escapeHtml(noteColor)};"` : '';
        const leftAction = isTrash ? 'restore' : 'edit';
        const leftLabel = isTrash ? '↩ 恢复' : '✏️ 编辑';
        const rightAction = isTrash ? 'delete' : 'archive';
        const rightLabel = isTrash ? '🗑 删除' : '🗑 归档';
        // Phase 3.3.5: if note has title, show title only (no preview)
        const hasTitle = !!(note.title || '').trim();
        return `
            <div class="swipe-item note-swipe" data-note-id="${note.id}" data-is-trash="${isTrash ? '1' : '0'}" draggable="true" role="listitem">
                <div class="swipe-action swipe-action-left" data-action="${leftAction}" data-note-id="${note.id}" role="button" tabindex="0">${leftLabel}</div>
                <div class="swipe-action swipe-action-right" data-action="${rightAction}" data-note-id="${note.id}" role="button" tabindex="0">${rightLabel}</div>
                <div class="swipe-content">
                    <div class="note-item${isPinned ? ' pinned' : ''}" data-note-id="${note.id}"${inlineColor} role="button" tabindex="0">
                        ${hasTitle
                            ? `<div class="note-item-title">${escapeHtml(note.title)}</div>`
                            : `<div class="note-item-preview no-title">${escapeHtml(truncate2Lines(note.content, 80))}</div>`}
                        <div class="note-item-time">${formatNoteTime(note.created_at)}</div>
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
        // Phase 3.1: also listen on the new sidebar container
        const containers = [
            getElements().notepadContainer,
            document.getElementById('notesListScroll'),
        ].filter(Boolean);

        if (!containers.length) return;

        // Use a set to avoid double-binding on the same element
        const seen = new Set();
        containers.forEach(container => {
            if (seen.has(container)) return;
            seen.add(container);
            container.addEventListener('dragstart', handleNoteDragStart, false);
            container.addEventListener('dragover', handleNoteDragOver, false);
            container.addEventListener('dragenter', handleNoteDragEnter, false);
            container.addEventListener('dragleave', handleNoteDragLeave, false);
            container.addEventListener('drop', handleNoteDrop, false);
            container.addEventListener('dragend', handleNoteDragEnd, false);
        });
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
            const draggedEl = noteDragState.draggedElement;
            const sourceGroupId = noteDragState.sourceGroupId;

            // Stage 5.1 + 5.6: Optimistic update — move DOM element to new group immediately
            if (draggedEl) {
                let targetGroupEl = null;
                if (noteDragState.dragOverGroupId) {
                    targetGroupEl = document.querySelector(`.note-group[data-group-id="${noteDragState.dragOverGroupId}"] .note-group-content`);
                } else if (noteDragState.selectedGroupId) {
                    const gid = noteDragState.selectedGroupId === -1 ? 'ungrouped' : noteDragState.selectedGroupId;
                    targetGroupEl = document.querySelector(`.note-group[data-group-id="${gid}"] .note-group-content`);
                } else if (noteDragState.dragOverNoteId) {
                    const overSwipe = document.querySelector(`.note-swipe[data-note-id="${noteDragState.dragOverNoteId}"]`);
                    if (overSwipe) targetGroupEl = overSwipe.closest('.note-group-content');
                }
                if (targetGroupEl) {
                    targetGroupEl.appendChild(draggedEl);
                }
            }

            showToast('笔记已移动');

            // Background API call
            try {
                await updateNote(noteId, { group_id: targetGroupId });
            } catch (e) {
                // On failure: show error and revert DOM
                getUtils().showToast('移动失败');
                // Move back to original group
                if (draggedEl) {
                    let sourceGroupEl = null;
                    const sgid = sourceGroupId === '__pinned' ? '__pinned' : (sourceGroupId === null || sourceGroupId === 'ungrouped' ? 'ungrouped' : String(sourceGroupId));
                    sourceGroupEl = document.querySelector(`.note-group[data-group-id="${sgid}"] .note-group-content`);
                    if (!sourceGroupEl) sourceGroupEl = document.querySelector('.note-group[data-group-id="ungrouped"] .note-group-content');
                    if (sourceGroupEl && draggedEl.parentElement !== sourceGroupEl) {
                        sourceGroupEl.appendChild(draggedEl);
                    }
                }
            }
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
