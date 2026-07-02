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
  CONDITIONS: [
    { type: 'playerKills',            label: 'Player kills' },
    { type: 'hillSecondsTotal',       label: 'Total seconds on hill' },
    { type: 'hillSecondsConsecutive', label: 'Consecutive seconds on hill' },
    { type: 'emeraldsCollected',      label: 'Emeralds collected' },
    { type: 'flagsCaptured',          label: 'Team flag captures' },
    { type: 'towersDestroyed',        label: 'Towers destroyed' },
    { type: 'totalPoints',            label: 'Total points' },
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
    this._wire();
    modal.style.display = 'flex';
  },

  hide() { const m = document.getElementById('custom-rules-modal'); if (m) m.style.display = 'none'; },

  _condLabel(type) { const c = this.CONDITIONS.find(x => x.type === type); return c ? c.label : type; },
  _checkedElements() {
    const el = {};
    document.querySelectorAll('#cr-elements input[data-el]').forEach(cb => { el[cb.dataset.el] = cb.checked; });
    return el;
  },

  _renderElements() {
    const box = document.getElementById('cr-elements'); if (!box) return;
    box.innerHTML = this.ELEMENTS.map(e =>
      `<label class="cr-check"><input type="checkbox" data-el="${e.key}"> ${e.label}</label>`).join('');
    // Re-show relevant scoring rows when an element is toggled.
    box.querySelectorAll('input[data-el]').forEach(cb => cb.addEventListener('change', () => this._renderScoring()));
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
    const typeOpts = this.CONDITIONS.map(c => `<option value="${c.type}">${c.label}</option>`).join('');
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
  },

  _wire() {
    if (this._wired) return;
    this._wired = true;
    document.getElementById('cr-add-step')?.addEventListener('click', () => { this._steps.push({ conditions: [] }); this._renderSteps(); });
    document.getElementById('cr-cancel-btn')?.addEventListener('click', () => this.hide());
    document.getElementById('cr-start-btn')?.addEventListener('click', () => this._start());
  },

  _start() {
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
