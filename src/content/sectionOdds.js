/**
 * Section odds for Moxfield Extended
 * The odds chip in each mainboard Section header (spec 2), the per-Section
 * override stepper and the Alt+= / Alt+− shortcuts (spec 5.3).
 * Renders are idempotent: a node is written only when its value changes, so
 * the page observer is not fed by our own output.
 */

(function () {
  'use strict';

  const LOG_PREFIX = '[Moxfield Extended]';
  const STYLE_ID = 'mox-odds-styles';
  const OVERRIDE_CLASS = 'mox-odds--override';
  const COUNT_ERROR = `Couldn't read this Section's card count`;
  const EVALUATE_ERROR = `Couldn't work out the odds for this Section`;

  // A shared slot showing the curve: right-click there edits the Section's odds.
  const SHARED_CURVE = '.mox-cluster[data-layout="shared"][data-shows="curve"]';
  const SHARED_CLUSTER = '.mox-cluster[data-layout="shared"]';
  const SECTION_LIST = 'section.deckview article > ul';
  const HEADER_TITLE =
    ':scope > li:first-child > a.table-deck-row-link > span[title]';
  const EDITABLE =
    'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

  // Alt+<code> → step. Matched on code, not key: macOS Option rewrites key.
  const STEPS = new Map([
    ['Equal', 1],
    ['NumpadAdd', 1],
    ['Minus', -1],
    ['NumpadSubtract', -1],
  ]);

  const CSS = `
.mox-odds {
  font-size: 0.75rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  cursor: context-menu;
}
.mox-odds--override {
  text-decoration: underline dotted;
  text-underline-offset: 2px;
}
.mox-stepper__title {
  font-weight: 600;
}
.mox-stepper__odds {
  margin: 2px 0 6px;
  opacity: 0.8;
}
.mox-stepper__row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.mox-stepper__row button {
  min-width: 24px;
  padding: 0 6px;
  line-height: 1.4;
  color: inherit;
  background: transparent;
  border: 1px solid currentColor;
  border-radius: 4px;
  cursor: pointer;
}
.mox-stepper__row button:disabled {
  opacity: 0.4;
  cursor: default;
}
.mox-stepper__value {
  min-width: 2ch;
  text-align: center;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.mox-stepper__reset {
  display: block;
  margin-top: 6px;
  padding: 0;
  font-size: inherit;
  color: var(--bs-link-color, inherit);
  background: none;
  border: 0;
  text-decoration: underline;
  cursor: pointer;
}
.mox-stepper__reset[hidden] {
  display: none;
}
`;

  let initialized = false;
  let warned = false;
  let hoveredName = null; // the mainboard Section under the pointer, or null
  let stepperHandle = null; // our open stepper's popover handle, or null

  /**
   * The extension namespace, read at call time.
   * @returns {Object}
   */
  function ns() {
    return window.MoxfieldExtended;
  }

  /**
   * Add the chip and stepper stylesheet to the page once.
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
   * Set an element's text only when it differs.
   * @param {Element} el
   * @param {string} text
   */
  function setText(el, text) {
    if (el.textContent !== text) el.textContent = text;
  }

  /**
   * Set an element's title only when it differs.
   * @param {Element} el
   * @param {string} title
   */
  function setTitle(el, title) {
    if (el.getAttribute('title') !== title) el.setAttribute('title', title);
  }

  /**
   * Work out a Section's odds, or why they can't be shown.
   * @param {{name: string, count: number|null}} section
   * @param {{ok: boolean, value?: number, reason?: string}} library
   * @param {string|null} libraryError - From oddsMath.libraryError
   * @param {string} groupBy
   * @param {Object} deckSettings
   * @returns {{label: string, tooltip: string}|{reason: string}}
   */
  function resolve(section, library, libraryError, groupBy, deckSettings) {
    if (!library.ok) return { reason: library.reason };
    if (libraryError) return { reason: libraryError };
    if (section.count == null) return { reason: COUNT_ERROR };

    try {
      const { label, tooltip } = ns().oddsMath.evaluate({
        N: library.value,
        K: section.count,
        turns: deckSettings.get().turns,
        k: deckSettings.desiredFor(groupBy, section.name),
      });
      return { label, tooltip };
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      if (!warned) {
        warned = true;
        console.warn(LOG_PREFIX, 'Could not evaluate Section odds', error);
      }
      return { reason: EVALUATE_ERROR };
    }
  }

  /**
   * Render a Section's odds chip, updating `prevEl` in place when given.
   * @param {{name: string, count: number|null}} section - From getMainboardSections()
   * @param {{library: Object, libraryError: string|null, groupBy: string,
   *   deckSettings: Object}} ctx - Read once per refresh by the caller
   * @param {HTMLElement|null} [prevEl] - A span.mox-odds from an earlier view
   * @returns {HTMLElement} span.mox-odds[data-mox]
   */
  function view(section, ctx, prevEl) {
    ensureStyles();
    let el = prevEl;
    if (!el) {
      el = document.createElement('span');
      el.className = 'mox-odds';
      el.setAttribute('data-mox', '');
    }

    const { library, libraryError, groupBy, deckSettings } = ctx;
    const result = resolve(
      section,
      library,
      libraryError,
      groupBy,
      deckSettings
    );
    const failed = 'reason' in result;
    setText(el, failed ? '?' : result.label);
    setTitle(el, failed ? result.reason : result.tooltip);

    const overridden =
      !failed && deckSettings.isOverridden(groupBy, section.name);
    if (el.classList.contains(OVERRIDE_CLASS) !== overridden) {
      el.classList.toggle(OVERRIDE_CLASS, overridden);
    }
    return el;
  }

  /**
   * The Section name of the header that holds an element.
   * @param {Element} el - Inside a Section header li
   * @returns {string|null}
   */
  function sectionNameOf(el) {
    const ul = el.closest(SECTION_LIST);
    const title = ul?.querySelector(HEADER_TITLE);
    return title ? title.getAttribute('title') : null;
  }

  /**
   * Build the stepper's fixed structure inside the popover.
   * @param {HTMLElement} container - The popover root
   * @param {string} name - Section name
   * @returns {HTMLElement} The .mox-stepper element
   */
  function buildStepper(container, name) {
    const root = document.createElement('div');
    root.className = 'mox-stepper';
    root.innerHTML = `
      <div class="mox-stepper__title"></div>
      <div class="mox-stepper__odds"></div>
      <div class="mox-stepper__row">
        <span>At least</span>
        <button type="button" class="mox-stepper__dec" aria-label="Fewer">−</button>
        <span class="mox-stepper__value"></span>
        <button type="button" class="mox-stepper__inc" aria-label="More">+</button>
      </div>
      <button type="button" class="mox-stepper__reset" hidden></button>`;

    /**
     * Step the Section's desired count, read fresh at click time.
     * @param {number} delta
     */
    function step(delta) {
      const { domHelpers, deckSettings } = ns();
      const groupBy = domHelpers.getGroupBy();
      const next = Math.max(1, deckSettings.desiredFor(groupBy, name) + delta);
      deckSettings.setOverride(groupBy, name, next);
    }

    root
      .querySelector('.mox-stepper__dec')
      .addEventListener('click', () => step(-1));
    root
      .querySelector('.mox-stepper__inc')
      .addEventListener('click', () => step(1));
    root.querySelector('.mox-stepper__reset').addEventListener('click', () => {
      const { domHelpers, deckSettings } = ns();
      deckSettings.setOverride(domHelpers.getGroupBy(), name, null);
    });
    // Keep stepper clicks away from Moxfield's handlers.
    container.addEventListener('click', (event) => event.stopPropagation());
    container.appendChild(root);
    return root;
  }

  /**
   * Fill the stepper from fresh reads of the page and deck settings. Closes
   * the popover when the Section is gone.
   * @param {HTMLElement} container - The popover root
   * @param {{close: function(): void}} handle - The popover handle
   * @param {string} name - Section name
   */
  function renderStepper(container, handle, name) {
    const { domHelpers, oddsMath, deckSettings } = ns();
    const sections = domHelpers.getMainboardSections();
    const section = sections.find((s) => s.name === name);
    if (!section) {
      handle.close();
      return;
    }

    const library = domHelpers.readLibrary();
    const libraryError = library.ok
      ? oddsMath.libraryError(library.value, sections)
      : null;
    const groupBy = domHelpers.getGroupBy();
    const result = resolve(
      section,
      library,
      libraryError,
      groupBy,
      deckSettings
    );
    const desired = deckSettings.desiredFor(groupBy, name);
    const overridden = deckSettings.isOverridden(groupBy, name);
    const { count } = section;
    const cards =
      count == null
        ? 'card count unknown'
        : `${count} ${count === 1 ? 'card' : 'cards'}`;

    const root =
      container.querySelector(':scope > .mox-stepper') ||
      buildStepper(container, name);
    setText(root.querySelector('.mox-stepper__title'), `${name} · ${cards}`);
    setText(
      root.querySelector('.mox-stepper__odds'),
      'reason' in result ? result.reason : result.tooltip
    );
    setText(root.querySelector('.mox-stepper__value'), String(desired));

    const dec = root.querySelector('.mox-stepper__dec');
    if (dec.disabled !== desired <= 1) dec.disabled = desired <= 1;

    const reset = root.querySelector('.mox-stepper__reset');
    setText(reset, `Reset to default (${deckSettings.get().desired})`);
    if (reset.hidden !== !overridden) reset.hidden = !overridden;
  }

  /**
   * Open the override stepper for a Section, anchored to an element.
   * Redraws on deck settings changes until closed.
   * @param {Element} anchorEl - The chip, or a shared slot showing the curve
   * @param {string} sectionName
   * @returns {Object|null} The popover handle, or null when the Section is missing
   */
  function openStepper(anchorEl, sectionName) {
    const { domHelpers, deckSettings, popover } = ns();
    const exists = domHelpers
      .getMainboardSections()
      .some((section) => section.name === sectionName);
    if (!exists) return null;

    ensureStyles();
    let handle = null;
    const onChange = () => handle && handle.update();
    handle = popover.open(
      anchorEl,
      (container, self) => renderStepper(container, self, sectionName),
      {
        onClose: () => {
          deckSettings.events.removeEventListener('change', onChange);
          if (stepperHandle === handle) stepperHandle = null;
        },
      }
    );
    deckSettings.events.addEventListener('change', onChange);
    stepperHandle = handle;
    return handle;
  }

  /**
   * Right-click on a chip, or on a shared slot showing the curve, opens the
   * stepper instead of the browser menu.
   * @param {MouseEvent} event
   */
  function onContextMenu(event) {
    const target = event.target;
    if (!target || !target.closest) return;
    const anchor = target.closest('.mox-odds') || target.closest(SHARED_CURVE);
    if (!anchor) return;
    const name = sectionNameOf(anchor);
    if (name === null) return;

    event.preventDefault();
    event.stopPropagation();
    openStepper(anchor, name);
  }

  /**
   * Left-click on a standalone chip does nothing (spec 5.3). A chip in a
   * shared slot is left to the cluster's own toggle.
   * @param {MouseEvent} event
   */
  function onClick(event) {
    const chip = event.target?.closest?.('.mox-odds');
    if (!chip || chip.closest(SHARED_CLUSTER)) return;
    event.preventDefault();
    event.stopPropagation();
  }

  /**
   * Track the hovered mainboard Section for the Alt+= / Alt+− shortcuts.
   * @param {MouseEvent} event
   */
  function onMouseover(event) {
    const ul = event.target?.closest?.(SECTION_LIST);
    const title = ul?.querySelector(HEADER_TITLE);
    const name = title ? title.getAttribute('title') : null;
    hoveredName =
      name !== null && !ns().domHelpers.SPECIAL_BOARD_TITLES.has(name)
        ? name
        : null;
  }

  /**
   * Whether a key event target accepts typing.
   * @param {EventTarget} target
   * @returns {boolean}
   */
  function isEditable(target) {
    if (!target || !target.closest) return false;
    return (
      Boolean(target.closest(EDITABLE)) || target.isContentEditable === true
    );
  }

  /**
   * Alt+= / Alt+− raise or lower the hovered Section's desired override.
   * @param {KeyboardEvent} event
   */
  function onKeydown(event) {
    if (!event.altKey || event.ctrlKey || event.metaKey) return;
    const delta = STEPS.get(event.code);
    if (!delta || isEditable(event.target) || hoveredName === null) return;
    const { state, domHelpers, deckSettings } = ns();
    if (!state?.settings?.sectionOddsEnabled) return;

    const groupBy = domHelpers.getGroupBy();
    const next = Math.max(
      1,
      deckSettings.desiredFor(groupBy, hoveredName) + delta
    );
    deckSettings.setOverride(groupBy, hoveredName, next);
    event.preventDefault();
    event.stopPropagation();
  }

  const LISTENERS = [
    ['contextmenu', onContextMenu],
    ['click', onClick],
    ['mouseover', onMouseover],
    ['keydown', onKeydown],
  ];

  /**
   * Register the delegated listeners on document (capture phase). Idempotent.
   */
  function init() {
    if (initialized) return;
    initialized = true;
    LISTENERS.forEach(([type, listener]) =>
      document.addEventListener(type, listener, true)
    );
  }

  /**
   * Remove the listeners and stylesheet, and close our stepper if open.
   * Idempotent.
   */
  function cleanup() {
    LISTENERS.forEach(([type, listener]) =>
      document.removeEventListener(type, listener, true)
    );
    initialized = false;
    hoveredName = null;
    if (stepperHandle) stepperHandle.close();
    document.getElementById(STYLE_ID)?.remove();
  }

  // Export for use in content scripts
  window.MoxfieldExtended = window.MoxfieldExtended || {};
  window.MoxfieldExtended.sectionOdds = {
    view,
    init,
    cleanup,
    openStepper,
  };
})();
