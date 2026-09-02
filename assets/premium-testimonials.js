const ROOT_SELECTOR = '[data-premium-testimonials]';
const instances = new Map();
let splidePromise;

function ensureSplide(assetUrl) {
  if (window.Splide) return Promise.resolve();
  if (splidePromise) return splidePromise;
  splidePromise = new Promise((resolve, reject) => {
    const existing = [...document.scripts].find((script) => script.src === new URL(assetUrl, document.baseURI).href);
    if (existing) {
      if (window.Splide) resolve();
      else { existing.addEventListener('load', resolve, { once: true }); existing.addEventListener('error', reject, { once: true }); }
      return;
    }
    const script = document.createElement('script');
    script.src = assetUrl;
    script.dataset.premiumSplideLoader = '';
    script.addEventListener('load', resolve, { once: true });
    script.addEventListener('error', reject, { once: true });
    document.head.append(script);
  });
  return splidePromise;
}

function equalize(root) {
  const cards = root.querySelectorAll('.premium-testimonials__card');
  cards.forEach((card) => { card.style.minHeight = ''; });
  const height = Math.max(0, ...[...cards].map((card) => card.getBoundingClientRect().height));
  cards.forEach((card) => { card.style.minHeight = `${Math.ceil(height)}px`; });
}

async function initialize(root) {
  if (!(root instanceof HTMLElement) || instances.has(root) || !root.querySelector('.splide__slide')) return;
  try {
    await ensureSplide(root.dataset.splideAsset);
    if (!root.isConnected || instances.has(root)) return;
    const splide = new window.Splide(root, JSON.parse(root.dataset.splide || '{}'));
    const resize = () => requestAnimationFrame(() => equalize(root));
    splide.on('mounted resized refresh', resize);
    splide.mount();
    const observer = new ResizeObserver(resize);
    root.querySelectorAll('.premium-testimonials__copy, .premium-testimonials__image').forEach((node) => observer.observe(node));
    instances.set(root, { splide, observer });
    resize();
  } catch (error) { console.error('[premium-testimonials] Slider could not initialize', error); }
}

function initializeWithin(scope) {
  scope.querySelectorAll(ROOT_SELECTOR).forEach(initialize);
}

function destroyWithin(scope) {
  scope.querySelectorAll(ROOT_SELECTOR).forEach((root) => {
    const instance = instances.get(root);
    instance?.observer.disconnect(); instance?.splide.destroy(true); instances.delete(root);
  });
}

const boot = () => initializeWithin(document);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
document.addEventListener('shopify:section:load', (event) => initializeWithin(event.target));
document.addEventListener('shopify:section:unload', (event) => destroyWithin(event.target));
document.addEventListener('shopify:block:select', (event) => {
  const slide = event.target.closest?.('.splide__slide'); const root = slide?.closest(ROOT_SELECTOR); const instance = instances.get(root);
  if (slide && instance) instance.splide.go(Number(slide.dataset.index || [...slide.parentElement.children].indexOf(slide)));
});
