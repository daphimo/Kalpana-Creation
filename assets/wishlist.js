import { CartLinesUpdateEvent } from "@shopify/events";

const LOCAL_STORAGE_WISHLIST_KEY = "shopify-wishlist";
const LOCAL_STORAGE_DELIMITER = ",";
const BUTTON_ACTIVE_CLASS = "active";
const GRID_LOADED_CLASS = "loaded";
const TOOLTIP_DURATION = 2000;

const selectors = {
  button: "[button-wishlist]",
  grid: "[grid-wishlist]",
  productCard: ".custom_card-product-card",
  wishlistCountBubble: ".wishlist-count-bubble",
  addAllContainer: "[data-wishlist-add-all-container]",
  addAllButton: "[data-wishlist-add-all]",
  addAllLabel: "[data-wishlist-add-all-label]",
  addAllLoader: "[data-wishlist-add-all-loader]",
  emptyState: "[data-wishlist-empty]",
};

const tooltipStyles = document.createElement("style");
tooltipStyles.textContent = "";
document.head.appendChild(tooltipStyles);

const createTooltip = () => {
  const tooltip = document.createElement("div");
  tooltip.className = "wishlist-tooltip";
  document.body.appendChild(tooltip);
  return tooltip;
};

/** @param {string} message */
const showTooltip = (message) => {
  let tooltip = document.querySelector(".wishlist-tooltip");
  if (!tooltip) tooltip = createTooltip();

  tooltip.textContent = message;
  tooltip.classList.add("show");

  window.setTimeout(() => {
    tooltip.classList.remove("show");
  }, TOOLTIP_DURATION);
};

const getWishlist = () => {
  try {
    const storedWishlist = localStorage.getItem(LOCAL_STORAGE_WISHLIST_KEY) || "";
    return storedWishlist
      ? storedWishlist.split(LOCAL_STORAGE_DELIMITER).filter(Boolean)
      : [];
  } catch (error) {
    console.error("Unable to read wishlist from localStorage.", error);
    return [];
  }
};

/** @param {string[]} array */
const setWishlist = (array) => {
  try {
    const storedWishlist = array.join(LOCAL_STORAGE_DELIMITER);
    if (array.length) {
      localStorage.setItem(LOCAL_STORAGE_WISHLIST_KEY, storedWishlist);
    } else {
      localStorage.removeItem(LOCAL_STORAGE_WISHLIST_KEY);
    }
  } catch (error) {
    console.error("Unable to save wishlist to localStorage.", error);
    return array;
  }

  document.dispatchEvent(
    new CustomEvent("shopify-wishlist:updated", {
      detail: { wishlist: array },
    })
  );

  return array;
};

/** @param {string} handle */
const updateWishlist = (handle) => {
  const wishlist = getWishlist();
  const indexInWishlist = wishlist.indexOf(handle);

  if (indexInWishlist === -1) wishlist.push(handle);
  else wishlist.splice(indexInWishlist, 1);

  return setWishlist(wishlist);
};

/**
 * Set one product's wishlist state without duplicating wishlist storage logic in
 * components such as product swipe.
 * @param {string} handle
 * @param {boolean} shouldInclude
 */
const setWishlistItem = (handle, shouldInclude) => {
  const wishlist = getWishlist();
  const indexInWishlist = wishlist.indexOf(handle);
  const isIncluded = indexInWishlist !== -1;

  if (shouldInclude === isIncluded) {
    return { wishlist, changed: false };
  }

  if (shouldInclude) wishlist.push(handle);
  else wishlist.splice(indexInWishlist, 1);

  return { wishlist: setWishlist(wishlist), changed: true };
};

const updateWishlistCountBubble = () => {
  const countBubbles = document.querySelectorAll(selectors.wishlistCountBubble);
  if (!countBubbles.length) return;

  const count = getWishlist().length;
  countBubbles.forEach((countBubble) => {
    countBubble.textContent = count.toString();
    countBubble.style.display = count > 0 ? "flex" : "none";
  });
};

