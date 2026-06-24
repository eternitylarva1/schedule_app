/**
 * Schedule App - LLM Queue Module
 * Extracted from main.js (lines 3851-4198) for better separation of concerns.
 * Handles LLM input submission, queue processing, status UI, and failure recovery.
 *
 * Public API:
 *   window.ScheduleAppLlmQueue = { handleLlmSubmit, cancelLlmGeneration, ... }
 */
(function() {
    'use strict';

    const getState = () => (window.ScheduleAppCore && window.ScheduleAppCore.state) || {};
    const getElements = () => (window.ScheduleAppCore && window.ScheduleAppCore.elements) || {};
    const getUtils = () => window.ScheduleAppCore || {};

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ----------------------------------------------------------------
    // Queue Indicator
    // ----------------------------------------------------------------

    function updateLlmQueueIndicator() {
        const state = getState();
        const elements = getElements();
        const waitingCount = state.llmQueue.length;
        const isRunning = state.llmQueueRunning;

        elements.llmBtn.classList.toggle('processing', isRunning);
        elements.llmBtn.disabled = false;

        if (waitingCount > 0) {
            elements.llmBtn.classList.add('has-queue');
            elements.llmBtn.setAttribute('data-queue-count', String(waitingCount));
        } else {
            elements.llmBtn.classList.remove('has-queue');
            elements.llmBtn.removeAttribute('data-queue-count');
        }
    }

    function updateLlmQueueStatusBar() {
        const state = getState();
        const elements = getElements();
        if (!elements.llmQueueStatus || !elements.llmQueueText || !elements.llmQueueMeta || !elements.llmQueueProgressBar) {
            return;
        }

        const hasActive = !!state.llmActiveRequest;
        const waiting = state.llmQueue.length;
        const inFlight = hasActive || waiting > 0;

        clearTimeout(state.llmStatusHideTimer);
        state.llmStatusHideTimer = null;

        if (!inFlight && !state.llmLastStatusText) {
            elements.llmQueueStatus.classList.add('hidden');
            return;
        }

        elements.llmQueueStatus.classList.remove('hidden');

        if (elements.llmQueueDetail) {
            let detailHtml = '';

            if (hasActive && state.llmActiveRequest) {
                detailHtml += `<div class="llm-queue-item llm-queue-item-active">
                    <span class="llm-queue-item-label">处理中</span>
                    <span class="llm-queue-item-text">${escapeHtml(state.llmActiveRequest.text)}</span>
                </div>`;
            }

            if (waiting > 0) {
                state.llmQueue.forEach((item, idx) => {
                    detailHtml += `<div class="llm-queue-item">
                        <span class="llm-queue-item-label">排队${idx + 1}</span>
                        <span class="llm-queue-item-text">${escapeHtml(item.text)}</span>
                    </div>`;
                });
            }

            elements.llmQueueDetail.innerHTML = detailHtml;
        }

        if (hasActive) {
            const current = state.llmCycleDone + 1;
            const total = Math.max(state.llmCycleTotal, current);
            elements.llmQueueText.textContent = `AI处理中 ${current}/${total}`;
            elements.llmQueueMeta.textContent = waiting > 0 ? `排队 ${waiting} 项` : '进行中';

            const progress = Math.max(4, Math.min(96, ((state.llmCycleDone + 0.5) / Math.max(1, total)) * 100));
            elements.llmQueueProgressBar.style.width = `${progress}%`;
            if (elements.llmQueueCancelBtn) elements.llmQueueCancelBtn.classList.remove('hidden');
            return;
        }

        elements.llmQueueText.textContent = state.llmLastStatusText;
        elements.llmQueueMeta.textContent = '完成';
        elements.llmQueueProgressBar.style.width = '100%';
        if (elements.llmQueueCancelBtn) elements.llmQueueCancelBtn.classList.add('hidden');

        state.llmStatusHideTimer = setTimeout(() => {
            state.llmLastStatusText = '';
            elements.llmQueueStatus.classList.add('hidden');
            elements.llmQueueProgressBar.style.width = '0%';
        }, 3500);
    }

    // ----------------------------------------------------------------
    // Cancel / Queue Management
    // ----------------------------------------------------------------

    function cancelLlmGeneration(clearQueued = true) {
        const state = getState();
        state.llmCancelRequested = true;
        if (clearQueued) {
            state.llmQueue = [];
        }
        if (state.llmAbortController) {
            try {
                state.llmAbortController.abort();
            } catch (_) {
                // no-op
            }
        }
        state.llmLastStatusText = clearQueued ? '已取消当前生成并清空排队' : '已取消当前生成';
        updateLlmQueueIndicator();
        updateLlmQueueStatusBar();
        const { showToast } = getUtils();
        showToast('已取消AI生成');
    }

    function enqueueLlmRequest(text) {
        const state = getState();
        const { showToast } = getUtils();
        const normalizedText = String(text || '').trim();
        if (!normalizedText) return;

        const isNewCycle = !state.llmQueueRunning && !state.llmActiveRequest && state.llmQueue.length === 0;
        if (isNewCycle) {
            state.llmCycleTotal = 0;
            state.llmCycleDone = 0;
            state.llmCycleSucceeded = 0;
            state.llmCycleFailed = 0;
            state.llmLastStatusText = '';
            state.llmCancelRequested = false;
        }

        state.llmQueue.push({
            id: `llm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            text: normalizedText
        });
        state.llmCycleTotal += 1;

        updateLlmQueueIndicator();
        updateLlmQueueStatusBar();

        const waiting = state.llmQueue.length;
        if (state.llmQueueRunning) {
            showToast(`已加入队列（前方${Math.max(0, waiting - 1)}条）`);
        }

        void processLlmQueue();
    }

    // ----------------------------------------------------------------
    // Single Request Processing
    // ----------------------------------------------------------------

    async function processSingleLlmRequest(request) {
        const state = getState();
        const elements = getElements();
        const { executeUnifiedLlmCommand, showToast, showToastWithUndo, apiCall, loadData } = getUtils();
        const text = request.text;
        state.llmAbortController = new AbortController();

        // Dry run preview first
        const preview = await executeUnifiedLlmCommand(text, true, state.llmAbortController.signal);
        if (state.llmCancelRequested) {
            return false;
        }
        if (!preview) {
            throw new Error('AI解析失败');
        }

        const operations = Array.isArray(preview.operations) ? preview.operations : [];
        if (operations.length === 0) {
            throw new Error('未解析到可执行操作');
        }

        // Only proceed to execution if we have operations
        const result = await executeUnifiedLlmCommand(text, false, state.llmAbortController.signal);
        if (state.llmCancelRequested) {
            return false;
        }
        if (!result) {
            throw new Error('执行失败');
        }

        const stats = result.stats || {};
        const created = Number(stats.events_created || 0);
        const updated = Number(stats.events_updated || 0);
        const moved = Number(stats.events_moved || 0);
        const deleted = Number(stats.events_deleted || 0);
        const completed = Number(stats.events_completed || 0);
        const uncompleted = Number(stats.events_uncompleted || 0);

        // Check for event_postpone operation details from actual execution result
        const actualOperations = Array.isArray(result.operations) ? result.operations : [];
        const postponeOp = actualOperations.find(op => op.action === 'event_postpone');

        if (postponeOp && moved > 0) {
            const details = postponeOp.details || [];
            let timeStr = '';
            if (details.length > 0 && details[0].new_start) {
                const d = new Date(details[0].new_start);
                timeStr = `，从 ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')} 开始`;
            }
            let warning = '';
            if (details.length > 0 && details[0].new_start) {
                const lastNewStart = new Date(details[details.length - 1].new_start);
                if (lastNewStart.getHours() >= 22) warning = ' (部分时间排到深夜)';
            }
            // Store undo details
            const undoDetails = details.map(d => ({ id: d.id, old_start: d.old_start, old_end: d.old_end }));
            showToastWithUndo(`已推迟 ${moved} 个日程${timeStr}${warning}`, async () => {
                try {
                    const undoResult = await apiCall('events/postpone-undo', {
                        method: 'POST',
                        body: JSON.stringify({ details: undoDetails }),
                    });
                    if (undoResult && undoResult.restored > 0) {
                        showToast(`已恢复 ${undoResult.restored} 个日程的原时间`);
                        if (loadData) await loadData();
                    } else {
                        showToast('撤销失败，请手动调整');
                    }
                } catch (e) {
                    showToast('撤销失败: ' + (e.message || '网络错误'));
                }
            });
        } else if (postponeOp && moved === 0) {
            const msg = postponeOp.message || '没有需要推迟的日程';
            showToast(msg);
        } else if (deleted > 0 || completed > 0 || uncompleted > 0) {
            const parts = [];
            if (created > 0) parts.push(`创建${created}`);
            if (deleted > 0) parts.push(`删除${deleted}`);
            if (completed > 0) parts.push(`完成${completed}`);
            if (uncompleted > 0) parts.push(`撤销完成${uncompleted}`);
            showToast(`✅ 已执行：${parts.join(' / ')}`);
        } else {
            if (created > 1) showToast(`✅ ${created}个日程已创建`);
            else if (created === 1) showToast('✅ 日程已创建');
            else showToast('✅ 已执行');
        }

        // 成功后清空输入框
        if (elements.llmInput) {
            elements.llmInput.value = '';
        }
        // Clear any failed state
        hideLlmFailedBanner();

        if (loadData) await loadData();
        return true;
    }

    // ----------------------------------------------------------------
    // Failure Banner
    // ----------------------------------------------------------------

    function showLlmFailedBanner(text, errorMsg) {
        const elements = getElements();
        if (!elements.llmInputFailed || !elements.llmInputFailedText) return;
        elements.llmInputFailedText.textContent = `❌ ${errorMsg}: ${text.substring(0, 100)}`;
        elements.llmInputFailed.classList.remove('hidden');
        // Persist so it survives refresh
        try {
            localStorage.setItem('llm_failed_text', text);
            localStorage.setItem('llm_failed_error', errorMsg);
        } catch(e) {}
    }

    function hideLlmFailedBanner() {
        const elements = getElements();
        if (!elements.llmInputFailed) return;
        elements.llmInputFailed.classList.add('hidden');
        try {
            localStorage.removeItem('llm_failed_text');
            localStorage.removeItem('llm_failed_error');
        } catch(e) {}
    }

    function restoreLlmFailedToInput() {
        const elements = getElements();
        try {
            const text = localStorage.getItem('llm_failed_text') || '';
            if (text && elements.llmInput) {
                elements.llmInput.value = text;
            }
        } catch(e) {}
        hideLlmFailedBanner();
    }

    function restoreLlmFailedFromStorage() {
        const elements = getElements();
        try {
            const text = localStorage.getItem('llm_failed_text') || '';
            const errorMsg = localStorage.getItem('llm_failed_error') || '执行失败';
            if (text && elements.llmInputFailed && elements.llmInputFailedText) {
                elements.llmInputFailedText.textContent = `❌ ${errorMsg}: ${text.substring(0, 100)}`;
                elements.llmInputFailed.classList.remove('hidden');
            }
        } catch(e) {}
    }

    // ----------------------------------------------------------------
    // Queue Processor
    // ----------------------------------------------------------------

    async function processLlmQueue() {
        const state = getState();
        const { showToast } = getUtils();
        if (state.llmQueueRunning) return;

        state.llmQueueRunning = true;
        updateLlmQueueIndicator();
        updateLlmQueueStatusBar();

        while (state.llmQueue.length > 0) {
            if (state.llmCancelRequested) {
                break;
            }
            const request = state.llmQueue.shift();
            if (!request) continue;

            state.llmActiveRequest = request;
            updateLlmQueueIndicator();
            updateLlmQueueStatusBar();

            try {
                const success = await processSingleLlmRequest(request);
                if (success) {
                    state.llmCycleSucceeded += 1;
                } else {
                    state.llmCycleFailed += 1;
                }
            } catch (error) {
                if (state.llmCancelRequested) {
                    state.llmCycleFailed += 0;
                } else {
                    console.error('LLM Error:', error);
                    showToast(`❌ 执行失败: ${error.message || '未知错误'}`);
                    state.llmCycleFailed += 1;
                    if (request && request.text) {
                        showLlmFailedBanner(request.text, error.message || '执行失败');
                    }
                }
            } finally {
                state.llmCycleDone += 1;
                state.llmActiveRequest = null;
                state.llmAbortController = null;
                updateLlmQueueIndicator();
                updateLlmQueueStatusBar();
            }
        }

        state.llmQueueRunning = false;
        if (!state.llmLastStatusText) {
            state.llmLastStatusText = `本轮完成：成功${state.llmCycleSucceeded}，失败${state.llmCycleFailed}`;
        }
        updateLlmQueueIndicator();
        updateLlmQueueStatusBar();
        state.llmCancelRequested = false;
    }

    // ----------------------------------------------------------------
    // Submit Handler
    // ----------------------------------------------------------------

    async function handleLlmSubmit(e) {
        const state = getState();
        const elements = getElements();
        const { showToast } = getUtils();
        if (e && e.preventDefault) {
            e.preventDefault();
        }

        const text = elements.llmInput.value.trim();
        if (!text) {
            showToast('请输入日程内容');
            return;
        }

        // 保存提交的文本，便于用户复制和编辑
        state.llmLastSubmittedText = text;

        enqueueLlmRequest(text);
    }

    // ----------------------------------------------------------------
    // Init (called from main.js after loadData is available)
    // ----------------------------------------------------------------

    function init() {
        restoreLlmFailedFromStorage();
    }

    // ----------------------------------------------------------------
    // Public API
    // ----------------------------------------------------------------

    window.ScheduleAppLlmQueue = {
        init,
        handleLlmSubmit,
        cancelLlmGeneration,
        enqueueLlmRequest,
        updateLlmQueueIndicator,
        updateLlmQueueStatusBar,
        restoreLlmFailedToInput,
        restoreLlmFailedFromStorage,
        hideLlmFailedBanner,
    };

})();
