// ============================================================
// local-worlds.js — Offline world storage (Phase 1b).
//
// The localStorage-backed provider for Sandbox worlds when APP_MODE.isLocal().
// It mirrors the SHAPE the server returns ({ id, world_name, description,
// is_published, created_at, world_data }) so the existing Sandbox UI works with
// only a small branch at each data call — the online path is untouched.
// world_data (incl. provenance) is exactly what GAME_STATE.serialize produces,
// so building/saving/reopening a world round-trips through the same code.
// ============================================================

const LOCAL_WORLDS = {
  KEY: 'steveo_local_worlds',
  PAGE_SIZE: 12,
  MODE_OF: { normal: 'NRM', platformer: 'PLT', speedrunner: 'RUN', arena: 'ARN' },

  _all() { try { return JSON.parse(localStorage.getItem(this.KEY) || '{}'); } catch (e) { return {}; } },
  _persist(map) {
    try { localStorage.setItem(this.KEY, JSON.stringify(map)); return true; }
    catch (e) { alert('Local storage is full — could not save the world.'); return false; }
  },
  _uid() { return 'lw-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7); },

  // Paginated list mirroring GET /api/worlds/sandbox.
  list({ page = 0, filter = 'all', sort = 'newest' } = {}) {
    let arr = Object.values(this._all());
    if (filter && filter !== 'all') {
      const m = this.MODE_OF[filter] || filter;
      arr = arr.filter(w => ((w.world_data && w.world_data.gameModeDefault) || 'NRM') === m);
    }
    arr.sort((a, b) => {
      if (sort === 'alphabetical') return (a.world_name || '').localeCompare(b.world_name || '');
      const da = new Date(a.created_at || 0).getTime(), db = new Date(b.created_at || 0).getTime();
      return sort === 'oldest' ? da - db : db - da;
    });
    const total = arr.length;
    const totalPages = Math.max(1, Math.ceil(total / this.PAGE_SIZE));
    const start = Math.max(0, page) * this.PAGE_SIZE;
    return { worlds: arr.slice(start, start + this.PAGE_SIZE), page, pageSize: this.PAGE_SIZE, total, totalPages };
  },

  get(id) { return this._all()[id] || null; },
  listAll() { return Object.values(this._all()); },

  // Create an empty world — no grid; the sandbox editor builds it from the
  // stored dimensions (same as the server's fresh-world path).
  create({ worldName, description = '', worldWidth, worldHeight, gameModeDefault = 'NRM', config = {} }) {
    const map = this._all();
    const id = this._uid();
    const now = new Date().toISOString();
    // Seed per-mode creation defaults (Platformer gets the "Kevin's World!" preset;
    // other modes get {} → engine defaults). Existing worlds are never touched.
    const adv = (typeof worldModeDefaults === 'function') ? worldModeDefaults(gameModeDefault) : {};
    if (config && config.arenaViewType) adv.arenaViewType = config.arenaViewType;
    map[id] = {
      id, world_name: worldName, description, is_published: false, created_at: now,
      world_data: {
        isEmptySandbox: true, worldWidth, worldHeight, gameModeDefault,
        worldAdvSettings: adv,
        provenance: { uid: id, createdAt: Date.now(), updatedAt: Date.now(), creator: 'Guest', origin: 'local', copiedFrom: null, copiedAt: null },
      },
    };
    this._persist(map);
    return map[id];
  },

  save(id, worldData) {
    const map = this._all(); const w = map[id]; if (!w) return false;
    w.world_data = worldData;
    return this._persist(map);
  },

  rename(id, newName) {
    const map = this._all(); const w = map[id]; if (!w) return false;
    w.world_name = newName;
    return this._persist(map);
  },

  setMode(id, gameModeDefault) {
    const map = this._all(); const w = map[id]; if (!w) return false;
    w.world_data = w.world_data || {}; w.world_data.gameModeDefault = gameModeDefault;
    return this._persist(map);
  },

  // §Epic C — patch top-level card fields (e.g. description) on a local world.
  update(id, patch) {
    const map = this._all(); const w = map[id]; if (!w || !patch) return false;
    Object.assign(w, patch);
    return this._persist(map);
  },

  // §Custom Sprites — persist the world's chosen character on a local (lw-) world.
  // Without this the Sandbox card's fallback path silently no-op'd: get() returns a
  // detached copy of localStorage (mutating it persists nothing) and save() with no
  // args writes map[undefined] — so lw- side-scroll worlds never kept characterId
  // (tester, build 434), unlike the oh- overhead store which writes back explicitly.
  setCharacter(id, characterId) {
    const map = this._all(); const w = map[id]; if (!w) return false;
    w.world_data = w.world_data || {}; w.world_data.characterId = characterId;
    return this._persist(map);
  },

  // §Custom Sprites Phase 2 — store a built custom character on a local world (sets characterId
  // 'custom' + the mix). Pass null def to just switch the id via setCharacter instead.
  setCustomCharacter(id, def) {
    const map = this._all(); const w = map[id]; if (!w) return false;
    w.world_data = w.world_data || {};
    w.world_data.characterId = 'custom';
    w.world_data.customCharacter = def || null;
    return this._persist(map);
  },

  copy(id, newName) {
    const map = this._all(); const src = map[id]; if (!src) return null;
    const nid = this._uid();
    const clone = JSON.parse(JSON.stringify(src));
    clone.id = nid;
    clone.world_name = newName || (src.world_name + ' (Copy)');
    clone.is_published = false;
    clone.created_at = new Date().toISOString();
    clone.world_data = clone.world_data || {};
    const srcUid = (src.world_data && src.world_data.provenance && src.world_data.provenance.uid) || src.id;
    clone.world_data.provenance = {
      uid: nid, createdAt: Date.now(), updatedAt: Date.now(),
      creator: (clone.world_data.provenance && clone.world_data.provenance.creator) || 'Guest',
      origin: 'local', copiedFrom: srcUid, copiedAt: Date.now(),
    };
    map[nid] = clone; this._persist(map);
    return clone;
  },

  remove(id) { const map = this._all(); delete map[id]; this._persist(map); return true; },

  // Import a world from a parsed file / bundled JSON. `worldData` is either a
  // server export's world_data or a raw world payload (grid at top level). mode
  // (optional) forces the game mode; else the payload's gameModeDefault stays.
  importWorld({ worldName, description = '', worldData, mode }) {
    const map = this._all();
    const id = this._uid();
    const wd = worldData ? JSON.parse(JSON.stringify(worldData)) : {};
    if (mode) wd.gameModeDefault = mode;
    const srcUid = (wd.provenance && wd.provenance.uid) || null;
    wd.provenance = {
      uid: id, createdAt: Date.now(), updatedAt: Date.now(),
      creator: 'Guest', origin: 'local',
      copiedFrom: srcUid, copiedAt: srcUid ? Date.now() : null,
    };
    map[id] = {
      id, world_name: worldName || 'Imported World', description,
      is_published: false, created_at: new Date().toISOString(), world_data: wd,
    };
    this._persist(map);
    return map[id];
  },

  // Seed the pre-loaded starter worlds (default-worlds/*.json) into the local
  // store on first offline use. Best-effort — offline-uncached fetches skip
  // (the SW precaches these, so they're normally available). Runs once.
  SEED_KEY: 'steveo_local_seeded',
  async seedDefaults() {
    try { if (localStorage.getItem(this.SEED_KEY)) return; } catch (e) {}
    const defs = [
      { file: 'normal-default.json',      mode: 'NRM', name: 'Starter · Normal' },
      { file: 'platformer-default.json',  mode: 'PLT', name: 'Starter · Platformer' },
      { file: 'speedrunner-default.json', mode: 'RUN', name: 'Starter · Speed Run' },
    ];
    for (const d of defs) {
      try {
        const res = await fetch('/default-worlds/' + d.file);
        if (!res.ok) continue;
        const parsed = await res.json();
        const wd = parsed.world_data || parsed;
        this.importWorld({ worldName: d.name, description: 'Pre-loaded starter world.', worldData: wd, mode: d.mode });
      } catch (e) { /* offline / not cached → skip this starter */ }
    }
    try { localStorage.setItem(this.SEED_KEY, '1'); } catch (e) {}
  },
};

if (typeof window !== 'undefined') window.LOCAL_WORLDS = LOCAL_WORLDS;
