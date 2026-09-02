(() => {
  const instances = new Map();

  function initialize(root) {
    if (!(root instanceof HTMLElement) || instances.has(root) || !window.Splide) return;
    if (!root.querySelector('.splide__slide')) return;

    const splide = new window.Splide(root, JSON.parse(root.dataset.splide || '{}'));
    splide.mount();
    instances.set(root, splide);
  }

  function initializeWithin(scope) {
    scope.querySelectorAll('[data-product-you-may-like]').forEach(initialize);
  }

  function destroyWithin(scope) {
    scope.querySelectorAll('[data-product-you-may-like]').forEach((root) => {
      instances.get(root)?.destroy(true);
      instances.delete(root);
    });
  }

  const boot = () => initializeWithin(document);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();

  document.addEventListener('shopify:section:load', (event) => initializeWithin(event.target));
  document.addEventListener('shopify:section:unload', (event) => destroyWithin(event.target));
})();
