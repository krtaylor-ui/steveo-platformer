// ══════════════════════════════════════════════════════════════════════════
// Overhead Engine — launcher + a hand-built DEMO world (§8 "Test Overhead World"
// entry, mirroring "Test in Arena"). The full Sandbox overhead EDITOR / creation
// flow is scaffolded separately; this gives an immediately playable slice so the
// runtime (rendering, elevation, movement, jump, combat, control schemes) can be
// browser-tested now. A real authored world uses the same world-data shape.
// ══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';
  const T = { VOID: 0, GRASS: 1, PATH: 2, HAZARD: 3, WALL: 4, GOAL: 5 };

  function buildDemoWorld() {
    const W = 34, H = 22;
    const ground = [], elevation = [];
    for (let r = 0; r < H; r++) {
      ground.push(new Array(W).fill(T.GRASS));
      elevation.push(new Array(W).fill(0));
    }
    // Border walls.
    for (let c = 0; c < W; c++) { ground[0][c] = T.WALL; ground[H - 1][c] = T.WALL; }
    for (let r = 0; r < H; r++) { ground[r][0] = T.WALL; ground[r][W - 1] = T.WALL; }
    // A raised plateau (elevation) with a 2-level step, in the middle.
    for (let r = 6; r <= 12; r++) for (let c = 12; c <= 20; c++) { elevation[r][c] = 1; ground[r][c] = T.GRASS; }
    for (let r = 8; r <= 10; r++) for (let c = 15; c <= 18; c++) elevation[r][c] = 2;
    // A stone path leading across.
    for (let c = 2; c < W - 2; c++) ground[16][c] = T.PATH;
    // A water hazard strip you must jump across.
    for (let r = 3; r <= 5; r++) { ground[r][24] = T.HAZARD; ground[r][25] = T.HAZARD; }
    // A void gap.
    for (let r = 18; r <= 19; r++) { ground[r][8] = T.VOID; ground[r][9] = T.VOID; }
    // Goal far corner.
    ground[3][W - 3] = T.GOAL;

    const buildings = [
      OH_BUILDINGS.place('healer', 4, 4),
      OH_BUILDINGS.place('shop', 4, 8),
      OH_BUILDINGS.place('portal', 27, 15),
      OH_BUILDINGS.place('statue', 16, 9, { level: 2 }),
    ].filter(Boolean);

    const mobs = [
      { col: 20, row: 16, type: 'zombie', hp: 8, speed: 1.4, detect: 170 },
      { col: 10, row: 6, type: 'zombie', hp: 8, speed: 1.5, detect: 190 },
      { col: 26, row: 8, type: 'spider', hp: 6, speed: 1.9, detect: 220 },
    ];
    const items = [
      { col: 6, row: 16, kind: 'coin' }, { col: 14, row: 9, kind: 'coin' }, { col: 28, row: 5, kind: 'coin' },
    ];
    const decorations = [
      { col: 5, row: 14, kind: 'bush', cover: true }, { col: 22, row: 12, kind: 'bush', cover: true },
    ];
    return {
      mode: 'platformer', viewMode: 'overhead',
      controlScheme: 'free-aim', angleLockDeg: 0,
      rules: { autoClimb: '1' },
      mapSnapshot: { gridW: W, gridH: H, density: 1, objectScaleMode: 'independent', ground, elevation, decorations },
      buildings, mobs, items,
      spawns: [{ col: 3, row: 18 }],
    };
  }

  const OVERHEAD = {
    launchDemo() {
      if (typeof OverheadGame === 'undefined') { alert('Overhead Engine not loaded.'); return; }
      if (window.menu && typeof window.menu._stop === 'function') window.menu._stop();
      if (window.game && typeof window.game.destroy === 'function') window.game.destroy();
      ['dashboard-screen', 'sandbox-screen', 'campaign-select-screen', 'game-selection-screen', 'arena-select-screen']
        .forEach((id) => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
      const world = buildDemoWorld();
      window.game = new OverheadGame(world, {}, () => this._return());
    },
    // Launch an arbitrary overhead world object (used by future editor/campaign).
    launchWorld(world, opts, onExit) {
      if (window.game && typeof window.game.destroy === 'function') window.game.destroy();
      window.game = new OverheadGame(world, opts || {}, onExit || (() => this._return()));
      return window.game;
    },
    _return() {
      try { if (window.game && window.game.destroy) window.game.destroy(); } catch (e) {}
      window.game = null;
      const d = document.getElementById('dashboard-screen'); if (d) d.style.display = 'block';
      if (window.menu && typeof window.menu._start === 'function') { /* menu canvas loop is separate; dashboard is DOM */ }
    },
    buildDemoWorld,
  };

  if (typeof window !== 'undefined') window.OVERHEAD = OVERHEAD;
})();
