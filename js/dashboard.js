const DASHBOARD = {
  currentUser: null,
  mostRecentWorld: null,

  async init() {
    this.currentUser = AUTH.getUser();

    if (!this.currentUser) {
      this._showLogin();
      return;
    }

    this._showDashboard();
    this._setupListeners();
    this._updateUserDisplay();
    this._loadMostRecentWorld();
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
    if (el && this.currentUser) {
      el.textContent = `Welcome, ${this.currentUser.username}!`;
    }
  },

  _setupListeners() {
    document.getElementById('normal-mode-btn')?.addEventListener('click', () => this._navigateToMode('NORMAL'));
    document.getElementById('platformer-mode-btn')?.addEventListener('click', () => this._navigateToMode('PLATFORMER'));
    document.getElementById('speedrunner-mode-btn')?.addEventListener('click', () => this._navigateToMode('SPEEDRUNNER'));
    document.getElementById('sandbox-mode-btn')?.addEventListener('click', () => this._navigateToMode('SANDBOX'));

    document.getElementById('quick-play-btn')?.addEventListener('click', () => this._quickPlay());

    document.getElementById('online-play-btn')?.addEventListener('click', () => {
      alert('Online Play — coming in Phase 2!');
    });

    document.getElementById('logout-btn')?.addEventListener('click', () => this._logout());
  },

  async _loadMostRecentWorld() {
    // Populated in Phase 1D when game history is tracked
    const text = document.getElementById('most-recent-text');
    const btn = document.getElementById('quick-play-btn');
    if (text) text.textContent = 'Play your first world to see it here';
    if (btn) btn.style.display = 'none';
  },

  _navigateToMode(mode) {
    GAME_SELECTION.init(mode);
  },

  _quickPlay() {
    if (this.mostRecentWorld) {
      console.log(`Quick playing: ${this.mostRecentWorld.name}`);
    } else {
      alert('No recent worlds. Create a new game first!');
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
    this._clearError();
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
      DASHBOARD._showDashboard();
      DASHBOARD._setupListeners();
      DASHBOARD._updateUserDisplay();
      DASHBOARD._loadMostRecentWorld();
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
