/* =============================================================================
   chainview.js — the dependency chain ON THE TIMELINE.

   Everything a reader sees of a chain lives here: the connectors drawn over
   the lanes, the stub that leaves the window, the dimming of everything not in
   the chain, and the controls and notes this file contributes to the record
   panel. It asks
   chain.js what the graph says and never works it out itself.

       config.js  <-  ui.js  <-  chain.js  <-  detail.js  <-  chainview.js

   TIMELINE ONLY, by the spec. The ring has no linear axis to draw a connector
   along and no lane to park an off-window stub in, so the action that opens a
   chain reports itself unavailable unless the timeline tab is showing.

   EVERYTHING IS IN THE RECORD PANEL. The reader clicks a marker, the panel
   opens (detail.js), and this file fills a slot in it: the button that draws
   the dependencies, the depth choice beside it, and underneath, whatever the
   drawing cannot say for itself — how many links there are, which of them are
   recorded on one side only, and which members fall outside the window.

   It was briefly split, with the depth choice in a bar under the lanes. That
   bar sat below the fold on a full-height timeline, so a reader could use the
   feature without ever learning the depth choice existed. One place, at the
   record, is the whole point of putting it here. detail.js does not know any
   of this exists: this file registers it.

   OFF-WINDOW MEMBERS. A chain routinely reaches a record the current window
   does not draw — at the 2026-2027 default, CET Planning (Dec 2025) is
   upstream of CET Data Spec Update (Apr 2026) and has no marker to point at.
   The connector is drawn anyway, as a dashed stub running to the edge of the
   track IN THE OFF-WINDOW RECORD'S OWN LANE. It ends at the boundary rather
   than at a position, because that record has no position in this window.

   The stub carries no label. It briefly named the record and its month at the
   boundary, which collided with the marker labels already sitting in that lane
   and made both unreadable. Which lane the stub runs into is the fact worth
   drawing; WHICH record is at the other end is a fact worth reading, so the
   panel names them instead. The window is never changed for the reader.

   POSITIONS ARE MEASURED, NOT COMPUTED. Marker x comes from the layout pass in
   ui.js, which nudges labels and stretches lanes, and from the horizontal
   scroller. Rather than duplicate that arithmetic, this file reads the boxes
   every frame while a chain is open and redraws only when they have actually
   moved — the same approach, and for the same reason, as the detail chip.
   ============================================================================= */

import { esc, eventName, monthYearLabel, absMonthIn, spanMonths } from './config.js';
import { win } from './ui.js';
import { chainFor } from './chain.js';
import { registerPanelSection, refreshPanel } from './detail.js';

/* ---- state ---------------------------------------------------------------- */

let ROOT = null;            // the record the chain is drawn for, or null
let MODE = 'direct';        // 'direct' (1 hop) | 'full' (everything connected)
let MODEL = null;           // the last answer from chain.js
let overlay;
let raf = 0, sig = '';

const HOPS = { direct: 1, full: Infinity };

/* The chain root wears two box-shadow rings (.milestone.chain-root .m-dot),
   which extend 5px past the measured dot and would otherwise swallow a chevron
   placed against its edge. */
const ROOT_RING = 5;
/* Clear air between the dot and the point of the chevron. */
const HEAD_GAP = 5;
/* How long the chevron's own segment is. It only exists to orient the marker,
   so it is short enough to read as an arrowhead rather than a second line. */
const HEAD_LEN = 7;

/* One ink for every link. Colour was briefly doing a second job — marking the
   links recorded on one side only — and between that, the dashes for links
   leaving the window, the arrowheads and the dimming, the lanes had four
   things to read at once. The one-sided count stays, as a sentence in the
   panel, where it does not compete with the drawing. */
const INK = '#42506b';

export const isChainOpen = () => !!ROOT;
const isOpenFor = e => ROOT === e;

/* ---- opening and closing ---------------------------------------------------- */

export function openChain(e) {
  if (!e) return;
  ROOT = e;
  rebuild();
  start();
}

export function closeChain() {
  ROOT = null;
  MODEL = null;
  stop();
  clearMarks();
  refreshPanel();
}

