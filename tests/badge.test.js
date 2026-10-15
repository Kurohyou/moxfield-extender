import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDeck } from './fixtures/deckDom.js';

let badge;
let price;
let deckSettings;
let storage;

/**
 * Build a deck with two multi-row Sections. Rows show a "$x.xx" price (the
 * viewer's Moxfield Price option is on) unless `priced` is false.
 * @param {boolean} [priced]
 */
function build(priced = true) {
  buildDeck({
    footerCount: 10,
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
 * Let chrome-stub callbacks (microtasks) settle.
 */
async function settle() {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

/**
 * The badge root, or null when it is not on the page.
 * @returns {HTMLElement|null}
 */
function root() {
  return document.querySelector('.mox-badge');
}

/**
 * Whether the badge is showing.
 * @returns {boolean}
 */
function shown() {
  const el = root();
  return Boolean(el && el.isConnected && !el.hidden);
}

/**
 * A badge segment.
 * @param {'price'|'odds'|'curve'} name
 * @returns {HTMLElement}
 */
function seg(name) {
  return root().querySelector(`[data-seg="${name}"]`);
}

/**
 * Whether a segment is struck through.
 * @param {'price'|'odds'|'curve'} name
 * @returns {boolean}
 */
function struck(name) {
  return seg(name).classList.contains('mox-badge__seg--off');
}

/**
 * Dispatch a cancelable mouse event and return it.
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

const ALT_O = { altKey: true, code: 'KeyO', key: 'o' };
const ALT_M = { altKey: true, code: 'KeyM', key: 'm' };

/**
 * Read sync keys from the chrome stub.
 * @param {string[]} keys
 * @returns {Promise<Object>}
 */
function synced(keys) {
  return chrome.storage.sync.get(keys);
}

const ALL_OFF = {
  priceVisualizationEnabled: false,
  sectionOddsEnabled: false,
  sectionCurveEnabled: false,
};

beforeEach(async () => {
  vi.resetModules();
  document.head.innerHTML = '';
  localStorage.clear();
  window.history.pushState({}, '', '/decks/abc');
  vi.spyOn(console, 'log').mockImplementation(() => {});

  await import('../src/utils/storage.js');
  await import('../src/content/domHelpers.js');
  await import('../src/content/deckSettings.js');
  await import('../src/content/priceVisualization.js');
  await import('../src/content/badge.js');
  ({
    badge,
    priceVisualization: price,
    deckSettings,
    storage,
  } = window.MoxfieldExtended);
  delete window.MoxfieldExtended.settingsPopover;

  build();
  window.MoxfieldExtended.state = {
    settings: { ...storage.DEFAULT_SETTINGS },
  };
  await deckSettings.ensureLoaded('abc');
  price.init();
  await settle();
  badge.init();
  badge.render();
});

afterEach(async () => {
  badge.cleanup();
  price.cleanup();
  await deckSettings.flush();
  vi.restoreAllMocks();
});

describe('visibility', () => {
  it('shows by default (odds and curve on)', () => {
    expect(shown()).toBe(true);
    expect(root().matches('div.mox-badge[data-mox]')).toBe(true);
  });

  it('hides in goldfish mode', () => {
    window.history.pushState({}, '', '/decks/abc/goldfish');
    badge.render();
    expect(shown()).toBe(false);
  });

  it('hides when every feature is off', () => {
    settings(ALL_OFF);
    badge.render();
    expect(shown()).toBe(false);
  });

  it('hides when price is enabled but not active and the rest are off', () => {
    settings({ ...ALL_OFF, priceVisualizationEnabled: true });
    badge.render();
    expect(shown()).toBe(false);
  });

  it('shows for price only (enabled and active)', () => {
    settings({ ...ALL_OFF, priceVisualizationEnabled: true });
    price.setActive(true);
    expect(shown()).toBe(true);
  });

  it('hides for price active but not enabled', () => {
    price.setActive(true);
    settings(ALL_OFF);
    badge.render();
    expect(shown()).toBe(false);
  });

  it('shows for odds only', () => {
    settings({ ...ALL_OFF, sectionOddsEnabled: true });
    badge.render();
    expect(shown()).toBe(true);
  });

  it('shows for curve only', () => {
    settings({ ...ALL_OFF, sectionCurveEnabled: true });
    badge.render();
    expect(shown()).toBe(true);
  });

  it('comes back after leaving goldfish mode', () => {
    window.history.pushState({}, '', '/decks/abc/goldfish');
    badge.render();
    window.history.pushState({}, '', '/decks/abc');
    badge.render();
    expect(shown()).toBe(true);
  });

  it('re-attaches when the page replaced the body', () => {
    build();
    badge.render();
    expect(shown()).toBe(true);
    expect(document.querySelectorAll('.mox-badge')).toHaveLength(1);
  });

  it('adds one stylesheet marked data-mox', () => {
    badge.render();
    const styles = document.querySelectorAll('style#mox-badge-styles');
    expect(styles).toHaveLength(1);
    expect(styles[0].hasAttribute('data-mox')).toBe(true);
  });
});

describe('price segment', () => {
  it('is hidden when price visualization is disabled', () => {
    settings({ priceVisualizationEnabled: false });
    badge.render();
    expect(seg('price').hidden).toBe(true);
    expect(seg('odds').hidden).toBe(false);
  });

  it('reads Price and is struck while off', () => {
    expect(seg('price').textContent).toBe('📊 Price');
    expect(struck('price')).toBe(true);
  });

  it('reads Section %, Deck % and Budget $N by mode', () => {
    price.setActive(true);
    expect(seg('price').textContent).toBe('📊 Section %');
    expect(struck('price')).toBe(false);
    price.setDeckWide(true);
    expect(seg('price').textContent).toBe('📊 Deck %');
    price.setBudgetGoal(119.6);
    expect(seg('price').textContent).toBe('📊 Budget $120');
  });

  it('shows Section % even with a budget, which only Deck mode uses', () => {
    price.setBudgetGoal(50);
    price.setActive(true);
    expect(seg('price').textContent).toBe('📊 Section %');
  });

  it('cycles Section → Deck → Off → Section on click, persisting each step', async () => {
    const seen = [];
    for (let i = 0; i < 4; i += 1) {
      const event = mouse(seg('price'), 'click');
      expect(event.defaultPrevented).toBe(false);
      const stored = await synced([
        'priceVisualizationActive',
        'priceVisualizationDeckWide',
      ]);
      seen.push([seg('price').textContent, stored.priceVisualizationActive]);
    }
    expect(seen).toEqual([
      ['📊 Section %', true],
      ['📊 Deck %', true],
      ['📊 Price', false],
      ['📊 Section %', true],
    ]);
    const stored = await synced(['priceVisualizationDeckWide']);
    expect(stored.priceVisualizationDeckWide).toBe(false);
  });

  it('is struck and inert when Moxfield Price is off', () => {
    build(false);
    badge.render();
    expect(struck('price')).toBe(true);
    expect(seg('price').getAttribute('aria-disabled')).toBe('true');
    expect(seg('price').title).toMatch(/Turn on Price in Moxfield's view options/);
    mouse(seg('price'), 'click');
    expect(price.getState().active).toBe(false);
  });

  it('is struck while active when Moxfield Price is turned off', () => {
    price.setActive(true);
    build(false);
    badge.render();
    expect(struck('price')).toBe(true);
    expect(seg('price').getAttribute('aria-disabled')).toBe('true');
  });

  it('is not inert while Moxfield Price is on', () => {
    expect(seg('price').hasAttribute('aria-disabled')).toBe(false);
    expect(seg('price').title).toMatch(/Click/);
  });
});

describe('odds and curve segments', () => {
  it('shows the deck turns and desired', () => {
    expect(seg('odds').textContent).toBe('🎲 T3 ≥1');
    expect(seg('curve').textContent).toBe('📈 Curve');
  });

  it('follows deckSettings changes', () => {
    deckSettings.setTurns(5);
    expect(seg('odds').textContent).toBe('🎲 T5 ≥1');
    deckSettings.setDesired(2);
    expect(seg('odds').textContent).toBe('🎲 T5 ≥2');
  });

  it('odds click toggles sectionOddsEnabled in sync storage and strikes it', async () => {
    mouse(seg('odds'), 'click');
    expect(struck('odds')).toBe(true);
    expect(window.MoxfieldExtended.state.settings.sectionOddsEnabled).toBe(
      false
    );
    expect((await synced(['sectionOddsEnabled'])).sectionOddsEnabled).toBe(
      false
    );
    mouse(seg('odds'), 'click');
    expect(struck('odds')).toBe(false);
    expect((await synced(['sectionOddsEnabled'])).sectionOddsEnabled).toBe(
      true
    );
  });

  it('curve click toggles sectionCurveEnabled in sync storage and strikes it', async () => {
    mouse(seg('curve'), 'click');
    expect(struck('curve')).toBe(true);
    expect((await synced(['sectionCurveEnabled'])).sectionCurveEnabled).toBe(
      false
    );
    mouse(seg('curve'), 'click');
    expect(struck('curve')).toBe(false);
  });

  it('turning the last feature off hides the badge', () => {
    settings({ priceVisualizationEnabled: false });
    mouse(seg('odds'), 'click');
    mouse(seg('curve'), 'click');
    expect(shown()).toBe(false);
  });

  it('keeps clicks from reaching the page', () => {
    const spy = vi.fn();
    document.body.addEventListener('click', spy);
    mouse(seg('odds'), 'click');
    mouse(seg('price'), 'click');
    document.body.removeEventListener('click', spy);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('failed sync writes', () => {
  it('roll the optimistic toggle back and redraw', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    chrome.storage.sync.__failNextWrite();
    mouse(seg('odds'), 'click');
    expect(struck('odds')).toBe(true); // optimistic
    await settle();
    expect(window.MoxfieldExtended.state.settings.sectionOddsEnabled).toBe(
      true
    );
    expect(struck('odds')).toBe(false);
    expect(seg('odds').getAttribute('aria-pressed')).toBe('true');
    expect(await synced(['sectionOddsEnabled'])).toEqual({});
    expect(warn).toHaveBeenCalled();
  });

  it('roll back an Alt+M toggle too', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    chrome.storage.sync.__failNextWrite();
    key(document.body, ALT_M);
    await settle();
    expect(window.MoxfieldExtended.state.settings.sectionCurveEnabled).toBe(
      true
    );
    expect(struck('curve')).toBe(false);
  });
});

describe('accessibility', () => {
  it('is a labelled toolbar of focusable buttons', () => {
    expect(root().getAttribute('role')).toBe('toolbar');
    expect(root().getAttribute('aria-label')).toBeTruthy();
    ['price', 'odds', 'curve'].forEach((name) => {
      expect(seg(name).getAttribute('role')).toBe('button');
      expect(seg(name).getAttribute('tabindex')).toBe('0');
    });
  });

  it('marks odds and curve with aria-pressed', () => {
    expect(seg('odds').getAttribute('aria-pressed')).toBe('true');
    expect(seg('curve').getAttribute('aria-pressed')).toBe('true');
    price.setActive(true);
    mouse(seg('odds'), 'click');
    expect(seg('odds').getAttribute('aria-pressed')).toBe('false');
  });

  it('labels the price segment with its mode', () => {
    expect(seg('price').getAttribute('aria-label')).toBe('Price bars: off');
    price.setActive(true);
    expect(seg('price').getAttribute('aria-label')).toBe(
      'Price bars: Section %'
    );
    price.setDeckWide(true);
    expect(seg('price').getAttribute('aria-label')).toBe('Price bars: Deck %');
    price.setBudgetGoal(75);
    expect(seg('price').getAttribute('aria-label')).toBe(
      'Price bars: Budget $75'
    );
  });

  it.each([
    ['Enter', 'Enter'],
    ['Space', ' '],
  ])('%s on a segment acts like a click', (_name, keyName) => {
    const event = key(seg('price'), { key: keyName, code: _name });
    expect(event.defaultPrevented).toBe(true);
    expect(price.getState().active).toBe(true);
    key(seg('curve'), { key: keyName, code: _name });
    expect(struck('curve')).toBe(true);
  });

  it('ignores a held Enter after the first press', () => {
    key(seg('price'), { key: 'Enter', code: 'Enter' });
    key(seg('price'), { key: 'Enter', code: 'Enter', repeat: true });
    expect(price.getState().deckWide).toBe(false);
  });

  it('keeps an inert price segment focusable but does nothing on Enter', () => {
    build(false);
    badge.render();
    expect(seg('price').getAttribute('tabindex')).toBe('0');
    expect(seg('price').getAttribute('aria-disabled')).toBe('true');
    expect(seg('price').getAttribute('aria-label')).toMatch(/unavailable/);
    key(seg('price'), { key: 'Enter', code: 'Enter' });
    expect(price.getState().active).toBe(false);
  });
});

describe('right-click', () => {
  it('suppresses the menu and toggles the settings popover on the badge', () => {
    const toggle = vi.fn();
    window.MoxfieldExtended.settingsPopover = { toggle };
    const event = mouse(seg('odds'), 'contextmenu');
    expect(event.defaultPrevented).toBe(true);
    expect(toggle).toHaveBeenCalledWith(root());
  });

  it('does nothing else, and is safe, without a settings popover', () => {
    const event = mouse(root(), 'contextmenu');
    expect(event.defaultPrevented).toBe(true);
    expect(window.MoxfieldExtended.state.settings.sectionOddsEnabled).toBe(
      true
    );
  });
});

describe('Alt+O and Alt+M', () => {
  it('toggle odds and curve and write sync storage', async () => {
    price.setActive(true); // keeps the badge up with odds and curve off
    const event = key(document.body, ALT_O);
    expect(event.defaultPrevented).toBe(true);
    expect(struck('odds')).toBe(true);
    expect((await synced(['sectionOddsEnabled'])).sectionOddsEnabled).toBe(
      false
    );
    key(document.body, ALT_M);
    expect(struck('curve')).toBe(true);
    expect((await synced(['sectionCurveEnabled'])).sectionCurveEnabled).toBe(
      false
    );
  });

  it('turn a feature back on while it is off and the badge is hidden', async () => {
    settings(ALL_OFF);
    badge.render();
    expect(shown()).toBe(false);
    key(document.body, ALT_O);
    expect(shown()).toBe(true);
    expect(struck('odds')).toBe(false);
    expect((await synced(['sectionOddsEnabled'])).sectionOddsEnabled).toBe(
      true
    );
    settings(ALL_OFF);
    badge.render();
    key(document.body, ALT_M);
    expect(shown()).toBe(true);
    expect(struck('curve')).toBe(false);
  });

  it('match the physical key, so macOS Option characters work', () => {
    price.setActive(true); // keeps the badge up with odds and curve off
    key(document.body, { altKey: true, code: 'KeyO', key: 'ø' });
    key(document.body, { altKey: true, code: 'KeyM', key: 'µ' });
    expect(struck('odds')).toBe(true);
    expect(struck('curve')).toBe(true);
  });

  it('ignore a matching key on a different physical key', () => {
    const event = key(document.body, { altKey: true, code: 'KeyP', key: 'o' });
    expect(event.defaultPrevented).toBe(false);
    expect(struck('odds')).toBe(false);
  });

  it.each([
    ['Ctrl', { ctrlKey: true }],
    ['Shift', { shiftKey: true }],
    ['Meta', { metaKey: true }],
  ])('ignore Alt+%s+O', (_name, extra) => {
    const event = key(document.body, { ...ALT_O, ...extra });
    expect(event.defaultPrevented).toBe(false);
    expect(struck('odds')).toBe(false);
  });

  it('ignore O and M without Alt', () => {
    key(document.body, { code: 'KeyO', key: 'o' });
    expect(struck('odds')).toBe(false);
  });

  it.each([
    ['input', () => document.createElement('input')],
    ['textarea', () => document.createElement('textarea')],
    ['select', () => document.createElement('select')],
    [
      'contenteditable',
      () => {
        const div = document.createElement('div');
        div.setAttribute('contenteditable', 'true');
        div.appendChild(document.createElement('span'));
        return div;
      },
    ],
  ])('ignore keys typed in a %s', (_name, make) => {
    const field = make();
    document.body.appendChild(field);
    const target = field.firstElementChild || field;
    const event = key(target, ALT_O);
    expect(event.defaultPrevented).toBe(false);
    expect(struck('odds')).toBe(false);
  });

  it('flip once while held: autorepeats are swallowed but not toggled', () => {
    price.setActive(true);
    key(document.body, ALT_O);
    const repeat = key(document.body, { ...ALT_O, repeat: true });
    expect(repeat.defaultPrevented).toBe(true);
    expect(struck('odds')).toBe(true);
  });

  it('stop the key from reaching the page', () => {
    const spy = vi.fn();
    document.body.addEventListener('keydown', spy);
    key(document.body, ALT_O);
    document.body.removeEventListener('keydown', spy);
    expect(spy).not.toHaveBeenCalled();
  });

  it('stop working after cleanup', () => {
    badge.cleanup();
    expect(root()).toBeNull();
    key(document.body, ALT_O);
    expect(window.MoxfieldExtended.state.settings.sectionOddsEnabled).toBe(
      true
    );
  });

  it('register once even if init runs twice', async () => {
    badge.init();
    key(document.body, ALT_O);
    expect((await synced(['sectionOddsEnabled'])).sectionOddsEnabled).toBe(
      false
    );
  });

  it('fall back to default settings before index.js has loaded them', async () => {
    window.MoxfieldExtended.state = undefined;
    expect(() => key(document.body, ALT_O)).not.toThrow();
    expect((await synced(['sectionOddsEnabled'])).sectionOddsEnabled).toBe(
      !storage.DEFAULT_SETTINGS.sectionOddsEnabled
    );
  });
});

describe('render', () => {
  /**
   * Collect every mutation record in the document while `fn` runs.
   * @param {function(): void} fn
   * @returns {Promise<MutationRecord[]>}
   */
  async function recordMutations(fn) {
    const records = [];
    const observer = new MutationObserver((batch) => records.push(...batch));
    observer.observe(document, {
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

  it.each([
    ['default', () => {}],
    [
      'price active in Deck mode with a budget',
      () => {
        price.setActive(true);
        price.setDeckWide(true);
        price.setBudgetGoal(90);
      },
    ],
    ['Moxfield Price off', () => build(false)],
    [
      'odds and curve off',
      () => settings({ sectionOddsEnabled: false, sectionCurveEnabled: false }),
    ],
    ['all off (hidden)', () => settings(ALL_OFF)],
    [
      'goldfish',
      () => window.history.pushState({}, '', '/decks/abc/goldfish'),
    ],
  ])('writes nothing the second time (%s)', async (_name, arrange) => {
    arrange();
    badge.render();
    const records = await recordMutations(() => badge.render());
    expect(records).toHaveLength(0);
  });

  it('does nothing after cleanup', () => {
    badge.cleanup();
    badge.render();
    expect(root()).toBeNull();
    expect(document.getElementById('mox-badge-styles')).toBeNull();
  });

  it('does nothing on a deck settings change after cleanup', () => {
    badge.cleanup();
    deckSettings.setTurns(6);
    expect(root()).toBeNull();
  });

  it('works with no price module loaded', () => {
    delete window.MoxfieldExtended.priceVisualization;
    badge.render();
    expect(seg('price').textContent).toBe('📊 Price');
    expect(() => mouse(seg('price'), 'click')).not.toThrow();
    window.MoxfieldExtended.priceVisualization = price;
  });
});
