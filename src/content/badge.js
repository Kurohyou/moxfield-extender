/**
 * Floating badge for Moxfield Extended (spec 5.1)
 * A fixed bottom-right pill with three segments: price bars, Section odds and
 * Section mana curve. It shows while any of them is on, outside goldfish mode.
 * It also owns Alt+O and Alt+M (spec 5.5), which work even while their
 * feature is off, so it is initialised on every deck page.
 */

(function () {
  'use strict';

  const LOG_PREFIX = '[Moxfield Extended]';
  const STYLE_ID = 'mox-badge-styles';
  const OFF_CLASS = 'mox-badge__seg--off';
  const RIGHT_CLICK = 'Right-click: settings';
  const PRICE_HINT = `Turn on Price in Moxfield's view options to use price bars`;

  // Physical key (event.code) to the global toggle it flips. Matching code,
  // not key: macOS Option turns Alt+O into "ø".
  const KEY_TOGGLES = { KeyO: 'sectionOddsEnabled', KeyM: 'sectionCurveEnabled' };
  // Badge segment to the global toggle a left-click flips.
  const SEG_TOGGLES = { odds: 'sectionOddsEnabled', curve: 'sectionCurveEnabled' };
  const SEGMENTS = ['price', 'odds', 'curve'];
  // Keys that activate a focused segment, like a native button.
  const ACTIVATE_KEYS = new Set(['Enter', ' ']);

  const CSS = `
.mox-badge {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 1990;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  color: #fff;
  background: rgba(30, 30, 30, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
  user-select: none;
  transition: box-shadow 0.15s ease;
}
.mox-badge:hover {
  box-shadow: 0 3px 12px rgba(0, 0, 0, 0.4);
}
.mox-badge[hidden],
.mox-badge__seg[hidden] {
  display: none;
}
.mox-badge__seg {
  cursor: pointer;
  white-space: nowrap;
}
.mox-badge__seg:hover {
  text-shadow: 0 0 6px rgba(255, 255, 255, 0.35);
}
/* A dot between visible segments. inline-block keeps the strike off it. */
.mox-badge__seg:not([hidden]) ~ .mox-badge__seg::before {
  content: '·';
  display: inline-block;
  margin-right: 10px;
  opacity: 0.4;
  text-decoration: none;
}
.mox-badge__seg--off {
  text-decoration: line-through;
  opacity: 0.55;
}
.mox-badge__seg[aria-disabled='true'] {
  cursor: default;
}
`;

  let initialized = false;
  let root = null;
  let segs = null; // { price, odds, curve } spans, built with the root

  /**
   * The shared namespace, read at call time.
   * @returns {Object}
   */
  function ns() {
    return window.MoxfieldExtended || {};
  }

  /**
   * The global settings index.js holds, or the defaults before it has loaded.
   * @returns {Object}
   */
  function currentSettings() {
    const { state, storage } = ns();
    return state?.settings || storage?.DEFAULT_SETTINGS || {};
  }

  /**
   * Add the badge stylesheet to the page once.
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
   * Build the root and its segments once. Not attached here.
   * @returns {HTMLElement}
   */
  function ensureRoot() {
    if (root) return root;
    root = document.createElement('div');
    root.className = 'mox-badge';
    root.setAttribute('data-mox', '');
    root.setAttribute('role', 'toolbar');
    root.setAttribute('aria-label', 'Moxfield Extended');
    segs = {};
    SEGMENTS.forEach((name) => {
      const span = document.createElement('span');
      span.className = 'mox-badge__seg';
      span.dataset.seg = name;
      span.setAttribute('role', 'button');
      span.setAttribute('tabindex', '0');
      root.appendChild(span);
      segs[name] = span;
    });
    root.addEventListener('click', onClick);
    root.addEventListener('contextmenu', onContextMenu);
    root.addEventListener('keydown', onSegmentKeydown);
    return root;
  }

  /**
   * Set text only when it differs, so an unchanged render writes nothing.
   * @param {HTMLElement} el
   * @param {string} text
   */
  function setText(el, text) {
    if (el.textContent !== text) el.textContent = text;
  }

  /**
   * Set the title only when it differs.
   * @param {HTMLElement} el
   * @param {string} title
   */
  function setTitle(el, title) {
    if (el.title !== title) el.title = title;
  }

  /**
   * Add or remove a class only when it differs.
   * @param {HTMLElement} el
   * @param {string} name
   * @param {boolean} on
   */
  function setClass(el, name, on) {
    if (el.classList.contains(name) !== on) el.classList.toggle(name, on);
  }

  /**
   * Show or hide an element only when it differs.
   * @param {HTMLElement} el
   * @param {boolean} hidden
   */
  function setHidden(el, hidden) {
    if (el.hidden !== hidden) el.hidden = hidden;
  }

  /**
   * Set an attribute, or remove it for null, only when it differs.
   * @param {HTMLElement} el
   * @param {string} name
   * @param {string|null} value
   */
  function setAttr(el, name, value) {
    if (el.getAttribute(name) === value) return;
    if (value === null) el.removeAttribute(name);
    else el.setAttribute(name, value);
  }

  /**
   * Text, struck state and title of the price segment.
   * @param {{active: boolean, deckWide: boolean, budget: number|null}} state
   * @param {boolean} available - The viewer's Moxfield Price option is on
   * @returns {{text: string, label: string, off: boolean, title: string}}
   */
  function priceView(state, available) {
    if (!available) {
      return {
        text: '📊 Price',
        label: `Price bars: unavailable. ${PRICE_HINT}`,
        off: true,
        title: `${PRICE_HINT} · ${RIGHT_CLICK}`,
      };
    }
    if (!state.active) {
      return {
        text: '📊 Price',
        label: 'Price bars: off',
        off: true,
        title: `Price bars: off · Click: Section % · Alt+P · ${RIGHT_CLICK}`,
      };
    }
    if (!state.deckWide) {
      return {
        text: '📊 Section %',
        label: 'Price bars: Section %',
        off: false,
        title: `Price bars: share of each Section's cost · Click: Deck % · ${RIGHT_CLICK}`,
      };
    }
    if (state.budget !== null) {
      const budget = state.budget.toFixed(0);
      return {
        text: `📊 Budget $${budget}`,
        label: `Price bars: Budget $${budget}`,
        off: false,
        title: `Price bars: share of a $${budget} budget · Click: off · ${RIGHT_CLICK}`,
      };
    }
    return {
      text: '📊 Deck %',
      label: 'Price bars: Deck %',
      off: false,
      title: `Price bars: share of the deck's cost · Click: off · ${RIGHT_CLICK}`,
    };
  }

  /**
   * Draw the badge from current state. Idempotent: writes only what changed,
   * so a second render with nothing new makes no DOM mutations. Removes the
   * badge in goldfish mode or when every feature is off. Does nothing before
   * init() or after cleanup().
   */
  function render() {
    if (!initialized) return;
    const { domHelpers, priceVisualization, deckSettings } = ns();
    if (!domHelpers) return;

    const settings = currentSettings();
    const priceEnabled = Boolean(settings.priceVisualizationEnabled);
    const price = priceVisualization?.getState?.() || {
      active: false,
      deckWide: false,
      budget: null,
    };
    const oddsOn = Boolean(settings.sectionOddsEnabled);
    const curveOn = Boolean(settings.sectionCurveEnabled);
    const visible =
      !domHelpers.isGoldfishMode() &&
      ((priceEnabled && price.active) || oddsOn || curveOn);

    if (!visible) {
      if (root?.isConnected) root.remove();
      return;
    }

    ensureStyles();
    ensureRoot();

    // Price: hidden entirely while the feature is disabled (D4).
    setHidden(segs.price, !priceEnabled);
    if (priceEnabled) {
      const available = domHelpers.isPriceEnabled();
      const view = priceView(price, available);
      setText(segs.price, view.text);
      setTitle(segs.price, view.title);
      setAttr(segs.price, 'aria-label', view.label);
      setClass(segs.price, OFF_CLASS, view.off);
      setAttr(segs.price, 'aria-disabled', available ? null : 'true');
    }

    const { turns, desired } = deckSettings?.get?.() || { turns: 3, desired: 1 };
    setText(segs.odds, `🎲 T${turns} ≥${desired}`);
    setTitle(
      segs.odds,
      oddsOn
        ? `Section odds: at least ${desired} by turn ${turns} · Click: off · Alt+O · ${RIGHT_CLICK}`
        : `Section odds: off · Click: on · Alt+O · ${RIGHT_CLICK}`
    );
    setClass(segs.odds, OFF_CLASS, !oddsOn);
    setAttr(segs.odds, 'aria-pressed', String(oddsOn));

    setText(segs.curve, '📈 Curve');
    setTitle(
      segs.curve,
      curveOn
        ? `Mana curve: on · Click: off · Alt+M · ${RIGHT_CLICK}`
        : `Mana curve: off · Click: on · Alt+M · ${RIGHT_CLICK}`
    );
    setClass(segs.curve, OFF_CLASS, !curveOn);
    setAttr(segs.curve, 'aria-pressed', String(curveOn));

    if (!root.isConnected) document.body.appendChild(root);
  }

  /**
   * Flip a global feature toggle. Updates state.settings at once and redraws,
   * then writes chrome.storage.sync; index.js's onChanged listener merges the
   * same value and re-runs initFeatures, as for the popup. A failed write
   * (e.g. the sync quota) rolls the optimistic value back and redraws.
   * @param {string} key - A storage.DEFAULT_SETTINGS key
   */
  function toggleSetting(key) {
    const { state, storage } = ns();
    const next = !currentSettings()[key];
    if (state?.settings) state.settings[key] = next;
    render();
    Promise.resolve(storage?.setSetting(key, next)).catch((error) => {
      console.warn(LOG_PREFIX, `Couldn't save ${key}`, error);
      const settings = ns().state?.settings;
      // Leave it alone if something has changed it again since.
      if (settings && settings[key] === next) settings[key] = !next;
      render();
    });
  }

  /**
   * Run a segment's action: cycle price bars, or flip odds or curve.
   * @param {HTMLElement} seg - A [data-seg] span
   */
  function activate(seg) {
    const name = seg.dataset.seg;
    if (name === 'price') {
      // cycle() does nothing while Moxfield Price is off: the segment is inert.
      ns().priceVisualization?.cycle?.();
      render();
    } else if (SEG_TOGGLES[name]) {
      toggleSetting(SEG_TOGGLES[name]);
    }
  }

  /**
   * Left-click on a segment runs its action. Never reaches the page.
   * @param {MouseEvent} event
   */
  function onClick(event) {
    event.stopPropagation();
    if (event.button !== 0) return;
    const seg = event.target?.closest?.('[data-seg]');
    if (seg) activate(seg);
  }

  /**
   * Enter or Space on a focused segment acts like a click. Never reaches the
   * page; autorepeats are swallowed.
   * @param {KeyboardEvent} event
   */
  function onSegmentKeydown(event) {
    if (!ACTIVATE_KEYS.has(event.key)) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const seg = event.target?.closest?.('[data-seg]');
    if (!seg) return;
    event.preventDefault(); // Space would scroll the page
    event.stopPropagation();
    if (!event.repeat) activate(seg);
  }

  /**
   * Right-click anywhere on the badge: toggle the settings popover instead of
   * the browser menu.
   * @param {MouseEvent} event
   */
  function onContextMenu(event) {
    event.preventDefault();
    event.stopPropagation();
    ns().settingsPopover?.toggle(root);
  }

  /**
   * Alt+O / Alt+M (no Ctrl, Meta or Shift): flip Section odds / mana curve.
   * Matches event.code. Ignored in editable fields; autorepeats are swallowed.
   * @param {KeyboardEvent} event
   */
  function onKeydown(event) {
    const key = KEY_TOGGLES[event.code];
    if (!key || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }
    if (ns().domHelpers?.isEditableTarget(event.target)) return;

    event.preventDefault();
    event.stopPropagation();
    // A held key autorepeats: flip once, or each repeat is a sync write.
    if (!event.repeat) toggleSetting(key);
  }

  /**
   * Price or deck settings changed: redraw.
   */
  function onChange() {
    render();
  }

  /**
   * Register Alt+O / Alt+M and the deck-settings listener, then draw.
   * Idempotent. Call once per deck page, whatever the feature toggles.
   */
  function init() {
    if (initialized) return;
    initialized = true;
    ns().deckSettings?.events?.addEventListener('change', onChange);
    document.addEventListener('keydown', onKeydown, true);
    render();
  }

  /**
   * Remove the badge, its stylesheet and listeners. Idempotent.
   */
  function cleanup() {
    initialized = false;
    ns().deckSettings?.events?.removeEventListener('change', onChange);
    document.removeEventListener('keydown', onKeydown, true);
    root?.remove();
    root = null;
    segs = null;
    document.getElementById(STYLE_ID)?.remove();
  }

  // Export for use in content scripts
  if (typeof window !== 'undefined') {
    window.MoxfieldExtended = window.MoxfieldExtended || {};
    window.MoxfieldExtended.badge = {
      init,
      cleanup,
      render,
    };
  }
})();
