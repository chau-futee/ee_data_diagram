/* =============================================================================
   ui.js — everything that is chrome rather than a view.

   Tooltip, tab switching, the overlap/fill layout passes, the month grid, the
   timeline toolbar, the dependency-chain trace, and the current-date line
   (which you asked to fold in here rather than keep as nowline.js).

   Imports config only. The four view files import FROM here — never the other
   way round — which is what keeps the dependency graph acyclic.

   Was: lines 707-831 (current date), 833-1026 (layout, grid, controls, chain,
   tooltip, show) of data_donut_concept_4_1.html.
   ============================================================================= */

import {
  months, year, SPAN, RING, DEG_PER_MONTH, NOW_COL, chainIds, VIEWS,
  NUDGE_OVERLAP, MIN_CELL, MIN_GAP, LABEL_W, PAD, LANE_MAX, RESERVE, polar
} from './config.js';

/* ---------------------------------------------------------------- tooltip -- */

let tipEl = null;
const tip = () => (tipEl ||= document.getElementById('tip'));

export function showTip(ev, html) {
  const t = tip();
  t.innerHTML = html;
  t.style.opacity = 1;
  let x = ev.clientX + 14, y = ev.clientY + 14;
  if (x > innerWidth - 250) x = ev.clientX - 250;
  t.style.left = x + 'px';
  t.style.top = y + 'px';
}

export function hideTip() { tip().style.opacity = 0; }

/* ------------------------------------------------------------ view switch -- */

export function show(v) {
  Object.entries(VIEWS).forEach(([view, btn]) => {
    document.getElementById(view).classList.toggle('active', view === v);
    document.getElementById(btn).classList.toggle('active', view === v);
  });
  layoutAll();
}

/* ------------------------------------------------------- overlap avoidance --
   Runs in pixel space, so it must re-run whenever the track's width changes
   (resize, tab switch) — a hidden track measures zero and cannot be laid out.
   Pass 1: walk markers left->right; if a dot would land closer than MIN_GAP to
           the previous one, push it right just far enough to clear.
   Pass 2: drop each label to the highest row clear of the labels already
           placed, and nudge labels away from the track edges, counter-shifting
           the leader line so it stays under its own dot.
   ---------------------------------------------------------------------------- */

export function layoutTrack(track) {
  const W = track.clientWidth;
  if (!W) return;
  const ms = [...track.querySelectorAll('.milestone')]
    .map(el => ({ el, lbl: el.querySelector('.m-lbl'), x0: parseFloat(el.dataset.pct) / 100 * W }))
    .sort((a, b) => a.x0 - b.x0);

  let prev = -Infinity;
  ms.forEach(o => {
    let x = o.x0;
    if (NUDGE_OVERLAP && x < prev + MIN_GAP) x = prev + MIN_GAP;
    prev = x; o.x = x;
    o.el.style.left = x.toFixed(1) + 'px';
    o.el.classList.toggle('nudged', x - o.x0 > 0.5);
  });

  // Pass 2 considers ONLY labels actually painted: s:1 always, plus s:0 when
  // the reveal-all toggle is on. Hidden labels must not reserve space, or a
  // lane full of s:0 markers would grow tall around nothing.
  const showAll = document.getElementById('lanes').classList.contains('showall');
  const placed = []; let maxBottom = 0;
  ms.filter(o => o.lbl && (o.el.dataset.s !== '0' || showAll)).forEach(o => {
    o.el.style.setProperty('--off', '0px');
    const half = LABEL_W / 2;
    let dx = 0;
    if (o.x - half < 0) dx = half - o.x;
    else if (o.x + half > W) dx = W - (o.x + half);
    const lo = o.x + dx - half, hi = o.x + dx + half;
    const h = o.lbl.offsetHeight || 12;
    let y = 0, moved = true, guard = 0;
    while (moved && guard++ < 80) {
      moved = false;
      for (const p of placed) {
        if (lo < p.right + PAD && hi > p.left - PAD && y < p.bottom + 2 && y + h > p.top - 2) {
          y = p.bottom + 3; moved = true;
        }
      }
    }
    placed.push({ left: lo, right: hi, top: y, bottom: y + h });
    maxBottom = Math.max(maxBottom, y + h);
    o.el.style.setProperty('--off', y.toFixed(1) + 'px');
    o.el.style.setProperty('--dx', dx.toFixed(1) + 'px');
  });
  track.style.height = Math.max(82, 40 + maxBottom) + 'px';
}

