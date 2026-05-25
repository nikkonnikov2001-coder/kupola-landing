(() => {
  const CONTENT_URL = '/api/cms/content';
  const SAVE_URL = '/api/cms/content';
  const UPLOAD_URL = '/api/cms/upload';
  const SESSION_URL = '/api/cms/session';
  const UNDO_URL = '/api/cms/undo';
  const HISTORY_URL = '/api/cms/history';
  const RESTORE_URL = '/api/cms/restore';
  const ADMIN_URL = '/editor';
  const ADMIN_PATH_RE = /\/(?:admin|editor)\/?$/;
  const editMode = new URLSearchParams(location.search).has('cms') || ADMIN_PATH_RE.test(location.pathname);
  const scope = pageScope();
  const state = {
    content: { version: 1, items: {} },
    dirty: false,
    selected: null,
    pageSelect: null,
    saveButton: null,
    undoButton: null,
    panel: null,
    toast: null,
    fileInput: null,
  };

  const sitePages = [
    {
      label: 'Основные страницы',
      items: [
        { path: '/', label: 'Главная' },
        { path: '/videos.html', label: 'Видео' },
      ],
    },
    {
      label: 'Разделы каталога',
      items: [
        { path: '/minarets.html', label: 'Минареты' },
        { path: '/spherical-domes.html', label: 'Купола сферические' },
        { path: '/crescent-kits.html', label: 'Полумесяцы с шарами' },
        { path: '/mini-crescents.html', label: 'Полумесяцы мини' },
        { path: '/podzory.html', label: 'Узоры и подзоры' },
        { path: '/titanium-sheets.html', label: 'Листы с покрытием нитрид титана' },
      ],
    },
    {
      label: 'Карточки каталога',
      items: [
        { path: '/spherical-dome.html', label: 'Купол сферический в рейку' },
        { path: '/spherical-dome-checker.html', label: 'Купол сферический в шашку' },
        { path: '/crescent-400.html', label: 'Полумесяц 400 мм' },
        { path: '/crescent-500.html', label: 'Полумесяц 500 мм' },
        { path: '/crescent-700.html', label: 'Полумесяц 700 мм' },
        { path: '/four-sided-minaret.html', label: 'Прямой 4-гранный минарет' },
        { path: '/octagonal-minaret.html', label: 'Прямой 8-гранный минарет' },
        { path: '/round-minaret.html', label: 'Круглый минарет' },
        { path: '/oval-minaret.html', label: 'Овальный минарет' },
        { path: '/spherical-minaret.html', label: 'Сферический минарет' },
      ],
    },
  ];

  const textSelector = [
    'h1', 'h2', 'h3', 'h4', 'p', 'li', 'strong', 'small', 'em', 'dt', 'dd',
    '.eyebrow', '.hero-lead', '.hero-subtitle', '.hero-sub', '.logo', '.brand',
    '.button', '.btn', '.header-cta', '.link-btn', '.btn-add-to-cart',
    '.product-tag', '.product-price', '.price', '.price-for', '.price-deadline',
    '.consent-text', '.contact-bar span', '.contact-bar a', '.contact-links span',
    '.contact-links strong', '.footer-brand p', '.footer-nav a', '.footer a',
    '.faq-item span', '.faq-item p', '.steps b', '.steps span', '.steps strong',
    '.trust-item strong', '.trust-item span', '.text-link', '.copyright',
    '.product-breadcrumbs a', '.product-breadcrumbs span', 'address span',
    'address a', 'address strong'
  ].join(',');

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }

  function pageScope() {
    let pathname = location.pathname || '/';
    if (ADMIN_PATH_RE.test(pathname)) pathname = '/';
    if (pathname === '/' || pathname === '/index.html') return 'index';
    return pathname
      .replace(/^\//, '')
      .replace(/\.html$/i, '')
      .replace(/[^a-z0-9_-]+/gi, '-')
      .replace(/^-+|-+$/g, '') || 'index';
  }

  function autoKey(kind, index) {
    return `${kind}.${scope}.${String(index).padStart(4, '0')}`;
  }

  function seoKey(name) {
    return `seo.${scope}.${name}`;
  }

  function currentPagePath() {
    const pathname = location.pathname || '/';
    if (ADMIN_PATH_RE.test(pathname) || pathname === '/index.html') return '/';
    return pathname;
  }

  function pageOptionHtml() {
    const current = currentPagePath();
    return sitePages.map((group) => `
      <optgroup label="${escapeHtml(group.label)}">
        ${group.items.map((item) => `<option value="${escapeHtml(item.path)}"${item.path === current ? ' selected' : ''}>${escapeHtml(item.label)}</option>`).join('')}
      </optgroup>
    `).join('');
  }

  function editUrlFor(pathname) {
    if (pathname === '/') return ADMIN_URL;
    return `${pathname}?cms`;
  }

  function navigateToCmsPage(pathname) {
    if (!pathname || pathname === currentPagePath()) return;
    if (state.dirty && !confirm('Есть несохраненные правки. Перейти на другую страницу без сохранения?')) {
      if (state.pageSelect) state.pageSelect.value = currentPagePath();
      return;
    }
    location.href = editUrlFor(pathname);
  }

  function isInsideCmsUi(el) {
    return Boolean(el.closest?.('.cms-toolbar, .cms-panel, .cms-toast'));
  }

  function visibleText(el) {
    return (el.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function assignKeys() {
    let textIndex = 0;
    document.querySelectorAll(textSelector).forEach((el) => {
      if (isInsideCmsUi(el)) return;
      if (el.closest('svg, script, style, noscript, input, textarea, select, video')) return;
      if (!visibleText(el)) return;
      if (!el.dataset.cmsTextKey) el.dataset.cmsTextKey = autoKey('text', ++textIndex);
    });

    let imageIndex = 0;
    document.querySelectorAll('img').forEach((el) => {
      if (isInsideCmsUi(el)) return;
      if (!el.dataset.cmsImageKey) el.dataset.cmsImageKey = autoKey('image', ++imageIndex);
    });

    let linkIndex = 0;
    document.querySelectorAll('a[href]').forEach((el) => {
      if (isInsideCmsUi(el)) return;
      if (!el.dataset.cmsLinkKey) el.dataset.cmsLinkKey = autoKey('link', ++linkIndex);
    });
  }

  async function loadContent() {
    try {
      const response = await fetch(`${CONTENT_URL}?t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('content_unavailable');
      const json = await response.json();
      if (json && typeof json === 'object') state.content = { version: 1, items: {}, ...json };
    } catch {
      state.content = { version: 1, items: {} };
    }
  }

  function applyContent() {
    const items = state.content.items || {};
    const title = items[seoKey('title')]?.text || items['seo.title']?.text;
    const description = items[seoKey('description')]?.text || items['seo.description']?.text;
    if (typeof title === 'string' && title.trim()) document.title = title.trim();
    if (typeof description === 'string') ensureMetaDescription().setAttribute('content', description.trim());

    Object.entries(items).forEach(([key, item]) => {
      if (!item || typeof item !== 'object') return;
      if (key.startsWith('text.')) {
        const el = document.querySelector(`[data-cms-text-key="${CSS.escape(key)}"]`);
        if (el && typeof item.html === 'string') el.innerHTML = item.html;
        else if (el && typeof item.text === 'string') el.textContent = item.text;
      }
      if (key.startsWith('image.')) {
        const el = document.querySelector(`[data-cms-image-key="${CSS.escape(key)}"]`);
        if (el && typeof item.src === 'string') {
          el.setAttribute('src', item.src);
          el.removeAttribute('srcset');
          el.removeAttribute('sizes');
        }
        if (el && typeof item.alt === 'string') el.setAttribute('alt', item.alt);
      }
      if (key.startsWith('link.')) {
        const el = document.querySelector(`[data-cms-link-key="${CSS.escape(key)}"]`);
        if (el && typeof item.href === 'string') el.setAttribute('href', item.href);
      }
    });
  }

  function markDirty() {
    state.dirty = true;
    if (state.saveButton) state.saveButton.textContent = 'Сохранить *';
  }

  function setItem(key, patch) {
    state.content.items ||= {};
    state.content.items[key] = { ...(state.content.items[key] || {}), ...patch };
    markDirty();
  }

  function toast(message) {
    if (!state.toast) return;
    state.toast.textContent = message;
    state.toast.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => state.toast?.classList.remove('show'), 2500);
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    }[char]));
  }

  function formatHistoryDate(value) {
    if (!value) return 'без даты';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(date);
  }

  function buildUi() {
    const toolbar = document.createElement('div');
    toolbar.className = 'cms-toolbar';
    toolbar.innerHTML = `
      <strong>CMS</strong>
      <label class="cms-page-picker">
        <span>Страница</span>
        <select class="cms-page-select" aria-label="Страница сайта">${pageOptionHtml()}</select>
      </label>
      <button class="cms-save" type="button">Сохранить</button>
      <button class="cms-seo" type="button">SEO</button>
      <button class="cms-history" type="button">История</button>
      <button class="cms-undo" type="button">Отмена</button>
      <button class="cms-help" type="button">Помощь</button>
      <button class="cms-exit" type="button">Выйти</button>
    `;

    const panel = document.createElement('aside');
    panel.className = 'cms-panel';
    panel.hidden = true;
    panel.innerHTML = `
      <h3 data-cms-panel-title>Элемент</h3>
      <p data-cms-panel-help>Кликните текст и правьте прямо на странице. Кликните картинку, чтобы загрузить новую. У ссылок можно менять URL.</p>
      <div class="cms-seo-fields" hidden>
        <label>SEO title<input data-cms-seo-title placeholder="Заголовок вкладки"></label>
        <label>SEO description<textarea data-cms-seo-description placeholder="Описание для поисковиков"></textarea></label>
      </div>
      <div class="cms-history-fields" hidden>
        <div class="cms-history-list" data-cms-history-list>Загружаю историю...</div>
      </div>
      <label class="cms-link-field" hidden>Ссылка<input data-cms-href placeholder="https://..."></label>
      <label class="cms-alt-field" hidden>Alt картинки<input data-cms-alt placeholder="Описание картинки"></label>
      <div class="cms-row cms-panel-actions">
        <button type="button" data-cms-apply>Применить</button>
        <button class="cms-secondary" type="button" data-cms-clear>Сбросить элемент</button>
      </div>
    `;

    const fileInput = document.createElement('input');
    fileInput.id = 'cmsFileInput';
    fileInput.type = 'file';
    fileInput.accept = 'image/png,image/jpeg,image/webp,image/svg+xml,image/avif';
    fileInput.hidden = true;

    const toastNode = document.createElement('div');
    toastNode.className = 'cms-toast';

    document.body.append(toolbar, panel, fileInput, toastNode);
    state.pageSelect = toolbar.querySelector('.cms-page-select');
    state.saveButton = toolbar.querySelector('.cms-save');
    state.undoButton = toolbar.querySelector('.cms-undo');
    state.panel = panel;
    state.fileInput = fileInput;
    state.toast = toastNode;

    state.pageSelect.addEventListener('change', () => navigateToCmsPage(state.pageSelect.value));
    toolbar.querySelector('.cms-save').addEventListener('click', saveContent);
    toolbar.querySelector('.cms-seo').addEventListener('click', showSeoPanel);
    toolbar.querySelector('.cms-history').addEventListener('click', showHistoryPanel);
    toolbar.querySelector('.cms-undo').addEventListener('click', undoLastSave);
    toolbar.querySelector('.cms-help').addEventListener('click', () => toast('Текст: клик и печать. Фото: клик и файл. Ссылки и SEO редактируются в панели.'));
    toolbar.querySelector('.cms-exit').addEventListener('click', () => { location.href = '/'; });
    panel.querySelector('[data-cms-apply]').addEventListener('click', applyPanelFields);
    panel.querySelector('[data-cms-clear]').addEventListener('click', clearSelectedOverride);
    panel.querySelector('[data-cms-history-list]').addEventListener('click', (event) => {
      const restoreButton = event.target.closest('[data-cms-restore]');
      if (restoreButton) restoreHistory(restoreButton.dataset.cmsRestore);
    });
    fileInput.addEventListener('change', handleFileChange);
  }

  function setupEditing() {
    document.body.classList.add('cms-editing');

    document.querySelectorAll('[data-cms-text-key]').forEach((el) => {
      el.setAttribute('contenteditable', 'true');
      el.setAttribute('spellcheck', 'true');
      el.addEventListener('focus', () => selectElement(el, 'text'));
      el.addEventListener('input', () => {
        setItem(el.dataset.cmsTextKey, { type: 'text', html: el.innerHTML });
      });
      el.addEventListener('keydown', (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
          event.preventDefault();
          saveContent();
        }
      });
    });

    document.querySelectorAll('[data-cms-link-key]').forEach((el) => {
      el.addEventListener('click', (event) => {
        if (!document.body.classList.contains('cms-editing')) return;
        event.preventDefault();
        event.stopPropagation();
        selectElement(el, 'link');
      }, true);
    });

    document.querySelectorAll('[data-cms-image-key]').forEach((el) => {
      el.addEventListener('click', (event) => {
        if (!document.body.classList.contains('cms-editing')) return;
        event.preventDefault();
        event.stopPropagation();
        selectElement(el, 'image');
        state.fileInput.value = '';
        state.fileInput.click();
      }, true);
    });

    document.addEventListener('click', (event) => {
      if (!document.body.classList.contains('cms-editing')) return;
      if (isInsideCmsUi(event.target)) return;
      const editable = event.target.closest('[data-cms-text-key], [data-cms-image-key], [data-cms-link-key]');
      if (!editable) return;
      if (editable.dataset.cmsTextKey) selectElement(editable, 'text');
    }, true);

    window.addEventListener('beforeunload', (event) => {
      if (!state.dirty) return;
      event.preventDefault();
      event.returnValue = '';
    });

    toast('CMS включена');
  }

  function selectElement(el, kind) {
    if (state.selected?.el) state.selected.el.classList.remove('cms-selected');
    el.classList.add('cms-selected');
    state.selected = { el, kind };
    renderPanel(el, kind);
  }

  function renderPanel(el, kind) {
    const panel = state.panel;
    if (!panel) return;
    panel.hidden = false;
    panel.dataset.mode = kind;
    panel.querySelector('[data-cms-panel-title]').textContent = 'Элемент';
    panel.querySelector('[data-cms-panel-help]').textContent = 'Кликните текст и правьте прямо на странице. Кликните картинку, чтобы загрузить новую. У ссылок можно менять URL.';
    const seoFields = panel.querySelector('.cms-seo-fields');
    const hrefField = panel.querySelector('.cms-link-field');
    const hrefInput = panel.querySelector('[data-cms-href]');
    const altField = panel.querySelector('.cms-alt-field');
    const altInput = panel.querySelector('[data-cms-alt]');
    const historyFields = panel.querySelector('.cms-history-fields');
    const applyButton = panel.querySelector('[data-cms-apply]');
    const clearButton = panel.querySelector('[data-cms-clear]');
    applyButton.textContent = 'Применить';
    clearButton.hidden = false;
    seoFields.hidden = true;
    historyFields.hidden = true;
    hrefField.hidden = !el.dataset.cmsLinkKey && kind !== 'link';
    altField.hidden = !el.dataset.cmsImageKey && kind !== 'image';
    if (!hrefField.hidden) hrefInput.value = el.getAttribute('href') || '';
    if (!altField.hidden) altInput.value = el.getAttribute('alt') || '';
  }

  function applyPanelFields() {
    if (state.panel?.dataset.mode === 'seo') return applySeoFields();
    if (state.panel?.dataset.mode === 'history') return loadHistoryList();
    const selected = state.selected;
    if (!selected) return;
    const { el } = selected;
    const hrefInput = state.panel.querySelector('[data-cms-href]');
    const altInput = state.panel.querySelector('[data-cms-alt]');
    if (el.dataset.cmsLinkKey && !state.panel.querySelector('.cms-link-field').hidden) {
      const href = hrefInput.value.trim() || '#';
      el.setAttribute('href', href);
      setItem(el.dataset.cmsLinkKey, { type: 'link', href });
    }
    if (el.dataset.cmsImageKey && !state.panel.querySelector('.cms-alt-field').hidden) {
      const alt = altInput.value.trim();
      el.setAttribute('alt', alt);
      setItem(el.dataset.cmsImageKey, { type: 'image', alt });
    }
    toast('Применено, сохраните изменения');
  }

  function ensureMetaDescription() {
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'description');
      document.head.appendChild(meta);
    }
    return meta;
  }

  function showSeoPanel() {
    if (state.selected?.el) state.selected.el.classList.remove('cms-selected');
    state.selected = null;
    const panel = state.panel;
    panel.hidden = false;
    panel.dataset.mode = 'seo';
    panel.querySelector('[data-cms-panel-title]').textContent = 'SEO';
    panel.querySelector('[data-cms-panel-help]').textContent = 'Заголовок вкладки и описание для поисковиков. Эти настройки сохраняются отдельно для каждой страницы.';
    panel.querySelector('.cms-seo-fields').hidden = false;
    panel.querySelector('.cms-history-fields').hidden = true;
    panel.querySelector('.cms-link-field').hidden = true;
    panel.querySelector('.cms-alt-field').hidden = true;
    panel.querySelector('[data-cms-apply]').textContent = 'Применить';
    panel.querySelector('[data-cms-clear]').hidden = true;
    panel.querySelector('[data-cms-seo-title]').value = state.content.items?.[seoKey('title')]?.text || document.title || '';
    panel.querySelector('[data-cms-seo-description]').value = state.content.items?.[seoKey('description')]?.text || document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
  }

  function applySeoFields() {
    const title = state.panel.querySelector('[data-cms-seo-title]').value.trim();
    const description = state.panel.querySelector('[data-cms-seo-description]').value.trim();
    if (title) document.title = title;
    ensureMetaDescription().setAttribute('content', description);
    setItem(seoKey('title'), { type: 'seo', text: title });
    setItem(seoKey('description'), { type: 'seo', text: description });
    toast('SEO применено, сохраните изменения');
  }

  async function showHistoryPanel() {
    if (state.selected?.el) state.selected.el.classList.remove('cms-selected');
    state.selected = null;
    const panel = state.panel;
    panel.hidden = false;
    panel.dataset.mode = 'history';
    panel.querySelector('[data-cms-panel-title]').textContent = 'История изменений';
    panel.querySelector('[data-cms-panel-help]').textContent = 'Каждое сохранение создает версию. Можно откатиться к любой точке.';
    panel.querySelector('.cms-seo-fields').hidden = true;
    panel.querySelector('.cms-history-fields').hidden = false;
    panel.querySelector('.cms-link-field').hidden = true;
    panel.querySelector('.cms-alt-field').hidden = true;
    panel.querySelector('[data-cms-apply]').textContent = 'Обновить';
    panel.querySelector('[data-cms-clear]').hidden = true;
    await loadHistoryList();
  }

  async function loadHistoryList() {
    const list = state.panel.querySelector('[data-cms-history-list]');
    list.innerHTML = '<p class="cms-history-empty">Загружаю версии...</p>';
    try {
      const response = await fetch(`${HISTORY_URL}?t=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || 'history_failed');
      const items = Array.isArray(result.items) ? result.items : [];
      if (!items.length) {
        list.innerHTML = '<p class="cms-history-empty">Истории пока нет. Она появится после второго сохранения.</p>';
        return;
      }
      list.innerHTML = items.map((item, index) => {
        const id = typeof item === 'string' ? item : item.id;
        const date = typeof item === 'string' ? item.replace(/\.json$/, '') : (item.updatedAt || item.savedAt || item.id);
        const itemCount = typeof item === 'object' && Number.isFinite(item.itemCount) ? `${item.itemCount} правок` : 'версия';
        return `
          <article class="cms-history-item">
            <div>
              <strong>${index === 0 ? 'Предыдущая версия' : `Версия ${index + 1}`}</strong>
              <span>${escapeHtml(formatHistoryDate(date))} · ${escapeHtml(itemCount)}</span>
            </div>
            <button type="button" data-cms-restore="${escapeHtml(id)}">Откатить</button>
          </article>
        `;
      }).join('');
    } catch (error) {
      list.innerHTML = `<p class="cms-history-empty">Не загрузилось: ${escapeHtml(error.message)}</p>`;
    }
  }

  async function restoreHistory(id) {
    if (!id) return;
    if (state.dirty && !confirm('Есть несохраненные правки. Откатить и потерять их?')) return;
    if (!confirm('Откатить сайт к выбранной версии? Текущая версия тоже сохранится в истории.')) return;
    document.body.classList.add('cms-saving');
    try {
      const response = await fetch(RESTORE_URL, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || 'restore_failed');
      state.dirty = false;
      toast('Откатил. Обновляю...');
      setTimeout(() => location.reload(), 450);
    } catch (error) {
      toast(`Не откатилось: ${error.message}`);
    } finally {
      document.body.classList.remove('cms-saving');
    }
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    const selected = state.selected;
    if (!file || !selected?.el?.dataset.cmsImageKey) return;
    document.body.classList.add('cms-saving');
    try {
      const dataUrl = await fileToDataUrl(file);
      const response = await fetch(UPLOAD_URL, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, dataUrl }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || 'upload_failed');
      selected.el.setAttribute('src', result.path);
      selected.el.removeAttribute('srcset');
      selected.el.removeAttribute('sizes');
      setItem(selected.el.dataset.cmsImageKey, { type: 'image', src: result.path, alt: selected.el.getAttribute('alt') || '' });
      toast('Картинка загружена, сохраните изменения');
    } catch (error) {
      toast(`Не загрузилось: ${error.message}`);
    } finally {
      document.body.classList.remove('cms-saving');
    }
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('read_failed'));
      reader.readAsDataURL(file);
    });
  }

  async function saveContent() {
    document.body.classList.add('cms-saving');
    if (state.saveButton) {
      state.saveButton.disabled = true;
      state.saveButton.textContent = 'Сохраняю...';
    }
    try {
      state.content.updatedAt = new Date().toISOString();
      const response = await fetch(SAVE_URL, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state.content),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || 'save_failed');
      state.dirty = false;
      if (state.saveButton) state.saveButton.textContent = 'Сохранить';
      toast('Сохранено');
    } catch (error) {
      toast(`Не сохранилось: ${error.message}`);
      if (state.saveButton) state.saveButton.textContent = 'Сохранить *';
    } finally {
      if (state.saveButton) state.saveButton.disabled = false;
      document.body.classList.remove('cms-saving');
    }
  }

  async function undoLastSave() {
    if (state.dirty && !confirm('Есть несохраненные правки. Откатить к прошлому сохранению?')) return;
    document.body.classList.add('cms-saving');
    if (state.undoButton) state.undoButton.disabled = true;
    try {
      const response = await fetch(UNDO_URL, { method: 'POST', credentials: 'same-origin' });
      const result = await response.json().catch(() => ({}));
      if (response.status === 409) {
        toast('Истории пока нет');
        return;
      }
      if (!response.ok || !result.ok) throw new Error(result.error || 'undo_failed');
      state.dirty = false;
      toast('Откатил. Обновляю...');
      setTimeout(() => location.reload(), 450);
    } catch (error) {
      toast(`Не откатилось: ${error.message}`);
    } finally {
      if (state.undoButton) state.undoButton.disabled = false;
      document.body.classList.remove('cms-saving');
    }
  }

  function clearSelectedOverride() {
    const selected = state.selected;
    if (!selected?.el) return;
    const keys = [selected.el.dataset.cmsTextKey, selected.el.dataset.cmsImageKey, selected.el.dataset.cmsLinkKey].filter(Boolean);
    keys.forEach((key) => delete state.content.items[key]);
    markDirty();
    toast('Правка элемента сброшена. Сохраните и обновите страницу.');
  }

  async function hasEditorAccess() {
    try {
      const response = await fetch(`${SESSION_URL}?t=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin' });
      return response.ok;
    } catch {
      return false;
    }
  }

  ready(async () => {
    assignKeys();
    await loadContent();
    applyContent();
    if (editMode) {
      if (!await hasEditorAccess()) {
        if (!ADMIN_PATH_RE.test(location.pathname)) location.href = ADMIN_URL;
        return;
      }
      buildUi();
      setupEditing();
    }
  });
})();
