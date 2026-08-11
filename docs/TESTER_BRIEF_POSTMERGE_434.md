# TESTER BRIEF - POST-MERGE verification (build 434) - run the WHOLE plan without stopping

Plain ASCII (relay-safe). Branch `main` (the whole stack is now MERGED). Notation: ">=" at least,
"->" then.

This is the first pass against the merged `main`. The big stack landed: overhead multiplayer + versus,
overhead play modes (Platform / Speed Run / Arena), glass tubes, 2D chest pass, in-app modals, and
Custom Sprites Phase 1. This brief covers everything that is browser-only and NOT yet verified.

IMPORTANT - NO CONTROLLER ITEMS IN THIS BRIEF. Anything needing a real gamepad (pad movement,
per-pad players, arena versus on pads, modal A/B on a pad, the setup window D-pad panels, B=cancel,
multi-player tube travel, 2D multiplayer per-player colours) is handled separately by Kevin. If a step
below would need a second human player or a pad, it is marked [SKIP - controller] - do not attempt it.

## Setup (once)
1. git checkout main ; git pull
2. npm run static -> http://localhost:8000 ; if any /api call 404s, restart the API server too.
3. HARD RELOAD (Ctrl-Shift-R). Confirm the badge (bottom of the menu) reads build 434:
   console -> `GAME_VERSION.match(/build \d+/)[0]` -> "build 434". If lower, cache-bust again first.
4. Keep the console OPEN the whole run. Watch for red errors on every launch; note any.
5. Record PASS / FAIL / BLOCKED / NOTE + one line each. Do NOT stop on a failure - note it, continue.

Notation for capture: paste the "[GamePlay]" engine-dispatch console line where a step asks for it.
(Build 435+: OVERHEAD launches now print a "[GamePlay] engine dispatch -> OVERHEAD" line too - it was
missing before, which is why earlier overhead runs logged nothing.)

PREREQUISITE before testing any 2D MOVEMENT (learned the hard way - caused a false "double jump
broken" for two builds): a NEW 2D world ships with airJumpEnabled / ledgeHangEnabled / slideEnabled /
wallSlideEnabled all FALSE by default - these are per-world opt-in abilities, not bugs. Before judging
2D movement, dump the world's config in the console:
    window.game && window.game._worldAdvSettings
and enable the ability under test in the world's Advanced settings first. A disabled ability is
CONFIGURATION, not a code fault - do not file it as a movement bug.

===================================================================================================
## B1 - Version badge shows the NUMBER only (build 434 fix)
===================================================================================================
The app version badge used to print the whole build note and shove the Logout button off-screen.
Now it shows just the version number; the full note is on hover.

B1.1 On the dashboard, the version badge reads exactly "v3 build 434" (no long sentence after it).
B1.2 The Logout button is fully visible / on-screen (not pushed off by the version text).
B1.3 Hover the badge -> the full build note appears as a tooltip (title). NOTE what it says.

    B1.1 badge = number only ............. PASS/FAIL
    B1.2 Logout fully visible ............ PASS/FAIL
    B1.3 full note on hover .............. PASS/FAIL  NOTE: <...>

===================================================================================================
## B2 - Custom Sprites: SIDE (2D) rendering fidelity  [THE headline unverified item]
===================================================================================================
Context: Phase 1 added 16 characters that render in BOTH engines. The 2D/side sprite rendering could
NOT be verified headlessly - this is the most important visual check. Accessories are COSMETIC only.

Prep: in Sandbox, open (or create) a SIDE-SCROLL world. Set its Character (world card "Character:"
dropdown, or the editor) to a character with obvious accessories - e.g. Knight (helmet/crest), Alien
"Zib" (antennae), Cat (ears + tail), Robot, Wizard (hat). Save. Then start a NEW game on that world
(the character is snapshotted at game creation, so tag FIRST, then New Game). 1 player, keyboard.

B2.1 The chosen character's accessories render on the 2D sprite and look right (helmet on the head,
     ears on top, tail behind, hat as a hat) - not floating, not detached, not on the wrong layer.
B2.2 FAR-ARM Z-ORDER: accessories on the body sit correctly relative to the far arm / near arm as the
     sprite faces left vs right (walk both directions). No accessory drawn on top of the near arm when
     it should be behind, or vice-versa.
B2.3 ANIMATIONS - run the sprite through every move and confirm the accessories track the body (no
     lag, no detachment, no z-flip) on each: walk L/R, jump, DOUBLE-JUMP (spin/flip), slide/crouch,
     ladder climb, pipe crawl (if a pipe is handy), melee swing.
