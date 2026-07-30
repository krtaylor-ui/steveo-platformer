// Glass block + shatter (overhead). A raised glass pane is solid; when the world
// setting allows it, a melee swing or a ranged hit shatters it into a walkable gap and
// throws shards. With shatter off, glass is indestructible (except mining, in Normal).
//   node test/test-overhead-glass.js
global.window = global;
global.CANVAS_W = 800; global.CANVAS_H = 500; global.GAME_VERSION = 'v3 build 313 (glass test)';
function stubCtx() { return new Proxy({ filter: 'none' }, { get(t, k) { if (k === 'measureText') return () => ({ width: 80 }); if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} }); if (k === 'canvas') return { width: 800, height: 500 }; if (k in t) return t[k]; return (typeof k === 'string') ? (() => {}) : undefined; }, set(t, k, v) { t[k] = v; return true; } }); }
const cls = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
function mkEl() { return { style: {}, classList: cls, appendChild() {}, addEventListener() {}, getContext: () => stubCtx(), getBoundingClientRect: () => ({ width: 800, height: 500, left: 0, top: 0 }), width: 800, height: 500 }; }
global.document = { getElementById: () => mkEl(), head: { appendChild() {} }, createElement: () => mkEl(), body: { appendChild() {}, classList: cls }, addEventListener() {} };
global.window.addEventListener = () => {}; global.window.dispatchEvent = () => {}; global.Event = function () {};
global.InputManager = function () { this.flush = () => {}; this.isJustDown = () => false; this.isDown = () => false; this.mouse = { x: 0, y: 0, clicked: false, down: false, rightClicked: false, moveVec: { x: 0, y: 0 } }; };
global.requestAnimationFrame = () => 0;
const path = require('path');
['palette', 'grid', 'buildings', 'movement', 'controls', 'combat', 'weapons', 'elevation', 'settings', 'daynight', 'redstone', 'launch', 'game']
  .forEach((m) => require(path.join(__dirname, '..', 'js', 'overhead', 'overhead-' + m + '.js')));
const OverheadGame = global.OverheadGame, OH_SETTINGS = global.OH_SETTINGS, OH_WEAPONS = global.OH_WEAPONS, P = global.OH_PALETTE;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

const W = 10, H = 6;
function mk(shatter) {
  const ground = [], elevation = [];
  for (let r = 0; r < H; r++) { ground.push(new Array(W).fill('grass')); elevation.push(new Array(W).fill(0)); }
  ground[2][5] = 'glass'; elevation[2][5] = 2;   // a raised glass wall
  return { name: 't', mode: 'platformer', viewMode: 'overhead', gameModeDefault: 'NRM', controlScheme: 'free-aim', rules: {},
    mapSnapshot: { gridW: W, gridH: H, density: 1, baseW: W, baseH: H, cell: 32, objectScaleMode: 'independent', ground, elevation, decorations: [] },
    buildings: [], mobs: [], items: [], spawns: [{ col: 1, row: 2 }], ramps: [], bridges: [], redstone: [],
    goal: null, settings: Object.assign(OH_SETTINGS.defaults(), { glassShatter: shatter }) };
}

console.log('Glass block + shatter:');
ok(P.OH_TERRAIN_BY_KEY.glass && P.isGlassKey('glass') && !P.isGlassKey('grass'), 'glass is a terrain type + isGlassKey works');

