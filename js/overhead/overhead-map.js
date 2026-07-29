// ══════════════════════════════════════════════════════════════════════════
// Overhead Engine — Map vs World data model, version-linking, Test-Mode overlay,
// and the Extract-Map tool (§2 + §3). PURE + headless-testable.
//
// MAP   = terrain only: ground (per sub-cell block ids), elevation (per cell
//         level), decorations. Has its OWN version history.
// WORLD = a Map SNAPSHOT + everything mode-specific (buildings, mobs, items,
//         paths, spawns, rules). A World references which Map + version it was
//         built from AND carries a frozen snapshot of that Map.
//
// Default behaviour is the SNAPSHOT — a World never silently adopts Map edits.
// Test Mode explicitly overlays the CURRENT Map onto the World's content for one
// session (non-committing) + runs a placement-validation pass; "Relink" is the
// explicit action that permanently adopts the update.
// ══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  // ── Factories ──────────────────────────────────────────────────────────────
  function newMap(opts) {
    opts = opts || {};
    return {
      id:        opts.id || null,
      version:   opts.version || 1,
      updatedAt: opts.updatedAt || 0,     // caller stamps (Date.now unavailable in some contexts)
      gridW:     opts.gridW | 0 || 40,
      gridH:     opts.gridH | 0 || 30,
      density:   Math.min(4, Math.max(1, opts.density | 0 || 1)),
      objectScaleMode: opts.objectScaleMode === 'track' ? 'track' : 'independent',
      ground:    opts.ground || [],        // [row][col] terrain block id (sub-cell res handled by density)
      elevation: opts.elevation || [],     // [row][col] elevation level (int, default 0)
      decorations: opts.decorations || [], // [{col,row,kind,skin,blocksMovement}]
    };
  }

  function newWorld(opts) {
    opts = opts || {};
    return {
      id:          opts.id || null,
      mode:        opts.mode || 'platformer',
      viewMode:    opts.viewMode || 'overhead',
      mapId:       opts.mapId || null,
      mapVersion:  opts.mapVersion || 0,
      mapSnapshot: opts.mapSnapshot || null,   // frozen Map data the World plays on
      buildings:   opts.buildings || [],
      mobs:        opts.mobs || [],
      items:       opts.items || [],
      paths:       opts.paths || [],
      spawns:      opts.spawns || [],
      rules:       opts.rules || {},
    };
  }

  const elevationAt = (mapData, col, row) => {
    const e = mapData && mapData.elevation;
    if (!e || !e[row]) return 0;
    return e[row][col] | 0;
  };
  const groundAt = (mapData, col, row) => {
    const g = mapData && mapData.ground;
    if (!g || !g[row]) return 0;
    return g[row][col] | 0;
  };
  const inBounds = (mapData, col, row) =>
    col >= 0 && row >= 0 && col < (mapData.gridW | 0) && row < (mapData.gridH | 0);

  // ── Version-linking ──────────────────────────────────────────────────────
  const needsUpdate = (world, currentMap) =>
    !!(world && currentMap && world.mapId === currentMap.id && currentMap.version > (world.mapVersion | 0));

  // A non-committing view for Test Mode: the World's content on top of the
  // CURRENT Map's terrain. Does NOT mutate the World.
  function testOverlay(world, currentMap) {
    return {
      ...world,
      _testMap: currentMap,          // terrain to render this session
      mapSnapshot: currentMap,       // for the runtime to consume without touching the real snapshot
      _overlayActive: true,
      _originalVersion: world.mapVersion,
    };
  }

  // Permanently adopt the current Map into the World's snapshot.
  function relink(world, currentMap) {
    return { ...world, mapId: currentMap.id, mapVersion: currentMap.version, mapSnapshot: deepCopyMap(currentMap) };
  }

  function deepCopyMap(m) {
    return {
      ...m,
      ground:    (m.ground || []).map((r) => r.slice()),
      elevation: (m.elevation || []).map((r) => r.slice()),
      decorations: (m.decorations || []).map((d) => ({ ...d })),
    };
  }

  // ── Test-Mode placement validation (§2) ────────────────────────────────────
  // Against a given Map's terrain, flag placed content that is now:
  //   • out-of-bounds,
  //   • floating (no ground under it — ground id 0/empty),
  //   • overlapping solid terrain (a decoration/terrain that blocks movement),
  //   • on a cell whose elevation changed vs. the World's original snapshot
  //     (a soft warning — it may now be mid-cliff).
  // solidGround(id) tells whether a ground/terrain id blocks movement.
  function validatePlacement(world, mapData, solidGround) {
    const issues = [];
    solidGround = solidGround || (() => false);
    const orig = world.mapSnapshot;
    const check = (item, label) => {
      const col = item.col | 0, row = item.row | 0;
      if (!inBounds(mapData, col, row)) { issues.push({ kind: 'out-of-bounds', label, col, row }); return; }
      if (groundAt(mapData, col, row) === 0) issues.push({ kind: 'floating', label, col, row });
      else if (solidGround(groundAt(mapData, col, row))) issues.push({ kind: 'overlaps-solid', label, col, row });
      if (orig && elevationAt(mapData, col, row) !== elevationAt(orig, col, row))
        issues.push({ kind: 'elevation-changed', label, col, row,
          from: elevationAt(orig, col, row), to: elevationAt(mapData, col, row) });
    };
    (world.buildings || []).forEach((b, i) => check(b, 'building#' + i + (b.typeId ? ' (' + b.typeId + ')' : '')));
    (world.mobs  || []).forEach((m, i) => check(m, 'mob#' + i));
    (world.items || []).forEach((it, i) => check(it, 'item#' + i));
    (world.spawns || []).forEach((s, i) => check(s, 'spawn#' + i));
    return { ok: issues.length === 0, issues };
  }

  // ── Extract Map tool (§3) ───────────────────────────────────────────────────
  // Validity matrix: which carry-forward checkboxes make sense for a given
  // DESTINATION mode. Terrain (ground/elevation/decorations) is ALWAYS included —
  // it IS the Map. The rest are opt-in and mode-filtered:
  //   • structures (buildings/blocks) — allowed everywhere.
  //   • items (coins/powerups)        — allowed everywhere.
  //   • redstone                       — allowed everywhere (§7: redstone works in Overhead).
  //   • mobs                           — free mobs for Normal/Platformer/Campaign/SpeedRunner;
  //                                      'convert' for Arena (→ spawn points, not free mobs);
  //                                      DISALLOWED for Tower Defense / MOBA (they use path
  //                                      lanes + wave spawns, not hand-placed free mobs).
  const EXTRACT_MATRIX = {
    normal:      { structures: true, items: true, redstone: true, mobs: true },
    platformer:  { structures: true, items: true, redstone: true, mobs: true },
    campaign:    { structures: true, items: true, redstone: true, mobs: true },
    speedrunner: { structures: true, items: true, redstone: true, mobs: true },
    arena:       { structures: true, items: true, redstone: true, mobs: 'convert' },
    towerdefense:{ structures: true, items: true, redstone: true, mobs: false },
    moba:        { structures: true, items: true, redstone: true, mobs: false },
  };
  const extractValidity = (destMode) => EXTRACT_MATRIX[String(destMode || '').toLowerCase()] || EXTRACT_MATRIX.platformer;

  // Produce a Map (+ optional carried layers) from a source World, honouring the
  // requested checkboxes filtered by the destination mode's validity.
  function extractMap(sourceWorld, opts) {
    opts = opts || {};
    const destMode = opts.destMode || sourceWorld.mode || 'platformer';
    const valid = extractValidity(destMode);
    const src = sourceWorld.mapSnapshot || sourceWorld;   // terrain source
    const map = newMap({
      gridW: src.gridW, gridH: src.gridH, density: src.density,
      objectScaleMode: src.objectScaleMode,
      ground: (src.ground || []).map((r) => r.slice()),
      elevation: (src.elevation || []).map((r) => r.slice()),
      decorations: opts.includeStructures ? (src.decorations || []).map((d) => ({ ...d })) : [],
    });
    const carried = { droppedByMode: [] };
    const want = (flag, key) => {
      if (!flag) return false;
      const v = valid[key];
      if (v === true) return true;
      if (v === 'convert') { carried.droppedByMode.push(key + ':converted'); return 'convert'; }
      carried.droppedByMode.push(key + ':dropped-for-' + destMode);
      return false;
    };
    if (want(opts.includeStructures, 'structures')) carried.buildings = (sourceWorld.buildings || []).map((b) => ({ ...b }));
    if (want(opts.includePlacedItems, 'items'))     carried.items     = (sourceWorld.items || []).map((it) => ({ ...it }));
    if (want(opts.includeRedstone, 'redstone'))     carried.redstone  = sourceWorld.redstone ? JSON.parse(JSON.stringify(sourceWorld.redstone)) : (sourceWorld.rules && sourceWorld.rules.redstone) || null;
    const mobFlag = want(opts.includeMobs, 'mobs');
    if (mobFlag === 'convert') carried.spawns = (sourceWorld.mobs || []).map((m) => ({ col: m.col, row: m.row, converted: true }));
    else if (mobFlag) carried.mobs = (sourceWorld.mobs || []).map((m) => ({ ...m }));
    return { map, carried, destMode };
  }

  const OH_MAP = {
    newMap, newWorld, elevationAt, groundAt, inBounds,
    needsUpdate, testOverlay, relink, deepCopyMap,
    validatePlacement, EXTRACT_MATRIX, extractValidity, extractMap,
  };

  if (typeof window !== 'undefined') window.OH_MAP = OH_MAP;
  if (typeof module !== 'undefined' && module.exports) module.exports = { OH_MAP };
})();
