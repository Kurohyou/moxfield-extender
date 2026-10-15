import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Load the content scripts on a deck page, the way the manifest does, with a
 * stub feature so initFeatures calls are observable.
 * @returns {Promise<Object>} The feature stub
 */
async function loadContent() {
  window.history.pushState({}, '', '/decks/abc');
  document.body.innerHTML = '';
  window.MoxfieldExtended = {};
  const shortcuts = { init: vi.fn(), cleanup: vi.fn(), refresh: vi.fn() };
  vi.resetModules();
  await import('../src/utils/storage.js');
  await import('../src/content/domHelpers.js');
  await import('../src/content/deckSettings.js');
  window.MoxfieldExtended.sectionShortcuts = shortcuts;
  await import('../src/content/index.js');
  // index.js awaits loadSettings before registering listeners.
  await vi.waitFor(() =>
    expect(window.MoxfieldExtended.state?.initialized).toBe(true)
  );
  return shortcuts;
}

describe('content index storage wiring', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('merges known sync keys into state.settings and re-runs initFeatures', async () => {
    const shortcuts = await loadContent();
    expect(shortcuts.init).toHaveBeenCalledTimes(1);

    await chrome.storage.sync.set({ sectionOddsEnabled: false });

    expect(window.MoxfieldExtended.state.settings.sectionOddsEnabled).toBe(
      false
    );
    expect(shortcuts.init).toHaveBeenCalledTimes(2);
  });

  it('applies feature switches arriving from sync', async () => {
    const shortcuts = await loadContent();
    await chrome.storage.sync.set({ sectionShortcutsEnabled: false });
    expect(shortcuts.cleanup).toHaveBeenCalled();
  });

  it('ignores sync keys it does not know', async () => {
    const shortcuts = await loadContent();
    await chrome.storage.sync.set({ somethingElse: 1 });
    expect(
      window.MoxfieldExtended.state.settings.somethingElse
    ).toBeUndefined();
    expect(shortcuts.init).toHaveBeenCalledTimes(1);
  });

  it('forwards local changes to the current deck key to deckSettings', async () => {
    await loadContent();
    const { deckSettings } = window.MoxfieldExtended;
    await deckSettings.ensureLoaded('abc');
    const sources = [];
    deckSettings.events.addEventListener('change', (event) =>
      sources.push(event.detail.source)
    );

    await chrome.storage.local.set({ 'deck:abc': { turns: 8 } });
    expect(sources).toEqual(['external']);
    expect(deckSettings.get().turns).toBe(8);
  });

  it('ignores local changes to other decks and other keys', async () => {
    await loadContent();
    const { deckSettings } = window.MoxfieldExtended;
    await deckSettings.ensureLoaded('abc');

    await chrome.storage.local.set({
      'deck:other': { turns: 8 },
      unrelated: 1,
    });
    expect(deckSettings.get().turns).toBe(3);
  });
});
