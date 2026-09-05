const ROOT_SELECTOR = '[data-custom-collection-slider]';
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
    script.dataset.collectionSplideLoader = '';
    script.addEventListener('load', resolve, { once: true });
    script.addEventListener('error', reject, { once: true });
    document.head.append(script);
  });
  return splidePromise;
}

async function initialize(root) {
  if (!(root instanceof HTMLElement) || instances.has(root) || !root.querySelector('.splide__slide')) return;
  try {
    await ensureSplide(root.dataset.splideAsset);
    if (!root.isConnected || instances.has(root)) return;
    const splide = new window.Splide(root, JSON.parse(root.dataset.splide || '{}'));
    splide.mount();
    instances.set(root, { splide });
  } catch (error) { console.error('[custom-collection-slider] Slider could not initialize', error); }
}

function initializeWithin(scope) {
  scope.querySelectorAll(ROOT_SELECTOR).forEach(initialize);
}

function destroyWithin(scope) {
  scope.querySelectorAll(ROOT_SELECTOR).forEach((root) => {
    const instance = instances.get(root);
    instance?.splide.destroy(true); instances.delete(root);
  });
}

const boot = () => initializeWithin(document);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
document.addEventListener('shopify:section:load', (event) => initializeWithin(event.target));
document.addEventListener('shopify:section:unload', (event) => destroyWithin(event.target));
document.addEventListener('shopify:block:select', (event) => {
  const slide = event.target.closest?.('.splide__slide'); const root = slide?.closest(ROOT_SELECTOR); const instance = instances.get(root);
  if (slide && instance) {
    instance.splide.Components.Autoplay?.pause();
    instance.splide.go([...slide.parentElement.children].indexOf(slide));
  }
});
