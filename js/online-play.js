// ============================================================
// online-play.js — Phase 2 online multiplayer controller (ONLINE_PLAY)
// Account-based (Supabase auth) friends + game sessions + lobby.
// Real-time sync is handled by the existing socket.io engine
// (js/multiplayer.js); this module is discovery + lobby + handoff.
// ============================================================

const ONLINE_PLAY = {
  currentUser: null,
  friends: [],            // [{id, friendId, friendUsername, status, direction}]
  pendingRequests: [],    // PENDING rows (sent + received), enriched
  friendGames: [],        // active sessions from friends (Phase 2B)
  currentSession: null,   // session being lobbied/played (Phase 2B)
  _listenersBound: false,

  // ── Entry point (called from the dashboard Online Play button) ──
  async init() {
    this.currentUser = AUTH.getUser();
    if (!this.currentUser) return;
    this._showScreen();
    this._setupListeners();
    const dn = document.getElementById('online-user-display');
    if (dn) dn.textContent = `@${this.currentUser.username}`;
    await this.refreshAll();
  },

  async refreshAll() {
    await this.loadFriends();
    await this.loadFriendGames();
  },

  _showScreen() {
    document.getElementById('dashboard-screen').style.display = 'none';
    document.getElementById('online-lobby-screen').style.display = 'none';
    document.getElementById('online-play-screen').style.display = 'block';
  },

  _backToDashboard() {
    document.getElementById('online-play-screen').style.display = 'none';
    document.getElementById('online-lobby-screen').style.display = 'none';
    document.getElementById('dashboard-screen').style.display = 'block';
  },

  // ════════════════════════════════════════════════════════════
  // FRIENDS
  // ════════════════════════════════════════════════════════════
  async loadFriends() {
    try {
      const res = await AUTH.authedFetch('/api/friends');
      if (!res.ok) throw new Error('load failed');
      const data = await res.json();
      this.friends = data.friends || [];
      this.pendingRequests = data.pendingRequests || [];
    } catch (e) {
      console.error('loadFriends error:', e);
      this.friends = [];
      this.pendingRequests = [];
    }
    this.renderPendingRequests();
    this.renderMyFriends();
  },

  renderPendingRequests() {
    const sentList = document.getElementById('pending-sent-list');
    const receivedList = document.getElementById('pending-received-list');
    const sentEmpty = document.getElementById('pending-sent-empty');
    const receivedEmpty = document.getElementById('pending-received-empty');
    if (!sentList || !receivedList) return;

    const sent = this.pendingRequests.filter(r => r.direction === 'sent');
    const received = this.pendingRequests.filter(r => r.direction === 'received');

    // Sent (outgoing) — can cancel
    if (!sent.length) {
      sentList.innerHTML = '';
      sentEmpty.style.display = 'block';
    } else {
      sentEmpty.style.display = 'none';
      sentList.innerHTML = sent.map(req => `
        <div class="request-item" data-friendship-id="${req.id}">
          <div class="request-info">
            <div class="request-username">${this._esc(req.friendUsername)}</div>
            <div class="request-status pending">⏳ Pending approval</div>
          </div>
          <div class="request-actions">
            <button class="btn btn-cancel" data-act="cancel" data-id="${req.id}">Cancel</button>
          </div>
        </div>`).join('');
    }

    // Received (incoming) — can approve / reject
    if (!received.length) {
      receivedList.innerHTML = '';
      receivedEmpty.style.display = 'block';
    } else {
      receivedEmpty.style.display = 'none';
      receivedList.innerHTML = received.map(req => `
        <div class="request-item" data-friendship-id="${req.id}">
          <div class="request-info">
            <div class="request-username">${this._esc(req.friendUsername)}</div>
            <div class="request-status pending">⏳ Wants to be your friend</div>
          </div>
          <div class="request-actions">
            <button class="btn btn-approve" data-act="approve" data-id="${req.id}">Approve</button>
            <button class="btn btn-reject" data-act="reject" data-id="${req.id}">Reject</button>
          </div>
        </div>`).join('');
    }
  },

  renderMyFriends() {
    const list = document.getElementById('my-friends-list');
    const empty = document.getElementById('my-friends-empty');
    if (!list) return;
    if (!this.friends.length) {
      list.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';
    list.innerHTML = this.friends.map(f => `
      <div class="request-item" data-friendship-id="${f.id}">
        <div class="request-info">
          <div class="request-username">${this._esc(f.friendUsername)}</div>
          <div class="request-status">✅ Friends</div>
        </div>
        <div class="request-actions">
          <button class="btn btn-cancel" data-act="unfriend" data-id="${f.id}">Remove</button>
        </div>
      </div>`).join('');
  },

  async addFriend() {
    const input = document.getElementById('add-friend-input');
    const status = document.getElementById('add-friend-status');
    const username = (input.value || '').trim();
    if (!username) { this._status(status, 'Enter a username', 'err'); return; }

    try {
      const res = await AUTH.authedFetch('/api/friends/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      const data = await res.json();
      if (res.ok) {
        this._status(status, `✅ Friend request sent to ${username}`, 'ok');
        input.value = '';
        await this.loadFriends();
      } else {
        this._status(status, `❌ ${data.error || 'Failed'}`, 'err');
      }
    } catch (e) {
      console.error('addFriend error:', e);
      this._status(status, '❌ Network error', 'err');
    }
  },

  async _friendAction(id, path, method = 'POST', confirmMsg = null) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    try {
      const res = await AUTH.authedFetch(`/api/friends/${id}${path}`, { method });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Action failed');
        return;
      }
      await this.loadFriends();
    } catch (e) {
      console.error('friend action error:', e);
      alert('Network error');
    }
  },

  // ════════════════════════════════════════════════════════════
  // FRIEND GAMES + LOBBY  (implemented in Phase 2B)
  // ════════════════════════════════════════════════════════════
  async loadFriendGames() {
    // Phase 2B will fetch GET /api/friends/:id/active-games.
    this.friendGames = [];
    this.renderFriendGames();
  },

  renderFriendGames() {
    const list = document.getElementById('friend-games-list');
    if (!list) return;
    if (!this.friendGames.length) {
      list.innerHTML = '<p class="empty-note">No active games from friends right now.</p>';
      return;
    }
    // Phase 2B: render joinable game cards.
  },

  openCreateGameModal() {
    // Phase 2B: populate worlds + show modal. For now, inform the user.
    alert('Creating online games arrives in the next step (Phase 2B).');
  },

  // ── helpers ──────────────────────────────────────────────────
  _status(el, msg, kind) {
    if (!el) return;
    el.textContent = msg;
    el.className = 'online-status' + (kind ? ' ' + kind : '');
  },

  _esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  // ════════════════════════════════════════════════════════════
  // EVENT LISTENERS (bound once; DOM nodes are permanent)
  // ════════════════════════════════════════════════════════════
  _setupListeners() {
    if (this._listenersBound) return;
    this._listenersBound = true;

    // Tabs
    document.querySelectorAll('.online-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const name = e.currentTarget.dataset.tab;
        document.querySelectorAll('.online-tab-content').forEach(c => c.classList.remove('active'));
        document.querySelectorAll('.online-tab').forEach(t => t.classList.remove('active'));
        document.getElementById(`${name}-tab`).classList.add('active');
        e.currentTarget.classList.add('active');
      });
    });

    document.getElementById('online-back-btn')?.addEventListener('click', () => this._backToDashboard());
    document.getElementById('add-friend-btn')?.addEventListener('click', () => this.addFriend());
    document.getElementById('add-friend-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.addFriend(); }
    });
    document.getElementById('online-refresh-games-btn')?.addEventListener('click', () => this.loadFriendGames());
    document.getElementById('online-create-game-btn')?.addEventListener('click', () => this.openCreateGameModal());

    // Delegated request/friend action buttons (rows are re-rendered).
    document.getElementById('online-play-screen')?.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const id = btn.dataset.id;
      switch (btn.dataset.act) {
        case 'approve':  this._friendAction(id, '/confirm'); break;
        case 'reject':   this._friendAction(id, '/reject', 'POST', 'Reject this friend request?'); break;
        case 'cancel':   this._friendAction(id, '/cancel', 'POST', 'Cancel this friend request?'); break;
        case 'unfriend': this._friendAction(id, '', 'DELETE', 'Remove this friend?'); break;
      }
    });
  },
};
