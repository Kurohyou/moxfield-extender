/**
 * Mana value utilities for Moxfield Extended
 * Reads a row's cost cell and builds a Section mana curve.
 */

(function () {
  'use strict';

  // The cost cell of a card row. Header anchors also hold span.mana type icons,
  // so costs are only ever read from inside this cell.
  const COST_CELL = 'div.text-nowrap.text-end';

  // mana-* classes that style a symbol rather than name it.
  const NON_SYMBOL_CLASSES = new Set([
    'mana',
    'mana-cost',
    'mana-shadow',
    'mana-split',
  ]);

  // Mana values 1-6 always have a bar.
  const MIN_BARS = 6;

  /**
   * Mana value of one symbol.
   * @param {string} sym - Class suffix after `mana-` (e.g. '2', 'x', '2w', 'gw')
   * @returns {number} Digits are their number, X/Y/Z are 0, {2/W} forms are 2,
   *   and everything else (coloured, colourless, snow, hybrid, phyrexian) is 1
   */
  function symbolValue(sym) {
    if (/^\d+$/.test(sym)) return parseInt(sym, 10);
    if (/^[xyz]$/.test(sym)) return 0;
    if (/^2[wubrg]$/.test(sym)) return 2;
    return 1;
  }

  /**
   * Find the symbol suffix of a span.mana element.
   * @param {Element} span
   * @returns {string|null} Suffix after `mana-`, or null when it has none
   */
  function symbolOf(span) {
    for (const className of span.classList) {
      if (className.startsWith('mana-') && !NON_SYMBOL_CLASSES.has(className)) {
        return className.slice('mana-'.length);
      }
    }
    return null;
  }

  /**
   * Mana value of a card row, from the symbols in its cost cell.
   * Split cards render both halves, so the sum covers both.
   * @param {Element} row - Card entry element
   * @returns {number|null} Mana value, or null when the row has no cost symbols
   */
  function costOfRow(row) {
    const cell = row.querySelector(COST_CELL);
    if (!cell) return null;

    let total = 0;
    let found = false;
    cell.querySelectorAll('span.mana').forEach((span) => {
      const sym = symbolOf(span);
      if (sym === null) return;
      found = true;
      total += symbolValue(sym);
    });
    return found ? total : null;
  }

  /**
   * Build the Section mana curve.
   * @param {Element[]} rows - Card entry elements of one Section
   * @param {function(Element): number} extractQuantity - Reads a row's quantity
   * @returns {{bars: Array<{mv: number, count: number}>, costless: number,
   *   avg: number, total: number}|null} null when every row is costless.
   *   `total` and `avg` cover costed rows only; `costless` is the quantity of
   *   rows left out.
   */
  function buildCurve(rows, extractQuantity) {
    const seenHashes = new Set();
    const counts = new Map();
    let costless = 0;
    let total = 0;
    let weighted = 0;

    rows.forEach((row) => {
      const hash = row.getAttribute('data-hash');
      if (hash) {
        if (seenHashes.has(hash)) return;
        seenHashes.add(hash);
      }

      const quantity = extractQuantity(row);
      const mv = costOfRow(row);
      if (mv === null) {
        costless += quantity;
        return;
      }
      counts.set(mv, (counts.get(mv) || 0) + quantity);
      total += quantity;
      weighted += mv * quantity;
    });

    if (counts.size === 0) return null;

    const first = counts.has(0) ? 0 : 1;
    const last = Math.max(MIN_BARS, ...counts.keys());
    const bars = [];
    for (let mv = first; mv <= last; mv += 1) {
      bars.push({ mv, count: counts.get(mv) || 0 });
    }

    return { bars, costless, avg: weighted / total, total };
  }

  // Export for use in content scripts
  if (typeof window !== 'undefined') {
    window.MoxfieldExtended = window.MoxfieldExtended || {};
    window.MoxfieldExtended.manaValue = {
      symbolValue,
      costOfRow,
      buildCurve,
    };
  }
})();
