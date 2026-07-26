// ============================================================
// constants.js — Game-wide tunable constants
// ============================================================

// Single source of truth for the build version. BUMP THE BUILD NUMBER ON EVERY
// COMMIT so the in-game badge (dashboard header + menu + pause screen) identifies
// exactly which build is running. Shown via `.app-version` DOM badge + GAME_VERSION.
const GAME_VERSION = 'v3 · build 222 (Bar traverse: stable arm z-order — each hand keeps a fixed front/back layer so the reaching arm no longer pops in front of the head. All six styles shipped; default is Compact Lunge.)';
const CANVAS_W    = 800;
const CANVAS_H    = 500;
const BLOCK_SIZE  = 32;

// Goal-star colours (campaign-prep). Index 0 = classic gold (the default look).
// Up to 10 supported so future Campaign exits can route by colour. Each entry:
// { name, hex } — hex used to tint the star, name shown in the sandbox picker.
const GOAL_COLORS = [
  { name: 'Gold',   hex: '#ffd700' },
  { name: 'Red',    hex: '#ff4d4d' },
  { name: 'Blue',   hex: '#4da6ff' },
  { name: 'Green',  hex: '#4dff88' },
  { name: 'Purple', hex: '#b366ff' },
  { name: 'Orange', hex: '#ff9933' },
  { name: 'Pink',   hex: '#ff66cc' },
  { name: 'Cyan',   hex: '#33e6e6' },
  { name: 'White',  hex: '#f2f2f2' },
  { name: 'Lime',   hex: '#b3ff33' },
];

// Physics  (×1.5 speed increase applied 2026-04-24)
const GRAVITY         = 0.66;
const MAX_FALL_SPEED  = 21.6;
const JUMP_VELOCITY   = -12.0;  // ≈ 3.4 blocks apex at GRAVITY=0.66 — comfortably clears 3-block platforms

// Player movement
const MOVE_SPEED   = 6.0;    // normal walking speed
const CROUCH_SPEED = 3.36;   // walk speed while crouching
const PLAYER_W    = 20;
const PLAYER_H    = 52;   // standing hitbox height
const CROUCH_H    = 30;   // crouching hitbox height

// Mining
const BREAK_REACH         = 5;   // max block distance in blocks (normal mode)
const SANDBOX_BREAK_REACH = 15;  // sandbox mode: extended reach

// Combat
const PLAYER_MAX_HP         = 20;
const ATTACK_COOLDOWN       = 30;   // frames (0.5 s at 60 fps)
const ATTACK_REACH          = 80;   // px from player centre for melee
const IFRAMES               = 40;   // invincibility frames after being hit
const KNOCKBACK_FORCE       = 9;    // vx applied on knockback

