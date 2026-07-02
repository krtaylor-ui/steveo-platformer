// ============================================================
// custom-rules-ui.js — "Custom Rules" arena authoring UI (Phase 3 v3)
// ------------------------------------------------------------
// Builds a declarative ruleset (see arena-rules.js):
//   • Elements  — which world systems are active (mob sources kept discrete).
//   • Scoring   — points per tracked stat; each row shows only when its element
//                 is enabled, pre-filled with a sensible default.
//   • Win       — a SEQUENCE of steps; complete each step in order to win. Within
//                 a step, conditions combine with AND / OR / NOT (left→right).
// Emits onStart(cfg) with the customRuleset + common match settings + lives.
// ============================================================

const CUSTOM_RULES_UI = {
  ELEMENTS: [
    { key: 'pvp',        label: 'PvP (players can damage each other)' },
    { key: 'bots',       label: 'Bots (ambient enemies)' },
    { key: 'waveSpawns', label: 'Mob wave spawning (escalating)' },
    { key: 'spawnEggs',  label: 'Spawn eggs (designer-placed spawners)' },
    { key: 'emeralds',   label: 'Emeralds (collectibles)' },
    { key: 'hill',       label: 'Hill (King-of-the-Hill zone)' },
    { key: 'ctf',        label: 'Capture the Flag (bases + flags)' },
    { key: 'towers',     label: 'Towers (destroyable targets)' },
  ],
  // Each scoring row shows only when `needs` (any of those elements) is checked;
  // `dflt` pre-populates the value the first time it becomes visible.
  SCORING: [
    { key: 'perKill',           label: 'Player kill',        dflt: 3,  needs: ['pvp'] },
    { key: 'perMobKill',        label: 'Mob kill',           dflt: 1,  needs: ['bots', 'spawnEggs', 'waveSpawns'] },
    { key: 'perEmerald',        label: 'Emerald',            dflt: 1,  needs: ['emeralds'] },
    { key: 'perHill10s',        label: '10 seconds on hill', dflt: 3,  needs: ['hill'] },
    { key: 'perFlag',           label: 'Flag capture',       dflt: 5,  needs: ['ctf'] },
    { key: 'perTowerDestroyed', label: 'Tower destroyed',    dflt: 10, needs: ['towers'] },
    { key: 'perWaveDefeated',   label: 'Wave defeated',      dflt: 10, needs: ['waveSpawns'] },
  ],
  // `needs` = the element that must be enabled for this condition to be offered
  // (null = always available). Keeps the win conditions valid for the ruleset.
  CONDITIONS: [
    { type: 'playerKills',            label: 'Player kills',                needs: 'pvp' },
    { type: 'hillSecondsTotal',       label: 'Total seconds on hill',       needs: 'hill' },
    { type: 'hillSecondsConsecutive', label: 'Consecutive seconds on hill', needs: 'hill' },
    { type: 'emeraldsCollected',      label: 'Emeralds collected',          needs: 'emeralds' },
    { type: 'flagsCaptured',          label: 'Team flag captures',          needs: 'ctf' },
    { type: 'towersDestroyed',        label: 'Towers destroyed',            needs: 'towers' },
    { type: 'totalPoints',            label: 'Total points',                needs: null },
  ],

  _onStart: null,
  _wired: false,
  _steps: null,       // [{ conditions: [{type,target,logic}] }]
  _scoreVals: null,   // { perKill: 3, ... } — preserved across show/hide

  show(onStart) {
    const modal = document.getElementById('custom-rules-modal');
    if (!modal) { onStart({}); return; }
    this._onStart = onStart;
    this._steps = [{ conditions: [] }];
    this._scoreVals = {};
    this.SCORING.forEach(s => { this._scoreVals[s.key] = s.dflt; });
    this._renderElements();
    this._renderScoring();
    this._renderSteps();
    this._renderRecent();
    this._fetchSaved();
    this._msg('');
    this._wire();
    modal.style.display = 'flex';
  },

  hide() { const m = document.getElementById('custom-rules-modal'); if (m) m.style.display = 'none'; },

  // ── Configurations: recent (localStorage), saved (Supabase), export/import ──
  _recentKey: 'steveo_custom_recent',
  _msg(text) { const el = document.getElementById('cr-config-msg'); if (el) el.textContent = text || ''; },

  // Capture the full builder state to a portable config object.
  _snapshot() {
    const num = (id, d) => { const el = document.getElementById(id); const n = el ? parseInt(el.value, 10) : NaN; return Number.isFinite(n) ? n : d; };
    const val = (id, d) => { const el = document.getElementById(id); return el ? el.value : d; };
    const scoring = Object.assign({}, this._scoreVals);
    document.querySelectorAll('#cr-scoring input[data-score]').forEach(i => { scoring[i.dataset.score] = Math.max(0, parseInt(i.value, 10) || 0); });
    return {
      v: 1,
      common: { matchLength: num('cr-match-length', 300), playerCount: num('cr-player-count', 1), playerHealth: num('cr-player-health', 6), lives: val('cr-lives', 'unlimited') },
      elements: this._checkedElements(),
      scoring,
      steps: this._steps.map(s => ({ conditions: s.conditions.map(c => ({ type: c.type, target: c.target, logic: c.logic })) })),
    };
  },
  // Apply a config object back onto the builder.
  _restore(config) {
    if (!config || typeof config !== 'object') return;
    const set = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = String(v); };
    const c = config.common || {};
    set('cr-match-length', c.matchLength); set('cr-player-count', c.playerCount);
    set('cr-player-health', c.playerHealth); set('cr-lives', c.lives);
    document.querySelectorAll('#cr-elements input[data-el]').forEach(cb => { cb.checked = !!(config.elements && config.elements[cb.dataset.el]); });
    this._scoreVals = Object.assign({}, this._scoreVals, config.scoring || {});
    this._steps = (Array.isArray(config.steps) && config.steps.length)
      ? config.steps.map(s => ({ conditions: (s.conditions || []).map(x => ({ type: x.type, target: x.target || 1, logic: x.logic || 'and' })) }))
      : [{ conditions: [] }];
    this._renderScoring();
    this._renderSteps();
  },

  _loadRecent() { try { return JSON.parse(localStorage.getItem(this._recentKey) || '[]'); } catch (e) { return []; } },
  _pushRecent(snap) { let r = this._loadRecent(); r.unshift({ ts: Date.now(), config: snap }); r = r.slice(0, 3); try { localStorage.setItem(this._recentKey, JSON.stringify(r)); } catch (e) {} },
  _renderRecent() {
    const box = document.getElementById('cr-recent'); if (!box) return;
    const r = this._loadRecent();
    box.innerHTML = r.length ? r.map((e, i) => `<button class="btn btn-small cr-recent-chip" data-i="${i}">↩ Recent ${i + 1}</button>`).join('') : '<span class="cr-guide">No recent configs yet.</span>';
    box.querySelectorAll('.cr-recent-chip').forEach(b => b.addEventListener('click', () => { const e = this._loadRecent()[+b.dataset.i]; if (e) { this._restore(e.config); this._msg('Loaded recent config.'); } }));
  },

  async _fetchSaved() {
    if (typeof AUTH === 'undefined' || !AUTH.authedFetch) return;
    try {
      const res = await AUTH.authedFetch('/api/custom-rules');
      if (!res.ok) return;
      this._saved = await res.json();
      const sel = document.getElementById('cr-saved-select'); if (!sel) return;
      sel.innerHTML = `<option value="">— Saved configs (${this._saved.length}/10) —</option>` +
        this._saved.map(s => `<option value="${s.id}">${String(s.name || 'Config').replace(/[<>]/g, '')}</option>`).join('');
    } catch (e) {}
  },
  async _saveToProfile() {
    if (typeof AUTH === 'undefined' || !AUTH.authedFetch) { this._msg('Sign in to save to your profile.'); return; }
    const name = (prompt('Name this configuration:') || '').trim();
    if (!name) return;
    try {
      const res = await AUTH.authedFetch('/api/custom-rules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, config: this._snapshot() }) });
      const data = await res.json();
      if (!res.ok) { this._msg(data.error || 'Save failed.'); return; }
      this._msg(`Saved "${name}".`);
      this._fetchSaved();
    } catch (e) { this._msg('Save failed.'); }
  },
  async _deleteSaved() {
    const sel = document.getElementById('cr-saved-select'); const id = sel && sel.value; if (!id) { this._msg('Pick a saved config to delete.'); return; }
    try {
      const res = await AUTH.authedFetch(`/api/custom-rules/${id}`, { method: 'DELETE' });
      if (!res.ok) { this._msg('Delete failed.'); return; }
      this._msg('Deleted.');
      this._fetchSaved();
    } catch (e) { this._msg('Delete failed.'); }
  },
  _loadSaved() {
    const sel = document.getElementById('cr-saved-select'); const id = sel && sel.value; if (!id) { this._msg('Pick a saved config to load.'); return; }
    const entry = (this._saved || []).find(s => String(s.id) === String(id));
    if (entry) { this._restore(entry.config); this._msg(`Loaded "${entry.name}".`); }
  },
  _export() {
    try {
      const blob = new Blob([JSON.stringify(this._snapshot(), null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'steveo-custom-rules.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      this._msg('Exported to a file.');
    } catch (e) { this._msg('Export failed.'); }
  },
  _import(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try { this._restore(JSON.parse(reader.result)); this._msg('Imported config.'); }
      catch (e) { this._msg('Import failed — not a valid config file.'); }
    };
    reader.readAsText(file);
  },

  _condLabel(type) { const c = this.CONDITIONS.find(x => x.type === type); return c ? c.label : type; },
  _checkedElements() {
    const el = {};
    document.querySelectorAll('#cr-elements input[data-el]').forEach(cb => { el[cb.dataset.el] = cb.checked; });
    return el;
  },
  // Conditions offerable given the enabled elements (totalPoints always).
  _validConditions() {
    const el = this._checkedElements();
    return this.CONDITIONS.filter(c => !c.needs || el[c.needs]);
  },
  // Drop already-added conditions whose element was just turned off (so a step
  // can't become permanently unwinnable via a stale condition).
  _pruneInvalidConditions() {
    const el = this._checkedElements();
    let changed = false;
    for (const step of this._steps) {
      const before = step.conditions.length;
      step.conditions = step.conditions.filter(c => {
        const def = this.CONDITIONS.find(x => x.type === c.type);
        return !def || !def.needs || el[def.needs];
      });
      if (step.conditions.length !== before) changed = true;
    }
    return changed;
  },

  _renderElements() {
    const box = document.getElementById('cr-elements'); if (!box) return;
    box.innerHTML = this.ELEMENTS.map(e =>
      `<label class="cr-check"><input type="checkbox" data-el="${e.key}"> ${e.label}</label>`).join('');
    // Toggling an element updates the scoring rows AND the valid win conditions.
    box.querySelectorAll('input[data-el]').forEach(cb => cb.addEventListener('change', () => {
      this._renderScoring();
      this._pruneInvalidConditions();
      this._renderSteps();
    }));
  },

  // Show only the scoring rows whose element is enabled (pre-filled with defaults).
  _renderScoring() {
    const box = document.getElementById('cr-scoring'); if (!box) return;
    // Preserve any values the user already typed.
    box.querySelectorAll('input[data-score]').forEach(inp => { this._scoreVals[inp.dataset.score] = Math.max(0, parseInt(inp.value, 10) || 0); });
    const el = this._checkedElements();
    const rows = this.SCORING.filter(s => s.needs.some(k => el[k]));
    const empty = document.getElementById('cr-scoring-empty');
    if (empty) empty.style.display = rows.length ? 'none' : 'block';
    box.innerHTML = rows.map(s =>
      `<label class="cr-score-row"><span>${s.label}</span><input type="number" data-score="${s.key}" value="${this._scoreVals[s.key]}" min="0" max="999" step="1"></label>`).join('');
  },

  // Render the sequence of steps (each with its conditions + an add-row).
  _renderSteps() {
    const box = document.getElementById('cr-steps'); if (!box) return;
    const logicOpts = ['and', 'or', 'not'].map(l => `<option value="${l}">${l.toUpperCase()}</option>`).join('');
    const valid = this._validConditions();
    const typeOpts = valid.map(c => `<option value="${c.type}">${c.label}</option>`).join('');
    box.innerHTML = this._steps.map((step, si) => {
      const conds = step.conditions.length
        ? step.conditions.map((c, ci) => {
            const prefix = ci === 0 ? (c.logic === 'not' ? 'NOT ' : '') : (c.logic.toUpperCase() + ' ');
            return `<div class="cr-step-cond"><span>${prefix}${this._condLabel(c.type)} ≥ ${c.target}</span>` +
                   `<button class="btn btn-small cr-rm-cond" data-si="${si}" data-ci="${ci}" title="Remove">✕</button></div>`;
          }).join('')
        : '<div class="cr-step-empty">No conditions yet — add one below.</div>';
      return `<div class="cr-step">
        <div class="cr-step-head">Step ${si + 1}${this._steps.length > 1 ? ` <button class="btn btn-small cr-rm-step" data-si="${si}">remove</button>` : ''}</div>
        <div class="cr-step-conds">${conds}</div>
        <div class="cr-step-add">
          <select class="cr-add-logic">${logicOpts}</select>
          <select class="cr-add-type">${typeOpts}</select>
          <input type="number" class="cr-add-target" value="1" min="1" max="9999" step="1">
          <button class="btn btn-small cr-add-cond" data-si="${si}">Add</button>
        </div>
      </div>`;
    }).join('');
    // Wire the row buttons.
    box.querySelectorAll('.cr-add-cond').forEach(b => b.addEventListener('click', () => {
      const step = b.closest('.cr-step'), si = +b.dataset.si;
      this._steps[si].conditions.push({
        logic: step.querySelector('.cr-add-logic').value,
        type:  step.querySelector('.cr-add-type').value,
        target: Math.max(1, parseInt(step.querySelector('.cr-add-target').value, 10) || 1),
      });
      this._renderSteps();
    }));
    box.querySelectorAll('.cr-rm-cond').forEach(b => b.addEventListener('click', () => {
      this._steps[+b.dataset.si].conditions.splice(+b.dataset.ci, 1); this._renderSteps();
    }));
    box.querySelectorAll('.cr-rm-step').forEach(b => b.addEventListener('click', () => {
      this._steps.splice(+b.dataset.si, 1); if (!this._steps.length) this._steps = [{ conditions: [] }]; this._renderSteps();
    }));
    // Warn: finite/cumulative objectives used in a LATER step (2+) may be
    // unreachable — an earlier step likely consumed the supply (the tower is
    // already destroyed / the emeralds already collected).
    const WARN = { towersDestroyed: 'Towers destroyed', emeraldsCollected: 'Emeralds collected' };
    const warned = [];
    this._steps.forEach((step, si) => { if (si >= 1) step.conditions.forEach(c => { if (WARN[c.type] && !warned.includes(WARN[c.type])) warned.push(WARN[c.type]); }); });
    if (warned.length) {
      const div = document.createElement('div');
      div.className = 'cr-warn';
      div.textContent = '⚠ ' + warned.join(' / ') + ' in a later step may be unreachable — these are cumulative/finite, so an earlier step can use up the supply. Consider higher targets in ONE step instead.';
      box.appendChild(div);
    }
  },

  _wire() {
    if (this._wired) return;
    this._wired = true;
    document.getElementById('cr-add-step')?.addEventListener('click', () => { this._steps.push({ conditions: [] }); this._renderSteps(); });
    document.getElementById('cr-cancel-btn')?.addEventListener('click', () => this.hide());
    document.getElementById('cr-start-btn')?.addEventListener('click', () => this._start());
    // Configurations
    document.getElementById('cr-load-btn')?.addEventListener('click', () => this._loadSaved());
    document.getElementById('cr-delete-btn')?.addEventListener('click', () => this._deleteSaved());
    document.getElementById('cr-save-btn')?.addEventListener('click', () => this._saveToProfile());
    document.getElementById('cr-export-btn')?.addEventListener('click', () => this._export());
    document.getElementById('cr-import-btn')?.addEventListener('click', () => document.getElementById('cr-import-file')?.click());
    document.getElementById('cr-import-file')?.addEventListener('change', (e) => { this._import(e.target.files && e.target.files[0]); e.target.value = ''; });
  },

  _start() {
    this._pushRecent(this._snapshot()); // remember the last 3 launched configs
    const num = (id, dflt) => { const el = document.getElementById(id); const n = el ? parseInt(el.value, 10) : NaN; return Number.isFinite(n) ? n : dflt; };
    const val = (id, dflt) => { const el = document.getElementById(id); return el ? el.value : dflt; };
    const elements = this._checkedElements();
    const scoring = {};
    // Only enabled rows are in the DOM; unset weights default to 0.
    document.querySelectorAll('#cr-scoring input[data-score]').forEach(inp => { scoring[inp.dataset.score] = Math.max(0, parseInt(inp.value, 10) || 0); });

    const stages = this._steps
      .filter(s => s.conditions.length)
      .map(s => ({ conditions: s.conditions.map(c => ({ type: c.type, target: c.target, logic: c.logic })) }));
    const anyScore = Object.values(scoring).some(v => v > 0);

    const ruleset = {
      label: 'Custom Rules', elements, scoring,
      winnerBy: (elements.towers && !anyScore) ? 'destroyer' : 'topScore',
      deathEndsMatch: false, endStructural: [],
    };
    if (stages.length) ruleset.stages = stages;
    else ruleset.win = { combinator: 'any', conditions: [] }; // timer-only

    const livesVal = val('cr-lives', 'unlimited');
    const cfg = {
      gameDuration: num('cr-match-length', 300) * 1000,
      playerCount: Math.max(1, Math.min(4, num('cr-player-count', 1))),
      playerHealthHp: num('cr-player-health', 6),
      lives: (livesVal === 'unlimited') ? 'unlimited' : Math.max(1, parseInt(livesVal, 10) || 3),
      friendlyFire: !!elements.pvp,
      customRuleset: ruleset,
    };
    if (elements.ctf)    cfg.flagReturnSeconds = 15;
    if (elements.towers) cfg.towerHp = 9;

    const cb = this._onStart;
    this.hide();
    if (cb) cb(cfg);
  },
};

if (typeof window !== 'undefined') window.CUSTOM_RULES_UI = CUSTOM_RULES_UI;
