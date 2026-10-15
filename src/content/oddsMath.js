/**
 * Section odds maths for Moxfield Extended
 * Hypergeometric P(X >= desired) for a Section drawn from the Library.
 * Pure functions; no DOM access.
 */

// Cards in the opening hand. Cards seen by turn T = 7 + T.
const OPENING_HAND = 7;

// logFactorials[n] = ln(n!), grown on demand.
const logFactorials = [0, 0];

/**
 * ln(n!), from a cached table.
 * @param {number} n - Non-negative integer
 * @returns {number}
 */
function logFact(n) {
  for (let i = logFactorials.length; i <= n; i += 1) {
    logFactorials[i] = logFactorials[i - 1] + Math.log(i);
  }
  return logFactorials[n];
}

/**
 * ln(C(n, k))
 * @param {number} n
 * @param {number} k
 * @returns {number}
 */
function logC(n, k) {
  return logFact(n) - logFact(k) - logFact(n - k);
}

/**
 * Format a probability for the chip. Only certain/impossible results reach
 * 100% / 0%; anything that merely rounds there shows >99% / <1%.
 * @param {number} p - Probability strictly between 0 and 1
 * @returns {string}
 */
function formatOdds(p) {
  const rounded = Math.round(p * 100);
  if (rounded >= 100) return '>99%';
  if (rounded <= 0) return '<1%';
  return `${rounded}%`;
}

/**
 * Evaluate the odds of seeing at least `k` of a Section's cards.
 * Classification is combinatorial so 100% and 0% mean exactly certain and
 * impossible, never a rounding artefact of floating point.
 * @param {Object} params
 * @param {number} params.N - Library size (population)
 * @param {number} params.K - Section count (successes)
 * @param {number} params.turns - By turn T (0 is the opening hand)
 * @param {number} params.k - Desired number of the Section's cards (>= 1)
 * @returns {{kind: 'certain'|'impossible'|'odds', p: number, seen: number,
 *   wholeLibrary: boolean, label: string, tooltip: string}}
 */
function evaluate({ N, K, turns, k }) {
  const seen = Math.min(OPENING_HAND + turns, N);
  const wholeLibrary = OPENING_HAND + turns >= N;
  const base = { seen, wholeLibrary };

  if (k > Math.min(K, seen)) {
    const label = '0%';
    const tooltip =
      k > K
        ? `Only ${K} ${K === 1 ? 'card' : 'cards'} in Section; need ≥${k}`
        : `${label} ≥${k} by T${turns}`;
    return { kind: 'impossible', p: 0, label, tooltip, ...base };
  }

  if (k <= seen - (N - K)) {
    const label = '100%';
    const tooltip = wholeLibrary
      ? `${label} ≥${k}, whole Library seen`
      : `${label} ≥${k} by T${turns}`;
    return { kind: 'certain', p: 1, label, tooltip, ...base };
  }

  const logTotal = logC(N, seen);
  let p = 0;
  for (let x = k; x <= Math.min(K, seen); x += 1) {
    p += Math.exp(logC(K, x) + logC(N - K, seen - x) - logTotal);
  }
  p = Math.min(1, Math.max(0, p));

  const label = formatOdds(p);
  const tooltip = wholeLibrary
    ? `${label} ≥${k}, whole Library seen`
    : `${label} ≥${k} by T${turns}`;
  return { kind: 'odds', p, label, tooltip, ...base };
}

/**
 * Check that the Library and the Section counts can describe one deck.
 * @param {number} N - Library size read from the footer
 * @param {Array<{name: string, count: number}>} sections - Mainboard Sections
 * @returns {string|null} Reason odds can't be shown, or null when sane
 */
function libraryError(N, sections) {
  if (!Number.isInteger(N) || N <= 0) {
    return `Couldn't read the main deck count`;
  }
  const largest = sections.reduce(
    (max, section) => (section.count > max.count ? section : max),
    { count: -Infinity }
  );
  if (N < largest.count) {
    return `Library (${N}) is smaller than ${largest.name} (${largest.count})`;
  }
  return null;
}

// Export for use in content scripts
if (typeof window !== 'undefined') {
  window.MoxfieldExtended = window.MoxfieldExtended || {};
  window.MoxfieldExtended.oddsMath = {
    evaluate,
    libraryError,
    logFact,
    logC,
  };
}
