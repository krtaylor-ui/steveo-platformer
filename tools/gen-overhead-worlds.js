// ══════════════════════════════════════════════════════════════════════════
// Overhead world GENERATOR (Campaign-ready sample levels).
//   node tools/gen-overhead-worlds.js
// Emits importable overhead world JSON into tools/overhead-worlds/. Each file is a
// RAW overhead world object (viewMode:'overhead') → import via Sandbox ▸ "Import
// from file"; it lands in the Overhead browser, editable + playable. Every world is
// validated by loading it into the real OverheadGame (headless canvas stub) and
// running a few frames, plus spawn/goal sanity + a rough reachability BFS.
// NOTE: uses the build 298–305 overhead engine (span bridges, redstone, pits…).
// ══════════════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), OUT = path.join(__dirname, 'overhead-worlds');
const R = () => Math.random();

// ── Load the engine headlessly (for validation) ────────────────────────────
global.window = global;
function stubCtx() { return new Proxy({}, { get(t, k) { if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} }); if (k === 'canvas') return { width: 800, height: 500 }; return (typeof k === 'string') ? (() => {}) : undefined; }, set() { return true; } }); }
const cls = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
function mkEl() { return { style: {}, classList: cls, appendChild() {}, addEventListener() {}, getContext: () => stubCtx(), getBoundingClientRect: () => ({ width: 800, height: 500, left: 0, top: 0 }), width: 800, height: 500 }; }
global.document = { getElementById: () => mkEl(), head: { appendChild() {} }, createElement: () => mkEl(), body: { appendChild() {}, classList: cls }, addEventListener() {} };
global.window.addEventListener = () => {}; global.window.dispatchEvent = () => {}; global.Event = function () {};
global.InputManager = function () { this.flush = () => {}; this.isJustDown = () => false; this.isDown = () => false; this.justPressed = () => false; this.mouse = { x: 0, y: 0, clicked: false, down: false, rightClicked: false, moveVec: { x: 0, y: 0 } }; };
global.requestAnimationFrame = () => 0;
['palette', 'grid', 'buildings', 'movement', 'controls', 'combat', 'weapons', 'elevation', 'settings', 'daynight', 'redstone', 'launch', 'game']
  .forEach((m) => require(path.join(ROOT, 'js/overhead/overhead-' + m + '.js')));
const OverheadGame = global.OverheadGame, OH_SETTINGS = global.OH_SETTINGS;

// ── World builder ───────────────────────────────────────────────────────────
function World(name, W, H, opts) {
  opts = opts || {};
  const ground = [], elevation = [];
  for (let r = 0; r < H; r++) { ground.push(new Array(W).fill(opts.floor || 'grass')); elevation.push(new Array(W).fill(0)); }
  return {
    name, mode: 'platformer', viewMode: 'overhead', gameModeDefault: 'NRM',
    controlScheme: 'free-aim', angleLockDeg: 0, rules: {},
    mapSnapshot: { gridW: W, gridH: H, density: 1, baseW: W, baseH: H, cell: 32, objectScaleMode: 'independent', ground, elevation, decorations: [] },
    buildings: [], mobs: [], items: [], spawns: [{ col: 1, row: H - 2 }], ramps: [], bridges: [], redstone: [],
    goal: null, settings: Object.assign(OH_SETTINGS.defaults(), opts.settings || {}),
    _W: W, _H: H,
  };
}
const inB = (w, c, r) => c >= 0 && r >= 0 && c < w._W && r < w._H;
function set(w, c, r, key, e) { if (!inB(w, c, r)) return; const m = w.mapSnapshot; m.ground[r][c] = key; if (e != null) m.elevation[r][c] = e; }
function rect(w, c0, r0, c1, r1, key, e) { for (let r = Math.min(r0, r1); r <= Math.max(r0, r1); r++) for (let c = Math.min(c0, c1); c <= Math.max(c0, c1); c++) set(w, c, r, key, e); }
function hwall(w, r, c0, c1, key, e) { for (let c = Math.min(c0, c1); c <= Math.max(c0, c1); c++) set(w, c, r, key, e); }
function vwall(w, c, r0, r1, key, e) { for (let r = Math.min(r0, r1); r <= Math.max(r0, r1); r++) set(w, c, r, key, e); }
function border(w, key, e, t) { t = t || 1; const W = w._W, H = w._H; for (let i = 0; i < t; i++) { hwall(w, i, 0, W - 1, key, e); hwall(w, H - 1 - i, 0, W - 1, key, e); vwall(w, i, 0, H - 1, key, e); vwall(w, W - 1 - i, 0, H - 1, key, e); } }
function mob(w, c, r, type) { const d = { zombie: { hp: 8, speed: 1.4, detect: 6 }, skeleton: { hp: 6, speed: 1.6, detect: 8 }, spider: { hp: 6, speed: 2, detect: 7 } }[type]; w.mobs.push({ col: c, row: r, type, hp: d.hp, speed: d.speed, detect: d.detect }); }
function item(w, c, r, key) { const it = { crossbow: { kind: 'weapon', weapon: 'crossbow' }, trident: { kind: 'weapon', weapon: 'trident' }, boomerang: { kind: 'weapon', weapon: 'boomerang' }, coin: { kind: 'coin' } }[key]; w.items.push({ col: c, row: r, kind: it.kind, weapon: it.weapon, itemKey: key }); }
function ramp(w, c, r, kind) { w.ramps.push({ col: c, row: r, kind: kind || 'ramp' }); }
function bridge(w, from, to, elev, draw, ch) { const b = { from, to, elev: elev || 0, draw: !!draw, rail: true }; if (draw) b.channel = ch || 'gate'; w.bridges.push(b); }
function lever(w, c, r, ch, on) { w.redstone.push({ col: c, row: r, kind: 'lever', on: !!on, channel: ch || 'gate', txId: w.redstone.length + 1 }); }
function spawn(w, c, r) { w.spawns = [{ col: c, row: r }]; }
function goal(w, c, r, color) { w.goal = { col: c, row: r, color: color || 0 }; }
function tree(w, c, r) { for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) { if (!dc && !dr) continue; const d2 = dc * dc + dr * dr; if (d2 <= 2) set(w, c + dc, r + dr, 'leaves', 4); else if (d2 <= 5) set(w, c + dc, r + dr, 'leaves', 3); } set(w, c, r, 'log', 2); }

