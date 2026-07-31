# Template / Building Creator — design spec (overhead engine)

Design-locked from Kevin's 2026-07-31 brief. NOT yet built (this doc is the first pass; the
shadow + player-height pieces of that same brief ARE built — see build 319). Trees already
cast shadows now because they are stamped as TERRAIN (log + leaves cells), and the shadow
pass now includes leaves — so the "trees don't shadow" complaint is resolved for trees. The
template system generalises that: ANY placeable model resolves into real cells, so it casts a
detailed, cell-accurate shadow rather than a block-dimension box.

## Goal
A way to author reusable multi-cell, multi-elevation **templates** and use them two ways:
1. **Placeable models** — trees, houses, statues, rocks… stamped onto the map as their
   constituent blocks (so they collide, shade, and read exactly as built).
2. **Building skins** — a template becomes the visual for a building type (obsidian-frame
   portal, a custom shop, etc.), replacing the hard-coded `drawBuilding` art.

## Recommended approach — "Template mode" in the world map creator (do this FIRST)
A dedicated mini-app is cleaner in theory but slower to ship and duplicates the whole editor.
Start with a **mode toggle inside the existing overhead editor**, because it reuses all the
painting tools, palette, elevation, and camera we already have. A standalone builder can come
later if authors want the stricter, self-contained framing.

**Template mode UX**
- New **"Templates"** section in the left rail, right under **Buildings**: a list of saved
  templates (each placeable like the Tree tool) + a **"＋ New Template"** button.
- **New Template** asks for a name + **X / Y / Z dimensions** (footprint width, depth, and max
  elevation levels).
- The editor then **greys out everything outside an X×Y region** anchored where you click, so
  it's obvious what will be captured. You paint terrain/elevation freely inside it.
- The system **flags** (red outline + a count) any painted cell that falls **outside** the
  declared region or **above Z** — so a template always fits its stated dims.
- **Capture** snapshots every non-empty cell in the region as `{dx, dy, dz, block}` relative
  to the anchor, plus any decorations, and saves it to the template list.
- Placing a template stamps those cells into the world (data-driven `_stampTemplate`, the
  generalisation of the current hard-coded `_stampTree`).

## Palette needs (do alongside)
- **More brick types** are welcome (glass already landed; more decorative/structural blocks
  are fine). As the palette grows, add **filter / search** to the terrain palette (a text box
  + category chips) so authors can find a block fast.

## Building skins (function 2)
- A building's config gains a **"Skin: <template>"** picker. When set, `drawBuilding` for that
  instance renders the **template's cells** (via the shared cube renderer) instead of the
  built-in art — at the building's footprint + level.
- Because the skin is real cells, its **shadow is cell-accurate** (see below).

## Shadows (hard requirement)
When a template is placed OR used as a skin, its shadow must come from the **cell rendering
inside the object**, NOT the template's bounding box. I.e. a tree-skinned building casts a
canopy-shaped shadow, not a Z-tall box. Two clean ways to guarantee this:
- **Placeable models:** trivial — they ARE terrain cells, so the existing terrain shadow pass
  already casts them per-cell (this is why trees now shadow). No extra work.
- **Building skins:** the shadow pass must iterate the skin's cells (offset to the building
  footprint/level) the same way it iterates terrain. Add skinned buildings to the shadow
  pass's cell enumeration.

## Data model (sketch)
```
world.templates = [{
  id, name, dims:{x, y, z},
  cells: [{ dx, dy, dz, block }],   // relative to the anchor (dz = elevation level)
  decorations: [...]                // optional
}]
// placement: world stores a lightweight reference + anchor, OR stamps cells directly.
// skins:     building.skin = templateId  (render + shadow read the template's cells)
```

## Player-height coupling (already shipped in build 319)
Elevation levels now render at `1 / playerHeight` scale (a height-2 player → a level is ½ the
sprite). Templates authored at a given Z will therefore scale consistently with the world's
player height — worth keeping in mind when defining a template's Z.

## Suggested build order
1. **Palette filter/search** + a few more brick types (small, unblocks authoring).
2. **Template mode** in the editor: dims prompt, grey-out region, out-of-bounds flag, capture
   → `world.templates`, and a data-driven `_stampTemplate` (reuse the Tree placement path).
3. **Templates palette section** listing saved templates as placeable tools.
4. **Building skins**: skin picker + `drawBuilding` renders template cells + shadow pass reads
   skin cells.
5. (Optional, later) a **standalone template mini-app** for stricter framing.

## Open questions for Kevin
- Should a placed template **stamp cells** (editable afterwards, heavier saves) or stay a
  **reference + anchor** (lighter, but not individually editable)? Stamping is simpler and
  matches the current Tree behaviour; reference is tidier for reuse. (Leaning: stamp for
  models, reference for skins.)
- Do templates need **rotation** on placement (N/E/S/W)? (Likely yes for houses.)
- Are templates **per-world** or a **shared library** across worlds?

