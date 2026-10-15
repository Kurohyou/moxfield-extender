import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const KEY = (id) => `deck:${id}`;
const DEBOUNCE = 300;

let ds;

/**
 * Load a fresh deckSettings instance (state and listeners reset).
 * @returns {Promise<Object>}
 */
async function load() {
  vi.resetModules();
  await import('../src/content/deckSettings.js');
  return window.MoxfieldExtended.deckSettings;
}

/**
 * Record `change` events fired on the shared event target.
 * @returns {string[]} Live list of event sources
 */
function recordChanges() {
  const sources = [];
  ds.events.addEventListener('change', (event) =>
    sources.push(event.detail.source)
  );
  return sources;
}

beforeEach(async () => {
  vi.useFakeTimers();
  ds = await load();
});

afterEach(async () => {
  await ds.flush();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('defaults', () => {
  it('uses spec defaults when nothing is stored: T=3, desired=1, odds slot', async () => {
    const settings = await ds.ensureLoaded('a');
    expect(settings.turns).toBe(3);
    expect(settings.desired).toBe(1);
    expect(settings.sharedSlot).toBe('odds');
    expect(Object.keys(settings.overrides)).toEqual([]);
  });

  it('get() returns defaults before anything is loaded', () => {
    expect(ds.get()).toMatchObject({
      turns: 3,
      desired: 1,
      sharedSlot: 'odds',
    });
  });

  it('get() cannot be used to mutate internal state', async () => {
    await ds.ensureLoaded('a');
    ds.setOverride('type', 'Creatures', 2);
    const copy = ds.get();
    expect(() => {
      'use strict';
      copy.turns = 99;
    }).toThrow(TypeError);
    expect(() => {
      'use strict';
      copy.overrides.type.Creatures = 99;
    }).toThrow(TypeError);
    expect(ds.get().turns).toBe(3);
    expect(ds.desiredFor('type', 'Creatures')).toBe(2);
  });

  it('merges partial stored data over defaults', async () => {
    await chrome.storage.local.set({ [KEY('a')]: { turns: 5 } });
    const settings = await ds.ensureLoaded('a');
    expect(settings).toMatchObject({
      turns: 5,
      desired: 1,
      sharedSlot: 'odds',
    });
  });

  it('sanitises stored values the way the setters clamp', async () => {
    await chrome.storage.local.set({
      [KEY('a')]: {
        turns: -2,
        desired: 0,
        sharedSlot: 'nope',
        overrides: {
          type: { Low: 0, Round: 2.6, Text: 'x', Nan: null },
          junk: 5,
          list: [1, 2],
        },
      },
    });
    const settings = await ds.ensureLoaded('a');
    expect(settings.turns).toBe(0);
    expect(settings.desired).toBe(1);
    expect(settings.sharedSlot).toBe('odds');
    expect({ ...settings.overrides.type }).toEqual({ Low: 1, Round: 3 });
    expect(Object.keys(settings.overrides)).toEqual(['type']);
  });

  it('treats a non-object stored value as defaults', async () => {
    await chrome.storage.local.set({ [KEY('a')]: 'garbage' });
    expect((await ds.ensureLoaded('a')).turns).toBe(3);
  });
});

describe('setters', () => {
  beforeEach(async () => {
    await ds.ensureLoaded('a');
  });

  it('clamps turns to an integer >= 0 with no upper bound', () => {
    ds.setTurns(-4);
    expect(ds.get().turns).toBe(0);
    ds.setTurns(2.6);
    expect(ds.get().turns).toBe(3);
    ds.setTurns(500);
    expect(ds.get().turns).toBe(500);
  });

  it('refuses non-finite and non-number turns', () => {
    ds.setTurns(5);
    ds.setTurns(NaN);
    ds.setTurns(Infinity);
    ds.setTurns('7');
    ds.setTurns(undefined);
    expect(ds.get().turns).toBe(5);
  });

  it('clamps desired 0 to 1 and rounds non-integers', () => {
    ds.setDesired(3);
    ds.setDesired(0);
    expect(ds.get().desired).toBe(1);
    ds.setDesired(-5);
    expect(ds.get().desired).toBe(1);
    ds.setDesired(2.4);
    expect(ds.get().desired).toBe(2);
    ds.setDesired(1000);
    expect(ds.get().desired).toBe(1000);
    ds.setDesired(NaN);
    expect(ds.get().desired).toBe(1000);
  });

  it('accepts only odds or curve for the shared slot', () => {
    ds.setSharedSlot('curve');
    expect(ds.get().sharedSlot).toBe('curve');
    ds.setSharedSlot('bogus');
    ds.setSharedSlot(undefined);
    expect(ds.get().sharedSlot).toBe('curve');
    ds.setSharedSlot('odds');
    expect(ds.get().sharedSlot).toBe('odds');
  });

  it('dispatches change with the matching source', () => {
    const sources = recordChanges();
    ds.setTurns(4);
    ds.setDesired(2);
    ds.setSharedSlot('curve');
    ds.setOverride('type', 'Creatures', 3);
    expect(sources).toEqual(['turns', 'desired', 'sharedSlot', 'override']);
  });

  it('a no-op set neither dispatches nor writes', async () => {
    const set = vi.spyOn(chrome.storage.local, 'set');
    const sources = recordChanges();
    ds.setTurns(3);
    ds.setDesired(1);
    ds.setSharedSlot('odds');
    ds.setSharedSlot('bogus');
    ds.setOverride('type', 'Creatures', null);
    ds.setOverride('type', 'Creatures', 1);
    await vi.advanceTimersByTimeAsync(DEBOUNCE * 2);
    expect(sources).toEqual([]);
    expect(set).not.toHaveBeenCalled();
  });
});

describe('overrides', () => {
  beforeEach(async () => {
    await ds.ensureLoaded('a');
  });

  it('round-trips deck > Group-by > name in the nested shape', async () => {
    ds.setOverride('tag', 'card advantage', 2);
    ds.setOverride('type', 'Creatures', 3);
    await vi.advanceTimersByTimeAsync(DEBOUNCE);
    const stored = (await chrome.storage.local.get(KEY('a')))[KEY('a')];
    expect(stored).toEqual({
      turns: 3,
      desired: 1,
      sharedSlot: 'odds',
      overrides: {
        tag: { 'card advantage': 2 },
        type: { Creatures: 3 },
      },
    });
    expect(ds.desiredFor('tag', 'card advantage')).toBe(2);
    expect(ds.desiredFor('type', 'Creatures')).toBe(3);
  });

  it('desiredFor falls back to the deck default and follows it', () => {
    expect(ds.desiredFor('type', 'Creatures')).toBe(1);
    ds.setDesired(2);
    expect(ds.desiredFor('type', 'Creatures')).toBe(2);
    ds.setOverride('type', 'Creatures', 4);
    ds.setDesired(3);
    expect(ds.desiredFor('type', 'Creatures')).toBe(4);
  });

  it('keeps a Group-by mode separate from another with the same Section name', () => {
    ds.setOverride('type', 'Lands', 2);
    expect(ds.desiredFor('tag', 'Lands')).toBe(1);
    expect(ds.isOverridden('tag', 'Lands')).toBe(false);
    expect(ds.isOverridden('type', 'Lands')).toBe(true);
  });

  it('setting a value equal to the deck default deletes the override', () => {
    ds.setOverride('type', 'Creatures', 3);
    expect(ds.isOverridden('type', 'Creatures')).toBe(true);
    ds.setOverride('type', 'Creatures', 1);
    expect(ds.isOverridden('type', 'Creatures')).toBe(false);
    expect(ds.get().overrides.type).toBeUndefined();
  });

  it('null resets an override and prunes the empty Group-by bucket', () => {
    ds.setOverride('type', 'Creatures', 3);
    ds.setOverride('type', 'Lands', 2);
    ds.setOverride('type', 'Creatures', null);
    expect(Object.keys(ds.get().overrides.type)).toEqual(['Lands']);
    ds.setOverride('type', 'Lands', null);
    expect(Object.keys(ds.get().overrides)).toEqual([]);
  });

  it('clamps an override to an integer >= 1 and refuses non-finite values', () => {
    ds.setOverride('type', 'Creatures', 0);
    expect(ds.isOverridden('type', 'Creatures')).toBe(false);
    ds.setOverride('type', 'Creatures', 2.6);
    expect(ds.desiredFor('type', 'Creatures')).toBe(3);
    ds.setOverride('type', 'Creatures', NaN);
    ds.setOverride('type', 'Creatures', '5');
    expect(ds.desiredFor('type', 'Creatures')).toBe(3);
    ds.setOverride('type', 'Creatures', 40);
    expect(ds.desiredFor('type', 'Creatures')).toBe(40);
  });

  it('isOverridden is false when the override equals a changed deck default', () => {
    ds.setOverride('type', 'Creatures', 2);
    ds.setDesired(2);
    expect(ds.isOverridden('type', 'Creatures')).toBe(false);
    expect(ds.desiredFor('type', 'Creatures')).toBe(2);
  });

  it('keeps an orphaned override across a reload', async () => {
    ds.setOverride('tag', 'Gone Section', 4);
    await ds.flush();
    ds = await load();
    await ds.ensureLoaded('a');
    expect(ds.desiredFor('tag', 'Gone Section')).toBe(4);
    expect(ds.isOverridden('tag', 'Gone Section')).toBe(true);
  });

  it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'a.b:c'])(
    'round-trips a Section named %s through storage',
    async (name) => {
      ds.setOverride('tag', name, 5);
      ds.setOverride(name, 'Plain', 2);
      expect(ds.desiredFor('tag', name)).toBe(5);
      expect(ds.isOverridden('tag', name)).toBe(true);
      // Names that were never overridden must not resolve through the prototype.
      expect(ds.isOverridden('tag', `not-${name}`)).toBe(false);
      await ds.flush();

      const stored = (await chrome.storage.local.get(KEY('a')))[KEY('a')];
      expect(Object.hasOwn(stored.overrides.tag, name)).toBe(true);
      expect(stored.overrides.tag[name]).toBe(5);

      ds = await load();
      await ds.ensureLoaded('a');
      expect(ds.desiredFor('tag', name)).toBe(5);
      expect(ds.desiredFor(name, 'Plain')).toBe(2);
      expect(Object.getPrototypeOf(ds.get().overrides.tag)).toBe(null);

      ds.setOverride('tag', name, null);
      expect(ds.isOverridden('tag', name)).toBe(false);
    }
  );

  it('does not pollute Object.prototype', async () => {
    ds.setOverride('__proto__', 'polluted', 2);
    await ds.flush();
    ds = await load();
    await ds.ensureLoaded('a');
    expect({}.polluted).toBeUndefined();
    expect(ds.desiredFor('__proto__', 'polluted')).toBe(2);
  });
});

