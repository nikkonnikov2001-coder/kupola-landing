const ACCOUNT_LOCAL_KEY = 'kupolaAccountLocalV2';
const ACCOUNT_CART_KEY = 'kupolaCartV1';

const defaultLocal = {
  settings: {
    emailNotifications: true,
    smsNotifications: true,
    securityAlerts: true,
    language: 'ru',
    security: 'basic',
  },
  bonus: 3500,
  balance: 0,
  orders: [
    {
      id: 'ORD-1024',
      date: '2026-05-18',
      product: 'Полумесяцы мини',
      status: 'В обработке',
      amount: 5200,
      payment: 'Ожидает счета',
    },
    {
      id: 'ORD-1023',
      date: '2026-05-16',
      product: 'Купола сферические',
      status: 'Расчет подготовлен',
      amount: 50000,
      payment: 'Согласование',
    },
  ],
  tickets: [],
  favorites: [
    {
      title: 'Полумесяцы мини',
      href: 'mini-crescents.html',
      image: 'assets/optimized/mini-crescents-main-cover-360.webp',
      note: 'В наличии на складе',
    },
    {
      title: 'Листы с покрытием нитрид титана',
      href: 'titanium-sheets.html',
      image: 'assets/optimized/titanium-sheets-360.webp',
      note: 'Размеры и цвета в разделе',
    },
  ],
  documents: [
    { title: 'Договор-оферта', type: 'PDF', status: 'Доступен', href: '/oferta' },
    { title: 'Политика обработки персональных данных', type: 'HTML', status: 'Доступна', href: '/privacy' },
    { title: 'Сертификаты на материалы', type: 'PDF', status: 'По запросу', href: '#' },
  ],
  finance: [
    { date: '2026-05-18', title: 'Счет на полумесяцы мини', amount: 5200, status: 'К оплате' },
    { date: '2026-05-16', title: 'Предварительный расчет купола', amount: 50000, status: 'Черновик' },
  ],
};

const authScreen = document.querySelector('[data-auth-screen]');
const accountShell = document.querySelector('[data-account-shell]');
let currentCustomer = null;

function cloneDefaultLocal() {
  return JSON.parse(JSON.stringify(defaultLocal));
}

function readLocal() {
  try {
    const saved = JSON.parse(localStorage.getItem(ACCOUNT_LOCAL_KEY) || '{}');
    return {
      ...cloneDefaultLocal(),
      ...saved,
      settings: { ...defaultLocal.settings, ...(saved.settings || {}) },
      orders: Array.isArray(saved.orders) ? saved.orders : defaultLocal.orders,
      tickets: Array.isArray(saved.tickets) ? saved.tickets : defaultLocal.tickets,
      favorites: Array.isArray(saved.favorites) ? saved.favorites : defaultLocal.favorites,
      documents: Array.isArray(saved.documents) ? saved.documents : defaultLocal.documents,
      finance: Array.isArray(saved.finance) ? saved.finance : defaultLocal.finance,
    };
  } catch {
    return cloneDefaultLocal();
  }
}

function saveLocal(local) {
  localStorage.setItem(ACCOUNT_LOCAL_KEY, JSON.stringify(local));
}

