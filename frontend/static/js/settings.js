/**
 * Schedule App - Settings Module
 * Settings view and configuration management
 */

(function() {
    'use strict';

    const getState = () => (window.ScheduleAppCore && window.ScheduleAppCore.state) || {};
    const getElements = () => (window.ScheduleAppCore && window.ScheduleAppCore.elements) || {};
    const getUtils = () => window.ScheduleAppCore || {};
    const escapeHtml = (text) => {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    };

    async function openSettingsView() {
        const state = getState();
        const elements = getElements();
        const utils = getUtils();
        const { fetchSettings } = utils;

        state.enableDragResize = localStorage.getItem('enableDragResize') === 'true';
        if (elements.enableDragResize) {
            elements.enableDragResize.checked = state.enableDragResize;
        }

        try {
            await fetchSettings();
        } catch (error) {
            console.error('Failed to load settings:', error);
        }

        if (elements.enableQQReminder) {
            elements.enableQQReminder.checked = !!state.qqReminderEnabled;
        }
        if (elements.defaultTaskReminderEnabled) {
            elements.defaultTaskReminderEnabled.checked = state.defaultTaskReminderEnabled !== false;
        }
        if (elements.autoAssignBudgetFromLlm) {
            elements.autoAssignBudgetFromLlm.checked = !!state.autoAssignBudgetFromLlm;
        }
        if (elements.appVersion) {
            elements.appVersion.textContent = 'v1.0.0';
        }

        // Load AI providers
        if (utils.loadAiProviders) {
            await utils.loadAiProviders();
        }

        // Initialize Learning UI
        if (window.SettingsLearningUI) {
            await window.SettingsLearningUI.init();
        }
    }

    function closeSettingsView() {
        const elements = getElements();
        elements.settingsModal.classList.add('hidden');
    }

    async function handleSettingChange(key, value) {
        const { updateSetting, showToast } = getUtils();
        try {
            await updateSetting(key, value);
            showToast('设置已保存');
        } catch (error) {
            console.error('Failed to save setting:', error);
            showToast('保存失败');
        }
    }

    async function saveSettings() {
        const state = getState();
        const elements = getElements();
        const { updateSetting, showToast } = getUtils();

        const enableDragResize = elements.enableDragResize.checked;
        localStorage.setItem('enableDragResize', enableDragResize);
        state.enableDragResize = enableDragResize;

        try {
            await updateSetting('enableDragResize', enableDragResize);
            showToast('设置已保存');
            closeSettingsView();
        } catch (error) {
            console.error('Failed to save settings:', error);
            showToast('保存失败');
        }
    }

    async function loadUserContexts() {
        const state = getState();
        const elements = getElements();
        const { apiCall } = getUtils();

        try {
            const contexts = await apiCall('user-contexts');
            state.userContexts = contexts || [];
        } catch (error) {
            console.error('Failed to load user contexts:', error);
            state.userContexts = [];
        }

        if (!elements.userContextList) return;

        if (!state.userContexts || state.userContexts.length === 0) {
            elements.userContextList.innerHTML = '<div class="user-context-empty">暂无现状描述<br>点击上方"添加"新增</div>';
            return;
        }

        elements.userContextList.innerHTML = state.userContexts.map(ctx => `
            <div class="user-context-item ${ctx.id === state.selectedUserContextId ? 'selected' : ''}" data-id="${ctx.id}">
                <div class="user-context-item-content">${escapeHtml(ctx.content || '')}</div>
            </div>
        `).join('');

        elements.userContextList.querySelectorAll('.user-context-item').forEach(item => {
            item.addEventListener('click', () => {
                const id = parseInt(item.dataset.id);
                state.selectedUserContextId = id;
                const context = state.userContexts.find(c => c.id === id);
                if (context) {
                    elements.userContextEditTitle.textContent = '编辑现状';
                    elements.userContextContent.value = context.content;
                    elements.userContextDeleteBtn.classList.remove('hidden');
                }
                elements.userContextList.querySelectorAll('.user-context-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');
            });
        });
    }

    async function saveUserContext() {
        const state = getState();
        const elements = getElements();
        const { apiCall, showToast } = getUtils();

        if (state.isSavingUserContext) {
            return;
        }

        const content = (elements.userContextContent && elements.userContextContent.value || '').trim();

        if (!content) {
            showToast('请输入现状描述');
            return;
        }

        state.isSavingUserContext = true;
        if (elements.userContextSaveBtn) {
            elements.userContextSaveBtn.disabled = true;
        }

        try {
            let result;
            if (state.selectedUserContextId) {
                result = await apiCall(`user-contexts/${state.selectedUserContextId}`, {
                    method: 'PUT',
                    body: JSON.stringify({ content }),
                });
            } else {
                result = await apiCall('user-contexts', {
                    method: 'POST',
                    body: JSON.stringify({ content }),
                });
            }

            if (result && !result.error) {
                showToast(state.selectedUserContextId ? '现状已更新' : '现状已添加');
                await loadUserContexts();
            } else {
                showToast(result?.message || '保存失败');
            }
        } catch (error) {
            console.error('Failed to save user context:', error);
            showToast('保存失败');
        } finally {
            state.isSavingUserContext = false;
            if (elements.userContextSaveBtn) {
                elements.userContextSaveBtn.disabled = false;
            }
        }
    }

    // ----------------------------------------------------------------
    // Settings Modal (Legacy - kept for reference)
    // ----------------------------------------------------------------

    async function openSettingsModal() {
        const state = getState();
        const elements = getElements();
        const { fetchSettings } = getUtils();
        const saved = localStorage.getItem('enableDragResize');
        state.enableDragResize = saved === 'true';
        elements.enableDragResize.checked = state.enableDragResize;

        await fetchSettings();
        elements.enableQQReminder.checked = state.qqReminderEnabled;
        elements.defaultTaskReminderEnabled.checked = state.defaultTaskReminderEnabled;
        elements.autoAssignBudgetFromLlm.checked = state.autoAssignBudgetFromLlm;

        if (typeof loadUserContexts === 'function') await loadUserContexts();
        if (typeof loadAiProviders === 'function') await loadAiProviders();

        elements.appVersion.textContent = 'v1.0.0';

        elements.settingsModal.classList.remove('hidden');
    }

    function closeSettingsModal() {
        const elements = getElements();
        elements.settingsModal.classList.add('hidden');
    }

    // ----------------------------------------------------------------
    // AI Providers
    // ----------------------------------------------------------------

    async function loadAiProviders() {
        const state = getState();
        const elements = getElements();
        const { apiCall } = getUtils();
        try {
            const providers = await apiCall('ai-providers');
            state.aiProviders = providers || [];
            renderAiProviders(providers || []);
        } catch (e) {
            console.error('Failed to load AI providers:', e);
            state.aiProviders = [];
            renderAiProviders([]);
        }
    }

    function renderAiProviders(providers) {
        const elements = getElements();
        const list = elements.aiProvidersList;
        if (!providers || providers.length === 0) {
            list.innerHTML = '<div class="ai-provider-empty">暂无配置的 AI，点击下方添加</div>';
            return;
        }

        list.innerHTML = providers.map(p => `
            <div class="ai-provider-item ${p.is_active ? 'active' : ''}" data-id="${p.id}">
                <div class="ai-provider-info">
                    <span class="ai-provider-name">${escapeHtml(p.name)}${p.is_active ? ' ✓' : ''}</span>
                    <span class="ai-provider-model">${escapeHtml(p.model)} · ${escapeHtml(p.api_base)}</span>
                </div>
                <div class="ai-provider-actions">
                    <button class="ai-provider-activate-btn" ${p.is_active ? 'disabled' : ''} onclick="ScheduleAppSettings.activateAiProvider(${p.id})">
                        ${p.is_active ? '使用中' : '使用'}
                    </button>
                    <button class="ai-provider-edit-btn" onclick="ScheduleAppSettings.openAiProviderModal(${p.id})">编辑</button>
                    <button class="ai-provider-delete-btn" onclick="ScheduleAppSettings.deleteAiProvider(${p.id})">删除</button>
                </div>
            </div>
        `).join('');
    }

    function openAiProviderModal(id = null) {
        const state = getState();
        const elements = getElements();
        const provider = id ? (state.aiProviders || []).find((p) => p.id === id) : null;
        elements.aiProviderId.value = id || '';
        elements.aiProviderModalTitle.textContent = id ? '编辑 AI 提供商' : '添加 AI 提供商';
        elements.aiProviderName.value = provider?.name || '';
        elements.aiProviderApiBase.value = provider?.api_base || '';
        elements.aiProviderModel.value = provider?.model || '';
        elements.aiProviderApiKey.value = '';
        elements.aiProviderApiKey.placeholder = provider?.has_api_key ? (provider.api_key || 'sk-****') : '请输入 API Key';
        elements.aiProviderModal.classList.remove('hidden');
    }

    function closeAiProviderModal() {
        const elements = getElements();
        elements.aiProviderModal.classList.add('hidden');
    }

    async function saveAiProvider() {
        const elements = getElements();
        const { apiCall, showToast } = getUtils();
        const id = elements.aiProviderId.value;
        const name = elements.aiProviderName.value.trim();
        const apiBase = elements.aiProviderApiBase.value.trim();
        const model = elements.aiProviderModel.value.trim();
        const apiKey = elements.aiProviderApiKey.value.trim();

        if (!name || !apiBase || !model) {
            showToast('请填写完整信息');
            return;
        }

        try {
            let result;
            if (id) {
                result = await apiCall(`ai-providers/${id}`, {
                    method: 'PUT',
                    body: JSON.stringify({ name, api_base: apiBase, model, api_key: apiKey })
                });
            } else {
                if (!apiKey) {
                    showToast('请填写 API Key');
                    return;
                }
                result = await apiCall('ai-providers', {
                    method: 'POST',
                    body: JSON.stringify({ name, api_base: apiBase, model, api_key: apiKey })
                });
            }

            if (result && !result.error) {
                showToast(id ? 'AI配置已更新' : 'AI配置已添加');
                closeAiProviderModal();
                await loadAiProviders();
            } else {
                showToast(result?.message || '保存失败');
            }
        } catch (e) {
            showToast('保存失败');
            console.error(e);
        }
    }

    async function activateAiProvider(id) {
        const { apiCall, showToast } = getUtils();
        try {
            const result = await apiCall(`ai-providers/${id}/activate`, { method: 'PUT' });
            if (result && !result.error) {
                showToast('已切换到该AI');
                await loadAiProviders();
            } else {
                showToast('切换失败');
            }
        } catch (e) {
            showToast('切换失败');
            console.error(e);
        }
    }

    async function deleteAiProvider(id) {
        const { apiCall, showToast, showConfirm } = getUtils();
        const confirmed = await showConfirm('确定删除该AI配置？');
        if (!confirmed) return;

        try {
            const result = await apiCall(`ai-providers/${id}`, { method: 'DELETE' });
            if (result && !result.error) {
                showToast('AI配置已删除');
                await loadAiProviders();
            } else {
                showToast('删除失败');
            }
        } catch (e) {
            showToast('删除失败');
            console.error(e);
        }
    }

    // ----------------------------------------------------------------
    // User Contexts (supplement to loadUserContexts/saveUserContext above)
    // ----------------------------------------------------------------

    function renderUserContexts() {
        const state = getState();
        const elements = getElements();
        const list = elements.userContextList;
        if (!state.userContexts || state.userContexts.length === 0) {
            list.innerHTML = '<div class="user-context-empty">暂无现状描述<br>点击上方"添加"新增</div>';
            return;
        }

        list.innerHTML = state.userContexts.map(ctx => `
            <div class="user-context-item ${ctx.id === state.selectedUserContextId ? 'selected' : ''}" data-id="${ctx.id}">
                <div class="user-context-item-content">${escapeHtml(ctx.content)}</div>
            </div>
        `).join('');

        list.querySelectorAll('.user-context-item').forEach(item => {
            item.addEventListener('click', () => {
                const id = parseInt(item.dataset.id);
                selectUserContext(id);
            });
        });
    }

    function selectUserContext(id) {
        const state = getState();
        const elements = getElements();
        state.selectedUserContextId = id;
        const context = state.userContexts.find(c => c.id === id);

        if (context) {
            elements.userContextEditTitle.textContent = '编辑现状';
            elements.userContextContent.value = context.content;
            elements.userContextDeleteBtn.classList.remove('hidden');
        }

        renderUserContexts();
    }

    async function openUserContextModal() {
        const state = getState();
        const elements = getElements();
        state.selectedUserContextId = null;
        elements.userContextEditTitle.textContent = '添加新现状';
        elements.userContextContent.value = '';
        elements.userContextDeleteBtn.classList.add('hidden');
        if (!state.userContexts || state.userContexts.length === 0) {
            await loadUserContexts();
        }
        renderUserContexts();
        elements.userContextModal.classList.remove('hidden');
    }

    function closeUserContextModal() {
        const elements = getElements();
        elements.userContextModal.classList.add('hidden');
    }

    async function deleteUserContext() {
        const state = getState();
        const elements = getElements();
        const { apiCall, showToast, showConfirm, updateSetting } = getUtils();
        if (!state.selectedUserContextId) return;

        const confirmed = await showConfirm('确定删除该现状？');
        if (!confirmed) return;

        try {
            const result = await apiCall(`user-contexts/${state.selectedUserContextId}`, { method: 'DELETE' });
            if (result && !result.error) {
                showToast('现状已删除');
                state.selectedUserContextId = null;
                elements.userContextEditTitle.textContent = '添加新现状';
                elements.userContextContent.value = '';
                elements.userContextDeleteBtn.classList.add('hidden');
                await loadUserContexts();
                await updateSelfDescriptionForLlm();
            } else {
                showToast('删除失败');
            }
        } catch (e) {
            showToast('删除失败');
            console.error(e);
        }
    }

    async function updateSelfDescriptionForLlm() {
        const state = getState();
        const { updateSetting } = getUtils();
        const allContent = state.userContexts.map(c => c.content).filter(Boolean).join('\n');
        state.userSelfDescription = allContent;
        await updateSetting('self_description', allContent);
    }

    // ----------------------------------------------------------------
    // Setting Toggle Handlers
    // ----------------------------------------------------------------

    async function handleQQReminderToggle(e) {
        const state = getState();
        const { updateSetting, showToast } = getUtils();
        const enabled = e.target.checked;
        state.qqReminderEnabled = enabled;

        const result = await updateSetting('qq_reminder_enabled', enabled ? 'true' : 'false');
        if (result) {
            showToast(enabled ? 'QQ提醒已开启' : 'QQ提醒已关闭');
        } else {
            e.target.checked = !enabled;
            state.qqReminderEnabled = !enabled;
        }
    }

    function handleDragResizeToggle(e) {
        const state = getState();
        state.enableDragResize = e.target.checked;
        localStorage.setItem('enableDragResize', state.enableDragResize);
        // Re-render timeline callback is set up in main.js bindEvents
    }

    async function handleDefaultTaskReminderToggle(e) {
        const state = getState();
        const { updateSetting, showToast } = getUtils();
        const enabled = e.target.checked;
        state.defaultTaskReminderEnabled = enabled;

        const result = await updateSetting('default_task_reminder_enabled', enabled ? 'true' : 'false');
        if (result) {
            showToast(enabled ? '新任务默认提醒已开启' : '新任务默认提醒已关闭');
        } else {
            e.target.checked = !enabled;
            state.defaultTaskReminderEnabled = !enabled;
        }
    }

    async function handleAutoAssignBudgetToggle(e) {
        const state = getState();
        const { updateSetting, showToast } = getUtils();
        const enabled = e.target.checked;
        state.autoAssignBudgetFromLlm = enabled;

        const result = await updateSetting('auto_assign_budget_from_llm', enabled ? 'true' : 'false');
        if (result) {
            showToast(enabled ? 'AI记账将自动加入相关预算' : 'AI记账不会自动加入预算');
        } else {
            e.target.checked = !enabled;
            state.autoAssignBudgetFromLlm = !enabled;
        }
    }

    async function handleTestQQChannel() {
        const { showToast } = getUtils();
        showToast('正在发送测试消息...');
        try {
            const response = await fetch('/api/test-qq-channel', { method: 'POST' });
            const json = await response.json();
            if (json.code === 0) {
                showToast('✅ QQ 信道测试成功');
            } else {
                showToast('❌ ' + (json.message || '发送失败'));
            }
        } catch {
            showToast('❌ QQ 信道测试失败');
        }
    }

    // ----------------------------------------------------------------
    // Error Logs
    // ----------------------------------------------------------------

    async function handleViewErrorLogs() {
        const container = document.getElementById('errorLogsList');
        if (!container) return;

        if (container.style.display === 'none') {
            container.style.display = 'block';
            await loadErrorLogs();
        } else {
            container.style.display = 'none';
        }
    }

    async function loadErrorLogs() {
        const container = document.getElementById('errorLogsList');
        if (!container) return;

        try {
            const resp = await fetch('/api/errors?limit=50');
            const json = await resp.json();
            if (json.code !== 0 || !Array.isArray(json.data)) {
                container.innerHTML = '<div style="padding:8px;color:#999;">加载失败</div>';
                return;
            }
            const logs = json.data;
            if (!logs.length) {
                container.innerHTML = '<div style="padding:8px;color:#999;">暂无错误日志</div>';
                return;
            }
            container.innerHTML = logs.map(log => `
                <div style="border-bottom:1px solid #eee;padding:8px;font-size:12px;">
                    <div style="color:#c00;font-weight:bold;">${escHtml(log.message||'').substring(0,100)}</div>
                    <div style="color:#888;margin:4px 0;">${log.source} @ ${log.url||''}</div>
                    <div style="color:#666;white-space:pre-wrap;word-break:break-all;font-size:11px;max-height:80px;overflow:hidden;">${escHtml(log.stack||'').substring(0,300)}</div>
                    <div style="color:#aaa;font-size:10px;margin-top:4px;">${log.timestamp||''}</div>
                </div>
            `).join('') + '<button onclick="ScheduleAppSettings.handleClearErrorLogs()" style="margin:8px;padding:4px 12px;background:#fdd;border:none;border-radius:4px;cursor:pointer;">清除所有日志</button>';
        } catch {
            container.innerHTML = '<div style="padding:8px;color:#999;">加载失败</div>';
        }
    }

    async function handleClearErrorLogs() {
        const { showToast } = getUtils();
        try {
            const resp = await fetch('/api/errors', { method: 'DELETE', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ids: []}) });
            const json = await resp.json();
            showToast('已清除错误日志');
            const container = document.getElementById('errorLogsList');
            if (container) container.innerHTML = '<div style="padding:8px;color:#999;">暂无错误日志</div>';
        } catch {
            showToast('清除失败');
        }
    }

    function escHtml(s) {
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    // ----------------------------------------------------------------
    // Cleanup Test Entries
    // ----------------------------------------------------------------

    async function handleCleanupTestEntries() {
        const state = getState();
        const { showToast, showConfirm, cleanupTestEntries } = getUtils();
        const confirmed = await showConfirm('确定一键清理测试条目吗？\n将删除包含"测试/test/demo/debug/样例/示例/tmp/临时"等关键词的日程、笔记和记账条目。');
        if (!confirmed) return;

        const result = await cleanupTestEntries();
        if (!result) {
            showToast('清理失败，请稍后重试');
            return;
        }

        const eventsDeleted = Number(result.events_deleted || 0);
        const notesDeleted = Number(result.notes_deleted || 0);
        const expensesDeleted = Number(result.expenses_deleted || 0);
        const totalDeleted = eventsDeleted + notesDeleted + expensesDeleted;

        showToast(`已清理 ${totalDeleted} 条（日程${eventsDeleted} / 笔记${notesDeleted} / 记账${expensesDeleted}）`);

        const { loadData } = getUtils();
        if (loadData) await loadData();
    }

    // ----------------------------------------------------------------
    // Semantic Help Modal
    // ----------------------------------------------------------------

    function showSemanticHelpModal() {
        const existing = document.getElementById('semanticHelpModal');
        if (existing) existing.remove();

        const helpHtml = `
            <div class="modal" id="semanticHelpModal">
                <div class="modal-backdrop" id="semanticHelpBackdrop"></div>
                <div class="modal-content">
                    <div class="modal-header">
                        <h2>统一语义解析说明</h2>
                        <button class="modal-close" id="semanticHelpClose">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="settings-item-desc" style="line-height:1.7; color:var(--text-primary)">
                            当前支持你在顶部自然语言输入框里，直接用一句话执行日程/待办操作：
                        </div>
                        <ul style="margin:10px 0 0 18px; padding:0; line-height:1.8; color:var(--text-primary)">
                            <li><strong>创建任务</strong>：如"明天下午3点开组会"</li>
                            <li><strong>删除任务</strong>：如"删除所有4月5号的代办"</li>
                            <li><strong>完成任务</strong>：如"完成所有代办"</li>
                            <li><strong>撤销完成</strong>：如"把今天完成的都改回待办"</li>
                            <li><strong>批量多操作</strong>：一条输入可解析为多个顺序操作</li>
                            <li><strong>安全确认</strong>：删除/批量状态变更会先弹窗确认</li>
                            <li><strong>时间语义</strong>：
                                "4月17号前"按 4/17 23:59 处理；
                                "4月17号之前/以前"按 4/16 23:59 处理；
                                没有明确时间可保留为无明确时间
                            </li>
                        </ul>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-primary" id="semanticHelpOk">我知道了</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', helpHtml);

        const modal = document.getElementById('semanticHelpModal');
        const backdrop = document.getElementById('semanticHelpBackdrop');
        const closeBtn = document.getElementById('semanticHelpClose');
        const okBtn = document.getElementById('semanticHelpOk');

        const closeModal = () => modal?.remove();
        backdrop?.addEventListener('click', closeModal);
        closeBtn?.addEventListener('click', closeModal);
        okBtn?.addEventListener('click', closeModal);

        requestAnimationFrame(() => {
            modal?.classList.remove('hidden');
        });
    }

    // ----------------------------------------------------------------
    // Event/Expense History & Recovery (for Settings)
    // ----------------------------------------------------------------

    async function loadEventHistoryAll() {
        const { showToast } = getUtils();
        const list = document.getElementById('eventHistoryList');
        if (!list) return;
        list.style.display = 'block';
        list.innerHTML = '<div class="event-history-loading" style="padding:8px;text-align:center;color:var(--text-muted);font-size:12px;">加载中...</div>';
        try {
            const resp = await fetch('/api/event-history');
            const json = await resp.json();
            if (json.code === 0 && json.data && json.data.length > 0) {
                list.innerHTML = json.data.slice(0, 50).map(h => {
                    const actionLabels = { created: '创建', updated: '修改', deleted: '删除', completed: '完成', uncompleted: '撤销完成' };
                    const actionLabel = actionLabels[h.action] || h.action;
                    const time = h.created_at ? new Date(h.created_at).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
                    let diff = '';
                    try {
                        if (h.action === 'updated' && h.old_value && h.new_value) {
                            const oldV = JSON.parse(h.old_value);
                            const newV = JSON.parse(h.new_value);
                            for (const k of Object.keys(newV)) {
                                if (JSON.stringify(oldV[k]) !== JSON.stringify(newV[k])) {
                                    diff = `${k}: ${oldV[k] || '(空)'} → ${newV[k] || '(空)'}`;
                                    break;
                                }
                            }
                        }
                    } catch {}
                    return `<div class="event-history-item action-${h.action}">
                        <div class="event-history-header">
                            <span class="event-history-action">${actionLabel}</span>
                            <span class="event-history-time">${time}</span>
                        </div>
                        <div class="event-history-event-title">事件ID: ${h.event_id}</div>
                        ${diff ? `<div class="event-history-detail">${diff}</div>` : ''}
                    </div>`;
                }).join('');
            } else {
                list.innerHTML = '<div style="padding:8px;text-align:center;color:var(--text-muted);font-size:12px;">暂无历史记录</div>';
            }
        } catch {
            list.innerHTML = '<div style="padding:8px;text-align:center;color:var(--color-danger);font-size:12px;">加载失败</div>';
        }
    }

    async function loadDeletedEvents() {
        const list = document.getElementById('deletedEventsList');
        if (!list) return;
        list.style.display = 'block';
        list.innerHTML = '<div class="event-history-loading" style="padding:8px;text-align:center;color:var(--text-muted);font-size:12px;">加载中...</div>';
        try {
            const resp = await fetch('/api/deleted-events');
            const json = await resp.json();
            if (json.code === 0 && json.data && json.data.length > 0) {
                list.innerHTML = json.data.slice(0, 50).map(e => {
                    const time = e.start_time ? new Date(e.start_time).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
                    const deletedAt = e.deleted_at ? new Date(e.deleted_at).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
                    return `<div class="deleted-event-item">
                        <div class="deleted-event-header">
                            <span class="deleted-event-title">${e.title || '(无标题)'}</span>
                            <span class="deleted-event-time">${time}</span>
                        </div>
                        <div class="deleted-event-detail" style="font-size:11px;color:var(--text-secondary);">删除于: ${deletedAt}</div>
                        <div class="deleted-event-actions">
                            <button class="btn btn-primary" onclick="ScheduleAppSettings.restoreDeletedEvent(${e.id})">恢复</button>
                            <button class="btn btn-secondary" onclick="ScheduleAppSettings.permanentDeleteEvent(${e.id})">永久删除</button>
                        </div>
                    </div>`;
                }).join('');
            } else {
                list.innerHTML = '<div class="deleted-events-empty">暂无已删除的日程</div>';
            }
        } catch {
            list.innerHTML = '<div style="padding:8px;text-align:center;color:var(--color-danger);font-size:12px;">加载失败</div>';
        }
    }

    async function restoreDeletedEvent(deletedId) {
        const { showToast } = getUtils();
        try {
            const resp = await fetch('/api/deleted-events/' + deletedId + '/restore', { method: 'POST' });
            const json = await resp.json();
            if (json.code === 0) {
                showToast('✅ 已恢复日程');
                loadDeletedEvents();
                const { loadData } = getUtils();
                if (loadData) loadData();
            } else {
                showToast('❌ ' + (json.message || '恢复失败'));
            }
        } catch {
            showToast('❌ 恢复失败');
        }
    }

    async function permanentDeleteEvent(deletedId) {
        const { showToast } = getUtils();
        if (!confirm('确定要永久删除吗？此操作不可恢复。')) return;
        try {
            const resp = await fetch('/api/deleted-events/' + deletedId, { method: 'DELETE' });
            const json = await resp.json();
            if (json.code === 0) {
                showToast('已永久删除');
                loadDeletedEvents();
            } else {
                showToast('❌ ' + (json.message || '删除失败'));
            }
        } catch {
            showToast('❌ 删除失败');
        }
    }

    async function loadEventModifications() {
        const list = document.getElementById('eventModificationsList');
        if (!list) return;
        list.style.display = 'block';
        list.innerHTML = '<div class="event-history-loading" style="padding:8px;text-align:center;color:var(--text-muted);font-size:12px;">加载中...</div>';
        try {
            const resp = await fetch('/api/event-modifications');
            const json = await resp.json();
            if (json.code === 0 && json.data && json.data.length > 0) {
                list.innerHTML = json.data.slice(0, 50).map(m => {
                    const time = m.modified_at ? new Date(m.modified_at).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
                    const startTime = m.start_time ? new Date(m.start_time).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
                    return `<div class="event-modification-item">
                        <div class="event-modification-header">
                            <span class="event-modification-title">${m.title || '(无标题)'}</span>
                            <span class="event-modification-time">${time}</span>
                        </div>
                        <div class="event-modification-detail" style="font-size:11px;color:var(--text-secondary);">时间: ${startTime} | 操作: ${m.action_type}</div>
                        <div class="event-modification-actions">
                            <button class="btn btn-primary" onclick="ScheduleAppSettings.undoEventModification(${m.id})">撤销此修改</button>
                        </div>
                    </div>`;
                }).join('');
            } else {
                list.innerHTML = '<div class="event-modifications-empty">暂无修改历史</div>';
            }
        } catch {
            list.innerHTML = '<div style="padding:8px;text-align:center;color:var(--color-danger);font-size:12px;">加载失败</div>';
        }
    }

    async function undoEventModification(modificationId) {
        const { showToast } = getUtils();
        try {
            const resp = await fetch('/api/event-modifications/' + modificationId + '/undo', { method: 'POST' });
            const json = await resp.json();
            if (json.code === 0) {
                showToast('✅ 已撤销修改');
                loadEventModifications();
                const { loadData } = getUtils();
                if (loadData) loadData();
            } else {
                showToast('❌ ' + (json.message || '撤销失败'));
            }
        } catch {
            showToast('❌ 撤销失败');
        }
    }

    async function loadExpenseOperationLogs() {
        const list = document.getElementById('expenseHistoryList');
        if (!list) return;
        list.style.display = 'block';
        list.innerHTML = '<div style="padding:8px;text-align:center;color:var(--text-muted);font-size:12px;">加载中...</div>';
        try {
            const resp = await fetch('/api/expense-operation-logs?limit=100');
            const json = await resp.json();
            if (json.code === 0 && json.data && json.data.length > 0) {
                list.innerHTML = json.data.slice(0, 50).map(log => {
                    const time = log.created_at ? new Date(log.created_at).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
                    const expDate = log.expense_date || '';
                    const opIcon = log.operation === 'create' ? '✨' : log.operation === 'update' ? '📝' : log.operation === 'delete' ? '🗑️' : log.operation === 'restore' ? '♻️' : '📋';
                    const opText = log.operation === 'create' ? '创建' : log.operation === 'update' ? '修改' : log.operation === 'delete' ? '删除' : log.operation === 'restore' ? '恢复' : log.operation;

                    let detail = '';
                    try {
                        const newData = log.new_data ? JSON.parse(log.new_data) : null;
                        if (newData) {
                            detail = `¥${newData.amount || 0} · ${newData.category || ''} · ${newData.note || '(无备注)'}`;
                        }
                    } catch {}

                    return `<div class="expense-history-item" style="padding:8px;border-bottom:1px solid var(--border-color);">
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                            <span style="font-size:14px;">${opIcon} ${opText}</span>
                            <span style="font-size:11px;color:var(--text-secondary);">${time}</span>
                        </div>
                        <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">${detail}</div>
                        ${log.operation === 'update' ? `<button class="btn btn-secondary" style="margin-top:4px;font-size:11px;padding:2px 8px;" onclick="ScheduleAppSettings.undoExpenseOperation(${log.id})">撤销此修改</button>` : ''}
                    </div>`;
                }).join('');
            } else {
                list.innerHTML = '<div style="padding:8px;text-align:center;color:var(--text-muted);font-size:12px;">暂无支出操作记录</div>';
            }
        } catch {
            list.innerHTML = '<div style="padding:8px;text-align:center;color:var(--color-danger);font-size:12px;">加载失败</div>';
        }
    }

    async function undoExpenseOperation(logId) {
        const { showToast } = getUtils();
        try {
            const resp = await fetch('/api/expense-operation-logs/' + logId + '/undo', { method: 'POST' });
            const json = await resp.json();
            if (json.code === 0) {
                showToast('✅ 已撤销修改');
                loadExpenseOperationLogs();
                const { loadData } = getUtils();
                if (loadData) loadData();
            } else {
                showToast('❌ ' + (json.message || '撤销失败'));
            }
        } catch {
            showToast('❌ 撤销失败');
        }
    }

    async function loadDeletedExpenses() {
        const list = document.getElementById('deletedExpensesList');
        if (!list) return;
        list.style.display = 'block';
        list.innerHTML = '<div style="padding:8px;text-align:center;color:var(--text-muted);font-size:12px;">加载中...</div>';
        try {
            const resp = await fetch('/api/deleted-expenses');
            const json = await resp.json();
            if (json.code === 0 && json.data && json.data.length > 0) {
                list.innerHTML = json.data.slice(0, 50).map(e => {
                    const deletedAt = e.deleted_at ? new Date(e.deleted_at).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
                    return `<div class="deleted-expense-item" style="padding:8px;border-bottom:1px solid var(--border-color);">
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                            <span style="font-size:14px;">¥${e.amount || 0}</span>
                            <span style="font-size:11px;color:var(--text-secondary);">删除于 ${deletedAt}</span>
                        </div>
                        <div style="font-size:12px;color:var(--text-muted);">${e.category || ''} · ${e.note || '(无备注)'}</div>
                        <button class="btn btn-primary" style="margin-top:4px;font-size:11px;padding:2px 8px;" onclick="ScheduleAppSettings.restoreDeletedExpense(${e.id})">恢复</button>
                    </div>`;
                }).join('');
            } else {
                list.innerHTML = '<div style="padding:8px;text-align:center;color:var(--text-muted);font-size:12px;">暂无已删除的支出</div>';
            }
        } catch {
            list.innerHTML = '<div style="padding:8px;text-align:center;color:var(--color-danger);font-size:12px;">加载失败</div>';
        }
    }

    async function restoreDeletedExpense(deletedId) {
        const { showToast } = getUtils();
        try {
            const resp = await fetch('/api/deleted-expenses/' + deletedId + '/restore', { method: 'POST' });
            const json = await resp.json();
            if (json.code === 0) {
                showToast('✅ 已恢复支出');
                loadDeletedExpenses();
                const { loadData } = getUtils();
                if (loadData) loadData();
            } else {
                showToast('❌ ' + (json.message || '恢复失败'));
            }
        } catch {
            showToast('❌ 恢复失败');
        }
    }

    // Settings Learning UI (AI Learning section)
    const SettingsLearningUI = {
        _isLearning: false,

        cacheElements() {
            this.statsEl = document.getElementById('learningTaskCount');
            this.patternCountEl = document.getElementById('learningPatternCount');
            this.avgDurationEl = document.getElementById('learningAvgDuration');
            this.startBtn = document.getElementById('startLearningBtn');
            this.statusEl = document.getElementById('learningStatus');
            this.patternsEl = document.getElementById('learningPatterns');
            // Backup buttons
            this.exportBtn = document.getElementById('exportDataBtn');
            this.importBtn = document.getElementById('importDataBtn');
            this.importFile = document.getElementById('importDataFile');
            this.importClearOption = document.getElementById('importClearOption');
            this.importClearCheckbox = document.getElementById('importClearCheckbox');
        },

        bindEvents() {
            if (this.startBtn) {
                this.startBtn.addEventListener('click', () => this.startLearning());
            }
            if (this.exportBtn) {
                this.exportBtn.addEventListener('click', () => this.exportData());
            }
            if (this.importBtn && this.importFile) {
                this.importBtn.addEventListener('click', () => this.importFile.click());
                this.importFile.addEventListener('change', (e) => this.handleImportFile(e));
            }
        },

        async loadStats() {
            const { apiCall } = getUtils();
            try {
                const resp = await apiCall('ai/stats');
                if (resp && resp.data) {
                    if (this.statsEl) {
                        this.statsEl.textContent = resp.data.total_records || 0;
                    }
                    if (this.patternCountEl) {
                        this.patternCountEl.textContent = resp.data.total_patterns || 0;
                    }
                    if (this.avgDurationEl) {
                        const avg = resp.data.avg_actual_duration;
                        this.avgDurationEl.textContent = avg ? `${avg}分钟` : '-';
                    }
                }
            } catch (e) {
                console.error('Failed to load learning stats', e);
                if (this.statsEl) this.statsEl.textContent = '-';
                if (this.patternCountEl) this.patternCountEl.textContent = '-';
                if (this.avgDurationEl) this.avgDurationEl.textContent = '-';
            }
        },

        showStatus(message, type = '') {
            if (!this.statusEl) return;
            this.statusEl.textContent = message;
            this.statusEl.style.display = message ? 'block' : 'none';
            this.statusEl.className = 'learning-status' + (type ? ' ' + type : '');
        },

        async startLearning() {
            if (this._isLearning) return;
            const { apiCall, showToast } = getUtils();

            this._isLearning = true;
            if (this.startBtn) {
                this.startBtn.disabled = true;
                this.startBtn.textContent = '⏳ 分析中...';
            }
            this.showStatus('正在分析任务数据...', 'loading');

            try {
                const result = await apiCall('ai/learn', { method: 'POST' });
                if (result && !result.error) {
                    this.showStatus('分析完成！', '');
                    showToast('任务规律分析完成');
                    await this.loadStats();
                    await this.loadPatterns();
                } else {
                    this.showStatus(result?.message || '分析失败', 'error');
                    showToast(result?.message || '分析失败');
                }
            } catch (e) {
                console.error('Learning failed', e);
                this.showStatus('分析失败：' + (e.message || '未知错误'), 'error');
                showToast('分析失败');
            } finally {
                this._isLearning = false;
                if (this.startBtn) {
                    this.startBtn.disabled = false;
                    this.startBtn.textContent = '🔍 分析任务规律';
                }
            }
        },

        async loadPatterns() {
            const { apiCall } = getUtils();
            if (!this.patternsEl) return;

            try {
                const resp = await apiCall('ai/patterns');
                const patterns = (resp && resp.data) || [];

                if (patterns.length === 0) {
                    this.patternsEl.innerHTML = '<div class="learning-pattern-empty" style="text-align:center;color:var(--text-muted);font-size:var(--font-sm);padding:var(--space-md);">暂无学习到的规律<br>点击上方按钮开始分析</div>';
                    return;
                }

                this.patternsEl.innerHTML = patterns.map(p => `
                    <div class="learning-pattern-card" data-id="${p.id}">
                        <div class="learning-pattern-header">
                            <span class="learning-pattern-type">${escapeHtml(p.pattern_type || '通用')}</span>
                            <span class="learning-pattern-confidence">置信度: ${p.confidence || 0}%</span>
                        </div>
                        <div class="learning-pattern-text">${escapeHtml(p.pattern_text || p.content || '')}</div>
                        <div class="learning-pattern-footer">
                            <button class="btn btn-secondary add-to-context-btn" data-text="${escapeHtml(p.pattern_text || p.content || '')}">添加到自我描述</button>
                            <button class="btn btn-danger delete-pattern-btn" data-id="${p.id}">删除</button>
                        </div>
                    </div>
                `).join('');

                // Bind events
                this.patternsEl.querySelectorAll('.add-to-context-btn').forEach(btn => {
                    btn.addEventListener('click', () => this.addToSelfDescription(btn.dataset.text));
                });
                this.patternsEl.querySelectorAll('.delete-pattern-btn').forEach(btn => {
                    btn.addEventListener('click', () => this.deletePattern(btn.dataset.id));
                });
            } catch (e) {
                console.error('Failed to load patterns', e);
                this.patternsEl.innerHTML = '<div style="color:var(--danger);font-size:var(--font-sm);padding:var(--space-sm);text-align:center;">加载规律失败</div>';
            }
        },

        async addToSelfDescription(patternText) {
            const { apiCall, showToast } = getUtils();
            try {
                const result = await apiCall('user-contexts', {
                    method: 'POST',
                    body: JSON.stringify({ content: patternText }),
                });
                if (result && !result.error) {
                    showToast('已添加到自我描述');
                } else {
                    showToast(result?.message || '添加失败');
                }
            } catch (e) {
                console.error('Failed to add to self description', e);
                showToast('添加失败');
            }
        },

async deletePattern(patternId) {
            const { apiCall, showToast } = getUtils();
            try {
                const result = await apiCall(`ai/patterns/${patternId}`, { method: 'DELETE' });
                if (result && !result.error) {
                    showToast('已删除规律');
                    await this.loadPatterns();
                }
            } catch (e) {
                console.error('Failed to delete pattern', e);
                showToast('删除失败');
            }
        },

        async exportData() {
            const { apiCall, showToast } = getUtils();
            try {
                showToast('正在导出...');
                const resp = await apiCall('backup/export');
                if (!resp) {
                    showToast('导出失败');
                    return;
                }
                const data = resp.data || resp;
                const json = JSON.stringify(data, null, 2);
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `schedule_backup_${new Date().toISOString().slice(0,10)}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                showToast('导出成功');
            } catch (e) {
                console.error('Export failed', e);
                showToast('导出失败');
            }
        },

        async handleImportFile(e) {
            const file = e.target.files[0];
            if (!file) return;
            const { apiCall, showToast } = getUtils();
            const clear = this.importClearCheckbox?.checked || false;
            try {
                const text = await file.text();
                const data = JSON.parse(text);
                showToast('正在导入...');
                const resp = await apiCall('backup/import', {
                    method: 'POST',
                    body: JSON.stringify({ data, clear }),
                });
                if (resp && !resp.error) {
                    showToast('导入成功');
                    if (this.importClearOption) this.importClearOption.style.display = 'none';
                } else {
                    showToast(resp?.message || '导入失败');
                }
            } catch (err) {
                console.error('Import failed', err);
                showToast('导入失败：文件格式错误');
            }
            e.target.value = '';
        },

        async init() {
            this.cacheElements();
            this.bindEvents();
            await this.loadStats();
            await this.loadPatterns();
        }
    };

    window.ScheduleAppSettings = {
        openSettingsView,
        closeSettingsView,
        handleSettingChange,
        saveSettings,
        loadUserContexts,
        saveUserContext,
        openSettingsModal,
        closeSettingsModal,
        loadAiProviders,
        openAiProviderModal,
        closeAiProviderModal,
        saveAiProvider,
        activateAiProvider,
        deleteAiProvider,
        renderUserContexts,
        selectUserContext,
        openUserContextModal,
        closeUserContextModal,
        deleteUserContext,
        updateSelfDescriptionForLlm,
        handleQQReminderToggle,
        handleDragResizeToggle,
        handleDefaultTaskReminderToggle,
        handleAutoAssignBudgetToggle,
        handleTestQQChannel,
        handleViewErrorLogs,
        loadErrorLogs,
        handleClearErrorLogs,
        escHtml,
        handleCleanupTestEntries,
        showSemanticHelpModal,
        loadEventHistoryAll,
        loadDeletedEvents,
        restoreDeletedEvent,
        permanentDeleteEvent,
        loadEventModifications,
        undoEventModification,
        loadExpenseOperationLogs,
        undoExpenseOperation,
        loadDeletedExpenses,
        restoreDeletedExpense,
    };

    // Expose to global scope for inline onclick handlers (legacy compatibility)
    window.ScheduleAppSettingsGlobal = window.ScheduleAppSettings;

    window.SettingsLearningUI = SettingsLearningUI;

    // Initialize learning UI after settings module loads
    if (window.ScheduleAppCore && window.ScheduleAppCore.state) {
        SettingsLearningUI.init();
    }

})();
