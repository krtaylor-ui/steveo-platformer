# Steveo Platformer — Tester Brief (MVP shakedown, builds 331–347)

> **For the Chrome-enabled "tester" Claude.** You have READ access to this repo for context
> (source + `FUTURE_ROADMAP.md` for what's planned vs. what's a known gap). Test the LIVE app;
> don't edit game code. Use a dedicated browser session (no personal/work logins).

## Setup
1. Open **http://localhost:8000** (the human starts the server). Hard-refresh (Ctrl+Shift+R).
   Confirm the version reads **v3 build 347**. If not, refresh again (stale service worker).
2. If a login screen appears, pause for the human.
3. Two engines are covered: the **side-scroll (2D)** engine for jump-attack, and the
   **overhead (top-down)** editor + engine for everything else (Sandbox → 🗺 Overhead).
4. Before flagging something as a bug, sanity-check `FUTURE_ROADMAP.md` — some things are
   **known, intentional gaps** (e.g. pistons don't push loose terrain blocks yet; gates are
   45°-snapped; no extra Mario enemies beyond Goomba/Koopa/Shell). Report those as "matches
   roadmap", not failures.
5. **Allow automatic downloads for localhost:8000** before section M (export writes files).

For EACH item report **PASS / FAIL / BLOCKED**, one line of what you saw, and a screenshot when
visual. End with a compact table + any red DevTools console errors (should be zero).

## Already covered — don't redo these
Confirmed on build 345 by the previous session; treat as done unless something nearby looks off.

| Item | Verdict | Note |
|---|---|---|
| D1 | PASS | Fly-out overlaps the button by 8px (DOM-measured), 📌 pin present top-right |
| I4 | PASS | 🔎 filter box present atop the Terrain palette |
| D6 | **PARTIAL — finish this** | Grass tooltip appeared on terrain hover; still needs buildings / mobs / items / devices |

Two exploratory findings were logged and are **already known — don't re-report**:
- **X1** World-card titles wrap mid-word ("Overh / ead / QA / Test"). Card-title CSS, every card, both views. Cosmetic, open.
- **X2** No per-world Export for overhead worlds — **FIXED in build 346**; now section M below.

## Method notes (two traps that produced wrong answers)
- **Coordinate scaling.** The window is 1920×1009 CSS px but screenshots came back 1529×804 —
  a **1.2557× factor**. `getBoundingClientRect()` returns CSS px while the click tool takes
  screenshot px. Convert before clicking. This is very likely the real cause of the old
  "hotbar mis-targets" observation, so **don't** file coordinate-drift bugs without checking scale first.
- **Measure, don't eyeball.** A zoomed screenshot made D1 look like a FAIL; measuring the DOM
  showed an 8px overlap — what looked like the gap was the panel border. For geometry items,
  read the DOM.

---

## A. 2D JUMP ATTACK + MARIO ENEMIES (side-scroll world)
- A1 Side-scroll Sandbox world → World Settings → Enemies → confirm **Jump Attack (stomp)** ON.
- A2 Place spawn eggs for a **Goomba** and a **Koopa**; enter play.
- A3 JUMP on the Goomba's head → squishes flat + you bounce. Walk into it from the SIDE → you
  take damage (stomp only when falling).
- A4 Jump on the Koopa once → shell pops off + a kickable **Shell** appears + it scurries
  shell-less. Jump on the shell-less turtle again → squished.
- A5 Touch/stomp the loose **Shell** → slides off fast; KOs an enemy it hits (spin-death); can
  hurt you on the return. Stomp a sliding shell → it stops.
- A6 Set Jump Attack OFF → jumping on an enemy just hurts you (old behavior).
- A7 Save + reload the world, re-enter play → goomba/koopa still spawn.

## B. OVERHEAD EDITOR — NAVIGATION & ELEVATION
- B1 WASD pans; ←/→ pan; ↑/↓ change active ELEVATION; number keys set it. Works with Hide-above on.
- B2 **Focus layer** greys blocks NOT at the active level; the layer DIRECTLY BELOW stays full
  colour. Heights labelled when zoomed in (taller-than-active = orange).
