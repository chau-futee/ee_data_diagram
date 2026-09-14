/* =============================================================================
   ui.js — everything that is chrome rather than a view.

   Holds the shared TIME WINDOW state, the window picker that appears on both
   the timeline and the ring tabs, the tooltip, tab switching, the layout
   passes, the month grid, the dependency-chain trace, and the current-date
   line.

   Imports config only. The four view files import FROM here — never the other
   way round — which is what keeps the dependency graph acyclic. main.js
   subscribes to onWindowChange() and does the redrawing.
   ============================================================================= */

import {
  months, RING, NOW_COL, chainIds, VIEWS,
  NUDGE_OVERLAP, MIN_CELL, MIN_GAP, LABEL_W, PAD, LANE_MAX, RESERVE, polar,
  WINDOW_SPANS, DEFAULT_WINDOW_YEARS, defaultStartYear, clampWindow,
  spanMonths, windowLabel, degPerMonth, firstYear, lastYear
} from './config.js';

/* ======================================================== the time window ==
   One object, one setter, one notification. Both visuals read this, so they
   cannot show different periods — which is the whole point of the feature.
   ========================================================================== */

export const win = clampWindow({ startYear: defaultStartYear(), years: DEFAULT_WINDOW_YEARS });

const windowListeners = [];
export const onWindowChange = fn => windowListeners.push(fn);

export function setWindow(patch) {
  const next = clampWindow({ ...win, ...patch });
  const changed = next.startYear !== win.startYear || next.years !== win.years;
  win.startYear = next.startYear;
  win.years = next.years;
  syncWindowControls();                       // always, so a clamped click still updates the label
  if (changed) windowListeners.forEach(fn => fn(win));
}

/* ---- the picker ------------------------------------------------------------
   Rendered into every [data-winbar] container — currently one on the timeline
   tab and one on the ring tab. Both are wired to the same state, so moving one
   moves the other.
   ---------------------------------------------------------------------------- */

function windowBarHTML() {
  return '<span class="hint">Window</span>'
    + '<span class="grp" data-winspan>'
    + WINDOW_SPANS.map(y =>
        `<button type="button" data-y="${y}">${y} year${y > 1 ? 's' : ''}</button>`).join('')
    + '</span>'
    + '<span class="grp winnav">'
    + '<button type="button" data-step="-1" aria-label="Earlier years">\u25C0</button>'
    + '<span class="winlbl" aria-live="polite"></span>'
    + '<button type="button" data-step="1" aria-label="Later years">\u25B6</button>'
    + '</span>';
}

function syncWindowControls() {
  document.querySelectorAll('[data-winbar]').forEach(bar => {
    bar.querySelectorAll('[data-winspan] button').forEach(b => {
      b.classList.toggle('on', +b.dataset.y === win.years);
    });
    const lbl = bar.querySelector('.winlbl');
    if (lbl) lbl.textContent = windowLabel(win);
    const back = bar.querySelector('[data-step="-1"]');
    const fwd  = bar.querySelector('[data-step="1"]');
    if (back) back.disabled = win.startYear <= firstYear;
    if (fwd)  fwd.disabled  = win.startYear + win.years - 1 >= lastYear;
  });
}

function initWindowControls() {
  document.querySelectorAll('[data-winbar]').forEach(bar => {
    bar.classList.add('winbar');
    bar.innerHTML = windowBarHTML();
    bar.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      if (b.dataset.y)    setWindow({ years: +b.dataset.y });
      if (b.dataset.step) setWindow({ startYear: win.startYear + (+b.dataset.step) });
    });
  });
  syncWindowControls();
}

/* ================================================================ tooltip == */

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

/* ============================================================ view switch == */

export function show(v) {
  Object.entries(VIEWS).forEach(([view, btn]) => {
    document.getElementById(view).classList.toggle('active', view === v);
    document.getElementById(btn).classList.toggle('active', view === v);
  });
  layoutAll();
}

/* ===================================================== overlap avoidance ==
   Runs in pixel space, so it must re-run whenever the track's width changes
   (resize, tab switch, window change) — a hidden track measures zero and
   cannot be laid out.
   ========================================================================== */

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
  // the reveal-all toggle is on. Hidden labels must not reserve space.
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

/* ---------------------------------------------------------- vertical fill -- */

/* The detail dock is fixed to the bottom of the window, so the lanes have less
   height to grow into while it is open. It reports its own height here rather
   than fillLanes() measuring a panel it should not have to know about. */
let extraReserve = 0;
export function setExtraReserve(px) {
  const next = Math.max(0, px | 0);
  if (next === extraReserve) return;
  extraReserve = next;
  document.body.style.paddingBottom = next ? next + 'px' : '';
  layoutAll();
}

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
  const avail = window.innerHeight - top - RESERVE - extraReserve;
  const total = nat.reduce((a, b) => a + b, 0);
  const spare = avail - total;
  if (!(spare > 8)) {
    tracks.forEach(t => { if (t.classList.contains('empty')) t.style.height = ''; });
    return;
  }
  const per = spare / tracks.length;
  tracks.forEach((t, i) => {
    t.style.height = Math.min(nat[i] + per, LANE_MAX).toFixed(0) + 'px';
  });
}

