// ============================================================
// server/multiplayer-engine.js — socket.io real-time engine (Phase 2C)
//
// Extracted verbatim from server-multiplayer.js so the SAME mature engine
// (remote players, blocks, mobs, redstone, chat, drops, day/night) can be
// attached to the ACTIVE web server (server.js) instead of being orphaned on
// the legacy worker process. The browser client (js/multiplayer.js) connects
// to window.location.origin = server.js, so this is what makes online play
// actually work. The room key (worldId) is the Supabase game_sessions id;
// the host supplies worldData (= session.world_state) on joinWorld, so no
// pre-registered in-memory game entry is required.
// ============================================================

const fs = require('fs');
const path = require('path');

const DEFAULT_OUTFITS = {
  1: { shirtColor: '#FF6B6B', pantsColor: '#1E1E1E', skinColor: '#F4C090' },
  2: { shirtColor: '#4ECDC4', pantsColor: '#2C5F7C', skinColor: '#F4C090' },
  3: { shirtColor: '#45B7D1', pantsColor: '#0F3460', skinColor: '#F4C090' },
  4: { shirtColor: '#FFA07A', pantsColor: '#8B4513', skinColor: '#F4C090' },
};

// ── Engine state (in-memory; resets on restart) ───────────────
const worlds  = new Map();  // worldId → World
const players = new Map();  // socketId → playerData
const games   = new Map();  // legacy discovery hints — unused here, kept so the
                            // extracted handler's optional games.get/delete are no-ops

function gridToBlocks(grid) {
  if (!Array.isArray(grid)) return {};
  const sparse = {};
  for (let row = 0; row < grid.length; row++) {
    if (!Array.isArray(grid[row])) continue;
    for (let col = 0; col < grid[row].length; col++) {
      const b = grid[row][col];
      if (b !== 0 && b != null) sparse[`${col},${row}`] = b;
    }
  }
  return sparse;
}

// ── World class ───────────────────────────────────────────────
class World {
  constructor(worldId, worldData = {}) {
    worldData = worldData || {};  // guard: default only fires for undefined, not null
    this.worldId    = worldId;
    this.name       = worldData.name || worldData.worldName || worldId;
    this.mode       = worldData.mode || 'sandbox';
    this.maxPlayers = worldData.maxPlayers || 4;
    // Accept either sparse blocks map or full 2D grid (local save format)
    this.blocks     = worldData.blocks || gridToBlocks(worldData.grid);
    // Dropped items (multiplayer runtime) — separate from sandbox placedItems
    this.items      = worldData.items  || [];
    this.players    = new Map();
    this.createdAt  = Date.now();
    // Accept both legacy multiplierSettings and migrated worldAdvSettings
    const advSrc = worldData.worldAdvSettings || worldData.multiplierSettings || {};
    this.multiplierSettings = {
      bossHealthMultiplier:     advSrc.bossHealthMultiplier     ?? 1.0,
      bossDamageMultiplier:     advSrc.bossDamageMultiplier     ?? 1.0,
      bossAttackRateMultiplier: advSrc.bossAttackRateMultiplier ?? 1.0,
    };
    // ── Overlay / state data (passed from client v2 save format) ──
    // These are not derivable from the grid so must be stored explicitly.
    this.dustBlocks      = Array.isArray(worldData.dustBlocks)      ? worldData.dustBlocks      : [];
    this.gateBlocks      = Array.isArray(worldData.gateBlocks)      ? worldData.gateBlocks      : [];
    this.transmitters    = Array.isArray(worldData.transmitters)    ? worldData.transmitters    : [];
    this.receivers       = Array.isArray(worldData.receivers)       ? worldData.receivers       : [];
    this.sandboxLevers   = Array.isArray(worldData.sandboxLevers)   ? worldData.sandboxLevers   : [];
    this.sandboxTrapdoors= Array.isArray(worldData.sandboxTrapdoors)? worldData.sandboxTrapdoors: [];
    this.sandboxPistons  = Array.isArray(worldData.sandboxPistons)  ? worldData.sandboxPistons  : [];
    this.placedItems     = Array.isArray(worldData.placedItems)     ? worldData.placedItems     : [];
    this.spawnEggs       = Array.isArray(worldData.spawnEggs)       ? worldData.spawnEggs       : [];
    this.chests          = Array.isArray(worldData.chests)          ? worldData.chests          : [];
    // Phase 17-E: Live state (not persisted; reset on server restart)
    this.cachedMobs      = [];
    this.cachedDayNight  = null;
    this.cachedChests    = {}; // 'col,row' → {col, row, items}
    this.cachedAltars    = {}; // 'anchorRow,anchorCol' → {anchorRow, anchorCol, skulls, sand}
  }

