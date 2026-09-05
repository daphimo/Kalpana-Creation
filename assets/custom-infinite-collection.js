const SELECTOR = '[data-custom-infinite-collection]';

class CustomInfiniteCollection {
  constructor(section) {
    this.section = section;
    this.grid = section.querySelector('[data-infinite-product-grid]');
    this.status = section.querySelector('[data-infinite-status]');
    this.currentPage = Number(this.status?.dataset.currentPage || 1);
    this.totalPages = Number(this.status?.dataset.totalPages || 1);
    this.totalProducts = Number(this.status?.dataset.totalProducts ?? NaN);
    this.loading = false;

    if (!this.grid || !this.status) return;
    if (this.hideStatusIfComplete()) return;

    this.observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) this.loadNextPage();
      },
      { rootMargin: '160px 0px' }
    );
    this.observer.observe(this.status);
  }

  hideStatusIfComplete() {
    const allProductsLoaded = Number.isFinite(this.totalProducts)
      && this.grid.children.length >= this.totalProducts;
    if (this.currentPage < this.totalPages && !allProductsLoaded) return false;
    this.observer?.disconnect();
    this.status.hidden = true;
    this.status.replaceChildren();
    return true;
  }

  async loadNextPage() {
    if (this.loading || this.hideStatusIfComplete()) return;
    this.loading = true;
    this.status.classList.add('is-loading');
    this.status.querySelector('[data-infinite-status-text]')?.replaceChildren('Loading more products');
    const loaderStartedAt = performance.now();

    try {
      const url = new URL(window.location.href);
      url.searchParams.set('section_id', this.section.dataset.sectionId);
      url.searchParams.set('page', String(this.currentPage + 1));

      const response = await fetch(url.toString(), { headers: { Accept: 'text/html' } });
      if (!response.ok) throw new Error(`Request failed with status ${response.status}`);

      const documentFragment = new DOMParser().parseFromString(await response.text(), 'text/html');
      const nextSection = documentFragment.querySelector(SELECTOR);
      const nextGrid = nextSection?.querySelector('[data-infinite-product-grid]');
      const nextStatus = nextSection?.querySelector('[data-infinite-status]');
      if (!nextGrid || !nextStatus) throw new Error('The next product batch was not found');

      const minimumLoaderTime = 450;
      const remainingLoaderTime = minimumLoaderTime - (performance.now() - loaderStartedAt);
      if (remainingLoaderTime > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, remainingLoaderTime));
      }

      this.grid.append(...nextGrid.children);
      this.currentPage = Number(nextStatus.dataset.currentPage || this.currentPage + 1);
      this.totalPages = Number(nextStatus.dataset.totalPages || this.totalPages);
      this.status.dataset.currentPage = String(this.currentPage);
      document.dispatchEvent(new CustomEvent('custom:products-loaded', { detail: { section: this.section } }));

      this.hideStatusIfComplete();
    } catch (error) {
      console.error('[infinite-collection] Could not load products', error);
      this.status.querySelector('[data-infinite-status-text]')?.replaceChildren('Products could not be loaded');
    } finally {
      this.loading = false;
      this.status.classList.remove('is-loading');
    }
  }

  destroy() {
    this.observer?.disconnect();
  }
}

const instances = new WeakMap();

function initialize(container = document) {
  const sections = container.matches?.(SELECTOR)
    ? [container]
    : container.querySelectorAll?.(SELECTOR) || [];
  sections.forEach((section) => {
    instances.get(section)?.destroy();
    instances.set(section, new CustomInfiniteCollection(section));
  });
}

initialize();
document.addEventListener('shopify:section:load', (event) => initialize(event.target));
document.addEventListener('shopify:section:unload', (event) => {
  const section = event.target.querySelector?.(SELECTOR);
  if (section) instances.get(section)?.destroy();
});
