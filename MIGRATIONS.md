# Save Format Migration Guide

## Overview

Steveo Platformer uses versioned save files for world persistence.
`js/save-migrations.js` (browser) and `server-multiplayer.js` (server) handle
automatic detection and upgrade of old files so no data is lost.

---

## Format History

### v1 — Server/Legacy (no `saveVersion` field)

Used by the multiplayer server and early exports. Identified by the presence of a
`blocks` object and the absence of a `grid` array.

```json
{
  "worldId":   "My World",
  "name":      "My World",
  "mode":      "sandbox",
  "maxPlayers": 4,
  "blocks": {
    "285,0": 6,
    "300,0": 21
  },
  "items": [],
  "multiplierSettings": {
    "bossHealthMultiplier":     1,
    "bossDamageMultiplier":     1,
    "bossAttackRateMultiplier": 1
  },
  "playerCount": 0
}
```

**Detection rule:** `blocks` is an object AND `grid` is absent.

**Key format:** `"col,row"` — x axis first, y axis second.

---

### v2 — Current Client Format (`saveVersion: 2`)

Used by `SandboxSaves` (localStorage) and all saves written after Phase 16-D.
Identified by `Array.isArray(data.grid)` or `saveVersion === 2`.

```json
{
  "saveVersion":  2,
  "playerName":   "Kevin",
  "worldName":    "My World",
  "savedAt":      "2026-05-16T00:00:00.000Z",
  "grid":         [[0, 0, ...], [6, 6, ...]],
  "worldAdvSettings": {
    "disableDragonHealing":     false,
    "dayCycleMinutes":          10,
    "nightSpawnBoost":          true,
    "fullMoonHpBoost":          true,
    "unlimitedArrows":          false,
    "controllerSensitivity":    1.0,
    "controllerAimSensitivity": 1.0,
    "twoPlayerMode":            false,
    "disableXpSpeedBoost":      false,
    "musicVolume":              0.5,
    "sfxVolume":                0.5,
    "bossHealthMultiplier":     1.0,
    "bossDamageMultiplier":     1.0,
    "bossAttackRateMultiplier": 1.0,
    "chatDisabled":             false
  },
  "spawnEggs":        [],
  "placedItems":      [],
  "portalLinks":      [],
  "sandboxLevers":    [],
  "sandboxTrapdoors": [],
  "sandboxPistons":   [],
  "dustBlocks":       [],
  "transmitters":     [],
  "receivers":        [],
  "gateBlocks":       [],
  "chests":           [],
  "playerPx":         0,
  "playerPy":         0,
  "sbHotbar":         [null, null, null, null, null, null, null, null],
  "sbHotbarSel":      0,
  "ruinedPortals":    [],
  "endPortalAnchors": [],
  "dragonState":      null,
  "crystalStates":    null,
  "dragonDefeated":   false,
  "mobDropSettings":  null,
  "collectedDiscs":   [],
  "musicPlayerBlocks": [],
  "witherAltars":     []
}
```

**Grid layout:** `grid[row][col]` — row 0 is the top, col 0 is the left.
Dimensions: **60 rows × 650 cols** (WORLD_H × WORLD_W).

---

## Migration Path

```
v1 (sparse blocks)  →  v2 (dense grid)
```

### v1 → v2 Conversion Steps

1. Allocate a 60×650 zero grid.
2. For each `"col,row": blockId` entry in `blocks`:
   - Parse col, row as integers.
   - If `blockId` is a **virtual palette ID** (37, 43, or 56): skip — these are
     UI-only icons with no world representation.
   - If `blockId === 33` (**Redstone Dust**): add to `dustBlocks` overlay array
     with `{col, row, on: false, everTriggered: false, setting: "always_show"}`.
     Dust is an overlay block — it is *never* stored in the 2D grid.
   - Otherwise: set `grid[row][col] = blockId`.
3. For each entry in v1 `items` (multiplayer dropped items with pixel coords):
   - Convert pixel coords `{x, y}` → grid coords:
     `col = floor(x / 32)`, `row = floor(y / 32)`
   - Build a v2 `placedItems` entry:
     `{col, row, wx, wy, toolKey: null, blockType: item.type, count: 1}`
   - Skip items with no numeric `type` or out-of-bounds coords.
4. Build `worldAdvSettings` from `multiplierSettings` (boss multipliers) merged
   with all v2 defaults for new fields.
5. Copy `name`/`worldId` → `worldName`; set `playerName` to `"Server"` if absent.
6. Fill all optional arrays (`spawnEggs`, `chests`, etc.) with `[]` if absent.
7. Set `saveVersion: 2` and `savedAt` (current timestamp if absent).

