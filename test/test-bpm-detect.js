// §Creative Tools Phase A — BPM detector: feed synthetic click tracks at known tempos and assert the
// detected BPM is within tolerance, offset lands near the first click, and silence is handled.
const assert = require('assert');
const { BPM_DETECT } = require('../js/bpm-detect.js');

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); console.log('ok —', name); pass++; } catch (e) { console.error('FAIL —', name, '\n   ', e.message); fail++; } }

// Build a mono click track: a short decaying impulse every 60/bpm seconds, over `seconds`.
function clickTrack(bpm, sampleRate, seconds, startMs = 0) {
  const N = Math.floor(sampleRate * seconds);
  const pcm = new Float32Array(N);
  const period = Math.round(sampleRate * 60 / bpm);
  const start = Math.floor(sampleRate * startMs / 1000);
  const decay = Math.floor(sampleRate * 0.03);   // 30 ms click
  for (let c = start; c < N; c += period) {
    for (let j = 0; j < decay && c + j < N; j++) pcm[c + j] = (1 - j / decay) * 0.9;
  }
  return pcm;
}

t('detects 120 BPM within ±4', () => {
  const r = BPM_DETECT.analyze(clickTrack(120, 8000, 8), 8000);
  assert(Math.abs(r.bpm - 120) <= 4, `got ${r.bpm}`);
  assert(r.confidence > 0, 'confidence > 0');
});

t('detects 90 BPM within ±4', () => {
  const r = BPM_DETECT.analyze(clickTrack(90, 8000, 8), 8000);
  assert(Math.abs(r.bpm - 90) <= 4, `got ${r.bpm}`);
});

t('detects 150 BPM within ±4', () => {
  const r = BPM_DETECT.analyze(clickTrack(150, 8000, 8), 8000);
  assert(Math.abs(r.bpm - 150) <= 4, `got ${r.bpm}`);
});

t('offset lands near the first click (~250 ms)', () => {
  const r = BPM_DETECT.analyze(clickTrack(120, 8000, 8, 250), 8000);
  assert(Math.abs(r.offsetMs - 250) <= 60, `got ${r.offsetMs}`);
});

t('stays within the plausible BPM window (never out of 70–190)', () => {
  const r = BPM_DETECT.analyze(clickTrack(120, 8000, 8), 8000);
  assert(r.bpm >= BPM_DETECT.MIN_BPM && r.bpm <= BPM_DETECT.MAX_BPM, `got ${r.bpm}`);
});

t('silence / empty input returns zeros, no throw', () => {
  assert.deepStrictEqual(BPM_DETECT.analyze(new Float32Array(8000), 8000).bpm, 0);
  assert.deepStrictEqual(BPM_DETECT.analyze(null, 8000), { bpm: 0, confidence: 0, offsetMs: 0 });
  assert.deepStrictEqual(BPM_DETECT.analyze(new Float32Array(0), 8000), { bpm: 0, confidence: 0, offsetMs: 0 });
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
