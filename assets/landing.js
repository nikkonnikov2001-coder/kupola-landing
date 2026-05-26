const body = document.body;
const requestModal = document.querySelector('#requestModal');
const videoModal = document.querySelector('#videoModal');
const modalVideo = document.querySelector('#modalVideo');
const CART_STORAGE_KEY = 'kupolaCartV1';
const CHAT_STORAGE_KEY = 'kupolaSupportChatV1';
const DEFAULT_PRODUCT_PRICE = 50000;
const DEFAULT_PRODUCT_PRICE_LABEL = '50 000 руб';
let lastFocused = null;
let cartElements = {};
let chatElements = {};

function getFormValue(form, name) {
  return String(new FormData(form).get(name) || '').trim();
}

function ensureFieldName(input, name) {
  if (input && !input.name) {
    input.name = name;
  }
}

function ensureTelegramField(form) {
  if (form.querySelector('[name="telegram"]')) return;

  const phoneInput = form.querySelector('input[name="phone"], input[type="tel"]');
  const field = document.createElement('label');
  field.className = 'lead-telegram-field';
  field.innerHTML = 'Telegram, если есть <input name="telegram" type="text" placeholder="@username">';

  const phoneLabel = phoneInput?.closest('label');
  if (phoneLabel) {
    phoneLabel.after(field);
  } else if (phoneInput) {
    phoneInput.after(field);
  }
}

function getOrCreateStatus(form) {
  let status = form.querySelector('.form-status');
  if (!status) {
    status = document.createElement('p');
    status.className = 'form-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    form.append(status);
  }

  return status;
}

function buildLeadPayload(form, type) {
  const data = new FormData(form);
  const includeCart = form.dataset.includeCart === 'true';
  const cartItems = includeCart ? getCartItems() : [];
  const product = cartItems.length
    ? `Корзина (${getCartTotalQuantity(cartItems)} поз.)`
    : data.get('product') || form.dataset.product || 'Расчет изделия';
  const messageParts = [];
  const message = String(data.get('message') || '').trim();

  if (message) messageParts.push(message);
  if (cartItems.length) messageParts.push(getCartSummaryText(cartItems));

  return {
    type,
    product,
    name: data.get('name') || '',
    phone: data.get('phone') || '',
    email: data.get('email') || '',
    telegram: data.get('telegram') || '',
    message: messageParts.join('\n\n'),
    page: window.location.href,
  };
}

async function sendLead(form, type) {
  const status = getOrCreateStatus(form);
  const submitButton = form.querySelector('button[type="submit"]');

  status.textContent = 'Отправляем заявку...';
  status.classList.remove('is-error');
  if (submitButton) submitButton.disabled = true;

  try {
    const response = await fetch('/api/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildLeadPayload(form, type)),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.ok) {
      throw new Error(result.message || result.error || 'Не удалось отправить заявку');
    }

    status.textContent = 'Заявка отправлена. Мы свяжемся с вами.';
    if (form.dataset.includeCart === 'true') {
      clearCart();
      form.dataset.includeCart = '';
    }
    form.reset();
  } catch (error) {
    status.textContent = 'Не удалось отправить заявку. Позвоните нам или напишите в мессенджер МАКС.';
    status.classList.add('is-error');
    console.error(error);
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

function openModal(modal) {
  if (!modal) return;
  lastFocused = document.activeElement;
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  body.classList.add('modal-open');
  const closeButton = modal.querySelector('[data-close]');
  if (closeButton) closeButton.focus();
}

function closeModal(modal) {
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  if (modal === videoModal && modalVideo) {
    modalVideo.pause();
    modalVideo.removeAttribute('src');
    modalVideo.load();
  }
  body.classList.remove('modal-open');
  if (lastFocused && typeof lastFocused.focus === 'function') {
    lastFocused.focus();
  }
}

function safeCartId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\wа-яё-]+/gi, '')
    .slice(0, 90) || `item-${Date.now()}`;
}

function getCartItems() {
  try {
    const value = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value.filter((item) => item && item.title) : [];
  } catch {
    return [];
  }
}

function saveCartItems(items) {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  renderCart();
}

function getCartTotalQuantity(items = getCartItems()) {
  return items.reduce((total, item) => total + Math.max(1, Number(item.quantity) || 1), 0);
}

function parseProductPrice(value) {
  const number = String(value || '')
    .replace(/[^\d]/g, '');
  return number ? Number(number) : DEFAULT_PRODUCT_PRICE;
}

