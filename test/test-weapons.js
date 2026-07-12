// Headless tests for the Smart Mobs §2 weapon-trait system:
//   - swordCleaveForTier tier→count mapping
//   - WEAPON_TRAITS registry shape
//   - MobManager.playerAttack cleave cap + hit-cone (arc) filtering
//   - Arrow piercing flag (pass-through, hit-each-once)
const fs = require('fs');
const vm = require('vm');
const jsDir = require('path').join(__dirname, '..', 'js');

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  FAIL:', msg); } };

// ── Load constants.js (WEAPON_TRAITS + swordCleaveForTier) ──
const cSandbox = new Proxy({ Math, Object, console }, {
  has: () => true,
  get: (t, k) => (k in t ? t[k] : (typeof k === 'symbol' ? undefined : 1)),
  set: (t, k, v) => { t[k] = v; return true; },
});
vm.createContext(cSandbox);
vm.runInContext(
  fs.readFileSync(`${jsDir}/constants.js`, 'utf8') +
  '\n;this.WEAPON_TRAITS = WEAPON_TRAITS; this.swordCleaveForTier = swordCleaveForTier;',
  cSandbox, { filename: 'constants.js' });
const { WEAPON_TRAITS, swordCleaveForTier } = cSandbox;

console.log('Weapon traits registry:');
ok(swordCleaveForTier(0) === 1 && swordCleaveForTier(1) === 1, 'Wood/Stone sword cleave = 1');
ok(swordCleaveForTier(2) === 2 && swordCleaveForTier(3) === 2, 'Iron/Diamond sword cleave = 2');
ok(swordCleaveForTier(4) === 3, 'Netherite sword cleave = 3');
ok(WEAPON_TRAITS.crossbow.pierce === true, 'Crossbow pierces by default');
ok(WEAPON_TRAITS.bow.pierce === false, 'Bow does not pierce');
ok(WEAPON_TRAITS.spear.cleave === 3 && WEAPON_TRAITS.spear.arcDeg < 90, 'Spear hits 3 in a narrow cone');
ok(WEAPON_TRAITS.axe.knockback > 1.5 && WEAPON_TRAITS.axe.cooldownMult > 1, 'Axe = heavy knockback, slow swing');
ok(WEAPON_TRAITS.trident.throwable === true, 'Trident is throwable');

// ── Load mobs.js for MobManager.playerAttack ──
const real = {
  window: {}, Math, console, Set, Map, Array, Object, JSON, Number, String, Boolean,
  Infinity, NaN, isFinite,
  BLOCK: {}, BLOCK_SIZE: 32, IFRAMES: 20, KNOCKBACK_FORCE: 6, ATTACK_REACH: 80,
  CANVAS_W: 960, BOW_GRAVITY: 0.2,
};
const mSandbox = new Proxy(real, {
  has: () => true,
  get: (t, k) => (k in t ? t[k] : (typeof k === 'symbol' ? undefined : 1)),
  set: (t, k, v) => { t[k] = v; return true; },
});
vm.createContext(mSandbox);
vm.runInContext(
  fs.readFileSync(`${jsDir}/mobs.js`, 'utf8') + '\n;this.MobManager = MobManager;',
  mSandbox, { filename: 'mobs.js' });
const MobManager = mSandbox.MobManager;

// Stub mob: minimal surface playerAttack touches.
function stubMob(cx, cy) {
  return {
    alive: true, cx, cy, x: cx - 8, y: cy - 8, width: 16, height: 16, hp: 100,
    takeDamage(dmg, dir, kb) { this.hp -= dmg; this._lastKb = kb; if (this.hp <= 0) this.alive = false; return true; },
  };
}

console.log('playerAttack cleave + arc:');
const mm = new MobManager();
// Five mobs all to the RIGHT of the player, within reach (player faces right).
mm.mobs = [stubMob(310, 300), stubMob(320, 300), stubMob(330, 300), stubMob(340, 300), stubMob(350, 300)];
const player = { cx: 300, cy: 300, facing: 1, weaponDamage: 5 };

// cleave:2 → exactly 2 nearest mobs damaged.
mm.playerAttack(player, 'p1', { reachMult: 1, arcDeg: 360, cleave: 2, knockback: 1, dmgMult: 1 });
ok(mm.mobs.filter(m => m.hp < 100).length === 2, 'cleave:2 damages exactly 2 mobs');
ok(mm.mobs[0].hp === 95 && mm.mobs[1].hp === 95, 'cleave hits the two NEAREST mobs');

// Reset; unlimited cleave (0) → all 5 in reach damaged.
mm.mobs.forEach(m => { m.hp = 100; m.alive = true; });
mm.playerAttack(player, 'p1', { reachMult: 1, arcDeg: 360, cleave: 0, knockback: 1, dmgMult: 1 });
ok(mm.mobs.filter(m => m.hp < 100).length === 5, 'cleave:0 (hit-all) damages every mob in reach');

