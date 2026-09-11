/* =============================================================================
   config.js — every value that more than one file needs, written down once.

   Nothing in here touches the DOM and nothing in here fetches. It is safe to
   import from anywhere, which is why it sits at the bottom of the dependency
   graph:

       config.js  <-  ui.js  <-  legend/donut/timeline/table.js  <-  main.js

   TIME WINDOW. The ring and the timeline no longer show a fixed 36 months.
   They show a window — { startYear, years } — that the reader picks, and the
   two views always show the same one. `year` below is the full range the DATA
   may cover; the window is a slice of it. Anything named *In(..., win) is
   window-relative; the plain versions are full-range and are what the data
   table still uses.
   ============================================================================= */

/* ---- systems ---------------------------------------------------------------
   sysOrder is the source of truth for lane order: outer-to-inner (ring)) and top-to-bottom (timeline).
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
  etrm: 'eTRM', pa: 'PA', deer: 'DEER', pg: 'P&G',
  acc: 'ACC', cet: 'CET', cns: 'C&S', cpucp: 'CPUC'
};

/* per-lane type-size override where the abbreviation still runs long */
export const LBL_FS = { pa: '11px' };

/* ---- the full range the data may cover ------------------------------------- */
export const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export const year   = [2026, 2027, 2028];
export const SPAN   = year.length * 12;    // 36 — full range, used by the table
export const firstYear = year[0];
export const lastYear  = year[year.length - 1];

/* ---- the time window ------------------------------------------------------- */
export const WINDOW_SPANS = [1, 2, 3];     // selectable lengths, in years
export const DEFAULT_WINDOW_YEARS = 2;     // "current look of the donut"

/* Default start: the current year when the data covers it, else the nearest
   end. Read once at load; it does not chase midnight on New Year's Eve. */
export function defaultStartYear() {
  const y = new Date().getFullYear();
  return y < firstYear ? firstYear : (y > lastYear ? lastYear : y);
}

/* A window can never run past the end of the data. Asking for 3 years starting
   2028 gives 2026-2028, not 2028-2030: the length the reader chose is honoured
   and the start slides back to make room. */
export function clampWindow({ startYear, years }) {
  const yrs = Math.min(Math.max(1, years | 0), year.length);
  const maxStart = lastYear - yrs + 1;
  const start = Math.min(Math.max(firstYear, startYear | 0), maxStart);
  return { startYear: start, years: yrs };
}

export const spanMonths  = win => win.years * 12;
export const windowYears = win => Array.from({ length: win.years }, (_, i) => win.startYear + i);
export const windowLabel = win =>
  win.years === 1 ? `${win.startYear}` : `${win.startYear}\u2013${win.startYear + win.years - 1}`;

/* degrees per month around the ring: 30 at 1 year, 15 at 2, 10 at 3 */
export const degPerMonth = win => 360 / spanMonths(win);

/* ---- ring geometry ---------------------------------------------------------
   The donut and the current-date spoke are drawn on the same circle. These four
   numbers used to be written twice, with a comment asking whoever changed one
   to remember the other.
   ---------------------------------------------------------------------------- */
export const RING = { cx: 280, cy: 280, rOuter: 250, rInner: 96 };

/* must match --now / --now-moved in the stylesheet: the ring spoke is SVG and
   cannot read CSS custom properties */
export const NOW_COL = { today: '#C1741A', moved: '#5B6473' };

/* ---- layout tuning --------------------------------------------------------- */
export const NUDGE_OVERLAP = false;
export const MIN_CELL  = 24;               // px below which the month grid is suppressed
export const MIN_GAP   = 17;
export const LABEL_W   = 78;
export const PAD       = 5;
export const LANE_MAX  = 190;
export const RESERVE   = 112;              // chain button + scrollbar + page padding

/* ---- dependency chain ------------------------------------------------------
   TODO: hardcoded. The workbook already carries `downward dependencies` and
   `upward dependencies` on 64 of 71 rows, unused today.
   ---------------------------------------------------------------------------- */
export const chainIds = new Set(['app', 'pgdraft']);

/* view id -> tab button id. Add a view by adding one entry. */
export const VIEWS = { home: 'btnHome', time: 'btnTime', ring: 'btnRing', table: 'btnTable' };

/* where the data lives, relative to index.html */
export const DATA_URL = 'data/events.json';

/* ---- pure helpers ---------------------------------------------------------- */

/* 2.8 -> 3 (March). The fraction only ORDERS events within a month. */
export const monthOf = e => Math.round(e.m);

/* full-range month index: Jan 2026 = 0, Dec 2028 = 35. Used by the table. */
export const absMonth = e => (e.y - firstYear) * 12 + monthOf(e) - 1;
export const monthLabel = mi => `${months[mi % 12]} ${firstYear + Math.floor(mi / 12)}`;

/* window-relative month index: 0 is January of the window's first year */
export const absMonthIn = (e, win) => (e.y - win.startYear) * 12 + monthOf(e) - 1;
export const monthLabelIn = (mi, win) => `${months[mi % 12]} ${win.startYear + Math.floor(mi / 12)}`;

export function inWindow(e, win) {
  const mi = absMonthIn(e, win);
  return mi >= 0 && mi < spanMonths(win);
}

/* A system with no records in the given list. */
export const hasData = (events, sys) => events.some(e => e.sys === sys);

export const esc = v => String(v == null ? '' : v)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* angle in degrees, measured clockwise from 12 o'clock */
export function polar(cx, cy, r, ang) {
  const a = (ang - 90) * Math.PI / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}
