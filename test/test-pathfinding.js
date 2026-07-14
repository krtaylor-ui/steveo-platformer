// Headless tests for Smart Mobs §6 — the shared A* pathfinder (js/pathfinding.js).
// Verifies the five required cases from the brief §6 against known ASCII grids,
// plus the "ambush from above" cost preference and the search-bound fallback.
//
// A nav is built from an ASCII map: '#' solid, 'L' lava (hazard), 'P' jump pad,
// anything else = air. (c,r) = (col,row). A mob "stands" in an air cell whose
// cell below is solid.
const { findMobPath, navReachable, navStandable, navNeighbors } = require('../js/pathfinding.js');

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  FAIL:', msg); } };

function mkNav(rows) {
  const H = rows.length, W = Math.max(...rows.map(r => r.length));
  const at = (c, r) => (r < 0 || r >= H || c < 0 || c >= W) ? '#' : (rows[r][c] || ' ');
  return {
    W, H,
    solid:  (c, r) => at(c, r) === '#' || at(c, r) === 'P',
    hazard: (c, r) => at(c, r) === 'L',
    pad:    (c, r) => at(c, r) === 'P',
  };
}
// Find the standable cell in a column (feet cell just above the first floor).
function standCell(nav, col, fromRow = 0) {
  for (let r = fromRow; r < nav.H - 1; r++) if (navStandable(nav, col, r)) return [col, r];
  return null;
}

console.log('Case 1 — straight corridor (shortest = straight line):');
{
  // 10-wide floor; walk from col 1 to col 8, same row.
  const nav = mkNav([
    '          ',
    '          ',
    '##########',
  ]);
  const start = standCell(nav, 1), goal = standCell(nav, 8);
  const res = findMobPath(nav, start, goal, { maxRadius: 30 });
  ok(res !== null, 'path found across the corridor');
  ok(res && res.path[0][0] === 1 && res.path[res.path.length - 1][0] === 8, 'ends at the goal column');
  // straight line: every cell on the same row, monotonic in column
  ok(res && res.path.every(p => p[1] === start[1]), 'stays on one row (no needless detour)');
  ok(res && Math.abs(res.cost - 7) < 0.5, `cost ~ horizontal distance (got ${res && res.cost})`);
}

console.log('Case 2 — gap within jump range (goes over, not around):');
{
  // A 3-wide gap in the floor; jumpable (<=6). No route around, so it MUST jump.
  const nav = mkNav([
    '            ',
    '            ',
    '#####   ####',
  ]);
  const start = standCell(nav, 1), goal = standCell(nav, 10);
  const res = findMobPath(nav, start, goal, { maxRadius: 30 });
  ok(res !== null, 'path found over the gap');
  ok(res && res.path[res.path.length - 1][0] === 10, 'reaches the far side');
}

console.log('Case 3 — gap BEYOND jump range + a longer walkable route (takes the legal route):');
{
  // Top ledge has a 9-wide gap (unjumpable, >6). A lower floor connects around via
  // a drop on the left and a climbable step back up on the right.
  //           col: 0123456789012345
  const nav = mkNav([
    '                ',
    '                ',
    '###         ####',   // top: 3-wide start ledge, 9-wide gap, landing ledge
    '  #         #   ',
    '  #         #   ',
    '  ###########   ',   // lower connecting floor
    '################',
  ]);
  const start = standCell(nav, 1);          // on the top-left ledge (row 1, floor row 2)
  const goal  = standCell(nav, 13);         // on the top-right ledge
  const res = findMobPath(nav, start, goal, { maxRadius: 40 });
  ok(res !== null, 'a legal route around the too-wide gap exists');
  // It must descend below the top row at some point (can't cross the 9-gap directly).
  ok(res && res.path.some(p => p[1] > 3), 'route drops to the lower floor rather than an illegal jump');
  ok(res && res.path[res.path.length - 1][0] === 13, 'still reaches the far ledge');
}

console.log('Case 4 — genuinely unreachable target (reports no path, no hang):');
{
  // An isolated island (col 12-14) with a bottomless void between it and the start.
  const nav = mkNav([
    '               ',
    '               ',
    '#####          ',
    '               ',
    '               ',
    '            ###',
  ]);
  const start = standCell(nav, 1);
  const goal  = standCell(nav, 13, 4);
  const res = findMobPath(nav, start, goal, { maxRadius: 40 });
  ok(res === null, 'unreachable island -> null (not a bogus path, no throw)');
  // reachability set agrees: the island cell is not in it.
  const reach = navReachable(nav, start[0], start[1], {});
  ok(goal && !reach.has(goal[0] + ',' + goal[1]), 'reachability set also excludes the island');
}

console.log('Case 5 — dropping off a ledge is the shortest legal route (ambush from above):');
{
  // Start on a high ledge directly above the target. A drop straight down reaches
  // it in a couple of cells; walking around would be far longer. Confirms the drop
  // is preferred (low drop cost).
  //           col: 0123456789
  const nav = mkNav([
    '          ',
    '          ',
    '###       ',   // high start ledge (cols 0-2, standable on row 1)
    '          ',
    '          ',
    '##########',   // ground floor far below
  ]);
  const start = standCell(nav, 1);          // top ledge (row 1)
  const goal  = standCell(nav, 1, 3);       // directly below, on the ground floor (row 4)
  const res = findMobPath(nav, start, goal, { maxRadius: 40 });
  ok(res !== null, 'drop route found');
  ok(res && res.path.length <= 4, `route is short (a drop, not a detour) — ${res && res.path.length} cells`);
  ok(res && res.path[res.path.length - 1][1] > start[1], 'route ends below the start (it dropped)');
}

