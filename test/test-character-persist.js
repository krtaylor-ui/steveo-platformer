// Custom Sprites — characterId PERSISTENCE (build 434 tester bugs).
//   node test/test-character-persist.js
// Guards the two fixes:
//   BUG 1  a saved/resumed game keeps its character — GAME_STATE.serialize() writes characterId and
//          GAME_STATE.deserialize() restores it (was: every resume reverted to 'classic').
//   BUG 2  a local (lw-) side-scroll world persists its character — LOCAL_WORLDS.setCharacter()
//          (was: the Sandbox fallback silently no-op'd; steveo_local_worlds had no characterId).
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

// ── load GAME_STATE (bare `const`, no export) via a function wrapper that returns it ──
const gsSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'game-state.js'), 'utf8');
// Provide the globals game-state.js touches; return the object it declares.
const GAME_STATE = new Function('window', 'console', gsSrc + '\nreturn GAME_STATE;')(global, console);

// ── load LOCAL_WORLDS (assigns window.LOCAL_WORLDS) with a localStorage stub ──
global.window = global;
const _ls = {};
global.localStorage = { getItem: (k) => (k in _ls ? _ls[k] : null), setItem: (k, v) => { _ls[k] = String(v); }, removeItem: (k) => { delete _ls[k]; } };
global.alert = () => {};
require(path.join(__dirname, '..', 'js', 'local-worlds.js'));
const LOCAL_WORLDS = global.LOCAL_WORLDS;
// CHARACTERS must be global so game-state.js's deserialize (which references it via typeof) can setCustom.
global.CHARACTERS = require(path.join(__dirname, '..', 'js', 'characters.js')).CHARACTERS;

console.log('BUG 1 — serialize writes characterId, deserialize restores it:');
{
  // minimal game stub sufficient for serialize()
  const stubGame = {
    level: { grid: [[1, 1], [1, 1]], width: 2, height: 2 },
    player: { x: 0, y: 0, hp: 10, xp: 0, level: 1, selectedSlot: 0, hotbar: [], inventory: [], facing: 1 },
    totalGameTime: 0,
    sandbox: null,
  };
  global.window.CURRENT_CHARACTER_ID = 'knight';
  let out = null, threw = null;
  try { out = GAME_STATE.serialize(stubGame); } catch (e) { threw = e.message; }
  ok(!threw, 'serialize() runs on a minimal game' + (threw ? ' — ' + threw : ''));
  ok(out && out.characterId === 'knight', 'serialize() carries the live characterId (knight)');

  // deserialize restores it onto the game + the global (the resume path)
  const g2 = { player: {} };
  global.window.CURRENT_CHARACTER_ID = 'classic';   // pretend a fresh construct defaulted to classic
  GAME_STATE.deserialize(g2, { characterId: 'knight' }, { newGame: true });
  ok(g2._characterId === 'knight', 'deserialize() sets game._characterId from the save');
  ok(global.window.CURRENT_CHARACTER_ID === 'knight', 'deserialize() restores window.CURRENT_CHARACTER_ID');

  // no characterId in the save → leaves things alone (older saves)
  const g3 = { player: {} };
  global.window.CURRENT_CHARACTER_ID = 'cat';
  GAME_STATE.deserialize(g3, { playerProgress: null }, {});
  ok(global.window.CURRENT_CHARACTER_ID === 'cat', 'deserialize() without characterId does not clobber the current id');
}

console.log('PHASE 2 — customCharacter survives serialize/deserialize:');
{
  const stubGame = {
    level: { grid: [[1]], width: 1, height: 1 },
    player: { x: 0, y: 0, hp: 10, xp: 0, level: 1, selectedSlot: 0, hotbar: [], inventory: [], facing: 1 },
    totalGameTime: 0, sandbox: null,
    _customCharacter: { name: 'Mixy', body: 'girl', sel: { headgear: 'hat', tail: 'tail' }, pal: { shirt: '#123456' } },
  };
  global.window.CURRENT_CHARACTER_ID = 'custom';
  const out = GAME_STATE.serialize(stubGame);
  ok(out && out.customCharacter && out.customCharacter.name === 'Mixy', 'serialize() carries the custom mix');
  ok(out.characterId === 'custom', 'serialize() carries characterId=custom');

  // deserialize restores it AND installs it into CHARACTERS so the renderers resolve it
  CHARACTERS.setCustom(null);
  const g2 = { player: {} };
  GAME_STATE.deserialize(g2, { characterId: 'custom', customCharacter: out.customCharacter }, { newGame: true });
  ok(g2._customCharacter && g2._customCharacter.name === 'Mixy', 'deserialize() restores game._customCharacter');
  ok(CHARACTERS.feat('custom').hat === 1 && CHARACTERS.feat('custom').tail === 1, 'deserialize() installs the mix (CHARACTERS.feat resolves it)');
  ok(CHARACTERS.defaultPalette('custom').shirt === '#123456', 'installed custom palette resolves');
  CHARACTERS.setCustom(null);
}

console.log('PHASE 2 — LOCAL_WORLDS.setCustomCharacter persists mix + id on lw- worlds:');
{
  ok(typeof LOCAL_WORLDS.setCustomCharacter === 'function', 'LOCAL_WORLDS.setCustomCharacter exists');
  const w = LOCAL_WORLDS.create({ worldName: 'C', worldWidth: 10, worldHeight: 10, gameModeDefault: 'PLT' });
  const def = { name: 'Loc', body: 'boy', sel: { back: 'cape' }, pal: {} };
  ok(LOCAL_WORLDS.setCustomCharacter(w.id, def) === true, 'setCustomCharacter returns true');
  const re = LOCAL_WORLDS.get(w.id);
  ok(re.world_data.characterId === 'custom', 'stored characterId=custom');
  ok(re.world_data.customCharacter && re.world_data.customCharacter.name === 'Loc', 'stored the custom mix');
}

console.log('BUG 2 — LOCAL_WORLDS.setCharacter persists on lw- worlds:');
{
  ok(typeof LOCAL_WORLDS.setCharacter === 'function', 'LOCAL_WORLDS.setCharacter exists');
  const w = LOCAL_WORLDS.create({ worldName: 'T', worldWidth: 10, worldHeight: 10, gameModeDefault: 'PLT' });
  const okSet = LOCAL_WORLDS.setCharacter(w.id, 'wizard');
  ok(okSet === true, 'setCharacter returns true for a real world');
  // re-read from storage (not the returned object) to prove it actually persisted
  const reread = LOCAL_WORLDS.get(w.id);
  ok(reread && reread.world_data && reread.world_data.characterId === 'wizard', 'characterId persisted to steveo_local_worlds');
  ok(LOCAL_WORLDS.setCharacter('lw-nope', 'wizard') === false, 'setCharacter on a missing id returns false');
}

console.log(`\ncharacter persist: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
