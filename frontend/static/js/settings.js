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
    };

    window.SettingsLearningUI = SettingsLearningUI;

    // Initialize learning UI after settings module loads
    if (window.ScheduleAppCore && window.ScheduleAppCore.state) {
        SettingsLearningUI.init();
    }

})();
