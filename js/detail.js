/* =============================================================================
   detail.js — what a reader gets when they click a marker.

   One record's story, in three parts:
     1. the date history        (data/historical_log.json)
     2. upward dependencies     (events.json -> upDeps)
     3. downward dependencies   (events.json -> downDeps)

   TWO PRESENTATIONS OF THE SAME CONTENT, deliberately, so they can be compared
   before one is kept:
     - the DOCK, a panel across the bottom of the window; and
     - the FLOAT, a draggable panel opened from the dock's "Show detail" button.
   buildBody() is written once and both call it, so a difference between them is
   always a difference of container, never of content.

   THE JOIN. historical_log.json carries no event key — only `system` and
   `event` (the title). So the join is (sys, title), case-folded and
   whitespace-collapsed. That join is complete in the current data: every one of
   the 58 events matches at least one of the 70 change records, and every record
   matches an event. It is NOT unique, though: the PA lane repeats four titles
   across two years ("Q1"-"Q4 claims submission", 2026 and 2027), so eight dots
   share four chains. Per the decision on 2026-09-13 the full title-matched
   chain is shown on each of them, and shareCount() puts a note in the panel
   saying so rather than letting the reader assume the chain is theirs alone.

   TWO DATES THAT DISAGREE. In 16 of the 58 records the last `newDate` in the
   chain is not the month the dot is drawn at — the dot follows events.json, the
   chain follows the log, and the placeholder log was not reconciled with the
   dataset. Silently showing both invites the reader to trust whichever they
   read second, so the panel names the disagreement where it occurs. Delete
   dateConflict() once the two sources are reconciled.

   Imports config only, so the graph stays acyclic:
       config.js  <-  ui.js  <-  detail.js  <-  donut/timeline/table.js  <-  main.js

   THREE CONTAINERS NOW. The table draws the same panel inside an expanded
   row, through detailPanelHTML() at the foot of this file. It is the same
   head and the same body, so a change here reaches all three.
   ============================================================================= */

import { COL, NAME, SHORT, months, monthOf, esc } from './config.js';
import { setExtraReserve } from './ui.js';

/* ---- state ---------------------------------------------------------------- */

let ALL = [];              // every validated event, in file order
let LOG = new Map();       // "sys|title" -> [change, ...] in file order
let TITLES = new Map();    // "sys|title" -> how many events carry it
let current = null;        // the selected event object, or null
let floatOpen = false;
let dock, floater, chip;
let chipRAF = 0;

/* ---- the join key ---------------------------------------------------------- */

const key = (sys, title) =>
  String(sys).trim().toLowerCase() + '|' + String(title).trim().replace(/\s+/g, ' ').toLowerCase();

const evKey = e => key(e.sys, e.t);

/* ---- date formatting -------------------------------------------------------
   The log is not written to one precision: some entries carry a day
   ("2026-03-31"), others stop at the month ("2026-07"). Every view in the app
   places a record by month, so the panel prints the month and drops any day
   rather than showing a precision it cannot show for every record. Same
   "Mon YYYY" shape as monthLabel() in config.js, so the panel and the table
   read alike. */

function monText(iso) {
  if (!iso) return '';
  const [y, m] = String(iso).split('-');
  return `${months[(+m - 1) % 12]} ${y}`;
}

/* the dot's own month, from events.json. monthOf() rounds, matching the rest of
   the app — pg "P&G draft results" is authored at m 12.8. */
const eventMonth = e => {
  const m = monthOf(e);
  const y = e.y + Math.floor((m - 1) / 12);
  return { label: `${months[(m - 1) % 12]} ${y}`, my: `${((m - 1) % 12) + 1}/${y}` };
};

/* ---- the data questions the panel asks -------------------------------------

   SHOW_DATA_NOTES gates the two amber notes the panel can raise about its own
   data: that a title is shared by more than one milestone, and that the end of
   a chain disagrees with the month the dot is drawn at. Both are true of the
   placeholder log and both are noise until the real history arrives, so they
   are off. Flip this to true once data/historical_log.json is real and the
   panel starts policing it again. The checks below stay written down rather
   than deleted precisely so that flip is one word.
   ---------------------------------------------------------------------------- */
const SHOW_DATA_NOTES = false;

const changesFor = e => LOG.get(evKey(e)) || [];

/* How many events carry this exact system+title. >1 means the chain below is
   shared between them. */
const shareCount = e => TITLES.get(evKey(e)) || 1;

/* Does the end of the chain agree with where the dot is drawn? */
function dateConflict(e) {
  const list = changesFor(e);
  if (!list.length) return null;
  const last = list[list.length - 1].newDate;
  if (!last) return null;
  const [ly, lm] = last.split('-');
  const { my } = eventMonth(e);
  const logMy = `${+lm}/${ly}`;
  return logMy === my ? null : { dot: my, log: logMy };
}

