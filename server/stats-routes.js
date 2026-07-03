// ============================================================
// stats-routes.js — Phase 4 (basic) Achievements + Analytics + PB/per-world LBs
// ------------------------------------------------------------
// Minimal, conservative framework (per the master brief):
//   • player_stats — usage analytics (matches, wins, kills, captures, play time)
//   • player_achievements — a handful of meaningful unlock triggers
//   • personal best + per-world arena leaderboard reads (arena_results.world_id)
// Backed by server/sql/stats.sql. Exports setupStatsRoutes(app); wired in server.js.
// ============================================================

const { supabaseAdmin } = require('./supabase-client');

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

// Achievement catalogue — evaluated server-side against a player's stats after a
// match/publish so the client can't fabricate unlocks. Keep the list small + meaningful.
const ACHIEVEMENTS = [
  { key: 'first_match',   name: 'Welcome to the Arena', desc: 'Play your first arena match',  test: (s) => s.matches_played >= 1 },
  { key: 'first_win',     name: 'Victory Royale',       desc: 'Win your first match',          test: (s) => s.wins >= 1 },
  { key: 'first_capture', name: 'Flag Bearer',          desc: 'Capture your first flag (CTF)',  test: (s) => s.ctf_captures >= 1 },
  { key: 'first_publish', name: 'World Builder',        desc: 'Publish your first world',       test: (s) => s.worlds_published >= 1 },
  { key: 'sharpshooter',  name: 'Sharpshooter',         desc: 'Reach 50 total eliminations',    test: (s) => s.kills >= 50 },
  { key: 'veteran',       name: 'Arena Veteran',        desc: 'Play 25 matches',                test: (s) => s.matches_played >= 25 },
];

async function loadStats(playerId) {
  const { data } = await supabaseAdmin.from('player_stats').select('*').eq('player_id', playerId).maybeSingle();
  return data || { player_id: playerId, matches_played: 0, wins: 0, kills: 0, deaths: 0, ctf_captures: 0, worlds_published: 0, play_time_ms: 0 };
}

// Unlock any newly-earned achievements; returns the list of freshly unlocked keys.
async function evaluateAchievements(playerId, stats) {
  const { data: have } = await supabaseAdmin.from('player_achievements').select('achievement').eq('player_id', playerId);
  const owned = new Set((have || []).map(a => a.achievement));
  const fresh = ACHIEVEMENTS.filter(a => !owned.has(a.key) && a.test(stats));
  if (fresh.length) {
    await supabaseAdmin.from('player_achievements')
      .upsert(fresh.map(a => ({ player_id: playerId, achievement: a.key })), { onConflict: 'player_id,achievement' });
  }
  return fresh.map(a => ({ key: a.key, name: a.name, desc: a.desc }));
}

function setupStatsRoutes(app) {
  // ── Record a finished match: increments analytics + evaluates achievements ──
  // Body: { won, kills, deaths, captures, playTimeMs, playerName }
  app.post('/api/stats/match', verifyToken, async (req, res) => {
    try {
      const b = req.body || {};
      // Username lives in the `users` table, not auth metadata.
      let name = b.playerName;
      if (!name) {
        try {
          const { data } = await supabaseAdmin.from('users').select('username').eq('id', req.user.id).single();
          name = (data && data.username) || null;
        } catch (e) { /* fall through */ }
      }
      if (!name) name = (req.user.email || 'Player').split('@')[0];
      const prev = await loadStats(req.user.id);
      const next = {
        player_id: req.user.id, player_name: name,
        matches_played: (prev.matches_played || 0) + 1,
        wins:   (prev.wins || 0)   + (b.won ? 1 : 0),
        kills:  (prev.kills || 0)  + (parseInt(b.kills, 10)    || 0),
        deaths: (prev.deaths || 0) + (parseInt(b.deaths, 10)   || 0),
        ctf_captures: (prev.ctf_captures || 0) + (parseInt(b.captures, 10) || 0),
        worlds_published: prev.worlds_published || 0,
        play_time_ms: (prev.play_time_ms || 0) + (parseInt(b.playTimeMs, 10) || 0),
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabaseAdmin.from('player_stats').upsert(next, { onConflict: 'player_id' });
      if (error) throw error;
      const unlocked = await evaluateAchievements(req.user.id, next);
      res.json({ stats: next, unlocked });
    } catch (error) {
      console.error('Record match error:', error);
      res.status(500).json({ error: 'Failed to record match' });
    }
  });

  // ── Record a publish (for the World Builder achievement + analytics) ──
  app.post('/api/stats/publish', verifyToken, async (req, res) => {
    try {
      const prev = await loadStats(req.user.id);
      const next = { ...prev, player_id: req.user.id, worlds_published: (prev.worlds_published || 0) + 1, updated_at: new Date().toISOString() };
      delete next.created_at;
      const { error } = await supabaseAdmin.from('player_stats').upsert(next, { onConflict: 'player_id' });
      if (error) throw error;
      const unlocked = await evaluateAchievements(req.user.id, next);
      res.json({ unlocked });
    } catch (error) {
      console.error('Record publish error:', error);
      res.status(500).json({ error: 'Failed to record publish' });
    }
  });

  // ── The requester's stats + achievements (with locked ones for the UI) ──
  app.get('/api/stats/me', verifyToken, async (req, res) => {
    try {
      const stats = await loadStats(req.user.id);
      const { data: have } = await supabaseAdmin.from('player_achievements').select('achievement, unlocked_at').eq('player_id', req.user.id);
      const owned = new Map((have || []).map(a => [a.achievement, a.unlocked_at]));
      const winRate = stats.matches_played ? +((stats.wins / stats.matches_played) * 100).toFixed(0) : 0;
      res.json({
        stats: { ...stats, winRate },
        achievements: ACHIEVEMENTS.map(a => ({ key: a.key, name: a.name, desc: a.desc, unlocked: owned.has(a.key), unlockedAt: owned.get(a.key) || null })),
      });
    } catch (error) {
      console.error('Get stats error:', error);
      res.status(500).json({ error: 'Failed to load stats' });
    }
  });

  // ── Personal best per mode (optionally per world) ──────────────────
  app.get('/api/stats/personal-best/:mode', verifyToken, async (req, res) => {
    try {
      const { mode } = req.params;
      let q = supabaseAdmin.from('arena_results').select('score, duration, world_id, created_at')
        .eq('player_id', req.user.id).eq('mode', mode).order('score', { ascending: false }).limit(1);
      if (req.query.worldId) q = q.eq('world_id', req.query.worldId);
      const { data, error } = await q;
      if (error) throw error;
      res.json({ best: (data && data[0]) || null });
    } catch (error) {
      console.error('Personal best error:', error);
      res.status(500).json({ error: 'Failed to load personal best' });
    }
  });
}

module.exports = setupStatsRoutes;
module.exports.ACHIEVEMENTS = ACHIEVEMENTS;
