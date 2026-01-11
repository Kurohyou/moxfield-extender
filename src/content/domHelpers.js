/**
 * DOM Helper utilities for Moxfield Extended
 * Provides functions to interact with Moxfield's DOM structure
 */

// Selectors based on PRD DOM Reference (Section 15)
const SELECTORS = {
  // Section headers in main deck (Creatures, Instants, etc.)
  sectionHeader: 'a.table-deck-row-link.fw-bold',

  // Alternative section header selector
  sectionHeaderAlt: 'a.d-inline-block.text-body.no-outline.fw-bold.table-deck-row-link',

  // Card entries in a section
  cardEntry: 'li[id^="id56-"]',

  // Card entry by class (more reliable)
  cardEntryClass: 'li.XIi4jFys2lGhYwseGpBo',

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
 * Cards are siblings following the header until the next header
 * @param {Element} headerElement - Section header element
 * @returns {Element[]} Array of card entry elements
 */
function getCardsInSection(headerElement) {
  const cards = [];

  // Navigate to the parent container and find subsequent card entries
  let parent = headerElement.closest('li') || headerElement.parentElement;
  if (!parent) return cards;

  let sibling = parent.nextElementSibling;

  while (sibling) {
    // Stop if we hit another section header
    if (sibling.querySelector(SELECTORS.sectionHeader) ||
      sibling.querySelector(SELECTORS.specialSectionHeader)) {
      break;
    }

    // Check if this is a card entry
    if (sibling.matches(SELECTORS.cardEntryClass) ||
      sibling.id?.startsWith('id56-')) {
      cards.push(sibling);
    }

    sibling = sibling.nextElementSibling;
  }

  return cards;
}

/**
 * Check if price data is currently enabled/visible
 * @returns {boolean}
 */
function isPriceEnabled() {
  // Look for price elements in card entries - price shows as $X.XX
  const cards = document.querySelectorAll(SELECTORS.cardEntryClass);
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
  const text = cardElement.textContent.trim();
  const match = text.match(/^(\d+)\s/);
  return match ? parseInt(match[1]) : 1;
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