/** @param {number} [itemCount] */
const updateWishlistPageState = (itemCount = getWishlist().length) => {
  const hasItems = itemCount > 0;
  const addAllContainer = document.querySelector(selectors.addAllContainer);
  const emptyState = document.querySelector(selectors.emptyState);

  addAllContainer?.classList.toggle("is-active", hasItems);
  emptyState?.toggleAttribute("hidden", hasItems);
};

/** @param {string} handle */
const fetchProductCardHTML = async (handle) => {
  try {
    const response = await fetch(`/products/${handle}?view=card`);
    if (!response.ok) throw new Error(`Product card request failed: ${response.status}`);

    const html = await response.text();
    const htmlDocument = new DOMParser().parseFromString(html, "text/html");
    return htmlDocument.querySelector(selectors.productCard)?.outerHTML || "";
  } catch (error) {
    console.error(`Unable to load wishlist product "${handle}".`, error);
    return "";
  }
};

/** @param {NodeListOf<Element>} buttons */
const setupButtons = (buttons) => {
  const wishlist = getWishlist();
  buttons.forEach((button) => {
    if (!(button instanceof HTMLElement)) return;
    const productHandle = button.dataset.productHandle;
    if (!productHandle) return;

    button.classList.toggle(BUTTON_ACTIVE_CLASS, wishlist.includes(productHandle));
    const isActive = button.classList.contains(BUTTON_ACTIVE_CLASS);
    button.setAttribute(
      "aria-pressed",
      isActive.toString()
    );
    button.setAttribute("aria-label", isActive ? "Remove from wishlist" : "Add to wishlist");

    const productWishlist = button.closest(".product-wishlist");
    const productWishlistLabel = productWishlist?.querySelector(".product-wishlist__label");
    if (productWishlistLabel) {
      productWishlistLabel.textContent = isActive ? "Remove from wishlist" : "Add to wishlist";
    }
  });
};

// One delegated listener handles current and section-rendered wishlist buttons.
document.addEventListener("click", (event) => {
  const button = event.target instanceof Element ? event.target.closest(selectors.button) : null;
  if (!(button instanceof HTMLElement)) return;

  const productHandle = button.dataset.productHandle;
  if (!productHandle) return;

  event.preventDefault();
  event.stopPropagation();

  const wishlist = updateWishlist(productHandle);
  setupButtons(document.querySelectorAll(selectors.button));

  const productTitle = button.dataset.productTitle || "Product";
  const isAdded = wishlist.includes(productHandle);
  if (button.dataset.wishlistSilent !== "true") {
    showTooltip(
      isAdded
        ? `${productTitle} added to wishlist`
        : `${productTitle} removed from wishlist`
    );
  }
});

// Components can request an add/remove while keeping this module as the single
// source of truth. The mutable detail reports whether this request changed data.
document.addEventListener("shopify-wishlist:set-item", (event) => {
  const detail = event.detail;
  if (!detail?.handle || typeof detail.shouldInclude !== "boolean") return;

  const result = setWishlistItem(detail.handle, detail.shouldInclude);
  detail.changed = result.changed;
  detail.wishlist = result.wishlist;
  setupButtons(document.querySelectorAll(selectors.button));

  if (!detail.silent && result.changed) {
    const productTitle = detail.title || "Product";
    showTooltip(
      detail.shouldInclude
        ? `${productTitle} added to wishlist`
        : `${productTitle} removed from wishlist`
    );
  }
});

const initButtons = () => {
  const buttons = document.querySelectorAll(selectors.button);
  setupButtons(buttons);

  document.dispatchEvent(
    new CustomEvent("shopify-wishlist:init-buttons", {
      detail: { wishlist: getWishlist() },
    })
  );
};

/** @param {Element} grid */
const setupGrid = async (grid) => {
  const wishlist = getWishlist();

  if (!wishlist.length) {
    grid.innerHTML = "";
    grid.classList.add(GRID_LOADED_CLASS);
    updateWishlistPageState(0);
    return;
  }

  grid.setAttribute("aria-busy", "true");
  const responses = await Promise.all(wishlist.map(fetchProductCardHTML));
  grid.innerHTML = responses.join("");
  grid.classList.add(GRID_LOADED_CLASS);
  grid.removeAttribute("aria-busy");

  const renderedCount = grid.querySelectorAll(selectors.productCard).length;
  updateWishlistPageState(renderedCount);
  initButtons();

  document.dispatchEvent(
    new CustomEvent("shopify-wishlist:init-product-grid", {
      detail: { wishlist },
    })
  );
};

