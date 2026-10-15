import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDeck } from './fixtures/deckDom.js';

let settingsPopover;
let popover;
let badge;
let price;
let deckSettings;
let storage;

const ALT_O = { altKey: true, code: 'KeyO', key: 'o' };
const OVERRIDE_HINT =
  "Per-Section: right-click a Section's %, or hover a Section and press Alt+= / Alt+−";
const PRICE_HINT = "Turn on Price in Moxfield's view options";

/**
 * Build a deck with two multi-row Sections and no Commander, so the Library
 * is the footer count. Rows show a "$x.xx" price (Moxfield Price on) unless
 * `priced` is false.
 * @param {Object} [options]
 * @param {number|null} [options.library] - Footer count; null for no footer
 * @param {boolean} [options.priced]
 */
function build({ library = 20, priced = true } = {}) {
  buildDeck({
    footerCount: library,
    sections: [
      { title: 'Creatures', rows: [{ qty: 1 }, { qty: 2 }] },
      { title: 'Lands', rows: [{ qty: 3 }, { qty: 3 }] },
    ],
  });
  if (!priced) return;
  document
    .querySelectorAll('li[data-testid="deck-view-table-row"]')
    .forEach((row, i) => {
      const cell = document.createElement('div');
      cell.textContent = `$${(i + 1).toFixed(2)}`;
      row.appendChild(cell);
    });
}

/**
 * Set the global feature toggles in state.settings, as index.js holds them.
 * @param {Object} values
 */
function settings(values) {
  Object.assign(window.MoxfieldExtended.state.settings, values);
}

/**
 * Let chrome-stub callbacks and ensureLoaded (microtasks) settle.
 */
async function settle() {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

/**
 * The badge root.
 * @returns {HTMLElement}
 */
function badgeRoot() {
  return document.querySelector('.mox-badge');
}

/**
 * Open the settings popover on the badge and let the deck load settle.
 */
async function openPopover() {
  settingsPopover.open(badgeRoot());
  await settle();
}

/**
 * The popover element (the primitive's dialog), or null.
 * @returns {HTMLElement|null}
 */
function dialog() {
  return document.querySelector('.mox-popover');
}

/**
 * An element inside the settings popover.
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
function q(selector) {
  return dialog()?.querySelector(selector) ?? null;
}

/**
 * Click an element the way a user does: a bubbling, cancelable click.
 * Checkbox and radio inputs flip and fire change, as in a browser.
 * @param {HTMLElement} el
 */
function click(el) {
  el.click();
}

/**
 * Dispatch a cancelable keydown and return it.
 * @param {Element} target
 * @param {Object} init
 * @returns {KeyboardEvent}
 */
function key(target, init) {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

/**
 * Dispatch a bubbling, cancelable mouse event.
 * @param {Element} target
 * @param {string} type
 * @returns {MouseEvent}
 */
function mouse(target, type) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: type === 'contextmenu' ? 2 : 0,
  });
  target.dispatchEvent(event);
  return event;
}

/**
 * Focus the budget input and type a value into it (no commit).
 * @param {string} text
 * @returns {HTMLInputElement}
 */
function typeBudget(text) {
  const input = q('input[name="budget"]');
  input.focus();
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return input;
}

/**
 * Read sync keys from the chrome stub.
 * @param {string[]} keys
 * @returns {Promise<Object>}
 */
function synced(keys) {
  return chrome.storage.sync.get(keys);
}

/**
 * Collect every mutation record under `node` while `fn` runs.
 * @param {Node} node
 * @param {function(): void} fn
 * @returns {Promise<MutationRecord[]>}
 */
async function recordMutations(node, fn) {
  const records = [];
  const observer = new MutationObserver((batch) => records.push(...batch));
  observer.observe(node, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });
  fn();
  await Promise.resolve();
  records.push(...observer.takeRecords());
  observer.disconnect();
  return records;
}

