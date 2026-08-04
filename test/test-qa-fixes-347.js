// QA fixes from the completed build-346 test pass (build 347).
//   node test/test-qa-fixes-347.js
// F17 stomp fired on horizontal contact · F18 kicked shell came back at the player
// F13 gate hinge was walkable · F15 guardrails drew across the open ends
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const ROOT = path.join(__dirname, '..');

// ── F17 / F18 — read the 2D rules straight out of mobs.js source, since the class
// hierarchy needs the whole side-scroll engine to instantiate. These pin the exact
// guard conditions the fixes turn on.
const mobs = fs.readFileSync(path.join(ROOT, 'js', 'mobs.js'), 'utf8');

console.log('F17 — a stomp must require actually falling:');
const isStomp = mobs.slice(mobs.indexOf('_isStomp(p) {'), mobs.indexOf('_stompBounce(p)'));
ok(/p\.onGround \|\| p\.vy <= 1/.test(isStomp), 'grounded, or barely-moving-down, cannot stomp');
ok(isStomp.indexOf('p.onGround') < isStomp.indexOf('_touchesPlayer'), 'the cheap guard runs before the overlap test');
ok(/QA F17/.test(isStomp), 'the reason is recorded at the guard');

console.log('F18 — a kicked shell must leave the player, not return:');
const shell = mobs.slice(mobs.indexOf('class Shell extends Mob'), mobs.indexOf('// ── Mob Manager'));
// Both kick paths (walk into an idle shell, and stomp a still one) must set vx and mark
// the transition frame.
const kicks = shell.match(/slideState = 'sliding';[^\n]*/g) || [];
ok(kicks.length === 2, `both kick paths present (${kicks.length})`);
ok(kicks.every((k) => /this\.vx = this\.facing \* this\.slideSpeed/.test(k)), 'each sets vx immediately on the kick frame');
ok(kicks.every((k) => /_slideStart = true/.test(k)), 'each marks the transition frame');
ok(kicks.every((k) => /facing = \((?:player|p)\.cx <= this\.cx\) \? 1 : -1/.test(k)), 'facing points AWAY from the player');
ok(/!this\._slideStart && Math\.abs\(this\.x - px\)/.test(shell), 'the wall-reverse test skips the kick frame');
ok(/this\._slideStart = false;/.test(shell), 'and the flag clears after one frame');
// The ordering is the whole bug: reverse-test must come after the flag is honoured.
ok(shell.indexOf('_slideStart = false;') > shell.indexOf('!this._slideStart &&'), 'flag clears AFTER the reverse test reads it');

// ── F13 / F15 — overhead runtime. Load enough of the engine to call the real helpers.
global.window = global;
global.CANVAS_W = 800; global.CANVAS_H = 500; global.GAME_VERSION = 'v3 build 347 (qa fixes)';
function stubCtx() { return new Proxy({ filter: 'none' }, { get(t, k) { if (k === 'measureText') return () => ({ width: 80 }); if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} }); if (k === 'canvas') return { width: 800, height: 500 }; if (k in t) return t[k]; return (typeof k === 'string') ? (() => {}) : undefined; }, set(t, k, v) { t[k] = v; return true; } }); }
const cls = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
function mkEl() { return { style: {}, classList: cls, appendChild() {}, addEventListener() {}, getContext: () => stubCtx(), getBoundingClientRect: () => ({ width: 800, height: 500, left: 0, top: 0 }), querySelectorAll: () => [], width: 800, height: 500 }; }
global.document = { getElementById: () => mkEl(), head: { appendChild() {} }, createElement: () => mkEl(), body: { appendChild() {}, classList: cls }, addEventListener() {} };
global.window.addEventListener = () => {}; global.window.dispatchEvent = () => {}; global.Event = function () {};
global.InputManager = function () { this.flush = () => {}; this.isJustDown = () => false; this.isDown = () => false; this.mouse = { x: 0, y: 0, clicked: false, down: false, rightClicked: false, moveVec: { x: 0, y: 0 } }; };
global.requestAnimationFrame = () => 0;
['palette', 'grid', 'buildings', 'movement', 'controls', 'combat', 'weapons', 'elevation', 'settings', 'daynight', 'redstone', 'templates', 'launch', 'game']
  .forEach((m) => require(path.join(ROOT, 'js', 'overhead', 'overhead-' + m + '.js')));