describe('persistence', () => {
  beforeEach(async () => {
    await ds.ensureLoaded('a');
  });

  it('writes memory and dispatches immediately, persists after 300 ms', async () => {
    const set = vi.spyOn(chrome.storage.local, 'set');
    const sources = recordChanges();
    ds.setTurns(5);
    expect(ds.get().turns).toBe(5);
    expect(sources).toEqual(['turns']);
    await vi.advanceTimersByTimeAsync(DEBOUNCE - 1);
    expect(set).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(set).toHaveBeenCalledTimes(1);
    expect((await chrome.storage.local.get(KEY('a')))[KEY('a')].turns).toBe(5);
  });

  it('five quick changes give one local.set', async () => {
    const set = vi.spyOn(chrome.storage.local, 'set');
    for (const turns of [4, 5, 6, 7, 8]) {
      ds.setTurns(turns);
      await vi.advanceTimersByTimeAsync(50);
    }
    expect(set).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(DEBOUNCE);
    expect(set).toHaveBeenCalledTimes(1);
    expect(set.mock.calls[0][0][KEY('a')].turns).toBe(8);
  });

  it('pagehide flushes immediately', async () => {
    const set = vi.spyOn(chrome.storage.local, 'set');
    ds.setDesired(2);
    window.dispatchEvent(new Event('pagehide'));
    expect(set).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(DEBOUNCE * 2);
    expect(set).toHaveBeenCalledTimes(1);
    expect((await chrome.storage.local.get(KEY('a')))[KEY('a')].desired).toBe(
      2
    );
  });

  it('flush with nothing pending does not write', async () => {
    const set = vi.spyOn(chrome.storage.local, 'set');
    await ds.flush();
    expect(set).not.toHaveBeenCalled();
  });

  it('fires chrome.storage.onChanged for the deck key when persisted', async () => {
    const seen = [];
    chrome.storage.onChanged.addListener((changes, area) =>
      seen.push([area, Object.keys(changes)])
    );
    ds.setTurns(6);
    await vi.advanceTimersByTimeAsync(DEBOUNCE);
    expect(seen).toEqual([['local', [KEY('a')]]]);
  });
});

