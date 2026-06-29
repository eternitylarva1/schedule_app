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

    // ===== execFormatCmd for formatting toolbar =====
    function execFormatCmd(command, value = null) {
        const editor = document.getElementById('noteInlineContent');
        if (!editor) return;
        editor.focus();
        document.execCommand(command, false, value);
        // Trigger auto-save after formatting
        if (window.ScheduleAppNoteEditor && window.ScheduleAppNoteEditor._triggerAutoSave) {
            window.ScheduleAppNoteEditor._triggerAutoSave();
        }
    }

    // Expose for external callers (e.g. AI block accept)
    window.ScheduleAppNoteEditor = window.ScheduleAppNoteEditor || {};
    window.ScheduleAppNoteEditor._triggerAutoSave = () => {
        const note = (window.ScheduleAppCore && window.ScheduleAppCore.state && window.ScheduleAppCore.state.selectedNote) || null;
        if (note) scheduleAutoSave(note);
    };

    // ===== Toolbar Registry =====
    // Each action: { id, group, order, render(note), bind(note) }
    const _toolbarActions = [
        // ── Format group ──────────────────────────────────────
        { id: 'bold', group: 'format', order: 0, render() {
            return `<button class="tb-btn" id="noteBtnBold" title="加粗 (Ctrl+B)"><b>B</b></button>`;
        }, bind() {
            document.getElementById('noteBtnBold').addEventListener('click', () => execFormatCmd('bold'));
        }},
        { id: 'italic', group: 'format', order: 0.1, render() {
            return `<button class="tb-btn" id="noteBtnItalic" title="斜体 (Ctrl+I)"><i>I</i></button>`;
        }, bind() {
            document.getElementById('noteBtnItalic').addEventListener('click', () => execFormatCmd('italic'));
        }},
        { id: 'h1', group: 'format', order: 0.2, render() {
            return `<button class="tb-btn" id="noteBtnH1" title="大标题">H1</button>`;
        }, bind() {
            document.getElementById('noteBtnH1').addEventListener('click', () => execFormatCmd('formatBlock', '<h2>'));
        }},
        { id: 'h2', group: 'format', order: 0.3, render() {
            return `<button class="tb-btn" id="noteBtnH2" title="小标题">H2</button>`;
        }, bind() {
            document.getElementById('noteBtnH2').addEventListener('click', () => execFormatCmd('formatBlock', '<h3>'));
        }},
        { id: 'ul', group: 'format', order: 0.4, render() {
            return `<button class="tb-btn" id="noteBtnUl" title="无序列表">•≡</button>`;
        }, bind() {
            document.getElementById('noteBtnUl').addEventListener('click', () => execFormatCmd('insertUnorderedList'));
        }},
        { id: 'ol', group: 'format', order: 0.5, render() {
            return `<button class="tb-btn" id="noteBtnOl" title="有序列表">1.</button>`;
        }, bind() {
            document.getElementById('noteBtnOl').addEventListener('click', () => execFormatCmd('insertOrderedList'));
        }},
        {
            id: 'colors',
            group: 'format',
            order: 1,
            render(note) {
                return `<span id="noteInlineColorRow">${NOTE_COLORS.map(c => {
                    const selected = (note.color || '') === c.value ? ' selected' : '';
                    const isEmpty = !c.value;
                    return `<button type="button" class="note-inline-color-option${selected}${isEmpty ? ' no-color' : ''}" data-color="${escapeHtml(c.value)}" title="${escapeHtml(c.label)}"${c.value ? ` style="background:${c.value};"` : ''}>${isEmpty ? '⬜' : ''}</button>`;
                }).join('')}</span>`;
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
    <span class="tb-dates">🕐 创建 ${formatNoteDate(note.created_at)}${note.updated_at && note.updated_at !== note.created_at ? ` · ✏️ 修改 ${formatNoteDate(note.updated_at)}` : ''} · <span id="noteWordCount">📝 0 字</span></span>
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

    // ===== Scroll & Cursor Position Persistence =====
    const _notePositions = {};  // noteId → { scrollTop, caretOffset }

    // Restore saved positions from sessionStorage on load
    try {
        const saved = sessionStorage.getItem('_noteScrollPositions');
        if (saved) {
            const parsed = JSON.parse(saved);
            for (const [k, v] of Object.entries(parsed)) {
                _notePositions[k] = v;
            }
        }
    } catch { /* ignore */ }

    function _saveNotePosition() {
        const contentEl = document.getElementById('noteInlineContent');
        if (!contentEl || _currentInlineNoteId === null) return;
        const scrollTop = contentEl.scrollTop;
        let caretOffset = 0;
        const sel = window.getSelection();
        if (sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            const preRange = range.cloneRange();
            preRange.selectNodeContents(contentEl);
            preRange.setEnd(range.endContainer, range.endOffset);
            caretOffset = preRange.toString().length;
        }
        _notePositions[_currentInlineNoteId] = { scrollTop, caretOffset };
        try { sessionStorage.setItem('_noteScrollPositions', JSON.stringify(_notePositions)); } catch {}
    }

    function _restoreNotePosition(noteId) {
        const pos = _notePositions[noteId];
        if (!pos) return;
        const contentEl = document.getElementById('noteInlineContent');
        if (!contentEl) return;
        try {
            // Restore scroll
            contentEl.scrollTop = pos.scrollTop;
            // Restore caret by character offset
            if (pos.caretOffset > 0) {
                let currentOffset = 0;
                const walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT);
                while (walker.nextNode()) {
                    const node = walker.currentNode;
                    const nodeLength = node.textContent.length;
                    if (currentOffset + nodeLength >= pos.caretOffset) {
                        const range = document.createRange();
                        range.setStart(node, pos.caretOffset - currentOffset);
                        range.collapse(true);
                        const sel = window.getSelection();
                        sel.removeAllRanges();
                        sel.addRange(range);
                        break;
                    }
                    currentOffset += nodeLength;
                }
            }
        } catch (e) { /* ignore */ }
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

    // ===== Word Count =====
    function _updateWordCount() {
        const el = document.getElementById('noteWordCount');
        if (!el) return;
        const title = document.getElementById('noteInlineTitle')?.value || '';
        const content = document.getElementById('noteInlineContent')?.innerText || '';
        const text = title + content;
        const chars = text.replace(/\s/g, '').length;
        el.textContent = `📝 ${chars} 字`;
    }

    // ===== /a Command =====
    let _aiPromptEl = null;
    let _dismissPromptHandler = null;
    let _savedRange = null; // save cursor range when /a is detected
    let _lastAIMessage = '';  // for retry
    let _lastAINoteId = null; // for retry

    function _showAIPrompt(contentEl, cursorRect, initialValue) {
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

        // Pre-fill value for retry/edit
        if (initialValue) {
            const inp = prompt.querySelector('#aiPromptInput');
            if (inp) inp.value = initialValue;
        }

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
                    _savedRange = null;
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
                _savedRange = null;
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

    // ===== @-mention =====
    let _mentionDropdownEl = null;
    let _mentionSavedRange = null;
    let _mentionItems = [];      // filtered results
    let _mentionSelectedIdx = 0;

    function _showMentionDropdown(contentEl, cursorRect) {
        _hideMentionDropdown();

        const dropdown = document.createElement('div');
        dropdown.className = 'mention-dropdown';
        dropdown.innerHTML = `
            <div class="mention-dropdown-header">
                <input type="text" class="mention-dropdown-input"
                       placeholder="搜索笔记标题..." autocomplete="off">
            </div>
            <div class="mention-dropdown-list"></div>
        `;
        document.body.appendChild(dropdown);
        _mentionDropdownEl = dropdown;

        // Position near cursor
        _positionPrompt(dropdown, cursorRect);

        // Focus input
        const input = dropdown.querySelector('.mention-dropdown-input');
        if (input) setTimeout(() => input.focus(), 50);

        // Bind input filtering
        if (input) {
            input.addEventListener('input', () => {
                _filterMentionItems(input.value);
                _renderMentionItems();
            });
            input.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    _moveMentionSelection(1);
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    _moveMentionSelection(-1);
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (_mentionItems.length > 0) {
                        _insertMention(_mentionItems[_mentionSelectedIdx]);
                    }
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    _mentionSavedRange = null;
                    _hideMentionDropdown();
                    contentEl.focus();
                }
            });
        }

        // Dismiss on outside click
        _dismissPromptHandler = (e) => {
            if (_mentionDropdownEl && !_mentionDropdownEl.contains(e.target)) {
                _mentionSavedRange = null;
                _hideMentionDropdown();
            }
        };
        setTimeout(() => document.addEventListener('click', _dismissPromptHandler), 0);

        // Initial filter (show all except current)
        _filterMentionItems('');
        _renderMentionItems();
    }

    function _hideMentionDropdown() {
        if (!_mentionDropdownEl) return;
        document.removeEventListener('click', _dismissPromptHandler);
        _mentionDropdownEl.remove();
        _mentionDropdownEl = null;
        _mentionItems = [];
        _mentionSelectedIdx = 0;
    }

    function _filterMentionItems(query) {
        const state = getState();
        const allNotes = state.notes || [];
        const currentNote = state.selectedNote;
        const q = query.trim().toLowerCase();

        _mentionItems = allNotes
            .filter(note => {
                if (!note.id || note.id === currentNote?.id) return false;
                return true;
            })
            .filter(note => {
                if (!q) return true;
                // Match title (case-insensitive)
                if (note.title && note.title.toLowerCase().includes(q)) return true;
                // Match content substring
                if (note.content && note.content.toLowerCase().includes(q)) return true;
                return false;
            })
            .slice(0, 8);

        _mentionSelectedIdx = 0;
    }

    function _renderMentionItems() {
        if (!_mentionDropdownEl) return;
        const list = _mentionDropdownEl.querySelector('.mention-dropdown-list');
        if (!list) return;

        if (_mentionItems.length === 0) {
            list.innerHTML = '<div class="mention-dropdown-empty">没有找到笔记</div>';
            return;
        }

        list.innerHTML = _mentionItems.map((note, idx) => {
            const selected = idx === _mentionSelectedIdx ? ' selected' : '';
            const title = escapeHtml(note.title || '（无标题）');
            const snippet = note.content
                ? escapeHtml(note.content.substring(0, 60).replace(/<[^>]+>/g, ''))
                : '';
            return `
                <div class="mention-dropdown-item${selected}" data-idx="${idx}">
                    <span class="mention-dropdown-title">${title}</span>
                    ${snippet ? `<span class="mention-dropdown-snippet">${snippet}</span>` : ''}
                </div>
            `;
        }).join('');

        // Bind click on items
        list.querySelectorAll('.mention-dropdown-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(item.dataset.idx);
                if (_mentionItems[idx]) {
                    _insertMention(_mentionItems[idx]);
                }
            });
            item.addEventListener('mouseenter', () => {
                const idx = parseInt(item.dataset.idx);
                _mentionSelectedIdx = idx;
                _renderMentionItems();
            });
        });
    }

    function _moveMentionSelection(delta) {
        if (_mentionItems.length === 0) return;
        _mentionSelectedIdx = (_mentionSelectedIdx + delta + _mentionItems.length) % _mentionItems.length;
        _renderMentionItems();

        // Scroll selected into view
        if (_mentionDropdownEl) {
            const selected = _mentionDropdownEl.querySelector('.mention-dropdown-item.selected');
            if (selected) selected.scrollIntoView({ block: 'nearest' });
        }
    }

    function _insertMention(note) {
        if (!_mentionSavedRange) return;

        const contentEl = document.getElementById('noteInlineContent');
        if (!contentEl) return;

        // Hide dropdown first
        _hideMentionDropdown();

        // Create mention span
        const span = document.createElement('span');
        span.className = 'note-mention';
        span.contentEditable = 'false';
        span.dataset.noteId = String(note.id);
        span.dataset.title = note.title || '（无标题）';
        span.textContent = '@' + (note.title || '（无标题）');

        // Insert span at saved cursor position
        const range = _mentionSavedRange.cloneRange();
        range.deleteContents();
        range.insertNode(span);

        // Add trailing space
        const space = document.createTextNode('\u00A0');
        span.parentNode.insertBefore(space, span.nextSibling);

        // Collapse cursor after the space
        const newRange = document.createRange();
        newRange.setStartAfter(space);
        newRange.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(newRange);

        // Refocus editor
        contentEl.focus();

        // Trigger save
        const state = getState();
        const currentNote = state.selectedNote;
        if (currentNote) scheduleAutoSave(currentNote);
    }

    // ===== Inline AI typing effect =====
    async function _typeText(element, text, speed = 25) {
        let i = 0;
        return new Promise(resolve => {
            function tick() {
                if (i >= text.length) { resolve(); return; }
                const chunkSize = Math.min(1 + Math.floor(Math.random() * 2), text.length - i);
                element.textContent += text.substring(i, i + chunkSize);
                i += chunkSize;
                setTimeout(tick, speed);
            }
            tick();
        });
    }

    async function _sendAIPrompt(contentEl, message) {
        if (!message) return;

        const { apiCall, showToast } = getUtils();
        const note = window.ScheduleAppCore?.state?.selectedNote;
        if (!note || !note.id) {
            showToast('请先选择笔记');
            return;
        }

        // Save for retry
        _lastAIMessage = message;
        _lastAINoteId = note.id;

        // Save the cursor range before hiding the prompt (which clears it)
        const insertRange = _savedRange;

        // Snapshot before AI modifies
        _takeSnapshot();

        // Hide floating prompt
        _hideAIPrompt();

        // Insert inline AI block at saved cursor position
        let range = null;
        if (insertRange) {
            range = insertRange;
        } else {
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
                range = sel.getRangeAt(0);
            }
        }
        if (!range) {
            showToast('无法获取光标位置，请重新尝试');
            return;
        }
        const aiBlock = document.createElement('div');
        aiBlock.className = 'ai-inline-edit';
        aiBlock.contentEditable = 'false';
        aiBlock.innerHTML = `
            <div class="ai-inline-status">
                <span class="ai-inline-icon">🤖</span>
                <span class="ai-inline-text">正在分析笔记内容</span>
                <span class="ai-inline-dots"><span>.</span><span>.</span><span>.</span></span>
            </div>`;
        range.insertNode(aiBlock);

        // Helper to update status text
        function _setStatus(text) {
            const statusEl = aiBlock.querySelector('.ai-inline-text');
            if (statusEl) statusEl.textContent = text;
        }

        // Progress stages
        _setStatus('正在分析笔记内容');
        setTimeout(() => {
            if (!aiBlock.parentNode) return;
            _setStatus('思考处理方式');
        }, 800);
        setTimeout(() => {
            if (!aiBlock.parentNode) return;
            _setStatus('正在生成结果');
        }, 1600);

        try {
            const response = await apiCall('llm/chat-agent', {
                method: 'POST',
                body: JSON.stringify({
                    message: '对以下笔记内容执行指令。\n指令：' + message + '\n\n直接输出修改后的完整内容，不要额外解释。使用纯文本格式，不要 Markdown 语法（**、#、- 等符号均不要使用）。',
                    note_id: note.id,
                    selected_text: '',
                    tools: ['get_note_content'],
                })
            });

            if (response && response.content) {
                let aiText = response.content;
                const m = aiText.match(/```(?:html|markdown)?\s*([\s\S]+?)(?:\s*```|$)/);
                if (m) aiText = m[1];
                aiText = aiText.trim();

                // Check if block still exists
                if (!aiBlock.parentNode) return;

                // Update block with result + accept/reject
                aiBlock.dataset.state = 'done';
                aiBlock.innerHTML = `
                    <div class="ai-inline-thinking">💭 已完成「${escapeHtml(message)}」</div>
                    <div class="ai-inline-result">
                        <div class="ai-inline-result-text"></div>
                    </div>
                    <div class="ai-inline-actions">
                        <button class="ai-btn ai-btn-accept" data-action="accept">✓ 接受</button>
                        <button class="ai-btn ai-btn-reject" data-action="reject">✗ 拒绝</button>
                        <button class="ai-btn ai-btn-retry" data-action="retry">↻ 换一个</button>
                    </div>`;

                // Typing effect
                const resultTextEl = aiBlock.querySelector('.ai-inline-result-text');
                await _typeText(resultTextEl, aiText, 15);

                // Scroll into view
                aiBlock.scrollIntoView({ block: 'nearest' });

                // Bind accept/reject
                aiBlock.querySelector('[data-action="accept"]').addEventListener('click', () => {
                    // Replace block with just the result text
                    const textNode = document.createTextNode(aiText);
                    aiBlock.parentNode.replaceChild(textNode, aiBlock);
                    // Move cursor after the text
                    const newRange = document.createRange();
                    newRange.setStartAfter(textNode);
                    newRange.collapse(true);
                    const sel = window.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(newRange);
                    contentEl.focus();
                    scheduleAutoSave(note);
                    showToast('已应用修改');
                });

                aiBlock.querySelector('[data-action="reject"]').addEventListener('click', () => {
                    aiBlock.remove();
                    contentEl.focus();
                    showToast('已取消修改');
                });

                // ↗️ retry — edit & re-send
                aiBlock.querySelector('[data-action="retry"]').addEventListener('click', () => {
                    const savedMsg = _lastAIMessage;
                    aiBlock.remove();
                    contentEl.focus();
                    // Prompt a pre-filled input so user can edit
                    const sel = window.getSelection();
                    const rect = sel?.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : null;
                    _showAIPrompt(contentEl, rect, savedMsg);
                });

                // Push snapshot after AI
                const aiTitle = document.getElementById('noteInlineTitle')?.value || '';
                _undoStack.push({ title: aiTitle, content: contentEl.innerHTML });
                if (_undoStack.length > _UNDO_MAX) _undoStack.shift();
                _redoStack = [];
                _updateUndoButtons();
            } else {
                // API returned null — show error and keep block for retry
                const msg = response ? 'AI 返回为空' : '请求失败，请重试';
                aiBlock.dataset.state = 'done';
                aiBlock.innerHTML = `
                    <div class="ai-inline-result" style="padding:8px 0;color:var(--text-muted);font-size:13px;">
                        ${msg}
                        <button class="ai-btn ai-btn-retry" style="margin-left:8px;">↻ 重试</button>
                    </div>`;
                aiBlock.querySelector('.ai-btn-retry').addEventListener('click', () => {
                    const savedMsg = _lastAIMessage;
                    aiBlock.remove();
                    contentEl.focus();
                    const sel = window.getSelection();
                    const rect = sel?.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : null;
                    _showAIPrompt(contentEl, rect, savedMsg);
                });
            }
        } catch (e) {
            console.error('AI prompt failed:', e);
            if (aiBlock.parentNode) {
                aiBlock.dataset.state = 'done';
                aiBlock.innerHTML = `
                    <div class="ai-inline-result" style="padding:8px 0;color:var(--text-muted);font-size:13px;">
                        AI 处理失败
                        <button class="ai-btn ai-btn-retry" style="margin-left:8px;">↻ 重试</button>
                    </div>`;
                aiBlock.querySelector('.ai-btn-retry').addEventListener('click', () => {
                    const savedMsg = _lastAIMessage;
                    aiBlock.remove();
                    contentEl.focus();
                    const sel = window.getSelection();
                    const rect = sel?.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : null;
                    _showAIPrompt(contentEl, rect, savedMsg);
                });
            } else {
                showToast('AI 处理失败');
            }
        }
    }

    async function _retryAIPrompt(contentEl) {
        const { apiCall, showToast } = getUtils();
        if (!_lastAIMessage || !_lastAINoteId) return;

        const aiBlock = document.querySelector('.ai-inline-edit');
        if (!aiBlock) return;

        try {
            const response = await apiCall('llm/chat-agent', {
                method: 'POST',
                body: JSON.stringify({
                    message: '对以下笔记内容执行指令。\n指令：' + _lastAIMessage + '\n\n直接输出修改后的完整内容，不要额外解释。',
                    note_id: _lastAINoteId,
                    selected_text: '',
                    tools: ['get_note_content'],
                })
            });

            if (response && response.content) {
                let aiText = response.content;
                const m = aiText.match(/```(?:html|markdown)?\s*([\s\S]+?)(?:\s*```|$)/);
                if (m) aiText = m[1];
                aiText = aiText.trim();

                if (!aiBlock.parentNode) return;

                aiBlock.dataset.state = 'done';
                aiBlock.innerHTML = `
                    <div class="ai-inline-thinking">💭 已完成「${escapeHtml(_lastAIMessage)}」</div>
                    <div class="ai-inline-result">
                        <div class="ai-inline-result-text"></div>
                    </div>
                    <div class="ai-inline-actions">
                        <button class="ai-btn ai-btn-accept" data-action="accept">✓ 接受</button>
                        <button class="ai-btn ai-btn-reject" data-action="reject">✗ 拒绝</button>
                        <button class="ai-btn ai-btn-retry" data-action="retry">↻ 换一个</button>
                    </div>`;

                const resultTextEl = aiBlock.querySelector('.ai-inline-result-text');
                await _typeText(resultTextEl, aiText, 15);
                aiBlock.scrollIntoView({ block: 'nearest' });

                // Re-bind accept/reject/retry (same as above)
                aiBlock.querySelector('[data-action="accept"]').addEventListener('click', () => {
                    const textNode = document.createTextNode(aiText);
                    aiBlock.parentNode.replaceChild(textNode, aiBlock);
                    const newRange = document.createRange();
                    newRange.setStartAfter(textNode);
                    newRange.collapse(true);
                    const sel = window.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(newRange);
                    contentEl.focus();
                    scheduleAutoSave(window.ScheduleAppCore?.state?.selectedNote);
                    showToast('已应用修改');
                });

                aiBlock.querySelector('[data-action="reject"]').addEventListener('click', () => {
                    aiBlock.remove();
                    contentEl.focus();
                    showToast('已取消修改');
                });

                aiBlock.querySelector('[data-action="retry"]').addEventListener('click', () => {
                    aiBlock.dataset.state = '';
                    aiBlock.innerHTML = `
                        <div class="ai-inline-status">
                            <span class="ai-inline-icon">🤖</span>
                            <span class="ai-inline-text">重新生成中</span>
                            <span class="ai-inline-dots"><span>.</span><span>.</span><span>.</span></span>
                        </div>`;
                    // Show pre-filled prompt for editing
                    const savedMsg = _lastAIMessage;
                    aiBlock.remove();
                    contentEl.focus();
                    const sel = window.getSelection();
                    const rect = sel?.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : null;
                    _showAIPrompt(contentEl, rect, savedMsg);
                });
            } else {
                // API returned null — show error and keep block for retry
                const msg = response ? 'AI 返回为空' : '请求失败，请重试';
                aiBlock.innerHTML = `
                    <div class="ai-inline-result" style="padding:8px 0;color:var(--text-muted);font-size:13px;">
                        ${msg}
                        <button class="ai-btn ai-btn-retry" style="margin-left:8px;">↻ 重试</button>
                    </div>`;
                aiBlock.querySelector('.ai-btn-retry').addEventListener('click', () => {
                    const savedMsg = _lastAIMessage;
                    aiBlock.remove();
                    contentEl.focus();
                    const s = window.getSelection();
                    const r = s?.rangeCount ? s.getRangeAt(0).getBoundingClientRect() : null;
                    _showAIPrompt(contentEl, r, savedMsg);
                });
            }
        } catch (e) {
            console.error('AI retry failed:', e);
            if (aiBlock.parentNode) {
                const savedMsg = _lastAIMessage;
                aiBlock.remove();
                contentEl.focus();
                const s = window.getSelection();
                const r = s?.rangeCount ? s.getRangeAt(0).getBoundingClientRect() : null;
                _showAIPrompt(contentEl, r, savedMsg);
            }
        }
    }

    function renderInlineEditor(note) {
        const main = document.getElementById('notesMain');
        if (!main) return;
        const state = getState();

        // Save scroll/cursor of the current note before destroying it
        _saveNotePosition();

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
        // Initial word count
        _updateWordCount();
        // Restore scroll/cursor position for this note (after layout/paint)
        requestAnimationFrame(() => _restoreNotePosition(note.id));
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
            _updateWordCount();
        });

        // ── Core: Auto-save on content change ────────────────────
        contentEl.addEventListener('input', () => {
            scheduleAutoSave(note);
            _updateWordCount();
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

        // ── Core: /a and @-mention command detection (input-based, works with any IME) ──
        contentEl.addEventListener('keydown', (e) => {
            // Esc while AI prompt is showing: dismiss
            if (_aiPromptEl && e.key === 'Escape') {
                e.preventDefault();
                _savedRange = null;
                _hideAIPrompt();
                contentEl.focus();
            }
            // Esc while mention dropdown is showing: dismiss and remove @
            if (_mentionDropdownEl && e.key === 'Escape') {
                e.preventDefault();
                _mentionSavedRange = null;
                _hideMentionDropdown();
                contentEl.focus();
            }
            // Arrow keys while mention dropdown is showing
            if (_mentionDropdownEl) {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    _moveMentionSelection(1);
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    _moveMentionSelection(-1);
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (_mentionItems.length > 0) {
                        _insertMention(_mentionItems[_mentionSelectedIdx]);
                    }
                }
            }
        });

        contentEl.addEventListener('input', () => {
            const sel = window.getSelection();
            if (!sel || !sel.rangeCount) return;
            const range = sel.getRangeAt(0);
            const node = range.startContainer;
            const offset = range.startOffset;

            // Check for /a command (only if AI prompt not already showing)
            if (!_aiPromptEl && node.nodeType === Node.TEXT_NODE && offset >= 2) {
                const text = node.textContent;
                if (text.substring(offset - 2, offset) === '/a') {
                    // Remove /a from content
                    node.textContent = text.substring(0, offset - 2) + text.substring(offset);
                    // Save the range (position where /a was)
                    _savedRange = document.createRange();
                    _savedRange.setStart(node, offset - 2);
                    _savedRange.collapse(true);

                    // Get cursor rect for floating prompt positioning
                    const tempRange = document.createRange();
                    tempRange.setStart(node, offset - 2);
                    tempRange.collapse(true);
                    const cursorRect = tempRange.getBoundingClientRect();

                    // Restore cursor position
                    sel.removeAllRanges();
                    sel.addRange(_savedRange);

                    _showAIPrompt(contentEl, cursorRect);
                    return;
                }
            }

            // Check for @ mention (only if mention dropdown not already showing)
            if (!_mentionDropdownEl && node.nodeType === Node.TEXT_NODE && offset >= 1) {
                const text = node.textContent;
                if (text.substring(offset - 1, offset) === '@') {
                    // Remove @ from content
                    node.textContent = text.substring(0, offset - 1) + text.substring(offset);
                    // Save the range (position where @ was)
                    _mentionSavedRange = document.createRange();
                    _mentionSavedRange.setStart(node, offset - 1);
                    _mentionSavedRange.collapse(true);

                    // Get cursor rect for floating dropdown positioning
                    const tempRange = document.createRange();
                    tempRange.setStart(node, offset - 1);
                    tempRange.collapse(true);
                    const cursorRect = tempRange.getBoundingClientRect();

                    // Restore cursor position
                    sel.removeAllRanges();
                    sel.addRange(_mentionSavedRange);

                    _showMentionDropdown(contentEl, cursorRect);
                    return;
                }
            }
        });

        // ── Core: Click on mention to navigate ──
        contentEl.addEventListener('click', (e) => {
            const mention = e.target.closest('.note-mention');
            if (mention) {
                e.preventDefault();
                e.stopPropagation();
                const noteId = parseInt(mention.dataset.noteId);
                // Find the .note-item in sidebar and click it
                const item = document.querySelector(`.note-item[data-note-id="${noteId}"]`);
                if (item) {
                    item.click();
                } else if (window.ScheduleAppNotesList?.openNoteById) {
                    window.ScheduleAppNotesList.openNoteById(noteId);
                }
            }
        });

        // ── Core: Paste — images as base64, else plain text ─────
        contentEl.addEventListener('paste', (e) => {
            const items = e.clipboardData?.items;
            const hasImage = items && Array.from(items).some(item => item.type.startsWith('image/'));
            
            if (hasImage) {
                e.preventDefault();
                Array.from(items).forEach(item => {
                    if (!item.type.startsWith('image/')) return;
                    const file = item.getAsFile();
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        const img = document.createElement('img');
                        img.src = ev.target.result;
                        img.style.maxWidth = '100%';
                        img.style.borderRadius = 'var(--radius-md)';
                        img.style.margin = '8px 0';
                        const sel = window.getSelection();
                        if (sel.rangeCount) {
                            const range = sel.getRangeAt(0);
                            range.deleteContents();
                            range.insertNode(img);
                            range.setStartAfter(img);
                            range.collapse(true);
                            sel.removeAllRanges();
                            sel.addRange(range);
                        }
                        scheduleAutoSave(note);
                    };
                    reader.readAsDataURL(file);
                });
            } else {
                e.preventDefault();
                const text = (e.clipboardData || window.clipboardData).getData('text/plain');
                if (text) {
                    document.execCommand('insertText', false, text);
                    scheduleAutoSave(note);
                }
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

        // ── Core: Image resize (4-corner handles) ────────────────
        let _resizeOverlay = null;

        function _removeResizeOverlay() {
            if (_resizeOverlay) {
                _resizeOverlay.remove();
                _resizeOverlay = null;
            }
        }

        contentEl.addEventListener('click', (e) => {
            const img = e.target.closest('img');
            _removeResizeOverlay();
            if (!img || !contentEl.contains(img)) return;
            e.stopPropagation();

            const overlay = document.createElement('div');
            overlay.className = 'img-resize-overlay';
            const pos = img.getBoundingClientRect();
            const editorRect = contentEl.getBoundingClientRect();
            overlay.style.left = (pos.left - editorRect.left) + 'px';
            overlay.style.top = (pos.top - editorRect.top) + 'px';
            overlay.style.width = pos.width + 'px';
            overlay.style.height = pos.height + 'px';
            contentEl.appendChild(overlay);

            // Create 4 corner handles
            const corners = ['nw', 'ne', 'sw', 'se'];
            corners.forEach(c => {
                const handle = document.createElement('div');
                handle.className = 'img-resize-handle img-resize-' + c;
                overlay.appendChild(handle);
            });

            // Track resize via SE handle (bottom-right)
            let startX, startY, startW, startH;
            const seHandle = overlay.querySelector('.img-resize-se');
            if (seHandle) {
                seHandle.addEventListener('mousedown', (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    startX = ev.clientX;
                    startY = ev.clientY;
                    startW = img.width;
                    startH = img.height;

                    const onMove = (me) => {
                        const dx = me.clientX - startX;
                        const dy = me.clientY - startY;
                        const nw = img.naturalWidth || img.width;
                        const nh = img.naturalHeight || img.height;
                        const ratio = nw / nh;
                        let newW = Math.max(50, startW + dx);
                        let newH = newW / ratio;
                        if (dy !== 0 && Math.abs(dy / dx) > 0.3) {
                            newH = Math.max(50, startH + dy);
                            newW = newH * ratio;
                        }
                        img.style.width = Math.round(newW) + 'px';
                        img.style.height = Math.round(newH) + 'px';
                        // Update overlay
                        const r2 = img.getBoundingClientRect();
                        const er2 = contentEl.getBoundingClientRect();
                        overlay.style.left = (r2.left - er2.left) + 'px';
                        overlay.style.top = (r2.top - er2.top) + 'px';
                        overlay.style.width = r2.width + 'px';
                        overlay.style.height = r2.height + 'px';
                    };
                    const onUp = () => {
                        document.removeEventListener('mousemove', onMove);
                        document.removeEventListener('mouseup', onUp);
                        scheduleAutoSave(note);
                    };
                    document.addEventListener('mousemove', onMove);
                    document.addEventListener('mouseup', onUp);
                });
            }

            _resizeOverlay = overlay;
        });

        // Remove overlay when clicking outside images
        document.addEventListener('click', (e) => {
            if (_resizeOverlay && !e.target.closest('.img-resize-overlay') && !e.target.closest('img')) {
                _removeResizeOverlay();
            }
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

    // ── Public: Insert AI result as inline block at cursor ────
    async function insertAIBlock(aiText) {
        const contentEl = document.getElementById('noteInlineContent');
        if (!contentEl) { showToast('请先打开笔记'); return false; }

        const sel = window.getSelection();
        let range;
        if (sel && sel.rangeCount > 0) {
            range = sel.getRangeAt(0);
        } else {
            range = document.createRange();
            range.selectNodeContents(contentEl);
            range.collapse(false);
        }

        // Save undo state
        _takeSnapshot();

        // Create block
        const block = document.createElement('div');
        block.className = 'ai-inline-edit';
        block.contentEditable = 'false';
        block.dataset.state = 'done';
        const msg = 'AI 回答';
        block.innerHTML = `
            <div class="ai-inline-thinking">💭 来自 AI 的回复</div>
            <div class="ai-inline-result">
                <div class="ai-inline-result-text">${escapeHtml(aiText)}</div>
            </div>
            <div class="ai-inline-actions">
                <button class="ai-btn ai-btn-accept" data-action="accept">✓ 接受</button>
                <button class="ai-btn ai-btn-reject" data-action="reject">✗ 拒绝</button>
            </div>`;
        range.insertNode(block);
        block.scrollIntoView({ block: 'nearest' });

        // Bind accept/reject
        block.querySelector('[data-action="accept"]').addEventListener('click', () => {
            const tn = document.createTextNode(aiText);
            block.parentNode.replaceChild(tn, block);
            const r2 = document.createRange(); r2.setStartAfter(tn); r2.collapse(true);
            const s2 = window.getSelection(); s2.removeAllRanges(); s2.addRange(r2);
            contentEl.focus();
            const note = window.ScheduleAppCore?.state?.selectedNote;
            if (note) scheduleAutoSave(note);
            showToast('已应用');
        });
        block.querySelector('[data-action="reject"]').addEventListener('click', () => {
            block.remove(); contentEl.focus(); showToast('已取消');
        });

        // Push undo
        const t = document.getElementById('noteInlineTitle')?.value || '';
        _undoStack.push({ title: t, content: contentEl.innerHTML });
        if (_undoStack.length > _UNDO_MAX) _undoStack.shift();
        _redoStack = []; _updateUndoButtons();
        return true;
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
        insertAIBlock,
    };

})();