beforeEach(async () => {
  vi.resetModules();
  document.head.innerHTML = '';
  localStorage.clear();
  window.history.pushState({}, '', '/decks/abc');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  // jsdom has no layout. Give every element a visible box, or the popover
  // treats the badge as hidden and closes on update().
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    top: 700,
    bottom: 730,
    left: 800,
    right: 1000,
    width: 200,
    height: 30,
    x: 800,
    y: 700,
  });

  await import('../src/utils/storage.js');
  await import('../src/content/domHelpers.js');
  await import('../src/content/deckSettings.js');
  await import('../src/content/popover.js');
  await import('../src/content/priceVisualization.js');
  await import('../src/content/settingsPopover.js');
  await import('../src/content/badge.js');
  ({
    settingsPopover,
    popover,
    badge,
    priceVisualization: price,
    deckSettings,
    storage,
  } = window.MoxfieldExtended);

  build();
  window.MoxfieldExtended.state = {
    settings: { ...storage.DEFAULT_SETTINGS },
  };
  await deckSettings.ensureLoaded('abc');
  price.init();
  await settle();
  badge.init();
});

afterEach(async () => {
  settingsPopover.close();
  popover.close();
  badge.cleanup();
  price.cleanup();
  await deckSettings.flush();
  vi.restoreAllMocks();
});

describe('opening and closing', () => {
  it('toggle opens a labelled dialog and closes it again', async () => {
    settingsPopover.toggle(badgeRoot());
    expect(settingsPopover.isOpen()).toBe(true);
    expect(dialog().getAttribute('role')).toBe('dialog');
    expect(dialog().getAttribute('aria-label')).toBe(
      'Moxfield Extended settings'
    );
    expect(q('.mox-settings')).not.toBeNull();
    settingsPopover.toggle(badgeRoot());
    expect(settingsPopover.isOpen()).toBe(false);
    expect(dialog()).toBeNull();
  });

  it('right-clicking the badge opens it, and again closes it', () => {
    mouse(badgeRoot(), 'contextmenu');
    expect(settingsPopover.isOpen()).toBe(true);
    mouse(badgeRoot(), 'contextmenu');
    expect(settingsPopover.isOpen()).toBe(false);
  });

  it('closes on Esc and on an outside mousedown', async () => {
    await openPopover();
    key(document.body, { key: 'Escape' });
    expect(settingsPopover.isOpen()).toBe(false);
    await openPopover();
    mouse(document.body, 'mousedown');
    expect(settingsPopover.isOpen()).toBe(false);
  });

  it('is not open once another popover replaces it', async () => {
    await openPopover();
    const other = document.createElement('span');
    document.body.appendChild(other);
    popover.open(other, () => {});
    expect(settingsPopover.isOpen()).toBe(false);
    expect(q('.mox-settings')).toBeNull();
  });

  it('adds one scoped stylesheet marked data-mox', async () => {
    await openPopover();
    settingsPopover.close();
    await openPopover();
    const styles = document.querySelectorAll(
      'style#mox-settings-popover-styles'
    );
    expect(styles).toHaveLength(1);
    expect(styles[0].hasAttribute('data-mox')).toBe(true);
    expect(styles[0].textContent).toContain('.mox-settings');
    expect(styles[0].textContent).not.toContain('--bs-link-color');
  });

  it('keeps clicks inside from reaching the page', async () => {
    await openPopover();
    const spy = vi.fn();
    document.body.addEventListener('click', spy);
    click(q('input[name="oddsEnabled"]'));
    click(q('[data-step="turns-up"]'));
    click(q('.mox-settings'));
    document.body.removeEventListener('click', spy);
    expect(spy).not.toHaveBeenCalled();
  });

  it('renders at once, then shows the deck settings once they load', async () => {
    await chrome.storage.local.set({ 'deck:xyz': { turns: 5, desired: 2 } });
    window.history.pushState({}, '', '/decks/xyz');
    settingsPopover.open(badgeRoot());
    expect(q('[data-value="turns"]').textContent).toBe('T3 · 10 cards seen');
    await settle();
    expect(q('[data-value="turns"]').textContent).toBe('T5 · 12 cards seen');
    expect(q('[data-value="desired"]').textContent).toBe('≥2');
  });

  it('shows the per-Section hint and no per-Section list', async () => {
    await openPopover();
    expect(q('.mox-settings').textContent).toContain(OVERRIDE_HINT);
    expect(q('.mox-settings').textContent).not.toContain('Creatures');
  });

  it('gives every control an accessible name', async () => {
    await openPopover();
    q('.mox-settings')
      .querySelectorAll('button, input')
      .forEach((control) => {
        const named =
          Boolean(control.getAttribute('aria-label')) ||
          Boolean(control.closest('label')?.textContent.trim());
        expect(named, control.outerHTML).toBe(true);
      });
  });
});

