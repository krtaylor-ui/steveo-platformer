// ============================================================
// overhead-perf.js — frame budget, adaptive quality, and a pre-launch cost estimate.
//
// The problem this solves (Kevin, density-4 100x70 world): the overhead renderer's cost is
// dominated by PER-VISIBLE-CELL passes, and the visible-cell count grows as zoom^-2. So the
// same world runs 60fps zoomed in and ~30 zoomed out, and the first seconds sit near 8fps
// while the terrain cache bakes. Nothing changed but the zoom.
//
// The expensive passes, worst first:
//   1. live shadows      — TWO loops over every visible raised cell (cast + erase) into a
//                          full-canvas offscreen, then a blur on the composite
//   2. night lighting    — offscreen darkness with a punch-through per light source
//   3. glass glare       — per visible glass cell
//   4. focus/elev overlay (editor only) — already gated below ~7px per cell in build 349
//
// Two deliberate choices here, both from Kevin's brief:
//   * PREDICTABLE beats fast. A steady 30 reads better than 8-to-60 swings, so the governor
//     picks a target it can hold and caps to it rather than letting frames run free.
//   * The designer is told BEFORE play, not surprised during. estimate() is pure so the
//     editor / pre-launch screen can call it and warn.
// ============================================================
(function () {
  // Per-visible-cell cost weights, relative to a plain terrain blit (which is ~free: one
  // drawImage). These are ORDERS not measurements — they only need to rank passes correctly
  // and scale linearly with cell count, which is what the governor and the estimate rely on.
  const COST = {
    shadowsLive: 2.0,     // two per-cell loops + offscreen + blur
    night: 0.6,           // offscreen darkness + light cut-outs
    glare: 0.25,          // per glass cell
    shadowsFixed: 0.05,   // baked once, then one blit
  };

  // Quality tiers, richest first. The governor walks DOWN this list when it cannot hold its
  // target and back up when it comfortably can. Each tier names what it sacrifices, so the
  // HUD can say why the picture changed.
  const TIERS = [
    { id: 'full',   label: 'Full',            shadows: 'live',  night: true,  glare: true },
    { id: 'noglare', label: 'No glass glare', shadows: 'live',  night: true,  glare: false },
    { id: 'baked',  label: 'Baked shadows',   shadows: 'fixed', night: true,  glare: false },
    { id: 'noshadow', label: 'No shadows',    shadows: 'off',   night: true,  glare: false },
    { id: 'flat',   label: 'Flat (no night)', shadows: 'off',   night: false, glare: false },
  ];

  // Estimated per-frame cell-work for a configuration. `cells` = visible cells.
  function frameCost(cells, cfg) {
    let w = 0;
    if (cfg.shadows === 'live') w += COST.shadowsLive;
    else if (cfg.shadows === 'fixed') w += COST.shadowsFixed;
    if (cfg.night) w += COST.night;
    if (cfg.glare) w += COST.glare;
    return cells * w;
  }

  // ── Pre-launch estimate ─────────────────────────────────────────────────────
  // Pure: give it the world + a viewport and it reports what a designer should know.
  // `budget` is the per-frame cell-work a mid-range machine handles at 60fps; derived from
  // the observed break-even (a density-4 400x280 grid zoomed out went to ~30fps with live
  // shadows on), so it is calibrated, not invented — but it is one data point, so treat the
  // BANDS as advice rather than a promise.
  const BUDGET_60 = 26000;

  function estimate(world, opts) {
    opts = opts || {};
    const m = (world && world.mapSnapshot) || world || {};
    const density = m.density || 1;
    const gridW = (m.gridW || 0), gridH = (m.gridH || 0);
    const cells = gridW * gridH;
    const s = (world && world.settings) || {};
    const zoom = opts.zoom || s.defaultZoom || 1;
    // Cells on screen at this zoom: the viewport in world px / cell px, both axes.
    const cellPx = (m.cell || (32 / density)) * zoom;
    const vw = opts.viewW || 1280, vh = opts.viewH || 720;
    const visible = Math.min(cells, Math.ceil(vw / Math.max(1, cellPx)) * Math.ceil(vh / Math.max(1, cellPx)));

    const cfg = {
      shadows: s.shadows === false ? 'off' : (s.shadowStyle === 'fixed' ? 'fixed' : 'live'),
      night: !!s.dayNight,
      glare: !!s.dayNight,
    };
    const cost = frameCost(visible, cfg);
    const mobs = ((world && world.mobs) || []).length;
    const devices = ((world && world.redstone) || []).length;
    // Mobs and devices are per-entity, not per-cell, and much cheaper — but they add up, and
    // a designer who has placed 200 mobs deserves to be told.
    const entityCost = mobs * 40 + devices * 12;
    const total = cost + entityCost;
    const fps = Math.max(6, Math.min(60, Math.round(60 * BUDGET_60 / Math.max(1, total))));

    const warnings = [];
    if (cfg.shadows === 'live' && visible > 12000) {
      warnings.push('Live shadows on ' + visible.toLocaleString() + ' visible cells is the single biggest cost here — switch Shadow style to Fixed, or raise the default zoom.');
    }
    if (density >= 3 && cells > 40000) {
      // gridW/gridH are ALREADY density-multiplied (a 100x70 map at density 4 reports
      // 400x280), so derive the block size back out rather than multiplying again.
      const bw = m.baseW || Math.round(gridW / density), bh = m.baseH || Math.round(gridH / density);
      warnings.push('A ' + bw + '×' + bh + ' map at density ' + density + ' is ' + gridW + '×' + gridH + ' = ' + cells.toLocaleString() + ' cells. Zooming out draws all of them; consider a smaller map, a higher density floor, or a minimum zoom.');
    }
    if (mobs > 60) warnings.push(mobs + ' mobs: each one paths and draws every frame. Above ~60 the AI budget starts to bite.');
    if (devices > 120) warnings.push(devices + ' redstone devices re-evaluate as a network each frame.');
    // The VERDICT is separate from the warnings on purpose. A world can be comfortable at
    // this zoom and still carry a standing note (e.g. "it is 112,000 cells if you zoom out"),
    // and suppressing the good news because a note exists reads as alarming when it isn't.
    const band = fps >= 55 ? 'smooth' : fps >= 40 ? 'good' : fps >= 25 ? 'playable' : 'heavy';
    const verdict = band === 'smooth' ? 'Comfortable at this zoom — about ' + fps + 'fps.'
      : band === 'good' ? 'Fine at this zoom — about ' + fps + 'fps.'
      : band === 'playable' ? 'Playable but not smooth — about ' + fps + 'fps. Adaptive quality will trim passes.'
      : 'Heavy — about ' + fps + 'fps at this zoom. Change something below, or the picture will be trimmed to cope.';

    return {
      gridW, gridH, density, cells, visible, mobs, devices,
      shadows: cfg.shadows, night: cfg.night,
      cost: Math.round(total), fps, band, verdict, warnings,
    };
  }

  // ── Runtime governor ────────────────────────────────────────────────────────
  // Watches real frame times and settles on a tier + a frame cap it can actually hold.
  // Hysteresis is the whole point: it must not flap between tiers every second, because a
  // picture that keeps changing is worse than one that is consistently plainer.
  function makeGovernor(opts) {
    opts = opts || {};
    return {
      enabled: opts.enabled !== false,
      tier: 0,                     // index into TIERS
      cap: opts.cap || 60,         // frames per second we are aiming to hold
      userCap: opts.cap || 60,     // the DESIGNER's cap — the governor may go below it, never above
      _win: [],                    // recent frame times (ms)
      _hold: 0,                    // frames to wait before changing anything again
      _drops: 0,
      reason: '',

      cfg() { return TIERS[Math.min(this.tier, TIERS.length - 1)]; },
      tierLabel() { return this.cfg().label; },

      // Call once per frame with the measured frame time.
      sample(ms) {
        if (!this.enabled) return;
        this._win.push(ms);
        if (this._win.length > 45) this._win.shift();
        if (this._hold > 0) { this._hold--; return; }
        if (this._win.length < 30) return;                       // need a real sample first
        const sorted = this._win.slice().sort((a, b) => a - b);
        const p90 = sorted[Math.floor(sorted.length * 0.9)];
        const target = 1000 / this.cap;
        // Missing the target at the 90th percentile = a visible stutter, not noise.
        //
        // POLICY (deliberate, from Kevin's brief that predictable beats fast): give up the
        // cheapest visual first, then LOWER THE CAP rather than stripping the world's look,
        // and only sacrifice shadows and night if a 30fps cap still cannot be held. A steady
        // 30 with shadows beats a stuttering 60 without them.
        if (p90 > target * 1.35) {
          if (this.tier === 0) {
            this.tier = 1; this._drops++;
            this.reason = 'dropped to ' + this.tierLabel() + ' (p90 ' + p90.toFixed(1) + 'ms)';
          } else if (this.cap > 30) {
            this.cap = (this.cap > 45) ? 45 : 30;
            this.reason = 'capped to ' + this.cap + 'fps for consistency';
          } else if (this.tier < TIERS.length - 1) {
            this.tier++; this._drops++;
            this.reason = 'dropped to ' + this.tierLabel() + ' (p90 ' + p90.toFixed(1) + 'ms)';
          } else {
            this.reason = 'at minimum quality and 30fps — this world is too heavy to draw';
          }
          this._settle();
        } else if (p90 < target * 0.55) {
          // Recover visuals BEFORE speed: the look is what the designer chose.
          if (this.tier > 0) { this.tier--; this.reason = 'restored ' + this.tierLabel(); this._settle(); }
          else if (this.cap < (this.userCap || 60)) { this.cap = Math.min(this.userCap || 60, (this.cap < 45) ? 45 : 60); this.reason = 'raised cap to ' + this.cap + 'fps'; this._settle(); }
        }
      },
      _settle() { this._win.length = 0; this._hold = 90; },      // ~1.5s of calm before re-judging
      // Should this frame be drawn, given the cap? Called with a timestamp.
      shouldRender(nowMs) {
        if (!this.cap || this.cap >= 60) return true;
        const min = 1000 / this.cap - 1;                          // -1ms of slack for jitter
        if (this._last != null && nowMs - this._last < min) return false;
        this._last = nowMs;
        return true;
      },
    };
  }

  const OH_PERF = { COST, TIERS, BUDGET_60, frameCost, estimate, makeGovernor };
  if (typeof window !== 'undefined') window.OH_PERF = OH_PERF;
  if (typeof module !== 'undefined' && module.exports) module.exports = OH_PERF;
})();
