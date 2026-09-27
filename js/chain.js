/* =============================================================================
   chain.js — the dependency graph, as data.

   Nothing in here touches the DOM, reads the time window, or writes a sentence
   a reader will see. It answers one question: given a milestone, which other
   milestones are connected to it, by which edges, and what is doubtful about
   those edges. chainview.js decides how any of that looks.

       config.js  <-  chain.js  <-  detail.js  <-  chainview.js  <-  main.js

   UPWARD IS THE SOURCE OF TRUTH. Every record states what it waits on, in
   upDeps, and that is the only field read. Downward dependencies are not read
   at all — they are DERIVED here, by turning the upward statements around: the
   milestones that wait on X are exactly the records that named X upward.

   That is why this file now reads the data in one pass instead of two. A
   dependency used to be recordable from either end, which meant the same fact
   could be present at one end and missing at the other, and 15 of the 36 edges
   in the file were in exactly that state. With one authoring direction that
   class of disagreement cannot occur: there is one statement per link, made by
   the record that waits.

   downDeps IS NOT READ. Not to draw, not to check, not to warn about. If a
   record does not name something upward, nothing waits on it — an absent
   statement is an answer, not an omission. Any downDeps still sitting in
   events.json are ignored entirely, and the field can disappear from the data
   without a line of this file changing.

   WHAT THE DATA STILL SAYS. events.json names dependencies by TITLE, not by
   record. One title, "Annual CET Update", matches three records (PY2026,
   PY2027, PY2028), so a dep value can still resolve to more than one milestone.
   DEP_MATCH decides what happens then, and every edge carries how many records
   its dep value matched.

   THE PIVOT SEAM. resolveDep(dep, sourceEvent, direction) is the only place a
   dep value becomes a record. `direction` is passed even though every call now
   reads upward, because the rule most likely to replace the current one —
   nearest match BEFORE the source, looking up — needs it, and retrofitting an
   argument means touching every call site. It also accepts a qualified dep,
   { event, py, sys }, so authoring a precise dependency in the data later is a
   data change and not a code change.
   ============================================================================= */

/* ---- the one switch --------------------------------------------------------
   A decision about what the dataset MEANS, so it is named, sited on its own,
   and changed deliberately.

   DEP_MATCH 'py' identifies a dependency by PROGRAM YEAR AND TITLE, which is
   a unique key: no two records in the file share both. A dep value may state
   the year itself — "2027 Annual CET Update", or { event, py } — and then only
   that record matches. Where the value states only a title, the year is filled
   in as the CLOSEST PREVIOUS one: among the records carrying that title, the
   latest whose program year is at or before the waiting record's own.

   EVERY value that does not state its year is flagged, including the ones that
   resolve to exactly one record. The flag reports what the data omitted, not
   how hard the resolution was — a title with one match today acquires more the
   moment the next cycle is entered, and an unstated year would then start
   meaning a different milestone with nothing on screen to show it had moved.

   That fits how the data repeats. Dependencies recur each cycle and are the
   same each cycle, so an unqualified "Measure Package Approval" read from a
   PY2028 record means the PY2028 one. Where the cycles genuinely cross —
   2028 CET Biennial Avoided Cost Updates waits on 2026 Resolution Adoption —
   the value has to state its year, and then it is taken at its word.

   'all' is the previous behaviour, kept: every record the title matches.

   EDGE_SOURCE used to sit beside it, deciding whether a link recorded at only
   one end counted. Reading upward alone makes the question meaningless — there
   is only one end to record at — so the switch is gone rather than left to
   suggest a choice that no longer exists.
   ---------------------------------------------------------------------------- */
export const DEP_MATCH = 'py';       // 'py' | 'all'

/* ---- state ---------------------------------------------------------------- */

let ALL = [];
let BY_NAME = new Map();   // folded title -> [event, ...]
let INDEX = new Map();     // event -> its position, so an edge has a stable key
let UP = new Map();        // event -> [edge, ...] where the event is the one waiting
let DOWN = new Map();      // event -> [edge, ...] where the event is waited on
let EDGES = [];
let UNRESOLVED = [];       // { event, dep, stated } — an upward value naming
                           // nothing: an unknown title, or a stated year that
                           // no record carries
let ASSUMED = [];          // { event, dep, picked, rule } — a value that did
                           // not state its program year

