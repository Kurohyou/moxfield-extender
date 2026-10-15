/**
 * Test-only helpers for building Moxfield-shaped deck DOM from the captured
 * fixtures in this folder. ES module; never shipped with the extension.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const fixturesDir = dirname(fileURLToPath(import.meta.url));

/**
 * Read tests/fixtures/<name>.html.
 * @param {string} name - Fixture name without extension
 * @returns {string} Raw markup
 */
export function loadFixture(name) {
  return readFileSync(join(fixturesDir, `${name}.html`), 'utf8').trim();
}

/**
 * Parse a fixture into its first element.
 * @param {string} name
 * @returns {Element}
 */
function parseFixture(name) {
  const template = document.createElement('template');
  template.innerHTML = loadFixture(name);
  return template.content.firstElementChild;
}

const SPECIAL_TITLES = new Set(['Commander', 'Sideboard']);
// Hybrid ({G/W}) and twobrid ({2/G}) symbols carry an extra mana-split class.
const SPLIT_SYMBOL = /^(?:[wubrg]{2}|2[wubrg])$/;

let hashCounter = 0;

function symbol(suffix) {
  const split = SPLIT_SYMBOL.test(suffix) ? ' mana-split' : '';
  return `<span class="mana mana-${suffix} mana-cost${split} mana-shadow"></span>`;
}

/**
 * Render the inside of the cost cell.
 * @param {string[]|string[][]|null} cost - Class suffixes, or an array of
 *   groups for split cards. Empty/null renders the costless `<span></span>`.
 * @returns {string}
 */
function costMarkup(cost) {
  if (!cost || cost.length === 0) return '<span></span>';
  const groups = Array.isArray(cost[0]) ? cost : [cost];
  return groups
    .map((group) => `<span>${group.map(symbol).join('')}</span>`)
    .join('<span>&nbsp;//&nbsp;</span>');
}

function buildRow({ qty = 1, owner = false, cost = null, hash, name }) {
  const row = parseFixture(owner ? 'row-owner-land' : 'row-viewer-forest');
  hashCounter += 1;
  const rowHash = hash ?? `h${String(hashCounter).padStart(4, '0')}`;
  row.setAttribute('data-hash', rowHash);

  const qtyCell = row.firstElementChild;
  if (owner) {
    const input = qtyCell.querySelector('input');
    input.value = String(qty);
    input.setAttribute('value', String(qty));
  } else {
    qtyCell.querySelector('div').textContent = String(qty);
  }

  const link = row.querySelector('a.table-deck-row-link');
  link.removeAttribute('id');
  link.setAttribute('href', `/cards/${rowHash}`);
  link.innerHTML = '<span><span class="text-nowrap underline"></span></span>';
  link.querySelector('.underline').textContent = name ?? `Card ${rowHash}`;

  row.querySelector('div.text-nowrap.text-end').innerHTML = costMarkup(cost);
  return row;
}

function buildHeader({ title, count, price }) {
  let template = 'header-no-price-type-icon';
  if (SPECIAL_TITLES.has(title)) template = 'header-commander-single-no-price';
  else if (price != null) template = 'header-with-price';

  const header = parseFixture(template);
  const titleSpan = header.querySelector('span[title]');
  titleSpan.setAttribute('title', title);
  titleSpan.textContent = title;
  titleSpan.nextElementSibling.textContent = `(${count})`;

  if (price != null) {
    if (!header.querySelector('span.text-nowrap.fw-normal')) {
      // The Commander/Sideboard template has no price span; borrow the captured one.
      const priced = parseFixture('header-with-price');
      header.appendChild(priced.querySelector('span.text-nowrap.fw-normal'));
    }
    header.querySelector('span.text-nowrap.fw-normal').textContent = `– ${price}`;
  }
  return header;
}

/**
 * Build a deck page into document.body (replacing its content).
 * @param {Object} options
 * @param {number|null} [options.footerCount] - "N main deck" footer; omitted when null/undefined
 * @param {string|null} [options.footerText] - Raw text for the main-deck div (e.g. 'abc main deck' or ''),
 *   for garbled-footer tests; wins over footerCount when both are given
 * @param {string} [options.groupBy] - Selected value of select#groupBy; omitted when not given.
 *   Throws if it is not one of the captured options.
 * @param {Array<{title: string, count?: number, price?: string,
 *   rows: Array<{qty?: number, owner?: boolean, cost?: string[]|string[][]|null, hash?: string, name?: string}>}>} options.sections
 *   `count` defaults to the sum of row qty; `price` is the display text, e.g. '$61.22'.
 * @returns {{root: Element, sections: Array<{ul: Element, headerLi: Element}>,
 *   footer: Element|null, select: HTMLSelectElement|null}}
 */
export function buildDeck({ footerCount, footerText, groupBy, sections = [] } = {}) {
  hashCounter = 0;
  document.body.innerHTML = '';

  const root = document.createElement('section');
  root.className = 'deckview';
  const article = document.createElement('article');
  root.appendChild(article);

  const built = sections.map(({ title, count, price, rows = [] }) => {
    const ul = document.createElement('ul');
    const total = rows.reduce((sum, row) => sum + (row.qty ?? 1), 0);
    const headerLi = buildHeader({ title, count: count ?? total, price });
    ul.appendChild(headerLi);
    rows.forEach((row) => ul.appendChild(buildRow(row)));
    article.appendChild(ul);
    return { ul, headerLi };
  });
  document.body.appendChild(root);

  let footer = null;
  const mainDeckText = footerText ?? (footerCount != null ? `${footerCount} main deck` : null);
  if (mainDeckText != null) {
    footer = parseFixture('footer');
    footer.querySelector('div.text-nowrap.d-inline-block').textContent = mainDeckText;
    document.body.appendChild(footer);
  }

  let select = null;
  if (groupBy != null) {
    select = parseFixture('groupby-select');
    if (!Array.from(select.options).some((option) => option.value === groupBy)) {
      throw new Error(`buildDeck: unknown groupBy "${groupBy}"`);
    }
    select.value = groupBy;
    document.body.appendChild(select);
  }

  return { root, sections: built, footer, select };
}
