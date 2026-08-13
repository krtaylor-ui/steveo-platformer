// ══════════════════════════════════════════════════════════════════════════
// Campaign Builder (MVP) — the Sandbox-accessible tool that sequences existing
// Platformer worlds into a Campaign, routes their coloured Goal-Star exits, and
// (admin only) publishes. DOM overlay mirroring CONTROLS_UI / WORLD_SETTINGS_UI:
// reuses the .ws-panel/.ws-head/.ws-body chrome and adds .cb-* classes.
//
// Design (per the brief §8):
//   • Zone TABS across the top (not a unified graph view — deferred).
//   • Per-Zone World list, each World showing its Goal-Star exits with a [+].
//   • [+] on Goal Star 1  → guided "add the next World in sequence" (or, on the
//                           Boss World, "transition to the next Zone / complete").
//   • [+] on Goal Star 2–10 → "Add a bonus level" or "Connect to level"
//                           (campaign-wide destination + entry point).
//   • SAVE never blocked; PUBLISH runs the validation gate (§6).
// ══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';
  const M = () => window.CAMPAIGN_MODEL;

  const CAMPAIGN_BUILDER = {
    _c: null,            // the campaign being edited (CAMPAIGN_MODEL object)
    _activeZone: null,   // zoneId of the current tab
    _worldChoices: null, // cached list of my Platformer worlds
    _flow: null,         // active guided sub-dialog descriptor
    _msg: null,          // transient status message {text,kind}
    _canPublish: false,
    _dirty: false,

    isOpen() { const ov = document.getElementById('campaign-builder-overlay'); return !!ov && ov.style.display === 'flex'; },

    _injectStyle() {
      if (document.getElementById('cb-style')) return;
      const s = document.createElement('style');
      s.id = 'cb-style';
      s.textContent = `
        #campaign-builder-overlay{position:fixed;inset:0;z-index:6000;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.62)}
        #campaign-builder-overlay .ws-panel{max-width:860px;width:94%;max-height:92vh}
        .cb-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px}
        .cb-bar input[type=text]{background:#1c2230;border:1px solid #3a465c;color:#e8eef7;border-radius:6px;padding:6px 8px;font-size:14px}
        .cb-bar select{background:#1c2230;border:1px solid #3a465c;color:#e8eef7;border-radius:6px;padding:5px 6px}
        .cb-btn{background:#2b3548;border:1px solid #46557a;color:#dfe7f5;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:13px}
        .cb-btn:hover{background:#38455f}
        .cb-btn.primary{background:#2e6f4e;border-color:#3f9a6c}
        .cb-btn.primary:hover{background:#37855d}
        .cb-btn.warn{background:#7a3b2b;border-color:#a85a44}
        .cb-btn.pub{background:#5a3f8f;border-color:#7d5cc0}
        .cb-btn:disabled{opacity:.45;cursor:not-allowed}
        .cb-tabs{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 12px;border-bottom:1px solid #2c3648;padding-bottom:8px}
        .cb-tab{background:#232c3d;border:1px solid #37425a;color:#c7d2e6;border-radius:6px 6px 0 0;padding:6px 12px;cursor:pointer;font-size:13px}
        .cb-tab.active{background:#39507a;color:#fff;border-color:#5573ad}
        .cb-world{background:#1a2130;border:1px solid #303c52;border-radius:8px;padding:10px 12px;margin-bottom:10px}
        .cb-world h4{margin:0 0 6px;font-size:15px;color:#eaf1fb;display:flex;align-items:center;gap:8px}
        .cb-badge{font-size:11px;background:#4a3a6e;color:#e7dcff;border-radius:10px;padding:2px 8px}
        .cb-badge.boss{background:#7a2f2f;color:#ffe0e0}
        .cb-badge.start{background:#2f6b4a;color:#dbffe8}
        .cb-stars{display:flex;flex-direction:column;gap:5px;margin-top:6px}
        .cb-star{display:flex;align-items:center;gap:8px;font-size:13px;color:#cdd8ec}
        .cb-dot{width:15px;height:15px;border-radius:50%;border:1px solid rgba(255,255,255,.35);flex:none}
        .cb-route{color:#9fb0cc;font-size:12px}
        .cb-route.unrouted{color:#e6a94a}
        .cb-plus{background:#33507a;border:1px solid #4d70ad;color:#eaf2ff;border-radius:5px;width:24px;height:22px;line-height:1;cursor:pointer;font-size:14px}
        .cb-plus:hover{background:#3d6195}
        .cb-hint{font-size:12px;color:#8fa0bd;background:#161c28;border-left:3px solid #3a5a8c;padding:8px 10px;border-radius:0 6px 6px 0;margin:8px 0}
        .cb-flow{background:#141a26;border:1px solid #3a4a6b;border-radius:10px;padding:16px;margin-top:8px}
        .cb-flow h3{margin:0 0 10px;color:#eaf1fb;font-size:16px}
        .cb-choice{display:block;width:100%;text-align:left;background:#1e2636;border:1px solid #34405a;color:#dbe4f3;border-radius:6px;padding:9px 11px;margin-bottom:6px;cursor:pointer}
        .cb-choice:hover{background:#28344a}
        .cb-msg{padding:8px 10px;border-radius:6px;margin:8px 0;font-size:13px}
        .cb-msg.ok{background:#1f3d2c;color:#a8e6c2;border:1px solid #2e6f4e}
        .cb-msg.err{background:#3d2020;color:#f0b6b6;border:1px solid #7a3b2b}
        .cb-errs{background:#241722;border:1px solid #6b3a52;border-radius:8px;padding:10px 12px;margin-top:8px}
        .cb-errs li{color:#f0c2d2;font-size:12px;margin:3px 0}
        .cb-empty{color:#8494ac;font-style:italic;padding:14px 4px}
      `;
      document.head.appendChild(s);
    },

    async open() {
      if (typeof AUTH === 'undefined' || !AUTH.isLoggedIn || !AUTH.isLoggedIn()) {
        alert('Please log in to build a Campaign.'); return;
      }
      this._injectStyle();
      let ov = document.getElementById('campaign-builder-overlay');
      if (!ov) { ov = document.createElement('div'); ov.id = 'campaign-builder-overlay'; document.body.appendChild(ov); }
      ov.style.display = 'flex';
      if (window.game) window.game._htmlSettingsOpen = true;
      if (!this._keyHandler) {
        this._keyHandler = (e) => {
          if (e.key === 'Escape' && this.isOpen()) {
            e.stopPropagation();
            if (this._flow) { this._flow = null; this._render(); }
            else this.close();
          }
        };
        window.addEventListener('keydown', this._keyHandler, true);
      }
      this._c = null; this._flow = null; this._msg = null;
      this._render();
      await this._loadList();
    },

    close() {
      const ov = document.getElementById('campaign-builder-overlay');
      if (ov) ov.style.display = 'none';
      if (window.game) window.game._htmlSettingsOpen = false;
      this._c = null; this._flow = null;
    },

    _flash(text, kind) { this._msg = { text, kind: kind || 'ok' }; this._render(); },

    // ── Data loading ────────────────────────────────────────────────────────
    async _loadList() {
      try {
        const r = await CAMPAIGN_API.list();
        this._list = r.mine || [];
        this._published = r.published || null;
        this._canPublish = !!r.canPublish;
      } catch (e) { this._list = []; this._published = null; this._flash('Could not load campaigns: ' + e.message, 'err'); }
      this._render();
    },

    async _ensureWorldChoices() {
      if (this._worldChoices) return this._worldChoices;
      try { this._worldChoices = await CAMPAIGN_API.myPlatformerWorlds(); }
      catch (e) { this._worldChoices = []; this._flash('Could not load your Platformer worlds: ' + e.message, 'err'); }
      return this._worldChoices;
    },

    // Fetch a world's data → derive the CampaignWorld fields (name, entry points, stars).
    async _ingestWorld(worldId, worldName) {
      const w = await CAMPAIGN_API.myWorld(worldId);
      const wd = (w && w.world_data) || {};
      const sps = Array.isArray(wd.playerSpawns) ? wd.playerSpawns : [];
      const entryPoints = sps.length
        ? sps.map((s, i) => ({ spawnPointId: String(s.slot != null ? s.slot : (i + 1)),
                               label: 'Spawn ' + (s.slot != null ? s.slot : (i + 1)), isDefault: i === 0 }))
        : [{ spawnPointId: 'default', label: 'Start', isDefault: true }];
      const stars = M().starIndexesFromWorldData(wd);
      return { name: (w && w.world_name) || worldName || 'World', entryPoints, stars };
    },

    // ── Campaign lifecycle ────────────────────────────────────────────────────
    async _newCampaign() {
      const name = await DIALOG.prompt('Name your Campaign:', { title: 'New Campaign', value: 'My Campaign' });
      if (name == null) return;
      try {
        const def = M().newCampaign(name || 'My Campaign', (AUTH.user && AUTH.user.id) || null);
        const r = await CAMPAIGN_API.create(name || 'My Campaign', def);
        this._c = r.campaign; this._activeZone = null; this._msg = null;
        this._render();
      } catch (e) { this._flash('Create failed: ' + e.message, 'err'); }
    },

    async _editCampaign(id) {
      try {
        const r = await CAMPAIGN_API.get(id);
        this._c = r.campaign;
        // Normalize any missing arrays so old/partial rows are safe to edit.
        this._c.zones = this._c.zones || []; this._c.worlds = this._c.worlds || [];
        this._c.zoneOrder = this._c.zoneOrder || [];
        this._activeZone = this._c.zoneOrder[0] || (this._c.zones[0] && this._c.zones[0].id) || null;
        this._msg = null; this._render();
        // Refresh Goal Stars from current world data so the ⚠ "no Goal Star" card + validation reflect
        // edits made in the Sandbox after the world was added (they read the cached stars otherwise).
        const failed = await this._resyncStars();
        if (failed) this._flash(`Could not refresh ${failed} ${this._c.worldLabel || 'World'}(s).`, 'err');
        this._render();
      } catch (e) { this._flash('Load failed: ' + e.message, 'err'); }
    },

    async _save(silent) {
      if (!this._c) return;
      try {
        const r = await CAMPAIGN_API.save(this._c.id, this._c.name, this._c);
        this._c = r.campaign; this._dirty = false;
        if (!silent) this._flash('Saved.', 'ok'); else this._render();
      } catch (e) { this._flash('Save failed: ' + e.message, 'err'); }
    },

    async _delete(id, name) {
      if (!(await DIALOG.confirm('Delete campaign "' + name + '"? This cannot be undone.', { title: 'Delete campaign', okText: 'Delete', danger: true }))) return;
      try { await CAMPAIGN_API.remove(id); await this._loadList(); }
      catch (e) { this._flash('Delete failed: ' + e.message, 'err'); }
    },

    _validate() {
      const map = {};
      for (const w of (this._c.worlds || [])) map[w.id] = w.stars || [];
      return M().validateForPublish(this._c, map);
    },

    // Re-derive each world's Goal Stars from its CURRENT saved data. Stars are cached at add-time, so a
    // world edited later in the Sandbox (star added/moved/removed) would otherwise keep a stale snapshot.
    // NB: _ingestWorld needs the SANDBOX world id (sandboxWorldUid), NOT the campaign-local id (w.id) —
    // passing w.id threw "World not found" for every world and the stale snapshot silently survived.
    async _resyncStars() {
      let failed = 0;
      for (const w of (this._c.worlds || [])) {
        if (!w.sandboxWorldUid) continue;
        try {
          const fresh = await this._ingestWorld(w.sandboxWorldUid, w.name);
          w.stars = fresh.stars;
          if (fresh.name) w.name = fresh.name;
        } catch (e) { failed++; }   // surfaced by the caller, not swallowed
      }
      return failed;
    },

    async _publish() {
      if (!this._c) return;
      const failed = await this._resyncStars();
      if (failed) { this._flash(`Could not refresh ${failed} ${this._c.worldLabel || 'World'}(s) — check they still exist, then try again.`, 'err'); this._render(); return; }
      const v = this._validate();
      if (!v.ok) { this._flash('Fix the issues below before publishing.', 'err'); this._render(); return; }
      await this._save(true);
      try {
        const r = await CAMPAIGN_API.publish(this._c.id);
        this._c = r.campaign; this._flash('Published! It\'s now live for everyone in the Campaign list.', 'ok');
      } catch (e) { this._flash('Publish failed: ' + e.message, 'err'); }
    },
    async _unpublish() {
      try { const r = await CAMPAIGN_API.unpublish(this._c.id); this._c = r.campaign; this._flash('Unpublished.', 'ok'); }
      catch (e) { this._flash('Unpublish failed: ' + e.message, 'err'); }
    },

    // ── Zone + World mutation ─────────────────────────────────────────────────
    async _addZone() {
      const name = await DIALOG.prompt('Name the new ' + (this._c.zoneLabel || 'Zone') + ':', { title: 'New ' + (this._c.zoneLabel || 'Zone'), value: 'New ' + (this._c.zoneLabel || 'Zone') });
      if (name == null) return;
      const id = M().nextId('z', this._c.zones);
      const z = M().newZone(id, name || 'New Zone');
      this._c.zones.push(z); this._c.zoneOrder.push(id); this._activeZone = id;
      this._save(true);
    },

    // Guided [+] on Goal Star 1 → pick a world to become the next-in-sequence World.
    async _flowAddNext(zoneId, fromWorldId) {
      await this._ensureWorldChoices();
      this._flow = { kind: 'add-next', zoneId, fromWorldId }; this._render();
    },
    // Boss Goal Star 1 → next-zone transition (a genuinely distinct flow, §4/§14.2).
    _flowBossTransition(zoneId) {
      this._flow = { kind: 'boss', zoneId }; this._render();
    },
    // [+] on stars 2–10 → bonus (new world) or connect (existing world).
    async _flowBranch(worldId, starIndex) {
      await this._ensureWorldChoices();
      this._flow = { kind: 'branch', worldId, starIndex, step: 'choose' }; this._render();
    },

    async _commitAddWorld(zoneId, choice, opts) {
      opts = opts || {};
      const ing = await this._ingestWorld(choice.id, choice.name);
      const id = M().nextId('w', this._c.worlds);
      const cw = M().newCampaignWorld(id, zoneId, choice.id, ing.name);
      cw.entryPoints = ing.entryPoints; cw.stars = ing.stars;
      M().addWorldToZone(this._c, zoneId, cw);
      if (opts.asStart || !this._c.startingWorldId) this._c.startingWorldId = id;
      this._flow = null;
      await this._save(true);
      return cw;
    },

    _removeRoute(worldId, starIndex) {
      const w = M().getWorld(this._c, worldId);
      if (!w) return;
      w.goalStarRouting = (w.goalStarRouting || []).filter((r) => r.starIndex !== starIndex);
      this._save(true);
    },

    async _removeWorld(worldId) {
      const w = M().getWorld(this._c, worldId);
      if (!w) return;
      const WL = this._c.worldLabel || 'World';
      const yes = await DIALOG.confirm(
        `Remove "${w.name}" from this campaign? Routes pointing to it are cleared. The saved ${WL} itself is not deleted.`,
        { title: 'Remove ' + WL, okText: 'Remove', danger: true });
      if (!yes) return;
      M().removeWorld(this._c, worldId);
      await this._save(true);
      this._render();
    },

    // ── Rendering ─────────────────────────────────────────────────────────────
    _render() {
      const ov = document.getElementById('campaign-builder-overlay');
      if (!ov) return;
      const msg = this._msg ? `<div class="cb-msg ${this._msg.kind}">${this._esc(this._msg.text)}</div>` : '';
      let body;
      if (this._flow) body = this._renderFlow();
      else if (this._c) body = this._renderEditor();
      else body = this._renderList();
      ov.innerHTML = `
        <div class="ws-panel" role="dialog" aria-label="Campaign Builder">
          <div class="ws-head">
            <h2>🎬 Campaign Builder</h2>
            <button class="ws-close" id="cb-close" aria-label="Close">✕</button>
          </div>
          <div class="ws-body">${msg}${body}</div>
        </div>`;
      document.getElementById('cb-close').onclick = () => this.close();
      this._wire();
      this._msg = null; // one-shot
    },

    _renderList() {
      const pub = this._published;
      const rows = (this._list || []).map((c) => `
        <div class="cb-world">
          <h4>${this._esc(c.name)} ${c.published ? '<span class="cb-badge start">PUBLISHED</span>' : ''}</h4>
          <div class="cb-bar">
            <button class="cb-btn" data-edit="${c.id}">✎ Edit</button>
            <button class="cb-btn warn" data-del="${c.id}" data-name="${this._esc(c.name)}">🗑 Delete</button>
          </div>
        </div>`).join('');
      const pubNote = pub && !(this._list || []).some((c) => c.id === pub.id)
        ? `<div class="cb-hint">The current live Campaign is <b>${this._esc(pub.name)}</b> by ${this._esc(pub.creatorName || 'another creator')}.</div>` : '';
      return `
        <div class="cb-bar"><button class="cb-btn primary" id="cb-new">＋ New Campaign</button></div>
        <div class="cb-hint">Build a Campaign by sequencing your Platformer worlds. A world's coloured Goal Stars are its exits — Goal Star 1 (Gold) always leads to the next level; the other colours can be bonus or connecting routes.</div>
        ${pubNote}
        ${rows || '<div class="cb-empty">No campaigns yet. Create one to begin.</div>'}`;
    },

    _renderEditor() {
      const c = this._c;
      const ZL = c.zoneLabel || 'Zone', WL = c.worldLabel || 'World';
      // No zones yet → first-zone + starting-world flow prompt.
      if (!c.zones.length) {
        return `
          ${this._editorBar()}
          <div class="cb-flow">
            <h3>Create your first ${this._esc(ZL)}</h3>
            <div class="cb-hint">A ${this._esc(ZL)} is a themed group of ${this._esc(WL)}s ending in a Boss ${this._esc(WL)}. Name it, then pick the ${this._esc(WL)} the Campaign starts on.</div>
            <button class="cb-btn primary" id="cb-first-zone">＋ Add the first ${this._esc(ZL)}</button>
          </div>`;
      }
      const tabs = c.zoneOrder.map((zid) => {
        const z = M().getZone(c, zid); if (!z) return '';
        return `<button class="cb-tab ${zid === this._activeZone ? 'active' : ''}" data-zone="${zid}">${this._esc(z.name)}</button>`;
      }).join('') + `<button class="cb-tab" id="cb-add-zone">＋ ${this._esc(ZL)}</button>`;

      const z = M().getZone(c, this._activeZone) || M().getZone(c, c.zoneOrder[0]);
      const worlds = z ? M().worldsInZone(c, z.id) : [];
      const worldCards = worlds.map((w) => this._worldCard(w)).join('') ||
        `<div class="cb-empty">No ${this._esc(WL)}s in this ${this._esc(ZL)} yet.</div>`;

      // Out-of-sequence (bonus) worlds in this zone — reachable only via a route.
      const bonus = z ? M().bonusWorldsInZone(c, z.id) : [];
      const bonusSection = bonus.length
        ? `<div class="cb-hint">🎁 Bonus ${this._esc(WL)}s (out-of-sequence — reached via a coloured Goal-Star route). Route their exits too.</div>` +
          bonus.map((w) => this._worldCard(w)).join('')
        : '';

      // Zone-level "add first world" if this zone is empty.
      const zoneAdd = z && !worlds.length
        ? `<button class="cb-btn primary" id="cb-zone-firstworld" data-zone="${z.id}">＋ Add a ${this._esc(WL)} to ${this._esc(z.name)}</button>` : '';

      const v = this._validate();
      const errs = (!v.ok)
        ? `<div class="cb-errs"><b>To publish, fix:</b><ul>${v.errors.map((e) => `<li>${this._esc(e.message)}</li>`).join('')}</ul></div>` : '';

      return `
        ${this._editorBar()}
        <div class="cb-tabs">${tabs}</div>
        <div class="cb-hint">💡 Tip: place an early <b>secret exit</b> in a later ${this._esc(WL)} that loops back to an earlier completed one — since players can't otherwise revisit a completed ${this._esc(WL)}, this is how you let them hunt for something they missed.</div>
        <div class="cb-bar"><button class="cb-btn" id="cb-worldmap">🗺 Create World Map (overhead overworld — beta)</button></div>
        ${worldCards}
        ${bonusSection}
        ${zoneAdd}
        ${errs}`;
    },

    _editorBar() {
      const c = this._c;
      const pubBtn = this._canPublish
        ? (c.published
            ? `<button class="cb-btn warn" id="cb-unpublish">Unpublish</button>`
            : `<button class="cb-btn pub" id="cb-publish">🚀 Publish</button>`)
        : `<span class="cb-route">Only the admin account can publish.</span>`;
      const resetSel = ['never', 'per-world', 'per-zone'].map((o) =>
        `<option value="${o}" ${c.resetInventoryAt === o ? 'selected' : ''}>${o}</option>`).join('');
      return `
        <div class="cb-bar">
          <button class="cb-btn" id="cb-back">← Campaigns</button>
          <input type="text" id="cb-name" value="${this._esc(c.name)}" style="min-width:180px">
          <label class="cb-route">${this._esc(c.zoneLabel || 'Zone')} label <input type="text" id="cb-zl" value="${this._esc(c.zoneLabel || 'Zone')}" style="width:80px"></label>
          <label class="cb-route">${this._esc(c.worldLabel || 'World')} label <input type="text" id="cb-wl" value="${this._esc(c.worldLabel || 'World')}" style="width:80px"></label>
          <label class="cb-route">Carry-over <select id="cb-reset">${resetSel}</select></label>
          <label class="cb-route">Lives <input type="text" id="cb-lives" value="${c.startingLives != null ? c.startingLives : 3}" style="width:44px"></label>
          <button class="cb-btn primary" id="cb-save">💾 Save</button>
          ${pubBtn}
        </div>`;
    },

    _worldCard(w) {
      const c = this._c;
      const WL = c.worldLabel || 'World';
      const isBoss = M().isBossWorld(c, w.id);
      const isStart = c.startingWorldId === w.id;
      const stars = (w.stars || []).slice().sort((a, b) => a - b);
      const colors = (typeof GOAL_COLORS !== 'undefined') ? GOAL_COLORS : [];
      const starRows = stars.map((s) => {
        const col = colors[s - 1] || { name: '#' + s, hex: '#888' };
        const route = M().routeFor(w, s);
        let desc, unrouted = false, plus = false, rm = false;
        if (s === 1 && !w.outOfSequence) {
          if (isBoss) {
            const nz = M().nextZoneId(c, w.zoneId);
            desc = nz ? ('→ next ' + (c.zoneLabel || 'Zone')) : '→ completes the Campaign';
          } else {
            const nextId = (route && route.destinationWorldId) || M().nextWorldInZone(c, w.id);
            if (nextId) { const nx = M().getWorld(c, nextId); desc = '→ ' + (nx ? nx.name : '?') + ' (next in sequence)'; }
            else { desc = 'no next ' + WL + ' yet'; unrouted = true; plus = true; }
          }
        } else {
          if (route && route.destinationWorldId) {
            const nx = M().getWorld(c, route.destinationWorldId);
            desc = (route.hidden ? '🔒 secret ' : '') + (route.routeType === 'bonus' ? 'bonus → ' : 'connect → ') + (nx ? nx.name : '?');
            rm = true;
          } else { desc = 'unrouted'; unrouted = true; plus = true; }
        }
        return `<div class="cb-star">
            <span class="cb-dot" style="background:${col.hex}"></span>
            <span>Goal Star ${s} (${this._esc(col.name)})</span>
            <span class="cb-route ${unrouted ? 'unrouted' : ''}">${this._esc(desc)}</span>
            ${plus ? (s === 1 && isBoss ? `<button class="cb-plus" data-boss="${w.zoneId}">+</button>` :
                      s === 1 ? `<button class="cb-plus" data-next="${w.id}" data-zone="${w.zoneId}">+</button>` :
                      `<button class="cb-plus" data-branch="${w.id}" data-star="${s}">+</button>`) : ''}
            ${rm ? `<button class="cb-plus" style="background:#5a2f2f;border-color:#8a4a4a" data-rmroute="${w.id}" data-star="${s}">×</button>` : ''}
          </div>`;
      }).join('');
      const badges = `${isStart ? '<span class="cb-badge start">START</span>' : ''}${isBoss ? '<span class="cb-badge boss">BOSS</span>' : ''}`;
      const noStars = !stars.length ? '<div class="cb-route unrouted">⚠ This world has no Goal Star placed — add one in the Sandbox editor.</div>' : '';
      const rmWorld = `<button class="cb-plus" style="background:#5a2f2f;border-color:#8a4a4a;float:right" data-rmworld="${w.id}" title="Remove this ${WL} from the campaign">✕ Remove</button>`;
      return `<div class="cb-world"><h4>${this._esc(w.name)} ${badges}${rmWorld}</h4>${noStars}<div class="cb-stars">${starRows}</div></div>`;
    },

    _renderFlow() {
      const f = this._flow, c = this._c;
      const WL = c.worldLabel || 'World', ZL = c.zoneLabel || 'Zone';
      const back = `<button class="cb-btn" id="cb-flow-cancel">← Cancel</button>`;
      const choicesList = (this._worldChoices || []).map((w) =>
        `<button class="cb-choice" data-choice="${w.id}" data-choicename="${this._esc(w.name)}">🌍 ${this._esc(w.name)}</button>`).join('')
        || '<div class="cb-empty">You have no Platformer worlds yet. Create one in the Sandbox first.</div>';

      if (f.kind === 'add-next') {
        return `<div class="cb-flow"><h3>Add the next ${this._esc(WL)}</h3>
          <div class="cb-hint">Pick one of your Platformer worlds to become the next ${this._esc(WL)} in this ${this._esc(ZL)}'s sequence. Goal Star 1 of the previous ${this._esc(WL)} will lead here.</div>
          ${choicesList}${back}</div>`;
      }
      if (f.kind === 'first-zone' || f.kind === 'first-world') {
        return `<div class="cb-flow"><h3>Pick the starting ${this._esc(WL)}</h3>
          <div class="cb-hint">This ${this._esc(WL)} is where the Campaign begins.</div>
          ${choicesList}${back}</div>`;
      }
      if (f.kind === 'boss') {
        const nz = M().nextZoneId(c, f.zoneId);
        const target = nz ? ('the next ' + ZL + ' (' + this._esc(M().getZone(c, nz).name) + ')') : ('the Campaign end (no ' + ZL + ' follows this one)');
        return `<div class="cb-flow"><h3>Boss ${this._esc(WL)} exit</h3>
          <div class="cb-hint">This is the Boss ${this._esc(WL)} (last in the ${this._esc(ZL)}). Its Goal Star 1 transitions to ${target}. ${nz ? '' : 'Add another ' + ZL + ' if you want it to continue.'}</div>
          <button class="cb-btn primary" id="cb-boss-ok">OK — Goal Star 1 ${nz ? 'leads to the next ' + this._esc(ZL) : 'completes the Campaign'}</button>
          ${back}</div>`;
      }
      if (f.kind === 'branch') {
        if (f.step === 'choose') {
          return `<div class="cb-flow"><h3>Goal Star ${f.starIndex} — where does it lead?</h3>
            <div class="cb-hint">A <b>Bonus</b> level is a new out-of-sequence ${this._esc(WL)}. <b>Connect</b> links to any ${this._esc(WL)} already in the Campaign (any ${this._esc(ZL)}) — great for secret exits and loops back.</div>
            <button class="cb-choice" id="cb-branch-bonus">🎁 Add a bonus level (new ${this._esc(WL)})</button>
            <button class="cb-choice" id="cb-branch-connect">🔗 Connect to an existing ${this._esc(WL)}</button>
            <label class="cb-star" style="margin-top:8px"><input type="checkbox" id="cb-branch-hidden" checked> Hidden / secret route (revealed to players only once discovered)</label>
            ${back}</div>`;
        }
        if (f.step === 'bonus') {
          return `<div class="cb-flow"><h3>Bonus level — pick a world</h3>${choicesList}${back}</div>`;
        }
        if (f.step === 'connect') {
          const opts = (c.worlds || []).map((w) =>
            `<button class="cb-choice" data-cw="${w.id}">🔗 ${this._esc(w.name)} <span class="cb-route">(${this._esc((M().getZone(c, w.zoneId) || {}).name || '')})</span></button>`).join('')
            || '<div class="cb-empty">No worlds to connect to yet.</div>';
          return `<div class="cb-flow"><h3>Connect to which ${this._esc(WL)}?</h3>${opts}${back}</div>`;
        }
        if (f.step === 'entry') {
          const dest = M().getWorld(c, f.destId);
          const eps = (dest.entryPoints || []).map((e) =>
            `<button class="cb-choice" data-ep="${e.spawnPointId}">🚪 ${this._esc(e.label)}${e.isDefault ? ' (default)' : ''}</button>`).join('');
          return `<div class="cb-flow"><h3>Enter "${this._esc(dest.name)}" at which spawn point?</h3>
            <div class="cb-hint">Multiple spawn points let a secret exit drop the player somewhere different (e.g. next to a weapons cache).</div>
            ${eps}${back}</div>`;
        }
      }
      return back;
    },

    // ── Event wiring (re-bound after every render) ────────────────────────────
    _wire() {
      const $ = (id) => document.getElementById(id);
      const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
      const c = this._c;

      // List screen
      on('cb-new', () => this._newCampaign());
      document.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => this._editCampaign(b.dataset.edit));
      document.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => this._delete(b.dataset.del, b.dataset.name));

      if (!c) return;

      // Editor bar
      on('cb-back', () => { this._c = null; this._loadList(); });
      on('cb-save', () => this._save());
      on('cb-publish', () => this._publish());
      on('cb-unpublish', () => this._unpublish());
      on('cb-add-zone', () => this._addZone());
      on('cb-first-zone', () => this._addZone());
      on('cb-worldmap', () => { const z = M().getZone(c, this._activeZone); if (typeof OH_CAMPAIGN_MAP !== 'undefined') { this.close(); OH_CAMPAIGN_MAP.open(z); } });
      const bindText = (id, apply) => { const el = $(id); if (el) el.onchange = () => { apply(el.value); this._save(true); }; };
      bindText('cb-name', (v) => c.name = v || 'Campaign');
      bindText('cb-zl', (v) => c.zoneLabel = v || 'Zone');
      bindText('cb-wl', (v) => c.worldLabel = v || 'World');
      bindText('cb-reset', (v) => c.resetInventoryAt = v);
      bindText('cb-lives', (v) => { const n = parseInt(v, 10); c.startingLives = Number.isFinite(n) ? Math.max(0, n) : 3; });

      // Zone tabs
      document.querySelectorAll('[data-zone]').forEach((b) => {
        if (b.classList.contains('cb-tab')) b.onclick = () => { this._activeZone = b.dataset.zone; this._render(); };
      });

      // World-card [+] buttons
      document.querySelectorAll('[data-next]').forEach((b) => b.onclick = () => this._flowAddNext(b.dataset.zone, b.dataset.next));
      document.querySelectorAll('[data-boss]').forEach((b) => b.onclick = () => this._flowBossTransition(b.dataset.boss));
      document.querySelectorAll('[data-branch]').forEach((b) => b.onclick = () => this._flowBranch(b.dataset.branch, parseInt(b.dataset.star, 10)));
      document.querySelectorAll('[data-rmroute]').forEach((b) => b.onclick = () => this._removeRoute(b.dataset.rmroute, parseInt(b.dataset.star, 10)));
      document.querySelectorAll('[data-rmworld]').forEach((b) => b.onclick = () => this._removeWorld(b.dataset.rmworld));

      // Zone "add first world" (also serves the very first zone's starting world)
      on('cb-zone-firstworld', async () => {
        await this._ensureWorldChoices();
        const zoneId = $('cb-zone-firstworld').dataset.zone;
        this._flow = { kind: 'first-world', zoneId, asStart: !c.startingWorldId };
        this._render();
      });

      // Flow wiring
      const f = this._flow;
      on('cb-flow-cancel', () => { this._flow = null; this._render(); });
      if (f) {
        if (f.kind === 'add-next' || f.kind === 'first-world' || f.kind === 'first-zone') {
          document.querySelectorAll('[data-choice]').forEach((b) => b.onclick = () =>
            this._commitAddWorld(f.zoneId, { id: b.dataset.choice, name: b.dataset.choicename }, { asStart: f.asStart }));
        }
        if (f.kind === 'boss') on('cb-boss-ok', () => { this._flow = null; this._flash('Boss exit confirmed.', 'ok'); });
        if (f.kind === 'branch') {
          if (f.step === 'choose') {
            on('cb-branch-bonus', () => { f._hidden = $('cb-branch-hidden').checked; f.step = 'bonus'; this._render(); });
            on('cb-branch-connect', () => { f._hidden = $('cb-branch-hidden').checked; f.step = 'connect'; this._render(); });
          }
          if (f.step === 'bonus') {
            document.querySelectorAll('[data-choice]').forEach((b) => b.onclick = async () => {
              // Ingest the bonus world FIRST so we can pick its entry point.
              const ing = await this._ingestWorld(b.dataset.choice, b.dataset.choicename);
              const from = M().getWorld(c, f.worldId);
              const id = M().nextId('w', c.worlds);
              const cw = M().newCampaignWorld(id, from.zoneId, b.dataset.choice, ing.name);
              cw.entryPoints = ing.entryPoints; cw.stars = ing.stars;
              // Out-of-sequence: NOT added to worldOrder (won't shift the Boss).
              M().addBonusWorld(c, from.zoneId, cw);
              f.routeType = M().ROUTE_BONUS; f.destId = id; f.step = 'entry'; this._render();
            });
          }
          if (f.step === 'connect') {
            document.querySelectorAll('[data-cw]').forEach((b) => b.onclick = () => {
              f.routeType = M().ROUTE_CONNECT; f.destId = b.dataset.cw; f.step = 'entry'; this._render();
            });
          }
          if (f.step === 'entry') {
            document.querySelectorAll('[data-ep]').forEach((b) => b.onclick = async () => {
              const from = M().getWorld(c, f.worldId);
              from.goalStarRouting = (from.goalStarRouting || []).filter((r) => r.starIndex !== f.starIndex);
              from.goalStarRouting.push({ starIndex: f.starIndex, routeType: f.routeType,
                destinationWorldId: f.destId, destinationEntryPointId: b.dataset.ep, hidden: !!f._hidden });
              this._flow = null; await this._save(true); this._flash('Route added.', 'ok');
            });
          }
        }
      }
    },

    _esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); },
  };

  if (typeof window !== 'undefined') window.CAMPAIGN_BUILDER = CAMPAIGN_BUILDER;
})();
