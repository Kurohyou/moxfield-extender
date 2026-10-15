# Feature: Section odds and Section mana curve (implementation plan)

## Feature Description

Code-level plan for the behaviour spec [`hypergeometric-section-odds.md`](hypergeometric-section-odds.md) (cited below as **spec §n**). It adds two header features to Moxfield's deck view, plus the controls around them:

- **Section odds**: a `%` chip in each mainboard Section header.
- **Section mana curve**: a tiny bar graph in each mainboard Section header.
- **Shared right cluster**: the header area that holds both, with a shared slot for crowded headers.
- **Controls**: a three-segment floating badge, a settings popover that replaces `prompt()`, a per-Section override stepper, popup toggles, and the Alt+O / Alt+M / Alt+= / Alt+− shortcuts.

Vocabulary follows [`GLOSSARY.md`](../../GLOSSARY.md): **Section**, **Board**, **Library**, **Section odds**, **Mana value**, **Section mana curve**. When this plan and the spec disagree, the spec wins. Raise the conflict instead of following the plan.

## User Story

As a Commander deck builder, I want each Section header to show the chance of having seen enough of that Section by a given turn, and the Section's own mana curve, so I can judge consistency and curve shape per role without leaving the deck view.

## Context References

### Relevant Codebase Files (READ BEFORE IMPLEMENTING)

| File | Purpose |
|------|---------|
| [hypergeometric-section-odds.md](hypergeometric-section-odds.md) | The behaviour spec. Every task below cites its sections |
| [GLOSSARY.md](../../GLOSSARY.md) | Canonical terms: use them in identifiers, comments and UI text |
| [src/content/domHelpers.js](../../src/content/domHelpers.js) | DOM reading. Already fixed by PR #7 (see Pitfalls). Gains the deck-model readers |
| [src/content/priceVisualization.js](../../src/content/priceVisualization.js) | Owns today's badge (`indicatorElement`), `prompt()` budget entry, Alt+P, `getDeckId()`. Gets the badge and `prompt()` removed |
| [src/content/sectionShortcuts.js](../../src/content/sectionShortcuts.js) | Module pattern (IIFE, `init`/`cleanup`/`refresh`, CSS injection, hover tracking) |
| [src/content/index.js](../../src/content/index.js) | `initFeatures()`, `SETTINGS_CHANGED` listener, the debounced `MutationObserver` |
| [src/utils/storage.js](../../src/utils/storage.js) | `DEFAULT_SETTINGS` and the `chrome.storage.sync` helpers |
| [src/popup/popup.html](../../src/popup/popup.html), [popup.js](../../src/popup/popup.js) | Feature toggles (`SETTING_IDS`) and the shortcut list |
| [src/background/serviceWorker.js](../../src/background/serviceWorker.js) | Third copy of `DEFAULT_SETTINGS`, written on install |
| [manifest.json](../../manifest.json) | Content-script load order |

### Primary sources (read-only, never merge)