export function layoutAll() {
  document.querySelectorAll('#time.active .track:not(.empty)').forEach(layoutTrack);
  updateGrid();
  fillLanes();
}

/* ---------------------------------------------------------- vertical fill --
   layoutTrack() gives each lane the height its labels need. Anything left over
   between the last lane and the bottom of the window is shared out evenly.
   Lanes never shrink below the height their labels need, and never grow past
   LANE_MAX — past that they read as unrelated bands rather than one chart.
   ---------------------------------------------------------------------------- */

function fillLanes() {
  const time = document.getElementById('time');
  if (!time || !time.classList.contains('active')) return;
  const lanes = document.getElementById('lanes');
  const tracks = [...lanes.querySelectorAll('.track')];
  if (!tracks.length) return;
  const nat = tracks.map(t => t.classList.contains('empty')
    ? 52
    : (parseFloat(t.style.height) || t.getBoundingClientRect().height));
  const top = lanes.getBoundingClientRect().top;
  const avail = window.innerHeight - top - RESERVE;
  const total = nat.reduce((a, b) => a + b, 0);
  const spare = avail - total;
  if (!(spare > 8)) {                       // nothing to give away — restore natural
    tracks.forEach(t => { if (t.classList.contains('empty')) t.style.height = ''; });
    return;
  }
  const per = spare / tracks.length;
  tracks.forEach((t, i) => {
    t.style.height = Math.min(nat[i] + per, LANE_MAX).toFixed(0) + 'px';
  });
}

/* ------------------------------------------------------------- month grid --
   buildGrid() runs once. updateGrid() re-decides on every layout pass (load,
   resize, zoom change, tab switch) because the deciding number — the pixel
   width of one month — changes with all four.
   ---------------------------------------------------------------------------- */

let gridWanted = false;

function buildGrid() {
  const lanes = document.getElementById('lanes');
  if (lanes.querySelector('.gridoverlay')) return;
  const ov = document.createElement('div');
  ov.className = 'gridoverlay';
  ov.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < SPAN; i++) {
    const c = document.createElement('i');
    if (i % 12 === 0) c.className = 'ystart';
    ov.appendChild(c);
  }
  lanes.insertBefore(ov, lanes.firstChild);
}

function monthCellPx() {
  const t = document.querySelector('#lanes .track:not(.empty)');
  return t && t.clientWidth ? t.clientWidth / SPAN : 0;
}

function updateGrid() {
  const lanes = document.getElementById('lanes');
  const btn = document.getElementById('gridBtn');
  const hint = document.getElementById('gridHint');
  if (!btn) return;
  const cell = monthCellPx();
  const fits = cell >= MIN_CELL;
  btn.disabled = !fits;
  const on = gridWanted && fits;
  lanes.classList.toggle('grid', on);
  btn.classList.toggle('on', on);
  hint.textContent = !fits && cell
    ? `Month grid off — a month is only ${cell.toFixed(0)}px wide here (needs ${MIN_CELL}px). Zoom in or widen the window.`
    : '';
}

/* -------------------------------------------------------- chain highlight -- */

let chainOn = false;

function toggleChain() {
  chainOn = !chainOn;
  document.getElementById('chainBtn').classList.toggle('on', chainOn);
  document.querySelectorAll('.milestone').forEach(m => {
    /* !! matters. dataset.id is undefined on most markers, so `chainOn &&
       inChain` yields undefined rather than false — and classList.toggle()
       treats an undefined second argument as "no force given", flipping the
       class unconditionally. Every dot glowed. Carried over from the original;
       caught by smoke-test.mjs. */
    const inChain = !!(m.dataset.id && chainIds.has(m.dataset.id));
    m.classList.toggle('dim', chainOn && !inChain);
    m.querySelector('.m-dot').classList.toggle('glow', chainOn && inChain);
  });
}

