// ══════════════════════════════════════════════════════════════════════════
// PLAYER_LOOKS — per-player appearance (sprite + colours), shared by BOTH the
// overhead and 2D engines. Persisted to localStorage; edited in the pre-game
// settings window. Even with no configuration, P1-P4 get DISTINCT default
// colours (red/blue/green/yellow) so players are always tellable apart.
//
// A palette is { shirt, pants, skin, hair }. In TEAM play the SHIRT becomes the
// team colour and everything else stays the player's own (Kevin). sprite is
// 'boy' | 'girl' (a hair/silhouette tweak; colours still apply).
// ══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  const STORAGE_KEY = 'steveo_player_looks_v1';

  // Distinct per-player defaults (P1 red, P2 blue, P3 green, P4 yellow).
  const DEFAULTS = [
    { sprite: 'boy',  skin: '#e0b083', hair: '#3a2a1a', shirt: '#d64545', pants: '#7a2d2d' },
    { sprite: 'boy',  skin: '#e0b083', hair: '#2a2a2a', shirt: '#3f74c4', pants: '#294a80' },
    { sprite: 'girl', skin: '#c68642', hair: '#7d4e1a', shirt: '#4caf50', pants: '#2e7d32' },
    { sprite: 'girl', skin: '#f4c78a', hair: '#c0870f', shirt: '#f0c419', pants: '#b58910' },
  ];
  // Team shirt colours (team 0 / team 1).
  const TEAM_COLORS = ['#d64545', '#3f74c4'];

  // Selectable swatches for the settings window.
  const SWATCHES = {
    skin:  ['#ffdbac', '#f4c78a', '#e0b083', '#c68642', '#8d5524', '#5a3a1a'],
    hair:  ['#2a2a2a', '#3a2a1a', '#7d4e1a', '#b5651d', '#c0870f', '#e8d16a', '#a33333', '#dddddd'],
    shirt: ['#d64545', '#3f74c4', '#4caf50', '#f0c419', '#9c27b0', '#ff8c00', '#20b2aa', '#eeeeee'],
    pants: ['#7a2d2d', '#294a80', '#2e7d32', '#b58910', '#4a2d6b', '#333333', '#8a5a2b', '#777777'],
  };
  const SPRITES = ['boy', 'girl'];

  let _looks = {};   // { 1:{...overrides}, 2:{...}, ... }

  function load() {
    try { const d = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); if (d && typeof d === 'object') _looks = d; } catch (_) {}
  }
  function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_looks)); } catch (_) {} }
  if (typeof localStorage !== 'undefined') load();

  const clampN = (n) => Math.max(1, Math.min(4, n | 0));

  // Full appearance for a player (defaults merged with saved overrides).
  function get(playerNum) {
    const n = clampN(playerNum);
    return Object.assign({}, DEFAULTS[n - 1], _looks[n] || {});
  }
  function set(playerNum, field, value) {
    const n = clampN(playerNum);
    _looks[n] = _looks[n] || {}; _looks[n][field] = value; save();
  }

  // The colour palette an engine sprite renderer consumes. teamIndex != null =>
  // team play: SHIRT becomes the team colour, the rest stays the player's own.
  function palette(playerNum, teamIndex) {
    const L = get(playerNum);
    const shirt = (teamIndex != null && teamIndex >= 0) ? (TEAM_COLORS[teamIndex % 2] || L.shirt) : L.shirt;
    return { shirt, pants: L.pants, skin: L.skin, hair: L.hair };
  }
  function sprite(playerNum) { return get(playerNum).sprite || 'boy'; }

  const PLAYER_LOOKS = {
    STORAGE_KEY, DEFAULTS, TEAM_COLORS, SWATCHES, SPRITES,
    load, save, get, set, palette, sprite,
    // For tests / reset.
    _reset() { _looks = {}; save(); },
  };

  if (typeof window !== 'undefined') window.PLAYER_LOOKS = PLAYER_LOOKS;
  if (typeof module !== 'undefined' && module.exports) module.exports = { PLAYER_LOOKS };
})();