function setMode(m) {
  if (!HOPS[m] || MODE === m) return;
  MODE = m;
  rebuild();
  paint(true);
}

function rebuild() {
  MODEL = ROOT ? chainFor(ROOT, { hops: HOPS[MODE] }) : null;
  refreshPanel();
}

/* Called by main.js after every redraw: the markers this file was pointing at
   have been replaced, so the overlay is rebuilt against the new ones. The
   chain itself does not change — a window change moves dots, not dependencies. */
export function refreshChain() {
  if (!ROOT) return;
  sig = '';                  // force a repaint against the new DOM
  paint(true);
  /* The chain has not changed, but what the panel says about it has: a window
     change moves records in and out of view, so the off-window list is stale. */
  refreshPanel();
}

/* ---- the frame loop --------------------------------------------------------- */

function start() {
  if (!raf) tick();
}

function stop() {
  cancelAnimationFrame(raf);
  raf = 0;
  if (overlay) overlay.remove();
  overlay = null;
  sig = '';
}

function tick() {
  raf = requestAnimationFrame(tick);
  paint(false);
}

/* ---- geometry --------------------------------------------------------------- */

const lanesEl = () => document.getElementById('lanes');

const markerEl = e => e && e._k != null
  ? document.querySelector(`#lanes .milestone[data-k="${e._k}"]`)
  : null;

/* The dot, not the marker box: the marker's box is the dot, but reading the
   dot directly survives any later change to the marker's own padding. */
function dotCentre(e, base) {
  const m = markerEl(e);
  if (!m) return null;
  const el = m.querySelector('.m-dot') || m;
  const r = el.getBoundingClientRect();
  if (!r.height) return null;              // laid out but not showing
  /* The radius matters as much as the centre: there are three dot sizes on the
     lanes — 17px normally, 12px for a crowded marker (data-s="0"), and the
     chain root's two extra rings, which are box-shadows and so do not appear
     in the measured box. Measuring rather than assuming keeps the chevron
     clear of whichever one it is approaching. */
  const ring = m.classList.contains('chain-root') ? ROOT_RING : 0;
  return {
    x: r.left - base.left + r.width / 2,
    y: r.top - base.top + r.height / 2,
    r: r.width / 2 + ring
  };
}

/* Where a stub for an off-window record ends: the edge of that record's own
   lane, on the side of the window the record falls outside. */
function laneEdge(e, base) {
  const track = document.querySelector(`#lanes .lanerow[data-sys="${e.sys}"] .track`);
  if (!track) return null;
  const r = track.getBoundingClientRect();
  if (!r.width) return null;
  const before = absMonthIn(e, win) < 0;
  return {
    x: before ? r.left - base.left + 16 : r.right - base.left - 16,
    y: (r.top + r.bottom) / 2 - base.top
  };
}

const offWindow = e => {
  const mi = absMonthIn(e, win);
  return mi < 0 || mi >= spanMonths(win);
};

/* ---- painting ---------------------------------------------------------------- */

function clearMarks() {
  document.querySelectorAll('#lanes .milestone').forEach(m => {
    m.classList.remove('dim', 'chain-root');
    const d = m.querySelector('.m-dot');
    if (d) d.classList.remove('glow');
  });
}

function paint(force) {
  if (!ROOT || !MODEL) return;
  const lanes = lanesEl();
  if (!lanes || !lanes.offsetWidth) return;
  const base = lanes.getBoundingClientRect();

  /* what to draw, measured */
  const seen = new Map();
  MODEL.nodes.forEach(n => seen.set(n.event, dotCentre(n.event, base)));

  const shape = [lanes.offsetWidth, lanes.offsetHeight, MODE, MODEL.nodes.length]
    .concat(MODEL.nodes.map(n => {
      const p = seen.get(n.event);
      return p ? `${n.event._k}:${p.x | 0},${p.y | 0}` : `${n.event._k}:off`;
    })).join('|');
  if (!force && shape === sig) return;
  sig = shape;

  markMarkers(seen);
  drawOverlay(lanes, base, seen);
}

/* Everything outside the chain steps back; everything inside glows; the record
   the chain was opened from takes the ring. The three classes already exist in
   the stylesheet — .dim and .glow from the old trace, .chain-root is new. */
