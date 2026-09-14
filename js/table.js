/* =============================================================================
   table.js — every record behind both visuals, in one filterable list, sorted
   chronologically across all systems.

   Reads the same event objects the timeline and ring read, so it cannot drift
   out of step with them.

   Was: lines 603-684 of data_donut_concept_4_1.html.
   ============================================================================= */

import {
  sysOrder, COL, NAME, SHORT, months, year, SPAN,
  absMonth, monthLabel, esc
} from './config.js';

/* Sentinel for the "not set" option. Must survive being written into an HTML
   attribute — a U+0000 does not; the parser rewrites it and the option then
   matches nothing. */
const NOTSET = '__notset__';

export function drawTable(events) {
  const rows = [...events].sort((a, b) => absMonth(a) - absMonth(b));

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
        fClear = document.getElementById('fClear');
  fFrom.value = 0;
  fTo.value = SPAN - 1;

  function render() {
    const sys = fSys.value, from = +fFrom.value, to = +fTo.value, freq = fFreq.value;
    const q = fText.value.trim().toLowerCase();
    const shown = rows.filter(e => {
      if (sys && e.sys !== sys) return false;
      const mi = absMonth(e);
      if (mi < Math.min(from, to) || mi > Math.max(from, to)) return false;
      if (freq === NOTSET ? !!e.freq : (freq && e.freq !== freq)) return false;
      if (q && !e.t.toLowerCase().includes(q)) return false;
      return true;
    });

    document.getElementById('dataTable').innerHTML =
      `<thead><tr>
         <th>System</th><th>Milestone</th><th>Month</th><th>Frequency</th>
         <th>Reviewed by</th><th>Reviewed date</th>
       </tr></thead><tbody>${
        shown.length
        ? shown.map(e => `<tr>
            <td class="sysc"><i class="sysdot" style="background:${COL[e.sys]}"></i>${esc(SHORT[e.sys])}</td>
            <td>${esc(e.t)}</td>
            <td class="num">${monthLabel(absMonth(e))}</td>
            <td class="num">${e.freq ? esc(e.freq) : ''}</td>
            <td class="num">${e.reviewedBy ? esc(e.reviewedBy) : ''}</td>
            <td class="num">${e.reviewedOn ? esc(e.reviewedOn) : ''}</td>
            </tr>`).join('')
        : `<tr><td colspan="7" class="empties">No milestones match these filters.</td></tr>`
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

  render();
}