// ── Weapon traits (Smart Mobs §2) ──────────────────────────────────
// Composable attack traits per weapon CLASS. The attack resolver reads these
// (merged with per-world overrides in _worldAdvSettings.weapons) rather than
// hardcoding behaviour per weapon — so the future Enchantment system
// (FUTURE_ROADMAP §17) can grant/modify a single trait onto any weapon.
//   kind         'melee' | 'ranged'
//   reachMult    × ATTACK_REACH (melee radius / thrust range)
//   arcDeg       hit-cone width centred on facing (360 = all around)
//   cleave       max mobs one hit damages; 'tier' = by sword tier; 0 = unlimited
//   knockback    × KNOCKBACK_FORCE
//   cooldownMult × ATTACK_COOLDOWN (swing speed; >1 = slower)
//   dmgMult      × the weapon's base TOOL_DATA damage
//   pierce       (ranged) arrow passes through mobs instead of stopping
//   throwable    (melee) can be thrown as a recoverable projectile (Trident)
const WEAPON_TRAITS = {
  sword:    { kind: 'melee',  reachMult: 1.0,  arcDeg: 360, cleave: 'tier', knockback: 1.0, cooldownMult: 1.0,  dmgMult: 1.0 },
  // `slide: 'launch'` = the weapon's special move when triggered from a ground
  // slide (Smart Mobs §2). Generic hook so other weapons can define their own
  // slide/context specials later; only 'launch' (AoE upward toss) is implemented.
  spear:    { kind: 'melee',  reachMult: 1.55, arcDeg: 65,  cleave: 3,      knockback: 0.7, cooldownMult: 1.15, dmgMult: 0.7, slide: 'launch' },
  axe:      { kind: 'melee',  reachMult: 0.95, arcDeg: 200, cleave: 1,      knockback: 1.9, cooldownMult: 1.7,  dmgMult: 1.45 },
  trident:  { kind: 'melee',  reachMult: 1.45, arcDeg: 90,  cleave: 1,      knockback: 1.2, cooldownMult: 1.35, dmgMult: 1.1, throwable: true },
  // §Phase 3 — Boomerang: dual-mode. MELEE = a close swing, LOWER damage than Sword
  // (dmgMult 0.75). RANGED = thrown, AUTO-returning (boomerangThrow), reusing the
  // guided-projectile substrate. Opt-in per world (new-weapon pattern).
  boomerang:{ kind: 'melee',  reachMult: 1.0,  arcDeg: 200, cleave: 1,      knockback: 0.8, cooldownMult: 1.0,  dmgMult: 0.75, boomerangThrow: true },
  bow:      { kind: 'ranged', pierce: false, dmgMult: 1.0 },
  crossbow: { kind: 'ranged', pierce: true,  dmgMult: 1.25 },
};
// §Phase 3 — Boomerang throw tuning (all overridable per world via _worldAdvSettings).
// Outbound is FASTER than the trident's throw and DECELERATES toward the arc's end;
// it auto-returns to the player, steering toward the cursor on BOTH legs.
const BOOM_RANGE_BLOCKS   = 10;   // outbound reach before it turns back (blocks)
const BOOM_SPEED          = 17;   // outbound launch speed (px/f) — faster than trident's ~14–26 curve start
const BOOM_MIN_SPEED_MULT = 0.35; // speed floor at the end of deceleration (× BOOM_SPEED)
const BOOM_DECEL_PCT      = 0.75; // fraction of the range at which deceleration begins
const BOOM_RETURN_MULT    = 1.0;  // return-leg speed (× BOOM_SPEED) — separate feel knob
const BOOM_STEER_PCT      = 30;   // homing/steer intensity toward the cursor (0-100 → up to 0.20 rad/f)
const BOOM_SPIN_RATE      = 0.5;  // visual spin (rad/frame)
const BOOM_MAX_LIFE       = 600;  // safety expiry (frames) if it never gets home
// §Follow-up — the charged-shot GLOW only appears after the bow's been drawn this long, so a
// quick tap doesn't flash it (it means "meaningfully charging"). ~0.75s: a touch under a full
// second so the tail of the yellow→orange→red ramp still shows at default charge speed
// (full charge ≈ 0.83s). Raise toward 60 for a stricter 1-second gate.
const BOW_GLOW_DELAY_FRAMES = 45;
// Sword cleave count by tier: Wood/Stone=1, Iron/Diamond=2, Netherite=3.
function swordCleaveForTier(tier) { return tier >= 4 ? 3 : tier >= 2 ? 2 : 1; }

// XP
const PLAYER_MAX_XP         = 5;    // max XP level
const XP_PER_ORB            = 0.5;  // each orb adds 0.5 levels

// Mob behaviour
const MOB_ATTACK_RATE       = 60;   // frames between melee hits
const SKELETON_SHOOT_RATE   = 180;  // frames between arrows (3 s)
const ARROW_SPEED           = 13.0; // px per frame (skeleton arrows — Phase 3A.3 faster)
const CREEPER_FUSE_FRAMES   = 300;  // 5 seconds
const CREEPER_EXPLODE_RADIUS= 2;    // blocks

// World / biome
const WORLD_W            = 650;
const WORLD_H            = 60;
const BIOME_PLAINS_END   = 150;   // col boundary plains→cave
const BIOME_CAVE_END     = 300;   // col boundary cave→nether
const BIOME_END_START    = 500;   // col boundary nether→end (transition zone 450-499)

