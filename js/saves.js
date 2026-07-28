// ============================================================
// saves.js — Sandbox world persistence via localStorage
// ============================================================

const SAVE_PREFIX = 'sbworld|';

const SandboxSaves = {

  // Build a localStorage key (both name fields are validated to not contain '|')
  key(playerName, worldName) {
    return SAVE_PREFIX + playerName + '|' + worldName;
  },

  // Return array of { key, playerName, worldName, savedAt } sorted newest-first.
  // Silently skips entries with corrupted JSON.
  list() {
    const worlds = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(SAVE_PREFIX)) continue;
      try {
        const data = JSON.parse(localStorage.getItem(k));
        if (data && data.playerName && data.worldName) {
          worlds.push({
            key:        k,
            playerName: data.playerName,
            worldName:  data.worldName,
            savedAt:    data.savedAt || '',
          });
        }
      } catch (_) { /* corrupted entry — skip */ }
    }
    worlds.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
    return worlds;
  },

  // Serialize and persist a sandbox world.
  // level    — Level instance (has .grid 2D array)
  // sandbox  — SandboxManager instance (has .placedEggs)
  // player   — Player instance (has .x, .y)
  // Returns { ok: true } or { ok: false, error: string }
  save(playerName, worldName, level, sandbox, player, redstone, dustBlocks, gateBlocks, transmitters, receivers, chestsMap = null, ruinedPortals = null, endPortalAnchors = null, dragon = null, endCrystals = null, dragonDefeated = false, mobDropSettings = null, worldAdvSettings = null, collectedDiscs = null, musicPlayerBlocks = null, witherAltars = null, rails = null, platforms = null, dirControllers = null, speedSegs = null) {
    const grid = level.grid.map(row => Array.from(row));

    const spawnEggs = sandbox
      ? sandbox.placedEggs.map(e => ({ col: e.col, row: e.row, mobType: e.mobType }))
      : [];

    const placedItems = sandbox
      ? sandbox.placedItems.map(it => ({
          col: it.col, row: it.row,
          toolKey:   it.toolKey   ?? null,
          blockType: it.blockType ?? null,
          count:     it.count     ?? null,
        }))
      : [];

    const portalLinks = sandbox
      ? sandbox.sandboxPortals.map(p => {
          const dest = p.destId !== null ? sandbox.findPortalById(p.destId) : null;
          return {
            label:     p.label,
            biome:     p.biome,
            anchorRow: p.anchorRow,
            anchorCol: p.anchorCol,
            destLabel: dest?.label ?? null,
            ruined:    p.ruined ?? false,
          };
        })
      : [];

    const sandboxLevers = redstone
      ? redstone.components
          .filter(c => c.type === 'lever' && c.sandboxPlaced)
          .map(c => ({ col: c.col, row: c.row, on: !!c.on }))
      : [];

    const sandboxTrapdoors = redstone
      ? redstone.components
          .filter(c => c.type === 'trapdoor' && c.sandboxPlaced)
          .map(c => ({ col: c.col, row: c.row, open: !!c.open }))
      : [];

    const sandboxPistons = redstone
      ? redstone.components
          .filter(c => c.type === 'piston' && c.sandboxPlaced)
          .map(c => ({ col: c.col, row: c.row, dir: c.dir || 'right',
                       inverted: !!c.inverted, extended: !!c.extended }))
      : [];

    const dustBlocksArr = dustBlocks
      ? [...dustBlocks.values()].map(d => ({
          col: d.col, row: d.row, on: !!d.on,
          everTriggered: !!d.everTriggered, setting: d.setting || 'always_show',
        }))
      : [];

    // Serialize sandbox hotbar — each slot is null or a plain {kind, value} object
    const sbHotbar = sandbox
      ? sandbox.sbHotbar.map(entry => entry ? { ...entry } : null)
      : Array(8).fill(null);
    const sbHotbarSel = sandbox ? (sandbox.sbHotbarSel ?? 0) : 0;

    const payload = {
      playerName,
      worldName,
      savedAt:    new Date().toISOString(),
      worldWidth:  level.width,
      worldHeight: level.height,
      grid,
      spawnEggs,
      placedItems,
      portalLinks,
      sandboxLevers,
      sandboxTrapdoors,
      sandboxPistons,
      dustBlocks: dustBlocksArr,
      transmitters: transmitters ? [...transmitters.values()].map(t => ({
        col: t.col, row: t.row, number: t.number,
      })) : [],
      receivers: receivers ? [...receivers.values()].map(r => ({
        col: r.col, row: r.row, listenTo: [...r.listenTo],
      })) : [],
      gateBlocks: gateBlocks ? [...gateBlocks.values()].map(g => ({
        col: g.col, row: g.row, type: g.type,
        inputSide: g.inputSide, inputSide2: g.inputSide2, outputSide: g.outputSide,
        outputPowered: !!g.outputPowered, everTriggered: !!g.everTriggered,
        setting: g.setting || 'always_show',
      })) : [],
      chests: chestsMap ? [...chestsMap.values()].map(ch => ({
        col: ch.col, row: ch.row,
        items: ch.items.map(it => it ? { ...it } : null),
      })) : [],
      // §Moving Platforms — rails (waypoint paths) + platforms (anchor-bound block groups).
      rails: rails ? rails.map(r => ({ id: r.id, cells: r.cells, vis: r.vis || 'visible', loop: !!r.loop, pauseNodes: r.pauseNodes || [], collideMode: r.collideMode || 'passthrough', speedSegments: r.speedSegments || [], launchAt: r.launchAt ?? null })) : [],
      platforms: platforms ? platforms.map(p => ({ id: p.id, railId: p.railId, anchorCol: p.anchorCol, anchorRow: p.anchorRow, anchorDist: p.anchorDist, cells: p.cells, initialDir: p.initialDir, mode: p.mode, signalResponse: p.signalResponse, returnMode: p.returnMode, speed: p.speed, dirCtrl: p.dirCtrl || null, cog: !!p.cog })) : [],
      dirControllers: dirControllers ? [...dirControllers.values()].map(d => ({ col: d.col, row: d.row, lCh: d.lCh ?? null, rCh: d.rCh ?? null })) : [],
      speedSegs: speedSegs ? speedSegs.map(s => ({ id: s.id, railId: s.railId, cells: s.cells, targetSpeed: s.targetSpeed })) : [],
      playerPx:   Math.floor(player.x),
      playerPy:   Math.floor(player.y),
      sbHotbar,
      sbHotbarSel,
      ruinedPortals: ruinedPortals
        ? [...ruinedPortals.values()].map(rp => ({
            anchorRow: rp.anchorRow, anchorCol: rp.anchorCol, activated: !!rp.activated,
          }))
        : [],
      endPortalAnchors: endPortalAnchors
        ? [...endPortalAnchors.values()].map(a => ({
            col: a.col, row: a.row, eyeCount: a.eyeCount, active: !!a.active,
          }))
        : [],
      dragonState: dragon ? {
        hp:    dragon.hp,
        x:     dragon.x,
        y:     dragon.y,
        state: dragon.state,
        fireballAttackDisabled: !!dragon.fireballAttackDisabled,
      } : null,
      crystalStates: endCrystals
        ? endCrystals.map(c => ({ col: c.col, row: c.row, destroyed: !!c.destroyed }))
        : null,
      dragonDefeated: !!dragonDefeated,
      mobDropSettings:  mobDropSettings  ? JSON.parse(JSON.stringify(mobDropSettings))  : null,
      worldAdvSettings: worldAdvSettings ? JSON.parse(JSON.stringify(worldAdvSettings)) : null,
      collectedDiscs:   collectedDiscs   ? [...collectedDiscs]                           : [],
      musicPlayerBlocks: musicPlayerBlocks
        ? [...musicPlayerBlocks.values()].map(mp => ({
            col: mp.col, row: mp.row,
            isConfigured: !!mp.isConfigured,
            configuredSongs: mp.configuredSongs ? [...mp.configuredSongs] : [],
          }))
        : [],
      witherAltars: witherAltars
        ? witherAltars.map(a => ({
            anchorRow: a.anchorRow, anchorCol: a.anchorCol,
            skulls: [...a.skulls], sand: [...a.sand],
          }))
        : [],
    };

    const k = this.key(playerName, worldName);
    try {
      localStorage.setItem(k, JSON.stringify(payload));
      return { ok: true };
    } catch (e) {
      const msg = e.name === 'QuotaExceededError'
        ? 'Storage full — free up space and try again'
        : e.message;
      return { ok: false, error: msg };
    }
  },

  // Load and parse a save by key.  Returns parsed object or null.
  load(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  },

  // Delete a save by key.
  remove(key) {
    localStorage.removeItem(key);
  },

  // Count spawnEggs from a saved world (for display in menus)
  eggCount(key) {
    try {
      const data = JSON.parse(localStorage.getItem(key) || 'null');
      return Array.isArray(data?.spawnEggs) ? data.spawnEggs.length : 0;
    } catch (_) { return 0; }
  },

  // Format an ISO date string for display (e.g. "Apr 21 2026, 12:00")
  formatDate(iso) {
    if (!iso) return 'Unknown date';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
           + ', ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } catch (_) {
      return iso.slice(0, 10);
    }
  },
};

