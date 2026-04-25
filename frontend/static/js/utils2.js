/**
 * Schedule App - Extended Utilities Module
 * Standalone utility functions extracted from main.js
 */

(function() {
    'use strict';

    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function truncate2Lines(text, maxChars = 50) {
        if (!text) return '';
        const lines = text.split('\n');
        let result = '';
        for (const line of lines) {
            if (result) result += ' ';
            result += line;
            if (result.length > maxChars) {
                return result.substring(0, maxChars) + '...';
            }
        }
        return result;
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

    function showFatalDebugBanner(message) {
        const id = 'fatalDebugBanner';
        let banner = document.getElementById(id);
        if (!banner) {
            banner = document.createElement('div');
            banner.id = id;
            banner.style.position = 'fixed';
            banner.style.top = '0';
            banner.style.left = '0';
            banner.style.right = '0';
            banner.style.zIndex = '99999';
            banner.style.padding = '10px 12px';
            banner.style.background = '#b91c1c';
            banner.style.color = '#fff';
            banner.style.fontSize = '12px';
            banner.style.lineHeight = '1.4';
            banner.style.whiteSpace = 'pre-wrap';
            document.body.appendChild(banner);
        }
        banner.textContent = `前端错误: ${message}`;
    }

    function registerGlobalErrorHandlers(showToast) {
        window.addEventListener('error', (event) => {
            const msg = event?.error?.message || event?.message || 'Unknown Error';
            console.error('[GlobalError]', event.error || event);
            if (showToast) showToast(`页面错误: ${msg}`);
            showFatalDebugBanner(msg);
        });

        window.addEventListener('unhandledrejection', (event) => {
            const reason = event?.reason;
            const msg = typeof reason === 'string' ? reason : (reason?.message || 'Unhandled Promise Rejection');
            console.error('[UnhandledRejection]', reason);
            if (showToast) showToast(`异步错误: ${msg}`);
            showFatalDebugBanner(msg);
        });
    }

    function injectToastStyles() {
        if (document.getElementById('toast-styles')) return;
        const style = document.createElement('style');
        style.id = 'toast-styles';
        style.textContent = `
            .toast {
                position: fixed;
                bottom: calc(var(--tab-bar-height) + 20px);
                left: 50%;
                transform: translateX(-50%) translateY(100px);
                background: var(--bg-card);
                color: var(--text-primary);
                padding: 12px 24px;
                border-radius: var(--radius-md);
                box-shadow: var(--shadow-lg);
                font-size: var(--font-size-md);
                z-index: 2000;
                opacity: 0;
                transition: transform var(--transition-normal), opacity var(--transition-normal);
            }
            .toast.visible {
                transform: translateX(-50%) translateY(0);
                opacity: 1;
            }
        `;
        document.head.appendChild(style);
    }

    window.ScheduleAppUtils = {
        debounce,
        escapeHtml,
        truncate2Lines,
        getTextColorForBackground,
        showFatalDebugBanner,
        registerGlobalErrorHandlers,
        injectToastStyles,
    };

})();
