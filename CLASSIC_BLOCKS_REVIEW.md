# Classic Blocks pack — build 205 (built 2026-07-24 while Kevin was away)

A new **Sandbox → "Blocks"** palette tab of old-school platformer blocks. All additive; none affect
existing worlds. Headless suite green. **On `main`, committed local, NOT pushed** — browser playtest first.

## What's in it + how each works
| Block | Behaviour | Notes / assumptions |
|---|---|---|
| **Ladder** | Non-solid; hold **Up/Down** to climb, gravity suspended while overlapping it. | Leave by climbing off the ends or stepping sideways. **Jump-off mid-ladder is NOT implemented** (assumption: fine for v1). Clinging while walking through a ground-level ladder is possible (you stop falling) — expected ladder feel. |
| **Jump-Through Platform** | Solid only when landing from **above**; jump up through it from below. **Drop-through:** hold **Down** for ~10 frames (a beat), then **Jump** → fall to the level below (14-frame pass-through). | The Down-hold pause is what distinguishes it from the crouch+jump **slide** (which is immediate). No dedicated "climbing-down" animation yet — the crouch pose shows during the hold (assumption: acceptable; flagged as art follow-up). |
| **Trampoline** | **Force-driven** bounce: a faster fall launches you higher (impact speed × 1.18, min hop 11, cap 30). Not the fixed jump-pad. | Uses the fall speed captured the frame before landing (`_preVy`). Mobs don't bounce (player-only) — assumption. |
| **Ice** | Solid + **slippery**: acceleration eases toward target; idle keeps momentum (0.96 vs 0.72). | Tuning values are a first pass — easy to dial. |
| **Conveyor ◀ / ▶** | Solid; nudges whoever stands on it ±1.6 px/frame. | Direction is the block variant (two blocks). |
| **Crumbling Block** | Solid; ~0.66 s after something stands on it, it vanishes. | No shake/warning animation yet (it just disappears) — flagged. Does NOT respawn (assumption: one-shot; could add a respawn timer). |
| **Warp Pipe** | Solid pipe; stand on top + press **Down** → sink into it, teleport to a **partner** pipe, rise out. | **Pairing:** pipe tops pair in reading order — 1st↔2nd, 3rd↔4th… **Assumption: place 1-block-wide pipes**; a lone/odd pipe has no partner (no-op). Multi-wide pipes / explicit link IDs = follow-up. Descend animation is a simple sink/rise (no clipping mask). |
| **Question Block** | Solid; **bump from below** (head-hit while rising) → pops an item, becomes a spent "Used Block". | **v1 always yields a Coin** — designer-configurable contents (weapon / power-up / emerald) is a noted follow-up. |
| **Hidden Block** | Invisible + intangible in play until **bumped from below**, then becomes a solid Used Block (visible). Shows a dashed **?** outline in the Sandbox editor so designers can see/place it. | Reveal swaps the grid cell to `QUESTION_USED` (so it's solid + visible with no extra state). |
| **Coin** | Non-solid collectible; walk into it → collect (plays a sound, `+1 Coin`, adds score if the world's Score toggle is on). | Uses the emerald points value for now. A dedicated coin counter (`game._coins`) is tracked but not yet shown in the HUD — follow-up. |
| **Spikes** | Non-solid hazard; contact deals 3 damage (respects i-frames / god mode), like Lava. | Non-solid so you fall onto whatever's beneath — place on top of a floor. |

## Key engineering decisions
- New block IDs **65–77** in `js/blocks.js` (enum + `BLOCK_DATA` + pixel-art renderers appended). All are
  `mineable:false` (level furniture, not resources) and `classic:true`.
- Interactions run in a single per-frame pass **`game._updateClassicBlocks()`** (after players update),
  **skipped in the Sandbox editor** so the editing avatar doesn't trip them. Trampoline needs the pre-landing
  fall speed → `player._preVy` captured before `player.update`.
- Player-physics hooks in `js/player.js`: Ladder (gravity suspend + climb), Ice (friction), Jump-Through
  landing + drop-through — plus helpers `_overlapsBlock` / `_footBlockIs`.
- `level.draw` now takes `frame` + `editor` (for coin/question/conveyor animation + the editor-only Hidden
  outline). Palette gained a 6th tab ("Blocks"); tab width divisor 5→6.
- **Multiplayer/mobs:** the interaction pass covers all active players (P1 focus); mobs treat the solid ones
  as normal terrain and ignore the special effects (assumption for v1).

## Suggested playtest checklist
Ladder climb feel; Jump-Through drop-through vs. slide (does the Down-hold beat feel right?); trampoline
launch scaling; ice friction; warp-pipe pairing + the descend/emerge; question/hidden bump; coin/spike/conveyor.
Then: want coins in the HUD, configurable Question contents, a crumble warning shake, and multi-wide/linked pipes?

---
# Pass 2 — build 206 (2026-07-24, from Kevin's playtest feedback)

## Fixed / added this pass
- **Question Block bump FIXED** — the upward collision zeroed `vy` before the interaction pass ran, so
  the bump never registered. Now gated on the pre-collision fall speed (`player._preVy`). Same path drives
  the new Breakable + Hidden reveal.
- **Breakable Block** (id 78) — brick that **shatters when hit from below** (drops any stored content, then
  turns to AIR + sound). **Pipe Stem** (id 79) — solid pipe body to place under a Warp Pipe to raise it.
- **Block content storage** (`game._blockContents`, keyed `row,col`) with `_popBlockContent` / `_breakBlock`
  / `_giveBlockItem` — Question yields the stored item (or a coin by default); Breakable drops it then shatters.
- **Ladder dark outline FIXED** — added a faint backing so the rungs read on any background (dark biome/night
  backdrops used to show through the gaps).
- **Ladder climb animation** (first stab) — drives the limb-swing off a climb cadence while moving.
- **Ladder world settings** (Movement → Moves): **Lock Sideways** (snap to the ladder column, no drift) and
  **Jump Off Mid-Climb** (jump to leave anywhere; off = must climb off the top first).
- **Day / Night backgrounds** — new `backgroundTheme` options: a **static sun (Day) / moon+stars (Night)** pinned
  top-right, sky pinned bright/dark, clouds unchanged.

## STILL DEFERRED — needs another pass (all flagged for Kevin)
1. **Customizable block contents UI** — the *storage* is in (`_blockContents`), but there is **no editor yet to
   place an item inside** a Question/Breakable block or to **clear** it. Contents currently default to a coin.
   Plan: a Sandbox popup (reuse the portal/music popup infra) to pick/clear the held item per block.
2. **2×2 Warp Pipes + Pipe Stem raising** — `PIPE_STEM` exists and pipes still work as 1-wide pairs, but the
   **2×2 pipe shape + extender-raises-the-mouth logic** isn't wired. Plan: detect a 2×2 pipe cluster, enter from
   its top-centre, treat stems below as body.
3. **Conveyor ("moving platform") speed** — no per-block/per-group speed yet. Plan: a Sandbox modal with speed
   **1/2/3/4 (2 = current)** and an **"apply to all connected at the same height"** option (flood-fill the run).
4. **Slide on a Jump-Through platform** — REPORTED not moving. I could NOT reproduce it from static analysis
   (the slide sets `vx` and the one-way is non-solid horizontally, so it *should* slide). **Needs a repro** — is
   Ground Slide enabled, is the platform ≥2 wide, and does it fail on normal ground too? Possible culprit to
   check next: the new **Down-hold → drop-through** gesture eating the slide when Down was held before the jump.
5. Minor: Breakable **particle burst** (currently just a notify + sound); a dedicated **ladder climb pose**
   (currently reuses the walk-cycle limbs); **coin HUD counter**.

---
# Pass 3 — build 207 (2026-07-24, second round of playtest feedback)

## Fixed
- **Ladder (critical regression)** — it engaged the moment you *touched* it (gravity off → floating/
  bouncing, couldn't walk through). Now you only **grab it by pressing Up/Down** while overlapping; walk
  straight through otherwise. Leave by climbing off an end, stepping sideways, or Jump-Off (if the setting's on).
- **Slide on a Jump-Through platform** — ROOT-CAUSED: the new Down-hold→drop-through gesture was eating the
  slide (you hold Down then Jump to slide, which matched drop-through → you fell straight through, crouched =
  "slide look", no horizontal). Drop-through now needs a **longer hold (≥16f) AND being stationary**; a slide
  has a direction, so it wins. Quick/moving crouch+jump slides; a deliberate stationary hold drops through.
- **Black outline on all blocks** — it was the global "edge shadow" (`rgba(0,0,0,0.28)` box) stroked on every
  cell; invisible on solid blocks but a black box on the see-through ones (and it made Hidden blocks visible).
  Now skipped for Ladder / Hidden / Jump-Through / Coin / Spikes.

## Added
- **Breakable shatter** — breaking spawns **8 shard pieces** that fly out, tumble, and fall off-screen
  (new `_blockFx` particle system: shards + coin pops, gravity + rotation).
- **Crumble cracks** — a crumbling block now shows **intensifying cracks + a shake** as it nears collapse (warning).
- **Coin pop from Question blocks** — bumping one now **pops a coin up that arcs and falls** before it's tallied.
- **Seamless 2×2 pipes + Pipe Stem** — pipe cells are now **neighbor-aware**: internal seams between adjacent
  Warp-Pipe/Stem cells are erased, side highlights/shade only on outer edges, and the **mouth lip** draws only
  on a Warp-Pipe cell with open top. Place a 2-wide Warp Pipe and stack **Pipe Stems** (1×1, merge seamlessly —
  put two side-by-side per row) underneath to raise it to any height.

## Still deferred (unchanged from pass 2)
- Customizable block-contents **UI** (storage is in; no editor to set/clear yet — Question/Breakable default to coin).
- **Conveyor speed** modal (1/2/3/4, default 2) + apply-to-all-connected-at-same-height.
- Warp-pipe **2×2 enter** uses the existing top-cell + reading-order pairing (works; explicit link IDs = later).
- Dedicated **ladder climb pose** (still reuses the walk-cycle limbs) and a **coin HUD counter**.

---
# Pass 4 — build 208 (2026-07-24)

## Done
- **Crumbling = 3s of CONTINUAL contact.** Was a fixed countdown from first touch. Now the timer only
  advances while you're actually standing on the block; **jump off and it resets** (the block stays). 3 s
  (180 f) of unbroken contact → it falls. **Low-resource:** a per-frame `_crumbleTouched` Set (cleared, not
  reallocated) marks stood-on cells; `_crumbleContact` only ever holds those (usually 1–2). Cracks/shake now
  scale to `contact/180`.
- **Stand on top of a ladder** without falling — a ladder's top is now landable from above (treated like a
  Jump-Through surface when you're NOT climbing), so you can rest at the top / step off.
- **Ladder climb animation** — a dedicated **back-facing** pose: hair (no face) with a hairline, torso, and
  **arms/legs reaching in an alternating rhythm** synced to the climb cadence (`_drawLadderClimb`).
- **Pipe seams** — overdraw 1px into connected neighbors so sub-pixel tile rounding can't leave a gap.

## Deferred → next pass
- **2×2 pipe + 1×2 extension as dedicated multi-block pieces** (a single-click stamp, like the Wither Altar).
  Today you build them from 1×1 cells (which now render seamlessly). Kevin: roll these out, then polish seams there.
- Customizable block-contents **UI**; **conveyor speed** modal + apply-to-connected (both still pending).
