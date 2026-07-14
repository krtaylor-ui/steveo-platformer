// ============================================================
// constants.js — Game-wide tunable constants
// ============================================================

// Single source of truth for the build version. BUMP THE BUILD NUMBER ON EVERY
// COMMIT so the in-game badge (dashboard header + menu + pause screen) identifies
// exactly which build is running. Shown via `.app-version` DOM badge + GAME_VERSION.
const GAME_VERSION = 'v3 · build 101 (sprite: helmet reads as a profile — flat top, comes down only at the back of the head past the ear; eye/mouth pushed forward toward facing)';

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
  bow:      { kind: 'ranged', pierce: false, dmgMult: 1.0 },
  crossbow: { kind: 'ranged', pierce: true,  dmgMult: 1.25 },
};
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
