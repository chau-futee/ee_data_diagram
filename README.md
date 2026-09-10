# Data Donut — step 1: data and JavaScript split out

Nothing about the visuals changed. `data_donut_concept_4_1.html` was one 1,029-line
file; it is now a folder.

```
index.html            markup + CSS (CSS still inline — that is the next step)
data/events.json      the 58 records, lifted verbatim out of `const EVENTS`
js/config.js          constants and pure helpers
js/legend.js          the swatch row
js/donut.js           the cyclical ring view
js/timeline.js        the multi-year swimlane view
js/table.js           the filterable record list
js/ui.js              tooltip, tabs, layout, month grid, chain trace, current-date line
js/main.js            entry point: fetch → validate → place → draw
smoke-test.mjs        renders the whole thing headlessly and checks it
```

## Running it

`index.html` can no longer be opened by double-clicking. The page fetches
`data/events.json`, and browsers block data requests from `file://`. Serve the
folder instead:

```bash
python3 -m http.server 8000     # from this directory
# then open http://localhost:8000/
```

If you do open it from disk, the page says so in a red banner rather than just
appearing empty.

## Running the test

```bash
npm install jsdom
node smoke-test.mjs
```

23 checks: record counts per view, axis construction, empty-lane handling,
sort order, tab switching and the dependency-chain trace.

## Why `main.js` exists

You listed six files. There are seven, and the extra one is load-bearing.

The four view files need `showTip` from `ui.js`; something has to call the four
view files after the data arrives. If `ui.js` did the calling, `ui.js` and the
views would import each other in a cycle. `main.js` takes the calling role, so
the graph runs one way:

```
config.js  <-  ui.js  <-  legend / donut / timeline / table  <-  main.js
```

`config.js` imports nothing, which is why anything may import it.

## Three things that are not a straight copy

**`placeEvents()` now runs from `main.js`.** In the single-file version five
renderers were self-executing functions that ran at parse time, which worked
only because `EVENTS` was already in memory. Data arriving over the network
breaks that, so they are now named functions called in order.

**Ring geometry moved to `config.js`.** `cx`, `cy`, `rOuter` and `rInner` were
written twice — once in `drawDonut`, once in the current-date spoke — with a
comment asking whoever changed one to remember the other. One definition now.

**Two pre-existing bugs fixed, both flagged in comments where they were.**

1. The ring tooltip printed `undefined` for any marker at ring month 23.5.
   `Math.round(23.5)` is 24, off the end of a 24-entry array. One marker in the
   current data hits this: *CET planning*, Dec 2027. Now `% CYCLE`.
2. The dependency-chain trace made **every** dot glow instead of two.
   `classList.toggle('glow', chainOn && inChain)` passes `undefined` when a
   marker has no `data-id`, and `toggle()` reads a missing second argument as
   "no force given" and flips the class regardless. Now coerced with `!!`.

Event titles are also escaped on the way into SVG attributes now. The workbook
has titles containing `&` (P&G, em&v), which the raw version would emit
unescaped.

## The time window (added in this step)

Both visuals now read one shared window — `{ startYear, years }` — held in
`ui.js`. The picker appears on the Timeline and Cyclical tabs; changing it in
either place changes both, because there is only one piece of state and
`main.js` subscribes to it.

| Window | Ring | Timeline |
|---|---|---|
| 1 year | 12 slots, 30° each, no partition | 12-month axis |
| 2 years | 24 slots, 15° each, 2 partitions | 24-month axis |
| 3 years | 36 slots, 10° each, 3 partitions | 36-month axis |

Default is 2 years starting at the current year, clamped to the data range. A
window can never run past the end of the data: asking for 3 years from 2028
gives 2026–2028, keeping the length you chose and sliding the start back.

**The 24-month fold is gone.** The ring used to squeeze 36 months into 24 slots
with `% 24`, so slots 0–11 each carried two calendar months and the page had to
warn readers about it. With an explicit window every slot is one month of one
year, and that caveat has been removed from the page copy.

**Track width is now separate from period.** The timeline's old zoom buttons
said "3 years / 2 years / 1 year" but only changed the track's *width* — all 36
months were always present. That label now belongs to the window control, so
the width buttons read Fit / 1.5× / 3×, and the default is Fit.

**Empty lanes distinguish two situations.** A system with no records at all is
"awaiting milestones". A system whose records simply fall outside the chosen
window says so by name. Without that, narrowing to 2028 would look like the
dataset had shrunk — and it nearly does: 47 of the 58 records are in 2026, 10 in
2027, and 1 in 2028.

The data table is deliberately unchanged. It keeps its own full-range month
filter and still shows all 58 records, which is what its description on the page
promises. Whether it should follow the window instead is a decision for you.

### One data finding

`P&G draft results` is recorded as `{ y: 2026, m: 12.8 }`. `monthOf()` rounds
that to 13, which is not a month — it renders as **January 2027**. This is not
new behaviour and nothing was changed to cause it, but the window feature made
it visible: selecting 1 year of 2026 shows 46 records, not the 47 that carry
`y: 2026`.

That is the same class of problem as item 8 in your options memo, which records
that a previous version pushed month 11.8 into January. Worth confirming with
Gurmehr and Chau whether the intended date is late December 2026 or January
2027, rather than fixing it here.

### SVG canvas

`viewBox` changed from `0 0 560 560` to `-45 -45 650 650`. Same centre, same
radii — the old box had no margin, so the current-date label at radius 292 was
already being clipped near the top of the ring. The year labels needed room
too.

## What is still hardcoded

`chainIds` in `config.js` is still two literal event ids. The workbook already
carries `downward dependencies` and `upward dependencies` on 64 of its 71 rows,
unused. That is a data question, not a refactor.

`data/events.json` carries a `meta` block recording that these records were
extracted from the HTML, not yet produced from the workbook. `sourceOfRecord`
says `PENDING` and should stay that way until the ETL exists.
