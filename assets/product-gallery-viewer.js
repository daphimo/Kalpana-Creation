// Shared lifecycle only. Desktop navigation and mobile gestures live in separate modules.
let scrollOwner;

export function lockScroll(owner) {
  if (scrollOwner && scrollOwner !== owner) scrollOwner.close();
  scrollOwner = owner;
  const body = document.body;
  const html = document.documentElement;
  const properties = ['overflow', 'position', 'top', 'left', 'width', 'padding-right'];
  const saved = properties.map((name) => [name, body.style.getPropertyValue(name), body.style.getPropertyPriority(name)]);
  const htmlOverflow = [html.style.getPropertyValue('overflow'), html.style.getPropertyPriority('overflow')];
  const x = window.scrollX;
  const y = window.scrollY;
  const gutter = window.innerWidth - html.clientWidth;
  const padding = parseFloat(getComputedStyle(body).paddingRight) || 0;
  // This theme scrolls .page-wrapper on wide screens, rather than the document.
  const wrapper = document.querySelector('.page-wrapper');
  const wrapperState = wrapper && {
    x: wrapper.scrollLeft, y: wrapper.scrollTop,
    overflow: [wrapper.style.getPropertyValue('overflow'), wrapper.style.getPropertyPriority('overflow')],
    padding: [wrapper.style.getPropertyValue('padding-right'), wrapper.style.getPropertyPriority('padding-right')],
  };
  if (wrapper) {
    const wrapperGutter = wrapper.offsetWidth - wrapper.clientWidth;
    const wrapperPadding = parseFloat(getComputedStyle(wrapper).paddingRight) || 0;
    wrapper.style.overflow = 'hidden';
    wrapper.style.paddingRight = `${wrapperPadding + wrapperGutter}px`;
  }
  body.style.overflow = 'hidden';
  body.style.position = 'fixed';
  body.style.top = `${-y}px`;
  body.style.left = `${-x}px`;
  body.style.width = '100%';
  body.style.paddingRight = `${padding + gutter}px`;
  html.style.overflow = 'hidden';
  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    for (const [name, value, priority] of saved) {
      if (value) body.style.setProperty(name, value, priority);
      else body.style.removeProperty(name);
    }
    if (htmlOverflow[0]) html.style.setProperty('overflow', ...htmlOverflow);
    else html.style.removeProperty('overflow');
    if (wrapperState) {
      for (const [name, state] of [['overflow', wrapperState.overflow], ['padding-right', wrapperState.padding]]) {
        if (state[0]) wrapper.style.setProperty(name, ...state);
        else wrapper.style.removeProperty(name);
      }
      wrapper.scrollTo({ left: wrapperState.x, top: wrapperState.y, behavior: 'instant' });
    }
    window.scrollTo({ left: x, top: y, behavior: 'instant' });
    if (scrollOwner === owner) scrollOwner = undefined;
  };
}

export class GalleryViewer {
  constructor(className, markup, label) {
    this.dialog = document.createElement('dialog');
    this.dialog.className = `product-gallery-viewer ${className}`;
    this.dialog.setAttribute('aria-label', label);
    this.dialog.innerHTML = markup;
    this.controller = new AbortController();
    this.on(this.dialog, 'cancel', (event) => { event.preventDefault(); this.close(); });
    this.on(this.dialog, 'close', () => { if (!this.dialog.open) this.cleanup(); });
    this.on(this.dialog.querySelector('[data-close]'), 'click', () => this.close());
    this.on(this.dialog, 'click', (event) => {
      if (event.target !== this.dialog) return;
      const rect = this.dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) this.close();
    });
  }

  on(target, name, listener, options = {}) {
    target?.addEventListener(name, listener, { ...options, signal: this.controller.signal });
  }

  open(trigger) {
    if (this.dialog.open) return;
    this.trigger = trigger;
    document.body.append(this.dialog);
    this.unlock = lockScroll(this);
    try {
      this.dialog.showModal();
      this.dialog.querySelector('[data-close]').focus({ preventScroll: true });
    } catch (error) {
      this.cleanup();
      throw error;
    }
  }

  close() {
    if (this.dialog.open) this.dialog.close();
    this.cleanup();
  }

  cleanup() {
    if (!this.unlock) return;
    this.onClose?.();
    this.unlock();
    this.unlock = undefined;
    this.dialog.remove();
    if (this.trigger?.isConnected) this.trigger.focus({ preventScroll: true });
  }

  destroy() {
    this.close();
    this.controller.abort();
    this.dialog.remove();
  }
}

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export function pauseMedia(container) {
  container.querySelectorAll('deferred-media, product-model').forEach((media) => media.pauseMedia?.());
}

// A failed or superseded large image never replaces the last successfully loaded image.
export async function loadViewerImage(url) {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
}