/* Folded the same way detail.js folds its join key, so the two files cannot
   disagree about whether two titles are the same title. */
const part = v => String(v == null ? '' : v).trim().replace(/\s+/g, ' ').toLowerCase();

const depTitle = d => part(d && typeof d === 'object' ? d.event : d);

/* sortable month index, for any rule that needs to order two records */
const ord = e => e.y * 12 + Math.round(e.m);

/* ---- resolution ------------------------------------------------------------ */

const MATCHERS = {
  /* Every record the title matches. Ambiguity is reported, not resolved. */
  all: candidates => candidates.slice(),

  /* Closest previous program year. The waiting record's own py is the anchor:
     take the candidate with the highest py at or before it.

     Two fallbacks, both flagged rather than silent, because an unflagged guess
     is worse than a wrong one you can see:

       'next-py'  nothing exists at or before the anchor, so the earliest later
                  cycle is used. A PY2026 record waiting on a title that only
                  exists in PY2028 and PY2030 gets the PY2028 one.
       'by-date'  the waiting record has no py at all — 13 records in the file
                  carry a blank one — so the comparison falls back to the
                  milestone's own date, latest at or before, then earliest. */
  py: (candidates, source) => {
    const num = e => {
      const v = parseInt(String(e && e.py || '').trim(), 10);
      return Number.isFinite(v) ? v : null;
    };
    /* One candidate is still a year nobody wrote, so it is still flagged: the
       flag reports that events.json did not state the year, not that this file
       found the choice hard. A title that is unique today stops being unique
       the moment the next cycle is added, and then the unstated value quietly
       starts meaning something else.

       It takes the same label as the multi-candidate case, deliberately. The
       one record may carry a LATER program year than the record waiting on it
       — CET Final Update (PY2026) waits on CET Biennial Avoided Cost Updates
       (PY2028) — and that is an artefact of how program years are assigned,
       not a forward reference: the biennial update is done in 2026 FOR the
       2028 cycle, and it genuinely precedes the milestone waiting on it. The
       label follows the dependency, not the arithmetic on the year. */
    if (candidates.length < 2) {
      return candidates.length
        ? { matches: candidates.slice(), assumed: 'previous-py' }
        : { matches: [] };
    }
    const anchor = num(source);
    if (anchor == null) {
      const at = ord(source);
      const back = candidates.filter(c => ord(c) <= at).sort((a, b) => ord(b) - ord(a));
      const pick = back[0] || candidates.slice().sort((a, b) => ord(a) - ord(b))[0];
      return { matches: [pick], assumed: 'by-date' };
    }
    const back = candidates.filter(c => num(c) != null && num(c) <= anchor)
                           .sort((a, b) => num(b) - num(a) || ord(a) - ord(b));
    if (back[0]) return { matches: [back[0]], assumed: 'previous-py' };
    const fwd = candidates.filter(c => num(c) != null)
                          .sort((a, b) => num(a) - num(b) || ord(a) - ord(b));
    return fwd[0] ? { matches: [fwd[0]], assumed: 'next-py' }
                  : { matches: candidates.slice(), assumed: 'no-py' };
  },

  /* Every record the title matches. Ambiguity reported, never resolved. */
  all: candidates => ({ matches: candidates.slice() })
};

/* A dep value, taken apart. Three shapes are accepted, in this order:

     { event, py, sys }   a qualified dep — the year is stated
     "2027 Annual CET Update"   a title with the year written in front
     "Annual CET Update"        a bare title, year to be filled in

   The exact title is tried BEFORE stripping a leading year, so a milestone
   whose own name began with a year could never be mistaken for a qualified
   dep. No title in the current file does, but the order costs nothing and the
   failure it prevents would be silent. */
function parseDep(dep) {
  if (dep && typeof dep === 'object') {
    const py = dep.py == null ? null : String(dep.py).trim();
    return { title: depTitle(dep), py: py || null, sys: dep.sys ? part(dep.sys) : null,
             stated: !!py };
  }
  const raw = String(dep == null ? '' : dep).trim().replace(/\s+/g, ' ');
  if (BY_NAME.has(part(raw))) return { title: part(raw), py: null, sys: null, stated: false };
  const m = /^(\d{4})\s+(.+)$/.exec(raw);
  if (m && BY_NAME.has(part(m[2]))) {
    return { title: part(m[2]), py: m[1], sys: null, stated: true };
  }
  return { title: part(raw), py: null, sys: null, stated: false };
}

