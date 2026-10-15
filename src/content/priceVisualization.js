/**
 * Price Distribution Visualization for Moxfield Extended
 * Displays horizontal bar fills showing each card's percentage of section/deck cost
 */

console.log('[Moxfield Extended] priceVisualization.js loaded');

(function () {
  'use strict';

  const LOG_PREFIX = '[Moxfield Extended]';

  // Module state
  let isInitialized = false;
  let isActive = false;
  let isDeckWideMode = false; // false = section %, true = deck %
  let budgetGoal = null;      // null = use actual deck cost, number = budget target
  let styleElement = null;
  let indicatorElement = null;
  let keydownHandler = null;

  // Toggle shortcuts
  const TOGGLE_KEY = 'p'; // Alt+P toggles on/off, Alt+Shift+P switches mode

  /**
   * Check if running in goldfish mode
   * @returns {boolean} True if in goldfish mode
   */
  function isGoldfishMode() {
    return window.location.pathname.endsWith('/goldfish');
  }

  /**
   * Get the current deck ID from the URL
   * @returns {string|null} Deck ID or null if not on a deck page
   */
  function getDeckId() {
    const match = window.location.pathname.match(/\/decks\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
  }

  /**
   * Load budget goal for current deck from localStorage
   * @returns {number|null} Budget goal or null if not set
   */
  function loadBudgetGoal() {
    const deckId = getDeckId();
    if (!deckId) return null;

    const stored = localStorage.getItem(`mox-budget-${deckId}`);
    return stored ? parseFloat(stored) : null;
  }

  /**
   * Save budget goal for current deck to localStorage
   * @param {number|null} budget - Budget goal or null to clear
   */
  function saveBudgetGoal(budget) {
    const deckId = getDeckId();
    if (!deckId) return;

    if (budget === null || budget === undefined) {
      localStorage.removeItem(`mox-budget-${deckId}`);
    } else {
      localStorage.setItem(`mox-budget-${deckId}`, budget.toString());
    }
  }

  /**
   * Prompt user to set a budget goal
   */
  function promptBudgetGoal() {
    const currentBudget = budgetGoal !== null ? `$${budgetGoal.toFixed(2)}` : 'not set (using actual deck cost)';
    const input = prompt(
      `Set budget goal for this deck.\n\nCurrent: ${currentBudget}\n\nEnter a dollar amount (e.g., 100) or leave empty to use actual deck cost:`,
      budgetGoal !== null ? budgetGoal.toString() : ''
    );

    if (input === null) return; // Cancelled

    if (input.trim() === '') {
      // Clear budget
      budgetGoal = null;
      saveBudgetGoal(null);
      console.log(LOG_PREFIX, 'Budget goal cleared, using actual deck cost');
    } else {
      const parsed = parseFloat(input.replace(/[$,]/g, ''));
      if (!isNaN(parsed) && parsed > 0) {
        budgetGoal = parsed;
        saveBudgetGoal(parsed);
        console.log(LOG_PREFIX, `Budget goal set to $${parsed.toFixed(2)}`);
      } else {
        alert('Invalid budget. Please enter a positive number.');
        return;
      }
    }

    // Refresh visualization with new budget
    if (isActive && isDeckWideMode) {
      applyVisualization();
      showIndicator();
    }
  }

  /**
   * Initialize the price visualization feature
   */
  function init() {
    if (isInitialized) {
      console.log(LOG_PREFIX, 'Price visualization already initialized');
      return;
    }

    console.log(LOG_PREFIX, 'Initializing price visualization');

    // Inject styles
    injectStyles();

    // Load budget goal for this deck
    budgetGoal = loadBudgetGoal();
    if (budgetGoal) {
      console.log(LOG_PREFIX, `Loaded budget goal: $${budgetGoal.toFixed(2)}`);
    }

    // Attach keyboard listener for toggle
    keydownHandler = handleKeyDown.bind(this);
    document.addEventListener('keydown', keydownHandler);

    isInitialized = true;

    // Check if visualization was previously active and restore state
    loadActiveState().then((state) => {
      if (state.active) {
        isActive = true;
        isDeckWideMode = state.deckWide || false;

        // Only apply if not in goldfish mode
        if (!isGoldfishMode()) {
          applyVisualization();
          showIndicator();
        } else {
          console.log(LOG_PREFIX, 'Price visualization active but hidden in goldfish mode');
        }
      }
    });

    console.log(LOG_PREFIX, 'Price visualization initialized');
  }

  /**
   * Cleanup the price visualization feature
   */
  function cleanup() {
    if (!isInitialized) return;

    console.log(LOG_PREFIX, 'Cleaning up price visualization');

    // Remove visualization if active
    if (isActive) {
      removeVisualization();
      hideIndicator();
    }

    // Remove styles
    removeStyles();

    // Remove keyboard listener
    if (keydownHandler) {
      document.removeEventListener('keydown', keydownHandler);
      keydownHandler = null;
    }

    isActive = false;
    isInitialized = false;
  }

  /**
   * Toggle the visualization on/off
   */
  function toggle() {
    if (!isInitialized) return;

    // Check if price data is available
    const priceEnabled = window.MoxfieldExtended?.domHelpers?.isPriceEnabled();
    if (!priceEnabled) {
      console.log(LOG_PREFIX, 'Price visualization requires price data to be enabled in Moxfield view options');
      return;
    }

    isActive = !isActive;
    console.log(LOG_PREFIX, `Price visualization: ${isActive ? 'ON' : 'OFF'} (${isDeckWideMode ? 'deck-wide' : 'per-section'})`);

    if (isActive) {
      if (!isGoldfishMode()) {
        applyVisualization();
        showIndicator();
      } else {
        console.log(LOG_PREFIX, 'Price visualization active but hidden in goldfish mode');
      }
    } else {
      removeVisualization();
      hideIndicator();
    }

    // Persist state
    saveActiveState(isActive, isDeckWideMode);
  }

  /**
   * Switch between section mode and deck-wide mode
   * If not active, starts the visualization in deck-wide mode
   */
  function switchMode() {
    if (!isInitialized) return;

    // If not active, start in deck-wide mode
    if (!isActive) {
      // Check if price data is available
      const priceEnabled = window.MoxfieldExtended?.domHelpers?.isPriceEnabled();
      if (!priceEnabled) {
        console.log(LOG_PREFIX, 'Price visualization requires price data to be enabled in Moxfield view options');
        return;
      }

      isDeckWideMode = true;
      isActive = true;
      if (!isGoldfishMode()) {
        applyVisualization();
        showIndicator();
      }
      saveActiveState(isActive, isDeckWideMode);
      console.log(LOG_PREFIX, 'Price visualization: ON (deck-wide)');
      return;
    }

    // Already active, just switch modes
    isDeckWideMode = !isDeckWideMode;
    console.log(LOG_PREFIX, `Price visualization mode: ${isDeckWideMode ? 'deck-wide' : 'per-section'}`);

    // Re-apply with new mode
    if (!isGoldfishMode()) {
      applyVisualization();
      showIndicator();
    }

    // Persist state
    saveActiveState(isActive, isDeckWideMode);
  }

  /**
   * Refresh visualization (e.g., after DOM changes)
   */
  function refresh() {
    if (!isInitialized || !isActive) return;

    // Re-apply visualization to catch new/updated cards
    // Re-apply visualization to catch new/updated cards
    if (isGoldfishMode()) {
      removeVisualization();
      hideIndicator();
    } else {
      applyVisualization();
      showIndicator();
    }
  }

  /**
   * Inject CSS styles for price bars
   */
  function injectStyles() {
    if (styleElement) return;

    styleElement = document.createElement('style');
    styleElement.id = 'mox-price-visualization-styles';
    styleElement.textContent = `
      /* Price bar visualization */
      .mox-price-bar {
        position: relative !important;
      }

      .mox-price-bar::before {
        content: '';
        position: absolute;
        left: 0;
        top: 0;
        height: 100%;
        width: var(--mox-price-percentage, 0%);
        background: linear-gradient(90deg, 
          rgba(59, 130, 246, 0.35) 0%, 
          rgba(59, 130, 246, 0.15) 85%,
          rgba(59, 130, 246, 0.02) 100%);
        z-index: 0;
        pointer-events: none;
        transition: width 0.3s ease;
        /* Curved/faded right edge effect */
        border-radius: 0 8px 8px 0;
        mask-image: linear-gradient(to right, black 80%, transparent 100%);
        -webkit-mask-image: linear-gradient(to right, black 80%, transparent 100%);
      }

      /* Warning color for high-cost cards (>40% of section/deck) */
      .mox-price-bar.mox-price-high::before {
        background: linear-gradient(90deg, 
          rgba(251, 146, 60, 0.4) 0%, 
          rgba(251, 146, 60, 0.15) 85%,
          rgba(251, 146, 60, 0.02) 100%);
      }

      /* Critical cost (>60% of section/deck) */
      .mox-price-bar.mox-price-critical::before {
        background: linear-gradient(90deg, 
          rgba(239, 68, 68, 0.45) 0%, 
          rgba(239, 68, 68, 0.18) 85%,
          rgba(239, 68, 68, 0.02) 100%);
      }

      /* Deck-wide mode indicator - slightly different styling */
      .mox-price-bar.mox-deck-wide::before {
        border-radius: 0 4px 4px 0;
      }

      /* Ensure card content stays above the bar */
      .mox-price-bar > * {
        position: relative;
        z-index: 1;
      }

      /* Mode indicator badge */
      .mox-price-mode-indicator {
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(30, 30, 30, 0.9);
        color: #fff;
        padding: 8px 14px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 500;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        z-index: 99999;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(255, 255, 255, 0.1);
        display: flex;
        align-items: center;
        gap: 8px;
        transition: opacity 0.2s ease, transform 0.15s ease;
        cursor: pointer;
        user-select: none;
      }

      .mox-price-mode-indicator:hover {
        transform: scale(1.02);
        box-shadow: 0 3px 12px rgba(0, 0, 0, 0.4);
      }

      .mox-price-mode-indicator::before {
        content: '📊';
        font-size: 14px;
      }

      .mox-price-mode-indicator.mox-deck-mode {
        border-color: rgba(59, 130, 246, 0.4);
      }

      .mox-price-mode-indicator.mox-section-mode {
        border-color: rgba(34, 197, 94, 0.4);
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
   * Show/update the mode indicator badge
   */
  function showIndicator() {
    if (!indicatorElement) {
      indicatorElement = document.createElement('div');
      indicatorElement.className = 'mox-price-mode-indicator';
      document.body.appendChild(indicatorElement);
    }

    // Update text and style based on mode
    if (isDeckWideMode) {
      if (budgetGoal !== null) {
        indicatorElement.textContent = `Price: Budget $${budgetGoal.toFixed(0)}`;
      } else {
        indicatorElement.textContent = 'Price: Deck %';
      }
      indicatorElement.classList.remove('mox-section-mode');
      indicatorElement.classList.add('mox-deck-mode');
    } else {
      indicatorElement.textContent = 'Price: Section %';
      indicatorElement.classList.remove('mox-deck-mode');
      indicatorElement.classList.add('mox-section-mode');
    }

    // Left-click to switch modes
    indicatorElement.onclick = switchMode;

    // Right-click to set budget (only in deck-wide mode)
    indicatorElement.oncontextmenu = (e) => {
      e.preventDefault();
      if (isDeckWideMode) {
        promptBudgetGoal();
      } else {
        // Switch to deck mode first, then prompt
        isDeckWideMode = true;
        applyVisualization();
        showIndicator();
        saveActiveState(isActive, isDeckWideMode);
        promptBudgetGoal();
      }
    };
  }

  /**
   * Hide the mode indicator badge
   */
  function hideIndicator() {
    if (indicatorElement) {
      indicatorElement.remove();
      indicatorElement = null;
    }
  }

  /**
   * Handle keydown events for toggle shortcut
   */
  function handleKeyDown(event) {
    // Alt+P to toggle on/off
    if (event.altKey && !event.ctrlKey && !event.shiftKey && event.key.toLowerCase() === TOGGLE_KEY) {
      event.preventDefault();
      event.stopPropagation();
      toggle();
    }

    // Alt+Shift+P to switch between section/deck-wide mode
    if (event.altKey && event.shiftKey && !event.ctrlKey && event.key.toLowerCase() === TOGGLE_KEY) {
      event.preventDefault();
      event.stopPropagation();
      switchMode();
    }
  }

  /**
   * Apply price visualization to all cards
   */
  function applyVisualization() {
    const domHelpers = window.MoxfieldExtended?.domHelpers;
    if (!domHelpers) {
      console.error(LOG_PREFIX, 'domHelpers not available');
      return;
    }

    const headers = domHelpers.getSectionHeaders();

    // First pass: collect all card data and calculate totals
    let deckTotal = 0;
    let deckCardCount = 0;
    const allCardData = [];

    headers.forEach((header) => {
      const cards = domHelpers.getCardsInSection(header);
      if (cards.length === 0) return;

      let sectionTotal = 0;
      const sectionCards = [];

      cards.forEach((card) => {
        const price = domHelpers.extractPrice(card);
        const quantity = domHelpers.extractQuantity(card);
        const cardTotal = (price || 0) * quantity;

        sectionCards.push({ element: card, total: cardTotal });
        sectionTotal += cardTotal;
        deckTotal += cardTotal;
        deckCardCount++;
      });

      allCardData.push({
        sectionTotal,
        cards: sectionCards,
        cardCount: cards.length,
      });
    });

    // Second pass: apply percentages
    let totalCards = 0;

    allCardData.forEach(({ sectionTotal, cards, cardCount }) => {
      // Skip single-card sections (100% is obvious)
      if (cardCount <= 1) return;

      cards.forEach(({ element, total }) => {
        let percentage;
        if (isDeckWideMode) {
          // Use budget goal if set, otherwise use actual deck total
          const denominator = budgetGoal !== null ? budgetGoal : deckTotal;
          percentage = denominator > 0 ? (total / denominator) * 100 : 0;
        } else {
          percentage = sectionTotal > 0 ? (total / sectionTotal) * 100 : 0;
        }

        // Add price bar class and set CSS variable
        element.classList.add('mox-price-bar');
        if (isDeckWideMode) {
          element.classList.add('mox-deck-wide');
        }
        element.style.setProperty('--mox-price-percentage', `${percentage}%`);

        // Add warning classes for high-cost cards
        // Dynamic fair-share thresholds with minimum floors
        element.classList.remove('mox-price-high', 'mox-price-critical');

        // Fair share based on section (section mode) or deck (deck-wide mode)
        const relevantCount = isDeckWideMode ? deckCardCount : cardCount;
        const fairShare = 100 / relevantCount;

        // Calculate thresholds with minimum floors to avoid flagging tiny percentages
        const highThreshold = Math.max(10, fairShare * 1.25);      // 1.25× fair share, min 10%
        const criticalThreshold = Math.max(15, fairShare * 1.75);  // 1.75× fair share, min 15%

        if (percentage > criticalThreshold) {
          element.classList.add('mox-price-critical');
        } else if (percentage > highThreshold) {
          element.classList.add('mox-price-high');
        }

        totalCards++;
      });
    });

    console.log(LOG_PREFIX, `Applied price bars to ${totalCards} cards (${isDeckWideMode ? 'deck-wide' : 'per-section'})`);
  }

  /**
   * Remove price visualization from all cards
   */
  function removeVisualization() {
    const cards = document.querySelectorAll('.mox-price-bar');

    cards.forEach((card) => {
      card.classList.remove('mox-price-bar', 'mox-price-high', 'mox-price-critical', 'mox-deck-wide');
      card.style.removeProperty('--mox-price-percentage');
    });

    console.log(LOG_PREFIX, `Removed price bars from ${cards.length} cards`);
  }

  /**
   * Load active state from storage
   */
  async function loadActiveState() {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.sync.get({
          priceVisualizationActive: false,
          priceVisualizationDeckWide: false,
        }, (result) => {
          resolve({
            active: result.priceVisualizationActive,
            deckWide: result.priceVisualizationDeckWide,
          });
        });
      } else {
        resolve({ active: false, deckWide: false });
      }
    });
  }

  /**
   * Save active state to storage
   */
  function saveActiveState(active, deckWide) {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.sync.set({
        priceVisualizationActive: active,
        priceVisualizationDeckWide: deckWide,
      });
    }
  }

  // Export for use in content scripts
  if (typeof window !== 'undefined') {
    window.MoxfieldExtended = window.MoxfieldExtended || {};
    window.MoxfieldExtended.priceVisualization = {
      init,
      cleanup,
      toggle,
      switchMode,
      refresh,
    };
  }
})();
