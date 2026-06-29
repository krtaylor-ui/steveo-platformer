const { supabaseAdmin } = require('./supabase-client');

// Same token-verification contract as games-routes.js / worlds-routes.js:
// expects "Authorization: Bearer <supabase access token>", attaches req.user.
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

// ── Friendship pair convention ───────────────────────────────────────────────
// The friendships table enforces a CHECK ("different_users") of
// `user_id_1 < user_id_2`, so the pair is ALWAYS stored in sorted (lo, hi)
// order — there is no room to encode request direction in the ordering.
// Direction is therefore tracked in the dedicated `requested_by` column
// (the user who sent the request). status is constrained to PENDING/ACCEPTED/
// BLOCKED, so we cannot encode direction there either.
//
//   requester  = requested_by
//   recipient  = the pair member that is NOT requested_by
function sortPair(a, b) {
  return a < b ? [a, b] : [b, a];
}

// There is exactly one possible row per pair (sorted), so a direct match is enough.
async function findFriendship(aId, bId) {
  const [lo, hi] = sortPair(aId, bId);
  const { data, error } = await supabaseAdmin
    .from('friendships')
    .select('*')
    .eq('user_id_1', lo)
    .eq('user_id_2', hi)
    .maybeSingle();
  if (error) throw error;
  return data;
}

