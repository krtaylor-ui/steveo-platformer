# TESTER BRIEF - Custom Sprites PHASE 2 (Character Builder) - build 439

Plain ASCII (relay-safe). Branch `main`. Notation: ">=" at least, "->" then.

NO CONTROLLER ITEMS. Everything here is mouse/keyboard. (Controller nav of the builder is a later pass.)

WHAT PHASE 2 IS: a creator can now BUILD their own character by mixing curated parts (Head, Ears,
Face, Back, Tail, Hand, Pattern) + a Body + five colours, instead of only picking from the 16 built-in
characters. The built character is saved PER WORLD and renders in BOTH engines using the same art as
Phase 1 (so it should look consistent with the built-ins). One custom character per world (v1).

## Setup
1. git checkout main ; git pull  -> badge reads build 439 (console: GAME_VERSION.match(/build \d+/)[0]).
2. npm run static -> http://localhost:8000 ; HARD RELOAD ; keep the console open.
3. Record PASS / FAIL / BLOCKED / NOTE + one line each. Do NOT stop on a failure.

===================================================================================================
## P2-A - Open the builder
===================================================================================================
A1 Go to Sandbox. On any world card, open the "Character:" dropdown. Confirm it now lists the 16
   built-ins AND a "Custom..." entry at the bottom.
A2 Select "Custom..." -> the Build a Character modal opens (it should NOT change the card's character
   or navigate away). Title reads "Build a Character".
A3 The modal shows: a preview image (top-down character), a Name field, a Body selector, seven part
   dropdowns (Head/Ears/Face/Back/Tail/Hand/Pattern), five colour swatches (Skin/Hair/Shirt/Pants/
   Accent), and buttons: Surprise Me, Cancel, Save Character.

    A1 dropdown has a Custom... entry ...... PASS/FAIL
    A2 Custom... opens the builder modal ... PASS/FAIL
    A3 all controls present ................ PASS/FAIL

===================================================================================================
## P2-B - Build + live preview
===================================================================================================
B1 Change a PART dropdown (e.g. Head -> Knight Helm). The preview updates immediately to show it.
B2 Change several parts (add Ears -> Pointed, Back -> Cape, Tail -> Cat Tail, Face -> Snout). Each
   shows on the preview and they stack sensibly (helmet on head, cape behind, tail behind, etc.).
B3 Change each COLOUR swatch (Skin/Hair/Shirt/Pants/Accent) -> the preview recolours the matching
   region live.
B4 Switch Body A / Body B -> the preview reflects the body change.
B5 Click "Surprise Me" a few times -> parts + colours randomize and the dropdowns/swatches update to
   match what is shown.
B6 Set the Name field (e.g. "Sir Cape").

    B1 part change updates preview ......... PASS/FAIL
    B2 multiple parts stack sensibly ...... PASS/FAIL
    B3 colours recolour live .............. PASS/FAIL
    B4 body switch reflects .............. PASS/FAIL
    B5 Surprise Me randomizes + syncs ..... PASS/FAIL
    B6 name accepted .................... PASS/FAIL

===================================================================================================
## P2-C - Save + card reflects it
===================================================================================================
C1 Click Save Character. The modal closes.
C2 The card's Character dropdown now shows "* <your name>" as the selected character (a star + the
   name you typed), and the dropdown entry now reads "Edit Custom...".
C3 Reload the page. The card STILL shows your custom character selected (persisted). Try this on:
   - a CLOUD world (signed in),
   - a LOCAL world (Play Offline, "lw-"),
   - an OFFLINE OVERHEAD world if you have one ("oh-").
C4 Re-open via "Edit Custom..." -> the builder opens PRE-FILLED with your saved parts/colours/name
   (not reset to defaults). Change one thing, Save -> the change sticks after a reload.

    C1 save closes the modal ............. PASS/FAIL
    C2 card shows * <name> + Edit Custom .. PASS/FAIL
    C3 persists on reload (cloud/local/oh) PASS/FAIL  (note which you tried)
    C4 Edit re-opens pre-filled + re-saves PASS/FAIL

===================================================================================================
## P2-D - The custom character renders IN GAME (both engines)
===================================================================================================
D1 SIDE-SCROLL: tag a side-scroll world with your custom character (Save in the builder), then start
   a NEW game on it (tag FIRST, then New Game - the character is snapshotted at creation). Confirm the
   2D player sprite shows YOUR parts + colours, and they track the animations (walk, jump, double-jump)
   the same way the Phase-1 built-ins did.
   (Reminder from the last brief: a new 2D world ships with airJump/slide/etc OFF - enable the ability
   in the world's Advanced settings before judging those moves. Dump window.game._worldAdvSettings.)
D2 OVERHEAD: do the same on an overhead world; confirm the top-down sprite shows your parts and rotates
   with aim/movement.
D3 RESUME: play the side-scroll custom game, let it autosave (or exit + Continue). On Continue, the
   character is STILL your custom one (not reverted to classic). [This exercises the build-435 fix.]

    D1 side-scroll shows custom in play ... PASS/FAIL
    D2 overhead shows custom in play ...... PASS/FAIL
    D3 resume keeps the custom character .. PASS/FAIL

===================================================================================================
## P2-E - Regression (custom must not disturb the built-ins)
===================================================================================================
E1 A world set to a BUILT-IN character (e.g. Knight) still plays as that built-in - unchanged.
E2 A world with NO character (classic) is unchanged.
E3 Switching a world FROM custom back TO a built-in via the dropdown works and persists.

    E1 built-in characters unchanged ...... PASS/FAIL
    E2 classic default unchanged .......... PASS/FAIL
    E3 custom -> built-in switch persists .. PASS/FAIL

===================================================================================================
## Wrap-up
===================================================================================================
- PASS/FAIL totals; the single worst-looking thing (with the parts/colours used); console error count.
- Fairness note (source-verified, not a play test): a custom character is COSMETIC only and never
  changes the hitbox - if any custom build felt like it changed hitbox/reach, flag it loudly.
