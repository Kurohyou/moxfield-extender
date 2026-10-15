import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDeck } from './fixtures/deckDom.js';

// The content scripts, in the order the manifest loads them.
const MANIFEST_SCRIPTS = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'manifest.json'),
    'utf8'
  )
).content_scripts[0].js;

/**
 * Build a deck page: footer 100, Commander (1), Creatures (30), Lands (20),
 * Sideboard (2).
 */
function buildStandardDeck() {
  buildDeck({
    footerCount: 100,
    groupBy: 'type',
    sections: [
      { title: 'Commander', rows: [{ qty: 1, cost: ['3', 'g'] }] },
      {
        title: 'Creatures',
        rows: [
          { qty: 20, cost: ['2'] },
          { qty: 10, cost: ['3'] },
        ],
      },
      { title: 'Lands', rows: [{ qty: 20, cost: [] }] },
      { title: 'Sideboard', rows: [{ qty: 2, cost: ['w'] }] },
    ],
  });
}

/**
 * Load the content scripts on a deck page in manifest order, with a stub
 * sectionShortcuts so initFeatures calls are observable.
 * @param {Object} [options]
 * @param {string} [options.path] - Page path
 * @param {Object} [options.sync] - chrome.storage.sync contents before load
 * @param {boolean} [options.deck] - Build a deck page first
 * @returns {Promise<Object>} The sectionShortcuts stub
 */
async function loadContent({ path = '/decks/abc', sync, deck = false } = {}) {
  window.history.pushState({}, '', path);
  // A fresh body: observers from earlier loads keep watching the old one.
  document.documentElement.replaceChild(
    document.createElement('body'),
    document.body
  );
  document.head.innerHTML = '';
  if (deck) buildStandardDeck();
  if (sync) await chrome.storage.sync.set(sync);

  window.MoxfieldExtended = {};
  const shortcuts = { init: vi.fn(), cleanup: vi.fn(), refresh: vi.fn() };
  vi.resetModules();
  for (const script of MANIFEST_SCRIPTS) {
    if (script.endsWith('/index.js')) {
      window.MoxfieldExtended.sectionShortcuts = shortcuts;
    }
    await import(`../${script}`);
  }
  // index.js awaits loadSettings before registering listeners.
  await vi.waitFor(() =>
    expect(window.MoxfieldExtended.state?.initialized).toBe(true)
  );
  return shortcuts;
}

/**
 * Let pending promise chains and zero-delay timers run.
 */