// End dimension
const END_TOWER_COLS          = [525, 550, 575, 600, 625];
const END_FLOOR_ROW           = 58;   // top of bedrock floor
const END_TOWER_TOP_ROW       = 48;   // top row of obsidian towers
const END_TOWER_BOT_ROW       = 57;   // bottom row of obsidian towers (sits on bedrock)
const END_CRYSTAL_ROW         = 47;   // End Crystal row (1 above tower top)
const END_PORTAL_ARRIVAL_COL  = 575;  // column player arrives at when entering End Portal
const END_PORTAL_ARRIVAL_ROW  = 55;   // row player arrives at (above bedrock floor)

// Bow
const BOW_CHARGE_FRAMES  = 50;
const BOW_GRAVITY        = 0.216;
const BOW_MIN_SPEED      = 9.0;   // Phase 3A.3 — faster player arrows
const BOW_MAX_SPEED      = 26.0;
const PLAYER_ARROW_DAMAGE= 9;

// Mob respawn
const MOB_RESPAWN_FRAMES    = 10800; // 3 min at 60 fps
const MOB_ACTIVATION_RANGE  = 900;  // px from player to activate spawn
const MOB_MIN_SPAWN_DIST    = 500;  // px — don't spawn this close to player

// Item drops
const ITEM_DROP_LIFETIME    = 18000; // 5 min at 60 fps

// Checkpoints
const CHECKPOINT_PLAINS_COL = 138;
const CHECKPOINT_CAVE_COL   = 255;  // before the nether portal (cols 270-273)
const CHECKPOINT_RADIUS     = 96;   // px

// Ender Dragon (Phase 11A-2)
const DRAGON_SPEED      = 2;       // px per frame
const DRAGON_BODY_W     = 320;     // body sprite width (px)
const DRAGON_BODY_H     = 80;      // body sprite height (px)
const DRAGON_HEAD_W     = 60;      // head sprite width (px)
const DRAGON_HEAD_H     = 40;      // head sprite height (px)
const DRAGON_SPAWN_COL  = 575;     // initial spawn column
const DRAGON_SPAWN_ROW  = 48;      // initial spawn row
const DRAGON_HEAD_ROT   = 0.349;   // 20° in radians — fixed downward gaze angle
const DIVE_GROUND_Y     = (END_FLOOR_ROW - 2) * BLOCK_SIZE - DRAGON_BODY_H; // dragon ground-skim y

// Gamepad input (Phase 11K-1)
const GP_DEADZONE_STICK   = 0.20;   // left/right stick dead zone (ignore drift below this)
const GP_DEADZONE_TRIGGER = 0.10;   // analog trigger dead zone

// Player 2 keyboard fallback (Phase 12 — IJKL for debug/testing without a second controller)
const P2_KEY_JUMP   = 'KeyI';
const P2_KEY_LEFT   = 'KeyJ';
const P2_KEY_CROUCH = 'KeyK';
const P2_KEY_RIGHT  = 'KeyL';
const P2_KEY_ATTACK = 'KeyU';

// Day/night cycle (Phase 11F)
const DAY_CYCLE_DEFAULT_MINUTES = 10;         // full cycle (day + night), configurable
const DAWN_DUSK_MS              = 30 * 1000;  // 30 s transition
const SUN_ARC_START_ROW  = 18;  // world row at horizon (start/end of arc)
const SUN_ARC_PEAK_ROW   =  5.0;  // world row at zenith (top of arc)

// Phase 13.5 — Sound & Music System
const MAX_AUDIO_VOLUME     = 0.10;  // hard ceiling: 100% slider = 10% actual browser volume
const DEFAULT_MUSIC_VOLUME = 0.5;   // slider value (0–1); actual volume = this × MAX_AUDIO_VOLUME
const DEFAULT_SFX_VOLUME   = 0.5;   // slider value (0–1); actual volume = this × MAX_AUDIO_VOLUME
// Smart Mobs §4 — per-sound multipliers for the quiet movement SFX, tunable
// independently of the master SFX slider (final vol = sfxVolume × MAX_AUDIO_VOLUME
// × these). Bump/drop to taste, or expose as World-Settings sliders later.
const FOOTSTEP_SFX_VOL     = 1.0;
const LAND_SFX_VOL         = 1.0;

