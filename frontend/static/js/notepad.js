/**
 * Schedule App - Notepad Module (Router)
 * Top-level view init + subview routing for the notepad tab.
 * After NOTES_REFACTOR stage 1: heavy lifting moved to
 *   - notes-list.js  (list rendering, drag-drop)
 *   - note-editor.js (detail/edit modals)
 *   - note-ai.js     (floating AI chat)
 *   - expense.js     (expense list)
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

    // Re-entrancy guard for handleNotepadAdd
    let _isProcessingAdd = false;

    async function renderNotepadView() {
        const state = getState();
        const elements = getElements();
        const utils = getUtils();
        const { showToast, fetchExpenseCategories } = utils;

        // Default expense categories
        if (!state.expenseCategories) {
            state.expenseCategories = [
                { id: 'food', name: '餐饮', color: '#F97316' },
                { id: 'transport', name: '交通', color: '#3B82F6' },
                { id: 'shopping', name: '购物', color: '#EC4899' },
                { id: 'other', name: '其他', color: '#6B7280' },
            ];
        }

        // URL hash sync
        const hash = window.location.hash;
        if (hash.includes('/expense')) {
            state.notepadSubview = 'expense';
        } else if (hash.includes('/notes')) {
            state.notepadSubview = 'notes';
        }

        try {
            if (!elements.notepadTabs || !elements.notepadContainer) {
                elements.notepadContainer.innerHTML = '<div class="empty-state"><div class="empty-text">页面加载中...</div></div>';
                return;
            }

            fetchExpenseCategories().catch(err => console.error('Failed to fetch expense categories:', err));

            const tabs = elements.notepadTabs.querySelectorAll('.notepad-tab');
            tabs.forEach(tab => {
                if (tab.dataset.bound === '1') return;
                tab.dataset.bound = '1';
                tab.addEventListener('click', async () => {
                    const subtype = tab.dataset.subtype;
                    state.notepadSubview = subtype;
                    window.location.hash = 'notepad/' + subtype;
                    tabs.forEach((t) => t.classList.remove('active'));
                    tab.classList.add('active');
                    await renderNotepadContent();
                });
            });

            // Phase 3.1: mobile sub-tab switching (list / detail)
            const mobileSubtabs = document.getElementById('notesMobileSubtabs');
            if (mobileSubtabs && mobileSubtabs.dataset.bound !== '1') {
                mobileSubtabs.dataset.bound = '1';
                mobileSubtabs.querySelectorAll('.notes-mobile-subtab').forEach(subtab => {
                    subtab.addEventListener('click', () => {
                        const target = subtab.dataset.mobileSubtab;
                        const notesAppEl = document.getElementById('notesApp');
                        if (notesAppEl) notesAppEl.dataset.active = target;
                        mobileSubtabs.querySelectorAll('.notes-mobile-subtab').forEach(s => {
                            s.classList.toggle('active', s.dataset.mobileSubtab === target);
                        });
                    });
                });
            }

            // Phase 3.1: search input (real-time filter)
            const searchInput = document.getElementById('notesSearchInput');
            if (searchInput && searchInput.dataset.bound !== '1') {
                searchInput.dataset.bound = '1';
                searchInput.setAttribute('aria-label', '搜索笔记');
                let searchTimer = null;
                searchInput.addEventListener('input', (e) => {
                    clearTimeout(searchTimer);
                    const q = e.target.value.trim();
                    searchTimer = setTimeout(() => {
                        filterNotesBySearch(q);
                    }, 200);
                });
            }

            if (elements.notepadInput && elements.notepadAddBtn) {
                if (elements.notepadAddBtn.dataset.bound !== '1') {
                    elements.notepadAddBtn.dataset.bound = '1';
                    elements.notepadAddBtn.addEventListener('click', handleNotepadAdd);
                }
                if (elements.notepadInput.dataset.bound !== '1') {
                    elements.notepadInput.dataset.bound = '1';
                    elements.notepadInput.addEventListener('keypress', async (e) => {
                        if (e.key === 'Enter') {
                            await handleNotepadAdd();
                        }
                    });
                }
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
                    if (window.ScheduleAppNoteAI && typeof window.ScheduleAppNoteAI.hideAIFloatingWindow === 'function') {
                        window.ScheduleAppNoteAI.hideAIFloatingWindow();
                    }
                }
            }

            if (elements.expenseMonthSelector) {
                if (state.notepadSubview === 'expense') {
                    elements.expenseMonthSelector.classList.remove('hidden');
                    if (!state.expenseMonthSelectorInitialized) {
                        if (window.ScheduleAppExpense && typeof window.ScheduleAppExpense.initExpenseMonthSelector === 'function') {
                            window.ScheduleAppExpense.initExpenseMonthSelector();
                        }
                        state.expenseMonthSelectorInitialized = true;
                    }
                } else {
                    elements.expenseMonthSelector.classList.add('hidden');
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

        // Phase 3.1: switch between new notes-app container and legacy expense container
        const notesApp = document.getElementById('notesApp');
        const mobileSubtabs = document.getElementById('notesMobileSubtabs');
        if (subtype === 'notes') {
            if (notesApp) notesApp.classList.remove('hidden');
            if (mobileSubtabs) mobileSubtabs.classList.remove('hidden');
            if (container) container.classList.add('hidden');

            if (window.ScheduleAppNotesList && typeof window.ScheduleAppNotesList.renderNotesList === 'function') {
                await window.ScheduleAppNotesList.renderNotesList();
            }
        } else {
            if (notesApp) notesApp.classList.add('hidden');
            if (mobileSubtabs) mobileSubtabs.classList.add('hidden');
            if (container) container.classList.remove('hidden');

            if (window.ScheduleAppExpense && typeof window.ScheduleAppExpense.renderExpenseList === 'function') {
                await window.ScheduleAppExpense.renderExpenseList();
            }
        }

        if (elements.expenseMonthSelector) {
            if (subtype === 'expense') {
                elements.expenseMonthSelector.classList.remove('hidden');
                if (!state.expenseMonthSelectorInitialized) {
                    if (window.ScheduleAppExpense && typeof window.ScheduleAppExpense.initExpenseMonthSelector === 'function') {
                        window.ScheduleAppExpense.initExpenseMonthSelector();
                    }
                    state.expenseMonthSelectorInitialized = true;
                }
            } else {
                elements.expenseMonthSelector.classList.add('hidden');
            }
        }
    }

    async function handleNotepadAdd() {
        if (_isProcessingAdd) {
            console.log('handleNotepadAdd: already processing, skipping');
            return;
        }
        _isProcessingAdd = true;

        try {
            const state = getState();
            const elements = getElements();
            const { createNote, parseExpenseWithLLM, createExpense, showToast } = getUtils();

            const input = elements.notepadInput;
            if (!input || !input.value.trim()) return;

            const text = input.value.trim();
            input.value = '';

            if (state.notepadSubview === 'notes') {
                // Stage 5.1 + 5.6: Optimistic update — insert note row immediately
                const notesListModule = window.ScheduleAppNotesList;
                const tempNote = {
                    id: Date.now(), // temporary ID
                    content: text,
                    title: '',
                    is_pinned: false,
                    is_archived: false,
                    group_id: null,
                    created_at: new Date().toISOString()
                };
                const tempHtml = notesListModule && notesListModule.renderNoteItem
                    ? notesListModule.renderNoteItem(tempNote)
                    : `<div class="note-item" data-note-id="${tempNote.id}"><div class="note-item-preview no-title">${escapeHtml(text.substring(0, 80))}</div></div>`;

                // Insert at top of ungrouped or first group
                const listScroll = document.getElementById('notesListScroll');
                if (listScroll) {
                    const firstGroup = listScroll.querySelector('.note-group[data-group-id="ungrouped"] .note-group-content')
                        || listScroll.querySelector('.note-group .note-group-content');
                    if (firstGroup) {
                        firstGroup.insertAdjacentHTML('afterbegin', tempHtml);
                    }
                }

                const { showToastWithUndo } = getUtils();
                showToastWithUndo('笔记已保存', null);

                // Background API call
                try {
                    const result = await createNote(text);
                    if (result) {
                        // Re-render to show real data with proper ID/timestamps
                        if (notesListModule && typeof notesListModule.renderNotesList === 'function') {
                            await notesListModule.renderNotesList();
                        }
                    }
                } catch (e) {
                    // On failure: remove the temp row and show error
                    const tempEl = listScroll?.querySelector(`.note-item[data-note-id="${tempNote.id}"]`);
                    if (tempEl) tempEl.closest('.note-swipe')?.remove();
                    showToast('保存失败，请重试');
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
                                note: exp.note || text,
                                expense_date: exp.expense_date || null
                            });
                        }
                        if (expenses.length === 1) {
                            showToast(`已记录：${expenses[0].amount}元`);
                        } else {
                            showToast(`已记录${expenses.length}笔支出`);
                        }
                        if (window.ScheduleAppExpense && typeof window.ScheduleAppExpense.renderExpenseList === 'function') {
                            await window.ScheduleAppExpense.renderExpenseList();
                        }
                    } else {
                        showToast('AI解析失败，请重试');
                    }
                } else {
                    showToast('AI解析失败，请重试');
                }

                state.isLlmProcessing = false;
            }
        } finally {
            _isProcessingAdd = false;
        }
    }

    window.ScheduleAppNotepad = {
        renderNotepadView,
        renderNotepadContent,
        handleNotepadAdd,
    };

    // Phase 3.1: client-side search filter
    function filterNotesBySearch(query) {
        const listScroll = document.getElementById('notesListScroll');
        if (!listScroll) return;
        const q = (query || '').toLowerCase();
        const items = listScroll.querySelectorAll('.note-item');
        items.forEach(item => {
            if (!q) {
                item.style.display = '';
            } else {
                const text = (item.textContent || '').toLowerCase();
                item.style.display = text.includes(q) ? '' : 'none';
            }
        });
        listScroll.querySelectorAll('.note-group').forEach(group => {
            const visible = group.querySelectorAll('.note-item:not([style*="display: none"])');
            if (q && visible.length === 0) {
                group.style.display = 'none';
            } else {
                group.style.display = '';
            }
        });
    }

})();
