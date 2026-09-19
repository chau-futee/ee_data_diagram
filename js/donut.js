/* =============================================================================
   donut.js — the cyclical view.

   The ring now shows the SELECTED WINDOW rather than a fixed 24-month cycle:

       1 year  -> 12 slots, 30 degrees each
       2 years -> 24 slots, 15 degrees each   (the look this had before)
       3 years -> 36 slots, 10 degrees each

   With two or three years the ring is partitioned: a heavier divider and a year
   label at each January.

   NO MORE FOLDING. Previously 36 months of data were folded into 24 slots with
   `% 24`, so slots 0-11 each carried two calendar months and the reader had to
   be warned about it. An explicit window makes the fold unnecessary — every
   slot is now exactly one month of one year.

   Ring position comes from the same `f` the timeline uses, so the two views
   cannot disagree about where a record sits:  ring month = f * spanMonths.
   ============================================================================= */

import {
  sysOrder, COL, NAME, SHORT, months, RING, polar, esc, hasData,
  spanMonths, degPerMonth, windowYears, windowLabel, eventName
} from './config.js';
import { showTip, hideTip } from './ui.js';
import { openDetail } from './detail.js';

export function drawDonut(events, all, win) {
  const svg = document.getElementById('donut');
  const { cx, cy, rOuter, rInner } = RING;
  const slots = spanMonths(win);
  const deg = degPerMonth(win);
  const band = (rOuter - rInner) / sysOrder.length;
  const partitioned = win.years > 1;

  let s = '';

  /* --- month spokes and labels --- */
  for (let m = 0; m < slots; m++) {
    const ang = m * deg;
    const yearStart = m % 12 === 0;
    const outer = yearStart && partitioned ? rOuter + 28 : rOuter + 6;
    const [x1, y1] = polar(cx, cy, rInner - 6, ang);
    const [x2, y2] = polar(cx, cy, outer, ang);
    s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"`
       + ` stroke="${yearStart && partitioned ? '#c8d0dd' : '#eef1f6'}"`
       + ` stroke-width="${yearStart && partitioned ? 1.75 : 1}"/>`;
    const [lx, ly] = polar(cx, cy, rOuter + 18, ang + deg / 2);
    s += `<text x="${lx}" y="${ly}" font-size="11.5" fill="#8a94a8" text-anchor="middle"`
       + ` dominant-baseline="middle">${months[m % 12]}</text>`;
  }

  /* --- year labels, one per partition --- */
  if (partitioned) {
    windowYears(win).forEach((y, k) => {
      const mid = (k * 12 + 6) * deg;                 // middle of that year's arc
      const [tx, ty] = polar(cx, cy, rOuter + 42, mid);
      s += `<text class="yrlbl" x="${tx}" y="${ty}" font-size="13" font-weight="700" fill="#42506b"`
         + ` text-anchor="middle" dominant-baseline="middle">${y}</text>`;
    });
  }

  /* --- system arcs ---
     Two different empty states. A lane with no records anywhere is awaiting
     data; a lane whose records all fall outside the chosen window is a
     different situation and says so, otherwise narrowing the window would look
     like the dataset had shrunk. */
  sysOrder.forEach((sys, i) => {
    const r = rOuter - i * band - band / 2;
    s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${COL[sys]}"`
       + ` stroke-opacity=".16" stroke-width="${band - 4}"/>`;
    if (!hasData(events, sys)) {
      const msg = hasData(all, sys)
        ? `${SHORT[sys]} — none in ${windowLabel(win)}`
        : `${SHORT[sys]} — awaiting data`;
      s += `<text x="${cx}" y="${cy - r + 3.5}" font-size="9" fill="#8a94a8"`
         + ` text-anchor="middle" font-style="italic">${esc(msg)}</text>`;
    }
  });

  /* --- centre --- */
  const centre = win.years === 1 ? `${win.startYear}` : windowLabel(win);
  s += `<circle cx="${cx}" cy="${cy}" r="${rInner - 10}" fill="#fff" stroke="#eef1f6"/>`;
  s += `<text x="${cx}" y="${cy - 8}" text-anchor="middle" font-size="15" font-weight="700"`
     + ` fill="#1f2733">EE cycle</text>`;
  s += `<text x="${cx}" y="${cy + 12}" text-anchor="middle" font-size="15" font-weight="700"`
     + ` fill="#1f2733">${centre}</text>`;
  s += `<text x="${cx}" y="${cy + 32}" text-anchor="middle" font-size="10.5"`
     + ` fill="#8a94a8">hover a marker</text>`;

  /* --- markers ---
     Names are escaped on the way into the attributes: the workbook has titles
     containing & (P&G, em&v), which broke the raw version. data-t carries the
     displayed name — eventName(), i.e. py + event — so the tooltip built from
     it below reads the same as the timeline label and the table row. */
  events.forEach(e => {
    const i = sysOrder.indexOf(e.sys);
    const r = rOuter - i * band - band / 2;
    const rm = e.f * slots;                          // month position within the window
    const [x, y] = polar(cx, cy, r, rm * deg);
    const label = `${months[Math.floor(rm) % 12]} ${win.startYear + Math.floor(Math.floor(rm) / 12)}`;
    const name = eventName(e);
    /* data-k is the index into the event array, written so a click on the ring
       opens the same record the timeline would. */
    s += `<circle class="rk" data-t="${esc(name)}" data-s="${esc(e.sys)}" data-when="${esc(label)}"`
       + ` data-k="${e._k}" tabindex="0" role="button" aria-label="${esc(name)}, ${esc(label)}"`
       + ` cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="7" fill="${COL[e.sys]}" stroke="#fff"`
       + ` stroke-width="2" style="cursor:pointer"/>`;
  });

  svg.innerHTML = s;

  /* byK, not the marker's index in the NodeList: the ring is redrawn from a
     filtered array, so position in the list is not a record identity. */
  const byK = new Map(events.map(e => [String(e._k), e]));

  svg.querySelectorAll('.rk').forEach(el => {
    const html = `<b>${esc(NAME[el.dataset.s])}</b>${el.dataset.t}`
               + `<br><span style="opacity:.7">${el.dataset.when}</span>`;
    el.addEventListener('mousemove', ev => showTip(ev, html));
    el.addEventListener('mouseleave', hideTip);
    el.addEventListener('mouseenter', () => el.setAttribute('r', '9'));
    el.addEventListener('mouseleave', () => el.setAttribute('r', '7'));
    el.addEventListener('focus', () => {
      const r = el.getBoundingClientRect();
      showTip({ clientX: r.left + r.width / 2, clientY: r.bottom }, html);
    });
    el.addEventListener('blur', hideTip);
    el.addEventListener('click', () => openDetail(byK.get(el.dataset.k)));
    el.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault(); openDetail(byK.get(el.dataset.k));
      }
    });
  });
}
