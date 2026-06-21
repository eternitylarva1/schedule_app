/**
 * Schedule App - Expense Module
 * Expense list (budget cards, stats, daily groups, swipe delete).
 * Refactored from notepad.js (lines 956-1205) as part of NOTES_REFACTOR stage 1.
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

    function isSameDay(date1, date2) {
        if (!date1 || !date2) return false;
        const d1 = new Date(date1);
        const d2 = new Date(date2);
        return d1.getFullYear() === d2.getFullYear() &&
               d1.getMonth() === d2.getMonth() &&
               d1.getDate() === d2.getDate();
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

    async function renderExpenseList() {
        const state = getState();
        const elements = getElements();
        const { fetchExpenses, fetchExpenseStats, fetchBudgets, showToast, deleteExpense, openExpenseModal } = getUtils();

        const container = elements.notepadContainer;
        const expenses = await fetchExpenses(state.expenseDateFilter || 'month');
        const stats = await fetchExpenseStats(state.expenseDateFilter || 'month') || { total: 0, by_category: {} };
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
                            <div class="swipe-item expense-swipe" data-expense-id="${exp.id}">
                                <div class="swipe-action swipe-action-right" data-action="delete" data-expense-id="${exp.id}">删除</div>
                                <div class="swipe-content">
                                    <div class="expense-item expense-item-clickable" data-expense-id="${exp.id}">
                                        <div class="expense-item-left">
                                            <span class="expense-item-cat" style="background: ${cat.color}20; color: ${cat.color}">${cat.name}</span>
                                            <span class="expense-item-note">${escapeHtml(exp.note || '')}</span>
                                        </div>
                                        <div class="expense-item-right">
                                            <span class="expense-item-amount">¥${exp.amount.toFixed(1)}</span>
                                        </div>
                                    </div>
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

        const bindSwipe = window.ScheduleAppCore?.bindSwipeItem;
        if (bindSwipe) {
            container.querySelectorAll('.expense-swipe').forEach(bindSwipe);
        }
        container.querySelectorAll('.expense-swipe .swipe-action').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const { showConfirm, deleteExpense, showToast } = getUtils();
                const action = btn.dataset.action;
                const expenseId = parseInt(btn.dataset.expenseId);
                if (action === 'delete') {
                    const confirmed = await showConfirm('确定删除这条支出吗？');
                    if (confirmed) {
                        await deleteExpense(expenseId);
                        showToast('已删除');
                        await renderExpenseList();
                    }
                }
            });
        });

        container.querySelectorAll('.expense-item-clickable').forEach(item => {
            item.addEventListener('click', async (e) => {
                if (e.target.closest('.swipe-action')) return;
                if (item.closest('.swipe-item')?.classList.contains('swipe-just-dragged')) return;
                const expenseId = parseInt(item.dataset.expenseId);
                const exp = expenses.find(x => x.id === expenseId);
                if (exp) {
                    openExpenseModal(exp);
                }
            });
        });
    }

    function initExpenseMonthSelector() {
        const elements = getElements();
        const state = getState();

        if (!state.expenseDateFilter || state.expenseDateFilter === 'month') {
            const now = new Date();
            state.expenseDateFilter = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        }

        if (elements.expenseMonthInput) {
            elements.expenseMonthInput.value = state.expenseDateFilter;
        }

        if (elements.expenseMonthPrev) {
            elements.expenseMonthPrev.onclick = () => {
                const [year, month] = state.expenseDateFilter.split('-').map(Number);
                let newMonth = month - 1;
                let newYear = year;
                if (newMonth < 1) {
                    newMonth = 12;
                    newYear -= 1;
                }
                state.expenseDateFilter = `${newYear}-${String(newMonth).padStart(2, '0')}`;
                if (elements.expenseMonthInput) {
                    elements.expenseMonthInput.value = state.expenseDateFilter;
                }
                renderExpenseList();
            };
        }

        if (elements.expenseMonthNext) {
            elements.expenseMonthNext.onclick = () => {
                const [year, month] = state.expenseDateFilter.split('-').map(Number);
                let newMonth = month + 1;
                let newYear = year;
                if (newMonth > 12) {
                    newMonth = 1;
                    newYear += 1;
                }
                state.expenseDateFilter = `${newYear}-${String(newMonth).padStart(2, '0')}`;
                if (elements.expenseMonthInput) {
                    elements.expenseMonthInput.value = state.expenseDateFilter;
                }
                renderExpenseList();
            };
        }

        if (elements.expenseMonthInput) {
            elements.expenseMonthInput.onchange = () => {
                state.expenseDateFilter = elements.expenseMonthInput.value;
                renderExpenseList();
            };
        }
    }

    window.ScheduleAppExpense = {
        renderExpenseList,
        initExpenseMonthSelector,
        getTextColorForBackground,
    };

})();