async function customerApi(action, options = {}) {
  const response = await fetch(`/api/customer?action=${encodeURIComponent(action)}`, {
    method: options.method || 'GET',
    credentials: 'same-origin',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload.ok) {
    const error = new Error(payload.error || payload.message || 'request_failed');
    error.status = response.status;
    throw error;
  }

  return payload;
}

function getErrorMessage(error) {
  const message = error.message || '';
  if (message === 'bad_credentials') return 'Неверный телефон/email или пароль.';
  if (message === 'customer_exists') return 'Клиент с таким телефоном или email уже зарегистрирован.';
  if (message === 'name_phone_password_required') return 'Укажите имя, телефон и пароль от 4 символов.';
  if (message === 'name_phone_required') return 'Укажите имя и телефон.';
  if (message === 'bad_password') return 'Пароль должен быть не короче 4 символов.';
  if (error.status === 401) return 'Сессия истекла. Войдите заново.';
  return 'Не удалось выполнить действие. Попробуйте еще раз.';
}

function formatMoney(value) {
  return `${Math.max(0, Number(value) || 0).toLocaleString('ru-RU')} руб`;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
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

function readCartItems() {
  try {
    const items = JSON.parse(localStorage.getItem(ACCOUNT_CART_KEY) || '[]');
    return Array.isArray(items) ? items.filter((item) => item && item.title) : [];
  } catch {
    return [];
  }
}

function getProfileName(customer) {
  return customer?.name || customer?.phone || customer?.email || 'Клиент';
}

function setStatus(selector, message, isError = false) {
  const node = document.querySelector(selector);
  if (!node) return;
  node.textContent = message;
  node.classList.toggle('is-error', isError);
}

function switchAuth(mode) {
  const forms = {
    login: document.querySelector('[data-account-login]'),
    register: document.querySelector('[data-account-register]'),
    recovery: document.querySelector('[data-account-recovery]'),
  };

  Object.entries(forms).forEach(([name, form]) => {
    if (!form) return;
    const active = name === mode;
    form.hidden = !active;
    form.classList.toggle('is-active', active);
  });
}

function setPanel(name) {
  document.querySelectorAll('[data-account-tab]').forEach((tab) => {
    tab.classList.toggle('is-active', tab.dataset.accountTab === name);
  });
  document.querySelectorAll('[data-account-panel]').forEach((panel) => {
    panel.classList.toggle('is-active', panel.dataset.accountPanel === name);
  });
  if (history.replaceState) {
    history.replaceState(null, '', `#${name}`);
  }
}

function showAuthenticated(customer) {
  currentCustomer = customer;
  authScreen.hidden = true;
  accountShell.hidden = false;
  renderAccount(customer);
}

function showGuest() {
  currentCustomer = null;
  authScreen.hidden = false;
  accountShell.hidden = true;
  switchAuth('login');
}

function getSyntheticCartOrder(cartItems) {
  if (!cartItems.length) return null;
  const amount = cartItems.reduce((sum, item) => {
    const quantity = Math.max(1, Number(item.quantity) || 1);
    return sum + (Number(item.priceValue) || 0) * quantity;
  }, 0);

  return {
    id: 'CART',
    date: new Date().toISOString().slice(0, 10),
    product: `Корзина (${cartItems.length} поз.)`,
    status: 'Черновик',
    amount,
    payment: 'Не отправлено',
  };
}

function renderAccount(customer) {
  const local = readLocal();
  const cartItems = readCartItems();
  const cartOrder = getSyntheticCartOrder(cartItems);
  const orders = cartOrder ? [cartOrder, ...local.orders] : local.orders;
  const favorites = local.favorites;
  const bonus = Number(local.bonus) || 0;
  const avatar = customer.avatar || 'assets/profile-logo.jpg';

  document.querySelectorAll('[data-account-avatar], [data-profile-avatar-preview]').forEach((image) => {
    image.src = avatar;
  });
  document.querySelector('[data-account-name]').textContent = getProfileName(customer);
  document.querySelector('[data-account-contact]').textContent = customer.phone || customer.email || 'Контакт не указан';
  document.querySelector('[data-account-stat="orders"]').textContent = String(orders.length);
  document.querySelector('[data-account-stat="favorites"]').textContent = String(favorites.length);
  document.querySelector('[data-account-stat="bonus"]').textContent = String(bonus);
  document.querySelector('[data-overview-orders]').textContent = String(orders.filter((order) => order.status !== 'Завершен').length);
  document.querySelector('[data-overview-balance]').textContent = formatMoney(local.balance);
  document.querySelector('[data-overview-bonus]').textContent = String(bonus);
  document.querySelector('[data-bonus-points]').textContent = String(bonus);

  fillProfileForm(customer);
  fillSettingsForm(local);
  renderActivity(local, orders);
  renderOrders(orders);
  renderTickets(local.tickets);
  renderOffers();
  renderFinance(local.finance);
  renderFavorites(favorites, cartItems);
  renderDocuments(local.documents);
}

function fillProfileForm(customer) {
  const form = document.querySelector('[data-account-profile]');
  if (!form) return;
  ['name', 'phone', 'email', 'telegram', 'city', 'company'].forEach((key) => {
    const field = form.elements[key];
    if (field) field.value = customer[key] || '';
  });
}

function fillSettingsForm(local) {
  const form = document.querySelector('[data-account-settings]');
  if (!form) return;
  Object.entries(local.settings).forEach(([key, value]) => {
    const field = form.elements[key];
    if (!field) return;
    if (field.type === 'checkbox') field.checked = Boolean(value);
    else field.value = value;
  });
}

function renderActivity(local, orders) {
  const activity = [
    ...orders.slice(0, 3).map((order) => ({
      title: order.product,
      meta: `${formatDate(order.date)} · ${order.status}`,
    })),
    ...local.tickets.slice(0, 2).map((ticket) => ({
      title: ticket.topic,
      meta: `${formatDate(ticket.date)} · обращение создано`,
    })),
  ];

  document.querySelector('[data-account-activity]').innerHTML = activity.length
    ? activity.map((item) => `<div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.meta)}</span></div>`).join('')
    : '<p>Пока нет действий.</p>';
}

function renderOrders(orders) {
  const rows = orders.map((order) => `
    <article class="account-row">
      <div><strong>${escapeHtml(order.id)}</strong><span>${formatDate(order.date)}</span></div>
      <div><strong>${escapeHtml(order.product)}</strong><span>${escapeHtml(order.payment)}</span></div>
      <div><span class="account-badge">${escapeHtml(order.status)}</span></div>
      <div><strong>${formatMoney(order.amount)}</strong></div>
    </article>
  `).join('');

  document.querySelector('[data-account-orders]').innerHTML = `
    <div class="account-table__head"><span>Номер</span><span>Товар</span><span>Статус</span><span>Сумма</span></div>
    ${rows || '<p>История пока пустая.</p>'}
  `;
}

function renderTickets(tickets) {
  document.querySelector('[data-account-tickets]').innerHTML = tickets.length
    ? tickets.map((ticket) => `<div><strong>${escapeHtml(ticket.topic)}</strong><span>${formatDate(ticket.date)} · ${escapeHtml(ticket.message)}</span></div>`).join('')
    : '<p>Обращений пока нет.</p>';
}

function renderOffers() {
  const offers = [
    { title: 'Скидка на повторный заказ', text: 'Персональная скидка после первого оплаченного заказа.' },
    { title: 'Быстрый расчет из корзины', text: 'Добавьте товары в корзину и отправьте одну заявку менеджеру.' },
    { title: 'Документы по запросу', text: 'Сертификаты и договоры можно запросить в разделе поддержки.' },
  ];

  document.querySelector('[data-account-offers]').innerHTML = offers.map((offer) => `
    <article>
      <strong>${escapeHtml(offer.title)}</strong>
      <p>${escapeHtml(offer.text)}</p>
    </article>
  `).join('');
}

function renderFinance(finance) {
  document.querySelector('[data-account-finance]').innerHTML = `
    <div class="account-table__head"><span>Дата</span><span>Операция</span><span>Статус</span><span>Сумма</span></div>
    ${finance.map((item) => `
      <article class="account-row">
        <div><strong>${formatDate(item.date)}</strong></div>
        <div><strong>${escapeHtml(item.title)}</strong></div>
        <div><span class="account-badge">${escapeHtml(item.status)}</span></div>
        <div><strong>${formatMoney(item.amount)}</strong></div>
      </article>
    `).join('')}
  `;
}

function renderFavorites(favorites, cartItems) {
  const cartFavorites = cartItems.map((item) => ({
    title: item.title,
    href: item.href || '#',
    image: item.image || '',
    note: item.price || 'В корзине',
  }));
  const items = [...cartFavorites, ...favorites];

  document.querySelector('[data-account-favorites]').innerHTML = items.length
    ? items.map((item) => `
      <article>
        ${item.image ? `<img src="${escapeHtml(item.image)}" alt="">` : ''}
        <div>
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(item.note)}</span>
          <a href="${escapeHtml(item.href)}">Открыть</a>
        </div>
      </article>
    `).join('')
    : '<p>Избранных товаров пока нет.</p>';
}

function renderDocuments(documents) {
  document.querySelector('[data-account-documents]').innerHTML = documents.map((documentItem) => `
    <article>
      <div>
        <strong>${escapeHtml(documentItem.title)}</strong>
        <span>${escapeHtml(documentItem.type)} · ${escapeHtml(documentItem.status)}</span>
      </div>
      <a class="button button--secondary" href="${escapeHtml(documentItem.href)}">Открыть</a>
    </article>
  `).join('');
}

async function refreshSession() {
  try {
    const payload = await customerApi('me');
    if (payload.authenticated && payload.customer) showAuthenticated(payload.customer);
    else showGuest();
  } catch {
    showGuest();
  }
}

function initAuth() {
  document.querySelector('[data-show-recovery]')?.addEventListener('click', () => switchAuth('recovery'));
  document.querySelectorAll('[data-show-login]').forEach((button) => {
    button.addEventListener('click', () => switchAuth('login'));
  });
  document.querySelector('[data-show-register]')?.addEventListener('click', () => switchAuth('register'));

  document.querySelector('[data-account-login]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    setStatus('[data-account-login-status]', 'Проверяем доступ...');

    try {
      const payload = await customerApi('login', {
        method: 'POST',
        body: {
          login: String(data.get('login') || '').trim(),
          password: String(data.get('password') || ''),
        },
      });
      form.reset();
      setStatus('[data-account-login-status]', '');
      showAuthenticated(payload.customer);
    } catch (error) {
      setStatus('[data-account-login-status]', getErrorMessage(error), true);
    } finally {
      button.disabled = false;
    }
  });

  document.querySelector('[data-account-register]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const password = String(data.get('password') || '');
    const confirm = String(data.get('confirm') || '');

    if (password.length < 4 || password !== confirm) {
      setStatus('[data-account-register-status]', 'Пароли должны совпадать и быть не короче 4 символов.', true);
      return;
    }

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    setStatus('[data-account-register-status]', 'Создаем аккаунт...');

    try {
      const payload = await customerApi('register', {
        method: 'POST',
        body: {
          name: String(data.get('name') || '').trim(),
          phone: String(data.get('phone') || '').trim(),
          email: String(data.get('email') || '').trim(),
          telegram: String(data.get('telegram') || '').trim(),
          password,
        },
      });
      form.reset();
      setStatus('[data-account-register-status]', '');
      showAuthenticated(payload.customer);
    } catch (error) {
      setStatus('[data-account-register-status]', getErrorMessage(error), true);
    } finally {
      button.disabled = false;
    }
  });

  document.querySelector('[data-account-recovery]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    setStatus('[data-account-recovery-status]', 'Инструкция по восстановлению подготовлена. Менеджер подтвердит доступ по указанному контакту.');
  });

  document.querySelector('[data-account-logout]')?.addEventListener('click', async () => {
    await customerApi('logout', { method: 'POST', body: {} }).catch(() => {});
    showGuest();
  });
}

