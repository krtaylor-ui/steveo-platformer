# TESTER BRIEF - Custom Sprites Phase 1 (build 428)

Plain ASCII (relay-safe). Branch `custom-sprites`. Notation: ">=" at least, "->" then.
Goal: 16 pickable characters (astronaut, knight, alien, cat, robot, wizard, ...) render in BOTH the
side-scroll and overhead engines with their accessories + colours, and every existing animation still
plays. Characters are cosmetic only - they never change how the game plays (same hitbox).

## Setup
1. git checkout custom-sprites ; git pull
2. npm run static -> http://localhost:8000
3. HARD RELOAD. Confirm badge build 428 (console GAME_VERSION.match(/build \d+/)[0]).
4. The full roster: Classic, Astronaut, Knight, Ranger, Super, Ninja, Zib (alien), Bolt (robot),
   Whiskers (cat), Ember Fox, Rex (dino), Bruin (bear), Wizard, Corsair (pirate), Scout, Buzz (bee).

## Where you pick a character
- On EVERY Sandbox world card there is now a "Character:" dropdown (next to "Mode:"). Pick one and it
  persists on the world (reload the Sandbox screen to confirm it stuck).
- OVERHEAD play also lets you pick in the pre-game settings window (P1's "Character" field), which
  applies to that session.

## PART A - OVERHEAD
A1 Take an OVERHEAD world, set its card Character to "Astronaut", Save/confirm. Play it (Dashboard ->
   Platformer/Speed Runner -> New Game -> that world, or Arena via the arena picker).
A2 In the overhead pre-game window (Platform/Arena), the global "Character" field cycles the roster;
   the per-player field is now "Body" (Boy/Girl). Confirm both work.
A3 In play, confirm the character's accessories render top-down and correctly (per earlier feedback):
   ears/antennae centred on the head, hats as rings from above, snout on the FORWARD edge (no eyes),
   dome/cape/tail where expected. The head faces the walking direction.
A4 ANIMATIONS: with the accessorized character, confirm these still play and the accessories move with
   the body: walk, jump, DOUBLE JUMP (spin/somersault), PIPE/TUBE crawl (glass tube), grapple, melee.
A5 COLOURS: recolour the player (skin/hair/shirt/pants) - the character keeps its shape, new colours.
   In multiplayer, each player is still offered colour (always).

## PART B - SIDE-SCROLL
B1 Take a 2D (side-scroll) world, set its card Character to e.g. "Knight" (or Cat / Wizard). Create a
   game from it (Dashboard -> Platformer -> New Game -> that world) and play.
B2 Confirm the side sprite shows the character: accessories on the head (ears/hat/helm/antennae),
   behind-body items (cape/tail/backpack) sit BEHIND the body (the far arm should NOT show through the
   torso), and hand items (knight shield / wizard staff) render.
B3 ANIMATIONS on the accessorized 2D character: walk, jump, DOUBLE JUMP (air-roll/spin), EDGE/LEDGE
   CLIMB, LADDER climb, crouch, slide/wall-slide, melee - all still play; accessories follow.
B4 Judgement call (needs your eyes): does the side character read clearly at the sprite's small size?
   Note any accessory that's hard to make out or sits wrong.

## PART C - REGRESSION (must be unchanged)
C1 A world left on "Classic" looks EXACTLY like the current Steve/Alex (no accessories) in both
   engines - single-player included.
C2 Team play (Arena teams): same-team players still share the shirt/team colour; character shape is
   the same for all, colours distinguish them.
C3 Nothing else broke: the O1-O8 overhead play modes, glass tubes, chest, speed-run timer still work.

## Report template
    CUSTOM SPRITES 428 - <date>, Chrome <ver>, badge <...>, pads <n>

    A1 overhead card Character picker .... PASS/FAIL
    A2 pre-game Character + Body fields .. PASS/FAIL
    A3 overhead accessories render right . PASS/FAIL + notes
    A4 overhead animations play ......... PASS/FAIL (walk/jump/double/tube/grapple/melee)
    A5 recolour + MP colour ............. PASS/FAIL
    B1 side card Character picker ....... PASS/FAIL
    B2 side accessories + z-order ....... PASS/FAIL + notes
    B3 side animations play ............. PASS/FAIL (walk/jump/double/edge-climb/ladder/crouch/melee)
    B4 side legibility .................. NOTE
    C1 classic unchanged (both engines) . PASS/FAIL
    C2 teams colour ..................... PASS/FAIL
    C3 no regressions (O1-O8) .......... PASS/FAIL
    console errors ..................... <n>

    OVERALL: <...>

Notes for the dev (known / by design):
- Character is ONE per world in v1 (per-player rosters + a parts-mixer = Phase 2).
- Accessories are cosmetic ONLY - the hitbox never changes (verified in tests).
- Side rendering was headless-untestable (player.js), so B1-B4 are the key browser checks.
