// ============================================================
// level.js — Level data, generation, rendering, block breaking
// ============================================================

class Level {
  constructor(data) {
    this.grid    = data.grid;
    this.width   = data.width;
    this.height  = data.height;
    this.goalCol = data.goalCol;
    this.goalRow = data.goalRow;
    this.spawnX  = data.spawnX;
    this.spawnY  = data.spawnY;

    this.pixelWidth  = this.width  * BLOCK_SIZE;
    this.pixelHeight = this.height * BLOCK_SIZE;

    // Active block being mined: { row, col, progress [0–1] }
    this.breaking = null;
  }

  get(row, col) {
    if (row < 0 || row >= this.height || col < 0 || col >= this.width) {
      return BLOCK.BEDROCK;
    }
    return this.grid[row][col];
  }

  set(row, col, blockType) {
    if (row >= 0 && row < this.height && col >= 0 && col < this.width) {
      this.grid[row][col] = blockType;
    }
  }

  isSolid(row, col) {
    const b = this.get(row, col);
    const d = BLOCK_DATA[b];
    return d ? d.solid : true; // out-of-bounds treated as solid
  }

  // ── Mining ─────────────────────────────────────────────────

  startBreaking(row, col) {
    if (this.breaking && (this.breaking.row !== row || this.breaking.col !== col)) {
      this.breaking = null; // reset if target changed
    }
    if (!this.breaking) {
      this.breaking = { row, col, progress: 0 };
    }
  }

  stopBreaking() {
    this.breaking = null;
  }

  // Returns { broken, blockType } on completion, { tooWeak, blockName, requiredTier } if tier too low, else null
  updateBreaking(playerCX, playerCY, pickaxeTier = 0, mineSpeed = 1.0, reach = BREAK_REACH) {
    if (!this.breaking) return null;

    const { row, col } = this.breaking;
    const blockType = this.get(row, col);
    const data      = BLOCK_DATA[blockType];

    if (!data || !data.mineable || blockType === BLOCK.AIR) {
      this.breaking = null;
      return null;
    }

    // Range check
    const bx = col * BLOCK_SIZE + BLOCK_SIZE / 2;
    const by = row * BLOCK_SIZE + BLOCK_SIZE / 2;
    const dist = Math.hypot(bx - playerCX, by - playerCY) / BLOCK_SIZE;
    if (dist > reach) {
      this.breaking = null;
      return null;
    }

    // Tier check — pickaxe too weak for this block
    const requiredTier = data.mineTier ?? 0;
    if (pickaxeTier < requiredTier) {
      return { tooWeak: true, blockName: data.name, requiredTier };
    }

    this.breaking.progress += mineSpeed / data.hardness;

    if (this.breaking.progress >= 1) {
      this.set(row, col, BLOCK.AIR);
      const result = { broken: true, blockType };
      this.breaking = null;
      return result;
    }

    return null;
  }

  getBreakProgress(row, col) {
    if (this.breaking && this.breaking.row === row && this.breaking.col === col) {
      return this.breaking.progress;
    }
    return 0;
  }

  // ── Rendering ──────────────────────────────────────────────

