// ============================================================
// emerald-system.js — Arena emerald collectibles (Phase 3A.2 → 3A.3)
//
// Built at arena start from the designed world's `emeralds` (saved world_data).
// Pickup is AABB overlap with the player hitbox (player.x/y/width/height — there
// is no player.health field). Drawn inside the arena zoom context via the shared
// _drawEmeraldIcon (sandbox.js). Score is awarded by the caller's onCollect hook.
//
// Phase 3A.3 — emerald GROUPS + ROUNDS. The designer tags each emerald with a
// group (1–3, default 1). The player picks a round count (1–6). The system cycles
// through the created groups across rounds: round r shows group
// createdGroups[(r-1) % createdGroups.length]. When a round's group is fully
// collected, the next round's group appears (its emeralds respawn). Win = the
// final round's group fully collected. `collected` is cumulative across rounds.
// ============================================================

const EMERALD_SYSTEM = {
  groups: {},        // groupNum -> [{ wx, wy, collected }]
  createdGroups: [], // sorted list of group numbers that actually have emeralds
  totalRounds: 1,
  currentRound: 1,   // 1-based
  activeGroup: 1,
  collected: 0,      // cumulative across all rounds
  total: 0,          // total emeralds that will appear across all rounds

  // game._arenaTemplateData.emeralds is the saved layout (arena skips _loadSandboxWorld).
  // Round count comes from the pre-launch config (arenaConfig.emeraldRounds), default 1.
  init(game) {
    // Source is the arena template (arena mode) OR the loaded level's emeralds
    // (platformer campaign-prep — game._levelEmeralds set by _loadPlatformerWorld).
    const src = (game && game._arenaTemplateData && Array.isArray(game._arenaTemplateData.emeralds))
      ? game._arenaTemplateData.emeralds
      : (game && Array.isArray(game._levelEmeralds) ? game._levelEmeralds : []);

    this.groups = {};
    for (const e of src) {
      if (!e || typeof e.col !== 'number' || typeof e.row !== 'number') continue;
      const g = (e.group >= 1 && e.group <= 3) ? e.group : 1;
      (this.groups[g] = this.groups[g] || []).push({
        wx: e.col * BLOCK_SIZE + BLOCK_SIZE / 2,
        wy: e.row * BLOCK_SIZE + BLOCK_SIZE / 2,
        collected: false,
      });
    }
    this.createdGroups = Object.keys(this.groups).map(Number).sort((a, b) => a - b);

    this.totalRounds = Math.max(1, Math.min(6, (game && game.arenaConfig && game.arenaConfig.emeraldRounds) || 1));
    this.currentRound = 1;
    this.collected = 0;

    // Total emeralds across all rounds = sum of each round's mapped group size.
    this.total = 0;
    for (let r = 1; r <= this.totalRounds; r++) {
      const g = this._groupForRound(r);
      this.total += (this.groups[g] ? this.groups[g].length : 0);
    }

    this._activateRound(1);
  },

  _groupForRound(roundNum) {
    if (this.createdGroups.length === 0) return 1;
    return this.createdGroups[(roundNum - 1) % this.createdGroups.length];
  },

  // Make `roundNum`'s group the live set (fresh, uncollected).
  _activateRound(roundNum) {
    this.currentRound = roundNum;
    this.activeGroup = this._groupForRound(roundNum);
    const live = this.groups[this.activeGroup] || [];
    for (const e of live) e.collected = false;
  },

  _activeEmeralds() { return this.groups[this.activeGroup] || []; },

  reset() {
    this.groups = {}; this.createdGroups = [];
    this.totalRounds = 1; this.currentRound = 1; this.activeGroup = 1;
    this.collected = 0; this.total = 0;
  },

  // AABB overlap vs the player; calls onCollect() per emerald taken. Advances to
  // the next round when the active group is cleared and rounds remain. Returns the
  // count collected this call. Emerald sprite ≈ 18×24 centered at (wx, wy).
  checkPickup(player, onCollect) {
    if (!player) return 0;
    let n = 0;
    const px = player.x, py = player.y, pw = player.width || PLAYER_W, ph = player.height || PLAYER_H;
    const live = this._activeEmeralds();
    for (const e of live) {
      if (e.collected) continue;
      if (px < e.wx + 10 && px + pw > e.wx - 10 && py < e.wy + 13 && py + ph > e.wy - 13) {
        e.collected = true;
        this.collected++;
        n++;
        if (onCollect) onCollect(e);
      }
    }
    // Round complete → advance (next round's group respawns).
    if (n > 0 && this._roundCleared() && this.currentRound < this.totalRounds) {
      this._activateRound(this.currentRound + 1);
    }
    return n;
  },

  _roundCleared() {
    const live = this._activeEmeralds();
    return live.length > 0 && live.every(e => e.collected);
  },

  // Win once the final round's group is cleared.
  allRoundsComplete() {
    return this.total > 0 && this.currentRound >= this.totalRounds && this._roundCleared();
  },

  remaining() { return this.total - this.collected; },

  hudText() {
    const roundPart = this.totalRounds > 1 ? `  Round ${this.currentRound}/${this.totalRounds}` : '';
    return `Emeralds: ${this.collected}/${this.total}${roundPart}`;
  },

  draw(ctx, camera, frameCount) {
    for (const e of this._activeEmeralds()) {
      if (e.collected) continue;
      const sx = e.wx - camera.x, sy = e.wy - camera.y;
      if (sx < camera.viewMinX() - 40 || sx > camera.viewMaxX() + 40 || sy < camera.viewMinY() - 40 || sy > camera.viewMaxY() + 40) continue;
      _drawEmeraldIcon(ctx, sx, sy, frameCount, false);
    }
  },
};

if (typeof window !== 'undefined') window.EMERALD_SYSTEM = EMERALD_SYSTEM;
