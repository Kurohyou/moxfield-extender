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

const HEADER_LI = 'section.deckview article > ul > li:first-child';

/**
 * Widths of a header anchor and its children, and of our parts: link 120,
 * icon 20, name 60 (80 untruncated), count 30, caret 10, chip 24, curve 30.
 * @param {Element} el
 * @returns {{offset?: number, scroll?: number}}
 */
function anchorWidths(el) {
  if (el.matches('.mox-odds')) return { offset: 24 };
  if (el.matches('.mox-curve')) return { offset: 30 };
  if (el.matches('a.table-deck-row-link')) return { offset: 120 };
  if (!el.parentElement?.matches('a.table-deck-row-link')) return {};
  if (el.matches('[title]')) return { offset: 60, scroll: 80 };
  if (el.matches('.text-end')) return { offset: 20 };
  if (el.matches('.fas')) return { offset: 10 };
  return { offset: 30 };
}

/**
 * Stub jsdom's layout getters from a width table. An element with an offset
 * width has one client rect; others have none (not rendered).
 * @param {function(Element): {client?: number, offset?: number, scroll?: number}} widths
 */
function stubLayout(widths) {
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
  vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(function () {
    return widths(this).offset ? [{}] : [];
  });
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

  it('reads the deck after deck settings load', async () => {
    const { oddsMath } = window.MoxfieldExtended;
    const pending = headerCluster.refresh();
    const footer = [...document.querySelectorAll('div')].find(
      (el) => el.children.length === 0 && /main deck/.test(el.textContent)
    );
    footer.textContent = '90 main deck';
    await pending;
    const expected = oddsMath.evaluate({ N: 89, K: 30, turns: 3, k: 1 });
    expect(cluster('Creatures').querySelector('.mox-odds').title).toBe(
      expected.tooltip
    );
  });

  it('removes the curve stylesheet when both are off', async () => {
    await headerCluster.refresh();
    expect(document.getElementById('mox-curve-styles')).not.toBeNull();
    Object.assign(window.MoxfieldExtended.state.settings, {
      sectionOddsEnabled: false,
      sectionCurveEnabled: false,
    });
    await headerCluster.refresh();
    expect(document.getElementById('mox-curve-styles')).toBeNull();
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
    // Header 200 wide. The anchor's non-name children (icon 20, count 30,
    // caret 10) make fixed 60; the name is 80 untruncated. Both need
    // 60 + 80 + 30 + 24 + 12 + 2 = 208: too wide, so shared.
    stubLayout((el) => {
      if (el.matches(HEADER_LI)) return { client: 200 };
      return anchorWidths(el);
    });
    await headerCluster.refresh();
    expect(cluster('Creatures').getAttribute('data-layout')).toBe('shared');
    expect(cluster('Lands').getAttribute('data-layout')).toBe('single');
    const records = await recordMutations(() => headerCluster.refresh());
    expect(records).toEqual([]);
  });

  it('measures fixed from the anchor’s children when the anchor is clipped', async () => {
    headerCluster.setMetricsForTests(null);
    // Header 207 wide: one short of both with fixed 60. The anchor reports
    // 50, clipped below its children (60 + a 60 px name); a fixed taken from
    // its own width would come out as -10 and wrongly fit both.
    stubLayout((el) => {
      if (el.matches(HEADER_LI)) return { client: 207 };
      if (el.matches('a.table-deck-row-link')) return { offset: 50 };
      return anchorWidths(el);
    });
    await headerCluster.refresh();
    expect(cluster('Creatures').getAttribute('data-layout')).toBe('shared');
  });

  it('counts shown header siblings and their margins, skipping hidden ones', async () => {
    headerCluster.setMetricsForTests(null);
    // Creatures gets a 40 px "+ 1 other" with a 4 px margin, so fixed is
    // 60 + 44 = 104 and the shared slot needs 104 + 28 + 30 + 6 = 168.
    // A hidden sibling with a 100 px margin must not count.
    const other = document.createElement('span');
    other.className = 'ms-1 fw-normal text-muted';
    other.style.marginLeft = '4px';
    other.textContent = '+ 1 other';
    const hidden = document.createElement('span');
    hidden.style.display = 'none';
    hidden.style.marginLeft = '100px';
    header('Creatures').append(other, hidden);
    let liWidth = 168;
    stubLayout((el) => {
      if (el.matches(HEADER_LI)) return { client: liWidth };
      if (el === other) return { offset: 40 };
      return anchorWidths(el);
    });
    await headerCluster.refresh();
    expect(cluster('Creatures').getAttribute('data-layout')).toBe('shared');
    liWidth = 167;
    await headerCluster.refresh();
    expect(cluster('Creatures').getAttribute('data-layout')).toBe('hidden');
  });

  /**
   * Swap Creatures' caret for a Font Awesome SVG-mode caret (an SVGElement,
   * which has no offsetWidth) whose bounding box is `width` wide.
   * @param {number} width
   * @returns {SVGElement}
   */
  function svgCaret(width) {
    const caret = header('Creatures').querySelector('.fas');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'svg-inline--fa fa-caret-down');
    caret.replaceWith(svg);
    const box = Element.prototype.getBoundingClientRect;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
      function () {
        return this === svg ? { width, height: 10 } : box.call(this);
      }
    );
    return svg;
  }

  it('measures an SVG child of the anchor by its bounding box', async () => {
    headerCluster.setMetricsForTests(null);
    const svg = svgCaret(10);
    let liWidth = 200;
    // Same widths as the span caret: fixed 60, so 200 is shared (both
    // needs 208). A NaN width would hide it; a 0 width would fit both.
    stubLayout((el) => {
      if (el.matches(HEADER_LI)) return { client: liWidth };
      if (el === svg) return { offset: 10 };
      return anchorWidths(el);
    });
    await headerCluster.refresh();
    expect(cluster('Creatures').getAttribute('data-layout')).toBe('shared');
    headerCluster.cleanup();
    headerCluster.init();
    liWidth = 208;
    await headerCluster.refresh();
    expect(cluster('Creatures').getAttribute('data-layout')).toBe('both');
  });

  it('measures an SVG sibling of the anchor by its bounding box', async () => {
    headerCluster.setMetricsForTests(null);
    // A 40 px icon after the anchor: fixed 100, so the shared slot needs
    // 100 + 28 + 30 + 6 = 164.
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    header('Creatures').appendChild(svg);
    const box = Element.prototype.getBoundingClientRect;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
      function () {
        return this === svg ? { width: 40, height: 10 } : box.call(this);
      }
    );
    let liWidth = 164;
    stubLayout((el) => {
      if (el.matches(HEADER_LI)) return { client: liWidth };
      if (el === svg) return { offset: 40 };
      return anchorWidths(el);
    });
    await headerCluster.refresh();
    expect(cluster('Creatures').getAttribute('data-layout')).toBe('shared');
    liWidth = 163;
    await headerCluster.refresh();
    expect(cluster('Creatures').getAttribute('data-layout')).toBe('hidden');
  });

  it('adds a flex anchor’s column-gap between its rendered children', async () => {
    headerCluster.setMetricsForTests(null);
    // Four children (icon, name, count, caret) with a 4 px gap add 12:
    // fixed 72, so both needs 72 + 80 + 30 + 24 + 12 + 2 = 220.
    const link = header('Creatures').querySelector('a.table-deck-row-link');
    link.style.display = 'inline-flex';
    link.style.columnGap = '4px';
    let liWidth = 220;
    stubLayout((el) => {
      if (el.matches(HEADER_LI)) return { client: liWidth };
      return anchorWidths(el);
    });
    await headerCluster.refresh();
    expect(cluster('Creatures').getAttribute('data-layout')).toBe('both');
    liWidth = 219;
    await headerCluster.refresh();
    expect(cluster('Creatures').getAttribute('data-layout')).toBe('shared');
  });

  it('ignores column-gap on an anchor that is not a flex or grid box', async () => {
    headerCluster.setMetricsForTests(null);
    const link = header('Creatures').querySelector('a.table-deck-row-link');
    link.style.display = 'inline';
    link.style.columnGap = '4px';
    stubLayout((el) => {
      if (el.matches(HEADER_LI)) return { client: 208 };
      return anchorWidths(el);
    });
    await headerCluster.refresh();
    expect(cluster('Creatures').getAttribute('data-layout')).toBe('both');
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

  it('does not refresh headers for a price-bar change on the shared bus', async () => {
    await headerCluster.refresh();
    const reads = vi.spyOn(domHelpers, 'getMainboardSections');
    const fire = (source) =>
      deckSettings.events.dispatchEvent(
        new CustomEvent('change', { detail: { source } })
      );
    fire('price');
    await settle();
    expect(reads).not.toHaveBeenCalled();
    fire('external'); // control: any other source refreshes
    await settle();
    expect(reads).toHaveBeenCalled();
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

describe('web fonts', () => {
  let fonts;
  let ready;

  beforeEach(() => {
    headerCluster.cleanup();
    fonts = new EventTarget();
    fonts.ready = new Promise((resolve) => {
      ready = resolve;
    });
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: fonts,
    });
  });

  afterEach(() => {
    delete document.fonts;
  });

  /**
   * Refresh with layout skipped, then let layout measure again.
   */
  async function refreshWithoutLayout() {
    headerCluster.setMetricsForTests({ ...metrics, header: () => null });
    await headerCluster.refresh();
    expect(cluster('Creatures').hasAttribute('data-layout')).toBe(false);
    headerCluster.setMetricsForTests(metrics);
  }

  it('re-runs layout once fonts are ready', async () => {
    headerCluster.init();
    await refreshWithoutLayout();
    ready();
    await settle();
    expect(cluster('Creatures').getAttribute('data-layout')).toBe('both');
  });

  it('re-runs layout when more fonts finish loading', async () => {
    headerCluster.init();
    await refreshWithoutLayout();
    fonts.dispatchEvent(new Event('loadingdone'));
    expect(cluster('Creatures').getAttribute('data-layout')).toBe('both');
  });

  it('stops listening to fonts after cleanup', async () => {
    headerCluster.init();
    await refreshWithoutLayout();
    const kept = cluster('Creatures');
    headerCluster.cleanup();
    header('Creatures').appendChild(kept);
    fonts.dispatchEvent(new Event('loadingdone'));
    ready();
    await settle();
    expect(kept.hasAttribute('data-layout')).toBe(false);
  });

  it('works without document.fonts', async () => {
    delete document.fonts;
    headerCluster.init();
    await headerCluster.refresh();
    expect(cluster('Creatures').getAttribute('data-layout')).toBe('both');
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