const initGrid = () => {
  const grid = document.querySelector(selectors.grid);
  if (!grid) return;

  setupGrid(grid).catch((error) => {
    console.error("Unable to initialize wishlist grid.", error);
    grid.removeAttribute("aria-busy");
  });
};

/** @param {HTMLButtonElement} button @param {boolean} loading */
const setAddAllLoading = (button, loading) => {
  const label = button.querySelector(selectors.addAllLabel);
  const loader = button.querySelector(selectors.addAllLoader);

  button.disabled = loading;
  button.setAttribute("aria-busy", loading.toString());
  if (label instanceof HTMLElement) label.hidden = loading;
  if (loader instanceof HTMLElement) loader.hidden = !loading;
};

/** @param {HTMLButtonElement} button */
const addAllWishlistItemsToCart = async (button) => {
  const cards = [...document.querySelectorAll(`${selectors.grid} ${selectors.productCard}`)];
  const items = cards
    .filter((card) => card instanceof HTMLElement && card.dataset.productAvailable === "true")
    .map((card) => ({
      id: Number(card instanceof HTMLElement ? card.dataset.variantId : undefined),
      quantity: 1,
    }))
    .filter((item) => Number.isInteger(item.id) && item.id > 0);

  if (!items.length) {
    showTooltip("No wishlist items are currently available.");
    return;
  }

  setAddAllLoading(button, true);

  const cartItemsComponents = document.querySelectorAll("cart-items-component[data-section-id]");
  const sectionIds = [...new Set([...cartItemsComponents]
    .map((component) => component instanceof HTMLElement ? component.dataset.sectionId : undefined)
    .filter((sectionId) => typeof sectionId === "string"))];
  const deferredEventPromise = CartLinesUpdateEvent.createPromise();

  button.dispatchEvent(new CartLinesUpdateEvent({
    action: "add",
    context: "wishlist",
    lines: items.map((item) => ({
      merchandiseId: String(item.id),
      quantity: item.quantity,
    })),
    promise: deferredEventPromise.promise,
  }));

  try {
    const response = await fetch(`${window.Shopify?.routes?.root || "/"}cart/add.js`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        items,
        sections: sectionIds.join(","),
        sections_url: window.location.pathname,
      }),
    });

    if (!response.ok) {
      const error = /** @type {{description?: string}} */ (await response.json().catch(() => ({})));
      throw new Error(error.description || "Unable to add wishlist items to cart.");
    }

    const result = await response.json();
    const cartResponse = await fetch(`${window.Shopify?.routes?.root || "/"}cart.js`, {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });

    if (!cartResponse.ok) throw new Error("Unable to refresh the cart.");

    const cart = await cartResponse.json();
    deferredEventPromise.resolve({
      cart: CartLinesUpdateEvent.createCartFromAjaxResponse(cart),
      detail: {
        items: cart.items,
        itemCount: items.reduce((total, item) => total + item.quantity, 0),
        sections: result.sections,
        source: "wishlist-add-all",
        didError: false,
      },
    });
  } catch (error) {
    deferredEventPromise.reject(error);
    console.error("Unable to add all wishlist items to cart.", error);
    showTooltip(error instanceof Error ? error.message : "Unable to add wishlist items to cart.");
  } finally {
    setAddAllLoading(button, false);
  }
};

const initAddAllButton = () => {
  const button = document.querySelector(selectors.addAllButton);
  if (!(button instanceof HTMLButtonElement) || button.dataset.wishlistBound === "true") return;

  button.dataset.wishlistBound = "true";
  button.addEventListener("click", () => addAllWishlistItemsToCart(button));
};

const initWishlist = () => {
  initButtons();
  initGrid();
  initAddAllButton();
  updateWishlistCountBubble();
  updateWishlistPageState();
};

document.addEventListener("shopify:section:load", initWishlist);

document.addEventListener("shopify-wishlist:updated", () => {
  updateWishlistCountBubble();
  initGrid();
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initWishlist, { once: true });
} else {
  initWishlist();
}
