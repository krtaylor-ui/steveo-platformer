const { supabaseAdmin } = require('./supabase-client');

// Token verification — same contract as arena-leaderboard-routes.js.
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

// Speed Run leaderboards — hybrid with the client's localStorage top-5. The
// client keeps working offline; when online it best-effort mirrors runs here
// and merges server rows back in. Keyed by a per-level string (playerName:
// worldName), same as the local `sr_lb_${levelId}` key. Appends all rows;
// top-5 (fastest ms) is derived per query — see server/sql/speedrun.sql.
module.exports = function setupSpeedrunRoutes(app) {
  // ── Submit a speed-run time ────────────────────────────────────
  app.post('/api/speedrun/results', verifyToken, async (req, res) => {
    try {
      const { levelId, name, ms, username } = req.body || {};
      if (!levelId || typeof levelId !== 'string') return res.status(400).json({ error: 'Missing levelId' });
      const m = Math.max(1, Math.min(1e9, parseInt(ms, 10) || 0));
      const initials = String(name || 'AAA').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) || 'AAA';

      const row = {
        player_id:   req.user.id,
        player_name: username || req.user.user_metadata?.username || 'Player',
        level_id:    levelId.slice(0, 200),
        initials,
        ms: m,
      };
      const { error } = await supabaseAdmin.from('speedrun_results').insert(row);
      if (error) { console.error('[speedrun] insert failed:', error); return res.status(500).json({ error: 'Insert failed' }); }
      res.json({ ok: true });
    } catch (error) {
      console.error('[speedrun] submit error:', error);
      res.status(500).json({ error: 'Failed to submit time' });
    }
  });

  // ── Top times for a level ──────────────────────────────────────
  app.get('/api/speedrun/results', verifyToken, async (req, res) => {
    try {
      const levelId = req.query.levelId;
      if (!levelId) return res.status(400).json({ error: 'Missing levelId' });
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 5));

      const { data, error } = await supabaseAdmin
        .from('speedrun_results')
        .select('initials, player_name, ms')
        .eq('level_id', levelId)
        .order('ms', { ascending: true })
        .limit(limit);
      if (error) { console.error('[speedrun] query failed:', error); return res.status(500).json({ error: 'Query failed' }); }

      // Shape to the client's { name, ms, user } entry format.
      const results = (data || []).map(r => ({ name: r.initials, ms: r.ms, user: r.player_name }));
      res.json({ levelId, results });
    } catch (error) {
      console.error('[speedrun] leaderboard error:', error);
      res.status(500).json({ error: 'Failed to load times' });
    }
  });
};
