(() => {
  if (customElements.get('cust-hero-slider-loader')) return;
  customElements.define('cust-hero-slider-loader', class extends HTMLElement {});

  const instances = new Map();
  const mobileQuery = window.matchMedia('(max-width: 749px)');
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  function createTypewriter(root) {
    const output = root.querySelector('[data-cust-keyword]');
    const keywords = JSON.parse(root.dataset.keywords || '[]').filter(Boolean);
    if (!output || !keywords.length) return { destroy() {} };

    let timer;
    let observer;
    let visible = false;
    let wordIndex = 0;
    let characterIndex = keywords[0].length;
    let deleting = true;
    output.textContent = keywords[0];

    const stop = () => { window.clearTimeout(timer); timer = undefined; };
    const schedule = (delay) => { stop(); timer = window.setTimeout(tick, delay); };
    const canAnimate = () => mobileQuery.matches && visible && !reducedMotionQuery.matches;

    function tick() {
      if (!canAnimate()) return;
      const word = keywords[wordIndex];
      characterIndex += deleting ? -1 : 1;
      output.textContent = word.slice(0, characterIndex);

      if (!deleting && characterIndex === word.length) {
        deleting = true;
        schedule(1500);
      } else if (deleting && characterIndex === 0) {
        deleting = false;
        wordIndex = (wordIndex + 1) % keywords.length;
        schedule(320);
      } else {
        schedule(deleting ? 55 : 85);
      }
    }

    const update = () => {
      if (canAnimate()) schedule(300);
      else {
        stop();
        output.textContent = keywords[wordIndex];
        characterIndex = keywords[wordIndex].length;
        deleting = true;
      }
    };

    observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); }, { threshold: 0.05 });
    observer.observe(root);
    mobileQuery.addEventListener('change', update);
    reducedMotionQuery.addEventListener('change', update);

    return { destroy() { stop(); observer.disconnect(); mobileQuery.removeEventListener('change', update); reducedMotionQuery.removeEventListener('change', update); } };
  }

  function initialize(root) {
    if (instances.has(root) || !window.Splide) return;
    if (!root.querySelector('.splide__slide')) return;
    const options = JSON.parse(root.dataset.splide || '{}');
    const splide = new window.Splide(root, options);
    const typewriter = createTypewriter(root);
    const wishlistTrigger = root.querySelector('[data-cust-wishlist-trigger]');
    const openWishlist = () => document.querySelector('.custom-desktop-header__wishlist')?.click();
    wishlistTrigger?.addEventListener('click', openWishlist);
    splide.mount();
    instances.set(root, { splide, typewriter, wishlistTrigger, openWishlist });
  }

  function destroy(root) {
    const instance = instances.get(root);
    if (!instance) return;
    instance.splide.destroy(true);
    instance.typewriter.destroy();
    instance.wishlistTrigger?.removeEventListener('click', instance.openWishlist);
    instances.delete(root);
  }

  const initializeWithin = (scope) => scope.querySelectorAll?.('.cust-hero-slider').forEach(initialize);
  const boot = () => initializeWithin(document);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();

  document.addEventListener('shopify:section:load', (event) => initializeWithin(event.target));
  document.addEventListener('shopify:section:unload', (event) => event.target.querySelectorAll?.('.cust-hero-slider').forEach(destroy));
})();
