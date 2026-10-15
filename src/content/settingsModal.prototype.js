/**
 * PROTOTYPE — THROWAWAY. Do not merge into master.
 *
 * Question (wayfinder ticket "Settings modal and per-Section override UI"):
 *   What should the badge's settings UI look like now that it hosts both price bars
 *   and Section odds, and where are per-Section desired-count overrides edited?
 *
 * Three variants on the real Moxfield deck page, switchable via `?variant=A|B|C`
 * and the floating bar at the bottom (or ← / → keys):
 *   A  Minimal change: badge left-click keeps cycling price mode, right-click opens
 *      a centred modal (Save/Cancel) with a per-Section override table.
 *   B  Popover + inline chips (CHOSEN, with the user's tweaks): right-click opens a
 *      small live popover anchored to the badge; left-click depends on the badge
 *      segment: price cycles Section -> Deck -> Off, odds toggles on/off. Overrides
 *      are edited by clicking a Section's % chip in its header (or hover a Section
 *      and press Alt+= / Alt+-). Alt+O toggles odds.
 *   C  Drawer dashboard: left-click slides in a right-hand drawer with a turn slider
 *      and every Section's odds, live, with per-row desired steppers.
 *
 * Everything lives in memory (`store`, dumped in the state panel bottom-left).
 * Price bars are NOT drawn; their toggles are simulated. Library size is a STUB
 * (see the state panel) because that is a separate ticket.
 *
 * Self-contained: works as a content script or pasted into DevTools on a deck page.
 */
