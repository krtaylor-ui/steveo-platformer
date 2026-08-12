// §Creative Tools Phase A — best-effort BPM + downbeat-offset detection from decoded PCM. PURE + headless-
// testable (feed it a Float32 sample buffer + sample rate; no Web Audio needed here). The browser side
// decodes a catalog track via AudioContext.decodeAudioData and hands the channel data to analyze(); the
// Beat Grid then prefills bpm + offsetMs, and the creator nudges from there. Works well on music with a
// steady beat, degrades gracefully (low `confidence`) on ambient/rubato — the caller shows the confidence
// and keeps the manual fields as the correction.
const BPM_DETECT = {
  MIN_BPM: 70,
  MAX_BPM: 190,

  // Onset-strength envelope: RMS energy per ~10 ms hop, rectified first-difference (energy RISES = onset).
  onsetEnvelope(pcm, sampleRate, hopMs = 10) {
    const hop = Math.max(1, Math.floor(sampleRate * hopMs / 1000));
    const n = Math.floor(pcm.length / hop);
    const env = new Float32Array(Math.max(0, n));
    let prev = 0;
    for (let i = 0; i < n; i++) {
      const s = i * hop, e = Math.min(pcm.length, s + hop);
      let sum = 0;
      for (let j = s; j < e; j++) { const v = pcm[j]; sum += v * v; }
      const rms = Math.sqrt(sum / Math.max(1, e - s));
      env[i] = Math.max(0, rms - prev);   // positive difference only
      prev = rms;
    }
    return { env, hopMs };
  },

  // pcm: Float32Array (mono, -1..1). Returns { bpm, confidence (0..1), offsetMs }.
  analyze(pcm, sampleRate) {
    if (!pcm || !pcm.length || !sampleRate) return { bpm: 0, confidence: 0, offsetMs: 0 };
    const { env, hopMs } = this.onsetEnvelope(pcm, sampleRate);
    if (env.length < 4) return { bpm: 0, confidence: 0, offsetMs: 0 };
    const fps = 1000 / hopMs;                                   // envelope frames per second
    const minLag = Math.max(1, Math.floor(fps * 60 / this.MAX_BPM));
    const maxLag = Math.min(env.length - 1, Math.ceil(fps * 60 / this.MIN_BPM));

    // De-mean, then autocorrelate ONLY within the plausible BPM lag window (so it can't lock onto an
    // out-of-range octave). Peak lag → tempo; peak/energy → a rough confidence.
    let mean = 0; for (let i = 0; i < env.length; i++) mean += env[i]; mean /= env.length;
    const de = new Float32Array(env.length);
    let energy = 0;
    for (let i = 0; i < env.length; i++) { de[i] = env[i] - mean; energy += de[i] * de[i]; }

    let best = 0, bestLag = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let s = 0;
      for (let i = 0; i + lag < de.length; i++) s += de[i] * de[i + lag];
      if (s > best) { best = s; bestLag = lag; }
    }
    if (!bestLag) return { bpm: 0, confidence: 0, offsetMs: 0 };

    const bpm = Math.round(fps * 60 / bestLag);
    const confidence = energy > 0 ? Math.max(0, Math.min(1, best / energy)) : 0;

    // Downbeat offset: first frame whose onset clearly exceeds the mean (a strong hit near the start).
    let thr = 0; for (let i = 0; i < env.length; i++) thr += env[i];
    thr = (thr / env.length) * 3;
    let offFrame = 0;
    for (let i = 0; i < env.length; i++) { if (env[i] > thr) { offFrame = i; break; } }

    return { bpm, confidence: +confidence.toFixed(2), offsetMs: Math.round(offFrame * hopMs) };
  },
};

if (typeof window !== 'undefined') window.BPM_DETECT = BPM_DETECT;
if (typeof module !== 'undefined' && module.exports) module.exports = { BPM_DETECT };
