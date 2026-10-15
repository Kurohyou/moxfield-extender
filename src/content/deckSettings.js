/**
 * Per-deck settings for Moxfield Extended
 * By turn, At least, the shared-slot choice and per-Section overrides of
 * At least and By turn, kept in chrome.storage.local under `deck:<deckId>`
 * (spec 2.5, 4). An override entry is `{ desired?, turns? }`.
 */

(function () {
  'use strict';

  const LOG_PREFIX = '[Moxfield Extended]';
  const DEBOUNCE_MS = 300;
  const SLOTS = ['odds', 'curve'];
  // Override fields, in their canonical order, and each one's minimum.
  const FIELDS = [
    ['desired', 1],
    ['turns', 0],
  ];

  const events = new EventTarget();

  let deckId = null;
  let loaded = false;
  let settings = defaults();
  let snapshot = null; // frozen copy handed out by get(); rebuilt after a change
  let loading = null; // { id, promise } while a load is in flight
  let loadSeq = 0; // bumped per load; a load applies only if it is still the latest
  let lastNotifiedFp = fingerprint(settings); // what listeners last saw
  let timer = null;
  let dirty = false; // memory is newer than storage
  let inFlight = 0; // writes handed to chrome.storage.local, not yet settled

  /**
   * Fresh default settings. Override buckets are prototype-less objects so a
   * Section named `__proto__` or `constructor` is just another key.
   * @returns {Object}
   */
  function defaults() {
    return {
      turns: 3,
      desired: 1,
      sharedSlot: 'odds',
      overrides: Object.create(null),
    };
  }

  /**
   * Clamp to an integer of at least `min`, or null for anything not a finite number.
   * @param {*} n
   * @param {number} min
   * @returns {number|null}
   */
  function clampInt(n, min) {
    return typeof n === 'number' && Number.isFinite(n)
      ? Math.max(min, Math.round(n))
      : null;
  }

  /**
   * Own enumerable entries of a stored plain object; [] for anything else.
   * @param {*} value
   * @returns {Array<[string, *]>}
   */
  function entriesOf(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? Object.entries(value)
      : [];
  }

  /**
   * A fresh override entry holding only the fields `entry` has, in canonical
   * order.
   * @param {{desired?: number, turns?: number}} entry
   * @returns {{desired?: number, turns?: number}}
   */
  function copyEntry(entry) {
    const copy = {};
    FIELDS.forEach(([field]) => {
      if (Object.hasOwn(entry, field)) copy[field] = entry[field];
    });
    return copy;
  }

  /**
   * A valid override entry from a stored value, or null when nothing in it is
   * usable. A plain number is the old shape: a desired override.
   * @param {*} value
   * @returns {{desired?: number, turns?: number}|null}
   */
  function sanitizeEntry(value) {
    if (typeof value === 'number') {
      const desired = clampInt(value, 1);
      return desired === null ? null : { desired };
    }
    const entry = {};
    const stored = Object.fromEntries(entriesOf(value));
    FIELDS.forEach(([field, min]) => {
      const n = clampInt(stored[field], min);
      if (n !== null) entry[field] = n;
    });
    return Object.keys(entry).length > 0 ? entry : null;
  }

  /**
   * Build valid settings from stored data, merged over defaults.
   * @param {*} raw - Whatever storage returned
   * @returns {Object}
   */
  function sanitize(raw) {
    const next = defaults();
    const data = raw && typeof raw === 'object' ? raw : {};
    next.turns = clampInt(data.turns, 0) ?? next.turns;
    next.desired = clampInt(data.desired, 1) ?? next.desired;
    if (SLOTS.includes(data.sharedSlot)) next.sharedSlot = data.sharedSlot;
    entriesOf(data.overrides).forEach(([groupBy, bucket]) => {
      entriesOf(bucket).forEach(([name, value]) => {
        const entry = sanitizeEntry(value);
        if (entry === null) return;
        next.overrides[groupBy] =
          next.overrides[groupBy] || Object.create(null);
        next.overrides[groupBy][name] = entry;
      });
    });
    return next;
  }

  /**
   * Plain-object form for storage. fromEntries defines own properties, so a
   * Section named `__proto__` survives.
   * @returns {Object}
   */
  function serialize() {
    const overrides = Object.fromEntries(
      Object.entries(settings.overrides).map(([groupBy, bucket]) => [
        groupBy,
        Object.fromEntries(
          Object.entries(bucket).map(([name, entry]) => [
            name,
            copyEntry(entry),
          ])
        ),
      ])
    );
    return {
      turns: settings.turns,
      desired: settings.desired,
      sharedSlot: settings.sharedSlot,
      overrides,
    };
  }

  /**
   * Order-independent fingerprint, to tell whether two settings differ.
   * @param {Object} value
   * @returns {string}
   */
  function fingerprint(value) {
    const buckets = Object.keys(value.overrides)
      .sort()
      .map((groupBy) => [
        groupBy,
        Object.entries(value.overrides[groupBy])
          .sort(([a], [b]) => (a < b ? -1 : 1))
          // Fields by position, so their key order never matters.
          .map(([name, entry]) => [
            name,
            FIELDS.map(([field]) =>
              Object.hasOwn(entry, field) ? entry[field] : null
            ),
          ]),
      ]);
    return JSON.stringify([
      value.turns,
      value.desired,
      value.sharedSlot,
      buckets,
    ]);
  }

  /**
   * Notify views that settings changed.
   * @param {string} source - 'turns' | 'desired' | 'sharedSlot' | 'override' | 'load' | 'external'.
   *   priceVisualization also dispatches 'price' on this bus for its own changes.
   */
  function notify(source) {
    snapshot = null;
    lastNotifiedFp = fingerprint(settings);
    events.dispatchEvent(new CustomEvent('change', { detail: { source } }));
  }

  /**
   * The in-memory settings as a deeply frozen copy. The same object is
   * returned until the next change, so callers can never mutate internal state.
   * @returns {Readonly<{turns: number, desired: number, sharedSlot: string, overrides: Object}>}
   */
  function get() {
    if (!snapshot) {
      const overrides = Object.create(null);
      Object.entries(settings.overrides).forEach(([groupBy, bucket]) => {
        const copy = Object.create(null);
        Object.entries(bucket).forEach(([name, entry]) => {
          copy[name] = Object.freeze(copyEntry(entry));
        });
        overrides[groupBy] = Object.freeze(copy);
      });
      snapshot = Object.freeze({
        ...settings,
        overrides: Object.freeze(overrides),
      });
    }
    return snapshot;
  }

  /**
   * Write pending changes now. Resolves once the write has settled.
   * @returns {Promise<void>}
   */
  function flush() {
    clearTimeout(timer);
    timer = null;
    if (!dirty || !deckId) return Promise.resolve();
    dirty = false;
    inFlight += 1;
    let write;
    try {
      write = Promise.resolve(
        chrome.storage.local.set({ [`deck:${deckId}`]: serialize() })
      );
    } catch (error) {
      write = Promise.reject(error);
    }
    return write
      .catch((error) =>
        console.warn(LOG_PREFIX, 'Could not save deck settings', error)
      )
      .finally(() => {
        inFlight -= 1;
      });
  }

  /**
   * Record a user change: notify now, persist after the debounce.
   * @param {string} source
   */
  function commit(source) {
    dirty = true;
    clearTimeout(timer);
    timer = setTimeout(flush, DEBOUNCE_MS);
    notify(source);
  }

  /**
   * Load settings for a deck, once per deck. A deck change flushes the old
   * deck's pending write first.
   * @param {string} id - Deck ID
   * @returns {Promise<Object>} The current settings (see get())
   */
  function ensureLoaded(id) {
    if (!id || (id === deckId && loaded)) return Promise.resolve(get());
    if (loading && loading.id === id) return loading.promise;

    flush();
    const seq = ++loadSeq;
    deckId = id;
    loaded = false;
    settings = defaults();
    snapshot = null;

    const promise = Promise.resolve()
      .then(() => chrome.storage.local.get(`deck:${id}`))
      .then(
        (stored) => ({ stored }),
        (error) => ({ error })
      )
      .then(({ stored, error }) => {
        if (seq !== loadSeq) return get(); // superseded by a newer load
        loading = null;
        if (error) {
          // Stay unloaded: setters remain no-ops and the next call retries.
          console.warn(LOG_PREFIX, 'Could not load deck settings', error);
          return get();
        }
        loaded = true;
        settings = sanitize(stored[`deck:${id}`]);
        if (fingerprint(settings) !== lastNotifiedFp) notify('load');
        return get();
      });
    loading = { id, promise };
    return promise;
  }

  /**
   * Whether the settings in memory are a loaded copy of this deck's. After a
   * client-side deck change they still belong to the previous deck until
   * ensureLoaded() runs for the new one, so writers check this first.
   * @param {string|null} id - Deck ID
   * @returns {boolean}
   */
  function isLoadedFor(id) {
    return loaded && id !== null && id === deckId;
  }

  /**
   * Apply a deck value that arrived from chrome.storage.onChanged (another tab,
   * or our own write echoing back). Ignored while we have a write pending or in
   * flight, so an echo can't revert a newer change, and when it matches memory.
   * @param {string} id - Deck ID the change is for
   * @param {*} newValue - The stored value; undefined when the key was removed
   */
  function applyExternal(id, newValue) {
    if (id !== deckId || !loaded || dirty || inFlight > 0) return;
    const next = sanitize(newValue);
    if (fingerprint(next) === fingerprint(settings)) return;
    settings = next;
    notify('external');
  }

  /**
   * Set By turn: an integer >= 0, no upper bound. Ignored until the deck has loaded.
   * @param {number} n
   */
  function setTurns(n) {
    const turns = clampInt(n, 0);
    if (!loaded || turns === null || turns === settings.turns) return;
    settings.turns = turns;
    commit('turns');
  }

  /**
   * Set At least (the deck default desired): an integer >= 1, no upper bound.
   * @param {number} n
   */
  function setDesired(n) {
    const desired = clampInt(n, 1);
    if (!loaded || desired === null || desired === settings.desired) return;
    settings.desired = desired;
    commit('desired');
  }

  /**
   * Choose what a crowded header's shared slot shows.
   * @param {string} value - 'odds' or 'curve'; anything else is ignored
   */
  function setSharedSlot(value) {
    if (!loaded || !SLOTS.includes(value) || value === settings.sharedSlot)
      return;
    settings.sharedSlot = value;
    commit('sharedSlot');
  }

  /**
   * A Section's override entry, or null when it has none.
   * @param {string} groupBy - Group-by mode, e.g. 'type'
   * @param {string} name - Section name
   * @returns {{desired?: number, turns?: number}|null}
   */
  function entryFor(groupBy, name) {
    const bucket = settings.overrides[groupBy];
    return bucket && Object.hasOwn(bucket, name) ? bucket[name] : null;
  }

  /**
   * One field for a Section: its override, else the deck default.
   * @param {'desired'|'turns'} field
   * @param {string} groupBy
   * @param {string} name
   * @returns {number}
   */
  function fieldFor(field, groupBy, name) {
    const entry = entryFor(groupBy, name);
    return entry && Object.hasOwn(entry, field)
      ? entry[field]
      : settings[field];
  }

  /**
   * Desired count for a Section: its override, else the deck default.
   * @param {string} groupBy - Group-by mode, e.g. 'type'
   * @param {string} name - Section name
   * @returns {number}
   */
  function desiredFor(groupBy, name) {
    return fieldFor('desired', groupBy, name);
  }

  /**
   * By turn for a Section: its override, else the deck turns.
   * @param {string} groupBy - Group-by mode, e.g. 'type'
   * @param {string} name - Section name
   * @returns {number}
   */
  function turnsFor(groupBy, name) {
    return fieldFor('turns', groupBy, name);
  }

  /**
   * Whether a Section's desired differs from the deck default.
   * @param {string} groupBy
   * @param {string} name
   * @returns {boolean}
   */
  function isDesiredOverridden(groupBy, name) {
    return desiredFor(groupBy, name) !== settings.desired;
  }

  /**
   * Whether a Section's By turn differs from the deck turns.
   * @param {string} groupBy
   * @param {string} name
   * @returns {boolean}
   */
  function isTurnsOverridden(groupBy, name) {
    return turnsFor(groupBy, name) !== settings.turns;
  }

  /**
   * Whether either of a Section's values differs from the deck default (the
   * dotted underline).
   * @param {string} groupBy
   * @param {string} name
   * @returns {boolean}
   */
  function isOverridden(groupBy, name) {
    return (
      isDesiredOverridden(groupBy, name) || isTurnsOverridden(groupBy, name)
    );
  }

  /**
   * Remove a Section's entry, and its Group-by bucket once empty.
   * @param {string} groupBy
   * @param {string} name
   */
  function deleteEntry(groupBy, name) {
    const bucket = settings.overrides[groupBy];
    delete bucket[name];
    if (Object.keys(bucket).length === 0) delete settings.overrides[groupBy];
  }

  /**
   * Set or clear one field of a Section's override. null clears it; so does a
   * value equal to the deck default. Otherwise an integer >= `min`. An entry
   * left with no fields is removed, and so is a Group-by bucket left empty.
   * Orphaned overrides are kept.
   * @param {'desired'|'turns'} field
   * @param {number} min
   * @param {string} groupBy
   * @param {string} name
   * @param {number|null} n
   */
  function setField(field, min, groupBy, name, n) {
    if (!loaded) return;
    const reset = n === null || n === undefined;
    const value = reset ? null : clampInt(n, min);
    if (!reset && value === null) return; // not a number
    const entry = entryFor(groupBy, name);
    const has = !!entry && Object.hasOwn(entry, field);

    if (value === null || value === settings[field]) {
      if (!has) return;
      delete entry[field];
      if (Object.keys(entry).length === 0) deleteEntry(groupBy, name);
    } else {
      if (has && entry[field] === value) return;
      if (entry) {
        entry[field] = value;
      } else {
        settings.overrides[groupBy] =
          settings.overrides[groupBy] || Object.create(null);
        settings.overrides[groupBy][name] = { [field]: value };
      }
    }
    commit('override');
  }

  /**
   * Set or clear a Section's desired override: an integer >= 1, no upper
   * bound. null, or the deck default, clears it.
   * @param {string} groupBy
   * @param {string} name
   * @param {number|null} n
   */
  function setOverride(groupBy, name, n) {
    setField('desired', 1, groupBy, name, n);
  }

  /**
   * Set or clear a Section's By turn override: an integer >= 0, no upper
   * bound. null, or the deck turns, clears it.
   * @param {string} groupBy
   * @param {string} name
   * @param {number|null} n
   */
  function setTurnsOverride(groupBy, name, n) {
    setField('turns', 0, groupBy, name, n);
  }

  /**
   * Clear both of a Section's overrides.
   * @param {string} groupBy
   * @param {string} name
   */
  function resetOverride(groupBy, name) {
    if (!loaded || !entryFor(groupBy, name)) return;
    deleteEntry(groupBy, name);
    commit('override');
  }

  window.addEventListener('pagehide', flush);

  // Export for use in content scripts
  window.MoxfieldExtended = window.MoxfieldExtended || {};
  window.MoxfieldExtended.deckSettings = {
    events,
    ensureLoaded,
    isLoadedFor,
    get,
    setTurns,
    setDesired,
    setSharedSlot,
    desiredFor,
    turnsFor,
    isOverridden,
    isDesiredOverridden,
    isTurnsOverridden,
    setOverride,
    setTurnsOverride,
    resetOverride,
    applyExternal,
    flush,
  };
})();