function markMarkers(seen) {
  const inChain = new Set();
  seen.forEach((_, e) => inChain.add(String(e._k)));
  document.querySelectorAll('#lanes .milestone').forEach(m => {
    const on = inChain.has(m.dataset.k);
    m.classList.toggle('dim', !on);
    m.classList.toggle('chain-root', on && m.dataset.k === String(ROOT._k));
    const d = m.querySelector('.m-dot');
    if (d) d.classList.toggle('glow', on);
  });
}

/* A gentle curve rather than a straight line: several links often share a lane,
   and parallel straight lines between the same two rows are impossible to tell
   apart. The bow is proportional to the horizontal distance, so short links
   stay nearly flat. */
function curve(a, b) {
  const dx = Math.max(24, Math.min(90, Math.abs(b.x - a.x) / 2));
  if (Math.abs(a.y - b.y) < 4) {
    const lift = Math.max(14, Math.min(34, Math.abs(b.x - a.x) / 6));
    return `M${a.x},${a.y} Q${(a.x + b.x) / 2},${a.y - lift} ${b.x},${b.y}`;
  }
  return `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`;
}

function drawOverlay(lanes, base, seen) {
  /* isConnected, not just null: a redraw empties #lanes, which detaches the
     overlay without clearing this reference. Testing only for null left a live
     element that belonged to nothing and painted nowhere. */
  if (!overlay || !overlay.isConnected) {
    overlay = document.createElement('div');
    overlay.className = 'chainoverlay';
    /* First child, so the lines paint UNDER the markers rather than across
       them — the same reason mountNowLine() inserts its rule here. */
    lanes.insertBefore(overlay, lanes.firstChild);
  }
  const w = lanes.offsetWidth, h = lanes.offsetHeight;
  let paths = '';

  MODEL.edges.forEach(edge => {
    const a = seen.get(edge.from), b = seen.get(edge.to);
    let from = null, to = null, dashed = false;

    if (a && b) {
      from = a; to = b;
    } else if (a && !b) {
      /* the successor is outside the window: run to the edge of ITS lane */
      to = laneEdge(edge.to, base); from = a; dashed = true;
    } else if (!a && b) {
      from = laneEdge(edge.from, base); to = b; dashed = true;
    }
    if (!from || !to) return;    // both ends outside the window: the panel says so

    /* No marker-end here. The line runs the whole way to the dot, because
       stopping it short leaves the reader guessing which of several dots it
       was heading for. The chevron is placed separately, back from the end by
       the dot's own radius, in the pass below. */
    paths += `<path class="chainline" d="${curve(from, to)}" fill="none" stroke="${INK}"`
          + ` stroke-width="1.6"${dashed ? ' stroke-dasharray="5 4"' : ''}`
          + ` opacity=".85" data-inset="${(to.r || 0) + HEAD_GAP}"/>`;
  });

  overlay.innerHTML =
    `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="false">`
    + `<defs><marker id="chainArrow" viewBox="0 0 10 10" refX="9" refY="5"`
    + ` markerWidth="5" markerHeight="5" orient="auto-start-reverse">`
    + `<path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" stroke-width="1.6"`
    + ` stroke-linecap="round" stroke-linejoin="round"/></marker></defs>`
    + paths + `</svg>`;

  placeHeads();
}

/* Second pass, once the paths are in the document and the browser can measure
   them. For each line, walk back along it from the end by the inset — the
   target dot's radius plus a gap — and lay a short segment there carrying the
   arrow marker. Using the path's own length means the chevron follows the
   curve's tangent, so it points the way the line actually arrives rather than
   the way the two endpoints happen to line up.

   A stub to the lane edge has no dot at its end and so no inset, which puts
   its chevron at the boundary, where the line stops. */
