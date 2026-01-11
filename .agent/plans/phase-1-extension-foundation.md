# Feature: Extension Foundation (Phase 1)

## Feature Description

Create the foundational Chrome Extension infrastructure that enables all future features. This phase establishes the project skeleton, manifest configuration, content script injection, popup UI with settings toggles, and the messaging/storage patterns that subsequent phases will build upon.

## User Story

As a Moxfield power user, I want to install the Moxfield Extended browser extension, so that I can access enhanced deck building features on moxfield.com.

## Context References

### PRD Requirements (from PRD.md Section 12)

**Deliverables:**
- `manifest.json` with correct permissions
- Content script that loads on `moxfield.com/decks/*`
- Basic popup UI with feature toggles
- Settings storage and retrieval
- DOM helper functions for Moxfield structure

**Validation:** Extension loads, popup works, console logs confirm content script runs on deck pages.

### Relevant Documentation

- [Chrome Extension Manifest V3](https://developer.chrome.com/docs/extensions/mv3/) - Core extension structure
- [Content Scripts](https://developer.chrome.com/docs/extensions/mv3/content_scripts/) - Injection patterns
- [Chrome Storage API](https://developer.chrome.com/docs/extensions/reference/storage/) - Settings persistence
- [Message Passing](https://developer.chrome.com/docs/extensions/mv3/messaging/) - Component communication

### Key Technical Patterns (from Research)

1. **Manifest V3 Requirements:**
   - All code must be bundled locally (no remote code)
   - Service worker replaces background pages
   - `chrome.scripting` API for dynamic injection
   - Stricter CSP (no `eval()` or `unsafe-eval`)

2. **Content Script Isolation:**
   - Runs in isolated world, separate from page JS
   - Use messaging API (`chrome.runtime.sendMessage`) for communication
   - Use `chrome.storage.sync` for persistent state

3. **Popup Pattern:**
   - Defined via `action.default_popup` in manifest
   - Settings stored via chrome.storage.sync
   - Real-time sync with content script via messaging

---

## Proposed Changes

### Extension Root

#### [NEW] [manifest.json](file:///c:/Users/scase/OneDrive/Desktop/Git/kurohyou_studios/moxfieldext2/manifest.json)

Chrome Extension Manifest V3 configuration:
- `manifest_version`: 3
- `name`: "Moxfield Extended"
- `version`: "0.1.0"
- `permissions`: ["storage", "activeTab"]
- `host_permissions`: ["https://moxfield.com/*"]
- `action.default_popup`: "src/popup/popup.html"
- `content_scripts`: Inject on `https://moxfield.com/decks/*` at `document_idle`
- `background.service_worker`: "src/background/serviceWorker.js"

#### [NEW] [package.json](file:///c:/Users/scase/OneDrive/Desktop/Git/kurohyou_studios/moxfieldext2/package.json)

Node.js project configuration with development dependencies:
- ESLint for linting
- Prettier for formatting
- web-ext for extension development

---

### Content Scripts

#### [NEW] [src/content/index.js](file:///c:/Users/scase/OneDrive/Desktop/Git/kurohyou_studios/moxfieldext2/src/content/index.js)

Main content script entry point:
- Verify running on deck page
- Load settings from storage
- Initialize feature modules based on settings
- Set up MutationObserver for dynamic content
- Log initialization status to console

#### [NEW] [src/content/domHelpers.js](file:///c:/Users/scase/OneDrive/Desktop/Git/kurohyou_studios/moxfieldext2/src/content/domHelpers.js)

Moxfield DOM utilities:
- `isDeckPage()` – Check if URL matches deck pattern
- `getSectionHeaders()` – Find all section headers
- `getCardsInSection(header)` – Get card elements for a section
- `isPriceEnabled()` – Check if price column is visible
- Selectors based on PRD DOM Reference (Section 15)

---

### Popup UI

#### [NEW] [src/popup/popup.html](file:///c:/Users/scase/OneDrive/Desktop/Git/kurohyou_studios/moxfieldext2/src/popup/popup.html)

Extension popup interface:
- Extension title and version
- Three toggle switches for features:
  - Section Shortcuts (enabled by default)
  - Price Visualization (enabled by default)
  - Multi-Select (enabled by default)
- Clean, minimal styling

#### [NEW] [src/popup/popup.css](file:///c:/Users/scase/OneDrive/Desktop/Git/kurohyou_studios/moxfieldext2/src/popup/popup.css)

Popup styling:
- Modern toggle switch design
- Consistent with Moxfield's dark aesthetic
- 300px width, compact layout

#### [NEW] [src/popup/popup.js](file:///c:/Users/scase/OneDrive/Desktop/Git/kurohyou_studios/moxfieldext2/src/popup/popup.js)

Popup logic:
- Load current settings on open
- Handle toggle changes
- Save to chrome.storage.sync
- Send message to content script on change

---

### Background Service Worker

#### [NEW] [src/background/serviceWorker.js](file:///c:/Users/scase/OneDrive/Desktop/Git/kurohyou_studios/moxfieldext2/src/background/serviceWorker.js)

Background service worker:
- Initialize default settings on install
- Handle message passing between popup and content scripts
- Minimal logic for MVP (feature-specific logic added in later phases)

---

### Utilities

#### [NEW] [src/utils/storage.js](file:///c:/Users/scase/OneDrive/Desktop/Git/kurohyou_studios/moxfieldext2/src/utils/storage.js)

Storage helper functions:
- `loadSettings()` – Get settings with defaults
- `saveSettings(settings)` – Save to chrome.storage.sync
- Default settings object per PRD Section 9

#### [NEW] [src/utils/messaging.js](file:///c:/Users/scase/OneDrive/Desktop/Git/kurohyou_studios/moxfieldext2/src/utils/messaging.js)

Messaging utilities:
- `sendToContentScript(tabId, message)` – Send message to content script
- `sendToBackground(message)` – Send message to service worker
- Message type constants

---

### Documentation

#### [NEW] [README.md](file:///c:/Users/scase/OneDrive/Desktop/Git/kurohyou_studios/moxfieldext2/README.md)

Project documentation:
- Project description
- Installation instructions (load unpacked)
- Feature overview
- Development setup

---

## Implementation Plan

### Step 1: Create Directory Structure and Package Config

**Files:** `package.json`

- Create `package.json` with project metadata
- Add ESLint, Prettier as devDependencies
- Add npm scripts: `lint`, `format`

### Step 2: Create Extension Manifest

**Files:** `manifest.json`

- Define Manifest V3 structure
- Configure permissions (storage, activeTab)
- Set host_permissions for moxfield.com
- Configure content script injection
- Configure service worker

### Step 3: Create Storage Utilities

**Files:** `src/utils/storage.js`

- Implement `loadSettings()` with default values
- Implement `saveSettings(settings)`
- Define default settings object matching PRD

### Step 4: Create Messaging Utilities

**Files:** `src/utils/messaging.js`

- Define message type constants
- Implement messaging helper functions

### Step 5: Create Background Service Worker

**Files:** `src/background/serviceWorker.js`

- Handle `chrome.runtime.onInstalled` for defaults
- Set up message listeners

### Step 6: Create DOM Helper Functions

**Files:** `src/content/domHelpers.js`

- Implement `isDeckPage()` using URL pattern
- Implement `getSectionHeaders()` with PRD selectors
- Implement `getCardsInSection(header)`
- Implement `isPriceEnabled()`

### Step 7: Create Content Script Entry Point

**Files:** `src/content/index.js`

- Check if on deck page
- Load settings
- Log initialization message
- Set up MutationObserver skeleton

### Step 8: Create Popup UI

**Files:** `src/popup/popup.html`, `src/popup/popup.css`, `src/popup/popup.js`

- Build HTML with toggle switches
- Style with dark theme
- Implement settings load/save logic

### Step 9: Create README

**Files:** `README.md`

- Document installation steps
- Document development setup

---

## Verification Plan

### Manual Testing (Primary)

Since this is a browser extension, verification requires manual testing in Chrome:

1. **Load Extension**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `moxfieldext2` folder
   - Verify extension loads without errors (check for red error badge)

2. **Verify Content Script Injection**
   - Navigate to any Moxfield deck page (e.g., `https://moxfield.com/decks/4_hZL5zp-Uiif8TuZiDkvg`)
   - Open Chrome DevTools (F12) → Console tab
   - Look for `[Moxfield Extended] Content script initialized` log message
   - Verify no errors in console

3. **Verify Popup UI**
   - Click extension icon in Chrome toolbar
   - Verify popup appears with three toggle switches
   - Toggle each switch and verify it saves (close/reopen popup to confirm)

4. **Verify Settings Persistence**
   - Toggle some settings off in popup
   - Reload the Moxfield page
   - Click popup again
   - Verify settings are still in configured state

5. **Verify DOM Helpers Work**
   - In DevTools Console, run: `MoxfieldExtended.domHelpers.getSectionHeaders()`
   - Should return array of section header elements
   - Verify no errors

### Automated Linting

After installing dependencies:
```bash
npm install
npm run lint
```

Verify no linting errors are reported.

---

## Acceptance Criteria

- [ ] Extension loads in Chrome without errors
- [ ] Content script runs on Moxfield deck pages (console log visible)
- [ ] Popup opens with three feature toggles
- [ ] Toggle state persists across popup open/close
- [ ] Toggle state persists across page reloads
- [ ] DOM helper functions return expected elements
- [ ] No console errors during normal operation
- [ ] ESLint passes with no errors
