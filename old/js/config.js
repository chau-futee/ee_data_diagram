/* =============================================================================
   config.js — every value that more than one file needs, written down once.

   Nothing in here touches the DOM and nothing in here fetches. It is safe to
   import from anywhere, which is why it sits at the bottom of the dependency
   graph:

       config.js  <-  ui.js  <-  legend/donut/timeline/table.js  <-  main.js

   Was: lines 351-363 and 392-394 of data_donut_concept_4_1.html, plus the
   layout constants that were scattered further down the old script.
   ============================================================================= */

/* ---- systems ---------------------------------------------------------------
   sysOrder is the source of truth for lane order, outer-to-inner on the ring
   and top-to-bottom on the timeline. Adding a key here adds it to the legend,
   the ring and the timeline automatically; a system with no records renders as
   an explicitly empty lane rather than being dropped.
   ---------------------------------------------------------------------------- */
export const sysOrder = ['cet', 'acc', 'pa', 'pg', 'etrm', 'deer', 'cns', 'cpucp'];

export const COL = {                       // swatch, lane label, marker fill
  etrm: '#7C4DBC', pa: '#2E6FC7', deer: '#5F9E3F', pg: '#E8912A',
  acc: '#2FA3A8', cet: '#E24A4A', cns: '#B84A96', cpucp: '#4A5568'
};

export const NAME = {                      // full name — legend and tooltips
  etrm: 'eTRM', pa: 'PA Submissions', deer: 'DEER', pg: 'Potential & Goals',
  acc: 'Avoided Cost Calculator', cet: 'CET', cns: 'Code and Standards',
  cpucp: 'CPUC Proceedings'
};

export const SHORT = {                     // acronym — lane box and table
  etrm: 'eTRM', pa: 'PA Submissions', deer: 'DEER', pg: 'P&G',
  acc: 'ACC', cet: 'CET', cns: 'C&S', cpucp: 'CPUC'
};

/* per-lane type-size override where the abbreviation still runs long */
export const LBL_FS = { pa: '11px' };

/* ---- calendar window -------------------------------------------------------
   Change `year` and everything derived from it follows: the month axis, the
   table's month filter, the current-date clamp and the ring fold.
   ---------------------------------------------------------------------------- */
export const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export const year   = [2026, 2027, 2028];
export const SPAN   = year.length * 12;    // 36 months across the window
export const CYCLE  = 24;                  // months in one folded ring cycle
export const months24 = [...months, ...months];

/* ---- ring geometry ---------------------------------------------------------
   The donut and the current-date spoke must be drawn on the same circle. In
   the single-file version these numbers were written twice, with a comment
   asking whoever changed one to remember the other. They now live here, so
   that class of drift is gone.
   ---------------------------------------------------------------------------- */
export const RING = { cx: 280, cy: 280, rOuter: 250, rInner: 96 };
export const DEG_PER_MONTH = 360 / CYCLE;  // 15 degrees

/* must match --now / --now-moved in the stylesheet: the ring spoke is SVG and
   cannot read CSS custom properties */
export const NOW_COL = { today: '#C1741A', moved: '#5B6473' };

/* ---- layout tuning ---------------------------------------------------------
   NUDGE_OVERLAP is off: events are already spread evenly inside their month,
   so the only remaining crowding is a month cell too narrow at the current
   zoom. Nudging would push a dot OUT of the month it was just centred in.
   Set true to restore the old behaviour.
   ---------------------------------------------------------------------------- */
export const NUDGE_OVERLAP = false;
export const MIN_CELL  = 24;               // px below which the month grid is suppressed
export const MIN_GAP   = 17;
export const LABEL_W   = 78;
export const PAD       = 5;
export const LANE_MAX  = 190;
export const RESERVE   = 112;              // chain button + scrollbar + page padding

/* ---- dependency chain ------------------------------------------------------
   TODO: these two ids are hardcoded. The workbook already carries `downward
   dependencies` and `upward dependencies` on 64 of 71 rows, unused today, so
   this should eventually be derived from the data rather than declared here.
   ---------------------------------------------------------------------------- */
export const chainIds = new Set(['app', 'pgdraft']);

/* view id -> tab button id. Add a view by adding one entry. */
export const VIEWS = { home: 'btnHome', time: 'btnTime', ring: 'btnRing', table: 'btnTable' };

/* where the data lives, relative to index.html */
export const DATA_URL = 'data/events.json';

/* ---- pure helpers ---------------------------------------------------------- */

/* 2.8 -> 3 (March). The fraction only ORDERS events within a month. */
export const monthOf = e => Math.round(e.m);

/* 0-based month index across the window: Jan 2026 = 0, Dec 2028 = 35 */
export const absMonth = e => (e.y - year[0]) * 12 + monthOf(e) - 1;

/* "Mar 2027" from an absolute month index. Was duplicated as whenLabel()'s
   first two lines and as the table's mLbl(); one definition now. */
export const monthLabel = mi => `${months[mi % 12]} ${year[0] + Math.floor(mi / 12)}`;

/* A system with no records anywhere renders as explicitly empty. */
export const hasData = (events, sys) => events.some(e => e.sys === sys);

export const esc = v => String(v == null ? '' : v)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* angle in degrees, measured clockwise from 12 o'clock */
export function polar(cx, cy, r, ang) {
  const a = (ang - 90) * Math.PI / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}
