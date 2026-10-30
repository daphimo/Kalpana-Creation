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
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const effectiveType = connection?.effectiveType || '';
    const saveData = connection?.saveData === true;
    const slowConnection = saveData || effectiveType === 'slow-2g' || effectiveType === '2g';
    const fastConnection = effectiveType === '4g' && Number(connection?.downlink || 0) >= 5;
    const mobileViewport = window.matchMedia('(max-width: 749px)');
    const autoplaySlides = section.dataset.autoplaySlides === 'true' && !reduceMotion.matches;
    const autoplayVideos = section.dataset.autoplay === 'true' && !reduceMotion.matches && !saveData;
    const pauseOffscreen = section.dataset.pauseOffscreen !== 'false';
    const slideSpeed = Math.max(2, Number(section.dataset.slideSpeed) || 4) * 1000;
    const progress = sliderRoot.querySelector('.shoppable-videos__progress');
    const prev = sliderRoot.querySelector('[data-shoppable-prev]');
    const next = sliderRoot.querySelector('[data-shoppable-next]');
    const loop = section.dataset.slideType === 'loop';
    const dragEnabled = section.dataset.dragEnabled === 'true';
    const modal = section.nextElementSibling?.matches('[data-reel-modal]') ? section.nextElementSibling : null;
    const reelRoot = modal?.querySelector('[data-reel-slider]');
    const reelPlayers = [...(modal?.querySelectorAll('.shoppable-reel__player') || [])];
    let reelSplide;
    let modalOpen = false;
    let opener;
    let previousBodyOverflow;
    let previousHtmlOverflow;
    let popupMuted = true;
    let resizeObserver;
    let cardObserver;
    let sectionObserver;
    let relevanceObserver;
    let sectionVisible = false;
    let sectionRelevant = false;
    const visibleCards = new Set();
    let activeIndex = 0;
    let navigationDirection = 1;
    let lastScrollLeft = 0;
    let queueVersion = 0;
    let reelQueueVersion = 0;
    let scrollFrame;
    let dragStart;
    let dragMoved = false;
    let suppressClickUntil = 0;
    let slideTimer;

    if (modal) document.body.append(modal);

    function lookaheadCount() {
      if (slowConnection) return 0;
      return fastConnection && !mobileViewport.matches ? 2 : 1;
    }

    function videoSources(element) {
      try {
        const sources = JSON.parse(element?.dataset.videoSources || '[]');
        if (!Array.isArray(sources)) return [];
        const normalizedSources = sources.map((source) => {
          if (typeof source === 'string') return { url: source, type: '' };
          if (!source || typeof source !== 'object') return null;
          return {
            url: source.url || source.src || '',
            type: source.type || source.mime_type || source.mimeType || '',
          };
        }).filter((source) => {
          if (!source || typeof source.url !== 'string') return false;
          const url = source.url.trim();
          return url !== '' && url !== 'undefined' && url !== 'null';
        });
        if (!normalizedSources.length && sources.length) {
          console.warn('[shoppable-videos] No valid video sources for item', element?.dataset.videoIndex || 'unknown');
        }
        return normalizedSources;
      } catch (error) {
        console.warn('[shoppable-videos] Invalid video sources', error);
        return [];
      }
    }

    function appendSources(video, sources) {
      sources.forEach(({ url, type }) => {
        const source = document.createElement('source');
        source.src = url;
        if (type) source.type = type;
        video.append(source);
      });
    }

    function setMediaState(video, state) {
      video.dataset.mediaState = state;
      video.closest('[data-card-video-media], .shoppable-reel__player')?.setAttribute('data-media-state', state);
    }

    function registerMediaEvents(video, onReady) {
      let readyHandled = false;
      const ready = () => {
        setMediaState(video, 'ready');
        video.classList.add('is-ready');
        if (readyHandled) return;
        readyHandled = true;
        onReady?.();
      };
      video.addEventListener('loadstart', () => setMediaState(video, 'loading'), { signal });
      video.addEventListener('loadedmetadata', () => setMediaState(video, 'metadata'), { signal });
      video.addEventListener('loadeddata', ready, { signal });
      video.addEventListener('canplay', ready, { signal });
      video.addEventListener('playing', () => {
        setMediaState(video, 'playing');
        video.classList.add('is-ready', 'is-playing');
        onReady?.();
      }, { signal });
      video.addEventListener('waiting', () => setMediaState(video, 'waiting'), { signal });
      video.addEventListener('stalled', () => setMediaState(video, 'waiting'), { signal });
      video.addEventListener('error', () => {
        setMediaState(video, 'error');
        video.classList.remove('is-ready', 'is-playing');
        video.closest('.shoppable-videos__card')?.querySelector('.shoppable-videos__play')?.removeAttribute('hidden');
      }, { signal });
    }

    function ensureCardVideo(index, priority = 'upcoming') {
      const card = cards[index];
      const media = card?.querySelector('[data-card-video-media]');
      if (!media) return null;
      const existing = media.querySelector('.shoppable-videos__card-video');
      if (existing) {
        if (priority === 'active' && existing.preload !== 'auto') existing.preload = 'auto';
        return existing.dataset.mediaState === 'error' ? null : existing;
      }
      const sources = videoSources(media);
      if (!sources.length) {
        media.dataset.mediaState = 'error';
        return null;
      }

      const video = document.createElement('video');
      video.className = 'shoppable-videos__card-video';
      video.preload = priority === 'active' ? 'auto' : 'metadata';
      video.muted = true;
      video.defaultMuted = true;
      video.playsInline = true;
      video.loop = media.dataset.videoLoop === 'true';
      if (media.dataset.videoPoster) video.poster = media.dataset.videoPoster;
      registerMediaEvents(video, () => {
        if (index === activeIndex && sectionVisible && !modalOpen) prepareCardLookahead(queueVersion);
      });
      video.addEventListener('playing', () => {
        const playButton = card.querySelector('.shoppable-videos__play');
        if (playButton) playButton.hidden = true;
      }, { signal });
      video.addEventListener('pause', () => {
        if (!video.ended) video.classList.remove('is-playing');
      }, { signal });
      video.addEventListener('timeupdate', () => {
        if (video.duration && video.duration - video.currentTime < 4) prepareCardLookahead(queueVersion, true);
      }, { signal });
      setMediaState(video, 'source-assigned');
      appendSources(video, sources);
      media.append(video);
      video.load();
      return video;
    }

    function pauseCardVideos(exceptIndex = -1) {
      cards.forEach((card, index) => {
        if (index === exceptIndex) return;
        const video = card.querySelector('.shoppable-videos__card-video');
        video?.pause();
        video?.classList.remove('is-playing');
      });
    }

    function playVisibleCards() {
      if (!sectionVisible || modalOpen || !autoplayVideos) return;
      visibleCards.forEach((card) => {
        const index = cards.indexOf(card);
        if (index < 0) return;
        const video = ensureCardVideo(index, 'active');
        const playPromise = video?.play();
        if (playPromise?.catch) playPromise.catch(() => video.classList.remove('is-playing'));
      });
    }

    function neighborIndexes(index, count, direction = 1) {
      const indexes = [];
      for (let distance = 1; distance <= count; distance += 1) {
        let candidate = index + distance * direction;
        if (loop) candidate = (candidate + cards.length) % cards.length;
        if (candidate < 0 || candidate >= cards.length || indexes.includes(candidate)) continue;
        indexes.push(candidate);
      }
      return indexes;
    }

    function prepareCardLookahead(version, urgent = false) {
      if (version !== queueVersion || modalOpen || !sectionRelevant) return;
      const count = lookaheadCount();
      if (!count) return;
      const run = () => {
        if (version !== queueVersion || modalOpen || !section.isConnected) return;
        neighborIndexes(activeIndex, count, navigationDirection).forEach((index) => ensureCardVideo(index, urgent ? 'active' : 'upcoming'));
      };
      if (urgent) run();
      else if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 700 });
      else window.setTimeout(run, 80);
    }

    function releaseDistantCardVideos() {
      if (!slowConnection) return;
      cards.forEach((card, index) => {
        if (visibleCards.has(card) || Math.abs(index - activeIndex) <= 1) return;
        const video = card.querySelector('.shoppable-videos__card-video');
        if (!video) return;
        video.pause();
        video.removeAttribute('src');
        video.querySelectorAll('source').forEach((source) => source.removeAttribute('src'));
        video.load();
        video.remove();
        card.querySelector('.shoppable-videos__play')?.removeAttribute('hidden');
      });
    }

    function activateCard(index, direction = navigationDirection) {
      const boundedIndex = Math.max(0, Math.min(cards.length - 1, index));
      if (boundedIndex !== activeIndex) {
        navigationDirection = direction || 1;
        activeIndex = boundedIndex;
        queueVersion += 1;
      }
      releaseDistantCardVideos();
      if (!sectionRelevant || modalOpen || !autoplayVideos) return;
      const video = ensureCardVideo(activeIndex, sectionVisible ? 'active' : 'upcoming');
      if (!video || !sectionVisible) return;
      playVisibleCards();
    }

    function updateActiveCard() {
      const step = cardStep();
      if (!step) return;
      const nextIndex = Math.max(0, Math.min(cards.length - 1, Math.round(track.scrollLeft / step)));
      const direction = track.scrollLeft >= lastScrollLeft ? 1 : -1;
      lastScrollLeft = track.scrollLeft;
      activateCard(nextIndex, direction);
    }

    function updateReelSound(video) {
      const button = video?.closest('.shoppable-reel__player')?.querySelector('.shoppable-reel__sound');
      if (!button) return;
      button.setAttribute('aria-label', video.muted ? 'Unmute video' : 'Mute video');
      button.querySelector('.shoppable-reel__sound-on').hidden = video.muted;
      button.querySelector('.shoppable-reel__sound-off').hidden = !video.muted;
    }

    function unloadReel(player) {
      const video = player?.querySelector('.shoppable-reel__video');
      if (!video) return;
      video.pause();
      video.removeAttribute('src');
      video.querySelectorAll('source').forEach((source) => source.removeAttribute('src'));
      video.load();
      video.remove();
      player.removeAttribute('data-media-state');
    }

    function ensureReelVideo(index, priority = 'upcoming', version = reelQueueVersion) {
      const player = reelPlayers[index];
      if (!player) return null;
      const existing = player.querySelector('.shoppable-reel__video');
      if (existing) {
        if (priority === 'active' && existing.preload !== 'auto') existing.preload = 'auto';
        return existing.dataset.mediaState === 'error' ? null : existing;
      }
      const sources = videoSources(player);
      if (!sources.length) {
        player.dataset.mediaState = 'error';
        return null;
      }
      const video = document.createElement('video');
      video.className = 'shoppable-reel__video';
      video.preload = priority === 'active' ? 'auto' : 'metadata';
      video.playsInline = true;
      video.loop = player.dataset.videoLoop === 'true';
      video.muted = popupMuted;
      if (player.dataset.videoPoster) video.poster = player.dataset.videoPoster;
      registerMediaEvents(video, () => prepareReelLookahead(version));
      video.addEventListener('timeupdate', () => {
        if (video.duration && video.duration - video.currentTime < 4) prepareReelLookahead(version, true);
      }, { signal });
      setMediaState(video, 'source-assigned');
      appendSources(video, sources);
      player.prepend(video);
      video.load();
      return video;
    }

    function prepareReelLookahead(version, urgent = false) {
      if (!modalOpen || !reelSplide || version !== reelQueueVersion) return;
      const count = lookaheadCount();
      if (!count) return;
      const run = () => {
        if (!modalOpen || version !== reelQueueVersion) return;
        neighborIndexes(reelSplide.index, count, 1).forEach((index) => ensureReelVideo(index, urgent ? 'active' : 'upcoming', version));
      };
      if (urgent) run();
      else window.setTimeout(run, 60);
    }

    function trimReelVideos(activeReelIndex) {
      const keep = new Set([activeReelIndex, ...neighborIndexes(activeReelIndex, lookaheadCount(), 1)]);
      reelPlayers.forEach((player, index) => {
        const video = player.querySelector('.shoppable-reel__video');
        if (!video) return;
        if (!keep.has(index)) unloadReel(player);
        else if (index !== activeReelIndex) video.pause();
      });
    }

    function playActiveReel() {
      if (!modalOpen || !reelSplide) return;
      reelQueueVersion += 1;
      const version = reelQueueVersion;
      const index = reelSplide.index;
      trimReelVideos(index);
      const video = ensureReelVideo(index, 'active', version);
      if (!video) return;
      video.muted = popupMuted;
      updateReelSound(video);
      if (video.readyState >= 2) prepareReelLookahead(version);
      else video.addEventListener('loadeddata', () => prepareReelLookahead(version), { once: true, signal });
      const playPromise = video.play();
      if (playPromise?.catch) playPromise.catch(() => setMediaState(video, video.readyState >= 2 ? 'ready' : 'loading'));
    }

    function closeReel() {
      if (!modalOpen) return;
      modalOpen = false;
      reelQueueVersion += 1;
      reelPlayers.forEach(unloadReel);
      modal.hidden = true;
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      startSlideAutoplay();
      activateCard(activeIndex);
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
      queueVersion += 1;
      stopSlideAutoplay();
      pauseCardVideos();
      modal.hidden = false;
      if (!reelSplide) {
        reelSplide = new window.Splide(reelRoot, JSON.parse(reelRoot.dataset.splide || '{}'));
        reelSplide.on('move', () => reelPlayers.forEach((player) => player.querySelector('video')?.pause()));
        reelSplide.on('moved', playActiveReel);
        reelSplide.mount();
      }
      reelQueueVersion += 1;
      ensureReelVideo(index, 'active', reelQueueVersion);
      const previousIndex = reelSplide.index;
      reelSplide.go(index);
      if (reelSplide.index === previousIndex) playActiveReel();
      modal.querySelector('.shoppable-reel__slide.is-active .shoppable-reel__close, .shoppable-reel__close')?.focus({ preventScroll: true });
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
      navigationDirection = direction;
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
      if (!autoplaySlides || modalOpen || !sectionVisible) return;
      slideTimer = window.setInterval(advanceSlide, slideSpeed);
    }

    function updateLayout() {
      const count = Number(getComputedStyle(section).getPropertyValue(mobileViewport.matches ? '--sv-mobile-count' : '--sv-desktop-count')) || 1;
      const gap = parseFloat(getComputedStyle(list).gap) || 0;
      const width = Math.max(1, (track.clientWidth - gap * (count - 1)) / count);
      section.style.setProperty('--sv-item-width', `${width}px`);
      requestAnimationFrame(() => {
        updateProgress();
        updateActiveCard();
      });
    }

    track.addEventListener('scroll', () => {
      updateProgress();
      if (scrollFrame) return;
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = undefined;
        updateActiveCard();
      });
    }, { passive: true, signal });
    prev?.addEventListener('click', () => navigate(-1), { signal });
    next?.addEventListener('click', () => navigate(1), { signal });
    sliderRoot.addEventListener('mouseenter', stopSlideAutoplay, { signal });
    sliderRoot.addEventListener('mouseleave', startSlideAutoplay, { signal });
    sliderRoot.addEventListener('focusin', stopSlideAutoplay, { signal });
    sliderRoot.addEventListener('focusout', (event) => {
      if (!sliderRoot.contains(event.relatedTarget)) startSlideAutoplay();
    }, { signal });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        stopSlideAutoplay();
        pauseCardVideos();
        reelPlayers.forEach((player) => player.querySelector('video')?.pause());
      } else if (modalOpen) playActiveReel();
      else {
        startSlideAutoplay();
        activateCard(activeIndex);
      }
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

    if ('IntersectionObserver' in window) {
      relevanceObserver = new IntersectionObserver((entries) => {
        sectionRelevant = entries.some((entry) => entry.isIntersecting);
        if (sectionRelevant) activateCard(activeIndex);
        else if (pauseOffscreen) pauseCardVideos();
      }, { rootMargin: '400px 0px', threshold: 0 });
      relevanceObserver.observe(section);

      sectionObserver = new IntersectionObserver((entries) => {
        sectionVisible = entries.some((entry) => entry.isIntersecting);
        if (sectionVisible) {
          activateCard(activeIndex);
          playVisibleCards();
          startSlideAutoplay();
        } else {
          stopSlideAutoplay();
          if (pauseOffscreen) pauseCardVideos();
        }
      }, { threshold: 0.05 });
      sectionObserver.observe(section);

      cardObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          const card = entry.target;
          if (entry.isIntersecting) {
            visibleCards.add(card);
            if (sectionVisible) playVisibleCards();
          } else {
            visibleCards.delete(card);
            if (pauseOffscreen) card.querySelector('.shoppable-videos__card-video')?.pause();
          }
        });
      }, { root: track, rootMargin: '0px 80px', threshold: [0.35, 0.75] });
      cards.forEach((card) => cardObserver.observe(card));
    } else {
      sectionRelevant = true;
      sectionVisible = true;
      cards.forEach((card) => visibleCards.add(card));
      activateCard(0);
    }

    sliderRoot.addEventListener('click', (event) => {
      const openButton = event.target.closest('[data-reel-open]');
      if (openButton && sliderRoot.contains(openButton)) openReel(Number(openButton.dataset.reelIndex) || 0, openButton);
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
        if (!video) return;
        popupMuted = !video.muted;
        video.muted = popupMuted;
        updateReelSound(video);
      }
    }, { signal });

    document.addEventListener('keydown', (event) => {
      if (modalOpen && event.key === 'Escape') closeReel();
    }, { signal });

    updateLayout();
    instances.set(section, {
      controller,
      stopSlideAutoplay,
      disconnectResize: () => resizeObserver?.disconnect(),
      disconnectVisibility: () => {
        cardObserver?.disconnect();
        sectionObserver?.disconnect();
        relevanceObserver?.disconnect();
      },
      scrollToIndex,
      destroyReel: () => {
        closeReel();
        reelSplide?.destroy(true);
        reelPlayers.forEach(unloadReel);
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
      instance.disconnectResize();
      instance.disconnectVisibility();
      instance.destroyReel();
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
