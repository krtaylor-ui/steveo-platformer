// ============================================================
// game-state.js — Serialize / deserialize game state for API saves
// ============================================================

const GAME_STATE = {

  // ════════════════════════════════════════════════════════════
  // SERIALIZE: Convert current game to a JSON-safe object
  // Produces a v2 SandboxSaves-compatible payload + playerProgress field.
  // ════════════════════════════════════════════════════════════
  // Build/refresh the world's lineage metadata. Preserves uid/createdAt/copiedFrom
  // from the loaded world; stamps a fresh updatedAt each save. origin defaults to
  // 'cloud' (the local-worlds mode will set 'local'); copiedFrom/At are populated
  // by the future "copy to online/offline" flow.
  // Serialize non-gold Goal-Star colours from game._goalColorMap ("r,c" -> idx).
  _goalStars(game) {
    const cm = game._goalColorMap;
    if (!cm) return [];
    const out = [];
    for (const key in cm) {
      const color = cm[key];
      if (!color) continue;
      const [row, col] = key.split(',').map(Number);
      if (Number.isFinite(row) && Number.isFinite(col)) out.push({ row, col, color });
    }
    return out;
  },

  _provenance(game) {
    const prev = game._loadedProvenance || {};
    const uid  = prev.uid || ('w-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8));
    const prov = {
      uid,
      createdAt:  prev.createdAt || Date.now(),
      updatedAt:  Date.now(),
      creator:    prev.creator || game._sbPlayerName || null,
      origin:     game._worldOrigin || prev.origin || 'cloud',
      copiedFrom: prev.copiedFrom || null,
      copiedAt:   prev.copiedAt   || null,
    };
    game._loadedProvenance = prov; // keep stable across saves this session
    return prov;
  },

  serialize(game) {
    if (!game || !game.level) return null;
    const p = game.player;

    // Grid — deep copy each row
    const grid = game.level.grid.map(row => Array.from(row));

    // Chests
    const chests = [];
    if (game._chests) {
      for (const ch of game._chests.values()) {
        chests.push({ col: ch.col, row: ch.row, items: ch.items.map(it => it ? { ...it } : null) });
      }
    }

    // Dust blocks
    const dustBlocks = game._dustBlocks
      ? [...game._dustBlocks.values()].map(d => ({
          col: d.col, row: d.row, on: !!d.on,
          everTriggered: !!d.everTriggered, setting: d.setting || 'always_show',
        }))
      : [];

    // Gate blocks
    const gateBlocks = game._gateBlocks
      ? [...game._gateBlocks.values()].map(g => ({
          col: g.col, row: g.row, type: g.type,
          inputSide: g.inputSide, inputSide2: g.inputSide2, outputSide: g.outputSide,
          outputPowered: !!g.outputPowered, everTriggered: !!g.everTriggered,
          setting: g.setting || 'always_show',
        }))
      : [];

    // Transmitters / receivers
    const transmitters = game._transmitters
      ? [...game._transmitters.values()].map(t => ({ col: t.col, row: t.row, number: t.number }))
      : [];
    const receivers = game._receivers
      ? [...game._receivers.values()].map(r => ({
          col: r.col, row: r.row, listenTo: [...(r.listenTo || [])],
        }))
      : [];

    // Redstone components with sandbox state
    const sandboxLevers = game.redstone
      ? game.redstone.components
          .filter(c => c.type === 'lever' && c.sandboxPlaced)
          .map(c => ({ col: c.col, row: c.row, on: !!c.on }))
      : [];
    const sandboxTrapdoors = game.redstone
      ? game.redstone.components
          .filter(c => c.type === 'trapdoor' && c.sandboxPlaced)
          .map(c => ({ col: c.col, row: c.row, open: !!c.open }))
      : [];
    const sandboxPistons = game.redstone
      ? game.redstone.components
          .filter(c => c.type === 'piston' && c.sandboxPlaced)
          .map(c => ({ col: c.col, row: c.row, dir: c.dir || 'right', inverted: !!c.inverted, extended: !!c.extended }))
      : [];

    // World items (single items placed on the ground). BUGFIX: in the SANDBOX
    // EDITOR these live in game.sandbox.placedItems; game._platformerItems is only
    // populated during platformer/normal PLAY (empty while editing). This field
    // used to read _platformerItems unconditionally, so every editor save/test/
    // auto-save emitted placedItems:[] and re-saving an older world STRIPPED all
    // its placed items. Now prefers the editor array (mirrors emeralds/powerups/
    // spawnEggs above), falling back to the play array for mid-play progress saves.
    const bs = (typeof BLOCK_SIZE !== 'undefined') ? BLOCK_SIZE : 32;
    const _itemSrc = (game.sandbox && Array.isArray(game.sandbox.placedItems))
      ? game.sandbox.placedItems
      : (Array.isArray(game._platformerItems) ? game._platformerItems : []);
    const placedItems = _itemSrc
      .filter(it => !it.collected)
      .map(it => ({
        col: (it.col != null) ? it.col : Math.floor(it.wx / bs),
        row: (it.row != null) ? it.row : Math.floor(it.wy / bs),
        toolKey:   it.toolKey   ?? null,
        blockType: it.blockType ?? null,
        count:     it.count     ?? null,
      }));

    // Portal links. In the SANDBOX EDITOR portals live in sandbox.sandboxPortals
    // (with destId routing); in normal/platformer play they live in
    // _normalPortals. Prefer whichever is populated — previously this only read
    // _normalPortals (empty while editing), so saving from the editor silently
    // dropped all portal routing. Mirrors SandboxSaves.save (resolves destId →
    // destLabel) so the cloud save round-trips like the legacy localStorage save.
    let portalLinks = [];
    if (game.sandbox && Array.isArray(game.sandbox.sandboxPortals) && game.sandbox.sandboxPortals.length) {
      portalLinks = game.sandbox.sandboxPortals.map(p => {
        const dest = (p.destId != null) ? game.sandbox.findPortalById(p.destId) : null;
        return {
          label: p.label, biome: p.biome,
          anchorRow: p.anchorRow, anchorCol: p.anchorCol,
          destLabel: dest?.label ?? null,
          ruined: p.ruined ?? false,
        };
      });
    } else if (Array.isArray(game._normalPortals)) {
      portalLinks = game._normalPortals.map(pt => ({
        label: pt.label, biome: pt.biome,
        anchorRow: pt.anchorRow, anchorCol: pt.anchorCol,
        destLabel: pt.destLabel ?? null,
        ruined: pt.ruined ?? false,
      }));
    }

    // Ruined portals
    const ruinedPortals = game._ruinedPortals
      ? [...game._ruinedPortals.values()].map(rp => ({
          anchorRow: rp.anchorRow, anchorCol: rp.anchorCol, activated: !!rp.activated,
        }))
      : [];

    // End portal anchors
    const endPortalAnchors = game._endPortalAnchors
      ? [...game._endPortalAnchors.values()].map(a => ({
          col: a.col, row: a.row, eyeCount: a.eyeCount ?? 0, active: !!a.active,
        }))
      : [];

    // Dragon + crystals
    const dragonState = game._dragon ? {
      hp: game._dragon.hp, x: game._dragon.x, y: game._dragon.y,
      state: game._dragon.state,
      fireballAttackDisabled: !!game._dragon.fireballAttackDisabled,
    } : null;
    const crystalStates = game._endCrystals
      ? game._endCrystals.map(c => ({ col: c.col, row: c.row, destroyed: !!c.destroyed }))
      : null;

    // Live mobs — the exact set alive at save time, so re-entering the world
    // restores them (position / hp / state) instead of respawning fresh from
    // spawn eggs. Spawn eggs still drive respawns for killed / additional mobs.
    const liveMobs = (game.mobManager && typeof game.mobManager.serializeMobs === 'function')
      ? game.mobManager.serializeMobs()
      : [];
    // Ground item drops (mob loot / broken-block drops) not yet picked up.
    const droppedItems = (typeof game._captureDroppedItems === 'function')
      ? game._captureDroppedItems()
      : [];

    return {
      saveVersion: 2,
      savedAt: new Date().toISOString(),
      worldWidth:  game.level.width,
      worldHeight: game.level.height,
      // Persistent total play time (ms) — kept current by GAME_TIMER each tick.
      totalGameTime: game.totalGameTime || 0,
      grid,
      // Spawn eggs (mob spawners) — carries Phase 3A.2 per-spawner fields
      // (spawnFrequency, maxActiveMobs). Previously hardcoded [], so editor
      // spawners never persisted or reached arena play.
      spawnEggs: game.sandbox ? game.sandbox.placedEggs.map(e => ({ ...e })) : [],
      // Arena collectibles (Phase 3A.2) — emeralds carry `group` (Phase 3A.3) via spread
      emeralds: game.sandbox ? game.sandbox.placedEmeralds.map(e => ({ ...e })) : [],
      powerups: game.sandbox ? game.sandbox.placedPowerups.map(p => ({ ...p })) : [],
      // Arena objectives (Phase 3A.3)
      spawnLines: game.sandbox ? game.sandbox.placedSpawnLines.map(s => ({ ...s })) : [],
      placedHill: game.sandbox ? (game.sandbox.placedHill ? { ...game.sandbox.placedHill } : null) : null,
      // Player spawn points (Phase 3) — where each player starts, tagged by slot 1–4.
      playerSpawns: game.sandbox ? game.sandbox.placedSpawnPoints.map(s => ({ ...s })) : [],
      arenaObjects: game.sandbox ? game.sandbox.placedArenaObjs.map(o => ({ ...o })) : [],
      // Goal-star colours (campaign-prep) — [{row,col,color}] for coloured exits.
      goalStars: GAME_STATE._goalStars(game),
      placedItems,
      portalLinks,
      sandboxLevers,
      sandboxTrapdoors,
      sandboxPistons,
      dustBlocks,
      transmitters,
      receivers,
      gateBlocks,
      chests,
      ruinedPortals,
      endPortalAnchors,
      dragonState,
      crystalStates,
      liveMobs,
      droppedItems,
      dragonDefeated:  !!game._dragonDefeated,
      collectedDiscs:  game._collectedDiscs ? [...game._collectedDiscs] : [],
      worldAdvSettings: game._worldAdvSettings
        ? JSON.parse(JSON.stringify(game._worldAdvSettings))
        : null,
      provenance: GAME_STATE._provenance(game),
      // Player progress — separate from world data, applied post-construction
      playerProgress: {
        px:           Math.floor(p.x),
        py:           Math.floor(p.y),
        hp:           p.hp,
        xp:           p.xp,
        level:        p.level,
        selectedSlot: p.selectedSlot,
        hotbar:       p.hotbar    ? p.hotbar.map(s => s ? { ...s } : null)    : [],
        inventory:    p.inventory ? p.inventory.map(s => s ? { ...s } : null) : [],
        equippedArmor:  { ...(p.equippedArmor  || {}) },
        hasFlintSteel:  !!p.hasFlintSteel,
        discoveredOres: p.discoveredOres ? [...p.discoveredOres] : [],
      },
    };
  },

  // ════════════════════════════════════════════════════════════
  // DESERIALIZE: Apply saved playerProgress to a live game.
  // Call this AFTER new Game() finishes constructing.
  // ════════════════════════════════════════════════════════════
  deserialize(game, stateData) {
    if (!stateData) return;
    // Restore persistent total play time (top-level, independent of playerProgress).
    if (typeof stateData.totalGameTime === 'number') game.totalGameTime = stateData.totalGameTime;
    if (!stateData.playerProgress) return;
    const prog = stateData.playerProgress;
    const p    = game.player;

    try {
      if (typeof prog.hp    === 'number') p.hp    = Math.max(1, prog.hp);
      if (typeof prog.xp    === 'number') p.xp    = prog.xp;
      if (typeof prog.level === 'number') p.level = prog.level;
      if (typeof prog.selectedSlot === 'number') p.selectedSlot = prog.selectedSlot;
      if (Array.isArray(prog.hotbar))    p.hotbar    = prog.hotbar.map(s => s || null);
      if (Array.isArray(prog.inventory)) p.inventory = prog.inventory.map(s => s || null);
      if (prog.equippedArmor && typeof prog.equippedArmor === 'object') {
        for (const slot of ['head', 'chest', 'legs', 'feet']) {
          if (prog.equippedArmor[slot]) p.equippedArmor[slot] = prog.equippedArmor[slot];
        }
      }
      if (prog.hasFlintSteel) p.hasFlintSteel = true;
      if (Array.isArray(prog.discoveredOres)) {
        for (const ore of prog.discoveredOres) p.discoveredOres.add(ore);
      }
      if (typeof prog.px === 'number') {
        p.x = prog.px;
        p.y = typeof prog.py === 'number' ? prog.py : p.y;
      }
      p.velX = 0;
      p.velY = 0;
      console.log('[GameState] Player progress restored');
    } catch (e) {
      console.error('[GameState] Deserialize error:', e);
    }
  },
};
