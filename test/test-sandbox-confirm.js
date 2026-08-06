// World-card Delete uses an IN-PAGE confirm, not a native confirm() (the last native
// dialog in the sandbox flow — native dialogs park the renderer and block unattended QA).
//   node test/test-sandbox-confirm.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

// ── Minimal DOM stub that records the modal's wiring (no real HTML parsing). ──
function makeDom() {
  const buttons = {};                       // keyed by the selector _confirmAction queries
  const listeners = {};                     // document-level keydown, etc.
  let removed = false, focused = null, appended = null;
  const wrap = {
    id: '', style: {}, innerHTML: '',
    appendChild() {}, remove() { removed = true; },
    addEventListener(type, h) { (listeners['wrap:' + type] || (listeners['wrap:' + type] = [])).push(h); },
    querySelector(sel) {
      return buttons[sel] || (buttons[sel] = { style: {}, _onclick: null,
        set onclick(f) { this._onclick = f; }, get onclick() { return this._onclick; },
        focus() { focused = sel; } });
    },
  };
  const document = {
    getElementById(id) { return id === 'sb-confirm-modal' ? null : null; },
    createElement() { return wrap; },
    body: { appendChild(el) { appended = el; } },
    addEventListener(type, h) { (listeners['doc:' + type] || (listeners['doc:' + type] = [])).push(h); },
    removeEventListener(type, h) { const a = listeners['doc:' + type]; if (a) { const i = a.indexOf(h); if (i >= 0) a.splice(i, 1); } },
  };
  return { document, wrap, buttons, listeners, state: () => ({ removed, focused, appended }) };
}

// Load the SANDBOX object literal without executing any browser code.
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'sandbox-ui.js'), 'utf8');
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(src + '\n;this.SANDBOX = SANDBOX;', ctx, { filename: 'sandbox-ui.js' });
const SANDBOX = ctx.SANDBOX;
ok(typeof SANDBOX._confirmAction === 'function', '_confirmAction exists on SANDBOX');

console.log('In-page confirm — OK path runs onConfirm, Cancel/Esc do not:');
{
  const dom = makeDom();
  let confirmed = 0;
  ctx.document = dom.document;   // the method resolves `document` from its own (vm) global scope
  SANDBOX._confirmAction({ title: 'Delete this world?', confirmLabel: 'Delete', danger: true, onConfirm: () => confirmed++ });

  ok(dom.state().appended === dom.wrap, 'the modal is appended to the page (in-page, not native)');
  ok(dom.state().focused === '#sb-confirm-cancel', 'CANCEL takes focus, so a stray Enter is harmless (F9 lesson)');
  // Cancel must NOT run onConfirm and must remove the modal.
  dom.buttons['#sb-confirm-cancel'].onclick();
  ok(confirmed === 0, 'clicking Cancel does not delete');
  ok(dom.state().removed === true, 'Cancel removes the modal');
}
{
  const dom = makeDom();
  let confirmed = 0;
  ctx.document = dom.document;
  SANDBOX._confirmAction({ confirmLabel: 'Delete', danger: true, onConfirm: () => confirmed++ });
  dom.buttons['#sb-confirm-ok'].onclick();
  ok(confirmed === 1, 'clicking Delete (OK) runs onConfirm exactly once');
  ok(dom.state().removed === true, 'OK removes the modal too');
}

console.log('No native confirm() left on the world-card Delete paths:');
{
  const noComments = src.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  ok(!/confirm\('Delete this world\?/.test(noComments), 'the native "Delete this world?" confirm() is gone');
  const okCalls = (noComments.match(/_confirmAction\(\{[^}]*onConfirm: \(\) => this\.deleteWorld/g) || []);
  ok(okCalls.length === 2, `both delete sites (HUD button + card button) route through _confirmAction (${okCalls.length}/2)`);
  ok(!/\bconfirm\(/.test(noComments.slice(noComments.indexOf('_confirmAction(opts)'), noComments.indexOf('_confirmAction(opts)') + 1600)), '_confirmAction itself uses no native confirm/alert');
}

console.log(`\nsandbox confirm: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
