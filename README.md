# Moxfield Extended

A Chrome extension that enhances the [Moxfield](https://moxfield.com) deck building experience with power-user features.

## Features

### Section-Level Keyboard Shortcuts (Coming Soon)
Hover over a section header and press movement shortcuts to move **all cards** in that section at once.

### Price Distribution Visualization (Coming Soon)
Toggle visual bars showing each card's contribution to section cost.

### Multi-Select (Coming Soon)
Click to select multiple cards, then apply bulk actions via context menu or keyboard shortcuts.

## Installation

### Load as Unpacked Extension

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top right)
4. Click **Load unpacked**
5. Select the `moxfieldext2` folder
6. Navigate to any Moxfield deck page to use the extension

## Development

### Prerequisites
- Node.js 18+ and npm

### Setup

```bash
npm install
```

### Linting

```bash
npm run lint
npm run lint:fix  # Auto-fix issues
```

### Formatting

```bash
npm run format
```

## Keyboard Shortcuts Reference

| Shortcut | Action |
|----------|--------|
| `Alt+1` | Move to Mainboard |
| `Alt+2` | Move to Sideboard |
| `Alt+3` | Move to Maybeboard |
| `Alt+4` | Move to Considering |
| `Ctrl+Shift+P` | Toggle price visualization |
| `Escape` | Clear selection |

## Project Structure

```
moxfieldext2/
├── manifest.json            # Extension manifest (V3)
├── package.json             # Node.js config
├── src/
│   ├── background/
│   │   └── serviceWorker.js # Background service worker
│   ├── content/
│   │   ├── index.js         # Content script entry
│   │   └── domHelpers.js    # Moxfield DOM utilities
│   ├── popup/
│   │   ├── popup.html       # Popup UI
│   │   ├── popup.css        # Popup styles
│   │   └── popup.js         # Popup logic
│   └── utils/
│       ├── storage.js       # Chrome storage helpers
│       └── messaging.js     # Message passing utilities
└── icons/                   # Extension icons
```

## License

MIT
