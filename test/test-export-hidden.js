// ============================================================
// test-export-hidden.js — §40.1 "Hide from export" predicate (build 390 / QA 368)
// ------------------------------------------------------------
// The tester reported overhead world CARDS still showing an Export button when the flag was
// ON. Root-cause tracing showed the card path is actually correct on main (offline overhead
// worlds are wrapped as {world_data:<overhead obj>} by _offlineOverheadWorlds, so
// exportHidden(w.world_data) sees .settings.hideFromExport). This locks that in, and pins the
// hardened predicate that now resolves the flag for EVERY world shape + a card wrapper, so a
// caller passing the wrong nesting level can't silently re-break it.
// ============================================================
const WT = require('../js/world-transfer.js');
let passed = 0, failed = 0;
function ok(cond, msg) { if (cond) { passed++; } else { failed++; console.error('  ✗ ' + msg); } }

const T = true;

// ── The shapes exportHidden must handle ──
// 1. Side-scroll world_data (settings live in worldAdvSettings).
ok(WT.exportHidden({ worldAdvSettings: { hideFromExport: T } }) === true,  'side-scroll world_data: flag in worldAdvSettings → hidden');
ok(WT.exportHidden({ worldAdvSettings: { hideFromExport: false } }) === false, 'side-scroll world_data: flag off → visible');
ok(WT.exportHidden({ worldAdvSettings: {} }) === false, 'side-scroll world_data: flag absent → visible');

// 2. Raw overhead world (settings at TOP level) — what the overhead editor top-bar passes.
ok(WT.exportHidden({ settings: { hideFromExport: T }, mode: 'overhead' }) === true, 'raw overhead world: flag in top-level settings → hidden');
ok(WT.exportHidden({ settings: {} }) === false, 'raw overhead world: flag absent → visible');

// 3. The overhead CARD path: _offlineOverheadWorlds wraps the raw overhead object as world_data,
//    and _worldCard calls exportHidden(w.world_data). This is the exact 368 scenario.
const rawOverhead = { name: 'Mega Fixture (d4)', settings: { hideFromExport: T }, mode: 'overhead' };
const overheadCard = { id: 'oh-Mega Fixture (d4)', world_name: 'Mega Fixture (d4)', world_data: rawOverhead };
ok(WT.exportHidden(overheadCard.world_data) === true, 'overhead CARD: exportHidden(w.world_data) hides Export (the 368 case)');
ok(WT.exportAllowed(overheadCard.world_data) === false, 'overhead CARD: export not allowed when hidden');

// 4. Side-scroll card (confirms the flag from the other direction — the tester\'s open question).
const ssCard = { id: 'ss1', world_data: { worldAdvSettings: { hideFromExport: T } } };
ok(WT.exportHidden(ssCard.world_data) === true, 'side-scroll CARD: honours the flag too');

// 5. Hardening: passing the WHOLE card (not w.world_data) still resolves — no silent re-break.
ok(WT.exportHidden(overheadCard) === true, 'passing the whole overhead card (wrapper) still hides');
ok(WT.exportHidden(ssCard) === true, 'passing the whole side-scroll card (wrapper) still hides');
ok(WT.exportHidden({ id: 'x', world_data: { worldAdvSettings: {} } }) === false, 'wrapper with flag off → visible');

// 6. Top-level fallback + junk inputs.
ok(WT.exportHidden({ hideFromExport: T }) === true, 'top-level hideFromExport → hidden');
ok(WT.exportHidden(null) === false && WT.exportHidden(undefined) === false && WT.exportHidden('x') === false, 'junk input → not hidden (never throws)');

console.log(`\n  export-hidden predicate: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
