import { describe, expect, it } from 'vitest';
import '../src/content/oddsMath.js';

const { oddsMath } = window.MoxfieldExtended;

/**
 * Exact binomial coefficient as a BigInt.
 * @param {number} n
 * @param {number} k
 * @returns {bigint}
 */
function choose(n, k) {
  if (k < 0 || k > n) return 0n;
  let result = 1n;
  for (let i = 1; i <= Math.min(k, n - k); i += 1) {
    result = (result * BigInt(n - i + 1)) / BigInt(i);
  }
  return result;
}

/**
 * Exact P(X >= k) as a BigInt numerator/denominator.
 * @returns {{numerator: bigint, denominator: bigint}}
 */
function exact(N, K, turns, k) {
  const seen = Math.min(7 + turns, N);
  let numerator = 0n;
  for (let x = k; x <= Math.min(K, seen); x += 1) {
    numerator += choose(K, x) * choose(N - K, seen - x);
  }
  return { numerator, denominator: choose(N, seen) };
}

/**
 * Exact P(X >= k), converted to a number only at the end.
 * @returns {number}
 */
function oracle(N, K, turns, k) {
  const { numerator, denominator } = exact(N, K, turns, k);
  const scale = 10n ** 30n;
  return Number((numerator * scale) / denominator) / Number(scale);
}

/**
 * Expected chip label for an exact probability, per spec 2.4.
 * @returns {string}
 */
function expectedLabel(N, K, turns, k) {
  const { numerator, denominator } = exact(N, K, turns, k);
  if (numerator === 0n) return '0%';
  if (numerator === denominator) return '100%';
  // Exact round-half-up of 100 * numerator / denominator.
  const rounded = Number((200n * numerator + denominator) / (2n * denominator));
  if (rounded >= 100) return '>99%';
  if (rounded <= 0) return '<1%';
  return `${rounded}%`;
}

/**
 * Check evaluate against the BigInt oracle (p and label) over a grid.
 * @returns {number} Combinations checked
 */
function checkGrid({ Ns, Ks, Ts, ks }) {
  let checked = 0;
  for (const N of Ns) {
    for (const K of Ks) {
      if (K > N) continue;
      for (const turns of Ts) {
        for (const k of ks) {
          const result = oddsMath.evaluate({ N, K, turns, k });
          const context = `N=${N} K=${K} T=${turns} k=${k}`;
          expect(
            Math.abs(result.p - oracle(N, K, turns, k)),
            context
          ).toBeLessThan(1e-12);
          // Labels agree with Math.round semantics on the exact probability.
          expect(result.label, context).toBe(expectedLabel(N, K, turns, k));
          checked += 1;
        }
      }
    }
  }
  return checked;
}

describe('exact oracle', () => {
  it('matches the BigInt hypergeometric tail over a small-Library grid', () => {
    const checked = checkGrid({
      Ns: [1, 2, 7, 8, 9, 10, 15, 30, 45, 60],
      Ks: [0, 1, 2, 5, 12, 30, 59, 60],
      Ts: [0, 1, 3, 4, 10, 30, 60],
      ks: [1, 2, 3, 5, 8],
    });
    expect(checked).toBeGreaterThan(500);
  });

  it('matches the BigInt hypergeometric tail for Commander-sized Libraries', () => {
    const checked = checkGrid({
      Ns: [99, 100, 200],
      Ks: [1, 3, 10, 37, 60, 90, 93],
      Ts: [0, 3, 10, 25],
      ks: [1, 2, 4, 8],
    });
    expect(checked).toBeGreaterThan(200);
  });

  it('reports certain exactly 1 and impossible exactly 0', () => {
    expect(oddsMath.evaluate({ N: 99, K: 93, turns: 3, k: 4 }).p).toBe(1);
    expect(oddsMath.evaluate({ N: 99, K: 3, turns: 3, k: 4 }).p).toBe(0);
  });
});

describe('reference values', () => {
  const cases = [
    { N: 99, K: 10, turns: 3, k: 1, p: 0.6736, label: '67%', kind: 'odds' },
    { N: 99, K: 37, turns: 0, k: 3, p: 0.52468, label: '52%', kind: 'odds' },
    { N: 99, K: 1, turns: 3, k: 1, p: 0.10101, label: '10%', kind: 'odds' },
    { N: 99, K: 60, turns: 3, k: 1, p: 0.99996, label: '>99%', kind: 'odds' },
    {
      N: 99,
      K: 90,
      turns: 3,
      k: 2,
      p: 0.999999999994,
      label: '>99%',
      kind: 'odds',
    },
    { N: 99, K: 93, turns: 3, k: 4, p: 1, label: '100%', kind: 'certain' },
    { N: 99, K: 2, turns: 0, k: 2, p: 0.00433, label: '<1%', kind: 'odds' },
    { N: 99, K: 2, turns: 3, k: 2, p: 0.00928, label: '1%', kind: 'odds' },
    { N: 99, K: 3, turns: 3, k: 4, p: 0, label: '0%', kind: 'impossible' },
    { N: 9, K: 4, turns: 3, k: 2, p: 1, label: '100%', kind: 'certain' },
    { N: 9, K: 1, turns: 3, k: 2, p: 0, label: '0%', kind: 'impossible' },
  ];

  cases.forEach(({ N, K, turns, k, p, label, kind }) => {
    it(`N=${N} K=${K} T=${turns} k=${k} -> ${label}`, () => {
      const result = oddsMath.evaluate({ N, K, turns, k });
      expect(result.kind).toBe(kind);
      expect(result.label).toBe(label);
      // The table's p values are rounded to the precision they are written in.
      const digits = String(p).split('.')[1]?.length ?? 0;
      const tolerance = 0.5 * 10 ** -digits + 1e-15;
      expect(Math.abs(result.p - p)).toBeLessThan(tolerance);
      // The BigInt oracle agrees with the table.
      expect(Math.abs(oracle(N, K, turns, k) - p)).toBeLessThan(tolerance);
    });
  });
});