function initTabs() {
  document.querySelectorAll('[data-account-tab], [data-account-tab-link]').forEach((button) => {
    button.addEventListener('click', () => setPanel(button.dataset.accountTab || button.dataset.accountTabLink));
  });

  const initial = window.location.hash.replace('#', '');
  if (initial && document.querySelector(`[data-account-panel="${initial}"]`)) {
    setPanel(initial);
  }
}

function initProfile() {
  const form = document.querySelector('[data-account-profile]');
  if (!form) return;

  form.elements.avatar?.addEventListener('change', (event) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    if (file.size > 280000) {
      setStatus('[data-profile-status]', 'Аватар должен быть меньше 280 КБ.', true);
      return;
    }
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      document.querySelector('[data-profile-avatar-preview]').src = String(reader.result || '');
    });
    reader.readAsDataURL(file);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const button = form.querySelector('button[type="submit"]');
    const avatarPreview = document.querySelector('[data-profile-avatar-preview]');
    button.disabled = true;
    setStatus('[data-profile-status]', 'Сохраняем профиль...');

    try {
      const payload = await customerApi('profile', {
        method: 'POST',
        body: {
          name: String(data.get('name') || '').trim(),
          phone: String(data.get('phone') || '').trim(),
          email: String(data.get('email') || '').trim(),
          telegram: String(data.get('telegram') || '').trim(),
          city: String(data.get('city') || '').trim(),
          company: String(data.get('company') || '').trim(),
          avatar: avatarPreview?.src?.startsWith('data:') ? avatarPreview.src : currentCustomer?.avatar || '',
        },
      });
      setStatus('[data-profile-status]', 'Профиль сохранен.');
      showAuthenticated(payload.customer);
    } catch (error) {
      setStatus('[data-profile-status]', getErrorMessage(error), true);
    } finally {
      button.disabled = false;
    }
  });
}

