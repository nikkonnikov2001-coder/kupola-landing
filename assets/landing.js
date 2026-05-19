const body = document.body;
const requestModal = document.querySelector('#requestModal');
const videoModal = document.querySelector('#videoModal');
const modalVideo = document.querySelector('#modalVideo');
let lastFocused = null;

function getFormValue(form, name) {
  return String(new FormData(form).get(name) || '').trim();
}

function buildRequestText(form) {
  const data = new FormData(form);
  const product = data.get('product') || form.dataset.product || 'Расчет изделия';
  const name = data.get('name') || '';
  const phone = data.get('phone') || '';
  const message = data.get('message') || '';

  return [
    'Здравствуйте. Хочу рассчитать изделие.',
    '',
    `Изделие: ${product}`,
    `Имя: ${name}`,
    `Телефон: ${phone}`,
    '',
    'Комментарий:',
    message || 'Без комментария',
  ].join('\n');
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
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const currentForm = event.currentTarget;
    const status = currentForm.querySelector('.form-status') || document.createElement('p');
    const product = getFormValue(currentForm, 'product') || 'Заявка';

    if (!status.parentElement) {
      status.className = 'form-status';
      currentForm.append(status);
    }

    status.textContent = 'Открываем письмо с заполненной заявкой. Если почтовый клиент не открылся, напишите в WhatsApp.';
    status.classList.remove('is-error');
    window.location.href = `mailto:gal4444@yandex.ru?subject=${encodeURIComponent(`Заявка: ${product}`)}&body=${encodeURIComponent(buildRequestText(currentForm))}`;
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
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const currentForm = event.currentTarget;
    const status = currentForm.querySelector('.form-status') || document.createElement('p');

    if (!status.parentElement) {
      status.className = 'form-status';
      currentForm.append(status);
    }

    const data = new FormData(currentForm);
    const bodyText = [
      `Имя: ${data.get('name') || ''}`,
      `Телефон: ${data.get('phone') || ''}`,
      `Email: ${data.get('email') || ''}`,
      '',
      'Запрос на оптовое сотрудничество',
    ].join('\n');

    window.location.href = `mailto:gal4444@yandex.ru?subject=${encodeURIComponent('Запрос на оптовое сотрудничество')}&body=${encodeURIComponent(bodyText)}`;
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
