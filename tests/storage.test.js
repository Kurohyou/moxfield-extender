import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import '../src/utils/storage.js';

const { storage } = window.MoxfieldExtended;

const FILES = [
  'src/utils/storage.js',
  'src/popup/popup.js',
  'src/background/serviceWorker.js',
];

/**
 * Extract the DEFAULT_SETTINGS object literal from a source file.
 * @param {string} path - Repo-relative file path
 * @returns {Object} The parsed defaults
 */
function readDefaults(path) {
  const source = fs.readFileSync(path, 'utf8');
  const match = source.match(/const DEFAULT_SETTINGS = (\{[\s\S]*?\n\});/);
  if (!match) throw new Error(`No DEFAULT_SETTINGS literal in ${path}`);
  return new Function(`return ${match[1]}`)();
}

describe('DEFAULT_SETTINGS', () => {
  it('turns Section odds and Section mana curve on by default', () => {
    expect(storage.DEFAULT_SETTINGS.sectionOddsEnabled).toBe(true);
    expect(storage.DEFAULT_SETTINGS.sectionCurveEnabled).toBe(true);
  });

  it('is declared identically in storage.js, popup.js and serviceWorker.js', () => {
    const [reference, ...others] = FILES.map(readDefaults);
    expect(Object.keys(reference)).toContain('sectionOddsEnabled');
    others.forEach((defaults) => expect(defaults).toEqual(reference));
  });

  it('loadSettings returns the new keys when nothing is stored', async () => {
    const settings = await storage.loadSettings();
    expect(settings).toMatchObject({
      sectionOddsEnabled: true,
      sectionCurveEnabled: true,
    });
  });
});
