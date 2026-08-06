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
  // Build 355: the burst spawns at the body's VISUAL rest point (drift included), which is
  // what removes the offset between the explosion and the falling sprite.
  ok(/_burstParts\(fx\.x, fx\.y \+ \(fx\.driftCells \|\| 0\) \* this\.grid\.cell\)/.test(adv),
     'the burst spawns where the body visually came to rest, drift included');
  ok(/drift = cs \* \(0\.15 \+ 0\.30 \* \(1 - scale\)\)/.test(ohSrc), 'the sink drift is CELL-relative (cs), not sprite-size');
  ok(!/size \* 0\.2 \+ size \* 0\.55 \* \(1 - scale\)/.test(ohSrc),
     'the old sprite-size drift is GONE — it was unit*density, i.e. whole cells on a dense map');
  ok(/_drawDyingSprite\(ctx, sx, sy, size, scale, t, drift\)/.test(ohSrc), 'the drift is a caller-supplied parameter now');
  ok(/Seven builds chased the consequences of this one line/.test(ohSrc), 'the root cause is recorded where it was');

  // Builds 351-353 — the ACTUAL cause: terrain is one flat cached layer, so any sprite
  // drawn after it paints over every block including raised cliffs. Position could never
  // fix that (348-350), and clipping the sprite to the pit CROPPED it, because the dying
  // figure is ~1.3 cells tall (351/352). 353 draws it full size then paints the occluding
  // blocks back over it.
  ok(/this\._terrainCache = b\.cv;/.test(ohSrc), 'terrain really is baked into one cached canvas (now published by the chunked bake, build 373)');
  ok(/_redrawOccluders\(ctx, S, cs, pitCol, pitRow\)/.test(ohSrc), 'both death phases run the occluder pass');
  // 356 adds a third call: for a PIT death the burst pieces hide behind terrain too.
  ok((ohSrc.match(/this\._redrawOccluders\(/g) || []).length === 3, 'step, sink AND the pit burst run the occluder pass');
  ok(/if \(fx\.pit\) \{[\s\S]*?this\._redrawOccluders\(ctx, S, cs, pitCol, pitRow\)/.test(ohSrc), 'the burst occluder pass is gated on a pit death');
  ok(/phase: 'step', pit: true/.test(ohSrc), 'pit deaths are flagged, so other deaths keep their pieces on top');
  ok(/const reach = Math\.max\(2, Math\.ceil\(1\.3 \* \(this\._density \|\| 1\)\) \+ 1\)/.test(ohSrc),
     'the occluder window scales with DENSITY, since the body hangs 1.3*unit below its anchor');
  ok(!/ctx\.rect\(clipX, clipY, clipW, clipH\)/.test(ohSrc), 'the 351/352 clip that cropped the sprite is gone');

  const occ = ohSrc.slice(ohSrc.indexOf('_redrawOccluders(ctx, S, cs'), ohSrc.indexOf('_pitCentreNear(x, y)'));
  ok(/if \(c \+ r <= depth\) continue;/.test(occ), 'only cells NEARER the camera than the body are redrawn');
  // Build 354 — the 353 rule skipped anything at elevation 0, which is the COMMON case:
  // a pit in flat ground has no raised neighbours, so nothing was ever drawn over the body.
  ok(!/if \(e <= 0\) continue;/.test(occ), 'the elevation gate that excluded flat ground is gone');
  ok(/k === 'pit'\) continue;/.test(occ), 'only pit cells are skipped — there is no floor there to hide behind');
  ok(/NOT gated on elevation/.test(occ), 'and the reason is recorded');
  ok(/out\.sort\(\(a, b\) => \(a\.r \+ a\.c\) - \(b\.r \+ b\.c\) \|\| a\.e - b\.e\)/.test(occ), 'occluders are drawn back-to-front, like the cache builds them');
  ok(/sN < o\.e, eN < o\.e/.test(occ), 'and with the same exposed-face flags, so they match the baked terrain');
  ok(/c < 0 \|\| r < 0 \|\| c >= g\.gridW \|\| r >= g\.gridH/.test(occ), 'map edges are bounds-checked');
  // The directional shift stays — it puts the body where there is open hole to see it in.
  ok(/DIRECTIONAL SHIFT/.test(ohSrc), 'the shift away from the entry edge is still applied');
  ok(/const dirX = sgn\(at\.x - p\.x\), dirY = sgn\(at\.y - p\.y\);/.test(ohSrc), 'per-axis, away from where the player came from');
  // 356: deeper than 0.55, but clamped to the pit that is actually there.
  ok(/Math\.min\(0\.85, 0\.35 \+ runX \* 0\.5\)/.test(ohSrc) && /Math\.min\(0\.85, 0\.35 \+ runY \* 0\.5\)/.test(ohSrc),
     'the shift grows with how far the pit continues, capped at 0.85 of a cell');
  ok(/while \(runX < 2 && dirX && this\._pit\(pc \+ dirX \* \(runX \+ 1\), pr\)\)/.test(ohSrc),
     'it measures the actual pit run, so a one-cell pit cannot fling the body out the far side');
  ok(/this\._debug\) \{ this\._deathSlow/.test(ohSrc), 'the debug HUD slows the death to quarter speed so it can be captured');
}