// Smart Mobs §4 — DETECTION default tuning (per-world overridable in World Settings →
// Combat → Detection). Ranges are in BLOCKS (converted to px in game._detectionConfig).
const DETECT_SIGHT_RANGE_DEF = 9;    // how far a mob can SEE the player (blocks)
const DETECT_SIGHT_ARC_DEF   = 120;  // frontal vision cone (degrees) — sneak up from behind
const DETECT_SOUND_WALK_DEF  = 5;    // radius a WALKING footstep is heard (blocks)
const DETECT_SOUND_RUN_DEF   = 9;    // radius a RUNNING footstep is heard (blocks)
const DETECT_SOUND_LOUD_DEF  = 14;   // radius when touching a LOUD block (gravel), blocks
const DETECT_ACTION_RANGE_DEF = 8;   // radius an attack/jump is heard (blocks)
const DETECT_PACK_RADIUS_DEF = 7;    // §5 — alert-propagation radius between mobs (blocks)

// Smart Mobs §7 — melee-mob SPRINT (opt-in "Sprinting Mobs"). A sprint is always
// TELEGRAPHED: a wind-up (mob slows + a pulsing cue) precedes the burst, so a fast
// approach reads as a fair, reactable threat rather than a cheap ambush.
const SPRINT_TELE_FRAMES   = 42;    // wind-up / telegraph duration (~0.7s @60fps)
const SPRINT_RUN_FRAMES    = 46;    // burst duration (~0.75s)
const SPRINT_COOLDOWN      = 150;   // frames before a mob can sprint again (~2.5s)
const SPRINT_SPEED_MULT    = 2.4;   // speed multiplier during the burst
const SPRINT_WINDUP_MULT   = 0.35;  // speed during the telegraph (visibly gathers itself)
const SPRINT_TRIGGER_CHANCE = 0.02; // per-eligible-frame chance to start a sprint
const SPRINT_MIN_BLOCKS    = 3;     // only sprint when the player is this far …
const SPRINT_MAX_BLOCKS    = 12;    // … up to this far (closing distance, not point-blank)

// Smart Mobs §6 — WAYFINDING (opt-in "Path-Aware Mobs"). Once a mob is pursuing,
// it follows a real A* route (js/pathfinding.js) around terrain instead of a
// straight-line beeline. The two main feel/perf levers (Kevin can retune):
const PATH_RECOMPUTE_FRAMES = 12;   // recompute cadence (~5×/sec) — cache the route between
const PATH_SEARCH_RADIUS    = 24;   // bounded search radius (blocks); player farther than this
                                    //   → fall back to legacy chase/wander (not actionable yet)
const PATH_MAX_EXPANSIONS    = 1500; // A* node-expansion cap (runaway backstop). Lowered again
                                     // (5000→2500→1500): a 24-radius chase route fits well under
                                     // it, and on a big OPEN level the full scan is the residual
                                     // per-frame cost, so a tighter cap keeps each call ~6-8 ms.
const MOB_PATH_MAX_DROP      = 8;    // per-node DOWN-scan cap for mob/bot A* (vs NAV_MAX_DROP 40
                                     // for the generator). The down-loop dominates per-node cost;
                                     // 8 handles normal ledges, deep falls become a walk-off.
