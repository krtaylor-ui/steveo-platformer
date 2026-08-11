# CONTROLLER test items - KEVIN's own pass (build 434)

These were deliberately LEFT OUT of `TESTER_BRIEF_POSTMERGE_434.md` because they need a real gamepad
(or two) / a second human player. Kevin verifies these himself. Most of A1-A5 were already confirmed
live once during the pre-merge checklist; this is the formal re-check on merged `main` @ 434.

Setup: `git checkout main ; git pull` -> build 434 badge -> hard reload -> press a button on each pad
so Chrome enumerates it -> window focused.

## Already confirmed live pre-merge (re-confirm on 434)
- [ ] A1  Overhead real play: an assigned pad MOVES its player, aims, and fires/melees.  (was "dead")
- [ ] A2  Two pads: P2's pad drives P2 only; P1 keyboard still works alongside.
- [ ] A3  Overhead ARENA versus on pads: 2 players, Deathmatch; a kill / last-standing ends the match.
- [ ] A4  Modal dismiss on a pad: A = OK, B = Cancel on any confirm/prompt; channel never freezes.
- [ ] A5  Pre-game setup window: each pad's D-pad edits ONLY its own player's panel; P1 owns global +
          Start.

## New in build 434 - verify for the first time
- [ ] 5.  Setup window B = CANCEL: pressing B on P1's pad backs out of / cancels the pre-game window
          (previously B did nothing; A/Start worked). THIS IS THE build-434 fix - the main new check.

## Still-open controller items (verify + decide if they need a fix)
- [ ] Multi-player GLASS TUBE travel: with 2+ players (pads), P2/P3/P4 can each use a tube; two players
      can be flying at once; group-travel "pull nearby players" works.
- [ ] 2D multiplayer per-player APPEARANCE: in a 2D multiplayer game (2+ players via pads), each 2D
      sprite shows its own colours + Boy/Girl; teams -> shared shirt colour, own hair/skin/pants.
- [ ] Dashboard gamepad FOCUS: Kevin noted "the controller can take focus to the far left" on the
      dashboard - reproduce, capture exactly which element it lands on / what it looks like, so it can
      be fixed (gamepad-nav polish). NEEDS repro detail.

Notes / results:
  (fill in as you test)
