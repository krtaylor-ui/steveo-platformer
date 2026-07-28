// ============================================================
// redstone.js — Levers, pressure plates, trapdoors, pistons, TNT
// ============================================================

function _pistonDelta(dir) {
  if (dir === 'right') return { dr:  0, dc:  1 };
  if (dir === 'left')  return { dr:  0, dc: -1 };
  if (dir === 'down')  return { dr:  1, dc:  0 };
  return                      { dr: -1, dc:  0 }; // up
}

// Blocks the piston cannot push
const _PISTON_UNPUSHABLE = new Set([
  BLOCK.BEDROCK, BLOCK.CHEST, BLOCK.TRAPDOOR, BLOCK.LEVER,
  BLOCK.PRESSURE_PLATE, BLOCK.TRANSMITTER, BLOCK.RECEIVER,
  BLOCK.PISTON_BODY, BLOCK.PISTON_HEAD, BLOCK.NETHER_PORTAL_FRAME,
  BLOCK.NETHER_PORTAL, BLOCK.GOAL, BLOCK.BED,
]);

class RedstoneSystem {
  constructor(components) {
    this.components = components; // array of component objects
    this._map = new Map();        // "col,row" → component
    for (const c of components) {
      this._map.set(`${c.col},${c.row}`, c);
    }
    this.soundCallback = null;    // set by game.js: fn(file, volMult?)
    // Perf: O(1) piston-head lookup. isPistonHeadAt() is called from the (monkey-patched)
    // level.isSolid on EVERY solidity check, and pathfinding hammers isSolid ~hundreds of
    // thousands of times per A* run — so the old per-call loop over ALL components made a
    // single A* cost up to a full second on a component-heavy level (Kevin's freeze). This
    // set is rebuilt once per frame (in updatePistonAnimations) so the per-call cost is O(1).
    this._pistonHeads = new Set();
    this._rebuildPistonHeads();
  }
  // Numeric cell key (avoids per-call string allocation). Cols/rows are small.
  _phKey(col, row) { return col * 100000 + row; }
  // Rebuild the extended-piston-head cell set. Iterates components ONCE (cheap; done per
  // frame), replacing the old per-isSolid-call scan.
  _rebuildPistonHeads() {
    this._pistonHeads.clear();
    for (const comp of this.components) {
      if (comp.type !== 'piston') continue;
      if ((comp.animTarget ?? (comp.extended ? 1 : 0)) === 0) continue;
      const { dr, dc } = _pistonDelta(comp.dir);
      this._pistonHeads.add(this._phKey(comp.col + dc, comp.row + dr));
    }
  }

  getAt(col, row) {
    return this._map.get(`${col},${row}`) || null;
  }

  // Called once per frame — updates pressure plates based on player position.
  // extraOnFn(col, row) → bool: optional extra "is-on" source (e.g. online joiners).
  update(level, player, input, extraOnFn) {
    for (const comp of this.components) {
      if (comp.type === 'pressure_plate') {
        const platePx = comp.col * BLOCK_SIZE;
        const platePy = comp.row * BLOCK_SIZE;
        const playerFeetY = player.y + player.height;
        const playerOnPlate =
          player.x + player.width > platePx + 4 &&
          player.x < platePx + BLOCK_SIZE - 4 &&
          Math.abs(playerFeetY - (platePy + BLOCK_SIZE)) < 8;

        const wasOn = comp.on;
        comp.on = playerOnPlate || !!(extraOnFn && extraOnFn(comp.col, comp.row));
        if (comp.on !== wasOn) {
          this._propagate(comp, level);
          if (this.soundCallback) this.soundCallback('sounds/pressure-plate.mp3', 0.6);
        }
      }
    }
  }

  // L key — toggle nearest lever within 64px of player centre
  // Find nearest lever without toggling it (used by online joiners to relay the action)
  findNearestLever(player) {
    const pcx = player.x + player.width / 2;
    const pcy = player.y + player.height / 2;
    let best = null, bestDist = 64;
    for (const comp of this.components) {
      if (comp.type !== 'lever') continue;
      const cx = comp.col * BLOCK_SIZE + BLOCK_SIZE / 2;
      const cy = comp.row * BLOCK_SIZE + BLOCK_SIZE / 2;
      const d  = Math.hypot(cx - pcx, cy - pcy);
      if (d < bestDist) { bestDist = d; best = comp; }
    }
    return best;
  }

  tryToggleLeverNear(level, player) {
    const pcx = player.x + player.width / 2;
    const pcy = player.y + player.height / 2;

    let best = null, bestDist = 64;
    for (const comp of this.components) {
      if (comp.type !== 'lever') continue;
      const cx = comp.col * BLOCK_SIZE + BLOCK_SIZE / 2;
      const cy = comp.row * BLOCK_SIZE + BLOCK_SIZE / 2;
      const d  = Math.hypot(cx - pcx, cy - pcy);
      if (d < bestDist) { bestDist = d; best = comp; }
    }

    if (best) {
      best.on = !best.on;
      this._propagate(best, level);
      return best; // return toggled component so caller can start dust propagation
    }
    return null;
  }

