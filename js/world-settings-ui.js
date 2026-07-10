// ============================================================
// world-settings-ui.js — Unified HTML World Settings panel
// ------------------------------------------------------------
// One tabbed HTML screen for every per-world setting, replacing the canvas
// "rendered" World Settings panel (kept as a Konami bonus) and the hand-built
// pause-menu settings section.
//
// DATA-DRIVEN: every control is one entry in the flat SETTINGS list, tagged with
// { tab, group, advanced, modes, dependsOn }. To move a setting to another tab,
// change its `tab`. To make it advanced (hidden unless the ⚙ Advanced toggle is
// on), set `advanced:true`. To gate it behind another toggle, set `dependsOn`.
// The renderer groups by tab → group and shows a tab only if it has ≥1 visible
// control for the current game mode. Sandbox sees ALL tabs (it designs any mode).
//
// Setting types: 'toggle' | 'cycle' | 'slider' | 'button'.
//   toggle  — boolean.                  cycle — steps through `opts`, shows `fmt`.
//   slider  — 0..100 (pct).             button — runs `act(game)` (e.g. open a
//                                                 sub-editor like Mob Drops).
// Value plumbing defaults to game._worldAdvSettings[key] (with `dflt`); override
// with get/set for anything special.
// ============================================================

const WORLD_SETTINGS = {
  _game: null,
  _tab: null,
  _advanced: false,

  // ── Cycle option tables ────────────────────────────────────
  OPT: {
    gravity:   [0.10, 0.20, 0.33, 0.50, 0.66, 0.80, 1.00, 1.20, 1.50],
    jumpH:     [null, 2, 2.5, 3, 3.5, 4, 4.5, 5],
    jumpPad:   [-6, -9, -12, -15, -18, -21, -24],
    zoom:      [0.5, 0.75, 1.0, 1.25, 1.5, 2.0],
    redstone:  [0.5, 1, 2, 3, 4, 6, 8],
    slideDur:  [15, 20, 30, 45, 60, 90],
    slideMult: [1.2, 1.4, 1.6, 2.0, 2.5],
    boss:      [0.5, 1.0, 1.5, 2.0, 3.0],
    day:       [2, 5, 10, 15, 20, 30],
    srBase:    [0.5, 0.75, 1, 1.25, 1.5, 2],
    srMax:     [1.5, 2, 2.5, 3, 4],
    srAccel:   [0.2, 0.35, 0.5, 0.7, 1.0, 1.5],
    srDecel:   [1, 1.5, 2, 3, 4, 5],
    srPct:     [0.02, 0.05, 0.1, 0.15, 0.2],
    srSec:     [1, 2, 3, 5, 8],
    srBlocks:  [3, 5, 8, 12],
    srZoom:    [1, 1.5, 2, 2.5, 3],
    arenaHp:   [2, 6, 10, 14, 20, 30, 40],
    arenaMob:  ['EASY', 'MEDIUM', 'HARD'],
    arenaResp: [0, 1, 2, 3, 5, 8, 10],
    arenaView: ['single', 'scrolling'],
    arenaZoom: ['NONE', 'PRESET', 'DYNAMIC'],
    presetZoom:[0.3, 0.5, 0.75, 1.0, 1.25, 1.5],
  },

  // ── Tabs (order + labels). A tab is shown only when it has visible rows. ──
  TABS: [
    { id: 'world',    label: 'World' },
    { id: 'movement', label: 'Movement' },
    { id: 'speedrun', label: 'Speed Run' },
    { id: 'arena',    label: 'Arena' },
    { id: 'combat',   label: 'Combat' },
    { id: 'mobs',     label: 'Mob Drops' },   // sandbox — special-rendered table
  ],

  // Arena game types (which modes an arena world supports) → arenaEnabledTypes[].
  ARENA_TYPES: [
    ['MOB_HUNTER', 'Mob Hunter'], ['COLLECT_EMERALDS', 'Collect Emeralds'],
    ['KING_OF_HILL', 'King of the Hill'], ['SURVIVAL_WAVES', 'Survival Waves'],
    ['DEATHMATCH', 'Deathmatch'], ['CAPTURE_FLAG', 'Capture the Flag'],
    ['DEFEND_TOWER', 'Defend the Tower'],
  ],
  // Mob-drops editor data
  DROP_MOBS: [['zombie', 'Zombie'], ['skeleton', 'Skeleton'], ['creeper', 'Creeper'],
    ['cave_spider', 'Cave Spider'], ['piglin', 'Piglin'], ['blaze', 'Blaze'],
    ['wither_skeleton', 'Wither Skel.'], ['enderman', 'Enderman']],
  DROP_ITEMS: [[0, '(none)'], [31, 'Apple'], [47, 'Arrow'], [30, 'String'], [8, 'Coal'],
    [9, 'Iron Ore'], [17, 'Soul Sand'], [44, 'Blaze Rod'], [45, 'Ender Pearl'],
    [52, 'Wither Skull'], [46, 'Dragon Egg']],
  DROP_CHANCES: [0, 10, 25, 33, 50, 75, 100],

  // Which game modes each SETTING applies to. 'sandbox' is added everywhere so
  // the editor can configure worlds of any target mode.
  _MODES: {
    physics:  ['normal', 'platformer', 'arena', 'sandbox'],
    adventure:['normal', 'platformer', 'sandbox'],
    speedrun: ['speedrunner', 'sandbox'],
    platformer:['platformer', 'sandbox'],
    arena:    ['arena', 'sandbox'],
    display:  ['normal', 'platformer', 'arena', 'sandbox'],
    all:      ['normal', 'platformer', 'speedrunner', 'arena', 'sandbox'],
  },

  // Helpers for value fns
  _num: (v) => v,
  _cap: (s) => s.charAt(0) + s.slice(1).toLowerCase(),

  // ── The settings. `key` maps to game._worldAdvSettings[key] unless get/set. ──
  get SETTINGS() {
    const O = this.OPT, M = this._MODES;
    const pct1 = (v) => v.toFixed(2), x1 = (v) => v.toFixed(1) + 'x', xf = (v) => v + 'x';
    return [
      // ── WORLD ───────────────────────────────────────────────
      { key: 'backgroundTheme', tab: 'world', group: 'Look', modes: M.display, type: 'cycle', opts: ['auto', 'sky', 'cave', 'nether', 'end'], dflt: 'auto', label: 'Background', fmt: this._cap, hint: 'force a biome backdrop everywhere, or Auto (by position)' },
      { key: 'dayCycleMinutes', tab: 'world', group: 'Day / Night', modes: M.adventure, type: 'cycle', opts: O.day, dflt: 10, label: 'Day Length', fmt: (v) => v + ' min', hint: 'length of a full day+night cycle' },
      { key: 'nightSpawnBoost', tab: 'world', group: 'Day / Night', modes: M.adventure, type: 'toggle', dflt: false, label: 'Night Spawn Boost', hint: 'more mobs spawn at night' },
      { key: 'nightSpawnRate', tab: 'world', group: 'Day / Night', modes: M.adventure, type: 'cycle', opts: [1.5, 2, 3, 4], dflt: 2, label: 'Night Spawn Rate', fmt: (v) => v.toFixed(1) + 'x', sub: true, dependsOn: 'nightSpawnBoost', advanced: true, hint: 'how many more mobs at night' },
      { key: 'fullMoonHpBoost', tab: 'world', group: 'Day / Night', modes: M.adventure, type: 'toggle', dflt: false, label: 'Full-Moon Mob HP', hint: 'tougher mobs on full-moon nights' },
      { key: 'fullMoonHpAmount', tab: 'world', group: 'Day / Night', modes: M.adventure, type: 'cycle', opts: [1.25, 1.5, 2, 3], dflt: 1.5, label: 'Full-Moon HP Boost', fmt: (v) => v.toFixed(2) + 'x', sub: true, dependsOn: 'fullMoonHpBoost', advanced: true, hint: 'mob HP multiplier on a full moon' },
      { key: 'compactHotbar', tab: 'world', group: 'Display', modes: M.display, type: 'toggle', dflt: false, label: 'Compact Hotbar' },
      { key: 'worldZoom', tab: 'world', group: 'Display', modes: M.display, type: 'cycle', opts: O.zoom, dflt: 1.0, label: 'Default Zoom', fmt: (v) => v.toFixed(2) + 'x' },
      { key: 'twoPlayerMode', tab: 'world', group: 'Players', modes: M.adventure, type: 'toggle', dflt: false, label: '2-Player Co-op', hint: 'P2 joins with a gamepad' },
      { key: 'platformerEmeralds', tab: 'world', group: 'Scoring', modes: M.platformer, type: 'toggle', dflt: false, label: 'Collect Emeralds', hint: 'placed emeralds can be picked up and counted' },
      { key: 'platformerScore', tab: 'world', group: 'Scoring', modes: M.platformer, type: 'toggle', dflt: false, label: 'Score / Points', hint: 'track a running score (emeralds + level-clear bonus)' },
      { key: 'emeraldPoints', tab: 'world', group: 'Scoring', modes: M.platformer, type: 'cycle', opts: [50, 100, 200, 500], dflt: 100, label: 'Points / Emerald', fmt: (v) => v + ' pts', sub: true, dependsOn: 'platformerScore', advanced: true, hint: 'score awarded per emerald' },
      { key: 'goalClearPoints', tab: 'world', group: 'Scoring', modes: M.platformer, type: 'cycle', opts: [0, 500, 1000, 2000], dflt: 1000, label: 'Level-Clear Bonus', fmt: (v) => v + ' pts', sub: true, dependsOn: 'platformerScore', advanced: true, hint: 'score awarded for reaching a Goal Star' },
      { key: 'physicsLocked', tab: 'world', group: 'Designer Locks', modes: ['sandbox'], type: 'toggle', dflt: false, label: 'Lock Physics', advanced: true, hint: 'players can’t override movement/physics' },
      { key: 'bossScalingLocked', tab: 'world', group: 'Designer Locks', modes: ['sandbox'], type: 'toggle', dflt: false, label: 'Lock Boss Scaling', advanced: true },

      // ── MOVEMENT (physics + moves) ──────────────────────────
      { key: 'physicsGravity', tab: 'movement', group: 'Physics', modes: M.physics, type: 'cycle', opts: O.gravity, dflt: 0.66, label: 'Gravity', fmt: pct1 },
      { key: 'jumpHeightBlocks', tab: 'movement', group: 'Physics', modes: M.physics, type: 'cycle', opts: O.jumpH, dflt: null, label: 'Jump Height', fmt: (v) => v == null ? 'Default' : v + ' bl' },
      { key: 'jumpPadVForce', tab: 'movement', group: 'Physics', modes: M.physics, type: 'cycle', opts: O.jumpPad, dflt: -18, label: 'Jump-Pad Force', fmt: String, advanced: true },
      { key: 'redstoneSpeed', tab: 'movement', group: 'Physics', modes: M.physics, type: 'cycle', opts: O.redstone, dflt: 1.0, label: 'Redstone Speed', fmt: xf, advanced: true, hint: 'faster pistons / traps' },
      { key: 'disableXpSpeedBoost', tab: 'movement', group: 'Physics', modes: M.physics, type: 'toggle', dflt: false, label: 'Disable XP Speed Boost', advanced: true },
      { key: 'sprintEnabled', tab: 'movement', group: 'Moves', modes: M.physics, type: 'toggle', label: 'Sprint', get: (a) => a.sprintEnabled !== false, set: (a, v) => { a.sprintEnabled = v; }, hint: 'hold Shift for 2× speed' },
      { key: 'autoStepUp', tab: 'movement', group: 'Moves', modes: M.physics, type: 'toggle', dflt: false, label: 'Auto-Climb', hint: 'walk up 1-block ledges' },
      { key: 'airJumpEnabled', tab: 'movement', group: 'Moves', modes: M.physics, type: 'toggle', dflt: false, label: 'Double Jump', hint: 'one mid-air jump (adds an air-roll)' },
      { key: 'wallSlideEnabled', tab: 'movement', group: 'Moves', modes: M.physics, type: 'toggle', dflt: false, label: 'Wall Slide', hint: 'slow-slide down a wall you press into' },
      { key: 'wallJumpLockAway', tab: 'movement', group: 'Moves', modes: M.physics, type: 'toggle', dflt: false, label: 'Wall-Jump Lock-Away', sub: true, dependsOn: 'wallSlideEnabled', advanced: true, hint: 'jump forces away, no steering till you land' },
      { key: 'ledgeHangEnabled', tab: 'movement', group: 'Moves', modes: M.physics, type: 'toggle', dflt: false, label: 'Ledge Hang', hint: 'grab & climb block edges' },
      { key: 'slideEnabled', tab: 'movement', group: 'Moves', modes: M.physics, type: 'toggle', dflt: false, label: 'Ground Slide', hint: 'jump + down to slide' },
      { key: 'slideInvincible', tab: 'movement', group: 'Moves', modes: M.physics, type: 'toggle', dflt: false, label: 'Slide Invincible', sub: true, dependsOn: 'slideEnabled', advanced: true },
      { key: 'slideDurationFrames', tab: 'movement', group: 'Moves', modes: M.physics, type: 'cycle', opts: O.slideDur, dflt: 30, label: 'Slide Length', fmt: (v) => v + 'f', sub: true, dependsOn: 'slideEnabled', advanced: true },
      { key: 'slideSpeedMult', tab: 'movement', group: 'Moves', modes: M.physics, type: 'cycle', opts: O.slideMult, dflt: 1.6, label: 'Slide Speed', fmt: x1, sub: true, dependsOn: 'slideEnabled', advanced: true },

      // ── SPEED RUN ───────────────────────────────────────────
      { key: 'srBaseSpeed', tab: 'speedrun', group: 'Pace', modes: M.speedrun, type: 'cycle', opts: O.srBase, dflt: 1.0, label: 'Base Speed', fmt: x1 },
      { key: 'srMaxMultiplier', tab: 'speedrun', group: 'Pace', modes: M.speedrun, type: 'cycle', opts: O.srMax, dflt: 2.0, label: 'Max Speed', fmt: x1 },
      { key: 'srAccel', tab: 'speedrun', group: 'Pace', modes: M.speedrun, type: 'cycle', opts: O.srAccel, dflt: 0.5, label: 'Acceleration', fmt: (v) => v.toFixed(2) + '/f' },
      { key: 'srDecel', tab: 'speedrun', group: 'Pace', modes: M.speedrun, type: 'cycle', opts: O.srDecel, dflt: 2, label: 'Deceleration', fmt: (v) => v + '× accel', advanced: true },
      { key: 'srBoostPct', tab: 'speedrun', group: 'Boosts', modes: M.speedrun, type: 'cycle', opts: O.srPct, dflt: 0.05, label: 'Boost Amount', fmt: (v) => Math.round(v * 100) + '%', advanced: true },
      { key: 'srTimeBoostEnabled', tab: 'speedrun', group: 'Boosts', modes: M.speedrun, type: 'toggle', get: (a) => a.srTimeBoostEnabled !== false, set: (a, v) => { a.srTimeBoostEnabled = v; }, label: 'Time Boost' },
      { key: 'srTimeBoostIntervalSec', tab: 'speedrun', group: 'Boosts', modes: M.speedrun, type: 'cycle', opts: O.srSec, dflt: 5, label: 'Time Boost Every', fmt: (v) => v + 's', sub: true, dependsOn: 'srTimeBoostEnabled', advanced: true },
      { key: 'srDistBoostEnabled', tab: 'speedrun', group: 'Boosts', modes: M.speedrun, type: 'toggle', dflt: false, label: 'Distance Boost' },
      { key: 'srDistBoostIntervalBlocks', tab: 'speedrun', group: 'Boosts', modes: M.speedrun, type: 'cycle', opts: O.srBlocks, dflt: 5, label: 'Distance Boost Every', fmt: (v) => v + ' bl', sub: true, dependsOn: 'srDistBoostEnabled', advanced: true },
      { key: 'srMinZoomSpeed', tab: 'speedrun', group: 'Camera', modes: M.speedrun, type: 'cycle', opts: O.srZoom, dflt: 1.0, label: 'Zoom-Out Start', fmt: x1, advanced: true },
      { key: 'srMaxZoomSpeed', tab: 'speedrun', group: 'Camera', modes: M.speedrun, type: 'cycle', opts: O.srZoom, dflt: 2.0, label: 'Zoom-Out Max', fmt: x1, advanced: true },

      // ── ARENA ───────────────────────────────────────────────
      { key: 'arenaViewType', tab: 'arena', group: 'Camera', modes: M.arena, type: 'cycle', opts: O.arenaView, dflt: 'single', label: 'World View', fmt: this._cap },
      { key: 'arenaZoomMode', tab: 'arena', group: 'Camera', modes: M.arena, type: 'cycle', opts: O.arenaZoom, dflt: 'NONE', label: 'Zoom Mode', fmt: this._cap },
      { key: 'arenaPresetZoom', tab: 'arena', group: 'Camera', modes: M.arena, type: 'cycle', opts: O.presetZoom, dflt: 1.0, label: 'Preset Zoom', fmt: (v) => v.toFixed(2) + 'x', sub: true, dependsOn: (a) => a.arenaZoomMode === 'PRESET' },
      { key: 'arenaPlayerMaxHealth', tab: 'arena', group: 'Match', modes: M.arena, type: 'cycle', opts: O.arenaHp, dflt: 20, label: 'Player Health', fmt: (v) => (v / 2) + ' ♥' },
      { key: 'arenaMobHealth', tab: 'arena', group: 'Match', modes: M.arena, type: 'cycle', opts: O.arenaMob, dflt: 'MEDIUM', label: 'Mob Difficulty', fmt: this._cap },
      { key: 'arenaRespawnTime', tab: 'arena', group: 'Match', modes: M.arena, type: 'cycle', opts: O.arenaResp, dflt: 2, label: 'Respawn Delay', fmt: (v) => v + 's' },
      // Game types this arena world supports (→ arenaEnabledTypes[]).
      ...this.ARENA_TYPES.map(([k, label]) => ({
        key: 'arenaType_' + k, tab: 'arena', group: 'Game Types', modes: M.arena, type: 'toggle', label,
        get: (a) => Array.isArray(a.arenaEnabledTypes) && a.arenaEnabledTypes.includes(k),
        set: (a, v) => {
          if (!Array.isArray(a.arenaEnabledTypes)) a.arenaEnabledTypes = [];
          const i = a.arenaEnabledTypes.indexOf(k);
          if (v && i < 0) a.arenaEnabledTypes.push(k); else if (!v && i >= 0) a.arenaEnabledTypes.splice(i, 1);
        },
      })),

      // ── COMBAT ──────────────────────────────────────────────
      { key: 'bossHealthMultiplier', tab: 'combat', group: 'Boss Scaling', modes: M.adventure, type: 'cycle', opts: O.boss, dflt: 1.0, label: 'Boss Health', fmt: x1 },
      { key: 'bossDamageMultiplier', tab: 'combat', group: 'Boss Scaling', modes: M.adventure, type: 'cycle', opts: O.boss, dflt: 1.0, label: 'Boss Damage', fmt: x1 },
      { key: 'bossAttackRateMultiplier', tab: 'combat', group: 'Boss Scaling', modes: M.adventure, type: 'cycle', opts: O.boss, dflt: 1.0, label: 'Boss Attack Rate', fmt: x1, advanced: true },
      { key: 'disableDragonHealing', tab: 'combat', group: 'Boss Scaling', modes: M.adventure, type: 'toggle', dflt: false, label: 'Disable Dragon Healing', advanced: true },
      { key: 'unlimitedArrows', tab: 'combat', group: 'Combat', modes: M.adventure, type: 'toggle', dflt: false, label: 'Unlimited Arrows', advanced: true },
      // (Audio, Controls, Show-Health-Bars and Disable-Chat are PLAYER settings —
      //  they live in the pause-menu Settings tab, not here. Mob Drops = its own tab.)
    ];
  },

  // ── Lifecycle ───────────────────────────────────────────────
  isOpen() { return !!this._game; },

  open(game, tab) {
    this._game = game;
    const modeTabs = this.TABS.filter((t) => this._tabHasRows(t.id));
    if (!modeTabs.length) { this._game = null; return; }
    // Caller may request a landing tab (e.g. ⚙ Arena Settings → 'arena',
    // the Sandbox World-Settings quick button → 'speedrun' for RUN worlds).
    if (tab && modeTabs.some((t) => t.id === tab)) this._tab = tab;
    else if (!this._tab || !modeTabs.some((t) => t.id === this._tab)) this._tab = modeTabs[0].id;
    const ov = document.getElementById('world-settings-overlay');
    if (!ov) { this._game = null; return; }
    game._htmlSettingsOpen = true;          // game treats this as an overlay (blocks gameplay input)
    ov.style.display = 'flex';
    if (!this._keyHandler) {
      this._keyHandler = (e) => { if (e.key === 'Escape' && this.isOpen()) { e.stopPropagation(); this.close(); } };
      window.addEventListener('keydown', this._keyHandler, true);
    }
    this._render();
  },

  close() {
    const ov = document.getElementById('world-settings-overlay');
    if (ov) ov.style.display = 'none';
    if (this._game) this._game._htmlSettingsOpen = false;
    this._game = null;
  },

  // ── Visibility rules ────────────────────────────────────────
  _modeOK(s) {
    const g = this._game;
    if (g.gameMode === 'sandbox') return s.modes.includes('sandbox');
    return s.modes.includes(g.isArena ? 'arena' : g.gameMode);
  },
  _depOK(s) {
    if (!s.dependsOn) return true;
    const a = this._game._worldAdvSettings;
    if (typeof s.dependsOn === 'function') return !!s.dependsOn(a);
    return !!a[s.dependsOn] && a[s.dependsOn] !== false;
  },
  _visible(s) {
    if (!this._modeOK(s)) return false;
    if (s.showWhen && !s.showWhen(this._game)) return false;
    if (s.advanced && !this._advanced) return false;
    if (!this._depOK(s)) return false;
    return true;
  },
  _tabHasRows(tabId) {
    if (tabId === 'mobs') return this._game.gameMode === 'sandbox';   // special table, sandbox only
    return this.SETTINGS.some((s) => s.tab === tabId && this._modeOK(s) && (!s.showWhen || s.showWhen(this._game)));
  },

  // ── Value access ────────────────────────────────────────────
  _get(s) {
    const a = this._game._worldAdvSettings;
    return s.get ? s.get(a, this._game) : (a[s.key] ?? s.dflt);
  },
  _set(s, v) {
    const a = this._game._worldAdvSettings;
    if (s.set) s.set(a, v, this._game); else a[s.key] = v;
  },
  _cycleNext(s, dir = 1) {
    const cur = this._get(s);
    let i = s.opts.findIndex((o) => o === cur || (typeof o === 'number' && Math.abs(o - cur) < 1e-6));
    if (i < 0) i = 0;
    this._set(s, s.opts[(i + dir + s.opts.length) % s.opts.length]);
  },

  // ── Render ──────────────────────────────────────────────────
  _render() {
    const ov = document.getElementById('world-settings-overlay');
    if (!ov || !this._game) return;
    const tabs = this.TABS.filter((t) => this._tabHasRows(t.id));
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Tab bar
    const tabBar = tabs.map((t) =>
      `<button class="ws-tab${t.id === this._tab ? ' active' : ''}" data-tab="${t.id}">${esc(t.label)}</button>`).join('');

    // Body: the Mob Drops tab is a special table; everything else is schema rows
    // grouped by `group`.
    let rows = [];
    let body = '';
    if (this._tab === 'mobs') {
      body = this._mobDropsHtml(esc);
    } else {
      rows = this.SETTINGS.filter((s) => s.tab === this._tab && this._visible(s));
      let lastGroup = null;
      for (const s of rows) {
        if (s.group !== lastGroup) { body += `<div class="ws-group">${esc(s.group)}</div>`; lastGroup = s.group; }
        body += this._rowHtml(s, esc);
      }
      if (!rows.length) body = '<div class="ws-empty">No settings here for this mode.</div>';
    }

    ov.innerHTML = `
      <div class="ws-panel" role="dialog" aria-label="World Settings">
        <div class="ws-head">
          <h2>World Settings</h2>
          <label class="ws-adv" title="Show advanced / less-used settings">
            <input type="checkbox" id="ws-adv"${this._advanced ? ' checked' : ''}> Advanced
          </label>
          <button class="ws-close" id="ws-close" aria-label="Close">✕</button>
        </div>
        <div class="ws-tabs">${tabBar}</div>
        <div class="ws-body">${body}</div>
      </div>`;

    // Wire tab bar + header
    ov.querySelectorAll('.ws-tab').forEach((b) => b.onclick = () => { this._tab = b.dataset.tab; this._render(); });
    document.getElementById('ws-close').onclick = () => this.close();
    document.getElementById('ws-adv').onchange = (e) => { this._advanced = e.target.checked; this._render(); };

    if (this._tab === 'mobs') { this._wireMobDrops(ov); return; }

    // Wire each control
    for (const s of rows) {
      const el = ov.querySelector(`[data-key="${s.key}"]`);
      if (!el) continue;
      if (s.type === 'toggle') {
        el.onclick = () => { this._set(s, !this._get(s)); this._render(); };
      } else if (s.type === 'cycle') {
        el.querySelector('.ws-cyc-next').onclick = () => { this._cycleNext(s, 1); this._render(); };
        el.querySelector('.ws-cyc-prev').onclick = () => { this._cycleNext(s, -1); this._render(); };
      } else if (s.type === 'slider') {
        el.oninput = () => { this._set(s, +el.value); const v = el.parentElement.querySelector('.ws-slval'); if (v) v.textContent = el.value + '%'; };
      } else if (s.type === 'button') {
        el.onclick = () => s.act(this._game);
      }
    }
  },

  // ── Mob Drops table (HTML port of the canvas editor) ────────
  _mobDropsHtml(esc) {
    const cfg = this._game._mobDropSettings || {};
    const itemName = (id) => (this.DROP_ITEMS.find(([i]) => i === id) || [0, '(none)'])[1];
    const cyc = (val) => `<div class="ws-cyc"><button class="ws-cyc-prev" aria-label="Previous">‹</button><span class="ws-cyc-val">${esc(val)}</span><button class="ws-cyc-next" aria-label="Next">›</button></div>`;
    let html = '<div class="ws-group">Per-mob drops — item + chance, two slots each</div>';
    for (const [mk, mlabel] of this.DROP_MOBS) {
      const slots = cfg[mk] || [{ item: 0, chance: 0 }, { item: 0, chance: 0 }];
      let cells = '';
      for (let si = 0; si < 2; si++) {
        const slot = slots[si] || { item: 0, chance: 0 };
        cells += `<div class="ws-drop-slot" data-mob="${mk}" data-slot="${si}">
          <span class="ws-drop-cap">${si + 1}</span>
          <span class="ws-drop-item">${cyc(itemName(slot.item))}</span>
          <span class="ws-drop-chance">${cyc((slot.chance || 0) + '%')}</span></div>`;
      }
      html += `<div class="ws-drop-row"><div class="ws-drop-mob">${esc(mlabel)}</div><div class="ws-drop-slots">${cells}</div></div>`;
    }
    return html;
  },
  _wireMobDrops(ov) {
    ov.querySelectorAll('.ws-drop-slot').forEach((slotEl) => {
      const mk = slotEl.dataset.mob, si = +slotEl.dataset.slot;
      const it = slotEl.querySelector('.ws-drop-item'), ch = slotEl.querySelector('.ws-drop-chance');
      it.querySelector('.ws-cyc-next').onclick = () => this._cycleDropItem(mk, si, 1);
      it.querySelector('.ws-cyc-prev').onclick = () => this._cycleDropItem(mk, si, -1);
      ch.querySelector('.ws-cyc-next').onclick = () => this._cycleDropChance(mk, si, 1);
      ch.querySelector('.ws-cyc-prev').onclick = () => this._cycleDropChance(mk, si, -1);
    });
  },
  _dropSlot(mk, si) {
    const g = this._game;
    if (!g._mobDropSettings[mk]) g._mobDropSettings[mk] = [{ item: 0, chance: 0 }, { item: 0, chance: 0 }];
    if (!g._mobDropSettings[mk][si]) g._mobDropSettings[mk][si] = { item: 0, chance: 0 };
    return g._mobDropSettings[mk][si];
  },
  _cycleDropItem(mk, si, dir) {
    const slot = this._dropSlot(mk, si), ids = this.DROP_ITEMS.map(([i]) => i);
    let i = ids.indexOf(slot.item); if (i < 0) i = 0;
    slot.item = ids[(i + dir + ids.length) % ids.length];
    this._commitDrops(); this._render();
  },
  _cycleDropChance(mk, si, dir) {
    const slot = this._dropSlot(mk, si), C = this.DROP_CHANCES;
    let i = C.indexOf(slot.chance || 0); if (i < 0) i = 0;
    slot.chance = C[(i + dir + C.length) % C.length];
    this._commitDrops(); this._render();
  },
  _commitDrops() { const g = this._game; if (g.mobManager) g.mobManager.dropConfig = g._mobDropSettings; },

  _rowHtml(s, esc) {
    // ⓘ tooltip icon (native title on hover/focus); advanced rows get a colour class.
    const info = s.hint ? ` <span class="ws-info" tabindex="0" title="${esc(s.hint)}" aria-label="${esc(s.hint)}">ⓘ</span>` : '';
    const cls = 'ws-label' + (s.sub ? ' ws-sub' : '') + (s.advanced ? ' ws-adv-row' : '');
    const label = `<div class="${cls}"><span class="ws-lbl">${esc(s.label)}</span>${info}</div>`;
    if (s.type === 'toggle') {
      const on = !!this._get(s);
      return `<div class="ws-row">${label}<button class="ws-switch${on ? ' on' : ''}" data-key="${s.key}" role="switch" aria-checked="${on}"><span class="ws-knob"></span></button></div>`;
    }
    if (s.type === 'cycle') {
      const disp = esc(s.fmt ? s.fmt(this._get(s)) : this._get(s));
      return `<div class="ws-row">${label}<div class="ws-cyc" data-key="${s.key}">
        <button class="ws-cyc-prev" aria-label="Previous">‹</button><span class="ws-cyc-val">${disp}</span><button class="ws-cyc-next" aria-label="Next">›</button></div></div>`;
    }
    if (s.type === 'slider') {
      const v = this._get(s);
      return `<div class="ws-row">${label}<div class="ws-slwrap"><input type="range" min="0" max="100" value="${v}" class="ws-slider" data-key="${s.key}"><span class="ws-slval">${v}%</span></div></div>`;
    }
    if (s.type === 'button') {
      return `<div class="ws-row">${label}<button class="ws-btn" data-key="${s.key}">Open</button></div>`;
    }
    return '';
  },
};

if (typeof window !== 'undefined') window.WORLD_SETTINGS = WORLD_SETTINGS;
