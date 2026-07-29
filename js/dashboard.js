const DASHBOARD = {
  currentUser: null,
  mostRecentWorld: null,

  async init() {
    // A recovery link (Forgot Password email) takes priority over everything:
    // show the reset-password screen regardless of any cached session.
    const recoveryToken = AUTH.getRecoveryFromHash();
    if (recoveryToken) {
      AUTH_UI.showResetScreen(recoveryToken);
      return;
    }

    this.currentUser = AUTH.getUser();

    // Everyone lands on the title screen first — it offers "Play Online" and
    // "Play Offline", so login is no longer forced up front (offline needs none).
    // Validate any cached session in the BACKGROUND so "Play Online" can decide
    // login-vs-dashboard without blocking the choice screen.
    this._sessionCheck = (this.currentUser ? AUTH.ensureValidSession() : Promise.resolve(false))
      .catch(() => false);

    this._showTitleScreen();
  },

  // "Play Online" — go straight to the cloud dashboard if a valid session
  // exists, otherwise show login (which returns here on success).
  async _startOnline() {
    APP_MODE.set('online');
    let ok = false;
    try { ok = this.currentUser ? await this._sessionCheck : false; } catch (e) { ok = false; }
    if (ok) {
      this._enterDashboard();
    } else {
      if (this.currentUser && !ok) { AUTH._clearSession(); this.currentUser = null; }
      this._showLogin();
    }
  },

  // "Play Offline" — guest/local mode; no login required (a logged-in user may
  // also choose this, e.g. on a plane). Worlds come from localStorage.
  _startOffline() {
    APP_MODE.set('local');
    this._enterDashboard();
  },

  // Title splash shown after login. The Start button is the user gesture that
  // unlocks the intro music, mirroring the original pre-login flow.
  _showTitleScreen() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('dashboard-screen').style.display = 'none';
    document.getElementById('start-screen').style.display = 'flex';
  },

  // Reveal the dashboard (game select). Called from the title-screen Start button.
  _enterDashboard() {
    this._showDashboard();
    if (!this._listenersBound) { this._setupListeners(); this._listenersBound = true; }
    this._applyModeUI();
    this._updateUserDisplay();
    // Quick-play / recent worlds come from the server → skip in offline mode.
    if (!APP_MODE.isLocal()) this._loadMostRecentWorld();
  },

  // Show/hide the online-only entry points based on session mode.
  _applyModeUI() {
    const local = APP_MODE.isLocal();
    const online = document.getElementById('online-play-btn');
    const community = document.getElementById('community-btn');
    if (online)    online.style.display    = local ? 'none' : '';
    if (community) community.style.display  = local ? 'none' : '';
    // A "Go Online" affordance to leave offline mode (returns to the choice).
    let go = document.getElementById('go-online-btn');
    if (local && !go) {
      const logout = document.getElementById('logout-btn');
      if (logout && logout.parentNode) {
        go = document.createElement('button');
        go.id = 'go-online-btn';
        go.className = 'btn btn-small';
        go.textContent = '☁ Go Online';
        go.addEventListener('click', () => this._showTitleScreen());
        logout.parentNode.insertBefore(go, logout);
      }
    }
    if (go) go.style.display = local ? '' : 'none';
    // Logout only makes sense when actually logged in.
    const logout = document.getElementById('logout-btn');
    if (logout) logout.style.display = (local && !this.currentUser) ? 'none' : '';
  },

  _showDashboard() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('dashboard-screen').style.display = 'block';
    document.getElementById('start-screen').style.display = 'none';
  },

  _showLogin() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('dashboard-screen').style.display = 'none';
    document.getElementById('start-screen').style.display = 'none';
  },

  _updateUserDisplay() {
    const el = document.getElementById('username-display');
    if (!el) return;
    if (APP_MODE.isLocal()) {
      el.textContent = this.currentUser ? `${this.currentUser.username} (offline)` : 'Guest (offline)';
    } else if (this.currentUser) {
      el.textContent = `Welcome, ${this.currentUser.username}!`;
    }
  },

  _setupListeners() {
    document.getElementById('normal-mode-btn')?.addEventListener('click', () => this._navigateToMode('NORMAL'));
    document.getElementById('platformer-mode-btn')?.addEventListener('click', () => this._navigateToMode('PLATFORMER'));
    document.getElementById('speedrunner-mode-btn')?.addEventListener('click', () => this._navigateToMode('SPEEDRUNNER'));
    document.getElementById('arena-mode-btn')?.addEventListener('click', () => this._navigateToMode('ARENA'));
    document.getElementById('campaign-mode-btn')?.addEventListener('click', () => this._navigateToMode('CAMPAIGN'));
    document.getElementById('sandbox-mode-btn')?.addEventListener('click', () => this._navigateToMode('SANDBOX'));

    document.getElementById('online-play-btn')?.addEventListener('click', () => {
      if (typeof ONLINE_PLAY !== 'undefined') ONLINE_PLAY.init();
    });

    document.getElementById('logout-btn')?.addEventListener('click', () => this._logout());
  },

  // Kept name for existing callers; renders the Quick Play card grid.
  async _loadMostRecentWorld() {
    this._renderQuickPlay();
  },

  // Render 4 equal-sized cards inside the white frame. The most recently played
  // game sits in the rightmost cell; older games shift left and fall off at 4.
  _renderQuickPlay() {
    const grid = document.getElementById('quick-play-grid');
    if (!grid) return;

    const recent = (typeof QUICK_PLAY !== 'undefined') ? QUICK_PLAY.getGames().slice(0, 4) : [];
    this.mostRecentWorld = recent[0] || null;

    // recent is most-recent-first → leftmost cell is the most recent game.
    // Newly played games unshift to the front (left); older ones shift right
    // and the 4th falls off. Right-pad with empty cells to always show 4.
    const cells = recent.concat(Array(Math.max(0, 4 - recent.length)).fill(null));

    grid.innerHTML = cells.map(g => {
      if (!g) return `<div class="qp-card qp-empty"><p class="qp-empty-text">Empty</p></div>`;
      return `
        <div class="qp-card">
          <div class="qp-card-body">
            <h4 class="qp-game-name">${this._esc(g.gameName)}</h4>
            <p class="qp-world-name">World: ${this._esc(g.worldName)}</p>
            <p class="qp-mode">${this._esc(this._modeLabel(g.mode))}</p>
          </div>
          <div class="qp-actions">
            <button class="btn btn-primary qp-play-btn" data-game-id="${g.gameId}" data-mode="${g.mode}">Play</button>
            <button class="btn btn-secondary qp-remove-btn" data-game-id="${g.gameId}">Remove</button>
          </div>
        </div>`;
    }).join('');

    grid.querySelectorAll('.qp-play-btn').forEach(b =>
      b.addEventListener('click', (e) => {
        const el = e.currentTarget;
        this._launchRecent(el.dataset.gameId, el.dataset.mode);
      }));
    grid.querySelectorAll('.qp-remove-btn').forEach(b =>
      b.addEventListener('click', (e) => {
        if (typeof QUICK_PLAY !== 'undefined') QUICK_PLAY.removeGame(e.currentTarget.dataset.gameId);
        this._renderQuickPlay();
      }));
  },

  _modeLabel(m) {
    return { NORMAL: 'Normal', PLATFORMER: 'Platformer', SPEEDRUNNER: 'Speed Runner', SANDBOX: 'Sandbox' }[m] || m || '';
  },

  _esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  // Launch a recent game from the dashboard. Prime GAME_SELECTION with the
  // game's mode so the exit flow (which returns to the slot list) works.
  _launchRecent(gameId, mode) {
    if (typeof QUICK_PLAY !== 'undefined') {
      // Playing a Quick Play game makes it the most-recent → bump to the front
      // (leftmost) so its position updates, even if it wasn't already first.
      const entry = QUICK_PLAY.getGames().find(g => String(g.gameId) === String(gameId));
      if (entry) QUICK_PLAY.addGame(entry);
    }
    if (typeof GAME_SELECTION !== 'undefined' && mode) GAME_SELECTION.currentMode = mode;
    document.getElementById('dashboard-screen').style.display = 'none';
    GAME_PLAY.init(gameId);
  },

  _navigateToMode(mode) {
    // Offline: Sandbox works locally (build/save worlds in localStorage). The
    // other modes' local providers land in later slices — guard them for now.
    if (APP_MODE.isLocal() && mode !== 'SANDBOX') {
      alert('This mode isn’t available offline yet — coming in a later update.\n\nSandbox (build & save your own worlds) works offline now, or choose “☁ Go Online”.');
      return;
    }
    if (mode === 'SANDBOX') {
      SANDBOX.init();
    } else if (mode === 'ARENA') {
      ARENA_SELECT.init();
    } else if (mode === 'CAMPAIGN') {
      CAMPAIGN_SELECT.init();
    } else {
      GAME_SELECTION.init(mode);
    }
  },

  async _logout() {
    if (!confirm('Are you sure you want to logout?')) return;
    await AUTH.logout();
    this.currentUser = null;
    this._showLogin();
    AUTH_UI.reset();
  },
};

