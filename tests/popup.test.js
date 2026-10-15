import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const POPUP_HTML = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'popup', 'popup.html'),
  'utf8'
);

let domListeners;
let sendMessage;

/**
 * Put the popup's markup in the page, load popup.js and run its
 * DOMContentLoaded handler (jsdom fired the real one long ago).
 * @param {Object} [sync] - chrome.storage.sync contents before load
 */
async function openPopup(sync) {
  if (sync) await chrome.storage.sync.set(sync);
  const parsed = new DOMParser().parseFromString(POPUP_HTML, 'text/html');
  document.body.innerHTML = parsed.body.innerHTML;

  const add = document.addEventListener.bind(document);
  vi.spyOn(document, 'addEventListener').mockImplementation((type, fn, opts) => {
    domListeners.push([type, fn, opts]);
    add(type, fn, opts);
  });
  vi.resetModules();
  await import('../src/popup/popup.js');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  // The markup's `checked` matches the defaults, so wait for the handler
  // (load settings, then add change listeners) rather than for a value.
  for (let i = 0; i < 5; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/**
 * Click a checkbox and let its change handler finish.
 * @param {string} id
 */
async function toggle(id) {
  document.getElementById(id).click();
  await vi.waitFor(() => expect(sendMessage).toHaveBeenCalled());
}

describe('popup', () => {
  beforeEach(() => {
    domListeners = [];
    vi.spyOn(console, 'log').mockImplementation(() => {});
    chrome.tabs.query = vi.fn(async () => [
      { id: 7, url: 'https://moxfield.com/decks/abc' },
    ]);
    sendMessage = vi.spyOn(chrome.tabs, 'sendMessage');
  });

  afterEach(() => {
    domListeners.forEach(([type, fn, opts]) =>
      document.removeEventListener(type, fn, opts)
    );
    delete chrome.tabs.query;
    vi.restoreAllMocks();
  });

  it('has Section Odds and Mana Curve toggles', async () => {
    await openPopup();
    const odds = document.getElementById('sectionOddsEnabled');
    const curve = document.getElementById('sectionCurveEnabled');
    expect(odds.type).toBe('checkbox');
    expect(curve.type).toBe('checkbox');
    expect(odds.closest('label').textContent).toContain('Section Odds');
    expect(odds.closest('label').textContent).toContain(
      '% chance per Section by turn'
    );
    expect(curve.closest('label').textContent).toContain('Mana Curve');
    expect(curve.closest('label').textContent).toContain(
      'Per-Section mana value bars'
    );
  });

  it('shows the stored values of the new toggles', async () => {
    await openPopup({ sectionOddsEnabled: false, sectionCurveEnabled: true });
    expect(document.getElementById('sectionOddsEnabled').checked).toBe(false);
    expect(document.getElementById('sectionCurveEnabled').checked).toBe(true);
  });

  it('defaults the new toggles to on when nothing is stored', async () => {
    await openPopup();
    expect(document.getElementById('sectionOddsEnabled').checked).toBe(true);
    expect(document.getElementById('sectionCurveEnabled').checked).toBe(true);
  });

  it('saves a toggle to sync and tells the tab, like the other toggles', async () => {
    await openPopup();
    await toggle('sectionCurveEnabled');

    expect(
      (await chrome.storage.sync.get('sectionCurveEnabled')).sectionCurveEnabled
    ).toBe(false);
    expect(sendMessage).toHaveBeenCalledWith(7, {
      type: 'SETTINGS_CHANGED',
      settings: { sectionCurveEnabled: false },
    });
  });

  it('saves the Section Odds toggle', async () => {
    await openPopup({ sectionOddsEnabled: false });
    await toggle('sectionOddsEnabled');
    expect(
      (await chrome.storage.sync.get('sectionOddsEnabled')).sectionOddsEnabled
    ).toBe(true);
  });

  it('lists the real shortcuts', async () => {
    await openPopup();
    const items = [...document.querySelectorAll('.shortcut-info li')].map(
      (li) => li.textContent.replace(/\s+/g, ' ').trim()
    );
    const text = items.join('\n');
    expect(text).toContain('Alt+P');
    expect(text).toContain('Alt+Shift+P');
    expect(text).toContain('Alt+O');
    expect(text).toContain('Alt+M');
    expect(text).toContain('Alt+= / Alt+−');
    expect(text).toContain('Alt+2-4');
    expect(text).not.toContain('Ctrl+Shift+P');
    expect(text).not.toContain('Alt+1-4');
  });
});
