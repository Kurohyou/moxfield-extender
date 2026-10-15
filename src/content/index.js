/**
 * Moxfield Extended - Content Script Entry Point
 * Initializes extension features on Moxfield deck pages
 */

(async function init() {
  'use strict';

  const LOG_PREFIX = '[Moxfield Extended]';

  // Verify we're on a deck page
  if (!window.MoxfieldExtended?.domHelpers?.isDeckPage()) {
    console.log(LOG_PREFIX, 'Not a deck page, skipping initialization');
    return;
  }

  console.log(LOG_PREFIX, 'Content script initializing on deck page');

  // Load user settings
  const settings = await window.MoxfieldExtended.storage.loadSettings();
  console.log(LOG_PREFIX, 'Settings loaded:', settings);

  // Store current state
  window.MoxfieldExtended.state = {
    settings,
    initialized: false,
    priceVisualizationActive: settings.priceVisualizationActive,
  };

  // Initialize features based on settings
  initFeatures(settings);

  // Set up message listener for settings changes
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'SETTINGS_CHANGED') {
      console.log(LOG_PREFIX, 'Settings changed:', message.settings);
      Object.assign(window.MoxfieldExtended.state.settings, message.settings);
      // Re-initialize features with new settings
      initFeatures(window.MoxfieldExtended.state.settings);
      sendResponse({ success: true });
    }
    return false;
  });

  /**
   * React to chrome.storage changes.
   * - sync: known setting keys are merged into state.settings and features re-run
   *   (initFeatures is idempotent: each init/cleanup checks its own state).
   * - local: a change to the current deck's key goes to deckSettings.applyExternal.
   * @param {Object} changes - Map of key to { oldValue, newValue }
   * @param {string} area - 'sync' | 'local' | 'managed'
   */
  function handleStorageChanged(changes, area) {
    const { state, storage, domHelpers, deckSettings } = window.MoxfieldExtended;

    if (area === 'sync') {
      const known = new Set([...Object.keys(storage.DEFAULT_SETTINGS), 'priceVisualizationDeckWide']);
      const updates = {};
      Object.keys(changes).forEach((key) => {
        if (!known.has(key)) return;
        // A removed key (no newValue) falls back to its default.
        updates[key] = 'newValue' in changes[key] ? changes[key].newValue : storage.DEFAULT_SETTINGS[key];
      });
      if (Object.keys(updates).length > 0) {
        Object.assign(state.settings, updates);
        initFeatures(state.settings);
      }
    } else if (area === 'local') {
      const deckId = domHelpers.getDeckId();
      const change = deckId && changes[`deck:${deckId}`];
      if (change) deckSettings?.applyExternal(deckId, change.newValue);
    }
  }

  // Keep popup, badge and other tabs in step through storage
  chrome.storage.onChanged.addListener(handleStorageChanged);

  // Set up MutationObserver for dynamic content
  setupMutationObserver();

  // Mark as initialized
  window.MoxfieldExtended.state.initialized = true;
  console.log(LOG_PREFIX, 'Content script initialized successfully');

  // Log available DOM elements for debugging
  const headers = window.MoxfieldExtended.domHelpers.getSectionHeaders();
  console.log(LOG_PREFIX, `Found ${headers.length} section headers`);
  console.log(LOG_PREFIX, 'Price data enabled:', window.MoxfieldExtended.domHelpers.isPriceEnabled());
})();

/**
 * Initialize features based on settings
 * @param {Object} settings - User settings
 */
function initFeatures(settings) {
  const LOG_PREFIX = '[Moxfield Extended]';

  // Feature 1: Section-level keyboard shortcuts
  if (settings.sectionShortcutsEnabled) {
    console.log(LOG_PREFIX, 'Section shortcuts: ENABLED');
    if (window.MoxfieldExtended?.sectionShortcuts?.init) {
      window.MoxfieldExtended.sectionShortcuts.init();
    }
  } else {
    console.log(LOG_PREFIX, 'Section shortcuts: DISABLED');
    if (window.MoxfieldExtended?.sectionShortcuts?.cleanup) {
      window.MoxfieldExtended.sectionShortcuts.cleanup();
    }
  }

  // Feature 2: Price visualization
  if (settings.priceVisualizationEnabled) {
    console.log(LOG_PREFIX, 'Price visualization: ENABLED');
    if (window.MoxfieldExtended?.priceVisualization?.init) {
      window.MoxfieldExtended.priceVisualization.init();
    }
  } else {
    console.log(LOG_PREFIX, 'Price visualization: DISABLED');
    if (window.MoxfieldExtended?.priceVisualization?.cleanup) {
      window.MoxfieldExtended.priceVisualization.cleanup();
    }
  }


}

/**
 * Set up MutationObserver to handle dynamic content updates
 */
function setupMutationObserver() {
  const LOG_PREFIX = '[Moxfield Extended]';

  // Observe changes to the deck list container
  const observer = new MutationObserver((mutations) => {
    // Ignore mutations caused by our own rendering, or each render would
    // schedule another refresh forever. Then check for relevant DOM changes.
    const { isOwnMutation } = window.MoxfieldExtended.domHelpers;
    const hasRelevantChanges = mutations
      .filter((mutation) => !isOwnMutation(mutation))
      .some((mutation) => {
        return mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0;
      });

    if (hasRelevantChanges && window.MoxfieldExtended.state.initialized) {
      // Debounce updates
      clearTimeout(window.MoxfieldExtended._updateTimeout);
      window.MoxfieldExtended._updateTimeout = setTimeout(() => {
        console.log(LOG_PREFIX, 'DOM updated, refreshing state');

        // Refresh section shortcuts if enabled
        if (window.MoxfieldExtended.state.settings.sectionShortcutsEnabled) {
          if (window.MoxfieldExtended?.sectionShortcuts?.refresh) {
            window.MoxfieldExtended.sectionShortcuts.refresh();
          }
        }

        // Refresh price visualization if active
        if (window.MoxfieldExtended.state.settings.priceVisualizationEnabled) {
          if (window.MoxfieldExtended?.priceVisualization?.refresh) {
            window.MoxfieldExtended.priceVisualization.refresh();
          }
        }
      }, 250);
    }
  });

  // Start observing the document body for changes
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  console.log(LOG_PREFIX, 'MutationObserver set up');
}