console.log('Build 366 — A1.4: burst pieces have a decaying HEIGHT (airborne over the rim, then settle):');
{
  const ohSrc = fs.readFileSync(path.join(ROOT, 'js', 'overhead', 'overhead-game.js'), 'utf8');
  // Behavioural: _burstParts must now give every piece a height dimension it never had.
  const OverheadGame = global.OverheadGame;
  const parts = OverheadGame.prototype._burstParts.call({ unit: 4 }, 100, 100);
  ok(parts.length > 0 && parts.every((q) => q.h === 0 && q.vh > 0),
     'every piece starts at h=0 with an upward launch (vh>0) — the height dimension exists');
  // Simulate the documented integration (grav = unit*0.012) and confirm the arc: early frames
  // rise ABOVE a rim sliver, later frames settle back to the ground plane (h===0).
  const unit = 4, grav = unit * 0.012, AIR = /*cell*/ 1 * 0.05;   // world px; cell≈1 here for the test
  const q = parts[0]; let peak = 0, settledFrame = -1;
  for (let f = 0; f < 60; f++) { q.vh -= grav; q.h += q.vh; if (q.h < 0) { q.h = 0; q.vh = 0; if (settledFrame < 0 && f > 0) settledFrame = f; } peak = Math.max(peak, q.h); }
  ok(peak > AIR, 'a piece rises clearly above the rim sliver in its early frames (airborne)');
  ok(settledFrame > 0, 'and comes back down to the ground plane (h returns to 0) — it settles');
  // Source: the pit branch draws SETTLED pieces before the occluder pass and AIRBORNE ones
  // after, so height (not draw order) decides whether a piece is over the rim. Strip comments
  // first (lesson 5) — the prose mentions "over the rim" and would false-match.
  const ohNoComments = ohSrc.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  const burst = ohNoComments.slice(ohNoComments.indexOf('else if (fx.parts) {'), ohNoComments.indexOf('Day/night ambient'));
  ok(/q\.vh -= grav; q\.h \+= q\.vh; if \(q\.h < 0\)/.test(ohNoComments), 'the update integrates a light gravity on the height');
  ok(/\(q\.h \|\| 0\) <= AIR\) drawPart/.test(burst) && /\(q\.h \|\| 0\) > AIR\) drawPart/.test(burst),
     'settled pieces draw before the occluder pass, airborne pieces after');
  ok(burst.indexOf('(q.h || 0) <= AIR') < burst.indexOf('_redrawOccluders') && burst.indexOf('_redrawOccluders') < burst.indexOf('(q.h || 0) > AIR'),
     'the occluder re-draw sits BETWEEN the settled and airborne draws');
  ok(/s\.y - \(q\.h \|\| 0\) \* z/.test(burst), 'a piece is lifted on screen by its height');
}

