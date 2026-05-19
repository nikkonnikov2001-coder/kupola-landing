const body = document.body;
const requestModal = document.querySelector('#requestModal');
const videoModal = document.querySelector('#videoModal');
const modalVideo = document.querySelector('#modalVideo');
let lastFocused = null;

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
  const product = data.get('product') || form.dataset.product || 'Расчет изделия';

  return {
    type,
    product,
    name: data.get('name') || '',
    phone: data.get('phone') || '',
    email: data.get('email') || '',
    telegram: data.get('telegram') || '',
    message: data.get('message') || '',
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

document.querySelectorAll('.request-form').forEach((form) => {
  ensureTelegramField(form);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    await sendLead(event.currentTarget, 'Расчет изделия');
  });
});

document.querySelectorAll('[data-modal="request"]').forEach((button) => {
  button.addEventListener('click', () => {
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
