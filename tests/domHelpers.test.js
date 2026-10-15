import { describe, expect, it } from 'vitest';
import '../src/content/domHelpers.js';
import { buildDeck, loadFixture } from './fixtures/deckDom.js';

const { domHelpers } = window.MoxfieldExtended;

function rowFromFixture(name) {
  document.body.innerHTML = `<ul>${loadFixture(name)}</ul>`;
  return document.querySelector(domHelpers.SELECTORS.cardEntry);
}

describe('extractQuantity', () => {
  it('reads the viewer text cell', () => {
    expect(domHelpers.extractQuantity(rowFromFixture('row-viewer-forest'))).toBe(6);
  });

  it('reads the owner input value', () => {
    expect(domHelpers.extractQuantity(rowFromFixture('row-owner-land'))).toBe(13);
  });

  it('reads a builder-made owner row', () => {
    const { sections } = buildDeck({
      sections: [{ title: 'Lands', rows: [{ qty: 8, owner: true }] }],
    });
    const row = sections[0].ul.querySelector(domHelpers.SELECTORS.cardEntry);
    expect(domHelpers.extractQuantity(row)).toBe(8);
  });

  it('falls back to 1 when the cell is not a number', () => {
    const row = rowFromFixture('row-viewer-forest');
    row.firstElementChild.textContent = 'abc';
    expect(domHelpers.extractQuantity(row)).toBe(1);
  });
});

describe('SELECTORS.sectionHeader', () => {
  it('matches a header built inside section.deckview', () => {
    buildDeck({ sections: [{ title: 'Creatures', rows: [{ qty: 2 }] }] });
    expect(document.querySelectorAll(domHelpers.SELECTORS.sectionHeader)).toHaveLength(1);
  });

  it('ignores header-like markup outside section.deckview', () => {
    document.body.innerHTML = loadFixture('outside-header-trap');
    expect(document.querySelector('a.table-deck-row-link')).not.toBeNull();
    expect(document.querySelectorAll(domHelpers.SELECTORS.sectionHeader)).toHaveLength(0);
  });

  it('matches only the deck-list header when the trap is also on the page', () => {
    buildDeck({ sections: [{ title: 'Creatures', rows: [{ qty: 1 }] }] });
    document.body.insertAdjacentHTML('beforeend', loadFixture('outside-header-trap'));
    expect(document.querySelectorAll(domHelpers.SELECTORS.sectionHeader)).toHaveLength(1);
  });
});

describe('isDeckView', () => {
  it('is true only while a deck view is on the page', () => {
    buildDeck({ sections: [{ title: 'Creatures', rows: [{ qty: 1 }] }] });
    expect(domHelpers.isDeckView()).toBe(true);
    document.body.innerHTML = '<main><div class="deck-tile"></div></main>';
    expect(domHelpers.isDeckView()).toBe(false);
  });
});
