// ══════════════════════════════════════════════════════════════════════════
// Overhead Engine — its OWN world-settings model + editor overlay (§ Kevin: a
// SEPARATE menu, not a new tab on the side-view World Settings, because the
// overhead physics differ). Settings live on `world.settings`; the runtime reads
// them. Speeds that are "× unit" are multiples of a base cell (density-independent).
// ══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  function defaults() {
    return {
      // Movement (× unit = base-cell world px, so density never changes feel).
      moveSpeed:        0.11,
      climbLevels:      0,          // how many elevation levels a WALK can step up (0 = none; use ramps/ladders)
      playerHeight:     1,          // player height in levels — a block this-many-or-fewer levels above BLOCKS; taller = an overhang you pass under
      elevOffset:       0.5,        // 2.5D vertical offset per elevation level (fraction of a cell up-left); higher = taller-looking stacks. 0.5 = the maximum. (Phase 2: default raised 0.22→0.5 per Kevin; existing worlds inherit via resolve unless they saved their own.)
      lockZoom:         false,      // lock the camera zoom in play (creators who tuned a specific zoom can prevent the player changing it)
      hideFromExport:   false,      // §40.1 — hide the Export buttons so others can't download a copy (owner can always turn it off + still export)
      // Jump (impression-of-height): small float + a scale-up.
      jumpFloat:        0.4,
      jumpScale:        0.22,
      doubleJump:       true,       // allow a mid-air second jump
      doubleJumpStyle:  'somersault',// 'somersault' (head-over-heels) | 'spin' (flat rotate)
      // Jump CLEARANCE — blocks a jump can clear/mount (additive with the double jump).
      jumpClear:        1,          // e.g. 1 = clear a 1-high wall with a single jump
      doubleJumpClear:  1,          // extra blocks the double jump adds on top of jumpClear
      // Sprint (Shift by default) — a speed multiplier while held.
      sprint:           true,
      sprintMultiplier: 1.6,
      // Jump-to-dodge: 'none' | 'single' (any jump) | 'double' (only while double-jumping).
      dodgeAttacks:     'none',     // dodge ranged shots while airborne
      dodgeMobs:        'none',     // dodge mob body-contact while airborne
      // Combat / weapons — px/frame (absolute, density-independent).
      crossbowSpeed:    13,
      tridentSpeed:     12,
      tridentReturnSpeed: 15,
      boomerangSpeed:   12,
      boomerangRange:   340,
      boomerangWidth:   0.42,
      meleeReach:       2.4,        // × unit
      meleeArc:         50,         // total degrees the melee swing/cone covers
      // A target/obstacle this-many elevation levels ABOVE the attacker blocks the
      // attack (default 2 → you can attack up 1 level, not 2; attacking DOWN is
      // always allowed). Lets a player on high ground behind a 1-high wall shoot
      // down while being safe from below.
      attackBlockHeight: 2,
      // Mobs — detection range in BLOCKS (absolute, player-sprite blocks), default 10.
      mobDetectBlocks:  10,
      // View / controls.
      controlScheme:    'free-aim', // free-aim | move-to-aim | twin-stick
      angleLockDeg:     0,          // 0 = smooth aim
      masterZoom:       1.0,
      showHiddenIndicator: false,   // show a ring when the player is under an overhang
      revealPlayer:     false,      // punch a circle through canopy so the player stays visible
      revealRadius:     4,          // reveal-window radius in blocks
      depthOcclusion:   false,      // §42 — raised walls NEARER the camera hide mobs/items/devices behind them (default OFF: a fundamental layering change, on for a browser pass)
      // Atmosphere — day/night cycle (visual tint + a small night mob-sight boost).
      dayNight:         false,      // off by default (worlds stay in daylight)
      dayLengthSec:     120,        // seconds for one full day→night→day
      dayStart:         0.25,       // phase to start at (0 midnight · .25 dawn · .5 noon · .75 dusk)
      nightDarkness:    0.6,        // peak darkness of the night overlay (0..1; up to near-black)
      showSunMoon:      true,       // draw a faint sun/moon disc tracking the sky
      sunMoonShape:     'circle',   // 'circle' | 'square'
      shadows:          true,       // master shadow toggle
      shadowStyle:      'live',     // 'live' (follow sun/moon, dynamic) | 'fixed' (baked once, cheap)
      shadowDir:        'dr',       // fixed-shadow direction: dr/d/dl/r/l (down-right default)
      shadowDarkness:   0.32,       // fixed-shadow strength (0..1)
      moonShadowScale:  0.45,       // moonlit shadow strength relative to sunlit (0..1)
      adaptiveQuality:  true,       // drop expensive passes to protect the frame rate
      // Per-pass governor policy (P3.9): 'protected' (dropped only as a last resort) |
      // 'sacrificeable' (dropped first, cheapest-first) | 'off' (never drawn). Defaults keep
      // the old behaviour: glare goes first; shadows + night are protected ("never take my
      // shadows"). The governor's order under load: sacrificeable → lower cap → protected.
      qualityShadows:   'protected',
      qualityNight:     'protected',
      qualityGlare:     'sacrificeable',
      fpsCap:           60,         // hold a STEADY cap rather than swinging 8-to-60
      lightRange:       5,          // UNIVERSAL reach in blocks per unit of brightness
      lavaBrightness:   0.7,        // per-object light strength (0..1)
      glowstoneBrightness: 0.95,    // per-object light strength (0..1)
      // Safety controls (falling / pits).
      blockCliffFall:   true,       // stop accidental walks off high platforms
      maxStepDown:      2,          // levels a walk may drop (0 = none; further needs a ramp/bridge). (Phase 2: default raised 1→2 per Kevin.)
      pitMode:          'block',    // 'block' (impassable obstacle — the DEFAULT: pits are walls, not deaths) | 'deadly' (fall in → insta-death). (Phase 2: default flipped deadly→block per Kevin.)
      lavaMode:         'damage',   // 'damage' (hurts continuously while touching) | 'death' (insta-kill on touch)
      lavaDamage:       4,          // damage per hit in 'damage' mode (hit is gated by i-frames)
      glassShatter:     true,       // glass breaks (into falling shards) when hit by melee/ranged; always minable in Normal
      redstoneVisibility: 'always', // 'always' | 'active' (reveal wires once powered) | 'hidden' — hides wiring/logic/sinks in play (sources stay visible)
      bridgeGuardrails: true,       // bridges have rails (can't fall off the sides); off = you can fall
      drawbridgeStyle:  'vanishing',// 'vanishing' (deck appears/disappears) | 'animated' (raises ~80° with perspective)
      // Interaction animations (pipe climb-in now; portal/lever/chest to follow).
      pipeClimbAnim:    true,       // play the pull-up climb when entering a pipe (off = instant)
      portalStepAnim:   true,       // play a step-in + spin-warp when entering a portal (off = instant)
      leverReachAnim:   true,       // the player reaches an arm out when flipping a lever / using a lock
      interactionZoom:  1.25,       // camera zoom during an interaction animation (overrides game zoom)
      interactionSpeed: 1,          // interaction-animation speed multiplier
    };
  }

  // Merge stored settings over defaults (and fold legacy top-level fields).
  function resolve(world) {
    const d = defaults();
    const s = (world && world.settings) || {};
    const out = Object.assign(d, s);
    // Legacy fields written before settings existed.
    if (world) {
      if (world.controlScheme && !s.controlScheme) out.controlScheme = world.controlScheme;
      if (world.angleLockDeg != null && s.angleLockDeg == null) out.angleLockDeg = world.angleLockDeg;
      // (Legacy rules.autoClimb is intentionally NOT folded in — it caused old
      //  worlds to allow 1-level walking climbs even with the setting at "None".
      //  climbLevels comes purely from settings now, default 0.)
      if (world.showHiddenIndicator != null && s.showHiddenIndicator == null) out.showHiddenIndicator = world.showHiddenIndicator;
    }
    // Legacy lava: a world saved with the old lavaDeadly boolean (and no lavaMode yet)
    // maps true → 'death', false → 'damage'. Checked on the RAW saved settings so the
    // default lavaMode:'damage' doesn't mask it.
    if (s.lavaMode == null && s.lavaDeadly != null) out.lavaMode = s.lavaDeadly ? 'death' : 'damage';
    return out;
  }

  // Current overhead world-save schema version. BUMP this whenever the save FORMAT changes in a
  // way old worlds need upgrading for, and add a matching `if (v < N) { …; v = N; }` step in
  // migrate(). See FUTURE_ROADMAP "SAVE-FILE FORMAT & MIGRATION".
  const SCHEMA = 2;   // v2: legacy sink `channel` → rxChannel (QA F10)
  // Bring a loaded world up to the current schema: run each versioned upgrade step in order,
  // then stamp the version + resolve settings. Steps must be small, idempotent, and never
  // destructive. A world saved by a NEWER build (v > SCHEMA) is loaded as-is (not downgraded).
  function migrate(world) {
    if (!world) return world;
    let v = world.schemaVersion | 0;
    if (v < 1) {
      // v0 (unversioned, everything before this migrator) → v1: guarantee the structure arrays
      // exist so every load site can rely on them (gates/redstone/bridges are newer additions).
      world.buildings = world.buildings || [];
      world.mobs = world.mobs || []; world.items = world.items || [];
      world.redstone = world.redstone || []; world.bridges = world.bridges || []; world.gates = world.gates || [];
      v = 1;
    }
    if (v < 2) {
      // v1 → v2: legacy `channel` on a SINK meant "the bus I am attached to" — in the
      // original model a lever and a drawbridge shared channel 'gate' and it drove both
      // ends. The current model split that into txChannel (broadcast) / rxChannel +
      // rxIds (listen), and evaluate() only ever reads rxChannel — so a pre-v2 piston or
      // lamp wired by `channel` loaded INERT, with no error and nothing to see but
      // "Not listening to any transmitter yet" buried in its modal. Copy the intent
      // across. (QA F10.)
      const SINK = { lamp: 1, piston: 1, rx: 1 };
      for (const d of (world.redstone || [])) {
        if (!SINK[d.kind]) continue;
        if (d.channel && !d.rxChannel && !(Array.isArray(d.rxIds) && d.rxIds.length)) d.rxChannel = d.channel;
      }
      v = 2;
    }
    // Future format changes go here, e.g.:
    //   if (v < 3) { /* worlds < v3 keep the pre-341 2×2 pipe size, etc. */ v = 3; }
    if (v > SCHEMA) v = world.schemaVersion | 0;   // future world — don't invent steps; keep its stamp
    else world.schemaVersion = v;
    world.settings = resolve(world);
    return world;
  }

  const OH_SETTINGS = { defaults, resolve, migrate, SCHEMA };

  // ── Editor overlay (its own menu) ───────────────────────────────────────────
  // Declarative schema for the overhead World Settings panel (build 370). Same shape as
  // world-settings-ui.js: { key, group, type, opts/min/max/step, label, advanced, hint }.
  // Converting the hand-written HTML to a schema is what gives the panel an Advanced tier +
  // help text, and makes the future user-guide generatable from data rather than by hand.
  //
  // Tier = Kevin's classification (Phase 2 brief). Named rows are pinned basic/advanced here;
  // rows he did not name keep their prior tier, which was "always shown" = basic. `advanced`
  // rows only render when the designer turns Advanced on (this panel is editor-only, so the
  // sandbox/designer context is implicit — a player never opens it).
  const R = (key, group, min, max, step, label, advanced, hint) => ({ key, group, type: 'range', min, max, step, label, advanced: !!advanced, hint });
  const SEL = (key, group, opts, label, advanced, hint) => ({ key, group, type: 'sel', opts, label, advanced: !!advanced, hint });
  const TOG = (key, group, label, advanced, hint) => ({ key, group, type: 'toggle', label, advanced: !!advanced, hint });
  const G_MOVE = 'Movement & Elevation', G_WEP = 'Weapons', G_VIEW = 'View & Controls',
        G_ATM = 'Atmosphere — Day / Night', G_THREAT = 'Threats', G_LOCK = 'Designer Locks', G_ANIM = 'Interaction animations';
  const SETTINGS_SCHEMA = [
    // ── Movement & Elevation ── (doubleJump/doubleJumpStyle moved ABOVE doubleJumpClear so
    //    the switch precedes the knob that depends on it.)
    R('moveSpeed', G_MOVE, 0.04, 0.28, 0.01, 'Player speed (× cell/frame)', false, 'how fast a walk moves — the core movement feel'),
    SEL('climbLevels', G_MOVE, [['0', 'None (use ramps/ladders)'], ['1', '1 level'], ['2', '2 levels'], ['99', 'Unlimited']], 'Levels a walk can climb', false, 'how many elevation levels a plain walk can step straight up'),
    SEL('playerHeight', G_MOVE, [['1', '1 (a level = full height)'], ['2', '2 (a level = ½ height)'], ['3', '3 (a level = ⅓ height)'], ['4', '4']], 'Player height (levels — scales elevation)', true, 'taller players pass UNDER lower overhangs; also scales how tall a level looks'),
    R('elevOffset', G_MOVE, 0.1, 0.5, 0.02, '3D height offset per level (taller-looking stacks)', true, 'the 2.5D lift per elevation level; higher = taller-looking stacks (0.5 = max)'),
    R('jumpFloat', G_MOVE, 0, 1, 0.05, 'Jump float (up)', true, 'how much a jump floats upward on screen'),
    R('jumpScale', G_MOVE, 0, 0.5, 0.02, 'Jump scale (grow)', true, 'how much the sprite grows at the top of a jump (impression of height)'),
    SEL('jumpClear', G_MOVE, [['0', '0 (no vault)'], ['1', '1 block'], ['2', '2 blocks'], ['3', '3 blocks']], 'Blocks a jump can clear', false, 'wall height a single jump can vault/mount'),
    TOG('doubleJump', G_MOVE, 'Double jump', false, 'allow a mid-air second jump'),
    SEL('doubleJumpStyle', G_MOVE, [['somersault', 'Somersault (flip)'], ['spin', 'Spin']], 'Double-jump style', false, 'the animation the second jump plays'),
    SEL('doubleJumpClear', G_MOVE, [['0', '0'], ['1', '+1 block'], ['2', '+2 blocks']], 'Extra blocks the double jump adds', false, 'extra vault height the double jump adds on top of Blocks a jump can clear'),
    TOG('sprint', G_MOVE, 'Sprint (hold Shift)', false, 'let the player hold Shift to run'),
    R('sprintMultiplier', G_MOVE, 1.1, 2.5, 0.1, 'Sprint speed ×', true, 'how much faster sprinting is than walking'),
    SEL('dodgeAttacks', G_MOVE, [['none', 'No'], ['single', 'Single jump'], ['double', 'Double jump only']], 'Jump to dodge attacks', false, 'a jump can dodge incoming ranged shots'),
    SEL('dodgeMobs', G_MOVE, [['none', 'No'], ['single', 'Single jump'], ['double', 'Double jump only']], 'Jump to dodge mobs', false, 'a jump can dodge mob body-contact'),
    // ── Weapons ── (entire group Advanced.)
    R('crossbowSpeed', G_WEP, 4, 24, 1, 'Crossbow bolt speed', true),
    R('tridentSpeed', G_WEP, 4, 24, 1, 'Trident throw speed', true),
    R('tridentReturnSpeed', G_WEP, 4, 26, 1, 'Trident return speed', true),
    R('boomerangSpeed', G_WEP, 4, 24, 1, 'Boomerang speed', true),
    R('boomerangRange', G_WEP, 120, 600, 20, 'Boomerang range (px)', true),
    R('boomerangWidth', G_WEP, 0.15, 0.7, 0.03, 'Boomerang arc width', true),
    R('meleeReach', G_WEP, 1, 4, 0.2, 'Melee reach (× cell)', true, 'melee cone reach in player-blocks (density-independent)'),
    R('meleeArc', G_WEP, 20, 160, 5, 'Melee arc (degrees)', true),
    SEL('attackBlockHeight', G_WEP, [['1', '1 level'], ['2', '2 levels'], ['3', '3 levels'], ['99', 'Never blocked']], 'Wall height that blocks attacks', true, 'a wall this many levels above the attacker blocks the shot (attacking DOWN is always allowed)'),
    // ── View & Controls ──
    SEL('controlScheme', G_VIEW, [['free-aim', 'Free-Aim (mouse)'], ['move-to-aim', 'Move-to-Aim'], ['twin-stick', 'Twin-Stick']], 'Control scheme', false),
    SEL('angleLockDeg', G_VIEW, [['0', 'Smooth'], ['45', '8-way (45°)'], ['90', '4-way (90°)']], 'Aim lock', false),
    R('masterZoom', G_VIEW, 0.4, 2, 0.1, 'Default zoom', false, 'starting camera zoom (players can change it unless Lock zoom is on)'),
    TOG('lockZoom', G_VIEW, 'Lock zoom in play (players cannot change it)', false),
    TOG('showHiddenIndicator', G_VIEW, 'Show a ring when hidden under an overhang', false),
    TOG('revealPlayer', G_VIEW, 'Always show player (reveal window under canopy)', false),
    R('revealRadius', G_VIEW, 2, 10, 1, 'Reveal-window radius (blocks)', false),
    TOG('depthOcclusion', G_VIEW, 'Walls hide things behind them (depth occlusion)', true, '§42 — a raised wall nearer the camera hides a mob/item/device standing behind it (a taller wall, not a shorter one). Default OFF: it changes how everything layers, so it wants a browser pass before it becomes the default.'),
    // ── Atmosphere — Day / Night ──
    TOG('dayNight', G_ATM, 'Enable day / night cycle', false),
    R('dayLengthSec', G_ATM, 20, 600, 10, 'Full-cycle length (seconds)', false),
    SEL('dayStart', G_ATM, [['0', 'Midnight'], ['0.25', 'Dawn'], ['0.5', 'Noon'], ['0.75', 'Dusk']], 'Start time of day', true),
    R('nightDarkness', G_ATM, 0.2, 0.95, 0.05, 'Night darkness (→ near-black)', false),
    TOG('showSunMoon', G_ATM, 'Show a faint sun / moon', false),
    SEL('sunMoonShape', G_ATM, [['circle', 'Circle'], ['square', 'Square']], 'Sun / moon shape', false),
    TOG('shadows', G_ATM, 'Cast shadows from raised terrain', false),
    SEL('shadowStyle', G_ATM, [['live', 'Live (follows sun/moon)'], ['fixed', 'Fixed (baked once — cheaper)']], 'Shadow style', true, 'Live shadows track the sun/moon (prettier, costlier); Fixed bakes once and is cheaper'),
    SEL('shadowDir', G_ATM, [['dr', 'Down-right'], ['d', 'Down'], ['dl', 'Down-left'], ['r', 'Right'], ['l', 'Left']], 'Fixed shadow falls', true),
    R('shadowDarkness', G_ATM, 0.1, 0.7, 0.05, 'Fixed shadow darkness', false),
    R('moonShadowScale', G_ATM, 0, 1, 0.05, 'Moon shadow strength (vs sun)', false),
    TOG('adaptiveQuality', G_ATM, 'Adaptive quality (protect frame rate)', false),
    SEL('fpsCap', G_ATM, [['60', '60 (uncapped)'], ['45', '45'], ['30', '30 (steadiest)']], 'Frame-rate cap', false),
    SEL('qualityShadows', G_ATM, [['protected', 'Protected (drop last)'], ['sacrificeable', 'Sacrificeable (drop early)'], ['off', 'Off (never draw)']], 'Shadows — when frames drop', true, 'how the frame-rate governor treats shadows under load: Protected = never take my shadows unless nothing else works; Sacrificeable = give them up early; Off = never draw them'),
    SEL('qualityNight', G_ATM, [['protected', 'Protected (drop last)'], ['sacrificeable', 'Sacrificeable (drop early)'], ['off', 'Off (never draw)']], 'Night lighting — when frames drop', true, 'governor policy for the night darkness pass'),
    SEL('qualityGlare', G_ATM, [['protected', 'Protected (drop last)'], ['sacrificeable', 'Sacrificeable (drop early)'], ['off', 'Off (never draw)']], 'Glass glare — when frames drop', true, 'governor policy for the glass-glare pass (cheapest; the default first to go)'),
    R('lightRange', G_ATM, 1, 12, 1, 'Light reach per brightness (blocks)', false),
    R('lavaBrightness', G_ATM, 0.1, 1, 0.05, 'Lava brightness', false),
    R('glowstoneBrightness', G_ATM, 0.1, 1, 0.05, 'Glowstone brightness', false),
    // ── Threats (was "Safety — Falling & Pits"; mobDetectBlocks moved in from Mobs) ──
    TOG('blockCliffFall', G_THREAT, 'Stop players walking off cliffs', false, 'stop accidental walks off a high edge'),
    SEL('maxStepDown', G_THREAT, [['0', '0 (none)'], ['1', '1 level'], ['2', '2 levels'], ['99', 'Any (no guard)']], 'Max walk-down without a ramp/bridge', true, 'how far a walk may drop without a ramp/bridge'),
    SEL('pitMode', G_THREAT, [['deadly', 'Deadly (fall in → death)'], ['block', 'Solid obstacle (impassable)']], 'Pit blocks', true, 'default is a solid obstacle — pits are walls, not instant death'),
    SEL('lavaMode', G_THREAT, [['damage', 'Damage (hurts while touching)'], ['death', 'Death (insta-kill on touch)']], 'Lava', true),
    R('lavaDamage', G_THREAT, 1, 20, 1, 'Lava damage per hit', true),
    TOG('glassShatter', G_THREAT, 'Glass can be shattered (melee / ranged break it)', true),
    R('mobDetectBlocks', G_THREAT, 1, 30, 1, 'Mob detection range (blocks)', true, 'how far a mob can notice the player'),
    SEL('redstoneVisibility', G_THREAT, [['always', 'Always shown'], ['active', 'Reveal when active'], ['hidden', 'Hidden (sources still show)']], 'Redstone wiring in play', false),
    TOG('bridgeGuardrails', G_THREAT, 'Bridge guardrails (off = can fall off bridges)', false),
    SEL('drawbridgeStyle', G_THREAT, [['vanishing', 'Vanishing (appears/disappears)'], ['animated', 'Animated (raises ~80°)']], 'Drawbridge style', false),
    // ── Designer Locks ──
    TOG('hideFromExport', G_LOCK, 'Hide from export (others can’t download a copy)', false, 'ON hides the Export buttons so others can’t grab a copy; you can always turn it off and still export your own world'),
    // ── Interaction animations ──
    TOG('pipeClimbAnim', G_ANIM, 'Pipe climb-in (pull-up) — off = instant', false),
    TOG('portalStepAnim', G_ANIM, 'Portal step-through (spin-warp) — off = instant', false),
    TOG('leverReachAnim', G_ANIM, 'Reach out to flip levers / use locks', false),
    R('interactionZoom', G_ANIM, 1, 2, 0.05, 'Interaction zoom (overrides game zoom)', true),
    R('interactionSpeed', G_ANIM, 0.5, 2, 0.1, 'Interaction animation speed', true),
  ];
  // Group render order (empty groups auto-hide, so the removed "Mobs" group just vanishes).
  const GROUP_ORDER = [G_MOVE, G_WEP, G_VIEW, G_ATM, G_THREAT, G_LOCK, G_ANIM];

  const OH_WORLD_SETTINGS = {
    _world: null, _onClose: null, _advanced: false,
    SETTINGS_SCHEMA, GROUP_ORDER,
    isOpen() { const o = document.getElementById('ohws-overlay'); return !!o && o.style.display === 'flex'; },

    open(world, onClose) {
      this._world = world; this._onClose = onClose || null;
      if (!world.settings) world.settings = OH_SETTINGS.resolve(world);
      this._inject();
      const ov = document.getElementById('ohws-overlay'); ov.style.display = 'flex';
      if (!this._key) { this._key = (e) => { if (e.key === 'Escape' && this.isOpen()) { e.stopPropagation(); this.close(); } }; window.addEventListener('keydown', this._key, true); }
      this._render();
    },
    close() { const ov = document.getElementById('ohws-overlay'); if (ov) ov.style.display = 'none'; if (this._onClose) this._onClose(); this._world = null; },

    _inject() {
      if (document.getElementById('ohws-style')) { if (!document.getElementById('ohws-overlay')) { const o = document.createElement('div'); o.id = 'ohws-overlay'; document.body.appendChild(o); } return; }
      const s = document.createElement('style'); s.id = 'ohws-style'; s.textContent = `
        #ohws-overlay{position:fixed;inset:0;z-index:9600;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.6)}
        .ohws-panel{background:#141a26;border:1px solid #2c3648;border-radius:14px;padding:0;max-width:560px;width:94%;max-height:90vh;display:flex;flex-direction:column;color:#e8eef7;font:14px sans-serif}
        .ohws-head{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #2c3648}
        .ohws-head h2{margin:0;font-size:19px} .ohws-close{background:none;border:none;color:#9fb0cc;font-size:20px;cursor:pointer}
        .ohws-adv{display:flex;align-items:center;gap:6px;font-size:12px;color:#9fb0cc;cursor:pointer} .ohws-adv input{accent-color:#4f86d8}
        .ohws-row label[title]{cursor:help}
        .ohws-body{padding:8px 20px 20px;overflow:auto}
        .ohws-grp{margin-top:16px} .ohws-grp h3{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#6ea0e0;margin:0 0 6px}
        .ohws-row{display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid #1e2636}
        .ohws-row label{flex:1;font-size:13px} .ohws-row .val{width:46px;text-align:right;color:#9fb0cc;font-family:ui-monospace,monospace;font-size:12px}
        .ohws-row input[type=range]{flex:1.2;accent-color:#4f86d8} .ohws-row select{background:#1c2230;border:1px solid #3a465c;color:#e8eef7;border-radius:6px;padding:5px}
        .ohws-foot{display:flex;justify-content:flex-end;gap:8px;padding:14px 20px;border-top:1px solid #2c3648}
        .ohws-foot button{background:#2b3548;border:1px solid #46557a;color:#dfe7f5;border-radius:7px;padding:8px 16px;cursor:pointer} .ohws-foot button.primary{background:#2e6f4e;border-color:#3f9a6c}`;
      document.head.appendChild(s);
      const o = document.createElement('div'); o.id = 'ohws-overlay'; document.body.appendChild(o);
    },

    _render() {
      const ov = document.getElementById('ohws-overlay'); if (!ov || !this._world) return;
      const S = this._world.settings;
      const esc = (x) => String(x).replace(/"/g, '&quot;');
      const row = (f) => {
        const t = f.hint ? ` title="${esc(f.hint)}"` : '';
        if (f.type === 'range') return `<div class="ohws-row"><label${t}>${f.label}</label><input type="range" data-k="${f.key}" min="${f.min}" max="${f.max}" step="${f.step}" value="${S[f.key]}"><span class="val" id="ohws-v-${f.key}">${S[f.key]}</span></div>`;
        if (f.type === 'sel') return `<div class="ohws-row"><label${t}>${f.label}</label><select data-k="${f.key}">${f.opts.map((o) => `<option value="${o[0]}" ${String(S[f.key]) === String(o[0]) ? 'selected' : ''}>${o[1]}</option>`).join('')}</select></div>`;
        return `<div class="ohws-row"><label${t}>${f.label}</label><input type="checkbox" data-k="${f.key}" ${S[f.key] ? 'checked' : ''}></div>`;
      };
      let body = '';
      for (const g of GROUP_ORDER) {
        const fields = SETTINGS_SCHEMA.filter((f) => f.group === g && this._visible(f));
        if (!fields.length) continue;                                  // a group with no visible rows hides
        body += `<div class="ohws-grp"><h3>${g}</h3>${fields.map(row).join('')}</div>`;
      }
      const advChk = `<label class="ohws-adv" title="Show advanced / less-used designer settings"><input type="checkbox" id="ohws-adv" ${this._advanced ? 'checked' : ''}> Advanced</label>`;
      ov.innerHTML = `
        <div class="ohws-panel" role="dialog" aria-label="Overhead World Settings">
          <div class="ohws-head"><h2>🗺 Overhead World Settings</h2><div style="display:flex;align-items:center;gap:14px">${advChk}<button class="ohws-close" id="ohws-x">✕</button></div></div>
          <div class="ohws-body">${body}</div>
          <div class="ohws-foot"><button id="ohws-measure" title="Render this world off-screen and MEASURE the fps for each quality tier on this machine">⏱ Measure performance</button><button id="ohws-reset">Reset to defaults</button><button class="primary" id="ohws-done">Done</button></div>
        </div>`;
      const setV = (k, v) => { S[k] = v; const el = document.getElementById('ohws-v-' + k); if (el) el.textContent = v; };
      ov.querySelectorAll('input[type=range]').forEach((el) => el.oninput = () => setV(el.dataset.k, parseFloat(el.value)));
      // Numeric-valued selects store a number; string selects store the string.
      ov.querySelectorAll('select').forEach((el) => el.onchange = () => { const n = parseFloat(el.value); S[el.dataset.k] = (/^-?\d+(\.\d+)?$/.test(el.value)) ? n : el.value; });
      ov.querySelectorAll('input[type=checkbox]').forEach((el) => { if (el.id === 'ohws-adv') return; el.onchange = () => S[el.dataset.k] = el.checked; });
      const adv = document.getElementById('ohws-adv'); if (adv) adv.onchange = () => { this._advanced = adv.checked; this._render(); };
      document.getElementById('ohws-x').onclick = () => this.close();
      document.getElementById('ohws-done').onclick = () => this.close();
      document.getElementById('ohws-reset').onclick = () => { this._world.settings = OH_SETTINGS.defaults(); this._render(); };
      const mb = document.getElementById('ohws-measure'); if (mb) mb.onclick = () => this.measure(this._world);
    },

    // ⏱ MEASURE — render THIS world off-screen and report the real per-tier fps + per-pass
    // cost on this machine (OH_PERF.assess via OverheadGame). Prefers a live game (already
    // baked + warm); otherwise builds a throwaway one. Falls back to the pure estimate() if
    // measurement can't run. Shown in a small overlay. Shared by the editor's top-bar button.
    measure(world) {
      const w = world || this._world; if (!w) return;
      let res = null;
      try {
        const live = (typeof window !== 'undefined' && window.game && window.game.map && typeof window.game.measurePerformance === 'function') ? window.game : null;
        if (live) res = live.measurePerformance();
        else if (typeof OverheadGame !== 'undefined' && OverheadGame.measureWorld) res = OverheadGame.measureWorld(w);
      } catch (e) { res = null; }
      let est = null; try { est = (typeof OH_PERF !== 'undefined') ? OH_PERF.estimate(w, {}) : null; } catch (e) {}
      this._showMeasure(res, est);
    },
    _showMeasure(res, est) {
      let ov = document.getElementById('ohws-measure-overlay');
      if (!ov) { ov = document.createElement('div'); ov.id = 'ohws-measure-overlay'; ov.style.cssText = 'position:fixed;inset:0;z-index:9700;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.6)'; document.body.appendChild(ov); }
      const row = (l, r) => `<div style="display:flex;justify-content:space-between;gap:20px;padding:3px 0;border-bottom:1px solid #1e2636"><span>${l}</span><span style="font-family:ui-monospace,monospace;color:#9fdca0">${r}</span></div>`;
      let body;
      if (res && res.tiers) {
        const fpsStr = (t) => t.fpsCapped ? (res.maxFps || 240) + '+ fps' : t.fps + ' fps';   // clamp — sub-4ms frames aren't a real fps
        const passStr = (v) => v > 0 ? v + ' ms' : 'negligible';                                // below the noise floor = not measurable, not "cheap"
        body = `<div style="font-size:12px;color:#8fa0bd;margin-bottom:8px">Measured on THIS machine — fastest of 5 rounds × 30 frames. ms/frame is the real number; fps is capped at ${(res.maxFps || 240)}.</div>`
          + res.tiers.map((t) => row(t.label, t.msPerFrame + ' ms/frame · ' + fpsStr(t))).join('')
          + `<div style="margin-top:10px;color:#6ea0e0;font-size:11px;text-transform:uppercase;letter-spacing:.08em">Per-pass cost (ms/frame over a flat baseline)</div>`
          + row('Live shadows', passStr(res.passes.shadowsLive))
          + row('Night lighting', passStr(res.passes.night))
          + row('Glass glare', passStr(res.passes.glare))
          + `<div style="margin-top:8px;color:#8fa0bd;font-size:11px">"negligible" = below the ~${res.noiseFloorMs || 0.15} ms measurement floor (this world barely uses that pass).</div>`
          + (est ? `<div style="margin-top:10px;color:#8fa0bd;font-size:12px">Prediction for reference: ${est.verdict}</div>` : '');
      } else {
        body = `<div style="color:#e6b96a">Couldn't render a measurement here.${est ? ' Showing the prediction instead:' : ''}</div>`
          + (est ? `<div style="margin-top:8px">${est.verdict}</div>` : '');
      }
      ov.innerHTML = `<div style="background:#141a26;border:1px solid #2c3648;border-radius:14px;padding:18px 22px;max-width:420px;width:92%;color:#e8eef7;font:14px sans-serif">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><h2 style="margin:0;font-size:17px">⏱ Measured performance</h2><button id="ohws-m-x" style="background:none;border:none;color:#9fb0cc;font-size:20px;cursor:pointer">✕</button></div>
        ${body}</div>`;
      ov.style.display = 'flex';
      const close = () => { ov.style.display = 'none'; };
      document.getElementById('ohws-m-x').onclick = close;
      ov.onclick = (e) => { if (e.target === ov) close(); };
    },
    // The panel is opened only by the overhead EDITOR, i.e. always the designer — so Advanced
    // is always ALLOWED here; the in-panel toggle is what gates whether advanced rows show.
    _visible(f) { return !f.advanced || this._advanced; }
  };

  if (typeof window !== 'undefined') { window.OH_SETTINGS = OH_SETTINGS; window.OH_WORLD_SETTINGS = OH_WORLD_SETTINGS; }
  if (typeof module !== 'undefined' && module.exports) module.exports = { OH_SETTINGS };
})();
