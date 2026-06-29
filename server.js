const http = require('http');
const express = require('express');
const socketIo = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { supabaseAdmin } = require('./server/supabase-client');

// ============================================================
// Express app for API + Multiplayer
// ============================================================

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ── Server state ──────────────────────────────────────────────
const worlds  = new Map();
const players = new Map();
const games   = new Map();

// ── Game lifecycle rules ──────────────────────────────────────
const LIFECYCLE = {
  platformer: { displayDays: 1,  deleteDays: 2  },
  normal:     { displayDays: 7,  deleteDays: 8  },
  sandbox:    { displayDays: 14, deleteDays: 15 },
};

const deletedGamesLog = [];
function logDeletion(entry) {
  deletedGamesLog.unshift({ ...entry, deletedAt: Date.now() });
  if (deletedGamesLog.length > 200) deletedGamesLog.pop();
}

const DEFAULT_OUTFITS = {
  1: { shirtColor: '#FF6B6B', pantsColor: '#1E1E1E', skinColor: '#F4C090' },
  2: { shirtColor: '#4ECDC4', pantsColor: '#2C5F7C', skinColor: '#F4C090' },
  3: { shirtColor: '#45B7D1', pantsColor: '#0F3460', skinColor: '#F4C090' },
  4: { shirtColor: '#FFA07A', pantsColor: '#8B4513', skinColor: '#F4C090' },
};

// ── Password helpers ──────────────────────────────────────────
function hashPassword(pw) { return Buffer.from(pw).toString('base64'); }
function verifyPassword(pw, hash) { return hashPassword(pw) === hash; }

// ── Save migration ────────────────────────────────────────────
function migrateSaveData(data) {
  if (!data || typeof data !== 'object') return data;
  if (data.saveVersion === 2) return data;

  const mult = data.multiplierSettings || {};
  const worldAdvSettings = {
    bossHealthMultiplier:     mult.bossHealthMultiplier     ?? 1.0,
    bossDamageMultiplier:     mult.bossDamageMultiplier     ?? 1.0,
    bossAttackRateMultiplier: mult.bossAttackRateMultiplier ?? 1.0,
  };

  return {
    ...data,
    saveVersion: 2,
    worldAdvSettings,
  };
}

// ── Load saved games ──────────────────────────────────────────
function loadSavedGames() {
  const savesDir = path.join(__dirname, 'saves');
  if (!fs.existsSync(savesDir)) {
    console.log('No saves directory found');
    return;
  }

  const files = fs.readdirSync(savesDir);
  files.forEach(file => {
    if (file.endsWith('.json')) {
      try {
        const filePath = path.join(savesDir, file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const migrated = migrateSaveData(data);
        
        const worldId = `world-${Date.now()}-${Math.random()}`;
        worlds.set(worldId, migrated);
      } catch (err) {
        console.error(`Error loading save file ${file}:`, err.message);
      }
    }
  });

  console.log(`Loaded ${worlds.size} saved games`);
}

// worlds.id / games.world_id are UUID columns, so default worlds need a stable
// UUID — not a free-form string. Derive one deterministically from the filename
// (UUID v5 style) so the same file always maps to the same id across restarts,
// keeping the insert idempotent.
function defaultWorldUuid(file) {
  const h = crypto.createHash('sha1')
    .update(`steveo-default-world:${file}`)
    .digest('hex');
  const variant = ((parseInt(h.substr(16, 2), 16) & 0x3f) | 0x80).toString(16);
  return [
    h.substr(0, 8),
    h.substr(8, 4),
    '5' + h.substr(13, 3),     // version 5
    variant + h.substr(18, 2), // variant 10xx
    h.substr(20, 12),
  ].join('-');
}

function detectMode(file) {
  if (file.includes('speedrunner')) return 'SPEEDRUNNER';
  if (file.includes('normal')) return 'NORMAL';
  return 'PLATFORMER';
}

// worlds.creator_id is a NOT NULL FK into public.users, so default ("System")
// worlds need a real owner row. Seed a dedicated, fixed system user once so the
// worlds inserts have a stable creator to reference.
const SYSTEM_USER_ID = '00000000-0000-4000-8000-000000000001';

async function ensureSystemUser() {
  const { error } = await supabaseAdmin
    .from('users')
    .upsert({
      id: SYSTEM_USER_ID,
      username: 'System',
      email: 'system@steveo.local',
      avatar_color: '#888888',
    }, { onConflict: 'id' });

  if (error) throw new Error(`Failed to ensure system user: ${error.message}`);
}

async function loadDefaultWorlds() {
  const defaultWorldsDir = path.join(__dirname, 'default-worlds');

  if (!fs.existsSync(defaultWorldsDir)) {
    console.log('No default-worlds directory found');
    return;
  }

  await ensureSystemUser();

  const files = fs.readdirSync(defaultWorldsDir);
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      const filePath = path.join(defaultWorldsDir, file);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const migrated = migrateSaveData(data);

      const worldId = defaultWorldUuid(file);
      const mode = detectMode(file);
      worlds.set(worldId, migrated);

      // Mirror into Supabase so /api/games/create can find the world by id.
      const { data: existing } = await supabaseAdmin
        .from('worlds')
        .select('id')
        .eq('id', worldId)
        .single();

      if (existing) {
        console.log(`  ✓ Default world already exists: ${file}`);
        continue;
      }

      // Display name: explicit world_name wins; otherwise any "*-default" file
      // shows as a clean "Default" in its mode's dropdown, else the filename.
      const baseName = file.replace('.json', '');
      const displayName = data.world_name || (/-default$/.test(baseName) ? 'Default' : baseName);

      const { error: insertError } = await supabaseAdmin
        .from('worlds')
        .insert({
          id: worldId,
          world_name: displayName,
          creator_id: SYSTEM_USER_ID,
          creator_name: 'System',
          mode,
          world_data: migrated,
          is_published: true,
        });

      if (insertError) throw insertError;
      console.log(`  ✓ Loaded default world: ${file} (${mode})`);
    } catch (err) {
      console.error(`Error loading default world ${file}:`, err.message);
    }
  }
}

