import { GalleryViewer, clamp, reducedMotion, pauseMedia, loadViewerImage } from './product-gallery-viewer.js';

class MobileViewer extends GalleryViewer {
  constructor() {
    super('mobile-product-viewer', `
      <button class="product-gallery-viewer__close" data-close aria-label="Close image viewer">×</button>
      <div class="mobile-product-viewer__stage" data-stage>
        <img data-image alt="" draggable="false">
      </div>
      <div class="mobile-product-viewer__zoom-controls">
        <button data-zoom-out aria-label="Zoom out">−</button>
        <button data-zoom-in aria-label="Zoom in">+</button>
      </div>
      <p class="product-gallery-viewer__status" data-status role="status" aria-live="polite"></p>
    `, 'Product image zoom viewer');
    this.image = this.dialog.querySelector('[data-image]');
    this.stage = this.dialog.querySelector('[data-stage]');
    this.status = this.dialog.querySelector('[data-status]');
    this.points = new Map();
    this.version = 0;
    // Touch browsers may suppress the synthetic click immediately after a pinch.
    this.on(this.dialog.querySelector('[data-close]'), 'touchend', (event) => {
      event.preventDefault();
      this.close();
    }, { passive: false });
    this.on(this.stage, 'pointerdown', (event) => this.down(event));
    this.on(this.stage, 'pointermove', (event) => this.move(event));
    this.on(this.stage, 'pointerup', (event) => this.up(event));
    this.on(this.stage, 'pointercancel', (event) => this.up(event, true));
    this.on(this.stage, 'lostpointercapture', (event) => { this.points.delete(event.pointerId); this.baseline(); });
    this.on(this.dialog.querySelector('[data-zoom-in]'), 'click', () => this.zoom(this.scale + 1));
    this.on(this.dialog.querySelector('[data-zoom-out]'), 'click', () => this.zoom(this.scale - 1));
    this.on(this.dialog, 'keydown', (event) => {
      if (event.key === '+' || event.key === '=') this.zoom(this.scale + 1);
      else if (event.key === '-') this.zoom(this.scale - 1);
      else return;
      event.preventDefault();
    });
    this.resize = new ResizeObserver(() => { if (this.dialog.open) this.measure(); });
    this.resize.observe(this.stage);
    this.onClose = () => {
      ++this.version;
      this.points.clear();
      this.lastTap = 0;
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    };
  }

  show(link) {
    this.open(link);
    const preview = link.querySelector('img');
    this.image.alt = preview.alt;
    this.image.src = preview.currentSrc || preview.src;
    this.ratio = Number(preview.getAttribute('width')) / Number(preview.getAttribute('height')) || .8;
    this.scale = 1;
    this.x = this.y = 0;
    this.status.textContent = 'Pinch or double-tap to zoom';
    this.measure();
    const version = ++this.version;
    loadViewerImage(link.href).then((loaded) => {
      if (version !== this.version || !this.dialog.open) return;
      this.image.src = loaded.src;
      this.ratio = loaded.naturalWidth / loaded.naturalHeight;
      this.measure();
    }).catch(() => {
      if (version === this.version && this.dialog.open) this.status.textContent = 'Showing preview · Pinch to zoom';
    });
  }

  measure() {
    this.bounds = this.stage.getBoundingClientRect();
    this.width = Math.min(this.bounds.width - 32, (this.bounds.height - 48) * this.ratio);
    this.height = this.width / this.ratio;
    this.image.style.width = `${this.width}px`;
    this.image.style.height = `${this.height}px`;
    this.constrain();
    this.paint();
    this.baseline();
  }

  point(event) {
    return { x: event.clientX - this.bounds.left - this.bounds.width / 2, y: event.clientY - this.bounds.top - this.bounds.height / 2 };
  }

  baseline() {
    const points = [...this.points.values()];
    this.start = { scale: this.scale, x: this.x, y: this.y, points };
  }

  down(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    this.stage.setPointerCapture(event.pointerId);
    this.points.set(event.pointerId, this.point(event));
    if (this.points.size === 1) this.tap = { point: this.point(event), time: performance.now(), moved: false };
    else if (this.tap) this.tap.moved = true;
    this.baseline();
  }

  move(event) {
    if (!this.points.has(event.pointerId)) return;
    event.preventDefault();
    const point = this.point(event);
    this.points.set(event.pointerId, point);
    if (this.tap && Math.hypot(point.x - this.tap.point.x, point.y - this.tap.point.y) > 8) this.tap.moved = true;
    const points = [...this.points.values()];
    if (points.length >= 2 && this.start.points.length >= 2) {
      const [a, b] = points;
      const [sa, sb] = this.start.points;
      const distance = Math.max(1, Math.hypot(sa.x - sb.x, sa.y - sb.y));
      this.scale = clamp(this.start.scale * Math.hypot(a.x - b.x, a.y - b.y) / distance, 1, 4);
      const factor = this.scale / this.start.scale;
      this.x = (a.x + b.x) / 2 - ((sa.x + sb.x) / 2 - this.start.x) * factor;
      this.y = (a.y + b.y) / 2 - ((sa.y + sb.y) / 2 - this.start.y) * factor;
    } else if (points.length === 1 && this.scale > 1) {
      this.x = this.start.x + point.x - this.start.points[0].x;
      this.y = this.start.y + point.y - this.start.points[0].y;
    }
    this.constrain();
    this.schedulePaint();
  }