| Source | Use |
|--------|-----|
| [`research/moxfield-deck-page-facts`](https://github.com/Kurohyou/moxfield-extender/blob/research/moxfield-deck-page-facts/research/moxfield-deck-page-facts.md) | DOM structure, special-Board titles, header price markup, Group-by values |
| [`prototype/section-curve`](https://github.com/Kurohyou/moxfield-extender/blob/prototype/section-curve/src/content/sectionCurve.prototype.js) variant A | Sparkline look, mana symbol parsing, footer lookup |
| [`prototype/settings-modal`](https://github.com/Kurohyou/moxfield-extender/blob/prototype/settings-modal/src/content/settingsModal.prototype.js) variant B | Badge segments, popover, override stepper, Alt+=/− hover tracking |

The prototypes predate some decisions. Where a prototype and the spec differ (for example, the prototype caps the override at the Section count, and its curve has a `7+` bucket), follow the spec.

### New Files to Create

| File | Purpose |
|------|---------|
| `src/content/oddsMath.js` | Pure: hypergeometric P(X ≥ k), certain/impossible classification, `%` formatting, tooltip text |
| `src/content/manaValue.js` | Pure: mana symbol → value, cost cell → Mana value, rows → curve data |
| `src/content/deckSettings.js` | Per-deck settings and overrides in `chrome.storage.local`, plus a shared change-event bus |
| `src/content/popover.js` | One anchored popover primitive: positioning, outside-click, Esc, one open at a time |
| `src/content/sectionOdds.js` | Odds chip view, override stepper, Alt+=/− with hover tracking |
| `src/content/sectionCurve.js` | Sparkline view and tooltip |
| `src/content/headerCluster.js` | Refresh orchestrator: one DOM read, then render the right cluster, then lay out crowded headers |
| `src/content/settingsPopover.js` | The badge's settings popover (spec §5.2) |
| `src/content/badge.js` | Three-segment badge and the always-on Alt+O / Alt+M handler |
| `vitest.config.js` | jsdom environment and setup file |
| `tests/setup/chromeStub.js` | In-memory `chrome.storage.{sync,local}`, `onChanged`, `runtime.onMessage` |
| `tests/fixtures/*.html` + `tests/fixtures/deckDom.js` | Real captured markup, plus a builder for synthetic decks |
| `tests/*.test.js` | Unit tests (listed under Phase 1–7) |

---

## Pitfalls (read first)

1. **The spec appendix's `extractQuantity` bug and stale selector are already fixed on the base branch.** PR #7 (`3cc60ed`, merged as `5be1b1b`) rewrote `extractQuantity` to read the first cell's text or `input.value`. It also removed `li[id^="id56-"]` and scoped `sectionHeader` to `section.deckview article`. **Verify; don't re-fix.** Phase 1 adds regression tests for `"6Forest"` → 6 and owner `<input value="8">` → 8. Note that `extractQuantity` still falls back to **1** on NaN.
2. **Branch from `origin/master`, not local `master`.** Local `master` is at `a201574` (pre-PR #7). It also carries uncommitted goldfish-mode work in `priceVisualization.js` (an `isGoldfishMode()` helper and guards). Don't build on that working tree. Ask the user to commit or land the goldfish change first. Phase 3 moves `isGoldfishMode()` into `domHelpers.js`, so the two must be reconciled.
3. **The `MutationObserver` will feed on its own output.** `index.js` refreshes 250 ms after *any* `childList` change under `body`. Price bars only touch classes and styles, but chips, curves, the badge and popovers insert nodes, so without a guard each render schedules another refresh forever. Fix this in two layers (Phase 3):
   - The observer ignores mutations confined to extension-owned nodes (`[data-mox]`).
   - Renders are idempotent: only write `textContent`, `title` or style when the value changes.
4. **React owns the header `li`.** Never change Moxfield's `className` on its nodes, because React overwrites it on re-render. Style through our own nodes, and through `:has()` selectors such as `li:has(> .mox-cluster)`.
   - React may append its own node (e.g. the header price when the viewer turns Price on) after our cluster. Each refresh re-appends the cluster as the last child if needed.
5. **`getSectionHeaders()` is the wrong source.** It also returns Considering and Tokens (`div.cursor-pointer strong`) and includes the Commander and Sideboard Sections. Use the new `getMainboardSections()`.
6. **Read Section names from `span[title]`, not text.** `sectionShortcuts.getSectionName()` uses `/^([^(]+)/`, which breaks on tags containing `(`. Overrides are keyed by name, so this matters.
7. **`event.key` is unreliable with Alt.** macOS Option turns Alt+O into `ø`. Match on `event.code`: `KeyO`, `KeyM`, `Equal`, `Minus`, `NumpadAdd`, `NumpadSubtract`.
8. **Shortcuts can't live in a feature's `init`/`cleanup`.** `index.js` only initialises enabled features, so an Alt+O registered inside the odds module could never turn odds back on. The badge module owns Alt+O and Alt+M and is always loaded.
9. **`DEFAULT_SETTINGS` exists three times** (`storage.js`, `popup.js`, `serviceWorker.js`). Add the new keys to all three. Phase 4 adds a parity test.
10. **jsdom has no layout.** Keep the crowding decision a pure function of measured widths, and test that function. Measuring and applying the result are checked by hand.
11. **The existing plans' `file:///c:/Users/scase/...` links are stale.** Use repo-relative links.

---

## Implementation Plan

Phases are ordered so that each one ends green (`npm test`, `npm run lint`) and can be a commit. Suggested branch: **`feat/section-odds`**, cut from up-to-date `origin/master`, or from `master` after this docs branch merges.

### Phase 0: Prerequisites

- Land or rebase the uncommitted goldfish work (Pitfall 2).
- **Check shortcut collisions (spec §5.5).** Load Moxfield's deck-page bundles in the page and search them for `keydown` handlers using `altKey` plus `o`/`m`/`=`/`-` or `KeyO`/`KeyM`/`Equal`/`Minus` (the same method as research S5). Then press each combo on a live deck page with the extension off. Chrome itself binds Alt+F, Alt+E and Alt+D on Windows, but not O, M, = or −.
  - **If anything collides, stop and ask the user.** Don't pick new keys.

### Phase 1: Test harness and fixtures

**Harness**

- Add `vitest` and `jsdom` as devDependencies.
- Add scripts `"test": "vitest run"` and `"test:watch": "vitest"`.
- `vitest.config.js`: `environment: 'jsdom'`, `setupFiles: ['tests/setup/chromeStub.js']`, `include: ['tests/**/*.test.js']`. Tests live outside `src/`, so `eslint src/` and the shipped extension never see them.

**Loading the IIFE scripts.** Content scripts aren't ES modules (MV3 content scripts can't be). Tests side-effect-import them and read the global namespace:

```js
import '../src/content/domHelpers.js';
const { domHelpers } = window.MoxfieldExtended;
```

Each test file gets a fresh module graph. Inside a file, use `vi.resetModules()` plus a re-import when a test needs a clean module state.

**`chromeStub.js`**

- In-memory `storage.sync` and `storage.local` with `get(defaults, cb)`, `get(keys)`, `set`, `remove`.
- Both callback and promise forms.
- `storage.onChanged.addListener`, firing `(changes, areaName)` after `set`.
- `runtime.onMessage.addListener`.
- `__reset()` for `beforeEach`.
- **jsdom gaps.** Stub a no-op `ResizeObserver` (`headerCluster.init()` creates one and would throw without it). Check whether `requestAnimationFrame` exists in vitest's jsdom environment, and stub it with a synchronous call if not. The layout pass and the "zero DOM writes" test depend on it.
- **jsdom widths are all 0.** `chooseHeaderLayout` returns `hidden` in render tests, so those tests assert that nodes exist and that writes are idempotent, never that anything is visible.

**Fixtures**

- Capture real `outerHTML` from live deck pages with the built-in browser:
  - A mainboard Section header without price, and one with price (`span.text-nowrap.fw-normal.ms-1`).
  - The Commander header, including `Commander(2)` for partners.
  - The Sideboard header.
  - A viewer row (`"6Forest"`) and an owner row (`input.input-borderless`).
  - Rows with: a split card (`{1}{U/B} // {3}{U}{B}`), a `{2/W}` hybrid, a phyrexian symbol, `{X}`, a `{0}` artifact, a land, and a land-adventure (Midgar, City of Mako).
  - The deck-stats footer element (`N main deck`).
  - `select#groupBy`.
  - The Cost Analysis mana-curve panel (the over-match trap).
- Strip hashed classes only where they would make fixtures noisy. Keep `data-testid`, `data-hash`, `title`, and the `mana mana-*` classes verbatim.
- **Record the exact `mana-*` class for each symbol kind** (hybrid, `{2/W}`, phyrexian, snow, colourless, X). `manaValue.js`'s symbol table depends on it, and the spec only verified the cost cell's location.
- `deckDom.js`: `buildDeck({ footerCount, groupBy, sections: [{ title, rows: [{ qty, owner, cost: ['2','w'] }] }] })` builds `section.deckview article > ul > li…` plus the footer, from the captured fragments.

**Regression tests**

- `tests/domHelpers.test.js`:
  - `extractQuantity` returns 6 on the `"6Forest"` row and 8 on the owner input.
  - `SELECTORS.sectionHeader` doesn't match the mana-curve panel fixture (spec appendix).

### Phase 2: Pure maths (TDD)

**`oddsMath.js`**, exposed as `window.MoxfieldExtended.oddsMath` (spec §2.1, §2.4, §2.6):

```js
// N = Library, K = Section count, turns = T, k = desired (≥ 1)
evaluate({ N, K, turns, k }) → {
  kind: 'certain' | 'impossible' | 'odds',
  p,                 // exact 1 / 0 for certain / impossible
  seen,              // min(7 + turns, N)
  wholeLibrary,      // 7 + turns >= N
  label,             // chip text: '100%', '0%', '>99%', '<1%', '63%'
  tooltip,           // '63% ≥2 by T4' | '100% ≥2, whole Library seen' | 'Only 3 cards in Section; need ≥4'
}
```

**Classify combinatorially, before any floating point**, so `100%`/`0%` mean exactly certain/impossible:

- `seen = Math.min(7 + turns, N)`.
- **impossible** when `k > Math.min(K, seen)`.
  - When `k > K` (desired > Section count), the tooltip is the reason, "Only K cards in Section; need ≥k" (singular "card" when K = 1). This takes precedence over "whole Library seen".
  - When `K ≥ k > seen`, the tooltip is the normal form, e.g. `0% ≥8 by T0`.
- **certain** when `k <= seen - (N - K)`. This covers the whole-Library case when K ≥ k.
- **otherwise**: `p = Σ_{x=k}^{min(K,seen)} C(K,x)·C(N−K,seen−x) / C(N,seen)` in log space, using a cached log-factorial table (pattern: the settings prototype's `logFact`/`logC`).
- **Label**: `r = Math.round(p * 100)`; show `>99%` if `r >= 100`, `<1%` if `r <= 0`, else `${r}%`. The tooltip uses the same label.

**`oddsMath.libraryError(N, sections)`** returns `null` or a reason string:

- `N` isn't a positive integer → the footer reason.
- `N < max(section.count)` → `Library (99) is smaller than Creatures (104)`.

**`tests/oddsMath.test.js`**

- Exact oracle: a BigInt `C(n,k)` sum inside the test, compared to `p` within `1e-12`, over a grid of N ≤ 60.
- Reference values, computed with BigInt:

| N | K | T | k | p | Label |
|---|---|---|---|---|---|
| 99 | 10 | 3 | 1 | 0.67360 | `67%` |
| 99 | 37 | 0 | 3 | 0.52468 | `52%` |
| 99 | 1 | 3 | 1 | 0.10101 | `10%` |
| 99 | 60 | 3 | 1 | 0.99996 | `>99%` (not certain: 10 − 39 < 1) |
| 99 | 90 | 3 | 2 | 0.999999999994 | `>99%` (not certain: 10 − 9 = 1 < 2) |
| 99 | 93 | 3 | 4 | 1 exactly | `100%` (certain: 10 − 6 = 4 ≥ 4) |
| 99 | 2 | 0 | 2 | 0.00433 | `<1%` |
| 99 | 2 | 3 | 2 | 0.00928 | `1%` |
| 99 | 3 | 3 | 4 | 0 | `0%`, tooltip "Only 3 cards in Section; need ≥4" |
| 9 | 4 | 3 | 2 | 1 | `100%`, tooltip "…whole Library seen" (7 + 3 ≥ 9) |
| 9 | 1 | 3 | 2 | 0 | `0%`, tooltip "Only 1 card in Section; need ≥2" (the count reason beats "whole Library seen") |

- `libraryError`: NaN, 0, and Library < a Section count.

**`manaValue.js`**, exposed as `window.MoxfieldExtended.manaValue` (spec §3.2–§3.4):

- `symbolValue(sym)`, for the class suffix after `mana-`:
  - Digits → their number.
  - `x`/`y`/`z` → 0.
  - `{2/W}` form → 2.
  - Every other symbol (coloured, `c`, `s`, other hybrid, phyrexian) → 1.
  - Use the class names recorded in Phase 1 for each kind.
- Ignore the non-symbol classes `mana`, `mana-cost` and `mana-shadow` (see the curve prototype).
- `costOfRow(row)`:
  - Returns `null` when the row's cost cell (`div.text-nowrap.text-end`) holds no `span.mana`.
  - Otherwise returns the sum over **every** `span.mana` in that cell, so split cards add both halves (spec §3.3).
- `buildCurve(rows, extractQuantity)` returns `null` when every row is costless (spec §3.4). Otherwise:

```js
{ bars: [{ mv, count }], costless, avg, total }
```

  - `bars` always covers MV 1–6.
  - It adds MV 0 only if some row has MV 0.
  - It extends to the highest MV, with empty gaps.
  - Counts are quantities.
  - Rows are deduplicated by `data-hash` within the Section.

**`tests/manaValue.test.js`**

- Symbol table: `2w` → 2, `wu` → 1, phyrexian → 1, `x` → 0.
- The split fixture → 7.
- `{0}` artifact → bar 0 present.
- A 10-drop → bars 1–10.
- Quantities are counted (`6Forest` costed fixture).
- All-costless Section → `null`.
- `costless` count and weighted `avg`.

### Phase 3: Reading the deck from the DOM

**[MODIFY] `domHelpers.js`.** Keep all queries scoped to `section.deckview article` (spec appendix).

- `SPECIAL_BOARD_TITLES`: `Commander`, `Companion`, `Sideboard`, `Signature Spell`, `Oathbreaker`, `Arthur`, `Excalibur`, `Attraction Deck`, `Contraption Deck`, `Stickers` (spec §2.3, research Q1).
- `getMainboardSections()` returns `[{ ul, headerLi, link, name, count, rows }]`:
  - `name` comes from the `span[title]` attribute.
  - `count` is the `(n)` in the `span` after `span[title]`, falling back to the last `\((\d+)\)` in the link text.
  - Skip Sections whose title is in `SPECIAL_BOARD_TITLES`. The spec's known limitation about user tags with those names stays.
- `readLibrary()` returns `{ ok: true, value }` or `{ ok: false, reason }` (spec §2.2):
  - Find the footer by text, `/^\s*(\d+)\s+main deck\s*$/`. Use a `TreeWalker` over text nodes containing `main deck`; don't scan every `div` the way the prototype does.
  - From each hit, walk up the ancestors until one's `textContent` matches the regex. Stop once the text is longer than about 40 characters. The count and "main deck" may sit in separate elements, so the text node's direct parent may never match.
  - Settle the real structure from the footer fixture captured in Phase 1.
  - Cache the element while it's still `isConnected` and still matches.
  - Subtract the `(n)` of the Commander header, or 0 if there is no Commander Section.
- `getGroupBy()` returns `document.querySelector('select#groupBy')?.value ?? 'type'` (spec §2.5).
- Move `getDeckId()` here from `priceVisualization.js`.
- Add `isGoldfishMode()` here (from the goldfish WIP; Pitfall 2).
- `isOwnMutation(mutation)`: true when `mutation.target` is inside `[data-mox]`, or when every added or removed node is (or is inside) `[data-mox]`.

**[MODIFY] `index.js` observer.** Drop mutations where `isOwnMutation` is true before setting `hasRelevantChanges`.

**`tests/deckModel.test.js`**

- Mainboard filtering: Commander, Sideboard and Companion are excluded, and `Untagged Creatures` is kept.
- Names with `(`.
- Partner `Commander(2)` → Library = footer − 2.
- No Commander Section → subtract 0.
- Missing or garbled footer → `{ ok: false }`.
- `getGroupBy` with a hidden select.
- `isOwnMutation` for our nodes vs a Moxfield row insert.

### Phase 4: Storage

**Global toggles, in `chrome.storage.sync`** (spec §2.5, §3.6):

- Add `sectionOddsEnabled: true` and `sectionCurveEnabled: true` to `DEFAULT_SETTINGS` in **`storage.js`, `popup.js` and `serviceWorker.js`**.
- One flag per feature. Badge, popover, popup, Alt+O and Alt+M all write the same key. This differs from price bars, which have a feature switch (`priceVisualizationEnabled`) and a separate on-state (`priceVisualizationActive`). The spec gives odds and curve a single on/off, so this plan doesn't copy price's split.

**Per-deck settings, in `chrome.storage.local`, one item per deck:**

```js
// key: `deck:${deckId}`
{
  turns: 3,              // spec §2.5 "By turn", T ≥ 0
  desired: 1,            // spec §2.5 "At least", ≥ 1
  sharedSlot: 'odds',    // spec §4 shared-slot choice: 'odds' | 'curve'
  overrides: {           // spec §2.5: deck → Group-by → Section name
    tag: { 'card advantage': 2 },
    type: { Creatures: 3 },
  },
}
```

- **Why `local`, not `sync`.** `sync` has quota limits, roughly 8 KB per item, 100 KB in total, 512 items, and 120 writes per minute. Check the current values in the `chrome.storage` docs at implementation time. A held Alt+= or a fast stepper can blow the write rate, and many decks with overrides can exhaust the total. `local` has 10 MB and no write-rate limit. The trade-off is that per-deck settings don't follow the user to other machines. Global toggles still do.
- **Shape changed after this plan.** Each override is now an entry `{ desired?, turns? }`, e.g. `type: { Creatures: { desired: 3, turns: 5 } }`, so a Section can also override By turn (spec §2.5). A stored plain number still loads as `{ desired }`. `deckSettings` adds `turnsFor`, `setTurnsOverride` and `resetOverride`.
- **Nest the override keys. Never concatenate them.** Section names can contain any character.
- **Orphaned overrides are kept** (spec §2.5): no cleanup pass.
- **Budget goal stays in page `localStorage` (`mox-budget-${deckId}`).** It isn't migrated. The popover just reads and writes it through `priceVisualization`. Migrating it is a possible follow-up, not part of this plan.

**[NEW] `deckSettings.js`**, exposed as `window.MoxfieldExtended.deckSettings`:

- `events`: an `EventTarget` shared by all modules. It dispatches `change` with `detail: { source }`.
- `ensureLoaded(deckId)`: loads on first use and whenever the deck ID changes (SPA navigation between decks). It resolves to the current settings.
- `get()` returns the in-memory copy.
- `setTurns(n)`, `setDesired(n)` and `setSharedSlot(v)` clamp to the spec's bounds.
- `desiredFor(groupBy, name)` returns the override, or the default.
- `isOverridden(groupBy, name)`.
- `setOverride(groupBy, name, n | null)`:
  - `null` resets the override.
  - **Setting a value equal to the deck default deletes the override**, as in prototype B. So the dotted underline only shows while the value differs from the default.
  - Empty Group-by buckets are pruned. Pruning an *empty bucket* isn't override cleanup.
- Writes update memory and dispatch `change` immediately. They are persisted with a 300 ms trailing debounce and flushed on `pagehide`.

**[MODIFY] `index.js`.** Add a `chrome.storage.onChanged` listener:

- `sync` changes to known keys → merge into `state.settings`, then call `initFeatures()`.
- `local` changes to the current `deck:` key → reload `deckSettings`.

This keeps popup, badge and other tabs in step. The existing `SETTINGS_CHANGED` message path stays. `initFeatures()` is idempotent, so a double call is harmless.

**`tests/storage.test.js`**

- Defaults.
- Override round-trip by deck → Group-by → name.
- An orphan survives.
- Setting an override equal to the default deletes it.
- Desired 0 is refused (clamped to 1).
- Debounced write count.
- `onChanged` fires.
- **`DEFAULT_SETTINGS` parity**: read the three files as text and assert they declare the same keys and defaults.

### Phase 5: Header right cluster, odds chip and curve

**[NEW] `headerCluster.js`**, the single refresh path. `window.MoxfieldExtended.headerCluster` exposes `init`, `cleanup`, `refresh` and `chooseHeaderLayout`.

`refresh()` runs on every debounced DOM change, settings change and deck-settings `change`:

1. If `isGoldfishMode()`, or both `sectionOddsEnabled` and `sectionCurveEnabled` are off, remove every `.mox-cluster` and return (spec §1, §3.5).
2. Read the model once: `deckId`, `groupBy`, `library = readLibrary()`, `sections = getMainboardSections()`, then `await deckSettings.ensureLoaded(deckId)`.
3. For each Section:
   - `odds = sectionOdds.view(section, library, settings)` if odds are on.
   - `curve = sectionCurve.view(section)` if the curve is on and `groupBy !== 'cmc'` (spec §3.5). It returns `null` for all-costless Sections.
4. `ensureCluster(headerLi)`: a `span.mox-cluster[data-mox]` that is the last child of the header `li`. Re-append it if React has put anything after it (Pitfall 4).
5. Hand the odds and curve elements to the cluster idempotently, and remove the parts whose feature is off (the table in spec §4).
6. Remove clusters from headers that are no longer mainboard Sections.
7. `scheduleLayout()`.

**Layout** (spec §4 squeeze order) runs in `requestAnimationFrame` with all reads first, then all writes. It also re-runs from a single `ResizeObserver` on the deck `article`, because a window resize causes no DOM mutation.

```js
chooseHeaderLayout({
  available,           // headerLi.clientWidth − padding
  fixed,               // anchor width without the name + header price + "+ N other" + "Change"
  nameFull,            // span[title].scrollWidth
  nameMin,             // MIN_NAME_PX (≈ 3 chars + ellipsis)
  curve, chip,         // natural widths, 0 when absent
  gap,
  previous,            // last result, for hysteresis
}) → 'both' | 'shared' | 'single' | 'hidden'
```

- **`both`**: `fixed + nameFull + curve + chip + 2·gap ≤ available`. When coming back from `shared`, it needs an extra `HYSTERESIS_PX` (8 px) so the layout doesn't flap.
- **`shared`**: both items exist and `fixed + nameMin + max(curve, chip) + gap ≤ available`. The name truncates as needed.
- **`single`**: only one item exists and it fits beside `nameMin`.
- **`hidden`**: nothing fits (step 3 of the squeeze order).

Apply the result as `data-layout` on the cluster. CSS does the rest. The header price is `flex: none` and never hides (spec §4).

```css
section.deckview article > ul > li:has(> .mox-cluster) { min-width: 0; }
section.deckview article > ul > li:has(> .mox-cluster) > a.table-deck-row-link { min-width: 0; flex: 0 1 auto; }
section.deckview article > ul > li:has(> .mox-cluster) > a.table-deck-row-link > span[title] { min-width: 0; }
section.deckview article > ul > li:has(> .mox-cluster) > span.text-nowrap.fw-normal { flex: none; }
.mox-cluster { margin-left: auto; flex: none; display: inline-flex; align-items: center; gap: 6px; padding-left: 6px; }
.mox-cluster[data-layout="shared"][data-shows="odds"] .mox-curve,
.mox-cluster[data-layout="shared"][data-shows="curve"] .mox-odds,
.mox-cluster[data-layout="hidden"] { display: none; }
```

Without `min-width: 0` on the anchor, Moxfield's `text-ellipsis` can't take effect: flex items default to `min-width: auto`. Verify this live.

**Shared slot** (spec §4):

- `data-shows` comes from `deckSettings.get().sharedSlot`.
- A left-click on a `shared` cluster calls `setSharedSlot(other)`. That is deck-wide and persisted, so every shared slot flips.
- Standalone chips and curves ignore left-click (spec §5.3).
- Every handler calls `stopPropagation()`, so the header anchor's collapse toggle never fires.

**[NEW] `sectionOdds.js`** (spec §2, §5.3):

- `view(section, library, settings)` updates or creates `span.mox-odds[data-mox]`:
  - With a library error, the chip shows `?` and its tooltip gives the reason, on every chip (spec §2.6). The curve is unaffected.
  - Otherwise it uses `oddsMath.evaluate({ N, K: section.count, turns, k: desiredFor(groupBy, name) })`.
  - The chip text is the label, `title` is the tooltip, and the class `mox-odds--override` adds the dotted underline (spec §2.4).
- **Override stepper**: `contextmenu` on `.mox-odds`, or on a shared cluster showing the curve, calls `preventDefault()` and opens `popover.open(anchor, …)` with:
  - the Section name and its card count;
  - the full form, e.g. `7% ≥2 by T3`;
  - − / + buttons, min 1 and **no upper bound** (spec §2.5, §2.6: desired > count shows `0%` with a reason);
  - a "reset to default (k)" link, shown only while overridden.

  The stepper redraws on `deckSettings` `change` and closes if its Section disappears.
- **Alt+= / Alt+−**:
  - A capture-phase delegated `mouseover` on `document` tracks the hovered mainboard Section, using `closest('section.deckview article > ul')` and then the header `span[title]`. Delegation survives React re-renders, unlike `sectionShortcuts`' per-header listeners.
  - The keydown handler (capture phase) acts on `event.code` `Equal`/`NumpadAdd` and `Minus`/`NumpadSubtract` with `altKey`, `!ctrlKey` and `!metaKey`. Shift is allowed, for `+`.
  - It needs a hovered Section and odds on. It skips editable targets (`input`, `textarea`, `select`, `[contenteditable]`): owner decks have quantity inputs.
  - Only when it acts does it call `preventDefault()` and `stopPropagation()`.
  - These handlers live while odds are on. Turning odds off removes them, which is fine because there are no chips to change.

**[NEW] `sectionCurve.js`** (spec §3):

- `view(section)` returns `null` when `manaValue.buildCurve(section.rows, extractQuantity)` is `null`. Otherwise it updates or creates `span.mox-curve[data-mox]` with one `span` per bar:
  - Bars are 3 px wide with a 1 px gap, 12 px tall at most, in `currentColor`.
  - Heights are scaled to the Section's tallest bar.
  - An empty bar is a 1 px stub at low opacity (prototype variant A).
- Bar heights are set through a CSS custom property, and only when changed.
- Tooltip (`title`):

```
Creatures
1: 3 · 2: 5 · 3: 4 · 4: 2 · 5: 0 · 6: 1
Avg mana value 2.73
2 cards with no mana cost not shown
```

  The last line appears only when `costless > 0` (spec §3.1).

**Tests**

- `tests/headerCluster.test.js` covers `chooseHeaderLayout`:
  - Each branch.
  - Hysteresis at the both/shared boundary.
  - Single item.
  - Hidden.
- `tests/headerClusterRender.test.js` (jsdom, no layout):
  - Refresh renders one cluster per mainboard Section and none on Commander or Sideboard.
  - No curve when `groupBy` is `cmc`.
  - No curve on an all-costless Section, while the chip stays.
  - `?` on every chip when the footer is missing.
  - A second `refresh()` with no change performs **zero** DOM writes (MutationObserver spy). This guards against the observer loop.
  - The cluster is re-appended after a foreign node is added after it.
  - Goldfish removes everything.
- `tests/sectionOdds.test.js`:
  - Alt+= on a hovered Section creates an override; Alt+− back to the default deletes it.
  - Ignored when the target is an `input`.
  - Ignored with Ctrl.
  - `code` matching works when `key` is `ø`-style.

### Phase 6: Badge, settings popover and price rework

**[NEW] `popover.js`.** `open(anchorEl, render, { onClose }) → { update(), close() }`.

- Position: `position: fixed` below the anchor and right-aligned, clamped to the viewport.
- No backdrop.
- Closes on an outside `mousedown` (capture), on Esc, and when the anchor is disconnected.
- Only one popover is open at a time: opening one closes the other.
- The root carries `[data-mox]`.

**[NEW] `badge.js`.** It is always initialised on deck pages (Pitfall 8) and replaces `priceVisualization`'s `indicatorElement`. Reuse its CSS (`.mox-price-mode-indicator` becomes `.mox-badge`).

**Visibility** (spec §1, §5.1): the badge is shown when `!isGoldfishMode()` and any of these holds:

- price is on (`priceVisualizationEnabled && priceVisualizationActive`);
- `sectionOddsEnabled`;
- `sectionCurveEnabled`.

**Segments.** Each segment is a `span[data-seg]`; an off segment is struck through.

| Segment | Text | Notes |
|---|---|---|
| price | `📊 Section %`, `📊 Deck %`, `📊 Budget $N`, or `📊 Price` when off | Hidden when `priceVisualizationEnabled` is false. When the viewer's Moxfield Price is off (`isPriceEnabled()`), it is struck and inert, with a hint in its `title` |
| odds | `🎲 T3 ≥1` | From `deckSettings` |
| curve | `📈 Curve` | |

**Gestures** (spec §5.1):

- Left-click on price: Section → Deck → Off → Section, via `priceVisualization.cycle()`.
- Left-click on odds: toggles `sectionOddsEnabled`.
- Left-click on curve: toggles `sectionCurveEnabled`.
- Right-click anywhere: `preventDefault()`, then toggle the settings popover.

**Global toggles** write `chrome.storage.sync` through `storage.setSetting`. The `onChanged` listener in `index.js` re-runs `initFeatures()` (Phase 4), so badge, popup and Alt keys share one path.

**Keys**: a capture-phase keydown for `altKey` plus `KeyO` (toggle odds) or `KeyM` (toggle curve), with no Ctrl, Meta or Shift and not in editable targets (spec §5.5).

**Re-rendering**: on `deckSettings` `change` and on settings changes.

**[NEW] `settingsPopover.js`** (spec §5.2). Changes apply live: no Save or Cancel. Groups:

- **Price bars**
  - On/off and Section/Deck, through `priceVisualization`.
  - A budget input (`$`), enabled only in Deck mode. It commits on blur or Enter; empty clears the budget, and invalid input reverts. This replaces `prompt()` and `alert()`.
  - When `isPriceEnabled()` is false, the whole group is disabled with "Turn on Price in Moxfield's view options".
- **Section odds**
  - On/off.
  - A "By turn" stepper labelled `T3 · 10 cards seen`. Min 0, and the + button disables once `7 + T ≥ Library` (spec §2.5). There is no maximum when the Library is unreadable. A stored T above the current maximum is shown as-is and computes as whole Library seen.
  - An "At least (default)" stepper, min 1.
- **Mana curve**: on/off.
- A muted hint: "Per-Section: right-click a Section's %, or hover a Section and press Alt+= / Alt+−". There is no per-Section list (spec §5.2).

**[MODIFY] `priceVisualization.js`**

- Remove `showIndicator`, `hideIndicator`, `promptBudgetGoal`, `alert()`, and the indicator CSS.
- Import `getDeckId` and `isGoldfishMode` from `domHelpers`.
- Expose:
  - `getState() → { active, deckWide, budget }`
  - `cycle()`: Section → Deck → Off → Section. Off → on lands in Section mode (spec §5.1).
  - `setActive(bool)`
  - `setDeckWide(bool)`
  - `setBudgetGoal(n | null)`
- Dispatch `deckSettings.events` `change` after each state change, so the badge and popover redraw.
- Keep Alt+P and Alt+Shift+P as they are, including `event.key` handling (outside this effort).
- Don't change the `chrome.storage.sync` keys `priceVisualizationActive` and `priceVisualizationDeckWide`.

**Tests**

- `tests/badge.test.js`:
  - Visibility truth table, including goldfish and "all off" (no badge).
  - The price cycle sequence.
  - Odds and curve segment clicks write the sync keys.
  - Right-click opens the popover and suppresses the context menu.
  - Alt+O and Alt+M toggle even while the feature is off.
- `tests/popover.test.js`:
  - Esc and outside click close it.
  - Only one is open at a time.
  - It closes when the anchor is removed.
- `tests/settingsPopover.test.js`:
  - The budget input is disabled outside Deck mode.
  - Invalid budget input reverts.
  - The By-turn + is disabled at `7 + T ≥ Library`.
  - At-least stops at 1.

### Phase 7: Popup and integration

**[MODIFY] `popup.html` / `popup.js`** (spec §5.4, appendix):

- Add the **Section Odds** toggle ("% chance per Section by turn") and the **Mana Curve** toggle ("Per-Section mana value bars"). Their IDs are `sectionOddsEnabled` and `sectionCurveEnabled`, appended to `SETTING_IDS`.
- Fix the shortcut list:
  - `Ctrl+Shift+P` → `Alt+P` (and `Alt+Shift+P` switches mode).
  - `Alt+1-4` → `Alt+2-4`, matching `sectionShortcuts`' `SHORTCUTS`.
  - Add `Alt+O`, `Alt+M` and `Alt+= / Alt+−`.

**[MODIFY] `index.js`**

- `initFeatures()`:
  - Call `headerCluster.init()` when `sectionOddsEnabled || sectionCurveEnabled`, and `cleanup()` otherwise.
  - Call `headerCluster.refresh()` after either flag changes.
  - Call `badge.render()` at the end.
  - Call `badge.init()` once, unconditionally.
- Observer callback: after the existing refreshes, call `headerCluster.refresh()` if it's initialised.
- Re-check goldfish on every refresh, because `index.js` runs once and Moxfield navigates client-side.

**[MODIFY] `manifest.json`**: content-script order. Helpers come before their users, and `index.js` comes last:

```json
"js": [
  "src/utils/storage.js",
  "src/utils/messaging.js",
  "src/content/domHelpers.js",
  "src/content/deckSettings.js",
  "src/content/oddsMath.js",
  "src/content/manaValue.js",
  "src/content/popover.js",
  "src/content/sectionOdds.js",
  "src/content/sectionCurve.js",
  "src/content/headerCluster.js",
  "src/content/sectionShortcuts.js",
  "src/content/priceVisualization.js",
  "src/content/settingsPopover.js",
  "src/content/badge.js",
  "src/content/index.js"
]
```

Modules reach each other through `window.MoxfieldExtended.*` at call time, never at load time, so the order is a safety margin rather than a hard dependency.

---

## Step-by-Step Tasks

### [MODIFY] `package.json`

- **IMPLEMENT**: devDependencies `vitest`, `jsdom`. Scripts `test` and `test:watch`.
- **VALIDATE**: `npm install`, then `npm test` once the Phase 1 regression tests exist.

### [NEW] `vitest.config.js`, `tests/setup/chromeStub.js`, `tests/fixtures/*`

- **IMPLEMENT**: Phase 1.
- **PATTERN**: Tests side-effect-import `src/` scripts and read `window.MoxfieldExtended`.
- **VALIDATE**: `npm test` (`domHelpers` regression tests green).

### [NEW] `src/content/oddsMath.js`, `src/content/manaValue.js`

- **IMPLEMENT**: Phase 2, test-first.
- **PATTERN**: An IIFE that attaches to `window.MoxfieldExtended` (as in `domHelpers.js`'s export block). No DOM access in `oddsMath`.
- **VALIDATE**: `npm test`, `npm run lint`.

### [MODIFY] `src/content/domHelpers.js`, `src/content/index.js` (observer filter)

- **IMPLEMENT**: Phase 3.
- **VALIDATE**: `npm test`. Reload the extension on a deck page: the console shows no refresh loop (one "DOM updated" log per real change).

### [MODIFY] `src/utils/storage.js`, `src/popup/popup.js`, `src/background/serviceWorker.js`; [NEW] `src/content/deckSettings.js`

- **IMPLEMENT**: Phase 4.
- **VALIDATE**: `npm test` (including the defaults parity test).

### [NEW] `src/content/headerCluster.js`, `src/content/sectionOdds.js`, `src/content/sectionCurve.js`

- **IMPLEMENT**: Phase 5.
- **PATTERN**: `sectionShortcuts.js`' `init`/`cleanup`/`refresh` and style injection (`<style id="mox-header-cluster-styles">`). Every injected element carries `data-mox`.
- **VALIDATE**: `npm test`, `npm run lint`, then the manual checks 1–7.

### [NEW] `src/content/popover.js`, `src/content/badge.js`, `src/content/settingsPopover.js`; [MODIFY] `src/content/priceVisualization.js`

- **IMPLEMENT**: Phase 6.
- **VALIDATE**: `npm test`, `npm run lint`, then the manual checks 8–12.

### [MODIFY] `src/popup/popup.html`, `src/popup/popup.js`, `src/content/index.js`, `manifest.json`

- **IMPLEMENT**: Phase 7.
- **VALIDATE**: `npm test`, `npm run lint`. The extension loads unpacked with no console errors.

---

## Verification Plan

### Automated

```bash
npm test
```

```bash
npm run lint
```

### Manual Testing (User Required)

Load the extension unpacked. Use a public deck (the PRD's "We all fall down", `4_hZL5zp-Uiif8TuZiDkvg`) and a deck you own with partner commanders.

1. **Odds appear** on every mainboard Section, including `Untagged …` and single-card Sections. There are none on Commander or Sideboard, and none in the Cost Analysis panel.
2. **Library**: footer "104 main deck" with `Commander(1)` → a 103-card Library. Check one chip by hand against a hypergeometric calculator.
3. **Group by**: switching Type → Type & Tags → Mana Value → No Grouping relabels the chips. Curves disappear under Mana Value. An override set under Tags doesn't show under Type, and comes back when you switch to Tags again.
4. **Curve**: a split card counts as both halves, `{X}` as 0, and a `{0}` artifact adds a 0 bar. A Lands Section has no curve but keeps its chip. The tooltip shows the costless count.
5. **Live edit** (owner deck): changing a quantity updates the chip, the curve and the Library within about 250 ms.
6. **Crowding**: narrow the window. Curve and chip merge into one slot first, then the name truncates, then the slot hides. The header price never hides. A left-click flips every shared slot; reload and the choice is kept. Wide headers keep showing both.
7. **No observer loop**: with DevTools open, idle for 10 s. There are no repeated "DOM updated" logs.
8. **Badge**: the price segment cycles Section → Deck → Off → Section. The odds and curve segments toggle. With all three off, the badge disappears; Alt+O brings it back.
9. **Settings popover**: right-click the badge. Steppers apply live. The By-turn + stops at `7 + T ≥ Library`. Budget is enabled only in Deck mode. With Moxfield's Price off, the price group is disabled with a hint. Esc and outside click close it.
10. **Override stepper**: right-clicking a chip opens the stepper and no browser menu. The dotted underline appears while overridden, and "reset to default" removes it. Desired above the count shows `0%` with the reason.
11. **Keys**: Alt+O, Alt+M, and Alt+= / Alt+− while hovering a Section, on Windows and, if possible, macOS. Nothing fires while typing in an owner quantity input.
12. **Popup**: the two new toggles mirror the badge both ways, and the shortcut list is correct.
13. **Goldfish**: navigate client-side into and out of goldfish. Badge, chips and curves hide, then come back.
14. **Failure state**: in DevTools, delete the footer node or edit its text. Every chip shows `?` with the reason, and curves are unaffected.

---

## Acceptance Criteria

- [ ] Section odds match the exact hypergeometric P(X ≥ k) for N = Library, K = Section `(n)`, cards seen = 7 + T (spec §2.1).
- [ ] Library = footer "N main deck" − Commander `(n)`, from the DOM only, and live (spec §2.2).
- [ ] Every mainboard Section gets odds. No other Board does (spec §2.3).
- [ ] `100%` and `0%` only when certain or impossible. `>99%` and `<1%` otherwise. The tooltip follows the same rule (spec §2.4).
- [ ] Edge cases and `?` failure states behave as the table in spec §2.6 says. The badge never shows data failures.
- [ ] Curves follow the bar, Mana value and costless rules, and are hidden under Mana Value grouping and in goldfish (spec §3).
- [ ] The right cluster, shared slot and squeeze order work as spec §4 describes. The shared-slot choice is per deck.
- [ ] Badge, popover, override stepper, popup toggles and shortcuts work as spec §5 describes. There are no `prompt()` or `alert()` calls left.
- [ ] Global toggles live in `chrome.storage.sync`. Per-deck settings and overrides live in `chrome.storage.local`, keyed deck → Group-by → Section name. Orphans are kept.
- [ ] No self-triggered refresh loop.
- [ ] `npm test` and `npm run lint` pass.

---

## Decisions this plan makes (for review)

The spec left these open or implicit:

| # | Decision | Alternative |
|---|---|---|
| D1 | Per-deck settings and overrides go in `chrome.storage.local` | `sync`: follows the user across machines, but the quota and write-rate risk is above |
| D2 | One flag per new feature (`sectionOddsEnabled`, `sectionCurveEnabled`) | Copy price's split into enabled + active |
| D3 | Setting an override equal to the default deletes it (prototype B) | Keep it as an explicit override that ignores later default changes |
| D4 | The badge's price segment is hidden when `priceVisualizationEnabled` is off | Show it struck through |
| D5 | Budget stays in page `localStorage` and isn't migrated | Move it into `deck:${id}` |
| D6 | Alt+=/− handlers live only while odds are on | Always on, so they create overrides with odds hidden |

### Open questions

- **Moxfield's "Mana" view option off.** With no cost symbols in the DOM, every row counts as costless and every curve disappears (spec §3.4 applied literally). Should the popover's curve group show a "turn on Mana in Moxfield's view options" hint, like the Price hint?
- **Stretch goal (spec §6):** telling a user tag named "Commander" or "Sideboard" apart from the real Board. Under `type` grouping the real Commander Section is always the first `ul`, so that could be a tie-break. Not planned unless asked.
