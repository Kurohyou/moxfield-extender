/**
 * DOM Helper utilities for Moxfield Extended
 * Provides functions to interact with Moxfield's DOM structure
 */

(function () {
  'use strict';

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

  // Titles of the non-mainboard Boards (spec 2.3). Only the title tells a Board
  // Section apart, so a user tag with one of these names is a known limitation.
  const SPECIAL_BOARD_TITLES = new Set([
    'Commander',
    'Companion',
    'Sideboard',
    'Signature Spell',
    'Oathbreaker',
    'Arthur',
    'Excalibur',
    'Attraction Deck',
    'Contraption Deck',
    'Stickers',
  ]);

  const FOOTER_PATTERN = /^\s*(\d+)\s+main deck\s*$/;
  // A footer ancestor longer than this cannot be the "N main deck" element.
  const FOOTER_MAX_TEXT = 40;
  const FOOTER_ERROR = `Couldn't read the main deck count`;
  const COMMANDER_ERROR = `Couldn't read the Commander count`;

  // The footer element found last time, reused while it is still valid.
  let cachedFooter = null;

  /**
   * Check if the current page is a Moxfield deck page
   * @returns {boolean}
   */
  function isDeckPage() {
    return window.location.pathname.startsWith('/decks/');
  }

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
   * Read the card count from a Section header link: the integer in the "(n)"
   * span right after the title span, else the last "(n)" in the link text.
   * @param {Element} link - The header's a.table-deck-row-link
   * @param {Element} titleSpan - The span[title] inside the link
   * @returns {number|null} Integer count, or null when unreadable
   */
  function readSectionCount(link, titleSpan) {
    const counted = titleSpan.nextElementSibling?.textContent.match(/^\s*\((\d+)\)\s*$/);
    if (counted) return parseInt(counted[1], 10);

    const all = link.textContent.match(/\((\d+)\)/g);
    if (!all) return null;
    return parseInt(all[all.length - 1].match(/\d+/)[0], 10);
  }

  /**
   * Get the mainboard Sections: every Section that is not a special Board
   * (Commander, Sideboard, ...). The name comes from span[title], never from
   * text parsing, because names may contain "(". All queries are scoped to
   * section.deckview article.
   * @returns {Array<{ul: Element, headerLi: Element, link: Element, name: string,
   *   count: number|null, rows: Element[]}>} Sections in DOM order. `count` is an
   *   integer, or null when the header has no readable "(n)".
   */
  function getMainboardSections() {
    const sections = [];
    document.querySelectorAll(SELECTORS.sectionHeader).forEach((link) => {
      const titleSpan = link.querySelector(':scope > span[title]');
      if (!titleSpan) return;

      const name = titleSpan.getAttribute('title');
      if (SPECIAL_BOARD_TITLES.has(name)) return;

      const headerLi = link.closest('li');
      sections.push({
        ul: headerLi.parentElement,
        headerLi,
        link,
        name,
        count: readSectionCount(link, titleSpan),
        rows: getCardsInSection(link),
      });
    });
    return sections;
  }

  /**
   * Read the Commander Section header's "(n)" without building any rows.
   * @returns {{found: boolean, count: number|null}} `found` is false when there
   *   is no Commander Section; `count` is null when its "(n)" is unreadable
   */
  function readCommanderCount() {
    for (const link of document.querySelectorAll(SELECTORS.sectionHeader)) {
      const titleSpan = link.querySelector(':scope > span[title]');
      if (titleSpan?.getAttribute('title') === 'Commander') {
        return { found: true, count: readSectionCount(link, titleSpan) };
      }
    }
    return { found: false, count: null };
  }

  /**
   * Find the "N main deck" footer element by its text.
   * @returns {Element|null}
   */
  function findFooter() {
    if (cachedFooter && cachedFooter.isConnected && FOOTER_PATTERN.test(cachedFooter.textContent)) {
      return cachedFooter;
    }
    cachedFooter = null;

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.nodeValue.includes('main deck')) continue;

      for (
        let element = node.parentElement;
        element && element.textContent.length <= FOOTER_MAX_TEXT;
        element = element.parentElement
      ) {
        if (FOOTER_PATTERN.test(element.textContent)) {
          cachedFooter = element;
          return element;
        }
      }
    }
    return null;
  }

  /**
   * Read the Library size: the footer's "N main deck" count minus the Commander
   * Section's "(n)" (0 when there is no Commander Section). DOM only.
   * @returns {{ok: true, value: number}|{ok: false, reason: string}}
   */
  function readLibrary() {
    const footer = findFooter();
    if (!footer) return { ok: false, reason: FOOTER_ERROR };

    const total = parseInt(footer.textContent.match(FOOTER_PATTERN)[1], 10);
    const commander = readCommanderCount();
    if (!commander.found) return { ok: true, value: total };
    if (commander.count === null) return { ok: false, reason: COMMANDER_ERROR };

    return { ok: true, value: total - commander.count };
  }

  /**
   * Get the active Group-by mode. Works even when the select is hidden.
   * @returns {string} The select's value, or 'type' when there is no select
   */
  function getGroupBy() {
    return document.querySelector('select#groupBy')?.value ?? 'type';
  }

  /**
   * Whether a node is, or sits inside, an extension-owned [data-mox] element.
   * Text nodes have no closest(), so they are judged by the mutation's target
   * (their parent now, or their former parent when removed).
   * @param {Node} node
   * @param {Node} target - The mutation's target
   * @returns {boolean}
   */
  function isOwnNode(node, target) {
    const element = node.nodeType === Node.ELEMENT_NODE ? node : target;
    const owner = element.nodeType === Node.ELEMENT_NODE ? element : element.parentElement;
    return Boolean(owner?.closest('[data-mox]'));
  }

  /**
   * Whether a MutationRecord was caused by the extension's own rendering, so
   * the observer in index.js can ignore it. A mutation is own when its target
   * is inside [data-mox], or when it added or removed nodes and every one of
   * them is, or is inside, [data-mox].
   *
   * index.js observes childList only, so the characterData handling (a text
   * node target inside [data-mox]) is defensive.
   * @param {MutationRecord} mutation
   * @returns {boolean}
   */
  function isOwnMutation(mutation) {
    const { target, addedNodes, removedNodes } = mutation;
    if (isOwnNode(target, target)) return true;

    const changed = [...addedNodes, ...removedNodes];
    return changed.length > 0 && changed.every((node) => isOwnNode(node, target));
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
      SPECIAL_BOARD_TITLES,
      isDeckPage,
      isGoldfishMode,
      getDeckId,
      getSectionHeaders,
      getCardsInSection,
      getMainboardSections,
      readLibrary,
      getGroupBy,
      isOwnMutation,
      isPriceEnabled,
      extractPrice,
      extractQuantity,
      getCardName,
    };
  }
})();
