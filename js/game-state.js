// ============================================================
// game-state.js — Serialize / deserialize game state for API saves
// ============================================================

const GAME_STATE = {

  // ════════════════════════════════════════════════════════════
  // SERIALIZE: Convert current game to a JSON-safe object
  // Produces a v2 SandboxSaves-compatible payload + playerProgress field.
  // ════════════════════════════════════════════════════════════
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

    // World items (uncollected platformer / normal drops)
    const bs = (typeof BLOCK_SIZE !== 'undefined') ? BLOCK_SIZE : 32;
    const placedItems = Array.isArray(game._platformerItems)
      ? game._platformerItems
          .filter(it => !it.collected)
          .map(it => ({
            col: Math.floor(it.wx / bs),
            row: Math.floor(it.wy / bs),
            toolKey:   it.toolKey   ?? null,
            blockType: it.blockType ?? null,
            count:     it.count     ?? null,
          }))
      : [];

    // Portal links
    const portalLinks = Array.isArray(game._normalPortals)
      ? game._normalPortals.map(pt => ({
          label: pt.label, biome: pt.biome,
          anchorRow: pt.anchorRow, anchorCol: pt.anchorCol,
          destLabel: pt.destLabel ?? null,
        }))
      : [];

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

    return {
      saveVersion: 2,
      savedAt: new Date().toISOString(),
      worldWidth:  game.level.width,
      worldHeight: game.level.height,
      // Persistent total play time (ms) — kept current by GAME_TIMER each tick.
      totalGameTime: game.totalGameTime || 0,
      grid,
      spawnEggs: [],
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
      dragonDefeated:  !!game._dragonDefeated,
      collectedDiscs:  game._collectedDiscs ? [...game._collectedDiscs] : [],
      worldAdvSettings: game._worldAdvSettings
        ? JSON.parse(JSON.stringify(game._worldAdvSettings))
        : null,
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
