// Headless tests for §Phase C — the rebindable GAMEPAD button map (GP_BINDINGS). Pure
// logic; verifies the defaults reproduce the historical button indices (so updateGamepad
// is byte-identical by default), the preset face-swap, overrides, labels, and conflicts.
const { GP_BINDINGS, KEY_BINDINGS, CONTROL_PROFILES } = require('../js/keybindings.js');

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

console.log('§Controller pass — editable RT, no D-pad-as-function, Palette/Inventory on View:');
{
  reset();
  ok(GP_BINDINGS.resolve(0, 'default', 'ranged') === 7, 'ranged = RT (7), now rebindable');
  ok(GP_BINDINGS.resolve(0, 'default', 'inventory') === 8, 'Palette/Inventory = View (8) by default');
  ok(GP_BINDINGS.resolve(0, 'default', 'prevSlot') === 4, 'LB (4) → Change Melee');
  ok(GP_BINDINGS.resolve(0, 'default', 'context') === 5, 'RB (5) → Change Ranged');
  // D-pad directions are NOT functions any more (they're plain buttons / bind targets).
  for (const a of ['dpadUp', 'dpadDown', 'dpadLeft', 'dpadRight']) {
    ok(GP_BINDINGS.resolve(0, 'default', a) === null, `${a} is not a bindable function`);
  }
  // Discrete Move Left/Right ARE options (so the D-pad can drive movement), unassigned by default.
  for (const a of ['moveLeft', 'moveRight', 'sprint', 'grapple', 'grapplePull', 'cycleSel', 'nextSlot', 'prevHotbar']) {
    ok(GP_BINDINGS.resolve(0, 'default', a) === null, `${a} unassigned by default (null)`);
  }
  ok(GP_BINDINGS.conflicts(0, 'default').length === 0, 'many null actions do NOT conflict with each other');
}

console.log('§Controller pass — ✕ unassign (-1 sentinel):');
{
  reset();
  GP_BINDINGS.setBinding(0, 'jump', -1);   // unassign a face/base action
  ok(GP_BINDINGS.resolve(0, 'default', 'jump') === -1, 'jump unassigned resolves to -1');
  ok(GP_BINDINGS.label(-1, 'default') === '—', '-1 labels as —');
  GP_BINDINGS.setBinding(0, 'melee', -1);  // two unassigned actions must NOT conflict
  ok(!GP_BINDINGS.conflicts(0, 'default').some((c) => c.actions.includes('jump') && c.actions.includes('melee')), 'two unassigned (-1) actions do not conflict');
  reset();
}

console.log('§Controller pass — chord bindings:');
{
  reset();
  GP_BINDINGS.setBinding(0, 'grapple', [3, 7]);   // Y + RT
  const r = GP_BINDINGS.resolve(0, 'default', 'grapple');
  ok(Array.isArray(r) && r[0] === 3 && r[1] === 7, 'chord stored + resolved as an array');
  ok(GP_BINDINGS.isChord(r), 'isChord true for a 2-button set');
  ok(GP_BINDINGS.label([3, 7], 'default') === 'Y + RT', 'chord label joins with +');
  // A chord and a lone button are NOT the same binding → no false conflict.
  GP_BINDINGS.setBinding(0, 'cycleSel', 3);       // lone Y
  const c = GP_BINDINGS.conflicts(0, 'default');
  ok(!c.some((x) => x.actions.includes('grapple') && x.actions.includes('cycleSel')), 'chord Y+RT ≠ lone Y (no conflict)');
  // Two identical chords DO conflict.
  GP_BINDINGS.setBinding(0, 'grapplePull', [7, 3]);   // same set, different order
  const c2 = GP_BINDINGS.conflicts(0, 'default');
  ok(c2.some((x) => x.actions.includes('grapple') && x.actions.includes('grapplePull')), 'identical chords (order-independent) conflict');
  reset();
}

