// Headless tests for §Custom Sprites GAP-1 — SANDBOX._persistWorldData store routing + patch nesting.
// A localStorage mock + a fake LOCAL_WORLDS cover the two offline stores (oh- / lw-); the server branch
// needs a network + AUTH and is verified in-browser.

// ── mock the browser globals _persistWorldData touches ──
const _ls = (() => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() }; })();
global.localStorage = _ls;
global.alert = () => {};
const _lwMap = {};
global.LOCAL_WORLDS = {
  _all: () => _lwMap,
  _persist: () => true,
  get: (id) => _lwMap[id] || null,
};

const { SANDBOX } = require('../js/sandbox-ui.js');
SANDBOX.worlds = [];

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const ohStore = () => JSON.parse(localStorage.getItem('steveo_overhead_worlds') || '{}');

(async () => {
  console.log('1 — oh- (offline overhead): patch is written at the record top level (= its world_data):');
  {
    localStorage.setItem('steveo_overhead_worlds', JSON.stringify({ 'oh-castle': { name: 'Castle', characterId: 'classic' } }));
    SANDBOX.worlds = [{ id: 'oh-castle', world_data: { name: 'Castle', characterId: 'classic' } }];
    const okRet = await SANDBOX._persistWorldData('oh-castle', { characterId: 'custom', customCharacter: { name: 'Sir Cape' } });
    const rec = ohStore()['oh-castle'];
    ok(okRet === true, 'returns true');
    ok(rec.characterId === 'custom', 'characterId persisted to the store');
    ok(rec.customCharacter && rec.customCharacter.name === 'Sir Cape', 'customCharacter persisted');
    ok(rec.name === 'Castle', 'existing fields preserved (shallow merge)');
    ok(SANDBOX.worlds[0].world_data.characterId === 'custom', 'in-memory card cache updated');
  }

  console.log('2 — oh- prefix routes to the overhead store even if the record is missing (no server 404):');
  {
    localStorage.setItem('steveo_overhead_worlds', JSON.stringify({}));   // empty store
    SANDBOX.worlds = [];
    const okRet = await SANDBOX._persistWorldData('oh-ghost', { characterId: 'custom' });
    ok(okRet === true, 'still succeeds (prefix routing, not server)');
    ok(ohStore()['oh-ghost'] && ohStore()['oh-ghost'].characterId === 'custom', 'record created + written in the overhead store');
  }

  console.log('3 — lw- (local): patch goes UNDER world_data:');
  {
    _lwMap['lw-1'] = { id: 'lw-1', world_name: 'Local', world_data: { characterId: 'classic', foo: 1 } };
    SANDBOX.worlds = [{ id: 'lw-1', world_data: { characterId: 'classic', foo: 1 } }];
    const okRet = await SANDBOX._persistWorldData('lw-1', { characterId: 'custom', customCharacter: { name: 'Zed' } });
    ok(okRet === true, 'returns true');
    ok(_lwMap['lw-1'].world_data.characterId === 'custom', 'characterId under world_data');
    ok(_lwMap['lw-1'].world_data.customCharacter.name === 'Zed', 'customCharacter under world_data');
    ok(_lwMap['lw-1'].world_data.foo === 1, 'existing world_data fields preserved');
  }

  console.log('4 — changeWorldCharacter + saveCustomCharacter route through the same writer:');
  {
    localStorage.setItem('steveo_overhead_worlds', JSON.stringify({ 'oh-a': { name: 'A' } }));
    SANDBOX.worlds = [{ id: 'oh-a', world_data: { name: 'A' } }];
    await SANDBOX.changeWorldCharacter('oh-a', 'knight');
    ok(ohStore()['oh-a'].characterId === 'knight', 'changeWorldCharacter persists a built-in pick');
    const ret = await SANDBOX.saveCustomCharacter('oh-a', { name: 'Mix' });
    ok(ret === true && ohStore()['oh-a'].characterId === 'custom' && ohStore()['oh-a'].customCharacter.name === 'Mix', 'saveCustomCharacter persists the mix + returns true');
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
