const { supabaseAdmin, supabaseAuth } = require('./supabase-client');

// Middleware to verify JWT token from Authorization: Bearer <token>
const verifyToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });

    const { data: { user }, error } = await supabaseAuth.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Invalid token' });

    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Token verification failed' });
  }
};

function registerAuthRoutes(app) {
  // POST /api/auth/signup
  app.post('/api/auth/signup', async (req, res) => {
    try {
      const { email, password, username } = req.body;

      if (!email || !password || !username) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      if (username.length < 3 || username.length > 20) {
        return res.status(400).json({ error: 'Username must be 3-20 characters' });
      }

      // Check username uniqueness (admin DB client — no session contamination)
      const { data: existingUser } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('username', username)
        .single();

      if (existingUser) {
        return res.status(400).json({ error: 'Username already taken' });
      }

      // Create Supabase Auth user (auth client)
      const { data: authData, error: authError } = await supabaseAuth.auth.signUp({ email, password });
      if (authError) return res.status(400).json({ error: authError.message });
      if (!authData.user) return res.status(400).json({ error: 'Signup failed — check email confirmation settings' });

      // Insert user record (admin DB client)
      const { data: userData, error: dbError } = await supabaseAdmin
        .from('users')
        .insert({
          id: authData.user.id,
          email,
          username,
          avatar_color: '#FF6B6B',
        })
        .select()
        .single();

      if (dbError) {
        await supabaseAuth.auth.admin.deleteUser(authData.user.id);
        return res.status(400).json({ error: 'Failed to create user' });
      }

      // Sign in to get session tokens (auth client)
      const { data: sessionData, error: signInError } = await supabaseAuth.auth.signInWithPassword({ email, password });
      if (signInError) return res.status(400).json({ error: signInError.message });

      res.json({
        user: userData,
        session: {
          accessToken: sessionData.session.access_token,
          refreshToken: sessionData.session.refresh_token,
        },
      });
    } catch (err) {
      console.error('Signup error:', err);
      res.status(500).json({ error: 'Signup failed' });
    }
  });

  // POST /api/auth/login
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'Missing email or password' });
      }

      // Authenticate (auth client)
      const { data: sessionData, error: authError } = await supabaseAuth.auth.signInWithPassword({ email, password });
      if (authError) return res.status(401).json({ error: 'Invalid credentials' });

      // Fetch user record (admin DB client — bypasses RLS, no session state)
      const { data: userData, error: userError } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('id', sessionData.user.id)
        .single();

      if (userError) return res.status(500).json({ error: 'Failed to get user data' });

      await supabaseAdmin
        .from('users')
        .update({ last_login: new Date().toISOString() })
        .eq('id', sessionData.user.id);

      res.json({
        user: userData,
        session: {
          accessToken: sessionData.session.access_token,
          refreshToken: sessionData.session.refresh_token,
        },
      });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  // GET /api/auth/profile
  app.get('/api/auth/profile', verifyToken, async (req, res) => {
    try {
      const { data: userData, error } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('id', req.user.id)
        .single();

      if (error) return res.status(404).json({ error: 'User not found' });

      res.json(userData);
    } catch (err) {
      console.error('Profile error:', err);
      res.status(500).json({ error: 'Failed to get profile' });
    }
  });

  // POST /api/auth/refresh — exchange a refresh token for a fresh access token
  app.post('/api/auth/refresh', async (req, res) => {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) return res.status(400).json({ error: 'No refresh token' });

      const { data, error } = await supabaseAuth.auth.refreshSession({ refresh_token: refreshToken });
      if (error || !data?.session) {
        return res.status(401).json({ error: 'Refresh failed' });
      }

      res.json({
        session: {
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
        },
      });
    } catch (err) {
      console.error('Refresh error:', err);
      res.status(500).json({ error: 'Refresh failed' });
    }
  });

  // POST /api/auth/logout
  app.post('/api/auth/logout', verifyToken, async (req, res) => {
    try {
      const { error } = await supabaseAuth.auth.signOut();
      if (error) return res.status(400).json({ error: error.message });
      res.json({ message: 'Logged out successfully' });
    } catch (err) {
      res.status(500).json({ error: 'Logout failed' });
    }
  });

  // POST /api/auth/request-reset — send a password-reset email.
  // Supabase emails a recovery link that redirects back to `redirectTo` with a
  // recovery access_token in the URL hash; the client then calls reset-password.
  // Always responds 200 (even for unknown emails) so we don't leak which
  // addresses are registered.
  app.post('/api/auth/request-reset', async (req, res) => {
    try {
      const { email, redirectTo } = req.body || {};
      if (!email) return res.status(400).json({ error: 'Email required' });

      const options = redirectTo ? { redirectTo } : undefined;
      const { error } = await supabaseAuth.auth.resetPasswordForEmail(email, options);
      // Log server-side (e.g. SMTP not configured) but don't surface to caller.
      if (error) console.error('request-reset (suppressed):', error.message);

      res.json({ message: 'If that email is registered, a reset link has been sent.' });
    } catch (err) {
      console.error('Request reset error:', err);
      // Still 200 — don't reveal anything to the caller.
      res.json({ message: 'If that email is registered, a reset link has been sent.' });
    }
  });

  // POST /api/auth/reset-password — complete a reset.
  // `accessToken` is the short-lived recovery token from the email link's hash.
  // We validate it (identifies the user), then set the new password via the
  // admin API — no prior session required.
  app.post('/api/auth/reset-password', async (req, res) => {
    try {
      const { accessToken, newPassword } = req.body || {};
      if (!accessToken || !newPassword) {
        return res.status(400).json({ error: 'Missing reset token or new password' });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }

      const { data: { user }, error } = await supabaseAdmin.auth.getUser(accessToken);
      if (error || !user) {
        return res.status(401).json({ error: 'Reset link is invalid or has expired — request a new one' });
      }

      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
        password: newPassword,
      });
      if (updateError) return res.status(400).json({ error: updateError.message });

      res.json({ message: 'Password updated. You can now log in with your new password.' });
    } catch (err) {
      console.error('Reset password error:', err);
      res.status(500).json({ error: 'Failed to reset password' });
    }
  });
}

module.exports = { registerAuthRoutes, verifyToken };
