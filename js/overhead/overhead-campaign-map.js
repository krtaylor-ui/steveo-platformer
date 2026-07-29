// ══════════════════════════════════════════════════════════════════════════
// Overhead Engine — Campaign World Map Creator (§9). Opens the overhead editor in
// a Map-Design mode; a World-Placement mode positions Campaign World-nodes onto
// the map and can AUTO-GENERATE fixed paths between them by wayfinding.
//
// §19.5 FINDING — the brief expected the Smart-Mobs Wayfinding pathfinder to be
// reused DIRECTLY for the node-connecting auto-path. It ISN'T cleanly reusable:
// that pathfinder's neighbour model is SIDE-VIEW-specific (standable = solid
// block below + gravity/jump-arc envelope). Overhead node-connecting is a planar
// top-down walk. So we use a lean top-down A* here (same algorithm/spirit, an
// overhead neighbour model) rather than forcing the side-view nav. Documented in
// DECISIONS_LOG. World-placement UI beyond auto-path is scaffolded (partial).
// ══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';
  const VOID = 0, WALL = 4, HAZARD = 3;

  // Walkable for node-connecting: in bounds, ground present, not wall, not hazard.
  function walkable(mapData, c, r) {
    if (c < 0 || r < 0 || c >= mapData.gridW || r >= mapData.gridH) return false;
    const row = mapData.ground[r]; if (!row) return false;
    const id = row[c] | 0;
    return id !== VOID && id !== WALL && id !== HAZARD;
  }

  // Top-down 4-directional A* between two cells. Returns [{col,row},...] incl.
  // both endpoints, or null if unreachable. (Overhead analogue of findMobPath.)
  function autoPathBetween(mapData, from, to) {
    if (!walkable(mapData, from.col, from.row) || !walkable(mapData, to.col, to.row)) {
      // Endpoints may sit ON a world-node tile; allow them regardless of terrain.
    }
    const key = (c, r) => c + ',' + r;
    const h = (c, r) => Math.abs(c - to.col) + Math.abs(r - to.row);
    const open = [{ c: from.col, r: from.row, g: 0, f: h(from.col, from.row) }];
    const came = {}, gScore = { [key(from.col, from.row)]: 0 }, seen = {};
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    let guard = 0, maxGuard = mapData.gridW * mapData.gridH * 4;
    while (open.length && guard++ < maxGuard) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
      const cur = open.splice(bi, 1)[0];
      if (cur.c === to.col && cur.r === to.row) return reconstruct(came, key, to);
      seen[key(cur.c, cur.r)] = true;
      for (const [dc, dr] of DIRS) {
        const nc = cur.c + dc, nr = cur.r + dr;
        // Allow stepping onto the goal even if it's a special tile.
        const isGoal = nc === to.col && nr === to.row;
        if (!isGoal && !walkable(mapData, nc, nr)) continue;
        if (seen[key(nc, nr)]) continue;
        const ng = cur.g + 1;
        if (gScore[key(nc, nr)] == null || ng < gScore[key(nc, nr)]) {
          came[key(nc, nr)] = { c: cur.c, r: cur.r };
          gScore[key(nc, nr)] = ng;
          open.push({ c: nc, r: nr, g: ng, f: ng + h(nc, nr) });
        }
      }
    }
    return null;
  }
  function reconstruct(came, key, to) {
    const out = [{ col: to.col, row: to.row }];
    let k = key(to.col, to.row);
    while (came[k]) { const p = came[k]; out.unshift({ col: p.c, row: p.r }); k = key(p.c, p.r); }
    return out;
  }

  // Build the fixed-path lanes between an ordered list of placed world-nodes.
  // nodes = [{col,row,worldId}]. Returns [{from,to,path}] (path = null if blocked).
  function connectNodes(mapData, nodes) {
    const out = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      out.push({ from: nodes[i], to: nodes[i + 1], path: autoPathBetween(mapData, nodes[i], nodes[i + 1]) });
    }
    return out;
  }

  const OH_CAMPAIGN_MAP = {
    walkable, autoPathBetween, connectNodes,
    // Scaffold entry: open the overhead editor to design a Zone's map. Full
    // world-placement mode (bind Campaign Worlds to map nodes + preview lanes)
    // is partial — auto-path (above) is the proven piece it will consume.
    open(zone) {
      if (typeof OH_EDITOR === 'undefined') { alert('Overhead editor not loaded.'); return; }
      const existing = null;   // future: load a saved Zone map
      OH_EDITOR.open(existing || undefined);
      OH_EDITOR._campaignZone = zone || null;   // marker for a future world-placement mode
    },
  };

  if (typeof window !== 'undefined') window.OH_CAMPAIGN_MAP = OH_CAMPAIGN_MAP;
  if (typeof module !== 'undefined' && module.exports) module.exports = { OH_CAMPAIGN_MAP };
})();
