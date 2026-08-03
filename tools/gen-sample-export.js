// Regenerate sample-worlds/Overhead_QA_Test.export.json from the regression fixture.
//   node tools/gen-sample-export.js
//
// The sample handed to testers must BE the fixture the suite runs against, or the two
// drift and a tester chases a difference that isn't a bug. Build 346 shipped the sample
// with a hand-written description claiming a "glass wall" it never had (QA F3) — the
// description is now derived from the actual contents instead of typed by hand.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WT = require(path.join(ROOT, 'js', 'world-transfer.js'));
const SRC = path.join(ROOT, 'test', 'fixtures', 'overhead-qa-test-world.json');
const OUT = path.join(ROOT, 'sample-worlds', 'Overhead_QA_Test.export.json');
// Fixed so re-running produces no diff unless the fixture itself changed.
const STAMP = '2026-08-03T00:00:00.000Z';

const world = JSON.parse(fs.readFileSync(SRC, 'utf8'));
world.viewMode = 'overhead';
world.gameModeDefault = 'NRM';
world.schemaVersion = 1;

// Describe what is actually in there: block tally + the settings that change how a
// tester's checks behave (pitMode/lavaMode decide whether you can fall in or burn).
const m = world.mapSnapshot;
const tally = {};
m.ground.flat().forEach((b) => { tally[b] = (tally[b] || 0) + 1; });
const notable = ['pit', 'lava', 'glass', 'ice', 'glowstone'].filter((k) => tally[k]);
const s = world.settings || {};
const description = [
  `QA fixture — ${m.gridW}×${m.gridH} @ density ${m.density}, mode ${world.mode || 'platformer'}.`,
  `${(world.redstone || []).length} redstone devices (incl. AND/NOT/NOR gates), ${(world.bridges || []).length} bridges,`,
  `${(world.ramps || []).length} ramps, ${(world.items || []).length} key items, ${(world.spawns || []).length} spawn.`,
  notable.length ? `Contains: ${notable.map((k) => `${k}×${tally[k]}`).join(', ')}.` : 'No hazard blocks.',
  `Settings of note: pitMode=${s.pitMode || 'default'}, lavaMode=${s.lavaMode || 'default'}.`,
  'No glass cells — use test-overhead-glass.js for glass/shatter coverage.',
].join(' ');

const payload = WT.wrap(world, { name: 'Overhead QA Test', description, exportedAt: STAMP });
fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));

// Prove the file we just wrote actually imports.
const back = WT.unwrap(JSON.parse(fs.readFileSync(OUT, 'utf8')), path.basename(OUT));
const valid = back.ok && back.isOverhead && WT.validateOverhead(back.worldData).ok;
console.log(`wrote ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(1)}KB)`);
console.log(`re-reads + validates: ${valid ? 'yes' : 'NO'}`);
console.log(`description: ${description}`);
if (!valid) process.exit(1);
