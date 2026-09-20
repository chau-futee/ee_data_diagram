/* =============================================================================
   chainview.js — the dependency chain ON THE TIMELINE.

   Everything a reader sees of a chain lives here: the connectors drawn over
   the lanes, the stub that leaves the window, the badge on a one-sided link,
   the dimming of everything not in the chain, and the controls and notes this
   file contributes to the record panel. It asks
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
   track IN THE OFF-WINDOW RECORD'S OWN LANE, tagged with its name and month.
   It ends at the boundary rather than at a position, because that record has
   no position in this window. The window is never changed for the reader; the
   panel lists what is off-window so the count is checkable.

   POSITIONS ARE MEASURED, NOT COMPUTED. Marker x comes from the layout pass in
   ui.js, which nudges labels and stretches lanes, and from the horizontal
   scroller. Rather than duplicate that arithmetic, this file reads the boxes
   every frame while a chain is open and redraws only when they have actually
   moved — the same approach, and for the same reason, as the detail chip.
   ============================================================================= */

import { esc, eventName, monthYearLabel, absMonthIn, spanMonths } from './config.js';
import { win } from './ui.js';
import { chainFor, missingSide, EDGE_SOURCE } from './chain.js';
import { registerPanelSection, refreshPanel } from './detail.js';

/* ---- state ---------------------------------------------------------------- */

let ROOT = null;            // the record the chain is drawn for, or null
let MODE = 'direct';        // 'direct' (1 hop) | 'full' (everything connected)
let MODEL = null;           // the last answer from chain.js
let overlay, pop;
let raf = 0, sig = '';

const HOPS = { direct: 1, full: Infinity };

/* Two-sided links are drawn in ink, one-sided links in the amber this page
   already uses for a data caveat (.dt-warn). Colour carries whether the data
   agrees with itself; the dash carries whether the link leaves the window. */
const INK = '#42506b';
const WARN = '#B07A28';

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
  return { x: r.left - base.left + r.width / 2, y: r.top - base.top + r.height / 2 };
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
    y: (r.top + r.bottom) / 2 - base.top,
    side: before ? 'left' : 'right'
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

/* Halfway along, near enough: the badge only has to sit on its own line and
   clear of the dots at either end. */
const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 6 });

function drawOverlay(lanes, base, seen) {
  /* isConnected, not just null: a redraw empties #lanes, which detaches the
     overlay without clearing this reference. Testing only for null left a live
     element that belonged to nothing and painted nowhere. */
  if (!overlay || !overlay.isConnected) {
    overlay = document.createElement('div');
    overlay.className = 'chainoverlay';
    overlay.addEventListener('click', onBadge);
    overlay.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onBadge(ev); }
    });
    /* First child, so the lines paint UNDER the markers rather than across
       them — the same reason mountNowLine() inserts its rule here. */
    lanes.insertBefore(overlay, lanes.firstChild);
  }
  const w = lanes.offsetWidth, h = lanes.offsetHeight;
  let paths = '', badges = '', tags = '';

  MODEL.edges.forEach((edge, i) => {
    const a = seen.get(edge.from), b = seen.get(edge.to);
    const colour = edge.oneSided ? WARN : INK;
    let from = null, to = null, dashed = false, tag = null;

    if (a && b) {
      from = a; to = b;
    } else if (a && !b) {
      /* the successor is outside the window: run to the edge of ITS lane */
      to = laneEdge(edge.to, base); from = a; dashed = true; tag = { at: to, e: edge.to };
    } else if (!a && b) {
      from = laneEdge(edge.from, base); to = b; dashed = true; tag = { at: from, e: edge.from };
    }
    if (!from || !to) return;    // both ends outside the window: the panel says so

    paths += `<path d="${curve(from, to)}" fill="none" stroke="${colour}" stroke-width="1.6"`
          + (dashed ? ' stroke-dasharray="5 4"' : '')
          + ` opacity=".85" marker-end="url(#chainArrow)"/>`;

    if (tag) {
      const anchor = tag.at.side === 'left' ? 'start' : 'end';
      const dx = tag.at.side === 'left' ? 10 : -10;
      tags += `<text x="${tag.at.x + dx}" y="${tag.at.y + 17}" text-anchor="${anchor}"`
           + ` font-size="10" font-weight="600" fill="${colour}">`
           + `${esc(eventName(tag.e))} · ${esc(monthYearLabel(tag.e))}</text>`;
    }

    if (edge.oneSided || edge.ambiguous) {
      const p = midpoint(from, to);
      badges += `<g class="chainbadge" data-edge="${i}" tabindex="0" role="button"`
             + ` aria-label="Data note about this link">`
             + `<circle cx="${p.x}" cy="${p.y}" r="7.5" fill="#fdf7ec" stroke="${WARN}" stroke-width="1"/>`
             + `<text x="${p.x}" y="${p.y + 3.5}" text-anchor="middle" font-size="10"`
             + ` font-weight="700" fill="${WARN}">!</text></g>`;
    }
  });

  overlay.innerHTML =
    `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="false">`
    + `<defs><marker id="chainArrow" viewBox="0 0 10 10" refX="9" refY="5"`
    + ` markerWidth="5" markerHeight="5" orient="auto-start-reverse">`
    + `<path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" stroke-width="1.6"`
    + ` stroke-linecap="round" stroke-linejoin="round"/></marker></defs>`
    + paths + tags + badges + `</svg>`;
}

