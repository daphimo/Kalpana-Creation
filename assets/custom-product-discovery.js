const RECENT_STORAGE_KEY = 'customRecentlyViewedProducts';

function readRecentProducts() {
  try {
    const value = JSON.parse(localStorage.getItem(RECENT_STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value.filter((handle) => typeof handle === 'string' && handle) : [];
  } catch (error) {
    console.warn('[recently-viewed] Unable to read browser history.', error);
    return [];
  }
}

function saveRecentProducts(handles) {
  try {
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(handles));
  } catch (error) {
    console.warn('[recently-viewed] Unable to save browser history.', error);
  }
}

async function fetchRecentCard(handle, sectionId) {
  const url = new URL(`/products/${encodeURIComponent(handle)}`, window.location.origin);
  url.searchParams.set('section_id', sectionId);
  const response = await fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
  if (!response.ok) return '';

  const documentFragment = new DOMParser().parseFromString(await response.text(), 'text/html');
  return documentFragment.querySelector('[data-recent-card-response]')?.innerHTML.trim() || '';
}

async function hydrateRecentlyViewed(section) {
  const currentHandle = section.dataset.currentProductHandle || '';
  const limit = Number(section.dataset.productLimit) || 4;
  const storedHandles = readRecentProducts().filter((handle) => handle !== currentHandle);
  const handlesToShow = storedHandles.slice(0, limit);

  if (currentHandle) saveRecentProducts([currentHandle, ...storedHandles].slice(0, Math.max(limit * 3, 12)));
  if (!handlesToShow.length) return;

  const results = await Promise.allSettled(
    handlesToShow.map((handle) => fetchRecentCard(handle, section.dataset.sectionId))
  );
  const cards = results.flatMap((result) => result.status === 'fulfilled' && result.value ? [result.value] : []);
  const list = section.querySelector('[data-recently-viewed-list]');
  if (!list || !cards.length) return;

  list.innerHTML = cards.map((card) => `<li class="custom-featured-collection__item">${card}</li>`).join('');
  section.hidden = false;
}

async function hydrateRecommendations(section) {
  if (section.dataset.recommendationsPerformed === 'true') return;
  const url = new URL(section.dataset.url, window.location.origin);
  url.searchParams.set('product_id', section.dataset.productId);
  url.searchParams.set('section_id', section.dataset.sectionId);
  url.searchParams.set('limit', section.dataset.productLimit);
  url.searchParams.set('intent', 'related');

  const response = await fetch(url);
  if (!response.ok) return;
  const documentFragment = new DOMParser().parseFromString(await response.text(), 'text/html');
  const nextSection = documentFragment.querySelector(`[data-you-may-also-like][data-section-id="${section.dataset.sectionId}"]`);
  const nextList = nextSection?.querySelector('[data-recommendation-list]');
  const list = section.querySelector('[data-recommendation-list]');
  if (!list || !nextList?.children.length) return;

  list.innerHTML = nextList.innerHTML;
  section.dataset.recommendationsPerformed = 'true';
  section.hidden = false;
}

const observer = new IntersectionObserver((entries, instance) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    instance.unobserve(entry.target);
    if (entry.target.matches('[data-recently-viewed]')) hydrateRecentlyViewed(entry.target);
    if (entry.target.matches('[data-you-may-also-like]')) hydrateRecommendations(entry.target);
  });
}, { rootMargin: '0px 0px 400px' });

function initializeSection(section) {
  if (section.hidden && section.matches('[data-recently-viewed]')) {
    hydrateRecentlyViewed(section);
    return;
  }
  if (section.hidden && section.matches('[data-you-may-also-like]')) {
    hydrateRecommendations(section);
    return;
  }
  observer.observe(section);
}

document.querySelectorAll('[data-recently-viewed], [data-you-may-also-like]').forEach(initializeSection);

document.addEventListener('shopify:section:load', (event) => {
  event.target?.querySelectorAll?.('[data-recently-viewed], [data-you-may-also-like]').forEach(initializeSection);
});
