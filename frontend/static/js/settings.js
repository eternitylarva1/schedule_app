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
        const { fetchSettings } = getUtils();

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
    }

    async function saveUserContext() {
        const state = getState();
        const elements = getElements();
        const { apiCall, showToast } = getUtils();
        const content = (elements.userContextContent && elements.userContextContent.value || '').trim();

        if (!content) {
            showToast('请输入现状描述');
            return;
        }

        try {
            let result;
            if (state.selectedUserContextId) {
                result = await apiCall(`user-contexts/${state.selectedUserContextId}`, 'PUT', { content });
            } else {
                result = await apiCall('user-contexts', 'POST', { content });
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
        }
    }

    window.ScheduleAppSettings = {
        openSettingsView,
        closeSettingsView,
        handleSettingChange,
        saveSettings,
        loadUserContexts,
        saveUserContext,
    };

})();
