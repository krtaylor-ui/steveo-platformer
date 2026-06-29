const { supabaseAdmin } = require('./supabase-client');

// Same token-verification contract as the other route modules.
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

// ── game_sessions schema notes (verified against the live DB) ────────────────
//   players      uuid[]  — a NATIVE Postgres array; pass JS arrays directly,
//                          never JSON.stringify/parse it.
//   status       CHECK   — only 'ACTIVE' | 'COMPLETED' allowed (default ACTIVE).
//                          There is NO 'WAITING_FOR_PLAYERS'; a live session that
//                          isn't full yet IS the lobby/joinable state.
//   visibility   CHECK   — only 'PRIVATE' | 'PUBLIC' (default PRIVATE). No
//                          'FRIENDS' value, so discoverable games use 'PUBLIC'
//                          (discovery is friendship-gated regardless).
//   world_state  NOT NULL jsonb. There is NO updated_at column — never write it.

// Accepted-friend user ids for a given user.
async function acceptedFriendIds(userId) {
  const { data, error } = await supabaseAdmin
    .from('friendships')
    .select('user_id_1, user_id_2')
    .eq('status', 'ACCEPTED')
    .or(`user_id_1.eq.${userId},user_id_2.eq.${userId}`);
  if (error) throw error;
  return (data || []).map(f => (f.user_id_1 === userId ? f.user_id_2 : f.user_id_1));
}

