/**
 * Background Service Worker for Moxfield Extended
 * Handles extension lifecycle events and message routing
 */

// Default settings - must match storage.js
const DEFAULT_SETTINGS = {
  sectionShortcutsEnabled: true,
  priceVisualizationEnabled: true,
  multiSelectEnabled: true,
  priceVisualizationActive: false,
  colorScheme: 'blue-red',
};

// Initialize default settings on install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[Moxfield Extended] Extension installed, setting defaults');
    chrome.storage.sync.set(DEFAULT_SETTINGS);
  } else if (details.reason === 'update') {
    console.log('[Moxfield Extended] Extension updated to version', chrome.runtime.getManifest().version);
  }
});

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Moxfield Extended] Background received message:', message.type);

  switch (message.type) {
    case 'PING':
      sendResponse({ type: 'PONG' });
      break;

    case 'GET_SETTINGS':
      chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
        sendResponse(settings);
      });
      return true; // Indicates async response

    case 'SETTINGS_CHANGED':
      // Broadcast to all Moxfield tabs
      chrome.tabs.query({ url: 'https://moxfield.com/*' }, (tabs) => {
        tabs.forEach((tab) => {
          chrome.tabs.sendMessage(tab.id, message).catch(() => {
            // Tab might not have content script loaded
          });
        });
      });
      sendResponse({ success: true });
      break;

    default:
      console.log('[Moxfield Extended] Unknown message type:', message.type);
  }

  return false;
});

console.log('[Moxfield Extended] Service worker initialized');
