import { describe, expect, it, vi } from 'vitest';

describe('chrome stub', () => {
  it('supports callback and promise get/set/remove', async () => {
    await chrome.storage.sync.set({ a: 1, b: 2 });
    expect(await chrome.storage.sync.get('a')).toEqual({ a: 1 });
    expect(await chrome.storage.sync.get(['a', 'b'])).toEqual({ a: 1, b: 2 });
    expect(await chrome.storage.sync.get({ a: 9, c: 3 })).toEqual({ a: 1, c: 3 });
    expect(await chrome.storage.sync.get(null)).toEqual({ a: 1, b: 2 });
    const viaCallback = await new Promise((resolve) => chrome.storage.sync.get({ c: 3 }, resolve));
    expect(viaCallback).toEqual({ c: 3 });
    await chrome.storage.sync.remove('a');
    expect(await chrome.storage.local.get(null)).toEqual({});
    expect(await chrome.storage.sync.get(null)).toEqual({ b: 2 });
  });

  it('fires onChanged with oldValue/newValue and the area name', async () => {
    const listener = vi.fn();
    chrome.storage.onChanged.addListener(listener);
    await chrome.storage.local.set({ k: 1 });
    await chrome.storage.local.set({ k: 2 });
    await chrome.storage.local.remove('k');
    expect(listener.mock.calls).toEqual([
      [{ k: { newValue: 1 } }, 'local'],
      [{ k: { oldValue: 1, newValue: 2 } }, 'local'],
      [{ k: { oldValue: 2 } }, 'local'],
    ]);
  });

  it('does not fire onChanged for an unchanged write and clones per listener', async () => {
    await chrome.storage.sync.set({ k: { n: 1 } });
    const first = vi.fn((changes) => {
      changes.k.newValue.n = 99;
    });
    const second = vi.fn();
    chrome.storage.onChanged.addListener(first);
    chrome.storage.onChanged.addListener(second);
    await chrome.storage.sync.set({ k: { n: 1 } });
    expect(first).not.toHaveBeenCalled();
    await chrome.storage.sync.set({ k: { n: 2 } });
    expect(second.mock.calls[0][0].k).toEqual({ oldValue: { n: 1 }, newValue: { n: 2 } });
    expect(await chrome.storage.sync.get('k')).toEqual({ k: { n: 2 } });
  });

  it('runs callbacks asynchronously, after the store is updated', async () => {
    const order = [];
    chrome.storage.sync.set({ a: 1 }, () => order.push('callback'));
    order.push('after call');
    chrome.storage.sync.get('a', (result) => order.push(result));
    await Promise.resolve();
    expect(order).toEqual(['after call', 'callback', { a: 1 }]);
  });

  it('isolates stored values from returned and passed objects', async () => {
    const input = { list: [1] };
    await chrome.storage.local.set({ k: input });
    input.list.push(2);
    const out = await chrome.storage.local.get('k');
    out.k.list.push(3);
    expect(await chrome.storage.local.get('k')).toEqual({ k: { list: [1] } });
  });

  it('ignores inherited keys such as toString', async () => {
    expect(await chrome.storage.sync.get(['toString'])).toEqual({});
  });

  it('keeps listeners registered after the reset by a dynamically imported script', async () => {
    // __reset() runs before each test and wipes listeners, so scripts that
    // register one at load time must be (re)imported inside the test.
    vi.resetModules();
    const listener = vi.fn();
    chrome.storage.onChanged.addListener(listener); // stands in for a script's load-time registration
    await chrome.storage.sync.set({ x: 1 });
    expect(listener).toHaveBeenCalledWith({ x: { newValue: 1 } }, 'sync');
  });

  it('is reset between tests', async () => {
    expect(await chrome.storage.sync.get(null)).toEqual({});
  });

  it('stubs requestAnimationFrame synchronously', () => {
    const cb = vi.fn();
    requestAnimationFrame(cb);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('re-executes IIFE scripts after vi.resetModules()', async () => {
    await import('../src/content/domHelpers.js');
    const first = window.MoxfieldExtended.domHelpers;
    vi.resetModules();
    await import('../src/content/domHelpers.js');
    expect(window.MoxfieldExtended.domHelpers).not.toBe(first);
  });
});