(function () {
  'use strict';

  if (window.__moxProto) window.__moxProto.destroy();

  // ---------- in-memory store (shape mirrors the settled storage decisions) ----------

  const deckId = (location.pathname.match(/\/decks\/([a-zA-Z0-9_-]+)/) || [])[1] || 'unknown';
  const store = {
    // Global on/off, like today's priceVisualizationActive in chrome.storage.sync
    global: {
      priceBars: { on: true, mode: 'section' }, // 'section' | 'deck'
      odds: { on: true },
    },
    // Per deck: budget (exists today), turns + default desired (decided), overrides
    // keyed deck -> Group-by mode -> Section name (decided)
    decks: {
      [deckId]: { budget: null, turns: 3, desired: 1, overrides: {} },
    },
  };
  const sim = { viewerPriceOff: false }; // simulate Moxfield's View > Price being off
  const deck = () => store.decks[deckId];

  // ---------- reading the page (per research ticket, not domHelpers) ----------

  const SPECIAL_BOARDS = [
    'Commander', 'Companion', 'Sideboard', 'Signature Spell', 'Oathbreaker',
    'Arthur', 'Excalibur', 'Attraction Deck', 'Contraption Deck', 'Stickers',
  ];
  const PARTITION_MODES = ['type', 'cmc', 'none'];

  function groupBy() {
    return document.querySelector('select#groupBy')?.value || 'type';
  }

  function readSections() {
    const uls = document.querySelectorAll('section.deckview article > ul');
    const out = [];
    uls.forEach((ul) => {
      const header = ul.querySelector(':scope > li:first-child');
      const titleEl = header?.querySelector('span[title]');
      if (!titleEl) return;
      const name = titleEl.getAttribute('title');
      const m = (header.querySelector('a')?.textContent || '').match(/\((\d+)\)/);
      const count = m ? parseInt(m[1], 10) : 0;
      out.push({ name, count, header, special: SPECIAL_BOARDS.includes(name) });
    });
    return out;
  }

  function mainboardSections() {
    return readSections().filter((s) => !s.special);
  }

  function viewerPriceOn() {
    if (sim.viewerPriceOff) return false;
    return !!document.querySelector('section.deckview article > ul > li:first-child > span.text-nowrap.fw-normal.ms-1');
  }

  // STUB population. The real source is decided by the "Library size source" ticket.
  function libraryStub() {
    if (PARTITION_MODES.includes(groupBy())) {
      return { size: mainboardSections().reduce((a, s) => a + s.count, 0), how: 'STUB: sum of mainboard header (n) — valid only in type/cmc/none' };
    }
    return { size: 99, how: 'STUB: fixed 99 (overlapping Group-by, header sum would overcount)' };
  }

  // ---------- maths ----------

  const lf = [0];
  function logFact(n) {
    for (let i = lf.length; i <= n; i++) lf[i] = lf[i - 1] + Math.log(i);
    return lf[n];
  }
  function logC(n, k) {
    return k < 0 || k > n ? -Infinity : logFact(n) - logFact(k) - logFact(n - k);
  }
  function pAtLeast(N, K, n, k) {
    n = Math.min(n, N);
    if (k <= 0) return 1;
    let p = 0;
    for (let x = k; x <= Math.min(K, n); x++) p += Math.exp(logC(K, x) + logC(N - K, n - x) - logC(N, n));
    return Math.min(1, p);
  }

  function overridesHere() {
    const o = deck().overrides;
    return (o[groupBy()] = o[groupBy()] || {});
  }
  function desiredFor(name) {
    return overridesHere()[name] ?? deck().desired;
  }
  function oddsFor(section, turns = deck().turns) {
    const k = desiredFor(section.name);
    const p = pAtLeast(libraryStub().size, section.count, 7 + turns, k);
    return { p, k, pct: `${Math.round(p * 100)}%`, full: `${Math.round(p * 100)}% ≥${k} by T${turns}` };
  }
  function setOverride(name, value) {
    const o = overridesHere();
    if (value === null || value === deck().desired) delete o[name];
    else o[name] = Math.max(0, value);
    if (!Object.keys(o).length) delete deck().overrides[groupBy()];
  }

  // ---------- tiny DOM helper ----------

  function h(tag, attrs = {}, ...kids) {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (v === true) el.setAttribute(k, '');
      else if (v !== false && v != null) el.setAttribute(k, v);
    });
    kids.flat().forEach((c) => c != null && el.append(c.nodeType ? c : String(c)));
    return el;
  }

  function stepper(value, onChange, { min = 0, max = 99, dim = false } = {}) {
    return h('span', { class: `mxp-stepper${dim ? ' mxp-dim' : ''}` },
      h('button', { onclick: (e) => { e.stopPropagation(); onChange(Math.max(min, value - 1)); } }, '−'),
      h('b', {}, value),
      h('button', { onclick: (e) => { e.stopPropagation(); onChange(Math.min(max, value + 1)); } }, '+'));
  }

  function toggle(label, checked, onChange, disabled = false) {
    return h('label', { class: `mxp-toggle${disabled ? ' mxp-disabled' : ''}` },
      h('input', { type: 'checkbox', checked, disabled, onchange: (e) => onChange(e.target.checked) }), label);
  }

  // ---------- styles ----------

  const css = `
    .mox-price-mode-indicator { display: none !important; }
    .mxp, .mxp * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .mxp { color: #eee; font-size: 13px; }
    .mxp button { cursor: pointer; font: inherit; color: inherit; }
    .mxp input[type=number], .mxp input[type=text] { background: #111; color: #eee; border: 1px solid #555; border-radius: 4px; padding: 3px 6px; width: 70px; }
    .mxp-badge { position: fixed; top: 20px; right: 20px; z-index: 99999; background: rgba(30,30,30,.92); padding: 8px 12px; border-radius: 6px;
      border: 1px solid rgba(255,255,255,.12); box-shadow: 0 2px 8px rgba(0,0,0,.35); cursor: pointer; user-select: none; display: flex; gap: 10px; font-weight: 500; font-size: 12px; }
    .mxp-badge span.mxp-off { opacity: .4; text-decoration: line-through; }
    .mxp-chip { margin-left: auto; padding: 0 6px; border-radius: 10px; font-size: 12px; font-weight: 600; color: #93c5fd; background: rgba(59,130,246,.12); white-space: nowrap; }
    .mxp-chip.mxp-ovr { border-bottom: 2px dotted #fbbf24; }
    .mxp-chip.mxp-click { cursor: pointer; }
    .mxp-chip.mxp-click:hover { background: rgba(59,130,246,.3); }
    .mxp-panel { background: #1e1e1e; border: 1px solid #444; border-radius: 8px; box-shadow: 0 8px 30px rgba(0,0,0,.5); }
    .mxp-row { display: flex; align-items: center; gap: 8px; margin: 6px 0; }
    .mxp-row > .mxp-grow { flex: 1; }
    .mxp-muted { color: #999; font-size: 11px; }
    .mxp-warn { color: #fbbf24; font-size: 11px; }
    .mxp-toggle { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
    .mxp-disabled { opacity: .45; cursor: not-allowed; }
    .mxp-stepper { display: inline-flex; align-items: center; gap: 4px; }
    .mxp-stepper button { width: 22px; height: 22px; border: 1px solid #555; background: #2a2a2a; border-radius: 4px; padding: 0; }
    .mxp-stepper b { min-width: 18px; text-align: center; }
    .mxp-dim b { color: #888; font-weight: 400; }
    .mxp-seg { display: inline-flex; border: 1px solid #555; border-radius: 4px; overflow: hidden; }
    .mxp-seg button { border: 0; background: #2a2a2a; padding: 3px 9px; }
    .mxp-seg button.mxp-on { background: #2563eb; }
    .mxp h3 { margin: 0 0 8px; font-size: 14px; }
    .mxp h4 { margin: 12px 0 4px; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: #aaa; }
    /* A: modal */
    .mxp-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.55); z-index: 100000; display: flex; align-items: center; justify-content: center; }
    .mxp-modal { width: 640px; max-height: 80vh; display: flex; flex-direction: column; padding: 18px; }
    .mxp-modal .mxp-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .mxp-modal fieldset { border: 1px solid #444; border-radius: 6px; padding: 8px 12px; margin: 0; }
    .mxp-modal legend { padding: 0 4px; font-weight: 600; font-size: 13px; float: none; width: auto; margin: 0; }
    .mxp-table { overflow: auto; flex: 1; min-height: 120px; margin-top: 4px; border: 1px solid #333; border-radius: 6px; }
    .mxp-table table { width: 100%; border-collapse: collapse; }
    .mxp-table th, .mxp-table td { padding: 4px 8px; text-align: left; border-bottom: 1px solid #2c2c2c; }
    .mxp-table th { position: sticky; top: 0; background: #262626; font-weight: 600; font-size: 11px; color: #aaa; }
    .mxp-table input { width: 54px !important; }
    .mxp-foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
    .mxp-foot button { padding: 5px 14px; border-radius: 4px; border: 1px solid #555; background: #2a2a2a; }
    .mxp-foot button.mxp-primary { background: #2563eb; border-color: #2563eb; }
    /* B: popover */
    .mxp-pop { position: fixed; z-index: 100000; padding: 12px 14px; width: 270px; }
    .mxp-pop.mxp-mini { width: auto; padding: 8px 10px; }
    /* C: drawer */
    .mxp-drawer { position: fixed; top: 0; right: 0; bottom: 0; width: 360px; z-index: 100000; border-radius: 0; border-width: 0 0 0 1px;
      display: flex; flex-direction: column; transform: translateX(100%); transition: transform .2s ease; }
    .mxp-drawer.mxp-open { transform: none; }
    .mxp-drawer .mxp-dhead { padding: 14px 16px 0; }
    .mxp-drawer .mxp-tabs { display: flex; gap: 2px; margin-top: 10px; border-bottom: 1px solid #444; }
    .mxp-drawer .mxp-tabs button { border: 0; background: none; padding: 6px 12px; border-bottom: 2px solid transparent; }
    .mxp-drawer .mxp-tabs button.mxp-on { border-bottom-color: #3b82f6; }
    .mxp-drawer .mxp-dbody { padding: 10px 16px; overflow: auto; flex: 1; }
    .mxp-drawer input[type=range] { width: 100%; }
    .mxp-srow { display: grid; grid-template-columns: 1fr 64px 40px auto; align-items: center; gap: 8px; padding: 5px 0; border-bottom: 1px solid #2c2c2c; }
    .mxp-srow .mxp-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .mxp-bar { height: 6px; background: #333; border-radius: 3px; overflow: hidden; }
    .mxp-bar > i { display: block; height: 100%; background: #3b82f6; }
    .mxp-srow.mxp-ovrrow .mxp-name::after { content: ' •'; color: #fbbf24; }
    /* switcher + state */
    .mxp-switch { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); z-index: 100001; background: #fde047; color: #111;
      border-radius: 999px; padding: 6px 8px; display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 16px rgba(0,0,0,.5); font-weight: 600; font-size: 12px; }
    .mxp-switch button { border: 0; background: #111; color: #fde047; border-radius: 999px; width: 26px; height: 26px; }
    .mxp-state { position: fixed; bottom: 16px; left: 16px; z-index: 100001; width: 330px; max-height: 55vh; overflow: auto; padding: 10px; font-size: 11px; border: 2px dashed #fde047; }
    .mxp-state pre { margin: 6px 0 0; white-space: pre-wrap; font-family: Consolas, monospace; font-size: 10.5px; color: #cbd5e1; }
    .mxp-state.mxp-collapsed pre, .mxp-state.mxp-collapsed .mxp-simrow { display: none; }
  `;

  // ---------- shared chrome: badge, header chips, switcher, state panel ----------

  const root = h('div', { class: 'mxp' });
  const styleEl = h('style', {}, css);
  document.head.append(styleEl);
  document.body.append(root);

  let badgeEl = null;
  function renderBadge() {
    const show = store.global.priceBars.on || store.global.odds.on;
    if (!show) { badgeEl?.remove(); badgeEl = null; return; }
    if (!badgeEl) {
      badgeEl = h('div', { class: 'mxp-badge', onclick: (e) => V().badgeClick(e), oncontextmenu: (e) => V().badgeContext(e) });
      root.append(badgeEl);
    }
    const pb = store.global.priceBars;
    const priceText = pb.mode === 'deck' ? (deck().budget ? `Budget $${deck().budget}` : 'Deck %') : 'Section %';
    badgeEl.replaceChildren(
      h('span', { class: pb.on && viewerPriceOn() ? '' : 'mxp-off', 'data-seg': 'price' }, `📊 ${priceText}`),
      h('span', { class: store.global.odds.on ? '' : 'mxp-off', 'data-seg': 'odds' }, `🎲 T${deck().turns} ≥${deck().desired}`));
  }

  function renderChips() {
    const on = store.global.odds.on;
    readSections().forEach((s) => {
      let chip = s.header.querySelector(':scope > .mxp-chip');
      if (!on || s.special) { chip?.remove(); return; }
      if (!chip) {
        chip = h('span', { class: 'mxp-chip', onclick: (e) => V().chipClick?.(e, s.name) });
        s.header.append(chip);
      }
      if (chip !== s.header.lastElementChild) s.header.append(chip);
      const o = oddsFor(s);
      if (chip.textContent !== o.pct) chip.textContent = o.pct;
      if (chip.title !== o.full) chip.title = o.full;
      chip.classList.toggle('mxp-ovr', s.name in overridesHere());
      chip.classList.toggle('mxp-click', !!V().chipClick);
    });
  }

  const VARIANTS = {};
  const KEYS = ['A', 'B', 'C'];
  let current = new URLSearchParams(location.search).get('variant')?.toUpperCase();
  if (!KEYS.includes(current)) current = 'A';
  const V = () => VARIANTS[current];

  const switchLabel = h('span');
  const switcher = h('div', { class: 'mxp-switch' },
    h('button', { onclick: () => cycle(-1), title: 'Previous variant (←)' }, '◀'), switchLabel,
    h('button', { onclick: () => cycle(1), title: 'Next variant (→)' }, '▶'));
  root.append(switcher);

  function cycle(d) {
    V().close();
    current = KEYS[(KEYS.indexOf(current) + d + KEYS.length) % KEYS.length];
    const u = new URL(location.href);
    u.searchParams.set('variant', current);
    history.replaceState(history.state, '', u);
    refresh();
  }

  const statePre = h('pre');
  const stateEl = h('div', { class: 'mxp-panel mxp-state' },
    h('div', { class: 'mxp-row' },
      h('b', { class: 'mxp-grow' }, 'PROTOTYPE state (in memory)'),
      h('button', { onclick: () => stateEl.classList.toggle('mxp-collapsed') }, '▾')),
    h('div', { class: 'mxp-simrow' },
      h('div', {}, toggle('Simulate: viewer has Moxfield Price OFF', sim.viewerPriceOff, (v) => { sim.viewerPriceOff = v; refresh(); })),
      h('div', {}, toggle('Price bars on (global)', store.global.priceBars.on, (v) => { store.global.priceBars.on = v; refresh(); })),
      h('div', {}, toggle('Section odds on (global, also Alt+O)', store.global.odds.on, (v) => { store.global.odds.on = v; refresh(); }))),
    statePre);
  root.append(stateEl);

  function renderState() {
    const lib = libraryStub();
    statePre.textContent = JSON.stringify({
      variant: current,
      groupBy: groupBy(),
      viewerPriceOn: viewerPriceOn(),
      library: lib,
      store,
      sectionsNow: mainboardSections().map((s) => `${s.name} (${s.count}) → ${oddsFor(s).full}`),
    }, null, 1);
    stateEl.querySelectorAll('.mxp-simrow input')[1].checked = store.global.priceBars.on;
    stateEl.querySelectorAll('.mxp-simrow input')[2].checked = store.global.odds.on;
  }

  function refresh() {
    switchLabel.textContent = `${current} — ${V().label}`;
    renderBadge();
    renderChips();
    V().rerender();
    renderState();
  }

  // ---------- shared control groups ----------

  function priceControls(target) {
    const disabled = !viewerPriceOn();
    const pb = target.priceBars;
    return h('div', {},
      disabled ? h('div', { class: 'mxp-warn' }, 'Turn on Price in Moxfield\'s View options to use price bars.') : null,
      h('div', { class: 'mxp-row' }, toggle('Price bars', pb.on, (v) => { pb.on = v; refresh(); }, disabled)),
      h('div', { class: `mxp-row${disabled ? ' mxp-disabled' : ''}` }, h('span', { class: 'mxp-grow' }, 'Share of'),
        h('span', { class: 'mxp-seg' },
          h('button', { class: pb.mode === 'section' ? 'mxp-on' : '', disabled, onclick: () => { pb.mode = 'section'; refresh(); } }, 'Section'),
          h('button', { class: pb.mode === 'deck' ? 'mxp-on' : '', disabled, onclick: () => { pb.mode = 'deck'; refresh(); } }, 'Deck'))),
      h('div', { class: `mxp-row${disabled || pb.mode !== 'deck' ? ' mxp-disabled' : ''}` },
        h('span', { class: 'mxp-grow' }, 'Budget goal $'),
        h('input', { type: 'number', min: 0, placeholder: 'deck cost', value: target.budget ?? '', disabled: disabled || pb.mode !== 'deck',
          onchange: (e) => { target.budget = e.target.value ? parseFloat(e.target.value) : null; refresh(); } })),
      pb.mode !== 'deck' ? h('div', { class: 'mxp-muted' }, 'Budget only applies to Deck share.') : null);
  }

  // ---------- Variant A: minimal change, modal with Save/Cancel ----------

  VARIANTS.A = (() => {
    let backdrop = null;
    let draft = null; // edits are staged, applied on Save
    function open() {
      draft = {
        priceBars: { ...store.global.priceBars },
        oddsOn: store.global.odds.on,
        budget: deck().budget, turns: deck().turns, desired: deck().desired,
        overrides: { ...overridesHere() },
      };
      backdrop = h('div', { class: 'mxp-backdrop', onclick: (e) => e.target === backdrop && close() });
      root.append(backdrop);
      draw();
    }
    function draw() {
      if (!backdrop) return;
      const secs = mainboardSections();
      const N = libraryStub().size;
      const modal = h('div', { class: 'mxp-panel mxp-modal' },
        h('h3', {}, 'Moxfield Extended — this deck'),
        h('div', { class: 'mxp-cols' },
          h('fieldset', {}, h('legend', {}, 'Price bars'), priceControls(draft)),
          h('fieldset', {}, h('legend', {}, 'Section odds'),
            h('div', { class: 'mxp-row' }, toggle('Show Section odds', draft.oddsOn, (v) => { draft.oddsOn = v; draw(); })),
            h('div', { class: 'mxp-row' }, h('span', { class: 'mxp-grow' }, 'Turns to look through'),
              h('input', { type: 'number', min: 0, max: 20, value: draft.turns, onchange: (e) => { draft.turns = +e.target.value; draw(); } })),
            h('div', { class: 'mxp-muted' }, `T0 = opening hand. ${7 + draft.turns} cards seen.`),
            h('div', { class: 'mxp-row' }, h('span', { class: 'mxp-grow' }, 'Default desired (at least)'),
              h('input', { type: 'number', min: 0, max: 20, value: draft.desired, onchange: (e) => { draft.desired = +e.target.value; draw(); } })))),
        h('h4', {}, `Per-Section desired — Group by: ${groupBy()}`),
        h('div', { class: 'mxp-table' },
          h('table', {},
            h('tr', {}, h('th', {}, 'Section'), h('th', {}, 'Cards'), h('th', {}, 'At least'), h('th', {}, 'Odds')),
            secs.map((s) => {
              const k = draft.overrides[s.name] ?? draft.desired;
              const p = pAtLeast(N, s.count, 7 + draft.turns, k);
              return h('tr', {},
                h('td', {}, s.name), h('td', {}, s.count),
                h('td', {}, h('input', { type: 'number', min: 0, placeholder: String(draft.desired), value: draft.overrides[s.name] ?? '',
                  onchange: (e) => { if (e.target.value === '') delete draft.overrides[s.name]; else draft.overrides[s.name] = +e.target.value; draw(); } })),
                h('td', {}, `${Math.round(p * 100)}%`));
            }))),
        h('div', { class: 'mxp-muted' }, 'Blank = use the default. Overrides are remembered per Group-by mode.'),
        h('div', { class: 'mxp-foot' },
          h('button', { onclick: () => { draft.overrides = {}; draw(); } }, 'Clear overrides'),
          h('span', { style: 'flex:1' }),
          h('button', { onclick: close }, 'Cancel'),
          h('button', { class: 'mxp-primary', onclick: save }, 'Save')));
      backdrop.replaceChildren(modal);
    }
    function save() {
      store.global.priceBars = draft.priceBars;
      store.global.odds.on = draft.oddsOn;
      Object.assign(deck(), { budget: draft.budget, turns: draft.turns, desired: draft.desired });
      deck().overrides[groupBy()] = draft.overrides;
      if (!Object.keys(draft.overrides).length) delete deck().overrides[groupBy()];
      close();
    }
    function close() { backdrop?.remove(); backdrop = null; refresh(); }
    return {
      label: 'Minimal: L-click = cycle price mode (as today), R-click = settings modal, Save/Cancel',
      badgeClick: () => { const pb = store.global.priceBars; pb.mode = pb.mode === 'deck' ? 'section' : 'deck'; refresh(); },
      badgeContext: (e) => { e.preventDefault(); open(); },
      rerender: draw, // redraws from the staged draft; nothing is applied until Save
      close: () => { backdrop?.remove(); backdrop = null; },
      escape: () => backdrop && close(),
    };
  })();

  // ---------- Variant B: badge popover + inline header chips ----------

  VARIANTS.B = (() => {
    let pop = null;
    let mini = null; // { el, name }
    let hovered = null;
    function anchorBelow(el, rect) {
      el.style.top = `${rect.bottom + 6}px`;
      el.style.right = `${Math.max(8, innerWidth - rect.right)}px`;
    }
    function drawPop() {
      if (!pop) return;
      pop.replaceChildren(
        h('h4', { style: 'margin-top:0' }, 'Price bars'), priceControls({ priceBars: store.global.priceBars, get budget() { return deck().budget; }, set budget(v) { deck().budget = v; } }),
        h('h4', {}, 'Section odds'),
        h('div', { class: 'mxp-row' }, toggle('Show', store.global.odds.on, (v) => { store.global.odds.on = v; refresh(); })),
        h('div', { class: 'mxp-row' }, h('span', { class: 'mxp-grow' }, `By turn (${7 + deck().turns} cards)`),
          stepper(deck().turns, (v) => { deck().turns = v; refresh(); }, { max: 20 })),
        h('div', { class: 'mxp-row' }, h('span', { class: 'mxp-grow' }, 'At least (default)'),
          stepper(deck().desired, (v) => { deck().desired = v; refresh(); }, { max: 20 })),
        h('div', { class: 'mxp-muted' }, 'Per-Section: click a Section\'s % in its header, or hover a Section and press Alt+= / Alt+−.'));
    }
    function openPop() {
      closeMini();
      pop = h('div', { class: 'mxp-panel mxp-pop' });
      root.append(pop);
      anchorBelow(pop, badgeEl.getBoundingClientRect());
      drawPop();
    }
    function closePop() { pop?.remove(); pop = null; }
    function drawMini() {
      if (!mini) return;
      const s = mainboardSections().find((x) => x.name === mini.name);
      if (!s) return closeMini();
      const isOvr = s.name in overridesHere();
      mini.el.replaceChildren(
        h('div', { class: 'mxp-row', style: 'margin:0' }, h('b', { class: 'mxp-grow' }, s.name), h('span', { class: 'mxp-muted' }, `${s.count} cards`)),
        h('div', { class: 'mxp-row' }, 'At least', stepper(desiredFor(s.name), (v) => { setOverride(s.name, v); refresh(); }, { max: s.count, dim: !isOvr }),
          h('span', { class: 'mxp-muted' }, `by T${deck().turns}`)),
        h('div', { class: 'mxp-row', style: 'margin-bottom:0' }, h('b', {}, oddsFor(s).full),
          isOvr ? h('button', { style: 'margin-left:auto;background:none;border:0;color:#93c5fd', onclick: () => { setOverride(s.name, null); refresh(); } }, `reset to ${deck().desired}`) : null));
    }
    function openMini(chip, name) {
      closePop(); closeMini();
      mini = { el: h('div', { class: 'mxp-panel mxp-pop mxp-mini' }), name };
      root.append(mini.el);
      anchorBelow(mini.el, chip.getBoundingClientRect());
      drawMini();
    }
    function closeMini() { mini?.el.remove(); mini = null; }
    function onDocClick(e) {
      if (current !== 'B') return;
      if (pop && !pop.contains(e.target) && !badgeEl?.contains(e.target)) closePop();
      if (mini && !mini.el.contains(e.target) && !e.target.classList?.contains('mxp-chip')) closeMini();
    }
    function onOver(e) {
      const ul = e.target.closest?.('section.deckview article > ul');
      hovered = ul?.querySelector(':scope > li:first-child span[title]')?.getAttribute('title') || null;
    }
    document.addEventListener('mousedown', onDocClick, true);
    document.addEventListener('mouseover', onOver, true);
    return {
      label: 'Popover + inline: L-click price = Section/Deck/Off, L-click odds = on/off, R-click = popover, click a % chip to override',
      badgeClick: (e) => {
        const seg = e.target.closest('[data-seg]')?.dataset.seg;
        const pb = store.global.priceBars;
        if (seg === 'price' && viewerPriceOn()) {
          if (!pb.on) Object.assign(pb, { on: true, mode: 'section' });
          else if (pb.mode === 'section') pb.mode = 'deck';
          else pb.on = false;
        } else if (seg === 'odds') store.global.odds.on = !store.global.odds.on;
        refresh();
      },
      badgeContext: (e) => { e.preventDefault(); pop ? closePop() : openPop(); },
      chipClick: (e, name) => { e.stopPropagation(); e.preventDefault(); mini?.name === name ? closeMini() : openMini(e.currentTarget, name); },
      rerender: () => { drawPop(); drawMini(); },
      close: () => { closePop(); closeMini(); },
      escape: () => { closePop(); closeMini(); },
      key: (e) => {
        if (!e.altKey || !hovered || !store.global.odds.on) return false;
        const s = mainboardSections().find((x) => x.name === hovered);
        if (!s) return false;
        if (e.key === '=' || e.key === '+') setOverride(s.name, desiredFor(s.name) + 1);
        else if (e.key === '-') setOverride(s.name, desiredFor(s.name) - 1);
        else return false;
        refresh();
        return true;
      },
      destroy: () => { document.removeEventListener('mousedown', onDocClick, true); document.removeEventListener('mouseover', onOver, true); },
    };
  })();

  // ---------- Variant C: drawer dashboard ----------

  VARIANTS.C = (() => {
    let drawer = null;
    let tab = 'odds';
    function draw() {
      if (!drawer) return;
      const secs = mainboardSections();
      const body = tab === 'odds'
        ? h('div', {},
          h('div', { class: 'mxp-row' }, toggle('Show Section odds in headers', store.global.odds.on, (v) => { store.global.odds.on = v; refresh(); })),
          h('div', { class: 'mxp-row' }, h('b', { class: 'mxp-grow' }, `By turn ${deck().turns}`), h('span', { class: 'mxp-muted' }, `${7 + deck().turns} cards seen`)),
          h('input', { type: 'range', min: 0, max: 10, value: deck().turns, oninput: (e) => { deck().turns = +e.target.value; refresh(); } }),
          h('div', { class: 'mxp-row' }, h('span', { class: 'mxp-grow' }, 'Default: at least'), stepper(deck().desired, (v) => { deck().desired = v; refresh(); }, { max: 20 })),
          h('h4', {}, `Sections — Group by: ${groupBy()}`),
          secs.map((s) => {
            const o = oddsFor(s);
            const isOvr = s.name in overridesHere();
            return h('div', { class: `mxp-srow${isOvr ? ' mxp-ovrrow' : ''}`, title: o.full },
              h('span', { class: 'mxp-name' }, `${s.name} (${s.count})`),
              h('span', { class: 'mxp-bar' }, h('i', { style: `width:${o.p * 100}%` })),
              h('b', {}, o.pct),
              stepper(o.k, (v) => { setOverride(s.name, v); refresh(); }, { max: s.count, dim: !isOvr }));
          }),
          h('div', { class: 'mxp-muted', style: 'margin-top:8px' }, '• = overridden for this Group-by mode. Grey number = using the default.'),
          Object.keys(overridesHere()).length
            ? h('button', { style: 'margin-top:8px;background:#2a2a2a;border:1px solid #555;border-radius:4px;padding:4px 10px', onclick: () => { delete deck().overrides[groupBy()]; refresh(); } }, 'Clear overrides')
            : null)
        : priceControls({ priceBars: store.global.priceBars, get budget() { return deck().budget; }, set budget(v) { deck().budget = v; } });
      drawer.replaceChildren(
        h('div', { class: 'mxp-dhead' },
          h('div', { class: 'mxp-row' }, h('h3', { class: 'mxp-grow', style: 'margin:0' }, 'Moxfield Extended'), h('button', { style: 'background:none;border:0;font-size:18px', onclick: close }, '×')),
          h('div', { class: 'mxp-tabs' },
            h('button', { class: tab === 'odds' ? 'mxp-on' : '', onclick: () => { tab = 'odds'; draw(); } }, 'Section odds'),
            h('button', { class: tab === 'price' ? 'mxp-on' : '', onclick: () => { tab = 'price'; draw(); } }, 'Price bars'))),
        h('div', { class: 'mxp-dbody' }, body));
    }
    function open() {
      drawer = h('div', { class: 'mxp-panel mxp-drawer' });
      root.append(drawer);
      draw();
      requestAnimationFrame(() => drawer.classList.add('mxp-open'));
    }
    function close() { drawer?.remove(); drawer = null; }
    return {
      label: 'Drawer dashboard: L-click = toggle drawer (live, all Sections), R-click = browser menu',
      badgeClick: () => (drawer ? close() : open()),
      badgeContext: () => {},
      rerender: draw,
      close,
      escape: close,
    };
  })();

  // ---------- keys, page watching, teardown ----------

  function onKey(e) {
    const t = e.target;
    const typing = t.closest?.('input, textarea, select, [contenteditable]');
    if (e.key === 'Escape') { V().escape(); return; }
    if (e.altKey && e.code === 'KeyO' && !e.shiftKey && !e.ctrlKey) {
      e.preventDefault(); e.stopPropagation();
      store.global.odds.on = !store.global.odds.on; refresh(); return;
    }
    if (V().key?.(e)) { e.preventDefault(); e.stopPropagation(); return; }
    if (typing || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'ArrowLeft') cycle(-1);
    if (e.key === 'ArrowRight') cycle(1);
  }
  document.addEventListener('keydown', onKey, true);

  // Moxfield re-renders headers (Group by change, edits); keep chips and open UI in sync.
  let lastSig = '';
  const timer = setInterval(() => {
    const sig = `${groupBy()}|${viewerPriceOn()}|${mainboardSections().map((s) => `${s.name}:${s.count}`).join(',')}`;
    renderChips();
    if (sig !== lastSig) { lastSig = sig; refresh(); }
  }, 700);

  window.__moxProto = {
    store,
    destroy() {
      clearInterval(timer);
      document.removeEventListener('keydown', onKey, true);
      Object.values(VARIANTS).forEach((v) => { v.close(); v.destroy?.(); });
      document.querySelectorAll('.mxp-chip').forEach((c) => c.remove());
      root.remove(); styleEl.remove();
    },
  };

  refresh();
  console.log('[Moxfield Extended] PROTOTYPE settings UI loaded — variant', current);
})();
