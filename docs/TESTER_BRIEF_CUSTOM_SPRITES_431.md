# TESTER BRIEF - Custom Sprites Phase 1 (build 431)

Plain ASCII (relay-safe). Branch `custom-sprites`. Notation: ">=" at least, "->" then.
Goal: 16 pickable characters (astronaut, knight, alien, cat, robot, wizard, ...) render in BOTH the
side-scroll and overhead engines with their accessories + colours, and every existing animation still
plays. Characters are cosmetic only - they never change how the game plays (same hitbox).

## FIXED since the 428 run (re-pull to 430)
- A1 card Character picker now PERSISTS. The 404 you saw was a dedicated /character route missing on an
  un-restarted API server; it now saves through the long-standing full-world save (GET the world, merge
  characterId, PUT it back), so no server restart is needed. Set a card to Astronaut, reload Sandbox ->
  it sticks. Re-run A1.
- Native alert/confirm/prompt are GONE across the app (build 429): window.alert is overridden and every
  confirm()/prompt() (incl. every Delete path) is now an in-app modal. No native dialog should ever
  freeze the automation channel again. New Part D checks this.

## Setup
1. git checkout custom-sprites ; git pull   (must be at build 431)
2. npm run static -> http://localhost:8000   (if /api routes 404, restart the API server too)
3. HARD RELOAD. Confirm badge build 431 (console GAME_VERSION.match(/build \d+/)[0]).
4. The full roster: Classic, Astronaut, Knight, Ranger, Super, Ninja, Zib (alien), Bolt (robot),
   Whiskers (cat), Ember Fox, Rex (dino), Bruin (bear), Wizard, Corsair (pirate), Scout, Buzz (bee).

## Where you pick a character
- On EVERY Sandbox world card there is a "Character:" dropdown (next to "Mode:"). Pick one -> it saves
  to the world (a brief GET+PUT). Reload the Sandbox screen to confirm it stuck (this is A1).
- OVERHEAD play also lets you pick in the pre-game settings window (P1's "Character" field), applied to
  that session (this is A2 - already PASSED).

## PART A - OVERHEAD
A1 Take an OVERHEAD world, set its card Character to "Astronaut"; reload Sandbox and confirm it STUCK.
   Then play it (Dashboard -> Platformer/Speed Runner -> New Game -> that world, or Arena picker).
A2 In the overhead pre-game window (Platform/Arena), the global "Character" field cycles the roster;
   the per-player field is now "Body" (Boy/Girl). Confirm both work.
A3 In play, confirm the character's accessories render top-down and correctly (per earlier feedback):
   ears/antennae centred on the head, hats as rings from above, snout on the FORWARD edge (no eyes),
   dome/cape/tail where expected. The head faces the walking direction.
A4 ANIMATIONS: with the accessorized character, confirm these still play and the accessories move with
   the body: walk, jump, DOUBLE JUMP (spin/somersault), PIPE/TUBE crawl (glass tube), melee. (Grapple is N/A - the overhead engine has no grapple.)
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

## PART D - MODALS (native dialogs must be gone)
D1 Trigger a message that used to be a native alert (e.g. an error / a "Saved" style notice) -> it
   appears as an IN-PAGE modal or toast, NOT a browser system dialog; the page keeps running.
D2 Trigger a confirm (e.g. Delete a game / Delete a world / Logout) -> in-page modal with OK/Cancel;
   Cancel aborts, OK proceeds. Confirm the automation channel is NOT frozen while it is open.
D3 Trigger a prompt (e.g. Rename a world; name a teleport destination in sandbox) -> in-page modal
   with a text field; Enter/OK accepts, Esc/Cancel returns nothing.
D4 Dismissal: modals close with mouse, Enter/Esc, AND a gamepad (A = OK, B = Cancel).

## Report template
    CUSTOM SPRITES 431 - <date>, Chrome <ver>, badge <...>, pads <n>

    A1 card Character picker persists ... PASS/FAIL
    A2 pre-game Character + Body fields . PASS/FAIL
    A3 overhead accessories render right  PASS/FAIL + notes
    A4 overhead animations play ........ PASS/FAIL (walk/jump/double/tube/melee; grapple N/A)
    A5 recolour + MP colour ............ PASS/FAIL
    B1 side card Character picker ...... PASS/FAIL
    B2 side accessories + z-order ...... PASS/FAIL + notes
    B3 side animations play ............ PASS/FAIL (walk/jump/double/edge-climb/ladder/crouch/melee)
    B4 side legibility ................. NOTE
    C1 classic unchanged (both engines)  PASS/FAIL
    C2 teams colour ................... PASS/FAIL
    C3 no regressions (O1-O8) ......... PASS/FAIL
    D1 alerts are in-page ............. PASS/FAIL
    D2 confirm in-page (no freeze) .... PASS/FAIL
    D3 prompt in-page ................. PASS/FAIL
    D4 dismiss by mouse/key/pad ....... PASS/FAIL
    console errors ................... <n>

    OVERALL: <...>

Notes for the dev (known / by design):
- Character is ONE per world in v1 (per-player rosters + a parts-mixer = Phase 2).
- Accessories are cosmetic ONLY - the hitbox never changes (verified in tests).
- Side rendering was headless-untestable (player.js), so B1-B4 are the key browser checks.

Automation notes (for the tester rig):
- The pre-game setup panel REPLACES its row DOM nodes on every value change. Re-query a row after each
  click; a cached reference reads a detached node (rect [0,0,0,0]) and looks like "nothing changed".
- The card Character dropdown saves via a GET+PUT round-trip, so persistence is not instantaneous -
  allow the request to complete (or reload Sandbox) before asserting it stuck.
- In-page modals are plain DOM (class .dlg-back / .dlg-card, buttons [data-act="ok"|"cancel"], and a
  .dlg-input for prompts) - drive them by clicking those, not by expecting a CDP dialog event.

## FIXED since the 430 run (build 431)
- Offline OVERHEAD cards (oh-<name> ids) now SAVE a Character (were 404 on ~9/18 cards). Re-check the
  card picker on an offline overhead world.
- Native window.confirm / window.prompt are now safety-overridden too (no native dialog anywhere, even
  from a stray / older code path).
- Rex's tail now attaches to the body in overhead.

## Clarifications from the 430 report
- SIDE-SCROLL character IS wired: the value is set in the Game constructor (window.CURRENT_CHARACTER_ID
  from the world) and read by the sprite. It applies to a game CREATED AFTER the world was tagged
  (games snapshot the world at creation) - so use New Game from the tagged world; an OLD game slot made
  before tagging will still show Classic. This is why the free Platformer slot matters (below).
- Please free ONE Platformer slot so the literal New Game path isn't blocked - that unblocks B1-B3
  end-to-end.
- Grapple is NOT in the overhead engine - struck from A4; do not log it as an open item.
- Modal DOM contracts - there are TWO valid in-page modals, both non-native + screenshottable:
    * DIALOG (alerts / most confirms / prompts): backdrop .dlg-back, card .dlg-card, buttons
      [data-act="ok"] / [data-act="cancel"], prompt field .dlg-input.
    * Sandbox world-card Delete: #sb-confirm-modal with #sb-confirm-ok / #sb-confirm-cancel (CANCEL
      focused by design). Neither freezes the channel.
- Cosmetic backlog (not blockers): at Arena size (r ~ 7.7px) some characters read as blobs (we'll
  favour silhouette over fine colour detail); Zib's head faces AIM not travel, so antennae can point
  "backward" while moonwalking (correct behaviour, noted).
