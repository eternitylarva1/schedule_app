/**
 * Schedule App - Gallery Module
 * 图库子视图：网格展示 + 大图查看 + 筛选 + 删除
 */

(function() {
    'use strict';

    const getState = () => (window.ScheduleAppCore && window.ScheduleAppCore.state) || {};
    const getUtils = () => window.ScheduleAppCore || {};

    // Multi-select mode
    let _selectedIds = new Set();
    let _isMultiSelectMode = false;

    // ============================================================
    // Public: render entry point (called by notepad.js)
    // ============================================================

    async function renderGalleryView() {
        const state = getState();
        const elements = getElements();
        const container = elements.notepadContainer;
        if (!container) return;

        if (elements.headerTitle) elements.headerTitle.textContent = '图库';

        const notesApp = document.getElementById('notesApp');
        const mobileSubtabs = document.getElementById('notesMobileSubtabs');
        if (notesApp) notesApp.classList.add('hidden');
        if (mobileSubtabs) mobileSubtabs.classList.add('hidden');
        container.classList.remove('hidden');

        container.innerHTML = _getShellHTML();
        _bindShellEvents();
        await _loadImages();

        if (elements.notepadInputArea) elements.notepadInputArea.classList.add('hidden');
        if (elements.contentAddBtn) elements.contentAddBtn.classList.add('hidden');
    }

    // ============================================================
    // Shell HTML
    // ============================================================

    function _getShellHTML() {
        return `
            <div class="gallery-view">
                <div class="gallery-toolbar">
                    <select class="gallery-select" id="galleryModelFilter">
                        <option value="">全部模型</option>
                    </select>
                    <input type="text" class="gallery-search" id="gallerySearchInput"
                        placeholder="🔍 搜索 prompt..." autocomplete="off">
                    <button class="btn" id="galleryMultiBtn" type="button">
                        ☑ 多选
                    </button>
                </div>
                <div class="gallery-grid" id="galleryGrid">
                    <div class="gallery-loading">加载中...</div>
                </div>
                <div class="gallery-empty hidden" id="galleryEmpty">
                    <div class="gallery-empty-icon">🖼</div>
                    <div class="gallery-empty-text">还没有图片</div>
                    <div class="gallery-empty-hint">去生图试试吧</div>
                </div>
                <div class="gallery-multi-bar hidden" id="galleryMultiBar">
                    <span class="gallery-multi-count" id="galleryMultiCount">已选择 0 张</span>
                    <button class="btn btn-danger" id="galleryMultiDeleteBtn">删除所选</button>
                    <button class="btn btn-secondary" id="galleryMultiCancelBtn">取消</button>
                </div>
            </div>
            <div class="gallery-lightbox hidden" id="galleryLightbox">
                <div class="gallery-lightbox-backdrop" id="galleryLightboxBackdrop"></div>
                <button class="gallery-lightbox-close" id="galleryLightboxClose" aria-label="关闭">×</button>
                <div class="gallery-lightbox-content" id="galleryLightboxContent">
                    <div class="gallery-lightbox-card">
                        <img class="gallery-lightbox-img" id="galleryLightboxImg" src="" alt="">
                        <div class="gallery-lightbox-info" id="galleryLightboxInfo">
                            <div class="gallery-lbx-prompt" id="galleryLbxPrompt"></div>
                            <div class="gallery-lbx-meta" id="galleryLbxMeta"></div>
                        </div>
                    </div>
                </div>
                <div class="gallery-lightbox-actions">
                    <button class="btn btn-secondary" id="galleryLbxInsertBtn" type="button">📝 插入笔记</button>
                    <button class="btn btn-secondary" id="galleryLbxDownloadBtn" type="button">⬇ 下载</button>
                    <button class="btn btn-danger" id="galleryLbxDeleteBtn" type="button">🗑 删除</button>
                </div>
            </div>
        `;
    }

    // ============================================================
    // Shell events
    // ============================================================

    function _bindShellEvents() {
        // Model filter
        document.getElementById('galleryModelFilter')?.addEventListener('change', () => _loadImages());

        // Search debounce
        const searchInput = document.getElementById('gallerySearchInput');
        if (searchInput && searchInput.dataset.bound !== '1') {
            searchInput.dataset.bound = '1';
            let timer = null;
            searchInput.addEventListener('input', () => {
                clearTimeout(timer);
                timer = setTimeout(() => _loadImages(), 250);
            });
        }

        // Multi-select toggle
        document.getElementById('galleryMultiBtn')?.addEventListener('click', () => {
            _isMultiSelectMode = !_isMultiSelectMode;
            _selectedIds.clear();
            _updateMultiSelectUI();
        });

        // Multi-delete
        document.getElementById('galleryMultiDeleteBtn')?.addEventListener('click', _handleMultiDelete);
        document.getElementById('galleryMultiCancelBtn')?.addEventListener('click', () => {
            _isMultiSelectMode = false;
            _selectedIds.clear();
            _updateMultiSelectUI();
        });

        // Lightbox close
        document.getElementById('galleryLightboxBackdrop')?.addEventListener('click', closeLightbox);
        document.getElementById('galleryLightboxClose')?.addEventListener('click', closeLightbox);
        document.getElementById('galleryLbxInsertBtn')?.addEventListener('click', _handleLbxInsert);
        document.getElementById('galleryLbxDownloadBtn')?.addEventListener('click', _handleLbxDownload);
        document.getElementById('galleryLbxDeleteBtn')?.addEventListener('click', _handleLbxDelete);
    }

    // ============================================================
    // Load images
    // ============================================================

    async function _loadImages() {
        const { apiCall } = getUtils();
        const grid = document.getElementById('galleryGrid');
        const empty = document.getElementById('galleryEmpty');
        if (!grid) return;

        const modelFilter = document.getElementById('galleryModelFilter')?.value || '';
        const searchQuery = document.getElementById('gallerySearchInput')?.value.trim() || '';

        grid.innerHTML = '<div class="gallery-loading">加载中...</div>';
        empty.classList.add('hidden');

        try {
            const params = new URLSearchParams();
            if (modelFilter) params.set('model', modelFilter);
            if (searchQuery) params.set('source', searchQuery);
            params.set('limit', '50');
            params.set('offset', '0');

            const data = await apiCall('images?' + params.toString());
            const images = Array.isArray(data) ? data : [];

            // Populate model filter
            _populateModelFilter(images, modelFilter);

            if (images.length === 0) {
                grid.innerHTML = '';
                empty.classList.remove('hidden');
                return;
            }

            _renderGrid(images);
        } catch (e) {
            grid.innerHTML = '<div class="gallery-loading" style="color:var(--accent-danger)">加载失败</div>';
        }
    }

    function _populateModelFilter(images, currentFilter) {
        const select = document.getElementById('galleryModelFilter');
        if (!select) return;
        const models = [...new Set(images.map(img => img.model).filter(Boolean))];
        if (models.length <= 1) return; // Don't populate if only one model

        const currentVal = select.value;
        select.innerHTML = '<option value="">全部模型</option>' +
            models.map(m => `<option value="${_escAttr(m)}"${m === currentVal ? ' selected' : ''}>${_escHtml(m)}</option>`).join('');
    }

    function _renderGrid(images) {
        const grid = document.getElementById('galleryGrid');
        if (!grid) return;

        grid.innerHTML = images.map(img => {
            const isSelected = _selectedIds.has(img.id);
            const time = img.created_at ? new Date(img.created_at).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
            return `
                <div class="gallery-item ${isSelected ? 'selected' : ''}" data-id="${img.id}" data-model="${_escAttr(img.model || '')}" data-time="${_escAttr(time)}">
                    <img class="gallery-thumb" src="${getImageUrl(img.id)}" alt="${_escHtml(img.prompt || '')}"
                        loading="lazy" data-image-id="${img.id}">
                    ${_isMultiSelectMode ? `<div class="gallery-item-check">${isSelected ? '☑' : '☐'}</div>` : ''}
                </div>
            `;
        }).join('');

        // Click to open lightbox (or toggle select in multi mode)
        grid.querySelectorAll('.gallery-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const id = item.dataset.id;
                if (_isMultiSelectMode) {
                    if (_selectedIds.has(id)) _selectedIds.delete(id);
                    else _selectedIds.add(id);
                    _updateMultiSelectUI();
                } else {
                    openLightbox(id);
                }
            });
        });

        // Long press for multi-select
        grid.querySelectorAll('.gallery-item').forEach(item => {
            let timer = null;
            item.addEventListener('touchstart', () => {
                timer = setTimeout(() => {
                    if (!_isMultiSelectMode) {
                        _isMultiSelectMode = true;
                        _updateMultiSelectUI();
                        getUtils().showToast?.('已进入多选模式，点击选择');
                    }
                    const id = item.dataset.id;
                    _selectedIds.add(id);
                    _updateMultiSelectUI();
                }, 500);
            });
            item.addEventListener('touchend', () => clearTimeout(timer));
            item.addEventListener('touchmove', () => clearTimeout(timer));
        });
    }

    function _updateMultiSelectUI() {
        const grid = document.getElementById('galleryGrid');
        const multiBar = document.getElementById('galleryMultiBar');
        const multiBtn = document.getElementById('galleryMultiBtn');
        const countEl = document.getElementById('galleryMultiCount');

        // Update items
        grid?.querySelectorAll('.gallery-item').forEach(item => {
            const id = item.dataset.id;
            const isSelected = _selectedIds.has(id);
            item.classList.toggle('selected', isSelected);
            const check = item.querySelector('.gallery-item-check');
            if (check) check.textContent = isSelected ? '☑' : '☐';
        });

        // Update toolbar visibility
        if (_isMultiSelectMode) {
            multiBar?.classList.remove('hidden');
            multiBtn?.classList.add('hidden');
        } else {
            multiBar?.classList.add('hidden');
            multiBtn?.classList.remove('hidden');
        }

        if (countEl) countEl.textContent = `已选择 ${_selectedIds.size} 张`;
    }

    // ============================================================
    // Lightbox
    // ============================================================

    function openLightbox(id) {
        const lightbox = document.getElementById('galleryLightbox');
        const img = document.getElementById('galleryLightboxImg');
        const promptEl = document.getElementById('galleryLbxPrompt');
        const metaEl = document.getElementById('galleryLbxMeta');
        if (!lightbox || !img) return;

        img.src = getImageUrl(id);
        img.alt = '图片';
        img.dataset.imageId = id;

        // Get image data from the thumbnail element
        const thumb = document.querySelector(`.gallery-thumb[data-image-id="${id}"]`);
        const item = thumb?.closest('.gallery-item');
        const prompt = thumb?.alt || '';
        const model = item?.dataset?.model || '';
        const time = item?.dataset?.time || '';

        if (promptEl) promptEl.textContent = prompt;
        if (metaEl) metaEl.textContent = model + (time ? ' · ' + time : '');

        lightbox.dataset.currentId = id;
        lightbox.classList.remove('hidden');
    }

    function closeLightbox() {
        const lightbox = document.getElementById('galleryLightbox');
        lightbox?.classList.add('hidden');
    }

    // ============================================================
    // Lightbox actions
    // ============================================================

    async function _handleLbxInsert() {
        const lightbox = document.getElementById('galleryLightbox');
        const id = lightbox?.dataset?.currentId;
        if (!id) return;

        const imgUrl = getImageUrl(id);
        const contentEl = document.getElementById('noteInlineContent');
        if (contentEl) {
            const imgEl = document.createElement('img');
            imgEl.src = imgUrl;
            imgEl.style.maxWidth = '100%';
            imgEl.style.borderRadius = 'var(--radius-md)';
            imgEl.style.margin = '8px 0';
            imgEl.dataset.imageId = id;

            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
                const range = sel.getRangeAt(0);
                range.deleteContents();
                range.insertNode(imgEl);
                range.setStartAfter(imgEl);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
            } else {
                contentEl.appendChild(imgEl);
            }

            if (window.ScheduleAppNoteEditor?._triggerAutoSave) {
                window.ScheduleAppNoteEditor._triggerAutoSave();
            }
            getUtils().showToast?.('已插入到当前笔记');
            closeLightbox();
        } else {
            getUtils().showToast?.('请先打开一个笔记');
        }
    }

    function _handleLbxDownload() {
        const lightbox = document.getElementById('galleryLightbox');
        const id = lightbox?.dataset?.currentId;
        if (!id) return;

        const a = document.createElement('a');
        a.href = getImageUrl(id);
        a.download = `img_${id}_${Date.now()}.png`;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    async function _handleLbxDelete() {
        const lightbox = document.getElementById('galleryLightbox');
        const id = lightbox?.dataset?.currentId;
        if (!id) return;

        const confirmed = confirm('确定要删除这张图片吗？');
        if (!confirmed) return;

        const { apiCall, showToast } = getUtils();
        try {
            await apiCall(`images/${id}`, { method: 'DELETE' });
            showToast('已删除');
            closeLightbox();
            await _loadImages();
        } catch (e) {
            showToast('删除失败');
        }
    }

    async function _handleMultiDelete() {
        if (_selectedIds.size === 0) return;
        const confirmed = confirm(`确定要删除选中的 ${_selectedIds.size} 张图片吗？`);
        if (!confirmed) return;

        const { apiCall, showToast } = getUtils();
        let deleted = 0;
        for (const id of _selectedIds) {
            try {
                await apiCall(`images/${id}`, { method: 'DELETE' });
                deleted++;
            } catch {}
        }

        showToast(`已删除 ${deleted} 张`);
        _isMultiSelectMode = false;
        _selectedIds.clear();
        _updateMultiSelectUI();
        await _loadImages();
    }

    // ============================================================
    // getImageUrl helper
    // ============================================================

    function getImageUrl(id) {
        const token = window.ScheduleAppAuth?.getToken?.() || '';
        const fp = window.ScheduleAppAuth?.getFingerprint?.() || '';
        return `/api/images/${id}?token=${encodeURIComponent(token)}&fp=${encodeURIComponent(fp)}`;
    }

    // ============================================================
    // Helpers
    // ============================================================

    function getElements() {
        return (window.ScheduleAppCore && window.ScheduleAppCore.elements) || {};
    }

    function _escHtml(str) {
        if (!str) return '';
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    function _escAttr(str) {
        return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // ============================================================
    // Exports
    // ============================================================

    window.ScheduleAppGallery = {
        renderGalleryView,
        openLightbox,
        closeLightbox,
        getImageUrl,
    };

})();
