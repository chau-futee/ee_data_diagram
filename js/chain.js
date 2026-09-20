/* =============================================================================
   chain.js — the dependency graph, as data.

   Nothing in here touches the DOM, reads the time window, or writes a sentence
   a reader will see. It answers one question: given a milestone, which other
   milestones are connected to it, by which edges, and what is doubtful about
   those edges. chainview.js decides how any of that looks.

       config.js  <-  chain.js  <-  chainview.js  <-  main.js

   WHAT THE DATA ACTUALLY SAYS. events.json names dependencies by TITLE only —
   "Annual CET Update", not a record. Three facts about the current file drive
   every decision below, and all three are properties of the data rather than
   of this code, so each is a switch rather than an assumption:

     1. 24 of the 59 records carry a dependency, and the edges they imply form
        ONE connected component of 32 records. A full transitive trace from
        almost any node therefore reaches most of the graph — which is why the
        reader is given a depth choice rather than a fixed one.

     2. Fifteen edges are recorded on ONE SIDE ONLY. "CET Final Update" lists
        "Q1 Claims Submission" in downDeps; that record's upDeps is empty. Read
        strictly, the relationship exists looking down and not looking up.
        EDGE_SOURCE decides whether both ends see it, and every edge carries
        which side declared it so the view can say so.

     3. One dep string, "Annual CET Update", matches three records (PY2026,
        PY2027, PY2028). DEP_MATCH decides what that resolves to.

   THE PIVOT SEAM. resolveDep(dep, sourceEvent, direction) is the only place a
   dep value becomes a record. `direction` is passed even though the current
   strategy ignores it, because the rule most likely to replace it — nearest
   match AFTER the source when looking down, BEFORE it when looking up — needs
   it, and retrofitting an argument means touching every call site. It also
   accepts a qualified dep, { event, py, sys }, so authoring a precise
   dependency in the data later is a data change and not a code change.
   ============================================================================= */

/* ---- the two switches ------------------------------------------------------
   Both are decisions about what the dataset MEANS, so they are named, sited
   together, and changed deliberately.

   DEP_MATCH 'all' shows every record a title matches. It is the only strategy
   that asserts nothing the data cannot support: with dependencies repeating
   each cycle, and cross-cycle links already present in the file (2028 CET
   Biennial Avoided Cost Updates waits on 2026 Resolution Adoption — same
   month, program years two apart), neither a date rule nor a program-year rule
   is safe yet. 'nearest' is written below, unused, so the pivot is one word.

   EDGE_SOURCE 'union' reads the file in both directions, so an edge recorded
   on one side is visible from both ends. 'own' reads only the clicked record's
   own fields, which makes those fifteen edges visible from one end only.
   ---------------------------------------------------------------------------- */
export const DEP_MATCH   = 'all';      // 'all' | 'nearest'
export const EDGE_SOURCE = 'union';    // 'union' | 'own'

/* ---- state ---------------------------------------------------------------- */

let ALL = [];
let BY_NAME = new Map();   // folded title -> [event, ...]
let OUT = new Map();       // event -> [edge, ...] where the event is `from`
let IN  = new Map();       // event -> [edge, ...] where the event is `to`
let EDGES = [];
let UNRESOLVED = [];       // { event, dep, direction } — named nothing
let INDEX = new Map();     // event -> its position, so an edge has a stable key

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

  /* Nearest in time, on the side the direction implies: a downward dependency
     looks forward from the source, an upward one looks back. Written now,
     selected never — it is here so DEP_MATCH is a real switch and not a
     promise. Falls back to every candidate when nothing sits on the right
     side, rather than silently returning none. */
  nearest: (candidates, source, direction) => {
    if (!source || candidates.length < 2) return candidates.slice();
    const at = ord(source);
    const side = candidates.filter(c => direction === 'up' ? ord(c) <= at : ord(c) >= at);
    const pool = side.length ? side : candidates;
    let best = pool[0];
    pool.forEach(c => {
      if (Math.abs(ord(c) - at) < Math.abs(ord(best) - at)) best = c;
    });
    return [best];
  }
};

/* THE ONE PLACE a dep value becomes a record.
   dep       — a title string, or { event, py?, sys? }
   source    — the record the dep was read from
   direction — 'down' when read from downDeps, 'up' when read from upDeps */
