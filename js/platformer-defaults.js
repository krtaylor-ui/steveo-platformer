// ============================================================
// platformer-defaults.js — Per-mode default World Settings for NEW worlds
// ------------------------------------------------------------
// When a user CREATES a new world of a given game mode, these settings seed its
// worldAdvSettings so it plays a certain way out of the box (existing worlds are
// untouched — this only fires at creation time). Both creation paths consume the
// SAME preset via worldModeDefaults(): LOCAL_WORLDS.create (offline) and the
// server's /api/worlds/sandbox/create (online) — one source of truth, no drift.
//
// PLATFORMER_DEFAULTS = a snapshot of "Kevin's World!" (2026-07-14), filtered to
// GAMEPLAY / LEVEL-DESIGN settings only. Deliberately EXCLUDED (they are
// per-player / per-display prefs or tied to that one world's geometry, so they
// should NOT be baked into every new world): musicVolume, sfxVolume, controller
// sensitivity/aim/deadzone, chatDisabled, showOnlineHealthBars, compactHotbar,
// worldZoom, twoPlayerMode, customTeleportPoints, and all arena-* / speed-run-* /
// boss-* keys (irrelevant to a Platformer world; they fall back to engine
// defaults). Keys not listed here fall back to Game._worldAdvSettings defaults.
// ============================================================

const PLATFORMER_DEFAULTS = {
  // ── Physics / movement moves ──
  physicsGravity:      0.66,
  jumpHeightBlocks:    null,     // null = engine default jump velocity
  jumpPadVForce:       -18,
  redstoneSpeed:       2,
  disableXpSpeedBoost: true,
  physicsLocked:       true,     // designer lock — players can't override physics
  sprintEnabled:       true,
  autoStepUp:          true,
  airJumpEnabled:      true,     // double jump
  wallSlideEnabled:    true,
  wallJumpLockAway:    true,
  ledgeHangEnabled:    true,
  slideEnabled:        true,
  slideInvincible:     true,
  slideDurationFrames: 30,
  slideSpeedMult:      1.6,
  // ── Scoring (campaign-prep) ──
  platformerEmeralds:  false,
  platformerScore:     true,
  emeraldPoints:       100,
  goalClearPoints:     1000,
  // ── Combat / weapons ──
  unlimitedArrows:     true,
  recoverableArrows:   true,
  slideAttack:         true,
  slideAttackDmg:      1.25,
  guidedTrident:       true,
  tridentAutoReturn:   true,
  tridentTurn:         22,
  weapons: {
    sword:   { atkSpeed: 1, dmgMult: 1 },
    axe:     { atkSpeed: 0.5, dmgMult: 1.5, knockback: 3.5 },
    spear:   { hitAll: true },
    trident: { throwable: true },
  },
  // ── Smart Mobs behavior (§4–§9 + §6 wayfinding) ──
  smartDetection:      true,
  detectActionRange:   12,
  packAlert:           true,
  sprintingMobs:       true,
  spiderWebs:          true,
  webStacking:         true,
  pathAwareMobs:       true,      // §6 — path-aware pursuit
  lowHpAction_zombie:  'flee',
  lowHpAction_piglin:  'flee',
  // ── Day / night (mob spawns) ──
  dayCycleMinutes:     10,
  nightSpawnBoost:     true,
  nightSpawnRate:      2,
  fullMoonHpBoost:     true,
  fullMoonHpAmount:    1.5,
  // ── Background ──
  backgroundTheme:     'auto',
};

// Per-mode creation defaults. Returns a FRESH object (safe to mutate/Object.assign
// into a new world's worldAdvSettings). Only Platformer ('PLT') has a preset today;
// every other mode returns {} so its worlds keep the engine defaults (unchanged).
function worldModeDefaults(gameModeDefault) {
  if (gameModeDefault === 'PLT') return JSON.parse(JSON.stringify(PLATFORMER_DEFAULTS));
  return {};
}

// Node (server + headless tests) require this; browser = plain script-scope globals.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PLATFORMER_DEFAULTS, worldModeDefaults };
}