describe('ensureLoaded', () => {
  it('shares one in-flight load between concurrent calls', async () => {
    const get = vi.spyOn(chrome.storage.local, 'get');
    const [first, second] = await Promise.all([
      ds.ensureLoaded('a'),
      ds.ensureLoaded('a'),
    ]);
    expect(get).toHaveBeenCalledTimes(1);
    expect(first.turns).toBe(second.turns);
  });

  it('does not reload the same deck', async () => {
    await ds.ensureLoaded('a');
    const get = vi.spyOn(chrome.storage.local, 'get');
    await ds.ensureLoaded('a');
    expect(get).not.toHaveBeenCalled();
  });

  it('dispatches change "load" only when the load changes settings', async () => {
    const sources = recordChanges();
    await ds.ensureLoaded('a');
    expect(sources).toEqual([]);

    await chrome.storage.local.set({ [KEY('b')]: { turns: 6 } });
    await ds.ensureLoaded('b');
    expect(sources).toEqual(['load']);
  });

  it('notifies when switching from customised settings back to defaults', async () => {
    await ds.ensureLoaded('a');
    ds.setTurns(9);
    const sources = recordChanges();
    await ds.ensureLoaded('b');
    expect(sources).toEqual(['load']);
    expect(ds.get().turns).toBe(3);
  });

  it('flushes the old deck pending write before switching and keeps decks separate', async () => {
    const set = vi.spyOn(chrome.storage.local, 'set');
    await ds.ensureLoaded('a');
    ds.setTurns(5);
    ds.setOverride('type', 'Creatures', 2);
    const switching = ds.ensureLoaded('b');
    expect(set).toHaveBeenCalledTimes(1);
    expect(Object.keys(set.mock.calls[0][0])).toEqual([KEY('a')]);
    const settingsB = await switching;
    expect(settingsB.turns).toBe(3);
    expect(Object.keys(settingsB.overrides)).toEqual([]);

    ds.setDesired(2);
    await vi.advanceTimersByTimeAsync(DEBOUNCE);
    expect(set).toHaveBeenCalledTimes(2);
    expect(Object.keys(set.mock.calls[1][0])).toEqual([KEY('b')]);

    const stored = await chrome.storage.local.get([KEY('a'), KEY('b')]);
    expect(stored[KEY('a')].turns).toBe(5);
    expect(stored[KEY('a')].overrides.type.Creatures).toBe(2);
    expect(stored[KEY('b')].turns).toBe(3);
    expect(stored[KEY('b')].desired).toBe(2);
  });

  it('keeps the latest deck when loads for two decks overlap', async () => {
    await chrome.storage.local.set({
      [KEY('a')]: { turns: 1 },
      [KEY('b')]: { turns: 2 },
    });
    const first = ds.ensureLoaded('a');
    const second = ds.ensureLoaded('b');
    await Promise.all([first, second]);
    expect(ds.get().turns).toBe(2);
  });

  it('ignores setters until the deck has loaded', async () => {
    const loading = ds.ensureLoaded('a');
    ds.setTurns(9);
    await loading;
    expect(ds.get().turns).toBe(3);
  });
});

