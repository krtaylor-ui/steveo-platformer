// Headless tests for §Phase C — the rebindable GAMEPAD button map (GP_BINDINGS). Pure
// logic; verifies the defaults reproduce the historical button indices (so updateGamepad
// is byte-identical by default), the preset face-swap, overrides, labels, and conflicts.
const { GP_BINDINGS } = require('../js/keybindings.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const reset = () => { GP_BINDINGS._state = GP_BINDINGS._blank(); };

console.log('Default preset resolves to the historical button indices:');
{
  reset();
  ok(GP_BINDINGS.resolve(0, 'default', 'jump') === 0, 'jump = A (0)');
  ok(GP_BINDINGS.resolve(0, 'default', 'crouch') === 1, 'crouch = B (1)');
  ok(GP_BINDINGS.resolve(0, 'default', 'melee') === 2, 'melee = X (2)');
  ok(GP_BINDINGS.resolve(0, 'default', 'place') === 3, 'place = Y (3)');
  ok(GP_BINDINGS.resolve(0, 'default', 'prevSlot') === 4, 'prevSlot = LB (4)');
  ok(GP_BINDINGS.resolve(0, 'default', 'context') === 5, 'context = RB (5)');
  ok(GP_BINDINGS.resolve(0, 'default', 'throw') === 11, 'throw = R3 (11)');
  ok(GP_BINDINGS.resolve(0, 'default', 'menu') === 9, 'menu = Start (9)');
  // An unassigned slot (player -1) still gets the preset default.
  ok(GP_BINDINGS.resolve(-1, 'default', 'jump') === 0, 'unassigned player → default index');
}

console.log('Switch preset swaps the 4 face buttons only:');
{
  reset();
  ok(GP_BINDINGS.resolve(0, 'switch', 'jump') === 1, 'jump → 1 (face swap)');
  ok(GP_BINDINGS.resolve(0, 'switch', 'crouch') === 0, 'crouch → 0');
  ok(GP_BINDINGS.resolve(0, 'switch', 'melee') === 3, 'melee → 3');
  ok(GP_BINDINGS.resolve(0, 'switch', 'place') === 2, 'place → 2');
  ok(GP_BINDINGS.resolve(0, 'switch', 'prevSlot') === 4, 'shoulder unchanged by face swap');
  ok(GP_BINDINGS.resolve(0, 'switch', 'throw') === 11, 'R3 unchanged');
}

console.log('Overrides win + are per-player:');
{
  reset();
  GP_BINDINGS.setBinding(0, 'jump', 5);
  ok(GP_BINDINGS.resolve(0, 'default', 'jump') === 5, 'P1 override → 5');
  ok(GP_BINDINGS.resolve(1, 'default', 'jump') === 0, 'P2 unaffected');
  GP_BINDINGS.clearBinding(0, 'jump');
  ok(GP_BINDINGS.resolve(0, 'default', 'jump') === 0, 'clear restores default');
  GP_BINDINGS.setBinding(0, 'jump', 7); GP_BINDINGS.resetPlayer(0);
  ok(GP_BINDINGS.resolve(0, 'default', 'jump') === 0, 'resetPlayer clears all overrides');
}

console.log('Labels use the preset naming:');
{
  ok(GP_BINDINGS.label(0, 'default') === 'A', '0 = A (Xbox)');
  ok(GP_BINDINGS.label(0, 'switch') === 'B', '0 = B (Switch)');
  ok(GP_BINDINGS.label(1, 'default') === 'B', '1 = B (Xbox)');
  ok(GP_BINDINGS.label(2, 'default') === 'X', '2 = X');
  ok(GP_BINDINGS.label(9, 'default') === 'Menu', '9 = Menu/Start');
  ok(GP_BINDINGS.label(-1, 'default') === '—', 'no button → dash');
}

console.log('Conflict detection:');
{
  reset();
  ok(GP_BINDINGS.conflicts(0, 'default').length === 0, 'no conflicts with defaults');
  GP_BINDINGS.setBinding(0, 'jump', 1);   // same as crouch (B)
  const c = GP_BINDINGS.conflicts(0, 'default');
  const hit = c.find((x) => x.index === 1);
  ok(!!hit && hit.actions.includes('jump') && hit.actions.includes('crouch'), 'jump+crouch on button 1 flagged');
  reset();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
