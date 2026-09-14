/* =============================================================================
   main.js — the entry point. The only script index.html links.

   Order matters, and is the reason this file exists separately from ui.js:
     1. fetch data/events.json
     2. validate what came back, loudly
     3. filter to the selected time window
     4. placeEvents() — assign f / slot / of ONCE, so every view agrees
     5. draw the four views
     6. re-attach the chrome that a redraw wipes (grid, now-line, chain state)

   Steps 3-6 re-run whenever the reader changes the window on either tab. The
   window itself lives in ui.js; this file just subscribes to it.
   ============================================================================= */

import {
  DATA_URL, LOG_URL, sysOrder, year, firstYear, lastYear,
  absMonth, SPAN, absMonthIn, spanMonths, inWindow
} from './config.js';
import { drawLegend } from './legend.js';
import { drawDonut } from './donut.js';
import { drawTimeline } from './timeline.js';
import { drawTable } from './table.js';
import { initUI, refreshChrome, win, onWindowChange } from './ui.js';
import { initDetail, refreshSelection } from './detail.js';

let ALL = [];        // every valid record, full range — the table reads this

/* ---- placement -------------------------------------------------------------
   Assign each event its fraction across the CURRENT WINDOW. Events sharing a
   lane AND a month are spread evenly across that month's cell:
       slot i of n  ->  (i + 0.5) / n through the month
   `f`, `slot` and `of` are derived. They are never authored in events.json,
   and they are recomputed on every window change because `f` is a fraction of
   the window, not of the calendar.
   ---------------------------------------------------------------------------- */
function placeEvents(events, w) {
  const span = spanMonths(w);
  const groups = {};
  events.forEach(e => {
    const k = e.sys + '|' + absMonthIn(e, w);
    (groups[k] = groups[k] || []).push(e);
  });
  Object.values(groups).forEach(list => {
    list.sort((a, b) => a.m - b.m);          // stable: equal m keeps file order
    const n = list.length;
    list.forEach((e, i) => {
      e.slot = i + 1;
      e.of = n;
      e.f = (absMonthIn(e, w) + (i + 0.5) / n) / span;
    });
  });
}

/* ---- validation ------------------------------------------------------------
   Reports, never repairs. A record that cannot be placed anywhere in the data
   range is dropped from the render and named in the console, because a
   silently relocated milestone is worse than a missing one.
   ---------------------------------------------------------------------------- */
function validate(events) {
  const kept = [], dropped = [];
  events.forEach((e, i) => {
    const where = `events[${i}] "${e.t ?? '(no title)'}"`;
    if (!sysOrder.includes(e.sys)) {
      dropped.push(`${where}: sys "${e.sys}" is not in sysOrder`);
    } else if (typeof e.y !== 'number' || typeof e.m !== 'number') {
      dropped.push(`${where}: y and m must both be numbers`);
    } else {
      const mi = absMonth(e);
      if (mi < 0 || mi >= SPAN) {
        dropped.push(`${where}: ${e.y}-${e.m} is outside ${firstYear}\u2013${lastYear}`);
      } else {
        kept.push(e);
      }
    }
  });
  if (dropped.length) {
    console.warn(`[events] ${dropped.length} record(s) not rendered:\n  ` + dropped.join('\n  '));
  }
  return kept;
}

/* ---- draw ------------------------------------------------------------------
   Everything that depends on the window. The table is deliberately NOT here:
   it carries its own full-range month filter and shows every record behind the
   visuals, which is what its description on the page promises.
   ---------------------------------------------------------------------------- */
function renderWindow() {
  const shown = ALL.filter(e => inWindow(e, win));
  placeEvents(shown, win);
  drawLegend();
  drawDonut(shown, ALL, win);
  drawTimeline(shown, ALL, win);
  refreshChrome();
  /* A redraw replaces every marker, so the selected one loses its class and
     the open panel loses the element it points at. Re-mark it. */
  refreshSelection();
}

/* ---- load ------------------------------------------------------------------ */

/* The history is secondary: a page with milestones and no change log is still
   useful, so a failure here is logged and the panel copes with an empty log
   rather than the whole page going to the error box. */
async function loadHistory() {
  try {
    const res = await fetch(LOG_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${LOG_URL} returned ${res.status} ${res.statusText}`);
    const doc = await res.json();
    const changes = Array.isArray(doc) ? doc : doc.changes;
    if (!Array.isArray(changes)) throw new Error(`${LOG_URL} has no "changes" array`);
    return changes;
  } catch (err) {
    console.warn('[history] date history unavailable —', err.message);
    return [];
  }
}

async function loadEvents() {
  const res = await fetch(DATA_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${DATA_URL} returned ${res.status} ${res.statusText}`);
  const doc = await res.json();
  const events = Array.isArray(doc) ? doc : doc.events;
  if (!Array.isArray(events)) throw new Error(`${DATA_URL} has no "events" array`);
  return { events, meta: Array.isArray(doc) ? null : (doc.meta || null) };
}

/* A failed fetch must not leave a page that merely looks empty. */
function showLoadError(err) {
  console.error('[events]', err);
  const el = document.getElementById('loadError');
  if (!el) return;
  el.hidden = false;
  el.innerHTML = '<b>The milestone data could not be loaded, so this page is empty.</b><br>'
    + `${err.message}<br><br>`
    + 'If you opened this file directly from disk, that is the cause: browsers block '
    + 'data requests from <code>file://</code>. Serve the folder instead — '
    + '<code>python3 -m http.server</code> from the project root, then open '
    + '<code>http://localhost:8000/</code>.';
}

/* the "Data current as of" placeholder on the landing page */
function stampMeta(meta) {
  const el = document.getElementById('dataAsOf');
  if (!el) return;
  el.textContent = meta && (meta.extractedOn || meta.generatedOn)
    ? (meta.extractedOn || meta.generatedOn)
    : 'TBC';
}

async function start() {
  try {
    const { events, meta } = await loadEvents();
    ALL = validate(events);

    /* Before any view draws: initDetail() stamps every event with its stable
       _k, and the two visuals write that into data-k as they render. */
    initDetail(ALL, await loadHistory());

    initUI();
    onWindowChange(renderWindow);

    drawTable(ALL);        // full range, drawn once
    renderWindow();        // window-dependent views
    stampMeta(meta);
  } catch (err) {
    showLoadError(err);
  }
}

start();