B2.4 Try 2-3 different characters this way; each silhouette is distinct and reads clearly at play size.
B2.5 Recolour: if the world offers a colour pick, change a colour and confirm the sprite updates.

    B2.1 accessories render + placed right . PASS/FAIL  char used: <...>
    B2.2 far-arm z-order correct L and R ... PASS/FAIL
    B2.3 accessories track ALL animations .. PASS/FAIL  (call out any that break)
    B2.4 distinct silhouettes at play size . PASS/FAIL
    B2.5 recolour updates the sprite ....... PASS/FAIL/NA

===================================================================================================
## B3 - Custom Sprites: OVERHEAD rendering fidelity
===================================================================================================
Prep: open/create an OVERHEAD world, set its Character to one with accessories, save, play 1P keyboard.

B3.1 Accessories render on the top-down sprite and rotate/track with the aim + movement.
B3.2 Run the overhead animations: walk (limbs swing), jump, double-jump (flip/somersault), and confirm
     accessories stay attached through the spin.
B3.3 KNOWN ISSUE to confirm, not re-file: "Zib" (alien) head faces the AIM direction, not the travel
     direction; and at small Arena zoom sizes the sprites read as blobs. Just NOTE if you see these.

    B3.1 overhead accessories render ...... PASS/FAIL  char used: <...>
    B3.2 track walk/jump/double-jump ...... PASS/FAIL
    B3.3 Zib-aim / small-size legibility .. NOTE: <...>

===================================================================================================
## B4 - Character select + persistence (both engines, MOUSE)
===================================================================================================
B4.1 Sandbox world card "Character:" dropdown: change it on a SIDE-SCROLL world; reload the page;
     confirm the card still shows the new character (persisted).
B4.2 Same on an OVERHEAD world card; reload; persisted.
B4.3 Offline path: if you have an OFFLINE (local) overhead world (an "oh-" world, or one made in Play
     Offline mode), change its character and reload - it must persist too (these save to local
     storage, a past bug). NOTE if you cannot easily make one.
B4.4 The pre-game "Character" field (overhead play setup, via mouse) lists the characters and the
     per-player field is labeled "Body" (boy/girl). Just confirm the labels/fields exist; do NOT drive
     the panels with a pad [SKIP - controller].

    B4.1 side-scroll card persists ....... PASS/FAIL
    B4.2 overhead card persists .......... PASS/FAIL
    B4.3 offline overhead persists ....... PASS/FAIL/NA
    B4.4 Character + Body fields present . PASS/FAIL

===================================================================================================
## B5 - Classic default UNCHANGED (regression)
===================================================================================================
B5.1 A normal 1P SIDE-SCROLL game on a world with NO character set (or set to "classic") shows the
     usual classic look - unchanged from before.
B5.2 An existing/older world still loads and plays with no console errors.
B5.3 Single-player feel is unchanged (movement, jump, combat) - nothing from the merge regressed 1P.

    B5.1 classic look unchanged .......... PASS/FAIL
    B5.2 existing worlds load clean ...... PASS/FAIL
    B5.3 single-player unchanged ......... PASS/FAIL

===================================================================================================
## B6 - Glass tubes, single player (P1 keyboard/mouse)
===================================================================================================
Multi-player tube travel needs pads [SKIP - controller]; verify the P1 path only here.

UNBLOCK for B6.3 + B7 (the canvas-palette blocker): import the ready-made fixture world instead of
driving the palette. In Sandbox -> Import from File, choose:
    FIXTURE_2D_ladder_tube_chest.json   (in this docs folder / C:\Dev\Steveo-QA\docs\)
It is a small flat 2D Platformer world laid out left-to-right: spawn -> a LADDER (col 6, climb to a
ledge) -> a horizontal TRAVEL TUBE (walk RIGHT into the left mouth ~col 12, fly to ~col 30) -> a CHEST
(col 36, pre-filled 3 items + 5 empty slots) -> the GOAL. Play it (New Game / Test) as 1P keyboard.

B6.1 OVERHEAD editor: in the buildings palette find "Glass Tube" (friendly name), place TWO. Select
     one (Hand tool) -> settings -> set its Teleport destination to the other. Save. (Confirm the
     palette shows friendly names like "Glass Tube" / "Save Point", and the tube link hint appears.)
B6.2 PLAY 1P: walk P1 onto one tube mouth, press E; P1 FLIES along a visible translucent tube and
     arrives at the other end. No getting stuck, no double-trigger loop.
B6.3 2D world with a Travel Tube: P1 can enter and fly through it (mouse/keyboard).

    B6.1 place + link tubes, friendly names PASS/FAIL
    B6.2 overhead fly-through + arrival ... PASS/FAIL
    B6.3 2D tube works for P1 ............. PASS/FAIL

