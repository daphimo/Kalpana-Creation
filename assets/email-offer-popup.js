const ROOT_SELECTOR = '[data-email-offer-popup]';
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const instances = new WeakMap();

class EmailOfferPopup {
  constructor(root) {
    this.root = root;
    this.dialog = root.querySelector('.email-offer-popup__dialog');
    this.form = root.querySelector('.email-offer-popup__form');
    this.controller = new AbortController();
    this.previouslyFocused = null;
    this.opened = false;
    this.cookieName = `email_offer_${root.dataset.sectionId}`;
    this.onKeydown = this.onKeydown.bind(this);
    this.onScroll = this.onScroll.bind(this);
    this.onExit = this.onExit.bind(this);
    this.bind();
    if (root.querySelector('[data-email-offer-server-success]')) this.showSuccess(false);
    this.schedule();
  }

  get signal() { return this.controller.signal; }
  emit(name, detail = {}) { this.root.dispatchEvent(new CustomEvent(`email-offer-popup:${name}`, { bubbles: true, detail: { sectionId: this.root.dataset.sectionId, ...detail } })); }
  getCookie() { return document.cookie.split('; ').find((item) => item.startsWith(`${this.cookieName}=`))?.split('=')[1]; }
  setCookie(success = false) {
    const frequency = success && this.root.dataset.successRepeat === 'never' ? 'never' : this.root.dataset.frequency;
    if (frequency === 'visit') return;
    if (frequency === 'session') { document.cookie = `${this.cookieName}=dismissed; path=/; SameSite=Lax`; return; }
    const days = frequency === 'day' ? 1 : frequency === '7days' ? 7 : frequency === '30days' ? 30 : 3650;
    document.cookie = `${this.cookieName}=${success ? 'success' : 'dismissed'}; max-age=${days * 86400}; path=/; SameSite=Lax`;
  }

  bind() {
    this.root.addEventListener('click', (event) => {
      if (event.target.closest('[data-eop-close]')) {
        const isCta = Boolean(event.target.closest('[data-eop-cta]'));
        if (isCta) this.emit('cta-clicked');
        this.close(isCta ? 'cta' : 'dismiss');
      }
      if (event.target.closest('[data-eop-overlay]') && this.root.dataset.overlayClose === 'true') this.close('overlay');
      const copy = event.target.closest('[data-eop-copy]');
      if (copy) this.copyCoupon(copy);
    }, { signal: this.signal });
    this.form?.addEventListener('submit', (event) => this.submit(event), { signal: this.signal });
    document.addEventListener('keydown', this.onKeydown, { signal: this.signal });
    document.addEventListener('email-offer-popup:open', (event) => {
      if (!event.detail?.sectionId || event.detail.sectionId === this.root.dataset.sectionId) this.open(event.detail?.trigger || null);
    }, { signal: this.signal });
  }

  schedule() {
    if (this.root.dataset.designMode === 'true') { this.open(); return; }
    if (this.getCookie() || !this.deviceAllowed()) return;
    switch (this.root.dataset.trigger) {
      case 'immediate': requestAnimationFrame(() => this.open()); break;
      case 'delay': this.timer = setTimeout(() => this.open(), Number(this.root.dataset.delay) * 1000); break;
      case 'scroll': window.addEventListener('scroll', this.onScroll, { passive: true, signal: this.signal }); this.onScroll(); break;
      case 'exit': if (matchMedia('(hover: hover) and (pointer: fine)').matches) document.addEventListener('mouseout', this.onExit, { signal: this.signal }); break;
    }
  }

  deviceAllowed() { return matchMedia('(max-width: 749px)').matches ? this.root.dataset.mobile === 'true' : this.root.dataset.desktop === 'true'; }
  onScroll() { const available = document.documentElement.scrollHeight - innerHeight; if (available > 0 && (scrollY / available) * 100 >= Number(this.root.dataset.scroll)) { window.removeEventListener('scroll', this.onScroll); this.open(); } }
  onExit(event) { if (event.clientY <= 0 && !event.relatedTarget) { document.removeEventListener('mouseout', this.onExit); this.open(); } }

  open(trigger = null) {
    if (this.opened || !this.deviceAllowed()) return;
    this.opened = true;
    this.previouslyFocused = trigger instanceof HTMLElement ? trigger : document.activeElement;
    this.root.hidden = false;
    requestAnimationFrame(() => { this.root.classList.add('is-open'); this.dialog?.focus(); });
    document.documentElement.classList.toggle('email-offer-popup-open', this.root.getAttribute('data-overlay-enabled') === 'true');
    this.emit('opened');
  }

