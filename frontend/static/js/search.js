(function () {
    'use strict';

    let searchDebounceTimer = null;

    const core = () => window.ScheduleAppCore || {};

    function closeSearch() {
        const searchModal = document.getElementById('searchModal');
        const searchInput = document.getElementById('searchInput');
        const searchResults = document.getElementById('searchResults');
        if (!searchModal) return;
        searchModal.classList.add('hidden');
        if (searchInput) searchInput.value = '';
        if (searchResults) searchResults.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 32px;">输入关键词搜索</div>';
    }

    function initSearch() {
        const searchBtn = document.getElementById('searchBtn');
        const searchModal = document.getElementById('searchModal');
        const searchInput = document.getElementById('searchInput');
        const searchClose = document.getElementById('searchClose');
        const searchBackdrop = document.getElementById('searchModalBackdrop');
        const searchResults = document.getElementById('searchResults');

        if (!searchBtn || !searchModal) return;

        searchBtn.addEventListener('click', () => {
            searchModal.classList.remove('hidden');
            setTimeout(() => searchInput.focus(), 100);
        });

        searchClose.addEventListener('click', closeSearch);
        searchBackdrop.addEventListener('click', closeSearch);

        searchInput.addEventListener('input', () => {
            clearTimeout(searchDebounceTimer);
            const q = searchInput.value.trim();
            if (!q) {
                searchResults.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 32px;">输入关键词搜索</div>';
                return;
            }
            searchDebounceTimer = setTimeout(() => performSearch(q), 200);
        });

        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                if (searchModal.classList.contains('hidden')) {
                    searchModal.classList.remove('hidden');
                    setTimeout(() => searchInput.focus(), 100);
                } else {
                    closeSearch();
                }
            }
            if (e.key === 'Escape' && !searchModal.classList.contains('hidden')) {
                closeSearch();
            }
        });
    }

    async function performSearch(q) {
        const resultsEl = document.getElementById('searchResults');
        resultsEl.innerHTML = '<div style="text-align: center; padding: 24px; color: var(--text-muted);">搜索中...</div>';

        try {
            const resp = core().apiCall ? core().apiCall(`search?q=${encodeURIComponent(q)}`) : await (async () => {
                const token = window.ScheduleAppAuth?.getToken?.();
                const fingerprint = window.ScheduleAppAuth?.getFingerprint?.();
                const headers = { 'Content-Type': 'application/json' };
                if (token) headers['Authorization'] = 'Bearer ' + token;
                if (fingerprint) headers['X-Device-Fingerprint'] = fingerprint;
                const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { headers });
                return r.json();
            })();
            const data = resp || { events: [], notes: [], goals: [] };
            renderSearchResults(data, q);
        } catch (e) {
            resultsEl.innerHTML = '<div style="text-align: center; padding: 24px; color: var(--color-danger, #dc2626);">搜索失败</div>';
        }
    }

    function renderSearchResults(data, q) {
        const resultsEl = document.getElementById('searchResults');
        const total = (data.events?.length || 0) + (data.notes?.length || 0) + (data.goals?.length || 0);
        const escapeHtml = core().escapeHtml || window.ScheduleAppUtils?.escapeHtml || function(str) {
            if (!str) return '';
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        };

        if (total === 0) {
            resultsEl.innerHTML = `<div style="text-align: center; padding: 32px; color: var(--text-muted);">没有找到 "${escapeHtml(q)}" 相关内容</div>`;
            return;
        }

        let html = '';

        if (data.events?.length) {
            html += '<div class="search-group-header">📅 日程</div>';
            data.events.forEach(ev => {
                html += `<div class="search-result-item" data-type="event" data-id="${ev.id}">
                    <div class="search-result-icon" style="background: #E3F2FD; color: #1976D2;">📅</div>
                    <div class="search-result-text">
                        <div class="search-result-title">${escapeHtml(ev.title)}</div>
                        <div class="search-result-sub">${ev.start_time ? formatSearchTime(ev.start_time) : '无时间'}</div>
                    </div>
                </div>`;
            });
        }

        if (data.notes?.length) {
            html += '<div class="search-group-header">📓 笔记</div>';
            data.notes.forEach(n => {
                html += `<div class="search-result-item" data-type="note" data-id="${n.id}">
                    <div class="search-result-icon" style="background: #FFF3E0; color: #F57C00;">📓</div>
                    <div class="search-result-text">
                        <div class="search-result-title">${escapeHtml(n.title || '无标题')}</div>
                        <div class="search-result-sub">${escapeHtml(String(n.content || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 60))}</div>
                    </div>
                </div>`;
            });
        }

        if (data.goals?.length) {
            html += '<div class="search-group-header">🎯 目标</div>';
            data.goals.forEach(g => {
                const horizonLabel = g.horizon === 'short' ? '短期' : g.horizon === 'semester' ? '学期' : '长期';
                html += `<div class="search-result-item" data-type="goal" data-id="${g.id}">
                    <div class="search-result-icon" style="background: #E8F5E9; color: #388E3C;">🎯</div>
                    <div class="search-result-text">
                        <div class="search-result-title">${escapeHtml(g.title)}</div>
                        <div class="search-result-sub">${horizonLabel}</div>
                    </div>
                </div>`;
            });
        }

        resultsEl.innerHTML = html;

        resultsEl.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', () => {
                const type = item.dataset.type;
                const id = item.dataset.id;
                const searchModal = document.getElementById('searchModal');
                const searchInput = document.getElementById('searchInput');
                if (searchModal) searchModal.classList.add('hidden');
                if (searchInput) searchInput.value = '';
                if (type === 'event') {
                    window.ScheduleAppViewRouter?.switchView?.('todo');
                } else if (type === 'note') {
                    window.ScheduleAppViewRouter?.switchView?.('notepad');
                    setTimeout(() => {
                        if (window.ScheduleAppNotepad?.selectNote) {
                            window.ScheduleAppNotepad.selectNote(parseInt(id));
                        }
                    }, 500);
                } else if (type === 'goal') {
                    window.ScheduleAppViewRouter?.switchView?.('goals');
                }
            });
        });
    }

    function formatSearchTime(isoStr) {
        try {
            const d = new Date(isoStr);
            const m = d.getMonth() + 1;
            const day = d.getDate();
            const h = d.getHours().toString().padStart(2, '0');
            const min = d.getMinutes().toString().padStart(2, '0');
            return `${m}月${day}日 ${h}:${min}`;
        } catch { return isoStr; }
    }

    window.ScheduleAppSearch = {
        initSearch,
        closeSearch,
        performSearch,
        renderSearchResults,
        formatSearchTime,
    };
})();
