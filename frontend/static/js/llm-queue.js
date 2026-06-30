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

        // Single-pass: agent-command does query + act in one call
        const result = await executeUnifiedLlmCommand(text, false, state.llmAbortController.signal);
        if (state.llmCancelRequested) {
            return false;
        }
        if (!result) {
            throw new Error('AI解析失败');
        }

        const agentResults = Array.isArray(result.results) ? result.results : [];
        const doneMsg = result.done || '';
        let created = 0, moved = 0, completed = 0, deleted = 0;

        for (const r of agentResults) {
            const res = r.result;
            if (!res || !res.ok) continue;
            const tool = r.tool || '';
            if (tool === 'create_event') created++;
            else if (tool === 'move_event') moved++;
            else if (tool === 'complete_event') completed++;
            else if (tool === 'delete_event') deleted++;
            else if (tool === 'update_event') {
                const changes = res.changes || {};
                if (changes.start_time) moved++;
                if (changes.status === 'done') completed++;
            }
        }

        const total = created + moved + completed + deleted;
        if (total === 0) {
            showToast(doneMsg || '没有可执行的操作');
        } else {
            const parts = [];
            if (created > 0) parts.push(`创建${created}`);
            if (moved > 0) parts.push(`移动${moved}`);
            if (completed > 0) parts.push(`完成${completed}`);
            if (deleted > 0) parts.push(`删除${deleted}`);
            showToast(`✅ ${parts.join(' / ')}`);
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
