/**
 * Header cluster for Moxfield Extended
 * The right-hand cluster in each mainboard Section header: the Section mana
 * curve, then the Section odds chip (spec 4). This module is the single
 * refresh path for both, places them, and squeezes crowded headers into a
 * shared slot.
 *
 * Renders are idempotent: a node or attribute is written only when its value
 * changes, layout included, so the page observer is not fed by our output.
 */

(function () {
  'use strict';

  const LOG_PREFIX = '[Moxfield Extended]';
  const STYLE_ID = 'mox-header-cluster-styles';
  const CLUSTER_CLASS = 'mox-cluster';
  const ARTICLE = 'section.deckview article';
  const SHARED_CLUSTER = '.mox-cluster[data-layout="shared"]';

  // Room kept for about three characters and an ellipsis of a truncated name.
  const MIN_NAME_PX = 28;
  // Extra room 'both' needs when coming back from 'shared', so a header at
  // the boundary does not flap while the window is resized.
  const HYSTERESIS_PX = 8;
  // offsetWidth and clientWidth are integer-rounded, so a sum of them can be
  // off by a pixel or two; 'both' keeps this much spare so the name never
  // ends up truncated by rounding.
  const ROUNDING_SLACK_PX = 2;
  // Space before each cluster item: the cluster's padding-left, then its gap.
  const GAP_PX = 6;

  const HEADER = 'section.deckview article > ul > li:has(> .mox-cluster)';
  const CSS = `
${HEADER} {
  min-width: 0;
}
${HEADER} > a.table-deck-row-link {
  min-width: 0;
  flex: 0 1 auto;
}
${HEADER} > a.table-deck-row-link > span[title] {
  min-width: 0;
}
${HEADER} > :not(a.table-deck-row-link):not(.mox-cluster) {
  flex: none;
  white-space: nowrap;
}
.mox-cluster {
  margin-left: auto;
  align-self: center;
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: ${GAP_PX}px;
  padding-left: ${GAP_PX}px;
}
.mox-cluster[data-layout="shared"] {
  cursor: pointer;
}
.mox-cluster[data-layout="shared"][data-shows="odds"] .mox-curve,
.mox-cluster[data-layout="shared"][data-shows="curve"] .mox-odds,
.mox-cluster[data-layout="hidden"] {
  display: none;
}
.mox-cluster[data-measure] {
  display: inline-flex !important;
}
.mox-cluster[data-measure] > .mox-odds {
  display: inline !important;
}
.mox-cluster[data-measure] > .mox-curve {
  display: inline-flex !important;
}
`;

  /**
   * Whether an element takes part in layout. A display: none sibling has no
   * width and no client rects; its margins must not count.
   * @param {HTMLElement} el
   * @returns {boolean}
   */
  function isRendered(el) {
    return el.offsetWidth > 0 || el.getClientRects().length > 0;
  }

  /**
   * An element's border-box width. offsetWidth exists only on HTML
   * elements; an SVG child (Font Awesome's SVG mode turns the caret into an
   * <svg>) has none, so it is read from its bounding box instead.
   * @param {Element} el
   * @returns {number}
   */
  function boxWidth(el) {
    if (typeof el.offsetWidth === 'number') return el.offsetWidth;
    return el.getBoundingClientRect().width || 0;
  }

  /**
   * An element's horizontal margins.
   * @param {CSSStyleDeclaration} style
   * @returns {number}
   */
  function marginsOf(style) {
    return px(style.marginLeft) + px(style.marginRight);
  }

  /**
   * A computed length in px; 0 when empty or not a number.
   * @param {string} value
   * @returns {number}
   */
  function px(value) {
    return parseFloat(value) || 0;
  }

  /**
   * Width of the header anchor without its name, independent of layout.
   *
   * Summed from the anchor's own padding and border plus each rendered
   * child other than the name (type icon, "(n)", caret) with its margins,
   * plus the name's margins, plus a flex or grid anchor's column-gap between
   * those children. Not taken from the anchor's own width: with
   * min-width: 0 and overflow hidden it can be squeezed below its children,
   * and its scrollWidth reflects the name's truncated, not full, width, so
   * neither tells how much room the non-name parts really need. The
   * non-name children are inline-blocks that never shrink below their
   * content, so their widths are stable across layouts.
   * @param {HTMLElement} link - a.table-deck-row-link
   * @param {HTMLElement|null} name - Its span[title]
   * @returns {number}
   */
  function anchorFixedWidth(link, name) {
    const style = getComputedStyle(link);
    let width =
      px(style.paddingLeft) +
      px(style.paddingRight) +
      px(style.borderLeftWidth) +
      px(style.borderRightWidth);
    let laidOut = 0;
    for (const child of link.children) {
      if (!isRendered(child) && child !== name) continue;
      laidOut += 1;
      const margins = marginsOf(getComputedStyle(child));
      width += child === name ? margins : boxWidth(child) + margins;
    }
    // column-gap applies only between the items of a flex or grid box.
    if (/flex|grid/.test(style.display)) {
      width += px(style.columnGap) * Math.max(0, laidOut - 1);
    }
    return width;
  }

  /**
   * Read a header's geometry from the live layout. Moxfield's siblings of
   * the anchor are pinned (flex: none, nowrap) by our CSS, so their widths
   * do not depend on the current layout either.
   * @param {HTMLElement} li - The header li
   * @param {HTMLElement} cluster - Our cluster inside it
   * @returns {{available: number, fixed: number, nameFull: number}|null}
   *   null when the header has no box (not rendered), so layout skips it
   */
  function readHeader(li, cluster) {
    if (li.clientWidth === 0) return null;
    const style = getComputedStyle(li);
    const available =
      li.clientWidth - px(style.paddingLeft) - px(style.paddingRight);

    let fixed = 0;
    let nameFull = 0;
    for (const child of li.children) {
      if (child === cluster || !isRendered(child)) continue;
      const margins = marginsOf(getComputedStyle(child));
      if (child.matches('a.table-deck-row-link')) {
        const name = child.querySelector(':scope > span[title]');
        if (name) nameFull = name.scrollWidth;
        fixed += anchorFixedWidth(child, name) + margins;
      } else {
        fixed += boxWidth(child) + margins;
      }
    }
    return { available, fixed, nameFull };
  }

  /**
   * Live-layout measurement. Replaced only by setMetricsForTests().
   */
  const DOM_METRICS = {
    header: readHeader,
    width: (el) => el.offsetWidth,
  };

  let metrics = DOM_METRICS;
  let initialized = false;
  let epoch = 0; // bumped by cleanup(); an older refresh writes nothing
  let running = null; // the in-flight refresh promise, or null
  let rerun = false; // another refresh was asked for while one ran
  let rerunStepper = false; // ...and at least one of those came from the DOM
  let layoutPending = false;
  let layoutFrame = null;
  let resizeObserver = null;
  let observed = []; // articles the ResizeObserver watches
  let articleWidths = new WeakMap(); // article → last seen width
  let widthCache = new WeakMap(); // part → {key, width}
  let warned = new Set(); // error messages already logged

  /**
   * The extension namespace, read at call time.
   * @returns {Object}
   */
  function ns() {
    return window.MoxfieldExtended;
  }

  /**
   * Pick a header's layout from measured widths (spec 4 squeeze order).
   * Widths are in px; an absent item has width 0.
   * @param {Object} input
   * @param {number} input.available - Header content width
   * @param {number} input.fixed - Everything in the header except the name and the cluster
   * @param {number} input.nameFull - Untruncated Section name width
   * @param {number} input.nameMin - Narrowest the name may truncate to
   * @param {number} input.curve - Curve width, 0 when absent
   * @param {number} input.chip - Chip width, 0 when absent
   * @param {number} input.gap - Space before each cluster item
   * @param {string|null} input.previous - The cluster's current layout
   * @returns {'both'|'shared'|'single'|'hidden'}
   */
  function chooseHeaderLayout({
    available,
    fixed,
    nameFull,
    nameMin,
    curve,
    chip,
    gap,
    previous,
  }) {
    const items = [curve, chip].filter((width) => width > 0);
    if (items.length === 0) return 'hidden';

    const widest = Math.max(...items);
    const squeezed = fixed + nameMin + widest + gap;
    if (items.length === 1) return squeezed <= available ? 'single' : 'hidden';

    const margin =
      ROUNDING_SLACK_PX + (previous === 'shared' ? HYSTERESIS_PX : 0);
    if (fixed + nameFull + curve + chip + 2 * gap + margin <= available) {
      return 'both';
    }
    return squeezed <= available ? 'shared' : 'hidden';
  }

  /**
   * Add the cluster stylesheet to the page once.
   */
  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.setAttribute('data-mox', '');
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  /**
   * Set an attribute only when it differs.
   * @param {Element} el
   * @param {string} name
   * @param {string} value
   */
  function setAttr(el, name, value) {
    if (el.getAttribute(name) !== value) el.setAttribute(name, value);
  }

  /**
   * Log an error once per distinct message.
   * @param {string} what
   * @param {Error} error
   */
  function warnOnce(what, error) {
    const key = `${what}: ${error && error.message}`;
    if (warned.has(key)) return;
    warned.add(key);
    console.warn(LOG_PREFIX, what, error);
  }

  /**
   * Remove every cluster from the page.
   */
  function removeClusters() {
    document.querySelectorAll(`.${CLUSTER_CLASS}`).forEach((el) => el.remove());
  }

  /**
   * Our cluster in a header, or null.
   * @param {Element} headerLi
   * @returns {HTMLElement|null}
   */
  function clusterOf(headerLi) {
    return headerLi.querySelector(`:scope > .${CLUSTER_CLASS}`);
  }

  /**
   * Make a header's cluster hold exactly `items`, in order, as the header's
   * last child. Writes only what differs; existing nodes are moved, never
   * rebuilt, and moves are synchronous so an anchored stepper stays open.
   * @param {Element} headerLi
   * @param {HTMLElement[]} items - Curve then chip, absent ones left out
   * @returns {HTMLElement|null} The cluster, or null when items is empty
   */
  function ensureCluster(headerLi, items) {
    let cluster = clusterOf(headerLi);
    if (items.length === 0) {
      cluster?.remove();
      return null;
    }
    const fresh = !cluster;
    if (fresh) {
      cluster = document.createElement('span');
      cluster.className = CLUSTER_CLASS;
      cluster.setAttribute('data-mox', '');
    }

    items.forEach((item, index) => {
      const at = cluster.children[index] || null;
      if (at !== item) cluster.insertBefore(item, at);
    });
    while (cluster.children.length > items.length) {
      cluster.lastElementChild.remove();
    }
    // A shared slot with one item left would hide it until the next frame's
    // layout; show it now instead (never hide an anchored chip early).
    if (items.length < 2 && cluster.getAttribute('data-layout') === 'shared') {
      cluster.setAttribute('data-layout', 'single');
    }

    // React may have appended its own node after ours (plan Pitfall 4).
    if (headerLi.lastChild !== cluster) headerLi.appendChild(cluster);
    return cluster;
  }

  /**
   * Whether a cluster part is currently shown, judged from our own
   * attributes (the CSS), never from its measured width.
   * @param {HTMLElement} cluster
   * @param {'chip'|'curve'} part
   * @returns {boolean}
   */
  function isShown(cluster, part) {
    const layout = cluster.getAttribute('data-layout');
    if (layout === 'hidden') return false;
    if (layout !== 'shared') return true;
    const shows =
      cluster.getAttribute('data-shows') === 'curve' ? 'curve' : 'chip';
    return shows === part;
  }

  /**
   * What a part's width depends on: the chip's text, or the curve's bar count.
   * @param {HTMLElement} el
   * @param {'chip'|'curve'} part
   * @returns {string}
   */
  function contentKey(el, part) {
    return part === 'chip' ? el.textContent : String(el.children.length);
  }

  /**
   * Measure and apply each cluster's layout. Runs inside one animation frame:
   * all reads, then (only on a cache miss) a measuring pass, then the writes.
   *
   * Natural widths: a part hidden by its layout measures 0, so each part's
   * width is cached (WeakMap) whenever it is shown, keyed by its content. A
   * hidden part whose content changed since is measured by setting
   * data-measure on its cluster (CSS then shows both parts), reading, and
   * removing it again, all within this callback, so nothing is painted or
   * left hidden across a frame. In steady state every width is cached and no
   * attribute is touched.
   */
  function runLayout() {
    const jobs = [];
    document.querySelectorAll(`.${CLUSTER_CLASS}`).forEach((cluster) => {
      const li = cluster.parentElement;
      if (!li) return;
      const geometry = metrics.header(li, cluster);
      if (!geometry) return;

      const job = {
        cluster,
        geometry,
        widths: { chip: 0, curve: 0 },
        missing: [],
      };
      [
        ['chip', ':scope > .mox-odds'],
        ['curve', ':scope > .mox-curve'],
      ].forEach(([part, selector]) => {
        const el = cluster.querySelector(selector);
        if (!el) return;
        const key = contentKey(el, part);
        if (isShown(cluster, part)) {
          const width = metrics.width(el);
          widthCache.set(el, { key, width });
          job.widths[part] = width;
          return;
        }
        const cached = widthCache.get(el);
        if (cached && cached.key === key) job.widths[part] = cached.width;
        else job.missing.push({ part, el, key });
      });
      jobs.push(job);
    });

    const unmeasured = jobs.filter((job) => job.missing.length > 0);
    if (unmeasured.length > 0) {
      unmeasured.forEach((job) => job.cluster.setAttribute('data-measure', ''));
      unmeasured.forEach((job) =>
        job.missing.forEach(({ part, el, key }) => {
          const width = metrics.width(el);
          widthCache.set(el, { key, width });
          job.widths[part] = width;
        })
      );
      unmeasured.forEach((job) => job.cluster.removeAttribute('data-measure'));
    }

    jobs.forEach(({ cluster, geometry, widths }) => {
      const layout = chooseHeaderLayout({
        available: geometry.available,
        fixed: geometry.fixed,
        nameFull: geometry.nameFull,
        nameMin: Math.min(geometry.nameFull, MIN_NAME_PX),
        curve: widths.curve,
        chip: widths.chip,
        gap: GAP_PX,
        previous: cluster.getAttribute('data-layout'),
      });
      setAttr(cluster, 'data-layout', layout);
    });
  }

  /**
   * Run layout in the next animation frame; at most one is pending.
   */
  function scheduleLayout() {
    if (layoutPending) return;
    // Set before requesting: the frame may run synchronously (tests).
    layoutPending = true;
    const token = epoch;
    layoutFrame = requestAnimationFrame(() => {
      layoutPending = false;
      layoutFrame = null;
      if (token !== epoch) return;
      try {
        runLayout();
      } catch (error) {
        warnOnce('Could not lay out Section headers', error);
      }
    });
  }

  /**
   * Re-run layout when a deck article's width changes: a window resize
   * causes no DOM mutation.
   * @param {ResizeObserverEntry[]} entries
   */
  function onResize(entries) {
    let changed = false;
    entries.forEach((entry) => {
      const width = entry.contentRect.width;
      if (articleWidths.get(entry.target) !== width) {
        articleWidths.set(entry.target, width);
        changed = true;
      }
    });
    if (changed) scheduleLayout();
  }

  /**
   * Point the ResizeObserver at the current deck articles, when they changed.
   */
  function observeArticles() {
    if (!resizeObserver) return;
    const articles = [...document.querySelectorAll(ARTICLE)];
    const same =
      articles.length === observed.length &&
      articles.every((article, index) => article === observed[index]);
    if (same) return;
    resizeObserver.disconnect();
    articles.forEach((article) => resizeObserver.observe(article));
    observed = articles;
  }

  /**
   * One render of every mainboard Section header.
   * @param {boolean} fromDom - Triggered by a DOM change: redraw the stepper
   */
  async function render(fromDom) {
    const start = epoch;
    const {
      state,
      domHelpers,
      oddsMath,
      deckSettings,
      sectionOdds,
      sectionCurve,
    } = ns();
    const settings = (state && state.settings) || {};
    const odds = Boolean(settings.sectionOddsEnabled);
    const curveOn = Boolean(settings.sectionCurveEnabled);

    if (domHelpers.isGoldfishMode() || (!odds && !curveOn)) {
      removeClusters();
      sectionOdds.cleanup();
      sectionCurve.cleanup();
      return;
    }

    await deckSettings.ensureLoaded(domHelpers.getDeckId());
    if (start !== epoch) return; // cleaned up while loading

    // Read the page once, after the await, so nothing below can go stale.
    const groupBy = domHelpers.getGroupBy();
    const library = domHelpers.readLibrary();
    const sections = domHelpers.getMainboardSections();

    init();
    if (odds) sectionOdds.init();
    else sectionOdds.cleanup();

    const ctx = {
      library,
      libraryError: library.ok
        ? oddsMath.libraryError(library.value, sections)
        : null,
      groupBy,
      deckSettings,
    };
    const shows = deckSettings.get().sharedSlot;
    const keep = new Set();

    sections.forEach((section) => {
      const { headerLi } = section;
      const existing = clusterOf(headerLi);
      if (existing) keep.add(existing);
      try {
        const prevChip = existing?.querySelector(':scope > .mox-odds') || null;
        const prevCurve =
          existing?.querySelector(':scope > .mox-curve') || null;
        const chip = odds ? sectionOdds.view(section, ctx, prevChip) : null;
        const curve =
          curveOn && groupBy !== 'cmc'
            ? sectionCurve.view(section, prevCurve)
            : null;
        const cluster = ensureCluster(headerLi, [curve, chip].filter(Boolean));
        if (cluster) {
          keep.add(cluster);
          setAttr(cluster, 'data-shows', shows);
        }
      } catch (error) {
        // Leave this Section's existing nodes as they are.
        warnOnce(`Could not render the ${section.name} Section header`, error);
      }
    });

    document.querySelectorAll(`.${CLUSTER_CLASS}`).forEach((cluster) => {
      if (!keep.has(cluster) || cluster.children.length === 0) cluster.remove();
    });

    observeArticles();
    scheduleLayout();
    if (fromDom) sectionOdds.refreshStepper();
  }

  /**
   * Run render, coalescing: while one runs, further calls share its promise
   * and cause a single rerun once it finishes.
   * @param {boolean} fromDom
   * @returns {Promise<void>}
   */
  function request(fromDom) {
    if (running) {
      rerun = true;
      rerunStepper = rerunStepper || fromDom;
      return running;
    }
    running = (async () => {
      let withStepper = fromDom;
      try {
        for (;;) {
          rerun = false;
          rerunStepper = false;
          try {
            await render(withStepper);
          } catch (error) {
            warnOnce('Could not refresh Section headers', error);
          }
          if (!rerun) break;
          withStepper = rerunStepper;
        }
      } finally {
        running = null;
      }
    })();
    return running;
  }

  /**
   * Refresh every Section header after a DOM change: chips, curves, layout,
   * and the open override stepper. Initialises the module when needed.
   * @returns {Promise<void>} Resolves once this and any coalesced rerun finish
   */
  function refresh() {
    return request(true);
  }

  /**
   * Deck settings changed: re-render. The stepper redraws itself then.
   * Price-bar changes share the event bus but don't affect headers.
   * @param {CustomEvent} event
   */
  function onSettingsChange(event) {
    if (event?.detail?.source === 'price') return;
    request(false);
  }

  /**
   * Left-click on a shared slot switches it, deck-wide (spec 4). Left-click
   * on a standalone curve does nothing (spec 5.3). Others are untouched.
   * @param {MouseEvent} event
   */
  function onClick(event) {
    if (event.button !== 0) return;
    const target = event.target;
    if (!target || !target.closest) return;
    const shared = target.closest(SHARED_CLUSTER);
    if (!shared && !target.closest('.mox-curve')) return;

    event.preventDefault();
    event.stopPropagation();
    if (!shared) return;
    const { deckSettings } = ns();
    const next = deckSettings.get().sharedSlot === 'odds' ? 'curve' : 'odds';
    deckSettings.setSharedSlot(next);
  }

  /**
   * Add the stylesheet, the click, deck-settings and font listeners and the
   * resize observer. Does not render; call refresh(). Idempotent.
   */
  function init() {
    if (initialized) return;
    initialized = true;
    ensureStyles();
    ns().deckSettings.events.addEventListener('change', onSettingsChange);
    document.addEventListener('click', onClick, true);
    resizeObserver = new ResizeObserver(onResize);
    observed = [];
    observeArticles();

    // A web font arriving late changes text widths without any DOM mutation
    // or resize. document.fonts may be missing (jsdom).
    const fonts = document.fonts;
    if (fonts) {
      const token = epoch;
      fonts.ready?.then(() => {
        if (token === epoch) scheduleLayout();
      });
      fonts.addEventListener?.('loadingdone', onFontsLoaded);
    }
  }

  /**
   * More fonts finished loading: widths may have changed.
   */
  function onFontsLoaded() {
    scheduleLayout();
  }

  /**
   * Remove every cluster, the stylesheet, listeners and observer, and clean
   * up the chip and curve modules. An in-flight refresh writes nothing more.
   * Idempotent.
   */
  function cleanup() {
    epoch += 1;
    initialized = false;
    // Drop a rerun queued before now, or it would render and re-init.
    rerun = false;
    rerunStepper = false;
    const { deckSettings, sectionOdds, sectionCurve } = ns();
    deckSettings?.events.removeEventListener('change', onSettingsChange);
    document.removeEventListener('click', onClick, true);
    document.fonts?.removeEventListener?.('loadingdone', onFontsLoaded);
    if (resizeObserver) resizeObserver.disconnect();
    resizeObserver = null;
    observed = [];
    articleWidths = new WeakMap();
    if (layoutFrame !== null) cancelAnimationFrame(layoutFrame);
    layoutFrame = null;
    layoutPending = false;
    widthCache = new WeakMap();
    warned = new Set();
    removeClusters();
    document.getElementById(STYLE_ID)?.remove();
    sectionOdds?.cleanup();
    sectionCurve?.cleanup();
  }

  /**
   * Whether init() has run since the last cleanup().
   * @returns {boolean}
   */
  function isInitialized() {
    return initialized;
  }

  /**
   * Test seam: jsdom has no layout, so tests supply the measurements.
   * `header(li, cluster)` returns {available, fixed, nameFull} or null to
   * skip a header; `width(el)` returns a shown part's natural width.
   * Pass null to restore live measurement.
   * @param {{header: Function, width: Function}|null} next
   */
  function setMetricsForTests(next) {
    metrics = next || DOM_METRICS;
  }

  // Export for use in content scripts
  window.MoxfieldExtended = window.MoxfieldExtended || {};
  window.MoxfieldExtended.headerCluster = {
    init,
    cleanup,
    refresh,
    isInitialized,
    chooseHeaderLayout,
    setMetricsForTests,
    MIN_NAME_PX,
    HYSTERESIS_PX,
    ROUNDING_SLACK_PX,
  };
})();
