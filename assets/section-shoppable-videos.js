(() => {
  if (window.shoppableVideosInitialized) return;
  window.shoppableVideosInitialized = true;

  const instances = new Map();
  const selector = '[data-shoppable-videos]';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function find(root) {
    return [...(root.matches?.(selector) ? [root] : []), ...root.querySelectorAll(selector)];
  }

  function initialize(section) {
    if (!section.isConnected || instances.has(section)) return;
    const sliderRoot = section.querySelector('[data-shoppable-slider]');
    const track = sliderRoot?.querySelector('[data-shoppable-track]');
    const list = track?.querySelector('.shoppable-videos__list');
    const cards = [...(list?.querySelectorAll('.shoppable-videos__card') || [])];
    if (!cards.length) return;

    const controller = new AbortController();
    const { signal } = controller;
    const autoplay = section.dataset.autoplay === 'true' && !reduceMotion.matches;
    const autoplaySlides = section.dataset.autoplaySlides === 'true' && !reduceMotion.matches;
    const slideSpeed = Math.max(2, Number(section.dataset.slideSpeed) || 4) * 1000;
    const pauseOffscreen = section.dataset.pauseOffscreen === 'true';
    const progress = sliderRoot.querySelector('.shoppable-videos__progress');
    const prev = sliderRoot.querySelector('[data-shoppable-prev]');
    const next = sliderRoot.querySelector('[data-shoppable-next]');
    const loop = section.dataset.slideType === 'loop';
    const dragEnabled = section.dataset.dragEnabled === 'true';
    const modal = section.nextElementSibling?.matches('[data-reel-modal]') ? section.nextElementSibling : null;
    const reelRoot = modal?.querySelector('[data-reel-slider]');
    let reelSplide;
    let modalOpen = false;
    let opener;
    let previousBodyOverflow;
    let previousHtmlOverflow;
    let popupMuted = false;
    let observer;
    let resizeObserver;
    let dragStart;
    let dragMoved = false;
    let suppressClickUntil = 0;
    let slideTimer;

    if (modal) document.body.append(modal);

    function updateReelSound(video) {
      const button = video?.closest('.shoppable-reel__player')?.querySelector('.shoppable-reel__sound');
      if (!button) return;
      button.setAttribute('aria-label', video.muted ? 'Unmute video' : 'Mute video');
      button.querySelector('.shoppable-reel__sound-on').hidden = video.muted;
      button.querySelector('.shoppable-reel__sound-off').hidden = !video.muted;
    }

    function playActiveReel() {
      if (!modalOpen || !reelSplide) return;
      modal.querySelectorAll('.shoppable-reel__video').forEach((video, index) => {
        if (index !== reelSplide.index) {
          video.pause();
          return;
        }
        video.muted = popupMuted;
        updateReelSound(video);
        video.play().catch(() => {});
      });
    }

    function closeReel() {
      if (!modalOpen) return;
      modalOpen = false;
      modal.querySelectorAll('.shoppable-reel__video').forEach((video) => video.pause());
      modal.hidden = true;
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      observeVideos();
      startSlideAutoplay();
      opener?.focus({ preventScroll: true });
    }

    function openReel(index, button) {
      if (!modal || !reelRoot || !window.Splide) return;
      opener = button;
      previousBodyOverflow = document.body.style.overflow;
      previousHtmlOverflow = document.documentElement.style.overflow;
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      modalOpen = true;
      stopSlideAutoplay();
      modal.hidden = false;
      sliderRoot.querySelectorAll('video').forEach((video) => video.pause());
      if (!reelSplide) {
        reelSplide = new window.Splide(reelRoot, JSON.parse(reelRoot.dataset.splide || '{}'));
        reelSplide.on('move', () => modal.querySelectorAll('.shoppable-reel__video').forEach((video) => video.pause()));
        reelSplide.on('mounted moved', playActiveReel);
        reelSplide.mount();
      }
      reelSplide.go(index);
      playActiveReel();
      modal.querySelector('.shoppable-reel__slide.is-active .shoppable-reel__close, .shoppable-reel__close')?.focus({ preventScroll: true });
    }

    function updateControls(video) {
      const card = video.closest('.shoppable-videos__card');
      const sound = card?.querySelector('.shoppable-videos__sound');
      const play = card?.querySelector('.shoppable-videos__play');
      if (sound) {
        sound.setAttribute('aria-label', video.muted ? 'Unmute video' : 'Mute video');
        sound.querySelector('.shoppable-videos__sound-on').hidden = video.muted;
        sound.querySelector('.shoppable-videos__sound-off').hidden = !video.muted;
      }
      if (play) {
        play.hidden = autoplay;
        play.setAttribute('aria-label', video.paused ? 'Play video' : 'Pause video');
        play.querySelector('.shoppable-videos__play-icon').hidden = !video.paused;
        play.querySelector('.shoppable-videos__pause-icon').hidden = video.paused;
      }
    }

    function observeVideos() {
      observer?.disconnect();
      if (pauseOffscreen && 'IntersectionObserver' in window) {
        observer = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            const video = entry.target.querySelector('video');
            if (modalOpen) video.pause();
            else if (entry.isIntersecting && autoplay) video.play().catch(() => {});
            else if (!entry.isIntersecting) video.pause();
          });
        }, { threshold: 0.2 });
      }
      cards.forEach((card) => {
        const video = card.querySelector('video');
        if (modalOpen || !autoplay) {
          video.autoplay = false;
          video.pause();
        } else if (observer) {
          video.pause();
        } else {
          video.play().catch(() => {});
        }
        updateControls(video);
        observer?.observe(card);
      });
    }

    function updateProgress() {
      const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
      const hasOverflow = maxScroll > 1;
      if (prev) prev.disabled = !hasOverflow || (!loop && track.scrollLeft <= 1);
      if (next) next.disabled = !hasOverflow || (!loop && track.scrollLeft >= maxScroll - 1);
      if (!progress) return;
      const percent = track.scrollWidth ? Math.min(100, Math.max(0, ((track.scrollLeft + track.clientWidth) / track.scrollWidth) * 100)) : 100;
      progress.querySelector('.shoppable-videos__progress-bar').style.width = `${percent}%`;
      progress.setAttribute('aria-valuenow', String(Math.round(percent)));
    }

    function cardStep() {
      return cards[0].getBoundingClientRect().width + (parseFloat(getComputedStyle(list).gap) || 0);
    }

    function scrollToIndex(index) {
      track.scrollTo({ left: Math.max(0, index * cardStep()), behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    }

    function navigate(direction) {
      const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
      if (maxScroll <= 1) return;
      const step = cardStep();
      const nextIndex = Math.round(track.scrollLeft / step) + direction;
      if (loop && direction < 0 && track.scrollLeft <= 1) track.scrollTo({ left: maxScroll, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
      else if (loop && direction > 0 && track.scrollLeft >= maxScroll - 1) track.scrollTo({ left: 0, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
      else scrollToIndex(nextIndex);
    }

    function stopSlideAutoplay() {
      window.clearInterval(slideTimer);
      slideTimer = undefined;
    }

    function advanceSlide() {
      if (modalOpen || document.hidden) return;
      const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
      if (maxScroll <= 1) return;
      if (track.scrollLeft >= maxScroll - 1) scrollToIndex(0);
      else navigate(1);
    }

    function startSlideAutoplay() {
      stopSlideAutoplay();
      if (!autoplaySlides || modalOpen) return;
      slideTimer = window.setInterval(advanceSlide, slideSpeed);
    }

    function updateLayout() {
      const mobile = window.matchMedia('(max-width: 749px)').matches;
      const count = Number(getComputedStyle(section).getPropertyValue(mobile ? '--sv-mobile-count' : '--sv-desktop-count')) || 1;
      const gap = parseFloat(getComputedStyle(list).gap) || 0;
      const width = Math.max(1, (track.clientWidth - gap * (count - 1)) / count);
      section.style.setProperty('--sv-item-width', `${width}px`);
      requestAnimationFrame(updateProgress);
    }

    track.addEventListener('scroll', updateProgress, { passive: true, signal });
    prev?.addEventListener('click', () => navigate(-1), { signal });
    next?.addEventListener('click', () => navigate(1), { signal });
    sliderRoot.addEventListener('mouseenter', stopSlideAutoplay, { signal });
    sliderRoot.addEventListener('mouseleave', startSlideAutoplay, { signal });
    sliderRoot.addEventListener('focusin', stopSlideAutoplay, { signal });
    sliderRoot.addEventListener('focusout', (event) => {
      if (!sliderRoot.contains(event.relatedTarget)) startSlideAutoplay();
    }, { signal });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopSlideAutoplay();
      else startSlideAutoplay();
    }, { signal });
    if (dragEnabled) {
      track.addEventListener('pointerdown', (event) => {
        if (event.button !== 0 || event.target.closest('.shoppable-videos__sound, .shoppable-videos__play, .shoppable-videos__shop')) return;
        dragStart = { x: event.clientX, scrollLeft: track.scrollLeft, pointerId: event.pointerId };
        dragMoved = false;
      }, { signal });

      window.addEventListener('pointermove', (event) => {
        if (!dragStart || event.pointerId !== dragStart.pointerId) return;
        const distance = event.clientX - dragStart.x;
        if (!dragMoved && Math.abs(distance) < 5) return;
        if (!dragMoved) {
          dragMoved = true;
          track.classList.add('is-dragging');
          track.setPointerCapture(event.pointerId);
        }
        track.scrollLeft = dragStart.scrollLeft - distance;
        event.preventDefault();
      }, { signal });

      const finishDrag = (event) => {
        if (!dragStart || event.pointerId !== dragStart.pointerId) return;
        const start = dragStart;
        dragStart = null;
        if (!dragMoved) return;
        suppressClickUntil = performance.now() + 350;
        dragMoved = false;
        track.classList.remove('is-dragging');
        if (track.hasPointerCapture(event.pointerId)) track.releasePointerCapture(event.pointerId);
        const distance = event.clientX - start.x;
        const step = cardStep();
        const steps = Math.max(1, Math.round(Math.abs(distance) / step));
        const targetIndex = Math.abs(distance) >= 24
          ? Math.round(start.scrollLeft / step) + (distance < 0 ? steps : -steps)
          : Math.round(track.scrollLeft / step);
        const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
        if (loop && targetIndex < 0) track.scrollTo({ left: maxScroll, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
        else if (loop && targetIndex * step > maxScroll + 1) track.scrollTo({ left: 0, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
        else scrollToIndex(targetIndex);
      };
      window.addEventListener('pointerup', finishDrag, { signal });
      window.addEventListener('pointercancel', finishDrag, { signal });
      sliderRoot.addEventListener('click', (event) => {
        if (performance.now() > suppressClickUntil) return;
        suppressClickUntil = 0;
        event.preventDefault();
        event.stopImmediatePropagation();
      }, { capture: true, signal });
    }
    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(updateLayout);
      resizeObserver.observe(track);
    } else {
      window.addEventListener('resize', updateLayout, { signal });
    }

    sliderRoot.addEventListener('click', (event) => {
      const openButton = event.target.closest('[data-reel-open]');
      if (openButton && sliderRoot.contains(openButton)) {
        openReel(Number(openButton.dataset.reelIndex) || 0, openButton);
        return;
      }
      const button = event.target.closest('.shoppable-videos__sound, .shoppable-videos__play');
      if (!button || !sliderRoot.contains(button)) return;
      const video = button.closest('.shoppable-videos__card').querySelector('video');
      if (button.classList.contains('shoppable-videos__sound')) video.muted = !video.muted;
      else if (video.paused) video.play().catch(() => updateControls(video));
      else video.pause();
      updateControls(video);
    }, { signal });

    modal?.addEventListener('click', (event) => {
      const closeButton = event.target.closest('.shoppable-reel__close');
      if (closeButton || !event.target.closest('.shoppable-reel__player')) {
        closeReel();
        return;
      }
      const soundButton = event.target.closest('.shoppable-reel__sound');
      if (soundButton) {
        const video = soundButton.closest('.shoppable-reel__player').querySelector('video');
        popupMuted = !video.muted;
        video.muted = popupMuted;
        updateReelSound(video);
      }
    }, { signal });

    document.addEventListener('keydown', (event) => {
      if (modalOpen && event.key === 'Escape') closeReel();
    }, { signal });

    ['volumechange', 'play', 'pause'].forEach((type) => {
      sliderRoot.addEventListener(type, (event) => {
        if (event.target instanceof HTMLVideoElement) updateControls(event.target);
      }, { capture: true, signal });
    });

    updateLayout();
    observeVideos();
    startSlideAutoplay();
    instances.set(section, {
      controller,
      stopSlideAutoplay,
      disconnect: () => observer?.disconnect(),
      disconnectResize: () => resizeObserver?.disconnect(),
      scrollToIndex,
      destroyReel: () => {
        closeReel();
        reelSplide?.destroy(true);
        modal?.querySelectorAll('video').forEach((video) => video.pause());
        modal?.remove();
      },
    });
  }

  const boot = () => find(document).forEach(initialize);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();

  document.addEventListener('shopify:section:load', (event) => find(event.target).forEach(initialize));
  document.addEventListener('shopify:section:unload', (event) => {
    find(event.target).forEach((section) => {
      const instance = instances.get(section);
      if (!instance) return;
      instance.controller.abort();
      instance.stopSlideAutoplay();
      instance.disconnect();
      instance.disconnectResize();
      instance.destroyReel();
      section.querySelectorAll('video').forEach((video) => video.pause());
      instances.delete(section);
    });
  });
  document.addEventListener('shopify:block:select', (event) => {
    const slide = event.target.closest?.('.shoppable-videos__card');
    const section = slide?.closest(selector);
    const instance = instances.get(section);
    if (!instance) return;
    const slides = [...slide.parentElement.children];
    const index = slides.indexOf(slide);
    if (index >= 0) instance.scrollToIndex(index);
  });
})();