function formatProductPrice(value) {
  return `${Math.max(0, Number(value) || 0).toLocaleString('ru-RU')} руб`;
}

function getCartItemPriceValue(item) {
  return Math.max(0, Number(item.priceValue) || parseProductPrice(item.price));
}

function getCartTotalAmount(items = getCartItems()) {
  return items.reduce((total, item) => {
    const quantity = Math.max(1, Number(item.quantity) || 1);
    return total + getCartItemPriceValue(item) * quantity;
  }, 0);
}

function getProductFromElement(element) {
  const card = element.closest('.product-card');
  const summary = element.closest('.detail-summary');
  const priceNode = card?.querySelector('.product-price') || summary?.querySelector('.product-price');
  const title =
    element.dataset.product ||
    card?.querySelector('h3')?.textContent ||
    summary?.querySelector('h1')?.textContent ||
    document.querySelector('h1')?.textContent ||
    document.title;
  const description =
    card?.querySelector('p:not(.product-price)')?.textContent ||
    summary?.querySelector('p:not(.eyebrow):not(.product-price)')?.textContent ||
    '';
  const price = priceNode?.textContent || DEFAULT_PRODUCT_PRICE_LABEL;
  const priceValue = parseProductPrice(price);
  const image =
    card?.querySelector('img')?.currentSrc ||
    card?.querySelector('img')?.src ||
    document.querySelector('#detailImage')?.currentSrc ||
    document.querySelector('#detailImage')?.src ||
    '';
  const href =
    card?.querySelector('a.product-image, .link-btn')?.getAttribute('href') ||
    window.location.pathname;

  return {
    id: safeCartId(`${title}-${href}`),
    title: String(title || '').replace(/\s+/g, ' ').trim(),
    description: String(description || '').replace(/\s+/g, ' ').trim().slice(0, 180),
    price: String(price || DEFAULT_PRODUCT_PRICE_LABEL).replace(/\s+/g, ' ').trim(),
    priceValue,
    image,
    href,
    quantity: 1,
  };
}

function addCartItem(product) {
  const items = getCartItems();
  const existing = items.find((item) => item.id === product.id);

  if (existing) {
    existing.quantity = Math.min(99, Math.max(1, Number(existing.quantity) || 1) + 1);
    existing.price = product.price;
    existing.priceValue = product.priceValue;
  } else {
    items.push(product);
  }

  saveCartItems(items);
  showCartToast(`${product.title} добавлен в корзину`);
  openCart();
}

function updateCartItemQuantity(id, quantity) {
  const nextQuantity = Math.max(1, Math.min(99, Number(quantity) || 1));
  saveCartItems(getCartItems().map((item) => item.id === id ? { ...item, quantity: nextQuantity } : item));
}

function removeCartItem(id) {
  saveCartItems(getCartItems().filter((item) => item.id !== id));
}

