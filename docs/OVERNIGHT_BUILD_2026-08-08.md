# Overnight build — 2026-08-08 (branch overhead-play-modes)

Kevin's overnight brief. Churn through ALL items without stopping; recommend+document any judgment
call; LAST step = a big plain-ASCII tester test plan covering everything, then stop the loop.

## Locked decisions (Kevin, up front)
- **Appearance:** Full — Boy/Girl sprite + per-player skin/hair/shirt/pants colour, in BOTH overhead
  and 2D. Fallback to colours-only if a rig fights Boy/Girl. Teams => SHIRT = team colour, rest = own.
- **Settings-window nav:** D-pad-navigable per-player PANELS (not free cursors — easier for young
  kids). P2 can only edit P2's panel (etc.); P1 also owns global settings + Start. Must match the
  existing menu look (Kevin: game feels patchwork — restyle, don't invent a new modal look).
- **Player count:** Speed Run = 1P (NO settings window). Platform = co-op 1-4 (gets the window).
  Arena = 2-4 (gets the window). The current pre-launch modal wrongly popped up in Speed Run AND
  spawned 4 players — fix.
- **Engines for appearance:** BOTH overhead + 2D.

## Progress (commit as you go; bump build each behaviour change; keep `node test/run.js` == 0)
- [DONE 415] O1 CRITICAL: overhead real-play controllers dead — overhead `_update` never called
  `input.updateGamepad()` (2D does at game.js:1579). Now polled each frame (guarded) + slot-sync
  moved up. js/overhead/overhead-game.js `_update`.
- [DONE 416] O3 (model + overhead half): js/player-looks.js PLAYER_LOOKS (per-player boy/girl +
  skin/hair/shirt/pants, distinct P1-P4 defaults, team=shirt). Wired into overhead `_drawPlayer`
  (passes palette+sprite) + Boy/Girl hair in overhead-launch.js drawOverheadPlayer. test-player-looks.js.
- [DONE 417] O5: 2D travel/glass tubes for ALL players — game.js `_updateTravelTubes` +
  `_drawFlyingTubeGlass` now loop activePlayers() (were P1-only). Enter/advance already per-p.

## REMAINING (do in this order; each = commit + build bump + green suite)
- [DONE 418] O3 (2D half): recolour the LIVE 2D player sprite per-player from PLAYER_LOOKS. The 2D sprite
  is drawn from hard-coded hex (shirt #4A8FD4, pants #2C5F8A, skin #F4C78A, hair #7D4E1A, shoes
  #3D1C02 — see death-scatter defs at game.js ~1138 for the region map). Find the LIVE player draw
  (NOT `_spawnDeathParts`), parameterize its region colours by `PLAYER_LOOKS.palette(pnum, teamIdx)`
  per player, and add a minimal Boy/Girl tweak. Fallback: at least SHIRT (+team colour) per player.
- [DONE 419] O2: pre-game flow. In js/overhead-play.js: Speed Run -> skip the setup window, launch 1P
  directly. Platform -> setup window with co-op player count (1-4). Arena -> setup window (2-4 +
  versus). REBUILD `_openSetup` as D-pad-navigable per-player PANELS (each pad edits only its own:
  pad assignment + control type + appearance via PLAYER_LOOKS swatches + Boy/Girl); P1 panel also
  has global (mode/teams/kill-target/START). RESTYLE to match existing app menus (reuse existing
  modal/panel CSS classes — inspect index.html arena-prelaunch / world-settings / .modal styles;
  stop the foreign dark card). Player count from setup, not spawn count. Gamepad nav: read
  ControllerConfig assignments; each pad's d-pad/buttons drive its own panel (poll via a rAF loop or
  hook the InputManager). Keep it controller-first but mouse still works.
- [DONE 420] O4: glass tubes in OVERHEAD. Check existing overhead transport: overhead has pipes/portals
  (`_triggerTransit`, `_startPipeClimb`) + tests test-overhead-glass.js / test-travel-tube.js /
  test-glass-block.js. Add a point-to-point GLASS TUBE building (visible tube + fly-through visual)
  usable by all 4 players; must work in Arena. Mirror the per-player `_climb`/transit pattern
  (per-player state, groupTravel-style). Editor: add a tube tool. Reuse the 2D TRAVEL_TUBE geometry
  helpers if portable, else an overhead-native version. Headless-test the geometry + per-player entry.
- [DONE 421] O6: 2D sandbox Chest. `_sbChestPaletteItems()` (game.js ~4320) uses paletteTab -> GEAR/OTHER/
  SANDBOX_PALETTE_BLOCKS — but the chest palette/tabs are stale vs the main sandbox palette. Make the
  chest offer ALL current palette tabs correctly (align with the main sandbox palette tab set +
  items). ALSO allow REMOVING an item from a chest slot (e.g. right-click a chest slot deletes it /
  drag out to trash). Chest click handling ~`_handleSandboxChestClick` (game.js ~4340), slots
  `ch.items` (Array(8)), held item `_sbChestHeld`.
- [DONE 421] O7 LAST: big plain-ASCII tester plan (docs + C:\Dev\Steveo-QA\docs\) covering O1-O6, run
  -without-stopping style with per-item PASS/FAIL + capture notes. Then ScheduleWakeup stop:true and
  post a full summary of the overnight run.

## Guardrails
- Branch overhead-play-modes (off overhead-mp-0f). Push each commit to origin/overhead-play-modes.
- Single-player + side-scroll unchanged unless the item requires it. Overhead-MP versus/co-op intact.
- Bump build via tools/bump-build.js on behaviour changes. Plain-ASCII tester files only.
- Anything ambiguous: pick the sensible default, DO it, and note it here under the item for Kevin.

## PART 2 (Kevin picked, ~00:30) — Speed Run Phase 2 (overhead)
Build on branch overhead-play-modes (@ build 422 after the 421-defect fixes). Complete the 3rd play
mode. Ghost + checkpoints stay deferred.
- [DONE 423] Finish-enable: overhead goal-win is gated to platformer/campaign (overhead-game.js ~533 and the
  portal isGoal path ~520). ENABLE the finish for mode==='speedrunner' too (the world's Goal Star /
  a portal isGoal = the finish line).
- [DONE 423] Run timer: start on the player's FIRST movement input, stop at finish. Draw elapsed time in the
  overhead HUD (_drawHUD). Keep the clock in the game (e.g. this._srT / this._srRunning), advanced in
  _update. Single-player Speed Run only (mode already forces 1P via OVERHEAD_PLAY).
- [DONE 423] Best time + leaderboard: reuse the side-scroll SpeedRunnerLeaderboard + SPEEDRUN_SYNC
  (js/speedrunner-mode.js; POST/GET /api/speedrun/results) keyed levelId=`${playerName}:${worldName}`
  (mirror game.js:17902). On finish: record ms, qualifies()->add(); show the time + best on the win
  overlay. playerName from AUTH (fallback 'Player'), worldName from world.name.
- [DONE 423] Headless tests: timer format/start/stop, finish-enable gating for speedrunner, leaderboard
  qualify/add + levelId keying. Keep node test/run.js exit 0.
- [DONE 423] Bump build, commit+push each step, tick here, mark task #32 done.
- [DONE 423] LAST: append a Speed-Run section to the tester brief (or a small new brief) + QA copy; then
  ScheduleWakeup stop:true + post a summary. Judgment calls documented here.
Decisions (autonomous): timer starts on first move (no countdown in v1); Goal Star = finish; results
overlay shows time + personal best; ghost/checkpoints deferred.
