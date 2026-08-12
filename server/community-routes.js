// ============================================================
// community-routes.js — Phase 3 Community Browse
// ------------------------------------------------------------
// Browse/search published worlds by other creators, favorite + rate them, and
// download (clone) a published world into your own sandbox. Backed by the
// worlds table + world_favorites/world_ratings (see server/sql/community.sql).
// Exports setupCommunityRoutes(app); registered in server.js.
// ============================================================

const { supabaseAdmin } = require('./supabase-client');
const MODERATION = require('../js/moderation.js');   // §B6 — tag-request names are player-visible

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
      const { q, genre, difficulty, mode, sort = 'recent', mine, tag, creator } = req.query;
      const limit = Math.min(60, Math.max(1, parseInt(req.query.limit, 10) || 24));
      const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

      // §B — expose tags / thumbnail / play_count (speedrunner.sql columns) so the storefront can filter +
      // render them. Downloadable is surfaced too so the download flow can honor it.
      let query = supabaseAdmin
        .from('worlds')
        .select('id, world_name, creator_name, original_author, mode, genre, difficulty, description, download_count, rating_sum, rating_count, play_count, tags, thumbnail, downloadable, published_at, updated_at, creator_id', { count: 'exact' })
        .eq('is_published', true);

      // §B3 creator profile — when browsing a specific creator, show THEIR worlds (incl. yourself);
      // otherwise the community view hides your own.
      if (creator) query = query.eq('creator_id', creator);
      else if (!mine || mine === 'false') query = query.neq('creator_id', req.user.id);
      if (genre) query = query.eq('genre', genre);
      if (difficulty) query = query.eq('difficulty', difficulty);
      if (mode) query = query.eq('mode', mode);
      if (tag) query = query.contains('tags', [tag]);              // §B3 tag filter (GIN-indexed array)
      if (q) query = query.ilike('world_name', `%${q}%`);          // §B2 search-as-you-type

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
      let favSet = new Set(), addedSet = new Set(), myRatings = {};
      if (ids.length) {
        const [{ data: favs }, { data: rates }] = await Promise.all([
          supabaseAdmin.from('world_favorites').select('world_id').eq('user_id', req.user.id).in('world_id', ids),
          supabaseAdmin.from('world_ratings').select('world_id, stars').eq('user_id', req.user.id).in('world_id', ids),
        ]);
        favSet = new Set((favs || []).map(f => f.world_id));
        for (const r of (rates || [])) myRatings[r.world_id] = r.stars;
        // §SR Hub — "Added to my levels". Resilient: if sr_level_hub.sql isn't applied yet, don't break browse.
        try {
          const { data: adds } = await supabaseAdmin.from('world_added').select('world_id').eq('user_id', req.user.id).in('world_id', ids);
          addedSet = new Set((adds || []).map(a => a.world_id));
        } catch (_) { /* table not present yet */ }
      }
      const worlds = (data || []).map(w => ({
        id: w.id, name: w.world_name, author: w.original_author || w.creator_name, creatorId: w.creator_id,
        mode: w.mode, genre: w.genre || null, difficulty: w.difficulty || null,
        description: w.description || '', downloads: w.download_count || 0, plays: w.play_count || 0,
        avgRating: w.rating_count ? +(w.rating_sum / w.rating_count).toFixed(1) : 0,
        ratingCount: w.rating_count || 0, tags: w.tags || [], thumbnail: w.thumbnail || null,
        downloadable: w.downloadable !== false,
        favorited: favSet.has(w.id), added: addedSet.has(w.id), myRating: myRatings[w.id] || 0,
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
  // ── §A3 — read-only fetch of a published world's data so it can be PLAYED straight from the Speed
  //    Runner landing "Community" tab, without cloning it into the player's sandbox (that's Download).
  //    Best-effort bumps the play counter (Most-Played / Trending). No downloadable gate — playing isn't
  //    taking a copy. Auth kept so it matches the rest of the community surface.
  app.get('/api/community/worlds/:worldId/play', verifyToken, async (req, res) => {
    try {
      const { data: src, error } = await supabaseAdmin
        .from('worlds').select('id, world_name, world_data, mode, creator_name, original_author, play_count')
        .eq('id', req.params.worldId).eq('is_published', true).single();
      if (error || !src) return res.status(404).json({ error: 'Published world not found' });
      supabaseAdmin.from('worlds')
        .update({ play_count: (src.play_count || 0) + 1, last_played_at: new Date().toISOString() })
        .eq('id', src.id).then(() => {}, () => {});   // fire-and-forget
      res.json({ id: src.id, worldName: src.world_name, mode: src.mode,
        author: src.original_author || src.creator_name, worldData: src.world_data });
    } catch (e) {
      console.error('Community play error:', e);
      res.status(500).json({ error: 'Failed to load world' });
    }
  });

  app.post('/api/community/worlds/:worldId/download', verifyToken, async (req, res) => {
    try {
      const { worldId } = req.params;
      const { data: src, error: getErr } = await supabaseAdmin
        .from('worlds').select('*').eq('id', worldId).eq('is_published', true).single();
      if (getErr || !src) return res.status(404).json({ error: 'Published world not found' });
      // §B4 — honor the creator's Downloadable opt-in (default allow for legacy rows without the column).
      if (src.downloadable === false) return res.status(403).json({ error: 'The creator has not made this level downloadable.' });

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
          downloadable: false,   // §B4 — a downloaded copy isn't re-shareable unless the new owner opts in
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

  // ── §B3 Tags — the admin-curated tag list, a creator setting their world's tags, and a "request a
  //    new tag" queue for admin review. Needs speedrunner.sql (tags/system_tags/tag_requests). ──
  app.get('/api/community/tags', verifyToken, async (req, res) => {
    try {
      const { data } = await supabaseAdmin.from('system_tags').select('name').order('name');
      res.json({ tags: (data || []).map(t => t.name) });
    } catch (e) { res.status(500).json({ error: 'Failed to load tags' }); }
  });

  app.post('/api/worlds/:worldId/tags', verifyToken, async (req, res) => {
    try {
      const tags = Array.isArray(req.body.tags) ? req.body.tags.slice(0, 8).map(String) : [];
      // Only accept tags that exist in the curated system list.
      const { data: sys } = await supabaseAdmin.from('system_tags').select('name');
      const allow = new Set((sys || []).map(t => t.name));
      const clean = tags.filter(t => allow.has(t));
      const rejected = tags.filter(t => !allow.has(t));
      const { data, error } = await supabaseAdmin.from('worlds')
        .update({ tags: clean }).eq('id', req.params.worldId).eq('creator_id', req.user.id)
        .select('id, tags').single();
      if (error) throw error;
      // Report any non-curated tags that were dropped so the UI can explain instead of them vanishing.
      res.json({ tags: (data && data.tags) || [], rejected, note: rejected.length ? 'Some tags are not in the curated list and were not added. Use "Request a tag" for new ones.' : undefined });
    } catch (e) { console.error('set tags error:', e); res.status(500).json({ error: 'Failed to set tags' }); }
  });

  app.post('/api/community/tag-requests', verifyToken, async (req, res) => {
    try {
      const name = String(req.body.name || '').trim().slice(0, 30);
      if (!name) return res.status(400).json({ error: 'Tag name required' });
      const m = MODERATION.check(name, 'tag');
      if (!m.ok) return res.status(400).json({ error: m.reason });
      const { error } = await supabaseAdmin.from('tag_requests').insert({ requested_by: req.user.id, name });
      if (error) throw error;
      res.json({ requested: true });
    } catch (e) { res.status(500).json({ error: 'Failed to submit tag request' }); }
  });

  // ── §B2 Creator mini-profile — display name + a few stats + their published worlds. ──
  app.get('/api/community/creator/:creatorId', verifyToken, async (req, res) => {
    try {
      const cid = req.params.creatorId;
      const { data: user } = await supabaseAdmin.from('users').select('username, avatar_color').eq('id', cid).single();
      const { data: worlds } = await supabaseAdmin.from('worlds')
        .select('id, world_name, mode, download_count, play_count, rating_avg', { count: 'exact' })
        .eq('creator_id', cid).eq('is_published', true).order('published_at', { ascending: false });
      const totalDownloads = (worlds || []).reduce((a, w) => a + (w.download_count || 0), 0);
      const totalPlays = (worlds || []).reduce((a, w) => a + (w.play_count || 0), 0);
      res.json({
        name: (user && user.username) || 'Creator', color: (user && user.avatar_color) || '#888',
        published: (worlds || []).length, totalDownloads, totalPlays,
        worlds: (worlds || []).map(w => ({ id: w.id, name: w.world_name, mode: w.mode, downloads: w.download_count || 0, plays: w.play_count || 0, avgRating: w.rating_avg || 0 })),
      });
    } catch (e) { console.error('creator profile error:', e); res.status(500).json({ error: 'Failed to load creator' }); }
  });

  // ── §B5 Community-Nominated Picks — the current cycle's featured worlds (admin can regenerate from
  //    trending). Simple, read-mostly: top trending published worlds this cycle. ──
  app.get('/api/community/picks', verifyToken, async (req, res) => {
    try {
      const { data } = await supabaseAdmin.from('worlds')
        .select('id, world_name, creator_name, original_author, mode, rating_avg, play_count, thumbnail')
        .eq('is_published', true).order('play_count', { ascending: false }).limit(6);
      res.json({ picks: (data || []).map(w => ({ id: w.id, name: w.world_name, author: w.original_author || w.creator_name, mode: w.mode, avgRating: w.rating_avg || 0, plays: w.play_count || 0, thumbnail: w.thumbnail || null })) });
    } catch (e) { res.status(500).json({ error: 'Failed to load picks' }); }
  });
}

module.exports = setupCommunityRoutes;
