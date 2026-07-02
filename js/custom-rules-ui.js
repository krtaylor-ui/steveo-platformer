// ============================================================
// custom-rules-ui.js — "Custom Rules" arena authoring UI (Phase 3 v3)
// ------------------------------------------------------------
// Builds a declarative ruleset (see arena-rules.js) from the player's choices:
//   • Elements  — which world systems are active (mob sources kept discrete).
//   • Scoring   — points per tracked stat (weighted; everything is still tracked).
//   • Win       — a flat list of conditions combined Any/All, OR an ordered
//                 sequence (stages) completed in turn.
// On start it calls onStart(cfg) where cfg carries the customRuleset plus the
// common match settings, exactly like ARENA_PRELAUNCH does for the presets.
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
  SCORING: [
    { key: 'perKill',           label: 'Player kill' },
    { key: 'perMobKill',        label: 'Mob kill' },
    { key: 'perEmerald',        label: 'Emerald' },
    { key: 'perHillSecond',     label: 'Second on the hill' },
    { key: 'perFlag',           label: 'Flag capture' },
    { key: 'perTowerDestroyed', label: 'Tower destroyed' },
    { key: 'perWaveDefeated',   label: 'Wave defeated' },
  ],
  CONDITIONS: [
    { type: 'playerKills',            label: 'Player kills ≥' },
    { type: 'hillSecondsTotal',       label: 'Total seconds on hill ≥' },
    { type: 'hillSecondsConsecutive', label: 'Consecutive seconds on hill ≥' },
    { type: 'emeraldsCollected',      label: 'Emeralds collected ≥' },
    { type: 'flagsCaptured',          label: 'Team flag captures ≥' },
    { type: 'towersDestroyed',        label: 'Towers destroyed ≥' },
    { type: 'totalPoints',            label: 'Total points ≥' },
  ],

  _onStart: null,
  _wired: false,

  show(onStart) {
    const modal = document.getElementById('custom-rules-modal');
    if (!modal) { onStart({}); return; }
    this._onStart = onStart;
    this._renderElements();
    this._renderScoring();
    document.getElementById('cr-conditions').innerHTML = '';
    this._addCondition(); // start with one row
    this._wire();
    this._syncLogicHint();
    modal.style.display = 'flex';
  },

  hide() { const m = document.getElementById('custom-rules-modal'); if (m) m.style.display = 'none'; },

  _renderElements() {
    const box = document.getElementById('cr-elements'); if (!box) return;
    box.innerHTML = this.ELEMENTS.map(e =>
      `<label class="cr-check"><input type="checkbox" data-el="${e.key}"> ${e.label}</label>`).join('');
  },
  _renderScoring() {
    const box = document.getElementById('cr-scoring'); if (!box) return;
    box.innerHTML = this.SCORING.map(s =>
      `<label class="cr-score-row"><span>${s.label}</span><input type="number" data-score="${s.key}" value="0" min="0" max="999" step="1"></label>`).join('');
  },
  _addCondition() {
    const box = document.getElementById('cr-conditions'); if (!box) return;
    const row = document.createElement('div');
    row.className = 'cr-cond-row';
    const opts = this.CONDITIONS.map(c => `<option value="${c.type}">${c.label}</option>`).join('');
    row.innerHTML = `<select class="cr-cond-type">${opts}</select>` +
                    `<input type="number" class="cr-cond-target" value="1" min="1" max="9999" step="1">` +
                    `<button class="btn btn-small cr-cond-remove" title="Remove">✕</button>`;
    row.querySelector('.cr-cond-remove').addEventListener('click', () => { row.remove(); this._renumber(); });
    box.appendChild(row);
    this._renumber();
  },
  // In sequence mode, prefix each row with its step number.
  _renumber() {
    const seq = (document.getElementById('cr-win-logic') || {}).value === 'sequence';
    document.querySelectorAll('#cr-conditions .cr-cond-row').forEach((row, i) => {
      let tag = row.querySelector('.cr-step-tag');
      if (seq) {
        if (!tag) { tag = document.createElement('span'); tag.className = 'cr-step-tag'; row.insertBefore(tag, row.firstChild); }
        tag.textContent = (i + 1) + '.';
      } else if (tag) { tag.remove(); }
    });
  },
  _syncLogicHint() {
    const logic = (document.getElementById('cr-win-logic') || {}).value;
    const hint = document.getElementById('cr-win-hint'); if (!hint) return;
    hint.textContent = logic === 'sequence'
      ? 'Complete each step in order to win. No steps = play until the timer ends (highest score wins).'
      : (logic === 'all'
        ? 'Win when ALL conditions are met. No conditions = timer decides (highest score wins).'
        : 'Win when ANY condition is met. No conditions = timer decides (highest score wins).');
    this._renumber();
  },

  _wire() {
    if (this._wired) return;
    this._wired = true;
    document.getElementById('cr-add-condition')?.addEventListener('click', () => this._addCondition());
    document.getElementById('cr-win-logic')?.addEventListener('change', () => this._syncLogicHint());
    document.getElementById('cr-cancel-btn')?.addEventListener('click', () => this.hide());
    document.getElementById('cr-start-btn')?.addEventListener('click', () => this._start());
  },

  _start() {
    const num = (id, dflt) => { const el = document.getElementById(id); const n = el ? parseInt(el.value, 10) : NaN; return Number.isFinite(n) ? n : dflt; };
    const elements = {};
    document.querySelectorAll('#cr-elements input[data-el]').forEach(cb => { elements[cb.dataset.el] = cb.checked; });
    const scoring = {};
    document.querySelectorAll('#cr-scoring input[data-score]').forEach(inp => { scoring[inp.dataset.score] = Math.max(0, parseInt(inp.value, 10) || 0); });
    const conds = [];
    document.querySelectorAll('#cr-conditions .cr-cond-row').forEach(row => {
      conds.push({ type: row.querySelector('.cr-cond-type').value, target: Math.max(1, parseInt(row.querySelector('.cr-cond-target').value, 10) || 1) });
    });
    const logic = (document.getElementById('cr-win-logic') || {}).value || 'any';
    const anyScore = Object.values(scoring).some(v => v > 0);

    const ruleset = {
      label: 'Custom Rules', elements, scoring,
      winnerBy: (elements.towers && !anyScore) ? 'destroyer' : 'topScore',
      deathEndsMatch: false, endStructural: [],
    };
    if (logic === 'sequence') ruleset.stages = conds.map(c => ({ combinator: 'any', conditions: [c] }));
    else ruleset.win = { combinator: logic, conditions: conds };

    const cfg = {
      gameDuration: num('cr-match-length', 300) * 1000,
      playerCount: Math.max(1, Math.min(4, num('cr-player-count', 1))),
      playerHealthHp: num('cr-player-health', 6),
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