  draw(ctx, camera, redstone = null, frame = 0, editor = false, trampFx = null) {
    // SR zoom scales around canvas centre, so the visible world region is
    // centred on (camera.x + CANVAS_W/2, camera.y + CANVAS_H/2) and expands
    // symmetrically by 1/z in both directions.  The old formula only expanded
    // the right/bottom edge, leaving left/top blocks unrendered at high speed.
    const invZoom   = 1 / (camera._srZoom || 1.0);
    const leftEdge  = camera.x + CANVAS_W / 2 * (1 - invZoom);
    const rightEdge = camera.x + CANVAS_W / 2 * (1 + invZoom);
    const topEdge   = camera.y + CANVAS_H / 2 * (1 - invZoom);
    const botEdge   = camera.y + CANVAS_H / 2 * (1 + invZoom);
    const startCol  = Math.max(0,             Math.floor(leftEdge  / BLOCK_SIZE) - 1);
    const endCol    = Math.min(this.width-1,  Math.ceil( rightEdge / BLOCK_SIZE) + 1);
    const startRow  = Math.max(0,             Math.floor(topEdge   / BLOCK_SIZE) - 1);
    const endRow    = Math.min(this.height-1, Math.ceil( botEdge   / BLOCK_SIZE) + 1);

    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        const block = this.grid[r][c];
        if (block === BLOCK.AIR) continue;
        // Transmitter/Receiver drawn by game._drawTxRxBlocks(); piston heads by redstone.draw()
        if (block === BLOCK.TRANSMITTER || block === BLOCK.RECEIVER ||
            block === BLOCK.PISTON_HEAD) continue;
        // Smart Mobs §10 — decorative foliage is drawn in its own back/front passes
        // (game._drawFoliageBack / _drawFoliageFront) so it can layer around entities
        // and carry per-cell colour. Skip it here.
        if (isFoliageBlock(block)) continue;

        const screenX = c * BLOCK_SIZE - camera.x;
        const screenY = r * BLOCK_SIZE - camera.y;
        const bp      = this.getBreakProgress(r, c);

        let state = {};
        if (block === BLOCK.BED) {
          const rightNeighbor = (c + 1 < this.width) ? this.grid[r][c + 1] : BLOCK.AIR;
          const leftNeighbor  = (c - 1 >= 0)         ? this.grid[r][c - 1] : BLOCK.AIR;
          if (rightNeighbor === BLOCK.BED) {
            state = { bedHalf: 'left' };
          } else if (leftNeighbor === BLOCK.BED) {
            state = { bedHalf: 'right' };
          }
        } else if (block === BLOCK.LEVER && redstone) {
          const comp = redstone.getAt(c, r);
          if (comp) state = { on: !!comp.on };
        } else if (block === BLOCK.TRAPDOOR && redstone) {
          const comp = redstone.getAt(c, r);
          if (comp) state = { open: !!comp.open };
        } else if (block === BLOCK.PRESSURE_PLATE && redstone) {
          const comp = redstone.getAt(c, r);
          if (comp) state = { pressed: !!comp.on };
        } else if (block === BLOCK.PISTON_BODY && redstone) {
          const comp = redstone.getAt(c, r);
          if (comp) state = { dir: comp.dir || 'right', inverted: !!comp.inverted };
        } else if (block === BLOCK.REDSTONE_LAMP && redstone) {
          const comp = redstone.getAt(c, r);
          state = { on: comp ? !!comp.on : false, colorIdx: comp ? (comp.color || 0) : 0 };   // §Phase R
        } else if (block === BLOCK.PULSE_CONVERTER && redstone) {
          const _cmp = redstone.getAt(c, r);
          state = { on: _cmp ? !!_cmp.on : false, dir: _cmp ? (_cmp.dir || (_cmp.axis === 'v' ? 'down' : 'right')) : 'right' };   // §Phase R
        } else if (block === BLOCK.COIN || block === BLOCK.QUESTION_BLOCK ||
                   block === BLOCK.CONVEYOR_LEFT || block === BLOCK.CONVEYOR_RIGHT) {
          state = { frame };                       // §Classic Blocks — animation tick
        } else if (block === BLOCK.HIDDEN_BLOCK) {
          state = { editor };                      // invisible in play; dashed outline in the editor
        } else if (block === BLOCK.WARP_PIPE || block === BLOCK.PIPE_STEM) {
          const pipe = (rr, cc) => { const b = (rr >= 0 && rr < this.height && cc >= 0 && cc < this.width) ? this.grid[rr][cc] : 0; return b === BLOCK.WARP_PIPE || b === BLOCK.PIPE_STEM; };
          state = { pipeT: pipe(r - 1, c), pipeB: pipe(r + 1, c), pipeL: pipe(r, c - 1), pipeR: pipe(r, c + 1) };
        } else if (block === BLOCK.TRAMPOLINE || block === BLOCK.SLIME_BLOCK) {
          const f = trampFx && trampFx.get(r + ',' + c);   // 0..10 compression frames
          state = { compress: f ? f / 10 : 0 };
        } else if (block === BLOCK.TUBE_WALL) {
          state = { world: true };   // §Travel Tube — in-world, the tube stroke passes render it (draw NOTHING per-cell); the palette (no world flag) shows an icon
        }

        drawBlock(ctx, block, screenX, screenY, bp, state);
      }
    }
  }

  // Highlight the block the cursor is hovering over
  // Creeper explosion: remove blocks in circular radius
  destroyRadius(centerCol, centerRow, radius) {
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        if (dr * dr + dc * dc > radius * radius) continue;
        const b = this.get(centerRow + dr, centerCol + dc);
        if (b !== BLOCK.BEDROCK && b !== BLOCK.AIR && b !== BLOCK.GOAL) {
          this.set(centerRow + dr, centerCol + dc, BLOCK.AIR);
        }
      }
    }
  }

  drawHover(ctx, row, col, camera) {
    if (row < 0 || row >= this.height || col < 0 || col >= this.width) return;
    if (this.get(row, col) === BLOCK.AIR) return;
    const sx = col * BLOCK_SIZE - camera.x;
    const sy = row * BLOCK_SIZE - camera.y;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth   = 2;
    ctx.strokeRect(sx + 1, sy + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2);
    ctx.restore();
  }
}

