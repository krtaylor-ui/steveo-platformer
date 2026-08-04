# Tester Brief — verify builds 347–358, then soak (target: v3 build 358)

> **For the Chrome-enabled tester Claude.** Read access to this repo for context. Test the
> **deployed** app, not localhost, so you exercise what players get. Don't edit game code.
> Dedicated browser session, no personal logins.

Two parts, deliberately separated because they answer different questions:

- **Part A — targeted verification.** ~20 items fixed since your last pass, none of which a
  headless test can see. Needs eyes. Do this first, while you're present.
- **Part B — the soak.** Unattended, overnight. Answers duration questions only: leaks, fps
  decay, drift, accumulating errors. It will tell you nothing about whether a sprite looks
  right, so don't rely on it for Part A items.

## Setup

1. Open **https://steveo-platformer-0001.up.railway.app** and hard-refresh (`Ctrl+Shift+R`).
2. **Confirm the version badge reads `v3 build 358`.** If it reads lower, refresh again — a
   new service worker (`steveo-shell-v358`) needs an activation cycle, and twice is normal.
   **If it still reads lower after three refreshes, stop and report that** — a stale shell
   would make every result below meaningless.
3. Use a **density-4** overhead world (e.g. "Test 2", 100×70 @ d4). Density matters: several
   bugs fixed this round were invisible at density 1 and obvious at 4.
4. Open DevTools → Console **before** you start, and leave it open so errors accumulate.

### Traps that produced wrong results last time

- **Coordinate scaling.** Window CSS px ≠ screenshot px (last run: 1920×1009 vs 1529×804, a
  1.2557× factor). `getBoundingClientRect()` returns CSS px; the click tool takes screenshot
  px. Convert. Don't file coordinate-drift bugs without checking scale first.
- **Measure the DOM, don't eyeball.** A zoomed screenshot made D1 look like a FAIL last time;
  the DOM showed an 8px overlap.
- **Clicking a top-bar checkbox steals keyboard focus** — a following number-key press won't
  reach the editor. Click a neutral area first.
- **Native dialogs park the whole renderer** until a human clicks. The import path no longer
  uses them, but **world-card Delete still does** — avoid it during unattended stretches.
- **Computed-coordinate clicking can miss what a human would hit.** Last round a lever tested
  as selectable via computed cell coords while a human clicking the visible sprite always
  missed it (the sprite is drawn ~2 blocks tall, offset up-left). Where a fix is about *where
  something looks*, click where it looks.

---

# Part A — targeted verification

Report **PASS / FAIL / BLOCKED**, one line of what you saw, screenshot when visual.

## A1. Pit death (overhead) — the big one

This took **nine builds** and five wrong diagnoses. The final cause: the sink offset was
expressed in sprite-size units, and sprite size = cell × **density**, so on a dense map the
body was drawn 2–3 *cells* away from the pit, out on the grass. Please be thorough here.

Use a **density-4** world with a pit next to raised ground.

- **A1.1** Walk into a pit from **below** (moving north/up). The body should fall **inside**
  the hole, be **partly hidden by the blocks in front of it**, and the exploding pieces
  should appear **where the body was** — not offset from it.
- **A1.2** Repeat from **above** (moving south), **left**, and **right**. All four should look
  equally correct. The earlier bug looked fine from some directions and broken from others.
- **A1.3** **Feet check.** Watch the bottom of the body. Nothing should poke out *over* the
  blocks below it. (Feet sticking out was the last remaining defect before 356.)
- **A1.4** **Burst occlusion.** The exploding pieces should also be hidden by the ground for a
  **pit** death. Then confirm a **non-pit** death (mob damage, lava) still shows its pieces
  **on top** — that distinction is deliberate and easy to break.
- **A1.5** **Wide vs single-cell pit.** In a wide pit the body should sit well in; in a
  one-cell pit it sits closer to the edge it entered. Both intended — the shift is clamped to
  the pit that's actually there. Flag only if a small pit looks *wrong*, not just different.
