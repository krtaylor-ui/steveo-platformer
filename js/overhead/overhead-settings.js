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
      // Atmosphere — day/night cycle (visual tint + a small night mob-sight boost).
      dayNight:         false,      // off by default (worlds stay in daylight)
      dayLengthSec:     120,        // seconds for one full day→night→day
      dayStart:         0.25,       // phase to start at (0 midnight · .25 dawn · .5 noon · .75 dusk)
      nightDarkness:    0.6,        // peak darkness of the night overlay (0..1; up to near-black)
      showSunMoon:      true,       // draw a faint sun/moon disc tracking the sky
      sunMoonShape:     'circle',   // 'circle' | 'square'
      shadows:          true,       // dynamic elevation shadows cast by the sun/moon
      lightRange:       5,          // UNIVERSAL reach in blocks per unit of brightness
      lavaBrightness:   0.7,        // per-object light strength (0..1)
      glowstoneBrightness: 0.95,    // per-object light strength (0..1)
      // Safety controls (falling / pits).
      blockCliffFall:   true,       // stop accidental walks off high platforms
      maxStepDown:      1,          // levels a walk may drop (0 = none; further needs a ramp/bridge)
      pitMode:          'deadly',   // 'deadly' (fall in → insta-death) | 'block' (impassable, even in GOD)
      lavaMode:         'damage',   // 'damage' (hurts continuously while touching) | 'death' (insta-kill on touch)
      lavaDamage:       4,          // damage per hit in 'damage' mode (hit is gated by i-frames)
      glassShatter:     true,       // glass breaks (into falling shards) when hit by melee/ranged; always minable in Normal
      redstoneVisibility: 'always', // 'always' | 'active' (reveal wires once powered) | 'hidden' — hides wiring/logic/sinks in play (sources stay visible)
      bridgeGuardrails: true,       // bridges have rails (can't fall off the sides); off = you can fall
      drawbridgeStyle:  'vanishing',// 'vanishing' (deck appears/disappears) | 'animated' (raises ~80° with perspective)
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

  const OH_SETTINGS = { defaults, resolve };

  // ── Editor overlay (its own menu) ───────────────────────────────────────────
  const OH_WORLD_SETTINGS = {
    _world: null, _onClose: null,
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
      const range = (key, label, min, max, step) => `<div class="ohws-row"><label>${label}</label><input type="range" data-k="${key}" min="${min}" max="${max}" step="${step}" value="${S[key]}"><span class="val" id="ohws-v-${key}">${S[key]}</span></div>`;
      const sel = (key, label, opts) => `<div class="ohws-row"><label>${label}</label><select data-k="${key}">${opts.map((o) => `<option value="${o[0]}" ${String(S[key]) === String(o[0]) ? 'selected' : ''}>${o[1]}</option>`).join('')}</select></div>`;
      const toggle = (key, label) => `<div class="ohws-row"><label>${label}</label><input type="checkbox" data-k="${key}" ${S[key] ? 'checked' : ''}></div>`;
      ov.innerHTML = `
        <div class="ohws-panel" role="dialog" aria-label="Overhead World Settings">
          <div class="ohws-head"><h2>🗺 Overhead World Settings</h2><button class="ohws-close" id="ohws-x">✕</button></div>
          <div class="ohws-body">
            <div class="ohws-grp"><h3>Movement &amp; Elevation</h3>
              ${range('moveSpeed', 'Player speed (× cell/frame)', 0.04, 0.28, 0.01)}
              ${sel('climbLevels', 'Levels a walk can climb', [['0', 'None (use ramps/ladders)'], ['1', '1 level'], ['2', '2 levels'], ['99', 'Unlimited']])}
              ${sel('playerHeight', 'Player height (levels)', [['1', '1 (walk under 2+ high)'], ['2', '2'], ['3', '3']])}
              ${range('jumpFloat', 'Jump float (up)', 0, 1, 0.05)}
              ${range('jumpScale', 'Jump scale (grow)', 0, 0.5, 0.02)}
              ${sel('jumpClear', 'Blocks a jump can clear', [['0', '0 (no vault)'], ['1', '1 block'], ['2', '2 blocks'], ['3', '3 blocks']])}
              ${sel('doubleJumpClear', 'Extra blocks the double jump adds', [['0', '0'], ['1', '+1 block'], ['2', '+2 blocks']])}
              ${toggle('sprint', 'Sprint (hold Shift)')}
              ${range('sprintMultiplier', 'Sprint speed ×', 1.1, 2.5, 0.1)}
              ${sel('dodgeAttacks', 'Jump to dodge attacks', [['none', 'No'], ['single', 'Single jump'], ['double', 'Double jump only']])}
              ${sel('dodgeMobs', 'Jump to dodge mobs', [['none', 'No'], ['single', 'Single jump'], ['double', 'Double jump only']])}
              ${toggle('doubleJump', 'Double jump')}
              ${sel('doubleJumpStyle', 'Double-jump style', [['somersault', 'Somersault (flip)'], ['spin', 'Spin']])}
            </div>
            <div class="ohws-grp"><h3>Weapons</h3>
              ${range('crossbowSpeed', 'Crossbow bolt speed', 4, 24, 1)}
              ${range('tridentSpeed', 'Trident throw speed', 4, 24, 1)}
              ${range('tridentReturnSpeed', 'Trident return speed', 4, 26, 1)}
              ${range('boomerangSpeed', 'Boomerang speed', 4, 24, 1)}
              ${range('boomerangRange', 'Boomerang range (px)', 120, 600, 20)}
              ${range('boomerangWidth', 'Boomerang arc width', 0.15, 0.7, 0.03)}
              ${range('meleeReach', 'Melee reach (× cell)', 1, 4, 0.2)}
              ${range('meleeArc', 'Melee arc (degrees)', 20, 160, 5)}
              ${sel('attackBlockHeight', 'Wall height that blocks attacks', [['1', '1 level'], ['2', '2 levels'], ['3', '3 levels'], ['99', 'Never blocked']])}
            </div>
            <div class="ohws-grp"><h3>Mobs</h3>
              ${range('mobDetectBlocks', 'Detection range (blocks)', 1, 30, 1)}
            </div>
            <div class="ohws-grp"><h3>View & Controls</h3>
              ${sel('controlScheme', 'Control scheme', [['free-aim', 'Free-Aim (mouse)'], ['move-to-aim', 'Move-to-Aim'], ['twin-stick', 'Twin-Stick']])}
              ${sel('angleLockDeg', 'Aim lock', [['0', 'Smooth'], ['45', '8-way (45°)'], ['90', '4-way (90°)']])}
              ${range('masterZoom', 'Default zoom', 0.4, 2, 0.1)}
              ${toggle('showHiddenIndicator', 'Show a ring when hidden under an overhang')}
              ${toggle('revealPlayer', 'Always show player (reveal window under canopy)')}
              ${range('revealRadius', 'Reveal-window radius (blocks)', 2, 10, 1)}
            </div>
            <div class="ohws-grp"><h3>Atmosphere — Day / Night</h3>
              ${toggle('dayNight', 'Enable day / night cycle')}
              ${range('dayLengthSec', 'Full-cycle length (seconds)', 20, 600, 10)}
              ${sel('dayStart', 'Start time of day', [['0', 'Midnight'], ['0.25', 'Dawn'], ['0.5', 'Noon'], ['0.75', 'Dusk']])}
              ${range('nightDarkness', 'Night darkness (→ near-black)', 0.2, 0.95, 0.05)}
              ${toggle('showSunMoon', 'Show a faint sun / moon')}
              ${sel('sunMoonShape', 'Sun / moon shape', [['circle', 'Circle'], ['square', 'Square']])}
              ${toggle('shadows', 'Cast shadows from raised terrain')}
              ${range('lightRange', 'Light reach per brightness (blocks)', 1, 12, 1)}
              ${range('lavaBrightness', 'Lava brightness', 0.1, 1, 0.05)}
              ${range('glowstoneBrightness', 'Glowstone brightness', 0.1, 1, 0.05)}
            </div>
            <div class="ohws-grp"><h3>Safety — Falling &amp; Pits</h3>
              ${toggle('blockCliffFall', 'Stop players walking off cliffs')}
              ${sel('maxStepDown', 'Max walk-down without a ramp/bridge', [['0', '0 (none)'], ['1', '1 level'], ['2', '2 levels'], ['99', 'Any (no guard)']])}
              ${sel('pitMode', 'Pit blocks', [['deadly', 'Deadly (fall in → death)'], ['block', 'Solid obstacle (impassable)']])}
              ${sel('lavaMode', 'Lava', [['damage', 'Damage (hurts while touching)'], ['death', 'Death (insta-kill on touch)']])}
              ${range('lavaDamage', 'Lava damage per hit', 1, 20, 1)}
              ${toggle('glassShatter', 'Glass can be shattered (melee / ranged break it)')}
              ${sel('redstoneVisibility', 'Redstone wiring in play', [['always', 'Always shown'], ['active', 'Reveal when active'], ['hidden', 'Hidden (sources still show)']])}
              ${toggle('bridgeGuardrails', 'Bridge guardrails (off = can fall off bridges)')}
              ${sel('drawbridgeStyle', 'Drawbridge style', [['vanishing', 'Vanishing (appears/disappears)'], ['animated', 'Animated (raises ~80°)']])}
            </div>
          </div>
          <div class="ohws-foot"><button id="ohws-reset">Reset to defaults</button><button class="primary" id="ohws-done">Done</button></div>
        </div>`;
      const setV = (k, v) => { S[k] = v; const el = document.getElementById('ohws-v-' + k); if (el) el.textContent = v; };
      ov.querySelectorAll('input[type=range]').forEach((el) => el.oninput = () => setV(el.dataset.k, parseFloat(el.value)));
      // Numeric-valued selects (angleLockDeg/climbLevels/playerHeight) store a
      // number; string selects (controlScheme) store the string.
      ov.querySelectorAll('select').forEach((el) => el.onchange = () => { const n = parseFloat(el.value); S[el.dataset.k] = (/^-?\d+(\.\d+)?$/.test(el.value)) ? n : el.value; });
      ov.querySelectorAll('input[type=checkbox]').forEach((el) => el.onchange = () => S[el.dataset.k] = el.checked);
      document.getElementById('ohws-x').onclick = () => this.close();
      document.getElementById('ohws-done').onclick = () => this.close();
      document.getElementById('ohws-reset').onclick = () => { this._world.settings = OH_SETTINGS.defaults(); this._render(); };
    },
  };

  if (typeof window !== 'undefined') { window.OH_SETTINGS = OH_SETTINGS; window.OH_WORLD_SETTINGS = OH_WORLD_SETTINGS; }
  if (typeof module !== 'undefined' && module.exports) module.exports = { OH_SETTINGS };
})();
