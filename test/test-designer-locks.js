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

console.log('Tab visibility — a tab with no VISIBLE rows must hide (build 347):');
const tabHas = (game, tabId, advOn) => { WS._game = game; WS._advanced = !!advOn; return WS._tabHasRows(tabId); };
ok(tabHas(mkGame('platformer', {}), 'debug') === false, 'Debug is hidden from a player (all rows advanced)');
ok(tabHas(mkGame('normal', {}), 'debug') === false, 'Debug is hidden in Normal too');
ok(tabHas(mkGame('sandbox', {}), 'debug', false) === false, 'Debug is hidden in sandbox with Advanced OFF');
ok(tabHas(mkGame('sandbox', {}), 'debug', true) === true, 'Debug appears in sandbox with Advanced ON');
ok(tabHas(mkGame('platformer', {}), 'world') === true, 'World still shows for a player');
ok(tabHas(mkGame('sandbox', {}), 'mobs', false) === true, 'Mob Settings keeps its sandbox drops-table exemption');

console.log('The Multiplayer tab collects the companion / shared-player / boss rows:');
const multi = S.filter((r) => r.tab === 'multi');
ok(multi.length === 8, `8 rows moved to the Multiplayer tab (${multi.length})`);
ok(new Set(multi.map((r) => r.group)).size === 3, 'in three groups: Companion, Players, Boss Scaling');
ok(!S.some((r) => /Multiplayer Boss Scaling/.test(r.group || '')), 'the old Combat > Multiplayer Boss Scaling group is gone');
ok(!S.some((r) => r.tab === 'world' && r.group === 'Players'), 'World > Players is emptied');
ok(S.filter((r) => r.tab === 'arena').length > 0, 'Arena-specific settings stayed in the Arena tab');
ok(tabHas(mkGame('platformer', {}), 'multi') === true, 'the Multiplayer tab shows in Platformer (companion rows are basic)');
ok(tabHas(mkGame('speedrunner', {}), 'multi') === false, 'and hides in Speed Run, which has no companion or boss rows');

console.log('Confirmed defaults:');
ok(row('guidedTrident').dflt === true, 'Guided Trident defaults ON');
ok(row('tridentAutoReturn').dflt === true, 'Trident Recall (right-click) defaults ON');
ok(row('wpn_trident_throwable').dflt === true, 'Trident Throwable was already ON');
ok(row('companionStuckBehavior').dflt === 'teleport', 'If Companion Gets Stuck defaults to Teleport');

console.log('Ground Slide sits between Double Jump and Wall Slide:');
const moves = S.filter((r) => r.tab === 'movement' && r.group === 'Moves').map((r) => r.key);
ok(moves.indexOf('slideEnabled') > moves.indexOf('airJumpEnabled'), 'after Double Jump');
ok(moves.indexOf('slideEnabled') < moves.indexOf('wallSlideEnabled'), 'before Wall Slide');
ok(moves.indexOf('slideSpeedMult') < moves.indexOf('wallSlideEnabled'), 'its three knobs came with it');

console.log('Arena: "Start with Grappling Hook" is a basic Arena setting that arms every player:');
{
  const g = row('arenaStartGrapple');
  ok(g && g.type === 'toggle' && g.tab === 'arena', 'arenaStartGrapple is an Arena-tab toggle');
  ok(g.dflt === false, 'default OFF — existing arenas are unchanged');
  ok(!g.advanced, 'it is a BASIC setting (shows without the Advanced tier)');
  const arena = { gameMode: 'arena', isArena: true, _worldAdvSettings: {} };
  ok(visible(arena, 'arenaStartGrapple', false) === true, 'it shows in an Arena world with Advanced OFF (basic)');
  ok(visible(mkGame('sandbox', {}), 'arenaStartGrapple', false) === true, 'and in Sandbox');
  ok(visible(mkGame('platformer', {}), 'arenaStartGrapple', false) === false, 'but NOT in a Platformer world (arena-only)');
  // The runtime grants the capability to EVERY arena player from the flag, on setup + respawn.
  const gameSrc = fs.readFileSync(path.join(ROOT, 'js/game.js'), 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  const arm = gameSrc.slice(gameSrc.indexOf('_armArenaPlayer(p, spawn)'), gameSrc.indexOf('_zoomOverrideAllowed'));
  ok(/p\.hasGrapple = !!this\._worldAdvSettings\.arenaStartGrapple;/.test(arm), '_armArenaPlayer sets hasGrapple from the flag (granted per player, every respawn, cleared when off)');
  // Keep Weapons on Death — basic arena toggle; the runtime skips the bow-reset when ON and the
  // player has collected weapons.
  const kw = row('arenaKeepWeaponsOnDeath');
  ok(kw && kw.type === 'toggle' && kw.tab === 'arena' && kw.dflt === false && !kw.advanced, 'arenaKeepWeaponsOnDeath is a basic Arena toggle, default OFF');
  ok(visible({ gameMode: 'arena', isArena: true, _worldAdvSettings: {} }, 'arenaKeepWeaponsOnDeath', false) === true, 'it shows in an Arena world');
  ok(/const keepWeapons = !!this\._worldAdvSettings\.arenaKeepWeaponsOnDeath;/.test(arm)
     && /if \(!\(keepWeapons && p\.rangedOwned && p\.rangedOwned\.length\)\) p\.bow = 'BOW';/.test(arm),
     '_armArenaPlayer preserves collected ranged weapons on respawn when the flag is ON (else resets to bow)');
}

WS._game = null;
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
