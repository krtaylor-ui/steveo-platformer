// ============================================================
// test-audio-perf.js — multiplayer freeze triage (build 387)
// ------------------------------------------------------------
// Two guards for the "4-player arena freezes 10-20s" report:
//  1. Audio overlap now uses a BOUNDED, self-recycling clone pool instead of the old
//     cloneNode()-and-abandon, which leaked a detached HTMLAudioElement on every overlapping
//     sound and — under 4 kids mashing attack — piled up until a GC storm froze the tab.
//  2. A between-frames STALL DETECTOR so the next playtest says whether a freeze is OUR CODE
//     (a single long frame) or EXTERNAL (GC / browser / USB-HID between frames).
// Source-level assertions (comment-stripped) — the audio + loop paths are DOM/rAF-bound and
// can't be exercised headless, so we pin the structure that fixes the defect.
// ============================================================
const fs = require('fs');
const path = require('path');
const jsDir = path.join(__dirname, '..', 'js');
let passed = 0, failed = 0;
function ok(cond, msg) { if (cond) { passed++; } else { failed++; console.error('  ✗ ' + msg); } }

const strip = (s) => s.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
const gameSrc  = strip(fs.readFileSync(path.join(jsDir, 'game.js'), 'utf8'));
const constSrc = strip(fs.readFileSync(path.join(jsDir, 'constants.js'), 'utf8'));

// ── 1. Audio overlap pool ────────────────────────────────────
{
  ok(/const AUDIO_MAX_OVERLAP\s*=\s*\d+/.test(constSrc), 'AUDIO_MAX_OVERLAP is defined in constants');
  const m = constSrc.match(/const AUDIO_MAX_OVERLAP\s*=\s*(\d+)/);
  const cap = m ? Number(m[1]) : 0;
  ok(cap >= 2 && cap <= 16, `AUDIO_MAX_OVERLAP is a sane per-clip voice cap (got ${cap})`);

  // The pooled player exists and enforces the cap + recycles finished clones.
  ok(/_playPooled\(base, vol\)\s*\{/.test(gameSrc), 'game has a _playPooled(base, vol) overlap player');
  ok(/pool\.length\s*>=\s*AUDIO_MAX_OVERLAP/.test(gameSrc), '_playPooled drops extra voices at the cap (no unbounded growth)');
  ok(/x\.paused\s*\|\|\s*x\.ended/.test(gameSrc), '_playPooled reuses a finished (paused/ended) clone before making a new one');

  // The two hot paths route overlaps through the pool — the old clone-and-abandon is gone.
  ok(/this\._playPooled\(s, vol\)/.test(gameSrc), '_playSound overlaps via the bounded pool');
  ok(/this\._playPooled\(a, vol\)/.test(gameSrc), '_movementSound overlaps via the bounded pool');
  // Regression: no bare cloneNode() that is played and immediately abandoned in _playSound.
  ok(!/s = s\.cloneNode\(\);\s*s\.volume/.test(gameSrc), 'the old _playSound clone-and-abandon is removed');
  ok(!/const c = a\.cloneNode\(\); c\.volume = Math\.min\(1, vol\); c\.play/.test(gameSrc), 'the old _movementSound clone-and-abandon is removed');
}

// ── 2. Between-frames stall detector ─────────────────────────
{
  ok(/this\._lastLoopEnd = _pnow\(\)/.test(gameSrc), '_loop stamps _lastLoopEnd at end of real frame work');
  ok(/_frameStart - this\._lastLoopEnd/.test(gameSrc), 'it measures the wall-clock gap BETWEEN frames');
  ok(/gap > 400/.test(gameSrc), 'a >400ms inter-frame gap is treated as a real stall (not normal pacing)');
  ok(/priorWork < gap \* 0\.5/.test(gameSrc), 'it classifies the stall as EXTERNAL vs OUR CODE by prior in-frame work');
  ok(/this\._lastStall\s*=\s*\{/.test(gameSrc), 'it records _lastStall for the perf HUD');
  ok(/LAST STALL/.test(fs.readFileSync(path.join(jsDir, 'game.js'), 'utf8')), 'the perf HUD surfaces the last stall');
  // QA ask: a stall report must carry the ENTITY LOAD + arena phase so it can be correlated.
  ok(/load: mobs=\$\{mobs\} arrows=\$\{arrows\} players=\$\{players\}/.test(gameSrc), 'the [STALL] line carries mobs/arrows/players load');
  ok(/mobs, arrows, players, phase \}/.test(gameSrc), '_lastStall stores mobs/arrows/players/phase');
  ok(/phase = this\.arenaState \? this\.arenaState\.phase/.test(gameSrc), 'the stall snapshot records the arena phase (liveness guard: ended != in-match)');
}

console.log(`\n  audio-perf + stall detector: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
