// ============================================================
// community-routes.js — Phase 3 Community Browse
// ------------------------------------------------------------
// Browse/search published worlds by other creators, favorite + rate them, and
// download (clone) a published world into your own sandbox. Backed by the
// worlds table + world_favorites/world_ratings (see server/sql/community.sql).
// Exports setupCommunityRoutes(app); registered in server.js.
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

function setupCommunityRoutes(app) {
  // ── Browse / search published worlds by other creators ──────────────
  // Query: q (name search), genre, difficulty, mode, sort (recent|rating|
  //        downloads|name), mine (include own; default false), limit, offset.
  app.get('/api/community/worlds', verifyToken, async (req, res) => {
    try {
      const { q, genre, difficulty, mode, sort = 'recent', mine } = req.query;
      const limit = Math.min(60, Math.max(1, parseInt(req.query.limit, 10) || 24));
      const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

      let query = supabaseAdmin
        .from('worlds')
        .select('id, world_name, creator_name, original_author, mode, genre, difficulty, description, download_count, rating_sum, rating_count, published_at, updated_at, creator_id', { count: 'exact' })
        .eq('is_published', true);

      if (!mine || mine === 'false') query = query.neq('creator_id', req.user.id);
      if (genre) query = query.eq('genre', genre);
      if (difficulty) query = query.eq('difficulty', difficulty);
      if (mode) query = query.eq('mode', mode);
      if (q) query = query.ilike('world_name', `%${q}%`);

      // Sorting. §B2 — rating now orders by the true AVERAGE (speedrunner.sql added the generated
      // rating_avg column), and Most-Played / Trending use play_count + last_played_at.
      if (sort === 'downloads')       query = query.order('download_count', { ascending: false });
      else if (sort === 'rating')     query = query.order('rating_avg', { ascending: false, nullsFirst: false });
      else if (sort === 'played' ||
               sort === 'mostplayed') query = query.order('play_count', { ascending: false });
      else if (sort === 'trending')   query = query.order('last_played_at', { ascending: false, nullsFirst: false }).order('play_count', { ascending: false });
      else if (sort === 'name')       query = query.order('world_name', { ascending: true });
      else                            query = query.order('published_at', { ascending: false, nullsFirst: false }).order('updated_at', { ascending: false });

      query = query.range(offset, offset + limit - 1);
      const { data, error, count } = await query;
      if (error) throw error;

      // Attach the requester's favorite flag + own rating for the returned page.
      const ids = (data || []).map(w => w.id);
      let favSet = new Set(), myRatings = {};
      if (ids.length) {
        const [{ data: favs }, { data: rates }] = await Promise.all([
          supabaseAdmin.from('world_favorites').select('world_id').eq('user_id', req.user.id).in('world_id', ids),
          supabaseAdmin.from('world_ratings').select('world_id, stars').eq('user_id', req.user.id).in('world_id', ids),
        ]);
        favSet = new Set((favs || []).map(f => f.world_id));
        for (const r of (rates || [])) myRatings[r.world_id] = r.stars;
      }
      const worlds = (data || []).map(w => ({
        id: w.id, name: w.world_name, author: w.original_author || w.creator_name,
        mode: w.mode, genre: w.genre || null, difficulty: w.difficulty || null,
        description: w.description || '', downloads: w.download_count || 0,
        avgRating: w.rating_count ? +(w.rating_sum / w.rating_count).toFixed(1) : 0,
        ratingCount: w.rating_count || 0,
        favorited: favSet.has(w.id), myRating: myRatings[w.id] || 0,
        publishedAt: w.published_at || w.updated_at,
      }));
      res.json({ worlds, total: count || worlds.length, limit, offset });
    } catch (error) {
      console.error('Community browse error:', error);
      res.status(500).json({ error: 'Failed to browse community worlds' });
    }
  });

  // ── Favorite / unfavorite a world ───────────────────────────────────
  app.post('/api/community/worlds/:worldId/favorite', verifyToken, async (req, res) => {
    try {
      const { worldId } = req.params;
      const favorite = req.body.favorite !== false; // default true
      if (favorite) {
        const { error } = await supabaseAdmin
          .from('world_favorites')
          .upsert({ user_id: req.user.id, world_id: worldId }, { onConflict: 'user_id,world_id' });
        if (error) throw error;
      } else {
        const { error } = await supabaseAdmin
          .from('world_favorites').delete()
          .eq('user_id', req.user.id).eq('world_id', worldId);
        if (error) throw error;
      }
      res.json({ favorited: favorite });
    } catch (error) {
      console.error('Favorite error:', error);
      res.status(500).json({ error: 'Failed to update favorite' });
    }
  });

  // ── List the requester's favorites ──────────────────────────────────
  app.get('/api/community/favorites', verifyToken, async (req, res) => {
    try {
      const { data: favs, error } = await supabaseAdmin
        .from('world_favorites').select('world_id').eq('user_id', req.user.id);
      if (error) throw error;
      const ids = (favs || []).map(f => f.world_id);
      if (!ids.length) return res.json({ worlds: [] });
      const { data: worlds, error: wErr } = await supabaseAdmin
        .from('worlds')
        .select('id, world_name, creator_name, original_author, mode, genre, difficulty, download_count, rating_sum, rating_count')
        .in('id', ids).eq('is_published', true);
      if (wErr) throw wErr;
      res.json({ worlds: (worlds || []).map(w => ({
        id: w.id, name: w.world_name, author: w.original_author || w.creator_name,
        mode: w.mode, genre: w.genre, difficulty: w.difficulty,
        downloads: w.download_count || 0, favorited: true,
        avgRating: w.rating_count ? +(w.rating_sum / w.rating_count).toFixed(1) : 0,
      })) });
    } catch (error) {
      console.error('Favorites list error:', error);
      res.status(500).json({ error: 'Failed to load favorites' });
    }
  });

  // ── Rate a world (1–5); upserts the requester's rating + updates rollups ──
  app.post('/api/community/worlds/:worldId/rate', verifyToken, async (req, res) => {
    try {
      const { worldId } = req.params;
      const stars = Math.min(5, Math.max(1, parseInt(req.body.stars, 10) || 0));
      if (!stars) return res.status(400).json({ error: 'stars must be 1–5' });

      // Previous rating (to adjust the rollup delta) then upsert.
      const { data: prev } = await supabaseAdmin
        .from('world_ratings').select('stars')
        .eq('user_id', req.user.id).eq('world_id', worldId).maybeSingle();

      const { error: upErr } = await supabaseAdmin
        .from('world_ratings')
        .upsert({ user_id: req.user.id, world_id: worldId, stars, updated_at: new Date().toISOString() }, { onConflict: 'user_id,world_id' });
      if (upErr) throw upErr;

      // Recompute rollups from the source of truth (robust vs. race conditions).
      const { data: all, error: aErr } = await supabaseAdmin
        .from('world_ratings').select('stars').eq('world_id', worldId);
      if (aErr) throw aErr;
      const sum = (all || []).reduce((s, r) => s + r.stars, 0);
      const count = (all || []).length;
      await supabaseAdmin.from('worlds').update({ rating_sum: sum, rating_count: count }).eq('id', worldId);

      res.json({ stars, avgRating: count ? +(sum / count).toFixed(1) : 0, ratingCount: count, wasNew: !prev });
    } catch (error) {
      console.error('Rate world error:', error);
      res.status(500).json({ error: 'Failed to rate world' });
    }
  });

  // ── Download (clone) a published world into the requester's sandbox ──
  app.post('/api/community/worlds/:worldId/download', verifyToken, async (req, res) => {
    try {
      const { worldId } = req.params;
      const { data: src, error: getErr } = await supabaseAdmin
        .from('worlds').select('*').eq('id', worldId).eq('is_published', true).single();
      if (getErr || !src) return res.status(404).json({ error: 'Published world not found' });

      // Requester's display name (for creator_name on the clone).
      const meta = req.user.user_metadata || {};
      const myName = meta.username || meta.display_name || (req.user.email || 'Player').split('@')[0];

      const { data: copy, error: copyErr } = await supabaseAdmin
        .from('worlds')
        .insert({
          world_name: `${src.world_name} (Downloaded)`,
          creator_id: req.user.id,
          creator_name: myName,
          original_author: src.original_author || src.creator_name, // preserve attribution
          mode: src.mode,
          world_data: src.world_data,
          description: src.description,
          genre: src.genre, difficulty: src.difficulty,
          is_published: false,
          parent_world_id: src.id,
          editors: [],
        })
        .select().single();
      if (copyErr) throw copyErr;

      // Bump the source's download counter (best-effort).
      await supabaseAdmin.from('worlds')
        .update({ download_count: (src.download_count || 0) + 1 }).eq('id', src.id);

      res.json({ world: copy, message: 'World downloaded to your sandbox' });
    } catch (error) {
      console.error('Download world error:', error);
      res.status(500).json({ error: 'Failed to download world' });
    }
  });
}

module.exports = setupCommunityRoutes;
