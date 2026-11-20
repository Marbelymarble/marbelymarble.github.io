(() => {
  const gallery = document.querySelector('[data-photo-gallery]');
  if (!gallery?.dataset.flickrUser || !gallery.dataset.flickrAlbum) return;

  const status = document.querySelector('[data-flickr-status]');
  const more = document.querySelector('[data-flickr-more]');
  const { flickrUser: user, flickrAlbum: album, flickrKey: key } = gallery.dataset;
  const feedOrder = new Map((gallery.dataset.flickrOrder || '').split(',').filter(Boolean)
    .map((id, index) => [id, index]));
  const seen = new Set(Array.from(gallery.querySelectorAll('[data-photo]'), photo => photo.dataset.flickr?.replace(/\/$/, '')));
  let nextPage = 1;
  let loading = false;
  let requestNumber = 0;
  function request(url) {
    return new Promise((resolve, reject) => {
      const callback = `flickrAlbum_${Date.now()}_${requestNumber++}`;
      const script = document.createElement('script');
      const timeout = setTimeout(() => finish(new Error('Flickr timed out')), 15000);
      function finish(error, data) {
        clearTimeout(timeout);
        script.remove();
        window[callback] = () => {};
        setTimeout(() => { delete window[callback]; }, 60000);
        if (error) reject(error);
        else resolve(data);
      }
      window[callback] = data => finish(null, data);
      script.onerror = () => finish(new Error('Flickr could not be reached'));
      url.searchParams.set('format', 'json');
      url.searchParams.set('jsoncallback', callback);
      script.src = url.href;
      document.head.append(script);
    });
  }

  function descriptionText(html, fromFeed) {
    const doc = new DOMParser().parseFromString(html || '', 'text/html');
    doc.querySelectorAll('script, style').forEach(node => node.remove());
    if (fromFeed) {
      const credit = doc.body.firstElementChild;
      if (credit?.tagName === 'P' && /posted a photo/.test(credit.textContent)) credit.remove();
      doc.querySelector('img')?.closest('p')?.remove();
    }
    doc.querySelectorAll('br').forEach(node => node.replaceWith('\n'));
    doc.querySelectorAll('p, div').forEach(node => node.append('\n'));
    return doc.body.textContent.trim();
  }

  function safeURL(value, image = false) {
    try {
      const url = new URL(value);
      const allowed = image ? /^(?:[a-z0-9-]+\.)?staticflickr\.com$/ : /^(?:www\.)?flickr\.com$/;
      if (url.protocol === 'https:' && allowed.test(url.hostname)) return url.href;
    } catch (_) {}
    return '';
  }

  function addPhoto(photo) {
    const imageURL = safeURL(photo.image, true);
    const thumbnail = safeURL(photo.thumbnail, true);
    const flickrURL = safeURL(photo.flickr);
    if (!imageURL || !thumbnail || !flickrURL || seen.has(flickrURL.replace(/\/$/, ''))) return;
    seen.add(flickrURL.replace(/\/$/, ''));
    const figure = document.createElement('figure');
    figure.className = 'photo-gallery-item';
    const link = document.createElement('a');
    link.className = 'photo-gallery-link';
    link.href = imageURL;
    link.dataset.photo = '';
    link.dataset.caption = photo.caption || '';
    link.dataset.flickr = flickrURL;
    link.dataset.fallback = safeURL(photo.fallback, true);
    const image = document.createElement('img');
    image.src = thumbnail;
    image.alt = photo.title || 'Photograph from Flickr';
    image.loading = 'lazy';
    image.decoding = 'async';
    if (link.dataset.fallback) image.onerror = () => {
      image.onerror = null;
      image.src = link.dataset.fallback;
    };
    link.append(image);
    const caption = document.createElement('figcaption');
    caption.className = 'photo-gallery-caption';
    if (photo.caption) {
      const text = document.createElement('p');
      text.textContent = photo.caption;
      caption.append(text);
    }
    figure.append(link);
    if (photo.caption) figure.append(caption);
    gallery.append(figure);
  }

  async function load() {
    if (loading) return;
    loading = true;
    more.disabled = true;
    status.textContent = 'Loading photographs…';
    try {
      let photos;
      let hasMore = false;
      if (key) {
        const url = new URL('https://www.flickr.com/services/rest/');
        url.search = new URLSearchParams({ method: 'flickr.photosets.getPhotos', api_key: key,
          user_id: user, photoset_id: album, media: 'photos',
          extras: 'description,url_m,url_z,url_l', per_page: '50', page: String(nextPage) });
        const data = await request(url);
        if (data.stat !== 'ok' || !Array.isArray(data.photoset?.photo)) throw new Error('Invalid Flickr response');
        photos = data.photoset.photo.map(photo => ({
          image: photo.url_l || photo.url_z || photo.url_m,
          thumbnail: photo.url_z || photo.url_m || photo.url_l,
          flickr: `https://www.flickr.com/photos/${encodeURIComponent(user)}/${encodeURIComponent(photo.id)}/`,
          title: photo.title, caption: descriptionText(photo.description?._content)
        }));
        hasMore = nextPage < Number(data.photoset.pages);
        nextPage++;
      } else {
        const url = new URL('https://api.flickr.com/services/feeds/photoset.gne');
        url.search = new URLSearchParams({ nsid: user, set: album, lang: 'en-us' });
        const data = await request(url);
        if (!Array.isArray(data.items)) throw new Error('Invalid Flickr feed');
        if (data.items.length && !feedOrder.size) throw new Error('Album order has not been synced');
        const rank = photo => feedOrder.get(photo.link?.match(/\/photos\/[^/]+\/(\d+)/)?.[1]) ?? Number.MAX_SAFE_INTEGER;
        photos = data.items.filter(photo => rank(photo) !== Number.MAX_SAFE_INTEGER)
          .sort((a, b) => rank(a) - rank(b)).map(photo => ({
          image: photo.media?.m?.replace(/_m(?=\.[^.]+$)/, '_b'),
          thumbnail: photo.media?.m?.replace(/_m(?=\.[^.]+$)/, '_z'),
          fallback: photo.media?.m, flickr: photo.link,
          title: photo.title?.trim(), caption: descriptionText(photo.description, true)
        }));
      }
      photos.forEach(addPhoto);
      status.textContent = gallery.querySelector('[data-photo]') ? '' : 'No public photographs are available in this album yet.';
      more.hidden = !hasMore;
      more.textContent = 'Load more';
    } catch (_) {
      status.textContent = 'Photographs could not be loaded. Please try again.';
      more.hidden = false;
      more.textContent = 'Try again';
    } finally {
      loading = false;
      more.disabled = false;
    }
  }
  more.addEventListener('click', load);
  load();
})();
