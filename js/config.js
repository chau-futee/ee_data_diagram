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

   `regulatory` was `cpucp` ("CPUC Proceedings") until the data generalised it.
   It is the same lane — same position, same colour — under a name that is not
   tied to one commission, so a milestone from another regulator has somewhere
   to go. The key matches the `sys` value in events.json; nothing outside this
   block ever names a system literally.
   ---------------------------------------------------------------------------- */
export const sysOrder = ['cedars', 'acc', 'pa', 'pg', 'etrm', 'deer', 'cns', 'regulatory'];

export const COL = {                       // swatch, lane label, marker fill
  etrm: '#5F9E3F', pa: '#556A77', deer: '#7C4DBC', pg: '#E24A4A',
  acc: '#2FA3A8', cedars: '#FCB720', cns: '#B84A96', regulatory: '#2E6FC7'
};

export const NAME = {                      // full name — legend and tooltips
  etrm: 'eTRM', pa: 'PA Submissions', deer: 'DEER', pg: 'Potential & Goals',
  acc: 'Avoided Cost Calculator', cedars: 'CEDARS-CET', cns: 'Code and Standards',
  regulatory: 'Regulatory Proceedings'
};

export const SHORT = {                     // acronym — lane box and table
  etrm: 'eTRM', pa: 'PA Submissions', deer: 'DEER', pg: 'P&G',
  acc: 'ACC', cedars: 'CEDARS', cns: 'C&S', regulatory: 'Regulatory'
};

/* per-lane type-size override where the abbreviation still runs long.
   The lane label box gives its text 92px (a 120px cell, less a 12px right
   margin and 8px of padding each side) and never wraps. "PA Submissions" needs
   the smaller size to fit; "Regulatory" is four characters shorter than that
   and clears it at the default 12.5px, so it takes no override. */
export const LBL_FS = { pa: '11px' };

/* ---- the full range the data may cover -------------------------------------
   The RANGE and the WINDOW are different things. This array is the outer limit
   of what may be authored and navigated to; the window is the 1-3 year slice of
   it the reader is looking at. Years may be empty: 2029 and 2030 carry no
   records today and exist so a deadline dated into them needs a data edit and
   not a code edit. Both visuals already have an empty-window state, so paging
   into an empty year says so rather than looking broken.

   Everything downstream derives from year.length, so extending this array is
   the only edit adding a year takes. It is still a manual edit — the day that
   becomes a chore, derive first/last from the loaded data instead.
   ---------------------------------------------------------------------------- */
export const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export const year   = [2025, 2026, 2027, 2028, 2029, 2030];
export const SPAN   = year.length * 12;    // full range in months, used by the table
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

/* The date-change history behind the detail panel. Joined to events.json on
   (sys, py, event) — see the header of detail.js. A failure to load this one is
   NOT fatal: the visuals still draw, and the panel says the history is
   unavailable. */
export const LOG_URL = 'data/historical_log.json';

/* ---- pure helpers ---------------------------------------------------------- */

/* THE DISPLAYED NAME. events.json carries the program year and the title in two
   fields — py "2028" and event "Measure Package Submissions" — and every view
   shows them joined: "2028 Measure Package Submissions". Written down once here
   so the ring, the timeline, the table, the detail panel and the console
   warnings cannot disagree about what a record is called.

   py is a PROGRAM year and is not the year the dot is drawn at: 22 of the 60
   records have py != y, so this name is never a restatement of the deadline.

   The blank-py branch is a guard, not a case the current data exercises — all
   60 records carry one. It exists so a missing py degrades to the bare title
   rather than to a name with a leading space. */
export const eventName = e => {
  const py = String(e && e.py != null ? e.py : '').trim();
  const t  = String(e && e.event != null ? e.event : '').trim();
  return py ? `${py} ${t}` : t;
};

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
