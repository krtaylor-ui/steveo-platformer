const { supabaseAdmin } = require('./supabase-client');

// Fixed owner of seeded default/system worlds (mirrors server.js).
const SYSTEM_USER_ID = '00000000-0000-4000-8000-000000000001';

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

module.exports = function setupGamesRoutes(app) {

  app.get('/api/worlds', verifyToken, async (req, res) => {
    try {
      const { mode } = req.query;

      if (!mode || !['NORMAL', 'PLATFORMER', 'SPEEDRUNNER'].includes(mode)) {
        return res.status(400).json({ error: 'Invalid or missing mode' });
      }

      // The new-game world dropdown = published worlds of this mode (system
      // defaults + community) PLUS the requesting player's OWN worlds of this
      // mode, regardless of publish state — so a creator can start a game from
      // their own sandbox build before (or without) publishing it. Filtering is
      // on the `mode` column, which is kept in sync with gameModeDefault for
      // sandbox worlds and is also set on the seeded system worlds.
      // Pull gameModeDefault as a cheap JSON sub-field so we can exclude Arena
      // worlds (they carry legacy mode='NORMAL' but are not a Normal-mode game).
      const cols = 'id, world_name, creator_name, mode, creator_id, created_at, gameModeDefault:world_data->>gameModeDefault';

      const [{ data: published, error: pErr }, { data: own, error: oErr }] = await Promise.all([
        supabaseAdmin.from('worlds').select(cols)
          .eq('mode', mode).eq('is_published', true)
          .order('created_at', { ascending: false }),
        supabaseAdmin.from('worlds').select(cols)
          .eq('mode', mode).eq('creator_id', req.user.id)
          .order('created_at', { ascending: false }),
      ]);
      if (pErr) throw pErr;
      if (oErr) throw oErr;

      // Ordering: System default(s) first (the canonical "Default" starting
      // world), then the player's own worlds, then other published/community
      // worlds. Dedupe by id across all three buckets.
      const pub = published || [];
      const sysDefaults = pub.filter(w => w.creator_id === SYSTEM_USER_ID);
      const community = pub.filter(w => w.creator_id !== SYSTEM_USER_ID);

      const seen = new Set();
      const worlds = [];
      for (const w of [...sysDefaults, ...(own || []), ...community]) {
        if (seen.has(w.id)) continue;
        if (w.gameModeDefault === 'ARN') continue; // Arena worlds only play via the Arena picker
        seen.add(w.id);
        worlds.push({
          id: w.id,
          world_name: w.world_name,
          creator_name: w.creator_name,
          mode: w.mode,
          mine: w.creator_id === req.user.id,
        });
      }

      res.json({ worlds, mode, count: worlds.length });
    } catch (error) {
      console.error('Get worlds error:', error);
      res.status(500).json({ error: 'Failed to get worlds' });
    }
  });

  app.get('/api/games', verifyToken, async (req, res) => {
    try {
      const { mode } = req.query;

      if (!mode || !['NORMAL', 'PLATFORMER', 'SPEEDRUNNER'].includes(mode)) {
        return res.status(400).json({ error: 'Invalid mode' });
      }

      const { data: games, error } = await supabaseAdmin
        .from('games')
        .select('*')
        .eq('player_id', req.user.id)
        .eq('mode', mode)
        .order('slot_number', { ascending: true });

      if (error) throw error;

      // Attach each game's world_name (games table only stores world_id).
      const worldIds = [...new Set(games.map(g => g.world_id).filter(Boolean))];
      if (worldIds.length) {
        const { data: worlds } = await supabaseAdmin
          .from('worlds')
          .select('id, world_name')
          .in('id', worldIds);
        const nameById = new Map((worlds || []).map(w => [w.id, w.world_name]));
        games.forEach(g => { g.world_name = nameById.get(g.world_id) || null; });
      }

      const slots = [null, null, null, null];
      games.forEach(game => {
        if (game.slot_number >= 0 && game.slot_number <= 3) {
          slots[game.slot_number] = game;
        }
      });

      res.json({ games: slots, mode });
    } catch (error) {
      console.error('Get games error:', error);
      res.status(500).json({ error: 'Failed to get games' });
    }
  });

  app.get('/api/games/:gameId', verifyToken, async (req, res) => {
    try {
      const { gameId } = req.params;

      const { data: game, error } = await supabaseAdmin
        .from('games')
        .select('*')
        .eq('id', gameId)
        .eq('player_id', req.user.id)
        .single();

      if (error || !game) {
        return res.status(404).json({ error: 'Game not found' });
      }

      res.json(game);
    } catch (error) {
      console.error('Get game error:', error);
      res.status(500).json({ error: 'Failed to get game' });
    }
  });

  app.post('/api/games/create', verifyToken, async (req, res) => {
    try {
      const { gameName, worldId, mode, slot } = req.body;

      if (!gameName || !worldId || !mode || slot === undefined) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      if (!['NORMAL', 'PLATFORMER', 'SPEEDRUNNER'].includes(mode)) {
        return res.status(400).json({ error: 'Invalid mode' });
      }

      if (slot < 0 || slot > 3) {
        return res.status(400).json({ error: 'Invalid slot (0-3)' });
      }

      const { data: existingGame } = await supabaseAdmin
        .from('games')
        .select('id')
        .eq('player_id', req.user.id)
        .eq('mode', mode)
        .eq('slot_number', slot)
        .single();

      if (existingGame) {
        return res.status(400).json({ error: 'Slot already occupied' });
      }

      const { data: world, error: worldError } = await supabaseAdmin
        .from('worlds')
        .select('world_data')
        .eq('id', worldId)
        .single();

      if (worldError || !world) {
        return res.status(404).json({ error: 'World not found' });
      }

      const { data: newGame, error: gameError } = await supabaseAdmin
        .from('games')
        .insert({
          player_id: req.user.id,
          world_id: worldId,
          mode,
          game_name: gameName,
          slot_number: slot,
          game_data: world.world_data,
          status: 'IN_PROGRESS',
        })
        .select()
        .single();

      // 23505 = unique_violation: the slot was taken between the pre-check and
      // the insert (e.g. a double-submit). Report it cleanly instead of as a 500.
      if (gameError?.code === '23505') {
        return res.status(409).json({ error: 'Slot already occupied' });
      }
      if (gameError) throw gameError;

      res.json(newGame);
    } catch (error) {
      console.error('Create game error:', error);
      res.status(500).json({ error: 'Failed to create game' });
    }
  });

  app.put('/api/games/:gameId/save', verifyToken, async (req, res) => {
    try {
      const { gameId } = req.params;
      const { gameData } = req.body;

      if (!gameData) {
        return res.status(400).json({ error: 'gameData required' });
      }

      const { data: game, error: updateError } = await supabaseAdmin
        .from('games')
        .update({
          game_data: gameData,
          last_played_at: new Date().toISOString(),
        })
        .eq('id', gameId)
        .eq('player_id', req.user.id)
        .select()
        .single();

      if (updateError) throw updateError;

      res.json({ message: 'Game saved', game });
    } catch (error) {
      console.error('Save game error:', error);
      res.status(500).json({ error: 'Failed to save game' });
    }
  });

  app.delete('/api/games/:gameId', verifyToken, async (req, res) => {
    try {
      const { gameId } = req.params;

      const { error } = await supabaseAdmin
        .from('games')
        .delete()
        .eq('id', gameId)
        .eq('player_id', req.user.id);

      if (error) throw error;

      res.json({ message: 'Game deleted' });
    } catch (error) {
      console.error('Delete game error:', error);
      res.status(500).json({ error: 'Failed to delete game' });
    }
  });

  app.post('/api/games/:gameId/copy', verifyToken, async (req, res) => {
    try {
      const { gameId } = req.params;
      const { targetSlot } = req.body;

      if (targetSlot === undefined || targetSlot < 0 || targetSlot > 3) {
        return res.status(400).json({ error: 'Invalid target slot' });
      }

      const { data: originalGame, error: getError } = await supabaseAdmin
        .from('games')
        .select('*')
        .eq('id', gameId)
        .eq('player_id', req.user.id)
        .single();

      if (getError || !originalGame) {
        return res.status(404).json({ error: 'Game not found' });
      }

      const { data: existingGame } = await supabaseAdmin
        .from('games')
        .select('id')
        .eq('player_id', req.user.id)
        .eq('mode', originalGame.mode)
        .eq('slot_number', targetSlot)
        .single();

      if (existingGame) {
        return res.status(400).json({ error: 'Target slot occupied' });
      }

      const { data: copiedGame, error: copyError } = await supabaseAdmin
        .from('games')
        .insert({
          player_id: req.user.id,
          world_id: originalGame.world_id,
          mode: originalGame.mode,
          game_name: `${originalGame.game_name} (Copy)`,
          slot_number: targetSlot,
          game_data: originalGame.game_data,
          status: 'IN_PROGRESS',
        })
        .select()
        .single();

      if (copyError) throw copyError;

      res.json(copiedGame);
    } catch (error) {
      console.error('Copy game error:', error);
      res.status(500).json({ error: 'Failed to copy game' });
    }
  });

  app.post('/api/games/:gameId/restart', verifyToken, async (req, res) => {
    try {
      const { gameId } = req.params;

      const { data: game, error: getError } = await supabaseAdmin
        .from('games')
        .select('world_id')
        .eq('id', gameId)
        .eq('player_id', req.user.id)
        .single();

      if (getError || !game) {
        return res.status(404).json({ error: 'Game not found' });
      }

      const { data: world, error: worldError } = await supabaseAdmin
        .from('worlds')
        .select('world_data')
        .eq('id', game.world_id)
        .single();

      if (worldError || !world) {
        return res.status(404).json({ error: 'World not found' });
      }

      const { data: restarted, error: restartError } = await supabaseAdmin
        .from('games')
        .update({
          game_data: world.world_data,
          status: 'IN_PROGRESS',
        })
        .eq('id', gameId)
        .eq('player_id', req.user.id)
        .select()
        .single();

      if (restartError) throw restartError;

      res.json({ message: 'Game restarted', game: restarted });
    } catch (error) {
      console.error('Restart game error:', error);
      res.status(500).json({ error: 'Failed to restart game' });
    }
  });

};