- B3 **Hide above elev** SLICES tall terrain (shows the block capped at the active level) — no black holes.
- B4 Build a 4-high tower; delete individual top blocks → each removes ONE level (keeps below);
  no stray dark remnants.
- B5 Draw a rect/oval/line at elevation 3 → the preview shows at the raised (3D) offset, not level 0.
- B6 World Settings → "3D height offset per level" → raise it → stacks look taller (capped 0.5).
- B7 "Air ghosts" OFF by default; toggle ON → dashed cyan cubes show empty levels under the cursor.

## C. SELECTION + ACTION BAR (Hand tool)
- C1 Hand tool: drag to scroll; single-CLICK any object → dashed outline + floating action bar with
  NAME + ✥ Move (static objects) + ⚙ (if it has settings) + 🗑 Delete.
- C2 Click a bridge / gate ANYWHERE on it → bar names it "Bridge"/"Gate" (NOT the block under it).
- C3 Click a lever / transmitter → bar shows its Tx channel number.
- C4 Double-click an object with settings → opens its settings modal.
- C5 Move → click a new cell relocates it. Delete removes it (terrain blocks too). Esc clears.

## D. PALETTES — PIN, DUAL RAILS, DRAG-AND-DROP
- D1 Hover a palette group → fly-out overlaps the button (no gap that drops the menu). 📌 pin in its top-right.
- D2 Pin several palettes → each shows inline; ✕ unpins. Pins persist after reload.
- D3 Mobs/Items palettes show mob-HEAD + item ICONS (not colour squares).
- D4 LEFT rail header → **▐▶** reveals the RIGHT panel. DRAG a palette by its header onto the right
  panel's drop-pad. The MAP AREA reflows to fill the space not covered by the top/left/right bars.
  ▐✕ hides it (palettes return to the left).
- D5 Rail ◀▶ width steppers resize each rail + the map fills the rest. Confirm clicking/placing lands
  on the CORRECT cell after resizing. Reload → the whole layout is remembered.
- D6 Hovering the map shows a TOOLTIP naming the block/building/mob/item/device under the cursor.

## E. OVERHEAD RUNTIME — PISTONS (redstone)
- E1 Piston, hand-click → Direction = Up, Reach 2, wire to a lever. Play, flip lever → it RAISES its
  block; stand on it → it CARRIES you up; unpower → lowers you back (elevator).
- E2 A N/S/E/W piston extends a solid HEAD `reach` cells when powered (barrier), retracts when not.
- E3 **Sticky (build 344):** a horizontal piston SHOVES the player/mobs ahead of its extending head;
  a **Sticky** one DRAGS them back as it retracts. (Non-sticky leaves them where pushed.)
  NOTE: pushing loose *terrain* blocks is a known roadmap gap — not expected yet.

## F. OVERHEAD RUNTIME — GATES
- F1 Gate (Buildings rail → Gate): click a hinge cell, then a tip. Hand-click the hinge → set a powered
  swing angle + signal source. Renders as a BLOCK wall at its height (stacked planks), not a flat line.
- F2 Play, power it → panel SWINGS to the angle (animated) + blocks movement; unpower → swings back.
- F3 Stand in the swing arc + power it → the gate STOPS at you (must not close THROUGH player/mob).
- F4 **Shadows (build 344):** with Day/Night + shadows on, the gate casts a ground shadow at its
  height, tracking the sun/moon (like terrain).

## G. OVERHEAD — PIPES, PITS, GUARDRAILS, ZOOM, ANIMATIONS
- G1 Two pipes, link one to the other (hand-click → set destination). Play, press E → teleports (pipe
  plays a climb-in). Must NOT say "not linked". The #1/#2 badges show in Test mode but should be GONE
  when playing the world normally (not via Test).
- G2 On a density-4 world, a pipe should look BIGGER (≈4×4) so the player fits (proportional, not 2×2).
- G3 Pit + a bridge across it + a mob near the pit → in play the mob does NOT cross the open pit (only
  the bridge); the player can still fall in.
