const AUTH = {
  token: null,
  refreshToken: null,
  user: null,

  async signup(email, password, username) {
    const response = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, username }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    this._storeSession(data);
    return data;
  },

  async login(email, password) {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    this._storeSession(data);
    return data;
  },

  async logout() {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.getToken()}` },
      });
    } finally {
      this._clearSession();
    }
  },

  async getProfile() {
    const response = await fetch('/api/auth/profile', {
      headers: { 'Authorization': `Bearer ${this.getToken()}` },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    return data;
  },

  getToken() {
    return this.token || localStorage.getItem('authToken');
  },

  getRefreshToken() {
    return this.refreshToken || localStorage.getItem('refreshToken');
  },

  getUser() {
    return this.user || JSON.parse(localStorage.getItem('user') || 'null');
  },

  isLoggedIn() {
    return !!this.getToken();
  },

  // Exchange the stored refresh token for a fresh access token.
  // Returns true on success, false if the session can't be refreshed.
  async refresh() {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) return false;
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!response.ok) return false;
      const data = await response.json();
      this.token = data.session.accessToken;
      this.refreshToken = data.session.refreshToken;
      localStorage.setItem('authToken', this.token);
      localStorage.setItem('refreshToken', this.refreshToken);
      return true;
    } catch (e) {
      return false;
    }
  },

  // Validate the stored session without side effects (no reload). Tries the
  // current token, then a refresh. Returns true if the session is usable.
  async ensureValidSession() {
    if (!this.getToken()) return false;
    try {
      const response = await fetch('/api/auth/profile', {
        headers: { Authorization: `Bearer ${this.getToken()}` },
      });
      if (response.ok) return true;
      if (response.status === 401) return await this.refresh();
      return false;
    } catch (e) {
      return false;
    }
  },

  // Authenticated fetch. Injects the bearer token and, on a 401, transparently
  // refreshes the session and retries once. If refresh fails the (expired)
  // session is cleared and the user is sent back to the login screen.
  async authedFetch(url, options = {}) {
    const withAuth = (token) => ({
      ...options,
      headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` },
    });

    let response = await fetch(url, withAuth(this.getToken()));
    if (response.status === 401) {
      const refreshed = await this.refresh();
      if (refreshed) {
        response = await fetch(url, withAuth(this.getToken()));
      }
      if (response.status === 401) {
        this._clearSession();
        window.location.reload();
        throw new Error('Session expired — please log in again');
      }
    }
    return response;
  },

  // Send a password-reset email. `redirectTo` is where the email link returns
  // the user (with a recovery token in the URL hash) — must be allow-listed in
  // Supabase Auth → URL Configuration.
  async requestPasswordReset(email, redirectTo) {
    const response = await fetch('/api/auth/request-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, redirectTo }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Request failed');
    return data;
  },

  // Complete a reset using the recovery access token from the email link.
  async completePasswordReset(accessToken, newPassword) {
    const response = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken, newPassword }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Reset failed');
    return data;
  },

  // Detect a Supabase recovery redirect (#access_token=...&type=recovery&...).
  // Returns the recovery access token if present, else null, and strips the
  // hash so a refresh doesn't re-open the reset screen.
  getRecoveryFromHash() {
    const hash = window.location.hash || '';
    if (hash.indexOf('type=recovery') === -1) return null;
    const params = new URLSearchParams(hash.slice(1));
    const token = params.get('access_token');
    if (params.get('type') === 'recovery' && token) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
      return token;
    }
    return null;
  },

  _storeSession(data) {
    this.token = data.session.accessToken;
    this.refreshToken = data.session.refreshToken;
    this.user = data.user;
    localStorage.setItem('authToken', this.token);
    if (this.refreshToken) localStorage.setItem('refreshToken', this.refreshToken);
    localStorage.setItem('user', JSON.stringify(this.user));
  },

  _clearSession() {
    this.token = null;
    this.refreshToken = null;
    this.user = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
  },
};
