# Spec: Section odds and Section mana curve

Behaviour-level spec for two new features in Moxfield deck view's mainboard Section headers. It also covers the settings popover that replaces the badge's `prompt()`. Code-level steps come later, when this spec becomes a plan.

Vocabulary follows [`GLOSSARY.md`](../../GLOSSARY.md): **Section**, **Board**, **Library**, **Section odds**, **Mana value**, **Section mana curve**.

Source of every decision: the wayfinder map [Map: Hypergeometric Section odds](https://github.com/Kurohyou/moxfield-extender/issues/1) and its closed tickets (linked per section below). When tickets disagree, the later one wins. This spec already applies those overrides.

---

## 1. Features at a glance

| Feature | What the user sees | Toggle |
|---|---|---|
| Price bars (existing) | Price-share fill behind rows; Section/Deck mode; budget goal | Badge price segment, popover, popup, Alt+P / Alt+Shift+P |
| **Section odds** (new) | A `%` chip in each mainboard Section header | Badge odds segment, popover, popup, **Alt+O** |
| **Section mana curve** (new) | A tiny bar sparkline in each mainboard Section header | Badge curve segment, popover, popup, **Alt+M** |

All three features are independent. The floating badge shows while **any** of them is on. Everything new is hidden in goldfish mode.

---

## 2. Section odds

*Sources: [Charting decisions](https://github.com/Kurohyou/moxfield-extender/issues/2), [Edge cases](https://github.com/Kurohyou/moxfield-extender/issues/5), [Library size](https://github.com/Kurohyou/moxfield-extender/issues/6).*

### 2.1 What it computes

- Hypergeometric **P(X ≥ desired)**, drawing **cards seen** cards without replacement from the Library.
  - **Population (N)**: the Library size (§2.2).
  - **Successes (K)**: the Section's header `(n)`, which counts quantities.
  - **Cards seen** = 7 + T, where T is "By turn" (T = 0 is the opening hand). No play/draw option, because nobody skips the first draw in multiplayer Commander (CR 103.8c). No mulligans (out of scope).
- **Sections** are whatever headers the active Group-by mode shows (Type, Tag, Subtype, Mana cost, …).
  - Under Tag/Subtype grouping, a card appears in every Section it belongs to, at full quantity. Each Section's odds stand alone against the same Library, and nothing signals the overlap.

### 2.2 Library size

- **Library = the deck-stats footer's "N main deck" count − the Commander Section header's `(n)`.**
  - The footer count includes commanders.
  - Partners show as `Commander(2)`.
  - When there is no Commander Section, subtract 0.
- The footer is always in the DOM, even when it's hidden at narrow widths. Its classes are hashed, so it is located by its text: `/^\s*(\d+)\s+main deck\s*$/`.
- **DOM only.** No deck JSON, and no fallback to summing rows. Because the Section counts come from the same DOM, the population and the successes can't disagree.
- **Live:** the Library and all odds recompute on every debounced DOM refresh, for example while the owner edits the deck.

### 2.3 Which Sections get odds

- **Every mainboard Section**, including `Untagged <Type>` Sections and single-card Sections.
- **No odds on other Boards' Sections:** Commander, Companion, Sideboard, Signature Spell / Oathbreaker, Attraction Deck, Contraption Deck, Stickers.
- **Known limitation:** a user tag literally named "Commander" or "Sideboard" can't be told apart from the real Board Section by its title, so it may show no odds.

### 2.4 Display

- The chip shows a bare whole-number `%`. Its tooltip shows the full form, e.g. `63% ≥2 by T4`.
- **Rounding:**
  - Round to the nearest whole number.
  - `100%` only when certain; anything else that rounds to 100 shows `>99%`.
  - `0%` only when impossible; anything else that rounds to 0 shows `<1%`.
  - The tooltip follows the same rule.
- An **override** (§2.5) is marked by a dotted underline on the chip. Either override, At least or By turn, shows it.

### 2.5 Settings

| Setting | Default | Scope | Bounds |
|---|---|---|---|
| Section odds on/off | on | **global** (`chrome.storage.sync`, like `priceVisualizationEnabled`) | — |
| By turn (T) | 3 | per deck | T ≥ 0. No fixed maximum: the stepper stops once 7 + T ≥ Library |
| At least (default desired) | 1 | per deck | ≥ 1 (0 is refused) |
| Per-Section overrides of At least and By turn | none | per **deck + Group-by mode + Section name** | At least ≥ 1. T ≥ 0, and the stepper stops once 7 + T ≥ Library |

- The Group-by mode is read from `select#groupBy.value` (`type`, `subType`, `tag`, `color`, `colorIdentity`, `cmc`, `rarity`, `set`, `artist`, `none`), even when the dropdown is visually hidden.
- **Orphaned overrides** (their Section no longer exists) are kept silently. They apply again if a Section with the same deck + mode + name comes back. No cleanup and no warning.

### 2.6 Edge behaviour

| Situation | Chip | Tooltip |
|---|---|---|
| Desired > Section count | `0%` | Why, e.g. "Only 3 cards in Section; need ≥4" |
| 7 + T ≥ Library | `100%` if count ≥ desired, else `0%` | "whole Library seen" instead of "by T*n*" |
| Library unreadable (footer missing or unparseable) | `?` on every chip | The reason |
| Sanity failure: Library < any Section's `(n)` | `?` on every chip | The reason |

A `?` is expected to be very rare. The badge **doesn't** show data failures: it reflects settings state only. A Library failure doesn't affect the mana curve (§3), which doesn't use the Library.

---

## 3. Section mana curve

*Source: [Per-Section mana curve: placement and counting rules](https://github.com/Kurohyou/moxfield-extender/issues/8), including its addendum. Prototype: [`prototype/section-curve`](https://github.com/Kurohyou/moxfield-extender/blob/prototype/section-curve/src/content/sectionCurve.prototype.js), variant A.*

### 3.1 Look

- A **tiny unlabelled bar sparkline** (prototype: 3 px bars, 1 px gap, 12 px tall, `currentColor`).
  - Bar heights are scaled to the Section's tallest bar.
  - Empty bars draw as a faint 1 px stub.
- **Hover tooltip:** the Section name, the count per mana value, the average mana value, and "N card(s) with no mana cost not shown" when that applies.

### 3.2 Bars

- Mana values **1–6 always show**.
- A **0** bar is added on the left only when the Section has a 0-MV card (e.g. a `{0}` artifact).
- Bars **extend right** to the Section's highest mana value, with empty bars for gaps. No cap and no "7+" bucket: a 10-drop gives bars 1–10.
- Bars **count quantities**, like the header `(n)`.

### 3.3 Mana value

- Use the **rules-correct mana value** (see the glossary):
  - X = 0.
  - A split card is both halves combined.
  - MDFC, transforming and adventure cards count their front or main face.
  - Hybrid `{2/W}` = 2. Other hybrid and phyrexian = 1.
- **Read from the DOM:** each row's cost cell (`div.text-nowrap.text-end`) holds `span.mana.mana-<sym>` elements. Mana value = the sum over every symbol in the cell. Verified live:
  - Split rows render both halves (`{1}{U/B} // {3}{U}{B}` → 7).
  - MDFC and adventure rows show only the front or main face.
  - Land-adventures (Midgar, City of Mako) show no cost.

### 3.4 Cards with no mana cost

- Rows with **no cost symbols are left out** of the curve. Outside Type grouping, the DOM can't tell a land from a costless spell.
- A Section whose cards are **all** costless (e.g. Lands, or a tag of only lands) shows **no curve**, but keeps its odds chip.
- **Known consequence:** costless spells (Ancestral Vision, Lotus Bloom) and land-adventures never appear in a curve.

### 3.5 Where curves appear

- The same Sections as Section odds: **mainboard only**, each Section counting its own cards under overlap.
- **Hidden entirely when Group-by is Mana cost (`cmc`)**, where every Section would be a single bar.
- Hidden in goldfish mode.
- **Live:** curves recompute on the same debounced DOM refresh as the odds.

### 3.6 Settings

- Mana curve on/off: **global**, default **on**. (The default isn't set by any ticket; matching Section odds is the assumption here.)

---

## 4. Section header layout

*Sources: [Moxfield deck page facts](https://github.com/Kurohyou/moxfield-extender/issues/3), [Section mana curve](https://github.com/Kurohyou/moxfield-extender/issues/8).*

The header reads: `name (n) – $price` … **[curve] [odds %]**, with the right cluster right-aligned.

- **Header price:** Moxfield's own, `span.text-nowrap.fw-normal.ms-1` after the header link. It is present only when the viewer has Moxfield's Price option on. It stays next to the name and **never hides**.
- **Right cluster:** each item is present only when its feature is on and applies to that Section:

| Odds | Curve | Right side shows |
|---|---|---|
| on | on | curve, then `%` chip (or a shared slot, below) |
| on | off | `%` chip |
| off | on | curve |
| off | off | nothing |

- **Crowded headers (shared slot):** when a header is too narrow for both the curve and the chip, they share **one slot**.
  - The slot shows the **`%`** by default. **Left-click** switches between the `%` and the curve.
  - The switch is **deck-wide**: one click flips every shared slot on the deck. The choice is **saved per deck**.
  - Only headers that are actually crowded use the shared slot. The others keep showing both.
- **Squeeze order:**
  1. The curve and chip merge into the shared slot.
  2. The Section name truncates with an ellipsis (Moxfield already styles it `text-ellipsis`).
  3. The shared slot hides only when there's no room for either.

---

## 5. Badge, popover, popup and shortcuts

*Sources: [Settings modal and per-Section override UI](https://github.com/Kurohyou/moxfield-extender/issues/4) (superseded in part by #8's addendum), [Section mana curve](https://github.com/Kurohyou/moxfield-extender/issues/8).*

### 5.1 Floating badge

The badge appears while any feature is on, and is hidden in goldfish mode. It has three segments.

| Gesture | Effect |
|---|---|
| Left-click **price** segment | Cycles **Section % → Deck % → Off → Section %**. A struck-through (off) segment turns price bars back on in Section mode. |
| Left-click **odds** segment | Section odds on/off |
| Left-click **curve** segment | Mana curve on/off |
| **Right-click** anywhere on the badge | Opens the settings popover (replaces the native `prompt()`) |

### 5.2 Settings popover

- A small popover anchored below the badge, with no backdrop.
- Changes **apply live**, with no Save/Cancel. A click outside, or Esc, closes it.
- **Price bars group:**
  - on/off and Section/Deck share.
  - Budget goal, enabled only in Deck mode.
  - When the viewer's Moxfield Price option is off, these controls are disabled, with a hint to turn Price on.
- **Section odds group:**
  - on/off.
  - A "By turn" stepper that shows the cards seen (7 + T).
  - An "At least (default)" stepper.
- **Mana curve group:** on/off.
- **No per-Section list:** overrides are edited inline (§5.3).

### 5.3 Per-Section override stepper

- **Right-click** a Section's `%` chip, or the curve while it's showing in a shared slot, to open a small stepper anchored there. The browser context menu is suppressed.
  - The stepper shows the Section name, its card count and the full form with the Section's own values (e.g. `7% ≥2 by T5`).
  - Two steppers: **At least**, and **By turn**, which shows the cards seen (e.g. `T5 · 12 cards seen`).
  - One "Reset to deck defaults" link clears both overrides. It shows only while either is set.
  - **Left-click** on a standalone chip does nothing. In a shared slot, left-click switches (§4).
- **Keyboard:** hover a Section and press **Alt+=** / **Alt+−**.

### 5.4 Extension popup

The popup gets **Section odds** and **Mana curve** toggles next to the existing Section shortcuts, Price visualization and Multi-select toggles.

### 5.5 Shortcuts

| Keys | Action |
|---|---|
| Alt+P / Alt+Shift+P | Price bars on/off, and switch mode (existing) |
| **Alt+O** | Section odds on/off |
| **Alt+M** | Mana curve on/off |
| **Alt+= / Alt+−** (while hovering a Section) | Raise or lower that Section's At least override. By turn has no shortcut |
| Alt+2–4 (existing) | Section bulk actions |

None of these collide with the extension's existing bindings. **Alt+O, Alt+M and Alt+=/− still need checking against Moxfield's own shortcuts** during implementation.

---

## 6. Out of scope

- **Mulligans.** Odds assume no mulligan (dropped while charting).
- Telling a user tag named "Commander"/"Sideboard" apart from the real Board Section. This is a stretch goal for the plan.
- A per-Section "hide odds" option.

---

## Appendix: planner notes (facts, not behaviour)

From [Moxfield deck page facts](https://github.com/Kurohyou/moxfield-extender/issues/3) ([full research](https://github.com/Kurohyou/moxfield-extender/blob/research/moxfield-deck-page-facts/research/moxfield-deck-page-facts.md)) and later live checks.

- **Sections:** every Section is a `ul` inside `section.deckview article`. Its header is the first `li`, holding `a.table-deck-row-link.fw-bold`, which contains `span[title="<name>"]` and `(n)`. Only the title tells Boards apart. The header `li` is a full-width flex row.
- **Rows:** `li[data-testid="deck-view-table-row"]`, deduplicated by `data-hash`.
  - Quantity is the first cell's text, or `input.value` on owner decks.
  - The `li[id^="id56-"]` selector in `domHelpers.js` is stale.
- **`extractQuantity` returns 1 for every row**: the text is "6Forest", with no space. Both features count quantities, so **don't reuse it unfixed**.
- `a.table-deck-row-link.fw-bold` also matches Moxfield's own mana-curve panel, so scope all queries to `section.deckview article`.
- A page-context fetch to `api2.moxfield.com/v3/decks/all/{id}` works for public decks. Nothing in this spec needs it.
- The popup's shortcut list says `Ctrl+Shift+P` for price bars, but the code uses Alt+P (`src/content/priceVisualization.js`). This is outside this effort, but worth fixing alongside §5.4.