function clearCart() {
  saveCartItems([]);
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

function getCartSummaryText(items = getCartItems()) {
  if (!items.length) return '';

  return [
    'Корзина:',
    ...items.map((item, index) => {
      const quantity = Math.max(1, Number(item.quantity) || 1);
      const unitPrice = getCartItemPriceValue(item);
      const details = [item.description, formatProductPrice(unitPrice)].filter(Boolean).join(' | ');
      return `${index + 1}. ${item.title} — ${quantity} шт., ${formatProductPrice(unitPrice * quantity)}${details ? ` (${details})` : ''}`;
    }),
    '',
    `Итого: ${formatProductPrice(getCartTotalAmount(items))}`,
  ].join('\n');
}

function buildCartUi() {
  if (document.querySelector('.cart-float')) return;

  const button = document.createElement('button');
  button.className = 'cart-float';
  button.type = 'button';
  button.setAttribute('aria-label', 'Открыть корзину');
  button.innerHTML = `
    <span class="cart-float__icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none">
        <path d="M6 6h15l-2 8H8L6 3H3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
        <circle cx="9" cy="20" r="1.5" fill="currentColor"></circle>
        <circle cx="18" cy="20" r="1.5" fill="currentColor"></circle>
      </svg>
    </span>
    <span class="cart-float__text">Корзина</span>
    <span class="cart-float__count" data-cart-count>0</span>
  `;

  const drawer = document.createElement('div');
  drawer.className = 'cart-drawer';
  drawer.setAttribute('aria-hidden', 'true');
  drawer.innerHTML = `
    <div class="cart-drawer__backdrop" data-cart-close></div>
    <aside class="cart-panel" role="dialog" aria-modal="true" aria-labelledby="cartTitle">
      <header class="cart-panel__header">
        <div>
          <p>Подбор изделий</p>
          <h2 id="cartTitle">Корзина</h2>
        </div>
        <button class="cart-panel__close" type="button" data-cart-close aria-label="Закрыть корзину">×</button>
      </header>
      <div class="cart-panel__list" data-cart-list></div>
      <div class="cart-panel__empty" data-cart-empty>
        <strong>Корзина пока пустая</strong>
        <span>Добавьте изделия из каталога, затем отправьте одну заявку на расчет.</span>
      </div>
      <label class="cart-panel__note">
        Комментарий к корзине
        <textarea data-cart-note rows="3" placeholder="Размеры, цвет RAL, город доставки, сроки"></textarea>
      </label>
      <div class="cart-panel__total" data-cart-total hidden>
        <span>Итого</span>
        <strong>0 руб</strong>
      </div>
      <footer class="cart-panel__footer">
        <button class="cart-clear" type="button" data-cart-clear>Очистить</button>
        <button class="cart-submit" type="button" data-cart-checkout>Запросить расчет</button>
      </footer>
    </aside>
  `;

  const toast = document.createElement('div');
  toast.className = 'cart-toast';

  document.body.append(button, drawer, toast);
  cartElements = {
    button,
    drawer,
    count: button.querySelector('[data-cart-count]'),
    list: drawer.querySelector('[data-cart-list]'),
    empty: drawer.querySelector('[data-cart-empty]'),
    note: drawer.querySelector('[data-cart-note]'),
    total: drawer.querySelector('[data-cart-total]'),
    toast,
  };

  button.addEventListener('click', openCart);
  drawer.querySelectorAll('[data-cart-close]').forEach((item) => item.addEventListener('click', closeCart));
  drawer.querySelector('[data-cart-clear]').addEventListener('click', clearCart);
  drawer.querySelector('[data-cart-checkout]').addEventListener('click', checkoutCart);
}

function openCart() {
  if (!cartElements.drawer) return;
  cartElements.drawer.classList.add('is-open');
  cartElements.drawer.setAttribute('aria-hidden', 'false');
  body.classList.add('cart-open');
}

function closeCart() {
  if (!cartElements.drawer) return;
  cartElements.drawer.classList.remove('is-open');
  cartElements.drawer.setAttribute('aria-hidden', 'true');
  body.classList.remove('cart-open');
}

function showCartToast(message) {
  if (!cartElements.toast) return;
  cartElements.toast.textContent = message;
  cartElements.toast.classList.add('is-visible');
  clearTimeout(showCartToast.timer);
  showCartToast.timer = setTimeout(() => cartElements.toast?.classList.remove('is-visible'), 2200);
}

function renderCart() {
  if (!cartElements.list) return;
  const items = getCartItems();
  const total = getCartTotalQuantity(items);
  const totalAmount = getCartTotalAmount(items);

  cartElements.count.textContent = String(total);
  cartElements.button.classList.toggle('has-items', total > 0);
  cartElements.empty.hidden = items.length > 0;
  cartElements.list.hidden = items.length === 0;
  if (cartElements.total) {
    cartElements.total.hidden = items.length === 0;
    cartElements.total.querySelector('strong').textContent = formatProductPrice(totalAmount);
  }

  cartElements.list.innerHTML = items.map((item) => {
    const quantity = Math.max(1, Number(item.quantity) || 1);
    const unitPrice = getCartItemPriceValue(item);
    return `
      <article class="cart-item" data-cart-id="${escapeHtml(item.id)}">
        ${item.image ? `<img src="${escapeHtml(item.image)}" alt="">` : ''}
        <div class="cart-item__body">
          <h3>${escapeHtml(item.title)}</h3>
          ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ''}
          <strong>${escapeHtml(formatProductPrice(unitPrice))}</strong>
          <div class="cart-item__subtotal">${escapeHtml(formatProductPrice(unitPrice * quantity))}</div>
          <div class="cart-item__controls">
            <button type="button" data-cart-minus aria-label="Уменьшить количество">−</button>
            <span>${quantity}</span>
            <button type="button" data-cart-plus aria-label="Увеличить количество">+</button>
            <button type="button" data-cart-remove>Удалить</button>
          </div>
        </div>
      </article>
    `;
  }).join('');

  cartElements.list.querySelectorAll('.cart-item').forEach((itemNode) => {
    const id = itemNode.dataset.cartId;
    const item = items.find((cartItem) => cartItem.id === id);
    const quantity = Math.max(1, Number(item?.quantity) || 1);
    itemNode.querySelector('[data-cart-minus]').addEventListener('click', () => updateCartItemQuantity(id, quantity - 1));
    itemNode.querySelector('[data-cart-plus]').addEventListener('click', () => updateCartItemQuantity(id, quantity + 1));
    itemNode.querySelector('[data-cart-remove]').addEventListener('click', () => removeCartItem(id));
  });
}

function checkoutCart() {
  const items = getCartItems();
  if (!items.length) {
    showCartToast('Добавьте хотя бы один товар');
    return;
  }

  closeCart();
  const form = requestModal?.querySelector('.request-form');
  const productSelect = requestModal?.querySelector('select[name="product"]');
  const messageInput = requestModal?.querySelector('textarea[name="message"]');
  const note = cartElements.note?.value.trim() || '';

  if (form) form.dataset.includeCart = 'true';
  if (productSelect) {
    let option = Array.from(productSelect.options).find((item) => item.value === 'Корзина товаров');
    if (!option) {
      option = new Option('Корзина товаров', 'Корзина товаров');
      productSelect.add(option, 0);
    }
    productSelect.value = 'Корзина товаров';
  }
  if (messageInput) {
    messageInput.value = note;
  }

  openModal(requestModal);
}

function getSavedChatCustomer() {
  try {
    const value = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function saveChatCustomer(form) {
  const data = new FormData(form);
  localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify({
    name: String(data.get('name') || '').trim(),
    contact: String(data.get('contact') || '').trim(),
  }));
}

function buildSupportChatUi() {
  if (document.querySelector('.support-chat')) return;

  const saved = getSavedChatCustomer();
  const widget = document.createElement('div');
  widget.className = 'support-chat';
  widget.innerHTML = `
    <button class="support-chat__toggle" type="button" aria-label="Открыть чат с менеджером" aria-expanded="false">
      <span class="support-chat__pulse" aria-hidden="true"></span>
      <span class="support-chat__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
          <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-4.2-1l-4.8 1.2 1.3-4.4A8.1 8.1 0 0 1 3 11.5 8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"></path>
          <path d="M8 10.5h8M8 14h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
        </svg>
      </span>
      <span>Вопрос менеджеру</span>
    </button>
    <section class="support-chat__panel" aria-hidden="true" aria-labelledby="supportChatTitle">
      <header class="support-chat__header">
        <div>
          <p>Онлайн-вопрос</p>
          <h2 id="supportChatTitle">Напишите менеджеру</h2>
        </div>
        <button class="support-chat__close" type="button" aria-label="Закрыть чат">×</button>
      </header>
      <div class="support-chat__body">
        <div class="support-chat__message support-chat__message--manager">
          Задайте вопрос по изделию, срокам или доставке. Сообщение сразу уйдет менеджеру в МАКС.
        </div>
        <div class="support-chat__chips" aria-label="Быстрые вопросы">
          <button type="button" data-chat-question="Сориентируйте по цене и срокам изготовления.">Цена и сроки</button>
          <button type="button" data-chat-question="Можно рассчитать доставку в мой город?">Доставка</button>
          <button type="button" data-chat-question="Нужна консультация по выбору изделия.">Подбор изделия</button>
        </div>
        <form class="support-chat__form">
          <label>
            Имя
            <input name="name" type="text" autocomplete="name" placeholder="Ваше имя" value="${escapeHtml(saved.name || '')}">
          </label>
          <label>
            Контакт для ответа
            <input name="contact" type="text" autocomplete="tel" placeholder="Телефон или MAX" value="${escapeHtml(saved.contact || '')}" required>
          </label>
          <label>
            Вопрос
            <textarea name="message" rows="4" placeholder="Напишите вопрос" required></textarea>
          </label>
          <button class="support-chat__submit" type="submit">Отправить вопрос</button>
          <p class="support-chat__status" role="status" aria-live="polite"></p>
        </form>
      </div>
    </section>
  `;

  document.body.append(widget);
  chatElements = {
    widget,
    toggle: widget.querySelector('.support-chat__toggle'),
    panel: widget.querySelector('.support-chat__panel'),
    close: widget.querySelector('.support-chat__close'),
    form: widget.querySelector('.support-chat__form'),
    message: widget.querySelector('textarea[name="message"]'),
    status: widget.querySelector('.support-chat__status'),
  };

  chatElements.toggle.addEventListener('click', () => {
    if (widget.classList.contains('is-open')) {
      closeSupportChat();
    } else {
      openSupportChat();
    }
  });
  chatElements.close.addEventListener('click', closeSupportChat);
  widget.querySelectorAll('[data-chat-question]').forEach((button) => {
    button.addEventListener('click', () => {
      chatElements.message.value = button.dataset.chatQuestion || '';
      chatElements.message.focus();
    });
  });
  chatElements.form.addEventListener('submit', sendSupportChatMessage);
}

function openSupportChat() {
  if (!chatElements.widget) return;
  closeCart();
  chatElements.widget.classList.add('is-open');
  chatElements.toggle.setAttribute('aria-expanded', 'true');
  chatElements.panel.setAttribute('aria-hidden', 'false');
  setTimeout(() => chatElements.message?.focus(), 80);
}

function closeSupportChat() {
  if (!chatElements.widget) return;
  chatElements.widget.classList.remove('is-open');
  chatElements.toggle.setAttribute('aria-expanded', 'false');
  chatElements.panel.setAttribute('aria-hidden', 'true');
}

async function sendSupportChatMessage(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const submitButton = form.querySelector('button[type="submit"]');

  chatElements.status.textContent = 'Отправляем вопрос...';
  chatElements.status.classList.remove('is-error');
  submitButton.disabled = true;

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: data.get('name') || '',
        contact: data.get('contact') || '',
        message: data.get('message') || '',
        page: window.location.href,
      }),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.ok) {
      throw new Error(result.message || result.error || 'Не удалось отправить вопрос');
    }

    saveChatCustomer(form);
    chatElements.status.textContent = 'Вопрос отправлен. Менеджер ответит по указанному контакту.';
    form.querySelector('textarea[name="message"]').value = '';
  } catch (error) {
    chatElements.status.textContent = 'Не удалось отправить вопрос. Позвоните нам или напишите в МАКС.';
    chatElements.status.classList.add('is-error');
    console.error(error);
  } finally {
    submitButton.disabled = false;
  }
}

