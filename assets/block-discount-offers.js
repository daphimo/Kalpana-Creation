(() => {
  if (window.discountOffersNativeInitialized) return;
  window.discountOffersNativeInitialized = true;

  const instances = new Map();
  const selector = '[data-discount-slider]';

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
