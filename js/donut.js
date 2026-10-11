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
  spanMonths, degPerMonth, windowYears, windowLabel, eventName,
  STATUS, statusKey
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
     it below reads the same as the timeline label and the table row.

     Each marker is a <g class="rk"> of concentric layers, radii in ring units:

         0   - 4.5       system colour
         4.5 - 5.5       white gap
         5.5 - 5.5+w     status ring, .rk-st (Complete / Delayed / At risk only)
         7.5 - 9.5       selection ring, .rk-sel, the same with or without a
                         status: a white gap from 5.5 to 7.5 and an ink ring

     w is 1 unit, but never less than one screen pixel: the ring is sized by
     window height (index.html), so a unit is anywhere from about 0.5px to
     1.26px on screen, and a sub-pixel line anti-aliases into a faint one.
     fitRings() sets w from the drawn size, and runs again whenever the donut
     changes size. A selected marker reaches 9.5, inside its 19.25-unit lane
     band (half: 9.625). There is no hover grow: the old 7 -> 9 grow already
     spilled into the next lane.

     Paint order puts the status ring between the selection's white gap and
     its ink ring, so the status still shows inside the gap when selected.
     The transparent hit disc keeps the click target at 7.5 whether or not a
     ring is drawn. */
  events.forEach(e => {
    const i = sysOrder.indexOf(e.sys);
    const r = rOuter - i * band - band / 2;
    const rm = e.f * slots;                          // month position within the window
    const [x, y] = polar(cx, cy, r, rm * deg);
    const label = `${months[Math.floor(rm) % 12]} ${win.startYear + Math.floor(Math.floor(rm) / 12)}`;
    const name = eventName(e);
    const st = statusKey(e);
    const known = st && st !== 'unknown';
    const at = `cx="${x.toFixed(2)}" cy="${y.toFixed(2)}"`;
    /* data-k is the index into the event array, written so a click on the ring
       opens the same record the timeline would. */
    s += `<g class="rk" data-t="${esc(name)}" data-s="${esc(e.sys)}" data-when="${esc(label)}"`
       + ` data-k="${e._k}"${known ? ` data-st="${st}"` : ''} tabindex="0" role="button"`
       + ` aria-label="${esc(name)}, ${esc(label)}${known ? `, ${STATUS[st].label}` : ''}">`
       + `<circle ${at} r="7.5" fill="transparent"/>`
       + `<circle ${at} r="5" fill="${COL[e.sys]}" stroke="#fff" stroke-width="1"/>`
       + `<circle class="rk-sel" ${at} r="6.5" fill="none" stroke="#fff" stroke-width="2"/>`
       + (known
          ? `<circle class="rk-st" ${at} r="6" fill="none" stroke="${STATUS[st].ring}" stroke-width="1"/>`
          : '')
       + `<circle class="rk-sel" ${at} r="8.5" fill="none" stroke="#1f2733" stroke-width="2"/>`
       + `</g>`;
  });

  svg.innerHTML = s;
  fitRings(svg);
  watchSize(svg);

  /* byK, not the marker's index in the NodeList: the ring is redrawn from a
     filtered array, so position in the list is not a record identity. */
  const byK = new Map(events.map(e => [String(e._k), e]));

  svg.querySelectorAll('.rk').forEach(el => {
    /* dataset returns the decoded text (&amp; comes back as &), so the name is
       escaped again here before it goes into the tooltip's innerHTML. */
    const html = `<b>${esc(NAME[el.dataset.s])}</b>${esc(el.dataset.t)}`
               + `<br><span class="tip-when">${el.dataset.when}</span>`;
    el.addEventListener('mousemove', ev => showTip(ev, html));
    el.addEventListener('mouseleave', hideTip);
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

/* ---- status ring width ------------------------------------------------------
   One unit, floored at one screen pixel. Reads the drawn width against the
   viewBox, so it follows index.html's sizing rule without repeating it. A
   hidden donut (another tab is showing) measures 0 and is left alone; the
   observer below fires again when the tab is shown and the donut gets a size. */
const GAP_OUT = 5.5;          // outer edge of the white gap, in units

function fitRings(svg) {
  const px = svg.getBoundingClientRect().width;
  const vb = svg.viewBox.baseVal;
  if (!px || !vb || !vb.width) return;
  const w = Math.max(1, vb.width / px);          // units in one screen pixel, at least 1
  svg.querySelectorAll('.rk-st').forEach(c => {
    c.setAttribute('r', (GAP_OUT + w / 2).toFixed(3));
    c.setAttribute('stroke-width', w.toFixed(3));
  });
}

let watched = null;
function watchSize(svg) {
  if (watched === svg || typeof ResizeObserver === 'undefined') return;
  watched = svg;
  new ResizeObserver(() => fitRings(svg)).observe(svg);
}