console.log('§Controller pass — stick swap:');
{
  reset();
  ok(GP_BINDINGS.swapSticks() === false, 'sticks not swapped by default');
  GP_BINDINGS.setSwapSticks(true);
  ok(GP_BINDINGS.swapSticks() === true, 'swap toggles on');
  GP_BINDINGS.setSwapSticks(false);
  ok(GP_BINDINGS.swapSticks() === false, 'swap toggles off');
}

console.log('§Controls Profiles — per-mode isolation + copy-from + export/import:');
{
  KEY_BINDINGS._state = null; GP_BINDINGS._state = null;   // fresh in-memory stores
  CONTROL_PROFILES.setMode('platformer');
  GP_BINDINGS.setBinding(0, 'jump', 5);
  ok(GP_BINDINGS.resolve(0, 'default', 'jump') === 5, 'platformer: jump override = 5');
  CONTROL_PROFILES.setMode('arena');
  ok(GP_BINDINGS.resolve(0, 'default', 'jump') === 0, 'arena is independent (still default A=0)');

  CONTROL_PROFILES.copyFrom('platformer', 'arena');   // "start from platformer"
  CONTROL_PROFILES.setMode('arena');
  ok(GP_BINDINGS.resolve(0, 'default', 'jump') === 5, 'copyFrom seeded arena from platformer');

  CONTROL_PROFILES.setMode('platformer');
  const prof = CONTROL_PROFILES.exportConfig('platformer');
  ok(prof && prof.steveoControlProfile === 1 && prof.mode === 'platformer' && prof.gp, 'exportConfig returns a profile object');
  CONTROL_PROFILES.importConfig(prof, 'speedrunner');
  CONTROL_PROFILES.setMode('speedrunner');
  ok(GP_BINDINGS.resolve(0, 'default', 'jump') === 5, 'importConfig applied the profile to speedrunner');
  // Keyboard bindings are also per-mode.
  CONTROL_PROFILES.setMode('platformer');
  KEY_BINDINGS.setBinding(0, 'jump', 'KeyH');
  ok(KEY_BINDINGS.resolve(0, 'kb1', 'jump') === 'KeyH', 'platformer kb jump = KeyH');
  CONTROL_PROFILES.setMode('normal');
  ok(KEY_BINDINGS.resolve(0, 'kb1', 'jump') === 'KeyW', 'normal kb jump still default W (independent)');
  KEY_BINDINGS._state = null; GP_BINDINGS._state = null; CONTROL_PROFILES.setMode('normal');
}

console.log('§Controls pass — per-mode options (Directional Aim) + sandbox-only actions:');
{
  KEY_BINDINGS._state = null; GP_BINDINGS._state = null;
  CONTROL_PROFILES.setMode('platformer');
  ok(KEY_BINDINGS.getOpt('directionalAim', false) === false, 'directionalAim defaults off');
  KEY_BINDINGS.setOpt('directionalAim', true);
  ok(KEY_BINDINGS.getOpt('directionalAim', false) === true, 'directionalAim set on (platformer)');
  CONTROL_PROFILES.setMode('normal');
  ok(KEY_BINDINGS.getOpt('directionalAim', false) === false, 'directionalAim is per-mode (normal still off)');

  // Sandbox tool actions exist but only count as conflicts within the sandbox profile.
  CONTROL_PROFILES.setMode('sandbox');
  GP_BINDINGS.setBinding(0, 'sbUndo', 4); GP_BINDINGS.setBinding(0, 'sbRedo', 4);   // both LB
  ok(GP_BINDINGS.conflicts(0, 'default').some((c) => c.actions.includes('sbUndo') && c.actions.includes('sbRedo')), 'sandbox: two tools on the same button conflict');
  CONTROL_PROFILES.setMode('normal');
  ok(!GP_BINDINGS.conflicts(0, 'default').some((c) => c.actions.includes('sbUndo')), 'sandbox actions are ignored by conflict-check outside sandbox');
  KEY_BINDINGS._state = null; GP_BINDINGS._state = null; CONTROL_PROFILES.setMode('normal');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
