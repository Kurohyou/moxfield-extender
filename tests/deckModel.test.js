import { afterEach, describe, expect, it } from 'vitest';
import '../src/content/domHelpers.js';
import { buildDeck, loadFixture } from './fixtures/deckDom.js';

const { domHelpers } = window.MoxfieldExtended;

/**
 * Run a DOM change and collect the MutationRecords a real observer receives.
 * @param {Function} change - Mutates the DOM
 * @returns {Promise<MutationRecord[]>}
 */
async function recordMutations(change) {
  const records = [];
  const observer = new MutationObserver((batch) => records.push(...batch));
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  change();
  await new Promise((resolve) => setTimeout(resolve, 0));
  observer.disconnect();
  return records;
}

function moxSpan(text = '63%') {
  const span = document.createElement('span');
  span.setAttribute('data-mox', 'chip');
  span.textContent = text;
  return span;
}

function theirSpan(text = '$1.00') {
  const span = document.createElement('span');
  span.textContent = text;
  return span;
}

describe('getMainboardSections', () => {
  it('excludes special Boards, keeps Untagged Sections and preserves DOM order', () => {
    buildDeck({
      sections: [
        { title: 'Commander', rows: [{ qty: 1 }] },
        { title: 'Creatures', rows: [{ qty: 3 }] },
        { title: 'Companion', rows: [{ qty: 1 }] },
        { title: 'Untagged Creatures', rows: [{ qty: 2 }] },
        { title: 'Lands', rows: [{ qty: 4 }] },
        { title: 'Sideboard', rows: [{ qty: 2 }] },
      ],
    });

    const sections = domHelpers.getMainboardSections();
    expect(sections.map((s) => s.name)).toEqual(['Creatures', 'Untagged Creatures', 'Lands']);
    expect(sections.map((s) => s.count)).toEqual([3, 2, 4]);
  });

  it.each([
    'Commander',
    'Companion',
    'Sideboard',
    'Signature Spell',
    'Oathbreaker',
    'Arthur',
    'Excalibur',
    'Attraction Deck',
    'Contraption Deck',
    'Stickers',
  ])('skips the %s Board', (title) => {
    buildDeck({
      sections: [
        { title, rows: [{ qty: 1 }] },
        { title: 'Creatures', rows: [{ qty: 1 }] },
      ],
    });
    expect(domHelpers.getMainboardSections().map((s) => s.name)).toEqual(['Creatures']);
  });

  it('exports SPECIAL_BOARD_TITLES', () => {
    expect(Array.from(domHelpers.SPECIAL_BOARD_TITLES).sort()).toEqual(
      [
        'Commander',
        'Companion',
        'Sideboard',
        'Signature Spell',
        'Oathbreaker',
        'Arthur',
        'Excalibur',
        'Attraction Deck',
        'Contraption Deck',
        'Stickers',
      ].sort()
    );
  });

  it('returns ul, headerLi and link for each Section', () => {
    const { sections: built } = buildDeck({
      sections: [{ title: 'Creatures', rows: [{ qty: 1 }] }],
    });
    const [section] = domHelpers.getMainboardSections();
    expect(section.ul).toBe(built[0].ul);
    expect(section.headerLi).toBe(built[0].headerLi);
    expect(section.link).toBe(built[0].headerLi.querySelector('a.table-deck-row-link'));
  });

  it('reads a name containing a parenthesis from span[title]', () => {
    buildDeck({
      sections: [{ title: 'Ramp (fast)', count: 5, rows: [{ qty: 5 }] }],
    });
    const [section] = domHelpers.getMainboardSections();
    expect(section.name).toBe('Ramp (fast)');
    expect(section.count).toBe(5);
  });

  it('reads the count of a header with a price', () => {
    buildDeck({
      sections: [{ title: 'card advantage', count: 15, price: '$61.22', rows: [{ qty: 15 }] }],
    });
    const [section] = domHelpers.getMainboardSections();
    expect(section.name).toBe('card advantage');
    expect(section.count).toBe(15);
  });

  it('falls back to the link text when the count span is not right after the title', () => {
    const { sections: built } = buildDeck({
      sections: [{ title: 'Creatures', count: 9, rows: [{ qty: 1 }] }],
    });
    const countSpan = built[0].headerLi.querySelector('span[title]').nextElementSibling;
    countSpan.replaceWith(document.createTextNode('(7)'));

    expect(domHelpers.getMainboardSections()[0].count).toBe(7);
  });

  it('returns a null count when neither the span nor the link text has one', () => {
    const { sections: built } = buildDeck({
      sections: [{ title: 'Creatures', count: 9, rows: [{ qty: 1 }] }],
    });
    built[0].headerLi.querySelector('span[title]').nextElementSibling.remove();

    expect(domHelpers.getMainboardSections()[0].count).toBeNull();
  });

  it('returns null, never NaN, for a garbled count', () => {
    const { sections: built } = buildDeck({
      sections: [{ title: 'Creatures', count: 9, rows: [{ qty: 1 }] }],
    });
    built[0].headerLi.querySelector('span[title]').nextElementSibling.textContent = '(abc)';

    expect(domHelpers.getMainboardSections()[0].count).toBeNull();
  });

  it('returns the rows of each Section', () => {
    const { sections: built } = buildDeck({
      sections: [
        { title: 'Creatures', rows: [{ qty: 2, hash: 'aa' }, { qty: 1, hash: 'bb' }] },
        { title: 'Lands', rows: [{ qty: 6, hash: 'cc' }] },
        { title: 'Empty', count: 0, rows: [] },
      ],
    });
    const sections = domHelpers.getMainboardSections();

    expect(sections[0].rows.map((r) => r.getAttribute('data-hash'))).toEqual(['aa', 'bb']);
    expect(sections[0].rows[0].parentElement).toBe(built[0].ul);
    expect(sections[1].rows.map((r) => r.getAttribute('data-hash'))).toEqual(['cc']);
    expect(sections[2].rows).toEqual([]);
  });

  it('never treats header-like markup outside section.deckview as a Section', () => {
    buildDeck({ sections: [{ title: 'Lands', rows: [{ qty: 1 }] }] });
    document.body.insertAdjacentHTML('beforeend', loadFixture('outside-header-trap'));

    expect(domHelpers.getMainboardSections().map((s) => s.name)).toEqual(['Lands']);
  });

  it('returns nothing when there is no deck list', () => {
    document.body.innerHTML = loadFixture('outside-header-trap');
    expect(domHelpers.getMainboardSections()).toEqual([]);
  });
});

