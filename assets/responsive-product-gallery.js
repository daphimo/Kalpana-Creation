import { StandardEvents } from '@shopify/events';

class ResponsiveProductGallery extends HTMLElement {
  connectedCallback() {
    this.events = new AbortController();
    this.viewport = matchMedia('(min-width: 750px)');
    this.list = this.querySelector('[data-gallery-list]');
    this.cards = [...this.querySelectorAll('[data-gallery-card]')];
    this.initialSource = this.list.cloneNode(true);
    this.modeVersion = 0;
    this.productVersion = 0;
    const signal = this.events.signal;
    this.viewport.addEventListener('change', () => this.mount(), { signal });
    this.closest('.shopify-section, dialog')?.addEventListener(StandardEvents.productSelect, (event) => this.selectProduct(event), { signal });
    this.mount();
    this.setupModels();
  }

  async mount() {
    const version = ++this.modeVersion;
    const activeId = this.gallery?.activeId || this.dataset.selectedMedia;
    this.gallery?.destroy();
    this.gallery = undefined;
    const desktop = this.viewport.matches;
    try {
      const { default: Gallery } = await import(desktop ? this.dataset.desktopModule : this.dataset.mobileModule);
      if (!this.isConnected || version !== this.modeVersion) return;
      // Recreate deferred players on a device switch; theme media components abort on disconnect.
      this.cards.forEach((card) => {
        const player = card.querySelector('[data-media-player]');
        player?.replaceChildren();
      });
      this.querySelector(desktop ? '[data-desktop-host]' : '[data-mobile-host]').append(this.list);
      this.list.className = desktop ? 'desktop-product-gallery__grid' : 'mobile-product-gallery__track';
      this.cards.forEach((card) => {
        const template = card.querySelector('[data-media-template]');
        if (!template) return;
        card.querySelector('[data-media-preview]').hidden = true;
        card.querySelector('[data-media-player]').append(template.content.cloneNode(true));
      });
      this.gallery = new Gallery(this, this.list, this.cards, activeId);
    } catch (error) {
      if (version !== this.modeVersion || !this.isConnected) return;
      this.append(this.list);
      this.list.className = 'responsive-product-gallery__source';
      console.error('[product-gallery] Could not initialize', error);
    }
  }

  selectProduct(event) {
    if (!(event.target instanceof Element) || event.target.closest('product-card') || !event.promise) return;
    const version = ++this.productVersion;
    event.promise.then(({ detail }) => {
      if (!this.isConnected || version !== this.productVersion || !detail?.html) return;
      const candidates = [...detail.html.querySelectorAll('responsive-product-gallery')];
      const next = candidates.find((gallery) => gallery.dataset.blockId === this.dataset.blockId) || candidates[0];
      if (!next) return;
      // A document can be shared by several consumers; use an independent replacement.
      this.replaceWith(next.cloneNode(true));
    }).catch((error) => {
      if (error.name !== 'AbortError') console.warn('[product-gallery] Variant media update failed', error);
    });
  }

  setupModels() {
    const data = this.querySelector('[data-gallery-models]');
    if (!data || !window.Shopify?.loadFeatures) return;
    const setup = () => {
      if (!this.isConnected || !window.ShopifyXR) return;
      window.ShopifyXR.addModels(JSON.parse(data.textContent));
      window.ShopifyXR.setupXRElements();
    };
    window.Shopify.loadFeatures([{ name: 'shopify-xr', version: '1.0', onLoad: (errors) => {
      if (errors || !this.isConnected) return;
      if (window.ShopifyXR) setup();
      else document.addEventListener('shopify_xr_initialized', setup, { once: true, signal: this.events.signal });
    } }]);
  }

  disconnectedCallback() {
    ++this.modeVersion;
    ++this.productVersion;
    this.events?.abort();
    this.gallery?.destroy();
    this.gallery = undefined;
    // Restore the server structure if the editor reconnects this same element.
    if (this.initialSource) {
      this.querySelector('[data-gallery-list]')?.remove();
      this.append(this.initialSource);
    }
  }
}

if (!customElements.get('responsive-product-gallery')) customElements.define('responsive-product-gallery', ResponsiveProductGallery);