const OVERHEAD = global.OVERHEAD;

console.log('F13 — the gate HINGE must be solid (it is drawn as a solid post):');
const gate = { col: 5, row: 5, len: 3, rest: 0, height: 2 };
const panel = OVERHEAD.gateCells(gate, 0, 20, 20);
ok(panel.length === 3, `the panel is the 3 cells past the hinge (${panel.length})`);
ok(!panel.some((c) => c.col === gate.col && c.row === gate.row), 'gateCells() still excludes the hinge (drawGates adds the post itself)');
// So the runtime must add it. Pin that at the source, since building a live game here
// would need a full world.
const ohGame = fs.readFileSync(path.join(ROOT, 'js', 'overhead', 'overhead-game.js'), 'utf8');
ok(/solid\.add\(gt\.col \+ ','ic? \+ gt\.row\)|solid\.add\(gt\.col \+ ',' \+ gt\.row\)/.test(ohGame), 'the runtime adds the hinge cell to the solid set');
ok(/QA F13/.test(ohGame), 'the reason is recorded');
const shadowAdds = (ohGame.match(/\[\{ col: gt\.col, row: gt\.row \}\]\.concat\(gt\._cells \|\| \[\]\)/g) || []);
ok(shadowAdds.length === 2, `the hinge also casts + erases its shadow like the panel (${shadowAdds.length}/2 passes)`);

console.log('F15 — guardrails only on the LONG sides, ends stay open:');
// Search the whole file: indexOf on a method name hits the CALL site before the
// definition, so slicing between them can yield an empty range.
const span = ohGame;
ok(/const horizontal = Math\.abs\(tc - fc\) >= Math\.abs\(tr - fr\)/.test(span), 'the run axis is derived from from/to');
ok(/if \(horizontal\) \{ edges\.w = false; edges\.e = false; \} else \{ edges\.n = false; edges\.s = false; \}/.test(span),
   'the faces ALONG the run are cleared, so the ends draw no rail');
ok(/QA F15/.test(span), 'the reason is recorded');
// And it must match the collision rule, which already only blocks perpendicular steps.
ok(/Guardrails are only on the LONG SIDES/.test(ohGame), 'collision still documents the same rule (render now agrees with it)');

console.log('F9 — Esc-with-nothing-selected must not default to a destructive button:');
const ed = fs.readFileSync(path.join(ROOT, 'js', 'overhead', 'overhead-editor.js'), 'utf8');
const quit = ed.slice(ed.indexOf('_quitModal() {'), ed.indexOf('_stampTree(col, row)'));
ok(/class="primary" id="q-cancel"/.test(quit), 'the PRIMARY button is now Keep editing');
ok(!/class="primary" id="q-save"/.test(quit), '"Save & quit" is no longer primary');
ok(quit.indexOf('id="q-quit"') < quit.indexOf('id="q-cancel"'), 'the destructive options sit away from the default');
ok(/cancelBtn\.focus\(\)/.test(quit), 'Keep editing takes focus, so a stray Enter is harmless');

console.log('F10 — legacy `channel` wiring on a SINK must still drive it:');
const OH_SETTINGS = global.OH_SETTINGS;
ok(OH_SETTINGS.SCHEMA === 2, 'the schema is at v2 (' + OH_SETTINGS.SCHEMA + ')');
{
  // A pre-v2 world exactly like the QA fixture: a piston wired by the old shared bus.
  const w = { viewMode: 'overhead', mapSnapshot: { gridW: 4, gridH: 4, density: 1, ground: [[],[],[],[]], elevation: [[],[],[],[]] },
    redstone: [{ kind: 'piston', col: 9, row: 6, channel: 'g1' }, { kind: 'lamp', col: 1, row: 1, channel: 'g1' },
               { kind: 'lever', col: 0, row: 0, channel: 'g1' }, { kind: 'rx', col: 2, row: 2, channel: 'g2', rxIds: [5] },
               { kind: 'piston', col: 3, row: 3, channel: 'g3', rxChannel: 'g9' }, { kind: 'dust', col: 2, row: 3, channel: 'g1' }] };
  OH_SETTINGS.migrate(w);
  const get = (kind, col) => w.redstone.find((d) => d.kind === kind && d.col === col);
  ok(get('piston', 9).rxChannel === 'g1', 'the inert piston now LISTENS to its legacy channel');
  ok(get('lamp', 1).rxChannel === 'g1', 'a legacy-wired lamp too');
  ok(get('piston', 9).channel === 'g1', 'the original channel field is left intact (non-destructive)');
  ok(get('lever', 0).rxChannel === undefined, 'a SOURCE is untouched — `channel` there means transmit');
  ok(get('dust', 2).rxChannel === undefined, 'dust is plain wire and is not given a receiver');
  ok(get('rx', 2).rxChannel === undefined, 'a sink that already has rxIds is left alone (no guessing)');
  ok(get('piston', 3).rxChannel === 'g9', 'an explicit rxChannel is never overwritten');
  ok(w.schemaVersion === 2, 'the world is stamped v2');
  // Idempotent: running it again changes nothing.
  const before = JSON.stringify(w.redstone);
  OH_SETTINGS.migrate(w);
  ok(JSON.stringify(w.redstone) === before, 'migrating twice is a no-op');
}

