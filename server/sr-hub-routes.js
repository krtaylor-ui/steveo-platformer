// ============================================================
// sr-hub-routes.js — Speed Runner Level Hub
// ------------------------------------------------------------
// Replaces the 4 SR save-slots with three level groups:
//   • System   — admin-curated (is_system), ordered by sort_order, shared leaderboards.
//   • My Levels — the requester's own worlds marked Live (is_live).
//   • Community — worlds the requester has Added (world_added library).
// Needs server/sql/sr_level_hub.sql (is_system / sort_order / is_live + world_added).
// Exports setupSrHubRoutes(app); registered in server.js.
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

// Admin gate — the accounts allowed to curate the System list. Configurable via ADMIN_EMAILS
// (comma-separated); defaults to Kevin's account.
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'krtaylor@gmail.com')
  .toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
const isAdmin = (req) => !!(req.user && req.user.email && ADMIN_EMAILS.includes(req.user.email.toLowerCase()));

// The hub now serves NORMAL / PLATFORMER / SPEEDRUNNER. Validate the mode query (default SPEEDRUNNER).
const HUB_MODES = ['NORMAL', 'PLATFORMER', 'SPEEDRUNNER'];
const modeOf = (q) => { const m = String(q || '').toUpperCase(); return HUB_MODES.includes(m) ? m : 'SPEEDRUNNER'; };

// Shared: the light row shape the hub renders (never ships full world_data — that's fetched on Play).
const SELECT_COLS = 'id, world_name, creator_name, original_author, mode, description, thumbnail, play_count, is_system, sort_order, is_live, is_published, creator_id, updated_at, published_at';
function toRow(w) {
  return {
    id: w.id, name: w.world_name, author: w.original_author || w.creator_name,
    creatorId: w.creator_id, mode: w.mode, description: w.description || '',
    thumbnail: w.thumbnail || null, plays: w.play_count || 0,
    isSystem: !!w.is_system, sortOrder: w.sort_order || 0, isLive: !!w.is_live, isPublished: !!w.is_published,
  };
}

// Attach `inProgress` (does the requester have a saved game for this world) to a set of rows.
// Resilient — if world_progress.sql isn't applied yet, everything is simply "not in progress".
async function attachProgress(userId, rows) {
  const ids = rows.map(r => r.id);
  if (!ids.length) return rows;
  try {
    const { data } = await supabaseAdmin.from('world_progress')
      .select('world_id').eq('user_id', userId).in('world_id', ids).not('game_data', 'is', null);
    const set = new Set((data || []).map(p => p.world_id));
    rows.forEach(r => { r.inProgress = set.has(r.id); });
  } catch (_) { /* table not present yet */ }
  return rows;
}