/* THE ONE PLACE a dep value becomes a record.
   dep       — "Title", "2027 Title", or { event, py?, sys? }
   source    — the record the dep was read from
   direction — 'up' on every call today; the argument is kept because a future
               matching rule would need to know which way it is looking

   Returns { matches, candidates, assumed, stated }. `assumed` names the rule
   that filled in a year nobody wrote, and is null when the value said it
   itself — so a caller can always tell a stated fact from an inferred one. */
export function resolveDep(dep, source, direction) {
  const q = parseDep(dep);
  const all = BY_NAME.get(q.title) || [];
  let pool = q.sys ? all.filter(e => part(e.sys) === q.sys) : all;

  /* A stated year is taken at its word, including when it matches nothing:
     "2029 Annual CET Update" is a wrong reference, not an invitation to pick
     a nearby year. It surfaces as unresolved, which is what it is. */
  if (q.stated) {
    const exact = pool.filter(e => String(e.py || '').trim() === q.py);
    return { matches: exact, candidates: all.length, assumed: null, stated: true };
  }

  const rule = MATCHERS[DEP_MATCH] || MATCHERS.py;
  const out = rule(pool, source, direction) || {};
  return {
    matches: out.matches || [],
    candidates: all.length,
    /* Non-null whenever the value did not state a year, whatever the rule did
       with it. null means, and only means, that the data said it. */
    assumed: (out.matches || []).length ? (out.assumed || 'unstated') : null,
    stated: false
  };
}

/* ---- building -------------------------------------------------------------- */

function edgeFor(store, from, to) {
  const k = `${INDEX.get(from)}>${INDEX.get(to)}`;
  if (!store.has(k)) {
    store.set(k, {
      from, to,              // from is waited on; to is the record that waits
      deps: [],              // the upward dep values that produced this edge
      candidates: 1,         // how many records the widest of those matched
      assumedPy: null        // the rule that filled in a year nobody wrote
    });
  }
  return store.get(k);
}

export function initChain(events) {
  ALL = events || [];
  BY_NAME = new Map();
  INDEX = new Map();
  ALL.forEach((e, i) => {
    INDEX.set(e, i);
    const k = part(e.event);
    if (!BY_NAME.has(k)) BY_NAME.set(k, []);
    BY_NAME.get(k).push(e);
  });

  const store = new Map();
  UNRESOLVED = [];
  ASSUMED = [];

  /* ONE pass, upward only. Each record's upDeps say what it waits on, so every
     value read here becomes an edge pointing AT the record that read it. */
  ALL.forEach(e => {
    (e.upDeps || []).forEach(dep => {
      const { matches, candidates, assumed, stated } = resolveDep(dep, e, 'up');
      if (!matches.length) { UNRESOLVED.push({ event: e, dep, stated }); return; }
      if (assumed) ASSUMED.push({ event: e, dep, picked: matches[0], rule: assumed });
      matches.forEach(m => {
        if (m === e) return;                      // a record cannot wait on itself
        const edge = edgeFor(store, m, e);
        edge.deps.push(dep);
        edge.candidates = Math.max(edge.candidates, candidates);
        if (assumed) edge.assumedPy = assumed;
      });
    });
  });

  EDGES = [...store.values()];
  EDGES.forEach(edge => { edge.ambiguous = edge.candidates > 1; });

  /* DOWN is the derivation: the same edges, grouped by the record being waited
     on. Nothing else in the app has to know that downward is computed — it asks
     downstreamOf() and gets an answer the same shape as upstreamOf(). */
  UP = new Map(); DOWN = new Map();
  EDGES.forEach(edge => {
    if (!DOWN.has(edge.from)) DOWN.set(edge.from, []);
    if (!UP.has(edge.to)) UP.set(edge.to, []);
    DOWN.get(edge.from).push(edge);
    UP.get(edge.to).push(edge);
  });

  return diagnostics();
}

/* ---- reading the graph ------------------------------------------------------ */

/* Sorted by date, then title: a list a reader will scan, not a set. */
const byDate = (a, b) => (ord(a) - ord(b)) || part(a.event).localeCompare(part(b.event));

