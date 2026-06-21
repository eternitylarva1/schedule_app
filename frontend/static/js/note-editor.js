/**
 * Schedule App - Note Editor Module
 * Show note detail / edit modals. Refactored from main.js (lines 1620-1808)
 * as part of NOTES_REFACTOR stage 1.
 *
 * Cross-module dependency: window.ScheduleAppNoteAI.hideAIFloatingWindow() / showAIFloatingWindow()
 * (defined in note-ai.js, loaded before this file).
 */

(function() {
    'use strict';

    const getState = () => (window.ScheduleAppCore && window.ScheduleAppCore.state) || {};
    const getUtils = () => window.ScheduleAppCore || {};

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

    window.ScheduleAppNoteEditor = {
        showNoteDetail,
        showNoteEdit,
    };

})();