const PATH_FLANK_BIAS_BLOCKS = 2.5;  // §5 surround: path GOAL offset past the player (per side)
// ── Bounded pathfinding (the real perf fix). A* is EXPENSIVE per call (see above), so
// letting every mob run it tanks the framerate (Kevin: 8–10 mobs → "impossible to play").
// Instead only the NEAREST few actively-chasing mobs are "smart" (pathfind); everyone
// else uses the cheap legacy beeline+hop ("simple" nav). And at most a couple of A* runs
// are allowed per FRAME (the rest keep their cached route / beeline), so the cost never
// spikes no matter how many mobs are on screen. These are the primary perf levers.
const MOB_PATH_BUDGET            = 4; // max mobs allowed to pathfind at all (nearest-first)
const MOB_PATH_RECOMPUTES_PER_FRAME = 2; // max A* runs per frame across ALL mobs (spikes-guard)
// Crowd-adaptive throttle (secondary safety): degrade the pathers' config if MORE than
// this many are ever active. Set to the budget so the nearest few "smart" mobs normally
// run at FULL config (snappy pursuit) — the per-frame A* cap is what guards the framerate,
// not this. It only bites if MOB_PATH_BUDGET is raised beyond this.
const PATH_CROWD_THRESHOLD      = 4;
const PATH_CROWD_RECOMPUTE_MULT = 2.5; // ×recompute interval when crowded (12f → 30f, ~2/sec)
const PATH_CROWD_RADIUS_MULT    = 0.6; // ×search radius + node cap when crowded (24bl → ~14bl)

// ════════════════════════════════════════════════════════════════════════════
// BOT AI (Competitive + Cooperative) — a bot occupies a real player SLOT and
// drives SYNTHETIC input through the same input.pXxx(i) pipeline a human uses
// (js/bot-ai.js). It reads the Arena Rules Engine's declared ELEMENTS to decide
// its goal, and the Phase-0-verified pathfinder (js/pathfinding.js) to move.
// Everything here is OPT-IN — no bots spawn unless a match is configured with
// them, so human-only play is byte-identical.
//
// DIFFICULTY = real wired parameters (NOT hardcoded behaviour). Kevin chose
// PER-BOT difficulty, so each bot slot resolves one of these presets. MEDIUM is
// the calibrated baseline; EASY/HARD are best-guess starting values explicitly
// flagged for playtest calibration (that is what the Phase-7 telemetry is for —
// see BOT_TELEMETRY_SCHEMA.md). Tune these numbers, not the strategy code.
const BOT_DIFFICULTY_PRESETS = {
  EASY: {
    label: 'Easy',
    brainTick:      30,   // frames between full decisions (~2/sec) — slow, indecisive
    reactionFrames: 24,   // extra delay before acting on a NEW threat/opportunity (~0.4s)
    navRecompute:   20,   // path recompute cadence (frames) — laggier route updates
    navPrecision:   0.55, // 0..1 follow fidelity: lower = sloppier jump timing + move jitter
    detectRange:    12,   // blocks: how far it NOTICES a target/objective
    aggression:     0.40, // 0..1 bias to engage (vs. objective / retreat) + mob-kill competition
    aimError:       0.42, // radians of random aim offset (bigger = wilder shots)
    aimJitter:      18,   // frames between aim-error resamples
    fireChargeMin:  0.35, // min bow charge before releasing (weaker/shorter shots)
    alwaysRun:      false,// dawdles at partial move speed sometimes (via navPrecision)
    loseInterest:   90,   // frames of no-progress before re-deciding a goal
  },
  MEDIUM: {                // ← the ONE calibrated baseline tier (default)
    label: 'Medium',
    brainTick:      15,   // ~4/sec
    reactionFrames: 10,   // ~0.17s
    navRecompute:   12,   // matches the mob PATH_RECOMPUTE_FRAMES cadence
    navPrecision:   0.82,
    detectRange:    22,
    aggression:     0.70,
    aimError:       0.20,
    aimJitter:      12,
    fireChargeMin:  0.55,
    alwaysRun:      true,
    loseInterest:   150,
  },
  HARD: {
    label: 'Hard',
    brainTick:      8,    // ~7.5/sec — snappy
    reactionFrames: 3,    // ~0.05s
    navRecompute:   8,
    navPrecision:   1.0,  // tight, always-running, clean jump timing
    detectRange:    40,   // sees across most arenas
    aggression:     1.0,
    aimError:       0.05, // near-perfect aim
    aimJitter:      8,
    fireChargeMin:  0.75, // charges hard for max range/power
    alwaysRun:      true,
    loseInterest:   240,
  },
};
const BOT_DEFAULT_DIFFICULTY = 'MEDIUM';

