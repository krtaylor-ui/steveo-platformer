// §Epic MB — Beat Grid: pure, headless-testable core. Maps musical beats onto world-space DISTANCE so a
// creator can align hazards to music. Two ways to set the tempo:
//   • Tap-to-tempo (standalone — does NOT depend on autodetect): the creator taps; BPM = 60000 / average
//     interval between the recent taps. Robust to a few taps; more taps = steadier.
//   • Automatic BPM (offered only when reliable; manually correctable) — the analyzer is out of scope for
//     the pure core, but the grid consumes whatever BPM it's given the same way.
// The grid is most predictable under Constant/Auto-speed (E2): distance = speed × time. beatXs() returns
// the world-x of each beat given the run's start x + a px/second speed.
const BEAT_GRID = {
  // BPM from tap timestamps (ms). Uses up to the last `window` intervals. Returns 0 with <2 taps.
  tapTempo(taps, window = 8) {
    if (!Array.isArray(taps) || taps.length < 2) return 0;
    const t = taps.slice(-(window + 1));
    let sum = 0, n = 0;
    for (let i = 1; i < t.length; i++) { const d = t[i] - t[i - 1]; if (d > 0) { sum += d; n++; } }
    if (!n) return 0;
    return Math.round(60000 / (sum / n));
  },

  // Milliseconds per beat for a BPM (0 → 0).
  beatMs(bpm) { return bpm > 0 ? 60000 / bpm : 0; },

  // Beat times (ms) from an offset, count beats apart.
  beatTimes(bpm, offsetMs, count) {
    const step = this.beatMs(bpm); if (!step) return [];
    const out = []; for (let i = 0; i < count; i++) out.push((offsetMs || 0) + i * step); return out;
  },

  // World-x of each beat: startX + speedPxPerSec × (beatTimeMs / 1000). Constant-speed assumption.
  beatXs(bpm, offsetMs, startX, speedPxPerSec, count) {
    return this.beatTimes(bpm, offsetMs, count).map((ms) => (startX || 0) + speedPxPerSec * (ms / 1000));
  },
};

if (typeof window !== 'undefined') window.BEAT_GRID = BEAT_GRID;
if (typeof module !== 'undefined' && module.exports) module.exports = { BEAT_GRID };
