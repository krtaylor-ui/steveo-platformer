// §Spike Orientation (E12 / §14) — pure helpers for which way a spike may point given its solid
// neighbours, the right-click cycle (terminating in REMOVE, deliberately NOT a wrap like the goal-star
// colour cycle), and the orientation-aware damage sub-rect.
//
// A spike attaches to a solid face and points AWAY from it:
//   solid BELOW  → points 'up'    (classic floor spike)
//   solid ABOVE  → points 'down'  (ceiling)
//   solid RIGHT  → points 'left'
//   solid LEFT   → points 'right'
// With several solid neighbours it has several valid orientations; with none (a floating spike) all four
// are valid and it defaults to 'up'.
const SPIKE_ORIENT = {
  DIRS: ['up', 'down', 'left', 'right'],

  // neighbours = { up, down, left, right } booleans (is that neighbour SOLID?). Returns the ordered list
  // of orientations valid in this context (each points away from a solid face).
  validFor(neighbours) {
    const n = neighbours || {};
    const out = [];
    if (n.down)  out.push('up');
    if (n.up)    out.push('down');
    if (n.right) out.push('left');
    if (n.left)  out.push('right');
    return out.length ? out : ['up', 'down', 'left', 'right'];   // floating spike → any direction
  },

  // The orientation a freshly-placed spike takes — first valid = inferred from the adjacent surface.
  defaultFor(neighbours) { return this.validFor(neighbours)[0]; },

  // Right-click cycle: given the current orientation + the valid set, return the NEXT valid orientation,
  // or null to signal "remove the spike" once you step past the last valid one (terminal, not a wrap).
  nextOrRemove(current, valid) {
    const list = (valid && valid.length) ? valid : ['up', 'down', 'left', 'right'];
    const i = list.indexOf(current);
    if (i < 0) return list[0];               // current not in the set (context changed) → snap to first
    if (i >= list.length - 1) return null;   // was on the last valid orientation → remove
    return list[i + 1];
  },

  // Orientation-aware hazard sub-rect within a cell (unit square 0..s). The base of the spikes sits on the
  // solid face; the exposed ~75% toward the pointing direction is the part a player can actually be
  // impaled on. Returns {x,y,w,h} in the same units as `s`.
  hazardRect(dir, s) {
    const t = s * 0.75;
    switch (dir) {
      case 'down':  return { x: 0,     y: 0,     w: s, h: t };   // tips point down → top 75%
      case 'left':  return { x: 0,     y: 0,     w: t, h: s };   // tips point left → left 75%
      case 'right': return { x: s - t, y: 0,     w: t, h: s };   // tips point right → right 75%
      case 'up':
      default:      return { x: 0,     y: s - t, w: s, h: t };   // tips point up → bottom 75%
    }
  },
};

if (typeof window !== 'undefined') window.SPIKE_ORIENT = SPIKE_ORIENT;
if (typeof module !== 'undefined' && module.exports) module.exports = { SPIKE_ORIENT };