// ── Auth UI ────────────────────────────────────────────────
const AUTH_UI = {
  mode: 'login', // 'login' | 'signup'

  init() {
    this._setupTabs();
    this._setupForms();
    this._setupForgotReset();
  },

  _setupTabs() {
    document.getElementById('tab-login')?.addEventListener('click', () => this._switchTab('login'));
    document.getElementById('tab-signup')?.addEventListener('click', () => this._switchTab('signup'));
  },

  _switchTab(mode) {
    this.mode = mode;
    document.getElementById('tab-login').classList.toggle('active', mode === 'login');
    document.getElementById('tab-signup').classList.toggle('active', mode === 'signup');
    document.getElementById('form-login').style.display = mode === 'login' ? 'flex' : 'none';
    document.getElementById('form-signup').style.display = mode === 'signup' ? 'flex' : 'none';
    const forgot = document.getElementById('form-forgot');
    if (forgot) forgot.style.display = 'none';
    this._clearError();
  },

  // ── Forgot / reset password ────────────────────────────────
  _setupForgotReset() {
    document.getElementById('forgot-password-link')?.addEventListener('click', () => this._showForgotView());
    document.getElementById('forgot-back-link')?.addEventListener('click', () => this._switchTab('login'));

    document.getElementById('form-forgot')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('forgot-email').value.trim();
      const status = document.getElementById('forgot-status');
      if (!email) return;
      const btn = e.target.querySelector('.auth-submit');
      if (btn) btn.disabled = true;
      status.style.color = '#aab';
      status.textContent = 'Sending…';
      try {
        // Recovery link returns here; the hash is detected on load (init()).
        const redirectTo = window.location.origin + window.location.pathname;
        const res = await AUTH.requestPasswordReset(email, redirectTo);
        status.style.color = '#6bd08a';
        status.textContent = res.message || 'If that email is registered, a reset link has been sent.';
      } catch (err) {
        status.style.color = '#ff8080';
        status.textContent = err.message || 'Something went wrong.';
      } finally {
        if (btn) btn.disabled = false;
      }
    });

    document.getElementById('form-reset')?.addEventListener('submit', (e) => this._submitReset(e));
  },

  _showForgotView() {
    document.getElementById('form-login').style.display = 'none';
    document.getElementById('form-signup').style.display = 'none';
    document.getElementById('form-forgot').style.display = 'flex';
    document.getElementById('tab-login').classList.remove('active');
    document.getElementById('tab-signup').classList.remove('active');
    this._clearError();
    const s = document.getElementById('forgot-status');
    if (s) s.textContent = '';
  },

  showResetScreen(token) {
    this._resetToken = token;
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('start-screen').style.display = 'none';
    document.getElementById('dashboard-screen').style.display = 'none';
    document.getElementById('reset-password-screen').style.display = 'flex';
  },

  async _submitReset(e) {
    e.preventDefault();
    const pw = document.getElementById('reset-password').value;
    const confirmPw = document.getElementById('reset-password-confirm').value;
    const err = document.getElementById('reset-error');
    const status = document.getElementById('reset-status');
    err.textContent = '';
    status.textContent = '';
    if (pw.length < 6) { err.textContent = 'Password must be at least 6 characters'; return; }
    if (pw !== confirmPw) { err.textContent = 'Passwords do not match'; return; }

    const btn = e.target.querySelector('.auth-submit');
    if (btn) btn.disabled = true;
    status.style.color = '#aab';
    status.textContent = 'Updating…';
    try {
      await AUTH.completePasswordReset(this._resetToken, pw);
      status.style.color = '#6bd08a';
      status.textContent = 'Password updated! Redirecting to login…';
      setTimeout(() => {
        document.getElementById('reset-password-screen').style.display = 'none';
        this._resetToken = null;
        DASHBOARD._showLogin();
        this._switchTab('login');
      }, 1500);
    } catch (e2) {
      err.textContent = e2.message || 'Failed to reset password';
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  _setupForms() {
    document.getElementById('form-login')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      await this._attempt(() => AUTH.login(email, password));
    });

    document.getElementById('form-signup')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('signup-email').value.trim();
      const password = document.getElementById('signup-password').value;
      const username = document.getElementById('signup-username').value.trim();
      await this._attempt(() => AUTH.signup(email, password, username));
    });
  },

  async _attempt(fn) {
    this._clearError();
    this._setLoading(true);
    try {
      await fn();
      DASHBOARD.currentUser = AUTH.getUser();
      APP_MODE.set('online');
      if (window._unlockIntroAudio) window._unlockIntroAudio();
      DASHBOARD._enterDashboard();
    } catch (err) {
      this._showError(err.message);
    } finally {
      this._setLoading(false);
    }
  },

  _showError(msg) {
    const el = document.getElementById('auth-error');
    if (el) el.textContent = msg;
  },

  _clearError() {
    const el = document.getElementById('auth-error');
    if (el) el.textContent = '';
  },

  _setLoading(on) {
    document.querySelectorAll('.auth-submit').forEach(btn => {
      btn.disabled = on;
      btn.textContent = on ? 'Please wait...' : btn.dataset.label;
    });
  },

  reset() {
    document.getElementById('login-email').value = '';
    document.getElementById('login-password').value = '';
    document.getElementById('signup-email').value = '';
    document.getElementById('signup-password').value = '';
    document.getElementById('signup-username').value = '';
    this._clearError();
    this._switchTab('login');
  },
};

document.addEventListener('DOMContentLoaded', () => {
  AUTH_UI.init();
  DASHBOARD.init();
});
