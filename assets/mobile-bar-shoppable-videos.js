(() => {
  if (window.mobileBarShoppableVideosInitialized) return;
  window.mobileBarShoppableVideosInitialized = true;

  const instances = new Map();

  function initialize(trigger) {
    if (!trigger.isConnected || instances.has(trigger)) return;
    if (!window.Splide) {
      document.querySelector('script[src*="cust-splide.min.js"]')?.addEventListener('load', () => initialize(trigger), { once: true });
      return;
    }

    const modal = trigger.nextElementSibling;
    const sliderRoot = modal?.querySelector('[data-mobile-reels-slider]');
    if (!modal?.matches('[data-mobile-reels-modal]') || !sliderRoot?.querySelector('.shoppable-reel__slide')) return;

    const controller = new AbortController();
    const { signal } = controller;
    let splide;
    let open = false;
    let muted = false;
    let previousBodyOverflow;
    let previousHtmlOverflow;
    document.body.append(modal);

    function updateSound(video) {
      const button = video.closest('.shoppable-reel__player').querySelector('.shoppable-reel__sound');
      button.setAttribute('aria-label', video.muted ? 'Unmute video' : 'Mute video');
      button.querySelector('.shoppable-reel__sound-on').hidden = video.muted;
      button.querySelector('.shoppable-reel__sound-off').hidden = !video.muted;
    }

    function playActive() {
      if (!open || !splide) return;
      modal.querySelectorAll('.shoppable-reel__video').forEach((video, index) => {
        if (index !== splide.index) {
          video.pause();
          return;
        }
        video.muted = muted;
        updateSound(video);
        video.play().catch(() => {});
      });
    }

    function close() {
      if (!open) return;
      open = false;
      modal.querySelectorAll('.shoppable-reel__video').forEach((video) => video.pause());
      modal.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      trigger.focus({ preventScroll: true });
    }

    trigger.addEventListener('click', () => {
      previousBodyOverflow = document.body.style.overflow;
      previousHtmlOverflow = document.documentElement.style.overflow;
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      open = true;
      modal.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      if (!splide) {
        splide = new window.Splide(sliderRoot, JSON.parse(sliderRoot.dataset.splide || '{}'));
        splide.on('move', () => modal.querySelectorAll('.shoppable-reel__video').forEach((video) => video.pause()));
        splide.on('mounted moved', playActive);
        splide.mount();
      }
      splide.go(0);
      playActive();
      modal.querySelector('.shoppable-reel__slide.is-active .shoppable-reel__close, .shoppable-reel__close')?.focus({ preventScroll: true });
    }, { signal });

    modal.addEventListener('click', (event) => {
      if (event.target.closest('.shoppable-reel__close') || !event.target.closest('.shoppable-reel__player')) {
        close();
        return;
      }
      const soundButton = event.target.closest('.shoppable-reel__sound');
      if (soundButton) {
        const video = soundButton.closest('.shoppable-reel__player').querySelector('video');
        muted = !video.muted;
        video.muted = muted;
        updateSound(video);
      }
    }, { signal });

    document.addEventListener('keydown', (event) => {
      if (open && event.key === 'Escape') close();
    }, { signal });

    instances.set(trigger, {
      destroy() {
        close();
        controller.abort();
        splide?.destroy(true);
        modal.remove();
      },
    });
  }

  const boot = () => document.querySelectorAll('[data-mobile-reels-open]').forEach(initialize);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();

  document.addEventListener('shopify:section:load', (event) => {
    event.target.querySelectorAll('[data-mobile-reels-open]').forEach(initialize);
  });
  document.addEventListener('shopify:section:unload', (event) => {
    event.target.querySelectorAll('[data-mobile-reels-open]').forEach((trigger) => {
      instances.get(trigger)?.destroy();
      instances.delete(trigger);
    });
  });
})();
