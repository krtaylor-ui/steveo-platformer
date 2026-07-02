// ============================================================
// custom-rules-routes.js — saved Custom Rules configs (Phase 3 v3)
// ------------------------------------------------------------
// Per-user saved arena configurations (up to 10). Backed by the custom_rules
// table (see server/sql/custom_rules.sql). Exports setupCustomRulesRoutes(app);
// registered in server.js.
// ============================================================

const { supabaseAdmin } = require('./supabase-client');

const MAX_SAVED = 10;

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

function setupCustomRulesRoutes(app) {
  // List the signed-in user's saved configs (most recent first).
  app.get('/api/custom-rules', verifyToken, async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('custom_rules')
        .select('id, name, config, created_at')
        .eq('user_id', req.user.id)
        .order('created_at', { ascending: false });
      if (error) return res.status(500).json({ error: error.message });
      res.json(data || []);
    } catch (e) { res.status(500).json({ error: 'Failed to list custom rules' }); }
  });

  // Save a config (capped at MAX_SAVED per user).
  app.post('/api/custom-rules', verifyToken, async (req, res) => {
    try {
      const { name, config } = req.body || {};
      if (!name || !config || typeof config !== 'object') return res.status(400).json({ error: 'name and config are required' });
      const { count, error: cErr } = await supabaseAdmin
        .from('custom_rules').select('id', { count: 'exact', head: true }).eq('user_id', req.user.id);
      if (cErr) return res.status(500).json({ error: cErr.message });
      if ((count || 0) >= MAX_SAVED) return res.status(400).json({ error: `Save limit reached (${MAX_SAVED}). Delete one first.` });
      const { data, error } = await supabaseAdmin
        .from('custom_rules')
        .insert({ user_id: req.user.id, name: String(name).slice(0, 60), config })
        .select('id, name, config, created_at').single();
      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    } catch (e) { res.status(500).json({ error: 'Failed to save custom rule' }); }
  });

  // Delete one of the user's saved configs.
  app.delete('/api/custom-rules/:id', verifyToken, async (req, res) => {
    try {
      const { error } = await supabaseAdmin
        .from('custom_rules').delete().eq('id', req.params.id).eq('user_id', req.user.id);
      if (error) return res.status(500).json({ error: error.message });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: 'Failed to delete custom rule' }); }
  });
}

module.exports = setupCustomRulesRoutes;
