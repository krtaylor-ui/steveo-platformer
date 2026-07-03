const { supabaseAdmin } = require('./supabase-client');

// Token verification — same contract as worlds-routes.js / games-routes.js.
// Kept local so this module stays independently mountable.
const verifyToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });

    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Invalid token' });

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token verification failed' });
  }
};

// Must match ARENA_MODES active types (js/arena-modes.js). PvP modes now rank too
// (Deathmatch = winner eliminations, CTF = captures × 50) — Phase 3B/3C.
const VALID_MODES = ['MOB_HUNTER', 'COLLECT_EMERALDS', 'KING_OF_HILL', 'SURVIVAL_WAVES', 'DEATHMATCH', 'CAPTURE_FLAG'];

// Resolve a recency window (?since=day|week|month|all) to an ISO cutoff, or null.
function sinceCutoff(since) {
  const now = Date.now(), DAY = 86400000;
  if (since === 'day')   return new Date(now - DAY).toISOString();
  if (since === 'week')  return new Date(now - 7 * DAY).toISOString();
  if (since === 'month') return new Date(now - 30 * DAY).toISOString();
  return null; // all-time
}

module.exports = function setupArenaLeaderboardRoutes(app) {
  // ── Submit an arena result ─────────────────────────────────────
  app.post('/api/arena/results', verifyToken, async (req, res) => {
    try {
      const { mode, score, duration, worldId } = req.body || {};
      if (!VALID_MODES.includes(mode)) return res.status(400).json({ error: 'Invalid mode' });
      const sc  = Math.max(0, Math.min(1e9, parseInt(score, 10) || 0));
      const dur = (duration == null) ? null : Math.max(0, parseInt(duration, 10) || 0);

      const row = {
        player_id:   req.user.id,
        player_name: req.user.user_metadata?.username || 'Player',
        mode,
        score:    sc,
        duration: dur,
      };
      // Per-world leaderboards (requires arena_results.world_id — server/sql/stats.sql).
      if (worldId) row.world_id = worldId;
      const { error } = await supabaseAdmin.from('arena_results').insert(row);
      if (error) { console.error('[arena] result insert failed:', error); return res.status(500).json({ error: 'Insert failed' }); }
      res.json({ ok: true });
    } catch (error) {
      console.error('[arena] submit error:', error);
      res.status(500).json({ error: 'Failed to submit result' });
    }
  });

  // ── Top scores for a mode ──────────────────────────────────────
  app.get('/api/arena/leaderboards/:mode', verifyToken, async (req, res) => {
    try {
      const mode = req.params.mode;
      if (!VALID_MODES.includes(mode)) return res.status(400).json({ error: 'Invalid mode' });
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));

      let q = supabaseAdmin
        .from('arena_results')
        .select('player_name, score, duration, created_at')
        .eq('mode', mode)
        .order('score', { ascending: false })
        .limit(limit);
      // Optional per-world filter + recency window (all-time vs recent).
      if (req.query.worldId) q = q.eq('world_id', req.query.worldId);
      const cutoff = sinceCutoff(req.query.since);
      if (cutoff) q = q.gte('created_at', cutoff);

      const { data, error } = await q;
      if (error) { console.error('[arena] leaderboard query failed:', error); return res.status(500).json({ error: 'Query failed' }); }
      res.json({ mode, since: req.query.since || 'all', results: data || [] });
    } catch (error) {
      console.error('[arena] leaderboard error:', error);
      res.status(500).json({ error: 'Failed to load leaderboard' });
    }
  });

  // ── Per-world "Leader" (top scorer per mode) for a batch of worlds ──
  // One request powers the arena tiles' "View Leaderboard" affordance: returns
  // { [worldId]: { [mode]: { player_name, score, created_at } } } — the single
  // reigning leader for every (world, mode) that has at least one recorded score.
  app.get('/api/arena/world-leaders', verifyToken, async (req, res) => {
    try {
      const ids = String(req.query.worldIds || '')
        .split(',').map(s => s.trim()).filter(Boolean).slice(0, 50);
      if (!ids.length) return res.json({ leaders: {} });

      // Pull every scored row for these worlds (ordered high→low) and reduce to
      // the top entry per (world, mode) in memory. Row counts here are modest.
      const { data, error } = await supabaseAdmin
        .from('arena_results')
        .select('world_id, mode, player_name, score, created_at')
        .in('world_id', ids)
        .order('score', { ascending: false });
      if (error) { console.error('[arena] world-leaders query failed:', error); return res.status(500).json({ error: 'Query failed' }); }

      const leaders = {};
      for (const r of (data || [])) {
        if (!r.world_id || !r.mode) continue;
        const w = (leaders[r.world_id] || (leaders[r.world_id] = {}));
        if (!w[r.mode]) w[r.mode] = { player_name: r.player_name, score: r.score, created_at: r.created_at };
      }
      res.json({ leaders });
    } catch (error) {
      console.error('[arena] world-leaders error:', error);
      res.status(500).json({ error: 'Failed to load world leaders' });
    }
  });
};
