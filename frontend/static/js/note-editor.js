/**
 * Schedule App - Note Editor Module
 * Phase 3.2: inline editor in the right pane.
 *
 * Provides:
 *   - renderInlineEditor(note): 渲染编辑器到 #notesMain
 *   - clearInlineEditor(): 清空主区,恢复占位符
 *   - showNoteDetail(note): 保留的详情模态(fallback)
 *   - showNoteEdit(note): 保留的编辑模态(fallback)
 *   - closeAllModals(): 关闭所有模态
 *
 * Cross-module dependency: window.ScheduleAppNoteAI (note-ai.js).
 */

(function() {
    'use strict';

    const getState = () => (window.ScheduleAppCore && window.ScheduleAppCore.state) || {};
    const getUtils = () => window.ScheduleAppCore || {};

    // 8 色调色板 (与 goals 同款)
    const NOTE_COLORS = [
        { value: '', label: '无', hex: 'transparent' },
        { value: '#4CAF50', label: '绿', hex: '#4CAF50' },
        { value: '#FF5722', label: '橙', hex: '#FF5722' },
        { value: '#9C27B0', label: '紫', hex: '#9C27B0' },
        { value: '#00BCD4', label: '青', hex: '#00BCD4' },
        { value: '#FF9800', label: '黄', hex: '#FF9800' },
        { value: '#E91E63', label: '粉', hex: '#E91E63' },
        { value: '#3F51B5', label: '靛', hex: '#3F51B5' },
    ];

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function isSameDay(date1, date2) {
        if (!date1 || !date2) return false;
        const d1 = new Date(date1);
        const d2 = new Date(date2);
        return d1.getFullYear() === d2.getFullYear() &&
               d1.getMonth() === d2.getMonth() &&
               d1.getDate() === d2.getDate();
    }

    function formatNoteTime(isoString) {
        if (!isoString) return '';
        const date = new Date(isoString);
        const now = new Date();
        const isToday = isSameDay(date, now);
        const yesterday = new Date(now.getTime() - 86400000);
        const isYesterday = isSameDay(date, yesterday);

        if (isToday) {
            return `今天 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
        } else if (isYesterday) {
            return `昨天 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
        } else {
            return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
        }
    }

    function getAIWindow() {
        return window.ScheduleAppNoteAI;
    }

    // ===== Inline editor (Phase 3.2) =====

    let _saveTimer = null;
    let _currentInlineNoteId = null;

    function renderInlineEditor(note) {
        const main = document.getElementById('notesMain');
        if (!main) return;
        const state = getState();
        state.selectedNote = note;
        _currentInlineNoteId = note.id;

        // Build color options
        const colorOptionsHtml = NOTE_COLORS.map(c => {
            const selected = (note.color || '') === c.value ? ' selected' : '';
            const isEmpty = !c.value;
            return `<button type="button" class="note-inline-color-option${selected}${isEmpty ? ' no-color' : ''}" data-color="${escapeHtml(c.value)}" title="${escapeHtml(c.label)}"${c.value ? ` style="background:${c.value};"` : ''}>${isEmpty ? '无' : ''}</button>`;
        }).join('');

        main.innerHTML = `
            <div class="note-inline-editor" data-note-id="${note.id}">
                <div class="note-inline-toolbar">
                    <input type="text" id="noteInlineTitle" class="note-inline-title" placeholder="标题（可选）" value="${escapeHtml(note.title || '')}">
                    <div class="note-inline-toolbar-right">
                        <button type="button" class="note-inline-pin-btn${note.is_pinned ? ' active' : ''}" id="noteInlinePinBtn" title="${note.is_pinned ? '取消固定' : '固定'}">📌</button>
                        <button type="button" class="note-inline-ai-btn" id="noteInlineAiBtn" title="打开 AI 助手对话">🤖</button>
                    </div>
                </div>
                <div class="note-inline-color-row" id="noteInlineColorRow">
                    ${colorOptionsHtml}
                </div>
                <div class="note-inline-content" id="noteInlineContent" contenteditable="true" data-placeholder="开始写..." spellcheck="false">${escapeHtml(note.content || '')}</div>
                <div class="note-inline-footer">
                    <span class="note-inline-time">${formatNoteTime(note.created_at)} · ${formatNoteTime(note.updated_at) !== formatNoteTime(note.created_at) ? '已编辑' : '新建'}</span>
                    <span class="note-inline-save-status" id="noteInlineSaveStatus"></span>
                </div>
            </div>
        `;

        bindInlineEditorEvents(note);
    }

    function bindInlineEditorEvents(note) {
        const titleInput = document.getElementById('noteInlineTitle');
        const contentEl = document.getElementById('noteInlineContent');
        const pinBtn = document.getElementById('noteInlinePinBtn');
        const aiBtn = document.getElementById('noteInlineAiBtn');
        const colorRow = document.getElementById('noteInlineColorRow');
        const saveStatus = document.getElementById('noteInlineSaveStatus');

        // Auto-save (debounced) on title change
        titleInput.addEventListener('input', () => {
            scheduleAutoSave(note);
        });

        // Auto-save (debounced) on content change
        contentEl.addEventListener('input', () => {
            scheduleAutoSave(note);
        });

        // Save on blur (any field)
        titleInput.addEventListener('blur', () => {
            flushAutoSave(note);
        });
        contentEl.addEventListener('blur', () => {
            flushAutoSave(note);
        });

        // Pin toggle
        pinBtn.addEventListener('click', async () => {
            const { updateNote, showToast } = getUtils();
            const newPinned = !note.is_pinned;
            try {
                const result = await updateNote(note.id, { is_pinned: newPinned });
                if (result) {
                    note.is_pinned = newPinned;
                    pinBtn.classList.toggle('active', newPinned);
                    pinBtn.title = newPinned ? '取消固定' : '固定';
                    showToast(newPinned ? '已固定到顶部 📌' : '已取消固定');
                    // Refresh list to move note
                    if (window.ScheduleAppNotesList && typeof window.ScheduleAppNotesList.renderNotesList === 'function') {
                        await window.ScheduleAppNotesList.renderNotesList();
                    }
                }
            } catch (e) {
                console.error('Pin toggle failed:', e);
                showToast('操作失败');
            }
        });

        // AI button
        aiBtn.addEventListener('click', () => {
            const ai = getAIWindow();
            if (ai && typeof ai.showAIFloatingWindow === 'function') {
                ai.showAIFloatingWindow(note);
            }
        });

        // Color picker
        colorRow.querySelectorAll('.note-inline-color-option').forEach(btn => {
            btn.addEventListener('click', async () => {
                const newColor = btn.dataset.color || '';
                // Update visual selection
                colorRow.querySelectorAll('.note-inline-color-option').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                // Save
                const { updateNote, showToast } = getUtils();
                try {
                    const result = await updateNote(note.id, { color: newColor });
                    if (result) {
                        note.color = newColor;
                        showToast(newColor ? '颜色已更新' : '颜色已清除');
                        // Refresh list to update color bar
                        if (window.ScheduleAppNotesList && typeof window.ScheduleAppNotesList.renderNotesList === 'function') {
                            await window.ScheduleAppNotesList.renderNotesList();
                        }
                    }
                } catch (e) {
                    console.error('Color update failed:', e);
                    showToast('更新失败');
                }
            });
        });
    }

    function scheduleAutoSave(note) {
        clearTimeout(_saveTimer);
        const saveStatus = document.getElementById('noteInlineSaveStatus');
        if (saveStatus) saveStatus.textContent = '编辑中...';
        _saveTimer = setTimeout(() => {
            saveInlineNote(note);
        }, 800);
    }

    async function flushAutoSave(note) {
        clearTimeout(_saveTimer);
        await saveInlineNote(note);
    }

    async function saveInlineNote(note) {
        const titleInput = document.getElementById('noteInlineTitle');
        const contentEl = document.getElementById('noteInlineContent');
        const saveStatus = document.getElementById('noteInlineSaveStatus');
        if (!titleInput || !contentEl) return;

        const newTitle = titleInput.value.trim();
        const newContent = (contentEl.innerText || contentEl.textContent || '').trim();

        // Check no-op
        if (newTitle === (note.title || '') && newContent === (note.content || '')) {
            if (saveStatus) saveStatus.textContent = '已保存';
            return;
        }

        if (saveStatus) saveStatus.textContent = '保存中...';

        const { updateNote, showToast } = getUtils();
        try {
            const result = await updateNote(note.id, {
                title: newTitle,
                content: newContent,
            });
            if (result) {
                note.title = newTitle;
                note.content = newContent;
                note.updated_at = result.updated_at;
                if (saveStatus) saveStatus.textContent = '✓ 已保存';
                // Update AI window if open
                const ai = getAIWindow();
                if (ai && ai.getCurrentNoteId && ai.getCurrentNoteId() === note.id && ai.updateCurrentNoteContent) {
                    ai.updateCurrentNoteContent(newContent);
                }
            } else {
                if (saveStatus) saveStatus.textContent = '保存失败';
            }
        } catch (e) {
            console.error('Save failed:', e);
            if (saveStatus) saveStatus.textContent = '保存失败';
            showToast('保存失败');
        }
    }

    function clearInlineEditor() {
        const main = document.getElementById('notesMain');
        if (!main) return;
        clearTimeout(_saveTimer);
        _currentInlineNoteId = null;
        const state = getState();
        state.selectedNote = null;
        main.innerHTML = `
            <div class="notes-main-placeholder">
                <div class="placeholder-icon">📝</div>
                <div class="placeholder-text">选择一条笔记查看详情</div>
                <div class="placeholder-hint">或顶栏 + 新建一条</div>
            </div>
        `;
    }

    function getCurrentInlineNoteId() {
        return _currentInlineNoteId;
    }

    // ===== Legacy modals (kept as fallback) =====

    async function showNoteDetail(note) {
        const state = getState();
        state.selectedNote = note;

        const detailHtml = `
            <div class="modal" id="noteDetailModal">
                <div class="modal-backdrop" id="noteDetailBackdrop"></div>
                <div class="modal-content">
                    <div class="modal-header">
                        <h2>笔记详情</h2>
                        <button class="modal-close" id="noteDetailClose">×</button>
                    </div>
                    <div class="modal-body">
                        ${note.title ? `<div class="note-detail-title">${escapeHtml(note.title)}</div>` : ''}
                        <div class="note-detail-content">${escapeHtml(note.content)}</div>
                        <div class="note-detail-time">${formatNoteTime(note.created_at)}</div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" id="noteDetailEditBtn">编辑</button>
                        <button class="btn btn-danger" id="noteDetailDeleteBtn">删除</button>
                    </div>
                </div>
            </div>
        `;

        const existingModal = document.getElementById('noteDetailModal');
        if (existingModal) existingModal.remove();

        document.body.insertAdjacentHTML('beforeend', detailHtml);

        const modal = document.getElementById('noteDetailModal');
        const backdrop = document.getElementById('noteDetailBackdrop');
        const closeBtn = document.getElementById('noteDetailClose');
        const editBtn = document.getElementById('noteDetailEditBtn');
        const deleteBtn = document.getElementById('noteDetailDeleteBtn');

        const { showConfirm, deleteNote, showToast } = getUtils();

        const closeModal = () => {
            modal.remove();
            state.selectedNote = null;
            const ai = getAIWindow();
            if (ai && ai.getCurrentNoteId && ai.getCurrentNoteId() === note.id) {
                ai.hideAIFloatingWindow && ai.hideAIFloatingWindow();
            }
        };

        backdrop.addEventListener('click', closeModal);
        closeBtn.addEventListener('click', closeModal);

        editBtn.addEventListener('click', () => {
            closeModal();
            showNoteEdit(note);
        });

        deleteBtn.addEventListener('click', async () => {
            const confirmed = await showConfirm('确定删除这条笔记吗？');
            if (confirmed) {
                await deleteNote(note.id);
                showToast('已删除');
                closeModal();
                if (window.ScheduleAppNotesList && typeof window.ScheduleAppNotesList.renderNotesList === 'function') {
                    await window.ScheduleAppNotesList.renderNotesList();
                }
            }
        });

        requestAnimationFrame(() => {
            modal.classList.remove('hidden');
        });
    }

    async function showNoteEdit(note) {
        document.querySelectorAll('#noteEditModal').forEach(m => { m.remove(); });

        const { fetchNoteGroups, updateNote, showToast } = getUtils();
        const groups = await fetchNoteGroups();

        let groupOptions = '<option value="">未分组</option>';
        groups.forEach(g => {
            const selected = note.group_id === g.id ? 'selected' : '';
            groupOptions += `<option value="${g.id}" ${selected}>${escapeHtml(g.name)}</option>`;
        });

        const editHtml = `
            <div class="modal" id="noteEditModal">
                <div class="modal-backdrop" id="noteEditBackdrop"></div>
                <div class="modal-content">
                    <div class="modal-header">
                        <h2>编辑笔记</h2>
                        <button class="modal-close" id="noteEditClose">×</button>
                    </div>
                    <div class="modal-body">
                        <input type="text" id="noteEditTitle" class="note-edit-title-input" placeholder="标题（可选）" value="${escapeHtml(note.title || '')}">
                        <div class="note-edit-row">
                            <select id="noteEditGroup" class="note-edit-group-select">
                                ${groupOptions}
                            </select>
                            <button class="btn btn-secondary note-edit-ai-btn" id="noteEditAiBtn" title="AI 对话">🤖 AI</button>
                        </div>
                        <textarea id="noteEditTextarea" class="note-edit-textarea">${escapeHtml(note.content)}</textarea>
                    </div>
                    <div class="modal-footer">
                        <button class="btn" id="noteEditCancel">取消</button>
                        <button class="btn btn-primary" id="noteEditSave">保存</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', editHtml);

        const modal = document.getElementById('noteEditModal');
        const backdrop = document.getElementById('noteEditBackdrop');
        const closeBtn = document.getElementById('noteEditClose');
        const cancelBtn = document.getElementById('noteEditCancel');
        const saveBtn = document.getElementById('noteEditSave');
        const titleInput = document.getElementById('noteEditTitle');
        const groupSelect = document.getElementById('noteEditGroup');
        const textarea = document.getElementById('noteEditTextarea');
        const floatBtn = document.getElementById('aiChatFloatBtn');

        if (floatBtn) floatBtn.classList.add('hidden');

        const closeModal = () => {
            modal.remove();
            const ai = getAIWindow();
            if (ai && ai.getCurrentNoteId && ai.getCurrentNoteId() === note.id) {
                ai.hideAIFloatingWindow && ai.hideAIFloatingWindow();
            }
        };
        backdrop.addEventListener('click', closeModal);
        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);

        const aiBtn = document.getElementById('noteEditAiBtn');
        if (aiBtn) {
            aiBtn.addEventListener('click', () => {
                const state = getState();
                state.selectedNote = note;
                const ai = getAIWindow();
                if (ai && typeof ai.showAIFloatingWindow === 'function') {
                    ai.showAIFloatingWindow(note);
                }
            });
        }

        saveBtn.addEventListener('click', async () => {
            const newContent = textarea.value.trim();
            const newTitle = (titleInput?.value || '').trim();
            const newGroupId = groupSelect.value ? parseInt(groupSelect.value) : null;

            if (!newContent) {
                showToast('内容不能为空');
                return;
            }
            if (newContent === note.content && newTitle === (note.title || '') && newGroupId === note.group_id) {
                closeModal();
                return;
            }
            const result = await updateNote(note.id, {
                title: newTitle,
                content: newContent,
                group_id: newGroupId,
            });
            if (result) {
                showToast('笔记已更新');
                const ai = getAIWindow();
                if (ai && ai.getCurrentNoteId && ai.getCurrentNoteId() === note.id && ai.updateCurrentNoteContent) {
                    ai.updateCurrentNoteContent(newContent);
                }
                closeModal();
                if (window.ScheduleAppNotesList && typeof window.ScheduleAppNotesList.renderNotesList === 'function') {
                    await window.ScheduleAppNotesList.renderNotesList();
                }
            }
        });

        requestAnimationFrame(() => {
            modal.classList.remove('hidden');
            textarea.focus();
            textarea.selectionStart = textarea.value.length;
        });
    }

    function closeAllModals() {
        document.getElementById('noteDetailModal')?.remove();
        document.querySelectorAll('#noteEditModal').forEach(m => m.remove());
    }

    window.ScheduleAppNoteEditor = {
        renderInlineEditor,
        clearInlineEditor,
        flushAutoSave,
        getCurrentInlineNoteId,
        showNoteDetail,
        showNoteEdit,
        closeAllModals,
        NOTE_COLORS,
    };

})();
