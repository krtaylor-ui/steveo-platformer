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
    remoteMobs:        new Map(), // mobId → serialized mob snapshot (Phase 17-E)
    remoteArrows:      [],        // [{x,y,vx,vy}] — enemy arrows visible on joiner
    remoteBlazeShots:  [],        // [{x,y,vx,vy}] — blaze fireballs visible on joiner
    joinersOnPlates:  new Set(), // "col,row" keys of plates held by joiners (host only)
    hostLeft:         false,
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

      const socketUrl = window.location.origin;

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
      this.remoteMobs        = new Map();
      this.remoteArrows      = [];
      this.remoteBlazeShots  = [];
      this.joinersOnPlates   = new Set();
      this.hostLeft        = false;
      this.chatCallback = null;
      this.afkCallback  = null;
    },

    // ── Outgoing events ────────────────────────────────────────

    updatePosition(x, y, vx, vy, facing, crouching, swingTimer) {
      if (!this.isConnected) return;
      this.socket.emit('playerMove', { x, y, vx, vy, facing, crouching, swingTimer });
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
            this.otherPlayers[p.playerId] = { ...p, bobOffset: Math.random() * Math.PI * 2, facing: 1, crouching: false, swingTimer: 0, _localWalkTimer: 0 };
          }
        }

        // Apply server world state to game's level grid, clearing first so template
        // blocks don't bleed through into a custom creator world.
        if (data.worldState?.blocks) {
          this._applyServerBlocks(data.worldState.blocks, true);
          // Re-scan for portal/obsidian non-solid regions and redstone components after grid overwrite
          const game = window._gameRef;
          if (game?._rebuildPortalObsidianFromGrid) game._rebuildPortalObsidianFromGrid();
          if (game?._rebuildRedstoneFromGrid) game._rebuildRedstoneFromGrid();
          // Dust + gate blocks are overlay objects (not in level grid) — apply from worldState
          if (game?._dustBlocks && Array.isArray(data.worldState?.dustBlocks)) {
            for (const d of data.worldState.dustBlocks) {
              const key = `${d.col},${d.row}`;
              if (!game._dustBlocks.has(key)) {
                game._dustBlocks.set(key, {
                  col: d.col, row: d.row,
                  on: !!d.on, everTriggered: !!d.everTriggered,
                  setting: d.setting || 'always_show',
                });
              }
            }
            game._dustConnDirty = true;
          }
          if (game?._gateBlocks && Array.isArray(data.worldState?.gateBlocks)) {
            for (const g of data.worldState.gateBlocks) {
              const key = `${g.col},${g.row}`;
              if (!game._gateBlocks.has(key)) {
                game._gateBlocks.set(key, {
                  col: g.col, row: g.row, type: g.type,
                  inputSide: g.inputSide, inputSide2: g.inputSide2, outputSide: g.outputSide,
                  outputPowered: !!g.outputPowered, everTriggered: !!g.everTriggered,
                  setting: g.setting || 'always_show',
                });
              }
            }
            game._dustConnDirty = true;
          }
          // Scan grid for chests so joiners can open any existing chest
          if (game?._chests && game?.level) {
            for (let r = 0; r < game.level.height; r++) {
              for (let c = 0; c < game.level.width; c++) {
                if (game.level.get(r, c) === BLOCK.CHEST) {
                  const key = `${c},${r}`;
                  if (!game._chests.has(key)) game._chests.set(key, { col: c, row: r, items: Array(8).fill(null) });
                }
              }
            }
          }
          // Apply initial chest items from worldState.chests (saved chest contents)
          // cachedChests (runtime changes) applied below will override these if needed
          if (game?._chests && Array.isArray(data.worldState?.chests)) {
            for (const ch of data.worldState.chests) {
              const key = `${ch.col},${ch.row}`;
              const entry = game._chests.get(key);
              if (entry) entry.items = ch.items.map(it => it ? { ...it } : null);
            }
          }
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

        // Phase 17-E: Apply cached mob/time state from host
        const game = window._gameRef;
        if (Array.isArray(data.cachedMobs) && !data.isCreator) {
          this.remoteMobs.clear();
          for (const m of data.cachedMobs) this.remoteMobs.set(m.id, m);
        }
        if (data.cachedDayNight && game && !data.isCreator) {
          const dn = data.cachedDayNight;
          Object.assign(game._dayNight, { isDay: dn.isDay, timer: dn.timer, halfCycleMs: dn.halfCycleMs, nightPhase: dn.nightPhase });
        }

        // Apply cached chest states (joiner only)
        if (!data.isCreator && data.cachedChests && game) {
          for (const [key, ch] of Object.entries(data.cachedChests)) {
            if (!game._chests.has(key))
              game._chests.set(key, { col: ch.col, row: ch.row, items: Array(8).fill(null) });
            game._chests.get(key).items = ch.items;
          }
        }

        // Apply cached wither altar states (joiner only)
        if (!data.isCreator && data.cachedAltars && game?._witherAltars) {
          for (const cached of Object.values(data.cachedAltars)) {
            const altar = game._witherAltars.find(
              a => a.anchorRow === cached.anchorRow && a.anchorCol === cached.anchorCol
            );
            if (altar) { altar.skulls = cached.skulls; altar.sand = cached.sand; }
          }
        }

        // Host sends initial mob state + time sync immediately so server cache is populated
        // before any joiners can connect — must happen AFTER game loop has run at least once
        if (data.isCreator) {
          setTimeout(() => {
            const g = window._gameRef;
            if (!g || !this.socket) return;
            this.sendTimeSync(g._dayNight);
            if (g.gameMode !== 'sandbox') this.sendMobState(g.mobManager.serializeMobs());
          }, 200);
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

      // Phase 17-E: Mob state (host → joiners)
      s.on('mobState', data => {
        if (this.isCreator) return; // host doesn't use remote mobs
        this.remoteMobs.clear();
        for (const m of data.mobs || []) this.remoteMobs.set(m.id, m);
        this.remoteArrows     = data.arrows     || [];
        this.remoteBlazeShots = data.blazeShots || [];
      });

      // Phase 17-E: Mob damage event (joiner → host via server)
      s.on('mobDamage', data => {
        if (!this.isCreator) return; // only host applies damage
        const game = window._gameRef;
        if (!game) return;
        const mob = game.mobManager.mobs.find(m => m.id === data.mobId && m.alive);
        if (mob) {
          mob.takeDamage(data.damage, 0);
          // Push updated state immediately so joiner sees HP change
          this.socket.emit('mobState', { mobs: game.mobManager.serializeMobs() });
        }
      });

      // Phase 17-E: Day/night sync (host → joiners)
      s.on('timeSynced', data => {
        if (this.isCreator || !data.dayNight) return;
        const game = window._gameRef;
        if (!game) return;
        const dn = data.dayNight;
        Object.assign(game._dayNight, { isDay: dn.isDay, timer: dn.timer, halfCycleMs: dn.halfCycleMs, nightPhase: dn.nightPhase });
      });

      // Phase 17-E: Mob drops (host → joiners) — add items to local mob manager
      s.on('mobDrops', data => {
        if (this.isCreator) return;
        const game = window._gameRef;
        if (!game || !game.mobManager) return;
        // Temporarily disable the dropCallback to avoid looping
        const cb = game.mobManager.dropCallback;
        game.mobManager.dropCallback = null;
        game.mobManager.dropItems(data.drops || []);
        game.mobManager.dropCallback = cb;
      });

      // Phase 17-E: Explosion (host → joiners) — destroy blocks + play visual
      s.on('explosion', data => {
        if (this.isCreator) return;
        const game = window._gameRef;
        if (!game) return;
        const { col, row, radius } = data;
        if (typeof col !== 'number') return;
        // Apply block destruction (same logic as _doExplosion in mobs.js)
        for (let dr = -radius; dr <= radius; dr++) {
          for (let dc = -radius; dc <= radius; dc++) {
            if (dr * dr + dc * dc > radius * radius) continue;
            const b = game.level.get(row + dr, col + dc);
            if (b !== BLOCK.BEDROCK && b !== BLOCK.AIR && b !== BLOCK.GOAL)
              game.level.set(row + dr, col + dc, BLOCK.AIR);
          }
        }
        // Visual + sound
        const cx = col * BLOCK_SIZE + BLOCK_SIZE / 2, cy = row * BLOCK_SIZE + BLOCK_SIZE / 2;
        game.mobManager.explosions.push(new ExplosionEffect(cx, cy, (radius + 0.5) * BLOCK_SIZE));
        if (game._playSound) game._playSound('sounds/explosion-creeper.mp3');
        game._screenShake = { intensity: 5, frames: 12, maxFrames: 12 };
      });

      // Phase 17-E: Redstone state (host → joiners) — sync component on/off states
      s.on('redstoneState', data => {
        if (this.isCreator) return;
        const game = window._gameRef;
        if (!game?.redstone) return;
        for (const snap of data.components || []) {
          const comp = game.redstone.getAt(snap.col, snap.row);
          if (!comp) continue;
          if (snap.on       !== undefined) comp.on       = snap.on;
          if (snap.open     !== undefined) comp.open     = snap.open;
          if (snap.extended !== undefined) {
            comp.extended   = snap.extended;
            comp.animTarget = snap.extended ? 1 : 0; // drive piston animation on joiner
          }
        }
        // Phase 17-G: Apply dust block on/off + everTriggered states from host.
        // Create missing entries (dust is overlay, not in level grid — may not exist on joiner yet).
        for (const d of data.dustBlocks || []) {
          const key = `${d.col},${d.row}`;
          let dust = game._dustBlocks?.get(key);
          if (!dust && game._dustBlocks) {
            dust = { col: d.col, row: d.row, on: !!d.on, everTriggered: !!d.everTriggered, setting: 'always_show' };
            game._dustBlocks.set(key, dust);
            if (game._dustConnDirty !== undefined) game._dustConnDirty = true;
          } else if (dust) {
            dust.on = d.on;
            if (d.everTriggered) dust.everTriggered = true;
          }
        }
      });

      // Phase 17-E/F: Redstone action (joiner → host) — host applies the action
      s.on('redstoneAction', data => {
        if (!this.isCreator) return;
        const game = window._gameRef;
        if (!game?.redstone) return;
        if (data.action === 'toggleLever') {
          const comp = game.redstone.getAt(data.col, data.row);
          if (!comp) return;
          comp.on = !comp.on;
          game.redstone._propagate(comp, game.level);
          if (game._rsStartFromSource) game._rsStartFromSource(comp.col, comp.row, comp.on);
          if (game._playSound) game._playSound('sounds/lever.mp3', 0.7);
        } else if (data.action === 'pressurePlate') {
          // Track which plates joiners are currently holding down
          const key = `${data.col},${data.row}`;
          if (data.on) {
            this.joinersOnPlates.add(key);
          } else {
            this.joinersOnPlates.delete(key);
          }
          // Immediate propagation — host's next redstone.update() will also handle via extraOnFn
          const comp = game.redstone.getAt(data.col, data.row);
          if (comp && comp.on !== data.on && !data.on) {
            // Only immediately propagate OFF (ON is handled by extraOnFn in next frame)
            const p1OnPlate = (() => {
              const px = comp.col * BLOCK_SIZE, py = comp.row * BLOCK_SIZE;
              const p = game.player;
              return p.x + p.width > px + 4 && p.x < px + BLOCK_SIZE - 4 &&
                     Math.abs(p.y + p.height - (py + BLOCK_SIZE)) < 8;
            })();
            if (!p1OnPlate) {
              comp.on = false;
              game.redstone._propagate(comp, game.level);
              if (game._rsStartFromSource) game._rsStartFromSource(comp.col, comp.row, false);
            }
          }
        }
      });

      // Phase 17-F: Wither altar item sync (host → joiners)
      s.on('altarUpdated', data => {
        if (this.isCreator) return;
        const game = window._gameRef;
        if (!game?._witherAltars) return;
        const altar = game._witherAltars.find(
          a => a.anchorRow === data.anchorRow && a.anchorCol === data.anchorCol
        );
        if (altar) { altar.skulls = data.skulls; altar.sand = data.sand; }
      });

      // Phase 17-F: Block changes — portal activation, eye of ender, etc.
      s.on('blockChanged', data => {
        if (this.isCreator) return;
        const game = window._gameRef;
        if (!game?.level?.grid) return;
        for (const { row, col, block } of data.changes || []) {
          if (row >= 0 && row < game.level.grid.length &&
              col >= 0 && col < game.level.grid[row].length) {
            game.level.grid[row][col] = block;
          }
        }
        if (game._rebuildPortalObsidianFromGrid) game._rebuildPortalObsidianFromGrid();
        // Sync ruined portal activated flag
        if (data.ruinedPortal) {
          const { anchorRow, anchorCol } = data.ruinedPortal;
          const portal = game._ruinedPortals?.get(`${anchorRow},${anchorCol}`);
          if (portal) portal.activated = true;
        }
        // Sync end portal anchor eye count / active flag
        if (data.endPortalAnchor) {
          const { col: ac, row: ar, eyeCount, active } = data.endPortalAnchor;
          const anchor = game._endPortalAnchors?.get(`${ac},${ar}`);
          if (anchor) { anchor.eyeCount = eyeCount; anchor.active = active; }
        }
      });

      // Phase 17-F: Chest contents sync (host → joiners)
      s.on('chestUpdated', data => {
        const game = window._gameRef;
        if (!game) return;
        const key = `${data.col},${data.row}`;
        if (!game._chests.has(key)) {
          game._chests.set(key, { col: data.col, row: data.row, items: Array(8).fill(null) });
        }
        const ch = game._chests.get(key);
        ch.items = data.items;
        // If this joiner has the chest open, close the UI without re-broadcasting
        // (the incoming sync IS the authoritative state; don't echo it back)
        if (game._chestOpen?.col === data.col && game._chestOpen?.row === data.row) {
          game._chestOpen   = null;
          game.inventoryOpen = false;
          if (game._returnHeldItem) game._returnHeldItem();
          game._sbChestHeld = null;
        }
      });

      // Phase 17-E: Host disconnected — show overlay for remaining players
      s.on('hostLeft', data => {
        if (this.isCreator) return;
        this.hostLeft = true;
        this._showHostLeftOverlay(data.hostName || 'The host');
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
          facing: 1, crouching: false, swingTimer: 0, _localWalkTimer: 0,
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
          if (data.shirtColor)              p.shirtColor  = data.shirtColor;
          if (data.pantsColor)              p.pantsColor  = data.pantsColor;
          if (data.skinColor)               p.skinColor   = data.skinColor;
          if (data.name)                    p.name        = data.name;
          if (data.facing    !== undefined) p.facing      = data.facing;
          if (data.crouching !== undefined) p.crouching   = data.crouching;
          if (data.swingTimer !== undefined) p.swingTimer = data.swingTimer;
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

      // Phase 17-G: Joiner receives damage from a mob that targeted them
      s.on('remotePlayerDamaged', data => {
        if (data.targetPlayerId !== this.playerId) return;
        const game = window._gameRef;
        if (!game) return;
        game.player.takeDamage(data.damage, data.dir || 0);
        if (game._playSound) game._playSound('sounds/player-damaged.mp3');
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

    // Phase 17-F: Wither altar item sync (host → server → joiners)
    sendAltarUpdate(anchorRow, anchorCol, skulls, sand) {
      if (!this.socket || !this.isConnected) return;
      this.socket.emit('altarUpdate', { anchorRow, anchorCol, skulls, sand });
    },

    // Phase 17-F: Block change sync (portal activation, eye of ender)
    sendBlockChanged(changes, meta) {
      if (!this.socket || !this.isConnected || !changes.length) return;
      this.socket.emit('blockChanged', { changes, ...meta });
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
      // Keep _chests in sync so joiners can open remotely-placed chests
      if (blockType === BLOCK.CHEST) {
        const key = `${col},${row}`;
        if (!game._chests.has(key)) game._chests.set(key, { col, row, items: Array(8).fill(null) });
      }
    },

    _applyBlockBroken(col, row) {
      const game = window._gameRef;
      if (!game?.level) return;
      game.level.set(row, col, 0); // AIR = 0
      game._chests?.delete(`${col},${row}`);
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
      const SHOE = '#3D1C02';
      const HAIR = '#7D4E1A';
      ctx.save();
      for (const id in this.otherPlayers) {
        const p  = this.otherPlayers[id];
        const sx = Math.floor(p.x - camera.x);
        const sy = Math.floor(p.y - camera.y);
        if (sx < -48 || sx > 848 || sy < -60 || sy > 560) continue;

        // Advance walk animation locally every draw frame
        if (Math.abs(p.vx || 0) > 0.5) {
          p._localWalkTimer = (p._localWalkTimer || 0) + 0.18;
        }

        const accent     = fallbacks[(p.number || 1) - 1] || '#FFF';
        const shirtColor = p.shirtColor || accent;
        const pantsColor = p.pantsColor || '#2C5F8A';
        const skinColor  = p.skinColor  || '#F4C090';
        const crouch     = p.crouching  || false;
        const swing      = Math.sin(p._localWalkTimer || 0);
        const flipX      = (p.facing || 1) === -1;
        const legSwing   = swing * 0.45;
        const sw         = p.swingTimer || 0;

        ctx.save();

        // Flip horizontally when facing left
        if (flipX) {
          ctx.translate(sx + PLAYER_W / 2, 0);
          ctx.scale(-1, 1);
          ctx.translate(-(sx + PLAYER_W / 2), 0);
        }

        if (crouch) {
          // ── Crouching pose ────────────────────────────────────
          // Left leg (compressed)
          ctx.fillStyle = pantsColor;
          ctx.fillRect(sx + 2, sy + 20, 7, 8);
          ctx.fillStyle = SHOE;
          ctx.fillRect(sx + 2, sy + 28, 7, 3);
          // Right leg (compressed)
          ctx.fillStyle = pantsColor;
          ctx.fillRect(sx + 11, sy + 20, 7, 8);
          ctx.fillStyle = SHOE;
          ctx.fillRect(sx + 11, sy + 28, 7, 3);
          // Body
          ctx.fillStyle = shirtColor;
          ctx.fillRect(sx + 2, sy + 10, 16, 12);
          ctx.fillStyle = pantsColor;
          ctx.fillRect(sx + 2, sy + 19, 16, 3);
          // Head
          ctx.fillStyle = skinColor;
          ctx.fillRect(sx + 2, sy, 16, 12);
          ctx.fillStyle = HAIR;
          ctx.fillRect(sx + 2, sy, 16, 4);
          // Eyes
          ctx.fillStyle = '#fff';
          ctx.fillRect(sx + 7, sy + 5, 3, 3);
          ctx.fillStyle = '#1A50C0';
          ctx.fillRect(sx + 8, sy + 6, 2, 2);
        } else {
          // ── Standing animated Steve ───────────────────────────
          // Shadow
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.beginPath();
          ctx.ellipse(sx + PLAYER_W / 2, sy + PLAYER_H + 2, 9, 3, 0, 0, Math.PI * 2);
          ctx.fill();

          // Left leg
          ctx.save();
          ctx.translate(sx + 4, sy + 34);
          ctx.rotate(legSwing);
          ctx.fillStyle = pantsColor;
          ctx.fillRect(-2, 0, 8, 14);
          ctx.fillStyle = SHOE;
          ctx.fillRect(-2, 14, 8, 4);
          ctx.restore();

          // Right leg
          ctx.save();
          ctx.translate(sx + 12, sy + 34);
          ctx.rotate(-legSwing);
          ctx.fillStyle = pantsColor;
          ctx.fillRect(-2, 0, 8, 14);
          ctx.fillStyle = SHOE;
          ctx.fillRect(-2, 14, 8, 4);
          ctx.restore();

          // Left arm
          ctx.save();
          ctx.translate(sx + 2, sy + 18);
          ctx.rotate(-legSwing);
          ctx.fillStyle = shirtColor;
          ctx.fillRect(-2, 0, 6, 12);
          ctx.fillStyle = skinColor;
          ctx.fillRect(-2, 12, 6, 4);
          ctx.restore();

          // Body
          ctx.fillStyle = shirtColor;
          ctx.fillRect(sx + 4, sy + 18, 12, 16);
          ctx.fillStyle = pantsColor;
          ctx.fillRect(sx + 4, sy + 31, 12, 3);

          // Right arm (swings with attack when swingTimer > 0)
          const armAng = sw > 0 ? (sw / 15) * 1.2 - 0.4 : legSwing;
          ctx.save();
          ctx.translate(sx + 16, sy + 18);
          ctx.rotate(armAng);
          ctx.fillStyle = shirtColor;
          ctx.fillRect(-2, 0, 6, 12);
          ctx.fillStyle = skinColor;
          ctx.fillRect(-2, 12, 6, 4);
          ctx.restore();

          // Head
          ctx.fillStyle = skinColor;
          ctx.fillRect(sx + 2, sy, 16, 16);
          ctx.fillStyle = HAIR;
          ctx.fillRect(sx + 2, sy, 16, 5);
          ctx.fillRect(sx + 2, sy + 5, 3, 3);
          // Eyes
          ctx.fillStyle = '#fff';
          ctx.fillRect(sx + 8, sy + 6, 4, 4);
          ctx.fillStyle = '#1A50C0';
          ctx.fillRect(sx + 9, sy + 7, 2, 2);
          // Mouth
          ctx.fillStyle = '#9A4020';
          ctx.fillRect(sx + 8, sy + 12, 2, 1);
        }

        ctx.restore();

        // ── HUD overlays (not flipped) ────────────────────────
        if (p.afk) {
          ctx.font = '8px Courier New';
          ctx.textAlign    = 'center';
          ctx.textBaseline = 'alphabetic';
          ctx.fillStyle    = '#888888';
          ctx.fillText('[AFK]', sx + 10, sy - 17);
        }

        ctx.font = 'bold 9px Courier New';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle    = accent;
        ctx.fillText(p.name || `P${p.number}`, sx + 10, sy - 5);

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
      const game = window._gameRef;
      if (game?._worldAdvSettings?.showOnlineHealthBars === false) return;

      const others = Object.values(this.otherPlayers)
        .sort((a, b) => (a.number || 0) - (b.number || 0));
      if (others.length === 0) return;

      const panelX = CANVAS_W - 152;  // aligns with biome label left edge
      const panelW = 118;
      const startY = 36;              // below biome label (y=10..30) and ? icon (y=8..32)
      const lineH  = 18;

      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(panelX - 2, startY - 2, panelW + 4, others.length * lineH + 6);
      ctx.globalAlpha = 1;

      others.forEach((p, i) => {
        const ry    = startY + i * lineH + 12;
        const color = PLAYER_COLORS[(p.number || 1) - 1] || '#FFF';
        const hp    = Math.max(0, p.hp ?? 20);

        ctx.fillStyle = color;
        ctx.fillRect(panelX, ry - 8, 8, 8);

        ctx.font = 'bold 9px Courier New';
        ctx.fillStyle = '#FFF';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(p.name?.slice(0, 10) || `P${p.number}`, panelX + 11, ry);

        ctx.font = '8px Courier New';
        ctx.fillStyle = '#AAA';
        ctx.textAlign = 'right';
        ctx.fillText(`${Math.ceil(hp)}/20`, panelX + panelW - 2, ry);
      });

      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.restore();
    },

    // ── Utility ────────────────────────────────────────────────

    getPlayerColor(number) {
      return PLAYER_COLORS[(number || 1) - 1] || '#FFF';
    },

    // Phase 17-E: Host broadcasts mob state to server
    sendMobState(mobs, arrows, blazeShots) {
      if (!this.socket || !this.isConnected) return;
      this.socket.emit('mobState', { mobs, arrows: arrows || [], blazeShots: blazeShots || [] });
    },

    // Phase 17-E: Joiner sends damage event to server → relayed to host
    sendMobDamage(mobId, damage) {
      if (!this.socket || !this.isConnected) return;
      this.socket.emit('mobDamage', { mobId, damage });
    },

    // Phase 17-E: Host broadcasts mob drop events
    sendMobDrops(drops) {
      if (!this.socket || !this.isConnected || !drops.length) return;
      this.socket.emit('mobDrops', { drops });
    },

    // Phase 17-E: Host broadcasts explosion (block destruction + visual)
    sendExplosion(col, row, radius) {
      if (!this.socket || !this.isConnected) return;
      this.socket.emit('explosion', { col, row, radius });
    },

    // Phase 17-E: Host broadcasts redstone component states and dust block states
    sendRedstoneState(components, dustBlocks) {
      if (!this.socket || !this.isConnected) return;
      if (!components.length && !(dustBlocks?.length)) return;
      this.socket.emit('redstoneState', { components, dustBlocks: dustBlocks || [] });
    },

    // Phase 17-E: Joiner sends a redstone action to host via server
    sendRedstoneAction(col, row, action, on) {
      if (!this.socket || !this.isConnected) return;
      const payload = { col, row, action };
      if (on !== undefined) payload.on = on;
      this.socket.emit('redstoneAction', payload);
    },

    // Phase 17-G: Host sends mob-dealt damage event directly to target joiner
    sendRemotePlayerDamaged(targetPlayerId, damage, dir) {
      if (!this.socket || !this.isConnected) return;
      this.socket.emit('remotePlayerDamaged', { targetPlayerId, damage, dir });
    },

    // Phase 17-F: Broadcast chest contents to all players
    sendChestUpdate(col, row, items) {
      if (!this.socket || !this.isConnected) return;
      this.socket.emit('chestUpdate', { key: `${col},${row}`, col, row, items });
    },

    // Phase 17-E: Host broadcasts day/night state
    sendTimeSync(dayNight) {
      if (!this.socket || !this.isConnected) return;
      this.socket.emit('timeSync', {
        dayNight: { isDay: dayNight.isDay, timer: dayNight.timer, halfCycleMs: dayNight.halfCycleMs, nightPhase: dayNight.nightPhase },
      });
    },

    // Phase 17-G: Draw remote mobs using real mob-class draw methods via prototype stubs
    drawRemoteMobs(ctx, camera) {
      if (this.isCreator || !this.isConnected) return;
      // Map serialized type name → mob class (all defined in mobs.js before multiplayer.js loads)
      const CLASS_MAP = {
        Zombie: typeof Zombie !== 'undefined' ? Zombie : null,
        Skeleton: typeof Skeleton !== 'undefined' ? Skeleton : null,
        Creeper: typeof Creeper !== 'undefined' ? Creeper : null,
        CaveSpider: typeof CaveSpider !== 'undefined' ? CaveSpider : null,
        Piglin: typeof Piglin !== 'undefined' ? Piglin : null,
        Blaze: typeof Blaze !== 'undefined' ? Blaze : null,
        WitherSkeleton: typeof WitherSkeleton !== 'undefined' ? WitherSkeleton : null,
        Enderman: typeof Enderman !== 'undefined' ? Enderman : null,
      };
      for (const m of this.remoteMobs.values()) {
        if (!m.alive) continue;
        const sx = Math.floor(m.x - camera.x);
        if (sx + (m.w || 32) < -40 || sx > CANVAS_W + 40) continue;

        const Cls = CLASS_MAP[m.type];
        if (!Cls) continue;

        // Lightweight stub — inherits draw/_drawBody/_flashAlpha/_drawHealthBar via prototype
        const stub = Object.create(Cls.prototype);
        stub.x           = m.x;
        stub.y           = m.y;
        stub.width       = m.w;
        stub.height      = m.h;
        stub.hp          = m.hp;
        stub.maxHp       = m.maxHp;
        stub.alive       = true;
        stub.walkTimer   = m.walkTimer   || 0;
        stub.hitCooldown = m.hitCooldown || 0;
        stub.facing      = m.flipped ? 1 : -1;
        // Creeper fuse state
        stub.fusing      = false;
        stub.fuseTimer   = 0;
        // Blaze float offset — derive a stable value from mob id so it animates
        stub.floatOffset = (m.id || 0) * 1.3;

        stub.draw(ctx, camera);
      }

      // Draw remote enemy arrows
      for (const a of this.remoteArrows) {
        const sx = Math.floor(a.x - camera.x);
        const sy = Math.floor(a.y - camera.y);
        if (sx < -20 || sx > CANVAS_W + 20) continue;
        const angle = Math.atan2(a.vy, a.vx);
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(angle);
        ctx.fillStyle = '#8B5A18';
        ctx.fillRect(-9, -1, 18, 2);
        ctx.fillStyle = '#BBBBBB';
        ctx.beginPath();
        ctx.moveTo(9, 0); ctx.lineTo(5, -3); ctx.lineTo(5, 3);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#EEEEEE';
        ctx.fillRect(-9, -3, 5, 2);
        ctx.fillRect(-9,  1, 5, 2);
        ctx.restore();
      }

      // Draw remote blaze fireballs
      for (const bs of this.remoteBlazeShots) {
        const sx = Math.floor(bs.x - camera.x);
        const sy = Math.floor(bs.y - camera.y);
        if (sx < -20 || sx > CANVAS_W + 20) continue;
        const glo = 0.7 + Math.sin(Date.now() / 100) * 0.3;
        ctx.save();
        ctx.globalAlpha = glo;
        ctx.fillStyle = '#FF8800';
        ctx.fillRect(sx - 5, sy - 5, 10, 10);
        ctx.fillStyle = '#FFDD00';
        ctx.fillRect(sx - 3, sy - 3, 6, 6);
        ctx.restore();
      }
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
      const SERVER = window.location.origin;
        //: window.location.origin;
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

    // Phase 17-E: Show full-screen overlay when host disconnects
    _showHostLeftOverlay(hostName) {
      // Remove any existing overlay
      const old = document.getElementById('host-left-overlay');
      if (old) old.remove();

      const overlay = document.createElement('div');
      overlay.id = 'host-left-overlay';
      overlay.style.cssText = [
        'position:fixed', 'inset:0', 'background:rgba(0,0,0,0.88)',
        'display:flex', 'flex-direction:column', 'align-items:center', 'justify-content:center',
        'gap:18px', 'z-index:2000', "font-family:'Courier New',monospace", 'color:#fff',
      ].join(';');

      const title = document.createElement('h2');
      title.textContent = 'Host has left';
      title.style.cssText = 'font-size:1.5rem;color:#FF6B6B;letter-spacing:4px;text-transform:uppercase;text-shadow:1px 1px 0 #660000,2px 2px 0 #330000;margin:0';

      const sub = document.createElement('p');
      sub.textContent = `${hostName} disconnected. The game cannot continue without the host.`;
      sub.style.cssText = 'color:#888;font-size:0.85rem;text-align:center;max-width:320px;margin:0';

      const btn = document.createElement('button');
      btn.textContent = 'Return to Menu';
      btn.style.cssText = [
        'padding:14px 48px', 'font-size:1.1rem', "font-family:'Courier New',monospace",
        'background:#1a1a2e', 'color:#7ec8e3', 'border:2px solid #7ec8e3',
        'cursor:pointer', 'letter-spacing:2px', 'text-transform:uppercase', 'margin-top:8px',
      ].join(';');
      btn.onmouseover = () => { btn.style.background = '#7ec8e3'; btn.style.color = '#000'; };
      btn.onmouseout  = () => { btn.style.background = '#1a1a2e'; btn.style.color = '#7ec8e3'; };
      btn.onclick = () => {
        overlay.remove();
        this.disconnect();
        const game = window._gameRef;
        if (game && typeof game._onReturnToMenu === 'function') game._onReturnToMenu('online');
        else location.reload();
      };

      overlay.appendChild(title);
      overlay.appendChild(sub);
      overlay.appendChild(btn);
      document.body.appendChild(overlay);
    },
  };

  window.multiplayerManager = mgr;
})();
