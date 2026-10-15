# Moxfield deck page facts for Section odds

Research for issue #3. It answers six questions about how Section odds can read the Library and per-Section quantities from a Moxfield deck page.

Observed on 2026-10-14. Moxfield ships hashed CSS-module class names (`QplEGzdpUY3yofYwhhX0`, etc.), and these may change between builds. One counterexample: `li.XIi4jFys2lGhYwseGpBo` from the PRD's January 2025 snapshot is still live. Every selector here is a snapshot. Prefer `data-testid` and the structural anchors noted below.

## Sources

| ID | Source | Context |
|----|--------|---------|
| S1 | `https://moxfield.com/decks/4_hZL5zp-Uiif8TuZiDkvg` ("We all fall down", the PRD's reference deck) | Logged out, built-in browser, table view. Switched Group by through Type, Type & Tags, SubType, Mana Value and No Grouping. The modal says these settings "apply to this deck only" and are not saved when logged out. |
| S2 | `https://moxfield.com/decks/OWNkUkEickmpCHDmZaRICA` ("Personal Dogs", the user's own deck, partner commanders) | Logged in as owner, Chrome, table view, the user's saved view settings (Group by `tag`, Price on). Read only: nothing was changed. |
| S3 | `https://moxfield.com/decks/j-0aJlxuOUm9FnKRvJcfZw` ("Winota: Snowball Stax", public, 17-card sideboard) | Logged in (not owner), Chrome, table view, Group by `tag`, Price on. |
| S4 | `GET https://api2.moxfield.com/v3/decks/all/{publicId}` | The request the deck page itself makes on load (seen in `performance.getEntriesByType('resource')` on S1). Fetched from page context for S1, S2, the user's deck list, and the top 25 public Commander decks from `api2.moxfield.com/v2/decks/search`. |
| S5 | Moxfield production JS bundles `assets.moxfield.net/assets/assets/5573.bf09391ba0001411876a.js` and `moxfield.69aa74357eb13e900dbf.js` | Fetched in page and searched. These are the components that render the deck list. |

## Headline findings (these change the plan)

1. **The header selector `a.table-deck-row-link.fw-bold` over-matches.** On S1 it matched 7 elements. The 7th ("Creatures(1)") is the mana-curve drill-down panel in the Cost Analysis block, which reuses the deck-list markup and sits inside `div.row > div.col-sm-7.col-lg-4`. On S2 it matched 23, but only 20 are deck Sections. Scope Section headers to `section.deckview article > ul > li:first-child`.
2. **Commander and Sideboard are Sections inside the same `<article>` as the mainboard.** No DOM attribute marks which board a Section belongs to. The only marker is the header title text: `span[title="Commander"]`, `span[title="Sideboard"]`.
3. **Sections overlap under Type & Tags and SubType.** A card appears in every Section it belongs to, with its full quantity each time. Summing Section headers overcounts the Library: S1 tag mode gives 123 against a real 103, and subType gives 139 (excluding the Commander section's 1, that is 138 against 103).
4. **The quantity cell is an `<input>` on decks you own.** On S2 it is `<div class="dcD5V3uk1cjCKIMHR5hC text-end"><input class="input-borderless text-end" type="text" value="8"></div>`. `textContent` is empty there, so text-based quantity parsing returns nothing.
5. **The existing `extractQuantity` is already wrong for viewers.** Row `textContent` is `"6Forest"` with no whitespace, so `/^(\d+)\s/` fails and the function returns 1. This was verified on S1's Forest row: `regexResult: null`, `extractQuantityReturns: 1`, but the quantity cell says `6`.
6. **Read Group by from `select#groupBy`.** It tracked every change in S1. `localStorage.state.viewSettings.groupBy` did not change while logged out.
7. **The deck JSON (S4) gives the Library directly.** Use `boards.mainboard.count`, where commanders sit in a separate `boards.commanders`. The DOM can also produce it, via dedupe by `data-hash`, but only with care.

## Q1. Mainboard Sections vs other Boards

**Structure (S1, S2, S3, table view):**

```
section.deckview
  div.maxw-100
    form            (View / Group / Sort selects, "Advanced")
    article.U8m6pN3bsV3j0hLWF7tf.b1eAKKXJopj4b_CAqhWQ   <- one per page in all three decks
      ul.Y2VI3AkZEmpvN6ziIkQd.VkE_B2DMyti8_a0X4kYp      <- one per Section
        li.QplEGzdpUY3yofYwhhX0                          <- Section header (first li)
        li.XIi4jFys2lGhYwseGpBo[data-testid="deck-view-table-row"][data-hash] ...  <- card rows
      ...
    div.cursor-pointer.mb-3   "Tokens (11) – Expand"
    div.cursor-pointer.mb-3   "Considering (55) – Expand"
    div.cursor-pointer.my-3   "Recent History – Expand"
```

- **Commander**: the first `ul` in the article, header `span[title="Commander"]` (S1, S2, S3).
- **Sideboard**: the last `ul` in the same article, header `span[title="Sideboard"]` (S3: `Sideboard(17)`). The `ul`, the header `li` and the row `li` carry no board attribute; S3's `ulAttrs` were identical for all 10 Sections. Sideboard rows did not appear in any tag Section (overlap 0), and deduped non-Commander, non-Sideboard rows summed to 99, which equals API `mainboard.count`.
- **Considering (= API `maybeboard`)** and **Tokens** are outside the article. They are collapsed `div.cursor-pointer` blocks that are siblings of the article. S1: Considering (55) matches API `boards.maybeboard.count` 55. The DOM "Tokens (11)" is not API `boards.tokens` (count 0). It comes from the deck's derived token list (`deck.tokens`, 30 entries).
- **Maybeboard** is named "Considering" in the UI. The bundle rewrites `maybeboard` → `considering` and `mainboard` → `main deck` for display (S5, move-card dialog).
- **Companion**: not observed live. None of the user's 30 listed decks, and none of the first public results scanned, had `boards.companions.count > 0`. S5's section-title switch includes `"Companion"`, `"Sideboard"`, `"Considering"`, `"Tokens"`, `"Signature Spell"`/`"Excalibur"`, `"Oathbreaker"`/`"Arthur"`/`"Commander"`, `"Attraction Deck"`, `"Contraption Deck"` and `"Stickers"`. So a Companion probably renders as its own titled Section, but where it sits is **unverified**.

**Recommended rule:** mainboard Sections = `section.deckview article > ul` whose header `span[title]` is not one of the special-board titles above. **Risk:** with Group by Type & Tags, a user tag literally named `Commander` or `Sideboard` would collide. That was not tested.

## Q2. Detecting commanders / command-zone cards

- **DOM:** commanders are the rows in the `ul` whose header has `span[title="Commander"]`. S2's partner pair renders as one `Commander(2)` Section holding both cards. On owner decks the header also has a `Change` link (`a.ms-2.cursor-pointer.no-outline`). The bundle renders it only when `deck.isOwner` and the title is one of `["Commander","Signature Spell","Oathbreaker","Arthur","Excalibur"]` (S5).
- **Commander rows have no reliable row-level marker.** The extra class `X7zwk2RlYMx_LBwuPtRX` on S3's Winota row was also on 22 non-commander rows.
- **Companions** get an icon on the row: `span.companion-container` containing an icon with `aria-label="Companion"` (S5). Not seen live.
- **API (S4):** `boards.commanders.cards`, `boards.companions.cards` and `boards.signatureSpells.cards` are separate from `boards.mainboard`. Each entry has `boardType`. For S1, `mainboard.count` is 103 and `commanders.count` is 1, matching the DOM footer "104 main deck". The API excludes commanders from the Library for free.

## Q3. Reading the active Group by mode

- **`document.querySelector('select#groupBy').value`** is present at all widths. Its wrapper is `d-none d-xxl-flex`, so it is hidden below xxl but stays in the DOM. In S1 it read `type` → `tag` → `cmc` → `subType` → `none` → `tag` after each change. On S2 and S3 (logged in) it read the saved `tag`.
- Option values (S1): `type`, `subType`, `tag` ("Type & Tags"), `color`, `colorIdentity`, `cmc` ("Mana Value"), `rarity`, `set`, `artist`, `none` ("No Grouping").
- **Do not use `localStorage.state.viewSettings.groupBy`.** It stayed `type` while S1's view was `tag`/`cmc`/`none`, because logged-out changes are not persisted.
- Default for users with no saved settings (S5): `{viewMode:"table", groupBy:"type", sortBy:"manaCost", useMana:true, usePrice:false, useSet:false}`.
- The sibling selects `#viewMode` and `#sortBy` expose those settings the same way.

## Q4. Can a card appear in more than one Section?

**Yes: under `tag` (Type & Tags) and `subType`.** Observed per mode on S1 (88 mainboard entries, 103 cards, plus 1 commander):

| Group by | Section rows | Sum of header `(n)`, excl. Commander | Partition? |
|---|---|---|---|
| `type` | 89 | 103 | yes |
| `cmc` | 89 | 103 (`Mana Value 0`…`11` + `Lands(37)`) | yes |
| `none` | 89 | 103 (single `Main Deck(103)` Section) | yes |
| `tag` | 109 | 123 | **no** (e.g. Beza in 3 Sections) |
| `subType` | 124 | 138 (e.g. `Forest(8)`, `Mountain(8)`) | **no** |

`color`, `colorIdentity`, `rarity`, `set` and `artist` were not tested.

**Quantity behaviour:** each appearance carries the card's full quantity. Every header's `(n)` equalled the sum of its rows' quantities in S1 tag mode (19 Sections, 0 mismatches) and S2 tag mode (20 Sections, 0 mismatches). For example, `mana(38)` includes the three 6x basics.

**Untagged cards** (S2, S3) fall into `Untagged <Type>` Sections, e.g. `Untagged Creatures`, `Untagged Lands`. So in tag mode every mainboard card appears at least once.

**Other quirks:**
- In `type` mode the Lands header can show `+ N other` (`span.ms-1.fw-normal.text-muted`). It is a hover summary of cards in other Sections that also count as that type (S1: Tangled Florahedron, an MDFC). Those are **not** in the Section's `(n)`.
- DFC names in the DOM are front face only, e.g. "Tangled Florahedron" vs API "Tangled Florahedron // Tangled Vale". Join on `data-hash`, not name.

**Implication for odds:** the population is always the Library, never the header sum. Per-Section "successes" = that Section's `(n)`, which is correct even when Sections overlap.

## Q5. Where the Section header price renders

From the bundle (S5, table-view Section component) and confirmed live on S2/S3:

```js
b("li", {className: h.aY /* QplEGzdpUY3yofYwhhX0 */},
  b(r.A, {...})                              // a.table-deck-row-link.fw-bold: icon, title, (n), caret
  b(u.A, {...})                              // optional "+ N other" span
  L && b("span", {className: "text-nowrap fw-normal ms-1"}, "– ", formatPrice(...)),  // L = viewSettings.usePrice
  isOwner && isCommanderTitle && b(m.z9, {className: "ms-2", onClick}, "Change"))
```

Live DOM (S2, `card advantage` Section):

```html
<li class="QplEGzdpUY3yofYwhhX0">                      <!-- display:flex, justify-content:normal, full ul width -->
  <a class="d-inline-flex ... fw-bold table-deck-row-link cursor-pointer" role="button">
    <span class="d-inline-block text-end me-2"><!-- type icon --></span>
    <span class="d-inline-block text-ellipsis me-1" title="card advantage">card advantage</span>
    <span class="d-inline-block">(16)</span>
    <span class="fas fa-caret-down fa-xs"></span>
  </a>
  <span class="text-nowrap fw-normal ms-1">– $215.90</span>
</li>
```

- The price is a **sibling `span` after the header anchor**, inside the header `li`. It renders only when the viewer's **Price** view option (`usePrice`) is on. It is absent on S1 (logged-out default `usePrice:false`).
- On owner decks, the Commander header also has `<a class="ms-2 ...">Change</a>` after the price.
- The header `li` is `display:flex` with default justify, and spans the full column width (394px = `ul` width on S2). An odds element appended as the last child with `margin-left:auto` will sit right-aligned whether or not price / `+ N other` / `Change` are present. (The layout effect is inferred from the computed style, not tested by injecting.)
- The stacks/visual views use a different header (`div.stack-title` with `span.ms-1` "– $x"). Not covered here.

## Q6. Is DOM scraping reliable enough?

**Per-Section quantity:** yes. The header `(n)` in `span.d-inline-block` right after `span[title]` equals the row quantity sum in every Section checked (0 mismatches across 39 Sections on S1/S2). Read `(n)` from the header rather than summing rows.

**Library size from the DOM:** possible but fragile. All of the following must hold:
- Exclude the Commander and Sideboard (and presumably Companion) Sections by title.
- Dedupe rows by `data-hash` (overlap modes).
- Read quantity from `input.value` on owner decks and from the inner `div` text otherwise.
- Use the article only (not the mana-curve panel).

Done that way, the result matched the API exactly:
- S1 tag mode: 88 unique entries, 103 cards.
- S2 tag mode (owner, inputs): 88 entries, 103 cards = API `mainboard.count` 103.
- S3: 99 = API `mainboard.count` 99.

Breakers: a Section collapsed by the user (not tested; the caret suggests rows may unmount) and tags named like special boards.

**Deck JSON (S4) alternative:**
- `GET https://api2.moxfield.com/v3/decks/all/{publicId}` returned 200 from page context with no auth header. That covered S1 (public) and unlisted decks of the user (S2 and others).
- `boards.mainboard.count` is the Library, with commanders already split out.
- Each entry has `quantity`, `boardType` and `card.id`. `card.id` equals the row's `data-hash` (S1: Animar `L3nwN`). The entries map is keyed by `card.uniqueCardId`, which is **not** the `data-hash`.
- `authorTags` maps card name → deck tags (array). It holds deck tags only. Tag Sections are also shaped by global tags and by the viewer's "Hide global tags / Disable global tags / Hide deck tags" options, which appeared on S2 and are passed into the tag grouping in S5. Reproducing tag Sections from JSON is therefore **unverified**. For example, S1's `Backup(2)` Section was not traced to `authorTags`. Reading per-Section `(n)` from the DOM avoids this problem.
- **Not verified:** private decks (likely need the page's bearer token), API stability (it's undocumented), rate limits, and whether the JSON is stale after an owner edits a card in place without reload.

**Recommendation:**
- Library = deck JSON `boards.mainboard.count`, or the deduped DOM sum as a fallback.
- Per-Section counts = header `(n)` from the DOM, since Sections depend on the viewer's current Group by and the DOM already computes them.
- If the API can't be used, the DOM-only path works when it follows the rules above. Either way, fix `extractQuantity`.

## Selector corrections for `src/content/domHelpers.js`

| Current | Status | Observed replacement |
|---|---|---|
| `a.table-deck-row-link.fw-bold` (section header) | over-matches the mana-curve panel | `section.deckview article > ul > li:first-child` |
| `li[id^="id56-"]` (card entry) | stale: ids are React `useId` values on the anchor (`id="id_r_1n_-L3nwN"`) | `li[data-testid="deck-view-table-row"]` |
| `li.XIi4jFys2lGhYwseGpBo` | still valid now, but a hashed class | prefer `data-testid` |
| `div.cursor-pointer strong` (Considering/Tokens) | Considering/Tokens are collapsed `div.cursor-pointer.mb-3` blocks outside the article | not needed for odds |
| `extractQuantity` regex `/^(\d+)\s/` on `textContent` | returns 1 for every row | `row.firstElementChild.querySelector('input')?.value ?? row.firstElementChild.textContent` |

## Not verified

- Companion placement in the DOM.
- Visual / stacks / condensed view modes.
- Group by `color`, `colorIdentity`, `rarity`, `set`, `artist`.
- Collapsed Sections.
- Private decks via the API.
- Fetching the API from an extension content script. All fetches here ran in the page's main world. MV3 content scripts use the page origin for CORS, so they should behave the same, but this was not tested.
- Tags named `Commander` / `Sideboard`.
- Whether the DOM re-renders (and what changes) after owner edits. No edits were made.
