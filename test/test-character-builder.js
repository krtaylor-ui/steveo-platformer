// Custom Sprites Phase 2 — parts-mixer data model (CHARACTERS.PARTS / composeFeat / setCustom).
//   node test/test-character-builder.js
const path = require('path');
const { CHARACTERS } = require(path.join(__dirname, '..', 'js', 'characters.js'));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

console.log('PARTS catalog:');
ok(Array.isArray(CHARACTERS.PARTS) && CHARACTERS.PARTS.length >= 5, 'PARTS is a non-trivial catalog');
CHARACTERS.PARTS.forEach((cat) => {
  ok(cat.key && cat.label && Array.isArray(cat.options) && cat.options.length >= 2, 'category ' + cat.key + ' well-formed');
  ok(cat.options[0].id === 'none', 'category ' + cat.key + ' first option is "none" (safe default)');
  ok(cat.options.every((o) => o.id && typeof o.feat === 'object'), 'category ' + cat.key + ' options carry id + feat');
});

console.log('composeFeat merges selected options:');
{
  const sel = { headgear: 'helm', ears: 'earsTri', tail: 'tail', face: 'snout' };
  const f = CHARACTERS.composeFeat(sel);
  ok(f.helm === 1 && f.plume === 1, 'helm option contributes helm+plume');
  ok(f.earsTri === 1, 'ears option contributes earsTri');
  ok(f.tail === 1, 'tail option contributes tail');
  ok(f.snout === 1 && f.whisk === 1, 'face snout contributes snout+whisk');
  ok(!('dome' in f), 'unselected categories contribute nothing');
  // empty / partial selection is safe (all "none")
  const empty = CHARACTERS.composeFeat({});
  ok(Object.keys(empty).length === 0, 'empty selection -> empty feat (all none)');
  const bogus = CHARACTERS.composeFeat({ headgear: 'does-not-exist' });
  ok(Object.keys(bogus).length === 0, 'unknown option id falls back to none, no throw');
}

console.log('buildCustom normalises a stored record:');
{
  const def = CHARACTERS.buildCustom({ name: 'Zappy', body: 'girl', sel: { headgear: 'hat', pattern: 'stripes' }, pal: { shirt: '#ff0000' } });
  ok(def.id === 'custom' && def.custom === true, 'built def is id=custom');
  ok(def.name === 'Zappy' && def.body === 'girl', 'name + body carried');
  ok(def.feat.hat === 1 && def.feat.stripes === 1, 'feat derived from sel');
  ok(def.pal.shirt === '#ff0000' && def.pal.skin === '#f4c78a', 'pal overrides merge over defaults');
  ok(def.views && def.views.side && def.views.top, 'custom supports both views');
  const bad = CHARACTERS.buildCustom({ body: 'zzz' });
  ok(bad.body === 'boy', 'invalid body falls back to boy');
}

console.log('setCustom installs under id "custom" so existing lookups resolve it:');
{
  CHARACTERS.setCustom(null);
  ok(CHARACTERS.get('custom').id === 'classic', 'no custom set -> get("custom") falls back to classic');
  const inst = CHARACTERS.setCustom({ name: 'Mine', sel: { headgear: 'dome', back: 'cape' }, pal: { accent: '#00ff00' } });
  ok(inst && inst.id === 'custom', 'setCustom returns the installed def');
  ok(CHARACTERS.feat('custom').dome === 1 && CHARACTERS.feat('custom').cape === 1, 'CHARACTERS.feat("custom") resolves the mix');
  ok(CHARACTERS.defaultPalette('custom').accent === '#00ff00', 'CHARACTERS.defaultPalette("custom") resolves the palette');
  ok(CHARACTERS.supports('custom', 'side') && CHARACTERS.supports('custom', 'top'), 'custom supports both engines');
  ok(CHARACTERS.isCustom('custom') && !CHARACTERS.isCustom('knight'), 'isCustom flag');
  CHARACTERS.setCustom(null);
  ok(CHARACTERS.get('custom').id === 'classic', 'setCustom(null) clears it back to classic fallback');
}

console.log('FAIRNESS — custom def carries no hitbox/size fields (cosmetic only):');
{
  const def = CHARACTERS.buildCustom({ sel: { headgear: 'helm' } });
  ['hp', 'r', 'radius', 'width', 'height', 'speed', 'hitbox'].forEach((k) =>
    ok(!(k in def), 'custom def has no "' + k + '" field'));
}

console.log(`\ncharacter builder: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
