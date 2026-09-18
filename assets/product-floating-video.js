if (!customElements.get('product-floating-video')) {
  customElements.define('product-floating-video', class extends HTMLElement {
    connectedCallback() {
      this.previewButton = this.querySelector('.product-floating-video__preview');
      this.previewVideo = this.previewButton.querySelector('video');
      this.overlay = this.querySelector('.product-floating-video__overlay');
      this.player = this.overlay.querySelector('.product-floating-video__player');
      this.video = this.player.querySelector('video');
      this.playButton = this.player.querySelector('.product-floating-video__play');
      this.muteButton = this.player.querySelector('.product-floating-video__mute');

      // The popup must escape sticky product details and other stacking contexts.
      document.body.appendChild(this.overlay);
      this.openHandler = () => this.open();
      this.backdropHandler = (event) => {
        if (event.target === this.overlay) this.close();
      };
      this.keyHandler = (event) => {
        if (this.overlay.hidden) return;
        if (event.key === 'Escape') this.close();
        if (event.key === 'Tab') {
          const controls = [this.playButton, this.muteButton];
          const next = event.shiftKey ? controls[0] : controls[1];
          if (document.activeElement === next) {
            event.preventDefault();
            (event.shiftKey ? controls[1] : controls[0]).focus();
          }
        }
      };
      this.playHandler = () => {
        if (this.video.paused) this.video.play().catch(() => {});
        else this.video.pause();
      };
      this.muteHandler = () => { this.video.muted = !this.video.muted; this.updateControls(); };
      this.updateHandler = () => this.updateControls();

      this.previewButton.addEventListener('click', this.openHandler);
      this.overlay.addEventListener('click', this.backdropHandler);
      document.addEventListener('keydown', this.keyHandler);
      this.playButton.addEventListener('click', this.playHandler);
      this.muteButton.addEventListener('click', this.muteHandler);
      this.video.addEventListener('play', this.updateHandler);
      this.video.addEventListener('pause', this.updateHandler);
      this.video.addEventListener('volumechange', this.updateHandler);
    }

    disconnectedCallback() {
      this.close(false);
      this.previewButton.removeEventListener('click', this.openHandler);
      this.overlay.removeEventListener('click', this.backdropHandler);
      document.removeEventListener('keydown', this.keyHandler);
      this.playButton.removeEventListener('click', this.playHandler);
      this.muteButton.removeEventListener('click', this.muteHandler);
      this.video.removeEventListener('play', this.updateHandler);
      this.video.removeEventListener('pause', this.updateHandler);
      this.video.removeEventListener('volumechange', this.updateHandler);
      this.overlay.remove();
    }

    open() {
      this.returnFocus = document.activeElement;
      this.previousOverflow = document.body.style.overflow;
      this.previousRootOverflow = document.documentElement.style.overflow;
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      this.previewVideo.pause();
      if (Number.isFinite(this.previewVideo.currentTime)) {
        try { this.video.currentTime = this.previewVideo.currentTime; } catch (_) { /* Metadata may still be loading. */ }
      }
      this.video.muted = false;
      this.overlay.hidden = false;
      this.playButton.focus();
      this.updateControls();
      this.video.play().catch(() => this.updateControls());
    }

    close(resumePreview = true) {
      if (!this.overlay || this.overlay.hidden) return;
      this.video.pause();
      this.overlay.hidden = true;
      document.body.style.overflow = this.previousOverflow;
      document.documentElement.style.overflow = this.previousRootOverflow;
      if (resumePreview) {
        this.previewVideo.play().catch(() => {});
        this.returnFocus?.focus();
      }
    }

    updateControls() {
      const paused = this.video.paused;
      this.playButton.setAttribute('aria-label', paused ? 'Play video' : 'Pause video');
      this.playButton.querySelector('.product-floating-video__icon--play').hidden = !paused;
      this.playButton.querySelector('.product-floating-video__icon--pause').hidden = paused;
      this.muteButton.setAttribute('aria-label', this.video.muted ? 'Unmute video' : 'Mute video');
      this.muteButton.querySelector('.product-floating-video__icon--sound').hidden = this.video.muted;
      this.muteButton.querySelector('.product-floating-video__icon--silent').hidden = !this.video.muted;
    }
  });
}