  close(reason = 'dismiss') {
    if (!this.opened) return;
    this.opened = false;
    this.root.classList.remove('is-open');
    if (!this.completed) this.setCookie(false);
    setTimeout(() => { if (!this.opened) this.root.hidden = true; }, Number(getComputedStyle(this.root).getPropertyValue('--eop-duration').replace('ms', '')) || 300);
    document.documentElement.classList.remove('email-offer-popup-open');
    this.previouslyFocused?.focus?.({ preventScroll: true });
    this.emit('closed', { reason });
  }

  onKeydown(event) {
    if (!this.opened) return;
    if (event.key === 'Escape' && this.root.dataset.escapeClose === 'true') { event.preventDefault(); this.close('escape'); return; }
    if (event.key !== 'Tab' || this.dialog?.getAttribute('aria-modal') !== 'true') return;
    const items = [...this.dialog.querySelectorAll(FOCUSABLE)].filter((item) => item.offsetParent !== null);
    if (!items.length) { event.preventDefault(); this.dialog.focus(); return; }
    const first = items[0]; const last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  async submit(event) {
    event.preventDefault();
    if (!this.form.reportValidity() || this.submitting) return;
    this.submitting = true;
    const button = this.form.querySelector('[type="submit"]');
    const message = this.form.querySelector('[data-eop-message]');
    button.disabled = true; button.classList.add('is-loading'); message.textContent = '';
    this.emit('submitted');
    try {
      const response = await fetch(this.form.action, { method: 'POST', body: new FormData(this.form), headers: { Accept: 'text/html' } });
      const html = await response.text();
      const parsed = new DOMParser().parseFromString(html, 'text/html');
      const returned = parsed.querySelector(`#${CSS.escape(this.root.id)}`);
      const succeeded = response.url.includes('customer_posted=true') || returned?.querySelector('[data-email-offer-server-success]');
      const serverError = returned?.querySelector('[data-email-offer-server-error]')?.textContent?.trim();
      if (!response.ok || !succeeded) throw new Error(serverError || this.root.dataset.errorMessage || 'Something went wrong. Please try again.');
      this.showSuccess(true); this.emit('succeeded');
    } catch (error) {
      message.textContent = error.message || 'Something went wrong. Please try again.';
      this.emit('failed', { message: message.textContent });
    } finally { this.submitting = false; button.disabled = false; button.classList.remove('is-loading'); }
  }

  showSuccess(markFrequency) {
    this.root.querySelector('[data-eop-form-state]')?.setAttribute('hidden', '');
    const success = this.root.querySelector('[data-eop-success-state]'); success?.removeAttribute('hidden');
    this.completed = true;
    if (markFrequency) this.setCookie(true);
    success?.querySelector('button, [tabindex]')?.focus({ preventScroll: true });
    if (this.root.dataset.autoCopy === 'true') this.copyCoupon(success?.querySelector('[data-eop-copy]'), true);
  }

  async copyCoupon(button, automatic = false) {
    const code = this.root.dataset.coupon; if (!code || !button) return;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(code);
      else { const input = document.createElement('textarea'); input.value = code; input.style.position = 'fixed'; input.style.opacity = '0'; document.body.append(input); input.select(); if (!document.execCommand('copy')) throw new Error('Copy failed'); input.remove(); }
      const original = button.dataset.copyText || button.textContent; button.textContent = button.dataset.copiedText || 'Copied';
      this.root.querySelector('[data-eop-copy-status]')?.replaceChildren('Coupon copied to clipboard');
      setTimeout(() => { button.textContent = original; }, 1800);
      this.emit('coupon-copied', { automatic });
    } catch { if (!automatic) this.root.querySelector('[data-eop-copy-status]')?.replaceChildren(`Copy this code: ${code}`); }
  }

  destroy() { clearTimeout(this.timer); this.controller.abort(); window.removeEventListener('scroll', this.onScroll); }
}

function init(container = document) { const roots = container.matches?.(ROOT_SELECTOR) ? [container] : container.querySelectorAll?.(ROOT_SELECTOR) || []; roots.forEach((root) => { instances.get(root)?.destroy(); instances.set(root, new EmailOfferPopup(root)); }); }
init();
document.addEventListener('shopify:section:load', (event) => init(event.target));
document.addEventListener('shopify:section:unload', (event) => { const root = event.target.matches?.(ROOT_SELECTOR) ? event.target : event.target.querySelector?.(ROOT_SELECTOR); instances.get(root)?.destroy(); });
