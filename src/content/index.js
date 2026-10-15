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

  // The badge owns Alt+O / Alt+M, which must work while every feature is
  // off, so it is initialised once on every deck page (plan Pitfall 8).
  window.MoxfieldExtended.badge?.init?.();

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

  // Runtime price-bar state, written on every price click. It changes no
  // feature, so it only redraws the badge.
  const PRICE_STATE_KEYS = new Set([
    'priceVisualizationActive',
    'priceVisualizationDeckWide',
  ]);

  /**
   * React to chrome.storage changes.
   * - sync: known setting keys are merged into state.settings and features re-run
   *   (initFeatures is idempotent: each init/cleanup checks its own state).
   *   A change of only the runtime price state just redraws the badge.
   * - local: a change to the current deck's key goes to deckSettings.applyExternal.
   * @param {Object} changes - Map of key to { oldValue, newValue }
   * @param {string} area - 'sync' | 'local' | 'managed'
   */
  function handleStorageChanged(changes, area) {
    const { state, storage, domHelpers, deckSettings, badge } =
      window.MoxfieldExtended;

    if (area === 'sync') {
      const known = new Set([...Object.keys(storage.DEFAULT_SETTINGS), 'priceVisualizationDeckWide']);
      const updates = {};
      Object.keys(changes).forEach((key) => {
        if (!known.has(key)) return;
        // A removed key (no newValue) falls back to its default.
        updates[key] = 'newValue' in changes[key] ? changes[key].newValue : storage.DEFAULT_SETTINGS[key];
      });
      const keys = Object.keys(updates);
      if (keys.length > 0) {
        Object.assign(state.settings, updates);
        if (keys.every((key) => PRICE_STATE_KEYS.has(key))) {
          badge?.render?.();
        } else {
          initFeatures(state.settings);
        }
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

  // Features 3 and 4: Section odds and Section mana curve share the header
  // cluster. refresh() initialises it lazily and removes everything in
  // goldfish mode.
  if (settings.sectionOddsEnabled || settings.sectionCurveEnabled) {
    console.log(LOG_PREFIX, 'Section odds / mana curve: ENABLED');
    refreshHeaders();
  } else {
    console.log(LOG_PREFIX, 'Section odds / mana curve: DISABLED');
    window.MoxfieldExtended?.headerCluster?.cleanup?.();
  }

  // The badge follows every settings change, whatever is on.
  window.MoxfieldExtended?.badge?.render?.();
}

/**
 * Load the per-deck settings for the deck on the page, when a deck view is
 * shown. Its 'load' change event redraws the badge. Failures are logged.
 */
function loadDeckSettings() {
  const { domHelpers, deckSettings } = window.MoxfieldExtended || {};
  if (!deckSettings?.ensureLoaded || !domHelpers?.isDeckView()) return;
  const warn = (error) =>
    console.warn('[Moxfield Extended]', 'Could not load deck settings', error);
  try {
    Promise.resolve(deckSettings.ensureLoaded(domHelpers.getDeckId())).catch(warn);
  } catch (error) {
    warn(error);
  }
}

/**
 * Refresh the Section header clusters, logging a failed refresh instead of
 * leaving an unhandled rejection.
 */
function refreshHeaders() {
  const headerCluster = window.MoxfieldExtended?.headerCluster;
  if (!headerCluster?.refresh) return;
  const warn = (error) =>
    console.warn('[Moxfield Extended]', 'Could not refresh Section headers', error);
  try {
    // Called synchronously, so a cleanup() that follows it still wins.
    Promise.resolve(headerCluster.refresh()).catch(warn);
  } catch (error) {
    warn(error);
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
    // schedule another refresh forever. Then check for relevant DOM changes:
    // added or removed nodes, or text React rewrote in place (a header's
    // "(n)" or the footer's "N main deck" changes a text node's nodeValue).
    const { isOwnMutation } = window.MoxfieldExtended.domHelpers;
    const hasRelevantChanges = mutations
      .filter((mutation) => !isOwnMutation(mutation))
      .some((mutation) => {
        return (
          mutation.type === 'characterData' ||
          mutation.addedNodes.length > 0 ||
          mutation.removedNodes.length > 0
        );
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

        // Follow a client-side deck change in the per-deck settings even with
        // odds and curve off, so the badge shows this deck's T and ≥. A no-op
        // once loaded; a load reads chrome.storage.local and never writes sync.
        loadDeckSettings();

        // Section odds and mana curve. Moxfield navigates client-side and
        // this script runs once, so every refresh re-checks goldfish mode:
        // headerCluster and the badge both remove themselves there.
        const { settings } = window.MoxfieldExtended.state;
        if (settings.sectionOddsEnabled || settings.sectionCurveEnabled) {
          refreshHeaders();
        }
        window.MoxfieldExtended?.badge?.render?.();
      }, 250);
    }
  });

  // Start observing the document body for changes
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  console.log(LOG_PREFIX, 'MutationObserver set up');
}
