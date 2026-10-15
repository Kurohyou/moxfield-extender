import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDeck } from './fixtures/deckDom.js';

let sectionOdds;
let deckSettings;
let domHelpers;
let oddsMath;
let popover;
let deck;

/**
 * Build the standard test deck: footer 100, Commander (1), Creatures (30),
 * Lands (owner rows, 20). Library = 99.
 * @param {Object} [options] - Overrides for buildDeck
 * @returns {Object} buildDeck's result
 */
function build(options = {}) {
  return buildDeck({
    footerCount: 100,
    sections: [
      { title: 'Commander', rows: [{ qty: 1, cost: ['3', 'g'] }] },
      {
        title: 'Creatures',
        rows: [
          { qty: 20, cost: ['2'] },
          { qty: 10, cost: ['3'] },
        ],
      },
      { title: 'Lands', rows: [{ qty: 20, owner: true, cost: [] }] },
    ],
    ...options,
  });
}

/**
 * The refresh context, read fresh from the DOM the way the caller will.
 * @returns {Object}
 */
function ctxFor() {
  const library = domHelpers.readLibrary();
  const sections = domHelpers.getMainboardSections();
  return {
    library,
    libraryError: library.ok
      ? oddsMath.libraryError(library.value, sections)
      : null,
    groupBy: domHelpers.getGroupBy(),
    deckSettings,
  };
}

/**
 * A mainboard Section by name.
 * @param {string} name
 * @returns {Object}
 */
function section(name) {
  return domHelpers.getMainboardSections().find((s) => s.name === name);
}

/**
 * Render a Section's chip and put it in its header, as 5B will.
 * @param {string} name
 * @returns {HTMLElement}
 */
function mountChip(name) {
  const s = section(name);
  const chip = sectionOdds.view(s, ctxFor(), null);
  s.headerLi.appendChild(chip);
  return chip;
}

/**
 * Hover an element.
 * @param {Element} target
 */
function hover(target) {
  target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
}

/**
 * Dispatch a keydown and return it.
 * @param {Element} target
 * @param {Object} init
 * @returns {KeyboardEvent}
 */
function key(target, init) {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

const ALT_PLUS = { altKey: true, code: 'Equal', key: '≠' };
const ALT_MINUS = { altKey: true, code: 'Minus', key: '–' };

/**
 * Dispatch a cancelable mouse event and return it.
 * @param {Element} target
 * @param {string} type
 * @returns {MouseEvent}
 */
function mouse(target, type) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

/**
 * Collect every mutation record on a subtree while `fn` runs.
 * @param {Node} node
 * @param {function(): void} fn
 * @returns {Promise<MutationRecord[]>}
 */
async function recordMutations(node, fn) {
  const records = [];
  const observer = new MutationObserver((batch) => records.push(...batch));
  observer.observe(node, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });
  fn();
  await Promise.resolve();
  records.push(...observer.takeRecords());
  observer.disconnect();
  return records;
}

/**
 * The open stepper's root.
 * @returns {HTMLElement|null}
 */
function stepper() {
  return document.querySelector('.mox-popover');
}

beforeEach(async () => {
  vi.resetModules();
  document.head.innerHTML = '';
  await import('../src/content/domHelpers.js');
  await import('../src/content/oddsMath.js');
  await import('../src/content/deckSettings.js');
  await import('../src/content/popover.js');
  await import('../src/content/sectionOdds.js');
  ({ sectionOdds, deckSettings, domHelpers, oddsMath, popover } =
    window.MoxfieldExtended);

  deck = build();
  window.history.pushState({}, '', '/decks/abc');
  window.MoxfieldExtended.state = {
    settings: { sectionOddsEnabled: true, sectionCurveEnabled: true },
  };
  await deckSettings.ensureLoaded('abc');
  // jsdom has no layout. Give every element a visible box, or the popover
  // treats the stepper's anchor as hidden and closes on update().
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    top: 100,
    bottom: 120,
    left: 500,
    right: 540,
    width: 40,
    height: 20,
    x: 500,
    y: 100,
  });
  sectionOdds.init();
});