===================================================================================================
## B7 - 2D sandbox Chest: palette tabs + remove item (MOUSE)
===================================================================================================
(Use the SAME imported FIXTURE_2D_ladder_tube_chest.json - it already has a chest with items. Open it
in the SANDBOX EDITOR to see the placement palette/tabs, and in PLAY to open the chest.)
B7.1 Place a Chest in a 2D sandbox world (or use the fixture's chest at col 36), open it. The item palette shows the CURRENT sandbox palette
     tabs/items (not a stale short list) - all tabs are present and populated.
B7.2 Put an item into a chest slot, then REMOVE it from the slot (right-click the slot, or drag out to
     trash - whatever the UI offers). The slot empties.

    B7.1 chest palette = full current tabs  PASS/FAIL
    B7.2 remove an item from a slot ....... PASS/FAIL

===================================================================================================
## B8 - In-app modals, no native freeze (MOUSE/KEYBOARD)
===================================================================================================
Context: native alert/confirm/prompt were replaced with in-app modals so nothing freezes the page.

B8.1 Trigger a confirm (e.g. Delete a game or a world) -> an in-app modal appears (NOT a browser
     system dialog). Cancel and OK both work by mouse.
B8.2 Trigger a prompt (e.g. Rename a world / a teleport target) -> in-app modal with a text field;
     mouse OK / Cancel work; typing works.
B8.3 At no point does a grey browser "localhost says..." system dialog appear, and the page never
     freezes/greys out waiting on one. (Pad dismissal A/B is [SKIP - controller].)

    B8.1 confirm is in-app, OK/Cancel ok .. PASS/FAIL
    B8.2 prompt is in-app, typing ok ...... PASS/FAIL
    B8.3 no native dialog / no freeze ..... PASS/FAIL

===================================================================================================
## B9 - Overhead editor: mode picker + friendly names + save (MOUSE)
===================================================================================================
B9.1 In the overhead editor, the Mode picker offers Platform / Speed Run / Arena and setting it tags
     the world's mode (visible on the Sandbox card afterwards).
B9.2 Save an ONLINE overhead world (signed in) -> persists to the server (reload, still there).
B9.3 Save an OFFLINE overhead world (Play Offline) -> persists to local storage (reload, still there).

    B9.1 mode picker sets world mode ..... PASS/FAIL
    B9.2 online overhead save persists ... PASS/FAIL
    B9.3 offline overhead save persists .. PASS/FAIL/NA

===================================================================================================
## B10 - Play-mode LAUNCH smoke (no pads needed for a 1P launch)
===================================================================================================
Just confirm each mode LAUNCHES into the right engine without errors. Do NOT deep-test gameplay.

B10.1 PLATFORM overhead world -> New Game / play -> launches into overhead play. CAPTURE [GamePlay].
B10.2 ARENA overhead world -> launches into the arena/versus setup then play (you can start 1P from
      the window by mouse; multi-player fighting is [SKIP - controller]). CAPTURE [GamePlay].
B10.3 SPEED RUN overhead world -> launches straight to 1P play, NO setup window. CAPTURE [GamePlay].
      *** SPEED RUNNER MODE IS UNDER ACTIVE REDESIGN. *** Do a LAUNCH-ONLY smoke. Do NOT file bugs on
      the run timer (start-before-move / runs-past-finish are KNOWN and being reworked). Just confirm
      it launches without a crash.

    B10.1 Platform launches ....... PASS/FAIL  [GamePlay]: <paste>
    B10.2 Arena launches .......... PASS/FAIL  [GamePlay]: <paste>
    B10.3 Speed Run launches (1P) . PASS/FAIL  [GamePlay]: <paste>  (launch-only; no timer bugs)

===================================================================================================
## B11 - General regression sweep
===================================================================================================
B11.1 Click through the dashboard: Normal / Platformer / Speed Runner / Arena / Campaign / Sandbox
      cards all open their screens without a console error (online mode).
B11.2 Create a new game in a slot, start it, exit back to the dashboard cleanly (no stuck state).
B11.3 Note the total count of red console errors seen across the WHOLE run (ideally 0).

    B11.1 all dashboard cards open ....... PASS/FAIL
    B11.2 create/start/exit a game ....... PASS/FAIL
    B11.3 console error count ............ NOTE: <n> errors

===================================================================================================
## Wrap-up
===================================================================================================
- Summarize PASS/FAIL counts.
- List the single most important thing that looked WRONG (if any), with the character/world used.
- Reminder: controller items are Kevin's separate pass - do not test pads here.