module.exports = function setupFriendsRoutes(app) {

  // ── POST /api/friends/add ──────────────────────────────────────────────────
  // Send a friend request by username. The caller becomes `requested_by`.
  app.post('/api/friends/add', verifyToken, async (req, res) => {
    try {
      const { username } = req.body;
      if (!username || !username.trim()) {
        return res.status(400).json({ error: 'username required' });
      }

      const { data: targetUser, error: userError } = await supabaseAdmin
        .from('users')
        .select('id, username')
        .eq('username', username.trim())
        .maybeSingle();

      if (userError) throw userError;
      if (!targetUser) return res.status(404).json({ error: 'User not found' });
      if (targetUser.id === req.user.id) {
        return res.status(400).json({ error: 'Cannot add yourself' });
      }

      const existing = await findFriendship(req.user.id, targetUser.id);
      if (existing) {
        if (existing.status === 'ACCEPTED') {
          return res.status(400).json({ error: 'Already friends' });
        }
        // A pending request already exists between these two users.
        if (existing.requested_by === req.user.id) {
          return res.status(400).json({ error: 'Friend request already sent' });
        }
        return res.status(400).json({ error: 'This user already sent you a request — check your pending requests' });
      }

      const [lo, hi] = sortPair(req.user.id, targetUser.id);
      const { data: friendship, error } = await supabaseAdmin
        .from('friendships')
        .insert({
          user_id_1: lo,
          user_id_2: hi,
          requested_by: req.user.id,
          status: 'PENDING',
        })
        .select()
        .single();

      if (error) throw error;
      res.json({ message: 'Friend request sent', friendship });
    } catch (error) {
      console.error('Add friend error:', error);
      res.status(500).json({ error: 'Failed to add friend' });
    }
  });

  // ── POST /api/friends/:friendshipId/confirm ────────────────────────────────
  // Only the recipient (a pair member who is NOT requested_by) may confirm.
  app.post('/api/friends/:friendshipId/confirm', verifyToken, async (req, res) => {
    try {
      const friendship = await getPending(req, res);
      if (!friendship) return;

      if (!isRecipient(friendship, req.user.id)) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      const { data: confirmed, error } = await supabaseAdmin
        .from('friendships')
        .update({ status: 'ACCEPTED', updated_at: new Date().toISOString() })
        .eq('id', friendship.id)
        .select()
        .single();

      if (error) throw error;
      res.json({ message: 'Friend request confirmed', friendship: confirmed });
    } catch (error) {
      console.error('Confirm friend error:', error);
      res.status(500).json({ error: 'Failed to confirm friend' });
    }
  });

  // ── POST /api/friends/:friendshipId/reject ─────────────────────────────────
  // Recipient declines an incoming request (deletes the row).
  app.post('/api/friends/:friendshipId/reject', verifyToken, async (req, res) => {
    try {
      const friendship = await getPending(req, res);
      if (!friendship) return;

      if (!isRecipient(friendship, req.user.id)) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      const { error } = await supabaseAdmin
        .from('friendships')
        .delete()
        .eq('id', friendship.id);

      if (error) throw error;
      res.json({ message: 'Friend request rejected' });
    } catch (error) {
      console.error('Reject friend error:', error);
      res.status(500).json({ error: 'Failed to reject friend' });
    }
  });

  // ── POST /api/friends/:friendshipId/cancel ─────────────────────────────────
  // Requester (requested_by) withdraws their own outgoing request.
  app.post('/api/friends/:friendshipId/cancel', verifyToken, async (req, res) => {
    try {
      const friendship = await getPending(req, res);
      if (!friendship) return;

      if (friendship.requested_by !== req.user.id) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      const { error } = await supabaseAdmin
        .from('friendships')
        .delete()
        .eq('id', friendship.id);

      if (error) throw error;
      res.json({ message: 'Friend request cancelled' });
    } catch (error) {
      console.error('Cancel friend error:', error);
      res.status(500).json({ error: 'Failed to cancel friend' });
    }
  });

  // ── DELETE /api/friends/:friendshipId ──────────────────────────────────────
  // Remove an existing (ACCEPTED) friend. Either party may unfriend.
  app.delete('/api/friends/:friendshipId', verifyToken, async (req, res) => {
    try {
      const { friendshipId } = req.params;

      const { data: friendship, error: getError } = await supabaseAdmin
        .from('friendships')
        .select('*')
        .eq('id', friendshipId)
        .maybeSingle();

      if (getError) throw getError;
      if (!friendship) return res.status(404).json({ error: 'Friendship not found' });
      if (friendship.user_id_1 !== req.user.id && friendship.user_id_2 !== req.user.id) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      const { error } = await supabaseAdmin
        .from('friendships')
        .delete()
        .eq('id', friendshipId);

      if (error) throw error;
      res.json({ message: 'Friend removed' });
    } catch (error) {
      console.error('Remove friend error:', error);
      res.status(500).json({ error: 'Failed to remove friend' });
    }
  });

  // ── GET /api/friends ───────────────────────────────────────────────────────
  // Returns the caller's accepted friends and pending requests, each enriched
  // with usernames + a `direction` ('sent'|'received') derived from requested_by.
  app.get('/api/friends', verifyToken, async (req, res) => {
    try {
      const me = req.user.id;

      const { data: rows, error } = await supabaseAdmin
        .from('friendships')
        .select('*')
        .or(`user_id_1.eq.${me},user_id_2.eq.${me}`);

      if (error) throw error;

      const otherIds = new Set();
      for (const r of rows) {
        otherIds.add(r.user_id_1);
        otherIds.add(r.user_id_2);
      }
      otherIds.delete(me);

      let nameById = new Map();
      if (otherIds.size) {
        const { data: users, error: uErr } = await supabaseAdmin
          .from('users')
          .select('id, username')
          .in('id', [...otherIds]);
        if (uErr) throw uErr;
        nameById = new Map((users || []).map(u => [u.id, u.username]));
      }

      const friends = [];
      const pendingRequests = [];
      for (const r of rows) {
        const otherId = r.user_id_1 === me ? r.user_id_2 : r.user_id_1;
        const enriched = {
          id: r.id,
          friendId: otherId,
          friendUsername: nameById.get(otherId) || 'Unknown',
          status: r.status,
          direction: r.requested_by === me ? 'sent' : 'received',
        };
        if (r.status === 'ACCEPTED') friends.push(enriched);
        else if (r.status === 'PENDING') pendingRequests.push(enriched);
      }

      res.json({ friends, pendingRequests });
    } catch (error) {
      console.error('Get friends error:', error);
      res.status(500).json({ error: 'Failed to get friends' });
    }
  });

  // ── shared helpers ──────────────────────────────────────────────────────────
  // Loads a PENDING friendship by :friendshipId, writing the appropriate error
  // response and returning null if not found / not pending. The caller checks
  // for null and returns immediately.
  async function getPending(req, res) {
    const { friendshipId } = req.params;
    const { data: friendship, error } = await supabaseAdmin
      .from('friendships')
      .select('*')
      .eq('id', friendshipId)
      .maybeSingle();

    if (error) throw error;
    if (!friendship) { res.status(404).json({ error: 'Friendship not found' }); return null; }
    if (friendship.status !== 'PENDING') { res.status(400).json({ error: 'Not a pending request' }); return null; }
    return friendship;
  }

  // The recipient is the pair member who did NOT send the request.
  function isRecipient(friendship, userId) {
    return (friendship.user_id_1 === userId || friendship.user_id_2 === userId)
      && friendship.requested_by !== userId;
  }

};