// ── 1) Whispering Woods — a hedge MAZE to explore (recursive-backtracker) ────
function whisperingWoods() {
  const W = 33, H = 25, w = World('Whispering Woods (maze)', W, H, { settings: { revealPlayer: true, revealRadius: 4 } });
  // Maze on odd cells; walls = 'bush' hedges at elev 2 (block). Carve grass paths.
  rect(w, 0, 0, W - 1, H - 1, 'bush', 2);                      // fill solid, carve out
  const cell = (c, r) => set(w, c, r, 'grass', 0);
  const gW = (W - 1) / 2 | 0, gH = (H - 1) / 2 | 0;            // maze cell grid
  const vis = new Set(), stack = [[0, 0]]; vis.add('0,0'); cell(1, 1);
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => { const nx = cx + dx, ny = cy + dy; return nx >= 0 && ny >= 0 && nx < gW && ny < gH && !vis.has(nx + ',' + ny); });
    if (!nb.length) { stack.pop(); continue; }
    const [dx, dy] = nb[R() * nb.length | 0], nx = cx + dx, ny = cy + dy;
    cell(nx * 2 + 1, ny * 2 + 1); cell(cx * 2 + 1 + dx, cy * 2 + 1 + dy);   // knock the wall
    vis.add(nx + ',' + ny); stack.push([nx, ny]);
  }
  spawn(w, 1, 1); goal(w, gW * 2 - 1, gH * 2 - 1, 0);
  // Trees over some junctions (reveal-window shows the player beneath), scattered coins in dead-ends, a few mobs, a crossbow reward mid-maze.
  const opens = []; for (let r = 1; r < H - 1; r++) for (let c = 1; c < W - 1; c++) if (w.mapSnapshot.ground[r][c] === 'grass') opens.push([c, r]);
  for (let i = 0; i < 10; i++) { const [c, r] = opens[R() * opens.length | 0]; item(w, c, r, 'coin'); }
  for (let i = 0; i < 5; i++) { const [c, r] = opens[R() * opens.length | 0]; if (c > 4 || r > 4) mob(w, c, r, R() < 0.5 ? 'spider' : 'zombie'); }
  item(w, gW - 1 | 0, gH - 1 | 0, 'crossbow');
  // Trees CENTERED on wall (even/even) cells so the trunk replaces a hedge (never
  // severs a corridor); the canopy spills over nearby paths (walk under it, and the
  // reveal-window shows the player beneath).
  tree(w, 8, 8); tree(w, 20, 14); tree(w, 12, 18);
  return w;
}