// PvP target selection = a configurable HIGHEST-THREAT BLEND (Kevin's choice).
// threat(target) = wProximity·nearness + wLowHp·(1-hpFrac) + wRecentDamage·hitMe
// where nearness = 1 at point-blank → 0 at detectRange, hpFrac = target hp/maxHp,
// hitMe = 1 if the target damaged this bot within BOT_THREAT_RECENT_FRAMES.
// Exposed as tunables now (may be hidden later) so fine-tuning is easy.
const BOT_THREAT_WEIGHTS = { proximity: 1.0, lowHp: 0.6, recentDamage: 0.9 };
const BOT_THREAT_RECENT_FRAMES = 180;  // "recently damaged me" window (~3s)

// Bot pathing envelope reuses the player jump model (pathfinder defaults). Search
// radius scales with the bot's detectRange but is capped so a far objective still
// falls back gracefully rather than running an unbounded A*.
const BOT_PATH_MAX_RADIUS   = 64;    // raised for mazes/long corridors (path length >> straight-line)
const BOT_PATH_MAX_EXPANSIONS = 12000; // A* node budget — mazes fan out (weak heuristic), so give more room
// Vertical heuristic bias for BOT A* (bots only). The base heuristic is horizontal-
// only (admissible) which floods a maze; a small vertical pull focuses the search so
// it reaches farther within the budget (mildly non-optimal, fine for following/objectives).
const BOT_PATH_VBIAS = 0.4;
const BOT_MELEE_RANGE_BLOCKS = 1.6;   // switch-to/prefer melee when this close
const BOT_ARCHER_RANGE_BLOCKS = 9;    // archer bot approaches to ~this, then holds + fires
const BOT_OBJECTIVE_REACH_BLOCKS = 1.4; // "arrived at objective cell" tolerance

// Phase 4 companion (friendly follower in Platformer/Normal/Campaign):
const BOT_FOLLOW_NEAR = 2;    // blocks: closer than this → stop crowding the player
const BOT_FOLLOW_FAR  = 5;    // blocks: farther than this → catch up (tighter = more responsive)
const BOT_COMPANION_BRAINTICK = 6;   // companion re-decides follow/fight fast (~10/sec) regardless of difficulty
const BOT_COMPANION_LOOT_DELAY = 150; // frames an unclaimed pickup waits before the
                                      // companion may grab it (~2.5s) — player gets first pick
// Companion teleport (fast-pace catch-up): when ON, warp beside the player once the
// DIRECT (Euclidean, so vertical levels count) distance exceeds the configured range.
// Predictable + never makes the player wait. Kevin tunes the range per level.
const BOT_COMPANION_WARP_DIST  = 18;  // default teleport range (blocks) — configurable
const BOT_COMPANION_WARP_STUCK = 45;  // frames of no closing progress → "stuck" (~0.75s; teleport-OFF path)
// Stuck-escape: after this many consecutive fruitless escapes on one goal, stop
// escaping (it's a genuine dead-end) and re-decide, so a bot never paces endlessly.
const BOT_ESCAPE_MAX = 2;
// Wall-jump-aware reachability: with Wall Slide on, a bot can scrabble UP a wall it's
// pressed against (wall-jump), so the planner grants extra reachable height beside a
// wall (approximate — a true chimney climb is iterative). Gated to wall-adjacent cells.
const BOT_WALLJUMP_UP_BONUS = 4;      // extra blocks of climb allowed alongside a wall
// Stuck → Follow ("mirror") mode: show a "!", wait for the player to come near, then
// copy their inputs for a stretch to thread the same route; warp as a last resort.
const BOT_MIRROR_RANGE  = 5;    // blocks: player must be at least this close to start mirroring
const BOT_MIRROR_FRAMES = 210;  // how long to mirror the player before giving up → warp (~3.5s)
const BOT_STUCK_WARP_DELAY = 30; // "!" shown this long before a stuck-teleport warp (~0.5s)

