// §Phase 3 — per-account custom-character ROSTER (user_characters table). Build several named characters
// on your account and reuse them across any world. The definition is the Phase-2 parts-mixer mix
// { name, body, sel, pal } as JSONB. Requires server/sql/user_characters.sql (applied).
const { supabaseAdmin } = require('./supabase-client');
const MODERATION = require('../js/moderation.js');   // §B6 — character names are player-visible

const ROSTER_CAP = 30;   // soft cap per account (enforced here, not in SQL)

const verifyToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Invalid token' });
    req.user = user;
    next();
  } catch (e) { res.status(401).json({ error: 'Token verification failed' }); }
};

module.exports = function setupUserCharactersRoutes(app) {
  // List the signed-in player's roster (newest first).
  app.get('/api/characters', verifyToken, async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('user_characters')
        .select('id, name, definition, updated_at')
        .eq('user_id', req.user.id)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      res.json({ characters: data || [] });
    } catch (e) { console.error('roster list error:', e); res.status(500).json({ error: 'Failed to load roster' }); }
  });

  // Save a new roster character (or update one by id). Body: { id?, name, definition }.
  app.post('/api/characters', verifyToken, async (req, res) => {
    try {
      const { id, name, definition } = req.body || {};
      const nm = (typeof name === 'string' ? name : '').trim() || (definition && definition.name) || 'My Character';
      if (!definition || typeof definition !== 'object') return res.status(400).json({ error: 'definition required' });
      const mod = MODERATION.check(nm, 'character name');
      if (!mod.ok) return res.status(400).json({ error: mod.reason });

      if (id) {
        const { data, error } = await supabaseAdmin
          .from('user_characters')
          .update({ name: nm, definition, updated_at: new Date().toISOString() })
          .eq('id', id).eq('user_id', req.user.id)
          .select('id, name, definition, updated_at').single();
        if (error) throw error;
        return res.json({ character: data });
      }
      // Enforce the soft cap before inserting.
      const { count } = await supabaseAdmin
        .from('user_characters').select('id', { count: 'exact', head: true }).eq('user_id', req.user.id);
      if ((count || 0) >= ROSTER_CAP) return res.status(400).json({ error: `Roster is full (max ${ROSTER_CAP}).` });

      const { data, error } = await supabaseAdmin
        .from('user_characters')
        .insert({ user_id: req.user.id, name: nm, definition })
        .select('id, name, definition, updated_at').single();
      if (error) throw error;
      res.json({ character: data });
    } catch (e) { console.error('roster save error:', e); res.status(500).json({ error: 'Failed to save character' }); }
  });

  // Delete a roster character.
  app.delete('/api/characters/:id', verifyToken, async (req, res) => {
    try {
      const { error } = await supabaseAdmin
        .from('user_characters').delete().eq('id', req.params.id).eq('user_id', req.user.id);
      if (error) throw error;
      res.json({ message: 'Deleted' });
    } catch (e) { console.error('roster delete error:', e); res.status(500).json({ error: 'Failed to delete character' }); }
  });
};