/* ------------------------------------------------------ current-date line --
   A day-precise "you are here" marker on both views. Draggable as a probe, and
   always resettable to the real today.

   GEOMETRY. The month axis is 36 equal cells, so a day is placed inside its
   month cell proportionally rather than by true day-count across the window:
       pct = (absMonth + (day-1)/daysInMonth) / SPAN
   Calendar months are unequal, so this is NOT days-elapsed/days-total; over 36
   months the two differ by at most ~1.5 days.

   THE RING LINE IS DISPLAY-ONLY, deliberately. Ring slots 0-11 are each shared
   by two calendar months (36 folded into 24), so a drag on the ring cannot
   resolve to a single date. Dragging happens on the timeline, where the date is
   unambiguous; the ring mirrors it.

   Call AFTER drawTimeline() and drawDonut() — it inserts into #lanes and #donut.
   ---------------------------------------------------------------------------- */

export function initNowLine() {
  const flag  = document.getElementById('nowFlag');
  const track = document.getElementById('nowTrack');
  const lanes = document.getElementById('lanes');
  const hint  = document.getElementById('nowHint');

  const line = document.createElement('div');
  line.className = 'nowoverlay';
  line.setAttribute('aria-hidden', 'true');
  line.innerHTML = '<div class="nowline"></div>';
  lanes.insertBefore(line, lanes.firstChild);   // first child => painted under the markers
  const rule = line.querySelector('.nowline');

  const ringSvg = document.getElementById('donut');
  ringSvg.insertAdjacentHTML('beforeend', '<g id="ringNow" aria-hidden="true"></g>');
  const ringNow = document.getElementById('ringNow');

  /* --- date <-> position --- */
  const dim = (y, m) => new Date(y, m + 1, 0).getDate();          // m is 0-based
  const absM = d => (d.getFullYear() - year[0]) * 12 + d.getMonth();
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const fmt = d => `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  const fmtShort = d => `${d.getMonth() + 1}/${d.getDate()}`;
  const fmtMY = d => `${d.getMonth() + 1}/${String(d.getFullYear()).slice(-2)}`;

  const dateToPct = d =>
    (absM(d) + (d.getDate() - 1) / dim(d.getFullYear(), d.getMonth())) / SPAN * 100;

  function pctToDate(p) {
    const x = Math.min(SPAN - 1e-9, Math.max(0, p / 100 * SPAN));
    const am = Math.floor(x), fr = x - am;
    const y = year[0] + Math.floor(am / 12), mo = am % 12;
    return new Date(y, mo, Math.min(dim(y, mo), Math.floor(fr * dim(y, mo)) + 1));
  }
  const inWindow = d => absM(d) >= 0 && absM(d) < SPAN;

  /* If today falls outside the window the marker pins to the nearest edge and
     says so, rather than silently vanishing or drawing off-track. */
  const now = new Date();
  const realToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const outside = !inWindow(realToday);
  const homeDate = outside
    ? (absM(realToday) < 0 ? new Date(year[0], 0, 1) : new Date(year[year.length - 1], 11, 31))
    : realToday;

  let current = new Date(homeDate);

  function drawRing() {
    const { cx, cy, rOuter, rInner } = RING;
    const ringPos = (absM(current)
      + (current.getDate() - 1) / dim(current.getFullYear(), current.getMonth())) % 24;
    const ang = ringPos * DEG_PER_MONTH;
    const col = sameDay(current, realToday) && !outside ? NOW_COL.today : NOW_COL.moved;
    const [x1, y1] = polar(cx, cy, rInner - 10, ang), [x2, y2] = polar(cx, cy, rOuter + 10, ang);
    const [tx, ty] = polar(cx, cy, rOuter + 42, ang);
    ringNow.innerHTML =
        `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="2"
               stroke-dasharray="5 4" opacity=".75"/>`
      + `<circle cx="${x2}" cy="${y2}" r="4" fill="${col}"/>`
      + `<text x="${tx}" y="${ty}" font-size="11" font-weight="700" fill="${col}"
               text-anchor="middle" dominant-baseline="middle">${fmtMY(current)}</text>`;
  }

  function render() {
    const pct = dateToPct(current);
    const isToday = sameDay(current, homeDate) && !outside;
    flag.style.left = pct + '%';
    rule.style.left = pct + '%';
    flag.textContent = fmtShort(current);
    flag.classList.toggle('nowmoved', !isToday);
    rule.parentElement.classList.toggle('nowmoved', !isToday);
    flag.setAttribute('aria-valuetext', (isToday ? 'Today, ' : '') + fmt(current));
    hint.textContent = outside
      ? `Today (${fmt(realToday)}) is outside the ${year[0]}\u2013${year[year.length - 1]} window \u2014 marker pinned to the nearest edge.`
      : '';
    drawRing();
    const rl = document.getElementById('ringNowLine');
    if (rl) rl.innerHTML =
        `The dashed spoke marks <b>${fmt(current)}</b>. It is display-only here — for the reason above, `
      + `an angle cannot resolve to one date. Move it on the <b>Timeline detail</b> tab.`;
  }

  const setDate = d => { current = new Date(d); render(); };
  const setPct = p => setDate(pctToDate(Math.max(0, Math.min(100, p))));

  /* --- drag --- */
  let dragging = false;
  flag.addEventListener('pointerdown', e => {
    dragging = true;
    try { flag.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault();
  });
  flag.addEventListener('pointermove', e => {
    if (!dragging) return;
    const r = track.getBoundingClientRect();
    if (!r.width) return;                      // hidden or unmeasured track
    setPct((e.clientX - r.left) / r.width * 100);
  });
  const stop = e => {
    if (dragging) {
      dragging = false;
      try { flag.releasePointerCapture(e.pointerId); } catch (_) {}
    }
  };
  flag.addEventListener('pointerup', stop);
  flag.addEventListener('pointercancel', stop);

  /* --- keyboard: arrows by a day, shift+arrows by a month, Home for today --- */
  flag.addEventListener('keydown', e => {
    const step = e.shiftKey ? 'month' : 'day';
    const d = new Date(current);
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      step === 'day' ? d.setDate(d.getDate() - 1) : d.setMonth(d.getMonth() - 1);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      step === 'day' ? d.setDate(d.getDate() + 1) : d.setMonth(d.getMonth() + 1);
    } else if (e.key === 'Home') {
      setDate(homeDate); e.preventDefault(); return;
    } else return;
    e.preventDefault();
    if (inWindow(d)) setDate(d);
  });

  render();
}

/* ------------------------------------------------------------ wiring up ----
   The five inline on* attributes that used to live in index.html (four tab
   buttons and the chain button) are bound here instead.

   Zoom widens the track without touching the data, which is the cheapest way
   to relieve crowding: at "1 year" each month gets ~3x the pixels.
   ---------------------------------------------------------------------------- */

export function initUI() {
  Object.entries(VIEWS).forEach(([view, btn]) => {
    document.getElementById(btn).addEventListener('click', () => show(view));
  });

  document.getElementById('chainBtn').addEventListener('click', toggleChain);

  const grp = document.getElementById('zoomGrp');
  grp.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    [...grp.querySelectorAll('button')].forEach(x => x.classList.toggle('on', x === b));
    document.querySelector('.tlgrid').style.setProperty('--zoom', b.dataset.z);
    layoutAll();
  });

  buildGrid();
  document.getElementById('gridBtn')
    .addEventListener('click', () => { gridWanted = !gridWanted; updateGrid(); });

  const all = document.getElementById('allLbl');
  all.addEventListener('click', () => {
    const on = document.getElementById('lanes').classList.toggle('showall');
    all.classList.toggle('on', on);
    all.textContent = on ? 'Hide crowded labels' : 'Show all labels';
    layoutAll();
  });

  addEventListener('load', layoutAll);
  addEventListener('resize', () => {
    clearTimeout(window.__rl);
    window.__rl = setTimeout(layoutAll, 120);
  });
}