function enhanceCartButtons() {
  document.querySelectorAll('.btn-add-to-cart').forEach((button) => {
    button.textContent = 'В корзину';
    button.setAttribute('aria-label', `Добавить в корзину: ${button.dataset.product || 'товар'}`);
  });

  document.querySelectorAll('.detail-summary').forEach((summary) => {
    if (summary.querySelector('.detail-cart-add')) return;
    const requestButton = summary.querySelector('[data-modal="request"]');
    if (!requestButton) return;
    const cartButton = document.createElement('button');
    cartButton.className = 'button button--secondary detail-cart-add';
    cartButton.type = 'button';
    cartButton.dataset.product = requestButton.dataset.product || summary.querySelector('h1')?.textContent || document.title;
    cartButton.textContent = 'Добавить в корзину';
    requestButton.insertAdjacentElement('afterend', cartButton);
  });

  document.querySelectorAll('.detail-cart-add').forEach((button) => {
    button.addEventListener('click', () => addCartItem(getProductFromElement(button)));
  });
}

document.querySelectorAll('.request-form').forEach((form) => {
  ensureTelegramField(form);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    await sendLead(event.currentTarget, 'Расчет изделия');
  });
});

buildCartUi();
buildSupportChatUi();
enhanceCartButtons();
renderCart();

