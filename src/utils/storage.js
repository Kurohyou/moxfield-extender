/**
 * Storage utilities for Moxfield Extended
 * Handles loading and saving settings to chrome.storage.sync
 */

// Default settings - matches PRD Section 9
const DEFAULT_SETTINGS = {
  sectionShortcutsEnabled: true,
  priceVisualizationEnabled: true,
  multiSelectEnabled: true,
  priceVisualizationActive: false, // Current toggle state (not a feature toggle)
  colorScheme: 'blue-red',
};

/**
 * Load settings from chrome.storage.sync with defaults
 * @returns {Promise<Object>} Settings object
 */
async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (result) => {
      resolve(result);
    });
  });
}

/**
 * Save settings to chrome.storage.sync
 * @param {Object} settings - Settings to save (partial or full)
 * @returns {Promise<void>}
 */
async function saveSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.sync.set(settings, resolve);
  });
}

/**
 * Get a single setting value
 * @param {string} key - Setting key
 * @returns {Promise<any>} Setting value
 */
async function getSetting(key) {
  const settings = await loadSettings();
  return settings[key];
}

/**
 * Set a single setting value
 * @param {string} key - Setting key
 * @param {any} value - Setting value
 * @returns {Promise<void>}
 */
async function setSetting(key, value) {
  return saveSettings({ [key]: value });
}

// Export for use in content scripts (global namespace for non-module scripts)
if (typeof window !== 'undefined') {
  window.MoxfieldExtended = window.MoxfieldExtended || {};
  window.MoxfieldExtended.storage = {
    DEFAULT_SETTINGS,
    loadSettings,
    saveSettings,
    getSetting,
    setSetting,
  };
}
