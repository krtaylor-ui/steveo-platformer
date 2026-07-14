// ============================================================
// bot-telemetry.js — Bot AI "Learning Mode" telemetry (Bot AI brief, Phase 7)
// ------------------------------------------------------------
// Per-match, per-bot structured logs + a SAMPLED decision trace, so Kevin can
// accumulate a dataset across many matches and hand a batch to Claude Code OR
// Claude (web) for tuning — and get consistent interpretation because the field
// meanings live in ONE reference: BOT_TELEMETRY_SCHEMA.md (the data dictionary).
//
// Design goals (from the brief):
//   • One entry PER BOT PER MATCH — mode/ruleset, difficulty, role, outcome, and
//     objective-specific stats.
//   • Sampled decision trace at the brain-tick cadence (NOT per-frame) — the
//     BotController records one snapshot per decision in `telemetry.decisions`;
//     here we run-length-collapse consecutive identical decisions to stay compact.
//   • ACCUMULATE, never overwrite — many matches per mode build up over sessions.
//   • Exportable as one JSON batch that can be loaded/aggregated together.
//   • Lightweight — sampled/structured, no per-frame spam.
// ============================================================

const BOT_TELEMETRY = {
  KEY: 'steveo_bot_telemetry',
  SCHEMA: 'steveo-bot-telemetry/v1',
  MAX_STORED: 500,          // cap accumulated match-records in localStorage (safety)

  // Build the per-bot records for a finished match. Does NOT store — call record()
  // for that. `opts`: { ts, matchId, winnerId, durationSec } (all optional; sane
  // fallbacks so headless callers / the sample generator can drive it).
  buildRecords(game, opts = {}) {
    const ctrls = (game && game._botControllers) ? game._botControllers : [];
    if (!ctrls.length) return [];
    const ts = opts.ts != null ? opts.ts : (typeof Date !== 'undefined' && Date.now ? Date.now() : 0);
    const matchId = opts.matchId || ('m' + ts + '-' + (game.level ? game.level.width : 0));
    const mode = (game.arenaConfig && game.arenaConfig.arenaGameMode) || 'UNKNOWN';
    const custom = mode === 'CUSTOM' && game.arenaConfig ? (game.arenaConfig.customRuleset || null) : null;
    const stats = (game.arenaState && game.arenaState.stats) || {};

    return ctrls.map((c) => {
      const st = stats[c.ownerId] || {};
      const won = opts.winnerId != null && opts.winnerId === c.ownerId;
      return {
        schema: this.SCHEMA,
        matchId, ts,
        mode,
        rulesetId: mode,
        custom: custom ? true : false,
        durationSec: opts.durationSec != null ? opts.durationSec : null,
        bot: {
          slot: c.index + 1,          // 1-based (P1..P4) to match the HUD
          ownerId: c.ownerId,
          role: c.role,               // competitive | coop | companion
          difficulty: c.difficultyKey,
        },
        outcome: {
          result: opts.winnerId == null ? 'unknown' : (won ? 'win' : 'loss'),
          score: this._score(game, c.ownerId),
        },
        // Objective-specific stats (all always tracked; interpret per mode — see
        // the schema doc). Missing keys default to 0.
        stats: {
          kills: st.kills || 0, deaths: st.deaths || 0, mobKills: st.mobKills || 0,
          emeralds: st.emeralds || 0, hillSeconds: st.hillSeconds || 0,
          flagCaptures: st.flagCaptures || 0, towerDamage: st.towerDamage || 0,
          towersDestroyed: st.towersDestroyed || 0,
        },
        goalCounts: Object.assign({}, c.telemetry && c.telemetry.goalCounts),
        decisionTrace: this._collapse((c.telemetry && c.telemetry.decisions) || []),
      };
    });
  },

  // Per-mode score for a bot (delegates to ARENA_MODES when available).
  _score(game, ownerId) {
    try {
      if (typeof ARENA_MODES !== 'undefined' && ARENA_MODES.playerScore) return ARENA_MODES.playerScore(game, ownerId);
    } catch (e) { /* fall through */ }
    const st = (game.arenaState && game.arenaState.stats && game.arenaState.stats[ownerId]) || {};
    return (st.kills || 0) + (st.mobKills || 0) + (st.emeralds || 0);
  },

  // Run-length-collapse the sampled decisions: consecutive samples with the same
  // (kind,target) become one run { fromFrame, toFrame, kind, reason, target, cell,
  // samples }. Keeps "what was it trying to do, and when" without per-sample spam.
  _collapse(decisions) {
    const out = [];
    for (const d of decisions) {
      const last = out[out.length - 1];
      if (last && last.kind === d.kind && last.target === (d.target || null)) {
        last.toFrame = d.frame; last.samples++;
        continue;
      }
      out.push({ fromFrame: d.frame, toFrame: d.frame, kind: d.kind, reason: d.reason || '', target: d.target || null, cell: d.cell || null, samples: 1 });
    }
    return out;
  },

  // Build + STORE (accumulate) the records for a finished match. Returns them.
  record(game, opts = {}) {
    const recs = this.buildRecords(game, opts);
    if (recs.length) this._append(recs);
    return recs;
  },

  _append(recs) {
    if (typeof localStorage === 'undefined') return;
    try {
      const all = this.all();
      all.push(...recs);
      // keep the most recent MAX_STORED
      const trimmed = all.slice(-this.MAX_STORED);
      localStorage.setItem(this.KEY, JSON.stringify(trimmed));
    } catch (e) { /* storage full / unavailable — telemetry is best-effort */ }
  },

  // All accumulated match-records (across sessions), oldest→newest.
  all() {
    if (typeof localStorage === 'undefined') return [];
    try { const raw = localStorage.getItem(this.KEY); return raw ? JSON.parse(raw) : []; }
    catch (e) { return []; }
  },

  clear() { if (typeof localStorage !== 'undefined') { try { localStorage.removeItem(this.KEY); } catch (e) {} } },

  // One JSON batch — exactly what Kevin hands to Claude Code / Claude (web). The
  // top-level wrapper names the schema + a pointer to the data dictionary so the
  // reader always knows how to interpret the fields.
  exportBatch(records) {
    const matches = records || this.all();
    return {
      schema: this.SCHEMA,
      dataDictionary: 'BOT_TELEMETRY_SCHEMA.md',
      exportedAt: (typeof Date !== 'undefined' && Date.now) ? Date.now() : null,
      matchCount: matches.length,
      matches,
    };
  },

  // Browser: download the accumulated batch as a .json file.
  download(filename) {
    if (typeof document === 'undefined') return;
    const blob = new Blob([JSON.stringify(this.exportBatch(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename || ('bot-telemetry-' + ((typeof Date !== 'undefined' && Date.now) ? Date.now() : 'export') + '.json');
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },

  // Aggregate a batch for a quick combined review (win rate + avg score per
  // mode×difficulty). The same reduction Claude Code/web would run on a batch.
  summarize(records) {
    const rows = {};
    for (const r of (records || this.all())) {
      const key = r.mode + '/' + (r.bot ? r.bot.difficulty : '?');
      const row = rows[key] || (rows[key] = { mode: r.mode, difficulty: r.bot && r.bot.difficulty, n: 0, wins: 0, scoreSum: 0, kills: 0, deaths: 0 });
      row.n++;
      if (r.outcome && r.outcome.result === 'win') row.wins++;
      row.scoreSum += (r.outcome && r.outcome.score) || 0;
      row.kills += r.stats ? r.stats.kills : 0;
      row.deaths += r.stats ? r.stats.deaths : 0;
    }
    return Object.values(rows).map(r => ({
      mode: r.mode, difficulty: r.difficulty, matches: r.n,
      winRate: r.n ? +(r.wins / r.n).toFixed(2) : 0,
      avgScore: r.n ? +(r.scoreSum / r.n).toFixed(1) : 0,
      avgKills: r.n ? +(r.kills / r.n).toFixed(1) : 0,
      avgDeaths: r.n ? +(r.deaths / r.n).toFixed(1) : 0,
    }));
  },
};

if (typeof window !== 'undefined') window.BOT_TELEMETRY = BOT_TELEMETRY;
if (typeof module !== 'undefined' && module.exports) module.exports = { BOT_TELEMETRY };
