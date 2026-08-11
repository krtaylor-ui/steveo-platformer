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

  // Serialize decorative-foliage colours from game._foliageColorMap ("r,c" -> idx).
  // The block ids (bush/leaves, front/back) already live in the grid; only the
  // per-cell colour needs its own array (Smart Mobs §10).
  _foliage(game) {
    const cm = game._foliageColorMap;
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
      ? [...game._transmitters.values()].map(t => ({ col: t.col, row: t.row, number: t.number, hidden: !!t.hidden }))
      : [];
    const receivers = game._receivers
      ? [...game._receivers.values()].map(r => ({
          col: r.col, row: r.row, listenTo: [...(r.listenTo || [])], hidden: !!r.hidden,
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
          .map(c => ({ col: c.col, row: c.row, open: !!c.open, conduct: c.conduct }))
      : [];
    const sandboxPistons = game.redstone
      ? game.redstone.components
          .filter(c => c.type === 'piston' && c.sandboxPlaced)
          .map(c => ({ col: c.col, row: c.row, dir: c.dir || 'right', inverted: !!c.inverted, extended: !!c.extended, conduct: c.conduct }))
      : [];
    // §Conduct — pressure plates now carry per-block config (conduct network + skin)
    const sandboxPlates = game.redstone
      ? game.redstone.components
          .filter(c => c.type === 'pressure_plate')
          .map(c => ({ col: c.col, row: c.row, conduct: c.conduct, skin: c.skin || null }))
      : [];
    // §Phase R — Target Blocks carry their own config (pulse/toggle + pulse length)
    const sandboxTargets = game.redstone
      ? game.redstone.components
          .filter(c => c.type === 'target')
          .map(c => ({ col: c.col, row: c.row, mode: c.mode || 'pulse', pulseDur: c.pulseDur || 30, conduct: c.conduct }))
      : [];
    const sandboxLamps = game.redstone
      ? game.redstone.components
          .filter(c => c.type === 'lamp')
          .map(c => ({ col: c.col, row: c.row, color: c.color || 0, conduct: c.conduct }))
      : [];
    const sandboxConverters = game.redstone
      ? game.redstone.components
          .filter(c => c.type === 'pulse_converter')
          .map(c => ({ col: c.col, row: c.row, dir: c.dir || (c.axis === 'v' ? 'down' : 'right') }))
      : [];
    const sandboxWeightPlates = game.redstone
      ? game.redstone.components
          .filter(c => c.type === 'weight')
          .map(c => ({ col: c.col, row: c.row, trigger: c.trigger || 'both', conduct: c.conduct, skin: c.skin || null }))
      : [];
    // Sandbox quick-access hotbar — must survive the test-mode round-trip (which
    // serializes via GAME_STATE, not saves.js), else it empties on return to editor.
    const sbHotbar = (game.sandbox && Array.isArray(game.sandbox.sbHotbar))
      ? game.sandbox.sbHotbar.map(e => e ? { ...e } : null)
      : undefined;
    const sbHotbarSel = (game.sandbox && typeof game.sandbox.sbHotbarSel === 'number')
      ? game.sandbox.sbHotbarSel
      : undefined;

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
      // Custom Sprites: persist the world's chosen character so a RESUME/Continue keeps it.
      // freshGameData spreads world_data (with characterId) at CREATE, but the first autosave
      // overwrites game_data with this serialize() — so without this field every resumed game
      // silently reverted to 'classic' (tester, build 434). Sourced from the live global the
      // player is actually rendering with, falling back to any id already on the game/world.
      characterId: (typeof window !== 'undefined' && window.CURRENT_CHARACTER_ID)
        || game._characterId || 'classic',
      // Phase 2: the per-world custom-character mix ({name,body,sel,pal}) so a 'custom' character
      // survives save/resume too. Null for the built-in roster.
      customCharacter: game._customCharacter || null,
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
      foliage:   GAME_STATE._foliage(game),
      placedItems,
      portalLinks,
      sandboxLevers,
      sandboxTrapdoors,
      sandboxPistons,
      sandboxTargets,
      sandboxLamps,
      sandboxConverters,
      sandboxWeightPlates,
      sandboxPlates,
      sbHotbar,
      sbHotbarSel,
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
      // §Classic Blocks — pipe destination links + per-block (Question/Breakable) contents.
      pipeLinks:      game._pipeLinks ? [...game._pipeLinks.entries()] : [],
      pipeEntry:      game._pipeEntry ? [...game._pipeEntry.entries()] : [],
      blockContents:  game._blockContents ? [...game._blockContents.entries()] : [],
      travelTubes:    game._travelTubes ? game._travelTubes.map(t => ({ id: t.id, cells: t.cells, speed: t.speed, mode: t.mode || 'solid', items: t.items || [], angled: !!t.angled })) : [],
      // §Moving Platforms — rails (waypoint paths) + platforms (anchor-bound block groups). Frozen at author time.
      rails:          game._rails ? game._rails.map(r => r.isSwitch
                        ? { id: r.id, isSwitch: true, pivot: r.pivot, a: r.a, b: r.b, vis: r.vis || 'visible', switchChannel: r.switchChannel ?? null, switchDur: r.switchDur ?? 20, switchState: r.switchState ?? 0 }
                        : { id: r.id, cells: r.cells, vis: r.vis || 'visible', loop: !!r.loop, angled: !!r.angled, pauseNodes: r.pauseNodes || [], collideMode: r.collideMode || 'passthrough', speedSegments: r.speedSegments || [], launchAt: r.launchAt ?? null, launchDir: r.launchDir ?? null }) : [],
      platforms:      game._platforms ? game._platforms.map(p => ({ id: p.id, railId: p.railId, anchorCol: p.anchorCol, anchorRow: p.anchorRow, anchorDist: p.anchorDist, cells: p.cells, initialDir: p.initialDir, mode: p.mode, signalResponse: p.signalResponse, returnMode: p.returnMode, speed: p.speed, dirCtrl: p.dirCtrl || null, cog: !!p.cog, skin: p.skin || null })) : [],
      dirControllers: game._dirControllers ? [...game._dirControllers.values()].map(d => ({ col: d.col, row: d.row, lCh: d.lCh ?? null, rCh: d.rCh ?? null, skin: d.skin || null })) : [],
      speedSegs:      game._speedSegs ? game._speedSegs.map(s => ({ id: s.id, railId: s.railId, cells: s.cells, targetSpeed: s.targetSpeed })) : [],
      railGates:      game._railGates ? game._railGates.map(g => ({ id: g.id, railId: g.railId, cells: g.cells, condition: g.condition, channel: g.channel ?? null, threshold: g.threshold })) : [],
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
        // Weapons: active tools + the full collection (Smart Mobs §2) so collected
        // weapons survive leave→continue, not just the active one.
        pickaxe:      p.pickaxe,
        meleeOwned:   Array.isArray(p.meleeOwned)  ? [...p.meleeOwned]  : undefined,
        meleeIndex:   p.meleeIndex,
        rangedOwned:  Array.isArray(p.rangedOwned) ? [...p.rangedOwned] : undefined,
        rangedIndex:  p.rangedIndex,
        hasShield:      !!p.hasShield,
        hasFlintSteel:  !!p.hasFlintSteel,
        hasGrapple:     !!p.hasGrapple,
        discoveredOres: p.discoveredOres ? [...p.discoveredOres] : [],
      },
      // Secondary players (P2–P4 / the companion) — position + hp, so CONTINUING a game
      // keeps them where they were instead of snapping back to their spawn point (Kevin).
      secondaryPlayers: (game.players || []).slice(1).map(sp =>
        sp ? { px: Math.floor(sp.x), py: Math.floor(sp.y), hp: sp.hp } : null),
    };
  },

  // ════════════════════════════════════════════════════════════
  // DESERIALIZE: Apply saved playerProgress to a live game.
  // Call this AFTER new Game() finishes constructing.
  // ════════════════════════════════════════════════════════════
  deserialize(game, stateData, opts) {
    if (!stateData) return;
    // Restore persistent total play time (top-level, independent of playerProgress).
    if (typeof stateData.totalGameTime === 'number') game.totalGameTime = stateData.totalGameTime;
    // Custom Sprites: restore the saved character (belt-and-suspenders with the constructor's
    // templateData read) so a resumed game renders the tagged character, not 'classic'. Runs
    // before the newGame/no-progress early-returns because the character applies either way.
    if (stateData.characterId) {
      game._characterId = stateData.characterId;
      if (typeof window !== 'undefined') window.CURRENT_CHARACTER_ID = stateData.characterId;
    }
    // Phase 2: restore the custom-character mix so a resumed 'custom' world renders the built one.
    if (stateData.customCharacter && typeof CHARACTERS !== 'undefined' && CHARACTERS.setCustom) {
      game._customCharacter = stateData.customCharacter;
      CHARACTERS.setCustom(stateData.customCharacter);
    }
    // NEW GAME: a freshly-created game's game_data is a full COPY of the source world —
    // including the sandbox editor's player state (god-mode loadout + editor POSITION).
    // Restoring that would spawn the player wherever the designer left off instead of at
    // the designed spawn point (Kevin). So on a new game skip playerProgress entirely: the
    // world load already placed the player at its spawn point, and _applyStartingWeapons
    // gives the designed starting loadout. Progress is only restored when CONTINUING.
    if (opts && opts.newGame) return;
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
      if (prog.hasGrapple) p.hasGrapple = true;
      if (prog.hasShield)     p.hasShield     = true;
      if (prog.pickaxe)       p.pickaxe       = prog.pickaxe;
      // Restore the weapon COLLECTION (Smart Mobs §2); the collection is the source
      // of truth, so derive the active sword/bow from it. Fall back to the legacy
      // single active weapon for older saves.
      if (Array.isArray(prog.meleeOwned) && prog.meleeOwned.length) {
        p.meleeOwned = prog.meleeOwned.slice();
        p.meleeIndex = Math.min(prog.meleeIndex || 0, p.meleeOwned.length - 1);
        if (p._syncActiveWeapon) p._syncActiveWeapon('melee');
      } else if (prog.sword) {
        p.sword = prog.sword;
        if (p.normalizeWeapons) p.normalizeWeapons();
      }
      if (Array.isArray(prog.rangedOwned)) {
        p.rangedOwned = prog.rangedOwned.slice();
        p.rangedIndex = Math.min(prog.rangedIndex || 0, Math.max(0, p.rangedOwned.length - 1));
        if (p._syncActiveWeapon) p._syncActiveWeapon('ranged');
      } else if ('bow' in prog) {
        p.bow = prog.bow;
      }
      // Weapons were restored → don't let the world's starting-weapon default
      // re-apply on the first update and clobber the resumed loadout.
      if (Array.isArray(prog.meleeOwned)) game._startWeaponsApplied = true;
      if (Array.isArray(prog.discoveredOres)) {
        for (const ore of prog.discoveredOres) p.discoveredOres.add(ore);
      }
      if (typeof prog.px === 'number') {
        p.x = prog.px;
        p.y = typeof prog.py === 'number' ? prog.py : p.y;
      }
      p.velX = 0;
      p.velY = 0;
      // Secondary players (P2–P4 / companion) — restore their saved position + hp so a
      // co-op teammate / companion resumes where it left off, not at its spawn point.
      if (Array.isArray(stateData.secondaryPlayers)) {
        stateData.secondaryPlayers.forEach((sp, i) => {
          const target = game.players && game.players[i + 1];
          if (sp && target && typeof sp.px === 'number') {
            target.x = sp.px;
            target.y = typeof sp.py === 'number' ? sp.py : target.y;
            target.vx = 0; target.vy = 0;
            if (typeof sp.hp === 'number') target.hp = Math.max(1, sp.hp);
          }
        });
      }
      console.log('[GameState] Player progress restored');
    } catch (e) {
      console.error('[GameState] Deserialize error:', e);
    }
  },
};
