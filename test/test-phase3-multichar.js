// §Phase 3 — multi-slot custom characters: several players can each run a DIFFERENT custom mix at once.
// Verifies CHARACTERS.registerCustom installs independent slots that resolve via the existing feat/get
// paths, and that isCustom() recognises the per-player slots.
const assert = require('assert');
const { CHARACTERS } = require('../js/characters.js');

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); console.log('ok —', name); pass++; } catch (e) { console.error('FAIL —', name, '\n   ', e.message); fail++; } }

t('registerCustom installs an independent slot resolvable via get()/feat()', () => {
  const def = { name: 'Ranger', body: 'girl', sel: { head: 'ears_cat' }, pal: { skin: '#ddaa77' } };
  const built = CHARACTERS.registerCustom('custom_p2', def);
  assert(built, 'returns the built def');
  assert.strictEqual(CHARACTERS.get('custom_p2').name, 'Ranger');
  assert.strictEqual(CHARACTERS.get('custom_p2').body, 'girl');
  assert(typeof CHARACTERS.feat('custom_p2') === 'object');
});

t('two per-player customs coexist without clobbering each other', () => {
  CHARACTERS.registerCustom('custom_p1', { name: 'Aaa', body: 'boy', sel: {} });
  CHARACTERS.registerCustom('custom_p2', { name: 'Bbb', body: 'girl', sel: {} });
  assert.strictEqual(CHARACTERS.get('custom_p1').name, 'Aaa');
  assert.strictEqual(CHARACTERS.get('custom_p2').name, 'Bbb');
  assert.strictEqual(CHARACTERS.get('custom_p1').body, 'boy');
  assert.strictEqual(CHARACTERS.get('custom_p2').body, 'girl');
});

t('the single-slot setCustom path still works alongside per-player slots', () => {
  CHARACTERS.setCustom({ name: 'World', body: 'boy', sel: {} });
  assert.strictEqual(CHARACTERS.get('custom').name, 'World');
  assert.strictEqual(CHARACTERS.get('custom_p1').name, 'Aaa');  // unaffected
});

t('isCustom recognises both the world slot and per-player slots', () => {
  assert.strictEqual(CHARACTERS.isCustom('custom'), true);
  assert.strictEqual(CHARACTERS.isCustom('custom_p3'), true);
  assert.strictEqual(CHARACTERS.isCustom('classic'), false);
});

t('registerCustom(id, null) removes the slot', () => {
  CHARACTERS.registerCustom('custom_p4', { name: 'Temp', sel: {} });
  assert.strictEqual(CHARACTERS.get('custom_p4').name, 'Temp');
  CHARACTERS.registerCustom('custom_p4', null);
  // get() falls back to classic once the slot is gone
  assert.strictEqual(CHARACTERS.get('custom_p4').id, 'classic');
});

t('§Phase B — Stick + Sketch are registered with the stick feat (Sketch adds skirt)', () => {
  assert.strictEqual(CHARACTERS.get('stick').feat.stick, 1);
  assert.strictEqual(CHARACTERS.get('sketch').feat.stick, 1);
  assert.strictEqual(CHARACTERS.get('sketch').feat.skirt, 1);
  assert.ok(!CHARACTERS.get('stick').feat.skirt, 'plain Stick has no skirt');
  assert.ok(CHARACTERS.ids().includes('stick') && CHARACTERS.ids().includes('sketch'), 'both in the roster');
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
