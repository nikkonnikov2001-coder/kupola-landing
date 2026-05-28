const ACCOUNT_STORAGE_KEY = 'kupolaAccountV1';
const ACCOUNT_CART_KEY = 'kupolaCartV1';

const defaultAccount = {
  session: false,
  passwordUpdatedAt: '',
  profile: {
    name: '',
    phone: '',
    email: '',
    telegram: '',
    city: '',
    company: '',
    avatar: '',
  },
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

function cloneDefaultAccount() {
  return JSON.parse(JSON.stringify(defaultAccount));
}

function readAccount() {
  try {
    const saved = JSON.parse(localStorage.getItem(ACCOUNT_STORAGE_KEY) || '{}');
    return {
      ...cloneDefaultAccount(),
      ...saved,
      profile: { ...defaultAccount.profile, ...(saved.profile || {}) },
      settings: { ...defaultAccount.settings, ...(saved.settings || {}) },
      orders: Array.isArray(saved.orders) ? saved.orders : defaultAccount.orders,
      tickets: Array.isArray(saved.tickets) ? saved.tickets : defaultAccount.tickets,
      favorites: Array.isArray(saved.favorites) ? saved.favorites : defaultAccount.favorites,
      documents: Array.isArray(saved.documents) ? saved.documents : defaultAccount.documents,
      finance: Array.isArray(saved.finance) ? saved.finance : defaultAccount.finance,
    };
  } catch {
    return cloneDefaultAccount();
  }
}

function saveAccount(account) {
  localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(account));
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

function getProfileName(account) {
  return account.profile.name || account.profile.phone || account.profile.email || 'Клиент';
}

function setStatus(selector, message, isError = false) {
  const node = document.querySelector(selector);
  if (!node) return;
  node.textContent = message;
  node.classList.toggle('is-error', isError);
}

function switchAuth(mode) {
  const login = document.querySelector('[data-account-login]');
  const recovery = document.querySelector('[data-account-recovery]');
  const showRecovery = mode === 'recovery';
  login.hidden = showRecovery;
  recovery.hidden = !showRecovery;
  login.classList.toggle('is-active', !showRecovery);
  recovery.classList.toggle('is-active', showRecovery);
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

function showAuthenticated(account) {
  authScreen.hidden = true;
  accountShell.hidden = false;
  renderAccount(account);
}

function showGuest() {
  authScreen.hidden = false;
  accountShell.hidden = true;
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

function renderAccount(account) {
  const cartItems = readCartItems();
  const cartOrder = getSyntheticCartOrder(cartItems);
  const orders = cartOrder ? [cartOrder, ...account.orders] : account.orders;
  const favorites = account.favorites;
  const bonus = Number(account.bonus) || 0;
  const avatar = account.profile.avatar || 'assets/profile-logo.jpg';

  document.querySelectorAll('[data-account-avatar], [data-profile-avatar-preview]').forEach((image) => {
    image.src = avatar;
  });
  document.querySelector('[data-account-name]').textContent = getProfileName(account);
  document.querySelector('[data-account-contact]').textContent = account.profile.phone || account.profile.email || 'Контакт не указан';
  document.querySelector('[data-account-stat="orders"]').textContent = String(orders.length);
  document.querySelector('[data-account-stat="favorites"]').textContent = String(favorites.length);
  document.querySelector('[data-account-stat="bonus"]').textContent = String(bonus);
  document.querySelector('[data-overview-orders]').textContent = String(orders.filter((order) => order.status !== 'Завершен').length);
  document.querySelector('[data-overview-balance]').textContent = formatMoney(account.balance);
  document.querySelector('[data-overview-bonus]').textContent = String(bonus);
  document.querySelector('[data-bonus-points]').textContent = String(bonus);

  fillProfileForm(account);
  fillSettingsForm(account);
  renderActivity(account, orders);
  renderOrders(orders);
  renderTickets(account.tickets);
  renderOffers(account);
  renderFinance(account.finance);
  renderFavorites(favorites, cartItems);
  renderDocuments(account.documents);
}

function fillProfileForm(account) {
  const form = document.querySelector('[data-account-profile]');
  if (!form) return;
  Object.entries(account.profile).forEach(([key, value]) => {
    const field = form.elements[key];
    if (field && field.type !== 'file') field.value = value || '';
  });
}

function fillSettingsForm(account) {
  const form = document.querySelector('[data-account-settings]');
  if (!form) return;
  Object.entries(account.settings).forEach(([key, value]) => {
    const field = form.elements[key];
    if (!field) return;
    if (field.type === 'checkbox') field.checked = Boolean(value);
    else field.value = value;
  });
}

function renderActivity(account, orders) {
  const activity = [
    ...orders.slice(0, 3).map((order) => ({
      title: order.product,
      meta: `${formatDate(order.date)} · ${order.status}`,
    })),
    ...account.tickets.slice(0, 2).map((ticket) => ({
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

function renderOffers(account) {
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

function initAuth() {
  const account = readAccount();
  if (account.session) showAuthenticated(account);
  else showGuest();

  document.querySelector('[data-show-recovery]')?.addEventListener('click', () => switchAuth('recovery'));
  document.querySelector('[data-show-login]')?.addEventListener('click', () => switchAuth('login'));

  document.querySelector('[data-account-login]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const login = String(new FormData(form).get('login') || '').trim();
    const password = String(new FormData(form).get('password') || '');
    if (password.length < 4) {
      setStatus('[data-account-login-status]', 'Пароль должен быть не короче 4 символов.', true);
      return;
    }

    const next = readAccount();
    next.session = true;
    if (login.includes('@')) next.profile.email = next.profile.email || login;
    else next.profile.phone = next.profile.phone || login;
    if (!next.profile.name) next.profile.name = 'Клиент';
    saveAccount(next);
    setStatus('[data-account-login-status]', '');
    showAuthenticated(next);
  });

  document.querySelector('[data-account-recovery]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    setStatus('[data-account-recovery-status]', 'Инструкция по восстановлению подготовлена. Менеджер подтвердит доступ по указанному контакту.');
  });

  document.querySelector('[data-account-logout]')?.addEventListener('click', () => {
    const next = readAccount();
    next.session = false;
    saveAccount(next);
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
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      const account = readAccount();
      account.profile.avatar = String(reader.result || '');
      saveAccount(account);
      renderAccount(account);
    });
    reader.readAsDataURL(file);
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const account = readAccount();
    ['name', 'phone', 'email', 'telegram', 'city', 'company'].forEach((key) => {
      account.profile[key] = String(data.get(key) || '').trim();
    });
    saveAccount(account);
    renderAccount(account);
    setStatus('[data-profile-status]', 'Профиль сохранен.');
  });
}

function initPassword() {
  document.querySelector('[data-account-password]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = String(data.get('password') || '');
    const confirm = String(data.get('confirm') || '');
    if (password.length < 4 || password !== confirm) {
      setStatus('[data-password-status]', 'Пароли должны совпадать и быть не короче 4 символов.', true);
      return;
    }
    const account = readAccount();
    account.passwordUpdatedAt = new Date().toISOString();
    saveAccount(account);
    event.currentTarget.reset();
    setStatus('[data-password-status]', 'Пароль обновлен для текущего кабинета.');
  });
}

function initSettings() {
  document.querySelector('[data-account-settings]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const account = readAccount();
    account.settings = {
      emailNotifications: form.elements.emailNotifications.checked,
      smsNotifications: form.elements.smsNotifications.checked,
      securityAlerts: form.elements.securityAlerts.checked,
      language: form.elements.language.value,
      security: form.elements.security.value,
    };
    saveAccount(account);
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

    const account = readAccount();
    account.tickets.unshift({
      topic: String(data.get('topic') || 'Обращение'),
      message,
      date: new Date().toISOString(),
    });
    saveAccount(account);
    form.reset();
    renderAccount(account);
    setStatus('[data-ticket-status]', 'Обращение сохранено в кабинете.');
  });
}

initAuth();
initTabs();
initProfile();
initPassword();
initSettings();
initTickets();
