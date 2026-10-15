/**
 * DOM Helper utilities for Moxfield Extended
 * Provides functions to interact with Moxfield's DOM structure
 */

// Selectors observed on live Moxfield deck pages (table view, October 2026).
// Moxfield ships hashed class names, so prefer data-testid and structural anchors.
const SELECTORS = {
  // Section headers (Commander, Creatures, Instants, etc.). Each Section is its
  // own <ul> inside the deck-list <article>, with the header as its first <li>.
  // Scoping to the article keeps out the mana-curve panel, which reuses the markup.
  sectionHeader: 'section.deckview article > ul > li:first-child > a.table-deck-row-link',

  // Card entries in a section
  cardEntry: 'li[data-testid="deck-view-table-row"]',

  // Special sections (Considering, Tokens)
  specialSectionHeader: 'div.cursor-pointer strong',

  // Card name link within entry
  cardNameLink: 'a.table-deck-row-link',
};

/**
 * Check if the current page is a Moxfield deck page
 * @returns {boolean}
 */
function isDeckPage() {
  return window.location.pathname.startsWith('/decks/');
}

/**
 * Get all section headers on the page
 * @returns {Element[]} Array of section header elements
 */
function getSectionHeaders() {
  const headers = [];

  // Main deck sections
  document.querySelectorAll(SELECTORS.sectionHeader).forEach((el) => {
    if (el.textContent.includes('(')) {
      headers.push(el);
    }
  });

  // Special sections (Considering, Tokens, etc.)
  document.querySelectorAll(SELECTORS.specialSectionHeader).forEach((el) => {
    if (el.textContent.match(/^(Considering|Tokens|Maybeboard|Sideboard)/i)) {
      headers.push(el);
    }
  });

  return headers;
}

/**
 * Get all card entries within a section
 * Cards are the rows of the <ul> whose first <li> holds the header.
 * Special-section headers (Considering, Tokens) are not inside such a list,
 * so they return no cards.
 * @param {Element} headerElement - Section header element
 * @returns {Element[]} Array of card entry elements
 */
function getCardsInSection(headerElement) {
  const headerItem = headerElement.closest('li');
  const list = headerItem?.parentElement;
  if (!list || list.tagName !== 'UL' || list.firstElementChild !== headerItem) {
    return [];
  }

  return Array.from(list.children).filter((child) => child.matches(SELECTORS.cardEntry));
}

/**
 * Check if price data is currently enabled/visible
 * @returns {boolean}
 */
function isPriceEnabled() {
  // Look for price elements in card entries - price shows as $X.XX
  const cards = document.querySelectorAll(SELECTORS.cardEntry);
  if (cards.length === 0) return false;

  // Check if any card has a price value visible
  for (const card of cards) {
    if (card.textContent.match(/\$[\d,]+\.?\d*/)) {
      return true;
    }
  }

  return false;
}

/**
 * Extract price from a card entry element
 * @param {Element} cardElement - Card entry element
 * @returns {number|null} Price in dollars, or null if not found
 */
function extractPrice(cardElement) {
  const text = cardElement.textContent;
  const match = text.match(/\$([\d,]+\.?\d*)/);
  if (!match) return null;
  return parseFloat(match[1].replace(',', ''));
}

/**
 * Extract quantity from a card entry element
 * @param {Element} cardElement - Card entry element
 * @returns {number} Quantity (defaults to 1)
 */
function extractQuantity(cardElement) {
  // The first cell holds the quantity: plain text for viewers, an <input> on
  // decks the viewer owns (where textContent is empty).
  const cell = cardElement.firstElementChild;
  if (!cell) return 1;

  const input = cell.querySelector('input');
  const quantity = parseInt((input ? input.value : cell.textContent).trim(), 10);
  return Number.isNaN(quantity) ? 1 : quantity;
}

/**
 * Get the card name from a card entry element
 * @param {Element} cardElement - Card entry element
 * @returns {string|null} Card name
 */
function getCardName(cardElement) {
  const link = cardElement.querySelector(SELECTORS.cardNameLink);
  return link ? link.textContent.trim() : null;
}

// Export for use in content scripts
if (typeof window !== 'undefined') {
  window.MoxfieldExtended = window.MoxfieldExtended || {};
  window.MoxfieldExtended.domHelpers = {
    SELECTORS,
    isDeckPage,
    getSectionHeaders,
    getCardsInSection,
    isPriceEnabled,
    extractPrice,
    extractQuantity,
    getCardName,
  };
}