- G4 On a guardrailed bridge you can walk ONTO/OFF at the ENDS (meets land) but can't fall off the SIDES.
- G5 World Settings → View & Controls → **Lock zoom in play** ON → mouse wheel no longer zooms in play.
- G6 **Portal step-through (build 344):** enter a PORTAL (not pipe) → plays a step-in + spin-warp before
  teleporting (toggle: Interaction animations → Portal step-through).
- G7 **Lever reach (build 344):** flipping a lever / using a lock → the player reaches an arm out briefly.

## H. CONFIG MODALS
- H1 Open a device / bridge / gate / pipe settings modal → checkboxes are a normal small box in a tidy
  row (NOT stretched full-width with the label shoved far right).

## I. TEMPLATE CREATOR (overhead editor)
- I1 Buildings rail → Templates → "＋ New Template…". Name it, set X/Y/Z (e.g. 4×4×6), OK. Build a small
  structure (raise some blocks), then click the map to place the capture REGION — outside greys out,
  cells above Z flag red.
- I2 Press Enter → captured + appears in the Templates list (with 🧩 Tree, the system template). Esc cancels.
- I3 Place your captured template → it stamps ADDITIVELY (ground under it preserved, no black void).
  Undo/redo the placement.
- I4 The 🔎 filter box atop the Terrain palette narrows the block list as you type. *(PASS on 345)*
- I5 Enter Test then re-open the editor → placed + custom templates persist.
- I6 **Tree = additive template (no void).** Buildings tab → place a **Tree**. Under/around the canopy
  you see **grass (real ground), NOT black**. The **trunk blocks** movement; you can walk **under the
  canopy**. Screenshot.
- I7 **Tree shadow.** With Day/Night + shadows on, the tree casts a **cell-accurate** shadow (canopy
  blob + trunk) tracking the sun (or fixed if that style is set). Screenshot at a **low sun angle**,
  where the trunk and canopy shadows separate. The old hard black blob should be gone.

**Templates — NOT in scope** (designed, not built; see `TEMPLATE_CREATOR_SPEC.md` round 2 — don't file
these): placement overlap options (Overwrite / Merge / Refuse) + ghost preview; template libraries
(System vs Player, account-wide vs world-specific, "Browse my templates"); export/import-all +
duplicate checksums; thumbnails; "Apply to all placed instances"; density / player-height scale
warnings. By decision templates carry **terrain + elevation only** — no mobs / items / redstone.

## J. OLD-WORLD LOAD (build 345 migrator)
- J1 Open a PRE-EXISTING overhead world (saved before this batch) → it loads without errors and plays
  normally (the schema migrator should upgrade it silently). Keep one pristine pre-345 world for this —
  do placement testing (D5) in a scratch world instead.

## M. WORLD EXPORT / IMPORT (build 346, fixed in 347)

**Retest these five — they were defects in 346 and are fixed in 347:**

| Was | Now |
|---|---|
| **M3 FAIL** — card export omitted `schemaVersion` (F1) | the card path migrates a copy, so both export routes agree |
| **M7 NOT RUN** — ⬆ Import used a native picker automation can't open (F5, withdrawn as a defect) | ⬆ Import is an **in-page modal** with a visible file input — now drivable, no human needed |
| **M9 renderer parked** — failures were `alert()` (F4) | failures report **in-page**, in the modal; nothing blocks |
| **M11 indistinguishable** — duplicates shared one title + date (F2) | display name suffixed "(2)", "(3)" … and each import gets its own date |
| **M6 FAIL** — sample promised a glass wall it never had (F3) | description now generated from the real block tally; `pitMode`/`lavaMode` flagged |
| **M8 wording** — refusal led with "missing mapSnapshot" for a perfectly good side-scroll file (F6) | rejections phrased by kind: wrong-engine says so, "damaged" reserved for malformed data |

M7 and M9 no longer need a human present — the whole import path is in-page now, so that
`HANDOFF.md` §4 batch can drop for imports. World-card **Delete** still uses a native confirm,
so that one stays. Your `hasFocus:true` tell for a suppressed native picker is a good one — worth
keeping in the handoff regardless.


