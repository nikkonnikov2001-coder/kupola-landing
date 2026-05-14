const body = document.body;
const requestModal = document.querySelector('#requestModal');
let lastFocused = null;

// Modal Management
function openModal(modal) {
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
  body.classList.remove('modal-open');
  if (lastFocused && typeof lastFocused.focus === 'function') {
    lastFocused.focus();
  }
}

// Request Modal Trigger
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

// Modal Close Handlers
document.querySelectorAll('.modal').forEach((modal) => {
  modal.addEventListener('click', (event) => {
    if (event.target.matches('[data-close]')) {
      closeModal(modal);
    }
  });
});

// Escape Key to Close Modal
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  document.querySelectorAll('.modal.is-open').forEach(closeModal);
});

// FAQ Accordion
document.querySelectorAll('.faq-item').forEach((item) => {
  item.addEventListener('click', () => {
    const isOpen = item.getAttribute('aria-expanded') === 'true';
    item.setAttribute('aria-expanded', String(!isOpen));
  });
});

// B2B Form Submission
document.querySelectorAll('.b2b-form').forEach((form) => {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const currentForm = event.currentTarget;
    const data = new FormData(currentForm);
    const name = data.get('name') || '';
    const phone = data.get('phone') || '';
    const email = data.get('email') || '';
    
    const body = [
      `Имя: ${name}`,
      `Телефон: ${phone}`,
      `Email: ${email}`,
      '',
      'Запрос на оптовое сотрудничество'
    ].join('\n');

    window.location.href = `mailto:gal4444@yandex.ru?subject=${encodeURIComponent('Запрос на оптовое сотрудничество')}&body=${encodeURIComponent(body)}`;
  });
});

// Request Form Submission
document.querySelectorAll('.request-form').forEach((form) => {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const currentForm = event.currentTarget;
    const data = new FormData(currentForm);
    const product = data.get('product') || currentForm.dataset.product || 'Расчет изделия';
    const name = data.get('name') || '';
    const phone = data.get('phone') || '';
    const message = data.get('message') || '';
    const status = currentForm.querySelector('.form-status');
    
    const body = [
      `Имя: ${name}`,
      `Телефон: ${phone}`,
      `Изделие: ${product}`,
      '',
      'Комментарий:',
      message,
    ].join('\n');

    status.textContent = 'Открываем письмо с заполненной заявкой. Если почтовый клиент не открылся, позвоните: 8 927 230-70-07.';
    window.location.href = `mailto:gal4444@yandex.ru?subject=${encodeURIComponent(`Заявка: ${product}`)}&body=${encodeURIComponent(body)}`;
  });
});

// Smooth Scroll for Anchor Links
document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener('click', (e) => {
    const href = link.getAttribute('href');
    if (href !== '#' && href !== '#top') {
      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth' });
      }
    }
  });
});