  up(event, cancelled = false) {
    if (!this.points.has(event.pointerId)) return;
    this.points.delete(event.pointerId);
    if (!cancelled && this.points.size === 0 && this.tap && !this.tap.moved && performance.now() - this.tap.time < 280) {
      const now = performance.now();
      if (this.lastTap && now - this.lastTap < 320) {
        this.zoom(this.scale > 1 ? 1 : 2.5, this.tap.point);
        this.lastTap = 0;
      } else this.lastTap = now;
    }
    if (cancelled) this.lastTap = 0;
    this.baseline();
  }

  zoom(scale, point = { x: 0, y: 0 }) {
    const next = clamp(scale, 1, 4);
    this.x = point.x - (point.x - this.x) * next / this.scale;
    this.y = point.y - (point.y - this.y) * next / this.scale;
    this.scale = next;
    this.constrain();
    this.paint();
    this.status.textContent = `${Math.round(this.scale * 100)}% zoom`;
  }

  constrain() {
    const maxX = Math.max(0, (this.width * this.scale - this.bounds.width) / 2);
    const maxY = Math.max(0, (this.height * this.scale - this.bounds.height) / 2);
    this.x = clamp(this.x, -maxX, maxX);
    this.y = clamp(this.y, -maxY, maxY);
  }

  schedulePaint() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.paint(); });
  }

  paint() {
    this.image.style.transform = `translate3d(calc(-50% + ${this.x}px), calc(-50% + ${this.y}px), 0) scale(${this.scale})`;
  }

  destroy() {
    this.resize.disconnect();
    super.destroy();
  }
}

export default class MobileGallery {
  constructor(root, list, cards, activeId) {
    this.root = root;
    this.list = list;
    this.cards = cards;
    this.events = new AbortController();
    const signal = this.events.signal;
    this.index = Math.max(0, cards.findIndex((card) => card.dataset.mediaId === activeId));
    this.dots = document.createElement('div');
    this.dots.className = 'mobile-product-gallery__pagination';
    this.dots.setAttribute('aria-label', 'Product media pagination');
    this.buttons = cards.map((card, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.index = index;
      button.setAttribute('aria-label', `Show media ${index + 1} of ${cards.length}`);
      this.dots.append(button);
      return button;
    });
    this.dots.hidden = cards.length < 2;
    list.after(this.dots);
    this.dots.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (button) this.select(Number(button.dataset.index));
    }, { signal });
    list.addEventListener('scroll', () => {
      if (this.frame) return;
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        this.update(Math.round(Math.abs(list.scrollLeft) / (list.clientWidth || 1)));
      });
    }, { signal, passive: true });
    list.addEventListener('pointerdown', (event) => { this.downX = event.clientX; this.downY = event.clientY; this.dragged = false; }, { signal, passive: true });
    list.addEventListener('pointermove', (event) => {
      if (Math.hypot(event.clientX - this.downX, event.clientY - this.downY) > 10) this.dragged = true;
    }, { signal, passive: true });
    list.addEventListener('click', (event) => {
      const link = event.target.closest('[data-gallery-open]');
      if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      if (this.dragged) return;
      pauseMedia(root);
      this.viewer ||= new MobileViewer();
      this.viewer.show(link);
    }, { signal });
    this.resize = new ResizeObserver(() => this.select(this.index, false));
    this.resize.observe(list);
    this.select(this.index, false);
  }

  get activeId() { return this.cards[this.index]?.dataset.mediaId; }

  select(index, animate = true) {
    index = clamp(index, 0, Math.max(0, this.cards.length - 1));
    const rtl = getComputedStyle(this.list).direction === 'rtl';
    this.list.scrollTo({ left: index * this.list.clientWidth * (rtl ? -1 : 1), behavior: animate && !reducedMotion() ? 'smooth' : 'instant' });
    this.update(index);
  }

  update(index) {
    this.index = clamp(index, 0, Math.max(0, this.cards.length - 1));
    this.buttons.forEach((button, i) => button.setAttribute('aria-current', i === this.index ? 'true' : 'false'));
    this.cards.forEach((card, i) => {
      card.inert = i !== this.index;
      if (i !== this.index) pauseMedia(card);
    });
  }

  destroy() {
    this.events.abort();
    this.resize.disconnect();
    cancelAnimationFrame(this.frame);
    this.viewer?.destroy();
    this.dots.remove();
    this.cards.forEach((card) => { card.inert = false; });
    pauseMedia(this.root);
  }
}
