import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDeck } from './fixtures/deckDom.js';

let headerCluster;
let sectionOdds;
let sectionCurve;
let deckSettings;
let domHelpers;
let popover;

// Header geometry fed to layout through the measurement seam (jsdom has no
// layout). WIDE fits both items; NARROW fits only the shared slot.
const WIDE = 1000;
const NARROW = 150;
let available;
let widthCalls;

/**
 * Measurement stub: every header is `available` wide with 60 px fixed and an
 * 80 px name; a chip is 24 px and a curve 30 px. Records each width read and
 * whether the cluster was in measuring mode at the time.
 */
const metrics = {
  header: () => ({ available, fixed: 60, nameFull: 80 }),
  width: (el) => {
    widthCalls.push({
      part: el.classList.contains('mox-odds') ? 'chip' : 'curve',
      measuring: el.parentElement?.hasAttribute('data-measure') ?? false,
    });
    return el.classList.contains('mox-odds') ? 24 : 30;
  },
};

/**
 * Build the standard deck: footer 100, Commander (1), Creatures (30, costed),
 * Lands (20, costless), Ramp (5, costed), Sideboard (2).
 * @param {Object} [options] - Overrides for buildDeck
 * @returns {Object} buildDeck's result
 */
function build(options = {}) {
  return buildDeck({
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
      { title: 'Lands', rows: [{ qty: 20, owner: true, cost: [] }] },
      { title: 'Ramp', rows: [{ qty: 5, cost: ['1', 'g'] }] },
      { title: 'Sideboard', rows: [{ qty: 2, cost: ['w'] }] },
    ],
    ...options,
  });
}

/**
 * The header li of a Section by title.
 * @param {string} title
 * @returns {HTMLElement}
 */
function header(title) {
  return [
    ...document.querySelectorAll(
      'section.deckview article > ul > li:first-child'
    ),
  ].find(
    (li) => li.querySelector('span[title]').getAttribute('title') === title
  );
}

/**
 * A Section's cluster, or null.
 * @param {string} title
 * @returns {HTMLElement|null}
 */
function cluster(title) {
  return header(title).querySelector(':scope > .mox-cluster');
}

/**
 * Class names of a cluster's children, in order.
 * @param {string} title
 * @returns {string[]}
 */
function parts(title) {
  return [...cluster(title).children].map((el) => el.className.split(' ')[0]);
}

/**
 * Collect every mutation record under body while `fn` runs.
 * @param {function(): Promise<void>|void} fn
 * @returns {Promise<MutationRecord[]>}
 */
async function recordMutations(fn) {
  const records = [];
  const observer = new MutationObserver((batch) => records.push(...batch));
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });
  await fn();
  await Promise.resolve();
  records.push(...observer.takeRecords());
  observer.disconnect();
  return records;
}

/**
 * Dispatch a cancelable left click and return it.
 * @param {Element} target
 * @returns {MouseEvent}
 */
function click(target) {
  const event = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    button: 0,
  });
  target.dispatchEvent(event);
  return event;
}

/**
 * Let a deckSettings 'change' refresh run to completion.
 */
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(async () => {
  vi.resetModules();
  document.head.innerHTML = '';
  await import('../src/content/domHelpers.js');
  await import('../src/content/oddsMath.js');
  await import('../src/content/manaValue.js');
  await import('../src/content/deckSettings.js');
  await import('../src/content/popover.js');
  await import('../src/content/sectionOdds.js');
  await import('../src/content/sectionCurve.js');
  await import('../src/content/headerCluster.js');
  ({
    headerCluster,
    sectionOdds,
    sectionCurve,
    deckSettings,
    domHelpers,
    popover,
  } = window.MoxfieldExtended);

  build();
  window.history.pushState({}, '', '/decks/abc');
  window.MoxfieldExtended.state = {
    settings: { sectionOddsEnabled: true, sectionCurveEnabled: true },
  };
  await deckSettings.ensureLoaded('abc');
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    top: 100,
    bottom: 120,
    left: 500,
    right: 540,
    width: 40,
    height: 20,
    x: 500,
    y: 100,
  });
  available = WIDE;
  widthCalls = [];
  headerCluster.setMetricsForTests(metrics);
  headerCluster.init();
});

afterEach(async () => {
  headerCluster.cleanup();
  popover.close();
  await deckSettings.flush();
  vi.restoreAllMocks();
});