describe('price bars group', () => {
  it('is hidden when price visualization is disabled', async () => {
    settings({ priceVisualizationEnabled: false });
    await openPopover();
    expect(q('[data-group="price"]').hidden).toBe(true);
    settings({ priceVisualizationEnabled: true });
    badge.render();
    expect(q('[data-group="price"]').hidden).toBe(false);
  });

  it('the on/off checkbox turns the bars on and off', async () => {
    await openPopover();
    const on = q('input[name="priceActive"]');
    expect(on.checked).toBe(false);
    click(on);
    expect(price.getState().active).toBe(true);
    expect(on.checked).toBe(true);
    click(on);
    expect(price.getState().active).toBe(false);
    expect(on.checked).toBe(false);
  });

  it('the Section / Deck choice sets the share', async () => {
    await openPopover();
    const section = q('input[name="priceShare"][value="section"]');
    const deck = q('input[name="priceShare"][value="deck"]');
    expect(section.checked).toBe(true);
    click(deck);
    expect(price.getState().deckWide).toBe(true);
    click(section);
    expect(price.getState().deckWide).toBe(false);
    expect(section.checked).toBe(true);
    expect(deck.checked).toBe(false);
  });

  it('follows price changes made elsewhere (Alt+P, the badge)', async () => {
    await openPopover();
    price.setActive(true);
    price.setDeckWide(true);
    expect(q('input[name="priceActive"]').checked).toBe(true);
    expect(q('input[name="priceShare"][value="deck"]').checked).toBe(true);
  });

  it('is disabled with a hint when Moxfield Price is off', async () => {
    build({ priced: false });
    badge.render();
    await openPopover();
    const group = q('[data-group="price"]');
    expect(group.disabled).toBe(true);
    group.querySelectorAll('input').forEach((input) => {
      expect(input.matches(':disabled')).toBe(true);
    });
    const hint = q('[data-hint="price"]');
    expect(hint.hidden).toBe(false);
    expect(hint.textContent).toBe(PRICE_HINT);
  });

  it('is enabled without the hint while Moxfield Price is on', async () => {
    await openPopover();
    expect(q('[data-group="price"]').disabled).toBe(false);
    expect(q('[data-hint="price"]').hidden).toBe(true);
  });
});