- **A1.6** Capture aid: with the debug HUD up (`` ` ``) the death plays at **quarter speed**,
  which is how to screenshot it. Confirm that works — it's the tool you'll need if A1 fails.

**What a failure looks like now:** body drawn *outside* the pit on grass (regression to the
pre-355 bug); or the body vanishing too early as it sinks (occluder window too large — the
opposite failure, introduced by 356's bigger window); or a straight-edge crop (the 351 clip
somehow back).

## A2. Overhead editor rails

The right rail's palette styles were scoped to the left rail's id, so anything dragged right
rendered as unstyled text. Left rail was always fine.

- **A2.1** Drag a palette (e.g. **Mobs**) by its header from the left rail onto the right
  panel's drop-pad. It should land, and look **byte-identical** to the left version: group
  box, styled header bar, buttons, 📌/✕. *(This drag was previously believed untestable — it
  works; it only looked broken because it was unstyled. Your old F8 is resolved.)*
- **A2.2** Hover a group in the **right** rail → its fly-out should open **inward (leftward)**.
- **A2.3** Right-rail text is **right-justified**, hugging the anchored edge, and stays
  readable with a palette open.
- **A2.4** **Arrows are mirrored on purpose.** In the RIGHT rail, **◀ makes it wider** and ▶
  narrower. In the LEFT rail, ▶ widens. Each arrow points the way its own panel's edge moves.
  **Do not report the mismatch as a bug** — report it only if an arrow does the opposite of
  its own tooltip.
- **A2.5** Narrow the right rail. Contents should **shrink with it**, not spill leftward. (Last
  round, narrowing made the drop-pad appear *wider*.)
- **A2.6** ✕ / ▐✕ returns palettes to the left rail. Reload → whole layout remembered.

## A3. Overhead editor — viewport and performance

- **A3.1** Scroll a big map around. Mobs, items, devices and buildings must **not** spill into
  the rail areas beside the map. Previously entities drew unclipped, giving a lit strip of
  floating sprites over the dark border ("bright in the middle, dark and glitchy at the edges").
- **A3.2** Entities at the map edge should be **cut off cleanly**, not vanish early. If they
  disappear before reaching the edge, the clip rect is too tight — report it.
- **A3.3** Widen/narrow both rails and confirm the **map reclaims space**. The insets now
  measure real rail-to-canvas overlap rather than assuming the rail always covers the canvas.
- **A3.4** **Zoom-out performance.** On the density-4 100×70 world, zoom right out. It should
  stay responsive. With the HUD on, note **fps / worst-frame / cells-on-screen** at full zoom-in
  and full zoom-out. The per-visible-cell focus overlay is skipped below ~7px per cell.
- **A3.5** A capped rail-width stepper now says so in the flash instead of silently doing
  nothing.

## A4. Overhead runtime — the rest of the 347/348 batch

- **A4.1 Gate hinge is solid.** Try to walk through a gate at its **hinge** cell. Blocked.
  (Every gate previously had a one-cell walk-around at its anchor.)
- **A4.2 Bridge guardrails.** Rails on the two **long sides only** — the ends stay open, and
  you can still walk on/off there.
- **A4.3 Piston direction.** Set a piston to push **East**. Its head at rest should sit on the
  **east** face, not the top. Check all four directions.
- **A4.4 Pipe emerge.** Entering plays the climb-in; **arriving** now grows the player back
  from small and sits them on the pipe. Turn **Interaction animations → Pipe climb-in** OFF →
  both ends instant.
- **A4.5 Legacy redstone.** Open a **pre-existing** overhead world whose pistons/lamps were
  wired by the old shared `channel` (not `rxIds`). They should now respond — schema **v2**
  copies `channel` into `rxChannel` on load. This is the migration most likely to change how
  an old world behaves, so if any old world plays differently, suspect this first.
- **A4.6 Shadows.** Moonlit shadows read **weaker** than sunlit. With **Fixed** shadow style
  and a day/night cycle, shadows **fade out at dusk and are gone at night**.
- **A4.7 Lever selection + Tx.** Click a lever **where it looks** (its sprite, not its cell) →
  selects, action bar shows `lever · Tx #N`, move/settings/delete available. Hovering shows the
  same label. A lamp reads `lamp · Rx`, dust reads plain `dust`.
- **A4.8 Esc safety.** With nothing selected, Esc opens the leave prompt — **"Keep editing" is
  the primary button and has focus**, so a stray Enter is harmless. With something selected,
  Esc clears the selection instead.

## A5. Side-scroll (2D)

- **A5.1 Stomp guard.** Walk into a **Goomba** and into a **sliding Shell** horizontally —
  should **damage you**, never stomp. Try at sprint speed and on the exact frame of landing.
  Then jump on them deliberately → stomp still works.
- **A5.2 Shell direction.** Kick a shell from the **left** → it travels **right**, away from
  you. And vice versa. (It used to come straight back at you.)
- **A5.3 Card titles.** Sandbox world cards — titles wrap at **spaces**, not mid-word
  ("Overh / ead"). A very long unbroken name should still wrap rather than overflow.

## A6. Settings — two player-visible behaviour changes

Both deliberate; verify rather than report as bugs.

- **A6.1 Lock Physics is enforced and defaults ON.** In a **Platformer** world as a *player*,
  the pause-menu World Settings should **not** offer Gravity or Jump Height. In **Sandbox**
  they're still there. Unticking Lock Physics (Sandbox → Designer Locks, Advanced) gives them
  back to players.
- **A6.2 Advanced is sandbox-only.** No Advanced toggle, and no advanced rows, outside Sandbox.
  The **Debug** tab should be **absent** unless you're in Sandbox with Advanced ticked.
- **A6.3 New Multiplayer tab** holds companion + boss-scaling rows. Absent in Speed Run.
- **A6.4 Guided Trident defaults ON**, Trident Recall (right-click) defaults ON.

## A7. Export / import (retest of your own FAILs)

- **A7.1** Card export of an overhead world **never opened since 345** now includes
  `schemaVersion` (your M3 FAIL / F1).
- **A7.2** `sample-worlds/Overhead_QA_Test.export.json` description now matches its contents —
  **no glass**, `pitMode: block`, `lavaMode: death` (your M6 FAIL / F3). Don't use it for pit,
  lava or glass checks.
- **A7.3** Import failures report **in-page**, no native dialogs (your F4).
- **A7.4** Editor **⬆ Import** is an in-page modal with a visible file input — drivable from
  automation, no human needed (your F5).
- **A7.5** Duplicate imports get distinct **card titles** "(2)", "(3)" and their own dates
  (your F2).
- **A7.6** Offering a **side-scroll** export to the overhead importer says it's a side-scroll
  world and points at the Sandbox list — it must **not** say "damaged" (your F6).

---

# Part B — the soak

Unattended, several hours. Start it when Part A is done.

## Procedure

1. Deployed URL, badge confirmed **358**, DevTools Console open.
2. Enter the **density-4** overhead world in **Test** mode (God off).
3. Debug HUD on (`` ` ``) and **⏱ Perf** ticked, so fps / worst-frame / cells are on screen.
4. Turn **Day/Night ON** with a short cycle, so the atmosphere, shadow and lamp paths keep
   cycling rather than sitting still.
5. Record a **baseline**: fps, frame ms, worst-frame ms, cells-on-screen, DevTools memory
   (Performance monitor → JS heap), console error count, wall-clock time.
6. Leave it running, **foregrounded**, on a machine set not to sleep. A backgrounded tab is
   throttled by Chrome and the soak measures nothing.
7. **Touch nothing that opens a native dialog** — world-card Delete in particular.

## Morning checklist

| Check | Pass | Investigate |
|---|---|---|
| fps vs baseline | within ~10% | steady decline |
| worst-frame ms | no growth | growing spikes = accumulating work |
| JS heap | flat or sawtooth (GC) | monotonic climb = leak |
| Console errors | zero new | anything repeating |
| Input still responds | yes | frozen = hang, capture the stack |
| Day/night phase | still cycling sanely | stuck or jumping |
| Redstone still live | lever still drives its device | dead = state drift |
| Version badge | still 358 | changed = SW swapped mid-run |

**Report the four numbers** (fps, worst-frame, heap, error count) at baseline and at the end,
plus elapsed hours. A soak with no numbers isn't a result.

---

## Reporting

Table of `Item | PASS / FAIL / BLOCKED | note`, screenshots inline, console errors listed.

**Screenshots are worth more than description** — a single screenshot resolved the nine-build
pit bug after five wrong diagnoses. Save to `reports/img/` and name them by item (`A1.1_below.png`).
For anything positional, a shot **mid-animation** beats one after it settles; use the
quarter-speed HUD trick.

## Don't report these

Known-open, by decision — see `docs/open-items-after-348.md`:

- **F7 reflow** is only partly fixed. The rail cap now announces itself; the canvas is still a
  fixed-aspect box, so **letterbox margins beside the map are expected**, not a reserved inset.
- Roadmap gaps in `FUTURE_ROADMAP.md` — pistons don't push loose terrain, gates are 45°-snapped,
  no Mario enemies beyond Goomba/Koopa/Shell, no per-block template contents, §40 export-hiding,
  §41 player-vs-creator settings split.
- The **Konami** canvas settings panel is an intentional Easter egg. Its "Advanced" **tab** is
  unrelated to the Advanced **tier**, and it is not documented for players.
- World-card **Delete** still uses a native confirm — known, deliberate for now.