/* ---- body -----------------------------------------------------------------
   One function, both containers. */

function historyHTML(e) {
  const list = changesFor(e);
  if (!list.length) {
    return '<p class="dt-empty">No date history recorded for this milestone.</p>';
  }

  /* Two lines per entry: the move, then the reason under it. The reference is
     deliberately not shown — it is a placeholder string today and, once the
     real log lands, it belongs to the change rather than to the reader. */
  const rows = list.map(c => {
    const move = c.originalDate === null || c.originalDate === undefined
      ? `Added: ${esc(monText(c.newDate))}`
      : `${esc(monText(c.originalDate))}`
        + `<span class="dt-arr" aria-hidden="true">\u2192</span>`
        + `${esc(monText(c.newDate))}`;
    const reason = c.reason
      ? `<div class="dt-reason">${esc(c.reason)}</div>`
      : '<div class="dt-reason dt-unset">Reason not recorded</div>';
    return `<li><div class="dt-line">${move}</div>${reason}</li>`;
  }).join('');

  let notes = '';
  if (SHOW_DATA_NOTES) {
    if (shareCount(e) > 1) {
      notes += `<p class="dt-warn">This title is used by ${shareCount(e)} milestones in the `
        + 'dataset. The log records only a system and a title, so the entries below cover '
        + 'all of them.</p>';
    }
    const clash = dateConflict(e);
    if (clash) {
      notes += `<p class="dt-warn">This milestone is charted at ${esc(clash.dot)}, `
        + `but its last log entry ends at ${esc(clash.log)}.</p>`;
    }
  }

  return notes + `<ol class="dt-hist">${rows}</ol>`;
}

/* Plain stacked lines rather than pills. A dependency is a sentence fragment
   the reader has to read, and several of them wrapped as chips read as tags —
   as though the set were a category the milestone belongs to. */
function depsHTML(list, emptyMsg) {
  if (!Array.isArray(list) || !list.length) return `<p class="dt-empty">${esc(emptyMsg)}</p>`;
  return `<ul class="dt-deps">${list.map(d => `<li>${esc(d)}</li>`).join('')}</ul>`;
}

/* All three columns now carry a line saying what they hold. Date history had
   none, which left the reader to infer from the entries what the column was
   counting. */
function buildBody(e) {
  return '<div class="dt-cols">'
    + '<section class="dt-col"><h4>Date history</h4>'
    + '<p class="dt-note">Changes recorded for this milestone</p>'
    + historyHTML(e) + '</section>'
    + '<section class="dt-col"><h4>Upward dependencies</h4>'
    + '<p class="dt-note">What this milestone waits on</p>'
    + depsHTML(e.upDeps, 'None recorded.') + '</section>'
    + '<section class="dt-col"><h4>Downward dependencies</h4>'
    + '<p class="dt-note">What waits on this milestone</p>'
    + depsHTML(e.downDeps, 'None recorded.') + '</section>'
    + '</div>';
}

/* One labelled fact. An em dash where the field is empty, so a missing value
   reads as missing rather than as a label with nothing after it. Every record
   in events.json currently carries the literal string "TBD" in reviewedBy and
   reviewedOn, so that is what the panel shows today. */
function fact(label, value) {
  return `<span class="dt-fact">${esc(label)} <b>${esc(value || '\u2014')}</b></span>`;
}

/* The header states the record in words: its title, then the four facts side
   by side. The 12px swatch is gone — "System: eTRM" names the system, so the
   colour is carried by the bar down the panel's left edge instead, set by
   accent(). */
function headHTML(e) {
  const { label } = eventMonth(e);
  return `<div class="dt-head">`
    + `<div class="dt-titles"><b>${esc(e.t)}</b>`
    + `<div class="dt-facts">`
    + fact('System:', NAME[e.sys] || SHORT[e.sys] || e.sys)
    + fact('Deadline:', label)
    + fact('Reviewed by:', e.reviewedBy)
    + fact('Reviewed date:', e.reviewedOn)
    + `</div></div>`
    + `<button type="button" class="dt-x" data-act="close">`
    + `<span aria-hidden="true">\u00d7</span> Close</button>`
    + `</div>`;
}

/* The left bar is the only system colour left in the panel, and it is drawn by
   the stylesheet, which cannot read COL. Hand it over as a custom property on
   whichever container is about to be filled. */
function accent(el, e) {
  el.style.setProperty('--sys', COL[e.sys] || 'var(--line)');
}

/* The whole panel, for a container this file does not own. The table expands a
   row and puts this inside it; the close button keeps its data-act="close", so
   the table can catch it and collapse the row it belongs to. */
export function detailPanelHTML(e) {
  return headHTML(e) + buildBody(e);
}

/* ---- the dock -------------------------------------------------------------- */

