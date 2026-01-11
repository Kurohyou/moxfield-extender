# Feature: Price Distribution Visualization (Phase 3)

## Feature Description

Visual overlay showing each card's contribution to section cost as a horizontal bar fill. Enables budget-conscious players to quickly identify expensive cards within each category.

## User Story

As a budget-conscious deck builder, I want to see a visual bar on each card showing its percentage of the section's total cost, so that I can quickly identify expensive outliers.

## Context References

### Relevant Codebase Files (READ BEFORE IMPLEMENTING)

| File | Purpose |
|------|---------|
| [sectionShortcuts.js](file:///c:/Users/scase/OneDrive/Desktop/Git/kurohyou_studios/moxfieldext2/src/content/sectionShortcuts.js) | Pattern for module structure (IIFE, init/cleanup/refresh, CSS injection) |
| [domHelpers.js](file:///c:/Users/scase/OneDrive/Desktop/Git/kurohyou_studios/moxfieldext2/src/content/domHelpers.js) | Existing `isPriceEnabled()`, `extractPrice()`, `extractQuantity()`, `getSectionHeaders()`, `getCardsInSection()` |
| [storage.js](file:///c:/Users/scase/OneDrive/Desktop/Git/kurohyou_studios/moxfieldext2/src/utils/storage.js) | Already has `priceVisualizationEnabled` and `priceVisualizationActive` settings |
| [index.js](file:///c:/Users/scase/OneDrive/Desktop/Git/kurohyou_studios/moxfieldext2/src/content/index.js) (lines 78-84) | TODO placeholder to replace with feature init/cleanup |

### New Files to Create

| File | Purpose |
|------|---------|
| `src/content/priceVisualization.js` | New module implementing price bar visualization |

### PRD Reference

[PRD Section 7.2](file:///c:/Users/scase/OneDrive/Desktop/Git/kurohyou_studios/moxfieldext2/PRD.md) (lines 250-297) - Full feature specification

## Implementation Plan

### Phase 1: Module Foundation

Create `priceVisualization.js` following the established pattern:
- IIFE module structure
- State variables (isActive, isInitialized, styleElement)
- init(), cleanup(), toggle() exported functions
- Keyboard listener for Ctrl+Shift+P toggle

### Phase 2: Price Calculation Logic

1. `calculateSectionTotals()`: For each section, sum `price * quantity` for all cards
2. `calculatePercentages()`: For each card, calculate `(card_total / section_total) * 100`
3. Store percentages as CSS custom properties on card elements

### Phase 3: CSS Overlay Implementation

Inject CSS for price bar visualization:
```css
.mox-price-bar {
  position: relative;
}
.mox-price-bar::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  width: var(--mox-price-percentage, 0%);
  background: linear-gradient(90deg, 
    rgba(59, 130, 246, 0.25), 
    rgba(59, 130, 246, 0.05));
  z-index: 0;
  pointer-events: none;
}
/* Warning color for high-cost cards (>50%) */
.mox-price-bar.mox-price-high::before {
  background: linear-gradient(90deg, 
    rgba(239, 68, 68, 0.3), 
    rgba(239, 68, 68, 0.1));
}
```

### Phase 4: Integration

1. Update `manifest.json` to include `priceVisualization.js`
2. Update `index.js` to call init/cleanup based on settings
3. Add MutationObserver refresh for dynamic content

---

## Step-by-Step Tasks

### [NEW] `src/content/priceVisualization.js`

- **IMPLEMENT**: IIFE module with init/cleanup/toggle/refresh functions
- **PATTERN**: Follow `sectionShortcuts.js` structure exactly
- **KEY FUNCTIONS**:
  - `init()` - Check if price enabled, inject styles, attach keyboard listener
  - `cleanup()` - Remove styles, remove listeners
  - `toggle()` - Toggle visualization on/off, update storage
  - `refresh()` - Recalculate percentages when DOM changes
  - `applyVisualization()` - Calculate & apply CSS custom properties
  - `removeVisualization()` - Remove price bar classes

### [MODIFY] `manifest.json`

- **IMPLEMENT**: Add `priceVisualization.js` to content_scripts array
- **VALIDATE**: `npm run lint`

### [MODIFY] `src/content/index.js`

- **IMPLEMENT**: Replace Phase 3 TODO with actual init/cleanup calls
- **PATTERN**: Same as sectionShortcuts integration (lines 66-76)
- **VALIDATE**: Extension loads without errors

---

## Verification Plan

### Automated
```bash
npm run lint
```

### Manual Testing (User Required)

1. **Toggle Shortcut Test**
   - Load extension, navigate to deck page with "Price" enabled in view options
   - Press `Ctrl+Shift+P`
   - **Expected**: Price bars appear on all cards
   - Press `Ctrl+Shift+P` again
   - **Expected**: Price bars disappear

2. **Percentage Accuracy Test**
   - Find a section with known prices (e.g., 2 cards: $10 and $10)
   - Toggle visualization on
   - **Expected**: Both cards show bars filling ~50% of width

3. **High-Cost Indicator Test**
   - Find a card that is >50% of its section cost
   - **Expected**: Card shows red/warning color bar

4. **Price Not Enabled Test**
   - Disable "Price" in Moxfield view options
   - Press `Ctrl+Shift+P`
   - **Expected**: Console shows message that price data is required (or does nothing gracefully)

5. **Cross-Section Calculation Test**
   - Same card appears in different sections with different totals
   - **Expected**: Percentages calculated per-section (same $5 card = 50% in $10 section, 5% in $100 section)

---

## Acceptance Criteria

- [ ] Ctrl+Shift+P toggles price visualization
- [ ] Bar width proportional to card's percentage of section cost
- [ ] High-cost cards (>50%) show warning color
- [ ] Feature disabled gracefully when price data not available
- [ ] MutationObserver refreshes bars when deck updates
- [ ] Toggle state persists (stored in chrome.storage)
- [ ] `npm run lint` passes
