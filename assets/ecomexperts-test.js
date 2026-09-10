/**
 * Ecomexperts Shopify Developer Test — vanilla JS only, no jQuery.
 *
 * Responsibilities:
 *   1. Popup open/close (grid circle -> matching product popup)
 *   2. Variant selection (color swatches + size list -> resolve variant ID)
 *   3. AJAX Add to Cart (Shopify Cart API, no page reload)
 *   4. Special rule: Color=Black + Size=Medium -> also add "Soft Winter Jacket"
 *
 * Data source: each popup ships a
 *   <script type="application/json" data-product-json="{id}">
 * tag (see snippets/ecomexperts-product-popup.liquid) containing that
 * product's variants + options. The Soft Winter Jacket lookup result
 * ships once in #ee-jacket-data (see sections/ecomexperts-product-grid.liquid).
 * No variant ID is ever hardcoded here — everything is resolved from
 * that JSON at runtime.
 */
(function () {
  'use strict';

  var CART_ADD_URL = (window.routes && window.routes.cart_add_url) || '/cart/add.js';

  /* ------------------------------------------------------------------ *
   * Helpers
   * ------------------------------------------------------------------ */

  function readJSON(el) {
    if (!el) return null;
    try {
      return JSON.parse(el.textContent);
    } catch (e) {
      console.error('[Ecomexperts] Failed to parse JSON block', el, e);
      return null;
    }
  }

  function getProductData(productId) {
    var el = document.querySelector('[data-product-json="' + productId + '"]');
    return readJSON(el);
  }

  function getJacketData() {
    return readJSON(document.getElementById('ee-jacket-data'));
  }

  /** Find the variant whose option1/2/3 match the selected values at their positions. */
  function resolveVariant(productData, selections) {
    if (!productData) return null;
    return (
      productData.variants.find(function (variant) {
        return Object.keys(selections).every(function (position) {
          var key = 'option' + position;
          return variant[key] === selections[position];
        });
      }) || null
    );
  }

  /** True if the resolved variant has Color=Black AND Size=Medium (case-insensitive, any option position). */
  function isBlackMedium(variant) {
    if (!variant) return false;
    var values = [variant.option1, variant.option2, variant.option3]
      .filter(Boolean)
      .map(function (v) {
        return v.toLowerCase();
      });
    return values.indexOf('black') !== -1 && values.indexOf('medium') !== -1;
  }

  /* ------------------------------------------------------------------ *
   * Popup open / close
   * ------------------------------------------------------------------ */

  function openPopup(productId) {
    var popup = document.getElementById('ee-popup-' + productId);
    if (!popup) return;
    popup.hidden = false;
    // Force layout before adding the class so the CSS transition runs.
    requestAnimationFrame(function () {
      popup.setAttribute('data-open', '');
      popup.setAttribute('aria-hidden', 'false');
    });
    document.body.style.overflow = 'hidden';
  }

  function closePopup(popup) {
    if (!popup) return;
    popup.removeAttribute('data-open');
    popup.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    // Wait for the fade-out transition before hiding for real.
    window.setTimeout(function () {
      if (!popup.hasAttribute('data-open')) popup.hidden = true;
    }, 250);
  }

  function initPopupTriggers() {
    document.querySelectorAll('[data-open-popup]').forEach(function (trigger) {
      trigger.addEventListener('click', function () {
        openPopup(trigger.getAttribute('data-product-id'));
      });
    });

    document.querySelectorAll('[data-product-popup]').forEach(function (popup) {
      popup.querySelector('[data-popup-close]').addEventListener('click', function () {
        closePopup(popup);
      });
      // Click on the dim overlay (outside the card) closes it too.
      popup.addEventListener('click', function (event) {
        if (event.target === popup) closePopup(popup);
      });
    });

    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      var openPopupEl = document.querySelector('[data-product-popup][data-open]');
      if (openPopupEl) closePopup(openPopupEl);
    });
  }

  /* ------------------------------------------------------------------ *
   * Variant selection
   * ------------------------------------------------------------------ */

  function initVariantSelection() {
    document.querySelectorAll('[data-product-popup]').forEach(function (popup) {
      var productId = popup.getAttribute('data-product-id');
      var productData = getProductData(productId);
      var addBtn = popup.querySelector('[data-add-to-cart]');
      var priceEl = popup.querySelector('[data-popup-price]');
      var errorEl = popup.querySelector('[data-popup-error]');
      var selections = {}; // { optionPosition: value }

      function updateState() {
        var variant = resolveVariant(productData, selections);
        var allGroupsFilled =
          popup.querySelectorAll('.ee-variant-group').length ===
          Object.keys(selections).length;

        if (variant) {
          priceEl.textContent = formatMoney(variant.price);
        }

        addBtn.disabled = !(variant && variant.available && allGroupsFilled);
        addBtn.dataset.variantId = variant ? variant.id : '';
        errorEl.hidden = true;

        if (allGroupsFilled && variant && !variant.available) {
          errorEl.textContent = 'This combination is sold out.';
          errorEl.hidden = false;
        }
      }

      // Color swatches
      popup.querySelectorAll('.ee-swatch').forEach(function (swatch, index, all) {
        if (index === 0) {
          // First swatch is pre-selected by default, matching the Figma state.
          selections[swatch.dataset.optionPosition] = swatch.dataset.optionValue;
        }
        swatch.addEventListener('click', function () {
          all.forEach(function (s) {
            s.classList.remove('is-selected');
            s.setAttribute('aria-checked', 'false');
          });
          swatch.classList.add('is-selected');
          swatch.setAttribute('aria-checked', 'true');
          selections[swatch.dataset.optionPosition] = swatch.dataset.optionValue;
          updateState();
        });
      });

      // Size accordion toggle
      var sizeToggle = popup.querySelector('[data-size-toggle]');
      var sizeList = popup.querySelector('[data-size-list]');
      if (sizeToggle) {
        sizeToggle.addEventListener('click', function () {
          var expanded = sizeToggle.getAttribute('aria-expanded') === 'true';
          sizeToggle.setAttribute('aria-expanded', String(!expanded));
          sizeList.hidden = expanded;
        });
      }

      // Size options
      popup.querySelectorAll('.ee-size-option').forEach(function (option, index, all) {
        option.addEventListener('click', function () {
          all.forEach(function (o) {
            o.classList.remove('is-selected');
            o.setAttribute('aria-checked', 'false');
          });
          option.classList.add('is-selected');
          option.setAttribute('aria-checked', 'true');
          selections[option.dataset.optionPosition] = option.dataset.optionValue;
          if (sizeToggle) {
            sizeToggle.querySelector('[data-size-toggle-label]').textContent = option.dataset.optionValue;
            sizeToggle.setAttribute('aria-expanded', 'false');
            sizeList.hidden = true;
          }
          updateState();
        });
      });

      updateState();

      // Add to cart
      addBtn.addEventListener('click', function () {
        var variantId = addBtn.dataset.variantId;
        if (!variantId) return;
        addToCart(variantId, addBtn, errorEl, function (addedVariant) {
          // Special requirement: Black + Medium -> also add Soft Winter Jacket.
          if (isBlackMedium(addedVariant)) {
            addSoftWinterJacketIfNeeded(productId);
          }
        });
      });
    });
  }

  function formatMoney(cents) {
    // Minimal fallback formatter; Shopify's own money filter already
    // formats prices server-side for the initial render.
    return (cents / 100).toFixed(2);
  }

  /* ------------------------------------------------------------------ *
   * AJAX Add to Cart
   * ------------------------------------------------------------------ */

  function addToCart(variantId, buttonEl, errorEl, onSuccess) {
    buttonEl.disabled = true;
    buttonEl.classList.add('is-loading');
    errorEl.hidden = true;

    fetch(CART_ADD_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ id: variantId, quantity: 1 }),
    })
      .then(function (response) {
        return response.json().then(function (data) {
          if (!response.ok) throw data;
          return data;
        });
      })
      .then(function (addedVariant) {
        buttonEl.classList.remove('is-loading');
        buttonEl.classList.add('is-added');
        var label = buttonEl.querySelector('[data-add-to-cart-label]');
        var originalLabel = label.textContent;
        label.textContent = 'Added';
        document.dispatchEvent(new CustomEvent('ecomexperts:cart:add', { detail: addedVariant }));

        window.setTimeout(function () {
          buttonEl.classList.remove('is-added');
          buttonEl.disabled = false;
          label.textContent = originalLabel;
        }, 2000);

        if (typeof onSuccess === 'function') onSuccess(addedVariant);
      })
      .catch(function (error) {
        buttonEl.classList.remove('is-loading');
        buttonEl.disabled = false;
        errorEl.textContent = (error && error.description) || 'Could not add this item to your cart.';
        errorEl.hidden = false;
        console.error('[Ecomexperts] Add to cart failed', error);
      });
  }

  /* ------------------------------------------------------------------ *
   * Special requirement: auto-add "Soft Winter Jacket"
   * ------------------------------------------------------------------ */

  function addSoftWinterJacketIfNeeded(triggeringProductId) {
    var jacket = getJacketData();
    if (!jacket || !jacket.found) {
      console.warn('[Ecomexperts] "Soft Winter Jacket" product was not found in the store — skipping auto-add.');
      return;
    }
    // Guard against the jacket adding itself if it happens to be the
    // product the customer just picked Black/Medium on.
    if (String(jacket.id) === String(triggeringProductId)) return;

    var availableVariant = jacket.variants.find(function (v) {
      return v.available;
    });
    var variantToAdd = availableVariant || jacket.variants[0];
    if (!variantToAdd) {
      console.warn('[Ecomexperts] "Soft Winter Jacket" has no variants to add.');
      return;
    }

    fetch(CART_ADD_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ id: variantToAdd.id, quantity: 1 }),
    })
      .then(function (response) {
        return response.json().then(function (data) {
          if (!response.ok) throw data;
          return data;
        });
      })
      .then(function (addedJacket) {
        document.dispatchEvent(new CustomEvent('ecomexperts:cart:auto-add', { detail: addedJacket }));
      })
      .catch(function (error) {
        console.error('[Ecomexperts] Failed to auto-add Soft Winter Jacket', error);
      });
  }

  /* ------------------------------------------------------------------ */

  document.addEventListener('DOMContentLoaded', function () {
    initPopupTriggers();
    initVariantSelection();
  });
})();
