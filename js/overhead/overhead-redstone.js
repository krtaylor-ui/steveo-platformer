// ══════════════════════════════════════════════════════════════════════════
// Overhead Engine — REDSTONE core (§32, step 1). A grid-agnostic, PURE, headless-
// testable power model that both the overhead runtime and (later) other grids can
// drive. Devices live on cells:
//   • lever   — a toggle SOURCE (on/off). Powers its cell + adjacent dust; if it
//               has a `channel`, it also drives that channel wirelessly when on.
//   • button  — a momentary SOURCE (on while pressed).
//   • dust    — WIRE. Flood-carries power to orthogonally-adjacent dust.
//   • tx      — a CHANNEL transmitter: drives its `channel` while itself powered
//               (by adjacent dust/source).
//   • lamp/rx — OUTPUTS: powered by adjacent dust/source OR by their `channel`.
// evaluate() returns { powered:Set('c,r'), channels:{name:true} }. Consumers ask
// cellPowered()/channelOn(). Named CHANNELS are the integration seam reused by the
// drawbridge, doors, and (future) cross-environment links (§35b).
// Binary power for now (0/1); a level model can layer on later.
// ══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';
  const NB = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const key = (c, r) => c + ',' + r;

  // Device kinds. SOURCES emit on their own (lever/button/plate/weight). CONDUCTORS
  // carry power to neighbours (dust + sources + gates). OUTPUTS are sinks (lamp/rx/
  // piston) that light/act but never conduct. GATES (and/not) compute from their
  // powered neighbours. ANY device may also TRANSMIT on `txChannel` (broadcast while
  // it's on) and/or RECEIVE from `rxChannel` (on while that channel is on). Legacy
  // `channel` on a lever/tx == txChannel.
  const SOURCE = { lever: 1, button: 1, plate: 1, weight: 1, lock: 1 };
  const CONDUCTS = { dust: 1, lever: 1, button: 1, plate: 1, weight: 1, lock: 1, and: 1, not: 1, nor: 1, tx: 1 };
  const GATE = { and: 1, not: 1, nor: 1 };
  const SIDE = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
  const dirOf = (fc, fr, tc, tr) => tc > fc ? 'e' : tc < fc ? 'w' : tr > fr ? 's' : 'n';

  const OH_REDSTONE = {
    key, SOURCE, CONDUCTS,
    isSource(d) { return (d.kind === 'lever' && !!d.on) || (d.kind === 'button' && !!d.on); },
    baseActive(d) { return ((d.kind === 'lever' || d.kind === 'button' || d.kind === 'lock') && !!d.on) || ((d.kind === 'plate' || d.kind === 'weight') && !!d._active); },

    // Evaluate to a fixpoint (bounded — gates + channels can chain). Returns
    // { powered:Set('c,r'), channels:{name:true} }.
    evaluate(devices) {
      devices = devices || [];
      const at = new Map(); for (const d of devices) at.set(key(d.col, d.row), d);
      // A device RECEIVES if a legacy string channel it listens to is on, OR any of
      // its numbered sources (rxIds → transmitter txId) is broadcasting.
      const rxOn = (d, ch) => (d.rxChannel && ch[d.rxChannel]) || (Array.isArray(d.rxIds) && d.rxIds.some((id) => ch['T' + id]));
      let powered = new Map(), channels = {};
      // Power flows into `d` from neighbour `nd` iff nd is a powered conductor AND —
      // if nd is a GATE — the side nd→d is one of nd's OUTPUT sides (directional).
      const feeds = (d, nd, prev) => {
        if (!nd || !CONDUCTS[nd.kind] || !prev.get(key(nd.col, nd.row))) return false;
        if (GATE[nd.kind]) { const outs = (nd.outputs && nd.outputs.length) ? nd.outputs : ['n', 's', 'e', 'w']; if (outs.indexOf(dirOf(nd.col, nd.row, d.col, d.row)) < 0) return false; }
        return true;
      };
      for (let pass = 0; pass < 10; pass++) {
        const np = new Map();
        for (const d of devices) {
          const k = key(d.col, d.row); let on;
          if (SOURCE[d.kind]) on = this.baseActive(d) || rxOn(d, channels);
          else if (rxOn(d, channels)) on = true;
          else if (GATE[d.kind]) {
            // Read only the INPUT sides. AND = all present input-side conductors powered
            // (≥2); NOT/NOR = none of the input-side conductors powered.
            const ins = (d.inputs && d.inputs.length) ? d.inputs : ['n', 's', 'e', 'w'];
            let condCount = 0, onCount = 0;
            for (const side of ins) { const [dc, dr] = SIDE[side]; const nd = at.get(key(d.col + dc, d.row + dr)); if (nd && CONDUCTS[nd.kind]) { condCount++; if (feeds(d, nd, powered)) onCount++; } }
            on = (d.kind === 'and') ? (condCount >= 2 && onCount === condCount) : (onCount === 0);
          } else {
            let cnt = 0; for (const s of ['n', 's', 'e', 'w']) { const [dc, dr] = SIDE[s]; if (feeds(d, at.get(key(d.col + dc, d.row + dr)), powered)) cnt++; }
            on = cnt >= 1;
          }
          np.set(k, on);
        }
        // Broadcast: while ON, a device drives its legacy channel AND its numbered 'T'+txId.
        // Dust is pure WIRE — it conducts to neighbours but never transmits a channel
        // (guarded here so legacy worlds that baked a txId onto dust don't broadcast).
        const nc = {}; for (const d of devices) if (d.kind !== 'dust' && np.get(key(d.col, d.row))) { const ch = d.txChannel || d.channel; if (ch) nc[ch] = true; if (d.txId != null) nc['T' + d.txId] = true; }
        let stable = true; for (const [k, v] of np) if (powered.get(k) !== v) { stable = false; break; }
        if (stable) { const ck = Object.keys(nc), pk = Object.keys(channels); if (ck.length !== pk.length || ck.some((k) => !channels[k])) stable = false; }
        powered = np; channels = nc;
        if (stable) break;
      }
      const poweredSet = new Set(); for (const [k, v] of powered) if (v) poweredSet.add(k);
      return { powered: poweredSet, channels };
    },

    cellPowered(res, c, r) { return !!res && res.powered.has(key(c, r)); },
    channelOn(res, name) { return !!(res && name && res.channels[name]); },
    // Does a receiver (device or drawbridge) receive power? Legacy string `channel`/
    // `rxChannel`, OR any numbered source in `rxIds` (multi-select).
    receives(res, obj) {
      if (!res || !obj) return false;
      if (obj.channel && res.channels[obj.channel]) return true;
      if (obj.rxChannel && res.channels[obj.rxChannel]) return true;
      return Array.isArray(obj.rxIds) && obj.rxIds.some((id) => res.channels['T' + id]);
    },

    // Toggle a lever/button device in a list at (c,r). Returns true if one flipped.
    toggleAt(devices, c, r) {
      for (const d of devices || []) if ((d.kind === 'lever' || d.kind === 'button') && d.col === c && d.row === r) { d.on = !d.on; return true; }
      return false;
    },
  };

  if (typeof window !== 'undefined') window.OH_REDSTONE = OH_REDSTONE;
  if (typeof module !== 'undefined' && module.exports) module.exports = { OH_REDSTONE };
})();
