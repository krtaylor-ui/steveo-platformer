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

  const OH_REDSTONE = {
    key,
    isSource(d) { return (d.kind === 'lever' && !!d.on) || (d.kind === 'button' && !!d.on); },

    // Compute powered cells + active channels from a device list. Only SOURCES and
    // DUST are "conductive" (carry/emit power); OUTPUTS (lamp/rx/tx targets) light up
    // but never feed each other — matching real redstone.
    evaluate(devices) {
      devices = devices || [];
      const conductive = new Set(), channels = {};
      // 1) Seed from active sources (+ their wireless channel).
      for (const d of devices) if (this.isSource(d)) { conductive.add(key(d.col, d.row)); if (d.channel) channels[d.channel] = true; }
      // 2) Flood power through connected dust (fixpoint) into the conductive set.
      const dust = devices.filter((d) => d.kind === 'dust');
      let changed = true;
      while (changed) {
        changed = false;
        for (const d of dust) { const k = key(d.col, d.row); if (conductive.has(k)) continue;
          for (const [dc, dr] of NB) if (conductive.has(key(d.col + dc, d.row + dr))) { conductive.add(k); changed = true; break; } }
      }
      const adj = (d) => NB.some(([dc, dr]) => conductive.has(key(d.col + dc, d.row + dr)));
      // 3) A transmitter adjacent to conductive power drives its channel.
      for (const d of devices) if (d.kind === 'tx' && d.channel && (conductive.has(key(d.col, d.row)) || adj(d))) channels[d.channel] = true;
      // 4) Outputs light from their channel OR adjacency to conductive power (not other outputs).
      const powered = new Set(conductive);
      for (const d of devices) if (d.kind === 'lamp' || d.kind === 'rx' || d.kind === 'output') {
        if ((d.channel && channels[d.channel]) || adj(d)) powered.add(key(d.col, d.row));
      }
      return { powered, channels, conductive };
    },

    cellPowered(res, c, r) { return !!res && res.powered.has(key(c, r)); },
    channelOn(res, name) { return !!(res && name && res.channels[name]); },

    // Toggle a lever/button device in a list at (c,r). Returns true if one flipped.
    toggleAt(devices, c, r) {
      for (const d of devices || []) if ((d.kind === 'lever' || d.kind === 'button') && d.col === c && d.row === r) { d.on = !d.on; return true; }
      return false;
    },
  };

  if (typeof window !== 'undefined') window.OH_REDSTONE = OH_REDSTONE;
  if (typeof module !== 'undefined' && module.exports) module.exports = { OH_REDSTONE };
})();
