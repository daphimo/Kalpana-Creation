import { GalleryViewer, clamp, reducedMotion, pauseMedia, loadViewerImage } from './product-gallery-viewer.js';

class DesktopViewer extends GalleryViewer {
  constructor(images) {
    super('desktop-product-viewer', `
      <img class="desktop-product-viewer__thumbnail" data-thumbnail alt="">
      <button class="product-gallery-viewer__close" data-close aria-label="Close image viewer">×</button>
      <button class="desktop-product-viewer__previous" data-previous aria-label="Previous image">←</button>
      <div class="desktop-product-viewer__stage" data-stage tabindex="0" aria-label="Image viewing area. Use up and down arrows to pan; left and right arrows to change image.">
        <img class="desktop-product-viewer__image" data-image alt="" draggable="false">
      </div>
      <button class="desktop-product-viewer__next" data-next aria-label="Next image">→</button>
      <p class="product-gallery-viewer__status" data-status role="status" aria-live="polite"></p>
    `, 'Product image viewer');
    this.images = images;
    this.image = this.dialog.querySelector('[data-image]');
    this.thumbnail = this.dialog.querySelector('[data-thumbnail]');
    this.stage = this.dialog.querySelector('[data-stage]');
    this.status = this.dialog.querySelector('[data-status]');
    this.version = 0;
    this.on(this.dialog.querySelector('[data-previous]'), 'click', () => this.select(this.index - 1));
    this.on(this.dialog.querySelector('[data-next]'), 'click', () => this.select(this.index + 1));
    this.dialog.querySelector('[data-previous]').hidden = images.length < 2;
    this.dialog.querySelector('[data-next]').hidden = images.length < 2;
    const hoverImage = (event) => {
      if (!this.overflow || event.pointerType === 'touch') return;
      const progress = clamp((event.clientY - this.bounds.top) / this.bounds.height, 0, 1);
      // Hysteresis keeps the cursor stable when crossing the midpoint slowly.
      if (!this.stage.dataset.direction || progress < .46 || progress > .54) {
        this.stage.dataset.direction = progress < .5 ? 'up' : 'down';
      }
      this.pan(progress * this.overflow);
    };
    this.on(this.image, 'pointerenter', hoverImage);
    this.on(this.image, 'pointermove', hoverImage);
    this.on(this.image, 'pointerleave', () => this.stopPan());
    this.on(this.image, 'pointercancel', () => this.stopPan());
    this.on(window, 'blur', () => this.stopPan());
    this.on(this.image, 'wheel', (event) => {
      event.preventDefault();
      this.pan(this.target + event.deltaY);
    }, { passive: false });
    this.on(this.dialog, 'keydown', (event) => {
      if (event.key === 'ArrowLeft') this.select(this.index - 1);
      else if (event.key === 'ArrowRight') this.select(this.index + 1);
      else if (event.key === 'ArrowUp') this.pan(this.target - 100);
      else if (event.key === 'ArrowDown') this.pan(this.target + 100);
      else if (event.key === 'Home') this.pan(0);
      else if (event.key === 'End') this.pan(this.overflow);
      else return;
      event.preventDefault();
    });
    this.resize = new ResizeObserver(() => { if (this.dialog.open) this.measure(); });
    this.resize.observe(this.stage);
    this.onClose = () => {
      ++this.version;
      this.stopPan();
    };
  }

  show(index, trigger) {
    this.open(trigger);
    this.select(index);
  }

  select(index) {
    this.stopPan();
    this.index = (index + this.images.length) % this.images.length;
    const link = this.images[this.index];
    const preview = link.querySelector('img');
    this.image.alt = preview.alt;
    this.image.src = preview.currentSrc || preview.src;
    this.thumbnail.src = preview.currentSrc || preview.src;
    this.ratio = Number(preview.getAttribute('width')) / Number(preview.getAttribute('height')) || .8;
    this.target = this.position = 0;
    this.measure();
    this.status.textContent = `${this.index + 1} / ${this.images.length}`;
    const version = ++this.version;
    loadViewerImage(link.href).then((loaded) => {
      if (version !== this.version || !this.dialog.open) return;
      this.image.src = loaded.src;
      this.ratio = loaded.naturalWidth / loaded.naturalHeight;
      this.measure();
    }).catch(() => {
      if (version === this.version && this.dialog.open) this.status.textContent = `${this.index + 1} / ${this.images.length} · Showing preview`;
    });
  }

  measure() {
    this.bounds = this.stage.getBoundingClientRect();
    const width = Math.min(980, Math.max(0, this.bounds.width - 48));
    const height = width / this.ratio;
    this.image.style.width = `${width}px`;
    this.image.style.height = `${height}px`;
    this.overflow = Math.max(0, height - this.bounds.height);
    this.centerOffset = Math.max(0, (this.bounds.height - height) / 2);
    this.target = clamp(this.target || 0, 0, this.overflow);
    this.position = clamp(this.position || 0, 0, this.overflow);
    this.stage.classList.toggle('is-tall', this.overflow > 0);
    this.paint();
  }

  stopPan() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.target = this.position || 0;
    delete this.stage.dataset.direction;
  }

  paint() {
    this.image.style.transform = `translate3d(-50%, ${this.centerOffset - this.position}px, 0)`;
  }

  pan(value) {
    this.target = clamp(value, 0, this.overflow);
    if (this.frame) return;
    const animate = () => {
      this.position = reducedMotion() ? this.target : this.position + (this.target - this.position) * .2;
      const finished = Math.abs(this.target - this.position) < .25;
      if (finished) this.position = this.target;
      this.paint();
      this.frame = finished ? 0 : requestAnimationFrame(animate);
    };
    this.frame = requestAnimationFrame(animate);
  }

  destroy() {
    this.resize.disconnect();
    super.destroy();
  }
}

export default class DesktopGallery {
  constructor(root, list, cards, activeId) {
    this.root = root;
    this.cards = cards;
    this.activeId = activeId;
    this.images = [...list.querySelectorAll('[data-gallery-open]')];
    this.events = new AbortController();
    list.addEventListener('click', (event) => {
      const link = event.target.closest('[data-gallery-open]');
      if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      this.activeId = link.closest('[data-media-id]').dataset.mediaId;
      pauseMedia(root);
      this.viewer ||= new DesktopViewer(this.images);
      this.viewer.show(this.images.indexOf(link), link);
    }, { signal: this.events.signal });
  }

  destroy() {
    this.events.abort();
    this.viewer?.destroy();
    pauseMedia(this.root);
  }
}
