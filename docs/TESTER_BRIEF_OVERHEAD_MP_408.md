# TESTER BRIEF - Overhead Multiplayer, FULL (build 408)

Plain ASCII (relay-safe). Supersedes the 403/0CEF brief. Notation: ">=" at least, "->" then.

This is the COMPLETE overhead multiplayer pass in one brief: co-op foundation (parts A/B),
per-player combat (part C), and the new VERSUS modes - Deathmatch + Last-standing (part D).
Everything is on branch `overhead-mp-0f`. Single-player and the tester's frozen build are
untouched.

## What is NEW since your 403 co-op run

- Per-player COMBAT: P2-P4 now fire and melee on their OWN inputs (403 only P1 fought). Ranged
  bolts/trident/boomerang and melee all come from the correct player.
- VERSUS modes (co-op is still the default; versus is opt-in in World Settings):
  - Deathmatch: players (or teams) score kills; first to the kill target WINS.
  - Last-standing: finite lives; last player (or team) standing WINS.
  - Teams on/off toggle (even index vs odd index: P1+P3 vs P2+P4).
  - Fixed whole-arena camera in versus (no auto-fit zoom - the whole map is framed).
  - No friendly fire: in co-op, and between same-team players in team versus.
- Versus HUD: a small top-left readout - per-player kills (deathmatch) or lives/OUT (last-standing).

## Setup

1. git checkout overhead-mp-0f ; git pull
2. npm run static  -> http://localhost:8000
3. HARD RELOAD. Confirm the badge: console `GAME_VERSION.match(/build \d+/)[0]` -> "build 408".
   If lower, cache-bust again (Ctrl-Shift-R / clear the SW). The stale-bundle guard shows a red
   banner if the served build differs from the running one - if you see it, hard-reload.

## READ FIRST - the frozen-tab trap

Keep the window VISIBLE and FOREGROUND. Before ANY item confirm `document.visibilityState ===
'visible'` AND that `window.game._frame` (or game._elapsed) INCREASES across ~1 second. If it does
not, fix the window first - a minimized/background tab throttles to ~0.2-1 fps and nothing
timing-dependent can be trusted. "No [STALL] lines" only means something with the window focused.

## Controllers

P1 = keyboard/mouse. P2-P4 = gamepads only. Most items are verifiable with ZERO pads via the
console overrides shown per item. Real pads: press a button on each with the window focused so it
enumerates.

Padless drive helpers (reset with a reload):
    // move only P2 to the right:
    window.game.input.pGp = (i) => i===1 ? {moveX:1,moveY:0,aimX:0,aimY:0} : {moveX:0,moveY:0,aimX:0,aimY:0};
    // make P2 press E (context) / fire (attack):
    window.game.input.pJustDown = (i, btn) => (i === 1 && btn === 'context');
    window.game.input.pAttack   = (i) => (i === 1);   // P2 holds fire

## Where the spawn tool is

"Player Spawns (1-4)" lives inside the BUILDINGS group flyout (the flag entry), NOT a top-level
rail group. Selecting it sets `OH_EDITOR.tool === "spawn"`. Place 2-4 spawns; the 5th click is
refused; click a marker to remove it. Test launches with numPlayers = spawn count.

## Build the fixture

New overhead world. Make it BIG for the camera test (density ~4, large size, mostly open ground).
Drop 2-4 spawns spread out. Add: a pit (death test), two linked pipes (pipe test), a couple of
mobs, a Goal Star. For versus (part D) an open arena with room to fight is best.

## PART A - shared auto-fit camera (co-op), do FIRST, zero pads

### A5. Shared auto-fit camera (co-op only)
The camera zooms OUT only once the group is too spread to fit at the world's base zoom. Spread the
players FARTHER than one screen (drive P2 away with the pGp helper, window visible, real loop).
Expected: `window.game.grid.masterZoom` DROPS as they separate and RISES back as they regroup
(never above base). ONE shared view (not split-screen). A player who would leave the screen is HELD
at the edge (do not let them walk off). Report `masterZoom` start vs most-zoomed-out; smooth or
jittery? players too tiny at max-out? edge-hold clear?

## PART B - co-op foundation

### B1. All players RENDER
Launch 2-4 players. You SEE every player figure at its spawn, each drawn/animated.

### B2. Per-player movement
P1 WASD/arrows + mouse; P2-P4 left stick move, right stick aim, A jump. Each moves independently.
Padless: the pGp helper moves only P2; P1/P3/P4 stay at 0.

