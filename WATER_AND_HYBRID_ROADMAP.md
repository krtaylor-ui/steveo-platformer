# Roadmap — Water block + Overhead↔2D hybrid levels (vision, not scheduled)

Captured 2026-08-02 from Kevin's ideas while designing overhead interaction animations.
Nothing here is built or scheduled — it's direction to protect as we strengthen the base.

## 1. Water block (overhead + side-scroll)
A new terrain/block type, alongside the recently-added glass:
- **Overhead:** a `water` terrain — translucent, animated surface (gentle ripple/shimmer),
  optionally shallow (walkable, slows you) vs deep.
- **Entry ripple ANIMATION** — a ring pulse when the player steps into water (this is the
  "water ripple" animation noted in the interaction-animation set; build it *with* the water
  block, since it needs the block to exist).
- Side-scroll water (swim physics, buoyancy) is a separate, larger effort — note only.

## 2. Water as a PORTAL type → underwater levels
A water tile (a pool / whirlpool) can act like a portal: step in + E → travel to an
**underwater level**, the same way a cave entrance or a pipe/portal does today. Reuse the
portal step-through beat (the animation mockup), tinted for water (a dive/splash instead of a
purple flash). Underwater levels lean **2D** (see §3) — a submerged, side-on world.

## 3. The big idea — Overworld (overhead) + Levels (2D), one world
The overhead engine and the 2D side-scroll engine **combine into a single experience**:
- The **overworld is OVERHEAD** — you roam a top-down world map, and **combat happens on the
  map** (mobs, weapons — all the overhead systems we've built).
- **Entering a location** on the map (a cave mouth, a door, a pool of water, a dungeon) drops
  you into a **2D side-scroll level** for that location's gameplay, then returns you to the
  overhead map on exit.
- So a "level" is really a **pairing**: an overhead region + one-or-more 2D sub-levels reached
  from it. Caves, underwater areas, dungeons = 2D; the surface world = overhead.

This is a natural fusion of the two engines we already maintain, and it reframes earlier ideas
(the cave-system + overworld discussion) as **one engine driving the map, the other driving the
level**. Campaign mode is the obvious home for it.

### Why the current base work matters for this
- **Portals/pipes/water-as-portal** are the *transition mechanism* between the two views — the
  interaction-animation work (portal step-through, pipe climb-in) is exactly the seam.
- **Separation of model / simulation / renderer** (the review lens in the code-review plan) is
  what lets a location render as overhead OR 2D from a shared world model.
- **Save/world schema** already carries `viewMode` per world (`overhead` vs side-scroll) — a
  hybrid level is essentially *linking* an overhead world to 2D sub-worlds via portal configs.
  That linkage is the smallest first experiment (an overhead portal whose destination is a
  2D world, and back).

## Suggested first steps (whenever this is picked up)
1. **Water block** (overhead) + the **entry-ripple animation** — small, self-contained, and
   unlocks the water-as-portal look.
2. **Cross-engine portal link** — let an overhead portal/pipe/water tile target a *side-scroll*
   world (and a return portal back). This proves the overhead↔2D transition end-to-end with the
   engines we already have, before any bigger "hybrid level" container.
3. Only then consider a **hybrid-level container** (an overworld region + its 2D sub-levels) as
   a Campaign-mode structure.

## Open questions
- Does the overhead map persist state (mobs killed, chests opened) while you're in a 2D level?
- Shared inventory/health across the map↔level boundary (Campaign already carries inventory —
  reuse that).
- One water block with a "deep = portal" flag, or a distinct "dive pool" object?
