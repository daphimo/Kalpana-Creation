const DIALOG_SELECTOR = '[data-card-variant-dialog]';

function variantsFor(dialog) {
  try {
    return JSON.parse(dialog.querySelector('[data-card-variants]')?.textContent || '[]');
  } catch (error) {
    console.error('[product-card] Invalid variant data', error);
    return [];
  }
}

function selectedOptions(dialog) {
  return [...dialog.querySelectorAll('[data-card-option-group]')].map(
    (group) => group.querySelector('[data-card-option-value][aria-pressed="true"]')?.dataset.cardOptionValue
  );
}

function updateOptionAvailability(dialog, variants) {
  const selected = selectedOptions(dialog);
  dialog.querySelectorAll('[data-card-option-group]').forEach((group) => {
    const optionIndex = Number(group.dataset.optionIndex);
    group.querySelectorAll('[data-card-option-value]').forEach((button) => {
      const possible = variants.some((variant) => {
        const previousOptionsMatch = variant.options
          .slice(0, optionIndex)
          .every((value, index) => value === selected[index]);
        return variant.inStock && previousOptionsMatch &&
          variant.options[optionIndex] === button.dataset.cardOptionValue;
      });
      button.disabled = !possible;
    });
  });
}

function updateSelectedVariant(dialog) {
  const variants = variantsFor(dialog);
  const selected = selectedOptions(dialog);
  const variant = variants.find((item) => item.options.every((value, index) => value === selected[index]));
  const submit = dialog.querySelector('.custom-collection-card__variant-submit');
  const input = dialog.querySelector('[data-card-variant-id]');
  const price = dialog.querySelector('[data-card-variant-price]');
  const image = dialog.querySelector('.custom-collection-card__variant-image');

  if (input) input.value = variant?.id || '';
  if (submit) {
    submit.disabled = !variant?.inStock;
    submit.setAttribute('aria-label', variant?.inStock ? 'Add to cart' : 'Selected option is unavailable');
  }
  if (price && variant) price.textContent = variant.price;
  if (image && variant?.image) image.src = variant.image;
  updateOptionAvailability(dialog, variants);
}

function closeDialog(dialog) {
  if (dialog?.open) dialog.close();
  document.documentElement.classList.remove('custom-product-card-dialog-open');
}

document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;

  const opener = target.closest('[data-card-quick-add-open]');
  if (opener) {
    const dialog = document.getElementById(opener.getAttribute('aria-controls'));
    if (dialog instanceof HTMLDialogElement) {
      updateSelectedVariant(dialog);
      document.documentElement.classList.add('custom-product-card-dialog-open');
      dialog.showModal();
    }
    return;
  }

  const close = target.closest('[data-card-quick-add-close]');
  if (close) {
    closeDialog(close.closest(DIALOG_SELECTOR));
    return;
  }

  const option = target.closest('[data-card-option-value]');
  if (option) {
    const dialog = option.closest(DIALOG_SELECTOR);
    const group = option.closest('[data-card-option-group]');
    group?.querySelectorAll('[data-card-option-value]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button === option));
    });
    updateSelectedVariant(dialog);
  }
});

document.addEventListener('click', (event) => {
  const dialog = event.target instanceof HTMLDialogElement ? event.target : null;
  if (dialog?.matches(DIALOG_SELECTOR)) closeDialog(dialog);
});

document.addEventListener('cancel', (event) => {
  if (event.target instanceof HTMLDialogElement && event.target.matches(DIALOG_SELECTOR)) {
    event.preventDefault();
    closeDialog(event.target);
  }
});

document.addEventListener('shopify:cart:lines-update', (event) => {
  const productForm = event.target instanceof Element ? event.target.closest('product-form-component') : null;
  const pendingButton = productForm?.querySelector('[ref="addToCartButton"]');
  if (pendingButton instanceof HTMLButtonElement) {
    pendingButton.classList.add('is-loading');
    pendingButton.disabled = true;
    pendingButton.setAttribute('aria-busy', 'true');

    const finishLoading = () => {
      pendingButton.classList.remove('is-loading');
      pendingButton.removeAttribute('aria-busy');
      pendingButton.disabled = false;
      const pendingDialog = pendingButton.closest(DIALOG_SELECTOR);
      if (pendingDialog?.open) updateSelectedVariant(pendingDialog);
    };
    event.promise?.then(finishLoading, finishLoading);
  }

  const dialog = event.target instanceof Element ? event.target.closest(DIALOG_SELECTOR) : null;
  if (!dialog || !event.promise) return;

  event.promise.then(({ detail }) => {
    if (!detail?.didError) closeDialog(dialog);
  }).catch(() => {
    // Product form announces the error and keeps the picker open for another attempt.
  });
});
