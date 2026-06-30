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

// Must match ARENA_MODES active types (js/arena-modes.js). PvP modes (Deathmatch,
// Capture the Flag) are not ranked yet (Phase 3B/3C).
const VALID_MODES = ['MOB_HUNTER', 'COLLECT_EMERALDS', 'KING_OF_HILL', 'SURVIVAL_WAVES'];

module.exports = function setupArenaLeaderboardRoutes(app) {
  // ── Submit an arena result ─────────────────────────────────────
  app.post('/api/arena/results', verifyToken, async (req, res) => {
    try {
      const { mode, score, duration } = req.body || {};
      if (!VALID_MODES.includes(mode)) return res.status(400).json({ error: 'Invalid mode' });
      const sc  = Math.max(0, Math.min(1e9, parseInt(score, 10) || 0));
      const dur = (duration == null) ? null : Math.max(0, parseInt(duration, 10) || 0);

      const { error } = await supabaseAdmin.from('arena_results').insert({
        player_id:   req.user.id,
        player_name: req.user.user_metadata?.username || 'Player',
        mode,
        score:    sc,
        duration: dur,
      });
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

      const { data, error } = await supabaseAdmin
        .from('arena_results')
        .select('player_name, score, duration, created_at')
        .eq('mode', mode)
        .order('score', { ascending: false })
        .limit(limit);
      if (error) { console.error('[arena] leaderboard query failed:', error); return res.status(500).json({ error: 'Query failed' }); }
      res.json({ mode, results: data || [] });
    } catch (error) {
      console.error('[arena] leaderboard error:', error);
      res.status(500).json({ error: 'Failed to load leaderboard' });
    }
  });
};
