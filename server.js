const http = require('http');
const express = require('express');
const socketIo = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// ============================================================
// MAIN WEB SERVER (port 8000)
// ============================================================

const PORT_WEB = process.env.PORT || 8000;

const webServer = http.createServer((req, res) => {
  // Remove query string
  let urlPath = req.url.split('?')[0];
  
  // Prevent directory traversal
  if (urlPath.includes('..')) {
    res.writeHead(403, {'Content-Type': 'text/plain'});
    res.end('Forbidden');
    return;
  }
  
  // Default to index.html for root
  if (urlPath === '/') {
    urlPath = '/index.html';
  }
  
  // Build file path
  let filePath = path.join(__dirname, urlPath);
  
  // Check if file exists
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, {'Content-Type': 'text/plain'});
      res.end('404 Not Found');
      return;
    }
    
    // Read file
    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        res.writeHead(500, {'Content-Type': 'text/plain'});
        res.end('500 Server Error');
        return;
      }
      
      // Get MIME type
      const ext = path.extname(filePath).toLowerCase();
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
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      
      // Send file
      res.writeHead(200, {'Content-Type': contentType});
      res.end(data);
    });
  });
});

webServer.listen(PORT_WEB, '0.0.0.0', () => {
  console.log(`Web server running on port ${PORT_WEB}`);
});

// ============================================================
// MULTIPLAYER SERVER (port 3000 or custom)
// ============================================================

const PORT_MP = process.env.PORT_MULTIPLAYER || 3000;

const app = express();
const mpServer = http.createServer(app);
const io = socketIo(mpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 50 * 1024 * 1024,
});

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

// In-memory log of recently deleted games
const deletedGamesLog = [];
function logDeletion(entry) {
  deletedGamesLog.unshift({ ...entry, deletedAt: Date.now() });
  if (deletedGamesLog.length > 200) deletedGamesLog.pop();
}

// Default outfits
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

// Load on startup
loadSavedGames();

// ── API Endpoints ──────────────────────────────────────────────

app.post('/api/createGame', (req, res) => {
  const { worldName, mode, playerLimit, password, creator } = req.body;

  if (!worldName || !mode || !playerLimit) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

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

// ── Socket.io Events ──────────────────────────────────────────

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

// ── Start multiplayer server ──────────────────────────────────

mpServer.listen(PORT_MP, '0.0.0.0', () => {
  console.log(`Multiplayer server running on port ${PORT_MP}`);
});

console.log(`\n✅ Steveo Platformer Server Started`);
console.log(`   Web:        http://0.0.0.0:${PORT_WEB}`);
console.log(`   Multiplayer: http://0.0.0.0:${PORT_MP}`);