const VICTORY_MUSIC_FILE   = 'music/boss/victory.mp3';  // ~20s fanfare after Ender Dragon defeat

// Music disc registry — each entry maps a disc key to its audio file and display name.
// audioFile paths are relative to the game root (e.g. "music/background/newday.mp3").
// Add more discs here; no other code changes needed.
// Wither Boss (Phase 14)
const WITHER_MAX_HP        = 200;
const WITHER_ARENA_MIN_COL = 550;   // camera west bound during Wither fight
const WITHER_ARENA_MAX_COL = 600;   // camera east bound during Wither fight
// Camera Y lock: row 39 sits at the bottom edge of the canvas (no vertical scroll during fight)
const WITHER_CAM_LOCK_Y    = 40 * BLOCK_SIZE - CANVAS_H;   // = 780 px
const WITHER_SPAWN_COL     = 570;   // Wither spawn column (block units)
const WITHER_SPAWN_ROW     = 30;    // Wither spawn row    (block units)
const WITHER_PLAYER_COL    = 575;   // player arrival column (block units)
const WITHER_PLAYER_ROW    = 35;    // player arrival row    (block units)
const WITHER_BODY_W        = 96;    // forward-facing sprite width  (3 blocks)
const WITHER_BODY_H        = 96;    // sprite height                (3 blocks)
const WITHER_SIDE_W        = 32;    // left/right-facing sprite width (1 block)
const WITHER_BASE_ROW      = 30;    // vertical centre row for sinusoidal bob
const WITHER_MUSIC_FILE    = 'music/boss/wither.mp3';

// Phase 16 — Multiplayer player colours (player 1-4)
const PLAYER_COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A'];

const MUSIC_DISCS = {
  NEW_WORLD: {
    discName:       'New World',
    audioFile:      'music/background/New_World.mp3',
    category:       'background',   // 'background' | 'boss'
    defaultUnlocked: true,           // available from start without collecting
  },
  AXOLOTL: {
    discName:       'Axolotl Paradise',
    audioFile:      'music/background/Axolotl_Paradise.mp3',
    category:       'background',
    defaultUnlocked: true,
  },
  BREEZE: {
    discName:       'Breeze',
    audioFile:      'music/background/Breeze.mp3',
    category:       'background',
    defaultUnlocked: true,
  },
  CLOUDS: {
    discName:       "Clouds",
    audioFile:      'music/background/clouds.mp3',
    category:       'boss',
    defaultUnlocked: true,
  },
  NETHERITE: {
    discName:       "Netherite",
    audioFile:      'music/background/netherite.mp3',
    category:       'boss',
    defaultUnlocked: true,
  },
  NIGHTFALL: {
    discName:       "Night Fall",
    audioFile:      'music/background/Nightfall.mp3',
    category:       'boss',
    defaultUnlocked: true,
  },
  NO_ESCAPE: {
    discName:       "No Escape",
    audioFile:      'music/background/No_Escape.mp3',
    category:       'boss',
    defaultUnlocked: true,
  },
  SHRIEKER: {
    discName:       "Shrieker",
    audioFile:      'music/background/Shrieker.mp3',
    category:       'boss',
    defaultUnlocked: true,
  },
  SHULK: {
    discName:       "Shulk",
    audioFile:      'music/background/Shulk.mp3',
    category:       'boss',
    defaultUnlocked: true,
  },
  THUNDERSTORM: {
    discName:       "Thunder Storm",
    audioFile:      'music/background/Thunder_Storm.mp3',
    category:       'boss',
    defaultUnlocked: true,
  },
  DRAGONS_LAMENT: {
    discName:       "The End",
    audioFile:      'music/boss/The_End.mp3',
    category:       'boss',
    defaultUnlocked: false,
    droppedBy:      'ENDER_DRAGON',  // drops when this boss is defeated
  },
};
