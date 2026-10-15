/**
 * Popover primitive for Moxfield Extended
 * A small card anchored below an element, with no backdrop. One is open at a
 * time; it closes on Esc, an outside mousedown, or its anchor leaving the page.
 */

(function () {
  'use strict';

  const STYLE_ID = 'mox-popover-styles';
  // Gap between the anchor and the popover, and the minimum viewport margin.
  const OFFSET_PX = 4;
  const MARGIN_PX = 8;
  const DEFAULT_LABEL = 'Moxfield Extended';
  const SCROLL_OPTIONS = { capture: true, passive: true };

  const CSS = `
.mox-popover {
  position: fixed;
  z-index: 2000;
  min-width: 160px;
  max-width: 320px;
  padding: 8px 10px;
  font-size: 0.8125rem;
  line-height: 1.4;
  color: var(--bs-body-color, #212529);
  background: var(--bs-body-bg, #fff);
  border: 1px solid var(--bs-border-color, rgba(0, 0, 0, 0.2));
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
}
`;

  // The open popover's handle, or null.
  let current = null;

  /**
   * Add the popover stylesheet to the page once.
   */
  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.setAttribute('data-mox', '');
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  /**
   * Clamp a value into [min, max]; min wins when the range is empty.
   * @param {number} value
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
  }

  /**
   * Open a popover anchored to an element, closing any open one first.
   * @param {Element} anchorEl - Element the popover sits below, right-aligned.
   *   A mousedown on it does not count as outside, so callers can toggle.
   * @param {function(HTMLElement, Object): void} render - Fills the popover
   *   body. Receives the root and the handle; re-run by update(). It owns the
   *   body's content: the root is not cleared between runs.
   * @param {Object} [options]
   * @param {function(): void} [options.onClose] - Called once, after closing
   * @param {string} [options.label] - Accessible name of the dialog
   * @returns {{el: HTMLElement, update: function(): void, close: function(): void}}
   */
  function open(anchorEl, render, { onClose, label } = {}) {
    close();
    ensureStyles();

    const el = document.createElement('div');
    el.className = 'mox-popover';
    el.setAttribute('data-mox', '');
    el.style.position = 'fixed';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', label || DEFAULT_LABEL);

    let closed = false;
    let framePending = false;
    let frame = null;
    const observer = new MutationObserver(() => {
      if (!anchorEl.isConnected) closeThis();
    });

    /**
     * Place the popover below the anchor, right-aligned, inside the viewport.
     * After the first placement, an anchor with an empty box (hidden) closes
     * the popover. The first placement skips that check, so a popover still
     * opens where layout reports nothing (jsdom).
     * @param {boolean} initial - True on open
     */
    function position(initial) {
      const rect = anchorEl.getBoundingClientRect();
      if (!initial && rect.width === 0 && rect.height === 0) {
        closeThis();
        return;
      }
      const width = el.offsetWidth;
      const height = el.offsetHeight;
      const maxLeft = window.innerWidth - MARGIN_PX - width;
      const maxTop = window.innerHeight - MARGIN_PX - height;

      let top = rect.bottom + OFFSET_PX;
      // Flip above the anchor when there is no room below.
      if (top > maxTop) top = rect.top - OFFSET_PX - height;

      el.style.left = `${Math.round(clamp(rect.right - width, MARGIN_PX, maxLeft))}px`;
      el.style.top = `${Math.round(clamp(top, MARGIN_PX, maxTop))}px`;
    }

    /**
     * Run render, then position. Does nothing once closed.
     * @param {boolean} initial - True on open
     */
    function draw(initial) {
      if (closed) return;
      render(el, handle);
      if (!closed) position(initial);
    }

    /**
     * Re-run render and re-position.
     */
    function update() {
      draw(false);
    }

    /**
     * Re-position on scroll or resize, at most once per frame.
     */
    function schedulePosition() {
      if (framePending) return;
      framePending = true;
      frame = requestAnimationFrame(() => {
        framePending = false;
        if (!closed) position(false);
      });
    }

    /**
     * Close on Esc, keeping the key from Moxfield's handlers.
     * @param {KeyboardEvent} event
     */
    function onKeydown(event) {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      closeThis();
    }

    /**
     * Close on a mousedown outside both the popover and its anchor.
     * @param {MouseEvent} event
     */
    function onMousedown(event) {
      const target = event.target;
      if (el.contains(target) || anchorEl.contains(target)) return;
      closeThis();
    }

    /**
     * Remove the popover, its listeners and observer, then call onClose.
     * Idempotent.
     */
    function closeThis() {
      if (closed) return;
      closed = true;
      if (current === handle) current = null;
      document.removeEventListener('keydown', onKeydown, true);
      document.removeEventListener('mousedown', onMousedown, true);
      window.removeEventListener('scroll', schedulePosition, SCROLL_OPTIONS);
      window.removeEventListener('resize', schedulePosition);
      if (framePending) cancelAnimationFrame(frame);
      observer.disconnect();
      el.remove();
      if (onClose) onClose();
    }

    const handle = { el, update, close: closeThis };
    current = handle;

    document.body.appendChild(el);
    document.addEventListener('keydown', onKeydown, true);
    document.addEventListener('mousedown', onMousedown, true);
    // Capture sees scrolls of any element; scroll events do not bubble.
    window.addEventListener('scroll', schedulePosition, SCROLL_OPTIONS);
    window.addEventListener('resize', schedulePosition);
    observer.observe(document.body, { childList: true, subtree: true });

    draw(true);
    return handle;
  }

  /**
   * Whether a popover is open.
   * @returns {boolean}
   */
  function isOpen() {
    return current !== null;
  }

  /**
   * Close the open popover, if any.
   */
  function close() {
    if (current) current.close();
  }

  // Export for use in content scripts
  window.MoxfieldExtended = window.MoxfieldExtended || {};
  window.MoxfieldExtended.popover = {
    open,
    isOpen,
    close,
  };
})();
