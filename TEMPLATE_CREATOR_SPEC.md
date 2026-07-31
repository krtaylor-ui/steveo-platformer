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
