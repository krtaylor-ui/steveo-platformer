// Overhead World Settings — schema conversion + Kevin's classification (Phase 2, build 370).
// Pins: the panel renders from a declarative schema; the Advanced tier hides advanced rows
// (and any group left empty); the classification, group moves + rename, and the changed
// defaults are exactly as briefed.
//   node test/test-overhead-settings-schema.js
const path = require('path');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

global.window = global; global.CANVAS_W = 800; global.CANVAS_H = 500;
// A DOM stub whose #ohws-overlay records innerHTML so we can inspect what rendered.
const overlay = { style: {}, _html: '', set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; }, querySelectorAll: () => [] };
const generic = () => ({ style: {}, onclick: null, textContent: '', querySelectorAll: () => [], appendChild() {} });
global.document = {
  getElementById: (id) => (id === 'ohws-overlay' ? overlay : (id === 'ohws-style' ? null : generic())),
  head: { appendChild() {} }, body: { appendChild() {} }, createElement: () => generic(), addEventListener() {},
};
global.window.addEventListener = () => {};

const { OH_SETTINGS } = require(path.join(__dirname, '..', 'js', 'overhead', 'overhead-settings.js'));
const OWS = global.OH_WORLD_SETTINGS;

console.log('Changed defaults (Phase 2):');
{
  const d = OH_SETTINGS.defaults();
  ok(d.elevOffset === 0.5, 'elevOffset default raised to 0.5 (the maximum)');
  ok(d.maxStepDown === 2, 'maxStepDown default raised to 2');
  ok(d.pitMode === 'block', 'pitMode default flipped to block (pits are obstacles, not deadly)');
  ok(d.playerHeight === 1 && d.attackBlockHeight === 2 && d.lavaMode === 'damage' && d.glassShatter === true, 'the defaults that Kevin confirmed unchanged stay put');
}

console.log('Schema shape + classification:');
{
  const byKey = {}; OWS.SETTINGS_SCHEMA.forEach((f) => byKey[f.key] = f);
  const adv = (k) => byKey[k] && byKey[k].advanced === true;
  const basic = (k) => byKey[k] && byKey[k].advanced === false;
  // Kevin's BASIC list.
  ['moveSpeed', 'climbLevels', 'jumpClear', 'doubleJumpClear', 'sprint', 'dodgeAttacks', 'dodgeMobs', 'doubleJump', 'doubleJumpStyle', 'masterZoom', 'blockCliffFall']
    .forEach((k) => ok(basic(k), `${k} is BASIC`));
  // Kevin's ADVANCED list (incl. the whole Weapons group).
  ['playerHeight', 'elevOffset', 'jumpFloat', 'jumpScale', 'sprintMultiplier', 'crossbowSpeed', 'tridentSpeed', 'tridentReturnSpeed', 'boomerangSpeed', 'boomerangRange', 'boomerangWidth', 'meleeReach', 'meleeArc', 'attackBlockHeight', 'dayStart', 'shadowStyle', 'shadowDir', 'maxStepDown', 'pitMode', 'lavaMode', 'lavaDamage', 'glassShatter', 'mobDetectBlocks']
    .forEach((k) => ok(adv(k), `${k} is ADVANCED`));
  // Moves + rename.
  ok(byKey.mobDetectBlocks.group === 'Threats', 'mobDetectBlocks moved into the Threats group');
  ok(!OWS.GROUP_ORDER.includes('Mobs') && !OWS.SETTINGS_SCHEMA.some((f) => f.group === 'Mobs'), 'the standalone Mobs group is gone');
  ok(OWS.GROUP_ORDER.includes('Threats') && !OWS.GROUP_ORDER.some((g) => /Safety/.test(g)), 'the group is renamed "Threats" (no "Safety — Falling & Pits")');
  // doubleJump + doubleJumpStyle precede doubleJumpClear (switch before the dependent knob).
  const idx = (k) => OWS.SETTINGS_SCHEMA.findIndex((f) => f.key === k);
  ok(idx('doubleJump') < idx('doubleJumpClear') && idx('doubleJumpStyle') < idx('doubleJumpClear'), 'doubleJump + doubleJumpStyle sit above doubleJumpClear');
  // Help text exists (makes the user guide generatable).
  ok(OWS.SETTINGS_SCHEMA.some((f) => f.hint), 'the schema carries help text (hints) — the point of the conversion');
  // P3.9 per-pass quality flags are advanced sel rows.
  ['qualityShadows', 'qualityNight', 'qualityGlare'].forEach((k) => {
    ok(byKey[k] && byKey[k].type === 'sel' && byKey[k].advanced, `${k} is an advanced Protected/Sacrificeable/Off selector`);
    ok(byKey[k].opts.some((o) => o[0] === 'protected') && byKey[k].opts.some((o) => o[0] === 'sacrificeable') && byKey[k].opts.some((o) => o[0] === 'off'), `${k} offers all three policies`);
  });
  const d = OH_SETTINGS.defaults();
  ok(d.qualityGlare === 'sacrificeable' && d.qualityShadows === 'protected' && d.qualityNight === 'protected', 'defaults keep the old behaviour: glare sacrificeable, shadows + night protected');
}

console.log('Render honours the Advanced tier + hides empty groups:');
{
  const world = { settings: OH_SETTINGS.defaults() };
  OWS._world = world;
  OWS._advanced = false; OWS._render();
  const basicHtml = overlay.innerHTML;
  ok(/data-k="moveSpeed"/.test(basicHtml), 'a basic row (moveSpeed) shows with Advanced OFF');
  ok(!/data-k="elevOffset"/.test(basicHtml), 'an advanced row (elevOffset) is hidden with Advanced OFF');
  ok(!/data-k="pitMode"/.test(basicHtml), 'an advanced row (pitMode) is hidden with Advanced OFF');
  ok(!/>Weapons</.test(basicHtml), 'the all-advanced Weapons group is hidden entirely with Advanced OFF (empty-group-hide)');
  ok(/>Threats</.test(basicHtml), 'the Threats group still shows (it has basic rows)');
  OWS._advanced = true; OWS._render();
  const advHtml = overlay.innerHTML;
  ok(/data-k="elevOffset"/.test(advHtml) && /data-k="pitMode"/.test(advHtml), 'advanced rows appear with Advanced ON');
  ok(/>Weapons</.test(advHtml) && /data-k="meleeReach"/.test(advHtml), 'the Weapons group appears with Advanced ON');
  ok(/data-k="mobDetectBlocks"/.test(advHtml) && advHtml.indexOf('>Threats<') < advHtml.indexOf('data-k="mobDetectBlocks"'), 'mobDetectBlocks renders under Threats');
  ok(/title="/.test(advHtml), 'hints render as tooltips (help text is now present)');
  ok(/id="ohws-adv"/.test(advHtml), 'the Advanced toggle is in the panel header');
  ok(/id="ohws-measure"/.test(advHtml), 'the World Settings panel has a "Measure performance" button (P3.8)');
  ok(typeof OWS.measure === 'function', 'OH_WORLD_SETTINGS.measure() exists (shared by the editor top-bar ⏱ Perf button)');
}

console.log(`\noverhead settings schema: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