  _propagate(source, level) {
    if (!source.links) return;
    for (const key of source.links) {
      const target = this._map.get(key);
      if (!target) continue;
      const signal = source.on;
      this._activate(target, signal, level);
    }
  }

  _activate(comp, signal, level) {
    if (comp.type === 'trapdoor') {
      if (comp.open !== signal && this.soundCallback)
        this.soundCallback('sounds/trapdoor.mp3', 0.65);
      comp.open = signal;
    } else if (comp.type === 'piston') {
      const wantExtended = comp.inverted ? !signal : signal;
      const { dr, dc } = _pistonDelta(comp.dir);
      const headRow = comp.row + dr, headCol = comp.col + dc;

      if (wantExtended && !comp.extended) {
        const headBlock = level.get(headRow, headCol);
        if (headBlock === BLOCK.AIR) {
          comp.extended = true;
          if (this.soundCallback) this.soundCallback('sounds/piston.mp3', 0.7);
        } else if (!_PISTON_UNPUSHABLE.has(headBlock)) {
          const beyondRow = headRow + dr, beyondCol = headCol + dc;
          if (level.get(beyondRow, beyondCol) === BLOCK.AIR) {
            level.set(beyondRow, beyondCol, headBlock);
            level.set(headRow,   headCol,   BLOCK.AIR);
            comp.extended = true;
            if (this.soundCallback) this.soundCallback('sounds/piston.mp3', 0.7);
          }
        }
      } else if (!wantExtended && comp.extended) {
        comp.extended = false;
        if (this.soundCallback) this.soundCallback('sounds/piston.mp3', 0.6);
      }
      // Sync animation target to logical state
      if (comp.animTarget === undefined) comp.animProgress = comp.extended ? 1 : 0;
      comp.animTarget = comp.extended ? 1 : 0;
    } else if (comp.type === 'tnt') {
      if (signal && !comp.fuse) {
        comp.fuse = 120;
      }
    } else if (comp.type === 'pulse_converter') {
      // §Phase R (R2) — the ONE pulse→toggle mechanism: a RISING input edge flips a held state.
      const rising = signal && !comp._lastIn;
      comp._lastIn = signal;
      if (rising) this._toggleFlip(comp, level);
    } else if (comp.type === 'target') {
      // A Target Block can ALSO be driven by redstone (adjacency rule / a link) — same as a hit.
      const rising = signal && !comp._lastIn;
      comp._lastIn = signal;
      if (rising) this.hitTarget(comp.col, comp.row, level);
    }
  }

  // §Phase R — the single toggle-conversion primitive (used by the Pulse Converter AND a Target
  // Block in Toggle mode, so there is exactly ONE pulse→toggle implementation in the engine).
  _toggleFlip(comp, level) {
    comp.on = !comp.on;
    this._propagate(comp, level);
    if (this.soundCallback) this.soundCallback('sounds/lever.mp3', 0.5);
  }

  // §Phase R (R1) — a Target Block was hit (by an arrow, or in Toggle mode any attack). Pulse mode
  // emits a timed pulse; Toggle mode flips a held state via the shared _toggleFlip. Returns true if
  // a target was actually here. `byAttack` = a melee/thrown hit (only toggles OFF an already-on
  // toggle target; a Pulse target reacts to projectiles, per Kevin's spec).
  hitTarget(col, row, level, byAttack) {
    const comp = this.getAt(col, row);
    if (!comp || comp.type !== 'target') return false;
    if ((comp.mode || 'pulse') === 'toggle') {
      this._toggleFlip(comp, level);
    } else {
      if (byAttack) return true;                 // pulse targets only fire on a projectile hit
      comp.on = true; comp._pulseTimer = comp.pulseDur || 30;
      this._propagate(comp, level);
      if (this.soundCallback) this.soundCallback('sounds/blocked-shot.mp3', 0.5);
    }
    return true;
  }

  // Per-frame: count down active Target-Block pulses; drop to OFF (and propagate) when done.
  tickTargets(level) {
    for (const comp of this.components) {
      if (comp.type !== 'target' || !comp._pulseTimer) continue;
      if (--comp._pulseTimer <= 0) { comp._pulseTimer = 0; if (comp.on) { comp.on = false; this._propagate(comp, level); } }
    }
  }

  // Counts down TNT fuses; explodes when done
  tickTnt(level, mobManager) {
    for (const comp of this.components) {
      if (comp.type !== 'tnt' || !comp.fuse) continue;
      comp.fuse--;
      if (comp.fuse <= 0) {
        comp.fuse = 0;
        this._doExplosion(comp, level, mobManager);
      }
    }
  }

  _doExplosion(comp, level, mobManager) {
    const radius = 3;
    level.destroyRadius(comp.col, comp.row, radius);
    // Remove the TNT block itself
    level.set(comp.row, comp.col, BLOCK.AIR);
    // Damage mobs in range
    const cx = comp.col * BLOCK_SIZE + BLOCK_SIZE / 2;
    const cy = comp.row * BLOCK_SIZE + BLOCK_SIZE / 2;
    if (mobManager) {
      for (const mob of mobManager.mobs) {
        const mx = mob.x + mob.w / 2;
        const my = mob.y + mob.h / 2;
        if (Math.hypot(mx - cx, my - cy) < radius * BLOCK_SIZE) {
          mob.hp = 0;
        }
      }
    }
  }