/* ---- the badge note ---------------------------------------------------------
   The wording lives here rather than in chain.js: that file states which record
   is silent, this one says it in a sentence. */

function noteFor(edge) {
  const lines = [];
  const miss = missingSide(edge);
  if (miss) {
    lines.push(`<b>Recorded on one side only.</b> `
      + `${esc(eventName(miss.recordedOn))} lists this link in its `
      + `${miss.field === 'downDeps' ? 'downward' : 'upward'} dependencies, but `
      + `${esc(eventName(miss.silent))} does not list it in its `
      + `${miss.missingField === 'upDeps' ? 'upward' : 'downward'} dependencies.`);
    lines.push(EDGE_SOURCE === 'union'
      ? `It is drawn because the chain reads both directions of the file. It may be `
        + `an incomplete entry, or it may be deliberate — the data does not say which.`
      : `It is drawn from one end only, because the chain reads each record's own fields.`);
  }
  if (edge.ambiguous) {
    lines.push(`<b>Ambiguous target.</b> `
      + `"${esc(String(edge.deps[0] && edge.deps[0].event || edge.deps[0]))}" matches `
      + `${edge.candidates} milestones, and every match is shown.`);
  }
  return lines.map(l => `<p>${l}</p>`).join('');
}

function onBadge(ev) {
  const g = ev.target.closest('.chainbadge');
  if (!g) return;
  const edge = MODEL && MODEL.edges[+g.dataset.edge];
  if (!edge) return;
  showPop(g.getBoundingClientRect(), noteFor(edge));
}

function showPop(at, html) {
  if (!pop) {
    pop = document.createElement('div');
    pop.className = 'chainpop';
    pop.addEventListener('click', e => {
      if (e.target.closest('[data-act="closepop"]')) hidePop();
    });
    document.body.appendChild(pop);
  }
  pop.innerHTML = html
    + `<button type="button" class="chainpop-x" data-act="closepop">Close</button>`;
  pop.hidden = false;
  const w = pop.offsetWidth, h = pop.offsetHeight;
  let x = at.left + at.width / 2 - w / 2;
  let y = at.bottom + 8;
  if (y + h > innerHeight - 8) y = at.top - h - 8;
  pop.style.left = Math.min(Math.max(8, x), innerWidth - w - 8) + 'px';
  pop.style.top = Math.min(Math.max(8, y), innerHeight - h - 8) + 'px';
}

function hidePop() {
  if (pop) { pop.hidden = true; pop.innerHTML = ''; }
}

/* ---- what the panel shows -----------------------------------------------------
   The controls sit beside Close; the notes sit under the header, above the
   three columns. Both are this file's markup — detail.js only places them.

   The notes exist because three things are true of the drawing and cannot be
   read off it: a link recorded on one side only looks like any other link until
   you notice its badge, a member outside the window has no dot to count, and a
   record with no dependencies at all draws nothing, which is indistinguishable
   from a feature that failed. */

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

  if (MODEL.oneSided.length) {
    notes += `<span class="chainnote">${MODEL.oneSided.length} link`
      + `${MODEL.oneSided.length === 1 ? ' is' : 's are'} recorded on one side only. `
      + `Open the <b>!</b> on the line for which record is missing the entry.</span>`;
  }
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
    if (ev.key !== 'Escape') return;
    if (pop && !pop.hidden) hidePop(); else closeChain();
  });
  addEventListener('click', ev => {
    if (pop && !pop.hidden && !pop.contains(ev.target) && !ev.target.closest('.chainbadge')) {
      hidePop();
    }
  }, true);
}
