// ============================================================
// multiplayer.js — Client-side multiplayer manager (Phase 16)
// Loaded after socket.io CDN; exposes window.multiplayerManager.
// All methods are no-ops when not connected — safe to call always.
// ============================================================

(function () {
  'use strict';

  const PLAYER_COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A'];

  const mgr = {
    socket:        null,
    isConnected:   false,
    playerId:      null,
    playerNumber:  null,
    worldId:       null,
    otherPlayers:  {},   // playerId → {playerId, name, number, x, y, hp}
    droppedItems:  [],   // [{id, type, x, y, bobOffset}] — from server
    _syncTimer:    0,
    isCreator:     false,
    browserId:     null,
    playerName:    null,
    appearance:    null,
    chatCallback:  null,
    afkCallback:   null,

    // ── Connection ─────────────────────────────────────────────

    connect(worldId, worldData, playerName, appearance = {}, browserId = null) {
      if (typeof io === 'undefined') {
        console.warn('[MP] socket.io not loaded — multiplayer unavailable');
        return;
      }
      if (this.socket) {
        this.socket.disconnect();
        this.socket = null;
      }

      const socketUrl = (window.location.hostname === 'localhost' ||
                         window.location.hostname === '127.0.0.1')
        ? `${window.location.protocol}//${window.location.hostname}:3000`
        : window.location.origin;

      this.worldId    = worldId;
      this._appearance = appearance;
      this.appearance  = appearance;
      this.playerName  = playerName;
      this.browserId   = browserId;
      this.socket     = io(socketUrl, { transports: ['websocket', 'polling'] });
      this._bindEvents();

      this.socket.emit('joinWorld', {
        worldId, worldData, playerName,
        browserId,
        shirtColor: appearance.shirtColor,
        pantsColor: appearance.pantsColor,
        skinColor:  appearance.skinColor,
      });
    },

    disconnect() {
      if (this.socket) { this.socket.disconnect(); this.socket = null; }
      this._reset();
    },

    _reset() {
      this.isConnected  = false;
      this.playerId     = null;
      this.playerNumber = null;
      this.otherPlayers = {};
      this.droppedItems = [];
      this.chatCallback = null;
      this.afkCallback  = null;
    },

    // ── Outgoing events ────────────────────────────────────────

    updatePosition(x, y, vx, vy) {
      if (!this.isConnected) return;
      this.socket.emit('playerMove', { x, y, vx, vy });
    },

    placeBlock(col, row, blockType) {
      if (!this.isConnected) return;
      this.socket.emit('placeBlock', { col, row, blockType });
    },

    breakBlock(col, row) {
      if (!this.isConnected) return;
      this.socket.emit('breakBlock', { col, row });
    },

    dropItem(type, x, y) {
      if (!this.isConnected) return;
      this.socket.emit('dropItem', { type, x, y });
    },

    pickupItem(itemId) {
      if (!this.isConnected) return;
      this.socket.emit('pickupItem', { itemId });
    },

    notifyBossDamage(bossType, damage, newHp) {
      if (!this.isConnected) return;
      this.socket.emit('bossDamage', { bossType, damage, newHp });
    },

    notifyRespawn(x, y) {
      if (!this.isConnected) return;
      this.socket.emit('playerRespawn', { x, y });
    },

    pushSettings(settings) {
      if (!this.isConnected) return;
      this.socket.emit('updateSettings', { multiplierSettings: settings });
    },

    syncInventory(inventory, hp, x, y) {
      if (!this.isConnected) return;
      this.socket.emit('syncInventory', { inventory, hp, x, y });
    },

    sendChat(message) {
      if (!this.socket || !this.worldId) return;
      this.socket.emit('chatMessage', {
        worldId:    this.worldId,
        playerName: this.playerName || 'Player',
        shirtColor: this.appearance?.shirtColor || '#ffffff',
        message:    message,
      });
    },

    sendStatus(afk) {
      if (!this.isConnected) return;
      this.socket.emit('playerStatus', { worldId: this.worldId, afk });
    },

    // ── Incoming events ────────────────────────────────────────

    _bindEvents() {
      const s = this.socket;

      s.on('joinSuccess', data => {
        this.isConnected  = true;
        this.playerId     = data.playerId;
        this.playerNumber = data.playerNumber;
        this.isCreator    = data.isCreator || false;

        // Populate already-connected players
        if (Array.isArray(data.currentPlayers)) {
          for (const p of data.currentPlayers) {
            this.otherPlayers[p.playerId] = { ...p, bobOffset: Math.random() * Math.PI * 2 };
          }
        }

        // Apply server world state to game's level grid, clearing first so template
        // blocks don't bleed through into a custom creator world.
        if (data.worldState?.blocks) {
          this._applyServerBlocks(data.worldState.blocks, true);
        }

        // Apply existing dropped items
        if (Array.isArray(data.worldState?.items)) {
          for (const it of data.worldState.items) this._addDroppedItem(it);
        }

        console.log(`[MP] Joined as ${data.playerId} (player ${data.playerNumber})`);
        this._notify(`Joined as Player ${data.playerNumber}`, PLAYER_COLORS[data.playerNumber - 1] || '#FFF');

        // Restore inventory if server has a saved state (Normal mode)
        if (data.savedState) {
          if (typeof this.onInventoryRestored === 'function')
            this.onInventoryRestored(data.savedState);
        }
      });

      s.on('joinFailed', data => {
        console.warn('[MP] Join failed:', data.reason);
        this._notify(`Could not join: ${data.reason}`, '#FF6B6B');
        this._reset();
      });

      s.on('chatMessage', (data) => {
        if (this.chatCallback) this.chatCallback(data);
      });

      s.on('playerStatus', (data) => {
        const p = this.otherPlayers[data.id];
        if (p) p.afk = data.afk;
      });

      s.on('playerJoined', data => {
        this.otherPlayers[data.playerId] = {
          playerId:   data.playerId,
          name:       data.name,
          number:     data.playerNumber,
          x: 0, y: 0, hp: 20,
          afk:        false,
          shirtColor: data.shirtColor,
          pantsColor: data.pantsColor,
          skinColor:  data.skinColor,
          bobOffset:  Math.random() * Math.PI * 2,
        };
        this._notify(`${data.name} joined`, PLAYER_COLORS[(data.playerNumber || 1) - 1] || '#FFF');
        const game = window._gameRef;
        if (game?._pushGameNotification) game._pushGameNotification(`${data.name} joined`, '#8CFF8C');
        console.log(`[MP] ${data.name} joined`);
      });

      s.on('playerLeft', data => {
        const p = this.otherPlayers[data.playerId];
        if (p) {
          this._notify(`${p.name} left the game`, '#AAAAAA');
          const game = window._gameRef;
          if (game?._pushGameNotification) game._pushGameNotification(`${p.name} left the game`, '#FF8C8C');
        }
        delete this.otherPlayers[data.playerId];
      });

      s.on('playerMoved', data => {
        const p = this.otherPlayers[data.playerId];
        if (p) {
          p.x = data.x; p.y = data.y; p.vx = data.vx; p.vy = data.vy;
          if (data.shirtColor) p.shirtColor = data.shirtColor;
          if (data.pantsColor) p.pantsColor = data.pantsColor;
          if (data.skinColor)  p.skinColor  = data.skinColor;
          if (data.name)       p.name       = data.name;
        }
      });

      s.on('blockPlaced', data => {
        // Only apply if the change came from another player (our own change is already applied)
        if (data.playerId !== this.playerId) {
          this._applyBlockPlaced(data.col, data.row, data.blockType);
        }
      });

      s.on('blockBroken', data => {
        if (data.playerId !== this.playerId) {
          this._applyBlockBroken(data.col, data.row);
        }
      });

      s.on('itemDropped', data => {
        this._addDroppedItem(data);
      });

      s.on('itemPickedUp', data => {
        this.droppedItems = this.droppedItems.filter(it => it.id !== data.itemId);
      });

      s.on('bossDamaged', data => {
        // Game.js will handle this via the callback
        if (typeof this.onBossDamaged === 'function') this.onBossDamaged(data);
      });

      s.on('settingsUpdated', settings => {
        if (typeof this.onSettingsUpdated === 'function') this.onSettingsUpdated(settings);
      });

      s.on('gameDeleted', data => {
        this._notify(data.reason || 'Game was deleted', '#FF4444');
        const game = window._gameRef;
        if (game?._onReturnToMenu) setTimeout(() => game._onReturnToMenu('online'), 3000);
      });

      s.on('disconnect', () => {
        console.log('[MP] Disconnected from server');
        this._notify('Disconnected from server', '#FF6B6B');
        this._reset();
      });

      s.on('connect_error', err => {
        console.warn('[MP] Connection error:', err.message);
        this._notify('Server connection failed', '#FF6B6B');
        this._reset();
      });
    },

    // ── Level grid application ─────────────────────────────────

    _applyServerBlocks(blocks, clearFirst = false) {
      // blocks is a sparse object: "col,row" → blockType
      const game = window._gameRef;
      if (!game?.level?.grid) return;
      // Clear entire grid before applying full world state (avoids template bleed-through)
      if (clearFirst) {
        for (let r = 0; r < game.level.grid.length; r++) {
          for (let c = 0; c < game.level.grid[r].length; c++) {
            game.level.grid[r][c] = 0;
          }
        }
      }
      for (const key in blocks) {
        const [col, row] = key.split(',').map(Number);
        if (row >= 0 && row < game.level.grid.length &&
            col >= 0 && col < game.level.grid[row].length) {
          game.level.grid[row][col] = blocks[key];
        }
      }
    },

    _applyBlockPlaced(col, row, blockType) {
      const game = window._gameRef;
      if (!game?.level) return;
      game.level.set(row, col, blockType);
    },

    _applyBlockBroken(col, row) {
      const game = window._gameRef;
      if (!game?.level) return;
      game.level.set(row, col, 0); // AIR = 0
    },

    // ── Dropped items ──────────────────────────────────────────

    _addDroppedItem(item) {
      if (this.droppedItems.some(it => it.id === item.id)) return;
      this.droppedItems.push({ ...item, bobOffset: Math.random() * Math.PI * 2 });
    },

    // Check if local player is close enough to pick up any network item
    checkPickup(player) {
      const PICKUP_RANGE = 40;
      const collected = [];
      this.droppedItems = this.droppedItems.filter(it => {
        const dx = player.cx - it.x, dy = player.cy - it.y;
        if (Math.hypot(dx, dy) < PICKUP_RANGE) {
          this.pickupItem(it.id);
          collected.push(it);
          return false;
        }
        return true;
      });
      return collected;
    },

    // ── Rendering ──────────────────────────────────────────────

    drawOtherPlayers(ctx, camera) {
      const fallbacks = PLAYER_COLORS;
      ctx.save();
      for (const id in this.otherPlayers) {
        const p  = this.otherPlayers[id];
        const sx = Math.floor(p.x - camera.x);
        const sy = Math.floor(p.y - camera.y);
        if (sx < -48 || sx > 848 || sy < -60 || sy > 560) continue;

        const accent     = fallbacks[(p.number || 1) - 1] || '#FFF';
        const shirtColor = p.shirtColor || accent;
        const pantsColor = p.pantsColor || '#1E1E1E';
        const skinColor  = p.skinColor  || '#F4C090';

        // ── Blocky player sprite (matches Player dimensions: 20×52) ──
        // Head (16×10, centered in 20px width)
        ctx.fillStyle = skinColor;
        ctx.fillRect(sx + 2, sy, 16, 10);
        // Eyes
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(sx + 4, sy + 4, 2, 2);
        ctx.fillRect(sx + 12, sy + 4, 2, 2);

        // Body/shirt (20×16)
        ctx.fillStyle = shirtColor;
        ctx.fillRect(sx, sy + 10, 20, 16);

        // Hips/pants (20×8)
        ctx.fillStyle = pantsColor;
        ctx.fillRect(sx, sy + 26, 20, 8);

        // Legs (8×18 each, 4px gap)
        ctx.fillRect(sx,      sy + 34, 8, 18);
        ctx.fillRect(sx + 12, sy + 34, 8, 18);

        // AFK label (above name)
        if (p.afk) {
          ctx.font = '8px Courier New';
          ctx.textAlign    = 'center';
          ctx.textBaseline = 'alphabetic';
          ctx.fillStyle    = '#888888';
          ctx.fillText('[AFK]', sx + 10, sy - 17);
        }

        // Name label
        ctx.font = 'bold 9px Courier New';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle    = accent;
        ctx.fillText(p.name || `P${p.number}`, sx + 10, sy - 5);

        // HP bar (above name)
        const hpFrac = Math.max(0, Math.min(1, (p.hp || 20) / 20));
        ctx.fillStyle = '#333';
        ctx.fillRect(sx, sy - 3, 20, 2);
        ctx.fillStyle = hpFrac > 0.5 ? '#55EE55' : hpFrac > 0.25 ? '#EEBB00' : '#EE3333';
        ctx.fillRect(sx, sy - 3, Math.round(20 * hpFrac), 2);
      }
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.restore();
    },

    drawDroppedItems(ctx, camera) {
      const t = Date.now();
      ctx.save();
      for (const it of this.droppedItems) {
        const sx = Math.floor(it.x - camera.x);
        const sy = Math.floor(it.y - camera.y + Math.sin(t / 400 + it.bobOffset) * 2);
        if (sx < -20 || sx > 820 || sy < -20 || sy > 520) continue;

        ctx.fillStyle = '#FFD700';
        ctx.fillRect(sx - 6, sy - 6, 12, 12);
        ctx.fillStyle = '#FFF';
        ctx.font = '8px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✦', sx, sy);
      }
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.restore();
    },

    drawHUD(ctx) {
      if (!this.isConnected) return;
      const x = 10, y = 10;
      const lineH = 18;
      const allPlayers = [
        { name: 'You', number: this.playerNumber, hp: window._gameRef?.player?.hp ?? 20 },
        ...Object.values(this.otherPlayers),
      ].sort((a, b) => a.number - b.number);

      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(x - 2, y - 2, 110, allPlayers.length * lineH + 6);
      ctx.globalAlpha = 1;

      allPlayers.forEach((p, i) => {
        const ry = y + i * lineH + 12;
        const color = PLAYER_COLORS[(p.number || 1) - 1] || '#FFF';
        const hp = p.hp ?? 20;

        // Color dot
        ctx.fillStyle = color;
        ctx.fillRect(x, ry - 8, 8, 8);

        // Name
        ctx.font = 'bold 9px Courier New';
        ctx.fillStyle = '#FFF';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(p.name?.slice(0, 10) || `P${p.number}`, x + 11, ry);

        // HP
        ctx.font = '8px Courier New';
        ctx.fillStyle = '#AAA';
        ctx.fillText(`${Math.ceil(hp)}/20`, x + 65, ry);
      });

      // "ONLINE" badge
      ctx.fillStyle = '#44EE44';
      ctx.font = 'bold 7px Courier New';
      ctx.textAlign = 'right';
      ctx.fillText('● ONLINE', x + 108, y + 6);

      ctx.textAlign = 'left';
      ctx.restore();
    },

    // ── Utility ────────────────────────────────────────────────

    getPlayerColor(number) {
      return PLAYER_COLORS[(number || 1) - 1] || '#FFF';
    },

    _notify(text, color) {
      const game = window._gameRef;
      if (game?._notify) game._notify(text, color || '#FFF', 180);
    },

    // ── World download ─────────────────────────────────────────

    async downloadWorld() {
      if (!this.worldId) return;
      try {
        const res = await fetch('/api/downloadWorld', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ worldId: this.worldId }),
        });
        if (!res.ok) { this._notify('Download failed — world not on server', '#FF4444'); return; }
        const data    = await res.json();
        const blob    = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url     = URL.createObjectURL(blob);
        const link    = document.createElement('a');
        link.href     = url;
        link.download = `world-${this.worldId}-${Date.now()}.json`;
        link.click();
        URL.revokeObjectURL(url);
        this._notify('World downloaded', '#44EE44');
      } catch (e) {
        this._notify('Download error: ' + e.message, '#FF4444');
      }
    },

    async deleteGame(gameId) {
      const SERVER = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? `${window.location.protocol}//${window.location.hostname}:3000`
        : window.location.origin;
      try {
        const adminCode = localStorage.getItem('mp_admin_mode') === '1' ? 'DOGS' : undefined;
        const json = await (await fetch(`${SERVER}/api/deleteGame`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameId, browserId: this.browserId, adminCode }),
        })).json();
        if (json.success) this._notify('Game deleted', '#44EE44');
        else               this._notify(`Delete failed: ${json.error}`, '#FF4444');
        return json.success;
      } catch (e) {
        this._notify('Delete error: ' + e.message, '#FF4444');
        return false;
      }
    },
  };

  window.multiplayerManager = mgr;
})();