describe('budget', () => {
  it('is disabled outside Deck mode and enabled in Deck mode', async () => {
    await openPopover();
    const input = q('input[name="budget"]');
    expect(input.disabled).toBe(true);
    click(q('input[name="priceShare"][value="deck"]'));
    expect(input.disabled).toBe(false);
    click(q('input[name="priceShare"][value="section"]'));
    expect(input.disabled).toBe(true);
  });

  it('is a text field, so invalid text reaches the parser', async () => {
    await openPopover();
    expect(q('input[name="budget"]').type).toBe('text');
  });

  describe('in Deck mode', () => {
    beforeEach(async () => {
      price.setDeckWide(true);
      await openPopover();
    });

    it('commits a valid value on Enter', () => {
      const input = typeBudget('50');
      const event = key(input, { key: 'Enter' });
      expect(event.defaultPrevented).toBe(true);
      expect(price.getState().budget).toBe(50);
      expect(localStorage.getItem('mox-budget-abc')).toBe('50');
    });

    it('commits a valid value on blur', () => {
      const input = typeBudget('75.5');
      input.blur();
      expect(price.getState().budget).toBe(75.5);
      expect(localStorage.getItem('mox-budget-abc')).toBe('75.5');
    });

    it('accepts a leading $ and normalises the field', () => {
      const input = typeBudget(' $120 ');
      key(input, { key: 'Enter' });
      expect(price.getState().budget).toBe(120);
      expect(input.value).toBe('120');
    });

    it('clears the budget when emptied', () => {
      price.setBudgetGoal(40);
      const input = typeBudget('');
      key(input, { key: 'Enter' });
      expect(price.getState().budget).toBeNull();
      expect(localStorage.getItem('mox-budget-abc')).toBeNull();
    });

    it.each(['abc', '0', '-5', 'NaN', '12abc', 'Infinity'])(
      'reverts invalid input %j to the stored value',
      (text) => {
        price.setBudgetGoal(40);
        const input = typeBudget(text);
        key(input, { key: 'Enter' });
        expect(price.getState().budget).toBe(40);
        expect(input.value).toBe('40');
        expect(localStorage.getItem('mox-budget-abc')).toBe('40');
      }
    );

    it('reverts invalid input on blur too', () => {
      const input = typeBudget('nope');
      input.blur();
      expect(price.getState().budget).toBeNull();
      expect(input.value).toBe('');
    });

    it('shows the current budget while not focused', () => {
      price.setBudgetGoal(60);
      expect(q('input[name="budget"]').value).toBe('60');
      price.setBudgetGoal(null);
      expect(q('input[name="budget"]').value).toBe('');
    });

    it('does not overwrite the field while it has focus', () => {
      const input = typeBudget('12');
      price.setBudgetGoal(99); // redraws through the change event
      settingsPopover.render();
      expect(input.value).toBe('12');
    });

    it('Esc closes without committing, even if the browser then blurs', () => {
      const input = typeBudget('33');
      key(input, { key: 'Escape' });
      expect(settingsPopover.isOpen()).toBe(false);
      // Chrome fires blur on a focused element as it is removed.
      input.dispatchEvent(new FocusEvent('blur'));
      expect(price.getState().budget).toBeNull();
      expect(localStorage.getItem('mox-budget-abc')).toBeNull();
    });

    it('an outside click commits, then closes', () => {
      typeBudget('33');
      mouse(document.body, 'mousedown');
      expect(settingsPopover.isOpen()).toBe(false);
      expect(price.getState().budget).toBe(33);
    });

    it('keys typed in it do not trigger Alt+O or reach the page', () => {
      const input = typeBudget('1');
      const spy = vi.fn();
      document.body.addEventListener('keydown', spy);
      const event = key(input, ALT_O);
      key(input, { key: '2' });
      document.body.removeEventListener('keydown', spy);
      expect(event.defaultPrevented).toBe(false);
      expect(window.MoxfieldExtended.state.settings.sectionOddsEnabled).toBe(
        true
      );
      expect(spy).not.toHaveBeenCalled();
    });
  });
});

