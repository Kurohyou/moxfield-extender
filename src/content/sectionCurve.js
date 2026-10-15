/**
 * Section mana curve for Moxfield Extended
 * A tiny unlabelled bar graph of a Section's cards per mana value (spec 3).
 * Renders are idempotent: a node is written only when its value changes, so
 * the page observer is not fed by our own output.
 */

(function () {
  'use strict';

  const STYLE_ID = 'mox-curve-styles';
  const MAX_HEIGHT_PX = 12;
  const EMPTY_HEIGHT = '1px';
  const BAR_CLASS = 'mox-curve__bar';
  const EMPTY_CLASS = 'mox-curve__bar--empty';

  const CSS = `
.mox-curve {
  display: inline-flex;
  align-items: flex-end;
  gap: 1px;
  height: ${MAX_HEIGHT_PX}px;
  vertical-align: middle;
}
.mox-curve__bar {
  width: 3px;
  height: var(--mox-h);
  background: currentColor;
}
.mox-curve__bar--empty {
  height: ${EMPTY_HEIGHT};
  opacity: 0.3;
}
`;

  /**
   * Add the curve stylesheet to the page once.
   */
  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.setAttribute('data-mox', '');
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  /**
   * Tooltip text for a curve (spec 3.1).
   * @param {string} name - Section name
   * @param {{bars: Array<{mv: number, count: number}>, costless: number, avg: number}} curve
   * @returns {string}
   */
  function tooltipFor(name, curve) {
    const lines = [
      name,
      curve.bars.map((bar) => `${bar.mv}: ${bar.count}`).join(' · '),
      `Avg mana value ${curve.avg.toFixed(2)}`,
    ];
    if (curve.costless > 0) {
      const cards = curve.costless === 1 ? 'card' : 'cards';
      lines.push(`${curve.costless} ${cards} with no mana cost not shown`);
    }
    return lines.join('\n');
  }

  /**
   * Bar height: scaled to the tallest bar, at least 1 px for a non-empty bar.
   * @param {number} count
   * @param {number} max - Tallest bar's count, > 0
   * @returns {string} CSS length
   */
  function heightOf(count, max) {
    if (count === 0) return EMPTY_HEIGHT;
    return `${Math.max(1, Math.round((count / max) * MAX_HEIGHT_PX))}px`;
  }

  /**
   * Bring the bar spans to `length`, adding or removing at the end only.
   * @param {Element} el - The curve element
   * @param {number} length
   */
  function syncBarCount(el, length) {
    while (el.children.length > length) el.lastElementChild.remove();
    while (el.children.length < length) {
      const bar = document.createElement('span');
      bar.className = BAR_CLASS;
      el.appendChild(bar);
    }
  }

  /**
   * Render a Section's mana curve, updating `prevEl` in place when given.
   * @param {{name: string, rows: Element[]}} section - From getMainboardSections()
   * @param {HTMLElement|null} [prevEl] - A span.mox-curve from an earlier view
   * @returns {HTMLElement|null} The curve element, or null when every card in
   *   the Section is costless (the caller removes prevEl)
   */
  function view(section, prevEl) {
    const { manaValue, domHelpers } = window.MoxfieldExtended;
    const curve = manaValue.buildCurve(section.rows, domHelpers.extractQuantity);
    if (!curve) return null;

    ensureStyles();
    let el = prevEl;
    if (!el) {
      el = document.createElement('span');
      el.className = 'mox-curve';
      el.setAttribute('data-mox', '');
    }

    syncBarCount(el, curve.bars.length);
    const max = Math.max(...curve.bars.map((bar) => bar.count));
    curve.bars.forEach((bar, index) => {
      const span = el.children[index];
      const height = heightOf(bar.count, max);
      if (span.style.getPropertyValue('--mox-h') !== height) {
        span.style.setProperty('--mox-h', height);
      }
      const empty = bar.count === 0;
      if (span.classList.contains(EMPTY_CLASS) !== empty) {
        span.classList.toggle(EMPTY_CLASS, empty);
      }
    });

    const title = tooltipFor(section.name, curve);
    if (el.getAttribute('title') !== title) el.setAttribute('title', title);
    return el;
  }

  /**
   * Remove the curve stylesheet.
   */
  function cleanup() {
    document.getElementById(STYLE_ID)?.remove();
  }

  // Export for use in content scripts
  window.MoxfieldExtended = window.MoxfieldExtended || {};
  window.MoxfieldExtended.sectionCurve = {
    view,
    cleanup,
  };
})();
