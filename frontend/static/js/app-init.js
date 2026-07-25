(function () {
    'use strict';

    const core = () => window.ScheduleAppCore || {};
    const st  = () => core().state || {};
    const el  = () => core().elements || {};

    function bindEvents() {
        if (st()._eventsBound) {
            return;
        }
        st()._eventsBound = true;

        // Refresh button
        el().refreshBtn.addEventListener('click', () => {
            el().refreshBtn.classList.add('rotating');
            core().loadData().then(() => {
                el().refreshBtn.classList.remove('rotating');
            });
        });

        // Prev/Next navigation buttons
        el().prevBtn.addEventListener('click', () => window.ScheduleAppViewRouter?.navigateDate?.(-1));
        el().nextBtn.addEventListener('click', () => window.ScheduleAppViewRouter?.navigateDate?.(1));

        // LLM input
        el().llmBtn.addEventListener('click', () => window.ScheduleAppLlmQueue?.handleLlmSubmit?.());
        el().llmInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                window.ScheduleAppLlmQueue?.handleLlmSubmit?.();
            }
        });
        if (el().llmQueueCancelBtn) {
            el().llmQueueCancelBtn.addEventListener('click', () => window.ScheduleAppLlmQueue?.cancelLlmGeneration?.(true));
        }

        // Failed banner buttons
        if (el().llmInputFailed) {
            el().llmInputFailed.querySelector('.llm-input-failed-retry')?.addEventListener('click', () => {
                // Put text back into input and retry
                const text = localStorage.getItem('llm_failed_text') || '';
                if (text && el().llmInput) {
                    el().llmInput.value = text;
                    window.ScheduleAppLlmQueue?.hideLlmFailedBanner?.();
                    el().llmInput.focus();
                    window.ScheduleAppLlmQueue?.handleLlmSubmit?.();
                }
            });
            el().llmInputFailed.querySelector('.llm-input-failed-cancel')?.addEventListener('click', () => {
                window.ScheduleAppLlmQueue?.hideLlmFailedBanner?.();
            });
        }

        // 复制按钮：将当前处理的文本复制到剪贴板
        if (el().llmQueueCopyBtn) {
            el().llmQueueCopyBtn.addEventListener('click', async () => {
                const textToCopy = st().llmActiveRequest?.text || st().llmLastSubmittedText || '';
                if (!textToCopy) {
                    core().showToast('没有可复制的内容');
                    return;
                }
                try {
                    await navigator.clipboard.writeText(textToCopy);
                    core().showToast('已复制到剪贴板');
                } catch (err) {
                    // 降级方案：使用传统方法
                    const textarea = document.createElement('textarea');
                    textarea.value = textToCopy;
                    textarea.style.position = 'fixed';
                    textarea.style.opacity = '0';
                    document.body.appendChild(textarea);
                    textarea.select();
                    try {
                        document.execCommand('copy');
                        core().showToast('已复制到剪贴板');
                    } catch (e) {
                        core().showToast('复制失败，请手动选择文本');
                    }
                    document.body.removeChild(textarea);
                }
            });
        }

        // Breakdown modal events (delegated to goals.js)
        const goals = window.ScheduleAppGoals;
        el().breakdownBackdrop.addEventListener('click', () => goals?.closeBreakdownModal?.());
        el().breakdownClose.addEventListener('click', () => goals?.closeBreakdownModal?.());
        el().breakdownAnalyzeBtn.addEventListener('click', () => goals?.analyzeBreakdown?.());
        el().breakdownSaveBtn.addEventListener('click', () => goals?.saveBreakdowns?.());
        el().breakdownImportBtn.addEventListener('click', () => goals?.importBreakdowns?.());
        el().breakdownLoadBtn.addEventListener('click', () => goals?.loadSavedBreakdowns?.());
        el().breakdownAddBtn.addEventListener('click', () => goals?.addBreakdownItem?.());

        // Saved breakdowns modal events
        el().savedBreakdownsBackdrop.addEventListener('click', () => goals?.closeSavedBreakdownsModal?.());
        el().savedBreakdownsClose.addEventListener('click', () => goals?.closeSavedBreakdownsModal?.());

        // Goal discuss modal events (delegated to goals.js)
        el().goalDiscussBackdrop.addEventListener('click', () => goals?.closeGoalDiscussModal?.());
        el().goalDiscussClose.addEventListener('click', () => goals?.closeGoalDiscussModal?.());
        el().goalDiscussStartBtn.addEventListener('click', () => goals?.startGoalDiscuss?.());
        el().goalDiscussInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                goals?.startGoalDiscuss?.();
            }
        });
        el().goalDiscussCancelBtn.addEventListener('click', () => goals?.closeGoalDiscussModal?.());
        el().goalDiscussSaveBtn.addEventListener('click', () => goals?.saveGoalDiscuss?.());

        // Settings view events
        el().settingsBtn.addEventListener('click', () => {
            window.location.hash = '';
            window.location.hash = '/settings';
        });
        el().settingsBackBtn?.addEventListener('click', () => {
            window.location.hash = '';
        });
        const settings = window.ScheduleAppSettings;
        el().enableDragResize.addEventListener('change', (e) => settings?.handleDragResizeToggle?.(e));
        el().enableQQReminder.addEventListener('change', (e) => settings?.handleQQReminderToggle?.(e));
        el().defaultTaskReminderEnabled.addEventListener('change', (e) => settings?.handleDefaultTaskReminderToggle?.(e));
        el().autoAssignBudgetFromLlm.addEventListener('change', (e) => settings?.handleAutoAssignBudgetToggle?.(e));
        document.getElementById('cleanupTestEntriesBtn')?.addEventListener('click', () => settings?.handleCleanupTestEntries?.());
        document.getElementById('testQQChannelBtn')?.addEventListener('click', () => settings?.handleTestQQChannel?.());
        document.getElementById('viewErrorLogsBtn')?.addEventListener('click', () => settings?.handleViewErrorLogs?.());
        document.getElementById('semanticHelpBtn')?.addEventListener('click', () => settings?.showSemanticHelpModal?.());
        el().openUserContextBtn?.addEventListener('click', () => {
            settings?.openUserContextModal?.();
        });

        // Event History in Settings
        document.getElementById('openEventHistoryBtn')?.addEventListener('click', () => {
            settings?.loadEventHistoryAll?.();
        });

        // Deleted Events in Settings
        document.getElementById('openDeletedEventsBtn')?.addEventListener('click', () => {
            settings?.loadDeletedEvents?.();
        });

        // Event Modifications in Settings
        document.getElementById('openModificationsBtn')?.addEventListener('click', () => {
            settings?.loadEventModifications?.();
        });

        // Expense Operation Logs in Settings
        document.getElementById('openExpenseHistoryBtn')?.addEventListener('click', () => {
            settings?.loadExpenseOperationLogs?.();
        });

        // Deleted Expenses in Settings
        document.getElementById('openDeletedExpensesBtn')?.addEventListener('click', () => {
            settings?.loadDeletedExpenses?.();
        });

        // Settings modal backdrop tap-to-close
        el().settingsBackdrop?.addEventListener('click', () => settings?.closeSettingsModal?.());
        el().settingsClose?.addEventListener('click', () => settings?.closeSettingsModal?.());

        // AI Provider modal events
        el().addAiProviderBtn?.addEventListener('click', () => settings?.openAiProviderModal?.());
        el().aiProviderBackdrop?.addEventListener('click', () => settings?.closeAiProviderModal?.());
        el().aiProviderClose?.addEventListener('click', () => settings?.closeAiProviderModal?.());
        el().aiProviderCancelBtn?.addEventListener('click', () => settings?.closeAiProviderModal?.());
        el().aiProviderSaveBtn?.addEventListener('click', () => settings?.saveAiProvider?.());
        document.getElementById('aiProviderTestBtn')?.addEventListener('click', () => settings?.testAiProvider?.());

        // User Context modal events
        el().userContextAddBtn?.addEventListener('click', () => settings?.openUserContextModal?.());
        el().userContextBackdrop?.addEventListener('click', () => settings?.closeUserContextModal?.());
        el().userContextClose?.addEventListener('click', () => settings?.closeUserContextModal?.());
        el().userContextCancelBtn?.addEventListener('click', () => settings?.closeUserContextModal?.());
        el().userContextSaveBtn?.addEventListener('click', () => settings?.saveUserContext?.());
        el().userContextDeleteBtn?.addEventListener('click', () => settings?.deleteUserContext?.());

        // Budget modal events
        el().budgetBackdrop?.addEventListener('click', () => window.ScheduleAppBudget?.closeBudgetModal?.());
        el().budgetClose?.addEventListener('click', () => window.ScheduleAppBudget?.closeBudgetModal?.());
        el().budgetCancelBtn?.addEventListener('click', () => window.ScheduleAppBudget?.closeBudgetModal?.());
        el().budgetSaveBtn?.addEventListener('click', () => window.ScheduleAppBudget?.handleBudgetSave?.());

        // Budget period buttons
        el().budgetPeriodGroup?.querySelectorAll('.period-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                window.ScheduleAppBudget?.setSelectedBudgetPeriod?.(btn.dataset.period);
                window.ScheduleAppBudget?.updatePeriodButtons?.();
            });
        });

        // Budget rollover checkbox toggle
        el().budgetRollover?.addEventListener('change', () => {
            el().budgetRolloverLimitGroup.style.display = el().budgetRollover.checked ? 'block' : 'none';
        });

        // Expense modal events
        el().expenseBackdrop?.addEventListener('click', () => window.ScheduleAppBudget?.closeExpenseModal?.());
        el().expenseClose?.addEventListener('click', () => window.ScheduleAppBudget?.closeExpenseModal?.());
        el().expenseCancelBtn?.addEventListener('click', () => window.ScheduleAppBudget?.closeExpenseModal?.());
        el().expenseSaveBtn?.addEventListener('click', () => window.ScheduleAppBudget?.handleExpenseSave?.());

        // Tab bar
        el().tabDay.addEventListener('click', () => {
            window.location.hash = '';
            window.ScheduleAppViewRouter?.switchView?.('day');
        });
        el().tabTodo.addEventListener('click', () => {
            window.location.hash = '';
            window.ScheduleAppViewRouter?.switchView?.('todo');
        });
        el().tabGoals.addEventListener('click', () => {
            window.location.hash = '';
            window.ScheduleAppViewRouter?.switchView?.('goals');
        });
        el().tabNotepad.addEventListener('click', () => {
            window.location.hash = '';
            window.ScheduleAppViewRouter?.switchView?.('notepad');
        });

        // Calendar segmented control (in day view)
        document.getElementById('calendarSegmented')?.addEventListener('click', async (e) => {
            const seg = e.target.closest('.cal-segment');
            if (!seg) return;
            st().calendarSubview = seg.dataset.subview;
            // Update active states
            document.querySelectorAll('.cal-segment').forEach(s => {
                s.classList.toggle('active', s.dataset.subview === st().calendarSubview);
            });
            // Show/hide prev/next nav buttons for week/month
            const showNavArrows = st().calendarSubview === 'week' || st().calendarSubview === 'month';
            if (el().prevBtn) {
                el().prevBtn.classList.toggle('hidden', !showNavArrows);
            }
            if (el().nextBtn) {
                el().nextBtn.classList.toggle('hidden', !showNavArrows);
            }
            // Re-render based on subview
            if (st().calendarSubview === 'day') {
                el().dayView.classList.remove('hidden');
                el().daySlider.classList.remove('hidden');
                el().weekView.classList.add('hidden');
                el().monthView.classList.add('hidden');
                window.ScheduleAppCalendarViews?.renderTimeline?.();
            } else if (st().calendarSubview === 'week') {
                el().dayView.classList.add('hidden');
                el().daySlider.classList.add('hidden');
                el().weekView.classList.remove('hidden');
                el().monthView.classList.add('hidden');
                window.ScheduleAppCalendarViews?.renderWeekView?.();
            } else if (st().calendarSubview === 'month') {
                el().dayView.classList.add('hidden');
                el().daySlider.classList.add('hidden');
                el().weekView.classList.add('hidden');
                el().monthView.classList.remove('hidden');
                // Keep month alignment: state.currentMonth = first day
                st().currentMonth = new Date(st().currentDate.getFullYear(), st().currentDate.getMonth(), 1);
                window.ScheduleAppCalendarViews?.renderMonthView?.();
            }
            await core().loadData();
        });

        // Todo segmented control
        document.getElementById('todoSegmented')?.addEventListener('click', async (e) => {
            const seg = e.target.closest('.cal-segment');
            if (!seg) return;
            st().todoSubview = seg.dataset.subview;
            // Update active states
            document.querySelectorAll('#todoSegmented .cal-segment').forEach(s => {
                s.classList.toggle('active', s.dataset.subview === st().todoSubview);
            });
            // Re-render todo view with new filter
            await window.ScheduleAppTodoView?.renderTodoView?.();
        });

        // Todo view mode switcher (list / quadrant)
        document.getElementById('todoViewMode')?.addEventListener('click', async (e) => {
            const btn = e.target.closest('.todo-view-mode-btn');
            if (!btn) return;
            st().todoViewMode = btn.dataset.mode;
            document.querySelectorAll('#todoViewMode .todo-view-mode-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.mode === st().todoViewMode);
            });
            await window.ScheduleAppTodoView?.renderTodoView?.();
        });

        // Floating add button (content area, visible in day/todo)
        el().contentAddBtn.addEventListener('click', async () => {
            if (st().currentView === 'notepad') {
                if (st().notepadSubview === 'expense') {
                    window.ScheduleAppBudget?.openExpenseModal?.();
                    return;
                }
                await window.ScheduleAppCore?.showQuickNoteCreateModal?.();
                return;
            }
            window.ScheduleAppEventModal?.openEventModal?.();
        });

        // Event modal
        el().modalBackdrop.addEventListener('click', () => window.ScheduleAppEventModal?.closeEventModal?.());
        el().modalClose.addEventListener('click', () => window.ScheduleAppEventModal?.closeEventModal?.());
        el().cancelEventBtn.addEventListener('click', () => window.ScheduleAppEventModal?.closeEventModal?.());
        el().saveEventBtn.addEventListener('click', () => window.ScheduleAppEventModal?.saveEvent?.());
        el().pendingTimeCheck.addEventListener('change', () => window.ScheduleAppEventModal?.syncPendingTimeState?.());
        if (el().recurrenceSelect) {
            el().recurrenceSelect.addEventListener('change', (e) => window.ScheduleAppRecurrenceUI?.applyRecurrenceUI?.(e.target.value));
        }

        // Detail modal
        el().detailBackdrop.addEventListener('click', () => window.ScheduleAppEventModal?.closeDetailModal?.());
        el().detailClose.addEventListener('click', () => window.ScheduleAppEventModal?.closeDetailModal?.());
        el().deleteEventBtn.addEventListener('click', () => window.ScheduleAppEventModal?.deleteSelectedEvent?.());
        el().saveDetailBtn.addEventListener('click', () => window.ScheduleAppEventModal?.saveDetailChanges?.());

        // Touch gestures - these reference local functions in main.js
        el().mainContent.addEventListener('touchstart', core().handleTouchStart, { passive: true });
        el().mainContent.addEventListener('touchmove', core().handleTouchMove, { passive: false });
        el().mainContent.addEventListener('touchend', core().handleTouchEnd, { passive: true });

        // Pull-to-refresh (attached to document for better detection)
        document.addEventListener('touchstart', core().handlePullTouchStart, { passive: true });
        document.addEventListener('touchmove', core().handlePullTouchMove, { passive: true });
        document.addEventListener('touchend', core().handlePullTouchEnd, { passive: true });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                window.ScheduleAppEventModal?.closeEventModal?.();
                window.ScheduleAppEventModal?.closeDetailModal?.();
            }
        });

        // Natural language parsing for title input
        el().eventTitle.addEventListener('input', window.ScheduleAppUtils?.debounce?.(async (e) => {
            const text = e.target.value.trim();
            if (text.length > 3 && !el().startTime.value) {
                // Try to parse time from natural language
                try {
                    const result = await core().apiCall('events', {
                        method: 'POST',
                        body: JSON.stringify({ title: text, _parse: true })
                    });
                    if (result && result.parsed) {
                        if (result.parsed.start_time) {
                            el().startTime.value = core().toLocalDatetime(result.parsed.start_time);
                        }
                        if (result.parsed.end_time) {
                            el().endTime.value = core().toLocalDatetime(result.parsed.end_time);
                        }
                        if (result.parsed.category_id) {
                            st().selectedCategory = result.parsed.category_id;
                            window._renderCategorySelector?.();
                        }
                    }
                } catch (err) {
                    // Silent fail for time parsing
                }
            }
        }, 500));
    }

    window.ScheduleAppInit = {
        bindEvents,
    };
})();
