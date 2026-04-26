/**
 * Schedule App - Notepad Module
 * Notes, Expense, and AI Chat functionality
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

    let noteDragState = {
        draggedNoteId: null,
        draggedElement: null,
        sourceGroupId: null,
        dragOverGroupId: null,
        dragOverNoteId: null,
    };

    async function renderNotepadView() {
        const state = getState();
        const elements = getElements();
        const utils = getUtils();
        const { showToast } = utils;

        // Initialize default expense categories if not set
        if (!state.expenseCategories) {
            state.expenseCategories = [
                { id: 'food', name: '餐饮', color: '#F59E0B' },
                { id: 'transport', name: '交通', color: '#3B82F6' },
                { id: 'shopping', name: '购物', color: '#EC4899' },
                { id: 'entertainment', name: '娱乐', color: '#8B5CF6' },
                { id: 'health', name: '医疗', color: '#EF4444' },
                { id: 'education', name: '教育', color: '#06B6D4' },
                { id: 'other', name: '其他', color: '#6B7280' },
            ];
        }

        try {
            if (!elements.notepadTabs || !elements.notepadContainer) {
                console.error('Notepad elements not found:', {
                    notepadTabs: elements.notepadTabs,
                    notepadContainer: elements.notepadContainer,
                    notepadView: elements.notepadView
                });
                elements.notepadContainer.innerHTML = '<div class="empty-state"><div class="empty-text">页面加载中...</div></div>';
                return;
            }
            
            const tabs = elements.notepadTabs.querySelectorAll('.notepad-tab');
            tabs.forEach(tab => {
                tab.addEventListener('click', async () => {
                    const subtype = tab.dataset.subtype;
                    state.notepadSubview = subtype;
                    tabs.forEach((t) => {
                        t.classList.remove('active');
                    });
                    tab.classList.add('active');
                    await renderNotepadContent();
                });
            });
            
            if (elements.notepadInput && elements.notepadAddBtn) {
                elements.notepadAddBtn.addEventListener('click', handleNotepadAdd);
                elements.notepadInput.addEventListener('keypress', async (e) => {
                    if (e.key === 'Enter') {
                        await handleNotepadAdd();
                    }
                });
            }
            
            await renderNotepadContent();

            if (elements.contentAddBtn) {
                elements.contentAddBtn.textContent = '+';
                elements.contentAddBtn.title = state.notepadSubview === 'expense' ? '快速记账' : '新建笔记';
            }

            const aiFloatBtn = document.getElementById('aiChatFloatBtn');
            if (aiFloatBtn) {
                if (state.notepadSubview === 'notes') {
                    aiFloatBtn.classList.remove('hidden');
                } else {
                    aiFloatBtn.classList.add('hidden');
                    hideAIFloatingWindow();
                }
            }
        } catch (err) {
            console.error('renderNotepadView error:', err);
            if (elements.notepadContainer) {
                elements.notepadContainer.innerHTML = '<div class="empty-state"><div class="empty-text">加载出错: ' + err.message + '</div></div>';
            }
        }
    }

    async function renderNotepadContent() {
        const state = getState();
        const elements = getElements();

        const container = elements.notepadContainer;
        const subtype = state.notepadSubview;
        
        elements.headerTitle.textContent = subtype === 'notes' ? '笔记' : '记账';
        
        if (elements.notepadInput) {
            if (subtype === 'notes') {
                elements.notepadInput.placeholder = '输入内容，AI帮你整理...';
            } else {
                elements.notepadInput.placeholder = '输入如：中午吃面15块...';
            }
        }
        
        if (subtype === 'notes') {
            await renderNotesList();
        } else {
            await renderExpenseList();
        }
    }

    async function handleNotepadAdd() {
        const state = getState();
        const elements = getElements();
        const { createNote, parseExpenseWithLLM, createExpense, showToast } = getUtils();

        const input = elements.notepadInput;
        if (!input || !input.value.trim()) return;
        
        const text = input.value.trim();
        input.value = '';
        
        if (state.notepadSubview === 'notes') {
            const result = await createNote(text);
            if (result) {
                showToast('笔记已保存');
                await renderNotesList();
            }
        } else {
            state.isLlmProcessing = true;
            showToast('AI解析中...');
            
            const parsed = await parseExpenseWithLLM(text);
            if (parsed) {
                let expenses = [];
                if (parsed.expenses && Array.isArray(parsed.expenses)) {
                    expenses = parsed.expenses;
                } else if (parsed.amount !== undefined) {
                    expenses = [parsed];
                }
                
                if (expenses.length > 0) {
                    for (const exp of expenses) {
                        await createExpense({
                            amount: exp.amount,
                            category: exp.category,
                            note: exp.note || text
                        });
                    }
                    if (expenses.length === 1) {
                        showToast(`已记录：${expenses[0].amount}元`);
                    } else {
                        showToast(`已记录${expenses.length}笔支出`);
                    }
                    await renderExpenseList();
                } else {
                    showToast('AI解析失败，请重试');
                }
            } else {
                showToast('AI解析失败，请重试');
            }
            
            state.isLlmProcessing = false;
        }
    }

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
                    closeAllOpenSwipeItems();
                    return;
                }
                const noteId = parseInt(item.dataset.noteId);
                const note = state.notes.find(n => n.id === noteId);
                if (note) {
                    state.selectedNote = note;
                    if (aiChatState.isOpen) {
                        const contextContent = document.getElementById('aiChatContextContent');
                        if (contextContent) {
                            contextContent.textContent = note.content || '（空笔记）';
                        }
                        setTimeout(() => {
                            const input = document.getElementById('aiChatInput');
                            if (input) input.focus();
                        }, 100);
                    } else {
                        getUtils().showNoteDetail(note);
                    }
                }
            });
        });
        
        container.querySelectorAll('.note-swipe .swipe-action').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                const noteId = parseInt(btn.dataset.noteId);
                const { showNoteEdit, deleteNote, showToast, showConfirm } = getUtils();

                if (action === 'edit') {
                    const note = state.notes.find(n => n.id === noteId);
                    if (note) showNoteEdit(note);
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
        
        initNoteDragDrop();
    }

    function renderNoteItem(note) {
        const result = `
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
        return result;
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
    }

    function handleNoteDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        
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
        } else if (noteDragState.dragOverNoteId) {
            const overSwipe = document.querySelector(`.note-swipe[data-note-id="${noteDragState.dragOverNoteId}"]`);
            if (overSwipe && overSwipe.closest('.note-group')) {
                targetGroupId = parseInt(overSwipe.closest('.note-group').dataset.groupId);
            }
        }
        
        if (noteId && targetGroupId !== noteDragState.sourceGroupId) {
            const { updateNote, showToast } = getUtils();
            await updateNote(noteId, { group_id: targetGroupId });
            showToast('笔记已移动');
            await renderNotesList();
        }
        
        noteDragState = { draggedNoteId: null, draggedElement: null, sourceGroupId: null, dragOverGroupId: null, dragOverNoteId: null };
    }

    function handleNoteDragEnd(e) {
        document.querySelectorAll('.note-swipe.drag-over').forEach(el => {
            el.classList.remove('drag-over');
        });
        document.querySelectorAll('.note-group.drag-over').forEach(el => {
            el.classList.remove('drag-over');
        });
        
        if (noteDragState.draggedElement) {
            noteDragState.draggedElement.classList.remove('dragging');
        }
        
        noteDragState = { draggedNoteId: null, draggedElement: null, sourceGroupId: null, dragOverGroupId: null, dragOverNoteId: null };
    }

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
                <div class="ai-floating-bubble">${escapeHtml(conv.content)}</div>
                <div class="ai-floating-time">${formatNoteTime(conv.created_at)}</div>
            </div>
        `).join('');

        container.scrollTop = container.scrollHeight;
    }

    async function sendAIChatMessage() {
        const input = document.getElementById('aiFloatingInput');
        const history = document.getElementById('aiFloatingHistory');
        if (!input || !aiChatState.currentNote) return;

        const text = input.value.trim();
        if (!text) return;

        input.value = '';

        const { chatWithNote, fetchNoteConversations } = getUtils();

        history.innerHTML += `
            <div class="ai-floating-message user">
                <div class="ai-floating-bubble">${escapeHtml(text)}</div>
            </div>
        `;
        history.scrollTop = history.scrollHeight;

        try {
            const response = await chatWithNote(aiChatState.currentNote.id, text);
            if (response) {
                await loadAIChatHistory();
            }
        } catch (error) {
            console.error('Chat error:', error);
            history.innerHTML += `
                <div class="ai-floating-message error">
                    <div class="ai-floating-bubble">发送失败，请重试</div>
                </div>
            `;
        }
    }

    async function insertAIResponseToNote(content) {
        if (!aiChatState.currentNote) return;

        const { updateNote, showToast } = getUtils();
        
        const newContent = aiChatState.currentNote.content 
            ? aiChatState.currentNote.content + '\n\n' + content 
            : content;
        
        await updateNote(aiChatState.currentNote.id, { content: newContent });
        showToast('已添加到笔记');
        
        aiChatState.currentNote.content = newContent;
        const contextContent = document.getElementById('aiChatContextContent');
        if (contextContent) {
            contextContent.textContent = newContent.substring(0, 200) + (newContent.length > 200 ? '...' : '');
        }
        
        await renderNotesList();
    }

    async function renderExpenseList() {
        const state = getState();
        const elements = getElements();
        const { fetchExpenses, fetchExpenseStats, fetchBudgets, showToast, deleteExpense, openExpenseModal } = getUtils();

        const container = elements.notepadContainer;
        const expenses = await fetchExpenses();
        const stats = await fetchExpenseStats() || { total: 0, by_category: {} };
        const budgets = await fetchBudgets() || [];
        
        const textColor = (color) => getTextColorForBackground(color);
        const periodLabels = {
            weekly: '每周',
            monthly: '每月',
            quarterly: '每季度',
            yearly: '每年',
        };
        const budgetCardsHtml = `
            <div class="budget-header">
                <span class="budget-header-title" id="budgetListTitle">我的预算${budgets.length ? `（${budgets.length}个）` : ''}</span>
                <button class="budget-add-btn" id="addBudgetBtn">+ 添加预算</button>
            </div>
            ${budgets.length ? `
                <div class="budget-cards">
                    ${budgets.map(budget => {
                        const amount = budget.effective_amount || budget.amount || 0;
                        const spent = budget.spent || 0;
                        const remaining = amount - spent;
                        const percent = amount > 0 ? Math.min((spent / amount) * 100, 100) : 0;
                        const overBudget = spent > amount;
                        const periodLabel = budget.period && budget.period !== 'none' ? (periodLabels[budget.period] || '') : '';
                        return `
                            <div class="budget-card-wrapper">
                                <div class="budget-card" data-budget-id="${budget.id}" style="background: ${budget.color}; color: ${textColor(budget.color)};">
                                    ${periodLabel ? `<div class="budget-card-period">${periodLabel}</div>` : ''}
                                    <div class="budget-card-name">${escapeHtml(budget.name)}</div>
                                    <div class="budget-card-remaining ${overBudget ? 'over-budget' : ''}">
                                        ${overBudget ? '超支' : '剩余'} ¥${Math.abs(remaining).toFixed(1)}
                                    </div>
                                    <div class="budget-card-progress">
                                        <div class="budget-card-progress-bar" style="width: ${percent}%; background: ${textColor(budget.color)};"></div>
                                    </div>
                                    <div class="budget-card-spent">已用 ¥${spent.toFixed(1)} / ¥${amount.toFixed(1)}</div>
                                    ${budget.rollover && budget.rollover_amount > 0 ? `<div class="budget-card-rollover">结转 ¥${budget.rollover_amount.toFixed(1)}</div>` : ''}
                                </div>
                                <button class="budget-card-delete" data-budget-id="${budget.id}" title="删除预算">×</button>
                            </div>
                        `;
                    }).join('')}
                </div>
            ` : ''}
        `;
        
        const statsHtml = `
            <div class="expense-stats-card">
                <div class="expense-total">
                    <span class="expense-total-label">本月支出</span>
                    <span class="expense-total-value">¥${stats.total.toFixed(1)}</span>
                </div>
                <div class="expense-category-summary">
                    ${state.expenseCategories.map(cat => {
                        const amount = stats.by_category[cat.id] || 0;
                        return amount > 0 ? `
                            <div class="expense-cat-item">
                                <span class="expense-cat-dot" style="background: ${cat.color}"></span>
                                <span class="expense-cat-name">${cat.name}</span>
                                <span class="expense-cat-amount">¥${amount.toFixed(1)}</span>
                            </div>
                        ` : '';
                    }).join('')}
                </div>
            </div>
        `;
        
        if (!expenses || expenses.length === 0) {
            container.innerHTML = budgetCardsHtml + statsHtml + `
                <div class="empty-state">
                    <div class="empty-icon">💰</div>
                    <div class="empty-text">暂无记账记录</div>
                    <div class="empty-hint">输入如：中午吃面15块</div>
                </div>
            `;
            window.ScheduleAppBudget?.bindBudgetEvents?.();
            return;
        }
        
        const grouped = {};
        expenses.forEach(exp => {
            const dateKey = exp.created_at ? exp.created_at.split('T')[0] : 'unknown';
            if (!grouped[dateKey]) grouped[dateKey] = [];
            grouped[dateKey].push(exp);
        });
        
        let listHtml = budgetCardsHtml + statsHtml + '<div class="expense-list">';
        
        Object.keys(grouped).sort((a, b) => b.localeCompare(a)).forEach(dateKey => {
            const dayExpenses = grouped[dateKey];
            const date = new Date(dateKey);
            const now = new Date();
            const isToday = isSameDay(date, now);
            const isYesterday = isSameDay(date, new Date(now.getTime() - 86400000));
            
            let dateLabel;
            if (isToday) dateLabel = '今天';
            else if (isYesterday) dateLabel = '昨天';
            else dateLabel = `${date.getMonth() + 1}月${date.getDate()}日`;
            
            listHtml += `
                <div class="expense-day-group">
                    <div class="expense-day-header">${dateLabel}</div>
                    ${dayExpenses.map(exp => {
                        const cat = state.expenseCategories.find(c => c.id === exp.category) || { name: '其他', color: '#6B7280' };
                        return `
                            <div class="expense-item expense-item-clickable" data-expense-id="${exp.id}">
                                <div class="expense-item-left">
                                    <span class="expense-item-cat" style="background: ${cat.color}20; color: ${cat.color}">${cat.name}</span>
                                    <span class="expense-item-note">${escapeHtml(exp.note || '')}</span>
                                </div>
                                <div class="expense-item-right">
                                    <span class="expense-item-amount">¥${exp.amount.toFixed(1)}</span>
                                    <button class="expense-item-delete" data-expense-id="${exp.id}">×</button>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        });
        
        listHtml += '</div>';
        container.innerHTML = listHtml;
        window.ScheduleAppBudget?.bindBudgetEvents?.();
        
        container.querySelectorAll('.expense-item-clickable').forEach(item => {
            item.addEventListener('click', async (e) => {
                if (e.target.closest('.expense-item-delete')) return;
                const expenseId = parseInt(item.dataset.expenseId);
                const exp = expenses.find(x => x.id === expenseId);
                if (exp) {
                    openExpenseModal(exp);
                }
            });
        });
        
        container.querySelectorAll('.expense-item-delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const expenseId = parseInt(btn.dataset.expenseId);
                await deleteExpense(expenseId);
                showToast('已删除');
                await renderExpenseList();
            });
        });
    }

    function getTextColorForBackground(hexColor) {
        if (!hexColor || hexColor === 'transparent') return '#000000';
        const hex = hexColor.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance > 0.5 ? '#000000' : '#ffffff';
    }

    function closeAllOpenSwipeItems() {
        document.querySelectorAll('.swipe-item.swipe-open').forEach(item => {
            item.classList.remove('swipe-open', 'swipe-open-left', 'swipe-open-right');
            const content = item.querySelector('.swipe-content');
            if (content) {
                content.style.transform = '';
            }
        });
    }

    window.ScheduleAppNotepad = {
        renderNotepadView,
        renderNotepadContent,
        handleNotepadAdd,
        renderNotesList,
        renderNoteItem,
        showAddGroupPrompt,
        initNoteDragDrop,
        initAIChatPanel,
        showAIFloatingWindow,
        hideAIFloatingWindow,
        loadAIChatHistory,
        renderAIChatHistory,
        sendAIChatMessage,
        insertAIResponseToNote,
        renderExpenseList,
        aiChatState,
        noteDragState,
    };

})();