// ── 2) Sunspire Valley — natural mountains + a winding valley path ───────────
function sunspireValley() {
  const W = 40, H = 26, w = World('Sunspire Valley (natural)', W, H, { floor: 'grass' });
  // Mountain masses (stone/gravel) at high elevation, leaving a winding valley at elev 0.
  rect(w, 0, 0, W - 1, 7, 'stone', 4); rect(w, 0, 0, 9, H - 1, 'stone', 3);          // NW massif
  rect(w, 26, 0, W - 1, 12, 'gravel', 4); rect(w, 30, 10, W - 1, H - 1, 'stone', 5);  // E ridge
  rect(w, 4, 18, 20, H - 1, 'stone', 3);                                              // S bluff
  // Carve the valley floor (a winding grass path elev 0).
  const path = [[2, 24], [6, 22], [11, 20], [14, 16], [12, 12], [16, 9], [22, 10], [24, 14], [28, 16], [33, 15], [36, 9]];
  for (let i = 0; i < path.length - 1; i++) { const a = path[i], b = path[i + 1], steps = 14; for (let t = 0; t <= steps; t++) { const c = Math.round(a[0] + (b[0] - a[0]) * t / steps), r = Math.round(a[1] + (b[1] - a[1]) * t / steps); rect(w, c - 1, r - 1, c + 1, r + 1, 'grass', 0); } }
  // A ramp up onto the goal plateau + a couple foothill ramps.
  set(w, 35, 9, 'stone', 1); ramp(w, 35, 10, 'ramp'); ramp(w, 34, 15, 'ramp'); set(w, 34, 14, 'stone', 1);
  // Two small lava pools as valley hazards.
  rect(w, 18, 13, 19, 14, 'lava', 0); rect(w, 25, 18, 26, 19, 'lava', 0);
  // Trees on the lower slopes; skeletons on the ridges (ranged), zombies in the valley.
  tree(w, 12, 23); tree(w, 22, 8); tree(w, 30, 20); tree(w, 6, 15);
  mob(w, 8, 5, 'skeleton'); mob(w, 33, 6, 'skeleton'); mob(w, 14, 17, 'zombie'); mob(w, 24, 13, 'zombie'); mob(w, 28, 17, 'spider');
  item(w, 12, 12, 'trident'); item(w, 6, 22, 'coin'); item(w, 24, 14, 'coin'); item(w, 33, 15, 'coin');
  spawn(w, 2, 24); goal(w, 37, 9, 0);   // goal on the far high plateau
  return w;
}

// ── 3) Temple of the Ember Vault — pits, bridges, lava, mobs, key items ──────
function emberTemple() {
  const W = 34, H = 26, w = World('Temple of the Ember Vault', W, H, { floor: 'stone', settings: { lavaDeadly: true, pitMode: 'deadly', drawbridgeStyle: 'animated', dayNight: true, nightDarkness: 0.75, dayStart: 0, revealPlayer: false } });
  rect(w, 0, 0, W - 1, H - 1, 'stone', 0);
  border(w, 'obsidian', 3, 1);
  rect(w, 2, 2, W - 3, H - 3, 'stone', 0);                                // open hall
  // A PIT chasm (cols 16–17) splits west (spawn/lever) from east — cross the FIXED
  // bridge at row 20. Fall in = death (pits deadly).
  rect(w, 16, 2, 17, H - 3, 'pit', 0);
  bridge(w, { col: 15, row: 20 }, { col: 18, row: 20 }, 0, false);         // fixed span across the chasm
  // West wing: spawn + the lever that lowers the vault drawbridge.
  lever(w, 5, 18, 'gate', false);
  // East side: a lava MOAT (col 24, rows 5–11) guards the treasure vault; a DRAWBRIDGE
  // at row 8 lowers onto the vault door once the lever is flipped.
  vwall(w, 24, 5, 11, 'lava', 0);
  rect(w, 25, 4, W - 3, 12, 'obsidian', 3);                                // vault walls (elev 3)
  rect(w, 26, 5, W - 4, 11, 'stone', 0);                                   // vault floor
  set(w, 25, 8, 'stone', 0);                                              // the DOOR (opening in the west wall)
  bridge(w, { col: 23, row: 8 }, { col: 25, row: 8 }, 0, true, 'gate');    // drawbridge over the moat → door
  // Glowstone sconces light the dark temple.
  set(w, 6, 6, 'glowstone', 0); set(w, 21, 4, 'glowstone', 0); set(w, 12, 12, 'glowstone', 0); set(w, 28, 10, 'glowstone', 0);
  // Guardians + key items (a crossbow near spawn, a boomerang reward in the vault).
  mob(w, 8, 8, 'skeleton'); mob(w, 21, 12, 'skeleton'); mob(w, 10, 20, 'spider'); mob(w, 21, 18, 'zombie'); mob(w, 27, 6, 'spider');
  item(w, 4, 4, 'crossbow'); item(w, 29, 6, 'boomerang'); item(w, 6, 12, 'coin'); item(w, 20, 22, 'coin'); item(w, 12, 6, 'coin');
  spawn(w, 3, 20); goal(w, 30, 8, 0);   // goal deep in the vault (flip the lever, cross the chasm + moat)
  return w;
}

