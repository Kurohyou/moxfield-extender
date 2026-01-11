/**
 * Moxfield Extended Popup Logic
 * Handles settings toggles and communication with content scripts
 */

// Default settings - must match storage.js
const DEFAULT_SETTINGS = {
  sectionShortcutsEnabled: true,
  priceVisualizationEnabled: true,
  multiSelectEnabled: true,
  priceVisualizationActive: false,
  colorScheme: 'blue-red',
};

// Setting IDs that correspond to checkboxes
const SETTING_IDS = [
  'sectionShortcutsEnabled',
  'priceVisualizationEnabled',
  'multiSelectEnabled',
];

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  setupEventListeners();
});

/**
 * Load settings from storage and update UI
 */
async function loadSettings() {
  const settings = await new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, resolve);
  });

  // Update checkboxes to match stored settings
  SETTING_IDS.forEach((id) => {
    const checkbox = document.getElementById(id);
    if (checkbox) {
      checkbox.checked = settings[id];
    }
  });
}

/**
 * Set up event listeners for toggle changes
 */
function setupEventListeners() {
  SETTING_IDS.forEach((id) => {
    const checkbox = document.getElementById(id);
    if (checkbox) {
      checkbox.addEventListener('change', async (event) => {
        await handleSettingChange(id, event.target.checked);
      });
    }
  });
}

/**
 * Handle a setting toggle change
 * @param {string} key - Setting key
 * @param {boolean} value - New value
 */
async function handleSettingChange(key, value) {
  // Save to storage
  await new Promise((resolve) => {
    chrome.storage.sync.set({ [key]: value }, resolve);
  });

  // Notify content scripts of the change
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (tab && tab.url?.includes('moxfield.com')) {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'SETTINGS_CHANGED',
        settings: { [key]: value },
      });
    }
  } catch (error) {
    // Content script may not be loaded on current tab
    console.log('Could not notify content script:', error.message);
  }

  console.log(`Setting ${key} changed to ${value}`);
}