document.querySelectorAll('[data-modal="request"]').forEach((button) => {
  button.addEventListener('click', () => {
    if (button.classList.contains('btn-add-to-cart')) {
      addCartItem(getProductFromElement(button));
      return;
    }

    const requestForm = requestModal?.querySelector('.request-form');
    if (requestForm) requestForm.dataset.includeCart = '';

    const product = button.dataset.product;
    const productSelect = requestModal?.querySelector('select[name="product"]');

    if (product && productSelect) {
      const option = Array.from(productSelect.options).find((item) => item.textContent.trim() === product);
      if (option) productSelect.value = option.value;
    }

    openModal(requestModal);
  });
});

document.querySelectorAll('[data-video-src]').forEach((button) => {
  button.addEventListener('click', () => {
    if (!videoModal || !modalVideo) return;

    modalVideo.src = button.dataset.videoSrc;
    openModal(videoModal);
    modalVideo.load();
  });
});

document.querySelectorAll('.modal').forEach((modal) => {
  modal.addEventListener('click', (event) => {
    if (event.target.matches('[data-close]')) {
      closeModal(modal);
    }
  });
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  closeCart();
  closeSupportChat();
  document.querySelectorAll('.modal.is-open').forEach(closeModal);
});

document.querySelectorAll('.faq-item').forEach((item) => {
  item.addEventListener('click', () => {
    const isOpen = item.getAttribute('aria-expanded') === 'true';
    item.setAttribute('aria-expanded', String(!isOpen));
  });
});

