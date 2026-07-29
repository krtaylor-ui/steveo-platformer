// ══════════════════════════════════════════════════════════════════════════
// Campaign select / continue screen (MVP, §10). The dashboard "Campaign" button
// lands here. Shows the one live (published) Campaign to Play/Continue, plus the
// player's OWN campaigns (drafts) to playtest, and a button to open the Campaign
// Builder. Architected for multiple campaigns even though only one may be
// published at a time — reuses the same list-card look as the other mode screens.
// ══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  const CAMPAIGN_SELECT = {
    _injectStyle() {
      if (document.getElementById('cs-style')) return;
      const s = document.createElement('style');
      s.id = 'cs-style';
      s.textContent = `
        #campaign-select-screen{padding:24px;max-width:900px;margin:0 auto;color:#e8eef7}
        #campaign-select-screen h1{font-size:26px;margin:0 0 4px}
        .cs-sub{color:#8ea3c4;margin-bottom:18px}
        .cs-bar{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px}
        .cs-btn{background:#2b3548;border:1px solid #46557a;color:#dfe7f5;border-radius:8px;padding:9px 16px;cursor:pointer;font-size:14px}
        .cs-btn:hover{background:#38455f}
        .cs-btn.primary{background:#2e6f4e;border-color:#3f9a6c}
        .cs-btn.build{background:#5a3f8f;border-color:#7d5cc0}
        .cs-card{background:#141c2a;border:1px solid #2c3a54;border-radius:12px;padding:16px 18px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap}
        .cs-card h3{margin:0 0 4px;font-size:18px}
        .cs-meta{color:#8ea3c4;font-size:13px}
        .cs-badge{font-size:11px;background:#2f6b4a;color:#dbffe8;border-radius:10px;padding:2px 9px;margin-left:8px}
        .cs-empty{color:#8494ac;font-style:italic;padding:16px 2px}
      `;
      document.head.appendChild(s);
    },

    _screen() {
      let el = document.getElementById('campaign-select-screen');
      if (!el) { el = document.createElement('div'); el.id = 'campaign-select-screen'; el.style.display = 'none'; document.body.appendChild(el); }
      return el;
    },

    async init() {
      if (typeof AUTH === 'undefined' || !AUTH.isLoggedIn || !AUTH.isLoggedIn()) {
        alert('Please log in to play Campaign mode.'); return;
      }
      this._injectStyle();
      const dash = document.getElementById('dashboard-screen'); if (dash) dash.style.display = 'none';
      const el = this._screen();
      el.style.display = 'block';
      el.innerHTML = `<h1>🎬 Campaign</h1><div class="cs-sub">Loading…</div>`;
      try {
        const r = await CAMPAIGN_API.list();
        this._render(r);
      } catch (e) {
        el.innerHTML = `<h1>🎬 Campaign</h1><div class="cs-sub">Could not load campaigns: ${esc(e.message)}</div>
          <div class="cs-bar"><button class="cs-btn" id="cs-back">← Back</button></div>`;
        this._wireBack();
      }
    },

    _render(r) {
      const el = this._screen();
      const pub = r.published;
      const mine = r.mine || [];
      const pubCard = pub
        ? this._card(pub, true)
        : `<div class="cs-empty">No Campaign is published yet.${r.canPublish ? ' Build one and press Publish.' : ''}</div>`;
      const drafts = mine.filter((c) => !c.published);
      const draftCards = drafts.length
        ? `<h3 style="margin:22px 0 8px;color:#c7d2e6">Your campaigns (playtest)</h3>` + drafts.map((c) => this._card(c, false)).join('')
        : '';
      el.innerHTML = `
        <h1>🎬 Campaign</h1>
        <div class="cs-sub">Play a sequenced set of Platformer levels with branching, secret, and bonus exits.</div>
        <div class="cs-bar">
          <button class="cs-btn" id="cs-back">← Back</button>
          <button class="cs-btn build" id="cs-build">🛠 Campaign Builder</button>
        </div>
        <h3 style="margin:6px 0 8px;color:#c7d2e6">Now playing</h3>
        ${pubCard}
        ${draftCards}`;
      this._wireBack();
      const build = document.getElementById('cs-build');
      if (build) build.onclick = () => { if (typeof CAMPAIGN_BUILDER !== 'undefined') CAMPAIGN_BUILDER.open(); };
      el.querySelectorAll('[data-play]').forEach((b) => b.onclick = () => this._play(b.dataset.play));
    },

    _card(c, published) {
      return `<div class="cs-card">
          <div><h3>${esc(c.name)}${published ? '<span class="cs-badge">LIVE</span>' : ''}</h3>
          <div class="cs-meta">by ${esc(c.creatorName || 'you')}</div></div>
          <button class="cs-btn primary" data-play="${c.id}">▶ Play</button>
        </div>`;
    },

    async _play(id) {
      try {
        const [cr, pr] = await Promise.all([CAMPAIGN_API.get(id), CAMPAIGN_API.getProgress(id)]);
        const campaign = cr.campaign;
        if (!campaign || !campaign.startingWorldId) { alert('This campaign has no starting World yet.'); return; }
        await CAMPAIGN_PLAY.start(campaign, (pr && pr.progress) || null);
      } catch (e) { alert('Could not start campaign: ' + e.message); }
    },

    _wireBack() {
      const back = document.getElementById('cs-back');
      if (back) back.onclick = () => {
        const el = document.getElementById('campaign-select-screen'); if (el) el.style.display = 'none';
        const dash = document.getElementById('dashboard-screen'); if (dash) dash.style.display = 'block';
      };
    },
  };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); }

  if (typeof window !== 'undefined') window.CAMPAIGN_SELECT = CAMPAIGN_SELECT;
})();
