/* =============================================================================
   table.js — every record behind both visuals, in one filterable list, sorted
   chronologically across all systems.

   Reads the same event objects the timeline and ring read, so it cannot drift
   out of step with them.

   EXPANDABLE ROWS. Each row carries a +/- button, and an open row is followed
   by a second row holding the detail panel — the same head and body the dock
   and the float show, built by detailPanelHTML() in detail.js. Nothing about
   the panel is written twice: this file supplies a frame and nothing else.

   The open set is keyed by e._k, the stable index initDetail() stamps on every
   event before any view draws. It survives a filter change: a row filtered out
   of view and then back comes back open, because the reader never closed it.

   Was: lines 603-684 of data_donut_concept_4_1.html.
   ============================================================================= */

import {
  sysOrder, COL, NAME, SHORT, months, year, SPAN, firstYear,
  absMonth, monthLabel, esc, eventName
} from './config.js';
import { detailPanelHTML, refLinkHTML } from './detail.js';

/* Sentinel for the "not set" option. Must survive being written into an HTML
   attribute — a U+0000 does not; the parser rewrites it and the option then
   matches nothing. */
const NOTSET = '__notset__';

/* Columns a row spans, for the empty state and the panel row. */
const COLS = 6;

export function drawTable(events) {
  const rows = [...events].sort((a, b) => absMonth(a) - absMonth(b));
  const open = new Set();          // _k of every expanded row

  /* ---- filter controls ---- */
  const sysWithData = sysOrder.filter(s => events.some(e => e.sys === s));
  const typeVals = [...new Set(events.map(e => e.eventType).filter(Boolean))].sort();
  const freqVals = [...new Set(events.map(e => e.freq).filter(Boolean))].sort();

  document.getElementById('tblFilters').innerHTML =
     `<label>System <select id="fSys"></select></label>`
   + `<label>Type <select id="fType"></select></label>`
   + `<label>From <button type="button" id="fFrom" class="mpick"
        aria-haspopup="dialog" aria-expanded="false"></button></label>`
   + `<label>To <button type="button" id="fTo" class="mpick"
        aria-haspopup="dialog" aria-expanded="false"></button></label>`
   + `<label>Frequency
        <select id="fFreq"${freqVals.length ? '' : ' disabled title="No frequency data in the dataset yet"'}>
          <option value="">Awaiting data</option>
        </select></label>`
   + `<label class="grow">Milestone
        <input id="fText" type="search" placeholder="search milestone text…" autocomplete="off">
      </label>`
   + `<button type="button" id="fClear" class="clearbtn">Clear</button>`;

  const fSys  = document.getElementById('fSys'),
        fFrom = document.getElementById('fFrom'),
        fTo   = document.getElementById('fTo'),
        fText = document.getElementById('fText'),
        fFreq = document.getElementById('fFreq'),
        fType = document.getElementById('fType'),
        fClear = document.getElementById('fClear'),
        table  = document.getElementById('dataTable');

  /* ---- From / To month calendars ---------------------------------------------
     Each box is a button that opens a small calendar: a year with ◀ ▶ and its
     twelve months. One click picks a month and closes it. Months outside the
     window, and months that would put From after To, are greyed out, so the
     range can never be backwards. The full window is always offered; these two
     do not narrow (they do narrow System, Type and Frequency).

     range[0] is From and range[1] is To, as month indices into the window
     (0 = Jan of firstYear), the same numbers absMonth() returns. */

  const range = [0, SPAN - 1];
  const pickers = [fFrom, fTo];
  const CAL_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" '
    + 'stroke="currentColor" stroke-width="2" stroke-linecap="round" '
    + 'stroke-linejoin="round" aria-hidden="true" focusable="false">'
    + '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>';
  let cal = null;                  // { h, el, viewYear } while a calendar is open

  function paintPickers() {
    pickers.forEach((b, h) => {
      b.innerHTML = `<span>${monthLabel(range[h])}</span>${CAL_SVG}`;
      b.setAttribute('aria-label', `${h ? 'To' : 'From'}: ${monthLabel(range[h])}. Choose month`);
    });
  }

  function monthDisabled(h, i) {
    return i < 0 || i >= SPAN || (h === 0 ? i > range[1] : i < range[0]);
  }

  function drawCal() {
    const { h, el, viewYear } = cal;
    const y0 = viewYear - firstYear;
    el.innerHTML =
        `<div class="mcal-head">`
      + `<button type="button" class="mcal-nav" data-nav="-1" aria-label="Previous year"`
      +   `${viewYear <= firstYear ? ' disabled' : ''}>\u25C0</button>`
      + `<b>${viewYear}</b>`
      + `<button type="button" class="mcal-nav" data-nav="1" aria-label="Next year"`
      +   `${viewYear >= year[year.length - 1] ? ' disabled' : ''}>\u25B6</button>`
      + `</div><div class="mcal-grid">`
      + months.map((m, mi) => {
          const i = y0 * 12 + mi;
          const cls = i === range[h] ? 'on' : (i > range[0] && i < range[1] ? 'inr' : '');
          return `<button type="button" data-i="${i}" class="${cls}"`
            + ` aria-label="${m} ${viewYear}"${i === range[h] ? ' aria-pressed="true"' : ''}`
            + `${monthDisabled(h, i) ? ' disabled' : ''}>${m}</button>`;
        }).join('')
      + `</div>`;
  }

  function closeCal(refocus) {
    if (!cal) return;
    const b = pickers[cal.h];
    cal.el.remove();
    b.setAttribute('aria-expanded', 'false');
    cal = null;
    if (refocus) b.focus();
  }

  function openCal(h) {
    closeCal(false);
    const b = pickers[h];
    const el = document.createElement('div');
    el.className = 'mcal';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', h ? 'Choose To month' : 'Choose From month');
    /* Placed in the filter bar (position:relative in the stylesheet), under
       its button, and kept inside the bar's right edge. */
    const bar = document.getElementById('tblFilters');
    bar.appendChild(el);
    cal = { h, el, viewYear: firstYear + Math.floor(range[h] / 12) };
    drawCal();
    const br = b.getBoundingClientRect(), pr = bar.getBoundingClientRect();
    el.style.top = `${br.bottom - pr.top + 4}px`;
    el.style.left = `${Math.max(0, Math.min(br.left - pr.left, pr.width - el.offsetWidth))}px`;
    b.setAttribute('aria-expanded', 'true');
    (el.querySelector('.mcal-grid button.on') || el.querySelector('.mcal-grid button:not(:disabled)'))?.focus();

    el.addEventListener('click', ev => {
      const nav = ev.target.closest('[data-nav]');
      if (nav) { cal.viewYear += +nav.dataset.nav; drawCal(); el.querySelector(`[data-nav="${nav.dataset.nav}"]`).focus(); return; }
      const m = ev.target.closest('button[data-i]');
      if (!m || m.disabled) return;
      range[cal.h] = +m.dataset.i;
      paintPickers();
      closeCal(true);
      render();
    });
    /* Arrow keys move between months in the grid; Esc closes. */
    el.addEventListener('keydown', ev => {
      if (ev.key === 'Escape') { ev.preventDefault(); closeCal(true); return; }
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -4, ArrowDown: 4 }[ev.key];
      const cur = ev.target.closest('.mcal-grid button');
      if (!step || !cur) return;
      ev.preventDefault();
      const all = [...el.querySelectorAll('.mcal-grid button')];
      let j = all.indexOf(cur) + step;
      while (j >= 0 && j < all.length && all[j].disabled) j += step;
      if (j >= 0 && j < all.length) all[j].focus();
    });
  }

  pickers.forEach((b, h) =>
    b.addEventListener('click', () => (cal && cal.h === h ? closeCal(true) : openCal(h))));
  /* A press anywhere outside the open calendar and its button closes it. */
  document.addEventListener('pointerdown', ev => {
    if (cal && !cal.el.contains(ev.target) && !pickers[cal.h].contains(ev.target)) closeCal(false);
  });
  paintPickers();

  /* ---- faceted dropdowns ------------------------------------------------------
     System, Type and Frequency each list only the values that still have
     matching milestones under EVERY OTHER filter (the other two dropdowns,
     From/To, and the search text), with a count on each. A dropdown ignores
     its own selection when counting, so the reader can always switch within
     it. Values with no matches are hidden; the one exception is the value
     currently selected, which stays (showing 0) so the dropdown never jumps
     back to "All" without the reader choosing it. From/To keep the full range.

     A blank eventType or freq is counted under NOTSET, "— not set —". */

  const FACETS = [
    { key: 'sys',  el: fSys,  all: 'All systems',
      values: sysWithData, val: e => e.sys, label: v => NAME[v] },
    { key: 'type', el: fType, all: 'All types',
      values: [...typeVals, NOTSET], val: e => e.eventType || NOTSET, label: v => v },
    { key: 'freq', el: fFreq, all: 'All frequencies',
      values: [...freqVals, NOTSET], val: e => e.freq || NOTSET, label: v => v },
  ];

  function currentFilters() {
    return {
      sys: fSys.value, type: fType.value, freq: fFreq.value,
      from: range[0], to: range[1],
      q: fText.value.trim().toLowerCase()
    };
  }

  /* Does e pass every filter in f, except the one named by skip? */
  function passes(e, f, skip) {
    for (const fc of FACETS) {
      if (fc.key !== skip && f[fc.key] && fc.val(e) !== f[fc.key]) return false;
    }
    const mi = absMonth(e);
    if (mi < Math.min(f.from, f.to) || mi > Math.max(f.from, f.to)) return false;
    /* Searches the DISPLAYED name, so typing "2028" finds every record whose
       program year is 2028 as well as any title containing the digits. */
    if (f.q && !eventName(e).toLowerCase().includes(f.q)) return false;
    return true;
  }

  function refreshOptions(f) {
    for (const fc of FACETS) {
      if (fc.el.disabled) continue;          // Frequency with no data at all
      const base = rows.filter(e => passes(e, f, fc.key));
      const counts = new Map();
      for (const e of base) counts.set(fc.val(e), (counts.get(fc.val(e)) || 0) + 1);
      const cur = f[fc.key];
      const opts = fc.values.filter(v => counts.has(v) || v === cur);
      fc.el.innerHTML = `<option value="">${fc.all} (${base.length})</option>`
        + opts.map(v => `<option value="${esc(v)}">`
            + `${esc(v === NOTSET ? '— not set —' : fc.label(v))} (${counts.get(v) || 0})</option>`).join('');
      fc.el.value = cur;
    }
  }

  /* ---- one row, and the panel under it when it is open ----------------------
     The button says what it will do, not what it is: a reader with a screen
     reader hears "Show detail for ..." rather than "plus". */

  function rowHTML(e) {
    const k = e._k;
    const isOpen = open.has(k);
    const name = eventName(e);
    const label = `${isOpen ? 'Hide' : 'Show'} detail for ${esc(name)}`;
    const main = `<tr class="${isOpen ? 'open' : ''}" data-k="${k}">
        <td class="exp"><button type="button" class="expbtn" data-act="toggle" data-k="${k}"
          aria-expanded="${isOpen}" aria-label="${label}" title="${label}"
          >${isOpen ? '\u2212' : '+'}</button></td>
        <td class="sysc"><i class="sysdot" style="background:${COL[e.sys]}"></i>${esc(SHORT[e.sys])}</td>
        <td>${e.eventType ? esc(e.eventType) : ''}</td>
        <td>${esc(name)}${refLinkHTML(e)}</td>
        <td class="dline">${monthLabel(absMonth(e))}</td>
        <td class="num">${e.freq ? esc(e.freq) : ''}</td>
      </tr>`;
    if (!isOpen) return main;
    /* --sys is read by .dt-inrow in the stylesheet, which cannot look COL up
       itself. Same handover the dock and the float get from accent(). */
    return main + `<tr class="detrow" data-k="${k}">
        <td colspan="${COLS}"><div class="dt-inrow" style="--sys:${COL[e.sys]}"
          >${detailPanelHTML(e)}</div></td>
      </tr>`;
  }

  function render() {
    const f = currentFilters();
    refreshOptions(f);
    const shown = rows.filter(e => passes(e, f, null));

    table.innerHTML =
      `<thead><tr>
         <th class="exp"><span class="vh">Detail</span></th>
         <th>System</th><th>Type</th><th>Milestone</th><th>Deadline</th><th>Frequency</th>
       </tr></thead><tbody>${
        shown.length
        ? shown.map(rowHTML).join('')
        : `<tr><td colspan="${COLS}" class="empties">No milestones match these filters.</td></tr>`
      }</tbody>`;

    const filtered = shown.length !== rows.length;
    document.getElementById('tblCount').textContent = filtered
      ? `Showing ${shown.length} of ${rows.length} milestones.`
      : `${rows.length} milestones across ${sysWithData.length} of ${sysOrder.length} systems. `
        + `Earliest ${monthLabel(absMonth(rows[0]))}, `
        + `latest ${monthLabel(absMonth(rows[rows.length - 1]))}, `
        + `within a window of ${months[0]} ${year[0]} – ${months[11]} ${year[year.length - 1]}.`;
    fClear.disabled = !filtered && !fText.value;
  }

  [fSys, fType, fFreq].forEach(el => el.addEventListener('change', render));
  fText.addEventListener('input', render);
  fClear.addEventListener('click', () => {
    fSys.value = ''; fType.value = ''; range[0] = 0; range[1] = SPAN - 1;
    closeCal(false); paintPickers();
    fFreq.value = ''; fText.value = '';
    render();
  });

  /* One listener on the table, not one per button: render() replaces the whole
     body on every keystroke in the search box, and handlers bound to the old
     buttons would go with it. drawTable() is called once, from main.js. */
  table.addEventListener('click', ev => {
    const b = ev.target.closest('button');
    if (!b) return;
    /* The panel's own close button is the dock's, markup and all. In this
       container it means "collapse the row this panel belongs to". */
    const k = b.dataset.act === 'toggle'
      ? +b.dataset.k
      : (b.dataset.act === 'close' && b.closest('tr.detrow')
          ? +b.closest('tr.detrow').dataset.k
          : null);
    if (k === null || Number.isNaN(k)) return;
    if (open.has(k)) open.delete(k); else open.add(k);
    render();
  });

  render();
}
