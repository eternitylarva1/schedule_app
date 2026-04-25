/**
 * Schedule App - Settings Module
 * Settings view and configuration management
 */

(function() {
    'use strict';

    const getState = () => (window.ScheduleAppCore && window.ScheduleAppCore.state) || {};
    const getElements = () => (window.ScheduleAppCore && window.ScheduleAppCore.elements) || {};
    const getUtils = () => window.ScheduleAppCore || {};

    async function openSettingsView() {
        const state = getState();
        const elements = getElements();
        const { fetchSettings, updateSetting, showToast } = getUtils();

        state.enableDragResize = localStorage.getItem('enableDragResize') === 'true';
        elements.enableDragResize.checked = state.enableDragResize;

        try {
            const settings = await fetchSettings();
            if (settings) {
                state.qqReminderEnabled = settings.qq_reminder_enabled || false;
                state.defaultTaskReminderEnabled = settings.default_task_reminder_enabled !== false;
                state.userSelfDescription = settings.user_self_description || '';
                state.userContexts = settings.user_contexts || [];
                state.llmApiBase = settings.llm_api_base || '';
                state.llmModel = settings.llm_model || '';
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
        }

        elements.settingsModal.classList.remove('hidden');
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
        const { fetchSettings, showToast } = getUtils();

        try {
            const settings = await fetchSettings();
            if (settings) {
                state.userSelfDescription = settings.user_self_description || '';
                state.userContexts = settings.user_contexts || [];
            }
        } catch (error) {
            console.error('Failed to load user contexts:', error);
        }
    }

    async function saveUserContext(context) {
        const { updateSetting, showToast } = getUtils();
        try {
            await updateSetting('user_contexts', context);
            showToast('上下文已保存');
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