describe('refresh', () => {
  it('renders one cluster per mainboard Section as the header’s last child', async () => {
    await headerCluster.refresh();
    ['Creatures', 'Lands', 'Ramp'].forEach((title) => {
      const li = header(title);
      expect(li.querySelectorAll('.mox-cluster')).toHaveLength(1);
      expect(li.lastChild).toBe(cluster(title));
      expect(cluster(title).matches('span.mox-cluster[data-mox]')).toBe(true);
    });
    expect(cluster('Commander')).toBeNull();
    expect(cluster('Sideboard')).toBeNull();
    expect(document.querySelectorAll('.mox-cluster')).toHaveLength(3);
  });

  it('puts the curve before the chip', async () => {
    await headerCluster.refresh();
    expect(parts('Creatures')).toEqual(['mox-curve', 'mox-odds']);
  });

  it('shows chips but no curves when grouped by mana value', async () => {
    build({ groupBy: 'cmc' });
    await headerCluster.refresh();
    expect(document.querySelectorAll('.mox-curve')).toHaveLength(0);
    expect(parts('Creatures')).toEqual(['mox-odds']);
  });

  it('keeps the chip but no curve on an all-costless Section', async () => {
    await headerCluster.refresh();
    expect(parts('Lands')).toEqual(['mox-odds']);
  });

  it('removes a curve when its Section becomes costless', async () => {
    await headerCluster.refresh();
    expect(parts('Ramp')).toEqual(['mox-curve', 'mox-odds']);
    vi.spyOn(sectionCurve, 'view').mockReturnValue(null);
    await headerCluster.refresh();
    expect(parts('Ramp')).toEqual(['mox-odds']);
  });

  it('shows curves only, and turns the odds listeners off, when odds are off', async () => {
    await headerCluster.refresh();
    expect(document.getElementById('mox-odds-styles')).not.toBeNull();
    window.MoxfieldExtended.state.settings.sectionOddsEnabled = false;
    await headerCluster.refresh();
    expect(document.querySelectorAll('.mox-odds')).toHaveLength(0);
    expect(parts('Creatures')).toEqual(['mox-curve']);
    // Only sectionOdds.cleanup() removes its stylesheet.
    expect(document.getElementById('mox-odds-styles')).toBeNull();
    // The all-costless Section has nothing left to show.
    expect(cluster('Lands')).toBeNull();
  });

  it('shows chips only when the curve is off', async () => {
    window.MoxfieldExtended.state.settings.sectionCurveEnabled = false;
    await headerCluster.refresh();
    expect(document.querySelectorAll('.mox-curve')).toHaveLength(0);
    expect(parts('Creatures')).toEqual(['mox-odds']);
  });

  it('renders no clusters when both are off', async () => {
    await headerCluster.refresh();
    Object.assign(window.MoxfieldExtended.state.settings, {
      sectionOddsEnabled: false,
      sectionCurveEnabled: false,
    });
    await headerCluster.refresh();
    expect(document.querySelectorAll('.mox-cluster')).toHaveLength(0);
  });

  it('shows ? on every chip when the footer is missing', async () => {
    build({ footerCount: null });
    await headerCluster.refresh();
    const chips = [...document.querySelectorAll('.mox-odds')];
    expect(chips).toHaveLength(3);
    chips.forEach((chip) => expect(chip.textContent).toBe('?'));
  });

  it('makes zero DOM writes on a second refresh with nothing changed', async () => {
    await headerCluster.refresh();
    expect(cluster('Creatures').getAttribute('data-layout')).toBe('both');
    const records = await recordMutations(() => headerCluster.refresh());
    expect(records).toEqual([]);
  });

  it('makes zero DOM writes in a steady shared layout', async () => {
    available = NARROW;
    await headerCluster.refresh();
    expect(cluster('Creatures').getAttribute('data-layout')).toBe('shared');
    await headerCluster.refresh();
    widthCalls = [];
    const records = await recordMutations(() => headerCluster.refresh());
    expect(records).toEqual([]);
    expect(widthCalls.some((call) => call.measuring)).toBe(false);
  });

  it('measures a hidden part whose content changed, inside one pass', async () => {
    available = NARROW;
    await headerCluster.refresh();
    // Shared, showing odds: the curve is hidden. Give it another bar.
    const ul = header('Ramp').parentElement;
    const row = ul.querySelector('li[data-testid="deck-view-table-row"]');
    const extra = row.cloneNode(true);
    extra.setAttribute('data-hash', 'extra');
    extra.querySelector('div.text-nowrap.text-end').innerHTML =
      '<span><span class="mana mana-8 mana-cost mana-shadow"></span></span>';
    ul.appendChild(extra);
    widthCalls = [];
    await headerCluster.refresh();
    expect(widthCalls).toContainEqual({ part: 'curve', measuring: true });
    expect(document.querySelector('[data-measure]')).toBeNull();
  });

  it('never leaves a lone part in a shared slot until the next frame', async () => {
    available = NARROW;
    await headerCluster.refresh();
    expect(cluster('Creatures').getAttribute('data-layout')).toBe('shared');
    // Layout skips every header, so only the render's own write can apply.
    headerCluster.setMetricsForTests({ ...metrics, header: () => null });
    window.MoxfieldExtended.state.settings.sectionCurveEnabled = false;
    await headerCluster.refresh();
    expect(cluster('Creatures').getAttribute('data-layout')).toBe('single');
  });

  it('measures headers from live layout by default', async () => {
    headerCluster.setMetricsForTests(null);
    // Header 200 wide; link 120 with a 60 px (80 px untruncated) name, so
    // fixed 60. Both need 60 + 80 + 30 + 24 + 12 = 206: too wide, so shared.
    const widths = (el) => {
      if (el.matches('section.deckview article > ul > li:first-child')) {
        return { client: 200 };
      }
      if (el.matches('.mox-odds')) return { offset: 24 };
      if (el.matches('.mox-curve')) return { offset: 30 };
      if (el.matches('a.table-deck-row-link')) return { offset: 120 };
      if (el.matches('a.table-deck-row-link > span[title]')) {
        return { offset: 60, scroll: 80 };
      }
      return {};
    };
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(
      function () {
        return widths(this).offset ?? 0;
      }
    );
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockImplementation(
      function () {
        return widths(this).client ?? 0;
      }
    );
    vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockImplementation(
      function () {
        return widths(this).scroll ?? 0;
      }
    );
    await headerCluster.refresh();
    expect(cluster('Creatures').getAttribute('data-layout')).toBe('shared');
    expect(cluster('Lands').getAttribute('data-layout')).toBe('single');
    const records = await recordMutations(() => headerCluster.refresh());
    expect(records).toEqual([]);
  });

  it('skips layout for a header with no box', async () => {
    headerCluster.setMetricsForTests({ ...metrics, header: () => null });
    await headerCluster.refresh();
    expect(cluster('Creatures').hasAttribute('data-layout')).toBe(false);
  });

  it('re-appends the cluster after a foreign node, keeping the same chip', async () => {
    await headerCluster.refresh();
    const chip = cluster('Creatures').querySelector('.mox-odds');
    const foreign = document.createElement('span');
    header('Creatures').appendChild(foreign);
    await headerCluster.refresh();
    expect(header('Creatures').lastChild).toBe(cluster('Creatures'));
    expect(cluster('Creatures').querySelector('.mox-odds')).toBe(chip);
  });

  it('keeps an open stepper open across a re-append', async () => {
    await headerCluster.refresh();
    const chip = cluster('Creatures').querySelector('.mox-odds');
    sectionOdds.openStepper(chip, 'Creatures');
    header('Creatures').appendChild(document.createElement('span'));
    await headerCluster.refresh();
    await Promise.resolve();
    expect(popover.isOpen()).toBe(true);
  });

  it('removes everything in goldfish mode', async () => {
    await headerCluster.refresh();
    window.history.pushState({}, '', '/decks/abc/goldfish');
    await headerCluster.refresh();
    expect(document.querySelectorAll('.mox-cluster')).toHaveLength(0);
  });

  it('removes the cluster of a Section that left the page', async () => {
    await headerCluster.refresh();
    header('Ramp').parentElement.remove();
    const stray = document.createElement('span');
    stray.className = 'mox-cluster';
    stray.setAttribute('data-mox', '');
    header('Commander').appendChild(stray);
    await headerCluster.refresh();
    expect(document.querySelectorAll('.mox-cluster')).toHaveLength(2);
    expect(cluster('Commander')).toBeNull();
  });

  it('isolates a Section whose view throws', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const real = sectionCurve.view;
    vi.spyOn(sectionCurve, 'view').mockImplementation((section, prev) => {
      if (section.name === 'Creatures') throw new Error('boom');
      return real(section, prev);
    });
    await headerCluster.refresh();
    expect(cluster('Creatures')).toBeNull();
    expect(parts('Ramp')).toEqual(['mox-curve', 'mox-odds']);
    expect(parts('Lands')).toEqual(['mox-odds']);
    expect(console.warn).toHaveBeenCalled();
  });

  it('keeps the existing cluster of a Section whose view starts throwing', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await headerCluster.refresh();
    const before = cluster('Creatures');
    vi.spyOn(sectionCurve, 'view').mockImplementation(() => {
      throw new Error('boom');
    });
    await headerCluster.refresh();
    expect(cluster('Creatures')).toBe(before);
  });

  it('coalesces concurrent refreshes into at most two runs', async () => {
    const reads = vi.spyOn(domHelpers, 'getMainboardSections');
    const first = headerCluster.refresh();
    const second = headerCluster.refresh();
    const third = headerCluster.refresh();
    expect(second).toBe(first);
    expect(third).toBe(first);
    await first;
    expect(reads).toHaveBeenCalledTimes(2);
  });

  it('refreshes an open stepper on a DOM refresh', async () => {
    const spy = vi.spyOn(sectionOdds, 'refreshStepper');
    await headerCluster.refresh();
    expect(spy).toHaveBeenCalled();
  });
});