  isTrapdoorOpen(col, row) {
    const comp = this.getAt(col, row);
    return comp && comp.type === 'trapdoor' && comp.open;
  }

  isPistonHeadAt(col, row) {
    // O(1) via the per-frame cache (see _rebuildPistonHeads). Was an O(components) scan on
    // every call — catastrophic under pathfinding, which calls isSolid → this a huge number
    // of times per A* run.
    return this._pistonHeads.has(this._phKey(col, row));
  }

  // Called once per frame to advance piston animation (6 frames ≈ 100ms at 60fps)
  updatePistonAnimations(speedMult = 1) {
    // Phase 3A.2: speedMult scales the per-frame extend/retract step (arena
    // redstoneSpeed); 1 = the original 6-frame animation.
    const SPEED = (1 / 6) * (speedMult || 1);
    for (const comp of this.components) {
      if (comp.type !== 'piston') continue;
      if (comp.animProgress === undefined) comp.animProgress = comp.extended ? 1 : 0;
      if (comp.animTarget   === undefined) comp.animTarget   = comp.extended ? 1 : 0;
      if (comp.animProgress === comp.animTarget) continue;
      const dir = comp.animTarget > comp.animProgress ? 1 : -1;
      comp.animProgress = Math.max(0, Math.min(1, comp.animProgress + dir * SPEED));
    }
    this._rebuildPistonHeads();   // refresh the O(1) piston-head cache for this frame's isSolid calls
  }

  // Dynamically add a component (for sandbox-placed levers/trapdoors)
  addComponent(comp) {
    this.components.push(comp);
    this._map.set(`${comp.col},${comp.row}`, comp);
    if (comp.type === 'piston') this._rebuildPistonHeads();
  }

  // Remove a component by grid position
  removeAt(col, row) {
    const key = `${col},${row}`;
    const idx = this.components.findIndex(c => c.col === col && c.row === row);
    const wasPiston = idx >= 0 && this.components[idx].type === 'piston';
    if (idx >= 0) this.components.splice(idx, 1);
    this._map.delete(key);
    if (wasPiston) this._rebuildPistonHeads();
  }

  // Draw state-aware redstone blocks on top of level render.
  // Levers, trapdoors, and pressure plates are rendered by level.draw() with
  // correct state, so skip them here to avoid double-painting.
  draw(ctx, camera, level) {
    for (const comp of this.components) {
      if (comp.type === 'lever' || comp.type === 'trapdoor' || comp.type === 'pressure_plate') continue;

      if (comp.type === 'piston') {
        // Body is drawn by level.draw() with direction state.
        // Draw animated rod + head using animProgress.
        const prog = comp.animProgress ?? (comp.extended ? 1 : 0);
        if (prog > 0) {
          const { dr, dc } = _pistonDelta(comp.dir);
          const bsx = comp.col * BLOCK_SIZE - camera.x;
          const bsy = comp.row * BLOCK_SIZE - camera.y;
          const headOff = BLOCK_SIZE * prog;

          // Rod: thin rectangle from body face toward head
          const ROD_W = 8, ROD_HALF = ROD_W / 2;
          ctx.fillStyle = '#888880';
          if (dc !== 0) {
            const rodX = dc > 0 ? bsx + BLOCK_SIZE : bsx - headOff;
            ctx.fillRect(rodX, bsy + BLOCK_SIZE / 2 - ROD_HALF, headOff, ROD_W);
          } else {
            const rodY = dr > 0 ? bsy + BLOCK_SIZE : bsy - headOff;
            ctx.fillRect(bsx + BLOCK_SIZE / 2 - ROD_HALF, rodY, ROD_W, headOff);
          }

          // Head block at animated position
          const hsx = Math.round(bsx + dc * headOff);
          const hsy = Math.round(bsy + dr * headOff);
          if (hsx > -BLOCK_SIZE && hsx < CANVAS_W + BLOCK_SIZE &&
              hsy > -BLOCK_SIZE && hsy < CANVAS_H + BLOCK_SIZE) {
            drawBlock(ctx, BLOCK.PISTON_HEAD, hsx, hsy, 0, { dir: comp.dir });
          }
        }
        continue;
      }

      const sx = comp.col * BLOCK_SIZE - camera.x;
      const sy = comp.row * BLOCK_SIZE - camera.y;
      if (sx < -BLOCK_SIZE || sx > CANVAS_W + BLOCK_SIZE) continue;
      if (sy < -BLOCK_SIZE || sy > CANVAS_H + BLOCK_SIZE) continue;

      const blockType = level.get(comp.row, comp.col);
      const state = { on: comp.on, open: comp.open, pressed: comp.on };
      drawBlock(ctx, blockType, sx, sy, 0, state);
    }
  }
}