describe('Section odds group', () => {
  it('the on/off checkbox writes sectionOddsEnabled through the badge', async () => {
    await openPopover();
    const on = q('input[name="oddsEnabled"]');
    expect(on.checked).toBe(true);
    click(on);
    expect(window.MoxfieldExtended.state.settings.sectionOddsEnabled).toBe(
      false
    );
    expect(
      badgeRoot()
        .querySelector('[data-seg="odds"]')
        .classList.contains('mox-badge__seg--off')
    ).toBe(true);
    expect((await synced(['sectionOddsEnabled'])).sectionOddsEnabled).toBe(
      false
    );
    expect(on.checked).toBe(false);
  });

  it('rolls the checkbox back when the write fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await openPopover();
    const on = q('input[name="oddsEnabled"]');
    chrome.storage.sync.__failNextWrite();
    click(on);
    expect(on.checked).toBe(false);
    await settle();
    expect(window.MoxfieldExtended.state.settings.sectionOddsEnabled).toBe(
      true
    );
    expect(on.checked).toBe(true);
    expect(await synced(['sectionOddsEnabled'])).toEqual({});
  });

  describe('By turn', () => {
    it('shows T and the cards seen (7 + T)', async () => {
      await openPopover();
      expect(q('[data-value="turns"]').textContent).toBe('T3 · 10 cards seen');
    });

    it('+ and − step By turn', async () => {
      await openPopover();
      click(q('[data-step="turns-up"]'));
      expect(deckSettings.get().turns).toBe(4);
      expect(q('[data-value="turns"]').textContent).toBe('T4 · 11 cards seen');
      click(q('[data-step="turns-down"]'));
      click(q('[data-step="turns-down"]'));
      expect(deckSettings.get().turns).toBe(2);
    });

    it('− is disabled at 0', async () => {
      deckSettings.setTurns(1);
      await openPopover();
      expect(q('[data-step="turns-down"]').disabled).toBe(false);
      click(q('[data-step="turns-down"]'));
      expect(deckSettings.get().turns).toBe(0);
      expect(q('[data-step="turns-down"]').disabled).toBe(true);
      expect(q('[data-value="turns"]').textContent).toBe('T0 · 7 cards seen');
    });

    it('+ is disabled once 7 + T reaches the Library', async () => {
      build({ library: 10 });
      badge.render();
      await openPopover();
      expect(q('[data-step="turns-up"]').disabled).toBe(true);
      click(q('[data-step="turns-down"]'));
      expect(q('[data-step="turns-up"]').disabled).toBe(false);
    });

    it('+ has no maximum when the Library is unreadable', async () => {
      build({ library: null });
      badge.render();
      deckSettings.setTurns(40);
      await openPopover();
      expect(q('[data-step="turns-up"]').disabled).toBe(false);
    });

    it('shows a stored T above the maximum as-is', async () => {
      deckSettings.setTurns(15);
      await openPopover();
      expect(q('[data-value="turns"]').textContent).toBe('T15 · 22 cards seen');
      expect(q('[data-step="turns-up"]').disabled).toBe(true);
      expect(deckSettings.get().turns).toBe(15);
    });
  });

  describe('At least', () => {
    it('shows the default desired; − is disabled at 1', async () => {
      await openPopover();
      expect(q('[data-value="desired"]').textContent).toBe('≥1');
      expect(q('[data-step="desired-down"]').disabled).toBe(true);
    });

    it('+ increments and − comes back down to 1', async () => {
      await openPopover();
      click(q('[data-step="desired-up"]'));
      expect(deckSettings.get().desired).toBe(2);
      expect(q('[data-value="desired"]').textContent).toBe('≥2');
      expect(q('[data-step="desired-down"]').disabled).toBe(false);
      click(q('[data-step="desired-down"]'));
      expect(deckSettings.get().desired).toBe(1);
      expect(q('[data-step="desired-down"]').disabled).toBe(true);
    });
  });
});

describe('Mana curve group', () => {
  it('the on/off checkbox writes sectionCurveEnabled through the badge', async () => {
    await openPopover();
    const on = q('input[name="curveEnabled"]');
    click(on);
    expect((await synced(['sectionCurveEnabled'])).sectionCurveEnabled).toBe(
      false
    );
    expect(on.checked).toBe(false);
    click(on);
    expect((await synced(['sectionCurveEnabled'])).sectionCurveEnabled).toBe(
      true
    );
  });

  it('rolls the checkbox back when the write fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await openPopover();
    const on = q('input[name="curveEnabled"]');
    chrome.storage.sync.__failNextWrite();
    click(on);
    await settle();
    expect(window.MoxfieldExtended.state.settings.sectionCurveEnabled).toBe(
      true
    );
    expect(on.checked).toBe(true);
  });
});

