import { beforeEach, describe, expect, it, vi } from 'vitest';

let chooseHeaderLayout;
let HYSTERESIS_PX;
let MIN_NAME_PX;
let ROUNDING_SLACK_PX;

// fixed 60 + name 80 + curve 30 + chip 24 + 2 gaps of 6 + 2 px rounding
// slack = 208 for 'both'.
// fixed 60 + nameMin 28 + max(30, 24) + gap 6 = 124 for 'shared'.
const BOTH_NEED = 208;
const SHARED_NEED = 124;

/**
 * chooseHeaderLayout input with both items present.
 * @param {Object} [overrides]
 * @returns {Object}
 */
function input(overrides = {}) {
  return {
    available: 500,
    fixed: 60,
    nameFull: 80,
    nameMin: 28,
    curve: 30,
    chip: 24,
    gap: 6,
    previous: null,
    ...overrides,
  };
}

beforeEach(async () => {
  vi.resetModules();
  await import('../src/content/headerCluster.js');
  ({ chooseHeaderLayout, HYSTERESIS_PX, MIN_NAME_PX, ROUNDING_SLACK_PX } =
    window.MoxfieldExtended.headerCluster);
});

describe('constants', () => {
  it('exports the hysteresis and minimum name widths', () => {
    expect(HYSTERESIS_PX).toBe(8);
    expect(ROUNDING_SLACK_PX).toBe(2);
    expect(MIN_NAME_PX).toBeGreaterThanOrEqual(20);
    expect(MIN_NAME_PX).toBeLessThanOrEqual(40);
  });
});

describe('chooseHeaderLayout with both items', () => {
  it('shows both when everything fits with the full name', () => {
    expect(chooseHeaderLayout(input())).toBe('both');
  });

  it('shows both at exact equality', () => {
    expect(chooseHeaderLayout(input({ available: BOTH_NEED }))).toBe('both');
  });

  it('shares the slot one pixel short of both', () => {
    expect(chooseHeaderLayout(input({ available: BOTH_NEED - 1 }))).toBe(
      'shared'
    );
  });

  it('shares the slot at exact equality with the minimum name', () => {
    expect(chooseHeaderLayout(input({ available: SHARED_NEED }))).toBe(
      'shared'
    );
  });

  it('sizes the shared slot by the wider item', () => {
    const wideChip = input({ chip: 50, available: 60 + 28 + 50 + 6 - 1 });
    expect(chooseHeaderLayout(wideChip)).toBe('hidden');
    expect(chooseHeaderLayout({ ...wideChip, available: 144 })).toBe('shared');
  });

  it('hides when even the shared slot does not fit', () => {
    expect(chooseHeaderLayout(input({ available: SHARED_NEED - 1 }))).toBe(
      'hidden'
    );
    expect(chooseHeaderLayout(input({ available: 0 }))).toBe('hidden');
  });
});

describe('hysteresis at the both/shared boundary', () => {
  it('stays both at exact fit when previously both', () => {
    expect(
      chooseHeaderLayout(input({ available: BOTH_NEED, previous: 'both' }))
    ).toBe('both');
  });

  it('drops from both to shared as soon as both stops fitting', () => {
    expect(
      chooseHeaderLayout(input({ available: BOTH_NEED - 1, previous: 'both' }))
    ).toBe('shared');
  });

  it('stays shared at exact fit when previously shared', () => {
    expect(
      chooseHeaderLayout(input({ available: BOTH_NEED, previous: 'shared' }))
    ).toBe('shared');
    expect(
      chooseHeaderLayout(
        input({ available: BOTH_NEED + HYSTERESIS_PX - 1, previous: 'shared' })
      )
    ).toBe('shared');
  });

  it('returns to both from shared with the hysteresis margin', () => {
    expect(
      chooseHeaderLayout(
        input({ available: BOTH_NEED + HYSTERESIS_PX, previous: 'shared' })
      )
    ).toBe('both');
  });

  it('needs no margin coming from hidden or a fresh cluster', () => {
    expect(
      chooseHeaderLayout(input({ available: BOTH_NEED, previous: 'hidden' }))
    ).toBe('both');
    expect(
      chooseHeaderLayout(input({ available: BOTH_NEED, previous: null }))
    ).toBe('both');
  });
});

describe('chooseHeaderLayout with one item', () => {
  // fixed 60 + nameMin 28 + chip 24 + gap 6 = 118.
  const SINGLE_NEED = 118;

  it('is single when the chip alone fits, never both', () => {
    expect(chooseHeaderLayout(input({ curve: 0 }))).toBe('single');
    expect(chooseHeaderLayout(input({ curve: 0, previous: 'shared' }))).toBe(
      'single'
    );
  });

  it('is single when the curve alone fits', () => {
    expect(chooseHeaderLayout(input({ chip: 0 }))).toBe('single');
  });

  it('is single at exact equality with the minimum name', () => {
    expect(
      chooseHeaderLayout(input({ curve: 0, available: SINGLE_NEED }))
    ).toBe('single');
  });

  it('hides one pixel short', () => {
    expect(
      chooseHeaderLayout(input({ curve: 0, available: SINGLE_NEED - 1 }))
    ).toBe('hidden');
  });
});

describe('chooseHeaderLayout with no items', () => {
  it('is hidden', () => {
    expect(chooseHeaderLayout(input({ curve: 0, chip: 0 }))).toBe('hidden');
  });
});
