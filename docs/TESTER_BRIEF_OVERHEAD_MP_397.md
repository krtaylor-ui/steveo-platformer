# TESTER BRIEF - Overhead Multiplayer, FIRST cut (build 397)

Plain ASCII on purpose (relay-safe): no smart quotes, arrows, em-dashes, box-drawing, emoji.
Notation: ">=" at least, "->" then/leads to.

## What this is (and is NOT)

This is the FOUNDATION milestone of overhead-view local multiplayer: 2-4 players move around one
shared world with a shared auto-fit camera. It is deliberately THIN. Verify the foundation feel;
do NOT flag the not-yet-built parts as bugs (they are listed below).

NOT deployed. It lives on the branch `overhead-multiplayer`, NOT on main/Railway. Test locally.

## Setup

1. Check out the branch and serve the client:
       git checkout overhead-multiplayer
       npm run static        # -> http://localhost:8000
   Open http://localhost:8000 in Chrome with DevTools console open.
2. Confirm the build: the version badge must read "v3 build 397" (or higher). Console:
       GAME_VERSION.match(/build \d+/)[0]     // -> "build 397"
   If lower, you are on the wrong branch/build - fix the checkout.

## Controllers (read first - this cost hours last time)

- P1 = keyboard + mouse. P2, P3, P4 = GAMEPADS only (there is no second-keyboard mapping in the
  overhead engine yet). So to control P2-P4 you need controllers.
- The Gamepad API only exposes a pad AFTER you press a button on it, and only to the FOCUSED page.
  So "0 pads" is not a hardware fault - press A on each pad with the game window focused.
- If pads will not enumerate in one Chrome instance even with everything focused, switch to a
  different Chrome instance (this was note #17 from the last session).
- NO CONTROLLERS? You can still verify most of this build without pads - see "Without controllers"
  under each item. A single pad is enough to verify 2-player.

## Build the fixture

In Sandbox, make (or open) a NEW OVERHEAD world in the editor. Paint a simple OPEN area (mostly
flat grass, room to roam), then use the "Player Spawns (1-4)" tool to drop spawn markers:
- Click empty cells to add spawns P1, P2, P3, P4 (up to 4). Each shows a labelled marker.
- Click an existing spawn marker to REMOVE it.
- Spread the spawns out (e.g. opposite corners) so the camera framing is exercised.
Place a Goal Star and a couple of mobs/items too (for later phases; harmless now).

## IN SCOPE - verify these

### 1. Single-player is unchanged (regression)
Place exactly ONE spawn (or a world with one). Test. Play + return to editor + edit.
Expected: overhead single-player plays and edits exactly as on main. Nothing shifted. (This is
the thing the refactor could have broken.)

### 2. Multi-spawn tool
Place 2, then 3, then 4 spawns; remove one; re-add.
Expected: markers labelled P1..P4 by order; a flash tells you the count ("Test launches N
players"); clicking a marker removes it; max 4.

### 3. Launch N players
With 2-4 spawns placed, hit Test.
Expected: that many player figures appear, each at its spawn. No console errors on launch.
Console check: `window.game.players.length` == your spawn count; `window.game.activePlayers().length` same.

### 4. Per-player movement (needs pads for P2-P4)
Move each player with its own input: P1 WASD/arrows + mouse-aim; P2-P4 left stick move, right
stick aim, A jump.
Expected: each player moves/aims/jumps INDEPENDENTLY - P2 moving does not move P1, etc.
Without controllers: drive P2 from the console to prove independence -
       window.game.input.pGp = (i) => i===1 ? {moveX:1,moveY:0,aimX:0,aimY:0} : {moveX:0,moveY:0,aimX:0,aimY:0};
   then watch P2 walk right on its own while P1 stands still. Reset with a page reload.

### 5. Shared auto-fit camera (the headline)
With 2+ players, move them APART, then back together.
Expected: as players separate, the view ZOOMS OUT to keep everyone on screen and centres on the
group midpoint; a player who would go off-screen is HELD at the screen edge (not scrolled past);
as they regroup, the view zooms back IN (never past the world's normal zoom). It is ONE shared
view - NOT split-screen.
Without controllers: this is still testable with ZERO pads - just move P1 (keyboard) far away
from the idle P2 marker and watch the camera zoom out to keep both framed, then walk back and
watch it zoom in.
Console check: `window.game.grid.masterZoom` drops below its start value as players spread, rises
back as they regroup.
JUDGEMENT CALLS to report: does the zoom feel smooth or jittery? Is the max zoom-out enough on a
big spread, or do players get uncomfortably tiny? Does the edge-hold read clearly?

## NOT YET - do NOT log these as bugs (they are the next phases)

- P2-P4 do NOT fight yet. Only P1 attacks / fires / uses pipes+portals / triggers levers + the
  goal. (Combat + per-player pipes are the next phases 0c and the combat pass.)
- Secondary players (P2-P4) cannot die yet. They are blocked out of pits/walls like a mob instead
  of falling. That is intentional for now (per-player death = phase 0e).
- Mobs target P1 only for now (phase 0f makes them target the nearest player).
- No co-op/versus rules, scores, lives, or win-for-the-group yet (that is the modes phase). The
  goal still ends the level when P1 reaches it.

## Freeze watch (carry over from the arena work)

The between-frames stall detector is in this build too. If anything hitches, check the console for
a `[STALL]` line (culprit OUR CODE vs EXTERNAL, with mobs/arrows/players/phase). Report it verbatim.

## Report template (fill at the end)

    OVERHEAD MP 397 - <date>, Chrome <version>, build badge: <...>, pads: <n registered>

    1 single-player regression ...... PASS/FAIL/NOTE - <obs>
    2 multi-spawn tool .............. ...
    3 launch N players .............. ...   (players.length seen: ?)
    4 per-player movement ........... ...   (pads used? console-driven?)
    5 shared auto-fit camera ........ ...   (zoom smooth? max-out enough? edge-hold clear?)
    console errors during play ...... <count>
    any [STALL] lines ............... <verbatim or none>

    OVERALL: <foundation feels good / needs work> - <one sentence>
