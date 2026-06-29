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
}

module.exports = { registerAuthRoutes, verifyToken };
