// Headless test runner for the arena logic (no browser/DB needed).
//   node test/run.js
const { execFileSync } = require('child_process');
const path = require('path');
const tests = ['test-pause.js', 'test-v3.js', 'test-scoring.js', 'test-rules.js', 'test-mobs.js', 'test-gamepad-nav.js', 'test-weapons.js', 'test-foliage.js', 'test-detection.js', 'test-webs.js', 'test-pathfinding.js', 'test-wayfinding.js', 'test-platformer-defaults.js', 'test-bot-ai.js', 'test-bot-climb.js', 'test-redstone.js', 'test-keybindings.js', 'test-boomerang.js', 'test-grapple.js'];
let failed = 0;
for (const t of tests) {
  process.stdout.write(`\n=== ${t} ===\n`);
  try { process.stdout.write(execFileSync('node', [path.join(__dirname, t)], { encoding: 'utf8' })); }
  catch (e) { failed++; process.stdout.write((e.stdout || '') + (e.stderr || '')); }
}
process.stdout.write(failed ? `\n${failed} test file(s) FAILED\n` : `\nAll test files passed\n`);
process.exit(failed ? 1 : 0);
