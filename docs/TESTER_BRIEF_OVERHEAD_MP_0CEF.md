# TESTER BRIEF - Overhead Multiplayer, foundation 0c-0f (build 402)

Plain ASCII (relay-safe). Supersedes the 397 brief. Notation: ">=" at least, "->" then.

UPDATES since the 401 run (thanks for the findings):
- Item 5 EDGE-HOLD is now implemented (build 402): a straggler no longer walks off-screen at the
  zoom floor; they are HELD at the screen edge, and the auto-zoom no longer bottoms out at 0.35
  (capped at max(MIN_ZOOM, base*0.5)) so a heavy world stays readable. RE-CHECK item 5.
- Item 3 padless: the console override now has an E-trigger recipe (see item 3) + the config key.
- Item 4 was fine: respawn IS at the player's own spawn - your (13,7) was the pGp override still
  driving P2 AFTER it respawned. Clear the override before reading the respawn position.
- Pull the latest: `git pull` on overhead-mp-0f, hard-reload, confirm badge build 402.

## Why a new build

Build 397 (what you tested) did NOT render players 2-4 at all - the "draw all players" fix
landed in build 398. So on 397, launching 4 players gives players.length 4 but only P1 is
visible. This build (402, branch `overhead-mp-0f`) has that fix PLUS the rest of the foundation:
per-player pipes/portals, per-player death/respawn, and mobs that chase the nearest player.

## Setup (branch changed)

1. git checkout overhead-mp-0f
2. npm run static  -> http://localhost:8000
3. HARD RELOAD to beat the stale bundle (the page served 391 last time while the server was on
   397). Confirm the badge: console `GAME_VERSION.match(/build \d+/)[0]` -> "build 402". If it is
   lower, cache-bust again (Ctrl-Shift-R / clear the SW) before doing anything.

## READ THIS FIRST - the blocker from last run

The whole 397 run was invalid because the Chrome window was MINIMIZED: visibilityState hidden,
rAF ~0.2-1 fps, game._elapsed stuck at 0, the sim never advanced. Nothing timing-dependent can be
trusted in that state (this is the frozen-tab trap, section 0 of your HANDOFF).

Before ANY item: run your frame-advance self-check. The window must be VISIBLE and FOREGROUND.
Confirm `document.visibilityState === 'visible'` AND that `window.game._frame` (or game._elapsed)
is INCREASING across ~1 second. If it is not, stop and fix the window - do not measure.

Also: "no [STALL] lines" is NOT evidence of smoothness. Build 393 deliberately suppresses stall
logging while the tab is unfocused (exactly the minimized case). A [STALL] result only means
anything with the window focused.

## Controllers

P1 = keyboard/mouse. P2-P4 = gamepads only. Most of this is verifiable with ZERO pads (drive a
secondary via the console override shown per item). To use real pads: press a button on each with
the window focused so it enumerates; if a Chrome instance won't enumerate, switch instances.

## Where the spawn tool is (cost time last run)

"Player Spawns (1-4)" is NOT a top-level rail group. It lives inside the BUILDINGS group flyout
(the 🚩 entry). Selecting it sets `OH_EDITOR.tool === "spawn"`. Place 2-4 spawns; the 5th click is
refused; click a marker to remove it.

## Build the fixture

Make a NEW overhead world. IMPORTANT for item 5: make it BIG (so players can spread beyond one
screen) - e.g. density 4 and a large size, or a wide flat arena. Paint mostly open ground. Drop
2-4 player spawns spread out. Add: a pit (for the death test), two linked pipes (for the pipe
test), a couple of mobs. Place a Goal Star.

## PART A - do item 5 FIRST (headline, zero pads needed), then the rest

### 5. Shared auto-fit camera  (was BLOCKED; do this first, needs the window VISIBLE)
The camera only zooms OUT once the group is too spread to fit at the world's base zoom. At base
zoom Z the visible width is 800/Z px; last run base was 0.558 -> ~1434 px, and the spread only
reached ~1410, so it correctly did nothing. You must spread FARTHER than that.
Steps (zero pads): Test the big world with 2 players. Move P1 (keyboard) far from the idle P2, OR
console-drive P2 away:
    window.game.input.pGp = (i) => i===1 ? {moveX:1,moveY:0,aimX:0,aimY:0} : {moveX:0,moveY:0,aimX:0,aimY:0};
