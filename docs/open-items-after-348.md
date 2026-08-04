# Open items after build 349 (soak baseline)

Build 348 is on `main` and pushed (`dc2ad1a..41e7337`, 15 commits). This is the list of
what is **known-open** as the soak starts, so a second pass can target only what changed
rather than re-running everything.

## Reported again after 348, fixed in 349 (browser-unverified)

Kevin re-tested 348 and three things were still wrong. All three had a cause that 348's
fix had not actually addressed:

- **Editor dimming / "glitchy" edges** — entities were drawn UNCLIPPED while terrain is
  blitted into the map viewport, so on a scrolled map mobs/items/devices/buildings spilled
  over the rail insets as lit sprites on the dark background. The world block is now clipped.
- **Right rail still felt broken** — 348 only added a message when the stepper capped. The
  actual problem: the map inset was applied for the rail's full width whether or not the
  rail covered the canvas. Insets now measure the real rail-to-canvas overlap.
- **Pit death still fires outside the pit** (walking north into it) — a raised neighbour is
  drawn shifted up-left, so a cliff cube visually covers the pit cell's south side while
  the death fired on the cell boundary. Now needs real penetration (0.3-cell margin).

**These three are the highest-value things to eyeball**, because each has now been "fixed"
once already without resolving the symptom. Specifically worth checking: walking into a pit
from every direction; widening the right rail and watching the map reclaim space; and that
nothing is missing from the map area now that it is clipped (entities at the viewport edge
should be cut off cleanly, not vanish early).

## Needs a HUMAN, cannot be automated

| Item | What to do |
|---|---|
| **F8** — palette drag | Drag the "Mobs" header from the left rail onto the right panel's drop-pad. Does it land? Does ▐✕ return it left? A synthetic drag can't cross the mouse-move threshold, so this has never been exercised. |
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
