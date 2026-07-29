// Campaign Mode (MVP) — server routes. Definitions + per-player progress live in
// the `campaigns` / `campaign_progress` tables (server/sql/campaigns.sql).
//
// Storage model: the whole CAMPAIGN_MODEL object is stored in campaigns.definition
// (JSONB). The authoritative published flag is the is_published COLUMN; on read we
// mirror it (and the row id) back into the returned definition so the client always
// sees a consistent object.
//
// Publishing policy (§6/§11): ONLY the admin account (ADMIN_EMAIL) may publish, and
// only ONE Campaign may be published system-wide at a time. Any account may create,
// save (in any state), and delete their OWN campaigns as drafts.
const { supabaseAdmin } = require('./supabase-client');

// The single account permitted to publish a Campaign (confirmed with Kevin,
// 2026-07-28). Everyone else can build + save drafts but not publish.
const ADMIN_EMAIL = 'krtaylor@gmail.com';

const verifyToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Invalid token' });
    req.user = user;
    next();
  } catch (e) {
    res.status(401).json({ error: 'Token verification failed' });
  }
};

const isAdmin = (user) =>
  !!user && String(user.email || '').toLowerCase() === ADMIN_EMAIL.toLowerCase();

const creatorName = (user) =>
  (user && (user.user_metadata?.username || user.user_metadata?.name || user.email)) || 'Player';

// Shape a DB row into the client-facing campaign object (definition + live flags).
function shape(row) {
  if (!row) return null;
  let def = row.definition;
  if (typeof def === 'string') { try { def = JSON.parse(def); } catch (e) { def = {}; } }
  def = def || {};
  def.id = row.id;
  def.name = row.name;
  def.creatorId = row.creator_id;
  def.creatorName = row.creator_name;
  def.published = !!row.is_published;
  def.updatedAt = row.updated_at;
  return def;
}

