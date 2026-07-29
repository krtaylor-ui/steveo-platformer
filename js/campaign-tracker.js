// ══════════════════════════════════════════════════════════════════════════
// Campaign progression tracker (MVP) — the player-facing, DISPLAY-ONLY view of
// a Zone's Worlds as dots/nodes connected in sequence (§9). No interaction, no
// click-to-replay. Shown two ways:
//   • as a brief transition screen when a World is completed (Continue button),
//   • on-demand from the pause menu ("Campaign Progress", Close button).
// Bonus/secret Worlds and the paths to them stay HIDDEN until discovered
// (progress.discoveredSecrets). An optional creator background image is drawn
// behind the auto-generated dot layout when present.
// ══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';
  const M = () => window.CAMPAIGN_MODEL;

  const CAMPAIGN_TRACKER = {
    _injectStyle() {
      if (document.getElementById('ct-style')) return;
      const s = document.createElement('style');
      s.id = 'ct-style';
      s.textContent = `
        #campaign-tracker-overlay{position:fixed;inset:0;z-index:6100;display:none;align-items:center;justify-content:center;background:rgba(4,8,16,.82)}
        .ct-panel{background:#121824;border:1px solid #2c3a54;border-radius:14px;padding:22px 26px;max-width:900px;width:94%;max-height:92vh;overflow:auto;box-shadow:0 12px 44px rgba(0,0,0,.55)}
        .ct-panel h2{margin:0 0 2px;color:#eef4ff;font-size:22px}
        .ct-sub{color:#8ea3c4;font-size:13px;margin-bottom:16px}
        .ct-map{position:relative;background:#0d1420;border:1px solid #253247;border-radius:10px;padding:26px 18px;background-size:cover;background-position:center}
        .ct-line{display:flex;align-items:flex-start;gap:0;flex-wrap:wrap}
        .ct-node{display:flex;flex-direction:column;align-items:center;min-width:96px;flex:none}
        .ct-conn{flex:1;height:3px;background:#33455f;min-width:26px;margin-top:20px;border-radius:2px}
        .ct-conn.done{background:#3f9a6c}
        .ct-dot{width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;border:3px solid #445269;background:#1b2536;color:#c9d6ec}
        .ct-dot.done{background:#2e6f4e;border-color:#43c088;color:#eaffef}
        .ct-dot.current{background:#5a4a1e;border-color:#ffcf4a;color:#fff;box-shadow:0 0 0 4px rgba(255,207,74,.22)}
        .ct-dot.boss{border-color:#e06767}
        .ct-name{margin-top:7px;font-size:12px;color:#cdd8ec;text-align:center;max-width:96px;line-height:1.25}
        .ct-tag{font-size:10px;color:#f0c78a}
        .ct-secret{margin-top:16px}
        .ct-secret .ct-dot{border-style:dashed;background:#2a2036;border-color:#8a6bc0}
        .ct-foot{display:flex;justify-content:space-between;align-items:center;margin-top:18px;gap:12px;flex-wrap:wrap}
        .ct-stats{color:#9fb0cc;font-size:13px}
        .ct-btn{background:#2e6f4e;border:1px solid #3f9a6c;color:#eafff0;border-radius:8px;padding:9px 20px;cursor:pointer;font-size:15px}
        .ct-btn:hover{background:#37855d}
        .ct-btn.sec{background:#2b3548;border-color:#46557a;color:#dfe7f5}
      `;
      document.head.appendChild(s);
    },

    _ov() {
      let ov = document.getElementById('campaign-tracker-overlay');
      if (!ov) { ov = document.createElement('div'); ov.id = 'campaign-tracker-overlay'; document.body.appendChild(ov); }
      return ov;
    },

    // Build the dot/line map for a single Zone.
    _mapHtml(c, prog, zoneId) {
      const z = M().getZone(c, zoneId);
      if (!z) return '<div class="ct-sub">No zone.</div>';
      const completed = prog.completedWorlds || {};
      const discovered = new Set(prog.discoveredSecrets || []);
      const cur = prog.currentWorldId;
      const WL = c.worldLabel || 'World';

      const inSeq = z.worldOrder.map((id) => M().getWorld(c, id)).filter(Boolean);
      let nodes = '';
      inSeq.forEach((w, i) => {
        const isBoss = M().isBossWorld(c, w.id);
        const state = completed[w.id] ? 'done' : (w.id === cur ? 'current' : '');
        const connDone = i > 0 && completed[inSeq[i - 1].id];
        if (i > 0) nodes += `<div class="ct-conn ${connDone ? 'done' : ''}"></div>`;
        nodes += `<div class="ct-node">
            <div class="ct-dot ${state} ${isBoss ? 'boss' : ''}">${completed[w.id] ? '✓' : (i + 1)}</div>
            <div class="ct-name">${this._esc(w.name)}${isBoss ? '<div class="ct-tag">BOSS</div>' : ''}</div>
          </div>`;
      });

      // Discovered bonus/secret worlds in this zone (hidden until found).
      const bonus = M().bonusWorldsInZone(c, zoneId).filter((w) => discovered.has(w.id) || completed[w.id]);
      let secret = '';
      if (bonus.length) {
        secret = '<div class="ct-line ct-secret">' + bonus.map((w) => {
          const state = completed[w.id] ? 'done' : (w.id === cur ? 'current' : '');
          return `<div class="ct-node"><div class="ct-dot ${state}">★</div>
            <div class="ct-name">${this._esc(w.name)}<div class="ct-tag">SECRET</div></div></div>`;
        }).join('<div class="ct-conn"></div>') + '</div>';
      }

      const bg = z.trackerImage ? ` style="background-image:url('${this._esc(z.trackerImage)}')"` : '';
      return `<div class="ct-map"${bg}><div class="ct-line">${nodes}</div>${secret}</div>`;
    },

    // mode: 'transition' (Continue) | 'pause' (Close). onDone fires on the button.
    open(c, prog, zoneId, opts) {
      opts = opts || {};
      this._injectStyle();
      const ov = this._ov();
      const z = M().getZone(c, zoneId);
      const ZL = c.zoneLabel || 'Zone';
      const total = Object.values(prog.completedWorlds || {}).reduce((a, x) => a + (x.bestScore || 0), 0);
      const stats = `Score ★ ${total} &nbsp;·&nbsp; 💎 ${prog.runningEmeralds || 0} &nbsp;·&nbsp; ❤ Lives ${prog.lives != null ? prog.lives : '—'}`;
      const btn = opts.mode === 'transition'
        ? `<button class="ct-btn" id="ct-continue">Continue →</button>`
        : `<button class="ct-btn sec" id="ct-close">Close</button>`;
      ov.innerHTML = `
        <div class="ct-panel">
          <h2>${this._esc(c.name)}</h2>
          <div class="ct-sub">${this._esc(ZL)}: ${this._esc(z ? z.name : '')}</div>
          ${this._mapHtml(c, prog, zoneId)}
          <div class="ct-foot"><span class="ct-stats">${stats}</span>${btn}</div>
        </div>`;
      ov.style.display = 'flex';
      const done = () => { ov.style.display = 'none'; if (opts.onDone) opts.onDone(); };
      const cont = document.getElementById('ct-continue');
      const close = document.getElementById('ct-close');
      if (cont) cont.onclick = done;
      if (close) close.onclick = done;
    },

    close() { const ov = document.getElementById('campaign-tracker-overlay'); if (ov) ov.style.display = 'none'; },

    _esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); },
  };

  if (typeof window !== 'undefined') window.CAMPAIGN_TRACKER = CAMPAIGN_TRACKER;
})();
