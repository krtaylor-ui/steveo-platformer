# TESTER BRIEF - Overnight build (build 421) - run the WHOLE plan without stopping

Plain ASCII (relay-safe). Branch `overhead-play-modes`. Notation: ">=" at least, "->" then.
This covers six overnight items O1-O6. Do every part in order; log PASS / FAIL / NOTE per line and
capture the asked-for values. Do NOT stop on a failure - note it and continue.

## Setup (once)
1. git checkout overhead-play-modes ; git pull
2. npm run static -> http://localhost:8000
3. HARD RELOAD. Confirm badge: console `GAME_VERSION.match(/build \d+/)[0]` -> "build 421".
   If lower, cache-bust again (Ctrl-Shift-R / clear the SW) before testing.
4. Keep the console OPEN the whole run (some checks read a console line / value).
5. Controllers: press a button on each pad, window focused, so Chrome enumerates them. Most parts
   are doable with 1-2 pads; where 4 are needed it is called out.

Notation for capture: "[GamePlay] line" = the engine-dispatch line printed at every play launch.

===================================================================================================
## O1 - Overhead controllers work in real play  (was DEAD; this is the headline fix)
===================================================================================================
Context: overhead games launched but gamepads did nothing (showed Connected, no movement). Fixed.

O1.1 Launch an overhead ARENA or PLATFORM game (see O2 for how) with 2+ players, at least one on a
     real gamepad. Confirm that pad MOVES its player, aims, and fires/melees in the overhead world.
O1.2 With 2 pads, confirm EACH pad drives its OWN player independently (P2 pad moves P2, not P1).
O1.3 Keyboard P1 still works alongside pads.
CAPTURE: number of pads used; did every assigned pad control its player? Y/N.

    O1.1 pad drives player in overhead ..... PASS/FAIL
    O1.2 each pad -> its own player ......... PASS/FAIL
    O1.3 keyboard P1 alongside pads ........ PASS/FAIL

===================================================================================================
## O2 - Pre-game settings window (per mode)  [DOM - browser-only]
===================================================================================================
Context: Speed Run wrongly showed a setup modal + spawned 4 players; the modal looked foreign. Now:
Speed Run = 1 player, NO window; Platform = co-op window (1-4); Arena = window (2-4 + versus).
The window uses per-player PANELS navigated by each player's OWN controller (D-pad move, A or
left/right change); P1 also sets the match options + START. Mouse works too.

First, tag worlds by mode (Sandbox -> overhead world card -> Mode dropdown, or the editor toolbar):
have one overhead world set to Platform, one to Speed Run, one to Arena. (New Game picks worlds up by
mode: Dashboard -> Platformer / Speed Runner -> New Game; Arena -> Arena picker.)

O2.1 SPEED RUN: launch a Speed Run overhead world. Expected: NO settings window, it goes straight
     into play as ONE player (not 4). CAPTURE the [GamePlay] line.
O2.2 PLATFORM: New Game from a Platform overhead world. Expected: the settings window appears; a
     Players field lets you pick 1-4 (co-op).
O2.3 ARENA: play an Arena overhead world. Expected: the window appears with 2-4 players AND match
     options (Match: Deathmatch / Last-Standing, Teams On/Off, Kill target).