/* ------------------------------------------------------------- month grid --
   buildGrid() is now rebuilt on every redraw rather than built once, because
   the number of cells follows the window: 12, 24 or 36.
   ---------------------------------------------------------------------------- */

let gridWanted = true;

export function buildGrid() {
  const lanes = document.getElementById('lanes');
  const old = lanes.querySelector('.gridoverlay');
  if (old) old.remove();
  const ov = document.createElement('div');
  ov.className = 'gridoverlay';
  ov.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < spanMonths(win); i++) {
    const c = document.createElement('i');
    if (i % 12 === 0) c.className = 'ystart';
    ov.appendChild(c);
  }
  lanes.insertBefore(ov, lanes.firstChild);
}

function monthCellPx() {
  const t = document.querySelector('#lanes .track:not(.empty)');
  return t && t.clientWidth ? t.clientWidth / spanMonths(win) : 0;
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
    ? `Month grid off — a month is only ${cell.toFixed(0)}px wide here (needs ${MIN_CELL}px). Pick a shorter window or widen the browser.`
    : '';
}

/* -------------------------------------------------------- chain highlight -- */

let chainOn = false;

export function applyChain() {
  document.getElementById('chainBtn').classList.toggle('on', chainOn);
  document.querySelectorAll('.milestone').forEach(m => {
    /* !! matters. dataset.id is undefined on most markers, so `chainOn &&
       inChain` yields undefined rather than false — and classList.toggle()
       treats an undefined second argument as "no force given", flipping the
       class unconditionally. Every dot glowed. */
    const inChain = !!(m.dataset.id && chainIds.has(m.dataset.id));
    m.classList.toggle('dim', chainOn && !inChain);
    m.querySelector('.m-dot').classList.toggle('glow', chainOn && inChain);
  });
}

function toggleChain() {
  chainOn = !chainOn;
  applyChain();
}

/* ====================================================== current-date line ==
   A day-precise "you are here" marker on both views.

   GEOMETRY. The month axis is equal cells, so a day is placed inside its month
   cell proportionally rather than by true day-count across the window:
       pct = (monthIndexInWindow + (day-1)/daysInMonth) / spanMonths
   Calendar months are unequal, so this is NOT days-elapsed/days-total.

   OUT OF WINDOW. With a selectable window, today is often outside it — pick
   2028 while it is 2026 and there is no honest position for the marker. It
   then hides on the ring and pins to the nearest edge on the timeline, saying
   which, rather than drawing somewhere it does not belong.

   THE RING LINE IS DISPLAY-ONLY. Dragging happens on the timeline, where the
   axis is linear and a position resolves to one date.
   ========================================================================== */

let nowFlag, nowTrack, nowHint, nowRule, ringNow, nowBound = false;
let currentDate = null;

const dim = (y, m) => new Date(y, m + 1, 0).getDate();          // m is 0-based
const absM = d => (d.getFullYear() - win.startYear) * 12 + d.getMonth();
const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear()
  && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const fmt = d => `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
/* The callout on BOTH views. It used to read m/d on the timeline and m/yy on
   the ring, which put the same marker in two formats that happened to look
   alike — 9/10 and 9/26 differ only in what the second number means. */
const fmtTag = d => `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(-2)}`;
const inWin = d => absM(d) >= 0 && absM(d) < spanMonths(win);

const today = (() => {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
})();

function homeDate() {
  if (inWin(today)) return today;
  return absM(today) < 0
    ? new Date(win.startYear, 0, 1)
    : new Date(win.startYear + win.years - 1, 11, 31);
}

const dateToPct = d =>
  (absM(d) + (d.getDate() - 1) / dim(d.getFullYear(), d.getMonth())) / spanMonths(win) * 100;

function pctToDate(p) {
  const span = spanMonths(win);
  const x = Math.min(span - 1e-9, Math.max(0, p / 100 * span));
  const am = Math.floor(x), fr = x - am;
  const y = win.startYear + Math.floor(am / 12), mo = am % 12;
  return new Date(y, mo, Math.min(dim(y, mo), Math.floor(fr * dim(y, mo)) + 1));
}

/* Insert the line into the freshly drawn lanes and ring, then render.
   Call after drawTimeline() and drawDonut() — on first load and every redraw. */
export function mountNowLine() {
  nowFlag  = document.getElementById('nowFlag');
  nowTrack = document.getElementById('nowTrack');
  nowHint  = document.getElementById('nowHint');
  const lanes = document.getElementById('lanes');

  const line = document.createElement('div');
  line.className = 'nowoverlay';
  line.setAttribute('aria-hidden', 'true');
  line.innerHTML = '<div class="nowline"></div>';
  lanes.insertBefore(line, lanes.firstChild);   // first child => painted under the markers
  nowRule = line.querySelector('.nowline');

  document.getElementById('donut')
    .insertAdjacentHTML('beforeend', '<g id="ringNow" aria-hidden="true"></g>');
  ringNow = document.getElementById('ringNow');

  /* keep the probe date if it still fits the new window, else go home */
  if (!currentDate || !inWin(currentDate)) currentDate = homeDate();

  if (!nowBound) bindNowLine();
  renderNowLine();
}

function drawRingSpoke() {
  const { cx, cy, rOuter, rInner } = RING;
  if (!inWin(today) && sameDay(currentDate, homeDate())) { ringNow.innerHTML = ''; return; }
  const pos = absM(currentDate)
    + (currentDate.getDate() - 1) / dim(currentDate.getFullYear(), currentDate.getMonth());
  const ang = pos * degPerMonth(win);
  const col = sameDay(currentDate, today) ? NOW_COL.today : NOW_COL.moved;
  const [x1, y1] = polar(cx, cy, rInner - 10, ang), [x2, y2] = polar(cx, cy, rOuter + 10, ang);
  const [tx, ty] = polar(cx, cy, rOuter + 60, ang);   // outside the year labels at +42
  ringNow.innerHTML =
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="2"
             stroke-dasharray="5 4" opacity=".75"/>`
    + `<circle cx="${x2}" cy="${y2}" r="4" fill="${col}"/>`
    + `<text x="${tx}" y="${ty}" font-size="11" font-weight="700" fill="${col}"
             text-anchor="middle" dominant-baseline="middle">${fmtTag(currentDate)}</text>`;
}

