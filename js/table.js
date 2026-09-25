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
  sysOrder, COL, NAME, SHORT, months, year, SPAN,
  absMonth, monthLabel, esc, eventName
} from './config.js';
import { detailPanelHTML, refLinkHTML } from './detail.js';

/* Sentinel for the "not set" option. Must survive being written into an HTML
   attribute — a U+0000 does not; the parser rewrites it and the option then
   matches nothing. */
const NOTSET = '__notset__';

/* Columns a row spans, for the empty state and the panel row. */
const COLS = 5;

export function drawTable(events) {
  const rows = [...events].sort((a, b) => absMonth(a) - absMonth(b));
  const open = new Set();          // _k of every expanded row

  /* ---- filter controls ---- */
  const sysWithData = sysOrder.filter(s => events.some(e => e.sys === s));
  const freqVals = [...new Set(events.map(e => e.freq).filter(Boolean))].sort();
  const someBlank = events.some(e => !e.freq);
  const monthOpts = [...Array(SPAN)]
    .map((_, i) => `<option value="${i}">${monthLabel(i)}</option>`).join('');

  document.getElementById('tblFilters').innerHTML =
     `<label>System
        <select id="fSys"><option value="">All systems</option>
          ${sysWithData.map(s => `<option value="${s}">${esc(NAME[s])}</option>`).join('')}
        </select></label>`
   + `<label>From <select id="fFrom">${monthOpts}</select></label>`
   + `<label>To <select id="fTo">${monthOpts}</select></label>`
   + `<label>Frequency
        <select id="fFreq"${freqVals.length ? '' : ' disabled title="No frequency data in the dataset yet"'}>
          <option value="">${freqVals.length ? 'All frequencies' : 'Awaiting data'}</option>
          ${freqVals.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('')}
          ${freqVals.length && someBlank ? `<option value="${NOTSET}">— not set —</option>` : ''}
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
        fClear = document.getElementById('fClear'),
        table  = document.getElementById('dataTable');
  fFrom.value = 0;
  fTo.value = SPAN - 1;

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
    const sys = fSys.value, from = +fFrom.value, to = +fTo.value, freq = fFreq.value;
    const q = fText.value.trim().toLowerCase();
    const shown = rows.filter(e => {
      if (sys && e.sys !== sys) return false;
      const mi = absMonth(e);
      if (mi < Math.min(from, to) || mi > Math.max(from, to)) return false;
      if (freq === NOTSET ? !!e.freq : (freq && e.freq !== freq)) return false;
      /* Searches the DISPLAYED name, so typing "2028" finds every record whose
         program year is 2028 as well as any title containing the digits. */
      if (q && !eventName(e).toLowerCase().includes(q)) return false;
      return true;
    });

    table.innerHTML =
      `<thead><tr>
         <th class="exp"><span class="vh">Detail</span></th>
         <th>System</th><th>Milestone</th><th>Deadline</th><th>Frequency</th>
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

  [fSys, fFrom, fTo, fFreq].forEach(el => el.addEventListener('change', render));
  fText.addEventListener('input', render);
  fClear.addEventListener('click', () => {
    fSys.value = ''; fFrom.value = 0; fTo.value = SPAN - 1;
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