// ============================================================
// Level generation — Level 1: Plains Biome
// ============================================================

function buildLevel1() {
  const W = 150, H = 20;

  // Create empty grid
  const grid = Array.from({ length: H }, () => new Array(W).fill(BLOCK.AIR));

  const set = (r, c, b) => {
    if (r >= 0 && r < H && c >= 0 && c < W) grid[r][c] = b;
  };
  const get = (r, c) => {
    if (r < 0 || r >= H || c < 0 || c >= W) return BLOCK.BEDROCK;
    return grid[r][c];
  };

  // ── Ground height map (row where grass appears) ────────────
  const gh = new Array(W).fill(13);

  // Section 2 — gentle hill
  gh[17] = 12; gh[18] = 12; gh[19] = 11; gh[20] = 11;
  gh[21] = 11; gh[22] = 11; gh[23] = 12; gh[24] = 12;

  // Section 3 — low valley leading to gap
  for (let c = 35; c <= 39; c++) gh[c] = 13;

  // Section 4 — lower ground after gap
  for (let c = 46; c <= 80; c++) gh[c] = 14;

  // Section 5 — gradual rise
  gh[81] = 13; gh[82] = 12; gh[83] = 12; gh[84] = 11;
  for (let c = 85; c <= 115; c++) gh[c] = 11;

  // Section 6 — elevated final plateau
  gh[116] = 10; gh[117] = 10; gh[118] = 9; gh[119] = 9;
  for (let c = 120; c <= 148; c++) gh[c] = 9;

  // Raised goal pedestal
  for (let c = 140; c <= 148; c++) gh[c] = 8;

  // ── Gaps (columns with no ground) ─────────────────────────
  // Gap A: cols 40–44 (5-block pit)
  const gapA = (c) => c >= 40 && c <= 44;

  // ── Fill terrain ──────────────────────────────────────────
  for (let c = 0; c < W; c++) {
    if (gapA(c)) continue;

    const gr = gh[c];
    set(gr,     c, BLOCK.GRASS);
    set(gr + 1, c, BLOCK.DIRT);
    set(gr + 2, c, BLOCK.DIRT);
    set(gr + 3, c, BLOCK.DIRT);
    for (let r = gr + 4; r < H - 1; r++) set(r, c, BLOCK.STONE);
    set(H - 1, c, BLOCK.BEDROCK);
  }

  // Bedrock in gap floor
  for (let c = 40; c <= 44; c++) {
    set(H - 1, c, BLOCK.BEDROCK);
    set(H - 2, c, BLOCK.STONE);
    set(H - 3, c, BLOCK.STONE);
  }

  // ── Trees ─────────────────────────────────────────────────
  const addTree = (tc, trunkH = 4) => {
    const gr = gh[tc];
    // Trunk
    for (let r = gr - trunkH; r < gr; r++) set(r, tc, BLOCK.OAK_LOG);
    // Canopy (oval)
    for (let dr = -(trunkH + 2); dr <= -(trunkH - 1); dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        if (get(gr + dr, tc + dc) === BLOCK.AIR) set(gr + dr, tc + dc, BLOCK.OAK_LEAVES);
      }
    }
    // Top cap
    for (let dc = -1; dc <= 1; dc++) {
      if (get(gr - trunkH - 3, tc + dc) === BLOCK.AIR) {
        set(gr - trunkH - 3, tc + dc, BLOCK.OAK_LEAVES);
      }
    }
  };

  addTree(8);
  addTree(28);
  addTree(62);
  addTree(95);
  addTree(128);

  // ── Floating platforms (oak planks) ───────────────────────
  const plat = (r, c, len) => {
    for (let i = 0; i < len; i++) set(r, c + i, BLOCK.OAK_PLANKS);
  };

  plat(9,  18, 5);    // Over the small hill / pre-gap approach
  plat(10, 41, 3);    // Over gap A (floating helper)
  plat(12, 55, 4);    // Inside lower section
  plat(11, 70, 5);    // Continuation
  plat(9,  88, 5);    // Approaching the rise
  plat(7, 104, 6);    // High platform
  plat(6, 118, 5);    // Very high approach

  // ── Ores ──────────────────────────────────────────────────
  const ore = (r, c, type) => { if (get(r, c) === BLOCK.STONE) set(r, c, type); };

  // Coal ore pockets (moderately deep)
  [
    [16, 10], [16, 22], [17, 15], [16, 36], [17, 38],
    [16, 50], [17, 60], [17, 68], [16, 82], [16, 100],
    [17, 108],[16, 118],[17, 132],
  ].forEach(([r, c]) => ore(r, c, BLOCK.COAL_ORE));

  // Iron ore (deeper, requires stone pickaxe)
  [
    [17, 12], [18, 20], [18, 48], [17, 72],
    [18, 90], [17, 114],[18, 137],
  ].forEach(([r, c]) => ore(r, c, BLOCK.IRON_ORE));

  // Gold ore (deep, requires stone pickaxe)
  [
    [17, 18], [18, 32], [18, 62], [17, 78],
    [17, 103],[18, 122],
  ].forEach(([r, c]) => ore(r, c, BLOCK.GOLD_ORE));

  // Diamond ore (very deep, requires iron pickaxe)
  [
    [18, 25], [18, 52], [18, 92], [18, 135],
  ].forEach(([r, c]) => ore(r, c, BLOCK.DIAMOND_ORE));

  // Netherite ore (deepest and rarest, requires diamond pickaxe)
  [
    [18, 38], [18, 74], [18, 125],
  ].forEach(([r, c]) => ore(r, c, BLOCK.NETHERITE_ORE));

  // ── Goal block ────────────────────────────────────────────
  const goalCol = 144;
  const goalRow = gh[goalCol] - 1;
  set(goalRow, goalCol, BLOCK.GOAL);

  // Spawn point — above the ground at col 2
  const spawnX = 2 * BLOCK_SIZE;
  const spawnY = gh[2] * BLOCK_SIZE - PLAYER_H;  // feet flush with grass top

  return { grid, width: W, height: H, goalCol, goalRow, spawnX, spawnY };
}
