// ══════════════════════════════════════════════════════════════════════════
// Campaign Mode — pure data model + routing + publish-validation.  (MVP)
//
// This module holds NO DOM and NO network — it is the single source of truth
// for a Campaign's shape and for the two rules that matter: how a coloured Goal
// Star exit ROUTES to the next World, and whether a Campaign may be PUBLISHED.
// Being pure makes it headless-testable (test/test-campaign.js).
//
// Terminology (§1): the codebase term is Zone (a themed group of Worlds ending
// in a Boss World) and World (an existing Platformer sandbox level). Each
// Campaign may relabel these two concepts for DISPLAY only (zoneLabel /
// worldLabel) — no logic depends on the strings.
//
// Goal Star numbering (§3): we reuse the existing 10-colour GOAL_COLORS palette
// directly. "Goal Star N" == GOAL_COLORS index (N-1). Star 1 == Gold == index 0
// == always "next in sequence". Stars 2–10 must be explicitly routed
// (bonus / connect) before the Campaign can be published.
// ══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  const DEFAULT_ZONE_LABEL  = 'Zone';
  const DEFAULT_WORLD_LABEL = 'World';
  const RESET_MODES         = ['never', 'per-world', 'per-zone'];

  // Goal Star routing types.
  const ROUTE_NEXT    = 'next-in-sequence';   // Goal Star 1 only
  const ROUTE_BONUS   = 'bonus';              // creates a new out-of-sequence World
  const ROUTE_CONNECT = 'connect';            // link to any existing Campaign World

  const GOAL_BLOCK_ID = 10;   // BLOCK.GOAL (kept in sync with js/blocks.js)

  // ── Factory helpers ──────────────────────────────────────────────────────
  function newCampaign(name, creatorId) {
    return {
      id:               null,          // assigned by the server on first save
      name:             name || 'Untitled Campaign',
      creatorId:        creatorId || null,
      zoneLabel:        DEFAULT_ZONE_LABEL,
      worldLabel:       DEFAULT_WORLD_LABEL,
      zoneOrder:        [],            // [zoneId, ...] default "next zone after boss" order
      startingWorldId:  null,          // campaignWorldId the campaign begins on
      resetInventoryAt: 'never',       // 'never' | 'per-world' | 'per-zone'
      startingLives:    3,             // arcade lives carried in progress
      zones:            [],            // Zone[]
      worlds:           [],            // CampaignWorld[]
      published:        false,
    };
  }

  function newZone(id, name) {
    // worldOrder: default in-zone sequence; the LAST entry is the Boss World
    // (computed via bossWorldId — never a separate manual flag, §4).
    return { id, name: name || 'New Zone', worldOrder: [], trackerImage: null };
  }

  function newCampaignWorld(id, zoneId, sandboxWorldUid, name) {
    return {
      id, zoneId, sandboxWorldUid,
      name:            name || 'World',
      outOfSequence:   false, // true for bonus levels (reachable only via a route)
      entryPoints:     [],   // [{ spawnPointId, label, isDefault }]
      goalStarRouting: [],   // [{ starIndex, routeType, destinationWorldId, destinationEntryPointId, hidden }]
    };
  }

  // ── Lookups ──────────────────────────────────────────────────────────────
  const getZone  = (c, id) => (c.zones  || []).find((z) => z.id === id) || null;
  const getWorld = (c, id) => (c.worlds || []).find((w) => w.id === id) || null;

  function worldsInZone(c, zoneId) {
    const z = getZone(c, zoneId);
    if (!z) return [];
    return z.worldOrder.map((id) => getWorld(c, id)).filter(Boolean);
  }

  // Boss World = the LAST World in a Zone's worldOrder (computed, §4).
  function bossWorldId(c, zoneId) {
    const z = getZone(c, zoneId);
    if (!z || !z.worldOrder.length) return null;
    return z.worldOrder[z.worldOrder.length - 1];
  }
  function isBossWorld(c, worldId) {
    const w = getWorld(c, worldId);
    if (!w) return false;
    return bossWorldId(c, w.zoneId) === worldId;
  }

  // The Zone that follows a given Zone in zoneOrder (Boss → next Zone, §4).
  function nextZoneId(c, zoneId) {
    const i = (c.zoneOrder || []).indexOf(zoneId);
    if (i < 0 || i >= c.zoneOrder.length - 1) return null;
    return c.zoneOrder[i + 1];
  }
  function firstWorldId(c, zoneId) {
    const z = getZone(c, zoneId);
    return (z && z.worldOrder.length) ? z.worldOrder[0] : null;
  }
  // Next World in-sequence WITHIN the same Zone (used by Goal Star 1).
  function nextWorldInZone(c, worldId) {
    const w = getWorld(c, worldId);
    if (!w) return null;
    const z = getZone(c, w.zoneId);
    if (!z) return null;
    const i = z.worldOrder.indexOf(worldId);
    if (i < 0 || i >= z.worldOrder.length - 1) return null;
    return z.worldOrder[i + 1];
  }

  // Default entry point of a World (§5 — first, or the one flagged isDefault).
  function defaultEntryPointId(w) {
    if (!w || !w.entryPoints || !w.entryPoints.length) return null;
    const flagged = w.entryPoints.find((e) => e.isDefault);
    return (flagged || w.entryPoints[0]).spawnPointId;
  }

  const routeFor = (w, starIndex) =>
    (w.goalStarRouting || []).find((r) => r.starIndex === starIndex) || null;

  // ── Routing resolution (§3/§4) ────────────────────────────────────────────
  // exitColorIndex is the 0-based GOAL_COLORS index recorded on game._wonExitColor.
  // Returns one of:
  //   { kind:'world', worldId, entryPointId, secret }
  //   { kind:'zone',  zoneId, worldId, entryPointId }
  //   { kind:'campaign-complete' }
  //   { kind:'unrouted', starIndex }
  function resolveExit(c, worldId, exitColorIndex) {
    const w = getWorld(c, worldId);
    const starIndex = (exitColorIndex | 0) + 1;   // colour index → "Goal Star N"
    if (!w) return { kind: 'unrouted', starIndex };
    const route = routeFor(w, starIndex);

    // Goal Star 1 (Gold): "next in sequence" — with the Boss World special case.
    // An out-of-sequence (bonus) World is NOT part of any worldOrder, so its
    // Goal Star 1 has no automatic "next" — it must be explicitly routed like 2–10.
    if (starIndex === 1 && !w.outOfSequence) {
      if (isBossWorld(c, worldId)) {
        const nz = nextZoneId(c, w.zoneId);
        if (!nz) return { kind: 'campaign-complete' };
        const fw = firstWorldId(c, nz);
        if (!fw) return { kind: 'campaign-complete' };
        return { kind: 'zone', zoneId: nz, worldId: fw, entryPointId: defaultEntryPointId(getWorld(c, fw)) };
      }
      const destId = (route && route.destinationWorldId) || nextWorldInZone(c, worldId);
      if (!destId) return { kind: 'campaign-complete' };
      const dest = getWorld(c, destId);
      const ep   = (route && route.destinationEntryPointId) || defaultEntryPointId(dest);
      return { kind: 'world', worldId: destId, entryPointId: ep, secret: false };
    }

    // Goal Stars 2–10: must be explicitly routed (bonus / connect).
    if (!route || !route.destinationWorldId) return { kind: 'unrouted', starIndex };
    const dest = getWorld(c, route.destinationWorldId);
    if (!dest) return { kind: 'unrouted', starIndex };
    const ep = route.destinationEntryPointId || defaultEntryPointId(dest);
    return { kind: 'world', worldId: route.destinationWorldId, entryPointId: ep, secret: !!route.hidden };
  }

  // ── Goal Stars present in a World's underlying sandbox level ───────────────
  // Returns a sorted array of 1-based star indexes actually placed in the level.
  // world_data.goalStars records only NON-gold colours ({row,col,color}); a plain
  // GOAL block (gold, colour 0) lives only in the grid — so we scan both. Star 1
  // (gold) counts if ANY goal cell exists that isn't a recorded non-gold colour,
  // or if a goalStars entry explicitly uses colour 0.
  function starIndexesFromWorldData(worldData) {
    const set = new Set();
    if (!worldData) return [];
    const goalStars = Array.isArray(worldData.goalStars) ? worldData.goalStars : [];
    const colored   = new Set();   // "r,c" cells with a recorded non-gold colour
    for (const g of goalStars) {
      const idx = g.color | 0;
      set.add(idx + 1);
      if (idx > 0) colored.add(g.row + ',' + g.col);
    }
    const grid = worldData.grid;
    if (Array.isArray(grid)) {
      for (let r = 0; r < grid.length; r++) {
        const row = grid[r];
        if (!row) continue;
        for (let c = 0; c < row.length; c++) {
          if (row[c] === GOAL_BLOCK_ID && !colored.has(r + ',' + c)) { set.add(1); }
        }
      }
    }
    return [...set].sort((a, b) => a - b);
  }

  // ── Publish-validation gate (§6 — publish ONLY, never blocks a save) ───────
  // worldGoalStars: { [campaignWorldId]: number[] } of 1-based star indexes present
  // in each World's underlying level (derive with starIndexesFromWorldData).
  function validateForPublish(c, worldGoalStars) {
    const errors = [];
    const worlds = c.worlds || [];
    const WL = c.worldLabel || DEFAULT_WORLD_LABEL;

    if (!worlds.length) errors.push({ type: 'empty', message: 'Campaign has no ' + WL + 's yet.' });
    if (!c.startingWorldId || !getWorld(c, c.startingWorldId))
      errors.push({ type: 'no-start', message: 'No starting ' + WL + ' is set.' });

    for (const w of worlds) {
      const stars = (worldGoalStars && worldGoalStars[w.id]) || [];
      // Check (2): every included World has at least one placed Goal Star.
      if (!stars.length) {
        errors.push({ type: 'no-goal-star', worldId: w.id, worldName: w.name,
          message: '"' + w.name + '" has no Goal Star placed.' });
        continue;
      }
      // Check (1): every placed Goal Star has a resolved route.
      for (const s of stars) {
        const res = resolveStarForValidation(c, w, s);
        if (!res.ok) errors.push({ type: 'unrouted-star', worldId: w.id, worldName: w.name,
          starIndex: s, message: res.message });
      }
    }
    return { ok: errors.length === 0, errors };
  }

  function resolveStarForValidation(c, w, starIndex) {
    const WL = c.worldLabel || DEFAULT_WORLD_LABEL;
    const ZL = c.zoneLabel  || DEFAULT_ZONE_LABEL;
    if (starIndex === 1 && !w.outOfSequence) {
      // Boss World's Goal Star 1 always resolves (next Zone, or Campaign complete).
      if (isBossWorld(c, w.id)) return { ok: true };
      const route   = routeFor(w, 1);
      const hasNext = !!nextWorldInZone(c, w.id) || !!(route && route.destinationWorldId);
      if (!hasNext) return { ok: false,
        message: '"' + w.name + '" Goal Star 1 has no next ' + WL + ' — use [+] to add or route it.' };
      return { ok: true };
    }
    const route = routeFor(w, starIndex);
    if (!route || !route.destinationWorldId)
      return { ok: false, message: '"' + w.name + '" Goal Star ' + starIndex + ' is unrouted — set Bonus or Connect.' };
    if (!getWorld(c, route.destinationWorldId))
      return { ok: false, message: '"' + w.name + '" Goal Star ' + starIndex + ' points to a missing ' + WL + '.' };
    return { ok: true };
  }

  // ── Structural mutation helpers (used by the Builder; kept here so the data
  //    invariants live in one place) ─────────────────────────────────────────
  // Append an existing sandbox world as the next in-sequence World of a Zone,
  // wiring Goal Star 1 as next-in-sequence FROM the previous last World.
  function addWorldToZone(c, zoneId, cw) {
    const z = getZone(c, zoneId);
    if (!z) return c;
    c.worlds.push(cw);
    z.worldOrder.push(cw.id);
    return c;
  }

  // Add a bonus / out-of-sequence World (belongs to a Zone for display grouping,
  // but is NOT in worldOrder — reachable only via a Goal-Star route, §8).
  function addBonusWorld(c, zoneId, cw) {
    cw.outOfSequence = true;
    cw.zoneId = zoneId;
    c.worlds.push(cw);
    return c;
  }

  // Bonus worlds grouped under a Zone (for the Builder's out-of-sequence section).
  function bonusWorldsInZone(c, zoneId) {
    return (c.worlds || []).filter((w) => w.outOfSequence && w.zoneId === zoneId);
  }

  // Compact a numeric id sequence — the Builder generates ids as `w<n>` / `z<n>`.
  function nextId(prefix, existing) {
    let max = 0;
    for (const it of existing) {
      const m = String(it.id || '').match(new RegExp('^' + prefix + '(\\d+)$'));
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return prefix + (max + 1);
  }

  const CAMPAIGN_MODEL = {
    DEFAULT_ZONE_LABEL, DEFAULT_WORLD_LABEL, RESET_MODES,
    ROUTE_NEXT, ROUTE_BONUS, ROUTE_CONNECT, GOAL_BLOCK_ID,
    newCampaign, newZone, newCampaignWorld,
    getZone, getWorld, worldsInZone,
    bossWorldId, isBossWorld, nextZoneId, firstWorldId, nextWorldInZone,
    defaultEntryPointId, routeFor,
    resolveExit, starIndexesFromWorldData,
    validateForPublish, resolveStarForValidation,
    addWorldToZone, addBonusWorld, bonusWorldsInZone, nextId,
  };

  if (typeof window !== 'undefined') window.CAMPAIGN_MODEL = CAMPAIGN_MODEL;
  if (typeof module !== 'undefined' && module.exports) module.exports = { CAMPAIGN_MODEL };
})();
