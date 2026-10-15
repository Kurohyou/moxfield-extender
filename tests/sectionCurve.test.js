import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDeck } from './fixtures/deckDom.js';

let sectionCurve;
let domHelpers;

/**
 * Build a one-Section deck and return its Section model.
 * @param {Array<Object>} rows - buildDeck rows
 * @param {string} [title]
 * @returns {Object} The Section from getMainboardSections()
 */
function sectionOf(rows, title = 'Creatures') {
  buildDeck({ footerCount: 100, sections: [{ title, rows }] });
  return domHelpers.getMainboardSections()[0];
}

/**
 * The bar spans of a curve element.
 * @param {Element} el
 * @returns {Element[]}
 */
function bars(el) {
  return Array.from(el.children);
}

/**
 * Each bar's --mox-h value.
 * @param {Element} el
 * @returns {string[]}
 */
function heights(el) {
  return bars(el).map((bar) => bar.style.getPropertyValue('--mox-h'));
}

/**
 * Collect every mutation record on a subtree while `fn` runs.
 * Records are gathered in the callback too, because the observer may deliver
 * them before takeRecords() is called.
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
  await import('../src/content/domHelpers.js');
  await import('../src/content/manaValue.js');
  await import('../src/content/sectionCurve.js');
  ({ sectionCurve, domHelpers } = window.MoxfieldExtended);
});

describe('sectionCurve.view', () => {
  it('creates span.mox-curve[data-mox] with bars 1-6 in mana value order', () => {
    const section = sectionOf([
      { qty: 2, cost: ['1'] },
      { qty: 4, cost: ['2'] },
    ]);
    const el = sectionCurve.view(section, null);
    expect(el.matches('span.mox-curve[data-mox]')).toBe(true);
    expect(bars(el)).toHaveLength(6);
    bars(el).forEach((bar) =>
      expect(bar.classList.contains('mox-curve__bar')).toBe(true)
    );
    expect(heights(el).slice(0, 3)).toEqual(['6px', '12px', '1px']);
  });

  it('adds a 0 bar only when the Section has a 0 mana value card', () => {
    const el = sectionCurve.view(sectionOf([{ qty: 1, cost: ['0'] }]), null);
    expect(bars(el)).toHaveLength(7);
    expect(el.title.split('\n')[1]).toMatch(/^0: 1 · 1: 0/);
  });

  it('extends to the highest mana value: a 10-drop gives bars 1-10', () => {
    const el = sectionCurve.view(sectionOf([{ qty: 1, cost: ['10'] }]), null);
    expect(bars(el)).toHaveLength(10);
    expect(el.title.split('\n')[1]).toMatch(/^1: 0 .* 10: 1$/);
  });

  it('scales heights to the tallest bar, 12 px at most', () => {
    const el = sectionCurve.view(
      sectionOf([
        { qty: 4, cost: ['1'] },
        { qty: 2, cost: ['2'] },
        { qty: 1, cost: ['3'] },
      ]),
      null
    );
    expect(heights(el).slice(0, 3)).toEqual(['12px', '6px', '3px']);
  });

  it('marks empty bars with the stub class, and only those', () => {
    const el = sectionCurve.view(
      sectionOf([
        { qty: 1, cost: ['1'] },
        { qty: 1, cost: ['3'] },
      ]),
      null
    );
    const empty = bars(el).map((bar) =>
      bar.classList.contains('mox-curve__bar--empty')
    );
    expect(empty).toEqual([false, true, false, true, true, true]);
  });

  it('builds the tooltip: name, counts, average and the costless line', () => {
    const el = sectionCurve.view(
      sectionOf([
        { qty: 3, cost: ['1'] },
        { qty: 5, cost: ['2'] },
        { qty: 4, cost: ['3'] },
        { qty: 2, cost: ['4'] },
        { qty: 1, cost: ['6'] },
        { qty: 2, cost: [] },
      ]),
      null
    );
    expect(el.title).toBe(
      [
        'Creatures',
        '1: 3 · 2: 5 · 3: 4 · 4: 2 · 5: 0 · 6: 1',
        'Avg mana value 2.60',
        '2 cards with no mana cost not shown',
      ].join('\n')
    );
  });

  it('uses the singular for one costless card', () => {
    const el = sectionCurve.view(
      sectionOf([
        { qty: 1, cost: ['2'] },
        { qty: 1, cost: [] },
      ]),
      null
    );
    expect(el.title.split('\n')[3]).toBe(
      '1 card with no mana cost not shown'
    );
  });

  it('omits the costless line when every card has a cost', () => {
    const el = sectionCurve.view(sectionOf([{ qty: 1, cost: ['2'] }]), null);
    expect(el.title.split('\n')).toHaveLength(3);
  });

  it('returns null for an all-costless Section', () => {
    const section = sectionOf([{ qty: 30, cost: [] }], 'Lands');
    expect(sectionCurve.view(section, null)).toBeNull();
  });

  it('injects its stylesheet once', () => {
    const section = sectionOf([{ qty: 1, cost: ['2'] }]);
    sectionCurve.view(section, null);
    sectionCurve.view(section, null);
    const styles = document.querySelectorAll('style#mox-curve-styles');
    expect(styles).toHaveLength(1);
    expect(styles[0].hasAttribute('data-mox')).toBe(true);
  });

  it('cleanup() removes the stylesheet', () => {
    sectionCurve.view(sectionOf([{ qty: 1, cost: ['2'] }]), null);
    sectionCurve.cleanup();
    expect(document.getElementById('mox-curve-styles')).toBeNull();
  });
});

describe('re-rendering', () => {
  it('makes zero DOM writes when nothing changed', async () => {
    const section = sectionOf([
      { qty: 3, cost: ['1'] },
      { qty: 1, cost: ['3'] },
      { qty: 1, cost: [] },
    ]);
    const el = sectionCurve.view(section, null);
    document.body.appendChild(el);

    const records = await recordMutations(el, () => {
      expect(sectionCurve.view(section, el)).toBe(el);
    });
    expect(records).toEqual([]);
  });

  it('updates in place when a quantity changes', () => {
    const rows = [
      { qty: 2, cost: ['1'] },
      { qty: 1, cost: ['2'] },
    ];
    const section = sectionOf(rows);
    const el = sectionCurve.view(section, null);
    const firstBar = el.firstElementChild;
    expect(heights(el).slice(0, 2)).toEqual(['12px', '6px']);

    section.rows[1].firstElementChild.firstElementChild.textContent = '4';
    expect(sectionCurve.view(section, el)).toBe(el);

    expect(el.firstElementChild).toBe(firstBar);
    expect(heights(el).slice(0, 2)).toEqual(['6px', '12px']);
    expect(el.title.split('\n')[1]).toMatch(/^1: 2 · 2: 4/);
  });

  it('adds and removes bars only when the bar count changes', () => {
    const section = sectionOf([
      { qty: 1, cost: ['1'] },
      { qty: 1, cost: ['8'] },
    ]);
    const el = sectionCurve.view(section, null);
    const kept = bars(el).slice(0, 6);
    expect(bars(el)).toHaveLength(8);

    section.rows[1].remove();
    sectionCurve.view({ ...section, rows: [section.rows[0]] }, el);
    expect(bars(el)).toHaveLength(6);
    expect(bars(el)).toEqual(kept);
  });
});