  addPlayer(id, data)  { this.players.set(id, data); }
  removePlayer(id)     { this.players.delete(id); }
  getPlayerCount()     { return this.players.size; }
  isFull()             { return this.players.size >= this.maxPlayers; }

  setBlock(col, row, type) { this.blocks[`${col},${row}`] = type; }
  clearBlock(col, row)     { delete this.blocks[`${col},${row}`]; }

  nextPlayerNumber() {
    const used = new Set([...this.players.values()].map(p => p.number));
    for (let n = 1; n <= 4; n++) if (!used.has(n)) return n;
    return null;
  }

  toJSON() {
    return {
      saveVersion:        2,
      worldId:            this.worldId,
      name:               this.name,
      mode:               this.mode,
      maxPlayers:         this.maxPlayers,
      blocks:             this.blocks,
      items:              this.items,
      multiplierSettings: this.multiplierSettings,
      playerCount:        this.players.size,
      // Overlay / state arrays — preserved so downloads contain full world data
      dustBlocks:         this.dustBlocks,
      gateBlocks:         this.gateBlocks,
      transmitters:       this.transmitters,
      receivers:          this.receivers,
      sandboxLevers:      this.sandboxLevers,
      sandboxTrapdoors:   this.sandboxTrapdoors,
      sandboxPistons:     this.sandboxPistons,
      placedItems:        this.placedItems,
      spawnEggs:          this.spawnEggs,
      chests:             this.chests,
    };
  }
}

// ── Persistence ───────────────────────────────────────────────
// This module lives in server/, but saves live at the repo root, so step up one.
const SAVES_DIR = path.join(__dirname, '..', 'saves');

function safeName(id) { return id.replace(/[^a-zA-Z0-9_-]/g, '_'); }

function saveWorldToDisk(worldId, world) {
  if (!fs.existsSync(SAVES_DIR)) fs.mkdirSync(SAVES_DIR, { recursive: true });
  try {
    fs.writeFileSync(path.join(SAVES_DIR, `${safeName(worldId)}.json`), JSON.stringify(world.toJSON(), null, 2));
  } catch (e) { console.error(`Save failed for ${worldId}:`, e.message); }
}

function loadWorldFromDisk(worldId) {
  try {
    const p = path.join(SAVES_DIR, `${safeName(worldId)}.json`);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) { return null; }
}

