# Feature: Section-Level Keyboard Shortcuts (Phase 2)

## Feature Description

Enable bulk card movement operations by hovering over a section header and pressing Moxfield's movement keyboard shortcuts. When a user hovers over a section header like "Creatures (15)" and presses Alt+4, all 15 cards move to Considering in one action.

## User Story

As a Moxfield power user, I want to hover over a section header and press a movement shortcut to move **all cards** in that section at once, so that I can quickly reorganize my deck without repetitive individual actions.

## Context References

### Relevant Codebase Files (READ BEFORE IMPLEMENTING)

- [domHelpers.js](file:///c:/Users/scase/OneDrive/Desktop/Git/kurohyou_studios/moxfieldext2/src/content/domHelpers.js) - Contains `SELECTORS`, `getSectionHeaders()`, `getCardsInSection()` - **extend these**
- [index.js](file:///c:/Users/scase/OneDrive/Desktop/Git/kurohyou_studios/moxfieldext2/src/content/index.js) (lines 63-70) - Feature initialization pattern in `initFeatures()`
- [storage.js](file:///c:/Users/scase/OneDrive/Desktop/Git/kurohyou_studios/moxfieldext2/src/utils/storage.js) - Settings object includes `sectionShortcutsEnabled: true`
- [PRD.md](file:///c:/Users/scase/OneDrive/Desktop/Git/kurohyou_studios/moxfieldext2/PRD.md) (lines 201-248) - Full feature specification with DOM structure

### New Files to Create

- `src/content/sectionShortcuts.js` - Main feature module handling hover tracking and keyboard events

### Files to Modify

- `src/content/index.js` - Import and call `initSectionShortcuts()` in feature initialization
- `manifest.json` - Add `sectionShortcuts.js` to content scripts array

### Relevant DOM Selectors (from PRD Section 15)

| Element | Selector | Notes |
|---------|----------|-------|
| Section Header | `a.table-deck-row-link.fw-bold` | Contains "Section (count) - $total" |
| Card Entry | `li.XIi4jFys2lGhYwseGpBo` | Has unique `id` attribute starting with `id56-` |
| Special Sections | `div.cursor-pointer strong` | Considering, Tokens sections |

### Keyboard Shortcuts to Support

| Shortcut | Action | Notes |
|----------|--------|-------|
| `Alt+3` | Toggle Sideboard ↔ Mainboard | Moves section between sideboard and main |
| `Alt+4` | Toggle Considering ↔ Mainboard | Moves section between considering and main |
| `Alt+2` | Delete all in section | **Requires confirmation popup** |

> [!NOTE]
> `Alt+1` (add quantity) is not applicable for section-level operations since it adds copies of individual cards.

---

## Proposed Changes

### Content Scripts

#### [NEW] [sectionShortcuts.js](file:///c:/Users/scase/OneDrive/Desktop/Git/kurohyou_studios/moxfieldext2/src/content/sectionShortcuts.js)

Main feature module:

1. **Hover Tracking System**
   - Track which section header the mouse is currently over
   - Store reference to `currentHoveredSection` (or `null`)
   - Add `mouseenter` / `mouseleave` listeners to all section headers
   - Add visual feedback class when hovering (`mox-section-hover`)

2. **Keyboard Event Handler**
   - Listen for `keydown` on `document` (event delegation)
   - Check if `currentHoveredSection !== null`
   - Match shortcut: `Alt+1`, `Alt+2`, `Alt+3`, `Alt+4`, `Delete`
   - If match: get all cards in section, simulate action on each card
   - Prevent default to avoid Moxfield's single-card behavior

3. **Bulk Action Execution**
   - For each card element in section:
     - Focus the card (or dispatch focus event)
     - Dispatch the same keyboard event
   - Use small delay between cards if needed for Moxfield's handlers
   - Show visual feedback during operation

4. **Cleanup / Disable**
   - Remove all event listeners when feature is disabled
   - Export `initSectionShortcuts()` and `cleanupSectionShortcuts()`

---

#### [MODIFY] [index.js](file:///c:/Users/scase/OneDrive/Desktop/Git/kurohyou_studios/moxfieldext2/src/content/index.js)

Update `initFeatures()` function (around line 63-70):

```diff
  // Feature 1: Section-level keyboard shortcuts
  if (settings.sectionShortcutsEnabled) {
    console.log(LOG_PREFIX, 'Section shortcuts: ENABLED');
-   // TODO: Initialize section shortcuts (Phase 2)
+   if (window.MoxfieldExtended?.sectionShortcuts?.init) {
+     window.MoxfieldExtended.sectionShortcuts.init();
+   }
  } else {
    console.log(LOG_PREFIX, 'Section shortcuts: DISABLED');
+   if (window.MoxfieldExtended?.sectionShortcuts?.cleanup) {
+     window.MoxfieldExtended.sectionShortcuts.cleanup();
+   }
  }
```

---

#### [MODIFY] [manifest.json](file:///c:/Users/scase/OneDrive/Desktop/Git/kurohyou_studios/moxfieldext2/manifest.json)

Add `sectionShortcuts.js` to content scripts array (must load after domHelpers):

```diff
  "content_scripts": [
    {
      "matches": ["https://moxfield.com/decks/*"],
      "js": [
        "src/utils/storage.js",
        "src/utils/messaging.js",
        "src/content/domHelpers.js",
+       "src/content/sectionShortcuts.js",
        "src/content/index.js"
      ],
      "run_at": "document_idle"
    }
  ]
```

---

### Styles (Injected via JS)

Inject CSS for hover feedback:

```css
/* Section hover indicator */
.mox-section-hover {
  background: rgba(59, 130, 246, 0.1);
  border-radius: 4px;
  transition: background 0.15s ease;
}

/* Optional: indicator icon */
.mox-section-hover::after {
  content: '⌨';
  margin-left: 8px;
  font-size: 0.8em;
  opacity: 0.6;
}
```

---

## Implementation Plan

### Phase 1: Core Module Setup

1. **Create `sectionShortcuts.js`** with module structure
   - Define state variables (`currentHoveredSection`, `isInitialized`)
   - Create `init()` and `cleanup()` functions
   - Export via `window.MoxfieldExtended.sectionShortcuts`

### Phase 2: Hover Tracking

2. **Implement hover detection**
   - Get all section headers via `domHelpers.getSectionHeaders()`
   - Attach `mouseenter` / `mouseleave` listeners
   - Update `currentHoveredSection` reference
   - Add/remove `.mox-section-hover` class

3. **Inject hover styles**
   - Create `<style>` element with hover CSS
   - Inject into document head on init
   - Remove on cleanup

### Phase 3: Keyboard Handling

4. **Implement keyboard listener**
   - Listen for `keydown` on `document`
   - Only act if `currentHoveredSection !== null`
   - Match shortcuts: `e.altKey && e.key === '2'|'3'|'4'`

5. **Implement bulk action execution**
   - Get cards via `domHelpers.getCardsInSection(currentHoveredSection)`
   - For `Alt+3` and `Alt+4`: simulate keyboard event on each card
   - For `Alt+2` (delete): show confirmation popup first, then execute if confirmed
   - Add visual feedback during operation

6. **Implement delete confirmation popup**
   - Create modal dialog: "Delete X cards from [Section Name]?"
   - Confirm/Cancel buttons
   - Only proceed if user confirms

### Phase 4: Integration

6. **Update `manifest.json`** to include new script
7. **Update `index.js`** to call init/cleanup functions
8. **Manual testing** in browser

---

## Step-by-Step Tasks

### [NEW] src/content/sectionShortcuts.js

- **IMPLEMENT**: Module skeleton with state, init(), cleanup()
- **IMPLEMENT**: `attachHoverListeners()` - add mouseenter/mouseleave to headers
- **IMPLEMENT**: `injectStyles()` / `removeStyles()` - CSS for hover visual
- **IMPLEMENT**: `handleKeyDown(event)` - shortcut detection
- **IMPLEMENT**: `executeBulkAction(cards, event)` - dispatch events to cards
- **PATTERN**: Use `window.MoxfieldExtended.domHelpers` for DOM queries
- **PATTERN**: Follow same export pattern as domHelpers.js

### [MODIFY] manifest.json

- **IMPLEMENT**: Add `"src/content/sectionShortcuts.js"` to content_scripts.js array before index.js

### [MODIFY] src/content/index.js

- **IMPLEMENT**: Replace TODO comment with actual init/cleanup calls
- **PATTERN**: Match existing if/else structure for other features

---

## Testing Strategy

### Manual Testing (Primary)

> [!IMPORTANT]
> No automated test framework is set up. Verification is manual browser testing.

#### Test 1: Extension Loads Without Errors

1. Open Chrome, navigate to `chrome://extensions/`
2. Click "Load unpacked" (or reload if already loaded)
3. Select the `moxfieldext2` folder
4. **Expected**: No red error badge on extension tile

#### Test 2: Section Hover Feedback

1. Navigate to a Moxfield deck page (e.g., `https://moxfield.com/decks/4_hZL5zp-Uiif8TuZiDkvg`)
2. Hover over a section header (e.g., "Creatures")
3. **Expected**: Header shows subtle highlight (blue background)
4. Move mouse away
5. **Expected**: Highlight disappears

#### Test 3: Bulk Move to Considering

1. On a deck page with cards in Creatures section
2. Hover over "Creatures" section header
3. Press `Alt+4`
4. **Expected**: Console shows `[Moxfield Extended] Moving X cards to Considering`
5. **Expected**: All creature cards move to Considering section

#### Test 4: Bulk Move Between Boards

1. Hover over a section in Sideboard
2. Press `Alt+1`
3. **Expected**: Cards move to Mainboard

#### Test 5: No Action When Not Hovering

1. Click somewhere in empty space (not on a section header)
2. Press `Alt+4`
3. **Expected**: No bulk action occurs (Moxfield's default behavior)

#### Test 6: Settings Toggle Works

1. Open extension popup
2. Toggle "Section Shortcuts" OFF
3. Navigate to deck page
4. Hover over section, press `Alt+4`
5. **Expected**: No bulk action (feature disabled)
6. Toggle back ON, refresh page
7. **Expected**: Bulk action works again

### Validation Commands

```bash
# Lint check
npm run lint

# Format check
npm run format
```

---

## Acceptance Criteria

- [ ] New `sectionShortcuts.js` created with proper module structure
- [ ] Hovering over section header shows visual indicator
- [ ] Alt+3 toggles section cards between Sideboard ↔ Mainboard
- [ ] Alt+4 toggles section cards between Considering ↔ Mainboard
- [ ] Alt+2 shows confirmation popup, then deletes all section cards if confirmed
- [ ] Feature can be disabled via popup toggle
- [ ] No console errors during operation
- [ ] ESLint passes with no errors

---

## Risk Considerations

| Risk | Mitigation |
|------|------------|
| Moxfield may block/ignore simulated keyboard events | Try focus + dispatchEvent; fallback to clicking hidden buttons if needed |
| Bulk delete is destructive | **Confirmation popup required** before delete executes |
| Performance with large sections (50+ cards) | Add small delay between actions, show progress |
| DOM changes after operation (React re-render) | Works in favor - Moxfield handles updates |

## Decisions Made

- ✅ **Delete (Alt+2)**: Requires confirmation popup before executing bulk delete
- ✅ **Visual feedback**: Subtle blue highlight on hover is approved
- ✅ **Alt+1 excluded**: Not applicable for section operations (adds card quantity)
