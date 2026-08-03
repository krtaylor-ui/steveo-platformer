# Steveo Platformer — Tester Brief (MVP shakedown, builds 331–345)

> **For the Chrome-enabled "tester" Claude.** You have READ access to this repo for context
> (source + `FUTURE_ROADMAP.md` for what's planned vs. what's a known gap). Test the LIVE app;
> don't edit game code. Use a dedicated browser session (no personal/work logins).

## Setup
1. Open **http://localhost:8000** (the human starts the server). Hard-refresh (Ctrl+Shift+R).
   Confirm the version reads **v3 build 345**. If not, refresh again (stale service worker).
2. If a login screen appears, pause for the human.
3. Two engines are covered: the **side-scroll (2D)** engine for jump-attack, and the
   **overhead (top-down)** editor + engine for everything else (Sandbox → 🗺 Overhead).
4. Before flagging something as a bug, sanity-check `FUTURE_ROADMAP.md` — some things are
   **known, intentional gaps** (e.g. pistons don't push loose terrain blocks yet; gates are
   45°-snapped; no extra Mario enemies beyond Goomba/Koopa/Shell). Report those as "matches
   roadmap", not failures.

For EACH item report **PASS / FAIL / BLOCKED**, one line of what you saw, and a screenshot when
visual. End with a compact table + any red DevTools console errors (should be zero).

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
- I4 The 🔎 filter box atop the Terrain palette narrows the block list as you type.
- I5 Enter Test then re-open the editor → placed + custom templates persist.

## J. OLD-WORLD LOAD (build 345 migrator)
- J1 Open a PRE-EXISTING overhead world (saved before this batch) → it loads without errors and plays
  normally (the schema migrator should upgrade it silently).

## Report
Table: `Item | PASS / FAIL / BLOCKED | note`. Screenshots inline. List any red console errors. Call out
anything visually broken even if not listed — especially in D (dual-rail geometry) and E/F (pistons/gates),
which are the newest.
