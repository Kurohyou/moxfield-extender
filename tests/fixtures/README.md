# Test fixtures

Markup captured live from Moxfield deck pages (table view). Do not edit by
hand; `deckDom.js` builds synthetic decks from these as templates.

## Files

| Fixture | Holds |
|---|---|
| `row-split-hybrid.html` | Assure // Assemble, MV 8 (two cost groups, hybrid symbols) |
| `row-twobrid.html` | Twobrid symbols, MV 6 |
| `row-adventure-front-only.html` | Adventure card, front face cost only, MV 4 |
| `row-phyrexian.html` | Phyrexian symbol, MV 4 |
| `row-x.html` | X symbols, MV 2 |
| `row-zero-artifact.html` | `mana-0` artifact, MV 0 |
| `row-land-adventure-midgar.html` | Land with an adventure, costless |
| `row-owner-land.html` | Owner view Forest, quantity `<input value="13">`, costless |
| `row-viewer-forest.html` | Viewer view Forest, quantity `<div style="width: 20px;">6</div>`, costless |
| `footer.html` | Owner footer, "136 main deck" |
| `footer-viewer.html` | Viewer footer, "104 main deck" |
| `header-commander-partner.html` | Commander (2), price and a "Change" link |
| `header-commander-single-no-price.html` | Commander (1), no price |
| `header-with-price.html` | card advantage (15), with header price |
| `header-no-price-type-icon.html` | Creatures (54), `span.mana.mana-creature` type icon, no price |
| `header-plus-other.html` | Lands (37), "+ 1 other" |
| `outside-header-trap.html` | Header-like markup outside `section.deckview` (Cost Analysis column) |
| `cost-analysis-text.html` | Cost Analysis paragraph with average and median mana value |
| `groupby-select.html` | `select#groupBy` with all options |

The footer count is the direct text of `div.text-nowrap.d-inline-block`.

## Mana-symbol classes

Cost cell: `div.text-nowrap.text-end > span > span.mana.mana-<suffix>.mana-cost.mana-shadow`.
Split cards have two groups separated by `<span>&nbsp;//&nbsp;</span>`; a
costless row has an empty `<span></span>`.

| Kind | Class suffix | Value |
|---|---|---|
| Generic | `0`, `2`, `3`, `4` (digit) | the digit |
| X | `x` | 0 |
| Coloured | `g`, `u`, `w` (also `r`, `b`) | 1 |
| Hybrid | `gw` (+ `mana-split`) | 1 |
| Twobrid | `2g`, `2u`, `2r` (+ `mana-split`) | 2 |
| Phyrexian | `up` | 1 |

`mana`, `mana-cost`, `mana-shadow` and `mana-split` are not symbols; skip them
when reading the suffix. Snow and colourless symbols were not captured; treat
an unknown suffix as 1 (the default).

## No Sideboard header

No Sideboard header was captured. `buildDeck` synthesizes `Commander` and
`Sideboard` headers from `header-commander-single-no-price.html` with the
title and count swapped.

## Test harness notes

`tests/setup/chromeStub.js` resets the chrome stub, including every registered
listener, in a global `beforeEach`. A script that registers listeners while it
loads (for example `index.js` adding `runtime.onMessage` or
`storage.onChanged` listeners) must be loaded inside the test or a
`beforeEach`, after the reset, with `vi.resetModules()` followed by
`await import(...)`. A top-level import's listeners are wiped before the first
test runs.