describe('evaluate fields and tooltips', () => {
  it('uses the normal tooltip form', () => {
    const result = oddsMath.evaluate({ N: 99, K: 10, turns: 4, k: 2 });
    expect(result.seen).toBe(11);
    expect(result.wholeLibrary).toBe(false);
    expect(result.tooltip).toBe(`${result.label} ≥2 by T4`);
  });

  it('reports whole Library seen when certain', () => {
    const result = oddsMath.evaluate({ N: 9, K: 4, turns: 3, k: 2 });
    expect(result.seen).toBe(9);
    expect(result.wholeLibrary).toBe(true);
    expect(result.tooltip).toBe('100% ≥2, whole Library seen');
  });

  it('caps seen at the Library size', () => {
    expect(oddsMath.evaluate({ N: 20, K: 5, turns: 30, k: 1 }).seen).toBe(20);
  });

  it('gives the count reason with plural cards', () => {
    expect(oddsMath.evaluate({ N: 99, K: 3, turns: 3, k: 4 }).tooltip).toBe(
      'Only 3 cards in Section; need ≥4'
    );
  });

  it('gives the count reason with singular card, beating whole Library seen', () => {
    const result = oddsMath.evaluate({ N: 9, K: 1, turns: 3, k: 2 });
    expect(result.wholeLibrary).toBe(true);
    expect(result.tooltip).toBe('Only 1 card in Section; need ≥2');
  });

  it('uses the normal tooltip when K >= k but k exceeds the cards seen', () => {
    const result = oddsMath.evaluate({ N: 99, K: 20, turns: 0, k: 8 });
    expect(result.kind).toBe('impossible');
    expect(result.label).toBe('0%');
    expect(result.tooltip).toBe('0% ≥8 by T0');
  });

  it('is certain when the whole Library is seen and K >= k', () => {
    const result = oddsMath.evaluate({ N: 9, K: 9, turns: 3, k: 9 });
    expect(result.kind).toBe('certain');
    expect(result.tooltip).toBe('100% ≥9, whole Library seen');
  });
});

describe('libraryError', () => {
  const sections = [
    { name: 'Creatures', count: 104 },
    { name: 'Lands', count: 37 },
  ];

  it('returns null for a sane Library', () => {
    expect(oddsMath.libraryError(136, sections)).toBeNull();
    expect(oddsMath.libraryError(104, sections)).toBeNull();
  });

  it('rejects NaN, 0, negatives, fractions and missing values', () => {
    [NaN, 0, -3, 2.5, undefined, null].forEach((N) => {
      expect(oddsMath.libraryError(N, sections)).toBe(
        `Couldn't read the main deck count`
      );
    });
  });

  it('names the Section that exceeds the Library', () => {
    expect(oddsMath.libraryError(99, sections)).toBe(
      'Library (99) is smaller than Creatures (104)'
    );
  });

  it('accepts an empty Section list', () => {
    expect(oddsMath.libraryError(99, [])).toBeNull();
  });
});

describe('label rounding boundaries', () => {
  it('rounds an exact half up (7/8 = 87.5%)', () => {
    expect(oddsMath.evaluate({ N: 8, K: 1, turns: 0, k: 1 }).label).toBe('88%');
  });

  const cases = [
    // p just under 0.005 rounds to 0, so it shows <1%.
    { N: 99, K: 5, turns: 2, k: 3, label: '<1%' },
    // p just over 0.005 rounds to 1.
    { N: 99, K: 4, turns: 5, k: 3, label: '1%' },
    // p just under 0.995 rounds to 99.
    { N: 99, K: 31, turns: 6, k: 1, label: '99%' },
    // p just over 0.995 rounds to 100, but is not certain, so >99%.
    { N: 99, K: 39, turns: 3, k: 1, label: '>99%' },
  ];

  cases.forEach(({ N, K, turns, k, label }) => {
    it(`N=${N} K=${K} T=${turns} k=${k} -> ${label}`, () => {
      const p = oracle(N, K, turns, k);
      expect(Math.abs(p - 0.005) < 0.0006 || Math.abs(p - 0.995) < 0.0006).toBe(
        true
      );
      const result = oddsMath.evaluate({ N, K, turns, k });
      expect(result.kind).toBe('odds');
      expect(result.label).toBe(label);
      expect(result.tooltip.startsWith(label)).toBe(true);
    });
  });
});

describe('evaluate input validation', () => {
  const valid = { N: 99, K: 10, turns: 3, k: 1 };
  const invalid = {
    'NaN turns': { turns: NaN },
    'null k': { k: null },
    'fractional K': { K: 10.5 },
    'k of 0': { k: 0 },
    'negative turns': { turns: -1 },
    'N of 0': { N: 0 },
    'negative K': { K: -1 },
    'undefined N': { N: undefined },
    'string turns': { turns: '3' },
    'Infinity turns': { turns: Infinity },
  };

  Object.entries(invalid).forEach(([name, override]) => {
    it(`throws a RangeError for ${name}`, () => {
      expect(() => oddsMath.evaluate({ ...valid, ...override })).toThrow(
        RangeError
      );
    });
  });

  it('accepts the boundary values', () => {
    expect(() =>
      oddsMath.evaluate({ N: 1, K: 0, turns: 0, k: 1 })
    ).not.toThrow();
  });
});
