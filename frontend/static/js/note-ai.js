/**
 * Schedule App - Note AI Module (Stage 4)
 * Slide-in drawer on the right side of the note editor.
 * Replaces the old floating window.
 *
 * Public API (unchanged to avoid updating callers):
 *   initAIChatPanel()             — bind drawer events (called from main.js init)
 *   showAIFloatingWindow(note)    — open drawer for a note
 *   hideAIFloatingWindow()        — close drawer
 *   loadAIChatHistory()           — refresh from server
 *   renderAIChatHistory()         — paint messages
 *   sendAIChatMessage()           — send user input
 *   insertAIResponseToNote(c)     — append AI text into current note
 *   isOpen() / getCurrentNoteId() / updateCurrentNoteContent(c)
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

    // --- @-mention dropdown state ---
    let _aiMentionDropdownEl = null;
    let _aiMentionItems = [];
    let _aiMentionSelectedIdx = 0;

    // --- state ---
    let aiState = {
        isOpen: false,
        currentNote: null,
        conversations: [],
        isLoading: false,
        selectedText: '',
        referencedNotes: [], // [{ token: '@标题', noteId: 47 }, ...]
    };

    function initAIChatPanel() {
        const sendBtn = document.getElementById('aiDrawerSend');
        const input = document.getElementById('aiDrawerInput');
        const closeBtn = document.getElementById('aiDrawerClose');

        if (sendBtn) {
            sendBtn.addEventListener('click', () => sendAIChatMessage());
        }
        if (input) {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !_aiMentionDropdownEl) sendAIChatMessage();
            });
            // @-mention: detect trailing '@'
            input.addEventListener('input', () => {
                if (_aiMentionDropdownEl) {
                    // search input is being typed in dropdown — ignore
                    return;
                }
                const val = input.value;
                const pos = input.selectionStart;
                if (pos === val.length && val.endsWith('@')) {
                    // User just typed '@'; remove it temporarily, show dropdown
                    input.value = val.slice(0, -1);
                    input.setSelectionRange(input.value.length, input.value.length);
                    _showAIMentionDropdown(input);
                }
            });
            input.addEventListener('keydown', (e) => {
                if (_aiMentionDropdownEl) {
                    if (e.key === 'ArrowDown') { e.preventDefault(); _moveAIMentionSelection(1); }
                    else if (e.key === 'ArrowUp') { e.preventDefault(); _moveAIMentionSelection(-1); }
                    else if (e.key === 'Enter') { e.preventDefault(); }
                    else if (e.key === 'Escape') { e.preventDefault(); _hideAIMentionDropdown(); input.focus(); }
                }
            });
        }
        if (closeBtn) {
            closeBtn.addEventListener('click', hideAIFloatingWindow);
        }

        const history = document.getElementById('aiDrawerHistory');
        if (history) {
            history.addEventListener('click', (e) => {
                const insertBtn = e.target.closest('.ai-drawer-insert-btn');
                if (insertBtn) {
                    const content = decodeURIComponent(insertBtn.dataset.content);
                    insertAIResponseToNote(content);
                    return;
                }
                const newNoteBtn = e.target.closest('.ai-drawer-newnote-btn');
                if (newNoteBtn) {
                    const content = decodeURIComponent(newNoteBtn.dataset.content);
                    saveAIResponseAsNewNote(content);
                }
            });
        }

        // Close on Esc
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && aiState.isOpen) {
                hideAIFloatingWindow();
            }
        });
    }

    function showAIFloatingWindow(note) {
        const drawer = document.getElementById('aiDrawer');
        const backdrop = document.getElementById('aiDrawerBackdrop');
        const contextEl = document.getElementById('aiDrawerContext');
        const noteTitleEl = document.getElementById('aiDrawerNoteTitle');
        if (!drawer) return;

        aiState.isOpen = true;
        aiState.currentNote = note;
        aiState.selectedText = '';

        if (noteTitleEl) {
            noteTitleEl.textContent = (note.title || '').trim() || '(无标题)';
        }
        if (contextEl) {
            contextEl.innerHTML = `<div class="ai-drawer-note-preview">${escapeHtml(note.content || '（空笔记）')}</div>`;
        }

        if (backdrop) backdrop.classList.add('visible');
        drawer.classList.add('open');

        loadAIChatHistory();

        // Start tracking selection in note content
        _startSelectionTracking();

        setTimeout(() => {
            const input = document.getElementById('aiDrawerInput');
            if (input) input.focus();
        }, 150);
    }

    function hideAIFloatingWindow() {
        const drawer = document.getElementById('aiDrawer');
        const backdrop = document.getElementById('aiDrawerBackdrop');
        if (!drawer) return;

        aiState.isOpen = false;
        aiState.currentNote = null;
        aiState.conversations = [];
        aiState.selectedText = '';

        _stopSelectionTracking();

        drawer.classList.remove('open');
        if (backdrop) backdrop.classList.remove('visible');
    }

    // ── Selection tracking ────────────────────────────────────
    let _selectionTimer = null;

    function _startSelectionTracking() {
        document.addEventListener('selectionchange', _onSelectionChange);
    }

    function _stopSelectionTracking() {
        document.removeEventListener('selectionchange', _onSelectionChange);
        clearTimeout(_selectionTimer);
        aiState.selectedText = '';
    }

    function _onSelectionChange() {
        if (!aiState.isOpen) return;
        clearTimeout(_selectionTimer);
        _selectionTimer = setTimeout(() => {
            const sel = window.getSelection();
            if (!sel || sel.isCollapsed || !sel.toString().trim()) {
                aiState.selectedText = '';
                _updateQuoteDisplay();
                return;
            }
            // Only capture selection if it's inside the note content
            const contentEl = document.getElementById('noteInlineContent');
            if (contentEl && contentEl.contains(sel.anchorNode)) {
                aiState.selectedText = sel.toString().trim();
                _updateQuoteDisplay();
            }
        }, 200);
    }

    function _updateQuoteDisplay() {
        const contextEl = document.getElementById('aiDrawerContext');
        if (!contextEl) return;
        const note = aiState.currentNote;
        let html = `<div class="ai-drawer-note-preview">${escapeHtml(note?.content || '（空笔记）')}</div>`;
        if (aiState.selectedText) {
            html += `<div class="ai-drawer-quote">📎 引用：${escapeHtml(aiState.selectedText.substring(0, 120))}</div>`;
        }
        contextEl.innerHTML = html;
    }

    // ── @-mention dropdown ──────────────────────────────────────

    function _filterAIMentionItems(query) {
        const notes = getState().notes || [];
        const currentId = aiState.currentNote?.id;
        const q = query.toLowerCase();
        return notes
            .filter(n => n.id !== currentId)
            .filter(n => {
                if (!q) return true;
                return (n.title || '').toLowerCase().includes(q) ||
                       (n.content || '').toLowerCase().includes(q);
            })
            .slice(0, 8);
    }

    function _renderAIMentionItems() {
        if (!_aiMentionDropdownEl) return;
        const list = _aiMentionDropdownEl.querySelector('.mention-dropdown-list');
        if (!list) return;
        if (_aiMentionItems.length === 0) {
            list.innerHTML = '<div class="mention-dropdown-empty">没有匹配的笔记</div>';
            return;
        }
        list.innerHTML = _aiMentionItems.map((note, i) => {
            const title = escapeHtml(note.title || '（无标题）');
            const snippet = escapeHtml((note.content || '').substring(0, 80));
            const cls = i === _aiMentionSelectedIdx ? 'mention-dropdown-item selected' : 'mention-dropdown-item';
            return `<div class="${cls}" data-idx="${i}">
                <div class="mention-dropdown-title">${title}</div>
                <div class="mention-dropdown-snippet">${snippet}</div>
            </div>`;
        }).join('');
    }

    function _moveAIMentionSelection(delta) {
        if (_aiMentionItems.length === 0) return;
        _aiMentionSelectedIdx = Math.max(0, Math.min(_aiMentionItems.length - 1, _aiMentionSelectedIdx + delta));
        _renderAIMentionItems();
    }

    function _insertAIMention(note, inputEl) {
        if (!inputEl) return;
        // The '@' was already removed by the input handler before dropdown showed.
        // Insert '@title ' at current cursor position.
        const val = inputEl.value;
        const pos = inputEl.selectionStart;
        const before = val.substring(0, pos);
        const after = val.substring(pos);
        const token = '@' + (note.title || '（无标题）');
        inputEl.value = before + token + ' ' + after;
        // Place cursor after inserted text
        const newPos = before.length + token.length + 1;
        inputEl.setSelectionRange(newPos, newPos);
        inputEl.focus();
        // Track reference
        aiState.referencedNotes.push({ token, noteId: note.id });
    }

    function _showAIMentionDropdown(inputEl) {
        _hideAIMentionDropdown();
        _aiMentionSelectedIdx = 0;
        _aiMentionItems = _filterAIMentionItems('');

        // Build dropdown DOM
        const dropdown = document.createElement('div');
        dropdown.className = 'mention-dropdown';
        dropdown.style.cssText = 'position:fixed;z-index:9999;min-width:260px;max-width:340px;';
        dropdown.innerHTML = `
            <div class="mention-dropdown-header">
                <input type="text" class="mention-dropdown-input" placeholder="搜索笔记..." autocomplete="off" />
            </div>
            <div class="mention-dropdown-list"></div>
        `;

        // Position below the input
        const rect = inputEl.getBoundingClientRect();
        dropdown.style.top = (rect.bottom + 4) + 'px';
        dropdown.style.left = rect.left + 'px';

        document.body.appendChild(dropdown);
        _aiMentionDropdownEl = dropdown;

        // Search input
        const searchInput = dropdown.querySelector('.mention-dropdown-input');
        searchInput.focus();
        searchInput.addEventListener('input', () => {
            _aiMentionItems = _filterAIMentionItems(searchInput.value);
            _aiMentionSelectedIdx = 0;
            _renderAIMentionItems();
        });
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); _moveAIMentionSelection(1); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); _moveAIMentionSelection(-1); }
            else if (e.key === 'Enter') {
                e.preventDefault();
                if (_aiMentionItems[_aiMentionSelectedIdx]) {
                    _insertAIMention(_aiMentionItems[_aiMentionSelectedIdx], inputEl);
                    _hideAIMentionDropdown();
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                _hideAIMentionDropdown();
                inputEl.focus();
            }
        });

        // Item click
        dropdown.querySelector('.mention-dropdown-list').addEventListener('click', (e) => {
            const item = e.target.closest('.mention-dropdown-item');
            if (item) {
                const idx = parseInt(item.dataset.idx, 10);
                _insertAIMention(_aiMentionItems[idx], inputEl);
                _hideAIMentionDropdown();
            }
        });

        // Click outside to close
        setTimeout(() => {
            document.addEventListener('click', _aiOutsideHandler);
        }, 0);

        _renderAIMentionItems();
    }

    function _hideAIMentionDropdown() {
        if (_aiMentionDropdownEl) {
            _aiMentionDropdownEl.remove();
            _aiMentionDropdownEl = null;
        }
        document.removeEventListener('click', _aiOutsideHandler);
    }

    function _aiOutsideHandler(e) {
        if (_aiMentionDropdownEl && !_aiMentionDropdownEl.contains(e.target)) {
            _hideAIMentionDropdown();
        }
    }

    async function loadAIChatHistory() {
        if (!aiState.currentNote) return;
        const { fetchNoteConversations } = getUtils();
        try {
            const conversations = await fetchNoteConversations(aiState.currentNote.id);
            aiState.conversations = conversations || [];
            renderAIChatHistory();
        } catch (error) {
            console.error('Failed to load chat history:', error);
        }
    }

    function renderAIChatHistory() {
        const container = document.getElementById('aiDrawerHistory');
        if (!container) return;

        if (aiState.conversations.length === 0) {
            container.innerHTML = '<div class="ai-drawer-empty">发送消息开始对话</div>';
            return;
        }

        container.innerHTML = aiState.conversations.map(conv => `
            <div class="ai-drawer-message ${conv.role}">
                <div class="ai-drawer-bubble">
                    ${escapeHtml(conv.content)}
                    ${conv.role === 'assistant' ? `
                        <div class="ai-drawer-actions">
                            <button class="ai-drawer-insert-btn" data-content="${encodeURIComponent(conv.content)}" title="插入到当前笔记">↩ 插入</button>
                            <button class="ai-drawer-newnote-btn" data-content="${encodeURIComponent(conv.content)}" title="另存为新笔记">📄 新笔记</button>
                        </div>
                    ` : ''}
                </div>
                <div class="ai-drawer-time">${formatNoteTime(conv.created_at)}</div>
            </div>
        `).join('');

        container.scrollTop = container.scrollHeight;
    }

    async function sendAIChatMessage() {
        if (!aiState.currentNote || aiState.isLoading) return;

        const { showToast } = getUtils();
        const input = document.getElementById('aiDrawerInput');
        const rawMessage = input?.value.trim();
        if (!rawMessage) return;

        // Resolve referenced notes: only keep those whose @token still appears in rawMessage
        const referencedNotes = [];
        const seenIds = new Set();
        for (const ref of aiState.referencedNotes) {
            if (rawMessage.includes(ref.token) && !seenIds.has(ref.noteId)) {
                referencedNotes.push({ noteId: ref.noteId, title: ref.token });
                seenIds.add(ref.noteId);
            }
        }
        aiState.referencedNotes = [];

        // Build display message (strip @tokens for bubble, keep full for API)
        let displayMessage = rawMessage;
        for (const ref of referencedNotes) {
            displayMessage = displayMessage.replace(ref.token, ref.token);
        }
        const referencedLine = referencedNotes.length
            ? `<div class="ai-drawer-referenced">📎 引用的笔记: ${referencedNotes.map(r => r.title.replace('@', '')).join(', ')}</div>`
            : '';

        const container = document.getElementById('aiDrawerHistory');
        aiState.isLoading = true;
        input.value = '';

        if (container) {
            container.innerHTML += `
                <div class="ai-drawer-message user">
                    <div class="ai-drawer-bubble">${escapeHtml(displayMessage)}${referencedLine}</div>
                </div>
                <div class="ai-drawer-message assistant">
                    <div class="ai-drawer-bubble" style="color: var(--text-muted);">思考中...</div>
                </div>
            `;
            container.scrollTop = container.scrollHeight;
        }

        try {
            const utils = getUtils();
            const response = await utils.apiCall('llm/chat-agent', {
                method: 'POST',
                body: JSON.stringify({
                    message: rawMessage,
                    note_id: aiState.currentNote.id,
                    selected_text: aiState.selectedText || '',
                    referenced_notes: referencedNotes.map(r => r.noteId),
                    tools: null,  // 全部工具可用
                })
            });

            if (response) {
                const thinkingEl = container?.querySelector('.ai-drawer-message.assistant:last-child');
                if (thinkingEl) {
                    thinkingEl.innerHTML = `
                        <div class="ai-drawer-bubble">${escapeHtml(response.content)}<div class="ai-drawer-actions"><button class="ai-drawer-insert-btn" data-content="${encodeURIComponent(response.content)}" title="插入到当前笔记">↩ 插入</button><button class="ai-drawer-newnote-btn" data-content="${encodeURIComponent(response.content)}" title="另存为新笔记">📄 新笔记</button></div></div>
                    `;
                }
                aiState.conversations.push({ role: 'user', content: rawMessage });
                aiState.conversations.push({ role: 'assistant', content: response.content });
            }
        } catch (error) {
            console.error('Chat error:', error);
            showToast('AI 对话失败，请重试');
            const thinkingEl = container?.querySelector('.ai-drawer-message.assistant:last-child');
            if (thinkingEl) thinkingEl.remove();
        } finally {
            aiState.isLoading = false;
        }
    }

    async function insertAIResponseToNote(content) {
        // Use inline AI block with accept/reject if editor is open
        const editor = window.ScheduleAppNoteEditor;
        if (editor && typeof editor.insertAIBlock === 'function') {
            const result = editor.insertAIBlock(content);
            if (result !== false) {
                showToast('AI 回答已插入，请确认或拒绝');
                return;
            }
        }
        // Fallback: old behavior (append to content)
        if (!aiState.currentNote) return;

        const { updateNote, showToast } = getUtils();
        const currentContent = aiState.currentNote.content || '';
        const newContent = currentContent
            ? currentContent + '\n\n---\nAI 回答：\n' + content
            : 'AI 回答：\n' + content;

        try {
            await updateNote(aiState.currentNote.id, { content: newContent });
            aiState.currentNote.content = newContent;
            const inlineContent = document.getElementById('noteInlineContent');
            if (inlineContent) {
                inlineContent.innerText = newContent;
            }
            showToast('已插入到笔记');
        } catch (error) {
            console.error('Failed to insert to note:', error);
            showToast('插入失败');
        }
    }

    async function saveAIResponseAsNewNote(content) {
        const { createNote, showToast } = getUtils();

        // Derive a title from the first non-empty line, capped to 32 chars
        const firstLine = (content.split('\n').find(l => l.trim()) || 'AI 新建笔记').trim();
        const title = firstLine.length > 32 ? firstLine.substring(0, 32) + '…' : firstLine;

        try {
            const result = await createNote({ title, content });
            if (result && (result.id || result.note_id)) {
                showToast(`已新建笔记：${title}`);
                // Refresh notes list so the new note appears in the sidebar
                if (window.ScheduleAppNotesList && typeof window.ScheduleAppNotesList.renderNotesList === 'function') {
                    window.ScheduleAppNotesList.renderNotesList();
                }
            } else {
                showToast('新建笔记失败');
            }
        } catch (error) {
            console.error('Failed to save as new note:', error);
            showToast('新建笔记失败');
        }
    }

    function isOpen() {
        return aiState.isOpen;
    }
    function getCurrentNoteId() {
        return aiState.currentNote ? aiState.currentNote.id : null;
    }
    function updateCurrentNoteContent(newContent) {
        if (aiState.currentNote) {
            aiState.currentNote.content = newContent;
        }
    }

    window.ScheduleAppNoteAI = {
        initAIChatPanel,
        showAIFloatingWindow,
        hideAIFloatingWindow,
        loadAIChatHistory,
        renderAIChatHistory,
        sendAIChatMessage,
        insertAIResponseToNote,
        saveAIResponseAsNewNote,
        isOpen,
        getCurrentNoteId,
        updateCurrentNoteContent,
    };

})();