// Arc filter: a mob BEHIND the player (to the left) is not hit by a narrow cone.
mm.mobs = [stubMob(320, 300), stubMob(260, 300)]; // right (front), left (behind)
mm.playerAttack(player, 'p1', { reachMult: 1, arcDeg: 90, cleave: 0, knockback: 1, dmgMult: 1 });
ok(mm.mobs[0].hp < 100 && mm.mobs[1].hp === 100, 'narrow hit-cone spares the mob behind the player');

// Knockback multiplier is forwarded to takeDamage.
mm.mobs = [stubMob(320, 300)];
mm.playerAttack(player, 'p1', { reachMult: 1, arcDeg: 360, cleave: 1, knockback: 1.9, dmgMult: 1 });
ok(mm.mobs[0]._lastKb === 1.9, 'knockback multiplier reaches takeDamage');

// dmgMult scales damage (round). weaponDamage 5 × 0.7 = 3.5 → round 4 → hp 96.
mm.mobs = [stubMob(320, 300)];
mm.playerAttack(player, 'p1', { reachMult: 1, arcDeg: 360, cleave: 1, knockback: 1, dmgMult: 0.7 });
ok(mm.mobs[0].hp === 96, 'dmgMult scales & rounds damage (5×0.7→4)');

// ── Weapon collection model (acquire / cycle) ──
console.log('Weapon collection:');
const TD = {
  WOODEN_SWORD: { type: 'sword', weaponClass: 'sword', tier: 0 },
  IRON_SWORD:   { type: 'sword', weaponClass: 'sword', tier: 2 },
  DIAMOND_SWORD:{ type: 'sword', weaponClass: 'sword', tier: 3 },
  IRON_SPEAR:   { type: 'sword', weaponClass: 'spear', tier: 2 },
  IRON_AXE:     { type: 'sword', weaponClass: 'axe',   tier: 2 },
  TRIDENT:      { type: 'sword', weaponClass: 'trident', tier: 2 },
  BOW:          { type: 'bow',   weaponClass: 'bow',   tier: 0 },
  CROSSBOW:     { type: 'bow',   weaponClass: 'crossbow', tier: 0 },
};
const pReal = { window: {}, Math, console, Set, Map, Array, Object, JSON, Number, String, Boolean, Infinity, TOOL_DATA: TD };
const pSandbox = new Proxy(pReal, {
  has: () => true, get: (t, k) => (k in t ? t[k] : (typeof k === 'symbol' ? undefined : 1)), set: (t, k, v) => { t[k] = v; return true; },
});
vm.createContext(pSandbox);
vm.runInContext(fs.readFileSync(`${jsDir}/player.js`, 'utf8') + '\n;this.Player = Player;', pSandbox, { filename: 'player.js' });
const Player = pSandbox.Player;

const pl = new Player(0, 0);
ok(pl.meleeOwned.length === 1 && pl.sword === 'WOODEN_SWORD', 'starts with just a wooden sword');
pl.acquireWeapon('IRON_SPEAR');
ok(pl.meleeOwned.length === 2 && pl.sword === 'IRON_SPEAR', 'new class (spear) is collected + equipped');
pl.acquireWeapon('IRON_SWORD');
ok(pl.meleeOwned.length === 2 && pl.meleeOwned[0] === 'IRON_SWORD', 'higher tier upgrades the sword in place (no dupe)');
pl.acquireWeapon('DIAMOND_SWORD');
ok(pl.meleeOwned.includes('DIAMOND_SWORD') && !pl.meleeOwned.includes('IRON_SWORD'), 'even-higher tier replaces the class entry');
const beforeIdx = pl.meleeIndex; pl.acquireWeapon('IRON_SWORD');  // lower than diamond
ok(pl.meleeOwned.includes('DIAMOND_SWORD') && pl.meleeOwned.length === 2, 'lower tier of an owned class is not added');
pl.acquireWeapon('IRON_AXE'); pl.acquireWeapon('TRIDENT');
ok(pl.meleeOwned.length === 4, 'sword + spear + axe + trident all collected (4 distinct classes)');
const seen = new Set(); for (let i = 0; i < 4; i++) { seen.add(pl.cycleWeapon('melee')); }
ok(seen.size === 4, 'cycling melee visits all 4 weapons and wraps');
ok(pl.acquireWeapon('WOODEN_PICKAXE') === null, 'pickaxe is not a cyclable weapon (returns null)');
pl.acquireWeapon('BOW'); pl.acquireWeapon('CROSSBOW');
ok(pl.rangedOwned.length === 2 && pl.bow, 'bow + crossbow collected in the ranged slot');
ok(pl.cycleWeapon('melee') !== null && pl.cycleWeapon('ranged') !== null, 'both slots cycle independently');
// normalizeWeapons folds a directly-set active weapon into the collection
const pl2 = new Player(0, 0); pl2.bow = 'CROSSBOW'; pl2.normalizeWeapons();
ok(pl2.rangedOwned.includes('CROSSBOW'), 'normalizeWeapons folds a deserialized bow into the collection');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