Format + a ready sample file: `docs/world-file-format.md` and
**`sample-worlds/Overhead_QA_Test.export.json`** (the QA board as a real export). This unblocks
restoring fixtures through the real code path instead of writing localStorage by hand.
Needs automatic downloads allowed for localhost:8000 (Setup step 5).

- M1 **Card export (overhead).** Sandbox → 🗺 Overhead view → any world card now has an **Export**
  button next to Copy. Click it → a `.json` downloads, named `<World_Name>-<YYYY-MM-DD>.json`.
- M2 **Card export (side-scroll).** Same button on a side-scroll card → downloads too.
- M3 **File shape.** Open the downloaded file: top level has `steveoExport: 1`, `world_name`,
  `game_mode_default`, `view_mode` (`"overhead"` or `"side"`), `exportedAt`, and `world_data`.
  For an overhead world, `world_data.viewMode === "overhead"` and `schemaVersion` **is present** —
  including for a world exported from the CARD without ever being opened (that was the 346 bug).
- M4 **Editor export includes UNSAVED edits.** Open an overhead world → place a few blocks but do
  **NOT** save → **⬇ Export** in the command bar → the file contains the new blocks, and the
  flash reads "Exported ✓". (This is the point: export reflects what's on screen.)
- M5 **Round trip.** Import the file you just exported (Sandbox → **Import from File**) → it lands
  in the **🗺 Overhead** view (the view auto-switches) as a NEW card. It does not auto-open — click
  Edit — and the world matches: terrain, redstone, bridges, keys, spawn. It must NOT appear in the
  side-scroll list as a Normal world.
- M6 **Import the sample fixture.** Import `sample-worlds/Overhead_QA_Test.export.json` → a 40×26
  board: 52 redstone devices (AND/NOT/NOR gates included), 3 bridges, 6 ramps, 3 key items, 1 spawn,
  53 pit cells, 2 lava. Status line should read `40×26 @ density 1 · platformer`. Play it — the
  redstone board still works. **It has NO glass** (glass lives in `test/test-overhead-glass.js`), and
  it ships `pitMode: block` + `lavaMode: death` — so do NOT use it for G3 (which needs a pit you can
  fall into) or for any glass/lava check. Use your own pristine board for those.
- M7 **Editor ⬆ Import replaces the open world.** In the overhead editor, ⬆ Import → confirm the
  "this REPLACES the world open in the editor" prompt → the imported world loads, flash reads
  "Imported ✓ — Save to keep it". Undo must NOT resurrect the previous world (fresh undo stack).
  Cancelling the prompt leaves the open world untouched.
- M8 **Wrong-engine file is REFUSED, not half-loaded.** Export a SIDE-SCROLL world, then try to
  ⬆ Import it in the overhead editor → a clear "not an overhead world" message pointing you at the
  Sandbox list. The editor must keep the world it had, with no console error.
- M9 **Damaged file.** Hand-edit a copy: delete the `mapSnapshot` key → import → refused with a
  reason. Then try a non-JSON file (e.g. a .txt renamed .json) → "Invalid JSON file". No crash.
- M10 **Legacy file.** Take an export and delete its `schemaVersion` (simulating a pre-345 world)
  → import → loads fine (the migrator upgrades it).
- M11 **No clobber.** Import the same file twice offline → the second lands as a separate world
  (e.g. "… (2)"), it must not overwrite the first.

## Suggested order
1. **M** (export/import) first — it's brand new in 346, and M6 gives you the fixture to test everything
   else against through the real code path.
2. **D2–D5** — the pins, the ▐▶ right-panel reveal, the palette drag, and D5's post-resize click
   accuracy (the riskiest part of the dual-rail build). Do D5's placement test in a **scratch** world.
3. **D6** finish (buildings / mobs / items / devices tooltips), then **E/F** (pistons, gates), then the rest.
4. **J1 last**, against a world you have not touched.

## Report
Table: `Item | PASS / FAIL / BLOCKED | note`. Screenshots inline. List any red console errors. Call out
anything visually broken even if not listed — especially in M (new this build), D (dual-rail geometry)
and E/F (pistons/gates). Don't re-report X1/X2 or the items marked PASS above.
