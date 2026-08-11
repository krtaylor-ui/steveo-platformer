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
    redstone:  [0.5, 1, 2, 3, 4, 6, 8, 'instant'],
    slideDur:  [15, 20, 30, 45, 60, 90],
    slideMult: [1.2, 1.4, 1.6, 2.0, 2.5],
    boss:      [0.5, 1.0, 1.5, 2.0, 3.0],
    wdmg:      [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0],   // weapon damage ×
    wspd:      [0.5, 0.75, 1.0, 1.25, 1.5, 2.0],              // attack speed ×
    wknock:    [0, 0.5, 1.0, 1.5, 1.9, 2.5, 3.5],             // knockback ×
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
    { id: 'mobs',     label: 'Mob Settings' },  // mob behavior (schema rows) + the special drops table (sandbox)
    { id: 'multi',    label: 'Multiplayer' },   // companion / shared-player / boss scaling — playing together
    { id: 'debug',    label: 'Debug' },         // dev overlays: every row advanced, so the TAB hides unless Advanced is on
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

  // §E10 Rule-set presets — named Speed Runner "feels". Each `vals` is a batch of _worldAdvSettings the
  // preset writes; every setting stays editable afterwards. `classic` reproduces the defaults.
  SR_PRESETS: [
    { id: 'classic', label: 'Classic Runner', hint: 'the default race-car feel: accelerate up to 2× and coast.',
      vals: { srConstantSpeed: false, srMaxEqualsBase: false, srBaseSpeed: 1.0, srMaxMultiplier: 2.0, srAccel: 0.5, srDecel: 2, srInstantRetry: false } },
    { id: 'autoscroll', label: 'Auto-Scroller', hint: 'a hands-off forced march — constant speed, instant retry. Great with the Beat Grid.',
      vals: { srConstantSpeed: true, srMaxEqualsBase: false, srBaseSpeed: 1.2, srMaxMultiplier: 2.0, srAccel: 0.5, srInstantRetry: true } },
    { id: 'plumber', label: 'Plumber Mode', hint: 'steady, forgiving pace with quick restarts — precision-jump platforming.',
      vals: { srConstantSpeed: false, srMaxEqualsBase: false, srBaseSpeed: 1.0, srMaxMultiplier: 1.8, srAccel: 0.35, srDecel: 3, srInstantRetry: true } },
    { id: 'shape', label: 'Shape Run', hint: 'fast constant flow, instant to full speed — twitchy rhythm running.',
      vals: { srConstantSpeed: true, srMaxEqualsBase: false, srBaseSpeed: 1.5, srMaxMultiplier: 2.0, srAccel: 'instant', srInstantRetry: true } },
    { id: 'zen', label: 'Zen Flow', hint: 'a calm, flat cruise (no speed-up) with instant retries.',
      vals: { srConstantSpeed: false, srMaxEqualsBase: true, srBaseSpeed: 0.75, srMaxMultiplier: 1.5, srAccel: 0.5, srInstantRetry: true } },
  ],
  _applySrPreset(game, preset) {
    const a = game._worldAdvSettings;
    for (const k in preset.vals) a[k] = preset.vals[k];
    if (game._notify) game._notify('Applied preset: ' + preset.label + ' (all settings still editable)', '#7fd0ff', 160);
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
      { key: 'backgroundTheme', tab: 'world', group: 'Display', modes: M.display, type: 'cycle', opts: ['auto', 'sky', 'day', 'night', 'cave', 'nether', 'end'], dflt: 'auto', label: 'Background', fmt: this._cap, hint: 'force a backdrop everywhere (Day/Night pin a static sun/moon top-right), or Auto (by position)' },
      { key: 'dayCycleMinutes', tab: 'world', group: 'Day / Night', modes: M.adventure, type: 'cycle', opts: O.day, dflt: 10, label: 'Day Length', fmt: (v) => v + ' min', hint: 'length of a full day+night cycle' },
      { key: 'nightSpawnBoost', tab: 'world', group: 'Day / Night', modes: M.adventure, type: 'toggle', dflt: false, label: 'Night Spawn Boost', hint: 'more mobs spawn at night' },
      { key: 'nightSpawnRate', tab: 'world', group: 'Day / Night', modes: M.adventure, type: 'cycle', opts: [1.5, 2, 3, 4], dflt: 2, label: 'Night Spawn Rate', fmt: (v) => v.toFixed(1) + 'x', sub: true, dependsOn: 'nightSpawnBoost', advanced: true, hint: 'how many more mobs at night' },
      { key: 'fullMoonHpBoost', tab: 'world', group: 'Day / Night', modes: M.adventure, type: 'toggle', dflt: false, label: 'Full-Moon Mob HP', hint: 'tougher mobs on full-moon nights' },
      { key: 'fullMoonHpAmount', tab: 'world', group: 'Day / Night', modes: M.adventure, type: 'cycle', opts: [1.25, 1.5, 2, 3], dflt: 1.5, label: 'Full-Moon HP Boost', fmt: (v) => v.toFixed(2) + 'x', sub: true, dependsOn: 'fullMoonHpBoost', advanced: true, hint: 'mob HP multiplier on a full moon' },
      { key: 'jumpAttack', tab: 'combat', group: 'Special Moves', modes: M.adventure, type: 'toggle', dflt: true, label: 'Jump Attack (stomp)', hint: 'jump onto an enemy from above to squish/hit it and bounce off (Mario-style); Goombas squish in one stomp, Koopas lose their shell first — side contact still hurts you' },
      // ── Debug tab — dev overlays (kept for diagnosing perf + navigation; may be hidden later) ──
      { key: 'perfHud', tab: 'debug', group: 'Overlays', modes: M.all, type: 'toggle', dflt: false, label: 'Performance HUD', advanced: true, hint: 'show a live frame-time breakdown (FPS, update/render, mobs/bot/redstone, A* calls) — also auto-appears when frames run slow' },
      { key: 'showBotPaths', tab: 'debug', group: 'Overlays', modes: M.all, type: 'toggle', dflt: false, label: 'Show Bot / Mob Paths', advanced: true, hint: 'draw each AI’s planned route (green), goal (magenta ring), and a red ✕ when it has no path — for debugging navigation' },
      { key: 'showNavGrid', tab: 'debug', group: 'Overlays', modes: M.all, type: 'toggle', dflt: false, label: 'Show Nav Grid (solid cells)', advanced: true, hint: 'outline every cell the pathfinder treats as SOLID (orange) around each bot — if a wall has no outline, the planner isn’t seeing it' },
      { key: 'worldZoom', tab: 'world', group: 'Display', modes: M.display, type: 'cycle', opts: O.zoom, dflt: 1.0, label: 'Default Zoom', fmt: (v) => v.toFixed(2) + 'x' },
      // (§1c) Companion ON/OFF + which-character is now a PER-SESSION choice made on the
      // Platformer/Normal start screen (game-config-startup splash), not a world property —
      // so the `companionBot` cycle was removed from here. The advanced companion tuning
      // knobs below stay in World Settings (they apply whenever a companion is active).
      { key: 'companionTeleport', tab: 'multi', group: 'Companion', modes: M.adventure, type: 'toggle', get: (a) => a.companionTeleport !== false, set: (a, v) => { a.companionTeleport = v; }, label: 'Bot Companion Summon (press C)', hint: 'when the companion gets too far it shows a yellow “!” — press C to warp it to you (it never auto-teleports). Turn OFF to stress-test navigation with the stuck behaviour below. (Enable a companion on the start screen.)' },
      { key: 'companionTeleportRange', tab: 'multi', group: 'Companion', modes: M.adventure, type: 'cycle', opts: [12, 16, 20, 24, 30, 40], dflt: 20, label: 'Summon Distance', fmt: (v) => v + ' blocks', sub: true, advanced: true, hint: 'direct distance (counts vertical) before the “!” appears and you can summon the companion with C' },
      { key: 'companionStuckBehavior', tab: 'multi', group: 'Companion', modes: M.adventure, type: 'cycle', opts: ['none', 'teleport', 'follow'], dflt: 'teleport', label: 'If Companion Gets Stuck', fmt: (v) => ({ none: 'Do nothing', teleport: 'Teleport to you', follow: 'Follow mode' }[v] || v), sub: true, advanced: true, hint: 'used when Teleport is OFF: Follow mode shows a “!”, waits for you to come near, then mirrors your moves through the spot' },
      { key: 'playersPassThrough', tab: 'multi', group: 'Players', modes: M.adventure, type: 'toggle', dflt: false, label: 'Players Pass Through', hint: 'players (and the companion) don’t push each other — they overlap / share a spot instead of colliding' },
      { key: 'platformerEmeralds', tab: 'world', group: 'Scoring', modes: M.platformer, type: 'toggle', dflt: false, label: 'Collect Emeralds', hint: 'placed emeralds can be picked up and counted' },
      { key: 'platformerScore', tab: 'world', group: 'Scoring', modes: M.platformer, type: 'toggle', dflt: false, label: 'Score / Points', hint: 'track a running score (emeralds + level-clear bonus)' },
      { key: 'emeraldPoints', tab: 'world', group: 'Scoring', modes: M.platformer, type: 'cycle', opts: [50, 100, 200, 500], dflt: 100, label: 'Points / Emerald', fmt: (v) => v + ' pts', sub: true, dependsOn: 'platformerScore', advanced: true, hint: 'score awarded per emerald' },
      { key: 'goalClearPoints', tab: 'world', group: 'Scoring', modes: M.platformer, type: 'cycle', opts: [0, 500, 1000, 2000], dflt: 1000, label: 'Level-Clear Bonus', fmt: (v) => v + ' pts', sub: true, dependsOn: 'platformerScore', advanced: true, hint: 'score awarded for reaching a Goal Star' },
      { key: 'physicsLocked', tab: 'world', group: 'Designer Locks', modes: ['sandbox'], type: 'toggle', dflt: true, label: 'Lock Physics', advanced: true, hint: 'ON (default): players can’t change Gravity or Jump Height while playing your level, so its jumps stay as you tuned them. You can always change them here in Sandbox.' },
      { key: 'hideFromExport', tab: 'world', group: 'Designer Locks', modes: ['sandbox'], type: 'toggle', dflt: false, label: 'Hide from export', advanced: true, hint: '§40.1 — ON removes the Export buttons for this world (NOT encryption — anyone can still read the JSON in their browser; it only takes away the easy download). You can always turn it off here in Sandbox; the server still lets you, the owner, export your own world.' },

      // ── MOVEMENT (physics + moves) ──────────────────────────
      { key: 'playerMoveSpeed', tab: 'movement', group: 'Physics', modes: M.physics, type: 'cycle', opts: [0.5, 0.6, 0.75, 0.85, 1, 1.25, 1.5, 2], dflt: 1, label: 'Player Speed', fmt: (v) => v.toFixed(2).replace(/\.?0+$/, '') + 'x', hint: 'how fast players run (1x = default) — lower it so younger kids can keep up, like the overhead-view speed knob' },
      { key: 'physicsGravity', tab: 'movement', group: 'Physics', modes: M.physics, type: 'cycle', opts: O.gravity, dflt: 0.66, label: 'Gravity', fmt: pct1 },
      { key: 'jumpHeightBlocks', tab: 'movement', group: 'Physics', modes: M.physics, type: 'cycle', opts: O.jumpH, dflt: null, label: 'Jump Height', fmt: (v) => v == null ? 'Default' : v + ' bl' },
      { key: 'jumpPadVForce', tab: 'movement', group: 'Physics', modes: M.physics, type: 'cycle', opts: O.jumpPad, dflt: -18, label: 'Jump-Pad Force', fmt: String, advanced: true },
      { key: 'platformLaunchAccel', tab: 'movement', group: 'Transport', modes: M.physics, type: 'cycle', opts: [1, 1.5, 2, 3, 4, 5, 6], dflt: 3, label: 'Platform Launch Accel', fmt: (v) => v.toFixed(1) + 'x', advanced: true, hint: 'horizontal punch / distance when a moving platform hits a Launch Ramp' },
      { key: 'platformLaunchLift', tab: 'movement', group: 'Transport', modes: M.physics, type: 'cycle', opts: [1, 1.5, 2, 2.5, 3, 4], dflt: 2, label: 'Platform Launch Lift', fmt: (v) => v.toFixed(1) + 'x', advanced: true, hint: 'vertical “jump intensity” of a Launch-Ramp fling' },
      { key: 'redstoneSpeed', tab: 'world', group: 'Redstone', modes: M.physics, type: 'cycle', opts: O.redstone, dflt: 1.0, label: 'Redstone Speed', fmt: (v) => v === 'instant' ? 'Instant' : xf(v), advanced: true, hint: 'propagation speed of dust / pistons / traps — Instant = same-frame' },
      { key: 'disableXpSpeedBoost', tab: 'movement', group: 'Physics', modes: M.physics, type: 'toggle', dflt: false, label: 'Disable XP Speed Boost' },
      { key: 'sprintEnabled', tab: 'movement', group: 'Moves', modes: M.physics, type: 'toggle', label: 'Sprint', get: (a) => a.sprintEnabled !== false, set: (a, v) => { a.sprintEnabled = v; }, hint: 'hold Shift for 2× speed' },
      { key: 'autoStepUp', tab: 'movement', group: 'Moves', modes: M.physics, type: 'toggle', dflt: false, label: 'Auto-Climb', hint: 'walk up 1-block ledges' },
      { key: 'airJumpEnabled', tab: 'movement', group: 'Moves', modes: M.physics, type: 'toggle', dflt: false, label: 'Double Jump', hint: 'one mid-air jump (adds an air-roll)' },
      { key: 'doubleJumpStyle', tab: 'movement', group: 'Moves', modes: M.physics, type: 'cycle', opts: ['nospin', 'simple', 'natural'], dflt: 'simple', label: 'Double Jump Style', fmt: (v) => ({ nospin: 'No Spin', simple: 'Simple Spin', natural: 'Natural Spin' }[v] || v), sub: true, dependsOn: 'airJumpEnabled', advanced: true, hint: 'No Spin = like a normal jump; Simple Spin = tucked 360; Natural Spin = 360 keeping weapons + a hip bend' },
      { key: 'slideEnabled', tab: 'movement', group: 'Moves', modes: M.physics, type: 'toggle', dflt: false, label: 'Ground Slide', hint: 'jump + down to slide' },
      { key: 'slideInvincible', tab: 'movement', group: 'Moves', modes: M.physics, type: 'toggle', dflt: false, label: 'Slide Invincible', sub: true, dependsOn: 'slideEnabled', advanced: true },
      { key: 'slideDurationFrames', tab: 'movement', group: 'Moves', modes: M.physics, type: 'cycle', opts: O.slideDur, dflt: 30, label: 'Slide Length', fmt: (v) => v + 'f', sub: true, dependsOn: 'slideEnabled', advanced: true },
      { key: 'slideSpeedMult', tab: 'movement', group: 'Moves', modes: M.physics, type: 'cycle', opts: O.slideMult, dflt: 1.6, label: 'Slide Speed', fmt: x1, sub: true, dependsOn: 'slideEnabled', advanced: true },
      { key: 'wallSlideEnabled', tab: 'movement', group: 'Moves', modes: M.physics, type: 'toggle', dflt: false, label: 'Wall Slide', hint: 'slow-slide down a wall you press into' },
      { key: 'wallJumpLockAway', tab: 'movement', group: 'Moves', modes: M.physics, type: 'toggle', dflt: false, label: 'Wall-Jump Lock-Away', sub: true, dependsOn: 'wallSlideEnabled', advanced: true, hint: 'jump forces away, no steering till you land' },
      { key: 'ledgeHangEnabled', tab: 'movement', group: 'Moves', modes: M.physics, type: 'toggle', dflt: false, label: 'Ledge Hang', hint: 'grab & climb block edges' },
      { key: 'climbSpeed', tab: 'movement', group: 'Moves', modes: M.physics, type: 'cycle', opts: [0.5, 0.75, 1, 1.5, 2, 3], dflt: 1, label: 'Climb Speed', fmt: (v) => v.toFixed(2).replace(/\.?0+$/, '') + 'x', sub: true, dependsOn: 'ledgeHangEnabled', advanced: true, hint: 'how fast the ledge climb-up animation plays (1x = default)' },
      { key: 'ladderLockX', tab: 'movement', group: 'Moves', modes: M.physics, type: 'toggle', dflt: false, label: 'Ladder: Lock Sideways', hint: 'while climbing a Ladder, snap to its column — no side drift' },
      { key: 'ladderMidJump', tab: 'movement', group: 'Moves', modes: M.physics, type: 'toggle', dflt: false, label: 'Ladder: Jump Off Mid-Climb', hint: 'press Jump to leap off a Ladder anywhere; off = you must climb off the top first' },
      { key: 'barRequireGrab', tab: 'movement', group: 'Moves', modes: M.physics, type: 'toggle', dflt: false, label: 'Bar: Press Up to Grab', hint: 'off = you grip a monkey-Bar automatically when your hands reach it; on = you only grab while holding Up (pass under/through it otherwise). From a Bar: ← → traverse, Jump = flip off, Down+Jump = drop straight down' },
      { key: 'barMoveSpeed', tab: 'movement', group: 'Moves', modes: M.physics, type: 'cycle', opts: [1.5, 2.4, 3.5, 5], dflt: 2.4, label: 'Bar: Traverse Speed', fmt: (v) => v.toFixed(1).replace(/\.0$/, '') + ' px', sub: true, advanced: true, hint: 'how fast you swing hand-over-hand along a row of Bars (2.4 = default)' },
      { key: 'barTraverseStyle', tab: 'movement', group: 'Moves', modes: M.physics, type: 'cycle', opts: ['compactlunge', 'compactswing', 'smooth', 'brachiation', 'bigswing', 'lunge'], dflt: 'compactlunge', label: 'Bar: Traverse Style', fmt: (v) => ({ smooth: 'Smooth', brachiation: 'Brachiation', bigswing: 'Big Swing', lunge: 'Lunge', compactswing: 'Compact Swing', compactlunge: 'Compact Lunge' }[v] || v), sub: true, advanced: true, hint: 'the hand-over-hand animation. Compact Lunge (default) = Lunge’s leg kick with tight handholds; Compact Swing = Big Swing’s body/leg motion with tight handholds; plus Smooth · Brachiation · Big Swing · Lunge' },
      { key: 'crumbleSeconds', tab: 'world', group: 'Blocks', modes: M.physics, type: 'cycle', opts: [1, 2, 3, 4, 5], dflt: 2, label: 'Crumble Block Time', fmt: (v) => v + 's', hint: 'seconds of cumulative standing before a Crumbling Block falls (timer pauses when you step off, resumes when you return)' },
      { key: 'conveyorSpeed', tab: 'movement', group: 'Transport', modes: M.physics, type: 'cycle', opts: [1, 2, 3, 4], dflt: 2, label: 'Conveyor Speed', fmt: (v) => v + 'x', hint: 'how fast Conveyor blocks push (2 = default). Per-block / per-run speed is a planned follow-up' },
      { key: 'tubeDefaultSpeed', tab: 'movement', group: 'Transport', modes: M.physics, type: 'cycle', opts: [5, 7, 10, 14], dflt: 7, label: 'Travel Tube Speed', fmt: (v) => v + ' px', advanced: true, hint: 'default fly-through speed for NEW Travel Tubes (px/frame). Per-tube overrides are a planned follow-up' },
      { key: 'tubeRoundedCorners', tab: 'movement', group: 'Transport', modes: M.physics, type: 'toggle', dflt: false, label: 'Travel Tube: Rounded Bends', hint: 'smooth the bends of Travel Tubes (and round the mouth ends). Off = square corners. Works in both the smooth and Block-style looks' },
      { key: 'tubeBlockStyle', tab: 'movement', group: 'Transport', modes: M.physics, type: 'toggle', dflt: false, label: 'Travel Tube: Block Style', hint: 'draw tubes as classic per-cell glass BLOCKS (the original look) instead of the smooth continuous pipe. Mouth lips + rounded bends still apply' },
      { key: 'trampJumpBoost', tab: 'movement', group: 'Moves', modes: M.physics, type: 'toggle', dflt: false, label: 'Trampoline: Jump to Boost', hint: 'time a fresh Jump press with the upward bounce for an extra boost (release + re-press near the top of the launch)' },
      { key: 'trampEarlyPenalty', tab: 'movement', group: 'Moves', modes: M.physics, type: 'toggle', dflt: false, label: 'Trampoline: Early-Jump Penalty', sub: true, dependsOn: 'trampJumpBoost', advanced: true, hint: 'holding Jump at the instant you land on the trampoline (jumping too soon) saps the spring — a weaker launch. Rewards timing over mashing' },
      { key: 'questionContents', tab: 'world', group: 'Blocks', modes: M.physics, type: 'cycle', opts: ['coin', 'apple', 'arrow', 'glowstone'], dflt: 'coin', label: 'Block Contents', fmt: this._cap, hint: 'the DEFAULT item a Question / Breakable block yields. Blocks you set individually in the editor (Contents) override this — so it only applies to blocks left on “world default”.' },
      { key: 'glassShatter', tab: 'world', group: 'Blocks', modes: M.physics, type: 'toggle', dflt: true, label: 'Glass Shatters', hint: 'Glass blocks shatter into shards when hit by a melee swing, an arrow, an explosion, or a hard fall onto them (still minable in Normal). Off = indestructible except mining.' },
      // §Insta-Death (E11) — surfaces the hardwired Lava one-hit kill as a named, configurable setting.
      // Default ON = the classic behaviour every existing world already has. OFF makes Lava a survivable
      // damage hazard (repeated contact still kills). Falling into the End void / off the map stays deadly.
      { key: 'lavaInstaKill', tab: 'world', group: 'Blocks', modes: M.physics, type: 'toggle', dflt: true, label: 'Lava: Instant Death', hint: 'ON (default): touching Lava is a one-hit kill — the classic behaviour. OFF: Lava deals heavy contact damage instead (with brief invulnerability between hits), so a quick brush is survivable. Falling into the void / off the map is always deadly.' },
      // §Phase 5b — Look-Up Aim: hold Up/W to aim ranged weapons (and the grapple) straight
      // up; jump moves to J. Its own toggle (also auto-on when the grappling hook is enabled).
      // The rebind panel's "Legacy Jump" preset is the one-click way back to Up/W = jump.
      { key: 'aimUpEnabled', tab: 'movement', group: 'Moves', modes: M.physics, type: 'toggle', dflt: false, label: 'Look-Up Aim (Up/W)', hint: 'hold Up/W to aim straight up (bow, crossbow, trident, boomerang, grapple); jump moves to J. Rebind or pick “Legacy Jump” in Controls to restore Up/W = jump.' },

      // ── SPEED RUN ───────────────────────────────────────────
      // §E10 Rule-set presets — one click sets a batch of Pace settings for a named "feel"; every knob
      // below stays editable afterwards (Advanced toggle tucks the fine detail). Reuses the Arena
      // Custom-Rules "preset SETS defaults, leaves settings editable" pattern.
      ...this.SR_PRESETS.map(p => ({
        key: 'srPreset_' + p.id, tab: 'speedrun', group: 'Presets', modes: M.speedrun, type: 'button',
        rerender: true, label: p.label, btnLabel: 'Apply', hint: p.hint, act: (g) => this._applySrPreset(g, p),
      })),
      // §E2 Constant / Auto-speed — a true fixed auto-scroll: the runner is pinned at Max Speed the whole
      // run (no accelerate/coast). Recommended base for the Beat Grid (E-MB). Default off = the classic
      // race-car accelerate model. When ON, the Acceleration/Deceleration knobs below don't apply.
      { key: 'srConstantSpeed', tab: 'speedrun', group: 'Pace', modes: M.speedrun, type: 'toggle', dflt: false, label: 'Constant Speed (auto-run)', hint: 'ON: the runner moves at a fixed speed automatically for the whole level (a true auto-scroller) — you steer jumps, not pace. OFF (default): the race-car model where you accelerate from a stop up to Max Speed and coast when you let go.' },
      // §E1 Base + Max are independent, precise (slider + one-decimal text box). "Max = Base" removes the
      // speed-up ceiling so the runner just cruises at Base. Acceleration gains an "Instant" (no ramp) end.
      { key: 'srBaseSpeed', tab: 'speedrun', group: 'Pace', modes: M.speedrun, type: 'numbox', min: 0.3, max: 3, step: 0.1, dflt: 1.0, label: 'Base Speed', fmt: x1, hint: 'overall pace of the run (1.0 = default). Precise: drag the slider or type a value to one decimal.' },
      { key: 'srMaxEqualsBase', tab: 'speedrun', group: 'Pace', modes: M.speedrun, type: 'toggle', dflt: false, label: 'Max = Base (no speed-up)', hint: 'ON: the runner never accelerates past Base Speed — a flat cruise (the Max Speed knob is ignored). OFF (default): the runner speeds up from Base toward Max Speed.' },
      { key: 'srMaxMultiplier', tab: 'speedrun', group: 'Pace', modes: M.speedrun, type: 'numbox', min: 1, max: 5, step: 0.1, dflt: 2.0, label: 'Max Speed', fmt: x1, dependsOn: (a) => !a.srMaxEqualsBase, hint: 'top speed ceiling as a multiple of Base (2.0 = twice Base). Precise: slider or one-decimal text box.' },
      { key: 'srAccel', tab: 'speedrun', group: 'Pace', modes: M.speedrun, type: 'cycle', opts: [...O.srAccel, 'instant'], dflt: 0.5, label: 'Acceleration', fmt: (v) => v === 'instant' ? 'Instant' : v.toFixed(2) + '/f', hint: '"Instant" = no ramp, the runner is at full speed immediately. Otherwise how quickly it builds speed each frame.' },
      { key: 'srDecel', tab: 'speedrun', group: 'Pace', modes: M.speedrun, type: 'cycle', opts: O.srDecel, dflt: 2, label: 'Deceleration', fmt: (v) => v + '× accel' },
      // §E9 Instant Retry — after a death, skip the 3·2·1 restart countdown and drop straight back into
      // the run (great for tight practice loops). Trade-off: no start-signal / perfect-start speed boost.
      { key: 'srInstantRetry', tab: 'speedrun', group: 'Pace', modes: M.speedrun, type: 'toggle', dflt: false, label: 'Instant Retry', hint: 'ON: a failed run restarts immediately with no countdown — you are moving again the instant the death animation clears. OFF (default): the 3·2·1 countdown plays before each run. (Instant Retry skips the perfect-start boost.)' },
      { key: 'srBoostPct', tab: 'speedrun', group: 'Boosts', modes: M.speedrun, type: 'cycle', opts: O.srPct, dflt: 0.05, label: 'Boost Amount', fmt: (v) => Math.round(v * 100) + '%', advanced: true },
      { key: 'srTimeBoostEnabled', tab: 'speedrun', group: 'Boosts', modes: M.speedrun, type: 'toggle', get: (a) => a.srTimeBoostEnabled !== false, set: (a, v) => { a.srTimeBoostEnabled = v; }, label: 'Time Boost' },
      { key: 'srTimeBoostIntervalSec', tab: 'speedrun', group: 'Boosts', modes: M.speedrun, type: 'cycle', opts: O.srSec, dflt: 5, label: 'Time Boost Every', fmt: (v) => v + 's', sub: true, dependsOn: 'srTimeBoostEnabled', advanced: true },
      { key: 'srDistBoostEnabled', tab: 'speedrun', group: 'Boosts', modes: M.speedrun, type: 'toggle', dflt: false, label: 'Distance Boost' },
      { key: 'srDistBoostIntervalBlocks', tab: 'speedrun', group: 'Boosts', modes: M.speedrun, type: 'cycle', opts: O.srBlocks, dflt: 5, label: 'Distance Boost Every', fmt: (v) => v + ' bl', sub: true, dependsOn: 'srDistBoostEnabled', advanced: true },
      { key: 'srMinZoomSpeed', tab: 'speedrun', group: 'Camera', modes: M.speedrun, type: 'cycle', opts: O.srZoom, dflt: 1.0, label: 'Zoom-Out Start', fmt: x1 },
      { key: 'srMaxZoomSpeed', tab: 'speedrun', group: 'Camera', modes: M.speedrun, type: 'cycle', opts: O.srZoom, dflt: 2.0, label: 'Zoom-Out Max', fmt: x1 },

      // ── ARENA ───────────────────────────────────────────────
      { key: 'arenaViewType', tab: 'arena', group: 'Camera', modes: M.arena, type: 'cycle', opts: O.arenaView, dflt: 'single', label: 'World View', fmt: this._cap },
      { key: 'arenaZoomMode', tab: 'arena', group: 'Camera', modes: M.arena, type: 'cycle', opts: O.arenaZoom, dflt: 'NONE', label: 'Zoom Mode', fmt: this._cap },
      { key: 'arenaPresetZoom', tab: 'arena', group: 'Camera', modes: M.arena, type: 'cycle', opts: O.presetZoom, dflt: 1.0, label: 'Preset Zoom', fmt: (v) => v.toFixed(2) + 'x', sub: true, dependsOn: (a) => a.arenaZoomMode === 'PRESET' },
      { key: 'arenaPlayerMaxHealth', tab: 'arena', group: 'Match', modes: M.arena, type: 'cycle', opts: O.arenaHp, dflt: 20, label: 'Player Health', fmt: (v) => (v / 2) + ' ♥' },
      { key: 'arenaStartGrapple', tab: 'arena', group: 'Match', modes: M.arena, type: 'toggle', dflt: false, label: 'Start with Grappling Hook', hint: 'every player starts each life already carrying the grappling hook (Shift+RMB / bound controller button). Uses the Movement ▸ Grapple settings.' },
      { key: 'arenaKeepWeaponsOnDeath', tab: 'arena', group: 'Match', modes: M.arena, type: 'toggle', dflt: false, label: 'Keep Weapons on Death', hint: 'ON: a player keeps the ranged weapons they picked up when they respawn. OFF (default): respawn resets them to the starting loadout (bow).' },
      { key: 'arenaMobHealth', tab: 'arena', group: 'Match', modes: M.arena, type: 'cycle', opts: O.arenaMob, dflt: 'MEDIUM', label: 'Mob Difficulty', fmt: this._cap },
      { key: 'arenaRespawnTime', tab: 'arena', group: 'Match', modes: M.arena, type: 'cycle', opts: O.arenaResp, dflt: 2, label: 'Respawn Delay', fmt: (v) => v + 's', advanced: true },
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
      { key: 'bossHealthMultiplier', tab: 'multi', group: 'Boss Scaling', modes: M.adventure, type: 'cycle', opts: O.boss, dflt: 1.0, label: 'Boss Health', fmt: x1, advanced: true },
      { key: 'bossDamageMultiplier', tab: 'multi', group: 'Boss Scaling', modes: M.adventure, type: 'cycle', opts: O.boss, dflt: 1.0, label: 'Boss Damage', fmt: x1, advanced: true },
      { key: 'bossAttackRateMultiplier', tab: 'multi', group: 'Boss Scaling', modes: M.adventure, type: 'cycle', opts: O.boss, dflt: 1.0, label: 'Boss Attack Rate', fmt: x1, advanced: true },
      { key: 'disableDragonHealing', tab: 'multi', group: 'Boss Scaling', modes: M.adventure, type: 'toggle', dflt: false, label: 'Disable Dragon Healing', advanced: true },
      // §Phase E — Unlimited Arrows moved from a standalone "Combat" heading to "Ranged"
      // (with the arrow flight/charge settings). Recoverable Arrows moved with it — both are
      // arrow settings and belong together; that empties "Combat", so the heading is gone.
      { key: 'unlimitedArrows', tab: 'combat', group: 'Ranged', modes: M.adventure, type: 'toggle', dflt: false, label: 'Unlimited Arrows' },
      // Smart Mobs §6 — arrows that miss every mob stick where they land and can be
      // walked over to recover. Only meaningful when arrows are finite (hidden when
      // Unlimited Arrows is on).
      { key: 'recoverableArrows', tab: 'combat', group: 'Ranged', modes: M.adventure, type: 'toggle', dflt: false, label: 'Recoverable Arrows', showWhen: (g) => !g._worldAdvSettings.unlimitedArrows },
      // ── §Phase 4 — Bow/Crossbow flight + charged shots. Each is an INDEPENDENT opt-in:
      //    Straight Flight (no gravity arc) and Charged Shots (charge → damage ×) are
      //    separate, independently-testable changes. Apply to all ranged users (M.physics).
      { key: 'arrowStraight', tab: 'combat', group: 'Ranged', modes: M.physics, type: 'toggle', dflt: false, label: 'Straight Arrow Flight', hint: 'arrows fly perfectly straight — no gravity drop/arc' },
      { key: 'arrowSpeedMult', tab: 'combat', group: 'Ranged', modes: M.physics, type: 'cycle', opts: [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0, 4.0], dflt: 1.0, label: 'Arrow Speed', fmt: (v) => v.toFixed(2) + 'x', advanced: true },
      { key: 'chargeDamage', tab: 'combat', group: 'Ranged', modes: M.physics, type: 'toggle', dflt: false, label: 'Charged Shots (charge → damage)', hint: 'holding the fire button builds a damage multiplier (up to 3x) applied on release — uses the same charge bar' },
      { key: 'chargeDamageMax', tab: 'combat', group: 'Ranged', modes: M.physics, type: 'cycle', opts: [1.5, 2.0, 2.5, 3.0], dflt: 3.0, label: 'Max Charge Damage', fmt: (v) => v.toFixed(1) + 'x', sub: true, dependsOn: 'chargeDamage', advanced: true, hint: 'damage multiplier at a full charge' },
      { key: 'chargeSpeedMult', tab: 'combat', group: 'Ranged', modes: M.physics, type: 'cycle', opts: [0.5, 0.75, 1.0, 1.5, 2.0], dflt: 1.0, label: 'Charge Speed', fmt: (v) => v.toFixed(2) + 'x', sub: true, dependsOn: 'chargeDamage', advanced: true, hint: 'how fast the charge bar fills' },
      // ── Detection (Smart Mobs §4) — additive/opt-in. Master OFF (default) keeps the
      //    classic distance aggro; ON makes mobs detect via sight/sound/action. Per-
      //    axis toggles + ranges are advanced. Ranges are in BLOCKS. ──
      // NOTE: the mob-BEHAVIOR settings below live on the 'mobs' (Mob Settings) tab, not
      // 'combat' — Combat keeps player-facing gear (Weapons/Special Moves/Boss/Arrows).
      { key: 'smartDetection', tab: 'mobs', group: 'Detection', modes: M.physics, type: 'toggle', dflt: false, label: 'Smart Detection', hint: 'mobs detect the player by sight, sound & actions (default off = classic aggro)' },
      { key: 'detectSight',  tab: 'mobs', group: 'Detection', modes: M.physics, type: 'toggle', get: (a) => a.detectSight  !== false, set: (a, v) => { a.detectSight  = v; }, label: 'Axis · Line of Sight', sub: true, dependsOn: 'smartDetection', advanced: true, hint: 'see the player in a frontal cone (blocked by walls & bushes)' },
      { key: 'detectSound',  tab: 'mobs', group: 'Detection', modes: M.physics, type: 'toggle', get: (a) => a.detectSound  !== false, set: (a, v) => { a.detectSound  = v; }, label: 'Axis · Sound', sub: true, dependsOn: 'smartDetection', advanced: true, hint: 'hear footsteps/landings (gravel = loud, grass = silent)' },
      { key: 'detectAction', tab: 'mobs', group: 'Detection', modes: M.physics, type: 'toggle', get: (a) => a.detectAction !== false, set: (a, v) => { a.detectAction = v; }, label: 'Axis · Attacks/Jumps', sub: true, dependsOn: 'smartDetection', advanced: true, hint: 'attacking or jumping is heard' },
      { key: 'detectSightRange',  tab: 'mobs', group: 'Detection', modes: M.physics, type: 'cycle', opts: [6, 9, 12, 16], dflt: DETECT_SIGHT_RANGE_DEF, label: 'Sight Range', fmt: (v) => v + ' bl', sub: true, dependsOn: 'smartDetection', advanced: true },
      { key: 'detectSightArc',    tab: 'mobs', group: 'Detection', modes: M.physics, type: 'cycle', opts: [90, 120, 160, 220, 360], dflt: DETECT_SIGHT_ARC_DEF, label: 'Sight Cone', fmt: (v) => v + '°', sub: true, dependsOn: 'smartDetection', advanced: true, hint: '360° = eyes in the back of the head' },
      { key: 'detectSoundWalk',   tab: 'mobs', group: 'Detection', modes: M.physics, type: 'cycle', opts: [3, 5, 7, 10], dflt: DETECT_SOUND_WALK_DEF, label: 'Walk Sound', fmt: (v) => v + ' bl', sub: true, dependsOn: 'smartDetection', advanced: true },
      { key: 'detectSoundRun',    tab: 'mobs', group: 'Detection', modes: M.physics, type: 'cycle', opts: [6, 9, 12, 16], dflt: DETECT_SOUND_RUN_DEF, label: 'Run Sound', fmt: (v) => v + ' bl', sub: true, dependsOn: 'smartDetection', advanced: true },
      { key: 'detectSoundLoud',   tab: 'mobs', group: 'Detection', modes: M.physics, type: 'cycle', opts: [10, 14, 18, 24], dflt: DETECT_SOUND_LOUD_DEF, label: 'Loud-Block Sound', fmt: (v) => v + ' bl', sub: true, dependsOn: 'smartDetection', advanced: true, hint: 'gravel radius' },
      { key: 'detectActionRange', tab: 'mobs', group: 'Detection', modes: M.physics, type: 'cycle', opts: [5, 8, 12, 16], dflt: DETECT_ACTION_RANGE_DEF, label: 'Attack/Jump Sound', fmt: (v) => v + ' bl', sub: true, dependsOn: 'smartDetection', advanced: true },
      // ── Pack behavior (Smart Mobs §5) — one toggle: alerted mobs rouse nearby mobs,
      //    and melee attackers flank to opposite sides instead of stacking. ──
      { key: 'packAlert',  tab: 'mobs', group: 'Pack', modes: M.physics, type: 'toggle', dflt: false, label: 'Pack Behavior', advanced: true, hint: 'one mob spotting you alerts nearby mobs; attackers surround from both sides' },
      { key: 'packRadius', tab: 'mobs', group: 'Pack', modes: M.physics, type: 'cycle', opts: [4, 7, 10, 14], dflt: DETECT_PACK_RADIUS_DEF, label: 'Alert Spread Range', fmt: (v) => v + ' bl', sub: true, dependsOn: 'packAlert', advanced: true },
      // ── Sprint (Smart Mobs §7) — melee mobs occasionally sprint to close distance;
      //    always telegraphed (a wind-up cue precedes the burst). Own opt-in toggle. ──
      { key: 'sprintingMobs', tab: 'mobs', group: 'Sprint', modes: M.physics, type: 'toggle', dflt: false, label: 'Sprinting Mobs', hint: 'melee mobs occasionally sprint at you — telegraphed by a wind-up cue' },
      // ── Wayfinding (Smart Mobs §6) — pursuing mobs follow a real A* route around
      //    terrain (drop off ledges, route around walls/wide gaps) instead of a
      //    straight-line beeline. Own opt-in toggle, independent of Smart Detection
      //    (it also improves classic-aggro worlds). Radius/cadence = feel/perf levers. ──
      { key: 'pathAwareMobs', tab: 'mobs', group: 'Wayfinding', modes: M.physics, type: 'toggle', dflt: false, label: 'Path-Aware Mobs', advanced: true, hint: 'chasing mobs navigate terrain (jump gaps, drop off ledges, route around walls) instead of beelining you' },
      { key: 'pathSearchRadius', tab: 'mobs', group: 'Wayfinding', modes: M.physics, type: 'cycle', opts: [16, 24, 32], dflt: PATH_SEARCH_RADIUS, label: 'Path Range', fmt: (v) => v + ' bl', sub: true, dependsOn: 'pathAwareMobs', advanced: true, hint: 'how far a mob will pathfind; farther = it reverts to simple chase' },
      { key: 'pathRecomputeFrames', tab: 'mobs', group: 'Wayfinding', modes: M.physics, type: 'cycle', opts: [8, 12, 20], dflt: PATH_RECOMPUTE_FRAMES, label: 'Path Update', fmt: (v) => 'every ' + v + 'f', sub: true, dependsOn: 'pathAwareMobs', advanced: true, hint: 'how often the route recomputes (lower = snappier, costlier)' },
      // ── Retreating mobs (Smart Mobs §8) — per mob type: flee at low HP (+ advanced
      //    HP-% threshold). Coexists with Skeleton kiting. ──
      ...this._fleeRows(M),
      // ── Spider webs (Smart Mobs §9) — Cave Spiders spit slowing webs. Opt-in;
      //    slowness / duration / stacking are advanced. ──
      { key: 'spiderWebs',     tab: 'mobs', group: 'Spider Webs', modes: M.physics, type: 'toggle', dflt: false, label: 'Spider Webs', advanced: true, hint: 'Cave Spiders spit webs that slow you (webbing shows while slowed)' },
      { key: 'webSlowPct',     tab: 'mobs', group: 'Spider Webs', modes: M.physics, type: 'cycle', opts: [20, 33, 50, 67], dflt: 33, label: 'Slowness', fmt: (v) => v + '%', sub: true, dependsOn: 'spiderWebs', advanced: true, hint: 'speed removed per web (33% → 67% speed)' },
      { key: 'webDurationSec', tab: 'mobs', group: 'Spider Webs', modes: M.physics, type: 'cycle', opts: [2, 3, 5, 8], dflt: 3, label: 'Duration', fmt: (v) => v + 's', sub: true, dependsOn: 'spiderWebs', advanced: true },
      { key: 'webStacking',    tab: 'mobs', group: 'Spider Webs', modes: M.physics, type: 'toggle', dflt: false, label: 'Stacking', sub: true, dependsOn: 'spiderWebs', advanced: true, hint: 'a second web compounds the slow + resets the timer' },
      // ── Special moves (Smart Mobs §2) — per-weapon context attacks ──
      { key: 'slideAttack', tab: 'combat', group: 'Special Moves', modes: M.physics, type: 'toggle', dflt: false, label: 'Slide Attack (Spear)', hint: 'ground-slide with a spear launches nearby mobs into the air' },
      { key: 'slideAttackDmg', tab: 'combat', group: 'Special Moves', modes: M.physics, type: 'cycle', opts: O.wdmg, dflt: 1.0, label: 'Slide Attack Damage', fmt: x1, advanced: true, dependsOn: 'slideAttack' },
      // §Phase 6 — one master toggle for all four directional melee variants (Up/Down
      // overhead+low with the crouch/short height interaction, Forward = +dmg/−knockback,
      // Back = +knockback/−dmg). Applies to PvE + PvP.
      { key: 'advancedAttacks', tab: 'combat', group: 'Special Moves', modes: M.physics, type: 'toggle', dflt: false, label: 'Advanced Attacks (directional)', hint: 'hold a direction while attacking: Up = overhead (misses crouchers), Down = low (hits short/crouching), Forward = more damage, Back = more knockback' },
      // §Phase 7 — per-combo toggles (each independently enabled), generated from the
      // data-driven COMBOS.DEFS so the list is the SAME source future custom combos extend.
      ...this._comboRows(M),
      // ── Weapons (Smart Mobs §2) — starting weapon + per-weapon trait config;
      //    the Trident's recall/guided/turn-speed live under Weapon · Trident. ──
      ...this._weaponRows(M, O, x1),
      // (Audio, Controls, Show-Health-Bars and Disable-Chat are PLAYER settings —
      //  they live in the pause-menu Settings tab, not here. Mob Drops = its own tab.)
    ];
  },

  // Smart Mobs §2 — generate the Combat-tab Weapons rows. Starting-weapon
  // selectors set what the player spawns holding; per-weapon rows write trait
  // overrides into _worldAdvSettings.weapons[class] (read by Game._meleeTraits /
  // _rangedTraits). Each row carries a unique synthetic `key` for DOM wiring but
  // stores via get/set, so nothing lands in _worldAdvSettings[key] directly.
  _weaponRows(M, O, x1) {
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    const modes = M.physics; // normal / platformer / arena / sandbox
    const gW = (cls, field, dflt) => (a) => {
      const w = a.weapons && a.weapons[cls];
      return (w && w[field] != null) ? w[field] : dflt;
    };
    const sW = (cls, field) => (a, v) => {
      if (!a.weapons) a.weapons = {};
      if (!a.weapons[cls]) a.weapons[cls] = {};
      a.weapons[cls][field] = v;
    };
    const rows = [
      { key: 'startingMelee',  tab: 'combat', group: 'Weapons', modes, type: 'cycle', opts: ['sword', 'spear', 'axe', 'trident', 'boomerang', 'none'], dflt: 'sword', label: 'Melee Weapon', fmt: cap, hint: 'weapon the player starts holding (None = base wooden sword only). Boomerang requires its opt-in toggle below.' },
      { key: 'startingRanged', tab: 'combat', group: 'Weapons', modes, type: 'cycle', opts: ['none', 'bow', 'crossbow'], dflt: 'none', label: 'Ranged Weapon', fmt: cap, hint: 'ranged weapon the player starts with (None = none until found/crafted)' },
    ];
    // [field, label, opts|null(→toggle), dflt, fmt] per weapon class.
    const spec = {
      sword:    [['dmgMult', 'Damage', O.wdmg, 1.0, x1], ['atkSpeed', 'Attack Speed', O.wspd, 1.0, x1], ['hitAll', 'Hit All Mobs', null, false]],
      spear:    [['dmgMult', 'Damage', O.wdmg, 0.7, x1], ['atkSpeed', 'Attack Speed', O.wspd, 1.0, x1], ['hitAll', 'Hit All Mobs', null, false]],
      axe:      [['dmgMult', 'Damage', O.wdmg, 1.45, x1], ['atkSpeed', 'Attack Speed', O.wspd, 1.0, x1], ['knockback', 'Knockback', O.wknock, 1.9, x1]],
      trident:  [['dmgMult', 'Damage', O.wdmg, 1.1, x1], ['atkSpeed', 'Attack Speed', O.wspd, 1.0, x1], ['throwable', 'Throwable', null, true]],
      bow:      [['dmgMult', 'Damage', O.wdmg, 1.0, x1], ['pierce', 'Piercing', null, false]],
      crossbow: [['dmgMult', 'Damage', O.wdmg, 1.25, x1], ['pierce', 'Piercing', null, true]],
    };
    for (const cls of ['sword', 'spear', 'axe', 'trident', 'bow', 'crossbow']) {
      const g = `Weapon · ${cap(cls)}`;
      for (const [field, label, opts, dflt, fmt] of spec[cls]) {
        const row = { key: `wpn_${cls}_${field}`, tab: 'combat', group: g,
          modes, advanced: true, label, get: gW(cls, field, dflt), set: sW(cls, field) };
        if (opts) { row.type = 'cycle'; row.opts = opts; row.dflt = dflt; row.fmt = fmt; }
        else { row.type = 'toggle'; row.dflt = dflt; }
        rows.push(row);
      }
      // Trident-specific throw behaviour lives under its own weapon group (Smart Mobs §6).
      if (cls === 'trident') {
        rows.push({ key: 'tridentAutoReturn', tab: 'combat', group: g, modes, type: 'toggle', dflt: true, label: 'Recall (right-click)', advanced: true });
        rows.push({ key: 'guidedTrident',     tab: 'combat', group: g, modes, type: 'toggle', dflt: true, label: 'Guided (steer to cursor)', advanced: true });
        rows.push({ key: 'tridentTurn',        tab: 'combat', group: g, modes, type: 'slider', dflt: 30, label: 'Guided Turn Speed', advanced: true, dependsOn: 'guidedTrident' });
      }
    }
    // §Phase 3 — Boomerang (new-weapon opt-in pattern): a single toggle grants the weapon
    // in this world; the rest are feel-tuning knobs. Some are flagged as candidates Kevin
    // may prune later (steer intensity, return-speed mult) per the brief.
    const bg = 'Weapon · Boomerang';
    rows.push({ key: 'boomerangLook', tab: 'combat', group: bg, modes, type: 'cycle', opts: ['2d', 'iso'], dflt: '2d', label: 'Look', fmt: (v) => v === 'iso' ? 'Isometric spin' : '2D top-down spin', sub: true, advanced: true, hint: '2D = a flat spinning boomerang; Isometric = a pseudo-3D tumble (build-then-judge by eye)' });
    rows.push({ key: 'boomerangRange', tab: 'combat', group: bg, modes, type: 'cycle', opts: [6, 8, 10, 12, 16], dflt: 10, label: 'Range', fmt: (v) => v + ' bl', sub: true, advanced: true });
    rows.push({ key: 'boomerangSpeed', tab: 'combat', group: bg, modes, type: 'cycle', opts: [12, 14, 17, 20, 24], dflt: 17, label: 'Speed', fmt: (v) => v + ' px/f', sub: true, advanced: true });
    rows.push({ key: 'boomerangDecel', tab: 'combat', group: bg, modes, type: 'cycle', opts: [50, 60, 75, 90], dflt: 75, label: 'Deceleration Point', fmt: (v) => v + '% of range', sub: true, advanced: true, hint: 'where in the outbound arc it starts slowing down' });
    // Candidate knobs (may be pruned later) — flagged per the brief.
    rows.push({ key: 'boomerangSteer', tab: 'combat', group: bg, modes, type: 'slider', dflt: 30, label: 'Steer Intensity ⚗', sub: true, advanced: true, hint: 'homing strength toward the cursor on both legs (candidate — may be pruned)' });
    rows.push({ key: 'boomerangReturnMult', tab: 'combat', group: bg, modes, type: 'cycle', opts: [0.75, 1.0, 1.25, 1.5], dflt: 1.0, label: 'Return Speed ⚗', fmt: (v) => v.toFixed(2) + 'x', sub: true, advanced: true, hint: 'return-leg speed vs outbound (candidate — may be pruned)' });
    // §Phase F — wall interaction + return trigger.
    rows.push({ key: 'boomerangWall', tab: 'combat', group: bg, modes, type: 'cycle', opts: ['pass', 'stop'], dflt: 'pass', label: 'Wall Mode', fmt: (v) => v === 'stop' ? 'Stop at Blocks' : 'Pass Through', sub: true, hint: 'Pass Through = flies over/through blocks (its signature trait); Stop = interacts with blocks' });
    rows.push({ key: 'boomerangOnBlock', tab: 'combat', group: bg, modes, type: 'cycle', opts: ['earlyReturn', 'stick'], dflt: 'earlyReturn', label: 'On Block Hit', fmt: (v) => v === 'stick' ? 'Stick (drop it)' : 'Early Return', sub: true, advanced: true, dependsOn: (a) => a.weaponBoomerang && a.boomerangWall === 'stop', hint: 'Early Return = turn back on contact; Stick = embed like a Trident (you lose it until picked up)' });
    rows.push({ key: 'boomerangReturn', tab: 'combat', group: bg, modes, type: 'cycle', opts: ['auto', 'click'], dflt: 'auto', label: 'Return Trigger', fmt: (v) => v === 'click' ? 'Click to Return' : 'Auto-Return', sub: true, hint: 'Auto = comes back on its own; Click = flies out, waits, and recalls on the ranged button (like the Trident)' });
    // §Phase 5 — Grappling Hook (new-weapon opt-in pattern). Fires a cable, swing/climb.
    // Occupies the RANGED slot (cycle to it, or it's granted here). Enabling it also turns
    // on Aim-Up (Up/W = look-up, jump → J) so you can grapple straight up.
    const gh = 'Grappling Hook';
    rows.push({ key: 'grappleRange', tab: 'movement', group: gh, modes, type: 'cycle', opts: [6, 8, 10, 12, 16], dflt: 8, label: 'Range', fmt: (v) => v + ' bl', sub: true, advanced: true, hint: 'hook reach; nothing hit within range → it auto-retracts' });
    rows.push({ key: 'grappleDamage', tab: 'movement', group: gh, modes, type: 'cycle', opts: [0, 2, 4, 6, 9], dflt: 0, label: 'Hook Damage', fmt: (v) => v === 0 ? 'None (knockback only)' : v, sub: true, advanced: true, hint: 'damage dealt when the hook hits an enemy (it always knocks back + returns); 0 = no damage' });
    rows.push({ key: 'grappleAttach', tab: 'movement', group: gh, modes, type: 'cycle', opts: ['bottom', 'bottomSide', 'any'], dflt: 'bottom', label: 'Attach To', fmt: (v) => ({ bottom: 'Bottom edge only', bottomSide: 'Bottom + sides', any: 'Any face' }[v] || v), sub: true, advanced: true, hint: 'which block face the hook can grab; default = only the underside (bottom edge)' });
    // §Controller pass — Grapple-Pull targets (used by the "Grapple — Pull In" controller
    // action, which reels you straight to the anchor). Enemies = yank a hooked mob toward you;
    // Collectibles = latch a gem and zip to it.
    rows.push({ key: 'grappleEnemies', tab: 'movement', group: gh, modes, type: 'toggle', dflt: false, label: 'Grapple Enemies', sub: true, hint: 'Grapple-Pull can hook an enemy and YANK it toward you (instead of the default knockback)' });
    rows.push({ key: 'grappleCollectibles', tab: 'movement', group: gh, modes, type: 'toggle', dflt: false, label: 'Grapple Collectibles', sub: true, hint: 'Grapple-Pull can latch an emerald and reel you to it' });
    rows.push({ key: 'grappleReleaseBoostH', tab: 'movement', group: gh, modes, type: 'cycle', opts: [1.0, 1.5, 2.0, 2.5, 3.0, 4.0], dflt: 2.0, label: 'Release Momentum · Horizontal', fmt: (v) => v.toFixed(1) + 'x', sub: true, advanced: true, hint: 'amplifies the HORIZONTAL fling when you let go of a swing — crank it to cross bigger gaps (1x = raw physics)' });
    rows.push({ key: 'grappleReleaseBoostV', tab: 'movement', group: gh, modes, type: 'cycle', opts: [1.0, 1.5, 2.0, 3.0, 4.0, 5.0], dflt: 3.0, label: 'Release Momentum · Vertical', fmt: (v) => v.toFixed(1) + 'x', sub: true, advanced: true, hint: 'amplifies the VERTICAL fling when you let go while rising — set higher than horizontal for a big pop upward (1x = raw physics)' });
    // §follow-up — Swing Assist: build height/speed mid-swing by using Left/Right.
    //   None = raw pendulum; Lean = a steady push toward the held direction (forgiving);
    //   Pump = a bigger boost, but only when you press WITH the swing near the bottom of
    //   the arc (rewards timing, like pumping a real swing).
    rows.push({ key: 'grappleSwingAssist', tab: 'movement', group: gh, modes, type: 'cycle', opts: ['none', 'lean', 'pump'], dflt: 'lean', label: 'Swing Assist', fmt: (v) => ({ none: 'None (raw physics)', lean: 'Lean (hold ← →)', pump: 'Pump (time ← →)' }[v] || v), sub: true, hint: 'accelerate a swing with Left/Right: Lean = steady push while held; Pump = a timing boost when you press with the swing at the bottom of the arc; None = pure pendulum' });
    rows.push({ key: 'grappleSwingStrength', tab: 'movement', group: gh, modes, type: 'cycle', opts: [0.25, 0.5, 1, 1.5, 2], dflt: 0.5, label: 'Swing Assist Strength', fmt: (v) => v.toFixed(2).replace(/\.?0+$/, '') + 'x', sub: true, advanced: true, hint: 'how hard Lean/Pump push the swing (default 0.5 — the old feel was 1x and looped the sprite around). Gravity + a hard arc limit stop you swinging over the top, so higher just builds momentum faster' });
    return rows;
  },

  // §Phase 7 — one toggle per combo, built from COMBOS.DEFS (the single data-driven list).
  // Each combo is enabled independently (Kevin's per-combo granularity); all depend on the
  // Advanced Attacks master toggle (a combo is a sequence of directional attacks).
  _comboRows(M) {
    if (typeof COMBOS === 'undefined') return [];
    return COMBOS.DEFS.map((d) => ({
      key: d.enableKey, tab: 'combat', group: 'Combos', modes: M.physics, type: 'toggle', dflt: false,
      label: d.name, sub: true, dependsOn: 'advancedAttacks',
      hint: `${d.seq.join(' → ')} → finisher (knocks the target onto its back). Needs Advanced Attacks on.`,
    }));
  },

  // Smart Mobs §8 — per-mob-type low-HP behavior rows. `lowHpAction_<key>` is a VARIABLE
  // (None / Flee) so future responses can be added; `lowHpThreshold_<key>` (advanced) is
  // the HP-% at which it triggers (default 20%). Wired for the mob types where fleeing is
  // coherent (Creeper explodes, Blaze flies, Enderman teleports — their own low-HP
  // behaviors, so they're intentionally excluded).
  _fleeRows(M) {
    const cap = (s) => s.charAt(0) + s.slice(1).toLowerCase();
    const modes = M.physics;
    const MOBS = [['zombie', 'Zombie'], ['skeleton', 'Skeleton'], ['cave_spider', 'Cave Spider'],
      ['piglin', 'Piglin'], ['wither_skeleton', 'Wither Skel.']];
    const rows = [];
    for (const [key, name] of MOBS) {
      rows.push({ key: `lowHpAction_${key}`, tab: 'mobs', group: 'Retreating Mobs', modes, type: 'cycle',
        opts: ['none', 'flee'], dflt: 'none', label: name, fmt: cap, advanced: true, hint: `what ${name} does at low HP` });
      rows.push({ key: `lowHpThreshold_${key}`, tab: 'mobs', group: 'Retreating Mobs', modes, type: 'cycle',
        opts: [10, 20, 35, 50], dflt: 20, label: `${name} · Flee Below`, fmt: (v) => v + '%', sub: true, advanced: true,
        dependsOn: (a) => (a[`lowHpAction_${key}`] || 'none') !== 'none' });
    }
    return rows;
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
  // Advanced is a WORLD-CREATOR tier: it exists so a designer can hide complex,
  // non-critical knobs while building a level. It is therefore SANDBOX-ONLY — a player
  // in Normal/Platformer/Speed Run/Arena never sees advanced rows or the toggle, so the
  // in-play panel stays short and safe. (Kevin's call, build 347.)
  _advancedAllowed() { return !!(this._game && this._game.gameMode === 'sandbox'); },

  // DESIGNER LOCKS. `physicsLocked` existed since build ~11 but was never read by
  // anything — platformer-defaults.js even set it true expecting enforcement, so a player
  // could open the pause menu in a Platformer world and retune the gravity and jump height
  // the level's jumps were built around. It is now enforced, and defaults ON.
  //
  // Scope: the Movement ▸ Physics group, which is what "override movement/physics" means —
  // Gravity and Jump Height are the only rows in it a player can currently reach (the rest
  // are advanced, hence already sandbox-only). Movement ▸ Moves is deliberately NOT locked:
  // those are per-player comfort switches (sprint, auto-climb, ladder behaviour), not the
  // numbers a level's jump distances depend on.
  //
  // Sandbox is always exempt — a designer testing their own level must still reach them.
  _lockedOut(s) {
    if (this._advancedAllowed()) return false;                  // sandbox = the designer
    const a = this._game && this._game._worldAdvSettings;
    if (!a) return false;
    // Absent key = locked, so worlds saved before this defaulted safely.
    if (s.tab === 'movement' && s.group === 'Physics' && a.physicsLocked !== false) return true;
    return false;
  },

  _visible(s) {
    if (!this._modeOK(s)) return false;
    if (s.showWhen && !s.showWhen(this._game)) return false;
    if (s.advanced && !(this._advanced && this._advancedAllowed())) return false;
    if (this._lockedOut(s)) return false;
    if (!this._depOK(s)) return false;
    return true;
  },
  _tabHasRows(tabId) {
    // Mob Settings shows if it has any mob-behavior rows for this mode OR (in sandbox)
    // the special mob-drops table.
    if (tabId === 'mobs' && this._game.gameMode === 'sandbox') return true;
    // _visible, NOT _modeOK: a tab whose every row is advanced (or locked) used to show
    // with an EMPTY body — which is why Debug appeared to players. A tab now appears only
    // when it actually has something in it, so Debug follows the Advanced toggle for free
    // and any future all-advanced tab behaves the same. (Kevin's call, build 347.)
    return this.SETTINGS.some((s) => s.tab === tabId && this._visible(s));
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
    let rows = this.SETTINGS.filter((s) => s.tab === this._tab && this._visible(s));
    let body = '';
    let lastGroup = null;
    for (const s of rows) {
      if (s.group !== lastGroup) { body += `<div class="ws-group">${esc(s.group)}</div>`; lastGroup = s.group; }
      body += this._rowHtml(s, esc);
    }
    // Mob Settings tab also hosts the special mob-drops table (sandbox only), below
    // the mob-behavior switches.
    if (this._tab === 'mobs' && this._game.gameMode === 'sandbox') body += this._mobDropsHtml(esc);
    if (!body) body = '<div class="ws-empty">No settings here for this mode.</div>';

    // Every setting change re-renders (rebuilds innerHTML), which would reset the body
    // scroll to the top and force the user to scroll back down for each edit. Capture
    // the current scroll offset so we can restore it after the rebuild.
    const sameTab    = this._tab === this._lastRenderedTab;
    this._lastRenderedTab = this._tab;
    const prevScroll = sameTab ? (ov.querySelector('.ws-body')?.scrollTop || 0) : 0;

    ov.innerHTML = `
      <div class="ws-panel" role="dialog" aria-label="World Settings">
        <div class="ws-head">
          <h2>World Settings</h2>
          ${this._advancedAllowed() ? `<label class="ws-adv" title="Show advanced / less-used settings — designer tools, hidden from players">
            <input type="checkbox" id="ws-adv"${this._advanced ? ' checked' : ''}> Advanced
          </label>` : ''}
          <button class="ws-close" id="ws-close" aria-label="Close">✕</button>
        </div>
        <div class="ws-tabs">${tabBar}</div>
        <div class="ws-body">${body}</div>
      </div>`;

    // Restore the scroll position (rows can change height when toggles reveal/hide
    // sub-settings, but the same pixel offset keeps the user in essentially the same spot).
    const newBody = ov.querySelector('.ws-body');
    if (newBody) newBody.scrollTop = prevScroll;

    // Wire tab bar + header
    ov.querySelectorAll('.ws-tab').forEach((b) => b.onclick = () => { this._tab = b.dataset.tab; this._render(); });
    document.getElementById('ws-close').onclick = () => this.close();
    const advEl = document.getElementById('ws-adv');          // absent outside sandbox
    if (advEl) advEl.onchange = (e) => { this._advanced = e.target.checked; this._render(); };

    // Wire each schema control (both regular tabs and the Mob Settings behavior rows)
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
      } else if (s.type === 'numbox') {
        // el is the range (first data-key match); the number box shares the wrapper via data-numbox.
        const num = el.parentElement.querySelector(`[data-numbox="${s.key}"]`);
        const clamp = (x) => Math.min(s.max, Math.max(s.min, isNaN(x) ? s.dflt : x));
        el.oninput = () => { const v = clamp(+el.value); this._set(s, v); if (num) num.value = v.toFixed(1); };
        if (num) num.onchange = () => { const v = clamp(+num.value); this._set(s, v); num.value = v.toFixed(1); el.value = v; };
      } else if (s.type === 'button') {
        el.onclick = () => { s.act(this._game); if (s.rerender !== false) this._render(); };
      }
    }
    // Mob Settings tab: also wire the special drops table (sandbox only).
    if (this._tab === 'mobs' && this._game.gameMode === 'sandbox') this._wireMobDrops(ov);
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
    if (s.type === 'numbox') {
      // §E1 precision input — a slider plus a one-decimal number box, kept in sync.
      const v = (+this._get(s)).toFixed(1);
      const step = s.step || 0.1;
      return `<div class="ws-row">${label}<div class="ws-slwrap">
        <input type="range" min="${s.min}" max="${s.max}" step="${step}" value="${v}" class="ws-slider ws-numbox-range" data-key="${s.key}">
        <input type="number" min="${s.min}" max="${s.max}" step="${step}" value="${v}" class="ws-numbox-input" data-numbox="${s.key}"></div></div>`;
    }
    if (s.type === 'button') {
      return `<div class="ws-row">${label}<button class="ws-btn" data-key="${s.key}">${esc(s.btnLabel || 'Open')}</button></div>`;
    }
    return '';
  },
};

if (typeof window !== 'undefined') window.WORLD_SETTINGS = WORLD_SETTINGS;
if (typeof module !== 'undefined' && module.exports) module.exports = { WORLD_SETTINGS };
