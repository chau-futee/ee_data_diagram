/* =============================================================================
   legend.js — the key shared by every view.

   Two labelled groups on a two-column grid:

       System   [swatch] CEDARS-CET  [swatch] Avoided Cost ...  [swatch] ...
                [swatch] DEER  ...                  <- wraps under the first item
       Status   (ring) Complete  (ring) Delayed  (ring) At risk

   The label column is sized to its widest label, and each group's items wrap
   inside the second column, so a wrapped entry lines up under the first entry
   rather than under its group's label.

   Systems come from sysOrder (order) + COL (swatch) + NAME (text), so adding a
   system to sysOrder in config.js adds it here automatically. Statuses come
   from statusOrder + STATUS the same way. Null and unknown statuses draw no
   ring anywhere, so they have no key entry.

   Every system reads the same: one solid swatch, full strength. The legend is a
   key to the colours, not a data-availability indicator — an empty lane says so
   in the lane itself, and on the ring, which is where the reader is looking.
   ============================================================================= */

import { sysOrder, COL, NAME, esc, statusOrder, STATUS } from './config.js';

export function drawLegend() {
  const systems = sysOrder.map(sys =>
    `<span><i class="dot" style="background:${COL[sys]}"></i>${esc(NAME[sys])}</span>`
  ).join('');
  const statuses = statusOrder.map(k =>
    `<span><i class="ring" style="border-color:${STATUS[k].ring}"></i>${esc(STATUS[k].label)}</span>`
  ).join('');
  document.getElementById('legend').innerHTML =
      `<span class="lg-lbl">System</span><div class="lg-items">${systems}</div>`
    + `<span class="lg-lbl">Status</span><div class="lg-items">${statuses}</div>`;
}
