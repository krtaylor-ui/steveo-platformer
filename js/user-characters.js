// §Phase 3 — client API for the per-account custom-character ROSTER (user_characters). Thin wrappers over
// /api/characters (list/save/delete). Best-effort + logged-in only; callers degrade gracefully offline.
const USER_CHARACTERS = {
  _loggedIn() { return typeof AUTH !== 'undefined' && AUTH.isLoggedIn && AUTH.isLoggedIn(); },

  // Returns [{id, name, definition, updated_at}] or [] (offline / logged out / error).
  async list() {
    if (!this._loggedIn() || !AUTH.authedFetch) return [];
    try {
      const res = await AUTH.authedFetch('/api/characters');
      if (!res.ok) return [];
      const d = await res.json();
      return d.characters || [];
    } catch (e) { return []; }
  },

  // Save a new roster character (or update by id). def = the parts-mixer mix { name, body, sel, pal }.
  // Returns the saved row, or { error }.
  async save(def, id) {
    if (!this._loggedIn() || !AUTH.authedFetch) return { error: 'Sign in to save characters to your account.' };
    try {
      const res = await AUTH.authedFetch('/api/characters', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id || undefined, name: def && def.name, definition: def }),
      });
      const body = await res.json().catch(() => ({}));
      return res.ok ? (body.character || body) : { error: body.error || `HTTP ${res.status}` };
    } catch (e) { return { error: String(e) }; }
  },

  async remove(id) {
    if (!this._loggedIn() || !AUTH.authedFetch) return false;
    try { const res = await AUTH.authedFetch('/api/characters/' + encodeURIComponent(id), { method: 'DELETE' }); return res.ok; }
    catch (e) { return false; }
  },
};

if (typeof window !== 'undefined') window.USER_CHARACTERS = USER_CHARACTERS;
if (typeof module !== 'undefined' && module.exports) module.exports = { USER_CHARACTERS };