O2.4 D-PAD NAV: with a pad on P2, use its D-pad to move the highlight in P2's panel and A / left-right
     to change values. Confirm P2's pad ONLY edits P2's panel (cannot move P1's or the global fields).
O2.5 P1 controls the global options + can START (P1 pad Start button, or focus START + A, or click).
O2.6 Look/feel: does the window read like the rest of the game menus (not a foreign popup)? NOTE.

    O2.1 Speed Run = 1P, no window ......... PASS/FAIL  [GamePlay]: <paste>
    O2.2 Platform co-op window (1-4) ....... PASS/FAIL
    O2.3 Arena window (2-4 + versus) ....... PASS/FAIL
    O2.4 pad edits only its own panel ...... PASS/FAIL
    O2.5 P1 sets global + starts ........... PASS/FAIL
    O2.6 matches the menu look ............. NOTE: <...>

===================================================================================================
## O3 - Per-player appearance (Boy/Girl + colours), BOTH engines
===================================================================================================
Context: players can pick Character (Boy/Girl) + Skin / Hair / Shirt / Pants colour; defaults are
distinct per player (P1 classic blue, P2 red, P3 green, P4 yellow). Teams -> shirt = team colour,
everything else stays the player's own.

O3.1 OVERHEAD: in the O2 settings window, change P2's Shirt + Character (Boy/Girl) + Hair. Start and
     confirm P2 in the world shows those colours + the girl/boy silhouette (girl = longer hair).
O3.2 OVERHEAD defaults: with no changes, P1/P2/P3/P4 are visibly different colours.
O3.3 TEAMS (Arena, Teams On): confirm same-team players share the SHIRT colour but keep their own
     hair/skin/pants.
O3.4 2D: start a 2D multiplayer game (e.g. 2D Arena) with 2+ players; confirm each 2D player sprite
     shows its own colours (P1 classic, others distinct) and Boy/Girl (ponytail on girl).
O3.5 SINGLE PLAYER unchanged: a normal 1P 2D game still shows the classic Steve (blue) look.

    O3.1 overhead per-player look applies .. PASS/FAIL
    O3.2 overhead distinct defaults ........ PASS/FAIL
    O3.3 teams share shirt, keep rest ...... PASS/FAIL
    O3.4 2D per-player look applies ........ PASS/FAIL
    O3.5 single-player look unchanged ...... PASS/FAIL

===================================================================================================
## O4 - Glass tubes in OVERHEAD (new)
===================================================================================================
Context: a new "Glass Tube" building - a point-to-point transport that FLIES the player along a
visible glass tube. Works for all players, in co-op AND arena.

O4.1 EDITOR: open an overhead world, find "tube" / "Glass Tube" in the buildings palette, place TWO.
     Select one (Hand tool) -> its settings -> set Teleport destination to the other (Two-way if you
     like). Save.
O4.2 PLAY: walk a player onto one tube mouth and press E. Expected: the player FLIES along a visible
     translucent tube to the other end and arrives.
O4.3 ALL PLAYERS: with 2+ players (arena or co-op), confirm P2 (and P3/P4) can each use the tube;
     two players can be flying at the same time.
O4.4 GROUP TRAVEL (optional): set the tube's "Pull ALL nearby players" option; confirm using it pulls
     nearby players through together.
O4.5 ARENA: confirm tubes work inside an Arena match.

    O4.1 place + link tubes in editor ...... PASS/FAIL
    O4.2 fly-through visual + arrival ....... PASS/FAIL
    O4.3 all players can use them .......... PASS/FAIL
    O4.4 group-travel pull (if tested) ..... PASS/FAIL/NA
    O4.5 works in Arena ................... PASS/FAIL

===================================================================================================
## O5 - 2D glass / travel tubes usable by ALL players (was P1-only)
===================================================================================================
O5.1 In a 2D world (arena / 2-player) with a Travel Tube, confirm P2 (and P3/P4) can enter and fly
     through it, not just P1. Two players flying at once should both render inside the glass.

    O5.1 2D tube works for P2-P4 .......... PASS/FAIL

===================================================================================================
## O6 - 2D sandbox Chest: palette tabs + remove
===================================================================================================
Context: the chest's tab bar was stale (a broken empty "Nether" tab) and the tabs selected the wrong
palette. Now the chest tabs match the main palette: World / Decor / Plumbing / Gear / Other.

O6.1 In 2D SANDBOX, place a Chest, open it (E). Confirm the tab row reads World, Decor, Plumbing,
     Gear, Other - and clicking each tab shows the CORRECT items for that tab (no empty tab).
O6.2 Select an item from a tab -> click a chest slot -> it is placed in the chest.
O6.3 REMOVE: right-click a filled chest slot -> it clears. (The hint line under the slots says so.)

    O6.1 correct tabs + right items ....... PASS/FAIL
    O6.2 place item into chest ............ PASS/FAIL
    O6.3 right-click removes from chest ... PASS/FAIL

===================================================================================================
## Report footer
===================================================================================================
    OVERNIGHT 421 - <date>, Chrome <ver>, badge <...>, pads <n>, console open? Y/N
    console errors (total) ................ <n>
    Biggest issues (ranked) .............. <...>
    OVERALL ............................. <...>

Notes for the dev (known / by design):
- Per-player CONTROL TYPE / stick sensitivity in the settings window was deferred (colours first);
  sensitivity + deadzone are still tunable in the in-game Esc pause panel.
- Glass tubes (overhead) are a straight segment between the two linked endpoints (not a drawn multi-
  bend path) in this version.
