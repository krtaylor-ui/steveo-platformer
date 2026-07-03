// Headless tests for live-mob + ground-drop persistence (serialize → adopt).
const fs = require('fs');
const vm = require('vm');
const path = require('path').join(__dirname, '..', 'js');

// mobs.js references these only inside methods, but provide them so any
// construction-time use is safe.
const real = {
  window: {}, Math, console, Set, Map, Array, Object, JSON, Number, String, Boolean,
  BLOCK: {}, BLOCK_SIZE: 32, GRAVITY: 0.5, JUMP_VELOCITY: -8, MAX_FALL_SPEED: 12,
  IFRAMES: 20, KNOCKBACK_FORCE: 6, ITEM_DROP_LIFETIME: 3600, XP_PER_ORB: 3,
  MOB_ACTIVATION_RANGE: 800, MOB_MIN_SPAWN_DIST: 200, MOB_RESPAWN_FRAMES: 600,
  CANVAS_W: 960, BOW_GRAVITY: 0.2, PLAYER_W: 20, PLAYER_H: 52,
};
// Any constant referenced only inside a mob constructor/method that we didn't
// stub resolves to a harmless numeric default (never a ReferenceError).
const sandbox = new Proxy(real, {
  has: () => true,
  get: (t, k) => (k in t ? t[k] : (typeof k === 'symbol' ? undefined : 1)),
  set: (t, k, v) => { t[k] = v; return true; },
});
vm.createContext(sandbox);
// mobs.js has no module exports (browser global scope); vm top-level class
// bindings don't attach to the context, so append an explicit export footer.
const mobSrc = fs.readFileSync(`${path}/mobs.js`, 'utf8')
  + '\n;this.MobManager = MobManager; this.Mob = Mob;';
vm.runInContext(mobSrc, sandbox, { filename: 'mobs.js' });

const MobManager = sandbox.MobManager;
const Mob        = sandbox.Mob;

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  FAIL:', msg); } };

// ---- Live-mob serialize → adopt round-trip ----
console.log('Live-mob persistence:');
const mm = new MobManager();
// Spawn a mix of mob types at known positions, damage some.
mm.mobs.push(Object.assign(mm._createMob('Zombie', 500, 300),   { hp: 7 }));
mm.mobs.push(Object.assign(mm._createMob('Skeleton', 900, 400), { hp: 3, facing: 1 }));
mm.mobs.push(mm._createMob('Creeper', 1200, 350));
const c = mm.mobs[2]; c.fusing = true; c.fuseTimer = 15;
// A dead mob should NOT be serialized.
const dead = mm._createMob('Zombie', 100, 100); dead.alive = false; mm.mobs.push(dead);

const snap = mm.serializeMobs();
ok(snap.length === 3, `serializeMobs skips dead mobs (got ${snap.length})`);
ok(snap.every(s => s.type && typeof s.x === 'number' && typeof s.hp === 'number'), 'snapshots carry type/x/hp');

// Adopt into a fresh manager (simulates reload).
const mm2 = new MobManager();
mm2.adoptSerializedMobs(snap);
ok(mm2.mobs.length === 3, `adopt restores exactly the live mobs (got ${mm2.mobs.length})`);

const srcZ = mm.mobs.find(m => m.constructor.name === 'Zombie' && m.alive);
const z = mm2.mobs.find(m => m.constructor.name === 'Zombie');
ok(z && z.hp === 7, `zombie hp preserved (got ${z && z.hp})`);
ok(z && z.x === srcZ.x, `zombie x round-trips exactly (src ${srcZ.x}, got ${z && z.x})`);

const sk = mm2.mobs.find(m => m.constructor.name === 'Skeleton');
ok(sk && sk.hp === 3, `skeleton hp preserved (got ${sk && sk.hp})`);
ok(sk && sk.facing === 1, `skeleton facing preserved (got ${sk && sk.facing})`);

const cr = mm2.mobs.find(m => m.constructor.name === 'Creeper');
ok(cr && cr.fusing === true, 'creeper fusing state preserved');
ok(cr && cr.fuseTimer === 15, `creeper fuseTimer preserved (got ${cr && cr.fuseTimer})`);

// id counter stays ahead of restored ids (no collisions with future spawns).
const maxRestored = Math.max(...snap.map(s => s.id));
ok(Mob._nextId >= maxRestored, `_nextId kept ahead of restored ids (${Mob._nextId} >= ${maxRestored})`);
const fresh = mm2._createMob('Zombie', 0, 0);
ok(mm2.mobs.concat(fresh).filter(m => m.id === fresh.id).length === 1, 'newly spawned mob id is unique');

// ---- Ground-drop restore round-trip ----
console.log('Ground-drop persistence:');
const drops = [
  { x: 640, y: 320, itemKey: 'rotten_flesh', amount: 2, life: 1200 },
  { x: 700, y: 300, itemKey: 'bone', amount: 1, life: 3000 },
];
const mm3 = new MobManager();
mm3.restoreDroppedItems(drops);
ok(mm3.droppedItems.length === 2, `restoreDroppedItems restores all drops (got ${mm3.droppedItems.length})`);
ok(mm3.droppedItems[0].itemKey === 'rotten_flesh' && mm3.droppedItems[0].amount === 2, 'drop itemKey/amount preserved');
ok(mm3.droppedItems[1].life === 3000, `drop life preserved (got ${mm3.droppedItems[1].life})`);
ok(mm3.droppedItems.every(d => d.alive), 'restored drops are alive');
// Bad entries are skipped, not crashed on.
const mm4 = new MobManager();
mm4.restoreDroppedItems([null, { x: 1 }, { x: 1, y: 2, itemKey: 'bone', amount: 1, life: 100 }]);
ok(mm4.droppedItems.length === 1, `malformed drop entries are skipped (got ${mm4.droppedItems.length})`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
