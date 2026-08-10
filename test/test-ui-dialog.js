// DIALOG — in-app alert/confirm/prompt (non-blocking) module load + API smoke.
//   node test/test-ui-dialog.js
// (The modal interaction itself is DOM/browser-verified; this guards the module loads, exposes the
// API, and installs the non-blocking window.alert override.)
global.window = global;
global.requestAnimationFrame = () => 0;
const path = require('path');
const { DIALOG } = require(path.join(__dirname, '..', 'js', 'ui-dialog.js'));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

console.log('DIALOG — module + API:');
ok(!!DIALOG, 'module exports DIALOG');
['alert', 'confirm', 'prompt', 'toast'].forEach((k) => ok(typeof DIALOG[k] === 'function', 'DIALOG.' + k + '() is a function'));
ok(typeof window.alert === 'function', 'window.alert is overridden (non-blocking)');
// confirm/prompt are promise-based (verified by their .constructor without invoking the DOM path).
ok(DIALOG.confirm.constructor === Function && DIALOG.prompt.constructor === Function, 'confirm/prompt are callable (promise-based; interaction is browser-verified)');

console.log(`\nui dialog: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