### B3. Pipes/portals - EVERY player uses them + the travel toggle
Link two pipes (select a pipe -> dialog -> Teleport destination). Stand P2 at a mouth, install the
pJustDown helper -> P2 travels on its own E. The pull-all key is `config.groupTravel`; set it in
the editor (pipe dialog -> "Pull ALL nearby players through together") or padless:
    window.game.buildings.find(b => b.typeId === 'pipe').config.groupTravel = true;
Expected: groupTravel ON -> one player using the pipe pulls every OTHER nearby player through too
(Mario-3D-World). OFF (default) -> only the user travels. One player using a pipe does NOT freeze
the others.

### B4. Per-player death + respawn (co-op)
Walk ONE player into a deadly pit (Pit = deadly in settings). That player bursts and RESPAWNS at
its OWN spawn after ~1 s while the others keep playing - the match does NOT freeze or end.
(Single-player still ends on death - unchanged.) NOTE: clear any pGp override before reading the
respawn position, or the override keeps driving the respawned player.

### B6. Mobs target the nearest player
2 players + a mob: mob chases whoever is nearest; move the other closer -> the mob switches.
Contact damage / bolts hit whoever is nearest.

## PART C - per-player COMBAT (NEW)

### C1. Every player fires and melees on its own input
Give each player a ranged weapon and a melee weapon. Expected: P2-P4 fire/melee on THEIR OWN
buttons (P2-P4: fire button + melee button), not just P1. Padless for P2: `pAttack` helper above
(holds fire); melee for P2 via `pJustDown(i,'attack')`.
Expected: the projectile/melee originates from the acting player and aims along that player's aim.

### C2. Co-op = NO friendly fire
In co-op (versus OFF), one player's bolts/melee do NOT damage another player. Fire P1 across P2 ->
P2's hp is unchanged.

## PART D - VERSUS (NEW: Deathmatch + Last-standing)

Turn versus ON in World Settings -> group "Multiplayer (2-4 players)":
- Versus mode: Deathmatch OR Last-standing (Off = co-op).
- Teams: on/off (on = P1+P3 vs P2+P4).
- Kill target (deathmatch): first to this many kills wins.
- Lives count: per-player / shared-pool lives (last-standing forces finite lives).

Console shortcut to inspect: `window.game.settings.versusMode`, `.versusTeams`,
`.versusKillTarget`; per-player `window.game.players.map(p => [p._score, p._lives, p._out, p._team])`.

### D1. Fixed arena camera in versus
Start a versus match. The camera does NOT auto-fit/zoom to the group; it frames the WHOLE arena and
stays fixed. Spreading players apart does not change `masterZoom`.

### D2. PvP damage
Versus ON: one player's melee AND ranged (bolt/trident/boomerang) DO damage an enemy player.
Team versus: same-team players do NOT damage each other; opposite teams do.

### D3. Deathmatch scoring + win
Set Deathmatch, kill target e.g. 3, teams off. Have players kill each other. Each kill credits the
KILLER (`players[k]._score` goes up; check the top-left HUD kills). When a player reaches the target
the match ENDS with that player as winner (state 'won', a "P2 wins!" style notice). Team version:
the TEAM's kills SUM toward the target; "Team 1 wins!".

### D4. Last-standing win
Set Last-standing, small lives count (e.g. 1-2). Players who run out of lives are ELIMINATED (they
show OUT in the HUD, no respawn). When only ONE player (or one TEAM with a living member) remains,
the match ENDS with that player/team as winner.

### D5. Versus HUD
Top-left shows each player's kills (deathmatch) or lives/OUT (last-standing), team-tagged, and the
"first to N" target for deathmatch. Readable and correct?

## Report template

    OVERHEAD MP 408 - <date>, Chrome <ver>, badge <...>, window visible? Y/N, frames advancing? Y/N, pads <n>

    A5 shared camera ......... PASS/FAIL/NOTE - masterZoom start ? -> min ?; smooth? max-out? edge-hold?
    B1 all players render .... ...
    B2 per-player movement ... ...
    B3 pipes for all + toggle. ...
    B4 death/respawn (co-op) . ...
    B6 mobs target nearest ... ...
    C1 per-player combat ..... ...
    C2 no friendly fire ...... ...
    D1 fixed arena camera .... ...
    D2 PvP damage (+teams) ... ...
    D3 deathmatch score/win .. ...
    D4 last-standing win ..... ...
    D5 versus HUD ............ ...
    console errors ........... <n>
    [STALL] (only if focused). <verbatim or none>

    OVERALL: <...>