describe('readLibrary', () => {
  it('subtracts a partner Commander(2) from the footer', () => {
    buildDeck({
      footerCount: 136,
      sections: [
        { title: 'Commander', count: 2, rows: [{ qty: 2 }] },
        { title: 'Creatures', rows: [{ qty: 3 }] },
      ],
    });
    expect(domHelpers.readLibrary()).toEqual({ ok: true, value: 134 });
  });

  it('subtracts a single Commander (1) from the viewer footer', () => {
    buildDeck({
      footerCount: 104,
      sections: [
        { title: 'Commander', count: 1, rows: [{ qty: 1 }] },
        { title: 'Creatures', rows: [{ qty: 3 }] },
      ],
    });
    expect(domHelpers.readLibrary()).toEqual({ ok: true, value: 103 });
  });

  it('subtracts 0 when there is no Commander Section', () => {
    buildDeck({
      footerCount: 99,
      sections: [{ title: 'Creatures', rows: [{ qty: 3 }] }],
    });
    expect(domHelpers.readLibrary()).toEqual({ ok: true, value: 99 });
  });

  it('is not fooled by a Commander lookalike outside section.deckview', () => {
    buildDeck({
      footerCount: 99,
      sections: [{ title: 'Creatures', rows: [{ qty: 3 }] }],
    });
    document.body.insertAdjacentHTML('beforeend', loadFixture('header-commander-partner'));
    expect(domHelpers.readLibrary()).toEqual({ ok: true, value: 99 });
  });

  it('reports a missing footer', () => {
    buildDeck({ sections: [{ title: 'Creatures', rows: [{ qty: 3 }] }] });
    expect(domHelpers.readLibrary()).toEqual({
      ok: false,
      reason: `Couldn't read the main deck count`,
    });
  });

  it.each([['abc main deck'], ['']])('reports a garbled footer (%j)', (footerText) => {
    buildDeck({ footerText, sections: [{ title: 'Creatures', rows: [{ qty: 3 }] }] });
    const result = domHelpers.readLibrary();
    expect(result.ok).toBe(false);
    expect(result.reason).toBe(`Couldn't read the main deck count`);
  });

  it('reports an unreadable Commander count', () => {
    const { sections } = buildDeck({
      footerCount: 100,
      sections: [{ title: 'Commander', count: 1, rows: [{ qty: 1 }] }],
    });
    sections[0].headerLi.querySelector('span[title]').nextElementSibling.remove();

    const result = domHelpers.readLibrary();
    expect(result.ok).toBe(false);
    expect(typeof result.reason).toBe('string');
    expect(result.reason.length).toBeGreaterThan(0);
  });

  it('picks up a replaced footer element', () => {
    buildDeck({ footerCount: 136, sections: [{ title: 'Creatures', rows: [{ qty: 1 }] }] });
    expect(domHelpers.readLibrary()).toEqual({ ok: true, value: 136 });

    buildDeck({ footerCount: 100, sections: [{ title: 'Creatures', rows: [{ qty: 1 }] }] });
    expect(domHelpers.readLibrary()).toEqual({ ok: true, value: 100 });
  });

  it('picks up changed footer text on the same element', () => {
    const { footer } = buildDeck({
      footerCount: 136,
      sections: [{ title: 'Creatures', rows: [{ qty: 1 }] }],
    });
    expect(domHelpers.readLibrary()).toEqual({ ok: true, value: 136 });

    footer.querySelector('div.text-nowrap.d-inline-block').textContent = '120 main deck';
    expect(domHelpers.readLibrary()).toEqual({ ok: true, value: 120 });

    footer.querySelector('div.text-nowrap.d-inline-block').textContent = 'abc main deck';
    expect(domHelpers.readLibrary().ok).toBe(false);
  });

  it('finds the footer again after it disappears and returns', () => {
    const { footer } = buildDeck({
      footerCount: 136,
      sections: [{ title: 'Creatures', rows: [{ qty: 1 }] }],
    });
    expect(domHelpers.readLibrary().ok).toBe(true);

    footer.remove();
    expect(domHelpers.readLibrary().ok).toBe(false);

    document.body.appendChild(footer);
    expect(domHelpers.readLibrary()).toEqual({ ok: true, value: 136 });
  });
});

