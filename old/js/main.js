/* =============================================================================
   main.js — the entry point. The only script index.html links.

   Order matters and is the whole reason this file exists separately from ui.js:
     1. fetch data/events.json
     2. validate what came back, loudly
     3. placeEvents() — assign f / slot / of ONCE, so every view agrees
     4. draw the four views
     5. wire the chrome, then draw the current-date line (it inserts itself into
        #lanes and #donut, so both must already exist)

   In the single-file version steps 3-5 happened as self-executing functions at
   parse time, which worked only because the data was a literal already in
   memory. Once the data arrives over the network that no longer holds.
   ============================================================================= */

import { DATA_URL, SPAN, absMonth, sysOrder, year } from './config.js';
import { drawLegend } from './legend.js';
import { drawDonut } from './donut.js';
import { drawTimeline } from './timeline.js';
import { drawTable } from './table.js';
import { initUI, initNowLine, layoutAll } from './ui.js';

/* ---- placement -------------------------------------------------------------
   Assign each event its fraction across the window. Events sharing a lane AND
   a month are spread evenly across that month's cell:
       slot i of n  ->  (i + 0.5) / n through the month
       n=1 -> dead centre.  n=2 -> quarter and three-quarter points.
   `f`, `slot` and `of` are derived. They are never authored in events.json.
   ---------------------------------------------------------------------------- */
function placeEvents(events) {
  const groups = {};
  events.forEach(e => {
    const k = e.sys + '|' + absMonth(e);
    (groups[k] = groups[k] || []).push(e);
  });
  Object.values(groups).forEach(list => {
    list.sort((a, b) => a.m - b.m);          // stable: equal m keeps file order
    const n = list.length;
    list.forEach((e, i) => {
      e.slot = i + 1;
      e.of = n;
      e.f = (absMonth(e) + (i + 0.5) / n) / SPAN;
    });
  });
}

/* ---- validation ------------------------------------------------------------
   Reports, never repairs. A record that cannot be placed is dropped from the
   render and named in the console, because a silently relocated milestone is
   worse than a missing one.
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
        dropped.push(`${where}: ${e.y}-${e.m} is outside ${year[0]}\u2013${year[year.length - 1]}`);
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

/* ---- load ------------------------------------------------------------------ */
async function loadEvents() {
  const res = await fetch(DATA_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${DATA_URL} returned ${res.status} ${res.statusText}`);
  const doc = await res.json();
  const events = Array.isArray(doc) ? doc : doc.events;
  if (!Array.isArray(events)) throw new Error(`${DATA_URL} has no "events" array`);
  return { events, meta: Array.isArray(doc) ? null : (doc.meta || null) };
}

/* A failed fetch must not leave a page that looks merely empty. */
function showLoadError(err) {
  console.error('[events]', err);
  const el = document.getElementById('loadError');
  if (!el) return;
  el.hidden = false;
  el.innerHTML = `<b>The milestone data could not be loaded, so this page is empty.</b><br>`
    + `${err.message}<br><br>`
    + `If you opened this file directly from disk, that is the cause: browsers block `
    + `data requests from <code>file://</code>. Serve the folder instead — `
    + `<code>python3 -m http.server</code> from the project root, then open `
    + `<code>http://localhost:8000/</code>.`;
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
    const valid = validate(events);
    placeEvents(valid);

    drawLegend(valid);
    drawDonut(valid);
    drawTimeline(valid);
    drawTable(valid);

    initUI();
    initNowLine();
    layoutAll();
    stampMeta(meta);
  } catch (err) {
    showLoadError(err);
  }
}

start();
