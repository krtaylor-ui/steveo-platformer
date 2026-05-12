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
  }

  getAt(col, row) {
    return this._map.get(`${col},${row}`) || null;
  }

  // Called once per frame — updates pressure plates based on player position
  update(level, player, input) {
    for (const comp of this.components) {
      if (comp.type === 'pressure_plate') {
        const platePx = comp.col * BLOCK_SIZE;
        const platePy = comp.row * BLOCK_SIZE;
        const playerFeetY = player.y + player.height;
        // Plate is drawn near the bottom of its cell; player stands on the floor
        // one row below, so check against the bottom edge (platePy + BLOCK_SIZE).
        const playerOnPlate =
          player.x + player.width > platePx + 4 &&
          player.x < platePx + BLOCK_SIZE - 4 &&
          Math.abs(playerFeetY - (platePy + BLOCK_SIZE)) < 8;

        const wasOn = comp.on;
        comp.on = playerOnPlate;
        if (comp.on !== wasOn) {
          this._propagate(comp, level);
        }
      }
    }
  }

  // L key — toggle nearest lever within 64px of player centre
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
      comp.open = signal;
    } else if (comp.type === 'piston') {
      const wantExtended = comp.inverted ? !signal : signal;
      const { dr, dc } = _pistonDelta(comp.dir);
      const headRow = comp.row + dr, headCol = comp.col + dc;

      if (wantExtended && !comp.extended) {
        const headBlock = level.get(headRow, headCol);
        if (headBlock === BLOCK.AIR) {
          comp.extended = true;
        } else if (!_PISTON_UNPUSHABLE.has(headBlock)) {
          const beyondRow = headRow + dr, beyondCol = headCol + dc;
          if (level.get(beyondRow, beyondCol) === BLOCK.AIR) {
            level.set(beyondRow, beyondCol, headBlock);
            level.set(headRow,   headCol,   BLOCK.AIR);
            comp.extended = true;
          }
        }
      } else if (!wantExtended && comp.extended) {
        comp.extended = false;
      }
      // Sync animation target to logical state
      if (comp.animTarget === undefined) comp.animProgress = comp.extended ? 1 : 0;
      comp.animTarget = comp.extended ? 1 : 0;
    } else if (comp.type === 'tnt') {
      if (signal && !comp.fuse) {
        comp.fuse = 120;
      }
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
    for (const comp of this.components) {
      if (comp.type !== 'piston') continue;
      // Solid once targeting extended, regardless of animation progress
      if ((comp.animTarget ?? (comp.extended ? 1 : 0)) === 0) continue;
      const { dr, dc } = _pistonDelta(comp.dir);
      if (comp.col + dc === col && comp.row + dr === row) return true;
    }
    return false;
  }

  // Called once per frame to advance piston animation (6 frames ≈ 100ms at 60fps)
  updatePistonAnimations() {
    const SPEED = 1 / 6;
    for (const comp of this.components) {
      if (comp.type !== 'piston') continue;
      if (comp.animProgress === undefined) comp.animProgress = comp.extended ? 1 : 0;
      if (comp.animTarget   === undefined) comp.animTarget   = comp.extended ? 1 : 0;
      if (comp.animProgress === comp.animTarget) continue;
      const dir = comp.animTarget > comp.animProgress ? 1 : -1;
      comp.animProgress = Math.max(0, Math.min(1, comp.animProgress + dir * SPEED));
    }
  }

  // Dynamically add a component (for sandbox-placed levers/trapdoors)
  addComponent(comp) {
    this.components.push(comp);
    this._map.set(`${comp.col},${comp.row}`, comp);
  }

  // Remove a component by grid position
  removeAt(col, row) {
    const key = `${col},${row}`;
    const idx = this.components.findIndex(c => c.col === col && c.row === row);
    if (idx >= 0) this.components.splice(idx, 1);
    this._map.delete(key);
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
