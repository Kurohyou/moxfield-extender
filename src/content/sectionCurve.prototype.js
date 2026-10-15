/*
 * PROTOTYPE — throwaway. Never ship. Lives on branch `prototype/section-curve`.
 *
 * Question: what should a per-Section mana curve look like, and where does it
 * sit in the Section header next to the header price and the Section odds chip?
 *
 * Four variants on a live Moxfield deck page, switchable with the floating bar
 * at the bottom (or ← / →):
 *   A  Inline sparkline   — tiny unlabelled bars right-aligned, just before the odds chip
 *   B  Labelled mini chart — taller bars with cost labels, right of the odds chip
 *   C  Strip below header  — a second line of cost cells with counts (heat-shaded)
 *   D  Watermark           — faint bars drawn behind the whole header row
 *
 * Run: paste this whole file into DevTools on https://moxfield.com/decks/<id>.
 * Assumptions baked in (to be decided, not settled): lands excluded, buckets
 * 0–6 then 7+, quantities counted, X = 0, mainboard Sections only.
 * The header price is FAKED when the viewer has Moxfield's Price off.
 * The odds chip uses real maths: ≥1 by T3 (10 cards seen) from the footer Library.
 */
(() => {
  const ID = 'mxe-curve-proto';
  document.querySelectorAll(`.${ID}`).forEach((el) => el.remove());
  window.__mxeCurveProto?.observer?.disconnect();

  const VARIANTS = [
    ['A', 'Inline sparkline'],
    ['B', 'Labelled mini chart'],
    ['C', 'Strip below header'],
    ['D', 'Watermark behind header'],
  ];
  const state = { variant: new URLSearchParams(location.search).get('variant') || 'A' };
  const BUCKETS = ['0', '1', '2', '3', '4', '5', '6', '7+'];
  const EXCLUDED_SECTIONS = ['Commander', 'Sideboard'];

  // --- data -----------------------------------------------------------------
  const manaValue = (costEl) => {
    let mv = 0;
    costEl?.querySelectorAll('.mana').forEach((m) => {
      const c = [...m.classList].find((k) => /^mana-/.test(k) && !['mana-cost', 'mana-shadow'].includes(k));
      if (!c) return;
      const sym = c.slice(5);
      if (/^\d+$/.test(sym)) mv += Number(sym);
      else if (/^[xyz]$/.test(sym)) mv += 0;
      else if (/^2[wubrg]$/.test(sym)) mv += 2; // {2/W}
      else mv += 1; // coloured, colourless, snow, hybrid, phyrexian
    });
    return mv;
  };
  const qtyOf = (row) => {
    const input = row.querySelector('input');
    if (input) return Number(input.value) || 0;
    return Number(row.firstElementChild?.textContent.trim()) || 0;
  };
  const isLand = (row, sectionName) =>
    sectionName === 'Lands' || !row.querySelector('div.text-nowrap.text-end .mana');

  const libraryInfo = () => {
    const footer = [...document.querySelectorAll('div')].find((d) => /^\s*\d+\s+main deck\s*$/.test(d.textContent));
    const main = footer ? Number(footer.textContent.match(/\d+/)[0]) : NaN;
    const cmdHeader = document.querySelector('section.deckview article span[title="Commander"]');
    const cmd = cmdHeader ? Number(cmdHeader.nextElementSibling?.textContent.match(/\d+/)?.[0] || 0) : 0;
    return main - cmd;
  };
  const choose = (n, k) => {
    if (k < 0 || k > n) return 0;
    let r = 1;
    for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
    return r;
  };
  const oddsAtLeastOne = (N, K, seen) => 1 - choose(N - K, seen) / choose(N, seen);

  const sections = () =>
    [...document.querySelectorAll('section.deckview article ul')]
      .map((ul) => {
        const headerLi = ul.querySelector(':scope > li:first-child');
        const link = headerLi?.querySelector('a.table-deck-row-link.fw-bold');
        const name = link?.querySelector('span[title]')?.getAttribute('title');
        if (!name || EXCLUDED_SECTIONS.includes(name)) return null;
        const count = Number(link.textContent.match(/\((\d+)\)/)?.[1] || 0);
        const curve = BUCKETS.map(() => 0);
        let lands = 0;
        ul.querySelectorAll('li[data-testid="deck-view-table-row"]').forEach((row) => {
          const q = qtyOf(row);
          if (isLand(row, name)) { lands += q; return; }
          const mv = manaValue(row.querySelector('div.text-nowrap.text-end'));
          curve[Math.min(mv, 7)] += q;
        });
        return { ul, headerLi, link, name, count, curve, lands };
      })
      .filter(Boolean);

  // --- shared bits ------------------------------------------------------------
  const el = (tag, style = '', text = '') => {
    const e = document.createElement(tag);
    e.className = ID;
    e.style.cssText = style;
    if (text) e.textContent = text;
    return e;
  };
  const tooltip = (s) => {
    const nonLand = s.curve.reduce((a, b) => a + b, 0);
    const avg = nonLand ? s.curve.reduce((a, n, i) => a + n * i, 0) / nonLand : 0;
    const parts = BUCKETS.map((b, i) => `${b}: ${s.curve[i]}`).join('  ·  ');
    return `${s.name} curve\n${parts}\nAvg MV ${avg.toFixed(2)}${s.lands ? `  ·  ${s.lands} land(s) not shown` : ''}`;
  };
  const fakePrice = (s) => {
    if (s.link.querySelector('span.text-nowrap.fw-normal.ms-1')) return;
    s.link.append(el('span', 'font-weight:normal;margin-left:4px;opacity:.8', `– $${(s.count * 3.17).toFixed(2)}`));
  };
  const oddsChip = (s, N) =>
    el(
      'span',
      'font-weight:normal;font-size:11px;padding:0 5px;border-radius:8px;background:rgba(127,127,127,.22);white-space:nowrap;line-height:16px',
      `${Math.round(oddsAtLeastOne(N, s.count, Math.min(10, N)) * 100)}%`,
    );
  const prepHeader = (s) => {
    s.headerLi.style.display = 'flex';
    s.headerLi.style.alignItems = 'center';
    s.headerLi.style.position = 'relative';
  };
  const max = (s) => Math.max(1, ...s.curve);
  const empty = (s) => s.curve.every((n) => n === 0);

  // --- variants ---------------------------------------------------------------
  const render = {
    A(s, N) {
      const right = el('span', 'margin-left:auto;display:inline-flex;align-items:center;gap:6px;padding-left:6px');
      if (!empty(s)) {
        const spark = el('span', 'display:inline-flex;align-items:flex-end;gap:1px;height:12px');
        spark.title = tooltip(s);
        s.curve.forEach((n) =>
          spark.append(el('span', `width:3px;height:${n ? Math.max(2, (n / max(s)) * 12) : 1}px;background:currentColor;opacity:${n ? 0.75 : 0.2}`)),
        );
        right.append(spark);
      }
      right.append(oddsChip(s, N));
      s.headerLi.append(right);
    },
    B(s, N) {
      const right = el('span', 'margin-left:auto;display:inline-flex;align-items:center;gap:8px;padding-left:6px');
      right.append(oddsChip(s, N));
      if (!empty(s)) {
        const chart = el('span', 'display:inline-flex;align-items:flex-end;gap:2px;font-weight:normal');
        chart.title = tooltip(s);
        s.curve.forEach((n, i) => {
          const col = el('span', 'display:inline-flex;flex-direction:column;align-items:center;width:10px');
          col.append(el('span', `font-size:8px;line-height:9px;opacity:${n ? 0.9 : 0}`, String(n)));
          col.append(el('span', `width:7px;height:${n ? Math.max(2, (n / max(s)) * 18) : 1}px;background:currentColor;opacity:${n ? 0.7 : 0.2}`));
          col.append(el('span', 'font-size:8px;line-height:9px;opacity:.6', BUCKETS[i]));
          chart.append(col);
        });
        right.append(chart);
      }
      s.headerLi.append(right);
    },
    C(s, N) {
      const right = el('span', 'margin-left:auto;padding-left:6px');
      right.append(oddsChip(s, N));
      s.headerLi.append(right);
      if (empty(s)) return;
      const strip = el('li', 'display:flex;gap:2px;list-style:none;margin:2px 0 4px;font-size:10px;font-weight:normal');
      strip.title = tooltip(s);
      s.curve.forEach((n, i) => {
        const cell = el(
          'span',
          `flex:1;display:flex;justify-content:space-between;padding:0 4px;border-radius:3px;background:rgba(127,127,127,${n ? 0.12 + 0.5 * (n / max(s)) : 0.05})`,
        );
        cell.append(el('span', 'opacity:.6', BUCKETS[i]), el('span', `font-weight:${n ? 600 : 400};opacity:${n ? 1 : 0.35}`, String(n)));
        strip.append(cell);
      });
      s.headerLi.after(strip);
    },
    D(s, N) {
      const right = el('span', 'margin-left:auto;padding-left:6px;position:relative;z-index:1');
      right.append(oddsChip(s, N));
      s.headerLi.append(right);
      if (empty(s)) return;
      s.link.style.position = 'relative';
      s.link.style.zIndex = '1';
      const bg = el('span', 'position:absolute;inset:0;display:flex;align-items:flex-end;gap:2px;pointer-events:none;z-index:0');
      s.curve.forEach((n) => bg.append(el('span', `flex:1;height:${(n / max(s)) * 100}%;background:currentColor;opacity:.22;border-radius:2px 2px 0 0`)));
      s.headerLi.append(bg);
      s.headerLi.title = tooltip(s);
    },
  };

  // --- switcher -----------------------------------------------------------------
  const bar = el(
    'div',
    'position:fixed;left:50%;bottom:70px;transform:translateX(-50%);z-index:99999;display:flex;align-items:center;gap:10px;padding:6px 14px;border-radius:999px;background:#ffd400;color:#111;font:600 13px system-ui;box-shadow:0 4px 14px rgba(0,0,0,.4)',
  );
  const label = el('span');
  const step = (d) => {
    const i = VARIANTS.findIndex(([k]) => k === state.variant);
    state.variant = VARIANTS[(i + d + VARIANTS.length) % VARIANTS.length][0];
    const url = new URL(location.href);
    url.searchParams.set('variant', state.variant);
    history.replaceState(history.state, '', url);
    draw();
  };
  const btn = (txt, d) => {
    const b = el('button', 'border:0;background:#111;color:#ffd400;border-radius:50%;width:24px;height:24px;cursor:pointer', txt);
    b.onclick = () => step(d);
    return b;
  };
  bar.append(btn('←', -1), label, btn('→', 1));
  document.body.append(bar);
  document.addEventListener('keydown', (e) => {
    if (e.target.closest?.('input,textarea,[contenteditable]')) return;
    if (e.key === 'ArrowLeft') step(-1);
    if (e.key === 'ArrowRight') step(1);
  });

  // --- draw + keep alive through React re-renders ---------------------------------
  let drawing = false;
  function draw() {
    drawing = true;
    document.querySelectorAll(`.${ID}`).forEach((e) => { if (!bar.contains(e)) e.remove(); });
    const N = libraryInfo();
    const all = sections();
    all.forEach((s) => {
      prepHeader(s);
      fakePrice(s);
      render[state.variant](s, N);
    });
    label.textContent = `PROTOTYPE ${state.variant} (${VARIANTS.find(([k]) => k === state.variant)[1]}) · Library ${N}`;
    console.table(all.map((s) => ({ section: s.name, count: s.count, ...Object.fromEntries(BUCKETS.map((b, i) => [b, s.curve[i]])), lands: s.lands })));
    setTimeout(() => (drawing = false), 0);
  }
  let t;
  const observer = new MutationObserver(() => {
    if (drawing) return;
    clearTimeout(t);
    t = setTimeout(draw, 300);
  });
  observer.observe(document.querySelector('section.deckview') || document.body, { childList: true, subtree: true });
  window.__mxeCurveProto = { observer };
  draw();
})();
