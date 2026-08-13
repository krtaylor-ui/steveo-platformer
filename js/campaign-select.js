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
        #campaign-select-screen{--cc:#a06cff;padding:26px 22px 60px;max-width:1000px;margin:0 auto;color:#e9eef7}
        #campaign-select-screen h1{font-size:28px;margin:0 0 4px;text-shadow:0 0 10px color-mix(in srgb,var(--cc) 45%,transparent)}
        .cs-sub{color:#9fb0c8;margin-bottom:18px}
        .cs-bar{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px}
        .cs-sec{margin:22px 0 8px;color:#c7d2e6;font-size:13px;letter-spacing:.06em;text-transform:uppercase}
        .cs-btn{background:#161d2a;border:1px solid #2c3a54;color:#dfe7f5;border-radius:9px;padding:10px 16px;cursor:pointer;font-size:14px;transition:filter .12s,box-shadow .15s}
        .cs-btn:hover{filter:brightness(1.15)}
        .cs-btn.build{background:linear-gradient(180deg,color-mix(in srgb,#a06cff 26%,#0e1422),color-mix(in srgb,#a06cff 12%,#0e1422));border-color:color-mix(in srgb,#a06cff 60%,#2c3a54);box-shadow:0 0 12px -4px #a06cff}
        .cs-card{background:linear-gradient(180deg,#131a29,#0e1422);border:1px solid color-mix(in srgb,var(--cc) 40%,#2c3a54);border-radius:13px;padding:15px 18px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;box-shadow:inset 3px 0 0 -1px var(--cc);transition:box-shadow .15s}
        .cs-card:hover{box-shadow:inset 3px 0 0 -1px var(--cc),0 0 18px -5px color-mix(in srgb,var(--cc) 70%,transparent)}
        .cs-card h3{margin:0 0 4px;font-size:18px;color:#eaf2ff}
        .cs-meta{color:#9fb0c8;font-size:13px}
        .cs-badge{font-size:10px;font-weight:700;letter-spacing:.05em;background:color-mix(in srgb,var(--cc) 28%,#0e1422);color:#e6dcff;border:1px solid color-mix(in srgb,var(--cc) 55%,transparent);border-radius:10px;padding:2px 9px;margin-left:8px}
        .cs-play{font:700 13px/1 inherit;letter-spacing:.04em;color:#eaf6ff;cursor:pointer;padding:10px 18px;border-radius:9px;background:linear-gradient(180deg,color-mix(in srgb,var(--cc) 28%,#0b111d),color-mix(in srgb,var(--cc) 14%,#0b111d));border:1px solid color-mix(in srgb,var(--cc) 75%,transparent);box-shadow:0 0 12px -4px var(--cc);text-shadow:0 0 8px color-mix(in srgb,var(--cc) 55%,transparent)}
        .cs-play:hover{filter:brightness(1.15)}
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
        const [r, b] = await Promise.all([CAMPAIGN_API.list(), CAMPAIGN_API.browse().catch(() => ({ campaigns: [] }))]);
        this._render(r, b);
      } catch (e) {
        el.innerHTML = `<h1>🎬 Campaign</h1><div class="cs-sub">Could not load campaigns: ${esc(e.message)}</div>
          <div class="cs-bar"><button class="cs-btn" id="cs-back">← Back</button></div>`;
        this._wireBack();
      }
    },

    _render(r, b) {
      const el = this._screen();
      const published = (b && b.campaigns) || [];   // §29 — ALL published campaigns
      const mine = r.mine || [];
      const drafts = mine.filter((c) => !c.published);
      const pubSection = published.length
        ? published.map((c) => this._card(c, true, c.mine)).join('')
        : `<div class="cs-empty">No campaigns published yet.${r.canPublish ? ' Build one and press Publish.' : ''}</div>`;
      const draftSection = drafts.length
        ? `<div class="cs-sec">Your campaigns (playtest before publishing)</div>` + drafts.map((c) => this._card(c, false, true)).join('')
        : '';
      el.innerHTML = `
        <h1>🎬 Campaign</h1>
        <div class="cs-sub">Play a sequenced set of Platformer levels with branching, secret, and bonus exits.</div>
        <div class="cs-bar">
          <button class="cs-btn" id="cs-back">← Back</button>
          <button class="cs-btn build" id="cs-build">🛠 Campaign Builder</button>
        </div>
        <div class="cs-sec">Published campaigns</div>
        ${pubSection}
        ${draftSection}`;
      this._wireBack();
      const build = document.getElementById('cs-build');
      if (build) build.onclick = () => { if (typeof CAMPAIGN_BUILDER !== 'undefined') CAMPAIGN_BUILDER.open(); };
      el.querySelectorAll('[data-play]').forEach((b2) => b2.onclick = () => this._play(b2.dataset.play));
    },

    _card(c, published, mine) {
      const badge = published ? `<span class="cs-badge">${mine ? 'YOURS · LIVE' : 'LIVE'}</span>` : '<span class="cs-badge">DRAFT</span>';
      return `<div class="cs-card">
          <div><h3>${esc(c.name)}${badge}</h3>
          <div class="cs-meta">by ${esc(c.creatorName || 'you')}</div></div>
          <button class="cs-play" data-play="${c.id}">▶ Play</button>
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
