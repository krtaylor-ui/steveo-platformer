// ══════════════════════════════════════════════════════════════════════════
// CHARACTERS — the system character roster (Custom Sprites, Phase 1).
//
// A character is ENGINE-AGNOSTIC DATA: a set of accessory feature flags + a
// default colour palette + which views it supports. Both renderers consume the
// SAME record — the overhead engine (drawOverheadPlayer) and the side-scroll
// engine (player.js) each interpret `feat` to layer accessories onto the shared
// moving body, so every character inherits every animation (walk, double-jump,
// edge climb, pipe crawl, melee…) for free.
//
// Player colour choice still flows through PLAYER_LOOKS; a character's `pal` is
// only the DEFAULT used until a player recolours. System characters support BOTH
// views; a future player-made character may support side-scroll only, overhead
// only, or both (views flags), and the engine simply won't offer it in a mode it
// wasn't built for.
// ══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var BOTH = { side: true, top: true };

  // feat flags (read by both renderers): dome, pack, emblem, helm, plume, shield, cap, vest, cape,
  // mask, wrap, band, bighead, bigeyes, antennae, antenna, visor, bolts, earsTri, earsRound, tail,
  // tailBush, snout, whisk, crest, hat, beard, staff, bandana, patch, sash, fedora, scarf, wings, stripes.
  var LIST = [
    { id: 'classic',  name: 'Classic',   theme: 'Original',  body: 'boy',  views: BOTH, feat: {},
      pal: { skin: '#f4c78a', hair: '#7d4e1a', shirt: '#3f74c4', pants: '#2c5f8a', accent: '#ffd24a' } },
    { id: 'astro',    name: 'Astronaut', theme: 'Space',     body: 'boy',  views: BOTH, feat: { dome: 1, pack: 1, emblem: 1 },
      pal: { skin: '#f4c78a', hair: '#3a2a1a', shirt: '#eef1f8', pants: '#c9d3e6', accent: '#ff8c00' } },
    { id: 'knight',   name: 'Knight',    theme: 'Fantasy',   body: 'boy',  views: BOTH, feat: { helm: 1, plume: 1, shield: 1 },
      pal: { skin: '#e0b083', hair: '#8a8f9c', shirt: '#9aa3b2', pants: '#5b6270', accent: '#d64545' } },
    { id: 'ranger',   name: 'Ranger',    theme: 'Military',  body: 'boy',  views: BOTH, feat: { cap: 1, vest: 1 },
      pal: { skin: '#c68642', hair: '#3a2a1a', shirt: '#5a6b3a', pants: '#3f4a2a', accent: '#c0870f' } },
    { id: 'hero',     name: 'Super',     theme: 'Hero',      body: 'boy',  views: BOTH, feat: { cape: 1, mask: 1, emblem: 1 },
      pal: { skin: '#f4c78a', hair: '#2a2a2a', shirt: '#d64545', pants: '#294a80', accent: '#ffd24a' } },
    { id: 'ninja',    name: 'Ninja',     theme: 'Stealth',   body: 'boy',  views: BOTH, feat: { wrap: 1, band: 1 },
      pal: { skin: '#e0b083', hair: '#1c1c1c', shirt: '#26262e', pants: '#161616', accent: '#d64545' } },
    { id: 'alien',    name: 'Zib',       theme: 'Alien',     body: 'boy',  views: BOTH, feat: { bighead: 1, bigeyes: 1, antennae: 1 },
      pal: { skin: '#7ad0a8', hair: '#4aa07c', shirt: '#b56bde', pants: '#6a3f8a', accent: '#eaff6b' } },
    { id: 'robot',    name: 'Bolt',      theme: 'Robot',     body: 'boy',  views: BOTH, feat: { visor: 1, antenna: 1, bolts: 1 },
      pal: { skin: '#c9d3e6', hair: '#9aa3b2', shirt: '#7f8aa0', pants: '#4a5162', accent: '#37c6bd' } },
    { id: 'cat',      name: 'Whiskers',  theme: 'Animal',    body: 'boy',  views: BOTH, feat: { earsTri: 1, tail: 1, snout: 1, whisk: 1 },
      pal: { skin: '#f0c419', hair: '#e0a800', shirt: '#f0a83a', pants: '#c07a1a', accent: '#ffffff' } },
    { id: 'fox',      name: 'Ember Fox', theme: 'Animal',    body: 'boy',  views: BOTH, feat: { earsTri: 1, tailBush: 1, snout: 1 },
      pal: { skin: '#e07030', hair: '#c85a1e', shirt: '#e07030', pants: '#8a3a12', accent: '#ffffff' } },
    { id: 'dino',     name: 'Rex',       theme: 'Animal',    body: 'boy',  views: BOTH, feat: { crest: 1, tailBush: 1, snout: 1 },
      pal: { skin: '#5aa84a', hair: '#3f8a34', shirt: '#5aa84a', pants: '#3a6e30', accent: '#f0c419' } },
    { id: 'bear',     name: 'Bruin',     theme: 'Animal',    body: 'boy',  views: BOTH, feat: { earsRound: 1, snout: 1 },
      pal: { skin: '#9a6a3a', hair: '#7a5028', shirt: '#8a5a2b', pants: '#5e3c1c', accent: '#f4c78a' } },
    { id: 'wizard',   name: 'Wizard',    theme: 'Fantasy',   body: 'boy',  views: BOTH, feat: { hat: 1, beard: 1, staff: 1 },
      pal: { skin: '#e0b083', hair: '#dddddd', shirt: '#4a2d6b', pants: '#2e1c44', accent: '#ffd24a' } },
    { id: 'pirate',   name: 'Corsair',   theme: 'Adventure', body: 'boy',  views: BOTH, feat: { bandana: 1, patch: 1, sash: 1 },
      pal: { skin: '#c68642', hair: '#2a2a2a', shirt: '#7a2d2d', pants: '#3a2a1a', accent: '#f0c419' } },
    { id: 'scout',    name: 'Scout',     theme: 'Adventure', body: 'boy',  views: BOTH, feat: { fedora: 1, scarf: 1, pack: 1 },
      pal: { skin: '#e0b083', hair: '#5a3d22', shirt: '#8a7a4a', pants: '#5a4a2a', accent: '#d64545' } },
    { id: 'bee',      name: 'Buzz',      theme: 'Bug',       body: 'boy',  views: BOTH, feat: { antennae: 1, wings: 1, stripes: 1 },
      pal: { skin: '#f0c419', hair: '#2a2a2a', shirt: '#f0c419', pants: '#2a2a2a', accent: '#eef1f8' } }
  ];

  var MAP = {}; LIST.forEach(function (c) { MAP[c.id] = c; });

  var CHARACTERS = {
    LIST: LIST,
    DEFAULT_ID: 'classic',
    list: function () { return LIST.slice(); },
    ids: function () { return LIST.map(function (c) { return c.id; }); },
    get: function (id) { return MAP[id] || MAP['classic']; },
    feat: function (id) { return (MAP[id] || MAP.classic).feat || {}; },
    defaultPalette: function (id) { return Object.assign({}, (MAP[id] || MAP.classic).pal); },
    supports: function (id, view) { var c = MAP[id] || MAP.classic; return !!(c.views && c.views[view]); }
  };

  if (typeof window !== 'undefined') window.CHARACTERS = CHARACTERS;
  if (typeof module !== 'undefined' && module.exports) module.exports = { CHARACTERS };
})();
