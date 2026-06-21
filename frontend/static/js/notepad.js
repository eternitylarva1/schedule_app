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

        if (subtype === 'notes') {
            if (window.ScheduleAppNotesList && typeof window.ScheduleAppNotesList.renderNotesList === 'function') {
                await window.ScheduleAppNotesList.renderNotesList();
            }
        } else {
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
                const result = await createNote(text);
                if (result) {
                    showToast('笔记已保存');
                    if (window.ScheduleAppNotesList && typeof window.ScheduleAppNotesList.renderNotesList === 'function') {
                        await window.ScheduleAppNotesList.renderNotesList();
                    }
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

})();
