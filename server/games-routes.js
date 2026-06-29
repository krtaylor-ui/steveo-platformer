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

module.exports = function setupGamesRoutes(app) {

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
