/**
 * Schedule App - Note AI Module
 * Floating AI chat panel for notes. Refactored from main.js (lines 1105-1394)
 * as part of NOTES_REFACTOR stage 1.
 *
 * Provides (on window.ScheduleAppNoteAI):
 *   - initAIChatPanel()  : bind events (called from main.js init())
 *   - showAIFloatingWindow(note) : open panel for a note
 *   - hideAIFloatingWindow()     : close panel
 *   - loadAIChatHistory()        : refresh from server
 *   - renderAIChatHistory()      : paint messages
 *   - sendAIChatMessage()        : send user input
 *   - insertAIResponseToNote(c)  : append AI text into current note
 *   - isOpen()                   : boolean, for other modules to check
 *   - getCurrentNoteId()         : note id of current AI context, or null
 *   - updateCurrentNoteContent(c): sync local note content after edit
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

    // --- state (closure private) ---
    let aiChatState = {
        isOpen: false,
        currentNote: null,
        conversations: [],
        isLoading: false,
        isMinimized: false,
        isDragging: false,
        offsetX: 0,
        offsetY: 0
    };

    function initAIChatPanel() {
        const floatingWindow = document.getElementById('aiFloatingWindow');
        const minimizeBtn = document.getElementById('aiFloatingMinimize');
        const sendBtn = document.getElementById('aiFloatingSend');
        const input = document.getElementById('aiFloatingInput');
        const header = document.getElementById('aiFloatingHeader');

        if (!floatingWindow) return;

        floatingWindow.style.display = 'none';

        if (minimizeBtn) {
            minimizeBtn.addEventListener('click', () => {
                aiChatState.isMinimized = !aiChatState.isMinimized;
                if (aiChatState.isMinimized) {
                    floatingWindow.classList.add('minimized');
                    minimizeBtn.textContent = '□';
                } else {
                    floatingWindow.classList.remove('minimized');
                    minimizeBtn.textContent = '─';
                }
            });
        }

        if (sendBtn) {
            sendBtn.addEventListener('click', () => sendAIChatMessage());
        }

        if (input) {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    sendAIChatMessage();
                }
            });
        }

        const history = document.getElementById('aiFloatingHistory');
        if (history) {
            history.addEventListener('click', (e) => {
                const insertBtn = e.target.closest('.ai-floating-insert-btn');
                if (insertBtn) {
                    const content = decodeURIComponent(insertBtn.dataset.content);
                    insertAIResponseToNote(content);
                }
            });
        }

        if (header) {
            header.addEventListener('mousedown', startDrag);
            header.addEventListener('touchstart', startDrag, { passive: false });
        }

        document.addEventListener('mousemove', drag);
        document.addEventListener('touchmove', drag, { passive: false });
        document.addEventListener('mouseup', stopDrag);
        document.addEventListener('touchend', stopDrag);
    }

    function startDrag(e) {
        const floatingWindow = document.getElementById('aiFloatingWindow');
        if (!floatingWindow) return;

        aiChatState.isDragging = true;
        const rect = floatingWindow.getBoundingClientRect();

        if (e.type === 'touchstart') {
            aiChatState.offsetX = e.touches[0].clientX - rect.left;
            aiChatState.offsetY = e.touches[0].clientY - rect.top;
        } else {
            aiChatState.offsetX = e.clientX - rect.left;
            aiChatState.offsetY = e.clientY - rect.top;
        }
    }

    function drag(e) {
        if (!aiChatState.isDragging) return;

        const floatingWindow = document.getElementById('aiFloatingWindow');
        if (!floatingWindow) return;

        let clientX, clientY;
        if (e.type === 'touchmove') {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        const newLeft = clientX - aiChatState.offsetX;
        const newTop = clientY - aiChatState.offsetY;

        const maxLeft = window.innerWidth - floatingWindow.offsetWidth;
        const maxTop = window.innerHeight - floatingWindow.offsetHeight;

        floatingWindow.style.left = Math.max(0, Math.min(newLeft, maxLeft)) + 'px';
        floatingWindow.style.top = Math.max(0, Math.min(newTop, maxTop)) + 'px';
        floatingWindow.style.right = 'auto';

        e.preventDefault();
    }

    function stopDrag() {
        aiChatState.isDragging = false;
    }

    function showAIFloatingWindow(note) {
        const floatingWindow = document.getElementById('aiFloatingWindow');
        const context = document.getElementById('aiFloatingContext');

        if (!floatingWindow) return;

        aiChatState.isOpen = true;
        aiChatState.currentNote = note;
        aiChatState.isMinimized = false;

        floatingWindow.style.display = 'flex';
        floatingWindow.classList.remove('minimized');
        const minimizeBtn = document.getElementById('aiFloatingMinimize');
        if (minimizeBtn) minimizeBtn.textContent = '─';

        if (context) {
            context.textContent = note.content ? note.content.substring(0, 200) + (note.content.length > 200 ? '...' : '') : '（空笔记）';
        }

        loadAIChatHistory();

        setTimeout(() => {
            const input = document.getElementById('aiFloatingInput');
            if (input) {
                input.focus();
            }
        }, 100);
    }

    function hideAIFloatingWindow() {
        const floatingWindow = document.getElementById('aiFloatingWindow');
        if (!floatingWindow) return;

        aiChatState.isOpen = false;
        aiChatState.currentNote = null;
        aiChatState.conversations = [];
        floatingWindow.style.display = 'none';
    }

    async function loadAIChatHistory() {
        if (!aiChatState.currentNote) return;
        const { fetchNoteConversations } = getUtils();
        try {
            const conversations = await fetchNoteConversations(aiChatState.currentNote.id);
            aiChatState.conversations = conversations || [];
            renderAIChatHistory();
        } catch (error) {
            console.error('Failed to load chat history:', error);
        }
    }

    function renderAIChatHistory() {
        const container = document.getElementById('aiFloatingHistory');
        if (!container) return;

        if (aiChatState.conversations.length === 0) {
            container.innerHTML = '<div class="ai-floating-empty">发送消息开始对话</div>';
            return;
        }

        container.innerHTML = aiChatState.conversations.map(conv => `
            <div class="ai-floating-message ${conv.role}">
                <div class="ai-floating-bubble">
                    ${escapeHtml(conv.content)}
                    ${conv.role === 'assistant' ? `<button class="ai-floating-insert-btn" data-content="${encodeURIComponent(conv.content)}">↩ 插入</button>` : ''}
                </div>
            </div>
        `).join('');

        container.scrollTop = container.scrollHeight;
    }

    async function sendAIChatMessage() {
        if (!aiChatState.currentNote || aiChatState.isLoading) return;

        const { chatWithNote, showToast } = getUtils();
        const input = document.getElementById('aiFloatingInput');
        const message = input?.value.trim();
        if (!message) return;

        const container = document.getElementById('aiFloatingHistory');
        aiChatState.isLoading = true;
        input.value = '';

        if (container) {
            container.innerHTML += `
                <div class="ai-floating-message user">
                    <div class="ai-floating-bubble">${escapeHtml(message)}</div>
                </div>
                <div class="ai-floating-message assistant">
                    <div class="ai-floating-bubble" style="color: var(--text-muted);">思考中...</div>
                </div>
            `;
            container.scrollTop = container.scrollHeight;
        }

        try {
            const response = await chatWithNote(aiChatState.currentNote.id, message);

            if (response) {
                const thinkingEl = container?.querySelector('.ai-floating-message.assistant:last-child');
                if (thinkingEl) {
                    thinkingEl.innerHTML = `
                        <div class="ai-floating-bubble">${escapeHtml(response.content)}<button class="ai-floating-insert-btn" data-content="${encodeURIComponent(response.content)}">↩ 插入</button></div>
                    `;
                }

                aiChatState.conversations.push({ role: 'user', content: message });
                aiChatState.conversations.push({ role: 'assistant', content: response.content });
            }
        } catch (error) {
            console.error('Chat error:', error);
            showToast('AI 对话失败，请重试');

            const thinkingEl = container?.querySelector('.ai-floating-message.assistant:last-child');
            if (thinkingEl) thinkingEl.remove();
        } finally {
            aiChatState.isLoading = false;
        }
    }

    async function insertAIResponseToNote(content) {
        if (!aiChatState.currentNote) return;

        const { updateNote, showToast } = getUtils();

        const currentContent = aiChatState.currentNote.content || '';
        const newContent = currentContent
            ? currentContent + '\n\n---\nAI 回答：\n' + content
            : 'AI 回答：\n' + content;

        try {
            await updateNote(aiChatState.currentNote.id, { content: newContent });
            aiChatState.currentNote.content = newContent;

            const textareas = document.querySelectorAll('#noteEditTextarea');
            const textarea = textareas[textareas.length - 1];
            if (textarea) {
                textarea.value = newContent;
            }

            const context = document.getElementById('aiFloatingContext');
            if (context) {
                context.textContent = newContent.substring(0, 200) + (newContent.length > 200 ? '...' : '');
            }

            showToast('已插入到笔记');
        } catch (error) {
            console.error('Failed to insert to note:', error);
            showToast('插入失败');
        }
    }

    // Public API (used by notes-list.js / note-editor.js)
    function isOpen() {
        return aiChatState.isOpen;
    }
    function getCurrentNoteId() {
        return aiChatState.currentNote ? aiChatState.currentNote.id : null;
    }
    function updateCurrentNoteContent(newContent) {
        if (aiChatState.currentNote) {
            aiChatState.currentNote.content = newContent;
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
