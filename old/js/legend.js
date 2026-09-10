/* =============================================================================
   legend.js — the swatch row shared by every view.

   Built from sysOrder (order) + COL (swatch) + NAME (text), so adding a system
   to sysOrder in config.js adds it to the legend automatically. A system with
   no records is marked "awaiting" rather than dropped.

   Was: lines 493-501 of data_donut_concept_4_1.html.
   ============================================================================= */

import { sysOrder, COL, NAME, esc, hasData } from './config.js';

export function drawLegend(events) {
  document.getElementById('legend').innerHTML = sysOrder.map(sys => {
    const empty = !hasData(events, sys);
    return `<span class="${empty ? 'awaiting' : ''}">`
         + `<i class="dot" style="background:${COL[sys]}"></i>`
         + `${esc(NAME[sys])}</span>`;
  }).join('');
}