function renderDock() {
  if (!current) { closeDock(); return; }
  dock.innerHTML = headHTML(current) + buildBody(current);
  accent(dock, current);
  dock.hidden = false;
  /* The timeline sizes its lanes against the free height of the window, so the
     dock has to declare how much of it it just took. */
  requestAnimationFrame(() => setExtraReserve(dock.offsetHeight));
}

function closeDock() {
  dock.hidden = true;
  dock.innerHTML = '';
  setExtraReserve(0);
}

/* ---- the float -------------------------------------------------------------
   Opened from the dock, closed on its own, dragged by its header. Remembers
   where it was put for the rest of the session, so clicking a second marker
   does not throw it back to the middle of the screen. */

let floatPos = null;

function renderFloat() {
  if (!floatOpen || !current) { floater.hidden = true; return; }
  floater.innerHTML = headHTML(current) + buildBody(current);
  accent(floater, current);
  floater.hidden = false;
  if (!floatPos) floatPos = anchorToMarker();
  placeFloat();
}

/* Open beside the dot that was clicked, not in the middle of the screen: the
   whole point of this treatment is that the detail arrives where the reader is
   already looking. placeFloat() then pulls it back inside the viewport, so the
   preferred position can be stated simply and be wrong at the edges. */
function anchorToMarker() {
  const r = markerRect();
  const f = floater.getBoundingClientRect();
  if (!r) return { x: (innerWidth - f.width) / 2, y: (innerHeight - f.height) / 3 };
  const below = r.bottom + 12;
  const fits = below + f.height < innerHeight - dockHeight() - 12;
  return {
    x: r.left + r.width / 2 - f.width / 2,
    y: fits ? below : r.top - f.height - 12
  };
}

const dockHeight = () => (dock && !dock.hidden ? dock.offsetHeight : 0);

function placeFloat() {
  const r = floater.getBoundingClientRect();
  const x = Math.min(Math.max(8, floatPos.x), Math.max(8, innerWidth - r.width - 8));
  const y = Math.min(Math.max(8, floatPos.y), Math.max(8, innerHeight - r.height - 8));
  floatPos = { x, y };
  floater.style.left = x + 'px';
  floater.style.top = y + 'px';
}

function bindFloatDrag() {
  let from = null;
  floater.addEventListener('pointerdown', ev => {
    const head = ev.target.closest('.dt-head');
    if (!head || ev.target.closest('button')) return;
    from = { px: ev.clientX, py: ev.clientY, x: floatPos.x, y: floatPos.y };
    try { floater.setPointerCapture(ev.pointerId); } catch (_) {}
    floater.classList.add('dragging');
    ev.preventDefault();
  });
  floater.addEventListener('pointermove', ev => {
    if (!from) return;
    floatPos = { x: from.x + (ev.clientX - from.px), y: from.y + (ev.clientY - from.py) };
    placeFloat();
  });
  const stop = ev => {
    if (!from) return;
    from = null;
    floater.classList.remove('dragging');
    try { floater.releasePointerCapture(ev.pointerId); } catch (_) {}
  };
  floater.addEventListener('pointerup', stop);
  floater.addEventListener('pointercancel', stop);
}

/* ---- the marker, and the chip that sits on it -------------------------------
   The second of the two treatments: rather than reading the record at the foot
   of the window, the reader gets one small offer at the dot and opens the
   detail there.

   The chip is positioned in viewport coordinates on every frame while a record
   is selected. A cheaper approach would listen for scroll and resize, but the
   marker also moves for reasons that fire no event a listener can catch — a
   tab switch, a window change redrawing the lanes, the smooth scroll that
   clearOfDock() starts. One getBoundingClientRect per frame on a single
   element costs nothing and cannot fall out of step. The loop only runs while
   something is selected. */

function markerRect() {
  const k = current ? String(current._k) : null;
  if (k === null) return null;
  const el = [
    document.querySelector(`.milestone[data-k="${k}"]`),
    document.querySelector(`#donut .rk[data-k="${k}"]`)
  ].find(x => x && x.getBoundingClientRect().height > 0);
  return el ? el.getBoundingClientRect() : null;
}

function positionChip() {
  chipRAF = requestAnimationFrame(positionChip);
  if (!current) return;
  const r = markerRect();
  /* No visible marker means the reader is on the Home or Table tab: the dock
     still holds the record, but there is nothing here to pin a chip to. */
  if (!r) { chip.hidden = true; return; }
  chip.hidden = false;
  const w = chip.offsetWidth, h = chip.offsetHeight;
  let x = r.left + r.width / 2 - w / 2;
  let y = r.bottom + 8;
  if (y + h > innerHeight - dockHeight() - 8) y = r.top - h - 8;
  chip.style.left = Math.min(Math.max(8, x), innerWidth - w - 8) + 'px';
  chip.style.top = Math.min(Math.max(8, y), innerHeight - h - 8) + 'px';
}