export function resolveDep(dep, source, direction) {
  const all = BY_NAME.get(depTitle(dep)) || [];
  /* A qualified dep narrows before the strategy runs, so a precise value in
     the data always wins over whatever DEP_MATCH would have chosen. */
  const narrowed = (dep && typeof dep === 'object')
    ? all.filter(e => (dep.py == null || part(e.py) === part(dep.py))
                   && (dep.sys == null || part(e.sys) === part(dep.sys)))
    : all;
  const pool = narrowed.length ? narrowed : all;
  const match = MATCHERS[DEP_MATCH] || MATCHERS.all;
  return { matches: match(pool, source, direction), candidates: all.length };
}

/* ---- building -------------------------------------------------------------- */

function edgeFor(store, from, to) {
  const k = `${INDEX.get(from)}>${INDEX.get(to)}`;
  if (!store.has(k)) {
    store.set(k, {
      from, to,
      viaDown: false,        // the `from` record names `to` in downDeps
      viaUp: false,          // the `to` record names `from` in upDeps
      deps: [],              // the dep values that produced this edge
      candidates: 1          // how many records the widest of those matched
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

  const read = (e, field, direction) => {
    (e[field] || []).forEach(dep => {
      const { matches, candidates } = resolveDep(dep, e, direction);
      if (!matches.length) {
        UNRESOLVED.push({ event: e, dep, direction });
        return;
      }
      matches.forEach(m => {
        if (m === e) return;                      // a record cannot wait on itself
        const edge = direction === 'down' ? edgeFor(store, e, m) : edgeFor(store, m, e);
        if (direction === 'down') edge.viaDown = true; else edge.viaUp = true;
        edge.deps.push(dep);
        edge.candidates = Math.max(edge.candidates, candidates);
      });
    });
  };

  ALL.forEach(e => { read(e, 'downDeps', 'down'); read(e, 'upDeps', 'up'); });

  EDGES = [...store.values()];
  EDGES.forEach(edge => {
    /* 'both'  — each end records the other
       'down'  — only the earlier record's downDeps names it
       'up'    — only the later record's upDeps names it */
    edge.declared = edge.viaDown && edge.viaUp ? 'both' : (edge.viaDown ? 'down' : 'up');
    edge.oneSided = edge.declared !== 'both';
    edge.ambiguous = edge.candidates > 1;
  });

  OUT = new Map(); IN = new Map();
  EDGES.forEach(edge => {
    if (!OUT.has(edge.from)) OUT.set(edge.from, []);
    if (!IN.has(edge.to)) IN.set(edge.to, []);
    OUT.get(edge.from).push(edge);
    IN.get(edge.to).push(edge);
  });

  return diagnostics();
}

/* ---- traversal ------------------------------------------------------------- */

/* Under EDGE_SOURCE 'own' a record only follows what it wrote down itself: its
   own downDeps going down, its own upDeps going up. Under 'union' it follows
   every edge either end recorded. */
function usable(edge, direction) {
  if (EDGE_SOURCE !== 'own') return true;
  return direction === 'down' ? edge.viaDown : edge.viaUp;
}

/* Breadth-first, each direction walked separately so a node's `direction` says
   which way the reader travelled to reach it. hops caps the distance: 1 is the
   direct links, Infinity the whole chain. */
function walk(root, direction, hops, nodes, edges, seenEdges) {
  let frontier = [root];
  for (let d = 0; d < hops && frontier.length; d++) {
    const next = [];
    frontier.forEach(cur => {
      const list = (direction === 'up' ? IN.get(cur) : OUT.get(cur)) || [];
      list.forEach(edge => {
        if (!usable(edge, direction)) return;
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
    oneSided: edges.filter(e => e.oneSided),
    ambiguous: edges.filter(e => e.ambiguous),
    unresolved: UNRESOLVED.filter(u => nodes.has(u.event))
  };
}

/* Which end of a one-sided edge is missing the entry. The view turns this into
   a sentence; this file only states which record is silent. */
export function missingSide(edge) {
  if (!edge.oneSided) return null;
  return edge.declared === 'down'
    ? { recordedOn: edge.from, field: 'downDeps', silent: edge.to, missingField: 'upDeps' }
    : { recordedOn: edge.to, field: 'upDeps', silent: edge.from, missingField: 'downDeps' };
}

/* For the console on load: the shape of the graph, so a data change that
   breaks one of the three assumptions at the top is visible immediately. */
export function diagnostics() {
  const touched = new Set();
  EDGES.forEach(e => { touched.add(e.from); touched.add(e.to); });
  return {
    records: ALL.length,
    edges: EDGES.length,
    connected: touched.size,
    oneSided: EDGES.filter(e => e.oneSided).length,
    ambiguous: EDGES.filter(e => e.ambiguous).length,
    unresolved: UNRESOLVED.length,
    depMatch: DEP_MATCH,
    edgeSource: EDGE_SOURCE
  };
}
