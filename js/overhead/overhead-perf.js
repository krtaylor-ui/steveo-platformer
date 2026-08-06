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
  // The three expensive passes, cheapest → dearest (so "cheapest first" is array order).
  const PASSES = [
    { key: 'glare', cost: COST.glare, name: 'glass glare' },
    { key: 'night', cost: COST.night, name: 'night lighting' },
    { key: 'shadows', cost: COST.shadowsLive, name: 'shadows' },
  ];
  // Per-pass POLICY set by the designer (build 371, P3.9). This REPLACES tier drag-ordering:
  // instead of ranking a fixed ladder, the designer marks each pass Protected / Sacrificeable
  // / Off, which answers the real question ("never take my shadows"). Under sustained load
  // the governor still follows the same order Kevin fixed: give up the cheapest SACRIFICEABLE
  // pass first, then LOWER THE CAP, and only as a last resort touch a PROTECTED pass (cheapest
  // first). 'off' means the designer already turned it off, so it never draws and the governor
  // never has to. Recovery restores visuals before speed. Defaults keep the old behaviour
  // (glare goes first, shadows + night are protected).
  function makeGovernor(opts) {
    opts = opts || {};
    const flags = Object.assign({ shadows: 'protected', night: 'protected', glare: 'sacrificeable' }, opts.flags || {});
    return {
      enabled: opts.enabled !== false,
      flags,
      cap: opts.cap || 60,         // frames per second we are aiming to hold
      userCap: opts.cap || 60,     // the DESIGNER's cap — the governor may go below it, never above
      _win: [],                    // recent frame times (ms)
      _hold: 0,                    // frames to wait before changing anything again
      _drops: 0,
      _stack: [],                  // passes the governor has sacrificed, in drop order (LIFO restore)
      _dropped: {},
      reason: '',

      // `tier` = how many passes are currently sacrificed — a small integer the soak log + HUD
      // already read. 0 = the designer's full look.
      get tier() { return this._stack.length; },
      _active(k) { return this.flags[k] !== 'off' && !this._dropped[k]; },
      cfg() {
        return {
          shadows: this._active('shadows') ? 'live' : 'off',     // draw applies shadowStyle (live vs baked)
          night: this._active('night'),
          glare: this._active('glare'),
          id: this._stack.length ? ('drop:' + this._stack.join('+')) : 'full',
          label: this.tierLabel(),
        };
      },
      tierLabel() {
        const off = PASSES.filter((p) => !this._active(p.key)).map((p) => p.name);
        return off.length ? ('No ' + off.join(' / ')) : 'Full';
      },
      _next(flag) { return PASSES.find((p) => this.flags[p.key] === flag && !this._dropped[p.key]); },

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
        if (p90 > target * 1.35) {                               // a visible stutter, not noise
          const sac = this._next('sacrificeable');
          if (sac) {                                             // 1. cheapest sacrificeable pass
            this._drop(sac.key); this.reason = 'dropped ' + sac.name + ' (sacrificeable, p90 ' + p90.toFixed(1) + 'ms)';
          } else if (this.cap > 30) {                            // 2. lower the cap for consistency
            this.cap = (this.cap > 45) ? 45 : 30; this.reason = 'capped to ' + this.cap + 'fps for consistency';
          } else {
            const prot = this._next('protected');
            if (prot) {                                          // 3. last resort: a protected pass
              this._drop(prot.key); this.reason = 'dropped ' + prot.name + ' (protected — last resort, p90 ' + p90.toFixed(1) + 'ms)';
            } else { this.reason = 'at minimum quality and 30fps — this world is too heavy to draw'; return; }
          }
          this._settle();
        } else if (p90 < target * 0.55) {
          // Recover visuals BEFORE speed: restore the most-recently-sacrificed pass, then cap.
          if (this._stack.length) { const k = this._stack.pop(); this._dropped[k] = false; this.reason = 'restored ' + (PASSES.find((p) => p.key === k) || {}).name; this._settle(); }
          else if (this.cap < (this.userCap || 60)) { this.cap = Math.min(this.userCap || 60, (this.cap < 45) ? 45 : 60); this.reason = 'raised cap to ' + this.cap + 'fps'; this._settle(); }
        }
      },
      _drop(k) { this._dropped[k] = true; this._stack.push(k); this._drops++; },
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

  // ── Soak log ────────────────────────────────────────────────────────────────
  // A rolling timeline so an all-day run produces a COPYABLE result instead of "I glanced at
  // the HUD a few times". It records what a soak actually needs to distinguish a real leak
  // from workload noise: heap over time (a monotonic climb is a leak regardless of load),
  // worst-frame, and every governor decision with a timestamp — so a quality drop can be
  // matched against whatever else the machine was doing at 14:12.
  //
  // Deliberately cheap: one sample every 15s, capped, and nothing per-frame beyond a compare.
  function makeSoakLog(opts) {
    opts = opts || {};
    const every = opts.intervalMs || 15000;
    const cap = opts.maxSamples || 2600;              // ~11 hours at 15s
    const log = {
      // startedAt is a MONOTONIC clock reading (performance.now), not an epoch time — printing
      // it as a date gives 1970. startedAtEpoch is the wall-clock companion for reports.
      startedAt: null, startedAtEpoch: null, samples: [], errors: 0, warnings: 0, events: [],
      _next: 0, _lastTier: null, _lastCap: null,

      // Count real page errors, so "zero console errors" is measured, not remembered.
      // Hook the page ONCE per page, not once per log. A new OverheadGame builds a new log,
      // so re-entering Test repeatedly used to add a listener pair every time — an accumulation
      // that also double-counted errors into whichever logs were still alive. The counter now
      // lives on the window and every log reads from it. (QA F-A7.3.)
      hook() {
        if (typeof window === 'undefined') return;
        if (!window.__ohErrCount) {
          window.__ohErrCount = { n: 0 };
          window.addEventListener('error', () => { window.__ohErrCount.n++; });
          window.addEventListener('unhandledrejection', () => { window.__ohErrCount.n++; });
        }
        this._errBase = window.__ohErrCount.n;   // count errors since THIS log started
      },
      get errorCount() {
        if (typeof window === 'undefined' || !window.__ohErrCount) return this.errors;
        return Math.max(this.errors, window.__ohErrCount.n - (this._errBase || 0));
      },

      // Called each frame; does nothing but a clock compare until a sample is due.
      tick(now, stats, gov) {
        if (this.startedAt == null) {
          this.startedAt = now; this._next = now; this.hook();
          try { this.startedAtEpoch = Date.now(); } catch (e) { this.startedAtEpoch = null; }
        }
        // Governor decisions are logged the MOMENT they happen, not at the next sample.
        if (gov && (gov.tier !== this._lastTier || gov.cap !== this._lastCap)) {
          if (this._lastTier != null) this.events.push({ at: Math.round((now - this.startedAt) / 1000), what: gov.reason || ('tier ' + gov.tier + ' cap ' + gov.cap) });
          this._lastTier = gov.tier; this._lastCap = gov.cap;
        }
        if (now < this._next) return;
        // Skip a sample with no measured frame rate. The very first tick fires before any
        // frame interval exists, so it recorded fps 0 and dragged min/avg down for the whole
        // run. (QA A7.3, build 362.)
        if (!stats || !(stats.fps > 0)) { this._next = now + Math.min(every, 1000); return; }
        this._next = now + every;
        if (this.samples.length >= cap) this.samples.shift();
        let heap = 0;
        try { if (typeof performance !== 'undefined' && performance.memory) heap = Math.round(performance.memory.usedJSHeapSize / 1048576); } catch (e) {}
        this.samples.push({
          s: Math.round((now - this.startedAt) / 1000),
          fps: stats ? Math.round(stats.fps) : 0,
          worst: stats ? Math.round(stats.worstMs) : 0,
          cells: stats ? stats.cells : 0,
          heap, tier: gov ? gov.tier : 0, cap: gov ? gov.cap : 60, err: this.errorCount,
        });
      },

      // Human-readable summary — this is what gets pasted into a report.
      summary() {
        const n = this.samples.length;
        if (!n) return 'soak: no samples yet';
        const first = this.samples[0], last = this.samples[n - 1];
        const fps = this.samples.map((x) => x.fps), heaps = this.samples.map((x) => x.heap);
        const avg = (a) => Math.round(a.reduce((p, c) => p + c, 0) / a.length);
        const worst = Math.max.apply(null, this.samples.map((x) => x.worst));
        // Leak signal: compare the first and last thirds rather than endpoints, so one GC
        // dip at the end cannot hide a climb.
        const third = Math.max(1, Math.floor(n / 3));
        const heapEarly = avg(heaps.slice(0, third)), heapLate = avg(heaps.slice(-third));
        const drift = heapEarly ? Math.round((heapLate - heapEarly) / heapEarly * 100) : 0;
        // A percentage alone is far too eager on a small heap: +40% of 20MB is 8MB, which a
        // handful of offscreen canvases produces. Require BOTH a relative and an absolute
        // rise before calling it a leak. (QA F-A7.3.)
        const leak = drift > 25 && (heapLate - heapEarly) >= 15;
        return [
          'SOAK ' + Math.round(last.s / 60) + ' min, ' + n + ' samples'
            + (this.startedAtEpoch ? '  (started ' + new Date(this.startedAtEpoch).toLocaleString() + ')' : ''),
          'fps      first ' + first.fps + '  last ' + last.fps + '  avg ' + avg(fps) + '  min ' + Math.min.apply(null, fps),
          'worst frame  ' + worst + 'ms',
          'JS heap  early ' + heapEarly + 'MB  late ' + heapLate + 'MB  drift ' + (drift >= 0 ? '+' : '') + drift + '%'
            + (leak ? '  <-- INVESTIGATE: looks like a leak' : (drift > 25 ? '  (rise is small in absolute terms — likely noise)' : '')),
          'errors   ' + this.errorCount,
          'quality  tier ' + last.tier + ' cap ' + last.cap + 'fps  (' + this.events.length + ' changes)',
          this.events.length ? 'changes: ' + this.events.slice(-8).map((e) => e.at + 's ' + e.what).join(' | ') : 'changes: none',
        ].join('\n');
      },
      dump() { const t = this.summary(); if (typeof console !== 'undefined') { console.log(t); console.table(this.samples.slice(-40)); } return t; },
      // NOTE for anyone reading the CSV: `tier` is sampled every 15s, so an excursion shorter
      // than that is invisible in this column. `events` is the reliable record — the soak's two
      // real drops each lasted 1-2s and left every tier cell reading 0. (QA, build 362.)
      csv() { return 'sec,fps,worstMs,cells,heapMB,tier,cap,errors\n' + this.samples.map((x) => [x.s, x.fps, x.worst, x.cells, x.heap, x.tier, x.cap, x.err].join(',')).join('\n'); },
    };
    return log;
  }

  // ── Measured assessment (build 371) ──────────────────────────────────────────
  // estimate() PREDICTS from cell counts; assess() MEASURES. Given a function that renders
  // ONE real frame of THIS world at a given quality cfg, it warms the caches, times ~60
  // frames per quality tier, and isolates the cost of each expensive pass (live shadows /
  // night / glare) on a flat baseline. The result is the honest number for this machine and
  // this world — which is exactly what a designer can't get from a pure formula. estimate()
  // stays for instant slider feedback; this is the "tell me the truth" button.
  //
  // `renderOnce(cfg)` must render a single frame with cfg = { shadows:'live'|'fixed'|'off',
  // night, glare } and return nothing. `opts.now` is injectable so the harness is testable
  // with a fake clock (real callers pass performance.now).
  function assess(renderOnce, opts) {
    opts = opts || {};
    const now = opts.now || (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
    const frames = opts.frames || 60, warmup = opts.warmup || 8;
    const timeCfg = (cfg) => {
      for (let i = 0; i < warmup; i++) renderOnce(cfg);            // warm caches / JIT before timing
      const t0 = now();
      for (let i = 0; i < frames; i++) renderOnce(cfg);
      return (now() - t0) / frames;                                // ms per frame
    };
    const tiers = (opts.tiers || TIERS).map((tt) => {
      const ms = timeCfg({ shadows: tt.shadows, night: tt.night, glare: tt.glare });
      return { id: tt.id, label: tt.label, msPerFrame: Math.round(ms * 100) / 100, fps: Math.max(1, Math.round(1000 / Math.max(0.01, ms))) };
    });
    // Per-pass cost = the marginal ms each pass adds over a flat baseline (shadows/night/glare
    // all off), so the report can say WHERE the time goes, not just the totals.
    const base = { shadows: 'off', night: false, glare: false };
    const baseMs = timeCfg(base);
    const passMs = (over) => Math.max(0, timeCfg(Object.assign({}, base, over)) - baseMs);
    const passes = {
      shadowsLive: Math.round(passMs({ shadows: 'live' }) * 100) / 100,
      night: Math.round(passMs({ night: true }) * 100) / 100,
      glare: Math.round(passMs({ glare: true }) * 100) / 100,
    };
    return { baselineMs: Math.round(baseMs * 100) / 100, tiers, passes };
  }

  const OH_PERF = { COST, TIERS, BUDGET_60, frameCost, estimate, assess, makeGovernor, makeSoakLog };
  if (typeof window !== 'undefined') window.OH_PERF = OH_PERF;
  if (typeof module !== 'undefined' && module.exports) module.exports = OH_PERF;
})();
