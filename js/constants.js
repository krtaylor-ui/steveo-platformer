// ============================================================
// constants.js — Game-wide tunable constants
// ============================================================

const CANVAS_W    = 800;
const CANVAS_H    = 500;
const BLOCK_SIZE  = 32;

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

// XP
const PLAYER_MAX_XP         = 5;    // max XP level
const XP_PER_ORB            = 0.5;  // each orb adds 0.5 levels

// Mob behaviour
const MOB_ATTACK_RATE       = 60;   // frames between melee hits
const SKELETON_SHOOT_RATE   = 180;  // frames between arrows (3 s)
const ARROW_SPEED           = 7.2;  // px per frame
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
const BOW_MIN_SPEED      = 4.8;
const BOW_MAX_SPEED      = 16.8;
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