async function settle() {
  for (let i = 0; i < 5; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/**
 * Fake setTimeout only; promises and microtasks stay real.
 */
function useFakeTimeouts() {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
}

/**
 * Let the page observer see a mutation, then run its 250 ms debounce.
 */
async function runObserverDebounce() {
  await Promise.resolve();
  await vi.advanceTimersByTimeAsync(250);
  await vi.advanceTimersByTimeAsync(0);
}

/**
 * A header li by Section title.
 * @param {string} title
 * @returns {HTMLElement}
 */
function header(title) {
  return [
    ...document.querySelectorAll('section.deckview article > ul > li:first-child'),
  ].find((li) => li.querySelector('span[title]')?.getAttribute('title') === title);
}

/**
 * Count the observer's refresh log lines.
 * @returns {number}
 */
function observerRefreshes() {
  return console.log.mock.calls.filter((args) =>
    args.some((arg) => String(arg).includes('DOM updated'))
  ).length;
}

describe('content index storage wiring', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    const ns = window.MoxfieldExtended || {};
    ['badge', 'headerCluster', 'priceVisualization'].forEach((name) =>
      ns[name]?.cleanup?.()
    );
    clearTimeout(ns._updateTimeout);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('merges known sync keys into state.settings and re-runs initFeatures', async () => {
    const shortcuts = await loadContent();
    expect(shortcuts.init).toHaveBeenCalledTimes(1);

    await chrome.storage.sync.set({ sectionOddsEnabled: false });

    expect(window.MoxfieldExtended.state.settings.sectionOddsEnabled).toBe(
      false
    );
    expect(shortcuts.init).toHaveBeenCalledTimes(2);
  });

  it('applies feature switches arriving from sync', async () => {
    const shortcuts = await loadContent();
    await chrome.storage.sync.set({ sectionShortcutsEnabled: false });
    expect(shortcuts.cleanup).toHaveBeenCalled();
  });

  it('ignores sync keys it does not know', async () => {
    const shortcuts = await loadContent();
    await chrome.storage.sync.set({ somethingElse: 1 });
    expect(
      window.MoxfieldExtended.state.settings.somethingElse
    ).toBeUndefined();
    expect(shortcuts.init).toHaveBeenCalledTimes(1);
  });

  it('forwards local changes to the current deck key to deckSettings', async () => {
    await loadContent();
    const { deckSettings } = window.MoxfieldExtended;
    await deckSettings.ensureLoaded('abc');
    const sources = [];
    deckSettings.events.addEventListener('change', (event) =>
      sources.push(event.detail.source)
    );

    await chrome.storage.local.set({ 'deck:abc': { turns: 8 } });
    expect(sources).toEqual(['external']);
    expect(deckSettings.get().turns).toBe(8);
  });

  it('ignores local changes to other decks and other keys', async () => {
    await loadContent();
    const { deckSettings } = window.MoxfieldExtended;
    await deckSettings.ensureLoaded('abc');

    await chrome.storage.local.set({
      'deck:other': { turns: 8 },
      unrelated: 1,
    });
    expect(deckSettings.get().turns).toBe(3);
  });
});

describe('content index Section odds wiring', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    const ns = window.MoxfieldExtended || {};
    ['badge', 'headerCluster', 'priceVisualization'].forEach((name) =>
      ns[name]?.cleanup?.()
    );
    clearTimeout(ns._updateTimeout);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders the header clusters and the badge on a deck page', async () => {
    await loadContent({ deck: true });
    await vi.waitFor(() =>
      expect(header('Creatures').querySelector('.mox-cluster')).not.toBeNull()
    );
    const cluster = header('Creatures').querySelector('.mox-cluster');
    expect(cluster.querySelector('.mox-odds')).not.toBeNull();
    expect(cluster.querySelector('.mox-curve')).not.toBeNull();
    expect(header('Commander').querySelector('.mox-cluster')).toBeNull();
    expect(document.querySelector('.mox-badge')).not.toBeNull();
  });

  it('handles Alt+O while every feature is off', async () => {
    await loadContent({
      deck: true,
      sync: {
        sectionOddsEnabled: false,
        sectionCurveEnabled: false,
        priceVisualizationActive: false,
      },
    });
    await settle();
    expect(document.querySelector('.mox-badge')).toBeNull();
    expect(document.querySelector('.mox-cluster')).toBeNull();

    const event = new KeyboardEvent('keydown', {
      code: 'KeyO',
      key: 'o',
      altKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(event);
    await settle();

    expect(window.MoxfieldExtended.state.settings.sectionOddsEnabled).toBe(true);
    expect((await chrome.storage.sync.get('sectionOddsEnabled')).sectionOddsEnabled).toBe(true);
    expect(document.querySelector('.mox-badge')).not.toBeNull();
    await vi.waitFor(() =>
      expect(header('Creatures').querySelector('.mox-odds')).not.toBeNull()
    );
    // Odds only: no curve.
    expect(document.querySelector('.mox-curve')).toBeNull();
  });

  it('removes clusters when a sync change turns odds and curve off', async () => {
    await loadContent({ deck: true });
    await vi.waitFor(() =>
      expect(document.querySelector('.mox-cluster')).not.toBeNull()
    );

    await chrome.storage.sync.set({
      sectionOddsEnabled: false,
      sectionCurveEnabled: false,
    });
    await settle();

    expect(document.querySelector('.mox-cluster')).toBeNull();
    expect(window.MoxfieldExtended.headerCluster.isInitialized()).toBe(false);
    expect(document.querySelector('.mox-badge')).toBeNull();
  });

  it('only redraws the badge for a runtime price-state change', async () => {
    const shortcuts = await loadContent({ deck: true });
    await settle();
    const { headerCluster, badge } = window.MoxfieldExtended;
    const refresh = vi.spyOn(headerCluster, 'refresh');
    const render = vi.spyOn(badge, 'render');
    const inits = shortcuts.init.mock.calls.length;

    await chrome.storage.sync.set({
      priceVisualizationActive: true,
      priceVisualizationDeckWide: true,
    });

    expect(window.MoxfieldExtended.state.settings.priceVisualizationActive).toBe(true);
    expect(window.MoxfieldExtended.state.settings.priceVisualizationDeckWide).toBe(true);
    expect(render).toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(shortcuts.init).toHaveBeenCalledTimes(inits);
  });

  it('re-runs initFeatures when a price-state change comes with another key', async () => {
    const shortcuts = await loadContent({ deck: true });
    await settle();
    const refresh = vi.spyOn(window.MoxfieldExtended.headerCluster, 'refresh');
    const inits = shortcuts.init.mock.calls.length;

    await chrome.storage.sync.set({
      priceVisualizationActive: true,
      sectionCurveEnabled: false,
    });

    expect(refresh).toHaveBeenCalled();
    expect(shortcuts.init).toHaveBeenCalledTimes(inits + 1);
  });

  it('refreshes the headers and the badge after a foreign DOM change', async () => {
    await loadContent({ deck: true });
    await settle();
    useFakeTimeouts();
    const { headerCluster, badge } = window.MoxfieldExtended;
    const refresh = vi.spyOn(headerCluster, 'refresh');
    const render = vi.spyOn(badge, 'render');

    header('Creatures').parentElement.appendChild(document.createElement('li'));
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(249);
    expect(refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalled();
  });

  /**
   * Load a deck page, wait for the first chips, and switch to fake timeouts.
   * @returns {Promise<string>} The Creatures chip's text
   */
  async function loadWithChips() {
    await loadContent({ deck: true });
    await vi.waitFor(() =>
      expect(header('Creatures').querySelector('.mox-odds')).not.toBeNull()
    );
    await settle();
    useFakeTimeouts();
    return header('Creatures').querySelector('.mox-odds').textContent;
  }

  /**
   * The single text node of an element.
   * @param {Element} el
   * @returns {Text}
   */
  function textNode(el) {
    const node = [...el.childNodes].find((n) => n.nodeType === Node.TEXT_NODE);
    expect(node).toBeDefined();
    return node;
  }

  it('refreshes when React rewrites a header count in place', async () => {
    const before = await loadWithChips();
    const refresh = vi.spyOn(window.MoxfieldExtended.headerCluster, 'refresh');
    const count = header('Creatures').querySelector('span[title]').nextElementSibling;

    // React sets the number's nodeValue: a characterData record only.
    textNode(count).nodeValue = '(5)';
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(249);
    expect(refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(refresh).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() =>
      expect(header('Creatures').querySelector('.mox-odds').textContent).not.toBe(
        before
      )
    );
  });

  it('refreshes when React rewrites the footer count in place', async () => {
    const before = await loadWithChips();
    const refresh = vi.spyOn(window.MoxfieldExtended.headerCluster, 'refresh');
    const footer = document.querySelector('div.text-nowrap.d-inline-block');
    expect(footer.textContent).toBe('100 main deck');

    textNode(footer).nodeValue = '60 main deck';
    await runObserverDebounce();

    expect(refresh).toHaveBeenCalledTimes(1);
    await vi.waitFor(() =>
      expect(header('Creatures').querySelector('.mox-odds').textContent).not.toBe(
        before
      )
    );
  });

  it('ignores text changes inside its own nodes', async () => {
    await loadWithChips();
    const refresh = vi.spyOn(window.MoxfieldExtended.headerCluster, 'refresh');
    const chip = header('Creatures').querySelector('.mox-odds');
    const own = document.createTextNode('x');
    chip.appendChild(own);
    // The append itself is own (childList inside [data-mox]); so is the edit.
    await runObserverDebounce();
    own.nodeValue = 'y';
    await runObserverDebounce();

    expect(observerRefreshes()).toBe(0);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('does not refresh the headers from the observer while both are off', async () => {
    await loadContent({
      deck: true,
      sync: { sectionOddsEnabled: false, sectionCurveEnabled: false },
    });
    await settle();
    useFakeTimeouts();
    const refresh = vi.spyOn(window.MoxfieldExtended.headerCluster, 'refresh');

    header('Creatures').parentElement.appendChild(document.createElement('li'));
    await runObserverDebounce();

    expect(observerRefreshes()).toBe(1);
    expect(refresh).not.toHaveBeenCalled();
    expect(document.querySelector('.mox-cluster')).toBeNull();
  });

  it('schedules no refresh after the initial render (manual check 7)', async () => {
    // Fake timeouts from the start, so a debounce scheduled by the initial
    // render itself would be a fake timer this test can run.
    useFakeTimeouts();
    await loadContent({ deck: true });
    await vi.waitFor(() =>
      expect(document.querySelector('.mox-cluster')).not.toBeNull()
    );
    expect(document.querySelector('.mox-badge')).not.toBeNull();
    const refresh = vi.spyOn(window.MoxfieldExtended.headerCluster, 'refresh');

    await vi.advanceTimersByTimeAsync(10000);

    expect(observerRefreshes()).toBe(0);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('does not feed on the refresh a foreign change causes', async () => {
    await loadContent({ deck: true });
    await vi.waitFor(() =>
      expect(document.querySelector('.mox-cluster')).not.toBeNull()
    );
    await settle();
    useFakeTimeouts();
    // One foreign change, so a full refresh (headers and badge) runs once.
    header('Creatures').parentElement.appendChild(document.createElement('li'));
    await runObserverDebounce();
    expect(observerRefreshes()).toBe(1);
    const refresh = vi.spyOn(window.MoxfieldExtended.headerCluster, 'refresh');

    await vi.advanceTimersByTimeAsync(5000);

    expect(refresh).not.toHaveBeenCalled();
    expect(observerRefreshes()).toBe(1);
  });

  it('removes clusters and the badge after client-side navigation into goldfish', async () => {
    await loadContent({ deck: true });
    await vi.waitFor(() =>
      expect(document.querySelector('.mox-cluster')).not.toBeNull()
    );
    expect(document.querySelector('.mox-badge')).not.toBeNull();
    useFakeTimeouts();

    window.history.pushState({}, '', '/decks/abc/goldfish');
    document.body.appendChild(document.createElement('div'));
    await runObserverDebounce();

    expect(document.querySelector('.mox-cluster')).toBeNull();
    expect(document.querySelector('.mox-badge')).toBeNull();

    // And back out again.
    window.history.pushState({}, '', '/decks/abc');
    document.body.appendChild(document.createElement('div'));
    await runObserverDebounce();

    expect(document.querySelector('.mox-cluster')).not.toBeNull();
    expect(document.querySelector('.mox-badge')).not.toBeNull();
  });

  it('never writes chrome.storage.sync from initFeatures or a refresh', async () => {
    await loadContent({ deck: true });
    await settle();
    const set = vi.spyOn(chrome.storage.sync, 'set');

    // Two setting changes, each re-running initFeatures (headers off, then on).
    await chrome.storage.sync.set({ sectionOddsEnabled: false });
    await settle();
    await chrome.storage.sync.set({ sectionOddsEnabled: true });
    await settle();
    // A price-only change and an observer refresh.
    await chrome.storage.sync.set({ priceVisualizationActive: true });
    await settle();
    useFakeTimeouts();
    header('Creatures').parentElement.appendChild(document.createElement('li'));
    await runObserverDebounce();
    expect(observerRefreshes()).toBe(1);

    // Only the three writes made above.
    expect(set).toHaveBeenCalledTimes(3);
  });

  it('keeps the SETTINGS_CHANGED message path, harmless next to onChanged', async () => {
    const listeners = [];
    const addListener = chrome.runtime.onMessage.addListener;
    vi.spyOn(chrome.runtime.onMessage, 'addListener').mockImplementation(
      (listener) => {
        listeners.push(listener);
        addListener(listener);
      }
    );
    await loadContent({ deck: true });
    await vi.waitFor(() =>
      expect(document.querySelector('.mox-cluster')).not.toBeNull()
    );
    expect(listeners).toHaveLength(1);

    // The popup writes sync, then sends the same change as a message.
    await chrome.storage.sync.set({ sectionCurveEnabled: false });
    const sendResponse = vi.fn();
    listeners[0](
      { type: 'SETTINGS_CHANGED', settings: { sectionCurveEnabled: false } },
      {},
      sendResponse
    );
    await settle();

    expect(sendResponse).toHaveBeenCalledWith({ success: true });
    expect(document.querySelector('.mox-curve')).toBeNull();
    expect(header('Creatures').querySelector('.mox-odds')).not.toBeNull();
    expect(document.querySelectorAll('.mox-badge')).toHaveLength(1);
  });
});
