// ══════════════════════════════════════════════════════════════════════════
// DIALOG — in-app, NON-BLOCKING replacements for the browser's native alert /
// confirm / prompt. Native dialogs freeze the JS thread and can only be closed
// by the OS, which stalls the automated tester when no human is present (Kevin).
// These render an in-page modal instead, so the page keeps running and the modal
// is dismissable by mouse, keyboard (Enter=OK, Esc=Cancel) or a gamepad (A / B).
//
//   window.alert(msg)            -> non-blocking modal, no caller change needed (overridden below)
//   DIALOG.alert(msg, opts)      -> Promise (resolves when dismissed)
//   DIALOG.confirm(msg, opts)    -> Promise<boolean>
//   DIALOG.prompt(msg, opts)     -> Promise<string|null>
//   DIALOG.toast(msg, opts)      -> brief auto-dismissing corner note
//
// opts: { title, okText, cancelText, danger, value (prompt), placeholder }
// ══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var _q = [];        // queued dialogs (one shown at a time, like native alert)
  var _active = null;  // { el, resolve, onKey, kind }
  var _padPrev = false;

  function ensureCss() {
    if (document.getElementById('dialog-css')) return;
    var st = document.createElement('style'); st.id = 'dialog-css';
    st.textContent =
      '.dlg-back{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;' +
        'background:rgba(6,10,18,.62);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}' +
      '.dlg-card{background:#1b1f2b;color:#eef1f8;border:1px solid #33507e;border-radius:14px;padding:20px 22px;' +
        'width:92%;max-width:440px;box-shadow:0 14px 44px rgba(0,0,0,.5)}' +
      // §T2-2 — the app has NO light theme (modern + retro are both dark), so a light-OS must NOT flip
      // the dialog to white (that was the Info-modal white-flash). Dialog family is always dark.
      '.dlg-title{font-weight:700;font-size:16px;margin:0 0 8px}' +
      '.dlg-msg{font-size:14px;line-height:1.5;margin:0 0 14px;white-space:pre-wrap;word-break:break-word}' +
      '.dlg-input{width:100%;box-sizing:border-box;padding:9px 11px;border-radius:8px;border:1px solid #33507e;' +
        'background:#0e1420;color:#eef1f8;font-size:14px;margin:0 0 14px}' +
      '.dlg-btns{display:flex;gap:10px;justify-content:flex-end}' +
      '.dlg-btn{font:600 14px/1 inherit;border:1px solid #3c5a8c;background:#22304a;color:#dbe4f3;' +
        'border-radius:8px;padding:9px 16px;cursor:pointer}' +
      '.dlg-btn.primary{background:#2f7d4f;border-color:#49b578;color:#fff}' +
      '.dlg-btn.danger{background:#a5342b;border-color:#d1584d;color:#fff}' +
      '.dlg-btn:focus-visible{outline:2px solid #6fb0ff;outline-offset:2px}' +
      '.dlg-toast-wrap{position:fixed;left:0;right:0;bottom:22px;z-index:100001;display:flex;flex-direction:column;' +
        'align-items:center;gap:8px;pointer-events:none}' +
      '.dlg-toast{background:#1b1f2b;color:#eef1f8;border:1px solid #33507e;border-radius:10px;padding:10px 16px;' +
        'font:500 13px/1.4 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.4);max-width:80%;opacity:0;' +
        'transform:translateY(8px);transition:opacity .18s,transform .18s}' +
      '.dlg-toast.show{opacity:1;transform:none}' +
      '.dlg-toast.err{border-color:#d1584d}';
    (document.head || document.documentElement).appendChild(st);
  }

  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); };

  function pump() {
    if (_active || !_q.length) return;
    var job = _q.shift();
    show(job);
  }

  function show(job) {
    ensureCss();
    var opts = job.opts || {};
    var back = document.createElement('div'); back.className = 'dlg-back'; back.setAttribute('role', 'dialog'); back.setAttribute('aria-modal', 'true');
    var isPrompt = job.kind === 'prompt', isConfirm = job.kind === 'confirm';
    var okText = opts.okText || (isConfirm ? 'OK' : 'OK');
    var cancelText = opts.cancelText || 'Cancel';
    back.innerHTML =
      '<div class="dlg-card">' +
        (opts.title ? '<h2 class="dlg-title">' + esc(opts.title) + '</h2>' : '') +
        '<p class="dlg-msg">' + esc(job.msg) + '</p>' +
        (isPrompt ? '<input class="dlg-input" type="text" value="' + esc(opts.value || '') + '" placeholder="' + esc(opts.placeholder || '') + '">' : '') +
        '<div class="dlg-btns">' +
          ((isConfirm || isPrompt) ? '<button class="dlg-btn" data-act="cancel">' + esc(cancelText) + '</button>' : '') +
          '<button class="dlg-btn primary' + (opts.danger ? ' danger' : '') + '" data-act="ok">' + esc(okText) + '</button>' +
        '</div>' +
      '</div>';
    (document.body || document.documentElement).appendChild(back);
    var input = back.querySelector('.dlg-input');
    var okBtn = back.querySelector('[data-act="ok"]');
    var done = function (val) {
      if (_active !== rec) return;
      document.removeEventListener('keydown', onKey, true);
      if (back.parentNode) back.parentNode.removeChild(back);
      _active = null;
      try { job.resolve(val); } catch (e) {}
      pump();
    };
    var accept = function () { done(isPrompt ? (input ? input.value : '') : (isConfirm ? true : undefined)); };
    var reject = function () { done(isPrompt ? null : (isConfirm ? false : undefined)); };
    back.addEventListener('mousedown', function (e) { if (e.target === back && (isConfirm || isPrompt)) reject(); });   // backdrop click = cancel (confirm/prompt only)
    back.querySelectorAll('.dlg-btn').forEach(function (b) { b.onclick = function () { b.dataset.act === 'ok' ? accept() : reject(); }; });
    var onKey = function (e) {
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); accept(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); (isConfirm || isPrompt) ? reject() : accept(); }
    };
    document.addEventListener('keydown', onKey, true);
    var rec = { back: back, accept: accept, reject: reject, onKey: onKey };
    _active = rec;
    setTimeout(function () { (input || okBtn).focus(); if (input) input.select(); }, 0);
  }

  // Gamepad polling — A (0) accepts, B (1) cancels — so a controller-only player (or the tester)
  // can clear a dialog without a keyboard/mouse. Runs continuously; cheap when idle.
  function padLoop() {
    try {
      if (_active) {
        var pads = (navigator.getGamepads && navigator.getGamepads()) || [];
        var a = false, b = false;
        for (var i = 0; i < pads.length; i++) { var g = pads[i]; if (!g || !g.buttons) continue; if (g.buttons[0] && g.buttons[0].pressed) a = true; if (g.buttons[1] && g.buttons[1].pressed) b = true; }
        if ((a || b) && !_padPrev) { if (a) _active.accept(); else _active.reject(); }
        _padPrev = a || b;
      } else { _padPrev = false; }
    } catch (e) {}
    requestAnimationFrame(padLoop);
  }

  var DIALOG = {
    alert: function (msg, opts) { return new Promise(function (res) { _q.push({ kind: 'alert', msg: msg, opts: opts || {}, resolve: res }); pump(); }); },
    confirm: function (msg, opts) { return new Promise(function (res) { _q.push({ kind: 'confirm', msg: msg, opts: opts || {}, resolve: res }); pump(); }); },
    prompt: function (msg, opts) {
      if (typeof opts === 'string') opts = { value: opts };   // DIALOG.prompt(msg, defaultValue) convenience
      return new Promise(function (res) { _q.push({ kind: 'prompt', msg: msg, opts: opts || {}, resolve: res }); pump(); });
    },
    toast: function (msg, opts) {
      ensureCss(); opts = opts || {};
      var wrap = document.getElementById('dlg-toast-wrap');
      if (!wrap) { wrap = document.createElement('div'); wrap.id = 'dlg-toast-wrap'; wrap.className = 'dlg-toast-wrap'; (document.body || document.documentElement).appendChild(wrap); }
      var t = document.createElement('div'); t.className = 'dlg-toast' + (opts.type === 'error' ? ' err' : ''); t.textContent = String(msg);
      wrap.appendChild(t); requestAnimationFrame(function () { t.classList.add('show'); });
      setTimeout(function () { t.classList.remove('show'); setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 220); }, opts.ms || 2600);
    },
  };

  if (typeof window !== 'undefined') {
    window.DIALOG = DIALOG;
    // Drop-in override: every existing alert() becomes a non-blocking modal, no caller changes.
    // (Native alert blocked the thread; callers that ran code after alert() still run it — now
    // immediately rather than after dismissal, which is fine for fire-and-forget messages.)
    window.alert = function (m) { DIALOG.alert(m); };
    // Safety net: native confirm()/prompt() FREEZE the automation channel. Every real caller now uses
    // DIALOG.confirm/prompt (async); these overrides guarantee that any stray or future native call
    // can never freeze — they show a non-blocking modal and return a safe default (cancel / null).
    window.confirm = function (m) { console.warn('[dialog] native confirm() intercepted — use DIALOG.confirm'); DIALOG.alert(m); return false; };
    window.prompt = function (m, d) { console.warn('[dialog] native prompt() intercepted — use DIALOG.prompt'); DIALOG.alert(m); return (d == null ? null : d); };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(padLoop);
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { DIALOG };
})();
