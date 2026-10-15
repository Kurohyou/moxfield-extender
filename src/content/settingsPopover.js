/**
 * Settings popover for Moxfield Extended (spec 5.2)
 * Opened by right-clicking the badge. Groups: price bars, Section odds and
 * mana curve. Changes apply live, with no Save or Cancel; the popover
 * primitive closes it on Esc or an outside click.
 *
 * The DOM is built once per open and updated in place on every redraw, so a
 * redraw with nothing new writes nothing and never clobbers typing.
 * Redraws come from deckSettings' change event (price state uses it too) and
 * from badge.render(), which calls render() here after every settings change.
 */

(function () {
  'use strict';

  const STYLE_ID = 'mox-settings-popover-styles';
  const LABEL = 'Moxfield Extended settings';
  const PRICE_HINT = `Turn on Price in Moxfield's view options`;
  const OVERRIDE_HINT = `Per-Section: right-click a Section's %, or hover a Section and press Alt+= / Alt+−`;
  const MINUS = '−';
  // A plain decimal, after a leading $ and thousands commas are stripped.
  // Rejects signs, hex and exponent forms that Number() would accept.
  // Accepts '50', '50.', '50.5' and '.5'.
  const BUDGET_PATTERN = /^(\d+\.?\d*|\.\d+)$/;
  // Controls that can take focus; filtered for hidden and disabled at use.
  const FOCUSABLE = 'input, button, [tabindex="0"]';

  const CSS = `
.mox-settings {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 230px;
  color: inherit;
  font: inherit;
}
.mox-settings__group {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}
.mox-settings__group[hidden],
.mox-settings__hint[hidden] {
  display: none;
}
.mox-settings__group > legend {
  float: none;
  width: auto;
  margin: 0 0 4px;
  padding: 0;
  color: inherit;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  opacity: 0.7;
}
.mox-settings__row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 3px 0;
  color: inherit;
  font-weight: normal;
}
.mox-settings__choice {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin: 0 8px 0 0;
  color: inherit;
  font-weight: normal;
  cursor: pointer;
}
.mox-settings input[type='checkbox'],
.mox-settings input[type='radio'] {
  margin: 0;
  cursor: pointer;
}
.mox-settings__budget {
  width: 7em;
  padding: 1px 6px;
  color: inherit;
  background: transparent;
  border: 1px solid rgba(127, 127, 127, 0.6);
  border-radius: 4px;
  font: inherit;
}
.mox-settings__stepper {
  justify-content: space-between;
}
.mox-settings__step {
  width: 24px;
  height: 22px;
  padding: 0;
  color: inherit;
  background: transparent;
  border: 1px solid rgba(127, 127, 127, 0.6);
  border-radius: 4px;
  font: inherit;
  line-height: 1;
  cursor: pointer;
}
.mox-settings__value {
  min-width: 8.5em;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.mox-settings__name {
  flex: 1;
}
/* Dim once: a disabled group dims its rows, not each control again. */
.mox-settings__group:not(:disabled) :disabled,
.mox-settings__group:disabled > .mox-settings__row,
.mox-settings__step[aria-disabled='true'] {
  opacity: 0.5;
  cursor: default;
}
.mox-settings__group:disabled .mox-settings__choice,
.mox-settings__group:disabled input {
  cursor: default;
}
.mox-settings__hint {
  margin: 2px 0 0;
  font-size: 0.75rem;
  opacity: 0.7;
}
`;

  // The open session: { handle, ui, closed, deckId, focusInside, ...listeners }, or null.
  let session = null;

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
   * Add the stylesheet to the page once.
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
   * Create an element with a class and optional text.
   * @param {string} tag
   * @param {string} [className]
   * @param {string} [text]
   * @returns {HTMLElement}
   */
  function make(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  /**
   * Set a property only when it differs, so an unchanged redraw writes nothing
   * (reflected properties such as hidden and disabled are attribute writes).
   * @param {HTMLElement} el
   * @param {string} name
   * @param {*} value
   */
  function setProp(el, name, value) {
    if (el[name] !== value) el[name] = value;
  }

  /**
   * A checkbox inside its label.
   * @param {string} name - The input's name
   * @param {string} text - The visible label, also its accessible name
   * @returns {{label: HTMLLabelElement, input: HTMLInputElement}}
   */
  function checkbox(name, text) {
    const label = make('label', 'mox-settings__row mox-settings__choice');
    const input = make('input');
    input.type = 'checkbox';
    input.name = name;
    label.append(input, text);
    return { label, input };
  }

  /**
   * A radio button inside its label.
   * @param {string} name
   * @param {string} value
   * @param {string} text
   * @returns {{label: HTMLLabelElement, input: HTMLInputElement}}
   */
  function radio(name, value, text) {
    const label = make('label', 'mox-settings__choice');
    const input = make('input');
    input.type = 'radio';
    input.name = name;
    input.value = value;
    label.append(input, text);
    return { label, input };
  }

  /**
   * A − value + stepper row.
   * @param {string} key - 'turns' or 'desired'; names the buttons and value
   * @param {string} name - Visible name, also the group's accessible name
   * @param {string} lower - Accessible name of the − button
   * @param {string} higher - Accessible name of the + button
   * @returns {{row: HTMLElement, down: HTMLButtonElement, up: HTMLButtonElement, value: HTMLElement}}
   */
  function stepper(key, name, lower, higher) {
    const row = make('div', 'mox-settings__row mox-settings__stepper');
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', name);
    const title = make('span', 'mox-settings__name', name);
    const down = make('button', 'mox-settings__step', MINUS);
    down.type = 'button';
    down.dataset.step = `${key}-down`;
    down.setAttribute('aria-label', lower);
    // aria-live is added after the first loaded render (see open()), so the
    // jump from defaults to this deck's values is not announced.
    const value = make('span', 'mox-settings__value');
    value.dataset.value = key;
    const up = make('button', 'mox-settings__step', '+');
    up.type = 'button';
    up.dataset.step = `${key}-up`;
    up.setAttribute('aria-label', higher);
    row.append(title, down, value, up);
    return { row, down, up, value };
  }

  /**
   * A fieldset group with its legend.
   * @param {string} name - data-group value
   * @param {string} legend
   * @returns {HTMLFieldSetElement}
   */
  function group(name, legend) {
    const fieldset = make('fieldset', 'mox-settings__group');
    fieldset.dataset.group = name;
    fieldset.appendChild(make('legend', '', legend));
    return fieldset;
  }

  /**
   * Build the popover body once and wire its events.
   * @param {Object} s - The session
   * @param {HTMLElement} container - The popover element
   * @returns {Object} References to the controls
   */
  function build(s, container) {
    const root = make('div', 'mox-settings');

    const price = group('price', 'Price bars');
    const priceActive = checkbox('priceActive', 'Show price bars');
    const shareRow = make('div', 'mox-settings__row');
    shareRow.setAttribute('role', 'radiogroup');
    shareRow.setAttribute('aria-label', 'Share of');
    const shareSection = radio('priceShare', 'section', 'Section %');
    const shareDeck = radio('priceShare', 'deck', 'Deck %');
    shareRow.append(shareSection.label, shareDeck.label);
    const budgetLabel = make('label', 'mox-settings__row');
    const budgetName = make('span', 'mox-settings__name', 'Budget $');
    const budget = make('input', 'mox-settings__budget');
    budget.type = 'text';
    budget.name = 'budget';
    budget.inputMode = 'decimal';
    budget.autocomplete = 'off';
    budget.placeholder = 'deck cost';
    budget.title = 'Deck % of this budget. Empty: the deck cost.';
    budgetLabel.append(budgetName, budget);
    const priceHint = make('p', 'mox-settings__hint', PRICE_HINT);
    priceHint.dataset.hint = 'price';
    price.append(priceActive.label, shareRow, budgetLabel, priceHint);

    const odds = group('odds', 'Section odds');
    const oddsEnabled = checkbox('oddsEnabled', 'Show Section odds');
    const turns = stepper(
      'turns',
      'By turn',
      'One turn earlier',
      'One turn later'
    );
    const desired = stepper(
      'desired',
      'At least (default)',
      'One fewer card',
      'One more card'
    );
    odds.append(oddsEnabled.label, turns.row, desired.row);

    const curve = group('curve', 'Mana curve');
    const curveEnabled = checkbox('curveEnabled', 'Show mana curve');
    curve.append(curveEnabled.label);

    const hint = make('p', 'mox-settings__hint', OVERRIDE_HINT);
    root.append(price, odds, curve, hint);
    container.appendChild(root);

    const ui = {
      root,
      price,
      priceActive: priceActive.input,
      shareSection: shareSection.input,
      shareDeck: shareDeck.input,
      budget,
      priceHint,
      oddsEnabled: oddsEnabled.input,
      turns,
      desired,
      curveEnabled: curveEnabled.input,
    };

    // On the popover element, so clicks on its padding stay in too.
    container.addEventListener('click', (event) => onClick(s, event));
    root.addEventListener('change', (event) => onChange(s, event));
    budget.addEventListener('keydown', (event) => onBudgetKeydown(s, event));
    budget.addEventListener('blur', () => commitBudget(s));
    // Whether focus is in the popover, for returning it on close. Focus
    // leaving to nowhere (relatedTarget null) keeps the flag: Chrome blurs a
    // focused element as the popover is removed, which is not the user
    // moving focus away.
    container.addEventListener('focusin', () => {
      s.focusInside = true;
    });
    container.addEventListener('focusout', (event) => {
      const to = event.relatedTarget;
      if (to && !container.contains(to)) s.focusInside = false;
    });
    return ui;
  }

  /**
   * Format a budget for the field: '' when unset.
   * @param {number|null} budget
   * @returns {string}
   */
  function formatBudget(budget) {
    return budget === null || budget === undefined ? '' : String(budget);
  }

  /**
   * Parse the budget field. Strips spaces, a leading $ and thousands commas.
   * @param {string} text
   * @returns {{clear: true}|{value: number}|null} null when invalid
   */
  function parseBudget(text) {
    const cleaned = text.trim().replace(/^\$/, '').replace(/,/g, '').trim();
    if (cleaned === '') return { clear: true };
    if (!BUDGET_PATTERN.test(cleaned)) return null;
    const value = Number(cleaned);
    return value > 0 ? { value } : null;
  }

  /**
   * The current price-bar state, or a default when the module is missing.
   * @returns {{active: boolean, deckWide: boolean, budget: number|null}}
   */
  function priceState() {
    return (
      ns().priceVisualization?.getState?.() || {
        active: false,
        deckWide: false,
        budget: null,
      }
    );
  }

  /**
   * Commit the budget field: a valid number sets it, empty clears it, and
   * anything else is dropped. The field then shows the stored value, even
   * while focused (normalised, or reverted). Skipped once the popover has
   * closed, and when the page has moved to another deck since it opened:
   * the budget is stored per deck, under the current URL's deck.
   * @param {Object} s - The session
   */
  function commitBudget(s) {
    if (s.closed || !s.ui) return;
    const input = s.ui.budget;
    if (input.disabled) return;
    if (ns().domHelpers?.getDeckId?.() !== s.deckId) return;
    const parsed = parseBudget(input.value);
    const price = ns().priceVisualization;
    if (parsed?.clear) price?.setBudgetGoal?.(null);
    else if (parsed) price?.setBudgetGoal?.(parsed.value);
    setProp(input, 'value', formatBudget(priceState().budget));
    redraw(s);
  }

  /**
   * Enter commits the budget. Keys typed here never reach Moxfield.
   * @param {Object} s - The session
   * @param {KeyboardEvent} event
   */
  function onBudgetKeydown(s, event) {
    event.stopPropagation();
    if (event.key !== 'Enter') return;
    event.preventDefault();
    commitBudget(s);
  }

  /**
   * Stepper buttons; every click stays inside the popover. A button at its
   * limit is aria-disabled rather than disabled, so it keeps focus; its
   * clicks are ignored here.
   * @param {Object} s - The session
   * @param {MouseEvent} event
   */
  function onClick(s, event) {
    event.stopPropagation();
    const button = event.target?.closest?.('[data-step]');
    if (!button || button.getAttribute('aria-disabled') === 'true') return;
    const { deckSettings } = ns();
    const current = deckSettings?.get?.();
    if (!current) return;
    const delta = button.dataset.step.endsWith('-up') ? 1 : -1;
    if (button.dataset.step.startsWith('turns')) {
      deckSettings.setTurns(current.turns + delta);
    } else {
      deckSettings.setDesired(current.desired + delta);
    }
    redraw(s);
  }

  /**
   * Checkbox and radio changes. Redraws afterwards, because a setter that is
   * gated or unchanged does not notify, and the browser has already flipped
   * the control.
   * @param {Object} s - The session
   * @param {Event} event
   */
  function onChange(s, event) {
    const { priceVisualization: price, badge } = ns();
    const input = event.target;
    switch (input.name) {
      case 'priceActive':
        price?.setActive?.(input.checked);
        break;
      case 'priceShare':
        price?.setDeckWide?.(input.value === 'deck');
        break;
      case 'oddsEnabled':
        badge?.setFeature?.('sectionOddsEnabled', input.checked);
        break;
      case 'curveEnabled':
        badge?.setFeature?.('sectionCurveEnabled', input.checked);
        break;
      default:
        return;
    }
    redraw(s);
  }

  /**
   * Bring every control in line with current state. Idempotent: writes only
   * what changed. Never writes the budget field while it has focus.
   * @param {Object} ui
   */
  function update(ui) {
    const { domHelpers, deckSettings } = ns();
    const settings = currentSettings();

    const priceEnabled = Boolean(settings.priceVisualizationEnabled);
    setProp(ui.price, 'hidden', !priceEnabled);
    if (priceEnabled) {
      const available = Boolean(domHelpers?.isPriceEnabled?.());
      const state = priceState();
      setProp(ui.price, 'disabled', !available);
      setProp(ui.priceHint, 'hidden', available);
      setProp(ui.priceActive, 'checked', state.active);
      setProp(ui.shareSection, 'checked', !state.deckWide);
      setProp(ui.shareDeck, 'checked', state.deckWide);
      setProp(ui.budget, 'disabled', !state.deckWide);
      if (document.activeElement !== ui.budget) {
        setProp(ui.budget, 'value', formatBudget(state.budget));
      }
    }

    setProp(ui.oddsEnabled, 'checked', Boolean(settings.sectionOddsEnabled));
    setProp(ui.curveEnabled, 'checked', Boolean(settings.sectionCurveEnabled));

    const { turns, desired } = deckSettings?.get?.() || {
      turns: 3,
      desired: 1,
    };
    // Cards seen by turn T: the opening hand plus T (spec 2.5).
    // The fallback only guards a missing oddsMath; it is the same 7.
    const seen = (ns().oddsMath?.OPENING_HAND ?? 7) + turns;
    const library = domHelpers?.readLibrary?.();
    // No maximum when the Library is unreadable; a stored T above it shows as-is.
    const atMax = Boolean(library?.ok) && seen >= library.value;
    setProp(ui.turns.value, 'textContent', `T${turns} · ${seen} cards seen`);
    setInert(ui.turns.down, turns <= 0);
    setInert(ui.turns.up, atMax);

    setProp(ui.desired.value, 'textContent', `≥${desired}`);
    setInert(ui.desired.down, desired <= 1);
  }

  /**
   * Mark a stepper button as at its limit (or not), only when it differs.
   * @param {HTMLButtonElement} button
   * @param {boolean} inert
   */
  function setInert(button, inert) {
    if ((button.getAttribute('aria-disabled') === 'true') === inert) return;
    if (inert) button.setAttribute('aria-disabled', 'true');
    else button.removeAttribute('aria-disabled');
  }

  /**
   * Turn on the value live regions, once. Called after the first render with
   * this deck's settings, so that initial jump is not announced.
   * @param {Object} ui
   */
  function enableLiveRegions(ui) {
    [ui.turns.value, ui.desired.value].forEach((value) => {
      if (value.getAttribute('aria-live') !== 'polite') {
        value.setAttribute('aria-live', 'polite');
      }
    });
  }

  /**
   * Whether a control can take focus now: not disabled, not aria-disabled,
   * and not inside anything hidden.
   * @param {HTMLElement} el
   * @returns {boolean}
   */
  function canFocus(el) {
    return (
      !el.matches(':disabled') &&
      el.getAttribute('aria-disabled') !== 'true' &&
      !el.closest('[hidden]')
    );
  }

  /**
   * Focus the first control that can take focus.
   * @param {HTMLElement} root
   */
  function focusFirst(root) {
    const first = [...root.querySelectorAll(FOCUSABLE)].find(canFocus);
    first?.focus({ preventScroll: true });
  }

  /**
   * Where focus goes back to on close: the badge segment it came from (the
   * menu key on a focused segment opens the popover), else the anchor if it
   * is focusable, else its first focusable control.
   * @param {Element} anchorEl
   * @param {Element|null} from - document.activeElement when opened
   * @returns {HTMLElement|null}
   */
  function returnTarget(anchorEl, from) {
    if (from && anchorEl.contains(from) && from.tabIndex >= 0) return from;
    if (anchorEl.tabIndex >= 0) return anchorEl;
    return (
      [...anchorEl.querySelectorAll(FOCUSABLE)].find(
        (el) => el.tabIndex >= 0 && canFocus(el)
      ) || null
    );
  }

  /**
   * Redraw the open session through the primitive (render, then position).
   * @param {Object} s - The session
   */
  function redraw(s) {
    if (!s.closed && s.handle) s.handle.update();
  }

  /**
   * Remove the session's listeners. Runs once, from the primitive's onClose,
   * which covers Esc, an outside click, the anchor leaving and another popover
   * opening. If focus was in the popover and has not gone anywhere else,
   * it goes back to the badge; if the badge has gone, it is left alone.
   * @param {Object} s - The session
   * @param {Element} anchorEl
   */
  function teardown(s, anchorEl) {
    s.closed = true;
    if (session === s) session = null;
    ns().deckSettings?.events?.removeEventListener('change', s.onDeckChange);
    window.removeEventListener('keydown', s.onWindowKeydown, true);
    window.removeEventListener('mousedown', s.onWindowMousedown, true);

    const active = document.activeElement;
    const focusLost =
      !active || active === document.body || !active.isConnected;
    if (s.focusInside && focusLost && anchorEl.isConnected) {
      returnTarget(anchorEl, s.openedFrom)?.focus({ preventScroll: true });
    }
  }

  /**
   * Open the popover below an anchor (the badge). Renders at once with what is
   * known, then again once this deck's settings have loaded.
   * @param {Element} anchorEl
   */
  function open(anchorEl) {
    const { popover, deckSettings, domHelpers } = ns();
    if (!popover || !anchorEl) return;
    ensureStyles();

    const s = {
      handle: null,
      ui: null,
      closed: false,
      focusInside: false,
      // The budget is stored per deck: commit only to the deck it opened on.
      deckId: domHelpers?.getDeckId?.() ?? null,
      openedFrom: document.activeElement,
    };
    s.onDeckChange = () => redraw(s);
    // Esc discards a budget edit. Window capture runs before the primitive's
    // document-capture Esc handler, which removes the popover; Chrome blurs
    // the focused field as it goes. Reverting the field first makes that
    // blur commit the stored value, a no-op.
    s.onWindowKeydown = (event) => {
      if (event.key !== 'Escape' || !s.ui) return;
      if (document.activeElement === s.ui.budget) {
        setProp(s.ui.budget, 'value', formatBudget(priceState().budget));
      }
    };
    // A mousedown outside the popover: focus belongs where the user clicked,
    // so a mouse close never pulls it back to the badge (that is only for
    // keyboard and programmatic closes). It also closes the popover before
    // the budget field would blur, and jsdom and Firefox fire no blur on
    // removal: commit first.
    s.onWindowMousedown = (event) => {
      if (!s.ui || s.handle?.el.contains(event.target)) return;
      s.focusInside = false;
      if (document.activeElement === s.ui.budget) commitBudget(s);
    };

    s.handle = popover.open(
      anchorEl,
      (container) => {
        if (!s.ui) s.ui = build(s, container);
        update(s.ui);
      },
      { label: LABEL, onClose: () => teardown(s, anchorEl) }
    );
    session = s;

    deckSettings?.events?.addEventListener('change', s.onDeckChange);
    window.addEventListener('keydown', s.onWindowKeydown, true);
    window.addEventListener('mousedown', s.onWindowMousedown, true);
    if (s.ui) focusFirst(s.ui.root);

    Promise.resolve(deckSettings?.ensureLoaded?.(s.deckId)).then(() => {
      redraw(s);
      if (!s.closed && s.ui) enableLiveRegions(s.ui);
    });
  }

  /**
   * Whether the settings popover is open.
   * @returns {boolean}
   */
  function isOpen() {
    return session !== null;
  }

  /**
   * Close the settings popover, if open.
   */
  function close() {
    session?.handle?.close();
  }

  /**
   * Close it if open, else open it below the anchor.
   * @param {Element} anchorEl
   */
  function toggle(anchorEl) {
    if (isOpen()) close();
    else open(anchorEl);
  }

  /**
   * Redraw if open. badge.render() calls this after every settings change.
   */
  function render() {
    if (session) redraw(session);
  }

  // Export for use in content scripts
  window.MoxfieldExtended = window.MoxfieldExtended || {};
  window.MoxfieldExtended.settingsPopover = {
    open,
    close,
    isOpen,
    toggle,
    render,
  };
})();