module.exports = function setupGameSessionsRoutes(app) {

  // ── POST /api/game-sessions/create ─────────────────────────────────────────
  // Creator opens a session (lobby). status=ACTIVE, visibility=PUBLIC so friends
  // can discover it; the creator is the first entry in players[].
  app.post('/api/game-sessions/create', verifyToken, async (req, res) => {
    try {
      const { worldId } = req.body;
      const maxPlayers = Number(req.body.maxPlayers ?? 4);

      if (!worldId) return res.status(400).json({ error: 'worldId required' });
      if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 4) {
        return res.status(400).json({ error: 'maxPlayers must be 2-4' });
      }

      const { data: world, error: worldError } = await supabaseAdmin
        .from('worlds')
        .select('id, world_name, world_data, mode')
        .eq('id', worldId)
        .maybeSingle();

      if (worldError) throw worldError;
      if (!world) return res.status(404).json({ error: 'World not found' });

      const { data: session, error } = await supabaseAdmin
        .from('game_sessions')
        .insert({
          world_id: worldId,
          creator_id: req.user.id,
          players: [req.user.id],          // native uuid[]
          max_players: maxPlayers,
          visibility: 'PUBLIC',
          status: 'ACTIVE',
          world_state: world.world_data,
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      res.json({ ...session, world_name: world.world_name, mode: world.mode });
    } catch (error) {
      console.error('Create session error:', error);
      res.status(500).json({ error: 'Failed to create session' });
    }
  });

  // ── GET /api/game-sessions/:sessionId ──────────────────────────────────────
  // Session details enriched with world name + player usernames.
  app.get('/api/game-sessions/:sessionId', verifyToken, async (req, res) => {
    try {
      const session = await loadSession(req.params.sessionId);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      res.json(await enrich(session));
    } catch (error) {
      console.error('Get session error:', error);
      res.status(500).json({ error: 'Failed to get session' });
    }
  });

  // ── POST /api/game-sessions/:sessionId/join ────────────────────────────────
  app.post('/api/game-sessions/:sessionId/join', verifyToken, async (req, res) => {
    try {
      const session = await loadSession(req.params.sessionId);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      if (session.status !== 'ACTIVE') {
        return res.status(400).json({ error: 'Session is no longer open' });
      }

      const players = session.players || [];
      if (players.includes(req.user.id)) {
        // Idempotent — already a member (e.g. rejoining the lobby).
        return res.json(await enrich(session));
      }
      if (players.length >= session.max_players) {
        return res.status(400).json({ error: 'Session is full' });
      }

      const updated = await updatePlayers(session.id, [...players, req.user.id]);
      res.json(await enrich(updated));
    } catch (error) {
      console.error('Join session error:', error);
      res.status(500).json({ error: 'Failed to join session' });
    }
  });

  // ── POST /api/game-sessions/:sessionId/leave ───────────────────────────────
  // Remove the caller from the lobby. If nobody is left, the session is ended.
  app.post('/api/game-sessions/:sessionId/leave', verifyToken, async (req, res) => {
    try {
      const session = await loadSession(req.params.sessionId);
      if (!session) return res.status(404).json({ error: 'Session not found' });

      const remaining = (session.players || []).filter(id => id !== req.user.id);

      if (remaining.length === 0) {
        await supabaseAdmin
          .from('game_sessions')
          .update({ status: 'COMPLETED', ended_at: new Date().toISOString() })
          .eq('id', session.id);
        return res.json({ message: 'Left session; session ended (empty)' });
      }

      const updated = await updatePlayers(session.id, remaining);
      res.json(await enrich(updated));
    } catch (error) {
      console.error('Leave session error:', error);
      res.status(500).json({ error: 'Failed to leave session' });
    }
  });

  // ── POST /api/game-sessions/:sessionId/save ────────────────────────────────
  // Persist the live world during play. Members only. (No updated_at column.)
  app.post('/api/game-sessions/:sessionId/save', verifyToken, async (req, res) => {
    try {
      const { worldState } = req.body;
      if (!worldState) return res.status(400).json({ error: 'worldState required' });

      const session = await loadSession(req.params.sessionId);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      if (!(session.players || []).includes(req.user.id)) {
        return res.status(403).json({ error: 'Not a member of this session' });
      }

      const { data: saved, error } = await supabaseAdmin
        .from('game_sessions')
        .update({ world_state: worldState, current_state: worldState })
        .eq('id', session.id)
        .select()
        .single();

      if (error) throw error;
      res.json({ message: 'Session saved', session: saved });
    } catch (error) {
      console.error('Save session error:', error);
      res.status(500).json({ error: 'Failed to save session' });
    }
  });

  // ── POST /api/game-sessions/:sessionId/end ─────────────────────────────────
  app.post('/api/game-sessions/:sessionId/end', verifyToken, async (req, res) => {
    try {
      const { worldState } = req.body;
      const session = await loadSession(req.params.sessionId);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      if (!(session.players || []).includes(req.user.id)) {
        return res.status(403).json({ error: 'Not a member of this session' });
      }

      const patch = { status: 'COMPLETED', ended_at: new Date().toISOString() };
      if (worldState) { patch.world_state = worldState; patch.current_state = worldState; }

      const { data: ended, error } = await supabaseAdmin
        .from('game_sessions')
        .update(patch)
        .eq('id', session.id)
        .select()
        .single();

      if (error) throw error;
      res.json({ message: 'Session ended', session: ended });
    } catch (error) {
      console.error('End session error:', error);
      res.status(500).json({ error: 'Failed to end session' });
    }
  });

  // ── GET /api/friends/:userId/active-games ──────────────────────────────────
  // Joinable ACTIVE sessions created by the caller's accepted friends.
  app.get('/api/friends/:userId/active-games', verifyToken, async (req, res) => {
    try {
      if (req.params.userId !== req.user.id) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      const friendIds = await acceptedFriendIds(req.user.id);
      if (!friendIds.length) return res.json({ sessions: [] });

      const { data: sessions, error } = await supabaseAdmin
        .from('game_sessions')
        .select('id, world_id, creator_id, players, max_players, status, visibility, created_at')
        .in('creator_id', friendIds)
        .eq('status', 'ACTIVE')
        .neq('visibility', 'PRIVATE')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Enrich with world name + creator username in two batched lookups.
      const worldIds = [...new Set(sessions.map(s => s.world_id))];
      const creatorIds = [...new Set(sessions.map(s => s.creator_id))];

      const [{ data: worlds }, { data: users }] = await Promise.all([
        worldIds.length
          ? supabaseAdmin.from('worlds').select('id, world_name').in('id', worldIds)
          : Promise.resolve({ data: [] }),
        creatorIds.length
          ? supabaseAdmin.from('users').select('id, username').in('id', creatorIds)
          : Promise.resolve({ data: [] }),
      ]);
      const worldName = new Map((worlds || []).map(w => [w.id, w.world_name]));
      const userName = new Map((users || []).map(u => [u.id, u.username]));

      const result = sessions.map(s => ({
        id: s.id,
        world_id: s.world_id,
        world_name: worldName.get(s.world_id) || 'Unknown World',
        creator_id: s.creator_id,
        creator_name: userName.get(s.creator_id) || 'Friend',
        player_count: (s.players || []).length,
        max_players: s.max_players,
        is_full: (s.players || []).length >= s.max_players,
        status: s.status,
      }));

      res.json({ sessions: result });
    } catch (error) {
      console.error('Get friend games error:', error);
      res.status(500).json({ error: 'Failed to get friend games' });
    }
  });

  // ── shared helpers ───────────────────────────────────────────────────────
  async function loadSession(id) {
    const { data, error } = await supabaseAdmin
      .from('game_sessions')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async function updatePlayers(id, players) {
    const { data, error } = await supabaseAdmin
      .from('game_sessions')
      .update({ players })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // Attach world_name + per-player {id, username} for lobby rendering.
  async function enrich(session) {
    const [{ data: world }, { data: users }] = await Promise.all([
      supabaseAdmin.from('worlds').select('world_name, mode').eq('id', session.world_id).maybeSingle(),
      (session.players || []).length
        ? supabaseAdmin.from('users').select('id, username').in('id', session.players)
        : Promise.resolve({ data: [] }),
    ]);
    const nameById = new Map((users || []).map(u => [u.id, u.username]));
    return {
      ...session,
      world_name: world?.world_name || 'Unknown World',
      mode: world?.mode || 'NORMAL',
      player_list: (session.players || []).map(id => ({ id, username: nameById.get(id) || 'Player' })),
    };
  }

};
