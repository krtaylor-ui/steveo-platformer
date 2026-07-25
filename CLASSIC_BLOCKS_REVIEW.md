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
