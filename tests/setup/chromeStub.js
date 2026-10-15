/**
 * Global test setup: in-memory chrome.* stub and jsdom gap fills.
 *
 * Findings (vitest + jsdom, recorded for later tasks):
 * - module re-execution: the content scripts are IIFE-style scripts that
 *   assign `window.MoxfieldExtended.<name> = {...}`. `vi.resetModules()`
 *   followed by a fresh `await import(...)` DOES re-run the script and
 *   replaces `window.MoxfieldExtended.<name>` with a new object. The
 *   `window.MoxfieldExtended = window.MoxfieldExtended || {}` guard only
 *   preserves the namespace object, not the module objects inside it.
 *   A plain re-import without resetModules() is cached and does nothing.
 * - LISTENERS AND __reset: `chrome.__reset()` runs in a global beforeEach and
 *   clears all listeners. A script that registers a listener while it loads
 *   (for example index.js adding runtime.onMessage or storage.onChanged
 *   listeners) must therefore be loaded inside the test or a beforeEach, i.e.
 *   after the reset, via `vi.resetModules()` + `await import(...)`. A
 *   top-level import's listeners are wiped before the first test runs.
 * - requestAnimationFrame: jsdom (vitest) provides it, but it is asynchronous
 *   (~16ms timer), so tests would need to wait. It is replaced with a
 *   synchronous version (callback runs immediately, returns an id) so that
 *   layout tests get a deterministic frame. cancelAnimationFrame is a no-op
 *   because nothing is ever pending.
 * - ResizeObserver is missing from jsdom, so a no-op class is stubbed below.
 * - jsdom reports every layout width/height as 0. Layout tests assert that
 *   nodes exist, never that they are visible.
 *
 * Storage timing, modelled on real chrome.storage:
 * - The store is updated synchronously inside get/set/remove.
 * - Callbacks (and promises) resolve asynchronously, via a microtask, so a
 *   callback never runs before the call returns.
 * - onChanged listeners fire after the write and before the callback or
 *   promise completes.
 * - A write whose new value deep-equals the old one produces no change entry
 *   (Chromium's value store only records differing values), and onChanged does
 *   not fire when no entry remains.
 */
import { isDeepStrictEqual } from 'node:util';
import { beforeEach } from 'vitest';

const stores = { sync: {}, local: {} };
let changeListeners = [];
let messageListeners = [];

const has = (data, key) => Object.hasOwn(data, key);
const clone = (value) => (value === undefined ? undefined : structuredClone(value));

/**
 * Support both the callback and the promise form of a chrome API.
 * The callback runs in a microtask, never before the API call returns.
 * @param {Function|undefined} callback
 * @param {*} result
 * @returns {Promise<*>|undefined}
 */
function respond(callback, result) {
  if (typeof callback === 'function') {
    queueMicrotask(() => callback(result));
    return undefined;
  }
  return Promise.resolve(result);
}

function fireChanged(changes, areaName) {
  if (Object.keys(changes).length === 0) return;
  changeListeners.slice().forEach((listener) => listener(clone(changes), areaName));
}

function createArea(areaName) {
  const area = () => stores[areaName];

  return {
    /**
     * get(keys?, cb?) where keys is null | string | string[] | defaults object
     */
    get(keys, callback) {
      if (typeof keys === 'function') {
        callback = keys;
        keys = null;
      }
      const data = area();
      const result = {};
      if (keys === null || keys === undefined) {
        Object.keys(data).forEach((key) => {
          result[key] = clone(data[key]);
        });
      } else if (typeof keys === 'string') {
        if (has(data, keys)) result[keys] = clone(data[keys]);
      } else if (Array.isArray(keys)) {
        keys.forEach((key) => {
          if (has(data, key)) result[key] = clone(data[key]);
        });
      } else {
        Object.keys(keys).forEach((key) => {
          result[key] = has(data, key) ? clone(data[key]) : clone(keys[key]);
        });
      }
      return respond(callback, result);
    },

    set(items, callback) {
      const data = area();
      const changes = {};
      Object.keys(items).forEach((key) => {
        const hadValue = has(data, key);
        const oldValue = data[key];
        const newValue = clone(items[key]);
        data[key] = newValue;
        if (hadValue && isDeepStrictEqual(oldValue, newValue)) return;
        changes[key] = hadValue ? { oldValue: clone(oldValue), newValue } : { newValue };
      });
      fireChanged(changes, areaName);
      return respond(callback, undefined);
    },

    remove(keys, callback) {
      const data = area();
      const changes = {};
      (Array.isArray(keys) ? keys : [keys]).forEach((key) => {
        if (has(data, key)) {
          changes[key] = { oldValue: clone(data[key]) };
          delete data[key];
        }
      });
      fireChanged(changes, areaName);
      return respond(callback, undefined);
    },
  };
}

globalThis.chrome = {
  storage: {
    sync: createArea('sync'),
    local: createArea('local'),
    onChanged: {
      addListener: (listener) => changeListeners.push(listener),
      removeListener: (listener) => {
        changeListeners = changeListeners.filter((l) => l !== listener);
      },
    },
  },
  runtime: {
    lastError: undefined,
    // messaging.js passes a callback and awaits it, so invoke it when given.
    sendMessage: (_message, callback) => respond(callback, undefined),
    onMessage: {
      addListener: (listener) => messageListeners.push(listener),
      removeListener: (listener) => {
        messageListeners = messageListeners.filter((l) => l !== listener);
      },
    },
  },
  tabs: {
    sendMessage: (_tabId, _message, callback) => respond(callback, undefined),
  },
  /** Clears both stores and all listeners. Called before every test. */
  __reset() {
    stores.sync = {};
    stores.local = {};
    changeListeners = [];
    messageListeners = [];
  },
};

// jsdom has no ResizeObserver.
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
window.ResizeObserver = globalThis.ResizeObserver;

// jsdom's requestAnimationFrame is asynchronous. Make it synchronous so
// layout code that schedules a frame is deterministic under test.
let rafId = 0;
globalThis.requestAnimationFrame = (callback) => {
  callback(performance.now());
  rafId += 1;
  return rafId;
};
globalThis.cancelAnimationFrame = () => {};
window.requestAnimationFrame = globalThis.requestAnimationFrame;
window.cancelAnimationFrame = globalThis.cancelAnimationFrame;

beforeEach(() => {
  globalThis.chrome.__reset();
});