afterEach(async () => {
  sectionOdds.cleanup();
  popover.close();
  await deckSettings.flush();
  vi.restoreAllMocks();
});

describe('view', () => {
  it('shows the evaluate label as text and its tooltip as title', () => {
    const chip = sectionOdds.view(section('Creatures'), ctxFor(), null);
    const expected = oddsMath.evaluate({ N: 99, K: 30, turns: 3, k: 1 });
    expect(chip.matches('span.mox-odds[data-mox]')).toBe(true);
    expect(chip.textContent).toBe(expected.label);
    expect(chip.title).toBe(expected.tooltip);
  });

  it('uses the per-deck turns and the Section desired', () => {
    deckSettings.setTurns(5);
    deckSettings.setOverride('type', 'Creatures', 3);
    const chip = sectionOdds.view(section('Creatures'), ctxFor(), null);
    const expected = oddsMath.evaluate({ N: 99, K: 30, turns: 5, k: 3 });
    expect(chip.title).toBe(expected.tooltip);
  });

  it('shows ? with the reason when the footer is missing', () => {
    build({ footerCount: null });
    const chip = sectionOdds.view(section('Creatures'), ctxFor(), null);
    expect(chip.textContent).toBe('?');
    expect(chip.title).toBe(domHelpers.readLibrary().reason);
  });

  it('shows ? with the libraryError reason', () => {
    const ctx = { ...ctxFor(), libraryError: 'Library (5) is smaller' };
    const chip = sectionOdds.view(section('Creatures'), ctx, null);
    expect(chip.textContent).toBe('?');
    expect(chip.title).toBe('Library (5) is smaller');
  });

  it('shows ? when the Section count is unreadable', () => {
    const s = { ...section('Creatures'), count: null };
    const chip = sectionOdds.view(s, ctxFor(), null);
    expect(chip.textContent).toBe('?');
    expect(chip.title).toMatch(/card count/);
  });

  it('shows ? and warns once if evaluate throws', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const s = { ...section('Creatures'), count: 2.5 };
    const chip = sectionOdds.view(s, ctxFor(), null);
    sectionOdds.view(s, ctxFor(), chip);
    expect(chip.textContent).toBe('?');
    expect(chip.title).not.toBe('');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('toggles the override class', () => {
    const chip = sectionOdds.view(section('Creatures'), ctxFor(), null);
    expect(chip.classList.contains('mox-odds--override')).toBe(false);

    deckSettings.setOverride('type', 'Creatures', 2);
    sectionOdds.view(section('Creatures'), ctxFor(), chip);
    expect(chip.classList.contains('mox-odds--override')).toBe(true);

    deckSettings.setOverride('type', 'Creatures', null);
    sectionOdds.view(section('Creatures'), ctxFor(), chip);
    expect(chip.classList.contains('mox-odds--override')).toBe(false);
  });

  it('updates prevEl in place', () => {
    const chip = sectionOdds.view(section('Creatures'), ctxFor(), null);
    deckSettings.setOverride('type', 'Creatures', 40);
    expect(sectionOdds.view(section('Creatures'), ctxFor(), chip)).toBe(chip);
    expect(chip.textContent).toBe('0%');
  });

  it('makes zero DOM writes on a second view with nothing changed', async () => {
    deckSettings.setOverride('type', 'Creatures', 2);
    const chip = mountChip('Creatures');
    const records = await recordMutations(chip, () => {
      sectionOdds.view(section('Creatures'), ctxFor(), chip);
    });
    expect(records).toEqual([]);
  });

  it('injects its stylesheet once', () => {
    sectionOdds.view(section('Creatures'), ctxFor(), null);
    sectionOdds.view(section('Lands'), ctxFor(), null);
    const styles = document.querySelectorAll('style#mox-odds-styles');
    expect(styles).toHaveLength(1);
    expect(styles[0].hasAttribute('data-mox')).toBe(true);
  });
});

describe('Alt+= / Alt+−', () => {
  it('Alt+= on a hovered Section creates an override', () => {
    hover(section('Creatures').rows[0]);
    const event = key(document.body, ALT_PLUS);
    expect(deckSettings.desiredFor('type', 'Creatures')).toBe(2);
    expect(deckSettings.isOverridden('type', 'Creatures')).toBe(true);
    expect(event.defaultPrevented).toBe(true);
  });

  it('Alt+− back to the default deletes the override', () => {
    hover(section('Creatures').rows[0]);
    key(document.body, ALT_PLUS);
    key(document.body, ALT_MINUS);
    expect(deckSettings.isOverridden('type', 'Creatures')).toBe(false);
    expect(deckSettings.get().overrides.type).toBeUndefined();
  });

  it('Alt+− never goes below 1', () => {
    hover(section('Creatures').rows[0]);
    key(document.body, ALT_MINUS);
    expect(deckSettings.desiredFor('type', 'Creatures')).toBe(1);
  });

  it('accepts Shift and the numpad keys', () => {
    hover(section('Creatures').rows[0]);
    key(document.body, {
      altKey: true,
      shiftKey: true,
      code: 'Equal',
      key: '±',
    });
    key(document.body, { altKey: true, code: 'NumpadAdd', key: '+' });
    key(document.body, { altKey: true, code: 'NumpadSubtract', key: '-' });
    expect(deckSettings.desiredFor('type', 'Creatures')).toBe(2);
  });

  it('matches code, not key (macOS Option characters)', () => {
    hover(section('Creatures').rows[0]);
    key(document.body, { altKey: true, code: 'Equal', key: 'ø' });
    expect(deckSettings.desiredFor('type', 'Creatures')).toBe(2);
  });

  it('uses the Group-by mode as the override bucket', () => {
    build({ groupBy: 'tag' });
    hover(section('Creatures').rows[0]);
    key(document.body, ALT_PLUS);
    expect(deckSettings.desiredFor('tag', 'Creatures')).toBe(2);
    expect(deckSettings.desiredFor('type', 'Creatures')).toBe(1);
  });

  it('tracks hover from the header too', () => {
    hover(section('Lands').headerLi);
    key(document.body, ALT_PLUS);
    expect(deckSettings.desiredFor('type', 'Lands')).toBe(2);
  });

  it('is ignored when the target is an input', () => {
    const row = section('Lands').rows[0];
    hover(row);
    const event = key(row.querySelector('input'), ALT_PLUS);
    expect(deckSettings.isOverridden('type', 'Lands')).toBe(false);
    expect(event.defaultPrevented).toBe(false);
  });

  it('is ignored inside a contenteditable', () => {
    hover(section('Creatures').rows[0]);
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    editor.innerHTML = '<p>x</p>';
    document.body.appendChild(editor);
    key(editor.firstElementChild, ALT_PLUS);
    expect(deckSettings.isOverridden('type', 'Creatures')).toBe(false);
  });

  it('is ignored with Ctrl or Meta', () => {
    hover(section('Creatures').rows[0]);
    const ctrl = key(document.body, { ...ALT_PLUS, ctrlKey: true });
    key(document.body, { ...ALT_PLUS, metaKey: true });
    expect(deckSettings.isOverridden('type', 'Creatures')).toBe(false);
    expect(ctrl.defaultPrevented).toBe(false);
  });

  it('is ignored without Alt, or for other keys', () => {
    hover(section('Creatures').rows[0]);
    key(document.body, { code: 'Equal', key: '=' });
    key(document.body, { altKey: true, code: 'KeyO', key: 'ø' });
    expect(deckSettings.isOverridden('type', 'Creatures')).toBe(false);
  });

  it('is ignored when not hovering a Section', () => {
    hover(section('Creatures').rows[0]);
    hover(deck.footer);
    const event = key(document.body, ALT_PLUS);
    expect(deckSettings.get().overrides.type).toBeUndefined();
    expect(event.defaultPrevented).toBe(false);
  });

  it('is ignored when hovering the Commander Section', () => {
    hover(deck.sections[0].ul.lastElementChild);
    const event = key(document.body, ALT_PLUS);
    expect(deckSettings.get().overrides.type).toBeUndefined();
    expect(event.defaultPrevented).toBe(false);
  });

  it('is ignored when Section odds are off', () => {
    window.MoxfieldExtended.state.settings.sectionOddsEnabled = false;
    hover(section('Creatures').rows[0]);
    const event = key(document.body, ALT_PLUS);
    expect(deckSettings.isOverridden('type', 'Creatures')).toBe(false);
    expect(event.defaultPrevented).toBe(false);
  });

  it('forgets the hovered Section when the window loses focus', () => {
    hover(section('Creatures').rows[0]);
    window.dispatchEvent(new Event('blur'));
    const event = key(document.body, ALT_PLUS);
    expect(deckSettings.isOverridden('type', 'Creatures')).toBe(false);
    expect(event.defaultPrevented).toBe(false);
  });

  it('forgets the hovered Section when the pointer leaves the page', () => {
    hover(section('Creatures').rows[0]);
    document.dispatchEvent(new MouseEvent('mouseleave'));
    key(document.body, ALT_PLUS);
    expect(deckSettings.isOverridden('type', 'Creatures')).toBe(false);
  });

  it('init() is idempotent: one keypress steps once', () => {
    sectionOdds.init();
    hover(section('Creatures').rows[0]);
    key(document.body, ALT_PLUS);
    expect(deckSettings.desiredFor('type', 'Creatures')).toBe(2);
  });

  it('cleanup() removes the listeners', () => {
    sectionOdds.cleanup();
    hover(section('Creatures').rows[0]);
    const event = key(document.body, ALT_PLUS);
    expect(deckSettings.isOverridden('type', 'Creatures')).toBe(false);
    expect(event.defaultPrevented).toBe(false);
  });
});

describe('chip clicks', () => {
  it('right-click on a chip suppresses the menu and opens the stepper', () => {
    const chip = mountChip('Creatures');
    const event = mouse(chip, 'contextmenu');
    expect(event.defaultPrevented).toBe(true);
    expect(popover.isOpen()).toBe(true);
    expect(stepper().textContent).toContain('Creatures · 30 cards');
  });

  it('right-click on a shared slot showing the curve opens the stepper', () => {
    const s = section('Creatures');
    const cluster = document.createElement('span');
    cluster.className = 'mox-cluster';
    cluster.setAttribute('data-mox', '');
    cluster.dataset.layout = 'shared';
    cluster.dataset.shows = 'curve';
    cluster.innerHTML = '<span class="mox-curve"><span></span></span>';
    cluster.appendChild(sectionOdds.view(s, ctxFor(), null));
    s.headerLi.appendChild(cluster);

    const event = mouse(
      cluster.querySelector('.mox-curve span'),
      'contextmenu'
    );
    expect(event.defaultPrevented).toBe(true);
    expect(stepper().textContent).toContain('Creatures · 30 cards');
  });

  it('leaves right-clicks on a curve outside a shared slot alone', () => {
    const s = section('Creatures');
    const cluster = document.createElement('span');
    cluster.className = 'mox-cluster';
    cluster.dataset.layout = 'both';
    cluster.dataset.shows = 'curve';
    cluster.innerHTML = '<span class="mox-curve"></span>';
    s.headerLi.appendChild(cluster);

    const event = mouse(cluster.firstElementChild, 'contextmenu');
    expect(event.defaultPrevented).toBe(false);
    expect(popover.isOpen()).toBe(false);
  });

  it('leaves the menu alone when the stepper cannot open', () => {
    const header = document.querySelector('section.deckview article > ul > li');
    const chip = sectionOdds.view(section('Creatures'), ctxFor(), null);
    header.appendChild(chip); // a chip in the Commander header
    const event = mouse(chip, 'contextmenu');
    expect(event.defaultPrevented).toBe(false);
    expect(popover.isOpen()).toBe(false);
  });

  it('leaves right-clicks elsewhere alone', () => {
    const event = mouse(section('Creatures').rows[0], 'contextmenu');
    expect(event.defaultPrevented).toBe(false);
    expect(popover.isOpen()).toBe(false);
  });

  it('left-click on a standalone chip does nothing and does not propagate', () => {
    const chip = mountChip('Creatures');
    const seen = vi.fn();
    chip.parentElement.addEventListener('click', seen);
    const event = mouse(chip, 'click');
    expect(event.defaultPrevented).toBe(true);
    expect(seen).not.toHaveBeenCalled();
    expect(popover.isOpen()).toBe(false);
  });

  it('left-click on a chip in a shared slot is left for the cluster', () => {
    const s = section('Creatures');
    const cluster = document.createElement('span');
    cluster.className = 'mox-cluster';
    cluster.dataset.layout = 'shared';
    cluster.dataset.shows = 'odds';
    const chip = sectionOdds.view(s, ctxFor(), null);
    cluster.appendChild(chip);
    s.headerLi.appendChild(cluster);

    const event = mouse(chip, 'click');
    expect(event.defaultPrevented).toBe(false);
  });

  it('cleanup() stops right-clicks opening the stepper', () => {
    const chip = mountChip('Creatures');
    sectionOdds.cleanup();
    const event = mouse(chip, 'contextmenu');
    expect(event.defaultPrevented).toBe(false);
    expect(popover.isOpen()).toBe(false);
  });
});

describe('stepper', () => {
  /**
   * Open the stepper on the Creatures chip.
   * @returns {HTMLElement} The chip
   */
  function openCreatures() {
    const chip = mountChip('Creatures');
    sectionOdds.openStepper(chip, 'Creatures');
    return chip;
  }

  const dec = () => stepper().querySelector('.mox-stepper__dec');
  const inc = () => stepper().querySelector('.mox-stepper__inc');
  const value = () =>
    stepper().querySelector('.mox-stepper__value').textContent;
  const reset = () => stepper().querySelector('.mox-stepper__reset');

  it('labels the dialog and its buttons with the Section name', () => {
    openCreatures();
    expect(stepper().getAttribute('aria-label')).toContain('Creatures');
    expect(dec().getAttribute('aria-label')).toBe(
      'Decrease at-least count for Creatures'
    );
    expect(inc().getAttribute('aria-label')).toBe(
      'Increase at-least count for Creatures'
    );
  });

  it('does not colour Reset with the link colour (unreadable in dark mode)', () => {
    openCreatures();
    const css = document.getElementById('mox-odds-styles').textContent;
    expect(css).not.toContain('--bs-link-color');
  });

  it('shows the Section, its count, the full form and the desired value', () => {
    openCreatures();
    const expected = oddsMath.evaluate({ N: 99, K: 30, turns: 3, k: 1 });
    expect(stepper().textContent).toContain('Creatures · 30 cards');
    expect(stepper().textContent).toContain(expected.tooltip);
    expect(value()).toBe('1');
  });

  it('shows the ? reason when the Library is unreadable', () => {
    deck.footer.remove();
    openCreatures();
    expect(stepper().textContent).toContain(domHelpers.readLibrary().reason);
  });

  it('+ and − set the override; − is disabled at 1', () => {
    openCreatures();
    expect(dec().disabled).toBe(true);

    inc().click();
    expect(deckSettings.desiredFor('type', 'Creatures')).toBe(2);
    expect(value()).toBe('2');
    expect(dec().disabled).toBe(false);

    dec().click();
    expect(deckSettings.isOverridden('type', 'Creatures')).toBe(false);
    expect(dec().disabled).toBe(true);
  });

  it('has no upper bound', () => {
    deckSettings.setOverride('type', 'Creatures', 30);
    openCreatures();
    inc().click();
    expect(deckSettings.desiredFor('type', 'Creatures')).toBe(31);
    expect(stepper().textContent).toContain(
      'Only 30 cards in Section; need ≥31'
    );
  });

  it('shows Reset only while overridden, and Reset clears the override', () => {
    openCreatures();
    expect(reset().hidden).toBe(true);

    inc().click();
    expect(reset().hidden).toBe(false);
    expect(reset().textContent).toBe('Reset to default (1)');

    reset().click();
    expect(deckSettings.isOverridden('type', 'Creatures')).toBe(false);
    expect(reset().hidden).toBe(true);
  });

  it('stops clicks inside it from propagating', () => {
    openCreatures();
    const seen = vi.fn();
    document.body.addEventListener('click', seen);
    inc().click();
    document.body.removeEventListener('click', seen);
    expect(seen).not.toHaveBeenCalled();
  });

  it('redraws on a deck settings change', () => {
    openCreatures();
    deckSettings.setOverride('type', 'Creatures', 4);
    expect(value()).toBe('4');
    const expected = oddsMath.evaluate({ N: 99, K: 30, turns: 3, k: 4 });
    expect(stepper().textContent).toContain(expected.tooltip);
  });

  it('ignores price-bar changes on the shared bus', () => {
    openCreatures();
    const reads = vi.spyOn(domHelpers, 'getMainboardSections');
    const fire = (source) =>
      deckSettings.events.dispatchEvent(
        new CustomEvent('change', { detail: { source } })
      );
    fire('price');
    expect(reads).not.toHaveBeenCalled();
    fire('external'); // control: any other source redraws
    expect(reads).toHaveBeenCalled();
  });

  it('unsubscribes from deck settings once closed', () => {
    openCreatures();
    const root = stepper();
    popover.close();
    deckSettings.setOverride('type', 'Creatures', 4);
    expect(root.querySelector('.mox-stepper__value').textContent).toBe('1');
  });

  it('closes when its Section no longer exists on re-render', () => {
    openCreatures();
    const title = section('Creatures').link.querySelector('span[title]');
    title.setAttribute('title', 'Beasts');
    deckSettings.setOverride('type', 'Beasts', 2);
    expect(popover.isOpen()).toBe(false);
  });

  it('does not open for a Section that does not exist', () => {
    sectionOdds.openStepper(document.body, 'Nope');
    expect(popover.isOpen()).toBe(false);
  });

  it('refreshStepper() re-reads the DOM after a deck edit', () => {
    openCreatures();
    const s = section('Creatures');
    s.rows[1].firstElementChild.firstElementChild.textContent = '15';
    s.link.querySelector('span[title]').nextElementSibling.textContent = '(35)';

    sectionOdds.refreshStepper();

    const expected = oddsMath.evaluate({ N: 99, K: 35, turns: 3, k: 1 });
    expect(stepper().textContent).toContain('Creatures · 35 cards');
    expect(stepper().textContent).toContain(expected.tooltip);
  });

  it('refreshStepper() closes the stepper when its Section is gone', () => {
    openCreatures();
    section('Creatures').ul.remove();
    sectionOdds.refreshStepper();
    expect(popover.isOpen()).toBe(false);
  });

  it('refreshStepper() is a no-op with no stepper open', () => {
    popover.open(document.body, (container) => {
      container.textContent = 'other';
    });
    expect(() => sectionOdds.refreshStepper()).not.toThrow();
    expect(document.querySelector('.mox-popover').textContent).toBe('other');
  });

  it('cleanup() closes the stepper', () => {
    openCreatures();
    sectionOdds.cleanup();
    expect(popover.isOpen()).toBe(false);
  });

  it('cleanup() leaves a popover it does not own open', () => {
    popover.open(document.body, () => {});
    sectionOdds.cleanup();
    expect(popover.isOpen()).toBe(true);
  });
});
