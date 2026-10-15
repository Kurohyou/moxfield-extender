import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDeck } from './fixtures/deckDom.js';

let price;
let deckSettings;
let domHelpers;

/**
 * Give every card row a visible "$x.xx" price, as Moxfield does when the
 * viewer's Price option is on. isPriceEnabled() and extractPrice() read it.
 */
function addRowPrices() {
  document
    .querySelectorAll('li[data-testid="deck-view-table-row"]')
    .forEach((row, i) => {
      const cell = document.createElement('div');
      cell.className = 'text-end';
      cell.textContent = `$${(i + 1).toFixed(2)}`;
      row.appendChild(cell);
    });
}

/**
 * Build a deck with two multi-row Sections. Rows carry prices unless
 * `priced` is false.
 * @param {boolean} [priced]
 */
function build(priced = true) {
  buildDeck({
    footerCount: 10,
    sections: [
      {
        title: 'Creatures',
        rows: [{ qty: 1 }, { qty: 2 }, { qty: 1 }],
      },
      { title: 'Lands', rows: [{ qty: 3 }, { qty: 3 }] },
    ],
  });
  if (priced) addRowPrices();
}

/**
 * Let chrome-stub callbacks (microtasks) settle.
 */
async function settle() {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

/**
 * Dispatch a keydown on document.body.
 * @param {Object} init
 * @returns {KeyboardEvent}
 */
function key(init) {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  document.body.dispatchEvent(event);
  return event;
}

/**
 * Card rows that carry a price bar.
 * @returns {Element[]}
 */
function barred() {
  return [...document.querySelectorAll('.mox-price-bar')];
}

/**
 * Load the modules fresh and init price visualization.
 * @param {Object} [stored] - chrome.storage.sync contents before init
 */
async function start(stored = {}) {
  await chrome.storage.sync.set(stored);
  price.init();
  await settle();
}

beforeEach(async () => {
  vi.resetModules();
  document.head.innerHTML = '';
  localStorage.clear();
  window.history.pushState({}, '', '/decks/abc');
  await import('../src/content/domHelpers.js');
  await import('../src/content/deckSettings.js');
  await import('../src/content/priceVisualization.js');
  ({
    priceVisualization: price,
    deckSettings,
    domHelpers,
  } = window.MoxfieldExtended);
  build();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  price.cleanup();
  vi.restoreAllMocks();
});

describe('getState', () => {
  it('starts off, in Section mode, with no budget', async () => {
    await start();
    expect(price.getState()).toEqual({
      active: false,
      deckWide: false,
      budget: null,
    });
  });

  it('restores the stored active state and mode on init', async () => {
    await start({
      priceVisualizationActive: true,
      priceVisualizationDeckWide: true,
    });
    expect(price.getState()).toMatchObject({ active: true, deckWide: true });
    expect(barred().length).toBeGreaterThan(0);
  });

  it('loads the budget for this deck from localStorage', async () => {
    localStorage.setItem('mox-budget-abc', '150');
    await start();
    expect(price.getState().budget).toBe(150);
  });

  it('treats a garbled stored budget as no budget', async () => {
    localStorage.setItem('mox-budget-abc', 'abc');
    await start();
    expect(price.getState().budget).toBeNull();
  });

  it('reflects setActive and setDeckWide', async () => {
    await start();
    price.setActive(true);
    expect(price.getState().active).toBe(true);
    price.setDeckWide(true);
    expect(price.getState().deckWide).toBe(true);
    price.setActive(false);
    expect(price.getState()).toMatchObject({ active: false, deckWide: true });
    expect(barred()).toHaveLength(0);
  });
});

describe('init restore', () => {
  it('lets a user action before the restore resolves win', async () => {
    await chrome.storage.sync.set({
      priceVisualizationActive: true,
      priceVisualizationDeckWide: true,
    });
    price.init();
    price.cycle(); // restore still pending: off → Section
    await settle();
    expect(price.getState()).toMatchObject({ active: true, deckWide: false });
    const stored = await chrome.storage.sync.get([
      'priceVisualizationActive',
      'priceVisualizationDeckWide',
    ]);
    expect(stored).toEqual({
      priceVisualizationActive: true,
      priceVisualizationDeckWide: false,
    });
    expect(barred().some((el) => el.classList.contains('mox-deck-wide'))).toBe(
      false
    );
  });

  it('drops the restore when cleaned up before it resolves', async () => {
    await chrome.storage.sync.set({ priceVisualizationActive: true });
    const seen = vi.fn();
    deckSettings.events.addEventListener('change', seen);
    price.init();
    price.cleanup();
    await settle();
    deckSettings.events.removeEventListener('change', seen);
    expect(price.getState().active).toBe(false);
    expect(barred()).toHaveLength(0);
    expect(seen).not.toHaveBeenCalled();
  });
});

describe('cycle', () => {
  it('goes Section → Deck → Off → Section and persists each step', async () => {
    await start();
    const seen = [];
    const step = async () => {
      price.cycle();
      await settle();
      const { active, deckWide } = price.getState();
      const stored = await chrome.storage.sync.get([
        'priceVisualizationActive',
        'priceVisualizationDeckWide',
      ]);
      expect(stored.priceVisualizationActive).toBe(active);
      expect(stored.priceVisualizationDeckWide).toBe(deckWide);
      seen.push(active ? (deckWide ? 'deck' : 'section') : 'off');
    };
    await step();
    await step();
    await step();
    await step();
    expect(seen).toEqual(['section', 'deck', 'off', 'section']);
  });

  it('turns on in Section mode even when it was last in Deck mode', async () => {
    await start({
      priceVisualizationActive: false,
      priceVisualizationDeckWide: true,
    });
    price.cycle();
    expect(price.getState()).toMatchObject({ active: true, deckWide: false });
  });

  it('applies and removes the bars', async () => {
    await start();
    price.cycle();
    expect(barred().length).toBeGreaterThan(0);
    expect(barred().some((el) => el.classList.contains('mox-deck-wide'))).toBe(
      false
    );
    price.cycle();
    expect(barred().every((el) => el.classList.contains('mox-deck-wide'))).toBe(
      true
    );
    price.cycle();
    expect(barred()).toHaveLength(0);
  });

  it('is a no-op when the viewer has Moxfield Price off', async () => {
    build(false);
    await start();
    expect(domHelpers.isPriceEnabled()).toBe(false);
    price.cycle();
    expect(price.getState().active).toBe(false);
  });
});

describe('setBudgetGoal', () => {
  it('stores the budget for this deck', async () => {
    await start();
    price.setBudgetGoal(120);
    expect(price.getState().budget).toBe(120);
    expect(localStorage.getItem('mox-budget-abc')).toBe('120');
  });

  it('clears the budget with null', async () => {
    localStorage.setItem('mox-budget-abc', '80');
    await start();
    price.setBudgetGoal(null);
    expect(price.getState().budget).toBeNull();
    expect(localStorage.getItem('mox-budget-abc')).toBeNull();
  });

  it.each([0, -5, NaN, Infinity, '100', undefined])(
    'clears the budget for invalid input %s',
    async (value) => {
      localStorage.setItem('mox-budget-abc', '80');
      await start();
      price.setBudgetGoal(value);
      expect(price.getState().budget).toBeNull();
      expect(localStorage.getItem('mox-budget-abc')).toBeNull();
    }
  );

  it('re-applies deck-mode bars against the budget', async () => {
    await start({
      priceVisualizationActive: true,
      priceVisualizationDeckWide: true,
    });
    const row = barred()[0];
    const before = row.style.getPropertyValue('--mox-price-percentage');
    price.setBudgetGoal(1000);
    const after = row.style.getPropertyValue('--mox-price-percentage');
    expect(after).not.toBe(before);
    // Row 1 costs $1.00 x qty 1: 0.1% of a $1000 budget.
    expect(parseFloat(after)).toBeCloseTo(0.1);
  });
});

describe('change events', () => {
  /**
   * Record deckSettings change sources while fn runs.
   * @param {function(): (void|Promise<void>)} fn
   * @returns {Promise<string[]>}
   */
  async function sources(fn) {
    const seen = [];
    const listener = (event) => seen.push(event.detail.source);
    deckSettings.events.addEventListener('change', listener);
    await fn();
    deckSettings.events.removeEventListener('change', listener);
    return seen;
  }

  it('fires source "price" on cycle, setActive, setDeckWide and setBudgetGoal', async () => {
    await start();
    expect(await sources(() => price.cycle())).toEqual(['price']);
    expect(await sources(() => price.setDeckWide(true))).toEqual(['price']);
    expect(await sources(() => price.setActive(false))).toEqual(['price']);
    expect(await sources(() => price.setBudgetGoal(50))).toEqual(['price']);
  });

  it('fires once init has restored the stored state', async () => {
    await chrome.storage.sync.set({ priceVisualizationActive: true });
    const seen = await sources(async () => {
      price.init();
      await settle();
    });
    expect(seen).toContain('price');
  });

  it('stays silent when nothing changes', async () => {
    await start();
    price.setActive(true);
    price.setBudgetGoal(40);
    expect(
      await sources(() => {
        price.setActive(true);
        price.setDeckWide(false);
        price.setBudgetGoal(40);
      })
    ).toEqual([]);
  });
});

describe('no native dialogs', () => {
  it('has no prompt() or alert() left in the source', () => {
    const source = readFileSync('src/content/priceVisualization.js', 'utf8');
    expect(source).not.toMatch(/\b(prompt|alert)\s*\(/);
  });

  it('never calls window.prompt or window.alert', async () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue(null);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    await start({ priceVisualizationActive: true });
    price.cycle();
    price.setBudgetGoal(-1);
    price.refresh();
    expect(promptSpy).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('adds no indicator element', async () => {
    await start({ priceVisualizationActive: true });
    price.refresh();
    expect(document.querySelector('.mox-price-mode-indicator')).toBeNull();
  });
});

describe('refresh', () => {
  it('causes no childList or attribute mutations outside [data-mox] when active', async () => {
    await start({ priceVisualizationActive: true });
    price.refresh();
    const records = [];
    const observer = new MutationObserver((batch) => records.push(...batch));
    observer.observe(document.body, {
      childList: true,
      attributes: true,
      subtree: true,
    });
    price.refresh();
    price.refresh();
    await Promise.resolve();
    records.push(...observer.takeRecords());
    observer.disconnect();
    expect(records.filter((m) => !domHelpers.isOwnMutation(m))).toHaveLength(
      0
    );
  });

  it('removes the bars in goldfish mode and restores them after', async () => {
    await start({ priceVisualizationActive: true });
    expect(barred().length).toBeGreaterThan(0);
    window.history.pushState({}, '', '/decks/abc/goldfish');
    price.refresh();
    expect(barred()).toHaveLength(0);
    window.history.pushState({}, '', '/decks/abc');
    price.refresh();
    expect(barred().length).toBeGreaterThan(0);
  });
});

describe('Alt+P', () => {
  it('toggles on and off', async () => {
    await start();
    const event = key({ altKey: true, key: 'p', code: 'KeyP' });
    expect(event.defaultPrevented).toBe(true);
    expect(price.getState().active).toBe(true);
    key({ altKey: true, key: 'p', code: 'KeyP' });
    expect(price.getState().active).toBe(false);
  });

  it('swallows autorepeats without toggling', async () => {
    await start();
    key({ altKey: true, key: 'p', code: 'KeyP' });
    const repeat = key({ altKey: true, key: 'p', code: 'KeyP', repeat: true });
    expect(repeat.defaultPrevented).toBe(true);
    expect(price.getState().active).toBe(true);
    const shifted = key({
      altKey: true,
      shiftKey: true,
      key: 'P',
      code: 'KeyP',
      repeat: true,
    });
    expect(shifted.defaultPrevented).toBe(true);
    expect(price.getState().deckWide).toBe(false);
  });

  it('is ignored in editable fields', async () => {
    await start();
    const input = document.createElement('input');
    document.body.appendChild(input);
    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      altKey: true,
      key: 'p',
      code: 'KeyP',
    });
    input.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(price.getState().active).toBe(false);
  });

  it('writes sync storage once when Alt+Shift+P turns it on', async () => {
    await start();
    const writes = vi.spyOn(chrome.storage.sync, 'set');
    key({ altKey: true, shiftKey: true, key: 'P', code: 'KeyP' });
    expect(writes).toHaveBeenCalledTimes(1);
  });

  it('Alt+Shift+P starts in Deck mode, then switches mode', async () => {
    await start();
    key({ altKey: true, shiftKey: true, key: 'P', code: 'KeyP' });
    expect(price.getState()).toMatchObject({ active: true, deckWide: true });
    key({ altKey: true, shiftKey: true, key: 'P', code: 'KeyP' });
    expect(price.getState()).toMatchObject({ active: true, deckWide: false });
  });
});
