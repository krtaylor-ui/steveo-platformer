# TESTER BRIEF - Overhead PLAY path (build 412)

Plain ASCII (relay-safe). Branch `overhead-play-modes`. Notation: ">=" at least, "->" then.

Two things to verify: (A) a reported BUG - an overhead world launched as a 2D world - now hardened,
please try to reproduce + confirm fixed; (B) the new play-mode picker on the Sandbox card.

## Setup
1. git checkout overhead-play-modes ; git pull
2. npm run static -> http://localhost:8000
3. HARD RELOAD. Confirm badge: console `GAME_VERSION.match(/build \d+/)[0]` -> "build 412".
   If lower, cache-bust again (Ctrl-Shift-R / clear the SW). A stale bundle is itself a suspect for
   bug A (see A4), so getting to a clean 412 first matters.
4. Open the browser console and KEEP IT OPEN for the whole run - bug A is diagnosed from a console
   line this build prints on every launch.

## Background - what changed

- The play path now chooses the engine by the world's view. A [GamePlay] line is printed at every
  launch:  `[GamePlay] engine dispatch -> OVERHEAD (mode platformer, viewMode overhead, mapSnapshot true)`
  or `... -> side-scroll (...)`. That line is the single most important thing to capture.
- Overhead worlds are now detected by viewMode OR by having a mapSnapshot (overhead worlds always do;
  2D worlds never do), so even a world whose viewMode got dropped should still route to the overhead
  engine now.

## PART A - the "overhead world plays as 2D" bug

### A1. Tag an overhead world as Platform (needed before it appears under Platformer)
In Sandbox, find an OVERHEAD world (use the Overhead view filter). On its CARD there is now a
"Mode:" dropdown (see Part B). Set it to "Platform". (If you prefer, open the world in the editor and
set Mode -> Platform in the top toolbar, then Save - either path works.)

### A2. Create + play a game from it
Dashboard -> Platformer -> New Game -> in the world dropdown pick the overhead world you just tagged
-> create -> Play/Start.

### A3. What to expect + capture
EXPECTED (fixed): it launches into the overhead controller-setup screen, then a TOP-DOWN world.
Capture the console line regardless of outcome:
  - the `[GamePlay] engine dispatch -> ...` line VERBATIM (this tells us OVERHEAD vs side-scroll and
    what viewMode / mapSnapshot it saw).
If it STILL shows a 2D world, that line will say `-> side-scroll`. Copy it and also run in console:
    window.game && window.game.constructor && window.game.constructor.name
    // "OverheadGame" = overhead engine; "Game" = the 2D engine
and report both.

### A4. Rule out the stale-bundle trap
This bug can be caused purely by a cached OLD `game-play.js` (from before the engine dispatch existed)
even while the page looks current. Confirm you are truly on 412 (step 3), and additionally run:
    performance.getEntriesByType('resource').filter(r=>r.name.includes('game-play.js')).map(r=>r.name)
Report the version query string you see (e.g. `game-play.js?v=b412`). If it says an older `v=bNNN`,
the served bundle is stale - hard-reload / clear the SW and retry before logging a code bug.

### A5. Second path - a game created BEFORE this build
If you have an EXISTING Platformer game slot that was created from an overhead world on an older build,
open it too and capture the same `[GamePlay]` line. (Older records may lack viewMode; the mapSnapshot
fallback should still route them to overhead - this is the case we most want confirmed.)

## PART B - play-mode picker on the Sandbox card

### B1. The dropdown exists on overhead cards
Sandbox -> Overhead view filter. Each overhead world CARD now shows a "Mode:" dropdown with
Platform / Speed Run / Arena (previously overhead cards had NO mode dropdown - you had to open the
editor). Confirm it is there and shows the world's current mode.

### B2. Changing it sticks
Set a card to "Speed Run". Expected: the card's mode badge updates in place (no full reload needed).
Reload the Sandbox screen -> the world still reads Speed Run (persisted server-side). Then set it back
to "Platform" and confirm it persists again.

### B3. It drives discovery
After setting a world to "Speed Run" on its card, go Dashboard -> Speed Runner -> New Game: that world
should now appear in the world dropdown. Set it to "Platform" -> it appears under Platformer instead.
(Arena worlds do NOT appear in these New Game lists - Arena has its own picker, coming next phase.)

## Report template

    OVERHEAD PLAY 412 - <date>, Chrome <ver>, badge <...>, console open? Y/N

    A2/A3 overhead world plays as OVERHEAD .. PASS/FAIL
        [GamePlay] line: <paste verbatim>
        window.game.constructor.name: <OverheadGame / Game>
    A4 served game-play.js version ......... <e.g. b412>
    A5 older-record game (if any) .......... PASS/FAIL + [GamePlay] line
    B1 card mode dropdown present .......... PASS/FAIL
    B2 change persists (reload) ........... PASS/FAIL
    B3 drives New Game discovery .......... PASS/FAIL
    console errors ........................ <n>

    OVERALL: <...>