// ── Validation: load into the real engine + spawn/goal sanity ────────────────
function validate(w) {
  const issues = [];
  const g = new OverheadGame(JSON.parse(JSON.stringify(w)), { testMode: true }, () => {});
  for (let f = 0; f < 8; f++) { g._update(); g._render(); }             // throws surface here
  const sp = w.spawns[0], m = w.mapSnapshot;
  const solidWall = (c, r) => { const k = m.ground[r][c]; return k != null && k !== 'leaves' && (m.elevation[r][c] | 0) >= 2; };
  if (solidWall(sp.col, sp.row)) issues.push('spawn is inside a wall');
  if (m.ground[sp.row][sp.col] === 'pit' || m.ground[sp.row][sp.col] === 'lava') issues.push('spawn on a hazard');
  if (!w.goal) issues.push('no goal'); else if (m.ground[w.goal.row][w.goal.col] === 'pit') issues.push('goal on a pit');
  // Rough reachability BFS spawn → goal (treats bridges/ramps as passable, deadly
  // pits/lava as blocked, walls = elev≥2 non-leaves/non-ramp; steps up ≤1 or via ramp).
  if (w.goal && !issues.length) {
    const bridgeCells = new Set(); for (const b of w.bridges) for (const cell of global.OVERHEAD.bridgeSpanCells(b)) bridgeCells.add(cell.col + ',' + cell.row);
    const rampCells = new Set(w.ramps.map((r) => r.col + ',' + r.row));
    const el = (c, r) => m.elevation[r][c] | 0;
    const eff = (c, r) => m.ground[r][c] === 'leaves' ? 0 : el(c, r);   // you walk UNDER leaves at ground level
    const pass = (c, r) => { if (!inB(w, c, r)) return false; const k = m.ground[r][c]; if (k == null) return false; if (bridgeCells.has(c + ',' + r)) return true; if (k === 'pit' || k === 'lava') return false; if (rampCells.has(c + ',' + r) || k === 'leaves') return true; return el(c, r) < 2; };
    const q = [[sp.col, sp.row]], seen = new Set([sp.col + ',' + sp.row]); let reached = false;
    while (q.length) { const [c, r] = q.shift(); if (c === w.goal.col && r === w.goal.row) { reached = true; break; }
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nc = c + dc, nr = r + dr, k = nc + ',' + nr; if (seen.has(k) || !pass(nc, nr)) continue;
        const up = eff(nc, nr) - eff(c, r); if (up > 1 && !rampCells.has(k) && !rampCells.has(c + ',' + r) && !bridgeCells.has(k)) continue; seen.add(k); q.push([nc, nr]); } }
    if (!reached) issues.push('GOAL UNREACHABLE from spawn (rough BFS)');
  }
  return { game: !!g, issues };
}

function emit(w) {
  delete w._W; delete w._H;
  w.world_name = w.name;   // so Import derives the nicely-cased name (not the filename slug)
  const file = path.join(OUT, w.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/^-|-$/g, '') + '.json');
  fs.writeFileSync(file, JSON.stringify(w, null, 2));
  return file;
}

const builders = [whisperingWoods, sunspireValley, emberTemple];
for (const build of builders) {
  const w = build(), name = w.name;
  const v = validate(w), file = emit(w);
  const rel = path.relative(ROOT, file);
  const stats = `${w.mapSnapshot.gridW}×${w.mapSnapshot.gridH} · ${w.mobs.length} mobs · ${w.items.length} items · ${w.bridges.length} bridges · ${w.redstone.length} redstone`;
  console.log((v.issues.length ? '⚠ ' : '✓ ') + name + '  [' + stats + ']  → ' + rel + (v.issues.length ? '  ISSUES: ' + v.issues.join('; ') : '  (loads + plays clean)'));
}
console.log('\nImport each JSON via Sandbox ▸ Import from file → it appears in the Overhead browser (edit / test / play).');
