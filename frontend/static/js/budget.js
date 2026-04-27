/**
 * Schedule App - Budget Module
 * Budget and Expense management functions
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

    function getTextColorForBackground(hexColor) {
        if (!hexColor || hexColor === 'transparent') return '#000000';
        const hex = hexColor.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance > 0.5 ? '#000000' : '#ffffff';
    }

    function isSameDay(date1, date2) {
        if (!date1 || !date2) return false;
        const d1 = new Date(date1);
        const d2 = new Date(date2);
        return d1.getFullYear() === d2.getFullYear() &&
               d1.getMonth() === d2.getMonth() &&
               d1.getDate() === d2.getDate();
    }

    let selectedBudgetPeriod = 'none';
    let selectedExpenseCategory = 'food';
    let editingExpenseId = null;
    let lastUsedBudgetId = null;
    let selectedExpenseBudgetId = null;
    let isExpenseSaving = false;

    async function rerenderExpenseList() {
        const fn = window.ScheduleAppNotepad?.renderExpenseList;
        if (typeof fn === 'function') {
            return await fn();
        }
    }

    function daysInMonth(year, month) {
        return new Date(year, month, 0).getDate();
    }

    function toLocalIsoNoTimezone(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const hh = String(date.getHours()).padStart(2, '0');
        const mm = String(date.getMinutes()).padStart(2, '0');
        const ss = String(date.getSeconds()).padStart(2, '0');
        return `${y}-${m}-${d}T${hh}:${mm}:${ss}`;
    }

    function normalizeMonthlyStartDay(dayValue) {
        const day = parseInt(dayValue, 10);
        if (Number.isNaN(day)) return null;
        if (day < 1 || day > 31) return null;
        return day;
    }

    function getBudgetMonthlyStartDay(budget) {
        const explicit = normalizeMonthlyStartDay(budget?.monthly_start_day);
        if (explicit) return explicit;
        if (budget?.period_start) {
            const d = new Date(budget.period_start);
            if (!Number.isNaN(d.getTime())) return d.getDate();
        }
        return new Date().getDate();
    }

    function buildMonthlyPeriodStartIso(monthlyStartDay) {
        const now = new Date();
        let year = now.getFullYear();
        let month = now.getMonth() + 1;

        let day = Math.min(monthlyStartDay, daysInMonth(year, month));
        let candidate = new Date(year, month - 1, day, 0, 0, 0, 0);

        if (candidate > now) {
            month -= 1;
            if (month < 1) {
                month = 12;
                year -= 1;
            }
            day = Math.min(monthlyStartDay, daysInMonth(year, month));
            candidate = new Date(year, month - 1, day, 0, 0, 0, 0);
        }

        return toLocalIsoNoTimezone(candidate);
    }

    function updateMonthlyStartDayVisibility() {
        const elements = getElements();
        if (!elements.budgetMonthlyStartDayGroup) return;
        elements.budgetMonthlyStartDayGroup.style.display = selectedBudgetPeriod === 'monthly' ? 'block' : 'none';
    }

    function formatBudgetPeriodLabel(budget) {
        if (!budget?.period || budget.period === 'none') return '';
        if (budget.period === 'monthly') {
            const startDay = getBudgetMonthlyStartDay(budget);
            return `每月·${startDay}号开始`;
        }
        return { weekly: '每周', quarterly: '每季度', yearly: '每年' }[budget.period] || '';
    }

    function bindBudgetEvents() {
        const elements = getElements();
        const state = getState();
        const { showToast, showConfirm, fetchBudgets, deleteBudget, apiCall } = getUtils();

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

        const addBtn = document.getElementById('addBudgetBtn');
        if (addBtn) {
            addBtn.addEventListener('click', () => openBudgetModal());
        }
        
        const budgetListTitle = document.getElementById('budgetListTitle');
        if (budgetListTitle) {
            budgetListTitle.addEventListener('click', () => {
                if (state.budgetView === 'cards') {
                    state.budgetView = 'list';
                    showAllBudgetsList();
                } else {
                    state.budgetView = 'cards';
                    rerenderExpenseList();
                }
            });
        }
        
        const deleteBtns = document.querySelectorAll('.budget-card-delete');
        deleteBtns.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const budgetId = parseInt(btn.dataset.budgetId);
                const confirmed = await showConfirm('确定删除这个预算吗？关联的支出记录不会被删除。');
                if (confirmed) {
                    await deleteBudget(budgetId);
                    showToast('已删除');
                    await rerenderExpenseList();
                }
            });
        });
        
        const budgetCards = document.querySelectorAll('.budget-card');
        budgetCards.forEach(card => {
            card.addEventListener('click', async () => {
                const budgetId = parseInt(card.dataset.budgetId);
                const budget = state.budgets.find(b => b.id === budgetId);
                if (budget) {
                    await showBudgetExpenses(budget);
                }
            });
        });
    }
    
    async function showAllBudgetsList() {
        const state = getState();
        const elements = getElements();
        const { showToast, fetchBudgets, createBudget, updateBudget } = getUtils();

        state.budgetView = 'list';
        const container = elements.notepadContainer;
        
        const budgets = await fetchBudgets();
        
        if (budgets.length === 0) {
            container.innerHTML = `
                <div class="budget-header">
                    <span class="budget-header-title">我的预算</span>
                    <button class="budget-add-btn" id="addBudgetBtn">+ 添加预算</button>
                </div>
                <div class="empty-state" style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
                    <div style="font-size: 48px; margin-bottom: 16px;">💰</div>
                    <div>暂无预算</div>
                    <div style="font-size: var(--font-size-xs); margin-top: 8px;">点击上方按钮创建第一个预算</div>
                </div>
            `;
            bindBudgetEvents();
            return;
        }
        
        const textColor = (color) => getTextColorForBackground(color);
        
        let html = `
            <div class="budget-header">
                <span class="budget-header-title" id="budgetListTitle">我的预算（${budgets.length}个）</span>
                <button class="budget-add-btn" id="addBudgetBtn">+ 添加预算</button>
            </div>
            <div class="budget-list-view" style="display: flex; flex-direction: column; gap: var(--space-sm);">
                ${budgets.map(budget => {
                    const effectiveAmount = budget.effective_amount || budget.amount;
                    const remaining = effectiveAmount - budget.spent;
                    const percent = effectiveAmount > 0 ? Math.min((budget.spent / effectiveAmount) * 100, 100) : 0;
                    const isOver = budget.spent > effectiveAmount;
                    const periodLabel = formatBudgetPeriodLabel(budget);
                    return `
                        <div class="budget-list-item" data-budget-id="${budget.id}" style="
                            background: ${budget.color};
                            color: ${textColor(budget.color)};
                            border-radius: var(--radius-lg);
                            padding: var(--space-md);
                            cursor: pointer;
                        ">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-xs);">
                                <span style="font-weight: 500;">${escapeHtml(budget.name)}</span>
                                <span style="font-size: var(--font-size-xs); opacity: 0.8;">${isOver ? '已超支' : '剩余 ¥' + remaining.toFixed(1)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: center; font-size: var(--font-size-xs); opacity: 0.8;">
                                <span>${periodLabel ? periodLabel + ' · ' : ''}已用 ¥${budget.spent.toFixed(1)} / ¥${effectiveAmount.toFixed(1)}</span>
                                ${budget.rollover && budget.rollover_amount > 0 ? `<span>结转 ¥${budget.rollover_amount.toFixed(1)}</span>` : ''}
                            </div>
                            <div style="height: 4px; background: rgba(255,255,255,0.3); border-radius: 2px; margin-top: var(--space-xs);">
                                <div style="height: 100%; width: ${percent}%; background: ${textColor(budget.color)}; border-radius: 2px;"></div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
        
        container.innerHTML = html;
        bindBudgetEvents();
    }

    async function showBudgetExpenses(budget) {
        const state = getState();
        const elements = getElements();
        const { showToast, apiCall } = getUtils();

        const budgetData = await apiCall(`budgets/${budget.id}`);
        if (budgetData) {
            budget = { ...budget, ...budgetData };
        }
        
        const expenses = await apiCall(`budgets/${budget.id}/expenses`) || [];
        
        const container = elements.notepadContainer;
        const effectiveAmount = budget.effective_amount || budget.amount;
        const percent = effectiveAmount > 0 ? Math.min((budget.spent / effectiveAmount) * 100, 100) : 0;
        
        const periodLabel = formatBudgetPeriodLabel(budget);
        
        const textColor = getTextColorForBackground(budget.color);
        let html = `
            <div class="budget-detail-header" style="background: ${budget.color}; color: ${textColor}; padding: var(--space-md); border-radius: var(--radius-lg); margin-bottom: var(--space-md);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-sm);">
                    <span style="font-size: var(--font-size-md); font-weight: 500;">${escapeHtml(budget.name)}</span>
                    <div style="display: flex; gap: var(--space-xs);">
                        <button class="budget-detail-edit" style="background: rgba(255,255,255,0.2); border: none; color: ${textColor}; padding: 4px 10px; border-radius: var(--radius-md); cursor: pointer;">✏️</button>
                        <button class="budget-detail-back" style="background: rgba(255,255,255,0.2); border: none; color: ${textColor}; padding: 4px 10px; border-radius: var(--radius-md); cursor: pointer;">← 返回</button>
                    </div>
                </div>
                <div style="font-size: 24px; font-weight: bold; margin-bottom: var(--space-xs);">
                    ¥${(effectiveAmount - budget.spent).toFixed(1)} <span style="font-size: var(--font-size-xs); opacity: 0.8;">剩余</span>
                </div>
                <div style="height: 4px; background: rgba(255,255,255,0.3); border-radius: 2px; overflow: hidden;">
                    <div style="height: 100%; width: ${percent}%; background: ${textColor}; border-radius: 2px;"></div>
                </div>
                <div style="font-size: var(--font-size-xs); opacity: 0.8; margin-top: var(--space-xs);">
                    已用 ¥${budget.spent.toFixed(1)} / ¥${effectiveAmount.toFixed(1)}
                    ${budget.rollover && budget.rollover_amount > 0 ? ` (含结转 ¥${budget.rollover_amount.toFixed(1)})` : ''}
                </div>
                ${periodLabel ? `<div style="font-size: var(--font-size-xs); opacity: 0.8; margin-top: 4px;">${periodLabel}${budget.auto_reset ? ' · 自动重置' : ''}${budget.rollover ? ' · 结转' : ''}</div>` : ''}
            </div>
            
            <button class="btn btn-primary" id="addExpenseToBudgetBtn" style="width: 100%; margin-bottom: var(--space-md);">
                + 添加支出
            </button>
            
            <div class="expense-list" id="budgetExpenseList">
        `;
        
        if (expenses.length === 0) {
            html += `
                <div class="empty-state" style="padding: var(--space-xl); text-align: center;">
                    <div class="empty-text" style="margin-bottom: var(--space-xs);">暂无支出记录</div>
                    <div class="empty-hint">点击上方按钮添加</div>
                </div>
            `;
        } else {
            const grouped = {};
            expenses.forEach(exp => {
                const dateKey = exp.created_at ? exp.created_at.split('T')[0] : 'unknown';
                if (!grouped[dateKey]) grouped[dateKey] = [];
                grouped[dateKey].push(exp);
            });
            
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
                
                html += `
                    <div class="expense-day-group">
                        <div class="expense-day-header">${dateLabel}</div>
                        ${dayExpenses.map(exp => {
                            const cat = state.expenseCategories.find(c => c.id === exp.category) || { name: '其他', color: '#6B7280' };
                            return `
                                <div class="expense-item expense-item-clickable" style="cursor: pointer;" data-expense-id="${exp.id}">
                                    <div class="expense-item-left">
                                        <span class="expense-item-cat" style="background: ${cat.color}20; color: ${cat.color}">${cat.name}</span>
                                        <span class="expense-item-note">${escapeHtml(exp.note || '')}</span>
                                    </div>
                                    <div class="expense-item-right">
                                        <span class="expense-item-amount">¥${exp.amount.toFixed(1)}</span>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
            });
        }
        
        html += '</div>';
        container.innerHTML = html;
        
        container.querySelector('.budget-detail-back').addEventListener('click', () => {
            rerenderExpenseList();
        });
        
        container.querySelector('.budget-detail-edit')?.addEventListener('click', () => {
            openBudgetModal(budget);
        });
        
        container.querySelector('#addExpenseToBudgetBtn')?.addEventListener('click', () => {
            selectedExpenseBudgetId = budget.id;
            openExpenseModalForBudget(budget);
        });
        
        container.querySelectorAll('.expense-item-clickable').forEach(item => {
            item.addEventListener('click', () => {
                const expenseId = parseInt(item.dataset.expenseId);
                const exp = expenses.find(x => x.id === expenseId);
                if (exp) {
                    openExpenseModal(exp);
                }
            });
        });
    }
    
    function openExpenseModalForBudget(budget) {
        const fakeExpense = { 
            budget_id: budget.id,
            category: 'other'
        };
        openExpenseModal(fakeExpense);
    }

    function openBudgetModal(budget = null) {
        const elements = getElements();
        if (!elements.budgetModal) return;
        
        elements.budgetModalTitle.textContent = budget ? '编辑预算' : '添加预算';
        elements.budgetId.value = budget ? budget.id : '';
        elements.budgetName.value = budget ? budget.name : '';
        elements.budgetAmount.value = budget ? budget.amount : '';
        elements.budgetColor.value = budget ? budget.color : '#3B82F6';
        
        selectedBudgetPeriod = budget ? (budget.period || 'none') : 'none';
        updatePeriodButtons();
        updateMonthlyStartDayVisibility();
        if (elements.budgetMonthlyStartDay) {
            elements.budgetMonthlyStartDay.value = String(getBudgetMonthlyStartDay(budget));
        }
        
        elements.budgetAutoReset.checked = budget ? (budget.auto_reset || false) : false;
        elements.budgetRollover.checked = budget ? (budget.rollover || false) : false;
        elements.budgetRolloverLimit.value = budget && budget.rollover_limit ? budget.rollover_limit : '';
        
        elements.budgetRolloverLimitGroup.style.display = elements.budgetRollover.checked ? 'block' : 'none';
        
        elements.budgetModal.classList.remove('hidden');
    }

    function updatePeriodButtons() {
        const elements = getElements();
        if (!elements.budgetPeriodGroup) return;
        elements.budgetPeriodGroup.querySelectorAll('.period-btn').forEach(btn => {
            btn.classList.toggle('btn-primary', btn.dataset.period === selectedBudgetPeriod);
            btn.classList.toggle('btn-secondary', btn.dataset.period !== selectedBudgetPeriod);
        });
        updateMonthlyStartDayVisibility();
    }

    function setSelectedBudgetPeriod(period) {
        selectedBudgetPeriod = period || 'none';
        updateMonthlyStartDayVisibility();
    }

    function closeBudgetModal() {
        const elements = getElements();
        if (!elements.budgetModal) return;
        elements.budgetModal.classList.add('hidden');
    }

    async function handleBudgetSave() {
        const elements = getElements();
        const { showToast, updateBudget, createBudget } = getUtils();

        const id = elements.budgetId.value;
        const name = elements.budgetName.value.trim();
        const amount = parseFloat(elements.budgetAmount.value);
        const color = elements.budgetColor.value;
        const period = selectedBudgetPeriod;
        const auto_reset = elements.budgetAutoReset.checked;
        const rollover = elements.budgetRollover.checked;
        const rollover_limit = elements.budgetRolloverLimit.value ? parseInt(elements.budgetRolloverLimit.value) : null;
        const monthly_start_day = period === 'monthly' ? normalizeMonthlyStartDay(elements.budgetMonthlyStartDay?.value) : null;
        
        if (!name) {
            showToast('请输入预算名称');
            return;
        }
        if (isNaN(amount) || amount <= 0) {
            showToast('请输入有效的金额');
            return;
        }
        
        if (period === 'monthly' && !monthly_start_day) {
            showToast('请输入有效的每月开始日（1-31）');
            return;
        }

        const budgetData = {
            name,
            amount,
            color,
            period,
            auto_reset,
            rollover,
            rollover_limit,
            monthly_start_day,
        };
        if (period === 'monthly' && monthly_start_day) {
            budgetData.period_start = buildMonthlyPeriodStartIso(monthly_start_day);
        }
        
        if (id) {
            await updateBudget(parseInt(id), budgetData);
            showToast('预算已更新');
        } else {
            await createBudget(budgetData);
            showToast('预算已创建');
        }
        
        closeBudgetModal();
        await rerenderExpenseList();
    }

    function openExpenseModal(expense = null) {
        const elements = getElements();
        if (!elements.expenseModal) return;
        
        editingExpenseId = expense ? expense.id : null;
        elements.expenseId.value = editingExpenseId || '';
        elements.expenseAmount.value = expense ? expense.amount : '';
        elements.expenseNote.value = expense ? (expense.note || '') : '';
        selectedExpenseCategory = expense ? expense.category : 'food';
        
        elements.expenseIsTest.checked = expense ? (expense.is_test || false) : false;
        
        if (expense && expense.budget_id) {
            selectedExpenseBudgetId = expense.budget_id;
        } else if (lastUsedBudgetId) {
            selectedExpenseBudgetId = lastUsedBudgetId;
        } else {
            selectedExpenseBudgetId = null;
        }
        
        renderExpenseCategorySelector();
        renderExpenseBudgetSelector();
        
        elements.expenseModalTitle.textContent = expense ? '编辑支出' : '记一笔';        
        
        elements.expenseModal.classList.remove('hidden');
        if (!expense) {
            elements.expenseAmount?.focus();
        }
    }
    
    function renderExpenseBudgetSelector() {
        const state = getState();
        const elements = getElements();
        if (!elements.expenseBudgetSelector) return;
        
        let html = `<button class="expense-budget-btn ${selectedExpenseBudgetId === null ? 'selected' : ''}" data-budget-id="">不使用预算</button>`;
        state.budgets.forEach(budget => {
            const remaining = budget.amount - budget.spent;
            html += `<button class="expense-budget-btn ${selectedExpenseBudgetId === budget.id ? 'selected' : ''}" data-budget-id="${budget.id}" style="border-color: ${selectedExpenseBudgetId === budget.id ? budget.color : 'var(--border-color)'}; color: ${selectedExpenseBudgetId === budget.id ? budget.color : 'var(--text-secondary)'}">${escapeHtml(budget.name)} ¥${remaining.toFixed(1)}</button>`;
        });
        elements.expenseBudgetSelector.innerHTML = html;
        
        elements.expenseBudgetSelector.querySelectorAll('.expense-budget-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const budgetId = btn.dataset.budgetId;
                selectedExpenseBudgetId = budgetId ? parseInt(budgetId) : null;
                renderExpenseBudgetSelector();
            });
        });
    }

    function closeExpenseModal() {
        const elements = getElements();
        if (!elements.expenseModal) return;
        elements.expenseModal.classList.add('hidden');
    }

    function renderExpenseCategorySelector() {
        const state = getState();
        const elements = getElements();
        if (!elements.expenseCategorySelector) return;
        
        elements.expenseCategorySelector.innerHTML = state.expenseCategories.map(cat => `
            <button class="expense-category-btn ${cat.id === selectedExpenseCategory ? 'selected' : ''}" 
                    data-category="${cat.id}" 
                    style="border-color: ${cat.id === selectedExpenseCategory ? cat.color : 'var(--border-color)'}; color: ${cat.id === selectedExpenseCategory ? cat.color : 'var(--text-secondary)'}">
                ${cat.name}
            </button>
        `).join('');
        
        elements.expenseCategorySelector.querySelectorAll('.expense-category-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                selectedExpenseCategory = btn.dataset.category;
                renderExpenseCategorySelector();
            });
        });
    }

    async function handleExpenseSave() {
        if (isExpenseSaving) return;
        isExpenseSaving = true;

        const elements = getElements();
        const { showToast, updateExpense, createExpense } = getUtils();

        const expenseId = elements.expenseId?.value ? parseInt(elements.expenseId.value) : null;
        const amount = parseFloat(elements.expenseAmount.value);
        const note = elements.expenseNote.value.trim();
        const budgetId = selectedExpenseBudgetId;
        const isTest = elements.expenseIsTest.checked;

        if (isNaN(amount) || amount <= 0) {
            showToast('请输入有效的金额');
            isExpenseSaving = false;
            return;
        }

        if (expenseId) {
            await updateExpense(expenseId, {
                amount,
                category: selectedExpenseCategory,
                note: note || '记账',
                budget_id: budgetId || null
            });
            showToast('支出已更新');
        } else {
            await createExpense({
                amount,
                category: selectedExpenseCategory,
                note: note || '记账',
                budget_id: budgetId,
                is_test: isTest
            });
            showToast('已记录 ¥' + amount.toFixed(1) + (isTest ? ' [测试]' : ''));
            if (budgetId) {
                lastUsedBudgetId = budgetId;
            }
        }

        closeExpenseModal();
        await rerenderExpenseList();
        isExpenseSaving = false;
    }

    window.ScheduleAppBudget = {
        bindBudgetEvents,
        showAllBudgetsList,
        showBudgetExpenses,
        openExpenseModalForBudget,
        openBudgetModal,
        updatePeriodButtons,
        setSelectedBudgetPeriod,
        closeBudgetModal,
        handleBudgetSave,
        openExpenseModal,
        renderExpenseBudgetSelector,
        closeExpenseModal,
        renderExpenseCategorySelector,
        handleExpenseSave,
    };

})();
