(() => {
  const gallery = document.querySelector('[data-photo-gallery]');
  if (!gallery) return;
  let layoutWidth;
  function resizeGallery() {
    const width = gallery.clientWidth;
    if (!width || width === layoutWidth) return;
    layoutWidth = width;
    gallery.style.setProperty('--photo-row-height', `${Math.max(80, Math.min(192, width / 3.2))}px`);
  }
  resizeGallery();
  if (typeof ResizeObserver === 'function') new ResizeObserver(resizeGallery).observe(gallery);
  else window.addEventListener('resize', resizeGallery);

  function sizePhoto(image) {
    if (image.tagName !== 'IMG' || !image.naturalWidth || !image.naturalHeight) return;
    const figure = image.closest('.photo-gallery-item');
    if (figure) figure.style.setProperty('--photo-ratio', image.naturalWidth / image.naturalHeight);
  }
  gallery.addEventListener('load', event => sizePhoto(event.target), true);
  gallery.querySelectorAll('img').forEach(sizePhoto);

  const viewer = document.querySelector('.photo-viewer');
  if (!gallery || !viewer || typeof viewer.showModal !== 'function') return;

  let photos = [];
  const image = viewer.querySelector('[data-photo-image]');
  const caption = viewer.querySelector('[data-photo-caption]');
  const position = viewer.querySelector('[data-photo-position]');
  const error = viewer.querySelector('[data-photo-error]');
  const previous = viewer.querySelector('[data-photo-previous]');
  const next = viewer.querySelector('[data-photo-next]');
  let current = 0;
  let trigger;

  function showPhoto(index) {
    current = (index + photos.length) % photos.length;
    const photo = photos[current];
    error.hidden = true;
    image.alt = photo.querySelector('img').alt;
    image.dataset.fallback = photo.dataset.fallback || '';
    image.src = photo.href;
    caption.textContent = photo.dataset.caption;
    caption.hidden = !caption.textContent;
    position.textContent = `${current + 1} / ${photos.length}`;
    previous.hidden = next.hidden = photos.length < 2;
  }

  image.addEventListener('error', () => {
    if (image.dataset.fallback && image.src !== image.dataset.fallback) {
      image.src = image.dataset.fallback;
      image.dataset.fallback = '';
    } else error.hidden = false;
  });
  image.addEventListener('load', () => { error.hidden = true; });

  gallery.addEventListener('click', (event) => {
    const photo = event.target.closest('[data-photo]');
    if (!photo || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    photos = Array.from(gallery.querySelectorAll('[data-photo]'));
    event.preventDefault();
    trigger = photo;
    showPhoto(photos.indexOf(photo));
    viewer.showModal();
    document.body.classList.add('photo-viewer-open');
  });

  previous.addEventListener('click', () => showPhoto(current - 1));
  next.addEventListener('click', () => showPhoto(current + 1));
  viewer.querySelector('[data-photo-close]').addEventListener('click', () => viewer.close());
  viewer.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      showPhoto(current + (event.key === 'ArrowLeft' ? -1 : 1));
    }
  });
  viewer.addEventListener('click', (event) => {
    const bounds = viewer.getBoundingClientRect();
    if (event.target === viewer && (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom)) viewer.close();
  });
  viewer.addEventListener('close', () => {
    document.body.classList.remove('photo-viewer-open');
    if (trigger) trigger.focus();
    image.removeAttribute('src');
  });
})();
