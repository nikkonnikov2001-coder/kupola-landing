const body = document.body;
const requestModal = document.querySelector('#requestModal');
const galleryModal = document.querySelector('#galleryModal');
const galleryPreview = document.querySelector('#galleryPreview');
let lastFocused = null;

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

document.querySelectorAll('[data-card-link]').forEach((card) => {
  card.addEventListener('click', (event) => {
    if (event.target.closest('a, button')) return;
    window.location.href = card.dataset.cardLink;
  });
});

document.querySelectorAll('[data-gallery]').forEach((button) => {
  button.addEventListener('click', (event) => {
    const gallerySlide = event.currentTarget.closest('.gallery-slide');
    const productLink = gallerySlide?.querySelector('.gallery-slide__link');

    if (productLink) {
      window.location.href = productLink.href;
      return;
    }

    galleryPreview.src = button.dataset.gallery;
    openModal(galleryModal);
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

document.querySelectorAll('[data-carousel]').forEach((carousel) => {
  const track = carousel.querySelector('[data-carousel-track]');
  const slides = Array.from(carousel.querySelectorAll('.gallery-slide'));
  const dotsRoot = carousel.querySelector('[data-carousel-dots]');
  const prevButton = carousel.querySelector('[data-carousel-prev]');
  const nextButton = carousel.querySelector('[data-carousel-next]');
  let activeIndex = 0;
  let scrollFrame = null;

  if (!track || slides.length === 0) return;

  const setActive = (nextIndex) => {
    activeIndex = Math.max(0, Math.min(nextIndex, slides.length - 1));
    slides.forEach((slide, index) => slide.classList.toggle('is-active', index === activeIndex));
    carousel.querySelectorAll('[data-carousel-dot]').forEach((dot, index) => {
      dot.classList.toggle('is-active', index === activeIndex);
      dot.setAttribute('aria-current', index === activeIndex ? 'true' : 'false');
    });
  };

  const scrollToSlide = (index) => {
    const slide = slides[Math.max(0, Math.min(index, slides.length - 1))];
    track.scrollTo({
      left: slide.offsetLeft - (track.clientWidth - slide.clientWidth) / 2,
      behavior: 'smooth',
    });
    setActive(slides.indexOf(slide));
  };

  if (dotsRoot) {
    slides.forEach((_, index) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.dataset.carouselDot = String(index);
      dot.setAttribute('aria-label', `Слайд ${index + 1}`);
      dot.addEventListener('click', () => scrollToSlide(index));
      dotsRoot.append(dot);
    });
  }

  if (prevButton) {
    prevButton.addEventListener('click', () => scrollToSlide(activeIndex - 1));
  }

  if (nextButton) {
    nextButton.addEventListener('click', () => scrollToSlide(activeIndex + 1));
  }

  track.addEventListener(
    'wheel',
    (event) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      track.scrollLeft += event.deltaY;
    },
    { passive: false },
  );

  track.addEventListener('scroll', () => {
    if (scrollFrame) window.cancelAnimationFrame(scrollFrame);
    scrollFrame = window.requestAnimationFrame(() => {
      const center = track.scrollLeft + track.clientWidth / 2;
      const closestIndex = slides.reduce((bestIndex, slide, index) => {
        const bestSlide = slides[bestIndex];
        const slideCenter = slide.offsetLeft + slide.clientWidth / 2;
        const bestCenter = bestSlide.offsetLeft + bestSlide.clientWidth / 2;
        return Math.abs(slideCenter - center) < Math.abs(bestCenter - center) ? index : bestIndex;
      }, 0);
      setActive(closestIndex);
    });
  });

  setActive(0);
});

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

const detailImage = document.querySelector('#detailImage');
if (detailImage) {
  const detailButtons = document.querySelectorAll('[data-detail-image]');

  const setDetailImage = (button) => {
    detailButtons.forEach((item) => item.classList.remove('is-active'));
    button.classList.add('is-active');
    detailImage.src = button.dataset.detailImage;
  };

  detailButtons.forEach((button) => {
    button.addEventListener('click', () => {
      setDetailImage(button);
    });
  });

  const requestedImage = new URLSearchParams(window.location.search).get('image');
  if (requestedImage) {
    const requestedButton = Array.from(detailButtons).find((button) => button.dataset.detailImage === requestedImage);
    if (requestedButton) setDetailImage(requestedButton);
  }
}
