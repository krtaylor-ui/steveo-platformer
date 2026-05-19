// ============================================================
// save-migrations.js — Save format version detection + migration
// Phase 16-D: Automatic v1→v2 conversion for world saves
//
// v1 (server/legacy): sparse blocks object {"col,row": blockId},
//                     multiplierSettings, worldId/name fields
// v2 (current):       dense 2D grid[row][col], worldAdvSettings,
//                     worldName/playerName/savedAt fields
// ============================================================

const SaveMigrations = (function () {

  const SAVE_FORMAT_VERSION = 2;
  const GRID_ROWS = 60;   // WORLD_H
  const GRID_COLS = 650;  // WORLD_W

  // BLOCK_SIZE is 32px — defined in constants.js (loaded before this file).
  // Fallback keeps this module usable outside the browser (e.g. unit tests).
  const _BLOCK_SIZE = (typeof BLOCK_SIZE !== 'undefined') ? BLOCK_SIZE : 32;

  // ── Overlay / virtual block IDs ────────────────────────────────
  // Block ID 33 is redstone dust.  It is NOT in the BLOCK constant object
  // (see blocks.js: "Pseudo-block … never stored in level grid") and must
  // be stored in the dustBlocks overlay array, not the 2D grid.
  const REDSTONE_DUST_ID = 33;

  // Palette-only virtual block IDs that must never be placed in the grid
  // or in any overlay array.  They only appear in hotbar/palette UI state.
  //   37 → Ruined Portal tool
  //   43 → End Portal tool
  //   56 → Wither Altar tool
  const VIRTUAL_PALETTE_IDS = new Set([37, 43, 56]);

  // ── Helpers ───────────────────────────────────────────────────

  function createEmptyGrid() {
    return Array.from({ length: GRID_ROWS }, () => new Array(GRID_COLS).fill(0));
  }

  function createDefaultWorldAdvSettings() {
    return {
      disableDragonHealing:     false,
      dayCycleMinutes:          10,
      nightSpawnBoost:          true,
      fullMoonHpBoost:          true,
      unlimitedArrows:          false,
      controllerSensitivity:    1.0,
      controllerAimSensitivity: 1.0,
      twoPlayerMode:            false,
      disableXpSpeedBoost:      false,
      musicVolume:              0.5,
      sfxVolume:                0.5,
      bossHealthMultiplier:     1.0,
      bossDamageMultiplier:     1.0,
      bossAttackRateMultiplier: 1.0,
      chatDisabled:             false,
    };
  }

  // ── Version detection ─────────────────────────────────────────

  // Returns 1 (sparse blocks, no grid), 2 (has grid), or 0 (unknown).
  function detectSaveVersion(saveData) {
    if (!saveData || typeof saveData !== 'object') return 0;
    if (saveData.saveVersion === 2) return 2;
    if (Array.isArray(saveData.grid) && saveData.grid.length > 0) return 2;
    if (saveData.blocks && typeof saveData.blocks === 'object') return 1;
    return 0;
  }

  // ── v1 → v2 migration ─────────────────────────────────────────

  function migrateV1toV2(v1Data) {
    const grid         = createEmptyGrid();
    const dustBlocks   = [];
    let   dustCount    = 0;

    // ── Expand sparse blocks map → dense 2D grid + overlays ──────
    // Key format: "col,row"  (x axis first, y axis second)
    const blocks = v1Data.blocks || {};
    for (const key in blocks) {
      const comma = key.indexOf(',');
      if (comma === -1) continue;
      const col     = parseInt(key.slice(0, comma), 10);
      const row     = parseInt(key.slice(comma + 1), 10);
      const blockId = blocks[key];

      // Skip virtual palette-only IDs — they have no world representation
      if (VIRTUAL_PALETTE_IDS.has(blockId)) continue;

      if (row < 0 || row >= GRID_ROWS || col < 0 || col >= GRID_COLS) continue;

      if (blockId === REDSTONE_DUST_ID) {
        // Redstone dust is an overlay block — it never lives in the 2D grid.
        // Route it to the dustBlocks overlay array so the game restores it.
        dustBlocks.push({
          col, row,
          on:            false,
          everTriggered: false,
          setting:       'always_show',
        });
        dustCount++;
      } else {
        grid[row][col] = blockId;
      }
    }

    // ── Convert v1 server items → v2 placedItems ─────────────────
    // v1 items:  {type, x, y}  — pixel coordinates, dropped during multiplayer
    // v2 placedItems: {col, row, wx, wy, blockType, count} — grid coordinates
    const placedItems = [];
    const v1Items = Array.isArray(v1Data.items) ? v1Data.items : [];
    for (const item of v1Items) {
      if (typeof item.x !== 'number' || typeof item.y !== 'number') continue;
      const blockType = typeof item.type === 'number' ? item.type : null;
      if (blockType === null) continue;
      const col = Math.floor(item.x / _BLOCK_SIZE);
      const row = Math.floor(item.y / _BLOCK_SIZE);
      if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) continue;
      placedItems.push({
        col, row,
        wx:        col * _BLOCK_SIZE + _BLOCK_SIZE / 2,
        wy:        row * _BLOCK_SIZE + _BLOCK_SIZE / 2,
        toolKey:   null,
        blockType,
        count:     1,
      });
    }

    // ── Build worldAdvSettings from multiplierSettings + defaults ─
    const defaults = createDefaultWorldAdvSettings();
    const mult     = v1Data.multiplierSettings || {};
    const worldAdvSettings = {
      ...defaults,
      bossHealthMultiplier:     mult.bossHealthMultiplier     ?? defaults.bossHealthMultiplier,
      bossDamageMultiplier:     mult.bossDamageMultiplier     ?? defaults.bossDamageMultiplier,
      bossAttackRateMultiplier: mult.bossAttackRateMultiplier ?? defaults.bossAttackRateMultiplier,
    };

    const worldName  = v1Data.worldName  || v1Data.name || v1Data.worldId || 'Imported World';
    const playerName = v1Data.playerName || 'Server';

    const blockCount = Object.keys(blocks).length;
    const result = {
      saveVersion:       SAVE_FORMAT_VERSION,
      playerName,
      worldName,
      savedAt:           v1Data.savedAt || new Date().toISOString(),
      grid,
      spawnEggs:         v1Data.spawnEggs         || [],
      // Prefer existing placedItems from v1Data if it already had them;
      // fall back to items converted from v1 multiplayer drops.
      placedItems:       v1Data.placedItems        || placedItems,
      portalLinks:       v1Data.portalLinks        || [],
      sandboxLevers:     v1Data.sandboxLevers      || [],
      sandboxTrapdoors:  v1Data.sandboxTrapdoors   || [],
      sandboxPistons:    v1Data.sandboxPistons     || [],
      // Prefer existing dustBlocks; fall back to what was extracted from blocks map.
      dustBlocks:        v1Data.dustBlocks         || dustBlocks,
      transmitters:      v1Data.transmitters       || [],
      receivers:         v1Data.receivers          || [],
      gateBlocks:        v1Data.gateBlocks         || [],
      chests:            v1Data.chests             || [],
      playerPx:          v1Data.playerPx           || 0,
      playerPy:          v1Data.playerPy           || 0,
      sbHotbar:          v1Data.sbHotbar           || Array(8).fill(null),
      sbHotbarSel:       v1Data.sbHotbarSel        || 0,
      ruinedPortals:     v1Data.ruinedPortals      || [],
      endPortalAnchors:  v1Data.endPortalAnchors   || [],
      dragonState:       v1Data.dragonState        || null,
      crystalStates:     v1Data.crystalStates      || null,
      dragonDefeated:    v1Data.dragonDefeated     || false,
      mobDropSettings:   v1Data.mobDropSettings    || null,
      worldAdvSettings,
      collectedDiscs:    v1Data.collectedDiscs     || [],
      musicPlayerBlocks: v1Data.musicPlayerBlocks  || [],
      witherAltars:      v1Data.witherAltars       || [],
    };

    console.log(
      `[SaveMigrations] v1→v2 "${worldName}": ` +
      `${blockCount} blocks → grid, ` +
      `${dustCount} dust → dustBlocks`
    );
    console.log(
      `[SaveMigrations]   levers=${result.sandboxLevers.length}` +
      ` trapdoors=${result.sandboxTrapdoors.length}` +
      ` pistons=${result.sandboxPistons.length}` +
      ` transmitters=${result.transmitters.length}` +
      ` receivers=${result.receivers.length}` +
      ` gates=${result.gateBlocks.length}`
    );
    console.log(
      `[SaveMigrations]   placedItems=${result.placedItems.length}` +
      ` spawnEggs=${result.spawnEggs.length}` +
      ` chests=${result.chests.length}` +
      ` musicPlayerBlocks=${result.musicPlayerBlocks.length}` +
      ` witherAltars=${result.witherAltars.length}`
    );
    return result;
  }

  // ── Public API ────────────────────────────────────────────────

  // Main entry point — detects version and runs any needed migrations.
  // Returns the (possibly migrated) save data, or the original if no migration needed.
  function migrateSave(saveData) {
    if (!saveData || typeof saveData !== 'object') return saveData;
    const version = detectSaveVersion(saveData);
    if (version === 1) return migrateV1toV2(saveData);
    if (version === 2) {
      if (!saveData.saveVersion) saveData.saveVersion = SAVE_FORMAT_VERSION;
      const name = saveData.worldName || '(unknown)';
      console.log(
        `[SaveMigrations] v2 "${name}" (no migration needed):` +
        ` dust=${(saveData.dustBlocks||[]).length}` +
        ` levers=${(saveData.sandboxLevers||[]).length}` +
        ` pistons=${(saveData.sandboxPistons||[]).length}` +
        ` trapdoors=${(saveData.sandboxTrapdoors||[]).length}` +
        ` transmitters=${(saveData.transmitters||[]).length}` +
        ` receivers=${(saveData.receivers||[]).length}` +
        ` placedItems=${(saveData.placedItems||[]).length}` +
        ` spawnEggs=${(saveData.spawnEggs||[]).length}` +
        ` chests=${(saveData.chests||[]).length}`
      );
    }
    return saveData;
  }

  // Returns { ok: true } or { ok: false, error: string }.
  function validateSaveData(saveData) {
    if (!saveData || typeof saveData !== 'object')
      return { ok: false, error: 'Save data is null or not an object' };
    if (!Array.isArray(saveData.grid))
      return { ok: false, error: 'Missing grid array' };
    if (saveData.grid.length === 0)
      return { ok: false, error: 'Grid is empty' };
    if (!Array.isArray(saveData.grid[0]))
      return { ok: false, error: 'Grid rows must be arrays' };
    return { ok: true };
  }

  return {
    SAVE_FORMAT_VERSION,
    GRID_ROWS,
    GRID_COLS,
    REDSTONE_DUST_ID,
    VIRTUAL_PALETTE_IDS,
    detectSaveVersion,
    migrateV1toV2,
    migrateSave,
    validateSaveData,
    createEmptyGrid,
    createDefaultWorldAdvSettings,
  };
})();
