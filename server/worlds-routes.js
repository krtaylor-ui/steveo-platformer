const { supabaseAdmin } = require('./supabase-client');

// Token verification — same contract as games-routes.js. Kept local so the two
// route modules stay independently mountable.
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

// A brand-new sandbox world stores only its dimensions — the game builds an
// empty level from these and the first save replaces this with a real grid.
// Avoids shipping a ~40k-cell zero grid in every create call.
const WORLD_W = 650;
const WORLD_H = 60;

// World configuration (width/height/default game mode) lives inside the
// world_data JSONB rather than in dedicated columns — same convention the
// editor already reads (data.worldWidth/worldHeight), so no schema migration.
const GAME_MODES = ['NRM', 'PLT', 'RUN', 'ARN'];
const WIDTH_MIN = 25, WIDTH_MAX = 2000;
const HEIGHT_MIN = 30, HEIGHT_MAX = 500;
// Arena worlds have fixed, non-editable dimensions (server-enforced).
const ARENA_W = 25, ARENA_H = 15;

// gameModeDefault (NRM/PLT/RUN) is the single source of truth for a world's
// game mode. The legacy `mode` column (NORMAL/PLATFORMER/SPEEDRUNNER) is kept
// in sync — derived from gameModeDefault — purely so the published-worlds
// catalog (/api/worlds?mode=) keeps working. Players only ever set the short code.
const MODE_LONG = { NRM: 'NORMAL', PLT: 'PLATFORMER', RUN: 'SPEEDRUNNER' };
const MODE_SHORT = { NORMAL: 'NRM', PLATFORMER: 'PLT', SPEEDRUNNER: 'RUN', SANDBOX: 'NRM' };
// Sandbox list filter values (lowercase) → gameModeDefault code.
const FILTER_TO_CODE = { normal: 'NRM', platformer: 'PLT', speedrunner: 'RUN', arena: 'ARN' };
const toCode = (m) => MODE_SHORT[String(m || '').toUpperCase()] || 'NRM';

// Normalize the client's movement config into the worldAdvSettings fields the
// game reads on load (Game._worldAdvSettings is Object.assign-ed from this).
function normalizeMovementConfig(config = {}) {
  const gravity    = Number.isFinite(+config.gravity)    ? +config.gravity    : 0.66;
  const jumpHeight = Number.isFinite(+config.jumpHeight) ? +config.jumpHeight : 3.5;
  return {
    physicsGravity:   Math.min(2, Math.max(0.1, gravity)),
    jumpHeightBlocks: Math.min(8, Math.max(0.5, jumpHeight)),
    airJumpEnabled:   !!config.airJumpEnabled,
    sprintEnabled:    config.sprintEnabled !== false,
  };
}

function emptyWorldData({ width = WORLD_W, height = WORLD_H, gameModeDefault = 'NRM', createdBy = 'Player', config = {} } = {}) {
  const movement = normalizeMovementConfig(config);
  // Arena worlds (Phase 3A.3): seed the chosen view type so the camera behaves
  // correctly from the first play; everything else uses the Arena settings tab's
  // flat-key defaults (applied client-side).
  if (gameModeDefault === 'ARN') {
    movement.arenaViewType = (config.arenaViewType === 'scrolling') ? 'scrolling' : 'single';
  }
  return {
    saveVersion: 2,
    isEmptySandbox: true,
    worldWidth: width,
    worldHeight: height,
    gameModeDefault,
    // Movement config lives in worldAdvSettings so it flows through the game's
    // load path (Object.assign(this._worldAdvSettings, data.worldAdvSettings)).
    worldAdvSettings: movement,
    metadata: {
      created: new Date().toISOString(),
      createdBy,
      editedBy: createdBy,
      config: movement,   // mirror for display / future tooling
    },
  };
}

