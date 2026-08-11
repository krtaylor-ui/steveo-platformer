// ══════════════════════════════════════════════════════════════════════════
// character-builder.js — Custom Sprites Phase 2 parts-mixer UI.
//
// A creator composes a character from curated PARTS (CHARACTERS.PARTS) + boy/girl body + the five
// colours, sees a live preview, and Saves. The result ({name,body,sel,pal}) is persisted per-world by
// SANDBOX.saveCustomCharacter (characterId='custom' + customCharacter). Every part maps to a Phase-1
// feat flag, so the SAME accessory code renders it in BOTH engines — no new art.
//
// Preview uses the OVERHEAD renderer (drawOverheadPlayer) because it draws standalone on any canvas
// and shows every part (head/ears/face/back/tail/hand/pattern). The side-scroll sprite renders the
// same feat flags in-game (Phase-1 verified); a side preview can be added later.
// ══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var STYLE_ID = 'cb-style';
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '.cb-back{position:fixed;inset:0;background:rgba(6,10,18,.72);display:flex;align-items:center;justify-content:center;z-index:12000;font-family:inherit}',
      '.cb-card{background:#1b2030;color:#e8ecf4;border:1px solid #38425c;border-radius:14px;box-shadow:0 18px 60px rgba(0,0,0,.55);width:min(680px,94vw);max-height:92vh;overflow:auto;padding:18px 20px}',
      '.cb-h{display:flex;align-items:center;justify-content:space-between;margin:0 0 12px}',
      '.cb-h h2{font-size:19px;margin:0}',
      '.cb-grid{display:grid;grid-template-columns:170px 1fr;gap:16px}',
      '.cb-prev{display:flex;flex-direction:column;align-items:center;gap:8px}',
      '.cb-canvas{background:radial-gradient(circle at 50% 40%,#2a3550,#161b28);border:1px solid #38425c;border-radius:12px}',
      '.cb-parts{display:grid;grid-template-columns:1fr 1fr;gap:10px 14px}',
      '.cb-row{display:flex;flex-direction:column;gap:3px}',
      '.cb-row label{font-size:12px;color:#9fb0cc;letter-spacing:.02em}',
      '.cb-row select,.cb-row input[type=text]{background:#0f1420;color:#e8ecf4;border:1px solid #38425c;border-radius:7px;padding:6px 8px;font-size:13px}',
      '.cb-cols{display:flex;flex-wrap:wrap;gap:10px;margin-top:4px}',
      '.cb-col{display:flex;flex-direction:column;align-items:center;gap:3px;font-size:11px;color:#9fb0cc}',
      '.cb-col input[type=color]{width:38px;height:30px;border:1px solid #38425c;border-radius:6px;background:#0f1420;padding:2px;cursor:pointer}',
      '.cb-foot{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:16px}',
      '.cb-btn{border:none;border-radius:8px;padding:9px 16px;font-size:14px;font-weight:600;cursor:pointer}',
      '.cb-save{background:#37a05a;color:#fff}',
      '.cb-cancel{background:#2a3247;color:#c7d2e6}',
      '.cb-rand{background:#3a4a6b;color:#dbe6ff}',
      '@media(max-width:560px){.cb-grid{grid-template-columns:1fr}.cb-parts{grid-template-columns:1fr}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  var CB = {
    _el: null,

    open: function (worldId, existingDef, onSaved) {
      if (typeof CHARACTERS === 'undefined' || !CHARACTERS.PARTS) return;
      this._worldId = worldId;
      this._onSaved = onSaved || function () {};
      var def = existingDef || {};
      this._sel = Object.assign({}, def.sel || {});
      this._pal = Object.assign({}, CHARACTERS.DEFAULT_PALETTE, def.pal || {});
      this._body = def.body === 'girl' ? 'girl' : 'boy';
      this._name = def.name || 'My Character';
      injectStyle();
      this._build();
      this._render();
    },

    _defNow: function () { return { name: this._name, body: this._body, sel: Object.assign({}, this._sel), pal: Object.assign({}, this._pal) }; },

    _build: function () {
      var self = this;
      if (this._el) this._el.remove();
      var back = document.createElement('div');
      back.className = 'cb-back';

      var partsHtml = CHARACTERS.PARTS.map(function (cat) {
        var opts = cat.options.map(function (o) {
          var seld = (self._sel[cat.key] || 'none') === o.id ? ' selected' : '';
          return '<option value="' + o.id + '"' + seld + '>' + o.label + '</option>';
        }).join('');
        return '<div class="cb-row"><label>' + cat.label + '</label><select data-cat="' + cat.key + '">' + opts + '</select></div>';
      }).join('');

      var bodyOpts = ['boy', 'girl'].map(function (b) {
        return '<option value="' + b + '"' + (self._body === b ? ' selected' : '') + '>' + (b === 'boy' ? 'Body A' : 'Body B') + '</option>';
      }).join('');

      var COLS = [['skin', 'Skin'], ['hair', 'Hair'], ['shirt', 'Shirt'], ['pants', 'Pants'], ['accent', 'Accent']];
      var colsHtml = COLS.map(function (c) {
        return '<div class="cb-col"><input type="color" data-col="' + c[0] + '" value="' + self._pal[c[0]] + '"><span>' + c[1] + '</span></div>';
      }).join('');

      back.innerHTML =
        '<div class="cb-card" role="dialog" aria-label="Build a Character">' +
          '<div class="cb-h"><h2>🎨 Build a Character</h2></div>' +
          '<div class="cb-grid">' +
            '<div class="cb-prev">' +
              '<canvas class="cb-canvas" width="168" height="168"></canvas>' +
              '<div class="cb-row" style="width:100%"><label>Name</label><input type="text" class="cb-name" maxlength="24" value="' + (this._name.replace(/"/g, '&quot;')) + '"></div>' +
              '<div class="cb-row" style="width:100%"><label>Body</label><select class="cb-body">' + bodyOpts + '</select></div>' +
            '</div>' +
            '<div>' +
              '<div class="cb-parts">' + partsHtml + '</div>' +
              '<div class="cb-cols">' + colsHtml + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="cb-foot">' +
            '<button class="cb-btn cb-rand">🎲 Surprise Me</button>' +
            '<div style="display:flex;gap:10px"><button class="cb-btn cb-cancel">Cancel</button><button class="cb-btn cb-save">Save Character</button></div>' +
          '</div>' +
        '</div>';

      // wire inputs
      back.querySelectorAll('select[data-cat]').forEach(function (sel) {
        sel.addEventListener('change', function (e) { self._sel[e.currentTarget.dataset.cat] = e.currentTarget.value; self._render(); });
      });
      back.querySelectorAll('input[data-col]').forEach(function (inp) {
        inp.addEventListener('input', function (e) { self._pal[e.currentTarget.dataset.col] = e.currentTarget.value; self._render(); });
      });
      back.querySelector('.cb-name').addEventListener('input', function (e) { self._name = e.currentTarget.value || 'My Character'; });
      back.querySelector('.cb-body').addEventListener('change', function (e) { self._body = e.currentTarget.value; self._render(); });
      back.querySelector('.cb-rand').addEventListener('click', function () { self._randomize(); });
      back.querySelector('.cb-cancel').addEventListener('click', function () { self._close(); });
      back.querySelector('.cb-save').addEventListener('click', function () { self._save(); });
      back.addEventListener('mousedown', function (e) { if (e.target === back) self._close(); });

      document.body.appendChild(back);
      this._el = back;
      this._canvas = back.querySelector('.cb-canvas');
    },

    // Deterministic-free randomiser is fine here (UI action, not a resumable path).
    _randomize: function () {
      var self = this;
      CHARACTERS.PARTS.forEach(function (cat) { self._sel[cat.key] = cat.options[Math.floor(Math.random() * cat.options.length)].id; });
      var rc = function () { return '#' + ('000000' + Math.floor(Math.random() * 0xffffff).toString(16)).slice(-6); };
      this._pal = { skin: rc(), hair: rc(), shirt: rc(), pants: rc(), accent: rc() };
      this._body = Math.random() < 0.5 ? 'boy' : 'girl';   // Surprise Me now also flips Body (tester note)
      // reflect into the controls
      if (this._el) {
        this._el.querySelectorAll('select[data-cat]').forEach(function (s) { s.value = self._sel[s.dataset.cat]; });
        this._el.querySelectorAll('input[data-col]').forEach(function (i) { i.value = self._pal[i.dataset.col]; });
        var bodySel = this._el.querySelector('.cb-body'); if (bodySel) bodySel.value = this._body;
      }
      this._render();
    },

    _render: function () {
      var cv = this._canvas; if (!cv) return;
      var ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, cv.width, cv.height);
      if (typeof OVERHEAD === 'undefined' || !OVERHEAD.drawOverheadPlayer) {
        ctx.fillStyle = '#9fb0cc'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('preview unavailable', cv.width / 2, cv.height / 2); return;
      }
      var feat = CHARACTERS.composeFeat(this._sel);
      var pal = Object.assign({}, this._pal);
      try {
        // front-facing (aim toward the viewer), idle. Radius scales to the canvas so the sprite fills
        // the preview and parts are legible (tester: bump the small preview).
        var r = Math.min(cv.width, cv.height) * 0.42;
        OVERHEAD.drawOverheadPlayer(ctx, cv.width / 2, cv.height / 2 + 6, r, 0, false, Math.PI / 2,
          { rotate: true, weapon: null, palette: pal, sprite: this._body, character: feat, facing: Math.PI / 2 });
      } catch (e) { /* never let a preview throw break the modal */ }
    },

    _save: function () {
      var self = this;
      var def = this._defNow();
      // Bare SANDBOX (global lexical binding), NOT window.SANDBOX — a top-level `const` is not a window
      // property, so the old window.SANDBOX guard silently failed and Save no-op'd (tester build 439).
      var SB = (typeof SANDBOX !== 'undefined') ? SANDBOX : (typeof window !== 'undefined' ? window.SANDBOX : null);
      if (SB && typeof SB.saveCustomCharacter === 'function') {
        Promise.resolve(SB.saveCustomCharacter(this._worldId, def)).then(function (ok) {
          if (ok !== false) { self._close(); self._onSaved(def); }
        });
      } else { this._close(); this._onSaved(def); }
    },

    _close: function () { if (this._el) { this._el.remove(); this._el = null; } }
  };

  if (typeof window !== 'undefined') window.CHARACTER_BUILDER = CB;
})();
