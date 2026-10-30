import { yieldToMainThread } from '@theme/utilities';
import { Component } from '@theme/component';

/**
 * Returns the cart icon that is actually visible in the current header layout.
 * The theme can render Horizon, custom desktop, and mobile cart icons together.
 * @returns {Element | null}
 */
export function getVisibleCartIcon() {
  const cartIcons = document.querySelectorAll(
    '.header-actions__cart-icon, .custom-desktop-header__cart-icon, .mobile-bar__icon-wrap'
  );

  return (
    Array.from(cartIcons).find((cartIcon) => {
      const rect = cartIcon.getBoundingClientRect();
      const styles = getComputedStyle(cartIcon);

      return rect.width > 0 && rect.height > 0 && styles.display !== 'none' && styles.visibility !== 'hidden';
    }) || null
  );
}

/**
 * FlyToCart custom element for animating product images to cart
 * This component creates a visual effect of a product "flying" to the cart when added
 */
class FlyToCart extends Component {
  /** @type {Element} */
  source;

  /** @type {boolean} */
  useSourceSize = false;

  /** @type {Element} */
  destination;

  connectedCallback() {
    super.connectedCallback();
    if (!this.source || !this.destination) {
      this.remove();
      return;
    }

    /** @type {DOMRectReadOnly | null} */
    let sourceRect = null;
    /** @type {DOMRectReadOnly | null} */
    let destinationRect = null;

    const intersectionObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.target === this.source) {
          sourceRect = entry.boundingClientRect;
        } else if (entry.target === this.destination) {
          destinationRect = entry.boundingClientRect;
        }
      });

      if (sourceRect && destinationRect) {
        intersectionObserver.disconnect();
        this.#animate(sourceRect, destinationRect);
      }
    });
    intersectionObserver.observe(this.source);
    intersectionObserver.observe(this.destination);
  }

  /**
   * Animates the flying thingy along the bezier curve.
   * @param {DOMRectReadOnly} sourceRect - The bounding client rect of the source.
   * @param {DOMRectReadOnly} destinationRect - The bounding client rect of the destination.
   */
  #animate = async (sourceRect, destinationRect) => {
    //Define bezier curve points
    const startPoint = {
      x: sourceRect.left + sourceRect.width / 2,
      y: sourceRect.top + sourceRect.height / 2,
    };

    const endPoint = {
      x: destinationRect.left + destinationRect.width / 2,
      y: destinationRect.top + destinationRect.height / 2,
    };

    // Position the flying thingy back to the start point
    if (this.useSourceSize) {
      this.style.setProperty('--width', `${sourceRect.width}px`);
      this.style.setProperty('--height', `${sourceRect.height}px`);
    }
    this.style.setProperty('--start-x', `${startPoint.x}px`);
    this.style.setProperty('--start-y', `${startPoint.y}px`);
    this.style.setProperty('--travel-x', `${endPoint.x - startPoint.x}px`);
    this.style.setProperty('--travel-y', `${endPoint.y - startPoint.y}px`);

    await yieldToMainThread();

    await Promise.allSettled(this.getAnimations().map((a) => a.finished));
    this.remove();
  };
}

if (!customElements.get('fly-to-cart')) {
  customElements.define('fly-to-cart', FlyToCart);
}
