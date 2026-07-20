// Headless tests for the rebindable key map (§Phase 2). Pure logic — the module
// exports itself for node, and its localStorage access is try/caught (blank in node).
const { KEY_BINDINGS } = require('../js/keybindings.js');

let passed = 0, failed = 0;
function ok(cond, msg) { if (cond) { passed++; } else { failed++; console.log('  FAIL: ' + msg); } }
function reset() { KEY_BINDINGS._state = KEY_BINDINGS._blank(); }

console.log('Defaults reproduce the historical primary keys (byte-compatible migration):');
{
  reset();
  ok(KEY_BINDINGS.resolve(0, 'kb1', 'jump') === 'KeyW', 'kb1 jump defaults to KeyW');
  ok(KEY_BINDINGS.resolve(0, 'kb1', 'left') === 'KeyA', 'kb1 left = KeyA');
  ok(KEY_BINDINGS.resolve(0, 'kb1', 'right') === 'KeyD', 'kb1 right = KeyD');
  ok(KEY_BINDINGS.resolve(0, 'kb1', 'crouch') === 'KeyS', 'kb1 crouch = KeyS');
  ok(KEY_BINDINGS.resolve(0, 'kb1', 'melee') === 'Space', 'kb1 melee = Space');
  ok(KEY_BINDINGS.resolve(0, 'kb1', 'throw') === 'KeyQ', 'kb1 throw = KeyQ');
  ok(KEY_BINDINGS.resolve(0, 'kb1', 'hotbar1') === 'Digit1', 'hotbar1 = Digit1');
  ok(KEY_BINDINGS.resolve(0, 'kb1', 'hotbar9') === 'Digit9', 'hotbar9 = Digit9');
  ok(KEY_BINDINGS.resolve(0, 'kb2', 'jump') === 'ArrowUp', 'kb2 jump = ArrowUp');
  ok(KEY_BINDINGS.resolve(0, 'kb2', 'left') === 'ArrowLeft', 'kb2 left = ArrowLeft');
  ok(KEY_BINDINGS.resolve(0, 'kb2', 'melee') === 'Insert', 'kb2 melee = Insert');
  ok(KEY_BINDINGS.resolve(0, 'kb1', 'ranged') === 'Mouse2', 'ranged defaults to Right-Click');
  ok(KEY_BINDINGS.resolve(0, 'kb1', 'place') === 'ShiftMouse0', 'place defaults to Shift+Left');
}

console.log('Overrides win over defaults; hasOverride tracks them:');
{
  reset();
  ok(!KEY_BINDINGS.hasOverride(0, 'jump'), 'no override initially');
  KEY_BINDINGS.setBinding(0, 'jump', 'KeyH');
  ok(KEY_BINDINGS.resolve(0, 'kb1', 'jump') === 'KeyH', 'override returns KeyH');
  ok(KEY_BINDINGS.hasOverride(0, 'jump'), 'hasOverride true after set');
  ok(KEY_BINDINGS.resolve(0, 'kb1', 'left') === 'KeyA', 'other actions unaffected');
  ok(KEY_BINDINGS.currentPreset() === 'custom', 'setting a binding marks preset custom');
  KEY_BINDINGS.clearBinding(0, 'jump');
  ok(!KEY_BINDINGS.hasOverride(0, 'jump'), 'clearBinding removes the override');
  ok(KEY_BINDINGS.resolve(0, 'kb1', 'jump') === 'KeyW', 'falls back to default after clear');
}

console.log('Per-player independence:');
{
  reset();
  KEY_BINDINGS.setBinding(1, 'jump', 'Numpad0');
  ok(KEY_BINDINGS.resolve(1, 'kb1', 'jump') === 'Numpad0', 'P2 override applies to P2');
  ok(KEY_BINDINGS.resolve(0, 'kb1', 'jump') === 'KeyW', 'P1 unaffected by P2 override');
}

console.log('Presets:');
{
  reset();
  KEY_BINDINGS.applyPreset('minecraft', 0);
  ok(KEY_BINDINGS.isMinecraftMouse(), 'minecraft preset sets the mouse scheme');
  ok(KEY_BINDINGS.currentPreset() === 'minecraft', 'preset recorded');
  KEY_BINDINGS.applyPreset('default', 0);
  ok(!KEY_BINDINGS.isMinecraftMouse(), 'default preset clears the mouse scheme');
  ok(KEY_BINDINGS.mouseScheme() === 'default', 'mouseScheme default');
  // Legacy Jump: force jump onto Up/W, clear any aim-up rebind.
  reset();
  KEY_BINDINGS.setBinding(0, 'aimUp', 'ArrowUp');
  KEY_BINDINGS.applyPreset('legacyJump', 0);
  ok(KEY_BINDINGS.resolve(0, 'kb1', 'jump') === 'KeyW', 'legacyJump forces jump to KeyW');
  ok(!KEY_BINDINGS.hasOverride(0, 'aimUp'), 'legacyJump clears the aim-up rebind (gives Up/W back to jump)');
  // Default preset wipes a player's overrides.
  reset();
  KEY_BINDINGS.setBinding(0, 'left', 'KeyZ');
  KEY_BINDINGS.applyPreset('default', 0);
  ok(KEY_BINDINGS.resolve(0, 'kb1', 'left') === 'KeyA', 'default preset resets overrides');
}

console.log('Gamepad preset suggestion from id:');
{
  ok(KEY_BINDINGS.suggestGamepadPreset('Nintendo Switch Pro Controller') === 'switch', 'Nintendo id → switch');
  ok(KEY_BINDINGS.suggestGamepadPreset('Xbox Wireless Controller') === 'default', 'Xbox id → default');
  ok(KEY_BINDINGS.suggestGamepadPreset('') === 'default', 'empty id → default');
}

console.log('Conflict detection:');
{
  reset();
  ok(KEY_BINDINGS.conflicts(0, 'kb1').length === 0, 'no conflicts with defaults');
  KEY_BINDINGS.setBinding(0, 'crouch', 'KeyW');   // same as jump default
  const c = KEY_BINDINGS.conflicts(0, 'kb1');
  const hit = c.find((x) => x.code === 'KeyW');
  ok(!!hit, 'a KeyW conflict is reported');
  ok(hit && hit.actions.includes('jump') && hit.actions.includes('crouch'), 'conflict lists both jump and crouch');
}

console.log('Code labels:');
{
  ok(KEY_BINDINGS.labelFor('KeyW') === 'W', 'KeyW → W');
  ok(KEY_BINDINGS.labelFor('Mouse2') === 'Right-Click', 'Mouse2 label');
  ok(KEY_BINDINGS.labelFor('ShiftMouse0') === 'Shift + Left-Click', 'ShiftMouse0 label');
  ok(KEY_BINDINGS.labelFor('ArrowUp') === 'Up Arrow', 'ArrowUp label');
  ok(KEY_BINDINGS.labelFor('Digit3') === '3', 'Digit3 → 3');
}

reset();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