Let the REAL loop run (window visible) until the two are well over one screen apart.
Expected: `window.game.grid.masterZoom` DROPS below its start value as they separate and RISES
back as they regroup (never above the base). The camera centres on the group midpoint; a player
who would leave the screen is HELD at the edge (FIXED in 402 - re-check this specifically). It is ONE shared view (not split-screen).
JUDGEMENT CALLS (need eyes): zoom smooth or jittery? Is the max zoom-out enough or do players get
too tiny? Does the edge-hold read clearly? Report `masterZoom` start vs most-zoomed-out value.

### 1. All players RENDER (the 398 fix - 397 could not show this)
Launch 2-4 players. Expected: you SEE every player figure at its spawn, each drawn/animated. (On
397 only P1 was visible; confirm that's fixed here.)

### 2. Per-player movement
P1 WASD/arrows + mouse; P2-P4 left stick move, right stick aim, A jump. Each moves independently.
Zero pads: the pGp override above moves only P2; P1/P3/P4 stay at 0 (you saw +704/0/0/0 on 397 -
re-confirm here with the window visible so it's the real loop, not 200 manual _update() calls).

### 3. Pipes/portals - EVERY player uses them, + the travel toggle
Link two pipes (select a pipe -> its dialog -> Teleport destination).
PADLESS RECIPE for a secondary player's own E-press (this was your blocker - the pGp override only
carries move/aim; E is a just-pressed button, name "context"/RB):
    window.game.input.pJustDown = (i, btn) => (i === 1 && btn === 'context');   // P2 presses E
Stand P2 at a pipe mouth (move it there with the pGp override, then null the override), then
install the pJustDown override above -> P2 travels on its own E. (Reset both with a reload.)
THE PULL-ALL CONFIG KEY is `config.groupTravel` on the pipe/portal building. Set it via the editor
(select the pipe with the Hand tool -> dialog -> "Pull ALL nearby players through together"), or
padless from the console:
    window.game.buildings.find(b => b.typeId === 'pipe').config.groupTravel = true;
Expected: with groupTravel ON, when one player uses the pipe every OTHER player near that mouth is
pulled through too (Mario-3D-World). OFF (default) = only the user travels. Also confirm one player
using a pipe does NOT freeze the others (the old bug - you already saw P4's hp change mid-transit).

### 4. Per-player death + respawn (co-op)
With 2+ players, walk ONE into the deadly pit (set Pit blocks = deadly in settings). Expected:
that player bursts and RESPAWNS at its own spawn after ~1 s while the others keep playing - the
match does NOT freeze or end. (Single-player still ends the game on death - unchanged.)

### 6. Mobs target the nearest player
With 2 players and a mob, stand P1 close and P2 far: the mob chases P1. Move P2 closer than P1:
the mob switches to P2. Contact damage / bolts hit whoever is nearest.

## NOT YET - do NOT log as bugs

- P2-P4 do NOT fight yet: only P1 fires/melees. Per-player COMBAT is the next step (the E-action,
  pipes, death and mob-targeting ARE per-player; weapons are not).
- No co-op/versus rules, scores, lives, or team logic yet (modes phase). The goal ends the level
  when ANY player reaches it (co-op default).

## Report template

    OVERHEAD MP 401 - <date>, Chrome <ver>, badge <...>, window visible? Y/N, frames advancing? Y/N, pads <n>

    5 shared camera .......... PASS/FAIL/NOTE - masterZoom start ? -> min ?; smooth? max-out? edge-hold?
    1 all players render ..... ...
    2 per-player movement .... ...
    3 pipes for all + toggle . ...
    4 per-player death/respawn ...
    6 mobs target nearest .... ...
    console errors ........... <n>
    [STALL] (only if focused). <verbatim or none>

    OVERALL: <...>