function placeHeads() {
  const svg = overlay.firstChild;
  if (!svg) return;
  let heads = '';
  svg.querySelectorAll('path.chainline').forEach(path => {
    const len = path.getTotalLength();
    const inset = Math.min(+path.dataset.inset || 0, Math.max(0, len - HEAD_LEN - 2));
    if (len < HEAD_LEN + 2) return;        // too short to carry a head legibly
    const tip = path.getPointAtLength(len - inset);
    const tail = path.getPointAtLength(len - inset - HEAD_LEN);
    heads += `<line x1="${tail.x}" y1="${tail.y}" x2="${tip.x}" y2="${tip.y}"`
          + ` stroke="${INK}" stroke-width="1.9" opacity=".9"`
          + ` marker-end="url(#chainArrow)"/>`;
  });
  svg.insertAdjacentHTML('beforeend', heads);
}

/* ---- what the panel shows -----------------------------------------------------
   The controls sit beside Close; the notes sit under the header, above the
   three columns. Both are this file's markup — detail.js only places them.

   The notes exist because two things are true of the drawing and cannot be
   read off it: a member outside the window has no dot to count, and a record
   with no dependencies draws nothing at all, which is indistinguishable from a
   feature that failed.

   One-sided links are deliberately NOT among them. They are an artefact of the
   file being authored from both ends, and the plan is to make upDeps the source
   of truth and derive downDeps from it — at which point no edge can be recorded
   on one side, and a note about it would be reporting a problem that no longer
   exists. chain.js still flags them, and initChain() still reports the count to
   the console, so the migration can be checked; the reader is not shown it. */

function panelHeadHTML() {
  const on = !!ROOT;
  /* The depth choice only appears when there is something to deepen. A record
     with no dependencies has the same chain at one hop and at every hop, so
     offering the choice would suggest Full chain might find something. */
  const deep = on && MODEL && MODEL.edges.length > 0;
  return `<button type="button" class="dt-act" data-chain="toggle">`
    + `${on ? 'Hide dependencies' : 'Trace dependencies'}</button>`
    + (deep
      ? `<span class="dt-chainmode" role="group" aria-label="How far the chain runs">`
        + `<button type="button" data-chain="direct"${MODE === 'direct' ? ' class="on"' : ''}>`
        + `Direct links</button>`
        + `<button type="button" data-chain="full"${MODE === 'full' ? ' class="on"' : ''}>`
        + `Full chain</button></span>`
      : '');
}

function panelBodyHTML() {
  if (!ROOT || !MODEL) return '';

  if (!MODEL.edges.length) {
    return `<div class="dt-chaininfo"><span class="dt-chaincount">`
      + `No dependencies recorded for this milestone.</span></div>`;
  }

  const off = MODEL.nodes.filter(n => offWindow(n.event));
  let notes = '';

  if (off.length) {
    notes += `<span class="chainnote">Outside this window, drawn to the lane edge: `
      + off.map(n => `${esc(eventName(n.event))} (${esc(monthYearLabel(n.event))})`).join('; ')
      + `. Widen the window to place them.</span>`;
  }
  if (!markerEl(ROOT)) {
    notes += `<span class="chainnote">This milestone is itself outside the selected `
      + `window, so it has no marker to draw from.</span>`;
  }

  const n = MODEL.nodes.length, l = MODEL.edges.length;
  return `<div class="dt-chaininfo">`
    + `<span class="dt-chaincount">${MODE === 'direct' ? 'Direct links' : 'Full chain'}: `
    + `<b>${n}</b> milestone${n === 1 ? '' : 's'} · <b>${l}</b> link${l === 1 ? '' : 's'}</span>`
    + notes + `</div>`;
}

function onPanelClick(btn, e) {
  const act = btn.dataset.chain;
  if (!act) return false;
  if (act === 'toggle') { isOpenFor(e) ? closeChain() : openChain(e); return true; }
  setMode(act);
  return true;
}

/* ---- wiring ------------------------------------------------------------------- */

export function initChainView() {
  /* The only thing detail.js is told: a section exists, when it applies, what
     markup it contributes, and that it will handle its own clicks. It never
     learns what a dependency is. */
  registerPanelSection({
    id: 'chain',
    isAvailable: () => {
      const t = document.getElementById('time');
      return !!t && t.classList.contains('active');
    },
    headHTML: panelHeadHTML,
    bodyHTML: panelBodyHTML,
    onClick: onPanelClick
  });

  addEventListener('keydown', ev => {
    if (ev.key === 'Escape') closeChain();
  });
}
