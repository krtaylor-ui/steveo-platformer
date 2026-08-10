// CHARACTERS registry (Custom Sprites Phase 1) — engine-agnostic character data.
//   node test/test-characters.js
global.window = global;
const path = require('path');
const { CHARACTERS } = require(path.join(__dirname, '..', 'js', 'characters.js'));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

console.log('CHARACTERS — registry integrity:');
const list = CHARACTERS.list();
ok(list.length >= 12, 'roster has the full system cast (>=12)');
ok(new Set(CHARACTERS.ids()).size === list.length, 'all character ids are unique');
ok(CHARACTERS.get('classic').id === 'classic', 'get() returns the requested character');
ok(CHARACTERS.get('nope').id === 'classic', 'unknown id falls back to classic (never null)');
ok(CHARACTERS.DEFAULT_ID === 'classic', 'default character is classic (unchanged single-player look)');

console.log('CHARACTERS — every character is complete + both-engine:');
list.forEach((c) => {
  ok(!!c.name && !!c.theme && !!c.feat && !!c.pal, c.id + ': has name/theme/feat/pal');
  ['skin', 'hair', 'shirt', 'pants', 'accent'].forEach((k) => ok(typeof c.pal[k] === 'string' && c.pal[k][0] === '#', c.id + ': pal.' + k + ' is a hex colour'));
  ok(CHARACTERS.supports(c.id, 'side') && CHARACTERS.supports(c.id, 'top'), c.id + ': supports BOTH engines (system cast)');
});

console.log('CHARACTERS — helpers:');
ok(CHARACTERS.defaultPalette('astro') !== CHARACTERS.get('astro').pal, 'defaultPalette() returns a COPY (not the shared object)');
ok(CHARACTERS.feat('astro').dome === 1, 'feat() exposes accessory flags (astronaut dome)');
ok(CHARACTERS.get('classic').feat && Object.keys(CHARACTERS.get('classic').feat).length === 0, 'classic has no accessories (plain body)');

console.log(`\ncharacters: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
