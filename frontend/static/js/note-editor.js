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

    function formatNoteDate(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    }

    // ===== Inline editor (Phase 3.2) =====

    let _saveTimer = null;
    let _currentInlineNoteId = null;

    // ===== Toolbar Registry =====
    // Each action: { id, group, order, render(note), bind(note) }
    const _toolbarActions = [
        // ── Format group ──────────────────────────────────────
        {
            id: 'colors',
            group: 'format',
            order: 1,
            render(note) {
                return NOTE_COLORS.map(c => {
                    const selected = (note.color || '') === c.value ? ' selected' : '';
                    const isEmpty = !c.value;
                    return `<button type="button" class="note-inline-color-option${selected}${isEmpty ? ' no-color' : ''}" data-color="${escapeHtml(c.value)}" title="${escapeHtml(c.label)}"${c.value ? ` style="background:${c.value};"` : ''}>${isEmpty ? '⬜' : ''}</button>`;
                }).join('');
            },
            bind(note) {
                const colorRow = document.getElementById('noteInlineColorRow');
                if (!colorRow) return;
                colorRow.querySelectorAll('.note-inline-color-option').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        const newColor = btn.dataset.color || '';
                        colorRow.querySelectorAll('.note-inline-color-option').forEach(b => b.classList.remove('selected'));
                        btn.classList.add('selected');
                        const { updateNote, showToast } = getUtils();
                        try {
                            const result = await updateNote(note.id, { color: newColor });
                            if (result) {
                                note.color = newColor;
                                showToast(newColor ? '颜色已更新' : '颜色已清除');
                                if (window.ScheduleAppNotesList && typeof window.ScheduleAppNotesList.updateNoteColorRow === 'function') {
                                    window.ScheduleAppNotesList.updateNoteColorRow(note.id, newColor);
                                }
                            }
                        } catch (e) {
                            console.error('Color update failed:', e);
                            showToast('更新失败');
                        }
                    });
                });
            },
        },
        // ── Edit group ─────────────────────────────────────────
        {
            id: 'undo',
            group: 'edit',
            order: 1,
            render() {
                return `<button type="button" class="tb-btn" id="noteUndoBtn" data-tb-action="undo" title="撤回 (Ctrl+Z)" disabled>↶</button>`;
            },
            bind() {
                const btn = document.getElementById('noteUndoBtn');
                if (btn) btn.addEventListener('click', _undo);
            },
        },
        {
            id: 'redo',
            group: 'edit',
            order: 2,
            render() {
                return `<button type="button" class="tb-btn" id="noteRedoBtn" data-tb-action="redo" title="重做 (Ctrl+Y)" disabled>↷</button>`;
            },
            bind() {
                const btn = document.getElementById('noteRedoBtn');
                if (btn) btn.addEventListener('click', _redo);
            },
        },
        // ── Note group ──────────────────────────────────────────
        {
            id: 'pin',
            group: 'note',
            order: 1,
            render(note) {
                return `<button type="button" class="tb-btn${note.is_pinned ? ' tb-active' : ''}" id="noteInlinePinBtn" data-tb-action="pin" title="${note.is_pinned ? '取消固定' : '固定'}">📌</button>`;
            },
            bind(note) {
                const btn = document.getElementById('noteInlinePinBtn');
                if (!btn) return;
                btn.addEventListener('click', async () => {
                    const { updateNote, showToast } = getUtils();
                    const newPinned = !note.is_pinned;
                    try {
                        const result = await updateNote(note.id, { is_pinned: newPinned });
                        if (result) {
                            note.is_pinned = newPinned;
                            btn.classList.toggle('tb-active', newPinned);
                            btn.title = newPinned ? '取消固定' : '固定';
                            showToast(newPinned ? '已固定到顶部 📌' : '已取消固定');
                            if (window.ScheduleAppNotesList && typeof window.ScheduleAppNotesList.togglePinRow === 'function') {
                                window.ScheduleAppNotesList.togglePinRow(note.id, newPinned);
                            }
                        }
                    } catch (e) {
                        console.error('Pin toggle failed:', e);
                        showToast('操作失败');
                    }
                });
            },
        },
        {
            id: 'ai',
            group: 'note',
            order: 2,
            render() {
                return `<button type="button" class="tb-btn" id="noteInlineAiBtn" data-tb-action="ai" title="打开 AI 助手对话">🤖</button>`;
            },
            bind(note) {
                const btn = document.getElementById('noteInlineAiBtn');
                if (btn) {
                    btn.addEventListener('click', () => {
                        const ai = getAIWindow();
                        if (ai && typeof ai.showAIFloatingWindow === 'function') {
                            ai.showAIFloatingWindow(note);
                        }
                    });
                }
            },
        },
        {
            id: 'menu',
            group: 'note',
            order: 3,
            render() {
                return `<button type="button" class="tb-btn" id="noteInlineMenuBtn" data-tb-action="menu" title="更多操作" aria-label="更多操作">⋯</button>`;
            },
            bind(note) {
                const btn = document.getElementById('noteInlineMenuBtn');
                if (btn) {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const rect = btn.getBoundingClientRect();
                        if (window.ScheduleAppNotesList && typeof window.ScheduleAppNotesList.showNoteContextMenu === 'function') {
                            window.ScheduleAppNotesList.showNoteContextMenu(note, rect.left, rect.bottom + 4);
                        }
                    });
                }
            },
        },
    ];

    // Build toolbar HTML from registry
    function _renderToolbarHTML(note) {
        // Group items by group name
        const groups = {};
        for (const item of _toolbarActions) {
            if (!groups[item.group]) groups[item.group] = [];
            groups[item.group].push(item);
        }

        // Title row
        let html = `<input type="text" id="noteInlineTitle" class="note-inline-title" placeholder="标题（可选）" value="${escapeHtml(note.title || '')}">`;

        // Meta row: dates + font size
        html += `<div class="tb-meta">
    <span class="tb-dates">🕐 创建 ${formatNoteDate(note.created_at)}${note.updated_at && note.updated_at !== note.created_at ? ` · ✏️ 修改 ${formatNoteDate(note.updated_at)}` : ''}</span>
    <span class="tb-font-size">
        <select class="note-inline-fontsize" id="noteInlineFontSize" title="字号">
            <option value="12px">12</option>
            <option value="14px" selected>14</option>
            <option value="16px">16</option>
            <option value="18px">18</option>
            <option value="22px">22</option>
        </select>
    </span>
</div>`;

        // Action rows: for each group in order, render items
        const groupOrder = ['format', 'edit', 'note'];
        const groupLabels = { format: '🎨', edit: '', note: '' };
        html += `<div class="tb-actions">`;
        for (const gName of groupOrder) {
            const items = groups[gName];
            if (!items || items.length === 0) continue;
            items.sort((a, b) => a.order - b.order);
            if (gName === 'format') {
                // Colors: render with label
                html += `<div class="tb-group tb-group-${gName}">`;
                html += `<span class="tb-group-label">${groupLabels[gName]}</span>`;
                for (const item of items) {
                    html += item.render(note);
                }
                html += `</div>`;
            } else {
                // Other groups: just buttons, no label
                html += `<div class="tb-group tb-group-${gName}">`;
                for (const item of items) {
                    html += item.render(note);
                }
                html += `</div>`;
            }
        }
        html += `</div>`;

        return html;
    }

    // ===== Undo / Redo =====
    const _UNDO_MAX = 50;
    let _undoStack = [];
    let _redoStack = [];
    let _undoTimer = null;

    function _takeSnapshot() {
        const title = document.getElementById('noteInlineTitle')?.value || '';
        const content = document.getElementById('noteInlineContent')?.innerHTML || '';
        if (_undoStack.length > 0) {
            const last = _undoStack[_undoStack.length - 1];
            if (last.title === title && last.content === content) return;
        }
        _undoStack.push({ title, content });
        if (_undoStack.length > _UNDO_MAX) _undoStack.shift();
        _redoStack = [];
        _updateUndoButtons();
    }

    function _scheduleSnapshot() {
        clearTimeout(_undoTimer);
        _undoTimer = setTimeout(_takeSnapshot, 300);
    }

    function _undo() {
        if (_undoStack.length < 2) return;
        _redoStack.push(_undoStack.pop());
        const prev = _undoStack[_undoStack.length - 1];
        _applySnapshot(prev);
        _updateUndoButtons();
        _scheduleAutoSaveAfterUndo();
    }

    function _redo() {
        if (_redoStack.length === 0) return;
        const next = _redoStack.pop();
        _undoStack.push(next);
        _applySnapshot(next);
        _updateUndoButtons();
        _scheduleAutoSaveAfterUndo();
    }

    function _applySnapshot(snap) {
        const titleInput = document.getElementById('noteInlineTitle');
        const contentEl = document.getElementById('noteInlineContent');
        if (!titleInput || !contentEl) return;
        titleInput.value = snap.title;
        contentEl.innerHTML = snap.content;
        contentEl.focus();
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(contentEl);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
    }

    function _updateUndoButtons() {
        const undoBtn = document.getElementById('noteUndoBtn');
        const redoBtn = document.getElementById('noteRedoBtn');
        if (undoBtn) undoBtn.disabled = _undoStack.length < 2;
        if (redoBtn) redoBtn.disabled = _redoStack.length === 0;
    }

    function _scheduleAutoSaveAfterUndo() {
        clearTimeout(_saveTimer);
        _saveTimer = setTimeout(() => {
            const note = window.ScheduleAppCore?.state?.selectedNote;
            if (note) saveInlineNote(note);
        }, 800);
    }

    // ===== /a Command =====
    let _aiPromptEl = null;
    let _dismissPromptHandler = null;

    function _showAIPrompt(contentEl, cursorRect) {
        _hideAIPrompt();

        const prompt = document.createElement('div');
        prompt.className = 'ai-prompt-float';
        prompt.innerHTML = `
            <div class="ai-prompt-float-body">
                <span class="ai-prompt-float-icon">🤖</span>
                <input type="text" class="ai-prompt-float-input" id="aiPromptInput"
                       placeholder="输入指令，按 Enter 发送..." autocomplete="off">
                <button class="ai-prompt-float-send" id="aiPromptSendBtn" title="发送 (Enter)">➤</button>
            </div>
        `;
        document.body.appendChild(prompt);
        _aiPromptEl = prompt;

        // Position near cursor rect
        _positionPrompt(prompt, cursorRect);

        // Focus input
        const input = document.getElementById('aiPromptInput');
        if (input) setTimeout(() => input.focus(), 50);

        // Enter = send
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    _sendAIPrompt(contentEl, input.value.trim());
                }
                if (e.key === 'Escape') {
                    e.preventDefault();
                    _hideAIPrompt();
                    contentEl.focus();
                }
            });
        }

        const sendBtn = document.getElementById('aiPromptSendBtn');
        if (sendBtn) {
            sendBtn.addEventListener('click', () => {
                _sendAIPrompt(contentEl, input?.value.trim());
            });
        }

        // Dismiss on outside click
        _dismissPromptHandler = (e) => {
            if (_aiPromptEl && !_aiPromptEl.contains(e.target)) {
                _hideAIPrompt();
            }
        };
        setTimeout(() => document.addEventListener('click', _dismissPromptHandler), 0);
    }

    function _positionPrompt(promptEl, cursorRect) {
        const promptW = 340, promptH = 42;
        let left, top;

        if (cursorRect) {
            left = cursorRect.left;
            top = cursorRect.bottom + 6;
            // Clamp to viewport
            const vw = window.innerWidth, vh = window.innerHeight;
            if (left + promptW > vw - 12) left = vw - promptW - 12;
            if (left < 12) left = 12;
            if (top + promptH > vh - 12) top = cursorRect.top - promptH - 6;
            if (top < 12) top = 12;
        } else {
            left = Math.max(12, (window.innerWidth - promptW) / 2);
            top = Math.max(12, window.innerHeight * 0.35);
        }

        promptEl.style.left = left + 'px';
        promptEl.style.top = top + 'px';
    }

    function _hideAIPrompt() {
        if (!_aiPromptEl) return;
        document.removeEventListener('click', _dismissPromptHandler);
        _aiPromptEl.remove();
        _aiPromptEl = null;
    }

    async function _sendAIPrompt(contentEl, message) {
        if (!message) return;

        const utils = getUtils();
        const { apiCall, showToast } = utils;
        const note = window.ScheduleAppCore?.state?.selectedNote;
        if (!note || !note.id) {
            showToast('请先选择笔记');
            return;
        }

        // Snapshot before AI modifies
        _takeSnapshot();

        // Show loading
        const sendBtn = document.getElementById('aiPromptSendBtn');
        const input = document.getElementById('aiPromptInput');
        if (sendBtn) sendBtn.disabled = true;
        if (input) input.disabled = true;

        _hideAIPrompt();

        try {
            const response = await apiCall('llm/chat-agent', {
                method: 'POST',
                body: JSON.stringify({
                    message: '对以下笔记内容执行指令。\n指令：' + message + '\n\n直接输出修改后的完整内容，不要额外解释。',
                    note_id: note.id,
                    selected_text: '',
                    tools: ['get_note_content'],  // /a 只允许笔记工具
                })
            });

            if (response && response.content) {
                let aiText = response.content;
                // Strip markdown code fences if present
                const m = aiText.match(/```(?:html|markdown)?\s*([\s\S]+?)(?:\s*```|$)/);
                if (m) aiText = m[1];
                aiText = aiText.trim();

                // Replace content with AI output
                contentEl.innerHTML = aiText.replace(/\n/g, '<br>');

                // Push snapshot after AI modification (skip dedup check)
                const aiTitle = document.getElementById('noteInlineTitle')?.value || '';
                const aiContent = contentEl.innerHTML;
                if (_undoStack.length > 0) {
                    const last = _undoStack[_undoStack.length - 1];
                    if (last.content !== aiContent) {
                        _undoStack.push({ title: aiTitle, content: aiContent });
                        if (_undoStack.length > _UNDO_MAX) _undoStack.shift();
                        _redoStack = [];
                        _updateUndoButtons();
                    }
                }

                showToast('AI 处理完成');
            }
        } catch (e) {
            console.error('AI prompt failed:', e);
            showToast('AI 处理失败');
        } finally {
            if (sendBtn) sendBtn.disabled = false;
            if (input) input.disabled = false;
            contentEl.focus();
            // Trigger autosave
            const noteObj = window.ScheduleAppCore?.state?.selectedNote;
            if (noteObj) scheduleAutoSave(noteObj);
        }
    }

    function renderInlineEditor(note) {
        const main = document.getElementById('notesMain');
        if (!main) return;
        const state = getState();
        state.selectedNote = note;
        _currentInlineNoteId = note.id;

        // Init undo stack
        _undoStack = [{ title: note.title || '', content: (note.content || '').replace(/\n/g, '<br>') }];
        _redoStack = [];

        main.innerHTML = `
            <div class="note-inline-editor" data-note-id="${note.id}">
                <div class="note-inline-toolbar">
                    ${_renderToolbarHTML(note)}
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

        // ── Bind toolbar actions from registry ──────────────────
        for (const item of _toolbarActions) {
            item.bind(note);
        }

        // ── Core: Auto-save on title change ─────────────────────
        titleInput.addEventListener('input', () => {
            scheduleAutoSave(note);
        });

        // ── Core: Auto-save on content change ────────────────────
        contentEl.addEventListener('input', () => {
            scheduleAutoSave(note);
        });

        // ── Core: Save on blur ───────────────────────────────────
        titleInput.addEventListener('blur', () => {
            flushAutoSave(note);
        });
        contentEl.addEventListener('blur', () => {
            flushAutoSave(note);
        });

        // ── Core: Keyboard undo/redo ─────────────────────────────
        const _undoKeydown = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
                e.preventDefault();
                if (e.shiftKey) _redo();
                else _undo();
            }
            if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
                e.preventDefault();
                _redo();
            }
        };
        contentEl.addEventListener('keydown', _undoKeydown);
        titleInput.addEventListener('keydown', _undoKeydown);

        // ── Core: Snapshot on content changes (debounced) ───────
        contentEl.addEventListener('input', _scheduleSnapshot);
        titleInput.addEventListener('input', _scheduleSnapshot);

        // ── Core: /a command detection ────────────────────────────
        let _slashTime = 0;
        let _waitingForA = false;

        contentEl.addEventListener('keydown', (e) => {
            // If prompt is showing, handle Esc for it
            if (_aiPromptEl) {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    _hideAIPrompt();
                    contentEl.focus();
                }
                return;
            }

            if (e.key === '/') {
                _slashTime = Date.now();
                _waitingForA = true;
            } else if (e.key === 'a' && _waitingForA && Date.now() - _slashTime < 800) {
                // /a detected! Prevent the characters from entering content
                e.preventDefault();
                _waitingForA = false;

                // Get cursor position
                const sel = window.getSelection();
                const cursorRect = sel?.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : null;

                _showAIPrompt(contentEl, cursorRect);
            } else {
                _waitingForA = false;
            }
        });

        // ── Core: Paste as plain text ───────────────────────────
        contentEl.addEventListener('paste', (e) => {
            e.preventDefault();
            const text = (e.clipboardData || window.clipboardData).getData('text/plain');
            if (text) {
                document.execCommand('insertText', false, text);
                scheduleAutoSave(note);
            }
        });

        // ── Core: Font size selector ────────────────────────────
        const fontSizeEl = document.getElementById('noteInlineFontSize');
        if (fontSizeEl) {
            if (getState().noteFontSize) {
                contentEl.style.fontSize = getState().noteFontSize;
            }
            fontSizeEl.addEventListener('change', () => {
                const size = fontSizeEl.value;
                getState().noteFontSize = size;
                contentEl.style.fontSize = size;
                contentEl.focus();
            });
        }
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
                // Incremental DOM update — remove just this row
                if (window.ScheduleAppNotesList && typeof window.ScheduleAppNotesList.removeNoteRow === 'function') {
                    window.ScheduleAppNotesList.removeNoteRow(note.id);
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
                // Update the note object (reference in state.notes)
                note.title = newTitle;
                note.content = newContent;
                note.updated_at = result.updated_at;
                const oldGroupId = note.group_id;
                note.group_id = newGroupId;
                closeModal();
                // Incremental DOM update — refresh the row; if group changed, move it too
                const notesList = window.ScheduleAppNotesList;
                if (notesList && typeof notesList.updateNoteRow === 'function') {
                    notesList.updateNoteRow(note);
                }
                if (oldGroupId !== newGroupId && notesList && typeof notesList.moveNoteRow === 'function') {
                    // Delay slightly to let updateNoteRow finish replacing the element
                    setTimeout(() => {
                        notesList.moveNoteRow(note.id, newGroupId);
                    }, 0);
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
