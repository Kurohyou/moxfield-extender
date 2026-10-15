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