console.log('Build 350 — pit death: keep the trigger, STEP the sprite off the ledge:');
{
  const ohSrc = fs.readFileSync(path.join(ROOT, 'js', 'overhead', 'overhead-game.js'), 'utf8');
  // 349 delayed the trigger with a penetration margin; that let you walk to the MIDDLE of
  // the pit before dying, which was worse. The trigger zone was right all along.
  ok(!/_wellInside/.test(ohSrc), 'the 349 penetration margin is gone (trigger back on cell entry)');
  ok(/this\._pitsDeadly && this\._pit\(c\.col, c\.row\)\) this\._die/.test(ohSrc), 'a deadly pit fires on entering the cell');
  // The fix is now visual: slide the sprite off the land it was standing on, dropping the
  // 2.5D lift to 0, before the shrink starts.
  ok(/phase: 'step'/.test(ohSrc), 'the death FX starts in a step-off phase');
  ok(/fx\.phase === 'step'\) \{ if \(fx\.t >= fx\.stepDur\) \{ fx\.phase = 'sink'/.test(ohSrc), 'step hands over to sink');
  ok(/fromLift/.test(ohSrc) && /toLift/.test(ohSrc), 'it interpolates the elevation LIFT, not just x/y');
  ok(/fromLift \+ \(\(fx\.toLift \|\| 0\) - fx\.fromLift\) \* e\)/.test(ohSrc), 'the lift falls away as the sprite moves into the hole');
  ok(/k \* k \* \(3 - 2 \* k\)/.test(ohSrc), 'eased rather than linear, so it reads as a step not a slide');
  ok(/QA/.test(ohSrc) || /Kevin, build 350/.test(ohSrc), 'the reasoning is recorded');
  // Phase order must be step -> sink -> burst, with burst still parted from the pit centre.
  const adv = ohSrc.slice(ohSrc.indexOf('_advanceDeath()'), ohSrc.indexOf('_drawDyingSprite(ctx, sx'));
  ok(adv.indexOf("'step'") < adv.indexOf("'sink'"), 'step is advanced before sink');
  ok(/fx\.phase = 'burst'; fx\.t = 0; fx\.parts = this\._burstParts\(fx\.x, fx\.y\)/.test(adv), 'the burst still originates at the pit centre');
}

console.log('Build 349 — the editor clips the world to the map viewport:');
{
  const edSrc = fs.readFileSync(path.join(ROOT, 'js', 'overhead', 'overhead-editor.js'), 'utf8');
  ok(/ctx\.rect\(LEFT, TOP, VW, VH\); ctx\.clip\(\);/.test(edSrc), 'the world block is clipped to LEFT/TOP/VW/VH');
  ok(/end of the map clip/.test(edSrc), 'and released before the chrome draws');
  // The release must be unconditional — it sat inside `if (this._pickTx)` at first, which
  // would have leaked the clip in every other mode.
  const rel = edSrc.slice(0, edSrc.indexOf('end of the map clip'));
  const lastLine = rel.slice(rel.lastIndexOf('\n', rel.length - 2) + 1);
  ok(!/^\s{8,}/.test(lastLine), 'the release is at function level, not nested in a mode branch');
  ok(/overlap = \(id, side\)/.test(edSrc), 'rail insets measure the REAL rail-canvas overlap');
  ok(/rectC\.right - r\.left/.test(edSrc), 'the right inset is canvas-relative, not the rail width');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
