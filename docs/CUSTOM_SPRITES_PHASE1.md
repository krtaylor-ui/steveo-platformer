# Custom Sprites — Phase 1 rollout

Branch `custom-sprites` (off `overhead-play-modes`). Concept approved by Kevin from the artifact
(16 shape characters, side/front/overhead, recolourable). Goal: put the roster into the GAME for
both engines + a single-pick character-select. Player-made sprites (parts mixer) = Phase 2.

## Locked decisions
- **Roster:** all 16 system characters ship (Kevin: "they are all great"). System cast = BOTH engines.
- **Character-select v1:** the creator picks ONE character for the world ("comfortable starting with
  one"); multi-character roster = later. Colour policy: Locked-to-design / Players-choose;
  **multiplayer always offers colour.**
- **Animations map for free:** accessories are drawn inside the SAME transformed limb space as the
  body, so double-jump, edge/ledge climb, pipe/tube crawl, grapple, melee all work on every
  character. Overhead = one function (drawOverheadPlayer). Side = per pose in player.js.
- **P1 default stays classic Steve** — character defaults to `classic` so existing worlds are
  visually unchanged.

## Model
- `js/characters.js` (DONE) — `CHARACTERS` registry: id -> { name, theme, feat{accessory flags},
  pal{skin,hair,shirt,pants,accent} default, views{side,top}, body }. Engine-agnostic; both renderers
  read `feat`. Player colours still come from PLAYER_LOOKS (character `pal` is the default).
- A world stores a chosen `characterId` (default 'classic'). Runtime passes its `feat` to the
  renderers per player. (Phase 2: per-player character from a roster.)

## Progress
- [DONE] `js/characters.js` + `test/characters.js` (120 assertions). Registered in index.html.

## REMAINING (each: keep node test/run.js exit 0, bump build, commit+push, tick here)
- [DONE 425] OVERHEAD accessory rendering: extend `drawOverheadPlayer` (js/overhead/overhead-launch.js) to
  draw accessories from `opts.character` (a feat object) — port the artifact's overhead accessory
  code (ears centred on sides, antennae from crown, hats as rings, dome, cape, tail, snout on the
  facing edge, visor, crest, pack, emblem, bolts, wings, stripes). It draws in the same rotated/scaled
  context, so it inherits spin/somersault/climb automatically. overhead-game `_drawPlayer` passes the
  world's character feat. Store `this._characterId = worldData.characterId || 'classic'`.
- [DONE 426] SIDE accessory rendering: add an accessory layer to js/player.js poses (start with the primary
  standing/walk + jump; then crouch/ladder-climb). Port the artifact's side (profile) accessory code
  adapted to player.js's front-ish sprite. Respect z-order (far arm behind torso). Read the world's
  character feat.
- [ ] CHARACTER-SELECT: creator picks the world's character. Overhead: add a "Character" field to the
  OVERHEAD_PLAY settings window (js/overhead-play.js) + persist on the world. Side-scroll: add to the
  relevant pre-game / world settings. Colour policy already exists via PLAYER_LOOKS + the settings
  window; MP always colour. v1 = single character per world.
- [ ] Editor: let the creator set the world's character (Sandbox card or editor), default classic.
- [ ] Tests: feat plumbing (renderer receives the right feat per world), select persistence; keep
  the shape renderers headless-safe.
- [ ] Tester brief (plain ASCII + QA copy): pick a character in each engine; confirm accessories +
  colours render and all animations (double jump / edge climb / pipe crawl / melee) still play.

## Guardrails
- Single-player + side-scroll + overhead-MP + play-modes (O1-O8) must stay intact.
- Hitbox/proportions never change with character (fairness) — accessories are cosmetic only.
- Plain-ASCII tester files. Bump build via tools/bump-build.js on behaviour changes.