{ // melee shatters the pane into a gap + shards
  const g = new OverheadGame(mk(true), { testMode: true }, () => {});
  g._buildTerrainCache();
  const cell = g.grid.cell; g.player.x = 4.5 * cell; g.player.y = 2.5 * cell;
  ok(g._elev(5, 2) === 2 && g._key(5, 2) === 'glass', 'the pane starts as a raised glass wall');
  g._melee(g.player, 0, 'pickaxe');   // swing east toward col 5
  ok(g._key(5, 2) === 'grass' && g._elev(5, 2) === 0, 'melee collapses the pane to a walkable gap');
  ok(g._shards.length > 0, 'melee spawns shards');
  ok(g._terrainCache === null, 'the static terrain cache is invalidated for a re-bake');
}
{ // a ranged bolt shatters it and flies on
  const g = new OverheadGame(mk(true), { testMode: true }, () => {});
  const cell = g.grid.cell;
  g._bolts.push(Object.assign(OH_WEAPONS.startBolt(4.5 * cell, 2.5 * cell, 0, { crossbowSpeed: 6 }), { owner: 'p', elev: 0 }));
  for (let i = 0; i < 6; i++) g._updateProjectiles();
  ok(g._key(5, 2) === 'grass' && g._shards.length > 0, 'a ranged hit shatters glass');
}
{ // shatter OFF → indestructible
  const g = new OverheadGame(mk(false), { testMode: true }, () => {});
  const cell = g.grid.cell; g.player.x = 4.5 * cell; g.player.y = 2.5 * cell;
  g._melee(g.player, 0, 'pickaxe');
  ok(g._key(5, 2) === 'glass' && g._elev(5, 2) === 2 && g._shards.length === 0, 'with shatter off, glass is untouched');
}
{ // shards fall + fade out
  const g = new OverheadGame(mk(true), { testMode: true }, () => {});
  g._spawnShards(50, 50); const n0 = g._shards.length;
  for (let i = 0; i < 60; i++) g._updateShards();
  ok(n0 > 0 && g._shards.length === 0, 'shards decay and clear');
}

console.log('Redstone visibility in play (hide wiring, keep sources):');
{
  const OV = global.OVERHEAD, calls = {};
  ['drawLever', 'drawDust', 'drawLamp'].forEach((fn) => { const o = OV[fn]; OV[fn] = () => { calls[fn] = (calls[fn] || 0) + 1; }; OV['_orig_' + fn] = o; });
  const mkVis = (vis, on) => {
    const ground = [], elevation = [];
    for (let r = 0; r < 4; r++) { ground.push(new Array(6).fill('grass')); elevation.push(new Array(6).fill(0)); }
    return { name: 't', mode: 'platformer', viewMode: 'overhead', gameModeDefault: 'NRM', controlScheme: 'free-aim', rules: {},
      mapSnapshot: { gridW: 6, gridH: 4, density: 1, baseW: 6, baseH: 4, cell: 32, objectScaleMode: 'independent', ground, elevation, decorations: [] },
      buildings: [], mobs: [], items: [], spawns: [{ col: 0, row: 0 }], ramps: [], bridges: [],
      redstone: [{ kind: 'lever', col: 1, row: 1, on: on, txId: 1, channel: 'gate' }, { kind: 'dust', col: 2, row: 1 }, { kind: 'lamp', col: 3, row: 1, rxIds: [1] }],
      goal: null, settings: Object.assign(OH_SETTINGS.defaults(), { redstoneVisibility: vis }) };
  };
  const run = (vis, on, testMode) => { for (const k in calls) delete calls[k]; const g = new OverheadGame(mkVis(vis, on), { testMode }, () => {}); g._testMode = testMode; g._drawRedstone(stubCtx(), (x, y) => ({ x, y }), 20); return calls; };
  let c = run('always', false, false); ok(c.drawLever && c.drawDust && c.drawLamp, 'always: everything drawn');
  c = run('hidden', false, false); ok(c.drawLever && !c.drawDust && !c.drawLamp, 'hidden (play): source shown, wiring hidden');
  c = run('hidden', false, true); ok(c.drawLever && c.drawDust && c.drawLamp, 'hidden (Test): all drawn (ghosted)');
  c = run('active', false, false); ok(c.drawLever && !c.drawDust, 'active + unpowered: wiring hidden');
  c = run('active', true, false); ok(c.drawLever && c.drawDust && c.drawLamp, 'active + powered: wiring revealed');
  ['drawLever', 'drawDust', 'drawLamp'].forEach((fn) => { OV[fn] = OV['_orig_' + fn]; });
}

console.log(`\noverhead glass: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
