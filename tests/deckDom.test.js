import { describe, expect, it } from 'vitest';
import { buildDeck, loadFixture } from './fixtures/deckDom.js';

describe('buildDeck', () => {
  it('builds headers, rows, footer and groupBy', () => {
    const { root, sections } = buildDeck({
      footerCount: 99,
      groupBy: 'cmc',
      sections: [
        { title: 'Commander', rows: [{ qty: 1 }], price: '$1.00' },
        {
          title: 'Creatures',
          rows: [{ qty: 3, cost: ['2', 'w'] }, { qty: 2, owner: true, cost: [['gw', 'gw'], ['4', 'g']] }, { qty: 1 }],
        },
        { title: 'Sideboard', count: 5, rows: [] },
      ],
    });
    expect(root.matches('section.deckview')).toBe(true);
    expect(sections).toHaveLength(3);
    expect(sections[1].headerLi.textContent).toContain('Creatures(6)');
    expect(sections[2].headerLi.textContent).toContain('Sideboard(5)');
    expect(sections[0].headerLi.querySelector('span.text-nowrap.fw-normal').textContent).toContain('$1.00');
    const rows = sections[1].ul.querySelectorAll('li[data-testid="deck-view-table-row"]');
    expect(rows[0].querySelectorAll('.mana-cost')).toHaveLength(2);
    expect(rows[1].querySelectorAll('.mana-cost.mana-split')).toHaveLength(2);
    expect(rows[1].textContent).toContain('//');
    expect(rows[2].querySelectorAll('.mana-cost')).toHaveLength(0);
    expect(new Set(Array.from(rows, (r) => r.dataset.hash)).size).toBe(3);
    expect(document.querySelector('div.text-nowrap.d-inline-block').textContent).toBe('99 main deck');
    expect(document.querySelector('#groupBy').value).toBe('cmc');
    expect(root.contains(document.querySelector('div.text-nowrap.d-inline-block'))).toBe(false);
  });

  it('omits footer and groupBy when not given', () => {
    buildDeck({ sections: [] });
    expect(document.querySelector('#groupBy')).toBeNull();
    expect(document.querySelector('div.text-nowrap.d-inline-block')).toBeNull();
  });

  it('returns footer and select, and supports footerText', () => {
    const { footer, select } = buildDeck({ footerText: 'abc main deck', footerCount: 5, groupBy: 'type' });
    expect(footer.querySelector('div.text-nowrap.d-inline-block').textContent).toBe('abc main deck');
    expect(select.value).toBe('type');
    expect(buildDeck({ footerText: '' }).footer.querySelector('div.text-nowrap.d-inline-block').textContent).toBe('');
    expect(buildDeck({}).footer).toBeNull();
  });

  it('throws on an unknown groupBy', () => {
    expect(() => buildDeck({ groupBy: 'nope' })).toThrow(/unknown groupBy/);
  });

  it('sets names and prices as text, not markup, and resets generated hashes', () => {
    const rows = [{ name: '<b>x</b>' }];
    const { sections } = buildDeck({ sections: [{ title: 'Lands', price: '$1 <i>', rows }] });
    expect(sections[0].ul.querySelector('li[data-hash] .underline').textContent).toBe('<b>x</b>');
    expect(sections[0].ul.querySelector('li[data-hash] b')).toBeNull();
    expect(sections[0].headerLi.querySelector('span.text-nowrap.fw-normal').textContent).toBe('– $1 <i>');
    const hashOf = () => buildDeck({ sections: [{ title: 'Lands', rows: [{}] }] }).sections[0].ul.lastElementChild.dataset.hash;
    expect(hashOf()).toBe(hashOf());
  });

  it('loads fixtures as strings', () => {
    expect(loadFixture('footer')).toContain('136 main deck');
  });
});