function renderNowLine() {
  const home = homeDate();
  const outside = !inWin(today);
  const pct = dateToPct(currentDate);
  const isHome = sameDay(currentDate, home) && !outside;

  nowFlag.style.left = pct + '%';
  nowRule.style.left = pct + '%';
  nowFlag.textContent = fmtTag(currentDate);
  nowFlag.classList.toggle('nowmoved', !isHome);
  nowRule.parentElement.classList.toggle('nowmoved', !isHome);
  nowFlag.setAttribute('aria-valuetext', (isHome ? 'Today, ' : '') + fmt(currentDate));
  /* Lives in the view's description box rather than the toolbar. Writing an
     empty string is what hides it: `.note li:empty{display:none}` does the
     rest, so there is no `hidden` attribute for the markup and this function
     to disagree about. */
  nowHint.classList.toggle('outofwindow', outside);
  nowHint.innerHTML = outside
    ? `Today (<b>${fmt(today)}</b>) is outside <b>${windowLabel(win)}</b> — the date handle is `
      + 'pinned to the nearest edge of this window, and the ring draws no spoke.'
    : '';

  drawRingSpoke();

  const rl = document.getElementById('ringNowLine');
  if (rl) rl.innerHTML = (!inWin(today) && sameDay(currentDate, home))
    ? `Today falls outside <b>${windowLabel(win)}</b>, so no spoke is drawn. Move the handle on the `
      + `<b>Timeline detail</b> tab to probe a date inside this window.`
    : `The dashed spoke marks <b>${fmt(currentDate)}</b>. It is display-only here — move it on the `
      + `<b>Timeline detail</b> tab, where the axis is linear.`;
}

function setDate(d) { currentDate = new Date(d); renderNowLine(); }

function bindNowLine() {
  nowBound = true;
  let dragging = false;

  nowFlag.addEventListener('pointerdown', e => {
    dragging = true;
    try { nowFlag.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault();
  });
  nowFlag.addEventListener('pointermove', e => {
    if (!dragging) return;
    const r = nowTrack.getBoundingClientRect();
    if (!r.width) return;                      // hidden or unmeasured track
    setDate(pctToDate(Math.max(0, Math.min(100, (e.clientX - r.left) / r.width * 100))));
  });
  const stop = e => {
    if (dragging) {
      dragging = false;
      try { nowFlag.releasePointerCapture(e.pointerId); } catch (_) {}
    }
  };
  nowFlag.addEventListener('pointerup', stop);
  nowFlag.addEventListener('pointercancel', stop);

  /* arrows by a day, shift+arrows by a month, Home back to today */
  nowFlag.addEventListener('keydown', e => {
    const byMonth = e.shiftKey;
    const d = new Date(currentDate);
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      byMonth ? d.setMonth(d.getMonth() - 1) : d.setDate(d.getDate() - 1);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      byMonth ? d.setMonth(d.getMonth() + 1) : d.setDate(d.getDate() + 1);
    } else if (e.key === 'Home') {
      setDate(homeDate()); e.preventDefault(); return;
    } else return;
    e.preventDefault();
    if (inWin(d)) setDate(d);
  });
}

/* ============================================================== wiring up ==
   The five inline on* attributes that used to live in index.html are bound
   here instead.

   Track width is now a separate control from the time window. The window
   decides WHICH months are shown; width decides how many pixels each one gets
   before the track starts scrolling.
   ========================================================================== */

export function initUI() {
  Object.entries(VIEWS).forEach(([view, btn]) => {
    document.getElementById(btn).addEventListener('click', () => show(view));
  });

  initWindowControls();

  document.getElementById('chainBtn').addEventListener('click', toggleChain);

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

/* Re-attach everything that a redraw wipes out of #lanes and #donut. */
export function refreshChrome() {
  buildGrid();
  mountNowLine();
  applyChain();
  layoutAll();
}
