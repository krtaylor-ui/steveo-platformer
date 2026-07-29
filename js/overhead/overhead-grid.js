// ══════════════════════════════════════════════════════════════════════════
// Overhead Engine — grid + zoom model (§4). PURE math, no DOM/canvas — headless
// testable. The four independent concepts from the brief:
//   1. grid size   — world dimensions in grid cells (sprite-units). Fixed at
//                    world creation.
//   2. density     — background sub-block resolution per cell, 1..4. Fixed at
//                    creation. A cell is subdivided density×density for the
//                    background/ground layer.
//   3. objectScaleMode — 'independent' (default) | 'track': whether object/
//                    building sprites scale with the background or on their own.
//   4. masterZoom  — a live runtime camera zoom applied to everything together.
//
// Movement is SMOOTH (float world px), not cell-snapped. The camera SCROLLS and
// is clamped to world bounds (not single-screen auto-fit).
// ══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  const CELL_PX      = 32;   // base pixels per grid cell at zoom 1.0
  const MIN_ZOOM     = 0.35;
  const MAX_ZOOM     = 3.0;

  function make(opts) {
    opts = opts || {};
    const gridW   = Math.max(1, opts.gridW | 0 || 40);
    const gridH   = Math.max(1, opts.gridH | 0 || 30);
    const density = Math.min(4, Math.max(1, opts.density | 0 || 1));
    return {
      gridW, gridH, density,
      // Cell px, default the base 32. Density subdivides a base cell into finer
      // cells at world CREATION (the editor bakes density into gridW/gridH and
      // passes the matching smaller `cell` here) — so a denser world shows MORE,
      // SMALLER blocks in the same map area, not the same count. The substrate
      // itself stays density-agnostic; only an explicit `cell` override changes it.
      cell:            opts.cell != null ? opts.cell : CELL_PX,
      objectScaleMode: opts.objectScaleMode === 'track' ? 'track' : 'independent',
      masterZoom:      clampZoom(opts.masterZoom != null ? opts.masterZoom : 1.0),
    };
  }

  const clampZoom = (z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +z || 1.0));

  // World pixel dimensions (at zoom 1.0).
  const pixelWidth  = (g) => g.gridW * g.cell;
  const pixelHeight = (g) => g.gridH * g.cell;
  // Background sub-cell size in world px (density subdivision).
  const subCellPx   = (g) => g.cell / g.density;

  // World px → grid cell {col,row} (floor). Smooth positions keep their fraction.
  function cellAt(g, wx, wy) {
    return { col: Math.floor(wx / g.cell), row: Math.floor(wy / g.cell) };
  }
  // World px → background sub-cell {sc,sr}.
  function subCellAt(g, wx, wy) {
    const s = subCellPx(g);
    return { sc: Math.floor(wx / s), sr: Math.floor(wy / s) };
  }
  const inBounds = (g, col, row) => col >= 0 && row >= 0 && col < g.gridW && row < g.gridH;

  // ── Camera (scrolling, clamped) ───────────────────────────────────────────
  // A camera = { x, y } world-px of the TOP-LEFT of the view. Clamped so the
  // view never shows past the world edges (unless the world is smaller than the
  // view, in which case it's centered).
  function clampCamera(g, cam, viewW, viewH) {
    const z = g.masterZoom;
    const worldW = pixelWidth(g), worldH = pixelHeight(g);
    const viewWorldW = viewW / z, viewWorldH = viewH / z;   // world px visible
    let x = cam.x, y = cam.y;
    if (worldW <= viewWorldW) x = (worldW - viewWorldW) / 2;      // center small worlds
    else x = Math.min(Math.max(x, 0), worldW - viewWorldW);
    if (worldH <= viewWorldH) y = (worldH - viewWorldH) / 2;
    else y = Math.min(Math.max(y, 0), worldH - viewWorldH);
    return { x, y };
  }

  // Center the camera on a world point (then clamp).
  function centerOn(g, wx, wy, viewW, viewH) {
    const z = g.masterZoom;
    return clampCamera(g, { x: wx - (viewW / z) / 2, y: wy - (viewH / z) / 2 }, viewW, viewH);
  }

  // World px → screen px (applies camera + master zoom).
  function worldToScreen(g, cam, wx, wy) {
    return { x: (wx - cam.x) * g.masterZoom, y: (wy - cam.y) * g.masterZoom };
  }
  // Screen px → world px.
  function screenToWorld(g, cam, sx, sy) {
    return { x: cam.x + sx / g.masterZoom, y: cam.y + sy / g.masterZoom };
  }

  // Object-layer draw scale (§4.3). 'independent' → objects stay at 1.0 × the
  // camera zoom; 'track' → they additionally scale with density (denser grids
  // draw objects smaller so they read at the same relative size). Returns the
  // multiplier applied to an object sprite ON TOP of the world→screen zoom.
  function objectScale(g) {
    return g.objectScaleMode === 'track' ? (1 / g.density) : 1;
  }

  function setZoom(g, z) { g.masterZoom = clampZoom(z); return g.masterZoom; }
  function zoomBy(g, factor) { return setZoom(g, g.masterZoom * factor); }

  const OH_GRID = {
    CELL_PX, MIN_ZOOM, MAX_ZOOM, clampZoom,
    make, pixelWidth, pixelHeight, subCellPx,
    cellAt, subCellAt, inBounds,
    clampCamera, centerOn, worldToScreen, screenToWorld, objectScale,
    setZoom, zoomBy,
  };

  if (typeof window !== 'undefined') window.OH_GRID = OH_GRID;
  if (typeof module !== 'undefined' && module.exports) module.exports = { OH_GRID };
})();
