import { describe, expect, it } from 'vitest';
import '../src/content/domHelpers.js';
import '../src/content/manaValue.js';
import { buildDeck, loadFixture } from './fixtures/deckDom.js';

const { domHelpers, manaValue } = window.MoxfieldExtended;
const { extractQuantity } = domHelpers;

function rowFromFixture(name) {
  document.body.innerHTML = `<ul>${loadFixture(name)}</ul>`;
  return document.querySelector('li[data-hash]');
}

function rowsOf(section) {
  return Array.from(section.ul.querySelectorAll('li[data-hash]'));
}

function curveOf(rows) {
  const { sections } = buildDeck({ sections: [{ title: 'Test', rows }] });
  return manaValue.buildCurve(rowsOf(sections[0]), extractQuantity);
}

function mvs(curve) {
  return curve.bars.map((bar) => bar.mv);
}

function countAt(curve, mv) {
  return curve.bars.find((bar) => bar.mv === mv).count;
}

describe('symbolValue', () => {
  const table = {
    0: 0,
    1: 1,
    2: 2,
    4: 4,
    10: 10,
    x: 0,
    y: 0,
    z: 0,
    w: 1,
    g: 1,
    wu: 1,
    gw: 1,
    up: 1,
    c: 1,
    s: 1,
    '2w': 2,
    '2u': 2,
    '2b': 2,
    '2r': 2,
    '2g': 2,
  };

  Object.entries(table).forEach(([suffix, value]) => {
    it(`${suffix} -> ${value}`, () => {
      expect(manaValue.symbolValue(suffix)).toBe(value);
    });
  });
});

describe('costOfRow on captured fixtures', () => {
  const expected = {
    'row-split-hybrid': 8,
    'row-twobrid': 6,
    'row-adventure-front-only': 4,
    'row-phyrexian': 4,
    'row-x': 2,
    'row-zero-artifact': 0,
    'row-land-adventure-midgar': null,
    'row-owner-land': null,
    'row-viewer-forest': null,
  };

  Object.entries(expected).forEach(([fixture, value]) => {
    it(`${fixture} -> ${value}`, () => {
      expect(manaValue.costOfRow(rowFromFixture(fixture))).toBe(value);
    });
  });

  it('reads builder rows, costed and costless', () => {
    const { sections } = buildDeck({
      sections: [
        { title: 'Creatures', rows: [{ cost: ['2', 'w'] }, { cost: null }] },
      ],
    });
    const [costed, costless] = rowsOf(sections[0]);
    expect(manaValue.costOfRow(costed)).toBe(3);
    expect(manaValue.costOfRow(costless)).toBeNull();
  });

  it('sums both halves of a builder split card', () => {
    const { sections } = buildDeck({
      sections: [
        {
          title: 'Test',
          rows: [
            {
              cost: [
                ['1', 'ub'],
                ['3', 'u', 'b'],
              ],
            },
          ],
        },
      ],
    });
    expect(manaValue.costOfRow(rowsOf(sections[0])[0])).toBe(7);
  });
});

describe('buildCurve', () => {
  it('always covers 1-6 and omits 0 when no 0-MV card exists', () => {
    const curve = curveOf([{ cost: ['2', 'w'] }]);
    expect(mvs(curve)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(countAt(curve, 3)).toBe(1);
    expect(countAt(curve, 1)).toBe(0);
  });

  it('adds a 0 bar when a {0} card exists', () => {
    const curve = curveOf([{ cost: ['0'] }, { cost: ['1'] }]);
    expect(mvs(curve)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(countAt(curve, 0)).toBe(1);
  });

  it('adds a 0 bar for the real {0} fixture', () => {
    document.body.innerHTML = `<ul>${loadFixture('row-zero-artifact')}${loadFixture('row-x')}</ul>`;
    const rows = Array.from(document.querySelectorAll('li[data-hash]'));
    const curve = manaValue.buildCurve(rows, extractQuantity);
    expect(mvs(curve)[0]).toBe(0);
    expect(countAt(curve, 0)).toBe(1);
    expect(countAt(curve, 2)).toBe(1);
  });

  it('extends to a 10-drop with empty gaps and no 7+ bucket', () => {
    const curve = curveOf([{ cost: ['8', 'g', 'g'] }, { cost: ['1'] }]);
    expect(mvs(curve)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(countAt(curve, 10)).toBe(1);
    expect(countAt(curve, 7)).toBe(0);
    expect(countAt(curve, 9)).toBe(0);
  });

  it('counts quantities', () => {
    const curve = curveOf([
      { qty: 6, cost: ['1', 'g'] },
      { qty: 2, owner: true, cost: ['2'] },
    ]);
    expect(countAt(curve, 2)).toBe(8);
    expect(curve.total).toBe(8);
  });

  it('returns null when every row is costless', () => {
    expect(
      curveOf([{ qty: 6 }, { qty: 3, cost: null }, { cost: [] }])
    ).toBeNull();
  });

  it('returns null for no rows', () => {
    expect(manaValue.buildCurve([], extractQuantity)).toBeNull();
  });

  it('reports costless quantity and the weighted average of costed rows', () => {
    const curve = curveOf([
      { qty: 2, cost: ['1'] },
      { qty: 1, cost: ['4'] },
      { qty: 5, cost: null },
    ]);
    expect(curve.costless).toBe(5);
    expect(curve.total).toBe(3);
    expect(curve.avg).toBeCloseTo((2 * 1 + 4) / 3, 10);
  });

  it('counts rows with a duplicate data-hash once', () => {
    const curve = curveOf([
      { hash: 'dup', qty: 2, cost: ['2'] },
      { hash: 'dup', qty: 2, cost: ['2'] },
      { hash: 'free', qty: 3, cost: null },
      { hash: 'free', qty: 3, cost: null },
    ]);
    expect(countAt(curve, 2)).toBe(2);
    expect(curve.total).toBe(2);
    expect(curve.costless).toBe(3);
  });

  it('keeps hashless rows distinct', () => {
    document.body.innerHTML = `<ul>${loadFixture('row-x')}${loadFixture('row-x')}</ul>`;
    const rows = Array.from(document.querySelectorAll('li'));
    rows.forEach((row) => row.removeAttribute('data-hash'));
    const curve = manaValue.buildCurve(rows, extractQuantity);
    expect(countAt(curve, 2)).toBe(2);
  });
});
