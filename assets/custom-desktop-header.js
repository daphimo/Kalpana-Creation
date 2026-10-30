const DESKTOP_QUERY = '(min-width: 750px)';

class CustomDesktopHeader extends HTMLElement {
  constructor() {
    super();
    this.initialized = false;
    /** @type {Element | null} */
    this.trigger = null;
    /** @type {HTMLElement | null} */
    this.closeButton = null;
    /** @type {Element | null} */
    this.overlay = null;
    /** @type {Element | null} */
    this.drawer = null;
    /** @type {Element | null} */
    this.scrollContainer = null;
    this.threshold = 0;
    /** @type {Element | null} */
    this.lastFocus = null;
    this.onScroll = () => {};
    /** @type {(event: KeyboardEvent) => void} */
    this.onKeydown = () => {};
    this.onResize = () => {};
    this.onCartCountUpdate = (event) => {
      if (!(event instanceof CustomEvent)) return;
      this.updateCartCount(Number(event.detail?.itemCount) || 0);
    };
  }

  connectedCallback() {
    if (this.initialized) return;
    this.initialized = true;
    this.trigger = this.querySelector('.custom-desktop-header__menu-trigger');
    this.closeButton = /** @type {HTMLElement | null} */ (this.querySelector('.custom-desktop-header__close'));
    this.overlay = this.querySelector('.custom-desktop-header__overlay');
    this.drawer = this.querySelector('.custom-desktop-header__drawer');
    this.scrollContainer = document.querySelector('.page-wrapper');
    this.threshold = Number(this.dataset.scrollThreshold) || 0;
    this.onScroll = () => {
      const scrollPosition = this.scrollContainer?.scrollTop ?? window.scrollY;
      this.classList.toggle('is-scrolled', scrollPosition >= this.threshold);
    };
    this.onKeydown = (event) => {
      if (event.key === 'Escape' && this.classList.contains('is-drawer-open')) this.closeDrawer();
    };
    this.onResize = () => {};
    this.openDrawer = this.openDrawer.bind(this);
    this.closeDrawer = this.closeDrawer.bind(this);
    this.trigger?.addEventListener('click', this.openDrawer);
    this.closeButton?.addEventListener('click', this.closeDrawer);
    this.overlay?.addEventListener('click', this.closeDrawer);
    document.addEventListener('keydown', this.onKeydown);
    this.scrollContainer?.addEventListener('scroll', this.onScroll, { passive: true });
    window.addEventListener('scroll', this.onScroll, { passive: true });
    window.addEventListener('resize', this.onResize, { passive: true });
    document.addEventListener('custom-header:cart-count-update', this.onCartCountUpdate);
    document.documentElement.style.setProperty('--cdh-page-offset', `${this.offsetHeight}px`);
    this.onScroll();
  }

  disconnectedCallback() {
    this.teardown();
  }

  updateCartCount(itemCount) {
    const cartIcon = this.querySelector('.custom-desktop-header__cart-icon');
    const cartBubble = cartIcon?.querySelector('[ref="cartBubble"]');
    const cartBubbleCount = cartIcon?.querySelector('[ref="cartBubbleCount"]');

    if (!(cartIcon instanceof HTMLElement)) return;
    if (!(cartBubble instanceof HTMLElement) || !(cartBubbleCount instanceof HTMLElement)) return;

    cartBubbleCount.textContent = itemCount < 100 ? String(itemCount) : '';
    cartBubbleCount.classList.toggle('hidden', itemCount === 0);
    cartBubble.classList.toggle('visually-hidden', itemCount === 0);
    cartIcon.dataset.cartCount = String(itemCount);
  }

  openDrawer() {
    this.lastFocus = document.activeElement;
    this.classList.add('is-drawer-open');
    this.trigger?.setAttribute('aria-expanded', 'true');
    this.drawer?.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('custom-desktop-header-lock');
    requestAnimationFrame(() => this.closeButton?.focus());
  }

  closeDrawer() {
    this.classList.remove('is-drawer-open');
    this.trigger?.setAttribute('aria-expanded', 'false');
    this.drawer?.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('custom-desktop-header-lock');
    if (this.lastFocus instanceof HTMLElement) this.lastFocus.focus();
  }

  teardown() {
    this.closeDrawer();
    this.trigger?.removeEventListener('click', this.openDrawer);
    this.closeButton?.removeEventListener('click', this.closeDrawer);
    this.overlay?.removeEventListener('click', this.closeDrawer);
    document.removeEventListener('keydown', this.onKeydown);
    this.scrollContainer?.removeEventListener('scroll', this.onScroll);
    window.removeEventListener('scroll', this.onScroll);
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('custom-header:cart-count-update', this.onCartCountUpdate);
    this.initialized = false;
  }
}

if (!customElements.get('custom-desktop-header')) {
  customElements.define('custom-desktop-header', CustomDesktopHeader);
}