/* What this milestone waits on — straight from its own upDeps. */
export function upstreamOf(e) {
  return (UP.get(e) || []).map(edge => edge.from).sort(byDate);
}

/* What waits on this milestone — DERIVED: every record that named it upward. */
export function downstreamOf(e) {
  return (DOWN.get(e) || []).map(edge => edge.to).sort(byDate);
}

/* ---- the same two lists, with their doubts attached --------------------------
   upstreamOf and downstreamOf answer "which records"; these answer "which
   records, and how sure is that". The panel needs the second: a year this file
   filled in, and a downward value the upward data does not support, are both
   things a reader should see rather than take on trust.

   Entry shapes:
     up    { dep, matches, assumed, stated }   assumed names the rule that
                                               filled in a year, null if the
                                               value stated it; matches is
                                               empty when nothing was found
     down  { event, assumed }                  derived; assumed is carried from
                                               the edge, so a link that rests
                                               on a filled-in year is marked at
                                               both ends

   downwardReport returns the derivation and nothing else. Downward is not an
   authored direction any more, so there is no second source for this column to
   disagree with.
   ---------------------------------------------------------------------------- */

export function upwardReport(e) {
  return (e && e.upDeps || []).map(dep => {
    const r = resolveDep(dep, e, 'up');
    return {
      dep,
      matches: r.matches.filter(m => m !== e).sort(byDate),
      assumed: r.assumed,
      stated: r.stated
    };
  });
}

export function downwardReport(e) {
  return (DOWN.get(e) || [])
    .map(edge => ({ event: edge.to, assumed: edge.assumedPy }))
    .sort((a, b) => byDate(a.event, b.event));
}

/* ---- traversal ------------------------------------------------------------- */

/* Breadth-first, each direction walked separately so a node's `direction` says
   which way the reader travelled to reach it. hops caps the distance: 1 is the
   direct links, Infinity the whole chain. */
function walk(root, direction, hops, nodes, edges, seenEdges) {
  let frontier = [root];
  for (let d = 0; d < hops && frontier.length; d++) {
    const next = [];
    frontier.forEach(cur => {
      const list = (direction === 'up' ? UP.get(cur) : DOWN.get(cur)) || [];
      list.forEach(edge => {
        if (!seenEdges.has(edge)) { seenEdges.add(edge); edges.push(edge); }
        const other = direction === 'up' ? edge.from : edge.to;
        if (nodes.has(other)) return;
        nodes.set(other, { event: other, direction, hops: d + 1 });
        next.push(other);
      });
    });
    frontier = next;
  }
}

/* The chain for one record.
     hops — 1 for the direct links, Infinity for everything connected
   Returns plain data: no element ids, no copy, no ordering by screen position. */
export function chainFor(root, opts) {
  const hops = (opts && opts.hops != null) ? opts.hops : Infinity;
  const nodes = new Map([[root, { event: root, direction: 'self', hops: 0 }]]);
  const edges = [];
  const seen = new Set();
  walk(root, 'up', hops, nodes, edges, seen);
  walk(root, 'down', hops, nodes, edges, seen);
  return {
    root,
    hops,
    nodes: [...nodes.values()],
    edges,
    ambiguous: edges.filter(e => e.ambiguous),
    unresolved: UNRESOLVED.filter(u => nodes.has(u.event))
  };
}

/* Every link whose program year was filled in rather than stated, for the
   console. Each one is a place where writing the year into events.json would
   make the data say what the drawing already shows. */
export const assumedDeps = () => ASSUMED.slice();

/* Upward values that name no record: an unknown title, or a stated year no
   record carries. */
export const unresolvedDeps = () => UNRESOLVED.slice();

/* For the console on load: the shape of the graph, so a data change that
   breaks an assumption at the top of this file is visible immediately. */
export function diagnostics() {
  const touched = new Set();
  EDGES.forEach(e => { touched.add(e.from); touched.add(e.to); });
  return {
    records: ALL.length,
    edges: EDGES.length,
    connected: touched.size,
    ambiguous: EDGES.filter(e => e.ambiguous).length,
    assumedPy: ASSUMED.length,
    unresolved: UNRESOLVED.length,
    depMatch: DEP_MATCH,
    key: 'program year + title',
    source: 'upDeps only; downward derived'
  };
}
