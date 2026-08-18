/**
 * Schedule App - Image Generation Module
 * 生图子视图：prompt 输入 → 生成 → 结果展示
 */

(function() {
    'use strict';

    const getState = () => (window.ScheduleAppCore && window.ScheduleAppCore.state) || {};
    const getUtils = () => window.ScheduleAppCore || {};

    // Active generation request controller
    let _abortController = null;

    // ============================================================
    // Public: render entry point (called by notepad.js)
    // ============================================================

    async function renderImageGenView() {
        const state = getState();
        const elements = getElements();
        const container = elements.notepadContainer;
        if (!container) return;

        // Update header
        if (elements.headerTitle) elements.headerTitle.textContent = '生图';

        // Hide notes app, show our container
        const notesApp = document.getElementById('notesApp');
        const mobileSubtabs = document.getElementById('notesMobileSubtabs');
        if (notesApp) notesApp.classList.add('hidden');
        if (mobileSubtabs) mobileSubtabs.classList.add('hidden');
        container.classList.remove('hidden');

        // Render shell
        container.innerHTML = _getShellHTML();

        // Bind events and load providers
        _bindEvents();
        await _loadImageProviders();

        // Hide input area during image-gen
        if (elements.notepadInputArea) elements.notepadInputArea.classList.add('hidden');
        if (elements.contentAddBtn) elements.contentAddBtn.classList.add('hidden');
    }

    // ============================================================
    // Shell HTML
    // ============================================================

    function _getShellHTML() {
        return `
            <div class="img-gen-view">
                <div class="img-gen-result" id="imgGenResult">
                    <div class="img-gen-empty" id="imgGenEmpty">
                        <div class="img-gen-empty-icon">🎨</div>
                        <div class="img-gen-empty-text">输入描述，开始创作</div>
                    </div>
                    <div class="img-gen-image-wrapper hidden" id="imgGenImageWrapper">
                        <img class="img-gen-image" id="imgGenImage" src="" alt="生成结果">
                        <div class="img-gen-image-actions">
                            <button class="btn btn-secondary" id="imgGenSaveBtn">📝 保存到笔记</button>
                            <button class="btn btn-secondary" id="imgGenDownloadBtn">⬇ 下载</button>
                            <button class="btn btn-secondary" id="imgGenRegenBtn">🔄 重新生成</button>
                        </div>
                    </div>
                    <div class="img-gen-error hidden" id="imgGenError"></div>
                </div>
                <div class="img-gen-input-area">
                    <div class="img-gen-prompt-wrap">
                        <textarea class="img-gen-prompt" id="imgGenPrompt"
                            placeholder="描述你想生成的图片，如：一只赛博朋克风格的猫咪在未来城市中..."
                            rows="3" autocomplete="off"></textarea>
                    </div>
                    <div class="img-gen-advanced-toggle">
                        <button class="img-gen-adv-btn" id="imgGenAdvToggle" type="button">
                            ⚙ 高级选项 <span id="imgGenAdvArrow">▼</span>
                        </button>
                    </div>
                    <div class="img-gen-advanced hidden" id="imgGenAdvanced">
                        <div class="img-gen-adv-row">
                            <label class="img-gen-adv-label">模型</label>
                            <select class="img-gen-adv-select" id="imgGenModelSelect">
                                <option value="">加载中...</option>
                            </select>
                        </div>
                        <div class="img-gen-adv-row">
                            <label class="img-gen-adv-label">尺寸</label>
                            <select class="img-gen-adv-select" id="imgGenSizeSelect">
                                <option value="1:1">1:1 (正方形)</option>
                                <option value="16:9">16:9 (宽屏)</option>
                                <option value="9:16">9:16 (竖版)</option>
                            </select>
                        </div>
                    </div>
                    <button class="btn btn-primary img-gen-submit-btn" id="imgGenSubmitBtn">
                        生成
                    </button>
                </div>
            </div>
        `;
    }

    // ============================================================
    // Event binding (idempotent)
    // ============================================================

    function _bindEvents() {
        const submitBtn = document.getElementById('imgGenSubmitBtn');
        if (!submitBtn || submitBtn.dataset.bound === '1') return;
        submitBtn.dataset.bound = '1';

        submitBtn.addEventListener('click', handleGenerate);

        document.getElementById('imgGenAdvToggle')?.addEventListener('click', () => {
            const adv = document.getElementById('imgGenAdvanced');
            const arrow = document.getElementById('imgGenAdvArrow');
            const isHidden = adv.classList.contains('hidden');
            adv.classList.toggle('hidden');
            arrow.textContent = isHidden ? '▲' : '▼';
        });

        document.getElementById('imgGenSaveBtn')?.addEventListener('click', handleSaveToNote);
        document.getElementById('imgGenDownloadBtn')?.addEventListener('click', handleDownload);
        document.getElementById('imgGenRegenBtn')?.addEventListener('click', handleRegenerate);

        // Enter in prompt textarea = submit (Ctrl+Enter)
        document.getElementById('imgGenPrompt')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleGenerate();
            }
        });
    }

    // ============================================================
    // Load image providers
    // ============================================================

    async function _loadImageProviders() {
        const { apiCall } = getUtils();
        const select = document.getElementById('imgGenModelSelect');
        if (!select) return;

        try {
            const providers = await apiCall('ai-providers');
            const imageProviders = (providers || []).filter(p => p.image_model && p.image_model.trim());

            if (imageProviders.length === 0) {
                select.innerHTML = '<option value="">未配置生图模型，去设置 →</option>';
                return;
            }

            const activeProvider = imageProviders.find(p => p.is_active) || imageProviders[0];
            select.innerHTML = imageProviders.map(p =>
                `<option value="${_escAttr(p.id)}" data-model="${_escAttr(p.image_model)}"${p.id === activeProvider.id ? ' selected' : ''}>${_escHtml(p.name)} · ${_escHtml(p.image_model)}</option>`
            ).join('');
        } catch (e) {
            select.innerHTML = '<option value="">加载失败</option>';
        }
    }

    // ============================================================
    // Generate
    // ============================================================

    async function handleGenerate() {
        const { apiCall, showToast } = getUtils();
        const prompt = document.getElementById('imgGenPrompt')?.value.trim();
        const submitBtn = document.getElementById('imgGenSubmitBtn');
        const modelSelect = document.getElementById('imgGenModelSelect');
        const sizeSelect = document.getElementById('imgGenSizeSelect');

        if (!prompt) {
            showErrorInline('请输入图片描述');
            return;
        }

        const selectedOption = modelSelect?.selectedOptions[0];
        const model = selectedOption?.dataset?.model || modelSelect?.value || '';

        if (!model) {
            showErrorInline('请先在设置中配置生图模型');
            return;
        }

        const sizeRatio = sizeSelect?.value || '1:1';

        // Start generation
        _setLoading(true);
        _hideError();

        _abortController = new AbortController();

        try {
            const data = await apiCall('llm/image-generate', {
                method: 'POST',
                body: JSON.stringify({ prompt, model, size_ratio: sizeRatio }),
            });

            _abortController = null;

            if (data && data.id) {
                _showResult(data);
            } else {
                showErrorInline(data?.message || '生成失败，请重试');
            }
        } catch (e) {
            _abortController = null;
            if (e.name === 'AbortError') {
                showErrorInline('已取消生成');
            } else {
                showErrorInline(e.message || '生成失败，请重试');
            }
        } finally {
            _setLoading(false);
        }
    }

    async function handleRegenerate() {
        const prompt = document.getElementById('imgGenPrompt')?.value.trim();
        if (prompt) await handleGenerate();
    }

    function handleCancel() {
        if (_abortController) {
            _abortController.abort();
            _abortController = null;
        }
        _setLoading(false);
    }

    // ============================================================
    // Result display
    // ============================================================

    function _showResult(imageData) {
        const empty = document.getElementById('imgGenEmpty');
        const wrapper = document.getElementById('imgGenImageWrapper');
        const img = document.getElementById('imgGenImage');

        if (!img || !wrapper) return;

        img.src = getImageUrl(imageData.id);
        img.alt = imageData.prompt || '生成结果';
        img.dataset.imageId = imageData.id;
        img.dataset.prompt = imageData.prompt || '';

        empty.classList.add('hidden');
        wrapper.classList.remove('hidden');
        _hideError();
    }

    // ============================================================
    // Save to note / download
    // ============================================================

    async function handleSaveToNote() {
        const img = document.getElementById('imgGenImage');
        const imgId = img?.dataset?.imageId;
        if (!imgId) return;

        const { showToast } = getUtils();
        const imgUrl = getImageUrl(imgId);

        // Try to insert into currently open note
        const contentEl = document.getElementById('noteInlineContent');
        if (contentEl) {
            const imgEl = document.createElement('img');
            imgEl.src = imgUrl;
            imgEl.style.maxWidth = '100%';
            imgEl.style.borderRadius = 'var(--radius-md)';
            imgEl.style.margin = '8px 0';
            imgEl.dataset.imageId = imgId;

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

            // Trigger autosave
            if (window.ScheduleAppNoteEditor?._triggerAutoSave) {
                window.ScheduleAppNoteEditor._triggerAutoSave();
            }
            showToast('已插入到当前笔记');
        } else {
            showToast('请先打开一个笔记');
        }
    }

    function handleDownload() {
        const img = document.getElementById('imgGenImage');
        const imgId = img?.dataset?.imageId;
        const prompt = img?.dataset?.prompt || 'generated';
        if (!imgId) return;

        const a = document.createElement('a');
        a.href = getImageUrl(imgId);
        a.download = `img_${prompt.substring(0, 20).replace(/\s+/g, '_')}_${Date.now()}.png`;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    // ============================================================
    // Loading / error state
    // ============================================================

    function _setLoading(loading) {
        const btn = document.getElementById('imgGenSubmitBtn');
        if (!btn) return;
        if (loading) {
            btn.textContent = '取消';
            btn.classList.add('img-gen-loading');
            btn.dataset.state = 'loading';
        } else {
            btn.textContent = '生成';
            btn.classList.remove('img-gen-loading');
            btn.dataset.state = '';
        }
    }

    function showErrorInline(message) {
        const errEl = document.getElementById('imgGenError');
        if (errEl) {
            errEl.textContent = message;
            errEl.classList.remove('hidden');
        }
    }

    function _hideError() {
        const errEl = document.getElementById('imgGenError');
        if (errEl) errEl.classList.add('hidden');
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

    window.ScheduleAppImageGen = {
        renderImageGenView,
        handleGenerate,
        handleCancel,
        handleSaveToNote,
        handleDownload,
        handleRegenerate,
        getImageUrl,
    };

})();
