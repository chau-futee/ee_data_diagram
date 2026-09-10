/* =============================================================================
   legend.js — the swatch row shared by every view.

   Built from sysOrder (order) + COL (swatch) + NAME (text), so adding a system
   to sysOrder in config.js adds it to the legend automatically.

   Three states, because the time window makes "empty" ambiguous:
     normal    — has records inside the current window
     outside   — has records, but none in this window
     awaiting  — has no records anywhere in the dataset
   ============================================================================= */

import { sysOrder, COL, NAME, esc, hasData, windowLabel } from './config.js';

export function drawLegend(events, all, win) {
  document.getElementById('legend').innerHTML = sysOrder.map(sys => {
    const here = hasData(events, sys);
    const ever = hasData(all, sys);
    const cls = here ? '' : (ever ? 'outside' : 'awaiting');
    const title = here ? '' : (ever
      ? ` title="No milestones in ${esc(windowLabel(win))}"`
      : ' title="No records in the dataset yet"');
    return `<span class="${cls}"${title}>`
         + `<i class="dot" style="background:${COL[sys]}"></i>`
         + `${esc(NAME[sys])}</span>`;
  }).join('');
}