## The tree "black shadow" — confirmed root cause (why templates are the fix)
`_stampTree` OVERWRITES the ground layer: each canopy cell's `ground` becomes `'leaves'` at
elevation 3–4, and the renderer draws that as a floating canopy with NOTHING at elevation 0 —
so under the canopy you see the black canvas background through the gap (the "black level-0
blocks"). Painting grass there overwrites the `leaves` cell, so the tree vanishes. It is the
**single-layer grid** limit (one cell = one block + one elevation). **Templates must be
ADDITIVE** — placed ON TOP of the existing ground, never replacing it — so a tree template
keeps the grass at 0 and adds the canopy above it. No black voids. (A cheap interim render
patch — fill grass under a floating `leaves` cell — is possible but imperfect for elevated
trees; deferring to templates as agreed.)

## Decisions (round 2, 2026-07-31)
1. **Contents:** terrain + elevation ONLY. Mobs / items / redstone will NOT use templates.
2. **Max size:** target ceiling **8×8×8 BLOCKS** (not cells). Real cost is blocks×density per
   axis, so at density 2 that's 16×16×16 cells — fine to bake. No artificial cap below 8³;
   we'll cap generously and only warn near the top.
3. **Overlap on placement:** make it a **placement option** with all three — **Overwrite**,
   **Merge (fill empty cells only)**, or **Refuse if blocked** — with a ghost preview + a
   warning when it would clobber non-empty cells.
4. **Skins:** **collision stays from the building definition** (simpler, predictable); the
   skin drives visuals + shadow. Cell-based collision is a "better, not critical" later option.
5. **Editing:** yes — templates round-trip (store cell data). PLUS an **"Apply to all placed
   instances of this template"** action (tracked via placement records — see below), with a
   warning for instances that have local edits.
6. **Libraries — two tiers, shown smartly:**
   - **System** (authored/approved on the krtaylor@gmail.com account) — available in every
     world for every player.
   - **Player** (a player's own templates) — with a per-template flag for **account-wide**
     (shows in all their future worlds) vs **world-specific** (this world only).
   - **UX:** a world's Templates list shows **System + this-world templates first**, then a
     **"Browse my templates"** button opens a filterable gallery of ALL the player's templates
     to **check off which to add to this world** (they then appear in the world list).
   - **Sharing/portability:** **export ALL templates to one file**; **import** shows the same
     pick-list (see all, check the ones to bring in). A **checksum per template** flags likely
     duplicates on import (not perfect, just a heads-up).
7. **Density / player-height + scaling:** a template **stores the density + player-height it
   was authored at** (for filtering + warnings). On import into a world with different
   settings: allow it with a **warning it may be off-scale**; **never auto-scale-DOWN** into a
   lower-density world (loses detail, not worth it); **scale-UP is opt-in** by the player.
   Default to **maintaining cell resolution**. This argues for a **recommended standard
   (leaning density 2 / player-height 2)** — not fixed yet — with a notice when a player
   changes those that others' templates may not fit. Standardizing will matter for sharing.
8. **Thumbnails:** yes — auto-generate a small preview icon per template.

## Placement model — STAMP + a lightweight PLACEMENT RECORD (resolves "discrete blocks")
Concern: a placed template becomes discrete blocks and loses its "template" identity, so
removing it means deleting blocks one by one. Resolution — a **hybrid**:
- **Stamp** the template's cells as REAL blocks (additive, on top of the ground) so they
  collide, shade cell-accurately, and are individually editable.
- ALSO record a **placement** `{ templateId, anchor, bounds, cellHash }` on the world. That
  gives the placed instance a unit identity WITHOUT freezing its blocks: you can **select /
  delete / move the whole instance** from its bounds, and **"apply template edits to all
  instances"** can find them. If a block inside was hand-edited after placing, the placement's
  `cellHash` no longer matches → flag it before re-applying.
- Removal is then either one-click (via the placement record) OR via the new
  **select-structure-above-a-level** tool below (which also removes any hand-built structure).

## New editor tool — "Select structure (≥ elevation)"  [DESIGN — not yet built]
Today double-click selects connected cells of the **same type + same level**. Add a second
mode: **flood-fill every connected cell at elevation ≥ the current paint level, regardless of
block type** — so setting elevation to 2 and clicking a castle grabs the whole castle (all
block types, levels 2+), leaving the level-1 platform it sits on untouched. Then the existing
clipboard ops apply: **copy / rotate / flip / delete**.
- **Trigger:** a distinct gesture so it doesn't collide with the same-type double-click —
  e.g. a "Select structure" tool button, or Alt/Shift+double-click.
- **Delete behaviour:** cleared cells drop to the floor (grass @ 0, or a chosen base), since
  the single layer can't restore "what was beneath."
- **Also offered:** a marquee variant — rectangular select **filtered to cells ≥ level N** —
  for when a structure isn't perfectly contiguous.
- **Bonus:** this is the general "scrap my castle and start over" tool AND the manual way to
  remove a stamped template. Worth building alongside template mode.

## Floating-placement flag
Templates may be placed at ANY level and stack on top of the blocks below. A placement whose
base sits ABOVE the ground below it (a floating structure) is ALLOWED, but the ghost preview
should **flag it** (e.g. a small "floating" badge / tint) so it's intentional, not an accident.

## Standard-settings note (for later)
Because templates carry density + player-height and don't scale down, the platform benefits
from a **recommended standard** (leaning density 2 / player-height 2). Not set yet — but when
we do, changing those in World Settings should warn the player that shared templates may not
fit. This nudges toward less flexibility in those two world settings in exchange for a
portable template ecosystem.
