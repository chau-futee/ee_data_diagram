/* =============================================================================
   timeline.js — the multi-year view: one lane per system across the SELECTED
   WINDOW, markers at their true fractional position.

   The axis is now 12, 24 or 36 months depending on the window, and the year
   header shows only the years in it. Records outside the window are filtered
   out before this file sees them.

   Marker placement is NOT decided here. `f` is assigned once by placeEvents()
   in main.js, relative to the current window, and both this view and the ring
   read it — which is what keeps the two from drifting apart.
   ============================================================================= */

import {
  sysOrder, COL, NAME, SHORT, LBL_FS, months,
  spanMonths, windowYears, windowLabel, absMonthIn, monthLabelIn, hasData, esc,
  eventName, sysLink
} from './config.js';
import { showTip, hideTip } from './ui.js';
import { openDetail } from './detail.js';

/* Name the month an event belongs to. Events sharing a lane and a month are
   spread evenly across that month's cell, so the tooltip says which slot of how
   many — that spacing is ordering, not a day of the month. */
function whenLabel(e, win) {
  const txt = monthLabelIn(absMonthIn(e, win), win);
  return e.of > 1 ? `${txt} · ${e.slot} of ${e.of} this month` : txt;
}

export function drawTimeline(events, all, win) {
  const span = spanMonths(win);

  /* this view's own derivation: events bucketed by system */
  const tl = Object.fromEntries(sysOrder.map(k => [k, events.filter(e => e.sys === k)]));

  /* year axis */
  const years = document.getElementById('years');
  years.innerHTML = '';
  windowYears(win).forEach(y => {
    const d = document.createElement('div');
    d.className = 'yr';
    d.textContent = y;
    years.appendChild(d);
  });

  /* month axis */
  const mos = document.getElementById('monthsAxis');
  mos.innerHTML = '';
  for (let i = 0; i < span; i++) {
    const d = document.createElement('div');
    d.className = 'mo' + (i % 12 === 0 ? ' ystart' : '');
    d.textContent = months[i % 12];
    mos.appendChild(d);
  }

  /* lanes */
  const lanes = document.getElementById('lanes');
  lanes.innerHTML = '';
  sysOrder.forEach(sys => {
    const row = document.createElement('div');
    row.className = 'lanerow';
    /* Named, not counted. chainview.js has to find a lane by system to end a
       stub in it when a chain member falls outside the window, and finding it
       by index would silently follow sysOrder out of step with the DOM. */
    row.dataset.sys = sys;

    const cell = document.createElement('div');
    cell.className = 'lanecell';

    /* An anchor where the system has a home to link to, a plain div where it
       does not. Same class either way, so a linked lane and an unlinked one are
       the same box in the same colour — only the affordances differ. The label
       carries no click handler of its own, so there is nothing for the link to
       compete with. */
    const url = sysLink(sys);
    const lbl = document.createElement(url ? 'a' : 'div');
    lbl.className = 'lanelabel';
    if (url) {
      const label = `${NAME[sys]} \u2014 open the source system in a new tab`;
      lbl.href = url;
      lbl.target = '_blank';
      lbl.rel = 'noopener noreferrer';   // the new tab cannot reach back here
      lbl.title = label;
      lbl.setAttribute('aria-label', label);
    }
    lbl.style.background = COL[sys];
    lbl.textContent = SHORT[sys];
    if (LBL_FS[sys]) lbl.style.fontSize = LBL_FS[sys];
    cell.appendChild(lbl);

    const evs = tl[sys] || [];
    const track = document.createElement('div');
    track.className = 'track' + (evs.length ? '' : ' empty');
    track.style.borderLeft = '1px solid var(--line)';

    /* Two different empty states — a lane with no records at all is awaiting
       data; a lane whose records all sit outside the chosen window is not, and
       saying so stops a narrowed window from looking like lost data. */
    if (!evs.length) {
      track.innerHTML = hasData(all, sys)
        ? `<span>no milestones in ${esc(windowLabel(win))}</span>`
        : '<span>lane added — awaiting milestones</span>';
    }

    evs.forEach(ev => {
      const m = document.createElement('div');
      m.className = 'milestone';
      m.dataset.pct = (ev.f * 100);          // true position, kept for re-layout
      m.dataset.when = whenLabel(ev, win);
      m.style.left = (ev.f * 100) + '%';
      m.tabIndex = 0;
      /* `id` is a leftover from the hardcoded trace and drives nothing now —
         the dependency chain is derived from upDeps/downDeps and finds its
         markers by data-k. The line is kept so a record that does carry an id
         still surfaces it in the DOM. */
      if (ev.id) m.dataset.id = ev.id;
      m.dataset.s = (ev.show === 0 ? '0' : '1');
      /* _k is assigned once by initDetail() and never changes, so a click resolves to one record. */
      m.dataset.k = ev._k;
      const name = eventName(ev);
      m.innerHTML = `<div class="m-dot" style="background:${COL[sys]}"></div>`
                  + `<div class="m-lbl">${esc(name)}</div>`;

      const html = () => `<b>${esc(NAME[sys])}</b>${esc(name)}`
                       + `<br><span style="opacity:.7">${m.dataset.when}</span>`;
      m.addEventListener('mousemove', e => showTip(e, html()));
      m.addEventListener('mouseleave', hideTip);
      m.addEventListener('focus', () => {
        const r = m.getBoundingClientRect();
        showTip({ clientX: r.left + r.width / 2, clientY: r.bottom }, html());
      });
      m.addEventListener('blur', hideTip);
      /* Click or Enter/Space opens the detail panel. Keyboard is wired
         explicitly because a div does not fire click on Space. */
      m.addEventListener('click', () => openDetail(ev));
      m.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(ev); }
      });
      track.appendChild(m);
    });

    row.appendChild(cell);
    row.appendChild(track);
    lanes.appendChild(row);
  });
}
