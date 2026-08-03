// Designer locks + the sandbox-only Advanced tier (build 347).
//   node test/test-designer-locks.js
// Both were dead settings: physicsLocked was written by the settings UI (and set true by
// platformer-defaults) but never read, so a player could retune Gravity / Jump Height in a
// Platformer world whose jumps depended on them. These assertions pin the enforcement, and
// pin the things that must NOT be locked away.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

const ROOT = path.join(__dirname, '..');
global.window = global;
global.document = { getElementById: () => null, createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {} }), head: { appendChild() {} }, body: { appendChild() {} }, addEventListener() {} };
vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'js/constants.js'), 'utf8'), { filename: 'constants.js' });
vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'js/world-settings-ui.js'), 'utf8'), { filename: 'world-settings-ui.js' });
const WS = vm.runInThisContext('WORLD_SETTINGS');
const S = WS.SETTINGS;

// A minimal stand-in for the game object the panel reads.
const mkGame = (mode, aws) => ({ gameMode: mode, _worldAdvSettings: Object.assign({}, aws) });
const row = (key) => S.find((r) => r.key === key);
const visible = (game, key, advOn) => { WS._game = game; WS._advanced = !!advOn; return WS._visible(row(key)); };

console.log('Advanced tier is sandbox-only:');
ok(WS._advancedAllowed.call({ _game: mkGame('sandbox', {}) }) === true, 'sandbox allows Advanced');
ok(WS._advancedAllowed.call({ _game: mkGame('platformer', {}) }) === false, 'platformer does not');
ok(WS._advancedAllowed.call({ _game: null }) === false, 'no game = not allowed (no crash)');
// jumpPadVForce is an advanced physics row: invisible in play even with _advanced forced on.
ok(visible(mkGame('platformer', { physicsLocked: false }), 'jumpPadVForce', true) === false,
   'an advanced row stays hidden in play even if the flag is forced on');
ok(visible(mkGame('sandbox', { physicsLocked: false }), 'jumpPadVForce', true) === true,
   'the same row shows in sandbox with Advanced on');
ok(visible(mkGame('sandbox', { physicsLocked: false }), 'jumpPadVForce', false) === false,
   'and hides in sandbox with Advanced off');

console.log('physicsLocked defaults ON:');
ok(row('physicsLocked').dflt === true, 'the schema default is true');
const gameDefaults = fs.readFileSync(path.join(ROOT, 'js/game.js'), 'utf8');
ok(/physicsLocked:\s*true/.test(gameDefaults), '_worldAdvSettings seeds it true');
const pd = fs.readFileSync(path.join(ROOT, 'js/platformer-defaults.js'), 'utf8');
ok(/physicsLocked:\s*true/.test(pd), 'platformer defaults still set it true (now meaningful)');

console.log('Enforcement — Movement ▸ Physics is hidden from players when locked:');
for (const mode of ['normal', 'platformer', 'arena']) {
  ok(visible(mkGame(mode, { physicsLocked: true }), 'physicsGravity') === false, `Gravity hidden in ${mode} when locked`);
  ok(visible(mkGame(mode, { physicsLocked: true }), 'jumpHeightBlocks') === false, `Jump Height hidden in ${mode} when locked`);
}
ok(visible(mkGame('platformer', { physicsLocked: false }), 'physicsGravity') === true, 'unlocking gives Gravity back to players');
ok(visible(mkGame('platformer', { physicsLocked: false }), 'jumpHeightBlocks') === true, 'unlocking gives Jump Height back');
ok(visible(mkGame('platformer', {}), 'physicsGravity') === false, 'an ABSENT key counts as locked (old worlds default safely)');

console.log('Sandbox is exempt — the designer keeps access:');
ok(visible(mkGame('sandbox', { physicsLocked: true }), 'physicsGravity') === true, 'Gravity visible in sandbox even when locked');
ok(visible(mkGame('sandbox', { physicsLocked: true }), 'jumpHeightBlocks') === true, 'Jump Height visible in sandbox even when locked');

console.log('What must NOT be locked away — per-player comfort switches:');
for (const key of ['sprintEnabled', 'autoStepUp', 'airJumpEnabled', 'wallSlideEnabled', 'ledgeHangEnabled']) {
  ok(visible(mkGame('platformer', { physicsLocked: true }), key) === true, `${key} (Moves) stays available to players`);
}
// The lock must not leak outside the Movement tab.
const worldRow = S.find((r) => r.tab === 'world' && !r.advanced && (r.modes || []).includes('platformer'));
ok(visible(mkGame('platformer', { physicsLocked: true }), worldRow.key) === true,
   `the lock does not affect other tabs (${worldRow.key})`);

console.log('Scope check — only the Physics group is gated:');
const lockedRows = S.filter((r) => { WS._game = mkGame('platformer', { physicsLocked: true }); WS._advanced = false; return WS._lockedOut(r); });
ok(lockedRows.every((r) => r.tab === 'movement' && r.group === 'Physics'), 'every locked row is Movement ▸ Physics');
ok(lockedRows.length === S.filter((r) => r.tab === 'movement' && r.group === 'Physics').length, `all ${lockedRows.length} Physics rows are covered`);
WS._game = mkGame('sandbox', { physicsLocked: true });
ok(S.every((r) => !WS._lockedOut(r)), 'nothing is locked out in sandbox');

WS._game = null;
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
