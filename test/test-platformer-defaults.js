// Headless tests for the per-mode new-world defaults (js/platformer-defaults.js):
//   - Platformer ('PLT') new worlds get the "Kevin's World!" gameplay preset
//   - every other mode gets {} (engine defaults — unchanged)
//   - the preset carries gameplay/level keys and EXCLUDES player/display/instance
//     prefs (audio, controller, chat, teleport points, arena-*, speed-run-*)
//   - worldModeDefaults returns a FRESH copy each call (safe to mutate/merge)
const { PLATFORMER_DEFAULTS, worldModeDefaults } = require('../js/platformer-defaults.js');

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  FAIL:', msg); } };

console.log('PLT gets the preset:');
{
  const d = worldModeDefaults('PLT');
  ok(d.pathAwareMobs === true, 'pathAwareMobs on');
  ok(d.platformerScore === true, 'platformerScore on');
  ok(d.slideEnabled === true && d.ledgeHangEnabled === true && d.airJumpEnabled === true, 'movement moves on');
  ok(d.smartDetection === true && d.packAlert === true && d.spiderWebs === true, 'smart-mob behavior on');
  ok(d.lowHpAction_zombie === 'flee' && d.lowHpAction_piglin === 'flee', 'flee actions carried');
  ok(d.detectActionRange === 12, 'customized detect range carried');
  ok(d.physicsLocked === true, 'designer physics lock carried');
  ok(d.jumpHeightBlocks === null, 'jump height = engine default (null)');
  ok(d.weapons && d.weapons.axe && d.weapons.axe.knockback === 3.5, 'weapon traits carried');
  ok(d.backgroundTheme === 'auto', 'background theme carried');
}

console.log('Other modes get engine defaults (empty):');
{
  for (const m of ['NRM', 'RUN', 'ARN', undefined, 'anything']) {
    const d = worldModeDefaults(m);
    ok(d && typeof d === 'object' && Object.keys(d).length === 0, `mode ${m} → {} (unchanged)`);
  }
}

console.log('Excludes player/display/instance prefs (chosen scope):');
{
  const d = worldModeDefaults('PLT');
  const banned = ['musicVolume', 'sfxVolume', 'controllerSensitivity', 'controllerAimSensitivity',
    'controllerDeadzone', 'chatDisabled', 'showOnlineHealthBars', 'compactHotbar', 'worldZoom',
    'twoPlayerMode', 'customTeleportPoints'];
  for (const k of banned) ok(!(k in d), `excludes ${k}`);
  // Arena / Speed-run / boss keys are irrelevant to a Platformer world.
  const irrelevant = Object.keys(d).filter(k => /^arena|^sr[A-Z]|^boss|disableDragonHealing|bossScalingLocked/.test(k));
  ok(irrelevant.length === 0, `no arena/speed-run/boss keys (found: ${irrelevant.join(',') || 'none'})`);
}

console.log('Returns a fresh copy each call (no shared mutation):');
{
  const a = worldModeDefaults('PLT');
  a.pathAwareMobs = false;
  a.weapons.axe.knockback = 99;
  const b = worldModeDefaults('PLT');
  ok(b.pathAwareMobs === true, 'mutating one copy does not affect the next (top-level)');
  ok(b.weapons.axe.knockback === 3.5, 'deep copy — nested weapons not shared');
  ok(PLATFORMER_DEFAULTS.pathAwareMobs === true, 'the canonical preset is not mutated');
}

console.log('Simulates the creation merge (empty adv + preset for PLT):');
{
  // Mirrors LOCAL_WORLDS.create / server emptyWorldData: start from movement/{} then merge.
  const pltAdv = Object.assign({ physicsGravity: 0.66, jumpHeightBlocks: 3.5, sprintEnabled: true },
    worldModeDefaults('PLT'));
  ok(pltAdv.jumpHeightBlocks === null, 'preset overrides the base movement values for PLT');
  ok(pltAdv.pathAwareMobs === true, 'preset keys present after merge');
  const nrmAdv = Object.assign({ physicsGravity: 0.66, jumpHeightBlocks: 3.5 }, worldModeDefaults('NRM'));
  ok(nrmAdv.jumpHeightBlocks === 3.5 && !('pathAwareMobs' in nrmAdv), 'NRM merge leaves base untouched');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
