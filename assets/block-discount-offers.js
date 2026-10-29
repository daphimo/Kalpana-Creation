(() => {
  if (window.discountOffersNativeInitialized) return;
  window.discountOffersNativeInitialized = true;

  const instances = new Map();
  const resetTimers = new WeakMap();
  const selector = '[data-discount-slider]';

  async function copyText(text) {
    let clipboardError;

    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch (error) {
        clipboardError = error;
      }
    }

    const textarea = document.createElement('textarea');
    const previouslyFocused = document.activeElement;
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.inset = '-9999px auto auto -9999px';
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);

    try {
      if (!document.execCommand('copy')) throw clipboardError || new Error('Copy command failed');
    } finally {
      textarea.remove();
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus({ preventScroll: true });
    }
  }

  function setCopyFeedback(button, succeeded) {
    const label = button.querySelector('[data-discount-copy-label]');
    const status = button.parentElement?.querySelector('[data-discount-copy-status]');
    if (!(label instanceof HTMLElement)) return;

    const originalLabel = label.dataset.originalLabel || label.textContent?.trim() || 'Copy Code';
    label.dataset.originalLabel = originalLabel;
    label.textContent = succeeded ? 'Copied!' : 'Copy failed';
    if (status) {
      status.textContent = succeeded
        ? 'Coupon code copied to clipboard.'
        : 'Unable to copy. Please copy the code manually.';
    }

    const previousTimer = resetTimers.get(button);
    if (previousTimer) window.clearTimeout(previousTimer);
    const timer = window.setTimeout(() => {
      label.textContent = originalLabel;
      resetTimers.delete(button);
    }, 2000);
    resetTimers.set(button, timer);
  }

  async function handleCopy(button) {
    const code = button.dataset.discountCode?.trim();
    const status = button.parentElement?.querySelector('[data-discount-copy-status]');
    if (status) status.textContent = '';
    if (!code) {
      setCopyFeedback(button, false);
      return;
    }
    if (button.dataset.copyPending === 'true') return;

    button.dataset.copyPending = 'true';
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');

    try {
      await copyText(code);
      setCopyFeedback(button, true);
    } catch (error) {
      console.warn('[discount-offers] Unable to copy coupon code', error);
      setCopyFeedback(button, false);
    } finally {
      delete button.dataset.copyPending;
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  }

  function find(root) {
    return [...(root.matches?.(selector) ? [root] : []), ...root.querySelectorAll(selector)];
  }

  function initialize(slider) {
    if (!slider.isConnected || instances.has(slider)) return;
    const controller = new AbortController();
    const { signal } = controller;
    let drag = null;
    let suppressClick = false;

    slider.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'touch' || event.button !== 0) return;
      drag = { id: event.pointerId, x: event.clientX, scrollLeft: slider.scrollLeft, moved: false };
    }, { signal });

    slider.addEventListener('pointermove', (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      const distance = event.clientX - drag.x;
      if (!drag.moved && Math.abs(distance) > 4) {
        drag.moved = true;
        slider.classList.add('is-dragging');
        slider.setPointerCapture(event.pointerId);
      }
      if (drag.moved) {
        event.preventDefault();
        slider.scrollLeft = drag.scrollLeft - distance;
      }
    }, { signal });

    const finish = (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      if (drag.moved) {
        suppressClick = true;
        window.setTimeout(() => { suppressClick = false; }, 0);
      }
      drag = null;
      slider.classList.remove('is-dragging');
    };
    slider.addEventListener('pointerup', finish, { signal });
    slider.addEventListener('pointercancel', finish, { signal });
    slider.addEventListener('lostpointercapture', finish, { signal });
    slider.addEventListener('click', (event) => {
      if (!suppressClick) return;
      event.preventDefault();
      event.stopPropagation();
      suppressClick = false;
    }, { capture: true, signal });

    instances.set(slider, controller);
  }

  document.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest('[data-discount-copy]') : null;
    if (!(button instanceof HTMLButtonElement) || !button.closest(selector)) return;
    event.preventDefault();
    handleCopy(button);
  });

  const boot = () => find(document).forEach(initialize);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();

  document.addEventListener('shopify:section:load', (event) => find(event.target).forEach(initialize));
  document.addEventListener('shopify:section:unload', (event) => {
    find(event.target).forEach((slider) => {
      instances.get(slider)?.abort();
      instances.delete(slider);
    });
  });
})();