describe('shared-slot click', () => {
  it('flips sharedSlot and every shared cluster’s data-shows', async () => {
    available = NARROW;
    await headerCluster.refresh();
    const shared = [...document.querySelectorAll('.mox-cluster')].filter(
      (el) => el.getAttribute('data-layout') === 'shared'
    );
    expect(shared).toHaveLength(2);
    shared.forEach((el) => expect(el.getAttribute('data-shows')).toBe('odds'));

    const event = click(cluster('Creatures').querySelector('.mox-odds'));
    expect(event.defaultPrevented).toBe(true);
    expect(deckSettings.get().sharedSlot).toBe('curve');
    await settle();
    shared.forEach((el) => expect(el.getAttribute('data-shows')).toBe('curve'));

    click(cluster('Ramp').querySelector('.mox-curve'));
    expect(deckSettings.get().sharedSlot).toBe('odds');
    await settle();
    shared.forEach((el) => expect(el.getAttribute('data-shows')).toBe('odds'));
  });

  it('does not refresh the stepper on a settings change', async () => {
    await headerCluster.refresh();
    const spy = vi.spyOn(sectionOdds, 'refreshStepper');
    deckSettings.setTurns(5);
    await settle();
    expect(spy).not.toHaveBeenCalled();
  });

  it('stops a click on a standalone curve', async () => {
    await headerCluster.refresh();
    const onLi = vi.fn();
    header('Creatures').addEventListener('click', onLi);
    const event = click(cluster('Creatures').querySelector('.mox-curve'));
    expect(event.defaultPrevented).toBe(true);
    expect(onLi).not.toHaveBeenCalled();
    expect(deckSettings.get().sharedSlot).toBe('odds');
  });

  it('leaves a click on Moxfield’s header link alone', async () => {
    await headerCluster.refresh();
    const onLi = vi.fn();
    header('Creatures').addEventListener('click', onLi);
    const event = click(header('Creatures').querySelector('a'));
    expect(event.defaultPrevented).toBe(false);
    expect(onLi).toHaveBeenCalled();
  });

  it('ignores a right button click on a shared cluster', async () => {
    available = NARROW;
    await headerCluster.refresh();
    const event = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 1,
    });
    cluster('Creatures').dispatchEvent(event);
    expect(deckSettings.get().sharedSlot).toBe('odds');
  });
});