// ============================================================
// NormalProgress — per-world player progress for sandbox worlds
//                  played in Normal mode
// ============================================================

const PROGRESS_PREFIX = 'nwprogress|';

const NormalProgress = {
  key(sandboxKey) { return PROGRESS_PREFIX + sandboxKey; },

  save(sandboxKey, player, bedPos = null, levelGrid = null, collectedItemKeys = null, chestsMap = null, dayNight = null, twoPlayerMode = false, collectedDiscs = null, redstoneState = null, droppedItems = null, liveMobs = null) {
    const payload = {
      savedAt:     new Date().toISOString(),
      twoPlayerMode: !!twoPlayerMode,
      hp:          player.hp,
      xp:          player.xp,
      level:       player.level,
      selectedSlot: player.selectedSlot,
      hotbar:        player.hotbar.map(s => s ? { type: s.type, count: s.count, armorKey: s.armorKey } : null),
      inventory:     player.inventory.map(s => s ? { type: s.type, count: s.count, armorKey: s.armorKey } : null),
      equippedArmor: { ...player.equippedArmor },
      // Weapons: active tools + full collection (Smart Mobs §2) so collected
      // weapons survive leave→continue, not just the active one.
      pickaxe:       player.pickaxe,
      sword:         player.sword,
      bow:           player.bow,
      meleeOwned:    Array.isArray(player.meleeOwned)  ? [...player.meleeOwned]  : undefined,
      meleeIndex:    player.meleeIndex,
      rangedOwned:   Array.isArray(player.rangedOwned) ? [...player.rangedOwned] : undefined,
      rangedIndex:   player.rangedIndex,
      hasShield:     !!player.hasShield,
      px:          Math.floor(player.x),
      py:          Math.floor(player.y),
      bedCol:      bedPos ? bedPos.col : null,
      bedRow:      bedPos ? bedPos.row : null,
      gridSnapshot:    levelGrid ? levelGrid.map(row => Array.from(row)) : null,
      collectedItems:  collectedItemKeys || [],
      hasFlintSteel:   !!player.hasFlintSteel,
      hasGrapple:      !!player.hasGrapple,
      discoveredOres:  [...player.discoveredOres],
      chests: chestsMap
        ? [...chestsMap.values()].map(ch => ({
            col: ch.col, row: ch.row,
            items: ch.items.map(it => it || null),
          }))
        : null,
      dayNight: dayNight ? {
        isDay:      dayNight.isDay,
        nightPhase: dayNight.nightPhase,
        timer:      dayNight.timer,
        halfCycleMs: dayNight.halfCycleMs,
      } : null,
      collectedDiscs: collectedDiscs ? [...collectedDiscs] : [],
      // Runtime redstone device states (levers/dust/gates/wireless), so a world
      // played in Normal mode keeps its wiring state across leave/re-enter.
      redstoneState: redstoneState || null,
      // Live ground item drops (mob loot, broken-block drops) not yet picked up.
      droppedItems: Array.isArray(droppedItems) ? droppedItems : [],
      // Live mobs alive at save time — restored on re-entry instead of respawned.
      liveMobs: Array.isArray(liveMobs) ? liveMobs : [],
    };
    try {
      localStorage.setItem(this.key(sandboxKey), JSON.stringify(payload));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  load(sandboxKey) {
    try {
      const raw = localStorage.getItem(this.key(sandboxKey));
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  },

  remove(sandboxKey) {
    localStorage.removeItem(this.key(sandboxKey));
  },

  exists(sandboxKey) {
    return localStorage.getItem(this.key(sandboxKey)) !== null;
  },
};
