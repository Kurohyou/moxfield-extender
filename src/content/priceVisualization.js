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
  let keydownHandler = null;
  let initEpoch = 0;          // bumped by init/cleanup; a stale restore is dropped

  // Toggle shortcuts
  const TOGGLE_KEY = 'p'; // Alt+P toggles on/off, Alt+Shift+P switches mode

  /**
   * Load budget goal for current deck from localStorage
   * @returns {number|null} Budget goal or null if not set
   */
  function loadBudgetGoal() {
    const deckId = window.MoxfieldExtended.domHelpers.getDeckId();
    if (!deckId) return null;

    const stored = parseFloat(localStorage.getItem(`mox-budget-${deckId}`));
    return isValidBudget(stored) ? stored : null;
  }

  /**
   * Whether a value is a usable budget goal: a finite number above zero.
   * @param {*} value
   * @returns {boolean}
   */
  function isValidBudget(value) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
  }

  /**
   * Save budget goal for current deck to localStorage
   * @param {number|null} budget - Budget goal or null to clear
   */
  function saveBudgetGoal(budget) {
    const deckId = window.MoxfieldExtended.domHelpers.getDeckId();
    if (!deckId) return;

    if (budget === null || budget === undefined) {
      localStorage.removeItem(`mox-budget-${deckId}`);
    } else {
      localStorage.setItem(`mox-budget-${deckId}`, budget.toString());
    }
  }

  /**
   * Tell the badge and settings popover that price state changed. They listen
   * on deckSettings' change event.
   */
  function notifyChange() {
    window.MoxfieldExtended.deckSettings?.events?.dispatchEvent(
      new CustomEvent('change', { detail: { source: 'price' } })
    );
  }

  /**
   * Whether the viewer's Moxfield Price view option is on, so rows show prices.
   * @returns {boolean}
   */
  function isPriceAvailable() {
    return Boolean(window.MoxfieldExtended?.domHelpers?.isPriceEnabled());
  }

  /**
   * Apply or remove the bars to match the current state. Goldfish mode shows none.
   */
  function syncBars() {
    if (isActive && !window.MoxfieldExtended.domHelpers.isGoldfishMode()) {
      applyVisualization();
    } else {
      removeVisualization();
    }
  }

  /**
   * After a state change: update the bars, persist, and notify listeners.
   * Supersedes a pending init restore, so the user's action wins.
   */
  function commit() {
    initEpoch += 1;
    syncBars();
    saveActiveState(isActive, isDeckWideMode);
    notifyChange();
  }

  /**
   * Set on/off and mode together, committing once (one sync write) when
   * either changed. Callers apply their own guards.
   * @param {boolean} active
   * @param {boolean} deckWide
   */
  function update(active, deckWide) {
    if (active === isActive && deckWide === isDeckWideMode) return;
    isActive = active;
    isDeckWideMode = deckWide;
    console.log(LOG_PREFIX, `Price visualization: ${isActive ? (isDeckWideMode ? 'deck-wide' : 'per-section') : 'OFF'}`);
    if (isActive && window.MoxfieldExtended.domHelpers.isGoldfishMode()) {
      console.log(LOG_PREFIX, 'Price visualization active but hidden in goldfish mode');
    }
    commit();
  }

  /**
   * The current price-bar state.
   * @returns {{active: boolean, deckWide: boolean, budget: number|null}}
   */
  function getState() {
    return { active: isActive, deckWide: isDeckWideMode, budget: budgetGoal };
  }

  /**
   * Turn the bars on or off, keeping the mode. Turning on needs the viewer's
   * Moxfield Price option. No-op before init or when nothing changes.
   * @param {boolean} on
   */
  function setActive(on) {
    if (!isInitialized) return;
    const next = Boolean(on);
    if (next && !isActive && !isPriceAvailable()) return;
    update(next, isDeckWideMode);
  }

  /**
   * Choose Deck % (true) or Section % (false). Works while off, so the next
   * turn-on uses it. No-op before init or when nothing changes.
   * @param {boolean} deckWide
   */
  function setDeckWide(deckWide) {
    if (!isInitialized) return;
    update(isActive, Boolean(deckWide));
  }

  /**
   * Badge cycle: Section % → Deck % → Off → Section % (spec 5.1). Turning on
   * always lands in Section mode. No-op when Moxfield Price is off.
   */
  function cycle() {
    if (!isInitialized || !isPriceAvailable()) return;

    if (!isActive) {
      update(true, false);
    } else if (!isDeckWideMode) {
      update(true, true);
    } else {
      update(false, true);
    }
  }

  /**
   * Set this deck's budget goal, the Deck-mode denominator. null, or anything
   * that is not a finite number above zero, clears it (actual deck cost is
   * used). Stored in page localStorage under mox-budget-<deckId>.
   * @param {number|null} budget
   */
  function setBudgetGoal(budget) {
    const next = isValidBudget(budget) ? budget : null;
    saveBudgetGoal(next);
    if (next === budgetGoal) return;

    budgetGoal = next;
    console.log(LOG_PREFIX, next === null ? 'Budget goal cleared, using actual deck cost' : `Budget goal set to $${next.toFixed(2)}`);
    if (isInitialized && isActive && isDeckWideMode) syncBars();
    notifyChange();
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
    keydownHandler = handleKeyDown;
    document.addEventListener('keydown', keydownHandler);

    isInitialized = true;

    // Restore the stored on/off state and mode, then tell the badge
    const epoch = ++initEpoch;
    loadActiveState().then((state) => {
      if (epoch !== initEpoch) return; // cleaned up (or re-inited) meanwhile

      isActive = Boolean(state.active);
      isDeckWideMode = Boolean(state.deckWide);

      // Only apply if not in goldfish mode
      if (isActive && window.MoxfieldExtended.domHelpers.isGoldfishMode()) {
        console.log(LOG_PREFIX, 'Price visualization active but hidden in goldfish mode');
      }
      syncBars();
      notifyChange();
    });

    console.log(LOG_PREFIX, 'Price visualization initialized');
  }

  /**
   * Cleanup the price visualization feature
   */
  function cleanup() {
    if (!isInitialized) return;

    console.log(LOG_PREFIX, 'Cleaning up price visualization');

    initEpoch += 1;
    const wasActive = isActive;

    // Remove visualization if active
    if (isActive) {
      removeVisualization();
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
    if (wasActive) notifyChange();
  }

  /**
   * Toggle the visualization on/off (Alt+P). Needs the viewer's Moxfield
   * Price option either way, as before.
   */
  function toggle() {
    if (!isInitialized) return;

    // Check if price data is available
    if (!isPriceAvailable()) {
      console.log(LOG_PREFIX, 'Price visualization requires price data to be enabled in Moxfield view options');
      return;
    }

    setActive(!isActive);
  }

  /**
   * Switch between section mode and deck-wide mode (Alt+Shift+P).
   * If not active, starts the visualization in deck-wide mode.
   */
  function switchMode() {
    if (!isInitialized) return;

    // Already active, just switch modes
    if (isActive) {
      setDeckWide(!isDeckWideMode);
      return;
    }

    // If not active, start in deck-wide mode (one commit, one sync write)
    if (!isPriceAvailable()) {
      console.log(LOG_PREFIX, 'Price visualization requires price data to be enabled in Moxfield view options');
      return;
    }
    update(true, true);
  }

  /**
   * Refresh visualization (e.g., after DOM changes)
   */
  function refresh() {
    if (!isInitialized || !isActive) return;

    // Re-apply visualization to catch new/updated cards; goldfish shows none.
    // Bars are class and style writes only, never childList, so the observer
    // in index.js does not refresh again.
    syncBars();
  }

  /**
   * Inject CSS styles for price bars
   */
  function injectStyles() {
    if (styleElement) return;

    styleElement = document.createElement('style');
    styleElement.id = 'mox-price-visualization-styles';
    styleElement.setAttribute('data-mox', '');
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
   * Handle keydown events for toggle shortcut: Alt+P toggles on/off,
   * Alt+Shift+P switches between section/deck-wide mode. Matched on
   * event.key, as before. Skipped in editable fields; a held key's
   * autorepeats are swallowed without acting, so they cost no sync writes.
   * @param {KeyboardEvent} event
   */
  function handleKeyDown(event) {
    if (!event.altKey || event.ctrlKey || event.key.toLowerCase() !== TOGGLE_KEY) return;
    if (window.MoxfieldExtended.domHelpers?.isEditableTarget(event.target)) return;

    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) return;

    if (event.shiftKey) {
      switchMode();
    } else {
      toggle();
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

        // Add price bar class and set CSS variable. toggle() and the value
        // check write nothing when unchanged, so a steady-state refresh is quiet.
        element.classList.toggle('mox-price-bar', true);
        element.classList.toggle('mox-deck-wide', isDeckWideMode);
        const width = `${percentage}%`;
        if (element.style.getPropertyValue('--mox-price-percentage') !== width) {
          element.style.setProperty('--mox-price-percentage', width);
        }

        // Add warning classes for high-cost cards
        // Dynamic fair-share thresholds with minimum floors

        // Fair share based on section (section mode) or deck (deck-wide mode)
        const relevantCount = isDeckWideMode ? deckCardCount : cardCount;
        const fairShare = 100 / relevantCount;

        // Calculate thresholds with minimum floors to avoid flagging tiny percentages
        const highThreshold = Math.max(10, fairShare * 1.25);      // 1.25× fair share, min 10%
        const criticalThreshold = Math.max(15, fairShare * 1.75);  // 1.75× fair share, min 15%

        const critical = percentage > criticalThreshold;
        element.classList.toggle('mox-price-critical', critical);
        element.classList.toggle('mox-price-high', !critical && percentage > highThreshold);

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
      getState,
      cycle,
      setActive,
      setDeckWide,
      setBudgetGoal,
    };
  }
})();
