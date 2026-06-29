const AUTH = {
  token: null,
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
      this.token = null;
      this.user = null;
      localStorage.removeItem('authToken');
      localStorage.removeItem('user');
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

  getUser() {
    return this.user || JSON.parse(localStorage.getItem('user') || 'null');
  },

  isLoggedIn() {
    return !!this.getToken();
  },

  _storeSession(data) {
    this.token = data.session.accessToken;
    this.user = data.user;
    localStorage.setItem('authToken', this.token);
    localStorage.setItem('user', JSON.stringify(this.user));
  },
};