describe('applyExternal', () => {
  beforeEach(async () => {
    await ds.ensureLoaded('a');
  });

  it('applies another tab\'s change, sanitised, with source "external"', () => {
    const sources = recordChanges();
    ds.applyExternal('a', {
      turns: 7.4,
      desired: 0,
      overrides: { tag: { X: 3 } },
    });
    expect(sources).toEqual(['external']);
    expect(ds.get()).toMatchObject({ turns: 7, desired: 1 });
    expect(ds.desiredFor('tag', 'X')).toBe(3);
  });

  it('resets to defaults when the key was removed', () => {
    ds.setTurns(7);
    return ds.flush().then(() => {
      ds.applyExternal('a', undefined);
      expect(ds.get().turns).toBe(3);
    });
  });

  it("ignores another deck's change", () => {
    const sources = recordChanges();
    ds.applyExternal('other', { turns: 9 });
    expect(sources).toEqual([]);
    expect(ds.get().turns).toBe(3);
  });

  it('ignores a value equal to memory', () => {
    const sources = recordChanges();
    ds.applyExternal('a', {
      turns: 3,
      desired: 1,
      sharedSlot: 'odds',
      overrides: {},
    });
    expect(sources).toEqual([]);
  });

  it('ignores a change while a debounced write is pending', () => {
    ds.setTurns(5);
    ds.applyExternal('a', { turns: 8 });
    expect(ds.get().turns).toBe(5);
  });

  it('does not revert a newer change when the echo of an in-flight write arrives', async () => {
    // Hold the write open so the echo arrives while it is still in flight.
    const real = chrome.storage.local.set.bind(chrome.storage.local);
    let release;
    const set = vi
      .spyOn(chrome.storage.local, 'set')
      .mockImplementation((items) => {
        real(items);
        return new Promise((resolve) => {
          release = resolve;
        });
      });
    const sources = recordChanges();

    ds.setTurns(4);
    await vi.advanceTimersByTimeAsync(DEBOUNCE);
    expect(set).toHaveBeenCalledTimes(1);

    // The user keeps going while write #1 is in flight.
    ds.setTurns(5);
    // Echo of write #1 (turns 4) arrives.
    ds.applyExternal('a', set.mock.calls[0][0][KEY('a')]);
    expect(ds.get().turns).toBe(5);

    release();
    await vi.advanceTimersByTimeAsync(DEBOUNCE);
    expect(set).toHaveBeenCalledTimes(2);
    expect(set.mock.calls[1][0][KEY('a')].turns).toBe(5);

    // Echo of write #2 equals memory.
    ds.applyExternal('a', set.mock.calls[1][0][KEY('a')]);
    expect(ds.get().turns).toBe(5);
    expect(sources).not.toContain('external');
  });

  it('own writes routed back through onChanged never revert rapid changes', async () => {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[KEY('a')]) {
        ds.applyExternal('a', changes[KEY('a')].newValue);
      }
    });
    const sources = recordChanges();
    for (const turns of [4, 5, 6]) {
      ds.setTurns(turns);
      await vi.advanceTimersByTimeAsync(DEBOUNCE);
    }
    ds.setTurns(7);
    await vi.advanceTimersByTimeAsync(DEBOUNCE);
    expect(ds.get().turns).toBe(7);
    expect(sources).not.toContain('external');
  });

  it('accepts a real external change once idle', async () => {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[KEY('a')]) {
        ds.applyExternal('a', changes[KEY('a')].newValue);
      }
    });
    const sources = recordChanges();
    await chrome.storage.local.set({ [KEY('a')]: { turns: 9, desired: 2 } });
    expect(sources).toEqual(['external']);
    expect(ds.get()).toMatchObject({ turns: 9, desired: 2 });
  });
});