describe('getGroupBy', () => {
  it('returns the selected value', () => {
    buildDeck({ groupBy: 'tag', sections: [] });
    expect(domHelpers.getGroupBy()).toBe('tag');
  });

  it('works when the select is hidden', () => {
    const { select } = buildDeck({ groupBy: 'subType', sections: [] });
    select.style.display = 'none';
    expect(domHelpers.getGroupBy()).toBe('subType');
  });

  it(`defaults to 'type' without the select`, () => {
    buildDeck({ sections: [] });
    expect(domHelpers.getGroupBy()).toBe('type');
  });
});

describe('getDeckId and isGoldfishMode', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('reads the deck id from the path', () => {
    window.history.pushState({}, '', '/decks/abc123');
    expect(domHelpers.getDeckId()).toBe('abc123');
    expect(domHelpers.isGoldfishMode()).toBe(false);
  });

  it('reads the deck id in goldfish mode', () => {
    window.history.pushState({}, '', '/decks/abc123/goldfish');
    expect(domHelpers.getDeckId()).toBe('abc123');
    expect(domHelpers.isGoldfishMode()).toBe(true);
  });

  it('keeps hyphens and underscores in the id', () => {
    window.history.pushState({}, '', '/decks/a_b-C9');
    expect(domHelpers.getDeckId()).toBe('a_b-C9');
  });

  it('returns null off a deck page', () => {
    window.history.pushState({}, '', '/users/someone');
    expect(domHelpers.getDeckId()).toBeNull();
  });
});

