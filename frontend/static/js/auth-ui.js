/**
 * Schedule App - Auth UI Module
 * Login protection overlay and authentication flow
 */

(function() {
    'use strict';

    // Module state (like st()._eventsBound pattern)
    const state = {
        _initialized: false,
        _eventsBound: false,
        _activePanel: null, // 'setup' | 'login'
        _loginCountdown: null, // setInterval id for lock countdown
    };

    // DOM references cached after init
    let els = {};

    // ============================================================
    // Token Management
    // ============================================================

    const TOKEN_KEY = 'auth_token';

    function getToken() {
        // Try sessionStorage first (remember me = false), then localStorage
        return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || null;
    }

    function setToken(token, rememberMe = true) {
        // Clear both first
        sessionStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(TOKEN_KEY);
        if (rememberMe) {
            localStorage.setItem(TOKEN_KEY, token);
        } else {
            sessionStorage.setItem(TOKEN_KEY, token);
        }
    }

    function clearToken() {
        sessionStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(TOKEN_KEY);
    }

    // ============================================================
    // Device Fingerprint
    // ============================================================

    function getFingerprint() {
        const parts = [
            navigator.userAgent,
            navigator.platform,
            navigator.language,
            Intl.DateTimeFormat().resolvedOptions().timeZone,
            screen.width,
            screen.height,
            devicePixelRatio,
            navigator.hardwareConcurrency || '',
            navigator.deviceMemory || '',
        ];
        const str = parts.join('|');
        // djb2 hash
        let hash = 5381;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
            hash = hash >>> 0; // keep as uint32
        }
        return hash.toString(16);
    }

    // ============================================================
    // API Helpers (low-level, no toast on error)
    // ============================================================

    async function apiRequest(endpoint, options = {}) {
        const token = getToken();
        const headers = {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': 'Bearer ' + token } : {}),
            ...(options.headers || {}),
        };
        const fingerprint = getFingerprint();
        if (fingerprint) {
            headers['X-Device-Fingerprint'] = fingerprint;
        }

        try {
            const resp = await fetch('/api/' + endpoint, {
                method: options.method || 'GET',
                headers,
                body: options.body || undefined,
            });
            let data;
            try {
                data = await resp.json();
            } catch {
                data = null;
            }
            return { ok: resp.ok, status: resp.status, data };
        } catch (err) {
            return { ok: false, status: 0, data: null, error: err.message };
        }
    }

    // Fallback to core apiCall if apiRequest not yet available
    function fallbackApiCall(endpoint, options = {}) {
        const core = window.ScheduleAppCore || {};
        if (core.apiCall) {
            return core.apiCall(endpoint, options);
        }
        return Promise.reject(new Error('No API available'));
    }

    // ============================================================
    // Auth Operations
    // ============================================================

    async function checkAuthStatus() {
        // Try to fetch auth status
        const result = await apiRequest('auth/status');
        if (result.ok && result.data && result.data.data) {
            const data = result.data.data;
            return {
                needs_setup: data.needs_setup,
                authenticated: data.authenticated,
            };
        }
        // If server returns 401 or error, treat as needing login
        if (result.status === 401 || result.status === 0) {
            return { needs_setup: false, authenticated: false };
        }
        // Any other error - assume not authenticated
        return { needs_setup: false, authenticated: false };
    }

    async function submitSetup(password, confirmPassword) {
        // Client-side validation
        if (password.length < 6) {
            return { success: false, message: '密码至少 6 位' };
        }
        if (password !== confirmPassword) {
            return { success: false, message: '两次输入不一致' };
        }

        const result = await apiRequest('auth/setup', {
            method: 'POST',
            body: JSON.stringify({ password }),
        });

        if (result.ok && result.data && result.data.code === 0) {
            // Setup succeeded (no token returned), now auto-login
            return { success: true, needsAutoLogin: true };
        }

        return { success: false, message: result.data?.message || '设置失败，请重试' };
    }

    async function submitLogin(password, rememberMe = true) {
        const result = await apiRequest('auth/login', {
            method: 'POST',
            body: JSON.stringify({ password, fingerprint: getFingerprint() }),
        });

        if (result.ok && result.data && result.data.code === 0) {
            const token = result.data.data?.token;
            if (token) {
                setToken(token, rememberMe);
            }
            return { success: true };
        }

        if (result.status === 401) {
            return { success: false, message: '密码错误' };
        }

        if (result.status === 429) {
            return { success: false, locked: true, message: result.data?.message || '尝试次数过多，请稍后重试' };
        }

        return { success: false, message: result.data?.message || '登录失败，请重试' };
    }

    async function submitChangePassword(oldPassword, newPassword, confirmPassword) {
        if (newPassword.length < 6) {
            return { success: false, message: '新密码至少 6 位' };
        }
        if (newPassword !== confirmPassword) {
            return { success: false, message: '两次输入不一致' };
        }

        const result = await apiRequest('auth/password', {
            method: 'PUT',
            body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
        });

        if (result.ok && result.data && result.data.code === 0) {
            return { success: true };
        }

        if (result.status === 401) {
            return { success: false, message: '旧密码不正确' };
        }

        return { success: false, message: result.data?.message || '修改失败，请重试' };
    }

    async function logout() {
        try {
            await apiRequest('auth/logout', { method: 'POST' });
        } catch {}
        clearToken();
    }

    // ============================================================
    // UI Rendering
    // ============================================================

    function renderState(authState) {
        // authState: { needs_setup: boolean, authenticated?: boolean }
        if (authState.needs_setup) {
            showPanel('setup');
        } else {
            showPanel('login');
        }
    }

    function showPanel(panel) {
        state._activePanel = panel;
        const setupPanel = els.setupPanel;
        const loginPanel = els.loginPanel;

        if (panel === 'setup') {
            setupPanel.classList.remove('hidden');
            loginPanel.classList.add('hidden');
        } else {
            setupPanel.classList.add('hidden');
            loginPanel.classList.remove('hidden');
        }
    }

    function showLogin() {
        showPanel('login');
        showAuth();
    }

    function showSetup() {
        showPanel('setup');
        showAuth();
    }

    function showAuth() {
        els.overlay && els.overlay.classList.remove('hidden');
        // Prevent body scroll
        document.body.style.overflow = 'hidden';
    }

    function hideAuth() {
        els.overlay && els.overlay.classList.add('hidden');
        document.body.style.overflow = '';
    }

    // ============================================================
    // Error Display & Animations
    // ============================================================

    function showError(inputEl, message) {
        const formGroup = inputEl.closest('.auth-form-group');
        if (!formGroup) return;

        let errEl = formGroup.querySelector('.auth-error');
        if (!errEl) {
            errEl = document.createElement('div');
            errEl.className = 'auth-error';
            formGroup.appendChild(errEl);
        }
        errEl.textContent = message;
        errEl.style.display = '';

        // Shake animation on the input
        inputEl.classList.add('auth-shake');
        inputEl.addEventListener('animationend', () => {
            inputEl.classList.remove('auth-shake');
        }, { once: true });
    }

    function clearError(inputEl) {
        const formGroup = inputEl.closest('.auth-form-group');
        if (!formGroup) return;
        const errEl = formGroup.querySelector('.auth-error');
        if (errEl) errEl.style.display = 'none';
    }

    // Parse remaining seconds from a lock message like "尝试次数过多，请 30 秒后重试"
    function parseSecondsFromMessage(message) {
        if (!message) return null;
        const match = message.match(/(\d+)\s*秒/);
        return match ? parseInt(match[1], 10) : null;
    }

    function clearLoginCountdown() {
        if (state._loginCountdown !== null) {
            clearInterval(state._loginCountdown);
            state._loginCountdown = null;
        }
    }

    function startLoginCountdown(seconds, submitBtn) {
        clearLoginCountdown();
        const originalText = submitBtn.textContent;
        let remaining = seconds;

        submitBtn.disabled = true;
        submitBtn.textContent = `${remaining} 秒后可重试`;

        state._loginCountdown = setInterval(() => {
            remaining--;
            if (remaining <= 0) {
                clearLoginCountdown();
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
            } else {
                submitBtn.textContent = `${remaining} 秒后可重试`;
            }
        }, 1000);
    }

    // ============================================================
    // Password Visibility Toggle
    // ============================================================

    function setupPasswordToggle(inputEl, toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const isPassword = inputEl.type === 'password';
            inputEl.type = isPassword ? 'text' : 'password';
            toggleBtn.textContent = isPassword ? '👁️' : '👁️‍🗨️';
        });
    }

    // ============================================================
    // Password Strength Indicator
    // ============================================================

    function updateStrengthIndicator(inputEl, indicatorEl) {
        const password = inputEl.value;
        let level = 0;
        let label = '';

        if (password.length === 0) {
            indicatorEl.style.display = 'none';
            return;
        }

        indicatorEl.style.display = '';

        if (password.length >= 6) level++;
        if (password.length >= 10) level++;
        if (/[A-Z]/.test(password) && /[a-z]/.test(password)) level++;
        if (/\d/.test(password)) level++;
        if (/[^A-Za-z0-9]/.test(password)) level++;

        if (level <= 1) {
            label = '弱';
            indicatorEl.className = 'auth-strength-indicator weak';
        } else if (level <= 3) {
            label = '中等';
            indicatorEl.className = 'auth-strength-indicator medium';
        } else {
            label = '强';
            indicatorEl.className = 'auth-strength-indicator strong';
        }

        indicatorEl.textContent = label;
    }

    // ============================================================
    // Form Handlers
    // ============================================================

    async function handleSetupSubmit(e) {
        e.preventDefault();
        const password = els.setupPassword.value.trim();
        const confirmPassword = els.setupConfirmPassword.value.trim();

        clearError(els.setupPassword);
        clearError(els.setupConfirmPassword);

        const result = await submitSetup(password, confirmPassword);

        if (!result.success) {
            if (result.message === '密码至少 6 位') {
                showError(els.setupPassword, result.message);
            } else if (result.message === '两次输入不一致') {
                showError(els.setupConfirmPassword, result.message);
            } else {
                showError(els.setupPassword, result.message);
            }
            return;
        }

        // Success - auto-login then hide overlay
        if (result.needsAutoLogin) {
            const loginResult = await submitLogin(password, true);
            if (loginResult.success) {
                hideAuth();
                if (window.ScheduleAppCore && window.ScheduleAppCore.onAuthSuccess) {
                    window.ScheduleAppCore.onAuthSuccess();
                }
            } else {
                // Auto-login failed, but password is set - show login panel
                showPanel('login');
                showAuth();
            }
        } else {
            hideAuth();
        }
    }

    async function handleLoginSubmit(e) {
        e.preventDefault();
        const password = els.loginPassword.value.trim();
        const rememberMe = els.loginRememberMe ? els.loginRememberMe.checked : true;

        clearError(els.loginPassword);

        // Find submit button for this form
        const submitBtn = els.loginForm.querySelector('.auth-submit-btn');
        // Clear any pending countdown
        clearLoginCountdown();

        const result = await submitLogin(password, rememberMe);

        if (!result.success) {
            if (result.locked) {
                showError(els.loginPassword, result.message);
                const seconds = parseSecondsFromMessage(result.message) || 30;
                startLoginCountdown(seconds, submitBtn);
            } else if (result.message === '密码错误') {
                showError(els.loginPassword, result.message);
            } else {
                showError(els.loginPassword, result.message);
            }
            return;
        }

        // Success
        hideAuth();

        // Notify core that auth is done (if it has a handler)
        if (window.ScheduleAppCore && window.ScheduleAppCore.onAuthSuccess) {
            window.ScheduleAppCore.onAuthSuccess();
        }
    }

    async function handleChangePasswordSubmit(e) {
        e.preventDefault();
        const oldPassword = els.changeOldPassword.value.trim();
        const newPassword = els.changeNewPassword.value.trim();
        const confirmPassword = els.changeConfirmPassword.value.trim();

        clearError(els.changeOldPassword);
        clearError(els.changeNewPassword);
        clearError(els.changeConfirmPassword);

        const result = await submitChangePassword(oldPassword, newPassword, confirmPassword);

        if (!result.success) {
            if (result.message === '旧密码不正确') {
                showError(els.changeOldPassword, result.message);
            } else if (result.message === '新密码至少 6 位') {
                showError(els.changeNewPassword, result.message);
            } else if (result.message === '两次输入不一致') {
                showError(els.changeConfirmPassword, result.message);
            } else {
                showError(els.changeOldPassword, result.message);
            }
            return;
        }

        // Close modal and show success
        closeChangePasswordModal();
        if (window.ScheduleAppCore && window.ScheduleAppCore.showToast) {
            window.ScheduleAppCore.showToast('密码已修改');
        }
    }

    function handleUnauthorized() {
        clearToken();
        showLogin();
    }

    // ============================================================
    // Change Password Modal
    // ============================================================

    function openChangePasswordModal() {
        // Create modal if not exists
        let modal = document.getElementById('changePasswordModal');
        if (!modal) {
            const modalHtml = `
            <div class="modal hidden" id="changePasswordModal">
                <div class="modal-backdrop" id="changePasswordBackdrop"></div>
                <div class="modal-content">
                    <div class="modal-header">
                        <h2>修改密码</h2>
                        <button class="modal-close" id="changePasswordClose">×</button>
                    </div>
                    <div class="modal-body">
                        <form id="changePasswordForm">
                            <div class="auth-form-group">
                                <label class="auth-label">旧密码</label>
                                <div class="auth-input-wrapper">
                                    <input type="password" id="changeOldPassword" class="auth-input" placeholder="请输入旧密码" autocomplete="current-password">
                                    <button type="button" class="auth-toggle-password" data-target="changeOldPassword">👁️</button>
                                </div>
                            </div>
                            <div class="auth-form-group">
                                <label class="auth-label">新密码</label>
                                <div class="auth-input-wrapper">
                                    <input type="password" id="changeNewPassword" class="auth-input" placeholder="至少 6 位" autocomplete="new-password">
                                    <button type="button" class="auth-toggle-password" data-target="changeNewPassword">👁️</button>
                                </div>
                            </div>
                            <div class="auth-form-group">
                                <label class="auth-label">确认新密码</label>
                                <div class="auth-input-wrapper">
                                    <input type="password" id="changeConfirmPassword" class="auth-input" placeholder="再输入一次" autocomplete="new-password">
                                    <button type="button" class="auth-toggle-password" data-target="changeConfirmPassword">👁️</button>
                                </div>
                            </div>
                            <div class="auth-form-actions">
                                <button type="submit" class="btn btn-primary auth-submit-btn">保存</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            modal = document.getElementById('changePasswordModal');

            // Cache elements
            els.changeOldPassword = modal.querySelector('#changeOldPassword');
            els.changeNewPassword = modal.querySelector('#changeNewPassword');
            els.changeConfirmPassword = modal.querySelector('#changeConfirmPassword');

            // Bind modal events
            modal.querySelector('#changePasswordBackdrop').addEventListener('click', closeChangePasswordModal);
            modal.querySelector('#changePasswordClose').addEventListener('click', closeChangePasswordModal);
            modal.querySelector('#changePasswordForm').addEventListener('submit', handleChangePasswordSubmit);

            // Password toggles
            modal.querySelectorAll('.auth-toggle-password').forEach(btn => {
                const input = document.getElementById(btn.dataset.target);
                if (input) setupPasswordToggle(input, btn);
            });
        }

        // Reset form
        els.changeOldPassword.value = '';
        els.changeNewPassword.value = '';
        els.changeConfirmPassword.value = '';
        clearError(els.changeOldPassword);
        clearError(els.changeNewPassword);
        clearError(els.changeConfirmPassword);

        modal.classList.remove('hidden');
    }

    function closeChangePasswordModal() {
        const modal = document.getElementById('changePasswordModal');
        if (modal) modal.classList.add('hidden');
    }

    // ============================================================
    // Initialization
    // ============================================================

    function cacheElements() {
        els.overlay = document.getElementById('authOverlay');
        els.setupPanel = document.getElementById('authSetupPanel');
        els.loginPanel = document.getElementById('authLoginPanel');
        els.setupForm = document.getElementById('authSetupForm');
        els.loginForm = document.getElementById('authLoginForm');
        els.setupPassword = document.getElementById('authSetupPassword');
        els.setupConfirmPassword = document.getElementById('authSetupConfirmPassword');
        els.setupStrength = document.getElementById('authSetupStrength');
        els.loginPassword = document.getElementById('authLoginPassword');
        els.loginRememberMe = document.getElementById('authLoginRememberMe');
    }

    function bindEvents() {
        if (state._eventsBound) return;
        state._eventsBound = true;

        // Setup form
        els.setupForm.addEventListener('submit', handleSetupSubmit);

        // Setup password toggle
        const setupToggle = els.setupForm.querySelector('.auth-toggle-password');
        if (setupToggle) setupPasswordToggle(els.setupPassword, setupToggle);

        // Setup strength indicator
        els.setupPassword.addEventListener('input', () => {
            updateStrengthIndicator(els.setupPassword, els.setupStrength);
            clearError(els.setupPassword);
        });
        els.setupConfirmPassword.addEventListener('input', () => {
            clearError(els.setupConfirmPassword);
        });

        // Login form
        els.loginForm.addEventListener('submit', handleLoginSubmit);

        // Login password toggle
        const loginToggle = els.loginForm.querySelector('.auth-toggle-password');
        if (loginToggle) setupPasswordToggle(els.loginPassword, loginToggle);

        // Login password input - clear error on input
        els.loginPassword.addEventListener('input', () => {
            clearError(els.loginPassword);
        });
    }

    async function initAuthUI() {
        if (state._initialized) return false;
        state._initialized = true;

        cacheElements();
        bindEvents();

        // Check auth status and show appropriate panel
        const authState = await checkAuthStatus();
        renderState(authState);

        // If authenticated, hide overlay and return true
        if (authState.authenticated) {
            hideAuth();
            return true;
        }

        // Not authenticated - show overlay and return false
        showAuth();
        return false;
    }

    // ============================================================
    // Settings Integration
    // ============================================================

    function addSettingsEntries() {
        // Called by settings.js to add auth entries
    }

    function initSettingsEntries() {
        // No-op: settings.js calls addSettingsEntries directly
    }

    // ============================================================
    // Exports
    // ============================================================

    window.ScheduleAppAuth = {
        initAuthUI,
        showAuth,
        hideAuth,
        renderState,
        showLogin,
        showSetup,
        handleUnauthorized,
        getFingerprint,
        getToken,
        setToken,
        clearToken,
        logout,
        openChangePasswordModal,
        closeChangePasswordModal,
        addSettingsEntries,
    };

})();
