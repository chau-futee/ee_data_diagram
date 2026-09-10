/* =============================================================================
   donut.js — the cyclical view: 36 months of records folded into a 24-month
   cycle, one ring per system, outer to inner in legend order.

   The ring position of an event is derived from the same `f` the timeline uses,
   so the two views cannot disagree about where a record sits:
       ring month = (f * SPAN) mod CYCLE

   Was: lines 505-550 of data_donut_concept_4_1.html. `polar()` and the circle
   geometry moved to config.js, because ui.js draws the current-date spoke on
   the same circle and used to carry its own copy of those four numbers.
   ============================================================================= */

import {
  sysOrder, COL, NAME, SHORT, months24, SPAN, CYCLE,
  RING, DEG_PER_MONTH, polar, esc, hasData
} from './config.js';
import { showTip, hideTip } from './ui.js';

export function drawDonut(events) {
  const svg = document.getElementById('donut');
  const { cx, cy, rOuter, rInner } = RING;

  // hub tightened from 120 to 96: 8 bands across the old 130px span left only
  // ~16px per ring, too narrow for a 14px marker. 154/8 = ~19px per ring.
  const band = (rOuter - rInner) / sysOrder.length;

  /* the ring's own derivation of the shared event list */
  const ring = events.map(e => ({
    sys: e.sys,
    m: +((e.f * SPAN) % CYCLE).toFixed(4),
    t: e.t
  }));

  let s = '';

  /* month spokes + labels */
  for (let m = 0; m < CYCLE; m++) {
    const ang = m * DEG_PER_MONTH;
    const [x1, y1] = polar(cx, cy, rInner - 6, ang);
    const [x2, y2] = polar(cx, cy, rOuter + 6, ang);
    s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#eef1f6" stroke-width="1"/>`;
    const [lx, ly] = polar(cx, cy, rOuter + 24, ang + DEG_PER_MONTH / 2);
    s += `<text x="${lx}" y="${ly}" font-size="12" fill="#8a94a8" text-anchor="middle"`
       + ` dominant-baseline="middle">${months24[m]}</text>`;
  }

  /* system arcs */
  sysOrder.forEach((sys, i) => {
    const r = rOuter - i * band - band / 2;
    s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${COL[sys]}"`
       + ` stroke-opacity=".16" stroke-width="${band - 4}"/>`;
    if (!hasData(events, sys)) {
      s += `<text x="${cx}" y="${cy - r + 3.5}" font-size="9" fill="#8a94a8"`
         + ` text-anchor="middle" font-style="italic">${esc(SHORT[sys])} — awaiting data</text>`;
    }
  });

  /* centre. NOTE: "Biennial" here is unsourced — see the naming decision note.
     Left as-is deliberately; changing it is a content decision, not a refactor. */
  s += `<circle cx="${cx}" cy="${cy}" r="${rInner - 10}" fill="#fff" stroke="#eef1f6"/>`;
  s += `<text x="${cx}" y="${cy - 8}" text-anchor="middle" font-size="15" font-weight="700" fill="#1f2733">Biennial EE</text>`;
  s += `<text x="${cx}" y="${cy + 12}" text-anchor="middle" font-size="15" font-weight="700" fill="#1f2733">cycle</text>`;
  s += `<text x="${cx}" y="${cy + 32}" text-anchor="middle" font-size="10.5" fill="#8a94a8">hover a marker</text>`;

  /* markers. Titles are escaped on the way into the attributes — the workbook
     has titles containing & (P&G, em&v), which broke the raw version. */
  ring.forEach(e => {
    const i = sysOrder.indexOf(e.sys);
    const r = rOuter - i * band - band / 2;
    const [x, y] = polar(cx, cy, r, e.m * DEG_PER_MONTH);
    s += `<circle class="rk" data-t="${esc(e.t)}" data-s="${esc(e.sys)}" data-m="${e.m}"`
       + ` cx="${x}" cy="${y}" r="7" fill="${COL[e.sys]}" stroke="#fff" stroke-width="2"`
       + ` style="cursor:pointer"/>`;
  });

  svg.innerHTML = s;

  svg.querySelectorAll('.rk').forEach(el => {
    /* % CYCLE guards the fold: a marker at ring month 23.5 rounds to 24, which
       is off the end of a 24-entry array and printed "undefined". */
    const label = months24[Math.round(el.dataset.m) % CYCLE];
    const html = `<b>${esc(NAME[el.dataset.s])}</b>${el.dataset.t}`
               + `<br><span style="opacity:.7">${label}</span>`;
    el.addEventListener('mousemove', ev => showTip(ev, html));
    el.addEventListener('mouseleave', hideTip);
    el.addEventListener('mouseenter', () => el.setAttribute('r', '9'));
    el.addEventListener('mouseleave', () => el.setAttribute('r', '7'));
  });
}
