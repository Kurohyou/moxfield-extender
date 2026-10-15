import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
const scripts = manifest.content_scripts[0].js;

/**
 * Repo-relative paths of the .js files in a source folder.
 * @param {string} dir - e.g. 'src/content'
 * @returns {string[]}
 */
function jsFilesIn(dir) {
  return readdirSync(join(root, dir))
    .filter((name) => name.endsWith('.js'))
    .map((name) => `${dir}/${name}`);
}

/**
 * Position of a script in the content-script list.
 * @param {string} path
 * @returns {number}
 */
function indexOf(path) {
  return scripts.indexOf(path);
}

describe('manifest content scripts', () => {
  it('lists every content and utils script on disk', () => {
    const onDisk = [...jsFilesIn('src/utils'), ...jsFilesIn('src/content')];
    onDisk.forEach((path) => expect(scripts).toContain(path));
  });

  it('lists only files that exist, once each', () => {
    scripts.forEach((path) => expect(existsSync(join(root, path))).toBe(true));
    expect(new Set(scripts).size).toBe(scripts.length);
  });

  it('loads index.js last', () => {
    expect(scripts.at(-1)).toBe('src/content/index.js');
  });

  it('loads storage.js and domHelpers.js before everything that uses them', () => {
    // A use is a namespace lookup or a destructured name, e.g.
    // `MoxfieldExtended.storage` or `const { state, storage } = ns()`.
    const uses = {
      'src/utils/storage.js': /MoxfieldExtended\??\.storage\b|[{,]\s*storage\s*[,}]/,
      'src/content/domHelpers.js': /MoxfieldExtended\??\.domHelpers\b|[{,]\s*domHelpers\s*[,}]/,
    };
    Object.entries(uses).forEach(([helper, pattern]) => {
      const at = indexOf(helper);
      expect(at).toBeGreaterThanOrEqual(0);
      const users = scripts.filter(
        (path) =>
          path !== helper && pattern.test(readFileSync(join(root, path), 'utf8'))
      );
      expect(users.length).toBeGreaterThan(0);
      users.forEach((user) => expect(indexOf(user)).toBeGreaterThan(at));
    });
  });

  it('loads the helpers before the header, badge and popover modules', () => {
    const order = [
      'src/content/deckSettings.js',
      'src/content/oddsMath.js',
      'src/content/manaValue.js',
      'src/content/popover.js',
      'src/content/sectionOdds.js',
      'src/content/sectionCurve.js',
      'src/content/headerCluster.js',
      'src/content/settingsPopover.js',
      'src/content/badge.js',
    ];
    order.forEach((path) => expect(indexOf(path)).toBeGreaterThanOrEqual(0));
    const positions = order.map(indexOf);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});
