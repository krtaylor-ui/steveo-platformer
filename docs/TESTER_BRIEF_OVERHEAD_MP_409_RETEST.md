# TESTER BRIEF - Overhead Multiplayer RETEST (build 409)

Plain ASCII (relay-safe). Short follow-up to your excellent 408 run (all 13 PASS). This covers the
three fixes from your findings + the edges you flagged as not-yet-covered. Notation: ">=" at least,
"->" then. Branch `overhead-mp-0f`, badge should read build 409 (hard-reload; the stale guard is
present now, so a mismatch WILL banner this time).

## FIXED since 408 - please re-verify

### R1. Versus win screen shows the WINNER (was your D3 finding)
Both versus modes previously ended on the generic the co-op "Level Complete!" title even though the winner string
was computed. Now the end screen prints the actual result.
- Deathmatch to a low kill target -> end screen reads e.g. "P2 wins!".
- Deathmatch with Teams ON, team kills SUM to target -> end screen reads "Team 1 wins!" (this is
  also the team-sum win you listed as not-covered - please confirm both the SUM reaching target
  AND the "Team N wins!" string).
- Last-standing -> end screen reads e.g. "P3 wins!".
Co-op (versus OFF) still reads the co-op "Level Complete!" title.

### R2. Versus HUD no longer collides with the Designer button (was your D5 note)
In Test mode the per-player HUD now starts BELOW the the "Designer / God" button row. Confirm P1's
row is fully visible and no rows overlap the button or each other.

### R3. _out is false for living players (was your smaller note)
`window.game.players.map(p => p._out)` on a fresh launch is now `[false,false,...]`, not
`[undefined,...]`. Anything testing `=== false` reads right.

## The carry-over you nearly mis-reported - now explained
Your P2->P1 "no damage" was P1 already `_out:true`. On a FRESH launch every player starts
`_out:false` (R3), so a clean deathmatch launch will not have pre-eliminated players. The carry-over
you saw was from reconfiguring settings on a LIVE game object without re-launching - re-launch (new
Test) between mode changes and it is clean. Worth a quick confirm: launch deathmatch fresh ->
all `_out:false` -> cross-team fire DOES damage.

## Edges not covered in 408 - please hit these now
- Melee-only vs ranged-only isolation: confirm a MELEE kill credits + damages an enemy player
  independently of ranged (you only exercised bolts).
- Trident and boomerang PvP: you tested crossbow bolts only. Give a player the trident (RMB recall)
  and the boomerang and confirm each damages an enemy player in versus.
- Team-sum deathmatch win + "Team 1 wins!" - covered under R1 above.
- REAL HARDWARE: 0 pads registered last run. If any controllers are available, confirm P2-P4 stick
  move, right-stick aim, A-jump, and physical fire/melee actually drive combat + versus.

## Report template

    OVERHEAD MP 409 RETEST - <date>, Chrome <ver>, badge <...>, visible? Y/N, frames? Y/N, pads <n>

    R1 win screen winner string . PASS/FAIL - deathmatch "Px wins!" / teams "Team N wins!" / last-standing
    R2 HUD vs Designer button ... PASS/FAIL
    R3 _out false on fresh launch PASS/FAIL
    melee-only PvP .............. ...
    trident PvP ................. ...
    boomerang PvP .............. ...
    team-sum win + string ....... ...
    real hardware (if pads) ..... ...
    console errors .............. <n>
    stale-guard banner (if seen)  <yes/no - should appear on a real mismatch now>

    OVERALL: <...>
