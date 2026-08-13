// Headless tests for §B6 — the appropriateness filter (usernames / world names / descriptions).
const M = require('../js/moderation.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

console.log('1 — clean, ordinary text passes:');
{
  for (const s of ['SteveWorld', 'Sky Castle', 'Speedy McRun', 'Level 42', 'assassin fortress', 'Scunthorpe', 'grasshopper',
    // §C-1 allowlist — common kid words that contain a root must stay CLEAN
    'Cucumber World', 'Uranus Base', 'Cockpit Racer', 'Peacock Palace', 'grape juice', 'my therapist',
    // §C-1b — stem matching must NOT over-block infix roots (tester's game-plausible corpus)
    'document', 'Documentation', 'spicy', 'spice', 'spices', 'skyscraper', 'shiitake', 'accumulate',
    'circumstance', 'vacuum', 'succumb', 'cumulus', 'suspicious', 'auspicious', 'conspicuous', 'title',
    'titan', 'titanic', 'competition', 'prickly', 'grapefruit', 'scrapbook', 'therapy', 'classic',
    'basement', 'password', 'assemble', 'assassin', 'brass', 'compass', 'unisex', 'analysis',
    'fire retardant', 'pussycat']) {
    ok(M.isClean(s), `"${s}" is allowed`);
  }
  ok(M.check(null).ok && M.check('').ok, 'null/empty are allowed');
}

console.log('2 — profanity is blocked, including leetspeak + padding:');
{
  for (const s of ['shit', 'sh1t', 'fuuuck', 'a$$hole world', 'b1tch', 'my p0rn level',
    // §C-1 — inflections + compounds + the ni66er leet gap must ALL be caught now
    'shitty', 'Shitty Fucking Campaign', 'fucking', 'fucker', 'assholes', 'bitches', 'dickhead', 'bullshit', 'dumbfuck', 'ni66er',
    // §C-1b — 9→g leet gap, spaced/dotted evasion, and infix profanity
    'ni99er', 'f u c k', 'f.u.c.k', 's h i t', 'unfuckingbelievable']) {
    ok(!M.isClean(s), `"${s}" is blocked`);
  }
}

console.log('3 — slurs are blocked even embedded (substring pass):');
{
  ok(!M.isClean('xxniggerxx'), 'embedded slur blocked');
  ok(!M.isClean('nazitown'), 'embedded nazi blocked');
}

console.log('4 — check() returns a friendly reason with the field label:');
{
  const r = M.check('shit', 'world name');
  ok(!r.ok && /world name/.test(r.reason), 'reason names the field');
}

console.log('5 — foldUsername case-folds + trims for uniqueness:');
{
  ok(M.foldUsername('Steve') === 'steve', 'Steve → steve');
  ok(M.foldUsername('  ALEX ') === 'alex', 'trims + lowercases');
  ok(M.foldUsername('Steve') === M.foldUsername('STEVE'), 'Steve and STEVE collide');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