describe('init and cleanup', () => {
  it('injects its stylesheet once', () => {
    headerCluster.init();
    expect(
      document.querySelectorAll('#mox-header-cluster-styles[data-mox]')
    ).toHaveLength(1);
    expect(headerCluster.isInitialized()).toBe(true);
  });

  it('removes clusters, the stylesheet and listeners', async () => {
    available = NARROW;
    await headerCluster.refresh();
    const chip = cluster('Creatures').querySelector('.mox-odds');
    headerCluster.cleanup();
    expect(document.querySelectorAll('.mox-cluster')).toHaveLength(0);
    expect(document.getElementById('mox-header-cluster-styles')).toBeNull();
    expect(document.getElementById('mox-odds-styles')).toBeNull();
    expect(document.getElementById('mox-curve-styles')).toBeNull();
    expect(headerCluster.isInitialized()).toBe(false);

    // A detached former shared cluster no longer toggles anything.
    const orphan = document.createElement('span');
    orphan.className = 'mox-cluster';
    orphan.setAttribute('data-layout', 'shared');
    orphan.appendChild(chip);
    header('Creatures').appendChild(orphan);
    click(chip);
    expect(deckSettings.get().sharedSlot).toBe('odds');

    // Settings changes no longer render.
    deckSettings.setTurns(6);
    await Promise.resolve();
    await Promise.resolve();
    expect(document.querySelectorAll('.mox-cluster[data-mox]')).toHaveLength(0);
  });

  it('stays cleaned up when a rerun was queued before cleanup', async () => {
    const pending = headerCluster.refresh();
    deckSettings.setTurns(5); // queues a rerun through the change listener
    headerCluster.cleanup();
    await pending;
    expect(document.querySelectorAll('.mox-cluster')).toHaveLength(0);
    expect(headerCluster.isInitialized()).toBe(false);
    expect(document.getElementById('mox-header-cluster-styles')).toBeNull();
  });

  it('writes nothing when cleaned up during a refresh', async () => {
    const pending = headerCluster.refresh();
    headerCluster.cleanup();
    await pending;
    expect(document.querySelectorAll('.mox-cluster')).toHaveLength(0);
  });
});
