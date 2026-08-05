# Open items after build 358 (soak baseline)

Builds 348–358 are all on `main` and pushed; the deployed target is **v3 build 358**. This is
the list of what is **known-open**, so a pass can target only what changed rather than
re-running everything. The tester's own brief for the next run is `TESTER_BRIEF_SOAK.md`
(Part A verification, Part B soak).

## Reported again after 348, fixed in 349 (browser-unverified)

Kevin re-tested 348 and three things were still wrong. All three had a cause that 348's
fix had not actually addressed:

- **Editor dimming / "glitchy" edges** — entities were drawn UNCLIPPED while terrain is
  blitted into the map viewport, so on a scrolled map mobs/items/devices/buildings spilled
  over the rail insets as lit sprites on the dark background. The world block is now clipped.
- **Right rail still felt broken** — 348 only added a message when the stepper capped. The
  actual problem: the map inset was applied for the rail's full width whether or not the
  rail covered the canvas. Insets now measure the real rail-to-canvas overlap.
- **Pit death** — took THREE goes, and the first two were wrong in opposite directions.
  348 moved the animation onto the pit but left the trigger on the cell boundary (still died
  looking like you were on solid ground). 349 delayed the trigger with a penetration margin,
  which was worse — you could walk to the middle of the hole first. **350 leaves the trigger
  alone** (it was correct all along) and moves the SPRITE: an eased step-off phase slides it
  from where the player appears to the pit centre while the 2.5D lift drops to zero, so it
  reads as stepping off the ledge. Then the existing shrink takes over.
  **Check from all four directions**, especially north (up into the pit from below the cliff),
  and confirm the sprite never appears to die on solid ground.

**These three are the highest-value things to eyeball**, because each has now been "fixed"
once already without resolving the symptom. Specifically worth checking: walking into a pit
from every direction; widening the right rail and watching the map reclaim space; and that
nothing is missing from the map area now that it is clipped (entities at the viewport edge
should be cut off cleanly, not vanish early).

## Needs a HUMAN, cannot be automated

| Item | What to do |
|---|---|
| ~~**F8** — palette drag~~ | **RESOLVED, build 357.** Kevin's screenshot showed the drag working all along — the palette moved correctly. It only *looked* broken because every palette style was scoped to the left rail's id, so anything dragged right rendered unstyled. Not a drag problem at all. |
| **F5 follow-up** | The editor's ⬆ Import is now an in-page modal, so it *should* be automatable. Worth one confirmation that it no longer needs a human. |

## Known-open defects

| ID | Item | Why it's still open |
|---|---|---|
| **F7** | Map area doesn't reflow; right rail capped | Only the *silent* half is fixed (a capped stepper now says so). The real fix means overlaying the rail and growing `_rightInset` — canvas geometry shared with the game loop. **Correction to the report:** the ~197px either side is NOT a reserved inset, it is letterboxing of a fixed-aspect canvas (1526×804 is as large as ~16:10 fits in 1920×1009). The rail is capped because it sits outside the canvas and can only grow into that margin. Note D5's click accuracy currently passes *because* the canvas never moves, so this needs its own retest. |
| **X1** | Card titles wrapped mid-word | Fixed in 347 but **never verified in a browser** — CSS-only change. |

## Fixed in 347/348 but NOT browser-verified

Everything below passed headless tests only. The visual items in particular need eyes.

