// ============================================================
// test-overhead-editor-selmove.js — editor render-loop flood fix (QA 2026-08-07)
// ------------------------------------------------------------
// The tester hit ~9,990 identical "Cannot read properties of undefined (reading 'col')"
// errors from the overhead editor's _render loop after selecting a TERRAIN cell with the Hand
// tool (part of the 363 d1 pass). Cause: the "click to move" highlight did a blind
// `this._selEnt.ref.col`, but a terrain selection has no `.ref` (and a bridge span's ref has
// no `.col`), so it threw every frame (the _loop try/catch turned the throw into a console
// flood rather than a hard freeze). Fix: gate that highlight on `_selEnt.moving` (it is the
// ARMED-to-move prompt; the un-armed selection outline is a separate branch) and resolve the
// entity's cell robustly (span -> from, object -> ref.col, terrain -> the selection's own col).
// The render path is canvas/DOM-bound, so this is a source-level guard.
// ============================================================
const fs = require('fs');
const path = require('path');
let passed = 0, failed = 0;
function ok(cond, msg) { if (cond) { passed++; } else { failed++; console.error('  ✗ ' + msg); } }

const raw = fs.readFileSync(path.join(__dirname, '..', 'js', 'overhead', 'overhead-editor.js'), 'utf8');
const strip = (s) => s.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
const src = strip(raw);

// The crashing pattern is gone: the highlight no longer blind-reads _selEnt.ref then .col.
ok(!/if \(this\._selEnt && this\.tool === 'hand'\) \{ const s = this\._selEnt\.ref; const sp = S\(\(s\.col/.test(src),
   'the old blind _selEnt.ref.col "click to move" highlight is removed');

// The armed highlight is gated on _selEnt.moving (complements the !moving selection outline).
ok(/this\._selEnt && this\._selEnt\.moving && this\.tool === 'hand'/.test(src),
   'the "click to move" highlight only draws when a move is ARMED (_selEnt.moving)');
ok(/this\._selEnt && !this\._selEnt\.moving && this\.tool === 'hand'/.test(src),
   'the static selection outline draws only when NOT moving (the complementary branch still exists)');

// Cell resolution is robust: span (from) / object (ref.col) / terrain (own col), guarded non-null.
ok(/ref && ref\.from \? ref\.from\.col : ref && ref\.col != null \? ref\.col : e\.col/.test(src),
   'armed-highlight column resolves span->from, object->ref.col, terrain->e.col');
ok(/ref && ref\.from \? ref\.from\.row : ref && ref\.row != null \? ref\.row : e\.row/.test(src),
   'armed-highlight row resolves the same way');
ok(/if \(hc != null && hr != null\)/.test(src),
   'the highlight is skipped when no cell resolves (bridge span with no anchor cell, etc.)');

// The move-destination handler (the thing the prompt refers to) still requires .moving.
ok(/if \(this\._selEnt && this\._selEnt\.moving\) \{/.test(src),
   '_handClick still gates the actual move on _selEnt.moving');

console.log(`\n  overhead editor sel-move flood fix: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
