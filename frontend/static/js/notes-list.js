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

    // Re-entrancy guard for renderNotesList to prevent race conditions on rapid calls
    let _renderVersion = 0;

    const EDGE_THRESHOLD = 80;
    const SCROLL_SPEED = 15;
    function getCurrentUser() {
        try { return JSON.parse(localStorage.getItem('schedule_user') || '{}').id || 'default'; } catch { return 'default'; }
    }
    const _USER = getCurrentUser();
    const _LAST_NOTE_KEY = 'schedule_last_note_' + _USER;

    function _saveLastNoteId(noteId) {
        try { localStorage.setItem(_LAST_NOTE_KEY, String(noteId)); } catch {}
    }

    let autoScrollInterval = null;
    let lastDragY = null;

    async function renderNotesList() {
        const state = getState();
        const elements = getElements();
        const { fetchNotes, fetchNoteGroups, deleteNoteGroup, showToast, showToastWithUndo, showConfirm, deleteNote, updateNote } = getUtils();

        const container = document.getElementById('notesListScroll') || elements.notepadContainer;

        // Re-entrancy guard: increment version, skip if another render started
        const renderId = ++_renderVersion;

        // Stage 5.2: Show loading skeleton only if container is empty (skip if re-rendering)
        const isReRender = container.querySelector('.note-group') || container.querySelector('.notes-empty');
        if (!isReRender) {
            container.innerHTML = `
                <div class="notes-skeleton">
                    <div class="skeleton-item"></div>
                    <div class="skeleton-item"></div>
                    <div class="skeleton-item"></div>
                </div>
            `;
        }

        const notes = await fetchNotes();
        if (renderId !== _renderVersion) return; // another render started, skip
        const groups = await fetchNoteGroups() || [];
        if (renderId !== _renderVersion) return; // another render started, skip

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

        // Task 3: Sort notes before grouping
        const sortBy = (getState().notesSortBy || 'updated');
        if (sortBy === 'updated') {
            notes.sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));
        } else if (sortBy === 'created') {
            notes.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        } else if (sortBy === 'title') {
            notes.sort((a, b) => (a.title || a.content || '').localeCompare(b.title || b.content || ''));
        }

        let html = '';

        // Task 3: Sort bar
        html += `
            <div class="notes-sort-bar" id="notesSortBar">
                <button class="notes-sort-btn${sortBy === 'updated' ? ' active' : ''}" data-sort="updated">修改时间</button>
                <button class="notes-sort-btn${sortBy === 'created' ? ' active' : ''}" data-sort="created">创建时间</button>
                <button class="notes-sort-btn${sortBy === 'title' ? ' active' : ''}" data-sort="title">标题</button>
            </div>
        `;

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
                    <div class="note-group-content">
                        ${archivedNotes.map(note => renderNoteItem(note, true)).join('')}
                    </div>
                </details>
            `;
        }

        container.innerHTML = html;
        container.setAttribute('role', 'listbox');
        container.setAttribute('aria-label', '笔记列表');

        // Task 3: Sort button click handlers
        document.getElementById('notesSortBar')?.querySelectorAll('.notes-sort-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const sort = btn.dataset.sort;
                getState().notesSortBy = sort;
                document.querySelectorAll('.notes-sort-btn').forEach(b => b.classList.toggle('active', b === btn));
                renderNotesList();
            });
        });

        // Stage 5: Group inline rename (double-click on group name)
        container.querySelectorAll('.note-group-name').forEach(nameSpan => {
            const groupEl = nameSpan.closest('.note-group');
            const groupId = groupEl?.dataset.groupId;
            // Skip special groups: __pinned, trash, ungrouped
            if (!groupId || groupId === '__pinned' || groupId === 'trash' || groupId === 'ungrouped') return;

            nameSpan.style.cursor = 'text';
            nameSpan.title = '双击重命名';
            nameSpan.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                const currentName = nameSpan.textContent;
                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'note-group-name-input';
                input.value = currentName;

                nameSpan.replaceWith(input);
                input.focus();
                input.select();

                const finish = async (save) => {
                    if (save && input.value.trim() && input.value.trim() !== currentName) {
                        const newName = input.value.trim();
                        const span = document.createElement('span');
                        span.className = 'note-group-name';
                        span.textContent = newName;
                        input.replaceWith(span);
                        // Re-bind dblclick to new span
                        const { updateNoteGroup } = getUtils();
                        const gid = parseInt(groupId);
                        if (gid && typeof updateNoteGroup === 'function') {
                            await updateNoteGroup(gid, { name: newName });
                        }
                    } else {
                        const span = document.createElement('span');
                        span.className = 'note-group-name';
                        span.textContent = currentName;
                        input.replaceWith(span);
                    }
                };

                input.addEventListener('blur', () => finish(true));
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
                    if (e.key === 'Escape') { finish(false); }
                });
            });
        });

        container.querySelectorAll('.note-group-delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                e.preventDefault();
                const groupId = parseInt(btn.dataset.groupId);
                const confirmed = await showConfirm('删除分组？分组内的笔记将移至"未分组"。');
                if (confirmed) {
                    // Incremental DOM update: move each note to ungrouped, then remove group
                    const state = getState();
                    const notesInGroup = state.notes.filter(n => n.group_id === groupId);
                    notesInGroup.forEach(n => {
                        n.group_id = null;
                        moveNoteRow(n.id, null);
                    });
                    removeGroupRow(groupId);
                    showToastWithUndo('分组已删除', null);
                    await deleteNoteGroup(groupId);
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

        // Use event delegation for note items and swipe actions
        bindNoteRowEvents(container);

        // Sync toggle arrows on all <details> groups
        container.querySelectorAll('.note-group').forEach(group => {
            // Remove old listener to avoid duplicates
            if (group._toggleHandler) group.removeEventListener('toggle', group._toggleHandler);
            group._toggleHandler = () => {
                const toggle = group.querySelector('.note-group-toggle');
                if (toggle) toggle.textContent = group.open ? '▼' : '▶';
            };
            group.addEventListener('toggle', group._toggleHandler);
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
            // BUT: skip if user is editing text — check event target, not activeElement
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                const target = e.target;
                const tag = target?.tagName?.toLowerCase();
                const isEditing = tag === 'input' || tag === 'textarea' || target?.isContentEditable;
                if (isEditing) return;  // let browser handle cursor movement normally
                
                const items = Array.from(sidebar.querySelectorAll('.note-item'));
                if (!items.length) return;
            const current = container.querySelector('.note-item.active');
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
        // Global shortcuts: Cmd+N and Esc (need to be on document)
        const globalHandler = (e) => {
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
        };
        container._notesKeydownHandler = globalHandler;
        document.addEventListener('keydown', globalHandler);

        // ↑/↓ navigation: listen only on the sidebar container, not on document
        // This way, ↑/↓ in editor (contenteditable) won't trigger note switching
        if (container._notesArrowHandler) {
            container.removeEventListener('keydown', container._notesArrowHandler);
        }
        const arrowHandler = (e) => {
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
            const items = Array.from(container.querySelectorAll('.note-item'));
            if (!items.length) return;
            const current = container.querySelector('.note-item.active');
            const idx = current ? items.indexOf(current) : -1;
            const nextIdx = e.key === 'ArrowDown'
                ? Math.min(idx + 1, items.length - 1)
                : Math.max(idx - 1, 0);
            if (nextIdx !== idx) {
                e.preventDefault();
                items[nextIdx].click();
            }
        };
        container._notesArrowHandler = arrowHandler;
        container.addEventListener('keydown', arrowHandler);

        // Auto-select last edited note (skip if already viewing or no saved note)
        const activeId = container.querySelector('.note-item.active')?.dataset.noteId;
        if (activeId) { /* already viewing a note */ }
        else {
            const lastNoteId = (function() { try { return localStorage.getItem(_LAST_NOTE_KEY); } catch { return null; } })();
            if (lastNoteId && getState().notes) {
                const note = getState().notes.find(n => n.id == lastNoteId);
                if (note && !note.is_archived) {
                    const targetItem = container.querySelector(`.note-item[data-note-id="${lastNoteId}"]`);
                    if (targetItem && !targetItem.closest('.note-group[data-group-id="trash"]')) {
                        setTimeout(() => targetItem.click(), 300);
                    }
                }
            }
        }
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
                        <div class="note-item-time">${formatNoteTime(note.updated_at || note.created_at)}</div>
                        <button type="button" class="note-item-menu-btn" data-note-id="${note.id}" title="更多操作" aria-label="更多操作">⋯</button>
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
                // Update state.notes so the note's group_id stays consistent
                const state = getState();
                const noteInState = state.notes.find(n => n.id === noteId);
                if (noteInState) noteInState.group_id = targetGroupId;
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

    // ============================================================
    // Part 1: Incremental DOM update functions (no full re-render)
    // ============================================================

    /**
     * Ensures the __pinned section exists in the DOM. If not, creates it and prepends
     * before the first regular group. Returns the .note-group-content of the pinned section.
     */
    function ensurePinnedSection() {
        const container = document.getElementById('notesListScroll');
        if (!container) return null;

        let pinnedSection = container.querySelector('.note-group[data-group-id="__pinned"]');
        if (pinnedSection) {
            return pinnedSection.querySelector('.note-group-content');
        }

        // Create pinned section
        const pinnedHtml = `
            <details class="note-group" data-group-id="__pinned" open>
                <summary class="note-group-header" data-group-id="__pinned">
                    <span class="note-group-toggle">▼</span>
                    <span class="note-group-name">📌 固定</span>
                    <span class="note-group-count">0</span>
                </summary>
                <div class="note-group-content"></div>
            </details>
        `;

        // Insert before first regular group (data-group-id is numeric)
        const firstGroup = container.querySelector('.note-group[data-group-id]:not([data-group-id="__pinned"]):not([data-group-id="ungrouped"]):not([data-group-id="trash"])');
        if (firstGroup) {
            firstGroup.insertAdjacentHTML('beforebegin', pinnedHtml);
        } else {
            container.insertAdjacentHTML('afterbegin', pinnedHtml);
        }

        pinnedSection = container.querySelector('.note-group[data-group-id="__pinned"]');
        return pinnedSection ? pinnedSection.querySelector('.note-group-content') : null;
    }

    /**
     * Updates the count badge on a group header.
     */
    function updateGroupCount(groupId, count) {
        const container = document.getElementById('notesListScroll');
        if (!container) return;
        const group = container.querySelector(`.note-group[data-group-id="${groupId}"]`);
        if (!group) return;
        const countEl = group.querySelector('.note-group-count');
        if (countEl) countEl.textContent = count;
    }

    /**
     * Ensure the trash section exists. Returns the .note-group-content element.
     */
    function ensureTrashSection() {
        const container = document.getElementById('notesListScroll');
        if (!container) return null;

        let trashSection = container.querySelector('.note-group[data-group-id="trash"]');
        if (trashSection) {
            return trashSection.querySelector('.note-group-content');
        }

        // Create trash section (collapsed by default — native <details> handles hiding)
        const trashHtml = `
            <details class="note-group note-group-trash" data-group-id="trash">
                <summary class="note-group-header" data-group-id="trash">
                    <span class="note-group-toggle">▶</span>
                    <span class="note-group-name" style="color:var(--text-muted);">🗑 废纸篓</span>
                    <span class="note-group-count">0</span>
                </summary>
                <div class="note-group-content"></div>
            </details>
        `;
        container.insertAdjacentHTML('beforeend', trashHtml);

        trashSection = container.querySelector('.note-group[data-group-id="trash"]');
        if (trashSection) {
            // Sync toggle arrow with native details open/close
            trashSection.addEventListener('toggle', () => {
                const toggle = trashSection.querySelector('.note-group-toggle');
                if (toggle) toggle.textContent = trashSection.open ? '▼' : '▶';
            });
        }
        return trashSection ? trashSection.querySelector('.note-group-content') : null;
    }

    /**
     * insertNoteRow — insert a single note row into the right group section.
     * @param {Object} note — the note object
     * @param {string} position — 'top' or 'bottom'
     */
    function insertNoteRow(note, position = 'top') {
        const container = document.getElementById('notesListScroll');
        if (!container) return;

        const isTrash = !!note.is_archived;
        const noteHtml = renderNoteItem(note, isTrash);

        let targetContent = null;

        if (isTrash) {
            targetContent = ensureTrashSection();
        } else if (note.is_pinned) {
            targetContent = ensurePinnedSection();
        } else if (note.group_id) {
            targetContent = container.querySelector(`.note-group[data-group-id="${note.group_id}"] .note-group-content`);
        } else {
            targetContent = container.querySelector('.note-group[data-group-id="ungrouped"] .note-group-content');
        }

        if (!targetContent) return;

        // Remove "暂无笔记" placeholder if present
        const emptyPlaceholder = targetContent.querySelector('.note-group-empty');
        if (emptyPlaceholder) emptyPlaceholder.remove();

        if (position === 'top') {
            targetContent.insertAdjacentHTML('afterbegin', noteHtml);
        } else {
            targetContent.insertAdjacentHTML('beforeend', noteHtml);
        }

        // Update group count
        let groupId;
        if (isTrash) groupId = 'trash';
        else if (note.is_pinned) groupId = '__pinned';
        else groupId = note.group_id || 'ungrouped';
        const currentCount = targetContent.querySelectorAll('.note-swipe').length;
        updateGroupCount(groupId, currentCount);

        // Rebind click/swipe events on the new row
        bindNoteRowEvents(container);
    }

    /**
     * removeNoteRow — remove a single note row from the DOM.
     * @param {number} noteId
     */
    function removeNoteRow(noteId) {
        const container = document.getElementById('notesListScroll');
        if (!container) return;

        const swipeEl = container.querySelector(`.note-swipe[data-note-id="${noteId}"]`);
        if (!swipeEl) return;

        const groupContent = swipeEl.closest('.note-group-content');
        const groupId = swipeEl.closest('.note-group')?.dataset.groupId;

        swipeEl.remove();

        // If group content is now empty, show placeholder
        if (groupContent && !groupContent.querySelector('.note-swipe')) {
            groupContent.insertAdjacentHTML('beforeend', '<div class="note-group-empty">暂无笔记</div>');
        }

        // Update count
        if (groupContent) {
            const count = groupContent.querySelectorAll('.note-swipe').length;
            if (groupId) updateGroupCount(groupId, count);
        }
    }

    /**
     * updateNoteRow — replace a single note row with fresh HTML (used after content edit).
     * Preserves .active class if it was active.
     * @param {Object} note
     */
    function updateNoteRow(note) {
        const container = document.getElementById('notesListScroll');
        if (!container) return;

        const existingSwipe = container.querySelector(`.note-swipe[data-note-id="${note.id}"]`);
        if (!existingSwipe) return;

        const wasActive = existingSwipe.querySelector('.note-item')?.classList.contains('active');
        const isTrash = !!note.is_archived;
        const newHtml = renderNoteItem(note, isTrash);

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = newHtml;
        const newSwipe = tempDiv.firstElementChild;

        if (wasActive) {
            const newItem = newSwipe.querySelector('.note-item');
            if (newItem) newItem.classList.add('active');
        }

        existingSwipe.replaceWith(newSwipe);

        // Rebind events
        bindNoteRowEvents(container);
    }

    /**
     * moveNoteRow — move a note row to a different group section.
     * @param {number} noteId
     * @param {number|null} targetGroupId — null means ungrouped
     */
    function moveNoteRow(noteId, targetGroupId) {
        const container = document.getElementById('notesListScroll');
        if (!container) return;

        const swipeEl = container.querySelector(`.note-swipe[data-note-id="${noteId}"]`);
        if (!swipeEl) return;

        const note = getState().notes.find(n => n.id === noteId);
        const sourceGroupId = swipeEl.closest('.note-group')?.dataset.groupId;

        // Determine target group ID string
        let targetGroupIdStr = targetGroupId !== null ? String(targetGroupId) : 'ungrouped';
        // Pinned notes go to __pinned regardless of their group_id
        if (note?.is_pinned) {
            targetGroupIdStr = '__pinned';
        }

        const targetContent = container.querySelector(`.note-group[data-group-id="${targetGroupIdStr}"] .note-group-content`);
        if (!targetContent || !targetContent.contains(swipeEl)) {
            // Remove "暂无笔记" placeholder
            const emptyPlaceholder = targetContent?.querySelector('.note-group-empty');
            if (emptyPlaceholder) emptyPlaceholder.remove();

            if (targetContent) {
                targetContent.appendChild(swipeEl);
            }
        }

        // Update source group
        if (sourceGroupId) {
            const srcContent = container.querySelector(`.note-group[data-group-id="${sourceGroupId}"] .note-group-content`);
            if (srcContent && !srcContent.querySelector('.note-swipe')) {
                srcContent.insertAdjacentHTML('beforeend', '<div class="note-group-empty">暂无笔记</div>');
            }
            const srcCount = srcContent?.querySelectorAll('.note-swipe').length || 0;
            updateGroupCount(sourceGroupId, srcCount);
        }

        // Update target group count
        const newCount = targetContent?.querySelectorAll('.note-swipe').length || 0;
        updateGroupCount(targetGroupIdStr, newCount);

        // Rebind events
        bindNoteRowEvents(container);
    }

    /**
     * togglePinRow — move a note to/from the pinned section.
     * @param {number} noteId
     * @param {boolean} isPinned
     */
    function togglePinRow(noteId, isPinned) {
        if (isPinned) {
            // Ensure pinned section exists, then move the row there
            ensurePinnedSection();
            moveNoteRow(noteId, '__pinned');
        } else {
            const note = getState().notes.find(n => n.id === noteId);
            moveNoteRow(noteId, note?.group_id || null);
        }
    }

    /**
     * updateNoteColorRow — update only the color bar on a note item.
     * @param {number} noteId
     * @param {string} color — hex color or '' for none
     */
    function updateNoteColorRow(noteId, color) {
        const container = document.getElementById('notesListScroll');
        if (!container) return;

        const noteItem = container.querySelector(`.note-item[data-note-id="${noteId}"]`);
        if (!noteItem) return;

        if (color) {
            noteItem.style.setProperty('--note-color', color);
        } else {
            noteItem.style.removeProperty('--note-color');
        }
    }

    /**
     * renameGroupRow — update group name text.
     * @param {number} groupId
     * @param {string} newName
     */
    function renameGroupRow(groupId, newName) {
        const container = document.getElementById('notesListScroll');
        if (!container) return;

        const group = container.querySelector(`.note-group[data-group-id="${groupId}"]`);
        if (!group) return;

        const nameSpan = group.querySelector('.note-group-name');
        if (nameSpan) {
            nameSpan.textContent = newName;
        }
    }

    /**
     * removeGroupRow — remove an entire group section from DOM.
     * @param {number} groupId
     */
    function removeGroupRow(groupId) {
        const container = document.getElementById('notesListScroll');
        if (!container) return;

        const group = container.querySelector(`.note-group[data-group-id="${groupId}"]`);
        if (group) group.remove();
    }

    /**
     * Bind click/swipe events to note rows within a container.
     * Uses event delegation — a single listener on the container.
     * Call this after any DOM manipulation that adds new rows.
     */
    function bindNoteRowEvents(container) {
        if (!container) return;

        // Remove old delegated listeners
        if (container._noteDelegatedHandler) {
            container.removeEventListener('click', container._noteDelegatedHandler);
        }
        if (container._noteContextMenuHandler) {
            container.removeEventListener('contextmenu', container._noteContextMenuHandler);
        }

        const handler = async (e) => {
            // ⋯ menu button on note card — entry point #2
            const menuBtn = e.target.closest('.note-item-menu-btn');
            if (menuBtn) {
                e.stopPropagation();
                e.preventDefault();
                const noteId = parseInt(menuBtn.dataset.noteId);
                const note = getState().notes.find(n => n.id === noteId);
                if (note) {
                    const rect = menuBtn.getBoundingClientRect();
                    showNoteContextMenu(note, rect.left, rect.bottom + 4);
                }
                return;
            }

            const item = e.target.closest('.note-item');
            if (item && !e.target.closest('.swipe-action') && !e.target.closest('.note-item-menu-btn')) {
                const parentSwipe = item.closest('.swipe-item');
                if (parentSwipe && parentSwipe.classList.contains('swipe-open')) {
                    if (getUtils().closeAllOpenSwipeItems) {
                        getUtils().closeAllOpenSwipeItems();
                    }
                    return;
                }
                const noteId = parseInt(item.dataset.noteId);
                const state = getState();
                const note = state.notes.find(n => n.id === noteId);
                if (note) {
                    const editor = window.ScheduleAppNoteEditor;
                    if (editor) {
                        const currentId = typeof editor.getCurrentInlineNoteId === 'function' ? editor.getCurrentInlineNoteId() : null;
                        if (currentId !== null && currentId !== noteId && typeof editor.flushAutoSave === 'function') {
                            const currentNote = state.notes.find(n => n.id === currentId);
                            if (currentNote) editor.flushAutoSave(currentNote);
                        }
                    }

                    state.selectedNote = note;
                    _saveLastNoteId(note.id);
                    container.querySelectorAll('.note-item.active').forEach(el => el.classList.remove('active'));
                    item.classList.add('active');
                    const notesApp = document.getElementById('notesApp');
                    if (notesApp) notesApp.dataset.active = 'detail';
                    const subtabs = document.querySelectorAll('.notes-mobile-subtab');
                    subtabs.forEach(t => t.classList.toggle('active', t.dataset.mobileSubtab === 'detail'));

                    if (editor && typeof editor.renderInlineEditor === 'function') {
                        editor.renderInlineEditor(note);
                    }
                }
            }

            const btn = e.target.closest('.swipe-action');
            if (btn) {
                e.stopPropagation();
                const action = btn.dataset.action;
                const noteId = parseInt(btn.dataset.noteId);
                const editor = window.ScheduleAppNoteEditor;
                const { updateNote, deleteNote, showToast, showToastWithUndo, showConfirm } = getUtils();

                if (action === 'edit') {
                    const note = getState().notes.find(n => n.id === noteId);
                    if (note && editor && typeof editor.renderInlineEditor === 'function') {
                        editor.renderInlineEditor(note);
                    } else if (note && editor && typeof editor.showNoteEdit === 'function') {
                        editor.showNoteEdit(note);
                    }
                } else if (action === 'archive') {
                    const swipeEl = btn.closest('.note-swipe');
                    if (swipeEl) swipeEl.style.display = 'none';

                    showToastWithUndo('已归档', async () => {
                        await updateNote(noteId, { is_archived: false });
                        const note = getState().notes.find(n => n.id === noteId);
                        if (note) {
                            note.is_archived = false;
                            insertNoteRow(note);
                        }
                    });

                    try {
                        await updateNote(noteId, { is_archived: true });
                        const noteForTrash = getState().notes.find(n => n.id === noteId);
                        if (noteForTrash) noteForTrash.is_archived = true;
                        if (editor && typeof editor.clearInlineEditor === 'function') {
                            const ai = window.ScheduleAppNoteAI;
                            if (ai && ai.getCurrentNoteId && ai.getCurrentNoteId() === noteId) {
                                editor.clearInlineEditor();
                            }
                        }
                        // Remove from current group and insert into trash
                        removeNoteRow(noteId);
                        if (noteForTrash) insertNoteRow(noteForTrash);
                    } catch (e) {
                        swipeEl.style.display = '';
                        showToast('归档失败');
                        await renderNotesList();
                    }
                } else if (action === 'restore') {
                    try {
                        await updateNote(noteId, { is_archived: false });
                        showToast('已恢复');
                        removeNoteRow(noteId);
                        const updatedNote = getState().notes.find(n => n.id === noteId);
                        if (updatedNote) insertNoteRow(updatedNote);
                    } catch (e) {
                        showToast('恢复失败');
                    }
                } else if (action === 'delete') {
                    const confirmed = await showConfirm('确定永久删除这条笔记吗？');
                    if (confirmed) {
                        const swipeEl = btn.closest('.note-swipe');
                        if (swipeEl) swipeEl.style.display = 'none';

                        showToastWithUndo('已删除', () => {
                            showToast('无法撤销');
                        });

                        try {
                            await deleteNote(noteId);
                            if (editor && typeof editor.clearInlineEditor === 'function') {
                                editor.clearInlineEditor();
                            }
                            removeNoteRow(noteId);
                        } catch (e) {
                            swipeEl.style.display = '';
                            showToast('删除失败');
                            await renderNotesList();
                        }
                    }
                }
            }
        };

        // Entry point #1: right-click context menu
        const contextMenuHandler = (e) => {
            const item = e.target.closest('.note-item');
            if (!item) return;
            const noteId = parseInt(item.dataset.noteId);
            const note = getState().notes.find(n => n.id === noteId);
            if (!note) return;
            e.preventDefault();
            showNoteContextMenu(note, e.clientX, e.clientY);
        };

        container._noteDelegatedHandler = handler;
        container._noteContextMenuHandler = contextMenuHandler;
        container.addEventListener('click', handler);
        container.addEventListener('contextmenu', contextMenuHandler);
    }

    window.ScheduleAppNotesList = {
        renderNotesList,
        renderNoteItem,
        showAddGroupPrompt,
        initNoteDragDrop,
        // Incremental update functions
        insertNoteRow,
        removeNoteRow,
        updateNoteRow,
        moveNoteRow,
        togglePinRow,
        updateNoteColorRow,
        renameGroupRow,
        removeGroupRow,
        showNoteContextMenu,
    };

    // ============================================================
    // Context Menu Component (3 entry points: right-click, ⋯ card, ⋯ editor)
    // ============================================================

    let _activeContextMenu = null;
    let _dismissContextMenuHandler = null;
    let _dismissEscapeHandler = null;

    function hideNoteContextMenu() {
        if (_activeContextMenu) {
            _activeContextMenu.remove();
            _activeContextMenu = null;
        }
        if (_dismissContextMenuHandler) {
            document.removeEventListener('click', _dismissContextMenuHandler);
            _dismissContextMenuHandler = null;
        }
        if (_dismissEscapeHandler) {
            document.removeEventListener('keydown', _dismissEscapeHandler);
            _dismissEscapeHandler = null;
        }
    }

    function _onContextMenuClick(e) {
        if (_activeContextMenu && !_activeContextMenu.contains(e.target)) {
            hideNoteContextMenu();
        }
    }

    function _onContextMenuEscape(e) {
        if (e.key === 'Escape') hideNoteContextMenu();
    }

    const NOTE_MENU_COLORS = [
        { value: '', label: '无' },
        { value: '#4CAF50', label: '绿' },
        { value: '#FF5722', label: '橙' },
        { value: '#9C27B0', label: '紫' },
        { value: '#00BCD4', label: '青' },
        { value: '#FF9800', label: '黄' },
        { value: '#E91E63', label: '粉' },
        { value: '#3F51B5', label: '蓝' },
    ];

    function showNoteContextMenu(note, x, y) {
        hideNoteContextMenu();

        const state = getState();
        const groups = state.noteGroups || [];
        const isTrash = !!note.is_archived;
        const isPinned = !!note.is_pinned;

        const colorSwatchesHtml = NOTE_MENU_COLORS.map(c => `
            <button class="note-menu-color-swatch${(note.color || '') === c.value ? ' active' : ''}${!c.value ? ' no-color' : ''}"
                    data-color="${c.value}"
                    title="${c.label}"
                    style="${c.value ? 'background:' + c.value + ';' : ''}">
                ${c.value ? '' : '✕'}
            </button>
        `).join('');

        const moveOptionsHtml = groups.map(g => `
            <button class="note-menu-item note-menu-move-item" data-move-to="${g.id}">
                <span class="note-menu-icon">📁</span>
                <span class="note-menu-label">${escapeHtml(g.name)}</span>
                ${note.group_id === g.id ? '<span class="note-menu-check">✓</span>' : ''}
            </button>
        `).join('');

        const menu = document.createElement('div');
        menu.className = 'note-context-menu';
        if (isTrash) menu.dataset.mode = 'trash';
        menu.innerHTML = `
            ${!isTrash ? `
            <button class="note-menu-item" data-action="pin">
                <span class="note-menu-icon">${isPinned ? '📍' : '📌'}</span>
                <span class="note-menu-label">${isPinned ? '取消固定' : '固定到顶部'}</span>
            </button>
            <div class="note-menu-section">
                <div class="note-menu-section-title">颜色</div>
                <div class="note-menu-colors">${colorSwatchesHtml}</div>
            </div>
            ${groups.length > 0 ? `
            <div class="note-menu-section">
                <div class="note-menu-section-title">移动到</div>
                <div class="note-menu-move-list">${moveOptionsHtml}</div>
            </div>
            ` : ''}
            <div class="note-menu-divider"></div>
            ${isTrash ? `
                <button class="note-menu-item" data-action="restore">
                    <span class="note-menu-icon">↩️</span>
                    <span class="note-menu-label">恢复</span>
                </button>
                <button class="note-menu-item note-menu-danger" data-action="delete-permanent">
                    <span class="note-menu-icon">🗑</span>
                    <span class="note-menu-label">永久删除</span>
                </button>
            ` : `
                <button class="note-menu-item" data-action="archive">
                    <span class="note-menu-icon">🗑</span>
                    <span class="note-menu-label">归档</span>
                </button>
            `}
            ` : `
            <button class="note-menu-item" data-action="restore">
                <span class="note-menu-icon">↩️</span>
                <span class="note-menu-label">恢复</span>
            </button>
            <button class="note-menu-item note-menu-danger" data-action="delete-permanent">
                <span class="note-menu-icon">🗑</span>
                <span class="note-menu-label">永久删除</span>
            </button>
            `}
        `;

        document.body.appendChild(menu);

        // Viewport clamping
        const rect = menu.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let px = x;
        let py = y;
        if (px + rect.width > vw - 8) px = vw - rect.width - 8;
        if (py + rect.height > vh - 8) py = vh - rect.height - 8;
        if (px < 8) px = 8;
        if (py < 8) py = 8;
        menu.style.left = px + 'px';
        menu.style.top = py + 'px';

        _activeContextMenu = menu;

        _dismissContextMenuHandler = _onContextMenuClick;
        _dismissEscapeHandler = _onContextMenuEscape;
        setTimeout(() => {
            document.addEventListener('click', _dismissContextMenuHandler);
            document.addEventListener('keydown', _dismissEscapeHandler);
        }, 0);

        // Action handling via event delegation
        menu.addEventListener('click', async (e) => {
            const colorSwatch = e.target.closest('.note-menu-color-swatch');
            const moveItem = e.target.closest('.note-menu-move-item');
            const actionItem = e.target.closest('[data-action]');

            if (colorSwatch) {
                e.stopPropagation();
                const newColor = colorSwatch.dataset.color;
                const { updateNote } = getUtils();
                try {
                    await updateNote(note.id, { color: newColor });
                    note.color = newColor;
                    if (typeof updateNoteColorRow === 'function') {
                        updateNoteColorRow(note.id, newColor);
                    }
                    getUtils().showToast(newColor ? '颜色已更新' : '颜色已清除');
                } catch (err) {
                    getUtils().showToast('更新失败');
                }
                hideNoteContextMenu();
                return;
            }

            if (moveItem) {
                e.stopPropagation();
                const targetGroupId = parseInt(moveItem.dataset.moveTo);
                if (targetGroupId === note.group_id) {
                    hideNoteContextMenu();
                    return;
                }
                const { updateNote } = getUtils();
                try {
                    await updateNote(note.id, { group_id: targetGroupId });
                    note.group_id = targetGroupId;
                    if (typeof moveNoteRow === 'function') {
                        moveNoteRow(note.id, targetGroupId);
                    }
                    getUtils().showToast('已移动');
                } catch (err) {
                    getUtils().showToast('移动失败');
                }
                hideNoteContextMenu();
                return;
            }

            if (actionItem) {
                e.stopPropagation();
                const action = actionItem.dataset.action;
                await _handleContextMenuAction(note, action);
                hideNoteContextMenu();
            }
        });
    }

    async function _handleContextMenuAction(note, action) {
        const { updateNote, deleteNote, showToast, showToastWithUndo, showConfirm } = getUtils();
        const editor = window.ScheduleAppNoteEditor;

        if (action === 'pin') {
            const newPinned = !note.is_pinned;
            try {
                await updateNote(note.id, { is_pinned: newPinned });
                note.is_pinned = newPinned;
                if (typeof togglePinRow === 'function') {
                    togglePinRow(note.id, newPinned);
                }
                const pinBtn = document.getElementById('noteInlinePinBtn');
                if (pinBtn) {
                    pinBtn.classList.toggle('active', newPinned);
                    pinBtn.title = newPinned ? '取消固定' : '固定';
                }
                showToast(newPinned ? '已固定到顶部 📌' : '已取消固定');
            } catch (e) {
                showToast('操作失败');
            }
        } else if (action === 'archive') {
            const swipeEl = document.querySelector(`.note-swipe[data-note-id="${note.id}"]`);
            if (swipeEl) swipeEl.style.display = 'none';

            showToastWithUndo('已归档', async () => {
                await updateNote(note.id, { is_archived: false });
                note.is_archived = false;
                if (typeof insertNoteRow === 'function') {
                    insertNoteRow(note);
                }
            });

            try {
                await updateNote(note.id, { is_archived: true });
                note.is_archived = true;
                if (editor && typeof editor.clearInlineEditor === 'function') {
                    const ai = window.ScheduleAppNoteAI;
                    if (ai && ai.getCurrentNoteId && ai.getCurrentNoteId() === note.id) {
                        editor.clearInlineEditor();
                    }
                }
                if (typeof removeNoteRow === 'function') {
                    removeNoteRow(note.id);
                }
                // Re-insert into trash section
                if (typeof insertNoteRow === 'function') {
                    insertNoteRow(note);
                }
            } catch (e) {
                if (swipeEl) swipeEl.style.display = '';
                showToast('归档失败');
            }
        } else if (action === 'restore') {
            try {
                await updateNote(note.id, { is_archived: false });
                note.is_archived = false;
                if (typeof removeNoteRow === 'function') {
                    removeNoteRow(note.id);
                }
                if (typeof insertNoteRow === 'function') {
                    insertNoteRow(note);
                }
                showToast('已恢复');
            } catch (e) {
                showToast('恢复失败');
            }
        } else if (action === 'delete-permanent') {
            const confirmed = await showConfirm('确定永久删除这条笔记吗？\n此操作不可撤销');
            if (!confirmed) return;

            const swipeEl = document.querySelector(`.note-swipe[data-note-id="${note.id}"]`);
            if (swipeEl) swipeEl.style.display = 'none';

            showToastWithUndo('已删除', () => {
                showToast('无法撤销');
            });

            try {
                await deleteNote(note.id);
                if (editor && typeof editor.clearInlineEditor === 'function') {
                    editor.clearInlineEditor();
                }
                if (typeof removeNoteRow === 'function') {
                    removeNoteRow(note.id);
                }
            } catch (e) {
                if (swipeEl) swipeEl.style.display = '';
                showToast('删除失败');
            }
        }
    }

})();