function initPassword() {
  document.querySelector('[data-account-password]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = String(data.get('password') || '');
    const confirm = String(data.get('confirm') || '');
    if (password.length < 4 || password !== confirm) {
      setStatus('[data-password-status]', 'Пароли должны совпадать и быть не короче 4 символов.', true);
      return;
    }

    try {
      await customerApi('password', { method: 'POST', body: { password } });
      event.currentTarget.reset();
      setStatus('[data-password-status]', 'Пароль обновлен.');
    } catch (error) {
      setStatus('[data-password-status]', getErrorMessage(error), true);
    }
  });
}

function initSettings() {
  document.querySelector('[data-account-settings]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const local = readLocal();
    local.settings = {
      emailNotifications: form.elements.emailNotifications.checked,
      smsNotifications: form.elements.smsNotifications.checked,
      securityAlerts: form.elements.securityAlerts.checked,
      language: form.elements.language.value,
      security: form.elements.security.value,
    };
    saveLocal(local);
    setStatus('[data-settings-status]', 'Настройки сохранены.');
  });
}

function initTickets() {
  document.querySelector('[data-account-ticket]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const message = String(data.get('message') || '').trim();
    if (!message) {
      setStatus('[data-ticket-status]', 'Напишите текст обращения.', true);
      return;
    }

    const local = readLocal();
    local.tickets.unshift({
      topic: String(data.get('topic') || 'Обращение'),
      message,
      date: new Date().toISOString(),
    });
    saveLocal(local);
    form.reset();
    if (currentCustomer) renderAccount(currentCustomer);
    setStatus('[data-ticket-status]', 'Обращение сохранено в кабинете.');
  });
}

initAuth();
initTabs();
initProfile();
initPassword();
initSettings();
initTickets();
refreshSession();
