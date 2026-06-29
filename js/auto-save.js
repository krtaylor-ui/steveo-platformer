// ============================================================
// auto-save.js — Periodic game state persistence to API
// ============================================================

const AUTO_SAVE = {
  gameId:        null,
  saveFrequency: 10000, // ms
  _interval:     null,
  _isSaving:     false,
  _lastHash:     null,
  lastSaveTime:  null,

  // ════════════════════════════════════════════════════════════
  // START: Begin auto-save loop
  // ════════════════════════════════════════════════════════════
  start(gameId) {
    // Clear any existing interval WITHOUT triggering stop()'s final save:
    // by the time start() runs, window.game is already the NEW game, but
    // this.gameId still points at the PREVIOUS game — a save here would write
    // the new world into the old slot (cross-contaminating worlds). The
    // legitimate final save of the outgoing game happens in the exit flow,
    // before the new Game is constructed.
    if (this._interval) { clearInterval(this._interval); this._interval = null; }
    this.gameId    = gameId;
    this._lastHash = null;
    this._isSaving = false;
    this._interval = setInterval(() => this.save(), this.saveFrequency);
    console.log('[AutoSave] Started — saving every', this.saveFrequency / 1000, 's');
  },

  // ════════════════════════════════════════════════════════════
  // SAVE: Serialize current state and PUT to API
  // ════════════════════════════════════════════════════════════
  async save() {
    if (this._isSaving || !this.gameId || !window.game) return;

    try {
      this._isSaving = true;
      this._setIndicator('saving');

      const gameData = GAME_STATE.serialize(window.game);
      if (!gameData) return;

      // Skip save if player hasn't moved since last save
      const hash = JSON.stringify(gameData.playerProgress);
      if (hash === this._lastHash) {
        this._setIndicator('saved');
        return;
      }

      const response = await AUTH.authedFetch(`/api/games/${this.gameId}/save`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameData }),
      });

      if (response.ok) {
        this._lastHash   = hash;
        this.lastSaveTime = new Date();
        this._setIndicator('saved');
        console.log('[AutoSave] Saved at', this.lastSaveTime.toLocaleTimeString());
      } else {
        const err = await response.json().catch(() => ({}));
        console.warn('[AutoSave] Save failed:', err);
        this._setIndicator('error');
      }
    } catch (e) {
      console.error('[AutoSave] Error:', e);
      this._setIndicator('error');
    } finally {
      this._isSaving = false;
    }
  },

  // ════════════════════════════════════════════════════════════
  // STOP: Clear interval and trigger one final save
  // ════════════════════════════════════════════════════════════
  stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
    // Best-effort final save (fire and forget — caller may await if needed)
    if (this.gameId && window.game) this.save();
    console.log('[AutoSave] Stopped');
  },

  // ════════════════════════════════════════════════════════════
  // INDICATOR: Update save status in the play HUD
  // ════════════════════════════════════════════════════════════
  _setIndicator(state) {
    const el = document.getElementById('save-indicator');
    if (!el) return;

    if (state === 'saving') {
      el.textContent = 'Saving...';
      el.className   = 'save-indicator saving';
    } else if (state === 'saved') {
      el.textContent = this.lastSaveTime
        ? `Saved ${this.lastSaveTime.toLocaleTimeString()}`
        : 'Saved';
      el.className   = 'save-indicator saved';
    } else {
      el.textContent = 'Save failed';
      el.className   = 'save-indicator error';
    }
  },
};