describe('redraws', () => {
  it('follow deck settings changes', async () => {
    await openPopover();
    deckSettings.setTurns(5);
    deckSettings.setDesired(3);
    expect(q('[data-value="turns"]').textContent).toBe('T5 · 12 cards seen');
    expect(q('[data-value="desired"]').textContent).toBe('≥3');
  });

  it('follow global settings changes (index.js re-renders the badge)', async () => {
    await openPopover();
    settings({ sectionCurveEnabled: false, sectionOddsEnabled: false });
    badge.render();
    expect(q('input[name="curveEnabled"]').checked).toBe(false);
    expect(q('input[name="oddsEnabled"]').checked).toBe(false);
  });

  it('keep the same controls: the DOM is built once per open', async () => {
    await openPopover();
    const before = [...q('.mox-settings').querySelectorAll('*')];
    deckSettings.setTurns(4);
    price.setDeckWide(true);
    settingsPopover.render();
    const after = [...q('.mox-settings').querySelectorAll('*')];
    expect(after).toEqual(before);
  });

  it.each([
    ['default', () => {}],
    [
      'Deck mode with a budget',
      () => {
        price.setActive(true);
        price.setDeckWide(true);
        price.setBudgetGoal(90);
      },
    ],
    ['price disabled', () => settings({ priceVisualizationEnabled: false })],
    [
      'odds and curve off',
      () => settings({ sectionOddsEnabled: false, sectionCurveEnabled: false }),
    ],
    ['By turn at the maximum', () => deckSettings.setTurns(13)],
  ])('write nothing the second time (%s)', async (_name, arrange) => {
    price.setActive(true); // keeps the badge up in every case
    await openPopover();
    arrange();
    settingsPopover.render();
    const records = await recordMutations(dialog(), () =>
      settingsPopover.render()
    );
    expect(records).toHaveLength(0);
  });

  it('write nothing the second time with Moxfield Price off', async () => {
    build({ priced: false });
    badge.render();
    await openPopover();
    settingsPopover.render();
    const records = await recordMutations(dialog(), () =>
      settingsPopover.render()
    );
    expect(records).toHaveLength(0);
  });

  it('stop after close: no listeners left behind', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await openPopover();
    const label = q('[data-value="turns"]');
    settingsPopover.close();
    deckSettings.setTurns(6);
    price.setActive(true);
    badge.render();
    settingsPopover.render();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    window.dispatchEvent(new MouseEvent('mousedown'));
    expect(label.textContent).toBe('T3 · 10 cards seen');
    expect(dialog()).toBeNull();
    expect(error).not.toHaveBeenCalled();
  });

  it.each(['close()', 'Esc', 'an outside click', 'another popover'])(
    'remove every listener they added, after %s',
    async (how) => {
      const targets = [deckSettings.events, window, document];
      const spies = targets.map((target) => ({
        add: vi.spyOn(target, 'addEventListener'),
        remove: vi.spyOn(target, 'removeEventListener'),
      }));
      await openPopover();
      if (how === 'close()') settingsPopover.close();
      if (how === 'Esc') key(document.body, { key: 'Escape' });
      if (how === 'an outside click') mouse(document.body, 'mousedown');
      if (how === 'another popover') popover.open(badgeRoot(), () => {});
      popover.close();
      spies.forEach(({ add, remove }) => {
        add.mock.calls.forEach(([type, fn]) => {
          const removed = remove.mock.calls.some(
            ([t, f]) => t === type && f === fn
          );
          expect(removed, `${type} listener left behind`).toBe(true);
        });
      });
    }
  );

  it('render() does nothing while closed', () => {
    expect(() => settingsPopover.render()).not.toThrow();
    expect(dialog()).toBeNull();
  });
});
