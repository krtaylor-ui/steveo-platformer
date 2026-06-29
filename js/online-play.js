// ============================================================
// online-play.js — Phase 2 online multiplayer controller (ONLINE_PLAY)
// Account-based (Supabase auth) friends + game sessions + lobby.
// Real-time sync is handled by the existing socket.io engine
// (js/multiplayer.js); this module is discovery + lobby + handoff.
// ============================================================

// Lobby player swatch colors (mirrors the engine's PLAYER_COLORS, which lives
// inside js/multiplayer.js's IIFE and isn't global).
const ONLINE_PLAYER_COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A'];

const ONLINE_PLAY = {
  currentUser: null,
  currentSessionMode: null,
  friends: [],            // [{id, friendId, friendUsername, status, direction}]
  pendingRequests: [],    // PENDING rows (sent + received), enriched
  friendGames: [],        // active sessions from friends (Phase 2B)
  myGames: [],            // caller's own active sessions (for rejoin)
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
  // FRIEND GAMES (discovery)
  // ════════════════════════════════════════════════════════════
  async loadFriendGames() {
    const fetchJson = (url) => AUTH.authedFetch(url)
      .then(r => (r.ok ? r.json() : { sessions: [] }))
      .catch(() => ({ sessions: [] }));
    const [friend, mine] = await Promise.all([
      fetchJson(`/api/friends/${this.currentUser.id}/active-games`),
      fetchJson('/api/game-sessions/mine'),
    ]);
    this.friendGames = friend.sessions || [];
    this.myGames = mine.sessions || [];
    this.renderFriendGames();
  },

  renderFriendGames() {
    const list = document.getElementById('friend-games-list');
    if (!list) return;
    const mine = this.myGames || [];
    const friends = this.friendGames || [];
    if (!mine.length && !friends.length) {
      list.innerHTML = '<p class="empty-note">No active games right now. Create one!</p>';
      return;
    }
    // Own games first (Rejoin — /join is idempotent, so capacity never blocks a
    // returning member), then friends' joinable games.
    const mineHtml = mine.map(g => `
      <div class="game-card">
        <h3>${this._esc(g.world_name)}</h3>
        <p>Your game · ${g.player_count}/${g.max_players} players</p>
        <button class="btn btn-primary" data-act="join-game" data-id="${g.id}">Rejoin</button>
      </div>`).join('');
    const friendsHtml = friends.map(g => `
      <div class="game-card">
        <h3>${this._esc(g.world_name)}</h3>
        <p>Host: ${this._esc(g.creator_name)}</p>
        <p>Players: ${g.player_count}/${g.max_players}</p>
        <button class="btn btn-primary" data-act="join-game" data-id="${g.id}" ${g.is_full ? 'disabled' : ''}>
          ${g.is_full ? 'Full' : 'Join Game'}
        </button>
      </div>`).join('');
    list.innerHTML = mineHtml + friendsHtml;
  },

  // ════════════════════════════════════════════════════════════
  // CREATE GAME
  // ════════════════════════════════════════════════════════════
  async openCreateGameModal() {
    const modal = document.getElementById('create-online-game-modal');
    this._status(document.getElementById('create-online-game-status'), '', '');
    await this._loadWorldsForMode();
    modal.style.display = 'flex';
  },

  closeCreateGameModal() {
    document.getElementById('create-online-game-modal').style.display = 'none';
  },

  async _loadWorldsForMode() {
    const mode = document.getElementById('online-mode-select').value;
    const sel = document.getElementById('online-world-select');
    sel.innerHTML = '<option value="">Loading worlds...</option>';
    try {
      const res = await AUTH.authedFetch(`/api/worlds?mode=${mode}`);
      const data = await res.json();
      const worlds = data.worlds || [];
      if (!worlds.length) {
        sel.innerHTML = '<option value="">No worlds available for this mode</option>';
        return;
      }
      sel.innerHTML = worlds.map(w =>
        `<option value="${w.id}">${this._esc(w.world_name)}${w.mine ? ' (yours)' : ''}</option>`
      ).join('');
    } catch (e) {
      console.error('load worlds error:', e);
      sel.innerHTML = '<option value="">Failed to load worlds</option>';
    }
  },

  async createGame(e) {
    e.preventDefault();
    const status = document.getElementById('create-online-game-status');
    const worldId = document.getElementById('online-world-select').value;
    const maxPlayers = parseInt(document.getElementById('online-max-players-select').value, 10);
    const mode = document.getElementById('online-mode-select').value;
    if (!worldId) { this._status(status, 'Select a world', 'err'); return; }

    try {
      const res = await AUTH.authedFetch('/api/game-sessions/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worldId, maxPlayers }),
      });
      const data = await res.json();
      if (!res.ok) { this._status(status, `❌ ${data.error || 'Failed'}`, 'err'); return; }
      this.currentSession = data;
      this.currentSessionMode = mode;
      this.closeCreateGameModal();
      this.showLobby();
    } catch (err) {
      console.error('createGame error:', err);
      this._status(status, '❌ Network error', 'err');
    }
  },

  // ════════════════════════════════════════════════════════════
  // JOIN + LOBBY
  // ════════════════════════════════════════════════════════════
  async joinGame(sessionId) {
    try {
      const res = await AUTH.authedFetch(`/api/game-sessions/${sessionId}/join`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'Failed to join'); this.loadFriendGames(); return; }
      this.currentSession = data;
      this.currentSessionMode = null; // joiner infers mode from session world on launch (Phase 2C)
      this.showLobby();
    } catch (e) {
      console.error('joinGame error:', e);
      alert('Network error joining game');
    }
  },

  showLobby() {
    document.getElementById('online-play-screen').style.display = 'none';
    document.getElementById('online-lobby-screen').style.display = 'block';
    this.updateLobbyDisplay();
  },

  async refreshLobby() {
    if (!this.currentSession) return;
    try {
      const res = await AUTH.authedFetch(`/api/game-sessions/${this.currentSession.id}`);
      if (res.ok) { this.currentSession = await res.json(); this.updateLobbyDisplay(); }
    } catch (e) { /* non-fatal */ }
  },

  updateLobbyDisplay() {
    const s = this.currentSession;
    if (!s) return;
    document.getElementById('lobby-world-name').textContent = `World: ${s.world_name || ''}`;
    const count = (s.players || []).length;
    document.getElementById('lobby-players-count').textContent = `Players: ${count}/${s.max_players}`;

    const list = document.getElementById('lobby-players-list');
    const isHost = s.creator_id === this.currentUser.id;
    list.innerHTML = (s.player_list || []).map((p, i) => `
      <div class="player-item">
        <span class="player-color" style="background:${ONLINE_PLAYER_COLORS[i % ONLINE_PLAYER_COLORS.length]}"></span>
        <span class="player-name">${this._esc(p.username)}${p.id === s.creator_id ? ' 👑' : ''}${p.id === this.currentUser.id ? ' (you)' : ''}</span>
      </div>`).join('');

    // Each member enters the shared room when ready; the socket.io engine syncs
    // whoever is connected (no separate "host started" broadcast needed). The
    // host (creator) is just whoever connects first → engine player 1.
    const startBtn = document.getElementById('start-game-btn');
    startBtn.style.display = '';
    startBtn.disabled = false;
    startBtn.textContent = isHost ? `Enter Game (host) · ${count}/${s.max_players}` : `Enter Game · ${count}/${s.max_players}`;
  },

  async leaveLobby() {
    const s = this.currentSession;
    if (s) {
      try { await AUTH.authedFetch(`/api/game-sessions/${s.id}/leave`, { method: 'POST' }); }
      catch (e) { /* best effort */ }
    }
    this.currentSession = null;
    document.getElementById('online-lobby-screen').style.display = 'none';
    document.getElementById('online-play-screen').style.display = 'block';
    this.loadFriendGames();
  },

  // ════════════════════════════════════════════════════════════
  // LAUNCH (Phase 2C): enter the live game. new Game({ onlineGameId })
  // auto-connects the socket.io engine (game.js constructor).
  // ════════════════════════════════════════════════════════════
  startGame() {
    const s = this.currentSession;
    if (!s) return;

    // Tear down the legacy menu loop + any prior game (mirrors GAME_PLAY.init).
    if (window.menu && typeof window.menu._stop === 'function') window.menu._stop();
    if (window.game && typeof window.game.destroy === 'function') window.game.destroy();

    // Hide all overlays to reveal the shared canvas; show the play HUD.
    document.getElementById('online-lobby-screen').style.display = 'none';
    document.getElementById('online-play-screen').style.display = 'none';
    document.getElementById('dashboard-screen').style.display = 'none';
    const hud = document.getElementById('play-hud');
    if (hud) hud.style.display = 'flex';
    const title = document.getElementById('play-hud-title');
    if (title) title.textContent = `${s.world_name || 'Online Game'} (Online)`;

    const modeLower = (s.mode || 'NORMAL').toLowerCase();
    const user = this.currentUser;
    const options = {
      onlineGameId:     s.id,
      onlinePlayerName: user.username,
      onlineAppearance: {
        shirtColor: user.avatar_color || '#FF6B6B',
        pantsColor: '#1E1E1E',
        skinColor:  '#F4C090',
      },
      worldData:  s.world_state,
      worldState: s.world_state,
    };
    // Normal/platformer build the adventure level first, then the session world
    // data overrides it — same as the single-player cloud-game path.
    if (modeLower === 'normal' || modeLower === 'platformer') {
      options.world = 'adventure';
      options.templateData = s.world_state;
    }

    window.game = new Game(modeLower, options, () => this._onOnlineGameExit());

    // Reroute the shared HUD buttons to the online teardown (the Phase-1 HUD
    // wiring points Exit at GAME_SELECTION, which isn't our flow).
    const pauseBtn = document.getElementById('play-hud-pause');
    const exitBtn  = document.getElementById('play-hud-exit');
    if (pauseBtn) { pauseBtn.textContent = 'Pause'; pauseBtn.onclick = () => this._togglePause(); }
    if (exitBtn) {
      exitBtn.onclick = () => {
        if (window.game && typeof window.game.destroy === 'function') window.game.destroy();
        window.game = null;
        this._onOnlineGameExit();
      };
    }
  },

  _togglePause() {
    if (!window.game) return;
    const paused = window.game.state === 'paused';
    window.game.state = paused ? 'playing' : 'paused';
    const btn = document.getElementById('play-hud-pause');
    if (btn) btn.textContent = paused ? 'Pause' : 'Resume';
  },

  // Game exited (HUD Exit button or in-game Esc → Exit). Leave the session and
  // return to the online screen.
  async _onOnlineGameExit() {
    window.game = null;
    const hud = document.getElementById('play-hud');
    if (hud) hud.style.display = 'none';

    const s = this.currentSession;
    if (s) {
      try { await AUTH.authedFetch(`/api/game-sessions/${s.id}/leave`, { method: 'POST' }); }
      catch (e) { /* best effort */ }
    }
    this.currentSession = null;

    document.getElementById('online-play-screen').style.display = 'block';
    this.refreshAll();
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

    // Create-game modal
    document.getElementById('online-mode-select')?.addEventListener('change', () => this._loadWorldsForMode());
    document.getElementById('create-online-game-form')?.addEventListener('submit', (e) => this.createGame(e));
    document.getElementById('cancel-online-create-btn')?.addEventListener('click', () => this.closeCreateGameModal());

    // Lobby
    document.getElementById('leave-lobby-btn')?.addEventListener('click', () => this.leaveLobby());
    document.getElementById('start-game-btn')?.addEventListener('click', () => this.startGame());

    // Delegated request/friend/game action buttons (rows are re-rendered).
    document.getElementById('online-play-screen')?.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const id = btn.dataset.id;
      switch (btn.dataset.act) {
        case 'approve':   this._friendAction(id, '/confirm'); break;
        case 'reject':    this._friendAction(id, '/reject', 'POST', 'Reject this friend request?'); break;
        case 'cancel':    this._friendAction(id, '/cancel', 'POST', 'Cancel this friend request?'); break;
        case 'unfriend':  this._friendAction(id, '', 'DELETE', 'Remove this friend?'); break;
        case 'join-game': this.joinGame(id); break;
      }
    });
  },
};