- **F12** retracted piston head now points at its push direction (all four)
- **F14** pipe arrival plays the emerge animation (grow + sit on the pipe)
- **F16** pit-death animation plays over the pit, not adjacent ground/bridge
- **F13** gate hinge is solid — walk at a gate's anchor and confirm you're blocked
- **F15** guardrails no longer drawn across the bridge ends
- **F17** walking into a Goomba / sliding shell damages you instead of stomping (try at sprint speed, and on the exact landing frame)
- **F18** kicked shell travels *away* from the player, both from a walk-into and from a stomp
- Moonlit shadows weaker than sunlit; **fixed** shadows fade at dusk, gone at night
- Zoom-out perf on a big dense map; new fps / worst-frame / cells-on-screen on the play HUD (`` ` ``)
- Levers selectable where they *look*; hover names the Tx channel
- Import: in-page errors (no native dialogs), duplicate names suffixed, card export carries `schemaVersion`

## Behaviour changes players will notice immediately

Both are deliberate, both affect existing worlds:

1. **Lock Physics is enforced and defaults ON** — Gravity and Jump Height are now hidden from players in every existing Platformer world. Sandbox is exempt.
2. **Guided Trident defaults ON**, and Trident Recall (right-click) defaults ON.

Also: **Advanced is sandbox-only**, the **Debug tab hides** unless Advanced is on, and there's a new **Multiplayer tab**.

## Save-format note for the soak

**Schema v2** ships in 348: a pre-v2 world that wired a piston/lamp via the old shared
`channel` bus gets `rxChannel` filled in on load. Worth watching for any world that
behaves differently after first load — that migration is the reason.

## Deferred by decision (roadmap, not defects)

- **§40** non-exportable levels — `allowExport` flag is feasible; browser-side encryption is not (the client must hold plaintext to render).
- **§41** which settings belong to players at all, per mode, plus a cheat mode that flags the run.
- Overhead settings → schema conversion (adds a tier + help text, and makes the user guide generatable).
- The settings review itself: `docs/settings-review-2d.md` / `.csv` + the overhead pair; Kevin's first pass is applied, ~16 rows still flagged.

## Nine builds on one bug — worth not repeating

The overhead pit death took builds 348–356 and five wrong diagnoses. The sequence, because the
failure mode is generalisable:

1. 348 moved the death **animation** onto the pit — trigger still fired on the cell boundary.
2. 349 moved the **trigger** (penetration margin) — let you walk to the middle of the hole.
3. 350 moved the **sprite** (step-off phase) — still drew over the ground.
4. 351 **clipped** the sprite to the pit — occluded correctly, but cropped it.
5. 352 **shifted** it inside that clip — invisible against the real error.
6. 353 replaced the clip with an **occluder re-draw** — gated on elevation > 0.
7. 354 removed that gate — a pit in flat ground has no raised neighbours, so 353 was dead code.
8. **355 found it:** the sink offset was `size * 0.75` where `size = unit * zoom` and
   `unit = cell * DENSITY`. On a dense map that is 2–3 *cells* of drift, so the body was never
   near the pit. Every earlier symptom followed from that one line.
9. 356 polished feet / depth / burst occlusion.

Two lessons already applied, and worth applying again:

- **`unit` is player-scale (cell × density), NOT a cell.** Any offset written in units of it
  silently multiplies with density and is invisible on a density-1 test map. **The pipe
  climb-in and the melee swing both use `unit`-based offsets** and should be audited at
  density 4.
- **Ask for a screenshot early.** One picture ended it after five inferential fixes. When a
  report says "it looks wrong", inference is the expensive path.

Same shape as the rail bug (357): something written correctly for one context, silently wrong
in another. An id-scoped style, or a sprite-size offset, is a latent bug the moment the same
code runs somewhere else.

## Raised during the build-361 Part A run (not defects, logged)

**Burst pieces can draw over a pit rim — ambiguous BY DESIGN, not a bug.** Verified in code:
`_burstParts` gives each piece `{x, y, vx, vy, sz, rot, vr}` and **no height or elevation** —
build 297 made the top-down burst scatter outward and settle rather than fall, deliberately. So
"a piece thrown upward should draw over the rim" has no representation in the data: a piece is
always on the ground plane, and correctness reduces to cell depth. `_redrawOccluders` covers
cells nearer the camera than the pit, so a piece over a rim block *behind* it is correctly on
top, and pieces on the same depth diagonal are the residual case.

*Improvement, if we want the ambiguity gone:* give each piece a small **decaying height**, so
early frames legitimately fly over the rim and later frames settle behind it. That makes the
occlusion test meaningful for pieces instead of arbitrary. Small; cosmetic; not urgent.

**Stale held keys across sessions.** Synthesised `keydown` without `keyup` persists into the
next session, so the player walks off unprompted. That is a test-harness artifact, but a
defensive **input flush when a session starts** is cheap and would remove a class of confusing
result — worth doing in the next build rather than mid-verification.

**Deliberately not changed mid-run:** both of the above. Changing the build while it is being
verified is how you end up unsure what was tested.

## Outstanding after the build-361 Part A run (for the next session)

Part A is otherwise **complete**. Staged fixes live on branch `card-title-362`, unmerged while
the soak runs on 361.

**Still open, needs a measurement rather than a guess:**
- **A4.7 hit-area half.** Lever selection by *where it draws* still fails despite `_deviceAt`'s
  forgiveness (exact cell, then one row down, two if raised). Needs the click point and the
  lever's draw origin in the same units before anyone changes code — the pit bug is the
  cautionary tale for guessing at offsets.
- **A9.6 silently re-routes.** A wrong-engine file no longer says "damaged" (correct) but says
  nothing at all (not correct). Wants the same explicit phrasing `rejectionMessage()` gives the
  overhead editor.

**Not bugs, decisions:**
- **A5.1, A5.2, A6 player-context halves are untestable offline** — Platformer and Normal have
  no offline provider, so those modes need a logged-in session. Either give the tester
  credentials or accept the items as untested until local providers exist. The "freeze" that
  appeared to block them was the native `alert()` in the offline guard, fixed in 362.

**Staged on `card-title-362`, all awaiting a browser pass:**
card-title full row · governor samples frame INTERVAL not render duration · leak flag needs an
absolute rise too · soak-log listener accumulation · zeroth-sample fps 0 · editor piston faces
its direction · offline guard is an in-page banner · non-world JSON refused · unreadable-file
message names the file.
