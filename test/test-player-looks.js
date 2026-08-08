// PLAYER_LOOKS — per-player appearance model (shared by overhead + 2D).
//   node test/test-player-looks.js
global.window = global;
const path = require('path');
const { PLAYER_LOOKS } = require(path.join(__dirname, '..', 'js', 'player-looks.js'));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

console.log('PLAYER_LOOKS — defaults + overrides + team palette:');
PLAYER_LOOKS._reset();

// Distinct per-player defaults even with no config.
const p1 = PLAYER_LOOKS.get(1), p2 = PLAYER_LOOKS.get(2), p3 = PLAYER_LOOKS.get(3), p4 = PLAYER_LOOKS.get(4);
ok(p1.shirt !== p2.shirt && p2.shirt !== p3.shirt && p3.shirt !== p4.shirt, 'P1-P4 have distinct default shirt colours');
ok([p1, p2, p3, p4].every((L) => L.skin && L.hair && L.shirt && L.pants && L.sprite), 'every player has a full look (skin/hair/shirt/pants/sprite)');
ok(PLAYER_LOOKS.get(9).shirt === p4.shirt, 'out-of-range player clamps into 1-4 (9 -> P4)');

// Overrides persist and merge over defaults.
PLAYER_LOOKS.set(2, 'shirt', '#123456');
PLAYER_LOOKS.set(2, 'sprite', 'girl');
ok(PLAYER_LOOKS.get(2).shirt === '#123456', 'set shirt override is returned');
ok(PLAYER_LOOKS.get(2).sprite === 'girl', 'set sprite override is returned');
ok(PLAYER_LOOKS.get(2).pants === p2.pants, 'un-set fields still fall back to the default');

// Palette shape for the sprite renderer.
const pal = PLAYER_LOOKS.palette(2, null);
ok(pal.shirt === '#123456' && 'pants' in pal && 'skin' in pal && 'hair' in pal, 'palette() returns {shirt,pants,skin,hair}');

// Team play: SHIRT becomes the team colour, the rest stays the player's own.
const t0 = PLAYER_LOOKS.palette(2, 0), t1 = PLAYER_LOOKS.palette(2, 1);
ok(t0.shirt === PLAYER_LOOKS.TEAM_COLORS[0], 'team 0 shirt = team-0 colour');
ok(t1.shirt === PLAYER_LOOKS.TEAM_COLORS[1], 'team 1 shirt = team-1 colour');
ok(t0.pants === PLAYER_LOOKS.get(2).pants && t0.hair === PLAYER_LOOKS.get(2).hair, 'team play keeps the player OWN pants/hair');
ok(PLAYER_LOOKS.palette(2, null).shirt === '#123456', 'no-team keeps the player own shirt');

console.log(`\nplayer looks: ${pass} passed, ${fail} failed`);
PLAYER_LOOKS._reset();
if (fail) process.exit(1);