// ── Attach all socket.io handlers to an existing io instance ──
function attachMultiplayer(io) {
io.on('connection', socket => {
  console.log(`[+] ${socket.id}`);

  socket.on('joinWorld', data => {
    const { worldId, worldData = {}, playerName = 'Player',
            shirtColor, pantsColor, skinColor, browserId } = data || {};
    if (!worldId) { socket.emit('joinFailed', { reason: 'No worldId provided' }); return; }

    let world = worlds.get(worldId);
    if (!world) {
      const saved = loadWorldFromDisk(worldId);
      const init = saved || worldData || {};
      const gameEntry = games.get(worldId);
      if (gameEntry) init.maxPlayers = gameEntry.maxPlayers;
      world = new World(worldId, init);
      worlds.set(worldId, world);
      console.log(`  ${saved ? 'Loaded' : 'Created'} world "${worldId}"`);
    }

    if (world.isFull()) {
      socket.emit('joinFailed', { reason: `World is full (max ${world.maxPlayers} players)` });
      return;
    }

    const number   = world.nextPlayerNumber();
    const playerId = `player${number}`;
    const outfit   = DEFAULT_OUTFITS[number] || DEFAULT_OUTFITS[1];

    const playerData = {
      playerId, socketId: socket.id,
      name:       playerName || `Player ${number}`,
      number,     worldId,  browserId: browserId || null,
      x: 0, y: 0, hp: 20,
      inventory:  null,   // populated by syncInventory events
      shirtColor: shirtColor || outfit.shirtColor,
      pantsColor: pantsColor || outfit.pantsColor,
      skinColor:  skinColor  || outfit.skinColor,
    };

    world.addPlayer(playerId, playerData);
    players.set(socket.id, playerData);
    socket.join(worldId);

    // Update game entry
    const ge = games.get(worldId);
    if (ge) {
      ge.currentPlayers  = world.getPlayerCount();
      ge.lastAccessedAt  = Date.now();
    }

    // Check for saved player state (Normal mode only)
    const savedState = (ge && ge.playerStates && browserId)
      ? ge.playerStates[browserId] : null;

    // Player 1 is always the host/creator — simpler and more reliable than browserId matching
    const isCreator = number === 1;

    socket.emit('joinSuccess', {
      playerId, playerNumber: number,
      worldState:      world.toJSON(),
      currentPlayers:  [...world.players.values()].filter(p => p.playerId !== playerId),
      isCreator,
      savedState:      (savedState && world.mode === 'normal') ? savedState : null,
      cachedMobs:      world.cachedMobs,
      cachedDayNight:  world.cachedDayNight,
      cachedChests:    world.cachedChests,
      cachedAltars:    world.cachedAltars,
    });

    socket.to(worldId).emit('playerJoined', {
      playerId, playerNumber: number,
      name:       playerData.name,
      shirtColor: playerData.shirtColor,
      pantsColor: playerData.pantsColor,
      skinColor:  playerData.skinColor,
    });

    console.log(`  ${playerData.name} → "${worldId}" (player ${number})`);
  });

  socket.on('playerMove', data => {
    const pd = players.get(socket.id);
    if (!pd) return;
    pd.x = data.x; pd.y = data.y;
    socket.to(pd.worldId).emit('playerMoved', {
      playerId:   pd.playerId,
      x: data.x,  y: data.y,
      vx: data.vx || 0, vy: data.vy || 0,
      shirtColor: pd.shirtColor,
      pantsColor: pd.pantsColor,
      skinColor:  pd.skinColor,
      name:       pd.name,
      facing:     data.facing,
      crouching:  data.crouching,
      swingTimer: data.swingTimer,
    });
  });

  // Phase 17-G: Host relays mob damage directly to target joiner's socket
  socket.on('remotePlayerDamaged', data => {
    const pd = players.get(socket.id);
    if (!pd || !data.targetPlayerId) return;
    for (const [sid, p] of players) {
      if (p.worldId === pd.worldId && p.playerId === data.targetPlayerId) {
        io.to(sid).emit('remotePlayerDamaged', data);
        break;
      }
    }
  });

  socket.on('placeBlock', data => {
    const pd = players.get(socket.id);
    const world = worlds.get(pd?.worldId);
    if (!world || !pd) return;
    world.blocks[`${data.col},${data.row}`] = data.blockType;
    io.to(pd.worldId).emit('blockPlaced', { col: data.col, row: data.row, blockType: data.blockType, playerId: pd.playerId });
  });

  socket.on('breakBlock', data => {
    const pd = players.get(socket.id);
    const world = worlds.get(pd?.worldId);
    if (!world || !pd) return;
    delete world.blocks[`${data.col},${data.row}`];
    io.to(pd.worldId).emit('blockBroken', { col: data.col, row: data.row, playerId: pd.playerId });
  });

  socket.on('dropItem', data => {
    const pd = players.get(socket.id);
    const world = worlds.get(pd?.worldId);
    if (!world || !pd) return;
    const item = {
      id:        `item-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
      type:      data.type, x: data.x, y: data.y,
      playerId:  pd.playerId, droppedAt: Date.now(),
    };
    world.items.push(item);
    io.to(pd.worldId).emit('itemDropped', item);
  });

  socket.on('pickupItem', data => {
    const pd = players.get(socket.id);
    const world = worlds.get(pd?.worldId);
    if (!world || !pd) return;
    const idx = world.items.findIndex(it => it.id === data.itemId);
    if (idx < 0) return;
    world.items.splice(idx, 1);
    io.to(pd.worldId).emit('itemPickedUp', { itemId: data.itemId, byPlayer: pd.playerId });
  });

  socket.on('bossDamage', data => {
    const pd = players.get(socket.id);
    if (!pd) return;
    io.to(pd.worldId).emit('bossDamaged', { bossType: data.bossType, damage: data.damage, newHp: data.newHp, playerId: pd.playerId });
  });

  socket.on('playerRespawn', data => {
    const pd = players.get(socket.id);
    if (!pd) return;
    pd.x = data.x; pd.y = data.y; pd.hp = 20;
    io.to(pd.worldId).emit('playerRespawned', { playerId: pd.playerId, x: data.x, y: data.y });
  });

  socket.on('chatMessage', (data) => {
    const { worldId, playerName, shirtColor, message } = data;
    if (!worldId || !message || message.trim() === '') return;
    const safe = message.trim().slice(0, 100);
    io.to(worldId).emit('chatMessage', {
      playerName: playerName || 'Unknown',
      shirtColor: shirtColor || '#ffffff',
      message: safe,
      timestamp: Date.now()
    });
  });

  socket.on('playerStatus', (data) => {
    const { worldId, afk } = data;
    if (!worldId) return;
    socket.to(worldId).emit('playerStatus', { id: socket.id, afk });
  });

  socket.on('updateSettings', data => {
    const pd = players.get(socket.id);
    const world = worlds.get(pd?.worldId);
    if (!world || !pd || pd.number !== 1) return;
    Object.assign(world.multiplierSettings, data.multiplierSettings || {});
    io.to(pd.worldId).emit('settingsUpdated', world.multiplierSettings);
  });

  // ── Phase 17-E: Mob state sync (host → server → joiners) ────
  socket.on('mobState', data => {
    const pd    = players.get(socket.id);
    const world = worlds.get(pd?.worldId);
    if (!world || !pd) return;
    world.cachedMobs = data.mobs || [];
    socket.to(pd.worldId).emit('mobState', { mobs: world.cachedMobs });
  });

  // Joiner hits a mob → relay damage to host (player 1)
  socket.on('mobDamage', data => {
    const pd = players.get(socket.id);
    if (!pd) return;
    for (const [sid, p] of players) {
      if (p.worldId === pd.worldId && p.number === 1) {
        io.to(sid).emit('mobDamage', { mobId: data.mobId, damage: data.damage, attackerId: pd.playerId });
        break;
      }
    }
  });

  // Mob drops — relay to all players and cache so joiners see them
  socket.on('mobDrops', data => {
    const pd    = players.get(socket.id);
    const world = worlds.get(pd?.worldId);
    if (!world || !pd) return;
    socket.to(pd.worldId).emit('mobDrops', { drops: data.drops || [] });
  });

  // Explosion — relay visual+block destruction to all joiners; update server block cache
  socket.on('explosion', data => {
    const pd    = players.get(socket.id);
    const world = worlds.get(pd?.worldId);
    if (!world || !pd) return;
    const { col, row, radius } = data;
    // Update server's block cache so new joiners see the destroyed blocks
    if (typeof col === 'number' && typeof row === 'number' && typeof radius === 'number') {
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          if (dr * dr + dc * dc > radius * radius) continue;
          world.clearBlock(col + dc, row + dr);
        }
      }
    }
    socket.to(pd.worldId).emit('explosion', { col, row, radius });
  });

  // Redstone state broadcast (host → joiners)
  socket.on('redstoneState', data => {
    const pd = players.get(socket.id);
    if (!pd) return;
    socket.to(pd.worldId).emit('redstoneState', { components: data.components || [], dustBlocks: data.dustBlocks || [] });
  });

  // Redstone action from joiner → relay to host (player 1)
  socket.on('redstoneAction', data => {
    const pd = players.get(socket.id);
    if (!pd) return;
    for (const [sid, p] of players) {
      if (p.worldId === pd.worldId && p.number === 1) {
        io.to(sid).emit('redstoneAction', { col: data.col, row: data.row, action: data.action, on: data.on, playerId: pd.playerId });
        break;
      }
    }
  });

  // Chest contents sync — relay to all players and update server cache
  socket.on('chestUpdate', data => {
    const pd    = players.get(socket.id);
    const world = worlds.get(pd?.worldId);
    if (!world || !pd || !data.key) return;
    world.cachedChests[data.key] = { col: data.col, row: data.row, items: data.items };
    socket.to(pd.worldId).emit('chestUpdated', { col: data.col, row: data.row, items: data.items });
  });

  // ── Phase 17-F: Wither altar item sync ─────────────────────────────
  socket.on('altarUpdate', data => {
    const pd    = players.get(socket.id);
    const world = worlds.get(pd?.worldId);
    if (!world || !pd) return;
    const key = `${data.anchorRow},${data.anchorCol}`;
    world.cachedAltars[key] = { anchorRow: data.anchorRow, anchorCol: data.anchorCol, skulls: data.skulls, sand: data.sand };
    socket.to(pd.worldId).emit('altarUpdated', data);
  });

  // ── Phase 17-F: Block change sync (portal activation, eye of ender) ─
  socket.on('blockChanged', data => {
    const pd    = players.get(socket.id);
    const world = worlds.get(pd?.worldId);
    if (!world || !pd) return;
    for (const { row, col, block } of data.changes || []) {
      world.blocks[`${row},${col}`] = block;
    }
    socket.to(pd.worldId).emit('blockChanged', data);
  });

  // ── Phase 17-E: Day/night sync (host → server → joiners) ────
  socket.on('timeSync', data => {
    const pd    = players.get(socket.id);
    const world = worlds.get(pd?.worldId);
    if (!world || !pd) return;
    world.cachedDayNight = data.dayNight;
    socket.to(pd.worldId).emit('timeSynced', { dayNight: data.dayNight });
  });

  socket.on('syncInventory', data => {
    const pd = players.get(socket.id);
    if (!pd || !data) return;
    pd.inventory = data.inventory || null;
    pd.hp        = data.hp   ?? pd.hp;
    pd.x         = data.x    ?? pd.x;
    pd.y         = data.y    ?? pd.y;
  });

  socket.on('disconnect', () => {
    const pd = players.get(socket.id);
    if (!pd) { console.log(`[-] ${socket.id} (unknown)`); return; }

    const world = worlds.get(pd.worldId);
    if (world) {
      // Save Normal-mode player state for inventory persistence
      const ge = games.get(pd.worldId);
      if (ge) {
        ge.lastAccessedAt = Date.now();

        if (world.mode === 'normal' && pd.browserId && pd.inventory) {
          ge.playerStates[pd.browserId] = {
            inventory: pd.inventory,
            hp:        pd.hp,
            x:         pd.x,
            y:         pd.y,
            savedAt:   Date.now(),
          };
        }

        // Platformer: drop inventory items at player location
        if (world.mode === 'platformer' && pd.inventory && pd.inventory.length > 0) {
          for (let i = 0; i < pd.inventory.length; i++) {
            const item = pd.inventory[i];
            if (!item || !item.type) continue;
            const dropped = {
              id:        `item-${Date.now()}-${i}`,
              type:      item.type,
              x:         pd.x + (Math.random() - 0.5) * 40,
              y:         pd.y,
              droppedBy: pd.playerId,
              droppedAt: Date.now(),
            };
            world.items.push(dropped);
            io.to(pd.worldId).emit('itemDropped', dropped);
          }
        }

        ge.currentPlayers = Math.max(0, ge.currentPlayers - 1);

        // Notify remaining players if the host (player 1) disconnects; remove from browse list
        if (pd.number === 1) {
          // Use io.to() — socket has already left its rooms at disconnect time
          io.to(pd.worldId).emit('hostLeft', { hostName: pd.name });
          games.delete(pd.worldId); // remove from browse list immediately
          console.log(`  Host "${pd.name}" left world "${pd.worldId}" — game removed from browser`);
        }
      }

      world.removePlayer(pd.playerId);
      io.to(pd.worldId).emit('playerLeft', { playerId: pd.playerId, name: pd.name });
      saveWorldToDisk(pd.worldId, world);
      if (world.getPlayerCount() === 0) {
        worlds.delete(pd.worldId);
        console.log(`  World "${pd.worldId}" empty — saved`);
      }
    }

    players.delete(socket.id);
    console.log(`[-] ${socket.id} (${pd.name})`);
  });
});
}

module.exports = { attachMultiplayer };