describe('isOwnMutation', () => {
  it('is own when we insert a [data-mox] node into a header', async () => {
    const { sections } = buildDeck({ sections: [{ title: 'Creatures', rows: [{ qty: 1 }] }] });
    const records = await recordMutations(() => sections[0].headerLi.appendChild(moxSpan()));

    expect(records).toHaveLength(1);
    expect(domHelpers.isOwnMutation(records[0])).toBe(true);
  });

  it('is own when a node inside a [data-mox] subtree is added', async () => {
    const { sections } = buildDeck({ sections: [{ title: 'Creatures', rows: [{ qty: 1 }] }] });
    const chip = moxSpan();
    sections[0].headerLi.appendChild(chip);

    const records = await recordMutations(() => chip.appendChild(theirSpan('inner')));
    expect(records).toHaveLength(1);
    expect(domHelpers.isOwnMutation(records[0])).toBe(true);
  });

  it('is own when we replace the text inside our node', async () => {
    const { sections } = buildDeck({ sections: [{ title: 'Creatures', rows: [{ qty: 1 }] }] });
    const chip = moxSpan();
    sections[0].headerLi.appendChild(chip);

    const records = await recordMutations(() => {
      chip.textContent = '64%';
    });
    expect(records.length).toBeGreaterThan(0);
    expect(records.every((r) => domHelpers.isOwnMutation(r))).toBe(true);
  });

  it('is own when a text node inside our node changes (characterData)', async () => {
    const { sections } = buildDeck({ sections: [{ title: 'Creatures', rows: [{ qty: 1 }] }] });
    const chip = moxSpan();
    sections[0].headerLi.appendChild(chip);

    const records = await recordMutations(() => {
      chip.firstChild.data = '65%';
    });
    expect(records).toHaveLength(1);
    expect(records[0].type).toBe('characterData');
    expect(domHelpers.isOwnMutation(records[0])).toBe(true);
  });

  it('is own when we remove our node', async () => {
    const { sections } = buildDeck({ sections: [{ title: 'Creatures', rows: [{ qty: 1 }] }] });
    const chip = moxSpan();
    sections[0].headerLi.appendChild(chip);

    const records = await recordMutations(() => chip.remove());
    expect(records).toHaveLength(1);
    expect(records[0].removedNodes).toHaveLength(1);
    expect(domHelpers.isOwnMutation(records[0])).toBe(true);
  });

  it('is own when we remove a wrapper that is itself [data-mox]', async () => {
    const { sections } = buildDeck({ sections: [{ title: 'Creatures', rows: [{ qty: 1 }] }] });
    const cluster = moxSpan('');
    cluster.appendChild(moxSpan('a'));
    sections[0].headerLi.appendChild(cluster);

    const records = await recordMutations(() => cluster.remove());
    expect(records.every((r) => domHelpers.isOwnMutation(r))).toBe(true);
  });

  it('is not own when Moxfield inserts a row', async () => {
    const { sections } = buildDeck({
      sections: [{ title: 'Creatures', rows: [{ qty: 1 }, { qty: 1 }] }],
    });
    const [firstRow] = sections[0].ul.querySelectorAll('li[data-hash]');
    const records = await recordMutations(() => sections[0].ul.appendChild(firstRow.cloneNode(true)));

    expect(records).toHaveLength(1);
    expect(domHelpers.isOwnMutation(records[0])).toBe(false);
  });

  it('is not own when Moxfield removes a row', async () => {
    const { sections } = buildDeck({ sections: [{ title: 'Creatures', rows: [{ qty: 1 }] }] });
    const records = await recordMutations(() =>
      sections[0].ul.querySelector('li[data-hash]').remove()
    );
    expect(domHelpers.isOwnMutation(records[0])).toBe(false);
  });

  it('is not own when ours and theirs are added together', async () => {
    const { sections } = buildDeck({ sections: [{ title: 'Creatures', rows: [{ qty: 1 }] }] });
    const records = await recordMutations(() =>
      sections[0].headerLi.append(moxSpan(), theirSpan())
    );

    expect(records).toHaveLength(1);
    expect(records[0].addedNodes).toHaveLength(2);
    expect(domHelpers.isOwnMutation(records[0])).toBe(false);
  });

  it('is not own when we replace their node with ours', async () => {
    const { sections } = buildDeck({ sections: [{ title: 'Creatures', rows: [{ qty: 1 }] }] });
    const theirs = theirSpan();
    sections[0].headerLi.appendChild(theirs);

    const records = await recordMutations(() => theirs.replaceWith(moxSpan()));
    expect(records.some((r) => !domHelpers.isOwnMutation(r))).toBe(true);
  });

  it('is not own when Moxfield adds a bare text node', async () => {
    const { sections } = buildDeck({ sections: [{ title: 'Creatures', rows: [{ qty: 1 }] }] });
    const records = await recordMutations(() =>
      sections[0].headerLi.appendChild(document.createTextNode('x'))
    );
    expect(domHelpers.isOwnMutation(records[0])).toBe(false);
  });

  it('is not own when a text node outside our nodes changes', async () => {
    const { sections } = buildDeck({ sections: [{ title: 'Creatures', rows: [{ qty: 1 }] }] });
    const theirs = theirSpan();
    sections[0].headerLi.appendChild(theirs);

    const records = await recordMutations(() => {
      theirs.firstChild.data = '$2.00';
    });
    expect(domHelpers.isOwnMutation(records[0])).toBe(false);
  });

  it('is not own with no added or removed nodes and a target outside our nodes', () => {
    const { sections } = buildDeck({ sections: [{ title: 'Creatures', rows: [{ qty: 1 }] }] });
    const record = { target: sections[0].headerLi, addedNodes: [], removedNodes: [] };
    expect(domHelpers.isOwnMutation(record)).toBe(false);
  });

  it('is own with no added or removed nodes when the target is inside our node', () => {
    const { sections } = buildDeck({ sections: [{ title: 'Creatures', rows: [{ qty: 1 }] }] });
    const chip = moxSpan();
    sections[0].headerLi.appendChild(chip);
    const record = { target: chip, addedNodes: [], removedNodes: [] };
    expect(domHelpers.isOwnMutation(record)).toBe(true);
  });
});
