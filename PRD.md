# Moxfield Extended - Product Requirements Document

## 1. Executive Summary

Moxfield Extended is a browser extension designed to enhance the [Moxfield](https://moxfield.com) Magic: The Gathering deck building experience by adding powerful keyboard shortcuts and visual analysis tools not available in the native interface.

The core value proposition is **efficiency and insight**: enabling power users to rapidly reorganize decks using section-level operations and visualize card cost distribution without leaving the familiar Moxfield interface.

**MVP Goal:** Deliver a functional browser extension with bulk section operations via keyboard shortcuts and price-based visual cost analysis, seamlessly integrating with Moxfield's existing UI.

---

## 2. Mission

**Mission Statement:** Enhance the Moxfield deck building experience with power-user features that increase efficiency and provide deeper insights into deck composition.

### Core Principles

1. **Non-Invasive** — Extend Moxfield without breaking existing functionality or UX
2. **Power User Focus** — Optimize for keyboard-driven workflows and data visualization
3. **Contextual Intelligence** — Features activate only when appropriate (e.g., price visualization requires price data enabled)
4. **Performance** — Zero perceptible slowdown to Moxfield's already fast interface
5. **Maintainability** — Robust DOM selection that handles Moxfield updates gracefully

---

## 3. Target Users

### Primary Persona: MTG Deck Builder Power User

- **Who:** Experienced Moxfield users who frequently build and iterate on decks
- **Technical Comfort:** Comfortable with keyboard shortcuts, browser extensions
- **Goals:**
  - Rapidly reorganize decks between categories (Mainboard, Considering, Sideboard)
  - Understand price distribution across card categories
  - Minimize mouse usage during deck building workflow
- **Pain Points:**
  - Moving multiple cards between sections requires repetitive individual actions
  - No visual indication of which cards consume the most budget in each section
  - Existing keyboard shortcuts only work on individual cards

### Secondary Persona: Budget-Conscious Deck Builder

- **Who:** Players building decks with budget constraints
- **Goals:**
  - Quickly identify expensive sections of their deck
  - Understand which individual cards are budget outliers
  - Make informed decisions about card substitutions
- **Pain Points:**
  - Manually calculating section costs is tedious
  - No quick visual indicator of relative card costs

---

## 4. MVP Scope

### In Scope

**Feature 1: Section-Level Keyboard Shortcuts**
- ✅ Extend existing "movement" keyboard shortcuts to work on section headers
- ✅ Hovering over a section header (e.g., "Creatures", "Artifacts") enables section-level actions
- ✅ Pressing a movement shortcut (e.g., Alt+4 for "Move to Considering") applies to ALL cards in that section
- ✅ Support for all existing Moxfield movement shortcuts on sections

**Feature 2: Price Distribution Visualization**
- ✅ Toggle keyboard shortcut to visualize price distribution
- ✅ Displays horizontal bar fill from left to right based on percentage of section cost
- ✅ Only available when "Price" is enabled in Moxfield's "Include Extra Data" view options
- ✅ Bar fills proportionally (e.g., 50% of section cost = bar fills half the row)
- ✅ Clear visual indicator when feature is active

**Feature 3: Multiple Selection with Context Menu**
- ✅ Click to select multiple cards across sections
- ✅ Shift+click for range selection within a section
- ✅ Ctrl+click to toggle individual card selection
- ✅ Apply context menu actions (move, delete) to all selected cards
- ✅ Apply keyboard shortcuts (Alt+1-4, Delete) to all selected cards
- ✅ Visual indicator for selected cards
- ✅ Clear selection via Escape key or clicking empty space

**Technical Requirements**
- ✅ Chrome extension using Manifest V3
- ✅ Content script injection on moxfield.com deck pages
- ✅ Graceful degradation if DOM structure changes
- ✅ Extension popup for settings and feature toggles

### Out of Scope

**Deferred Features**
- ❌ Custom keyboard shortcut configuration
- ❌ Integration with other MTG sites (Archidekt, Tappedout, etc.)
- ❌ Price comparison across vendors
- ❌ Deck statistics overlay
- ❌ Firefox/Safari support (Chrome first)

---

## 5. User Stories

### Feature 1: Section-Level Keyboard Shortcuts

1. **As a deck builder, I want to hover over a section header and press a movement shortcut to move ALL cards in that section, so that I can quickly reorganize my deck.**
   - Example: Hover over "Creatures (15)" header, press Alt+4, all 15 creature cards move to "Considering"

2. **As a deck builder, I want visual feedback when hovering over a section header, so that I know section shortcuts are available.**
   - Example: Section header gets subtle highlight or icon indicating "section mode" is active

3. **As a deck builder, I want the section operation to respect Moxfield's undo functionality, so that I can recover from mistakes.**
   - Example: After moving all creatures to sideboard, pressing Ctrl+Z restores them

### Feature 2: Price Distribution Visualization

4. **As a budget-conscious player, I want to toggle a visualization showing each card's percentage of section cost, so that I can identify expensive cards quickly.**
   - Example: Press Ctrl+Shift+P, cards in "Creatures" section show horizontal bars filling left-to-right—the $50 card in a $100 section shows a bar filling 50% of the row

5. **As a deck builder, I want the price visualization to only be available when price data is visible, so that I'm not confused by missing data.**
   - Example: If "Price" isn't checked in View Options, the shortcut does nothing or shows a tooltip explaining why

### Feature 3: Multiple Selection with Context Menu

8. **As a deck builder, I want to select multiple cards and apply actions to all of them, so that I can reorganize cards that aren't grouped by section.**
   - Example: Click card A, Ctrl+click card B and C from different sections, right-click and choose "Move to Sideboard" to move all three

9. **As a deck builder, I want to quickly select a range of cards, so that I can rapidly select adjacent cards.**
   - Example: Click first card, Shift+click fifth card to select all five cards in between

10. **As a deck builder, I want a clear visual indicator of which cards are selected, so that I don't accidentally apply actions to wrong cards.**
    - Example: Selected cards have a highlighted border or background color

6. **As a deck builder, I want the price visualization to calculate percentages per-section, so that I understand cost distribution within each category.**
   - Example: A $5 card in a $10 Instant section shows 50%, while the same $5 card in a $100 Creatures section shows 5%

7. **As a deck builder, I want to see an indicator when price visualization is active, so that I remember to toggle it off when done.**
   - Example: Small badge or glow effect on extension icon, or subtle banner on page

---

## 6. Core Architecture & Patterns

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Browser Extension                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐   │
│  │   Popup UI   │    │   Content    │    │  Background  │   │
│  │  (Settings)  │◄──►│   Script     │◄──►│   Worker     │   │
│  └──────────────┘    └──────┬───────┘    └──────────────┘   │
│                             │                                │
│                             ▼                                │
│                    ┌──────────────────┐                      │
│                    │   Moxfield DOM   │                      │
│                    │   (Deck Page)    │                      │
│                    └──────────────────┘                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Directory Structure

```
moxfieldext2/
├── src/
│   ├── content/
│   │   ├── index.js              # Content script entry point
│   │   ├── sectionShortcuts.js   # Section-level keyboard handling
│   │   ├── priceVisualization.js # Price percentage visualization
│   │   └── domHelpers.js         # Moxfield DOM utilities
│   ├── popup/
│   │   ├── popup.html            # Extension popup UI
│   │   ├── popup.js              # Popup logic
│   │   └── popup.css             # Popup styling
│   ├── background/
│   │   └── serviceWorker.js      # Background service worker
│   └── utils/
│       ├── storage.js            # Chrome storage helpers
│       └── messaging.js          # Inter-script messaging
├── manifest.json                 # Extension manifest (V3)
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── package.json
└── README.md
```

### Key Design Patterns

- **Event Delegation** — Listen for keyboard events on document, filter by context
- **MutationObserver** — Watch for DOM changes when Moxfield updates dynamically
- **Message Passing** — Communication between content script, popup, and background
- **Feature Flags** — Settings-driven feature activation
- **Graceful Degradation** — Features disable cleanly if selectors fail

---

## 7. Features

### 7.1 Section-Level Keyboard Shortcuts

**Purpose:** Enable bulk operations on all cards within a section using existing Moxfield keyboard shortcuts

**Moxfield DOM Structure Analysis:**

```
Text View Mode:
┌─────────────────────────────────────────────────┐
│ <a class="table-deck-row-link fw-bold">         │  ← Section Header
│   Creatures (15) - $45.20                       │
│ </a>                                            │
├─────────────────────────────────────────────────┤
│ <li class="XIi4jFys2lGhYwseGpBo" id="id56-xxx"> │  ← Card Entry
│   1 Ragavan, Nimble Pilferer ... $75.00         │
│ </li>                                           │
│ <li class="XIi4jFys2lGhYwseGpBo" id="id56-yyy"> │  ← Card Entry
│   4 Lightning Bolt ... $3.50                    │
│ </li>                                           │
│ ...                                             │
├─────────────────────────────────────────────────┤
│ <a class="table-deck-row-link fw-bold">         │  ← Next Section Header
│   Instants (8) - $12.30                         │
│ </a>                                            │
└─────────────────────────────────────────────────┘
```

**Key Selectors:**
- Section headers: `a.table-deck-row-link.fw-bold` (contain section name and count)
- Card entries: `li.XIi4jFys2lGhYwseGpBo` (siblings following header until next header)
- Special sections (Considering, Tokens): `div.cursor-pointer strong` containing section name

**Behavior:**
1. Track mouse position relative to section headers
2. When hovering over a section header and a movement shortcut is pressed:
   - Identify all card elements in that section
   - Simulate the individual card action for each card (or batch via Moxfield's API if discoverable)
3. Provide visual feedback during bulk operation

**Known Moxfield Shortcuts (to support on sections):**
| Shortcut | Action |
|----------|--------|
| Alt+1 | Move to Mainboard |
| Alt+2 | Move to Sideboard |
| Alt+3 | Move to Maybeboard |
| Alt+4 | Move to Considering |
| Delete | Remove from deck |

### 7.2 Price Distribution Visualization

**Purpose:** Visually indicate each card's contribution to section cost

**Prerequisites:**
- "Price" option enabled in View Options → Include Extra Data
- Extension can verify this by checking if price elements exist in card entries

**Price Data Location:**
- Price appears as text within each `li` element (e.g., `$0.99`)
- Regex pattern: `/\$[\d,]+\.?\d*/` to extract price values

**Visualization Approach:**

1. **Calculate section totals:**
   - For each section, sum all card prices (accounting for quantity)
   
2. **Calculate per-card percentage:**
   - `percentage = (card_price * quantity) / section_total * 100`
   
3. **Apply horizontal bar fill:**
   - Overlay a colored bar on the left side of each card row
   - Bar width = percentage of row width (e.g., 50% cost = 50% bar width)
   - Use pseudo-element or injected div with absolute positioning
   ```css
   .mox-price-bar::before {
     content: '';
     position: absolute;
     left: 0;
     top: 0;
     height: 100%;
     width: var(--price-percentage); /* Set via JS */
     background: linear-gradient(90deg, rgba(59, 130, 246, 0.3), rgba(59, 130, 246, 0.1));
     z-index: 0;
   }
   ```
   - Cards remain fully readable (bar is subtle background)
   - High-cost cards (50%+) use warning color (red/orange gradient)

4. **Toggle mechanism:**
   - Keyboard shortcut: `Ctrl+Shift+P` (Price visualization)
   - Toggle state stored in extension storage
   - Visual indicator in extension popup and optionally on page

**UI Consideration:**
- Background color with appropriate text contrast
- Subtle animation when toggling on/off
- Clear way to disable (same shortcut or button in popup)

### 7.3 Multiple Selection with Context Menu

**Purpose:** Enable selection of multiple cards across sections and apply bulk actions via context menu

**Selection Mechanics:**

1. **Single Click Selection:**
   - Click on a card to select it (adds to selection)
   - Click on empty space or press Escape to clear selection

2. **Ctrl+Click (Toggle):**
   - Ctrl+click on a card toggles its selection state
   - Allows adding/removing cards from selection without clearing

3. **Shift+Click (Range):**
   - Shift+click selects all cards between last selected and clicked card
   - Works within the same section only
   - Cross-section range selection not supported (would be confusing)

**Visual Indicators:**
- Selected cards receive a distinct border or background highlight
- Selection count displayed (e.g., "3 cards selected")
- Clear selection button or use Escape key

**Context Menu & Keyboard Actions:**
Right-click on any selected card to show context menu, OR use keyboard shortcuts:
| Action | Context Menu | Keyboard |
|--------|--------------|----------|
| Move to Mainboard | ✅ | Alt+1 |
| Move to Sideboard | ✅ | Alt+2 |
| Move to Maybeboard | ✅ | Alt+3 |
| Move to Considering | ✅ | Alt+4 |
| Remove from Deck | ✅ | Delete |

**Implementation Notes:**
- Use custom context menu (suppress native browser menu)
- Actions trigger sequentially on each card to work with Moxfield's existing handlers
- Clear selection after action completes
- Provide visual feedback during bulk operation

---

## 8. Technology Stack

### Extension Technologies

| Component | Technology | Version |
|-----------|------------|---------|
| Manifest | Chrome Extension Manifest | V3 |
| Runtime | Chrome Extensions API | Latest |
| Content Scripts | Vanilla JavaScript | ES2020+ |
| Styling | CSS (injected) | CSS3 |
| Storage | chrome.storage.sync | — |

### Development Tools

| Tool | Purpose |
|------|---------|
| npm/pnpm | Package management |
| ESLint | JavaScript linting |
| Prettier | Code formatting |
| web-ext | Extension development/testing |

### Browser Compatibility

| Browser | Support Level |
|---------|--------------|
| Chrome | ✅ Primary (MVP) |
| Edge | 🔄 Should work (Chromium) |
| Firefox | ❌ Deferred |
| Safari | ❌ Deferred |

---

## 9. Security & Configuration

### Permissions Required

```json
{
  "permissions": [
    "storage",
    "activeTab"
  ],
  "host_permissions": [
    "https://moxfield.com/*"
  ]
}
```

**Justification:**
- `storage` — Save user preferences
- `activeTab` — Access current tab when popup is opened
- `host_permissions` — Content script needs to run on Moxfield

### Privacy Considerations

- ❌ No user data collection
- ❌ No external API calls
- ❌ No tracking or analytics
- ✅ All processing done locally in browser
- ✅ Settings stored in user's Chrome sync storage only

### Configuration Options (Stored in chrome.storage)

```javascript
{
  "sectionShortcutsEnabled": true,
  "priceVisualizationEnabled": true,
  "multiSelectEnabled": true,
  "priceVisualizationActive": false,  // Current toggle state
  "colorScheme": "blue-red"           // Future: custom color schemes
}
```

---

## 10. Detailed Technical Specification

### Content Script Initialization

```javascript
// content/index.js
const init = async () => {
  // 1. Verify we're on a deck page
  if (!isDeckPage()) return;
  
  // 2. Load user settings
  const settings = await loadSettings();
  
  // 3. Initialize features based on settings
  if (settings.sectionShortcutsEnabled) {
    initSectionShortcuts();
  }
  
  if (settings.priceVisualizationEnabled) {
    initPriceVisualization();
  }
  
  // 4. Set up MutationObserver for dynamic content
  observeDOMChanges();
};
```

### Section Detection Algorithm

```javascript
// Pseudocode for finding cards in a section
function getCardsInSection(headerElement) {
  const cards = [];
  let sibling = headerElement.nextElementSibling;
  
  while (sibling) {
    // Stop at next section header
    if (isSectionHeader(sibling)) break;
    
    // Collect card entries
    if (isCardEntry(sibling)) {
      cards.push(sibling);
    }
    
    sibling = sibling.nextElementSibling;
  }
  
  return cards;
}
```

### Price Extraction

```javascript
// Extract price from card entry element
function extractPrice(cardElement) {
  const text = cardElement.textContent;
  const match = text.match(/\$([\d,]+\.?\d*)/);
  if (!match) return null;
  return parseFloat(match[1].replace(',', ''));
}

// Extract quantity from card entry
function extractQuantity(cardElement) {
  const text = cardElement.textContent.trim();
  const match = text.match(/^(\d+)\s/);
  return match ? parseInt(match[1]) : 1;
}
```

---

## 11. Success Criteria

### MVP Success Definition

The MVP is successful when a user can:
1. Hover over any section header and move all cards to a different board with one shortcut
2. Toggle price visualization and immediately see which cards are budget-heavy
3. Experience zero interference with normal Moxfield functionality
4. Configure features on/off via extension popup

### Functional Requirements

- ✅ Section shortcuts work for all movement actions (Alt+1 through Alt+4, Delete)
- ✅ Section hover state is visually indicated
- ✅ Price visualization calculates percentages correctly
- ✅ Price visualization only activates when price data is visible
- ✅ Multi-select works with click, Ctrl+click, and Shift+click
- ✅ Context menu applies actions to all selected cards
- ✅ Features can be independently enabled/disabled
- ✅ Extension gracefully handles Moxfield DOM changes

### Quality Indicators

- Feature toggle response under 50ms
- Section operation completes in under 500ms for 30+ cards
- No console errors during normal operation
- No visible UI flicker when injecting styles

---

## 12. Implementation Phases

### Phase 1: Extension Foundation

**Goal:** Functional extension skeleton with content script injection

**Deliverables:**
- [ ] manifest.json with correct permissions
- [ ] Content script that loads on moxfield.com/decks/*
- [ ] Basic popup UI with feature toggles
- [ ] Settings storage and retrieval
- [ ] DOM helper functions for Moxfield structure

**Validation:** Extension loads, popup works, console logs confirm content script runs on deck pages

---

### Phase 2: Section-Level Keyboard Shortcuts

**Goal:** Bulk card movement via section hover + keyboard

**Deliverables:**
- [ ] Section header detection (all view modes)
- [ ] Hover tracking for sections
- [ ] Keyboard event interception for movement shortcuts
- [ ] Card selection within section boundaries
- [ ] Bulk action execution
- [ ] Visual hover feedback

**Validation:** Can move all cards in "Creatures" section to "Considering" with a single Alt+4 press

---

### Phase 3: Price Distribution Visualization

**Goal:** Visual cost percentage overlay on cards

**Deliverables:**
- [ ] Price data detection (verify "Price" option is enabled)
- [ ] Price extraction from card entries
- [ ] Section total calculation
- [ ] Percentage calculation per card
- [ ] CSS injection for background colors
- [ ] Toggle shortcut (Ctrl+Shift+P)
- [ ] Active state indicator

**Validation:** Toggle reveals bar-filled cards; $50 card in $100 section shows bar filling 50% of the row

---

### Phase 4: Multiple Selection (Cancelled)
### 7.3 Multi-Card Selection (Cancelled)

> [!CAUTION] 
> **Cancelled**: This feature was attempted but cancelled because browser security restrictions prevent reliable interception of `Ctrl+Click` (Force New Tab) behavior on Moxfield's DOM.

*(Original Requirements Retained for History)*
**Goal**: Select multiple cards to apply bulk actions.

**Deliverables:**
- [ ] Card click selection (single, Ctrl+click, Shift+click)
- [ ] Visual selection indicators
- [ ] Selection state management
- [ ] Custom context menu on right-click
- [ ] Keyboard shortcut handling for selected cards (Alt+1-4, Delete)
- [ ] Bulk action execution for all selected cards
- [ ] Selection count indicator
- [ ] Clear selection on Escape or empty click

**Validation:** Can select 5 cards across different sections and move them all to Sideboard via right-click menu

---

### Phase 5: Polish & Documentation

**Goal:** Production-ready extension

**Deliverables:**
- [ ] Error handling for missing DOM elements
- [ ] MutationObserver for dynamic content updates
- [ ] Loading states for bulk operations
- [ ] README with installation instructions
- [ ] Icon assets

**Validation:** Extension handles edge cases gracefully, ready for personal use

---

## 13. Future Considerations

### Post-MVP Enhancements

- **Custom Shortcuts** — Allow users to rebind keyboard shortcuts
- **Additional Visualizations** — Mana curve overlay, color distribution
- **Multi-Section Operations** — Select multiple sections for bulk actions
- **Quick Filters** — Temporarily hide/show sections by type
- **Export Enhancements** — Better formatted deck lists
- **Price Thresholds** — Alert when card exceeds budget limit

### Technical Improvements

- **Firefox Support** — Port to Firefox with WebExtensions API
- **Automated Testing** — Playwright tests against Moxfield
- **Version Detection** — Detect Moxfield updates that break selectors
- **Performance Optimization** — Virtual scrolling for huge decks

---

## 14. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Moxfield DOM changes** | Extension breaks after Moxfield update | Use resilient selectors, MutationObserver, version detection; maintain fallback selectors |
| **Keyboard shortcut conflicts** | Shortcut already used by Moxfield/browser | Research existing shortcuts; provide configuration option |
| **Performance with large decks** | Slow bulk operations | Batch DOM operations, use requestAnimationFrame, show progress |
| **Price data format changes** | Incorrect parsing | Robust regex, multiple extraction strategies, validation |
| **Chrome Web Store rejection** | Can't distribute easily | Start with unpacked extension; ensure manifest compliance |

---

## 15. Appendix

### Moxfield DOM Reference (as of January 2025)

**Observed from browser analysis of https://moxfield.com/decks/4_hZL5zp-Uiif8TuZiDkvg**

| Element | Selector | Notes |
|---------|----------|-------|
| Section Header | `a.table-deck-row-link.fw-bold` or `a.d-inline-block.text-body.no-outline.fw-bold.table-deck-row-link` | Text format: "Section (count) - $total" |
| Card Entry | `li.XIi4jFys2lGhYwseGpBo` | Has unique `id` attribute |
| Card Name | `a.table-deck-row-link` inside `li` | Contains card name only |
| View Options Button | "Advanced" link | Opens "Customize View" modal |
| Include Extra Data Checkboxes | Inside modal, checkboxes for Mana Cost, Price, Set Symbol | |
| Considering/Tokens | `div.cursor-pointer strong` | Different structure from main deck sections |

### Browser Recording

![Moxfield Page Analysis](C:/Users/scase/.gemini/antigravity/brain/9d7ece0e-2384-4f56-a435-1386d9d65966/moxfield_analysis_1768066356788.webp)

### Key Moxfield Keyboard Shortcuts (Reference)

| Shortcut | Action |
|----------|--------|
| Alt+1 | Move to Mainboard |
| Alt+2 | Move to Sideboard |
| Alt+3 | Move to Maybeboard |
| Alt+4 | Move to Considering |
| + / - | Increase/Decrease quantity |
| Delete | Remove from deck |
| ? | Show keyboard shortcuts |

### Related Resources

- [Chrome Extension Manifest V3](https://developer.chrome.com/docs/extensions/mv3/)
- [Chrome Storage API](https://developer.chrome.com/docs/extensions/reference/storage/)
- [Content Scripts](https://developer.chrome.com/docs/extensions/mv3/content_scripts/)
- [Moxfield](https://moxfield.com)