function setupSrHubRoutes(app) {
  // ── Per-(player, world) progress: load / save / clear (Normal & Platformer Continue/Restart) ──
  app.get('/api/sr/world/:worldId/progress', verifyToken, async (req, res) => {
    try {
      const { data } = await supabaseAdmin.from('world_progress')
        .select('game_data').eq('user_id', req.user.id).eq('world_id', req.params.worldId).maybeSingle();
      res.json({ gameData: (data && data.game_data) || null });
    } catch (e) { res.json({ gameData: null }); }
  });
  app.put('/api/sr/world/:worldId/progress', verifyToken, async (req, res) => {
    try {
      const { error } = await supabaseAdmin.from('world_progress').upsert({
        user_id: req.user.id, world_id: req.params.worldId, game_data: req.body.gameData || null, updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,world_id' });
      if (error) throw error;
      res.json({ saved: true });
    } catch (e) { console.error('progress save:', e); res.status(500).json({ error: 'Failed to save progress' }); }
  });
  app.delete('/api/sr/world/:worldId/progress', verifyToken, async (req, res) => {
    try {
      await supabaseAdmin.from('world_progress').delete().eq('user_id', req.user.id).eq('world_id', req.params.worldId);
      res.json({ cleared: true });
    } catch (e) { res.status(500).json({ error: 'Failed to clear progress' }); }
  });

  // ── Am I an admin? (lets the Sandbox card show the "Add to System" control) ──
  app.get('/api/sr/whoami', verifyToken, async (req, res) => {
    res.json({ isAdmin: isAdmin(req), email: req.user.email || null });
  });

  // ── System tab — admin-curated SR levels, in the admin's order (public to all signed-in players) ──
  app.get('/api/sr/system', verifyToken, async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin.from('worlds').select(SELECT_COLS)
        .eq('is_system', true).eq('mode', modeOf(req.query.mode))
        .order('sort_order', { ascending: true }).order('published_at', { ascending: true, nullsFirst: true });
      if (error) throw error;
      const rows = await attachProgress(req.user.id, (data || []).map(toRow));
      res.json({ worlds: rows, isAdmin: isAdmin(req) });
    } catch (e) { console.error('sr/system:', e); res.status(500).json({ error: 'Failed to load system levels' }); }
  });

  // ── My Levels tab — the requester's OWN Live SR worlds ──
  app.get('/api/sr/mine', verifyToken, async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin.from('worlds').select(SELECT_COLS)
        .eq('creator_id', req.user.id).eq('mode', modeOf(req.query.mode)).eq('is_live', true)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      const rows = await attachProgress(req.user.id, (data || []).map(toRow));
      res.json({ worlds: rows, isAdmin: isAdmin(req) });
    } catch (e) { console.error('sr/mine:', e); res.status(500).json({ error: 'Failed to load your levels' }); }
  });

  // ── Community tab — the SR worlds the requester has ADDED to their library ──
  app.get('/api/sr/added', verifyToken, async (req, res) => {
    try {
      const { data: adds, error: e1 } = await supabaseAdmin.from('world_added')
        .select('world_id, added_at').eq('user_id', req.user.id).order('added_at', { ascending: false });
      if (e1) throw e1;
      const ids = (adds || []).map(a => a.world_id);
      if (!ids.length) return res.json({ worlds: [] });
      const { data, error } = await supabaseAdmin.from('worlds').select(SELECT_COLS).in('id', ids).eq('mode', modeOf(req.query.mode));
      if (error) throw error;
      // preserve added order
      const byId = {}; (data || []).forEach(w => { byId[w.id] = w; });
      const rows = await attachProgress(req.user.id, ids.map(id => byId[id]).filter(Boolean).map(toRow));
      res.json({ worlds: rows });
    } catch (e) { console.error('sr/added:', e); res.status(500).json({ error: 'Failed to load added levels' }); }
  });

  // ── Play any hub world (System / owned / added / published) — returns world_data, bumps play_count ──
  app.get('/api/sr/world/:worldId/play', verifyToken, async (req, res) => {
    try {
      const { data: w, error } = await supabaseAdmin.from('worlds')
        .select('id, world_name, world_data, mode, creator_id, creator_name, original_author, is_system, is_published, play_count')
        .eq('id', req.params.worldId).single();
      if (error || !w) return res.status(404).json({ error: 'Level not found' });
      const allowed = w.is_system || w.is_published || w.creator_id === req.user.id;
      if (!allowed) return res.status(403).json({ error: 'Not available to play' });
      supabaseAdmin.from('worlds').update({ play_count: (w.play_count || 0) + 1, last_played_at: new Date().toISOString() })
        .eq('id', w.id).then(() => {}, () => {});
      res.json({ id: w.id, worldName: w.world_name, mode: w.mode,
        author: w.original_author || w.creator_name, worldData: w.world_data });
    } catch (e) { console.error('sr/play:', e); res.status(500).json({ error: 'Failed to load level' }); }
  });

  // ── Add / remove a world from the requester's library ──
  app.post('/api/sr/added/:worldId', verifyToken, async (req, res) => {
    try {
      // Only allow adding a world that's actually visible (published or system).
      const { data: w } = await supabaseAdmin.from('worlds').select('id, is_published, is_system')
        .eq('id', req.params.worldId).single();
      if (!w || !(w.is_published || w.is_system)) return res.status(404).json({ error: 'Level not available to add' });
      const { error } = await supabaseAdmin.from('world_added')
        .upsert({ user_id: req.user.id, world_id: req.params.worldId }, { onConflict: 'user_id,world_id' });
      if (error) throw error;
      res.json({ added: true });
    } catch (e) { console.error('sr/add:', e); res.status(500).json({ error: 'Failed to add level' }); }
  });
  app.delete('/api/sr/added/:worldId', verifyToken, async (req, res) => {
    try {
      const { error } = await supabaseAdmin.from('world_added').delete()
        .eq('user_id', req.user.id).eq('world_id', req.params.worldId);
      if (error) throw error;
      res.json({ added: false });
    } catch (e) { console.error('sr/unadd:', e); res.status(500).json({ error: 'Failed to remove level' }); }
  });

  // ── Owner toggles a world Live / In Process (gates its appearance in My Levels) ──
  app.post('/api/worlds/sandbox/:worldId/live', verifyToken, async (req, res) => {
    try {
      const isLive = !!req.body.isLive;
      const { data: w, error } = await supabaseAdmin.from('worlds')
        .update({ is_live: isLive, updated_at: new Date().toISOString() })
        .eq('id', req.params.worldId).eq('creator_id', req.user.id).select('id, is_live').single();
      if (error) throw error;
      if (!w) return res.status(404).json({ error: 'World not found' });
      res.json({ isLive: w.is_live });
    } catch (e) { console.error('sr/live:', e); res.status(500).json({ error: 'Failed to update Live status' }); }
  });

  // ── ADMIN: mark/unmark a world as System, and reorder the System list ──
  app.post('/api/sr/system/:worldId', verifyToken, async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only' });
    try {
      const patch = { is_system: !!req.body.isSystem, updated_at: new Date().toISOString() };
      if (req.body.sortOrder != null) patch.sort_order = parseInt(req.body.sortOrder, 10) || 0;
      const { data: w, error } = await supabaseAdmin.from('worlds').update(patch)
        .eq('id', req.params.worldId).select('id, is_system, sort_order').single();
      if (error) throw error;
      res.json({ id: w.id, isSystem: w.is_system, sortOrder: w.sort_order });
    } catch (e) { console.error('sr/system-set:', e); res.status(500).json({ error: 'Failed to set System flag' }); }
  });
  app.post('/api/sr/system/reorder', verifyToken, async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only' });
    try {
      const order = Array.isArray(req.body.order) ? req.body.order : [];
      // Write sort_order = index for each id (sequential, best-effort).
      await Promise.all(order.map((id, i) =>
        supabaseAdmin.from('worlds').update({ sort_order: i }).eq('id', id).eq('is_system', true)));
      res.json({ ok: true, count: order.length });
    } catch (e) { console.error('sr/reorder:', e); res.status(500).json({ error: 'Failed to reorder' }); }
  });
}

module.exports = setupSrHubRoutes;
