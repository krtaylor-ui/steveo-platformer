// Custom Sprites Phase 1 — character plumbing + the fairness guarantee (character never changes the
// hitbox). node test/test-overhead-character.js
global.window = global;
global.CANVAS_W = 800; global.CANVAS_H = 500; global.GAME_VERSION = 'char test';
function stubCtx() { return new Proxy({ filter: 'none', globalAlpha: 1, globalCompositeOperation: 'source-over', canvas: { width: 800, height: 500 } }, { get(t, k) { if (k === 'measureText') return () => ({ width: 80 }); if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} }); if (k === 'getContext') return () => stubCtx(); if (k in t) return t[k]; return (typeof k === 'string') ? (() => {}) : undefined; }, set(t, k, v) { t[k] = v; return true; } }); }
const cls = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
function mkEl() { return { style: {}, classList: cls, appendChild() {}, addEventListener() {}, getContext: () => stubCtx(), getBoundingClientRect: () => ({ width: 800, height: 500, left: 0, top: 0 }), width: 800, height: 500 }; }
global.document = { getElementById: () => mkEl(), head: { appendChild() {} }, createElement: () => mkEl(), body: { appendChild() {}, classList: cls }, addEventListener() {} };
global.window.addEventListener = () => {}; global.window.dispatchEvent = () => {}; global.Event = function () {};
global.InputManager = function () { this.flush = () => {}; this.isJustDown = () => false; this.isDown = () => false; this.mouse = { x: 0, y: 0, clicked: false, down: false, rightClicked: false, moveVec: { x: 0, y: 0 } }; this.gamepads = []; };
global.requestAnimationFrame = () => 0;
const path = require('path');
const { CHARACTERS } = require(path.join(__dirname, '..', 'js', 'characters.js'));
global.CHARACTERS = CHARACTERS;   // overhead-game reads it as a global
['palette', 'grid', 'buildings', 'movement', 'controls', 'combat', 'weapons', 'elevation', 'settings', 'daynight', 'redstone', 'templates', 'launch', 'game']
  .forEach((m) => require(path.join(__dirname, '..', 'js', 'overhead', 'overhead-' + m + '.js')));
const OverheadGame = global.OverheadGame, OH_SETTINGS = global.OH_SETTINGS;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

function mk(over) {
  const W = 16, H = 12, ground = [], elevation = [];
  for (let r = 0; r < H; r++) { ground.push(new Array(W).fill('grass')); elevation.push(new Array(W).fill(0)); }
  return Object.assign({
    name: 'c', mode: 'platformer', viewMode: 'overhead', gameModeDefault: 'PLT', controlScheme: 'free-aim', rules: {},
    mapSnapshot: { gridW: W, gridH: H, density: 1, baseW: W, baseH: H, cell: 32, objectScaleMode: 'independent', ground, elevation, decorations: [] },
    buildings: [], mobs: [], items: [], spawns: [{ col: 2, row: 6 }], ramps: [], bridges: [], redstone: [],
    goal: { col: 12, row: 6, color: 0 }, settings: OH_SETTINGS.defaults(),
  }, over || {});
}

console.log('Character — world -> runtime plumbing:');
ok(new OverheadGame(mk(), { testMode: true }, () => {})._characterId === 'classic', 'no characterId -> default classic');
ok(new OverheadGame(mk({ characterId: 'knight' }), { testMode: true }, () => {})._characterId === 'knight', 'worldData.characterId flows to runtime this._characterId');
// unknown id stored raw but resolves to classic feat at draw (never null)
const gu = new OverheadGame(mk({ characterId: 'does-not-exist' }), { testMode: true }, () => {});
ok(CHARACTERS.feat(gu._characterId) && Object.keys(CHARACTERS.feat(gu._characterId)).length === 0, 'unknown characterId resolves to classic feat (empty) — no crash');

console.log('Character — fairness: hitbox NEVER changes with character:');
const r0 = new OverheadGame(mk({ characterId: 'classic' }), { testMode: true }, () => {}).player.r;
['astro', 'knight', 'alien', 'bee', 'dino', 'robot'].forEach((id) => {
  const g = new OverheadGame(mk({ characterId: id }), { testMode: true }, () => {});
  ok(g.player.r === r0, id + ': player radius (hitbox) identical to classic');
  ok(g.player.hp === 20 && g.player.maxHp === 20, id + ': hp/maxHp unchanged (cosmetic only)');
});

console.log('Character — rendering the chosen character does not throw:');
let threw = null;
try { const g = new OverheadGame(mk({ characterId: 'alien' }), { testMode: true }, () => {}); g._drawPlayer(g.player, (x, y) => ({ x, y }), 1, 22); } catch (e) { threw = e.message; }
ok(!threw, '_drawPlayer with a character renders without throwing' + (threw ? ' — ' + threw : ''));

console.log(`\noverhead character: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
