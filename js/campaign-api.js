// Campaign Mode (MVP) — thin client for the server routes (server/campaign-routes.js).
// All calls go through AUTH.authedFetch (Bearer token + refresh-on-401). Every method
// returns the parsed JSON body and throws with the server's error message on failure,
// so callers can surface it. Campaign mode requires being logged in (server-backed).
(function () {
  'use strict';

  async function j(res) {
    let body = null;
    try { body = await res.json(); } catch (e) { /* empty body */ }
    if (!res.ok) throw new Error((body && (body.error || body.detail)) || ('HTTP ' + res.status));
    return body;
  }
  const AF = (url, opts) => AUTH.authedFetch(url, opts);
  const jsonOpts = (method, obj) => ({
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj || {}),
  });

  const CAMPAIGN_API = {
    // Campaigns
    list()            { return AF('/api/campaigns').then(j); },
    published()       { return AF('/api/campaigns/published').then(j); },
    get(id)           { return AF('/api/campaigns/' + id).then(j); },
    create(name, definition) { return AF('/api/campaigns', jsonOpts('POST', { name, definition })).then(j); },
    save(id, name, definition) { return AF('/api/campaigns/' + id, jsonOpts('PUT', { name, definition })).then(j); },
    publish(id)       { return AF('/api/campaigns/' + id + '/publish', jsonOpts('POST', {})).then(j); },
    unpublish(id)     { return AF('/api/campaigns/' + id + '/unpublish', jsonOpts('POST', {})).then(j); },
    remove(id)        { return AF('/api/campaigns/' + id, { method: 'DELETE' }).then(j); },

    // Play-time world data (works cross-owner for the published campaign)
    world(campaignId, worldUid) {
      return AF('/api/campaigns/' + campaignId + '/world/' + worldUid).then(j);
    },

    // Progress
    getProgress(id)   { return AF('/api/campaigns/' + id + '/progress').then(j); },
    saveProgress(id, progress) {
      return AF('/api/campaigns/' + id + '/progress', jsonOpts('PUT', { progress })).then(j);
    },

    // ── Builder helpers over the existing worlds endpoints ─────────────────
    // The creator's own Platformer sandbox worlds (candidates to add to a campaign).
    myPlatformerWorlds() {
      return AF('/api/worlds/sandbox?filter=platformer&sort=alphabetical').then(j)
        .then((r) => (r.worlds || []).map((w) => ({
          id: w.id, name: w.world_name, mode: w.mode, createdAt: w.created_at,
        })));
    },
    // A world the CREATOR owns, full data (for reading goalStars + spawn points).
    myWorld(worldId) {
      return AF('/api/worlds/sandbox/' + worldId).then(j)
        .then((r) => (r && (r.world || r)) );
    },
  };

  if (typeof window !== 'undefined') window.CAMPAIGN_API = CAMPAIGN_API;
})();
