const ROOT_SELECTOR = '[data-custom-collection-root]';
const AJAX_SELECTOR = '[data-custom-collection-ajax]';

let activeRequest;

function rootFor(element) {
  return element?.closest?.(ROOT_SELECTOR);
}

function createUrlFromForm(form) {
  const url = new URL(form.action, window.location.origin);
  const parameters = new URLSearchParams(new FormData(form));

  for (const [name, value] of [...parameters.entries()]) {
    if (value === '') parameters.delete(name);
  }

  parameters.delete('page');
  url.search = parameters.toString();
  return url;
}

async function updateCollection(root, requestedUrl, pushState = true) {
  activeRequest?.abort();
  const request = new AbortController();
  activeRequest = request;

  const sectionId = root.dataset.sectionId;
  const storefrontUrl = new URL(requestedUrl, window.location.origin);
  const fetchUrl = new URL(storefrontUrl);
  fetchUrl.searchParams.set('section_id', sectionId);

  root.classList.add('is-loading');
  root.querySelector(AJAX_SELECTOR)?.setAttribute('aria-busy', 'true');

  try {
    const response = await fetch(fetchUrl, {
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
      signal: request.signal,
    });
    if (!response.ok) throw new Error(`Collection request failed: ${response.status}`);

    const documentFragment = new DOMParser().parseFromString(await response.text(), 'text/html');
    const nextRegion = documentFragment.querySelector(AJAX_SELECTOR);
    const currentRegion = root.querySelector(AJAX_SELECTOR);
    if (!nextRegion || !currentRegion) throw new Error('Collection response did not contain the results region.');

    currentRegion.replaceWith(nextRegion);
    if (pushState) history.pushState({ customCollection: true }, '', storefrontUrl);

    document.dispatchEvent(new CustomEvent('shopify:section:load', { detail: { sectionId } }));

    if (storefrontUrl.searchParams.has('page')) {
      root.querySelector('[data-custom-collection-results]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  } catch (error) {
    if (error.name !== 'AbortError') console.error('[custom-collection]', error);
  } finally {
    if (activeRequest === request) {
      root.classList.remove('is-loading');
      root.querySelector(AJAX_SELECTOR)?.removeAttribute('aria-busy');
    }
  }
}

document.addEventListener('change', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;

  const root = rootFor(target);
  if (!root) return;

  if (target.matches('[data-custom-collection-sort]')) {
    const url = new URL(window.location.href);
    url.searchParams.set('sort_by', target.value);
    url.searchParams.delete('page');
    updateCollection(root, url);
    return;
  }

  const form = target.closest('[data-custom-collection-form="desktop"]');
  if (form instanceof HTMLFormElement) updateCollection(root, createUrlFromForm(form));
});

document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || !form.matches('[data-custom-collection-form]')) return;

  const root = rootFor(form);
  if (!root) return;

  event.preventDefault();
  const drawer = form.closest('theme-drawer');
  if (drawer && typeof drawer.close === 'function') drawer.close();
  updateCollection(root, createUrlFromForm(form));
});

document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;

  const tab = target.closest('[data-filter-tab]');
  if (tab) {
    const root = rootFor(tab);
    if (!root) return;

    const tabs = [...root.querySelectorAll('[data-filter-tab]')];
    const panels = [...root.querySelectorAll('[data-filter-panel]')];
    tabs.forEach((item) => {
      const selected = item === tab;
      item.setAttribute('aria-selected', selected.toString());
      item.tabIndex = selected ? 0 : -1;
    });
    panels.forEach((panel) => { panel.hidden = panel.id !== tab.getAttribute('aria-controls'); });
    return;
  }

  const link = target.closest('a[data-custom-collection-link]');
  if (!link) return;

  const root = rootFor(link);
  if (!root || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

  event.preventDefault();
  const drawer = link.closest('theme-drawer');
  if (drawer && typeof drawer.close === 'function') drawer.close();
  updateCollection(root, link.href);
});

document.addEventListener('keydown', (event) => {
  const tab = event.target instanceof Element ? event.target.closest('[data-filter-tab]') : null;
  if (!tab || !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;

  const tabs = [...tab.closest('[role="tablist"]').querySelectorAll('[data-filter-tab]')];
  const currentIndex = tabs.indexOf(tab);
  let nextIndex = currentIndex;
  if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % tabs.length;
  if (event.key === 'Home') nextIndex = 0;
  if (event.key === 'End') nextIndex = tabs.length - 1;

  event.preventDefault();
  tabs[nextIndex].focus();
  tabs[nextIndex].click();
});

window.addEventListener('popstate', () => {
  const root = document.querySelector(ROOT_SELECTOR);
  if (root) updateCollection(root, window.location.href, false);
});