console.log('Bound — goal beyond search radius returns null (mob falls back to legacy):');
{
  const nav = mkNav([
    ' '.repeat(60),
    ' '.repeat(60),
    '#'.repeat(60),
  ]);
  const start = standCell(nav, 1), goal = standCell(nav, 55);
  ok(findMobPath(nav, start, goal, { maxRadius: 10 }) === null, 'goal 54 blocks away, radius 10 -> null');
  ok(findMobPath(nav, start, goal, { maxRadius: 60 }) !== null, 'same goal, radius 60 -> found');
}

console.log('Overhang — no upward jump through a ceiling on the head (routes around instead):');
{
  //           col: 0123456
  // Actor stands at (3,4). A platform at (5,3) makes (5,2) a standable ledge above.
  // With a ceiling block at (3,2) — directly above the actor's head (head row3,
  // rises into row2) — every UPWARD jump must be dropped; walk neighbours remain.
  const rowsBlocked = [
    '       ',
    '       ',
    '   #   ',   // row2 col3 = ceiling directly above the head
    '     # ',   // row3 col5 = platform → (5,2) standable
    '       ',
    '#######',
  ];
  const rowsOpen = rowsBlocked.slice(); rowsOpen[2] = '       ';   // same, ceiling removed
  const navB = mkNav(rowsBlocked), navO = mkNav(rowsOpen);
  const out = [];
  navNeighbors(navB, 3, 4, 3, 6, out);
  ok(out.length > 0, 'blocked: still has neighbours (can walk)');
  ok(out.every(n => n[3] >= 0), 'blocked: NO upward-jump neighbours (dr<0) under the canopy');
  ok(out.some(n => n[2] !== 0 && n[3] === 0), 'blocked: horizontal walk neighbours remain (can step out)');
  navNeighbors(navO, 3, 4, 3, 6, out);
  ok(out.some(n => n[3] < 0), 'open (no ceiling): an upward jump onto the ledge IS offered');
}

console.log('Overhang — findMobPath routes OUT from under the canopy, not straight up:');
{
  // Actor stands UNDER a one-block canopy at col2 (head clear, but the cell above
  // the head is solid). A ledge is up-and-right. The only legal route is to step
  // RIGHT out from under the canopy, then jump onto the ledge — so the FIRST move
  // must be sideways, never a straight-up bonk.
  //           col: 0123456
  const nav = mkNav([
    '       ',
    '       ',
    '  #    ',   // row2 col2 = one-block canopy directly above the head
    '     # ',   // row3 col5 = platform → (5,2) standable ledge
    '       ',   // row4 = feet row
    '#######',   // row5 floor
  ]);
  const start = [2, 4];             // tucked under the canopy (head at row3 clear)
  const goal = [5, 2];             // on the ledge, up and to the right
  ok(navStandable(nav, 2, 4), 'the under-canopy start cell is standable (head clear)');
  const res = findMobPath(nav, start, goal, { maxRadius: 40 });
  ok(res !== null, 'a route onto the ledge exists (step out + up)');
  ok(res && res.path.length >= 2 && res.path[1][0] > 2, 'first move steps OUT sideways (not a straight-up jump through the canopy)');
  ok(res && res.path[res.path.length - 1][0] === 5, 'route reaches the ledge');
}

console.log('Wall-jump climb (bot-gated) — scales a tall wall only when wallClimb is set:');
{
  //           col: 01234
  const nav = mkNav([
    '     ',
    '     ',
    '     ',   // (3,2) tops out on the wall
    '   # ',   // wall col3 (rows 3-6), 4 tall
    '   # ',
    '   # ',
    '   # ',
    '#####',   // floor
  ]);
  const start = [2, 6], goal = [3, 2];
  ok(navStandable(nav, 2, 6), 'start beside the wall base is standable');
  ok(navStandable(nav, 3, 2), 'goal on top of the wall is standable');
  ok(findMobPath(nav, start, goal, { maxRadius: 20 }) === null, 'without wall-climb the 4-tall wall is unreachable (jump maxes at 3)');
  ok(findMobPath(nav, start, goal, { maxRadius: 20, wallClimb: 4 }) !== null, 'wallClimb scales the wall (bot with Wall Slide)');
}

console.log('vBias heuristic (bot maze/vertical focus) — still solves a vertical climb:');
{
  const nav = mkNav(['      ', '      ', '   ###', '      ', '######']);
  const res = findMobPath(nav, [1, 3], [3, 1], { maxRadius: 20, vBias: 0.5 });
  ok(res !== null, 'vBias path found (option honored, still reaches the goal)');
  ok(res && res.path[res.path.length - 1][1] === 1, 'reaches the upper ledge');
  // default (vBias 0) still works too — no regression.
  ok(findMobPath(nav, [1, 3], [3, 1], { maxRadius: 20 }) !== null, 'default heuristic still solves it');
}

console.log('Pad — a jump pad extends reach across a wide gap:');
{
  // An 8-wide gap (beyond the 6 normal jump) but a pad on the take-off lip.
  const nav = mkNav([
    '             ',
    '             ',
    '####P    ####',
  ]);
  const start = standCell(nav, 1), goal = standCell(nav, 10);
  const res = findMobPath(nav, start, goal, { maxRadius: 30 });
  ok(res !== null, 'pad launches across the otherwise-unjumpable gap');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