function startChip() {
  if (!chipRAF) positionChip();
}

function stopChip() {
  cancelAnimationFrame(chipRAF);
  chipRAF = 0;
  chip.hidden = true;
}

/* ---- selection -------------------------------------------------------------
   The dock is fixed to the foot of the window, and the timeline is often taller
   than the space left above it, so the marker that was just clicked can end up
   underneath the panel describing it. Nudge the page just far enough that it
   clears — never further, because a jump that re-centres the view loses the
   reader's place in a chart they were reading. */

function clearOfDock(el) {
  if (!el || dock.hidden) return;
  const r = el.getBoundingClientRect();
  const floor = innerHeight - dock.offsetHeight - 16;
  if (r.bottom > floor) scrollBy({ top: r.bottom - floor + 24, behavior: 'smooth' });
}


/* Mark the chosen marker in both views. Called on every open and after every
   redraw, because a redraw replaces the DOM and takes the class with it. */
export function refreshSelection() {
  const k = current ? String(current._k) : null;
  document.querySelectorAll('.milestone').forEach(m => {
    m.classList.toggle('sel', k !== null && m.dataset.k === k);
  });
  document.querySelectorAll('#donut .rk').forEach(c => {
    c.classList.toggle('sel', k !== null && c.dataset.k === k);
  });
  if (current) { renderDock(); renderFloat(); }
}

/* Only on a fresh open. Doing it inside refreshSelection() would move the page
   on every window change too, which is not something the reader asked for. */
function revealSelected() {
  const k = current ? String(current._k) : null;
  if (k === null) return;
  /* Both views hold a marker for this record and only one of them is on
     screen. The hidden one measures zero, so it would report itself as already
     clear of the dock and the visible one would stay buried. Pick by what
     actually has a box. */
  requestAnimationFrame(() => {
    const seen = [
      document.querySelector(`.milestone[data-k="${k}"]`),
      document.querySelector(`#donut .rk[data-k="${k}"]`)
    ].find(el => el && el.getBoundingClientRect().height > 0);
    clearOfDock(seen);
  });
}

/* ---- public opening -------------------------------------------------------- */

export function openDetail(e) {
  if (!e) return;
  if (current === e) { closeDetail(); return; }   // clicking the same dot closes
  current = e;
  /* A float anchored to the last dot would be pointing at the wrong one. It is
     opened per-dot from the chip, so it closes with the dot it belonged to. */
  floatOpen = false;
  floater.hidden = true;
  floatPos = null;
  renderDock();
  startChip();
  refreshSelection();
  revealSelected();
}

export function closeDetail() {
  current = null;
  floatOpen = false;
  floatPos = null;
  stopChip();
  closeDock();
  floater.hidden = true;
  floater.innerHTML = '';
  refreshSelection();
}

/* Every event keeps the same _k for the life of the page, and both views write
   it into data-k, so a click resolves to one record without a title lookup. */
export function initDetail(events, log) {
  ALL = events;
  ALL.forEach((e, i) => { e._k = i; });

  LOG = new Map();
  (log || []).forEach(c => {
    const k = key(c.system, c.event);
    if (!LOG.has(k)) LOG.set(k, []);
    LOG.get(k).push(c);
  });

  TITLES = new Map();
  ALL.forEach(e => TITLES.set(evKey(e), (TITLES.get(evKey(e)) || 0) + 1));

  const orphan = [...LOG.keys()].filter(k => !TITLES.has(k));
  const bare = ALL.filter(e => !LOG.has(evKey(e)));
  if (orphan.length) {
    console.warn(`[history] ${orphan.length} log key(s) match no milestone:\n  ` + orphan.join('\n  '));
  }
  if (bare.length) {
    console.warn(`[history] ${bare.length} milestone(s) have no date history:\n  `
      + bare.map(e => `${e.sys} "${e.t}"`).join('\n  '));
  }

  dock = document.getElementById('detailDock');
  floater = document.getElementById('detailFloat');
  chip = document.getElementById('detailChip');

  dock.addEventListener('click', ev => {
    const b = ev.target.closest('button');
    if (b && b.dataset.act === 'close') closeDetail();
  });
  chip.addEventListener('click', () => {
    floatOpen = true;
    floatPos = null;          // re-anchor to whichever dot the chip is on now
    renderFloat();
  });
  floater.addEventListener('click', ev => {
    const b = ev.target.closest('button');
    if (b && b.dataset.act === 'close') { floatOpen = false; floater.hidden = true; }
  });
  bindFloatDrag();
  addEventListener('keydown', ev => { if (ev.key === 'Escape') closeDetail(); });
  addEventListener('resize', () => { if (floatOpen && floatPos) placeFloat(); });
}