module.exports = function setupWorldsRoutes(app) {

  // ── List sandbox worlds (paginated, filterable, sortable) ──────
  app.get('/api/worlds/sandbox', verifyToken, async (req, res) => {
    try {
      const { page = 0, filter = 'all', sort = 'newest' } = req.query;
      const pageSize = 50;
      const offset = parseInt(page) * pageSize;

      // A player's sandbox worlds are exactly the worlds they own — default /
      // system worlds belong to SYSTEM_USER_ID, never to a player. The list
      // filters on each world's game mode, which is the gameModeDefault code
      // (NRM/PLT/RUN) stored inside world_data — the single source of truth.
      let query = supabaseAdmin
        .from('worlds')
        .select('*', { count: 'exact' })
        .eq('creator_id', req.user.id);

      if (filter && filter !== 'all') {
        const code = FILTER_TO_CODE[String(filter).toLowerCase()];
        if (code) query = query.eq('world_data->>gameModeDefault', code);
      }

      if (sort === 'alphabetical') {
        query = query.order('world_name', { ascending: true });
      } else {
        query = query.order('created_at', { ascending: sort === 'oldest' });
      }

      query = query.range(offset, offset + pageSize - 1);

      const { data: worlds, count, error } = await query;
      if (error) throw error;

      res.json({
        worlds: worlds || [],
        page: parseInt(page),
        pageSize,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / pageSize),
      });
    } catch (error) {
      console.error('Get sandbox worlds error:', error);
      res.status(500).json({ error: 'Failed to get worlds' });
    }
  });

  // ── List the player's saved games available to import ──────────
  // worlds.parent_world_id is an FK into worlds(id), so it can't record the
  // source *game* of an import — there's no place to track import lineage.
  // Importing the same game twice is allowed (each makes its own world), so we
  // simply list every saved game the player has.
  app.get('/api/worlds/sandbox/imported', verifyToken, async (req, res) => {
    try {
      const { data: games, error } = await supabaseAdmin
        .from('games')
        .select('id, game_name, mode, last_played_at')
        .eq('player_id', req.user.id)
        .order('last_played_at', { ascending: false });

      if (error) throw error;

      res.json({
        games: (games || []).map(g => ({
          id: g.id,
          name: g.game_name,
          mode: g.mode,
          lastPlayed: g.last_played_at,
        })),
        count: (games || []).length,
      });
    } catch (error) {
      console.error('Get imported games error:', error);
      res.status(500).json({ error: 'Failed to get imported games' });
    }
  });

  // ── Create a new (empty) sandbox world ─────────────────────────
  app.post('/api/worlds/sandbox/create', verifyToken, async (req, res) => {
    try {
      const {
        worldName,
        description = '',
        worldWidth = WORLD_W,
        worldHeight = WORLD_H,
        gameModeDefault = 'NRM',
        config = {},
      } = req.body;

      if (!worldName || worldName.trim().length === 0) {
        return res.status(400).json({ error: 'World name required' });
      }
      if (!GAME_MODES.includes(gameModeDefault)) {
        return res.status(400).json({ error: 'Invalid game mode default' });
      }

      // Arena worlds (Phase 3A.3): single-screen presets or scrolling free-size.
      // Validate within a generous range (height floor 15 to allow the Small
      // 25×15 preset). Non-arena modes honor the normal range.
      const isArena = gameModeDefault === 'ARN';
      const effWidth  = worldWidth;
      const effHeight = worldHeight;
      const wMin = isArena ? 25 : WIDTH_MIN;
      const hMin = isArena ? 15 : HEIGHT_MIN;
      if (worldWidth < wMin || worldWidth > WIDTH_MAX) {
        return res.status(400).json({ error: `Width must be between ${wMin}-${WIDTH_MAX}` });
      }
      if (worldHeight < hMin || worldHeight > HEIGHT_MAX) {
        return res.status(400).json({ error: `Height must be between ${hMin}-${HEIGHT_MAX}` });
      }

      const createdBy = req.user.user_metadata?.username || 'Player';

      const { data: world, error } = await supabaseAdmin
        .from('worlds')
        .insert({
          world_name: worldName.trim(),
          creator_id: req.user.id,
          creator_name: createdBy,
          // Legacy `mode` column only feeds the published catalog (/api/worlds?mode=),
          // which arena doesn't use; ARN has no long-name so it falls back to a
          // known-valid value. Arena-ness lives in world_data.gameModeDefault.
          mode: MODE_LONG[gameModeDefault] || 'NORMAL',
          world_data: emptyWorldData({ width: effWidth, height: effHeight, gameModeDefault, createdBy, config }),
          description: description.trim(),
          is_published: false,
          editors: [],
        })
        .select()
        .single();

      if (error) throw error;
      res.json(world);
    } catch (error) {
      console.error('Create world error:', error);
      res.status(500).json({ error: 'Failed to create world' });
    }
  });

  // ── Import a saved game as a sandbox world ─────────────────────
  app.post('/api/worlds/sandbox/import-game', verifyToken, async (req, res) => {
    try {
      const { gameId } = req.body;
      if (!gameId) return res.status(400).json({ error: 'gameId required' });

      const { data: game, error: gameError } = await supabaseAdmin
        .from('games')
        .select('*')
        .eq('id', gameId)
        .eq('player_id', req.user.id)
        .single();

      if (gameError || !game) {
        return res.status(404).json({ error: 'Game not found' });
      }

      // The imported world's game mode is auto-set from the source game's mode.
      const gameModeDefault = toCode(game.mode);
      const world_data = { ...(game.game_data || {}), gameModeDefault };

      const { data: world, error: worldError } = await supabaseAdmin
        .from('worlds')
        .insert({
          world_name: `${game.game_name} (imported)`,
          creator_id: req.user.id,
          creator_name: req.user.user_metadata?.username || 'Player',
          mode: MODE_LONG[gameModeDefault], // derived from gameModeDefault
          world_data,
          description: `Imported from ${game.mode} mode save`,
          is_published: false,
          editors: [],
        })
        .select()
        .single();

      if (worldError) throw worldError;
      res.json(world);
    } catch (error) {
      console.error('Import game error:', error);
      res.status(500).json({ error: 'Failed to import game' });
    }
  });

  // ── Import a world from an uploaded JSON file ──────────────────
  // Accepts an exported world file (or a bare world_data blob). The world is
  // always created as a SANDBOX world; its game_mode_default is recorded inside
  // world_data. Sandbox imports default the mode to NRM, so a file authored for
  // PLT/RUN is flagged as a mode conflict (the client warns + confirms first).
  app.post('/api/worlds/sandbox/import-file', verifyToken, async (req, res) => {
    try {
      const { fileData, requestedMode = 'NRM' } = req.body;
      if (!fileData) return res.status(400).json({ error: 'No file data provided' });

      let parsed;
      try {
        parsed = typeof fileData === 'string' ? JSON.parse(fileData) : fileData;
      } catch (err) {
        return res.status(400).json({ error: 'Invalid JSON file' });
      }

      // Export files wrap the grid in `world_data`; tolerate a bare blob too.
      const rawWorldData = parsed.world_data || parsed;
      const worldName = parsed.world_name || 'Imported World';
      const description = parsed.description || '';
      const fileMode = parsed.game_mode_default || rawWorldData.gameModeDefault || 'NRM';
      const worldWidth = parsed.world_width || rawWorldData.worldWidth || WORLD_W;
      const worldHeight = parsed.world_height || rawWorldData.worldHeight || WORLD_H;

      if (!GAME_MODES.includes(requestedMode)) {
        return res.status(400).json({ error: 'Invalid requested mode' });
      }

      // Sandbox imports adopt the requested mode (NRM by default); a non-sandbox
      // target would keep its own mode. modeConflict surfaces the mismatch.
      const modeConflict = fileMode !== requestedMode;
      const finalMode = requestedMode;
      const editedBy = req.user.user_metadata?.username || 'Player';

      const { data: world, error } = await supabaseAdmin
        .from('worlds')
        .insert({
          world_name: worldName,
          creator_id: req.user.id,
          creator_name: editedBy,
          mode: MODE_LONG[finalMode] || 'NORMAL', // derived from gameModeDefault
          world_data: {
            ...rawWorldData,
            worldWidth,
            worldHeight,
            gameModeDefault: finalMode,
            metadata: {
              ...(rawWorldData.metadata || {}),
              importedFrom: parsed.world_name || 'file',
              importedDate: new Date().toISOString(),
              createdBy: parsed.created_by || rawWorldData.metadata?.createdBy || 'Unknown',
              editedBy,
              modeConflict,
            },
          },
          description,
          is_published: false,
          editors: [],
        })
        .select()
        .single();

      if (error) throw error;

      res.json({ world, modeConflict, fileMode, requestedMode, finalMode });
    } catch (error) {
      console.error('Import file error:', error);
      res.status(500).json({ error: 'Failed to import file' });
    }
  });

  // ── Export a world as a downloadable JSON file ─────────────────
  app.get('/api/worlds/sandbox/:worldId/export', verifyToken, async (req, res) => {
    try {
      const { data: world, error } = await supabaseAdmin
        .from('worlds')
        .select('*')
        .eq('id', req.params.worldId)
        .eq('creator_id', req.user.id)
        .single();

      if (error || !world) return res.status(404).json({ error: 'World not found' });

      const wd = world.world_data || {};
      const mode = wd.gameModeDefault || 'NRM';

      const exportData = {
        world_name: world.world_name,
        description: world.description,
        world_width: wd.worldWidth || WORLD_W,
        world_height: wd.worldHeight || WORLD_H,
        game_mode_default: mode,
        world_data: world.world_data,
        created_by: world.creator_name,
        created_at: world.created_at,
        updated_at: world.updated_at,
        editors: world.editors,
      };

      // Worldname_MODE_YYYY-MM-DD.json — strip characters unsafe in filenames.
      const safeName = String(world.world_name).replace(/\s+/g, '_').replace(/[^\w\-]/g, '');
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `${safeName || 'world'}_${mode}_${dateStr}.json`;

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.json(exportData);
    } catch (error) {
      console.error('Export world error:', error);
      res.status(500).json({ error: 'Failed to export world' });
    }
  });

  // ── Get a single world ─────────────────────────────────────────
  app.get('/api/worlds/sandbox/:worldId', verifyToken, async (req, res) => {
    try {
      const { data: world, error } = await supabaseAdmin
        .from('worlds')
        .select('*')
        .eq('id', req.params.worldId)
        .eq('creator_id', req.user.id)
        .single();

      if (error || !world) return res.status(404).json({ error: 'World not found' });
      res.json(world);
    } catch (error) {
      console.error('Get world error:', error);
      res.status(500).json({ error: 'Failed to get world' });
    }
  });

  // ── Update / save a world ──────────────────────────────────────
  app.put('/api/worlds/sandbox/:worldId', verifyToken, async (req, res) => {
    try {
      const { worldData, worldName, description, gameModeDefault } = req.body;
      if (!worldData) return res.status(400).json({ error: 'worldData required' });

      // GAME_STATE.serialize() does NOT emit gameModeDefault, so a plain save
      // would wipe it. Preserve the world's existing mode (or take an explicit
      // override from the body, for a future in-game "Save World" mode picker).
      const { data: prev } = await supabaseAdmin
        .from('worlds')
        .select('world_data')
        .eq('id', req.params.worldId)
        .eq('creator_id', req.user.id)
        .single();

      let finalMode = gameModeDefault || worldData.gameModeDefault || prev?.world_data?.gameModeDefault || 'NRM';
      if (!GAME_MODES.includes(finalMode)) finalMode = 'NRM';

      const mergedData = { ...worldData, gameModeDefault: finalMode };
      // Dimensions: serialize emits these, but fall back to the prior values.
      if (mergedData.worldWidth == null) mergedData.worldWidth = prev?.world_data?.worldWidth || WORLD_W;
      if (mergedData.worldHeight == null) mergedData.worldHeight = prev?.world_data?.worldHeight || WORLD_H;

      // Only update fields that were actually supplied.
      const patch = {
        world_data: mergedData,
        mode: MODE_LONG[finalMode] || 'NORMAL', // keep the derived column in sync
        updated_at: new Date().toISOString(),
      };
      if (worldName !== undefined) patch.world_name = worldName;
      if (description !== undefined) patch.description = description;

      const { data: world, error } = await supabaseAdmin
        .from('worlds')
        .update(patch)
        .eq('id', req.params.worldId)
        .eq('creator_id', req.user.id)
        .select()
        .single();

      if (error) throw error;
      res.json({ message: 'World saved', world });
    } catch (error) {
      console.error('Save world error:', error);
      res.status(500).json({ error: 'Failed to save world' });
    }
  });

  // ── Change a world's game mode (gameModeDefault) ───────────────
  // Lightweight metadata update for the world-card mode dropdown — no full
  // world_data round-trip. Keeps the derived `mode` column in sync.
  app.post('/api/worlds/sandbox/:worldId/mode', verifyToken, async (req, res) => {
    try {
      const { gameModeDefault } = req.body;
      if (!GAME_MODES.includes(gameModeDefault)) {
        return res.status(400).json({ error: 'Invalid game mode' });
      }

      const { data: prev, error: getErr } = await supabaseAdmin
        .from('worlds')
        .select('world_data')
        .eq('id', req.params.worldId)
        .eq('creator_id', req.user.id)
        .single();

      if (getErr || !prev) return res.status(404).json({ error: 'World not found' });

      const world_data = { ...(prev.world_data || {}), gameModeDefault };

      const { data: world, error } = await supabaseAdmin
        .from('worlds')
        .update({ world_data, mode: MODE_LONG[gameModeDefault] || 'NORMAL', updated_at: new Date().toISOString() })
        .eq('id', req.params.worldId)
        .eq('creator_id', req.user.id)
        .select()
        .single();

      if (error) throw error;
      res.json({ message: 'Game mode updated', world });
    } catch (error) {
      console.error('Change mode error:', error);
      res.status(500).json({ error: 'Failed to change game mode' });
    }
  });

  // ── Publish / unpublish (max 2 published per player) ───────────
  app.post('/api/worlds/sandbox/:worldId/publish', verifyToken, async (req, res) => {
    try {
      const { worldId } = req.params;
      const { isPublished } = req.body;

      if (isPublished) {
        const { data: published, error: checkError } = await supabaseAdmin
          .from('worlds')
          .select('id')
          .eq('creator_id', req.user.id)
          .eq('is_published', true);

        if (checkError) throw checkError;

        // Re-publishing an already-published world shouldn't count against itself.
        const others = (published || []).filter(w => w.id !== worldId);
        if (others.length >= 2) {
          return res.status(400).json({ error: 'Max 2 published worlds allowed' });
        }
      }

      const { data: world, error } = await supabaseAdmin
        .from('worlds')
        .update({ is_published: isPublished })
        .eq('id', worldId)
        .eq('creator_id', req.user.id)
        .select()
        .single();

      if (error) throw error;
      res.json({ message: isPublished ? 'World published' : 'World unpublished', world });
    } catch (error) {
      console.error('Publish world error:', error);
      res.status(500).json({ error: 'Failed to publish world' });
    }
  });

  // ── Copy a world ───────────────────────────────────────────────
  app.post('/api/worlds/sandbox/:worldId/copy', verifyToken, async (req, res) => {
    try {
      const { worldId } = req.params;
      const { newName } = req.body;

      const { data: original, error: getError } = await supabaseAdmin
        .from('worlds')
        .select('*')
        .eq('id', worldId)
        .eq('creator_id', req.user.id)
        .single();

      if (getError || !original) return res.status(404).json({ error: 'World not found' });

      const { data: copy, error: copyError } = await supabaseAdmin
        .from('worlds')
        .insert({
          world_name: newName || `${original.world_name} (Copy)`,
          creator_id: req.user.id,
          creator_name: original.creator_name,
          mode: original.mode, // preserve the original's gameplay style
          world_data: original.world_data,
          description: original.description,
          is_published: false,
          parent_world_id: original.id,
          editors: [],
        })
        .select()
        .single();

      if (copyError) throw copyError;
      res.json(copy);
    } catch (error) {
      console.error('Copy world error:', error);
      res.status(500).json({ error: 'Failed to copy world' });
    }
  });

  // ── Delete a world ─────────────────────────────────────────────
  app.delete('/api/worlds/sandbox/:worldId', verifyToken, async (req, res) => {
    try {
      const { error } = await supabaseAdmin
        .from('worlds')
        .delete()
        .eq('id', req.params.worldId)
        .eq('creator_id', req.user.id);

      if (error) throw error;
      res.json({ message: 'World deleted' });
    } catch (error) {
      console.error('Delete world error:', error);
      res.status(500).json({ error: 'Failed to delete world' });
    }
  });

};
