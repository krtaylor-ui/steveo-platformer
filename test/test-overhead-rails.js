// The RIGHT rail must look and behave exactly like the LEFT one (build 357).
//   node test/test-overhead-rails.js
// Kevin's screenshots: a palette dragged to the right rail rendered as bare text ("MobsX")
// with no group box, no header bar, no buttons and no fly-out — while the left rail was
// perfect. Cause: every palette style was scoped to `#oh-rail`, the LEFT rail's id, so none
// of it applied once the same markup was re-parented into `#oh-rail-right`.
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'overhead', 'overhead-editor.js'), 'utf8');
// The injected <style> block.
const css = src.slice(src.indexOf('#oh-rail{position:fixed'), src.indexOf('document.head.appendChild(s);'));

console.log('Palette styling is shared, not left-rail-only:');
// Any rule that styles palette CONTENT must not be scoped to a single rail id.
const leftScoped = (css.match(/#oh-rail \./g) || []).length;
ok(leftScoped === 0, `no palette rule is still scoped to #oh-rail alone (${leftScoped} found)`);
for (const sel of ['.grp', '.hd', '.btn', '.pinx', '.oh-top3', '.oh-gap']) {
  ok(css.indexOf('.oh-railbox ' + sel) >= 0, `${sel} is styled via the shared .oh-railbox class`);
}
ok(/\.oh-railbox \.grp:hover>\.oh-fly/.test(css), 'the hover fly-out works from either rail');
ok(/\.oh-railbox \.grp\.pinned \.hd/.test(css), 'a pinned header is styled in either rail');

console.log('Both rails carry the shared class:');
ok(/r\.id = 'oh-rail'; r\.className = 'oh-railbox'/.test(src), 'the left rail element gets it at creation');
ok(/r\.id = 'oh-rail-right'; r\.className = 'oh-railbox'/.test(src), 'the right rail element gets it at creation');
ok(/classList\.add\('oh-railbox'\)/.test(src), 'and it is re-applied on render, for elements created by an older build');

console.log('Right-rail contents cannot overflow their rail:');
// Kevin's 04: narrowing the rail made the drop-pad appear WIDER, because it kept its own
// width and a right-anchored rail lets an oversized child spill leftward.
ok(/\.oh-railbox,\.oh-railbox \*\{box-sizing:border-box\}/.test(css), 'border-box, so padding cannot widen a child past the rail');
ok(/\.oh-railbox>\*\{max-width:100%\}/.test(css), 'direct children are capped at the rail width');
ok(/\.oh-railbox \.grp,\.oh-railbox \.btn,\.oh-railbox \.oh-droppad\{width:100%;min-width:0\}/.test(css),
   'groups, buttons and the drop-pad follow the rail width instead of their own');

console.log('The right rail keeps its own geometry:');
ok(/#oh-rail\{position:fixed;top:48px;left:8px/.test(css), 'the left rail is still anchored left');
ok(/#oh-rail-right\{position:fixed;top:48px;right:8px/.test(css), 'the right rail is still anchored right');
ok(/#oh-rail-right \.oh-fly\{left:auto;right:112px\}/.test(css), 'and its fly-outs still open inward (to the left)');

console.log('The width steppers still mean what they say:');
const stepper = src.slice(src.indexOf("qAll('[data-rw]')"), src.indexOf("qAll('.grp[draggable=true]')"));
ok(/inc = v\.indexOf\('\+\+'\) >= 0 \? 28 : -28/.test(stepper), 'the ++ control widens and -- narrows');
ok(/data-rw="right--"/.test(src) && /data-rw="right\+\+"/.test(src), 'the right rail exposes both directions');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
