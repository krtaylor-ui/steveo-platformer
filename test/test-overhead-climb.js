// Pipe climb-in animation ("pull-up (foreshortened leg)") in the overhead engine.
// A pipe with a destination plays the 6-phase climb, then teleports; the world setting
// disables it (instant). Sprite opts (grab / mantleLeg / crouch) render without throwing.
//   node test/test-overhead-climb.js
global.window = global;
global.CANVAS_W = 800; global.CANVAS_H = 500; global.GAME_VERSION = 'v3 build 323 (climb test)';
function stubCtx() { return new Proxy({ filter: 'none', globalAlpha: 1, globalCompositeOperation: 'source-over', canvas: { width: 800, height: 500 } }, { get(t, k) { if (k === 'measureText') return () => ({ width: 80 }); if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} }); if (k === 'getContext') return () => stubCtx(); if (k in t) return t[k]; return (typeof k === 'string') ? (() => {}) : undefined; }, set(t, k, v) { t[k] = v; return true; } }); }
const cls = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
function mkEl() { return { style: {}, classList: cls, appendChild() {}, addEventListener() {}, getContext: () => stubCtx(), getBoundingClientRect: () => ({ width: 800, height: 500, left: 0, top: 0 }), width: 800, height: 500 }; }
global.document = { getElementById: () => mkEl(), head: { appendChild() {} }, createElement: () => mkEl(), body: { appendChild() {}, classList: cls }, addEventListener() {} };
global.window.addEventListener = () => {}; global.window.dispatchEvent = () => {}; global.Event = function () {};
global.InputManager = function () { this.flush = () => {}; this.isJustDown = () => false; this.isDown = () => false; this.mouse = { x: 0, y: 0, clicked: false, down: false, rightClicked: false, moveVec: { x: 0, y: 0 } }; };
global.requestAnimationFrame = () => 0;
const path = require('path');
['palette', 'grid', 'buildings', 'movement', 'controls', 'combat', 'weapons', 'elevation', 'settings', 'daynight', 'redstone', 'templates', 'launch', 'game']
  .forEach((m) => require(path.join(__dirname, '..', 'js', 'overhead', 'overhead-' + m + '.js')));
const OverheadGame = global.OverheadGame, OH_SETTINGS = global.OH_SETTINGS, OV = global.OVERHEAD;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

console.log('Sprite pull-up pose (grab / mantleLeg / crouch):');
{ let threw = false; try { OV.drawOverheadPlayer(stubCtx(), 100, 100, 16, 0, false, -Math.PI / 2, { grab: 1, mantleLeg: 0.6, crouch: 0.5, weapon: 'pickaxe' }); } catch (e) { threw = true; }
  ok(!threw, 'drawOverheadPlayer renders the climb pose without throwing'); }

function mk(anim) {
  const W = 14, H = 12, ground = [], elevation = [];
  for (let r = 0; r < H; r++) { ground.push(new Array(W).fill('grass')); elevation.push(new Array(W).fill(0)); }
  return { name: 't', mode: 'platformer', viewMode: 'overhead', gameModeDefault: 'NRM', controlScheme: 'free-aim', rules: {},
    mapSnapshot: { gridW: W, gridH: H, density: 1, baseW: W, baseH: H, cell: 32, objectScaleMode: 'independent', ground, elevation, decorations: [] },
    buildings: [{ typeId: 'pipe', col: 6, row: 6, config: { dest: '10,3' } }, { typeId: 'pipe', col: 10, row: 3, config: {} }],
    mobs: [], items: [], spawns: [{ col: 1, row: 1 }], ramps: [], bridges: [], redstone: [],
    goal: null, settings: Object.assign(OH_SETTINGS.defaults(), { pipeClimbAnim: anim }) };
}

console.log('Climb driver — runs the 6 phases then teleports, and restores zoom:');
{
  const g = new OverheadGame(mk(true), { testMode: true }, () => {});
  const dest = { px: 10.5 * 32, py: 4.5 * 32, key: '10,3' };
  g._startPipeClimb(g.buildings[0], dest);
  ok(!!g._climb && g._climb.timeline.length === 6, 'the climb starts with 6 phases');
  ok(g._climb.zoomFrom === g.grid.masterZoom, 'the pre-animation zoom is captured');
  let f = 0; while (g._climb && f < 500) { g._updatePipeClimb(); f++; }
  ok(!g._climb, 'the climb completes');
  ok(Math.abs(g.player.x - dest.px) < 1 && Math.abs(g.player.y - dest.py) < 1, 'the player teleports to the destination when it finishes');
  ok(Math.abs(g.grid.masterZoom - 1) < 0.02, 'the game zoom is restored after the climb');
  // the render path works mid-climb
  g._startPipeClimb(g.buildings[0], dest); for (let i = 0; i < 70; i++) g._updatePipeClimb();
  let threw = false; try { g._drawPlayer((x, y) => ({ x, y }), 1, 20); } catch (e) { threw = true; }
  ok(!threw, 'the player renders mid-climb (foreshortened leg pose)');
}

console.log(`\noverhead climb: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
