/**
 * Messaging utilities for Moxfield Extended
 * Handles communication between content scripts, popup, and background worker
 */

// Message type constants
const MessageTypes = {
  // Settings-related
  SETTINGS_CHANGED: 'SETTINGS_CHANGED',
  GET_SETTINGS: 'GET_SETTINGS',

  // Feature toggles
  TOGGLE_PRICE_VISUALIZATION: 'TOGGLE_PRICE_VISUALIZATION',

  // Status
  CONTENT_SCRIPT_READY: 'CONTENT_SCRIPT_READY',
  PING: 'PING',
  PONG: 'PONG',
};

/**
 * Send a message to the background service worker
 * @param {Object} message - Message object with type and optional data
 * @returns {Promise<any>} Response from background worker
 */
async function sendToBackground(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      resolve(response);
    });
  });
}

/**
 * Send a message to content scripts in a specific tab
 * @param {number} tabId - Tab ID to send message to
 * @param {Object} message - Message object with type and optional data
 * @returns {Promise<any>} Response from content script
 */
async function sendToContentScript(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      resolve(response);
    });
  });
}

/**
 * Add a message listener
 * @param {Function} handler - Handler function(message, sender, sendResponse)
 */
function addMessageListener(handler) {
  chrome.runtime.onMessage.addListener(handler);
}

// Export for use in content scripts (global namespace for non-module scripts)
if (typeof window !== 'undefined') {
  window.MoxfieldExtended = window.MoxfieldExtended || {};
  window.MoxfieldExtended.messaging = {
    MessageTypes,
    sendToBackground,
    sendToContentScript,
    addMessageListener,
  };
}
