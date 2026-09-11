/* Renders index.html + the six modules in jsdom and asserts the split behaves
   like the single-file original. Run: node smoke-test.mjs                     */
import fs from 'fs';
import { createRequire } from 'module';
const { JSDOM } = createRequire(import.meta.url)('jsdom');

const html = fs.readFileSync('index.html', 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost:8000/', pretendToBeVisual: true });

global.window = dom.window;
global.document = dom.window.document;
global.addEventListener = dom.window.addEventListener.bind(dom.window);
global.innerWidth = 1440;
global.fetch = async () => ({
  ok: true, status: 200, statusText: 'OK',
  json: async () => JSON.parse(fs.readFileSync('data/events.json', 'utf8'))
});

await import('./js/main.js');
await new Promise(r => setTimeout(r, 100));

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
let fails = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: ${got}${ok ? '' : `  (expected ${want})`}`);
};

console.log('--- load ---');
check('load-error banner hidden', $('#loadError').hidden, true);

console.log('\n--- legend ---');
check('legend entries', $$('#legend span').length, 8);
check('legend has no faded states', $$('#legend span.awaiting, #legend span.outside').length, 0);

console.log('\n--- ring ---');
check('ring markers', $$('#donut .rk').length, 57);
check('empty-ring labels', $$('#donut text').filter(t => /awaiting data|none in/.test(t.textContent)).length, 2);
check('current-date spoke drawn', $$('#ringNow line').length, 1);

console.log('\n--- timeline ---');
check('lanes', $$('#lanes .lanerow').length, 8);
check('empty lanes', $$('#lanes .track.empty').length, 2);
check('milestones', $$('#lanes .milestone').length, 57);
check('labelled milestones (s:1)', $$('#lanes .milestone[data-s="1"]').length, 36);
check('chain-tagged milestones', $$('#lanes .milestone[data-id]').length, 2);

console.log('\n--- table ---');
check('table body rows', $$('#dataTable tbody tr').length, 58);
check('filter controls', $$('#tblFilters select, #tblFilters input').length, 5);
check('frequency options', $$('#fFreq option').length, 4);
console.log(`      count line: "${$('#tblCount').textContent}"`);

console.log('\n--- placement agreement ---');
const firstRow = $$('#dataTable tbody tr')[0];
check('table sorted earliest-first', firstRow.children[2].textContent, 'Jan 2026');
check('no "undefined" anywhere in the DOM', /undefined/.test(document.body.innerHTML), false);

console.log('\n--- interaction wiring ---');
$('#btnTable').dispatchEvent(new dom.window.Event('click', { bubbles: true }));
check('tab click switches view', $('#table').classList.contains('active'), true);
$('#chainBtn').dispatchEvent(new dom.window.Event('click', { bubbles: true }));
check('chain trace dims non-chain markers', $$('#lanes .milestone.dim').length, 55);
check('chain trace glows chain markers', $$('#lanes .m-dot.glow').length, 2);


console.log('\n--- time window: default (2 years from the current year) ---');
const ui = await import('./js/ui.js');
check('default span', ui.win.years, 2);
check('default start year', ui.win.startYear, 2026);
check('ring slots (month labels)', $$('#donut text').filter(t => /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/.test(t.textContent)).length, 24);
check('year partition labels', $$('#donut .yrlbl').length, 2);
check('month-axis cells', $$('#monthsAxis .mo').length, 24);
check('year-axis cells', $$('#years .yr').length, 2);
check('grid overlay follows window', $$('#lanes .gridoverlay i').length, 24);
check('events shown (2026+2027 = 47+10)', $$('#lanes .milestone').length, 57);
check('ring markers match timeline', $$('#donut .rk').length, 57);
check('window picker rendered on both tabs', $$('[data-winbar]').length, 2);
check('track-width control removed', $$('#zoomGrp').length, 0);
check('toggles share the toolbar row with the picker',
  $$('.tlbar').filter(b => b.querySelector('[data-winbar]') && b.querySelector('#allLbl')).length, 1);
check('date callout is m/d/yy on the timeline', /^\d{1,2}\/\d{1,2}\/\d{2}$/.test($('#nowFlag').textContent), true);
check('same format on the ring', /^\d{1,2}\/\d{1,2}\/\d{2}$/.test($$('#ringNow text')[0].textContent.trim()), true);
check('both callouts show the same date',
  $('#nowFlag').textContent.trim() === $$('#ringNow text')[0].textContent.trim(), true);

console.log('\n--- switch to 1 year ---');
ui.setWindow({ years: 1 });
await new Promise(r => setTimeout(r, 20));
check('span', ui.win.years, 1);
check('ring slots', $$('#donut text').filter(t => /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/.test(t.textContent)).length, 12);
check('no partition labels at 1 year', $$('#donut .yrlbl').length, 0);
check('month-axis cells', $$('#monthsAxis .mo').length, 12);
check('events shown (2026 only; m:12.8 rounds into Jan 2027)', $$('#lanes .milestone').length, 46);
check('ring and timeline agree', $$('#donut .rk').length, $$('#lanes .milestone').length);
check('both pickers show the same label', new Set($$('.winlbl').map(e => e.textContent)).size, 1);
check('picker label', $$('.winlbl')[0].textContent, '2026');

console.log('\n--- step forward to 2028, where only one record lives ---');
ui.setWindow({ startYear: 2028 });
await new Promise(r => setTimeout(r, 20));
check('events shown', $$('#lanes .milestone').length, 1);
check('lanes flagged "no milestones in 2028"', $$('#lanes .track.empty').filter(t => /no milestones in 2028/.test(t.textContent)).length, 5);
check('lanes still flagged awaiting data', $$('#lanes .track.empty').filter(t => /awaiting/.test(t.textContent)).length, 2);
check('legend unaffected by the window', $$('#legend span').length, 8);
check('current date is outside 2028 - no ring spoke', $$('#ringNow line').length, 0);
check('out-of-window notice is in the description box',
  $('#nowHint').closest('.note.viewnote') !== null, true);
check('notice is visible when today is outside the window', $('#nowHint').hidden, false);
// date-agnostic on purpose: pinning a real date here makes the suite fail tomorrow
check('notice names today and the window',
  /Today \(\d{1,2} [A-Z][a-z]{2} \d{4}\) is outside 2028/.test($('#nowHint').textContent), true);
check('notice is gone from the toolbar', $$('.tlbar #nowHint').length, 0);

console.log('\n--- switch to 3 years ---');
ui.setWindow({ years: 3 });
await new Promise(r => setTimeout(r, 20));
check('start clamped back to 2026', ui.win.startYear, 2026);
check('ring slots', $$('#donut text').filter(t => /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/.test(t.textContent)).length, 36);
check('partitioned into 3', $$('#donut .yrlbl').length, 3);
check('all events shown', $$('#lanes .milestone').length, 58);
check('forward step disabled at the end of the data', $$('.winnav [data-step="1"]')[0].disabled, true);
check('table still shows the full dataset', $$('#dataTable tbody tr').length, 58);
check('notice hidden again once today is back inside the window', $('#nowHint').hidden, true);
check('no "undefined" anywhere in the DOM', /undefined/.test(document.body.innerHTML), false);

console.log(`\n${fails ? fails + ' CHECK(S) FAILED' : 'all checks passed'}`);
process.exit(fails ? 1 : 0);
