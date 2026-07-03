// Headless unit test for gpNearestInDirection (js/gamepad-nav.js) — the pure
// "nearest focusable element in a pressed direction" geometry pick. The rest of
// the module is browser+gamepad only.
const { gpNearestInDirection } = require('../js/gamepad-nav.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

// A 3×3 grid of 40×20 tiles at 100px spacing. Index = row*3 + col.
//   0 1 2      (y=0)
//   3 4 5      (y=100)
//   6 7 8      (y=200)
const rects = [];
for (let row = 0; row < 3; row++)
  for (let col = 0; col < 3; col++)
    rects.push({ x: col * 100, y: row * 100, width: 40, height: 20 });

console.log('gpNearestInDirection — 3×3 grid:');
// From center (4): each direction hits the orthogonal neighbour.
ok(gpNearestInDirection(rects, 4, 'up')    === 1, 'center → up = 1');
ok(gpNearestInDirection(rects, 4, 'down')  === 7, 'center → down = 7');
ok(gpNearestInDirection(rects, 4, 'left')  === 3, 'center → left = 3');
ok(gpNearestInDirection(rects, 4, 'right') === 5, 'center → right = 5');

// Edges: no element in that direction → -1.
ok(gpNearestInDirection(rects, 1, 'up')    === -1, 'top row → up = none');
ok(gpNearestInDirection(rects, 7, 'down')  === -1, 'bottom row → down = none');
ok(gpNearestInDirection(rects, 3, 'left')  === -1, 'left col → left = none');
ok(gpNearestInDirection(rects, 5, 'right') === -1, 'right col → right = none');

// Corner traversal.
ok(gpNearestInDirection(rects, 0, 'right') === 1, 'top-left → right = 1');
ok(gpNearestInDirection(rects, 0, 'down')  === 3, 'top-left → down = 3');
ok(gpNearestInDirection(rects, 8, 'up')    === 5, 'bottom-right → up = 5');
ok(gpNearestInDirection(rects, 8, 'left')  === 7, 'bottom-right → left = 7');

console.log('gpNearestInDirection — off-axis preference:');
// Straight-ahead beats diagonal: from 0, going down, 3 (directly below) should
// win over 4 (below-and-right) thanks to the cross-axis penalty.
ok(gpNearestInDirection(rects, 0, 'down') === 3, 'prefers directly-below over diagonal');

console.log('gpNearestInDirection — seeding + guards:');
// No current focus → seed with top-most/left-most (index 0).
ok(gpNearestInDirection(rects, -1, 'down') === 0, 'no focus → seeds top-left');
ok(gpNearestInDirection(rects, 99, 'up')   === 0, 'out-of-range index → seeds top-left');
ok(gpNearestInDirection([], 0, 'up')       === -1, 'empty set → -1');

// A single focusable → no move possible in any direction.
const one = [{ x: 10, y: 10, width: 30, height: 10 }];
ok(gpNearestInDirection(one, 0, 'down') === -1, 'single element → no neighbour');

console.log('gpNearestInDirection — vertical button stack (typical menu):');
const stack = [
  { x: 50, y: 0,   width: 200, height: 40 },
  { x: 50, y: 60,  width: 200, height: 40 },
  { x: 50, y: 120, width: 200, height: 40 },
];
ok(gpNearestInDirection(stack, 0, 'down') === 1, 'stack: 0 → down = 1');
ok(gpNearestInDirection(stack, 1, 'down') === 2, 'stack: 1 → down = 2');
ok(gpNearestInDirection(stack, 2, 'up')   === 1, 'stack: 2 → up = 1');
ok(gpNearestInDirection(stack, 1, 'up')   === 0, 'stack: 1 → up = 0');
ok(gpNearestInDirection(stack, 2, 'down') === -1, 'stack: bottom → down = none');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