### Special Block Handling

| Block ID | Name | Handling |
|---|---|---|
| 33 | Redstone Dust | Overlay-only → `dustBlocks` array (not grid) |
| 37 | Ruined Portal (tool) | Virtual palette icon → skip entirely |
| 43 | End Portal (tool) | Virtual palette icon → skip entirely |
| 56 | Wither Altar (tool) | Virtual palette icon → skip entirely |

All other block IDs go into `grid[row][col]` normally.

**Why dust can't be in the grid:** `blocks.js` explicitly marks block 33 as
`"Pseudo-block used for palette/hotbar display only — never stored in level grid"`.
The game populates `_dustBlocks` from `data.dustBlocks`, not from the grid.
Placing ID 33 in the grid would be silently ignored by the renderer.

---

## Where Migration Runs

| Location | Trigger |
|---|---|
| `js/save-migrations.js` | Loaded in browser; `SaveMigrations.migrateSave(data)` |
| `game.js _loadSandboxWorld()` | On sandbox world load |
| `game.js _loadNormalWorld()` | On normal-mode world load |
| `game.js _loadPlatformerWorld()` | On platformer level load |
| `menu.js _importWorldFromMenu()` | On file import |
| `server-multiplayer.js batchConvertOldSaves()` | Server startup |

---

## Default Values for New Fields (v1 → v2)

| Field | Default |
|---|---|
| `dayCycleMinutes` | `10` |
| `nightSpawnBoost` | `true` |
| `fullMoonHpBoost` | `true` |
| `unlimitedArrows` | `false` |
| `controllerSensitivity` | `1.0` |
| `controllerAimSensitivity` | `1.0` |
| `twoPlayerMode` | `false` |
| `disableXpSpeedBoost` | `false` |
| `musicVolume` | `0.5` |
| `sfxVolume` | `0.5` |
| `chatDisabled` | `false` |

Boss multipliers (`bossHealthMultiplier`, `bossDamageMultiplier`,
`bossAttackRateMultiplier`) are copied from `multiplierSettings` if present,
defaulting to `1.0`.

---

## Adding a Future v3 Format

1. Add `migrateV2toV3(data)` in `js/save-migrations.js`.
2. Update `detectSaveVersion` to return `3` for the new format.
3. Update `migrateSave` to chain: v1→v2→v3.
4. Bump `SAVE_FORMAT_VERSION = 3`.
5. Update `batchConvertOldSaves` in `server-multiplayer.js` to detect and convert v2 files.
6. Add an entry to this file documenting the new format and migration steps.

---

## Server Batch Conversion

`batchConvertOldSaves()` runs automatically on server startup:

- Scans all `.json` files in the `saves/` directory.
- Skips files that already have `saveVersion: 2`.
- Creates a `.bak.json` backup before overwriting.
- Adds `worldAdvSettings` (from `multiplierSettings`), `savedAt`, and `saveVersion: 2`.
- Logs results: converted / skipped / failed counts.

---

## Phase 3 — Supabase migrations (run in the SQL editor before deploy)

Two additive SQL files (safe to re-run; use `IF NOT EXISTS`):

### `server/sql/community.sql` — Community Browse + publishing polish
- Adds to `worlds`: `published_at`, `genre`, `difficulty`, `download_count`,
  `rating_sum`, `rating_count`, `original_author` + a published index.
- Creates `world_favorites` (unique user+world) and `world_ratings` (1–5 stars, unique user+world).
- **Required before deploying** the updated publish route (it now stamps `published_at`) and the
  `/api/community/*` routes (browse/favorite/rate/download).

### `server/sql/stats.sql` — Achievements + analytics + per-world/PB leaderboards
- Adds `world_id` to `arena_results` (+ per-world and per-player indexes) for per-world speedrun/PvP
  leaderboards and personal-best queries. Existing global leaderboards keep working (`world_id` NULL).
- Creates `player_stats` (matches/wins/kills/deaths/ctf_captures/worlds_published/play_time) and
  `player_achievements` (unique player+achievement). Backs `/api/stats/*`.

Both are safe to run on an existing DB; nothing is dropped. If they are NOT run, the new endpoints
return 500s but the rest of the game is unaffected (features degrade, don't crash).

### `server/sql/custom_rules.sql` — saved Custom Rules configs (Phase 3 v3)
- Creates `custom_rules` (id, user_id, name, config jsonb, created_at) for the
  "save to profile" feature (up to 10 per user, enforced in the route layer).
- Backs `GET/POST/DELETE /api/custom-rules`. Recent-3 and export/import work
  without it (localStorage + file); only the profile save/load needs this table.
- Safe to run on an existing DB.
