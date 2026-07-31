// Overhead Engine — TEMPLATES: reusable multi-cell, multi-elevation models (trees, houses,
// …) placed ADDITIVELY on top of the terrain. A template is a set of VOXELS — {dx,dy,dz,block}
// relative to an anchor, where dz is the 1-based elevation LEVEL — so a cell can stack blocks
// (a log trunk 1-2 with a leaf canopy 3-4 in the same column). Because placements are an
// overlay (the terrain grid is never overwritten), the ground below a floating canopy is
// preserved → no black void under trees.
//
// Data:
//   template def : { id, name, system?, dims:{x,y,z}, cells:[{dx,dy,dz,block}], density, playerHeight }
//   world.templates      : the world's custom template defs (authored in template mode)
//   world.templateStamps : placements [{ id, templateId, col, row, base }]  (base = elevation offset)
(function () {
  'use strict';

  // ── The built-in SYSTEM tree (rolled from the old hard-coded _stampTree, but ADDITIVE):
  //    a 2-high log TRUNK (dz 1-2) with a 2-high leaf CANOPY on top (dz 3 = 3×3, dz 4 = plus).
  function treeCells() {
    const cells = [
      { dx: 0, dy: 0, dz: 1, block: 'log' },
      { dx: 0, dy: 0, dz: 2, block: 'log' },
    ];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) cells.push({ dx, dy, dz: 3, block: 'leaves' });   // canopy lower (3×3)
    for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) cells.push({ dx, dy, dz: 4, block: 'leaves' });   // canopy top (plus)
    return cells;
  }

  const SYSTEM = [
    { id: 'sys:tree', name: 'Tree', system: true, dims: { x: 3, y: 3, z: 4 }, density: 1, playerHeight: 1, cells: treeCells() },
  ];
  const SYS_BY_ID = {}; SYSTEM.forEach((t) => { SYS_BY_ID[t.id] = t; });

  // A tiny non-cryptographic checksum over a template's cells (for the import duplicate flag).
  function checksum(def) {
    const s = (def.cells || []).slice().sort((a, b) => a.dz - b.dz || a.dy - b.dy || a.dx - b.dx)
      .map((c) => c.dx + ',' + c.dy + ',' + c.dz + ',' + c.block).join(';');
    let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  // Resolve a template id → def, checking system templates then the world's own list.
  function resolve(id, world) {
    if (SYS_BY_ID[id]) return SYS_BY_ID[id];
    const list = (world && world.templates) || [];
    return list.find((t) => t.id === id) || null;
  }

  // Every placeable template for a world (system + world-custom), for the palette.
  function forWorld(world) { return SYSTEM.concat((world && world.templates) || []); }

  // Expand a world's stamps into absolute voxels the runtime renders / shadows / collides.
  // Returns [{ col, row, elev, block, isLeaves }]. Out-of-bounds voxels are dropped.
  function expandStamps(world, gridW, gridH) {
    const out = [];
    for (const st of (world && world.templateStamps) || []) {
      const def = resolve(st.templateId, world); if (!def) continue;
      for (const c of def.cells) {
        const col = st.col + c.dx, row = st.row + c.dy;
        if (col < 0 || row < 0 || col >= gridW || row >= gridH) continue;
        out.push({ col, row, elev: (st.base | 0) + c.dz, block: c.block, isLeaves: c.block === 'leaves' });
      }
    }
    return out;
  }

  // Capture a rectangular region of the map into a new template def. `cells` are collected
  // relative to (ax,ay) with dz = the cell's elevation. Returns { def, outOfBounds, floating }.
  //  region: { ax, ay, x, y, z }  (anchor + dims in blocks);  sample(col,row)→{block,elev}|null
  function capture(name, region, sample, groundElev) {
    const cells = []; let outOfBounds = 0;
    for (let dy = 0; dy < region.y; dy++) for (let dx = 0; dx < region.x; dx++) {
      const s = sample(region.ax + dx, region.ay + dy);
      if (!s || s.elev <= (groundElev | 0)) continue;                 // only capture raised content
      let dz = s.elev - (groundElev | 0);
      if (dz > region.z) { outOfBounds++; dz = region.z; }            // clamp + flag over-Z
      cells.push({ dx, dy, dz, block: s.block });
    }
    // A "floating" template = its lowest voxel sits above dz 1 (nothing anchoring it down).
    const minDz = cells.reduce((m, c) => Math.min(m, c.dz), 99);
    const def = { id: 'usr:' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + (cells.length), name, dims: { x: region.x, y: region.y, z: region.z }, cells };
    return { def, outOfBounds, floating: cells.length > 0 && minDz > 1 };
  }

  const OH_TEMPLATES = { SYSTEM, resolve, forWorld, expandStamps, capture, checksum, treeCells };
  if (typeof window !== 'undefined') window.OH_TEMPLATES = OH_TEMPLATES;
  if (typeof module !== 'undefined' && module.exports) module.exports = OH_TEMPLATES;
})();
