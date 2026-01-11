/**
 * Section-Level Keyboard Shortcuts for Moxfield Extended
 * Enables bulk card movement by hovering over section headers and pressing shortcuts
 */

console.log('[Moxfield Extended] sectionShortcuts.js loaded');

(function () {
  'use strict';

  const LOG_PREFIX = '[Moxfield Extended]';

  // Module state
  let currentHoveredSection = null;
  let isInitialized = false;
  let isBulkActionInProgress = false; // Prevent re-entry during bulk operations
  let styleElement = null;
  let keydownHandler = null;
  let sectionListeners = [];

  // Shortcuts to handle (Alt + key) - menuTexts are all possible context menu labels
  // The text varies based on where the card currently is
  const SHORTCUTS = {
    '2': {
      action: 'delete',
      label: 'Delete',
      menuTexts: ['Remove'],
      requiresConfirmation: true,
    },
    '3': {
      action: 'sideboard',
      label: 'Toggle Sideboard',
      menuTexts: ['Move to Sideboard', 'Move to Main Deck'],
    },
    '4': {
      action: 'considering',
      label: 'Toggle Considering',
      menuTexts: ['Move to Considering', 'Move to Main Deck'],
    },
  };

  /**
   * Initialize the section shortcuts feature
   */
  function init() {
    if (isInitialized) {
      console.log(LOG_PREFIX, 'Section shortcuts already initialized');
      return;
    }

    console.log(LOG_PREFIX, 'Initializing section shortcuts');

    // Inject styles
    injectStyles();

    // Attach hover listeners to section headers
    attachHoverListeners();

    // Attach keyboard listener
    keydownHandler = handleKeyDown.bind(this);
    document.addEventListener('keydown', keydownHandler);

    isInitialized = true;
    console.log(LOG_PREFIX, 'Section shortcuts initialized');
  }

  /**
   * Cleanup the section shortcuts feature
   */
  function cleanup() {
    if (!isInitialized) return;

    console.log(LOG_PREFIX, 'Cleaning up section shortcuts');

    // Remove styles
    removeStyles();

    // Remove hover listeners
    removeHoverListeners();

    // Remove keyboard listener
    if (keydownHandler) {
      document.removeEventListener('keydown', keydownHandler);
      keydownHandler = null;
    }

    currentHoveredSection = null;
    isInitialized = false;
  }

  /**
   * Refresh hover listeners when DOM changes (e.g., after React re-render)
   */
  function refresh() {
    if (!isInitialized) return;

    // Remove old hover listeners
    removeHoverListeners();

    // Re-attach to new/updated section headers
    attachHoverListeners();

    const headers = window.MoxfieldExtended?.domHelpers?.getSectionHeaders() || [];
    console.log(LOG_PREFIX, `Refreshed: found ${headers.length} section headers`);
  }

  /**
   * Inject CSS styles for hover feedback
   */
  function injectStyles() {
    if (styleElement) return;

    styleElement = document.createElement('style');
    styleElement.id = 'mox-section-shortcuts-styles';
    styleElement.textContent = `
      /* Section hover indicator */
      .mox-section-hover {
        background: rgba(59, 130, 246, 0.15) !important;
        border-radius: 4px;
        transition: background 0.15s ease;
        position: relative;
      }

      .mox-section-hover::after {
        content: '⌨';
        margin-left: 8px;
        font-size: 0.85em;
        opacity: 0.7;
      }

      /* Delete confirmation modal */
      .mox-confirm-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
      }

      .mox-confirm-dialog {
        background: #1a1a2e;
        border: 1px solid #333;
        border-radius: 8px;
        padding: 24px;
        max-width: 400px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      }

      .mox-confirm-dialog h3 {
        margin: 0 0 16px 0;
        color: #fff;
        font-size: 18px;
      }

      .mox-confirm-dialog p {
        margin: 0 0 20px 0;
        color: #aaa;
        font-size: 14px;
      }

      .mox-confirm-buttons {
        display: flex;
        gap: 12px;
        justify-content: flex-end;
      }

      .mox-confirm-btn {
        padding: 8px 20px;
        border: none;
        border-radius: 4px;
        font-size: 14px;
        cursor: pointer;
        transition: background 0.15s ease;
      }

      .mox-confirm-btn-cancel {
        background: #333;
        color: #fff;
      }

      .mox-confirm-btn-cancel:hover {
        background: #444;
      }

      .mox-confirm-btn-delete {
        background: #dc2626;
        color: #fff;
      }

      .mox-confirm-btn-delete:hover {
        background: #b91c1c;
      }

      /* Bulk operation feedback */
      .mox-bulk-processing {
        opacity: 0.6;
        pointer-events: none;
      }

      /* Hide context menus during bulk operations */
      body.mox-bulk-in-progress .dropdown-menu,
      body.mox-bulk-in-progress .dropdown.show,
      body.mox-bulk-in-progress [role="menu"] {
        opacity: 0 !important;
        pointer-events: none !important;
      }
    `;
    document.head.appendChild(styleElement);
  }

  /**
   * Remove injected styles
   */
  function removeStyles() {
    if (styleElement) {
      styleElement.remove();
      styleElement = null;
    }
  }

  /**
   * Attach hover listeners to all section headers
   */
  function attachHoverListeners() {
    const headers = window.MoxfieldExtended?.domHelpers?.getSectionHeaders() || [];
    console.log(LOG_PREFIX, `Attaching hover listeners to ${headers.length} section headers`);

    headers.forEach((header) => {
      const enterHandler = () => handleSectionEnter(header);
      const leaveHandler = () => handleSectionLeave(header);

      header.addEventListener('mouseenter', enterHandler);
      header.addEventListener('mouseleave', leaveHandler);

      sectionListeners.push({ header, enterHandler, leaveHandler });
    });
  }

  /**
   * Remove hover listeners from all section headers
   */
  function removeHoverListeners() {
    sectionListeners.forEach(({ header, enterHandler, leaveHandler }) => {
      header.removeEventListener('mouseenter', enterHandler);
      header.removeEventListener('mouseleave', leaveHandler);
      header.classList.remove('mox-section-hover');
    });
    sectionListeners = [];
  }

  /**
   * Handle mouse entering a section header
   */
  function handleSectionEnter(header) {
    currentHoveredSection = header;
    header.classList.add('mox-section-hover');
  }

  /**
   * Handle mouse leaving a section header
   */
  function handleSectionLeave(header) {
    currentHoveredSection = null;
    header.classList.remove('mox-section-hover');
  }

  /**
   * Handle keydown events for shortcuts
   */
  function handleKeyDown(event) {
    // Only handle Alt + key combinations
    if (!event.altKey) return;

    // Prevent re-entry during bulk operations
    if (isBulkActionInProgress) return;

    // Check if we're hovering over a section
    if (!currentHoveredSection) return;

    const shortcut = SHORTCUTS[event.key];
    if (!shortcut) return;

    // Prevent default and Moxfield's handler
    event.preventDefault();
    event.stopPropagation();

    console.log(LOG_PREFIX, `Section shortcut triggered: ${shortcut.label}`);

    // Get cards in the hovered section
    const cards = window.MoxfieldExtended?.domHelpers?.getCardsInSection(currentHoveredSection) || [];
    if (cards.length === 0) {
      console.log(LOG_PREFIX, 'No cards in section');
      return;
    }

    const sectionName = getSectionName(currentHoveredSection);
    console.log(LOG_PREFIX, `Found ${cards.length} cards in "${sectionName}"`);

    if (shortcut.requiresConfirmation) {
      showDeleteConfirmation(sectionName, cards.length, () => {
        executeBulkAction(cards, event.key);
      });
    } else {
      executeBulkAction(cards, event.key);
    }
  }

  /**
   * Get the display name of a section from its header element
   */
  function getSectionName(header) {
    const text = header.textContent || '';
    // Extract section name (before the count in parentheses)
    const match = text.match(/^([^(]+)/);
    return match ? match[1].trim() : text.trim();
  }

  /**
   * Show delete confirmation dialog
   */
  function showDeleteConfirmation(sectionName, cardCount, onConfirm) {
    const overlay = document.createElement('div');
    overlay.className = 'mox-confirm-overlay';
    overlay.innerHTML = `
      <div class="mox-confirm-dialog">
        <h3>Delete Section Cards</h3>
        <p>Are you sure you want to delete all <strong>${cardCount}</strong> cards from <strong>${sectionName}</strong>?</p>
        <div class="mox-confirm-buttons">
          <button class="mox-confirm-btn mox-confirm-btn-cancel">Cancel</button>
          <button class="mox-confirm-btn mox-confirm-btn-delete">Delete All</button>
        </div>
      </div>
    `;

    const closeDialog = () => overlay.remove();

    overlay.querySelector('.mox-confirm-btn-cancel').addEventListener('click', closeDialog);
    overlay.querySelector('.mox-confirm-btn-delete').addEventListener('click', () => {
      closeDialog();
      onConfirm();
    });

    // Close on escape key
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        closeDialog();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeDialog();
    });

    document.body.appendChild(overlay);
  }

  /**
   * Execute bulk action on all cards using context menu clicks
   */
  async function executeBulkAction(cards, shortcutKey) {
    const shortcut = SHORTCUTS[shortcutKey];
    const menuTexts = shortcut?.menuTexts || [];

    if (menuTexts.length === 0) {
      console.error(LOG_PREFIX, `No menu texts for shortcut ${shortcutKey}`);
      return;
    }

    console.log(LOG_PREFIX, `Executing bulk action (Alt+${shortcutKey}) on ${cards.length} cards via context menu`);

    // Set flag to prevent re-entry
    isBulkActionInProgress = true;

    // Add body class to hide context menus visually
    document.body.classList.add('mox-bulk-in-progress');

    // Add processing indicator
    cards.forEach((card) => card.classList.add('mox-bulk-processing'));

    let successCount = 0;
    let failCount = 0;

    try {
      for (let i = 0; i < cards.length; i++) {
        const card = cards[i];

        // Skip if card was removed from DOM (can happen during delete)
        if (!document.body.contains(card)) {
          console.log(LOG_PREFIX, `Card ${i} no longer in DOM, skipping`);
          continue;
        }

        // Right-click on the card to open context menu
        const contextMenuEvent = new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          view: window,
          button: 2,
          clientX: card.getBoundingClientRect().x + 10,
          clientY: card.getBoundingClientRect().y + 10,
        });
        card.dispatchEvent(contextMenuEvent);

        // Wait for menu to appear
        await delay(150);

        // Try each possible menu text until we find one that exists
        let menuItem = null;
        let foundMenuText = null;
        for (const menuText of menuTexts) {
          menuItem = findMenuItemByText(menuText);
          if (menuItem) {
            foundMenuText = menuText;
            break;
          }
        }

        if (menuItem) {
          menuItem.click();
          successCount++;
          console.log(LOG_PREFIX, `Card ${i + 1}/${cards.length}: clicked "${foundMenuText}"`);
        } else {
          failCount++;
          console.warn(LOG_PREFIX, `Card ${i + 1}/${cards.length}: menu items not found (tried: ${menuTexts.join(', ')})`);
          // Try to close any open menu by clicking elsewhere
          document.body.click();
        }

        // Wait for action to complete before next card
        await delay(200);
      }

      console.log(LOG_PREFIX, `Bulk action completed: ${successCount} succeeded, ${failCount} failed`);
    } catch (error) {
      console.error(LOG_PREFIX, 'Error during bulk action:', error);
    } finally {
      // Clear flag
      isBulkActionInProgress = false;

      // Remove body class to restore menu visibility
      document.body.classList.remove('mox-bulk-in-progress');

      // Remove processing indicator (cards may have been removed from DOM)
      cards.forEach((card) => {
        if (card.classList) {
          card.classList.remove('mox-bulk-processing');
        }
      });
    }
  }

  /**
   * Find a context menu item by its text content
   */
  function findMenuItemByText(text) {
    // Look for dropdown menu items - Moxfield uses React dropdown menus
    // Common selectors for menu items
    const selectors = [
      '.dropdown-item',
      '.dropdown-menu button',
      '.dropdown-menu a',
      '[role="menuitem"]',
      '.context-menu button',
      '.context-menu a',
      // Bootstrap/React dropdowns
      '.show .dropdown-item',
      '.dropdown.show .dropdown-item',
    ];

    for (const selector of selectors) {
      const items = document.querySelectorAll(selector);
      for (const item of items) {
        if (item.textContent?.trim().includes(text)) {
          return item;
        }
      }
    }

    // Fallback: search all buttons/links visible on page
    const allClickables = document.querySelectorAll('button, a');
    for (const item of allClickables) {
      const itemText = item.textContent?.trim();
      if (itemText === text || itemText?.startsWith(text)) {
        // Make sure it's visible
        const rect = item.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          return item;
        }
      }
    }

    return null;
  }

  /**
   * Promise-based delay helper
   */
  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Export for use in content scripts
  if (typeof window !== 'undefined') {
    window.MoxfieldExtended = window.MoxfieldExtended || {};
    window.MoxfieldExtended.sectionShortcuts = {
      init,
      cleanup,
      refresh,
    };
  }
})();
