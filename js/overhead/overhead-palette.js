// ══════════════════════════════════════════════════════════════════════════
// Overhead Engine — shared PALETTE definitions (terrain / mobs / items) + the
// SPRITE COLOR palette. Single source of truth consumed by the editor, the
// runtime, AND the graphics-exploration artifact so they never drift.
//
// SPRITE COLORS are deliberately VARIABLES (OH_SPRITE) so they can later be
// surfaced for per-player customization. NOTE FOR A FUTURE PASS: the side-view
// (2D) sprite renderer should eventually consume this SAME OH_SPRITE scheme so a
// player's chosen colours are consistent across both views.
// ══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  // ── Player sprite colours (future user-configurable) ───────────────────────
  const OH_SPRITE = {
    hair:  '#5a3d22',   // square head
    shirt: '#3f74c4',   // body / shoulders / sleeves
    pants: '#39406b',   // legs
    skin:  '#e0b083',   // hands / feet accents
    // eventual: outline, accent, etc.
  };

  // ── Terrain block set — mirrors the side-scroller palette (§ request) ───────
  // Each: { key, name, blockId (side-view BLOCK id for parity), color (top-down
  // representative), hazard?, note? }. Collision is ELEVATION-relative (a cell
  // one level above the player is a wall; two+ is an overhang) — the TYPE is
  // visual, EXCEPT `hazard` tiles (lava) which damage regardless of elevation.
  const OH_TERRAIN = [
    { key: 'grass',      name: 'Grass',        blockId: 1,  color: '#4a8a45' },
    { key: 'dirt',       name: 'Dirt',         blockId: 2,  color: '#7a5334' },
    { key: 'stone',      name: 'Stone',        blockId: 3,  color: '#8a8a90' },
    { key: 'log',        name: 'Wood Log',     blockId: 4,  color: '#6e4f2a' },
    { key: 'planks',     name: 'Wood Plank',   blockId: 7,  color: '#b0894f' },
    { key: 'gravel',     name: 'Gravel',       blockId: 11, color: '#9a9690' },
    { key: 'coal',       name: 'Coal',         blockId: 8,  color: '#39393f' },
    { key: 'iron',       name: 'Iron',         blockId: 9,  color: '#c9b39a' },
    { key: 'gold',       name: 'Gold',         blockId: 13, color: '#e6c14a' },
    { key: 'diamond',    name: 'Diamond',      blockId: 12, color: '#5fd6d0' },
    { key: 'obsidian',   name: 'Obsidian',     blockId: 15, color: '#2a2438' },
    { key: 'deepslate',  name: 'Deepslate',    blockId: 16, color: '#4a4a52' },
    { key: 'bedrock',    name: 'Bedrock',      blockId: 6,  color: '#2f2f33' },
    { key: 'netherrack', name: 'Netherrack',   blockId: 21, color: '#7a3535' },
    { key: 'soulsand',   name: 'Soul Sand',    blockId: 17, color: '#4a3a2c' },
    { key: 'ice',        name: 'Ice',          blockId: 69, color: '#a9d6ea' },
    { key: 'lava',       name: 'Lava',         blockId: 22, color: '#e0662a', hazard: true, light: '#ff8a3a' },
    { key: 'glowstone',  name: 'Glowstone',    blockId: 48, color: '#e6c96a', light: '#ffe59a' },
    { key: 'bush',       name: 'Bush',         blockId: 60, color: '#3f7a3a' },
    { key: 'leaves',     name: 'Leaves',       blockId: 5,  color: '#4f8a44' },
  ];
  const OH_TERRAIN_BY_KEY = {};
  OH_TERRAIN.forEach((t) => { OH_TERRAIN_BY_KEY[t.key] = t; });
  const GROUND = 'grass';   // default paint / floor
  const isHazardKey = (key) => !!(OH_TERRAIN_BY_KEY[key] && OH_TERRAIN_BY_KEY[key].hazard);
  const terrainColor = (key) => (OH_TERRAIN_BY_KEY[key] || OH_TERRAIN_BY_KEY[GROUND]).color;
  // Light-emitting terrain (glowstone / lava): returns the glow colour or null.
  const lightColor = (key) => (OH_TERRAIN_BY_KEY[key] && OH_TERRAIN_BY_KEY[key].light) || null;

  // ── Mobs (overhead set for now) ─────────────────────────────────────────────
  // detect is in BLOCKS (× unit at runtime) — default ~10 player-blocks (§).
  const OH_MOBS = [
    { key: 'zombie',   name: 'Zombie',   color: '#4a8a3a', hp: 8,  speed: 1.4, detect: 6 },
    { key: 'skeleton', name: 'Skeleton', color: '#d8d8cf', hp: 6,  speed: 1.6, detect: 8, ranged: true },
    { key: 'spider',   name: 'Spider',   color: '#3a3340', hp: 6,  speed: 2.0, detect: 7 },
  ];
  const OH_MOB_BY_KEY = {}; OH_MOBS.forEach((m) => { OH_MOB_BY_KEY[m.key] = m; });

  // ── Items (weapons for now) ─────────────────────────────────────────────────
  const OH_ITEMS = [
    { key: 'crossbow',  name: 'Crossbow',  color: '#8a6a3a', kind: 'weapon', weapon: 'crossbow' },
    { key: 'trident',   name: 'Trident',   color: '#4fb0c0', kind: 'weapon', weapon: 'trident' },
    { key: 'boomerang', name: 'Boomerang', color: '#c08a4a', kind: 'weapon', weapon: 'boomerang' },
    { key: 'coin',      name: 'Coin',      color: '#ffd94a', kind: 'coin' },
  ];
  const OH_ITEM_BY_KEY = {}; OH_ITEMS.forEach((i) => { OH_ITEM_BY_KEY[i.key] = i; });

  const OH_PALETTE = {
    OH_SPRITE,
    OH_TERRAIN, OH_TERRAIN_BY_KEY, GROUND, isHazardKey, terrainColor, lightColor,
    OH_MOBS, OH_MOB_BY_KEY, OH_ITEMS, OH_ITEM_BY_KEY,
  };

  if (typeof window !== 'undefined') { window.OH_PALETTE = OH_PALETTE; window.OH_SPRITE = OH_SPRITE; }
  if (typeof module !== 'undefined' && module.exports) module.exports = { OH_PALETTE };
})();
