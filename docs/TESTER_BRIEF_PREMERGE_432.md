# TESTER BRIEF - PRE-MERGE regression + controller pass (build 432)

Plain ASCII. Branch `custom-sprites` (56 commits ahead of main). This is the gate before merging the
whole stack to main: overhead multiplayer + versus, the play modes (Platform/Speed Run/Arena), glass
tubes, chest fixes, Speed Run timer, in-app modals, and Custom Sprites Phase 1. Goal: (A) confirm the
CONTROLLER path once on real pads (never hardware-verified), and (B) a fast regression smoke that
nothing in the stack is broken. Notation: ">=" at least, "->" then.

## Setup
1. git checkout custom-sprites ; git pull   (badge build 432)
2. npm run static -> http://localhost:8000 ; if /api 404s, restart the API server too.
3. HARD RELOAD; keep the console open.

## PART A - CONTROLLERS (the real gate; needs >=1 real gamepad)
A1 Overhead real play drives with a pad: launch an overhead world (any mode), assign a pad to P1 in
   the pre-game window / controller setup; confirm the pad MOVES, aims, and fires/melees. (This was
   the O1 fix - "Connected but nothing worked" - never verified on hardware.)
A2 Multi-pad: with 2 pads, P2's pad drives P2 only; P1 keyboard still works alongside.
A3 Overhead ARENA versus on pads: 2 players, Deathmatch; confirm both players fight on their own pads
   and a kill/last-standing ends the match.
A4 Modal dismiss by pad (D4 from the 431 brief): open any confirm (e.g. Delete a game) and a prompt
   (Rename a world); confirm A = OK, B = Cancel dismiss them, and the channel never froze.
A5 The pre-game settings window: each pad's D-pad edits ONLY its own player's panel; P1 owns the
   global options + Start.

    A1 pad drives overhead player ...... PASS/FAIL
    A2 per-pad -> own player ........... PASS/FAIL
    A3 arena versus on pads ........... PASS/FAIL
    A4 modal dismiss A/B .............. PASS/FAIL
    A5 D-pad per-player panels ........ PASS/FAIL

## PART B - REGRESSION SMOKE (keyboard/mouse OK; one pass each)
B1 Overhead PLATFORM: create + play a Platform overhead world -> reaches the goal / wins.
B2 Overhead SPEED RUN: play a Speed-Run overhead world -> timer idles until you move, starts on move,
   stops at the finish, shows a time + best.
B3 Overhead ARENA (no pads): launches into a top-down versus arena (not a 2D map).
B4 Glass tubes: overhead (place+link two, E glides through) AND 2D (a Travel Tube works for P2 as
   well as P1).
B5 Chest (2D sandbox): open with E, all palette tabs correct (World/Decor/Plumbing/Gear/Other),
   place + right-click-remove an item.
B6 Custom Sprites: a tagged character renders with accessories + colours in BOTH engines (overhead
   via pre-game window; 2D via a New Game from a tagged world); Classic is unchanged; teams share the
   shirt colour.
B7 Modals: alerts/confirms/prompts are all in-page (no native browser dialog anywhere).
B8 SINGLE-PLAYER / classic 2D platformer + normal play look and behave exactly as before.

    B1 platform win ......... PASS/FAIL      B5 chest tabs+remove .... PASS/FAIL
    B2 speed run timer ...... PASS/FAIL      B6 custom sprites both .. PASS/FAIL
    B3 arena top-down ....... PASS/FAIL      B7 modals in-page ....... PASS/FAIL
    B4 glass tubes both ..... PASS/FAIL      B8 single-player intact . PASS/FAIL

## Known / not blockers
- 2D double jump requires a DISCRETE second jump-press mid-air (after coyote time). A held or
  too-short input won't trigger it - this is by design (player.js air-jump edge), not a bug. Verify
  with a real mid-air re-tap if you like.
- D4 needs real pads (Part A). Everything else is keyboard/mouse verifiable.

## Report footer
    PRE-MERGE 432 - <date>, Chrome <ver>, badge <...>, pads <n>
    console errors ...... <n>
    OVERALL / merge-ready? ...... <yes/no + blockers>
