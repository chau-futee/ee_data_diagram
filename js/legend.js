/* =============================================================================
   legend.js — the swatch row shared by every view.

   Built from sysOrder (order) + COL (swatch) + NAME (text), so adding a system
   to sysOrder in config.js adds it to the legend automatically.

   Every system reads the same: one solid swatch, full strength. The legend is a
   key to the colours, not a data-availability indicator — an empty lane says so
   in the lane itself, and on the ring, which is where the reader is looking.
   ============================================================================= */

import { sysOrder, COL, NAME, esc } from './config.js';

export function drawLegend() {
  document.getElementById('legend').innerHTML = sysOrder.map(sys =>
    `<span><i class="dot" style="background:${COL[sys]}"></i>${esc(NAME[sys])}</span>`
  ).join('');
}