console.log('Build 368 — P1.7 unit-offset audit: pipe-climb positions stay proportional at any density:');
{
  const OverheadGame = global.OverheadGame, OH_BUILDINGS = global.OH_BUILDINGS;
  const ohSrc = fs.readFileSync(path.join(ROOT, 'js', 'overhead', 'overhead-game.js'), 'utf8');
  // Drive _startPipeClimb on a stub `this` at density 1 and 4 with a 2x2-BLOCK pipe
  // (footprint = 2*density cells). The rim/approach offsets must scale with the pipe, so
  // "below" (where the body pulls up from) lands at the SAME fraction of the pipe height at
  // any density — otherwise it sits buried at the pipe centre on a dense map (the bug).
  const climbFor = (density) => {
    const cell = 10, unit = cell * density;
    const orig = OH_BUILDINGS.footprintOf;
    OH_BUILDINGS.footprintOf = () => ({ w: 2 * density, h: 2 * density });   // 2x2 blocks
    const self = { grid: { cell, masterZoom: 1 }, unit, player: { x: 0, y: 0 }, _density: density,
      _pipeClimbTimeline: OverheadGame.prototype._pipeClimbTimeline };
    try { OverheadGame.prototype._startPipeClimb.call(self, { typeId: 'pipe', col: 5, row: 5 }, {}); }
    finally { OH_BUILDINGS.footprintOf = orig; }
    // halfH = fh/2 cells * cell = density * cell (footprint is 2*density cells tall).
    return { cell, cy: self._climb.cy, edgeY: self._climb.edgeY, halfH: density * cell };
  };
  const d1 = climbFor(1), d4 = climbFor(4);
  const edgeFrac = (m) => (m.edgeY - m.cy) / m.halfH;   // rim offset as a fraction of the pipe half-height
  ok(Math.abs(edgeFrac(d1) - edgeFrac(d4)) < 1e-9, 'the grab-rim offset is the SAME fraction of the pipe at density 1 and 4 (proportional, not buried)');
  ok(Math.abs((d1.edgeY - d1.cy) - 0.45 * 10) < 1e-9, 'density 1 is unchanged (unit == cell there): edgeY = cy + 0.45 cell');
  ok(Math.abs((d4.edgeY - d4.cy) - 0.45 * 40) < 1e-9, 'density 4 scales with unit: edgeY = cy + 0.45 * (4 cell)');
  // Source: the pipe-relative offsets are now unit-based, and melee reach (hit AND draw) is
  // the same unit-based value so they can never desync (comment-stripped, lesson 5).
  const oh = ohSrc.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  ok(/edgeY: cy \+ this\.unit \* 0\.45/.test(oh), 'pipe rim offset is unit-based (block-relative)');
  ok(/below = edgeY \+ this\.unit \* 0\.5/.test(oh), 'pipe approach offset is unit-based');
  ok(/cy - this\.unit \* 0\.14/.test(oh), 'pipe opening offset is unit-based');
  ok(/reach: this\.unit \* \(this\.settings\.meleeReach \|\| 2\.4\)/.test(oh), 'melee HIT cone reach is unit-based (block-relative — correct, not a bug)');
  ok(/reach = this\.unit \* \(this\.settings\.meleeReach \|\| 2\.4\) \* z/.test(oh), 'melee DRAWN arc uses the SAME unit-based reach, so hit and draw cannot drift apart');
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

console.log('Build 362 — A4.7 lever hit-area scales with DENSITY, not elevation:');
{
  require(path.join(ROOT, 'js', 'overhead', 'overhead-editor.js'));   // singleton not loaded above
  const OH_EDITOR = global.OH_EDITOR;
  const reach = (kind, d) => OH_EDITOR._deviceReach(kind, d);
  // The reach must grow with density (lesson 1: a unit-based sprite multiplies with density).
  ok(reach('lever', 1).up === 0 && reach('lever', 1).down === 1 && reach('lever', 1).side === 0,
     'density 1: sprite covers the anchor + one row below, no sideways spread');
  ok(reach('lever', 4).up === 2 && reach('lever', 4).down === 3 && reach('lever', 4).side === 2,
     'density 4: arm tip reaches 2 rows up, base 3 rows down, 2 cols either side (measured)');
  ok(reach('lever', 4).up > reach('lever', 1).up, 'upward reach GROWS with density (the old code was fixed at 1)');
  // Cell-sized devices keep the exact-cell hit — they draw inside their own cell.
  ok(reach('piston', 4).up === 0 && reach('lock', 4).down === 0, 'cell-sized devices get no forgiveness');
  // The actual selection: a lever on FLAT ground (elevation 0) at density 4, clicked at its
  // arm tip 2 rows ABOVE the anchor, must still resolve. The old code gated the 2-row branch
  // on elevAt>0, so a flat dense map made levers unselectable where they drew.
  const stub = {
    world: { redstone: [{ kind: 'lever', col: 10, row: 10 }], mapSnapshot: { elevation: [] } },
    grid: { density: 4 },
    _deviceReach: OH_EDITOR._deviceReach,
  };
  const hit = OH_EDITOR._deviceAt.call(stub, 10, 8);   // click 2 rows above anchor, flat ground
  ok(hit && hit.col === 10 && hit.row === 10, 'clicking the arm tip (2 rows up, elevation 0) selects the lever');
  ok(OH_EDITOR._deviceAt.call(stub, 10, 13), 'clicking the base (3 rows below anchor) selects it too');
  ok(OH_EDITOR._deviceAt.call(stub, 12, 10), 'clicking 2 cols to the side selects it');
  ok(!OH_EDITOR._deviceAt.call(stub, 10, 15), 'a click well outside the sprite selects nothing');
  // The elevation gate must be GONE from the source (assert against code, not comments).
  const edNoComments = fs.readFileSync(path.join(ROOT, 'js', 'overhead', 'overhead-editor.js'), 'utf8')
    .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  const deviceAt = edNoComments.slice(edNoComments.indexOf('_deviceReach(kind, density)'), edNoComments.indexOf('_selHasSettings'));
  ok(!/elevAt/.test(deviceAt), 'the elevation gate is gone from _deviceAt (reach is density-driven now)');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
