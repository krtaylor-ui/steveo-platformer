// Regression for the Lock's "Accepted keys" list (OH_EDITOR._keysOnMap).
// The original bug: `return [].slice.call(aSet)` — a Set is NOT array-like, so it
// always returned [], and no lock could ever be restricted to a key. Also verifies the
// keyId derivation works for every key/jewel/passcard and for a legacy `key` field.
//   node test/test-overhead-keys.js
global.window = global;
const cls = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
function mkEl() { return { style: {}, classList: cls, appendChild() {}, addEventListener() {}, getContext: () => ({}), width: 1, height: 1 }; }
global.document = { getElementById: () => mkEl(), head: { appendChild() {} }, createElement: () => mkEl(), body: { appendChild() {}, classList: cls }, addEventListener() {} };
global.window.addEventListener = () => {}; global.CANVAS_W = 800; global.CANVAS_H = 500;
require('../js/overhead/overhead-palette.js');
require('../js/overhead/overhead-editor.js');
const OH_EDITOR = global.OH_EDITOR;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const keys = (items) => OH_EDITOR._keysOnMap.call({ world: { items } });

console.log('Lock accepted-keys list (OH_EDITOR._keysOnMap):');
ok(JSON.stringify(keys([{ col: 20, row: 8, kind: 'key', itemKey: 'key_gold' }])) === '["gold"]',
  'a single gold key resolves to ["gold"] (was [] — the Set-not-array-like bug)');
ok(keys([{ kind: 'key', itemKey: 'key_gold' }, { kind: 'key', itemKey: 'key_gold' }]).length === 1,
  'duplicate keys collapse (Set)');
const mixed = keys([{ kind: 'key', itemKey: 'key_gold' }, { kind: 'key', itemKey: 'jewel_emerald' }, { kind: 'key', itemKey: 'passcard' }]);
ok(mixed.join(',') === 'gold,emerald,passcard', 'gold/jewel/passcard all derive their keyId (' + mixed.join(',') + ')');
ok(JSON.stringify(keys([{ col: 3, row: 20, key: 'key_gold' }])) === '["gold"]', 'a legacy `key` field (no itemKey) still resolves');
ok(JSON.stringify(keys([{ kind: 'coin', itemKey: 'coin' }])) === '[]', 'a non-key item contributes nothing');
ok(JSON.stringify(keys([])) === '[]', 'no items → empty list (no throw)');

console.log(`\noverhead keys: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
