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

    // --- state ---
    let aiState = {
        isOpen: false,
        currentNote: null,
        conversations: [],
        isLoading: false,
        selectedText: '',
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
                if (e.key === 'Enter') sendAIChatMessage();
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
                    ${conv.role === 'assistant' ? `<button class="ai-drawer-insert-btn" data-content="${encodeURIComponent(conv.content)}">↩ 插入</button>` : ''}
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
        const message = input?.value.trim();
        if (!message) return;

        const container = document.getElementById('aiDrawerHistory');
        aiState.isLoading = true;
        input.value = '';

        if (container) {
            container.innerHTML += `
                <div class="ai-drawer-message user">
                    <div class="ai-drawer-bubble">${escapeHtml(message)}</div>
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
                    message: message,
                    note_id: aiState.currentNote.id,
                    selected_text: aiState.selectedText || '',
                    tools: null,  // 全部工具可用
                })
            });

            if (response) {
                const thinkingEl = container?.querySelector('.ai-drawer-message.assistant:last-child');
                if (thinkingEl) {
                    thinkingEl.innerHTML = `
                        <div class="ai-drawer-bubble">${escapeHtml(response.content)}<button class="ai-drawer-insert-btn" data-content="${encodeURIComponent(response.content)}">↩ 插入</button></div>
                    `;
                }
                aiState.conversations.push({ role: 'user', content: message });
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
        isOpen,
        getCurrentNoteId,
        updateCurrentNoteContent,
    };

})();
