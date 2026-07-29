// ══════════════════════════════════════════════════════════════════════════
// Campaign playthrough runtime (MVP). Owns a campaign run: boots each World as a
// Platformer Game (via templateData), listens for the win/death hooks the Game
// fires (game._campaign context), routes coloured Goal-Star exits to the next
// World with CAMPAIGN_MODEL.resolveExit, carries inventory forward per
// resetInventoryAt, tracks best-ever score per World, and persists progress.
//
// Carry-over model (§7):
//   • Inventory / owned weapons — true carry (restored onto the fresh player).
//   • Score — best-ever per World (completedWorlds[id].bestScore); total = sum.
//   • Emeralds / points / lives — running accumulators in progress.
//   • Health — always resets each World (a fresh Game).
//   NOTE (MVP simplification, flagged): running emeralds/points are tracked in
//   progress + shown on the tracker; they are not re-injected into a level's own
//   emerald counter (that stays level-local). resetInventoryAt clears carry +
//   running totals at world / zone boundaries.
//
// Progress persists via CAMPAIGN_API.saveProgress at each transition/death/exit —
// the campaign-mode equivalent of the in-level autosave trigger.
// ══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';
  const M = () => window.CAMPAIGN_MODEL;

  const CAMPAIGN_PLAY = {
    _campaign: null,
    _progress: null,
    _carry: null,

    _now() { return new Date().toISOString(); },

    _freshProgress(c) {
      const startW = M().getWorld(c, c.startingWorldId);
      return {
        campaignId:        c.id,
        currentWorldId:    c.startingWorldId,
        currentZoneId:     (startW && startW.zoneId) || c.zoneOrder[0] || null,
        completedWorlds:   {},
        discoveredSecrets: [],
        runningInventory:  null,
        runningEmeralds:   0,
        runningPoints:     0,
        lives:             c.startingLives != null ? c.startingLives : 3,
      };
    },

    // Begin (or continue) a campaign. progress = null → fresh run.
    async start(campaign, progress) {
      this._campaign = campaign;
      this._progress = progress || this._freshProgress(campaign);
      this._progress.completedWorlds = this._progress.completedWorlds || {};
      this._progress.discoveredSecrets = this._progress.discoveredSecrets || [];
      if (this._progress.lives == null) this._progress.lives = campaign.startingLives != null ? campaign.startingLives : 3;
      this._carry = this._progress.runningInventory || null;

      let wid = this._progress.currentWorldId || campaign.startingWorldId;
      if (!M().getWorld(campaign, wid)) wid = campaign.startingWorldId;
      const w = M().getWorld(campaign, wid);
      if (!w) { alert('This campaign has no starting World yet.'); return; }
      this._progress.currentWorldId = wid;
      this._progress.currentZoneId = w.zoneId;
      const entry = M().defaultEntryPointId(w);
      await this._bootWorld(wid, entry);
    },

    // ── Boot a single World as a Platformer Game ──────────────────────────────
    async _bootWorld(worldId, entryPointId) {
      const c = this._campaign;
      const cw = M().getWorld(c, worldId);
      if (!cw) { this._endScreen('Error', 'World not found in this campaign.'); return; }
      let wd;
      try {
        const r = await CAMPAIGN_API.world(c.id, cw.sandboxWorldUid);
        wd = r.worldData;
      } catch (e) { this._endScreen('Could not load level', e.message); return; }
      if (typeof wd === 'string') { try { wd = JSON.parse(wd); } catch (e) { wd = {}; } }
      if (wd && typeof wd === 'object') wd = { ...wd, playerProgress: null };   // spawn at the design/entry point, not editor pos

      if (window.menu && typeof window.menu._stop === 'function') window.menu._stop();
      if (window.game && typeof window.game.destroy === 'function') window.game.destroy();
      this._hideScreens();

      const ctx = {
        onWin:   (g, color) => this.onWin(g, color),
        onDeath: (g) => this.onDeath(g),
        campaignId: c.id,
        worldLabel: c.worldLabel || 'World',
      };
      window.game = new Game('platformer', {
        world: 'adventure',
        templateData: wd,
        campaign: ctx,
        campaignCarry: this._carry,
        campaignEntry: { spawnPointId: entryPointId },
      }, () => this._exitToSelect());
    },

    // ── Win: record + route + advance ─────────────────────────────────────────
    onWin(game, exitColor) {
      const c = this._campaign, p = this._progress;
      const wid = p.currentWorldId;
      const snap = game.campaignSnapshot ? game.campaignSnapshot() : { score: 0, emeralds: 0 };

      const prevBest = (p.completedWorlds[wid] && p.completedWorlds[wid].bestScore) || 0;
      p.completedWorlds[wid] = { bestScore: Math.max(prevBest, snap.score || 0), completedAt: this._now() };
      p.runningEmeralds = (p.runningEmeralds || 0) + (snap.emeralds || 0);

      const prevWorld = M().getWorld(c, wid);
      const prevZone  = prevWorld ? prevWorld.zoneId : p.currentZoneId;
      const res = M().resolveExit(c, wid, exitColor);

      if (res.kind === 'campaign-complete') {
        p.currentWorldId = null; this._saveProgress();
        try { game.destroy(); } catch (e) {}
        this._completeScreen(); return;
      }
      if (res.kind === 'unrouted') {
        this._saveProgress();
        try { game.destroy(); } catch (e) {}
        this._endScreen('Level cleared', 'This exit doesn’t lead anywhere yet — the creator hasn’t routed it.', true);
        return;
      }

      const nextWorldId = res.worldId;
      const nextZoneId  = (res.kind === 'zone') ? res.zoneId : ((M().getWorld(c, nextWorldId) || {}).zoneId || prevZone);
      const entry = res.entryPointId;
      if (res.secret && !p.discoveredSecrets.includes(nextWorldId)) p.discoveredSecrets.push(nextWorldId);

      // Carry-over policy.
      const zoneChanged = nextZoneId !== prevZone;
      const reset = c.resetInventoryAt || 'never';
      let carry = snap;
      if (reset === 'per-world' || (reset === 'per-zone' && zoneChanged)) {
        carry = null;
        p.runningEmeralds = 0; p.runningPoints = 0;
      }
      this._carry = carry;
      p.runningInventory = carry;

      p.currentWorldId = nextWorldId;
      p.currentZoneId  = nextZoneId;
      this._saveProgress();
      try { game.destroy(); } catch (e) {}

      // Transition screen: advance the marker, then boot the next World.
      CAMPAIGN_TRACKER.open(c, p, nextZoneId, {
        mode: 'transition',
        onDone: () => this._bootWorld(nextWorldId, entry),
      });
    },

    // ── Death: costs a life; game-over when out ───────────────────────────────
    onDeath(game) {
      const p = this._progress;
      if ((p.lives || 0) <= 0) {
        this._saveProgress();
        try { game.destroy(); } catch (e) {}
        this._endScreen('Game Over', 'You ran out of lives.', true);
        return false;   // stop the in-world respawn
      }
      p.lives -= 1;
      this._saveProgress();
      return true;       // allow the normal respawn (health resets)
    },

    // On-demand tracker (pause menu → Campaign Progress).
    showProgress() {
      if (!this._campaign || !this._progress) return;
      CAMPAIGN_TRACKER.open(this._campaign, this._progress, this._progress.currentZoneId, { mode: 'pause', onDone: () => {} });
    },

    // ── Persistence ───────────────────────────────────────────────────────────
    _saveProgress() {
      if (!this._campaign || !this._progress) return;
      try {
        CAMPAIGN_API.saveProgress(this._campaign.id, this._progress).catch((e) => console.warn('progress save', e.message));
      } catch (e) { /* non-fatal */ }
    },

    // ── Screens ───────────────────────────────────────────────────────────────
    _hideScreens() {
      ['dashboard-screen', 'campaign-select-screen', 'game-selection-screen', 'arena-select-screen', 'sandbox-screen']
        .forEach((id) => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
      CAMPAIGN_TRACKER.close();
    },

    _exitToSelect() {
      try { if (window.game && window.game.destroy) window.game.destroy(); } catch (e) {}
      window.game = null;
      this._campaign = null; this._progress = null; this._carry = null;
      if (typeof CAMPAIGN_SELECT !== 'undefined' && CAMPAIGN_SELECT.init) CAMPAIGN_SELECT.init();
      else { const d = document.getElementById('dashboard-screen'); if (d) d.style.display = 'block'; }
    },

    _endOverlay() {
      let ov = document.getElementById('campaign-end-overlay');
      if (!ov) {
        ov = document.createElement('div'); ov.id = 'campaign-end-overlay';
        ov.style.cssText = 'position:fixed;inset:0;z-index:6200;display:none;align-items:center;justify-content:center;background:rgba(4,8,16,.88)';
        document.body.appendChild(ov);
      }
      return ov;
    },

    _endScreen(title, msg, offerRestart) {
      const ov = this._endOverlay();
      ov.innerHTML = `
        <div style="background:#121824;border:1px solid #2c3a54;border-radius:14px;padding:28px 32px;max-width:480px;text-align:center;color:#e8eef7">
          <h2 style="margin:0 0 8px;font-size:24px">${esc(title)}</h2>
          <p style="color:#9fb0cc;margin:0 0 20px">${esc(msg || '')}</p>
          <div style="display:flex;gap:10px;justify-content:center">
            ${offerRestart ? '<button id="ce-restart" style="background:#2e6f4e;border:1px solid #3f9a6c;color:#eafff0;border-radius:8px;padding:9px 18px;cursor:pointer">↻ Restart Campaign</button>' : ''}
            <button id="ce-back" style="background:#2b3548;border:1px solid #46557a;color:#dfe7f5;border-radius:8px;padding:9px 18px;cursor:pointer">← Campaigns</button>
          </div>
        </div>`;
      ov.style.display = 'flex';
      const c = this._campaign;
      const back = document.getElementById('ce-back');
      if (back) back.onclick = () => { ov.style.display = 'none'; this._exitToSelect(); };
      const rs = document.getElementById('ce-restart');
      if (rs) rs.onclick = () => { ov.style.display = 'none'; this._progress = this._freshProgress(c); this._carry = null; this._saveProgress(); this.start(c, this._progress); };
    },

    _completeScreen() {
      const c = this._campaign, p = this._progress;
      const total = Object.values(p.completedWorlds || {}).reduce((a, x) => a + (x.bestScore || 0), 0);
      const done = Object.keys(p.completedWorlds || {}).length;
      this._endScreen('🏆 Campaign Complete!',
        `You finished "${c.name}" — ${done} ${(c.worldLabel || 'World')}s cleared, total score ★ ${total}.`, true);
    },
  };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); }

  if (typeof window !== 'undefined') window.CAMPAIGN_PLAY = CAMPAIGN_PLAY;
})();