const filterInputs = Array.from(document.querySelectorAll('[data-filter-group]'));
const productCards = Array.from(document.querySelectorAll('.product-card'));
const catalogGrid = document.querySelector('.catalog-grid');

if (filterInputs.length && productCards.length && catalogGrid) {
  const emptyState = document.createElement('p');
  emptyState.className = 'catalog-empty';
  emptyState.textContent = 'По выбранным фильтрам товаров нет. Снимите часть фильтров или выберите другую категорию.';
  catalogGrid.append(emptyState);

  const getSelectedValues = (group) =>
    filterInputs
      .filter((input) => input.dataset.filterGroup === group && input.checked)
      .map((input) => input.dataset.filterValue);

  const cardHasAnyValue = (card, field, selectedValues) => {
    if (!selectedValues.length) return true;
    const cardValues = (card.dataset[field] || '').split(/\s+/).filter(Boolean);
    return selectedValues.some((value) => cardValues.includes(value));
  };

  const applyCatalogFilters = () => {
    const selectedCategories = getSelectedValues('category').filter((value) => value !== 'all');
    const selectedShapes = getSelectedValues('shape');
    const selectedCovers = getSelectedValues('cover');
    let visibleCount = 0;

    productCards.forEach((card) => {
      const isVisible =
        cardHasAnyValue(card, 'category', selectedCategories) &&
        cardHasAnyValue(card, 'shape', selectedShapes) &&
        cardHasAnyValue(card, 'cover', selectedCovers);

      card.classList.toggle('is-hidden', !isVisible);
      if (isVisible) visibleCount += 1;
    });

    emptyState.classList.toggle('is-visible', visibleCount === 0);
  };

  filterInputs.forEach((input) => {
    input.addEventListener('change', () => {
      const allProducts = filterInputs.find(
        (item) => item.dataset.filterGroup === 'category' && item.dataset.filterValue === 'all'
      );

      if (input.dataset.filterValue === 'all' && input.checked) {
        filterInputs
          .filter((item) => item !== input)
          .forEach((item) => {
            item.checked = false;
          });
      } else if (allProducts) {
        const hasActiveFilters = filterInputs.some((item) => item !== allProducts && item.checked);
        allProducts.checked = !hasActiveFilters;
      }

      applyCatalogFilters();
    });
  });

  applyCatalogFilters();
}

const detailImage = document.querySelector('#detailImage');
document.querySelectorAll('[data-detail-image]').forEach((button) => {
  button.addEventListener('click', () => {
    if (!detailImage) return;

    detailImage.src = button.dataset.detailImage;
    if (button.dataset.detailAlt) detailImage.alt = button.dataset.detailAlt;
    if (button.dataset.detailWidth) detailImage.width = Number(button.dataset.detailWidth);
    if (button.dataset.detailHeight) detailImage.height = Number(button.dataset.detailHeight);
    document.querySelectorAll('[data-detail-image]').forEach((item) => {
      item.classList.toggle('is-active', item === button);
    });
  });
});

document.querySelectorAll('.b2b-form').forEach((form) => {
  const inputs = form.querySelectorAll('input');
  ensureFieldName(inputs[0], 'name');
  ensureFieldName(inputs[1], 'phone');
  ensureFieldName(inputs[2], 'email');
  form.dataset.product = 'Оптовое сотрудничество';
  ensureTelegramField(form);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    await sendLead(event.currentTarget, 'Оптовое сотрудничество');
  });
});

document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener('click', (event) => {
    const href = link.getAttribute('href');
    if (href !== '#' && href !== '#top') {
      const target = document.querySelector(href);
      if (target) {
        event.preventDefault();
        target.scrollIntoView({ behavior: 'smooth' });
      }
    }
  });
});