loadSavedGames();


require('dotenv').config();
// Setup auth routes (this adds the endpoints)
const { registerAuthRoutes } = require('./server/auth-routes');
registerAuthRoutes(app);

const setupGamesRoutes = require('./server/games-routes');
setupGamesRoutes(app);

const setupWorldsRoutes = require('./server/worlds-routes');
setupWorldsRoutes(app);

// Phase 2: online multiplayer — friends + game sessions
const setupFriendsRoutes = require('./server/friends-routes');
setupFriendsRoutes(app);

const setupGameSessionsRoutes = require('./server/game-sessions-routes');
setupGameSessionsRoutes(app);

// ============================================================
// API ENDPOINTS (Express Routes)
// ============================================================

app.post('/api/createGame', (req, res) => {
  const { worldName, mode, maxPlayers, password, creatorName } = req.body;

  if (!worldName || !mode || !maxPlayers) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const playerLimit = maxPlayers;
  const creator = creatorName;
  const gameId = `game-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const passwordHash = password ? hashPassword(password) : null;

  const gameEntry = {
    gameId,
    worldName,
    mode,
    playerLimit,
    passwordHash,
    creator,
    createdAt: Date.now(),
    lastAccessedTime: Date.now(),
    playersJoined: 1,
    currentPlayers: [],
  };

  games.set(gameId, gameEntry);

  res.json({ gameId, success: true });
});

app.get('/api/listGames', (req, res) => {
  const gameList = Array.from(games.values())
    .filter(game => game.playersJoined < game.playerLimit)
    .map(game => ({
      gameId: game.gameId,
      worldName: game.worldName,
      mode: game.mode,
      playerLimit: game.playerLimit,
      playersJoined: game.playersJoined,
      creator: game.creator,
      needsPassword: !!game.passwordHash,
    }));

  res.json(gameList);
});

app.post('/api/joinGame', (req, res) => {
  const { gameId, password } = req.body;

  const game = games.get(gameId);
  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }

  if (game.passwordHash && !verifyPassword(password, game.passwordHash)) {
    return res.status(403).json({ error: 'Invalid password' });
  }

  if (game.playersJoined >= game.playerLimit) {
    return res.status(400).json({ error: 'Game is full' });
  }

  game.playersJoined++;
  game.lastAccessedTime = Date.now();

  res.json({ gameId, success: true });
});

app.post('/api/deleteGame', (req, res) => {
  const { gameId } = req.body;

  const game = games.get(gameId);
  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }

  logDeletion(game);
  games.delete(gameId);

  res.json({ success: true });
});

// ============================================================
// STATIC FILE SERVING (Express Middleware)
// ============================================================

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg'
};

app.use((req, res, next) => {
  // Skip API routes
  if (req.url.startsWith('/api/')) {
    return next();
  }

  let urlPath = req.url.split('?')[0];
  
  if (urlPath.includes('..')) {
    res.writeHead(403, {'Content-Type': 'text/plain'});
    res.end('Forbidden');
    return;
  }
  
  if (urlPath === '/') {
    urlPath = '/index.html';
  }
  
  let filePath = path.join(__dirname, urlPath);
  
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      return next(); // Let Express handle 404
    }
    
    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        res.writeHead(500, {'Content-Type': 'text/plain'});
        res.end('500 Server Error');
        return;
      }
      
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      
      res.writeHead(200, {'Content-Type': contentType});
      res.end(data);
    });
  });
});

// ============================================================
// SOCKET.IO
// ============================================================

const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 50 * 1024 * 1024,
});

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  socket.on('playerJoined', (data) => {
    players.set(socket.id, {
      socketId: socket.id,
      playerName: data.playerName,
      appearance: data.appearance,
    });
    socket.broadcast.emit('playerJoined', { playerId: socket.id, ...data });
  });

  socket.on('updatePosition', (data) => {
    socket.broadcast.emit('playerMoved', { playerId: socket.id, ...data });
  });

  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    players.delete(socket.id);
    socket.broadcast.emit('playerLeft', { playerId: socket.id });
  });
});

// ============================================================
// START SERVER
// ============================================================

const PORT = process.env.PORT || 8000;

async function startServer() {
  await loadDefaultWorlds();

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✅ Steveo Platformer Server Started`);
    console.log(`   URL: http://0.0.0.0:${PORT}`);
    console.log(`   API: ${PORT}/api/*`);
  });
}

startServer();