module.exports = function setupCampaignRoutes(app) {
  // ── List: my own campaigns + whichever one is published ──────────────────
  app.get('/api/campaigns', verifyToken, async (req, res) => {
    try {
      const [{ data: mine, error: mErr }, { data: pub, error: pErr }] = await Promise.all([
        supabaseAdmin.from('campaigns').select('*')
          .eq('creator_id', req.user.id).order('updated_at', { ascending: false }),
        supabaseAdmin.from('campaigns').select('*').eq('is_published', true).limit(1),
      ]);
      if (mErr || pErr) throw (mErr || pErr);
      res.json({
        mine: (mine || []).map(shape),
        published: pub && pub.length ? shape(pub[0]) : null,
        canPublish: isAdmin(req.user),
      });
    } catch (e) {
      res.status(500).json({ error: 'Failed to list campaigns', detail: e.message });
    }
  });

  // ── The single published campaign (players' entry point) ─────────────────
  app.get('/api/campaigns/published', verifyToken, async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin.from('campaigns').select('*')
        .eq('is_published', true).limit(1);
      if (error) throw error;
      res.json({ campaign: data && data.length ? shape(data[0]) : null });
    } catch (e) {
      res.status(500).json({ error: 'Failed to load published campaign', detail: e.message });
    }
  });

  // ── Get one campaign (owner, or anyone if it's published) ────────────────
  app.get('/api/campaigns/:id', verifyToken, async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin.from('campaigns').select('*')
        .eq('id', req.params.id).single();
      if (error || !data) return res.status(404).json({ error: 'Campaign not found' });
      if (data.creator_id !== req.user.id && !data.is_published)
        return res.status(403).json({ error: 'Not your campaign' });
      res.json({ campaign: shape(data) });
    } catch (e) {
      res.status(500).json({ error: 'Failed to load campaign', detail: e.message });
    }
  });

  // ── Create a new (draft) campaign ────────────────────────────────────────
  app.post('/api/campaigns', verifyToken, async (req, res) => {
    try {
      const name = (req.body && req.body.name || 'Untitled Campaign').slice(0, 120);
      const definition = (req.body && req.body.definition) || {};
      definition.creatorId = req.user.id;
      const { data, error } = await supabaseAdmin.from('campaigns').insert({
        creator_id: req.user.id, creator_name: creatorName(req.user),
        name, definition, is_published: false,
      }).select().single();
      if (error) throw error;
      res.json({ campaign: shape(data) });
    } catch (e) {
      res.status(500).json({ error: 'Failed to create campaign', detail: e.message });
    }
  });

  // ── Save (any state) — owner only. Never blocked by validation (§6). ─────
  app.put('/api/campaigns/:id', verifyToken, async (req, res) => {
    try {
      const { data: row, error: gErr } = await supabaseAdmin.from('campaigns')
        .select('creator_id').eq('id', req.params.id).single();
      if (gErr || !row) return res.status(404).json({ error: 'Campaign not found' });
      if (row.creator_id !== req.user.id) return res.status(403).json({ error: 'Not your campaign' });

      const patch = { updated_at: new Date().toISOString() };
      if (req.body && typeof req.body.name === 'string') patch.name = req.body.name.slice(0, 120);
      if (req.body && req.body.definition && typeof req.body.definition === 'object') {
        const def = req.body.definition;
        def.creatorId = req.user.id;   // never let the client reassign ownership
        patch.definition = def;
      }
      const { data, error } = await supabaseAdmin.from('campaigns')
        .update(patch).eq('id', req.params.id).select().single();
      if (error) throw error;
      res.json({ campaign: shape(data) });
    } catch (e) {
      res.status(500).json({ error: 'Failed to save campaign', detail: e.message });
    }
  });

  // ── Publish — ADMIN ONLY + single-published invariant (§6/§11) ───────────
  app.post('/api/campaigns/:id/publish', verifyToken, async (req, res) => {
    try {
      if (!isAdmin(req.user))
        return res.status(403).json({ error: 'Only the admin account may publish a campaign.' });
      const { data: row, error: gErr } = await supabaseAdmin.from('campaigns')
        .select('*').eq('id', req.params.id).single();
      if (gErr || !row) return res.status(404).json({ error: 'Campaign not found' });

      // Enforce "only one published system-wide": unpublish every other first.
      const { error: clrErr } = await supabaseAdmin.from('campaigns')
        .update({ is_published: false }).eq('is_published', true).neq('id', req.params.id);
      if (clrErr) throw clrErr;

      const { data, error } = await supabaseAdmin.from('campaigns')
        .update({ is_published: true, updated_at: new Date().toISOString() })
        .eq('id', req.params.id).select().single();
      if (error) throw error;
      res.json({ campaign: shape(data) });
    } catch (e) {
      res.status(500).json({ error: 'Failed to publish campaign', detail: e.message });
    }
  });

  // ── Unpublish — admin, or the owner of the published campaign ────────────
  app.post('/api/campaigns/:id/unpublish', verifyToken, async (req, res) => {
    try {
      const { data: row, error: gErr } = await supabaseAdmin.from('campaigns')
        .select('creator_id').eq('id', req.params.id).single();
      if (gErr || !row) return res.status(404).json({ error: 'Campaign not found' });
      if (!isAdmin(req.user) && row.creator_id !== req.user.id)
        return res.status(403).json({ error: 'Not permitted' });
      const { data, error } = await supabaseAdmin.from('campaigns')
        .update({ is_published: false, updated_at: new Date().toISOString() })
        .eq('id', req.params.id).select().single();
      if (error) throw error;
      res.json({ campaign: shape(data) });
    } catch (e) {
      res.status(500).json({ error: 'Failed to unpublish campaign', detail: e.message });
    }
  });

  // ── Delete — owner only ──────────────────────────────────────────────────
  app.delete('/api/campaigns/:id', verifyToken, async (req, res) => {
    try {
      const { data: row, error: gErr } = await supabaseAdmin.from('campaigns')
        .select('creator_id').eq('id', req.params.id).single();
      if (gErr || !row) return res.status(404).json({ error: 'Campaign not found' });
      if (row.creator_id !== req.user.id) return res.status(403).json({ error: 'Not your campaign' });
      const { error } = await supabaseAdmin.from('campaigns').delete().eq('id', req.params.id);
      if (error) throw error;
      // Best-effort progress cleanup.
      await supabaseAdmin.from('campaign_progress').delete().eq('campaign_id', req.params.id);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: 'Failed to delete campaign', detail: e.message });
    }
  });

  // ── Progress: read my own for a campaign ─────────────────────────────────
  app.get('/api/campaigns/:id/progress', verifyToken, async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin.from('campaign_progress').select('progress')
        .eq('campaign_id', req.params.id).eq('player_id', req.user.id).maybeSingle();
      if (error) throw error;
      res.json({ progress: data ? data.progress : null });
    } catch (e) {
      res.status(500).json({ error: 'Failed to load progress', detail: e.message });
    }
  });

  // ── Progress: upsert my own (the autosave hook target) ───────────────────
  app.put('/api/campaigns/:id/progress', verifyToken, async (req, res) => {
    try {
      const progress = (req.body && req.body.progress) || {};
      const { error } = await supabaseAdmin.from('campaign_progress').upsert({
        campaign_id: req.params.id, player_id: req.user.id,
        progress, updated_at: new Date().toISOString(),
      }, { onConflict: 'campaign_id,player_id' });
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: 'Failed to save progress', detail: e.message });
    }
  });
};
