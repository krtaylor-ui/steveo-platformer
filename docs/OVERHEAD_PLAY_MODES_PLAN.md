# Overhead Play Modes — Rollout Plan

Goal (Kevin, 2026-08-07): overhead games are only reachable via the editor's Test button, so there
is no real "play" path where controllers can be configured and used. Roll out real PLAY for overhead
in **Platform**, **Speed Run**, and **Arena** modes. (Normal deferred — needs more design thought.)

Branch: `overhead-play-modes` (off `overhead-mp-0f` @ build 410, so it carries all the overhead-MP
work — the versus modes ARE the Arena first cut). Tester's `overhead-multiplayer` @ 397 stays frozen.

## Design decisions (locked with Kevin)

1. **Overhead worlds are first-class citizens of the EXISTING mode flow.** A world's game mode is set
   in the editor (Platform / Speed Run / Arena) just like side-scroll worlds; when a new game is
   created in a mode, overhead worlds appear in the picker alongside side-scroll worlds. The ENGINE
   is chosen at play time by `world_data.viewMode === 'overhead'`. No separate overhead silo.
2. **Arena first cut = local PvP versus** (Deathmatch + Last-Standing, 2-4 players) — already built at
   runtime. **PvE bot waves = deferred Phase B** (roadmap: overhead wave scheduler + bot spawner + AI).
3. **Controllers configured BOTH pre-launch (assign pads to P1-P4) AND in-game (Esc pause panel)** —
   reusing `ControllerConfig` (assignments already honored by overhead via `_syncControllerSlots`).
4. **Speed Run first cut = run timer + finish + best-time leaderboard** (reuse `/api/speedrun/results`
   + `SpeedRunnerLeaderboard`/`SPEEDRUN_SYNC`). Ghost replay + checkpoints deferred.

## How the existing flow works (facts, from code)

- Side-scroll play: dashboard mode tile -> `GAME_SELECTION.init(mode)` -> game slots -> create game
  (`_createGame` POST `/api/games/create {worldId, mode, slot}`; world picker = `/api/worlds?mode=X`)
  -> `GAME_PLAY.init(gameId)` -> **always** `new Game(mode, ...)`. No viewMode dispatch anywhere.
- World mode eligibility: server `mode` column, kept in sync with `world_data.gameModeDefault`
  (`server/games-routes.js:37-88`). Valid modes there: NORMAL/PLATFORMER/SPEEDRUNNER.
- Arena uses a DIFFERENT path: `ARENA_SELECT` -> `/api/worlds/sandbox?filter=arena` (eligibility from
  `worldAdvSettings.arenaEnabledTypes`) -> mode modal -> `ARENA_PRELAUNCH` -> `new Game('arena', ...)`.
- Overhead editor stamps `gameModeDefault:'NRM'` (=> NORMAL) — why overhead worlds never appear under
  a real play mode today.
- Overhead runtime: `this.mode` gates almost nothing; goal-win is platformer/campaign-only
  (`overhead-game.js:527`); no timer/leaderboard/waves; versus works off `settings` independent of
  mode; pad assignments honored (`_syncControllerSlots` :292); pause is a bare overlay (no menu).

## Phases

### Phase 1 — Playable path + Platform + controllers  (the core unblock; enables Kevin's controller test)
- **Editor: Game Mode picker** (Platform / Speed Run / Arena). Sets `world_data.gameModeDefault`
  (PLATFORMER / SPEEDRUNNER) so `/api/worlds?mode=` picks the world up; for Arena, sets the
  `worldAdvSettings.arenaEnabledTypes` eligibility so ARENA_SELECT lists it. Replaces the hardcoded
  'NRM'. (Server already keys the `mode` column off gameModeDefault.)
- **Engine dispatch**: `GAME_PLAY.init` (and `ARENA_SELECT.play`/`_launch`) detect
  `world_data.viewMode==='overhead'` -> route to new **`OVERHEAD_PLAY`** instead of `new Game`.
- **`js/overhead-play.js` (`OVERHEAD_PLAY`)**: fetch the game record -> hide dashboard screens ->
  `OVERHEAD.launchWorld(world, {testMode:false, numPlayers, playerSlots})` -> onExit back to
  game-selection; `ControllerConfig.setMode('overhead-'+mode)`.
- **Pre-launch controller assign screen** (`js/overhead-controller-setup.js` or reuse): map
  keyboard + pads to P1-P4, choose player count, then start.
- **In-game pause panel** for overhead: Esc -> real menu (per-player pad assignment + stick tuning +
  Rebind + Resume + Exit), reusing `ControllerConfig` and (where possible) `controls-ui.js`.
- Platform mode: goal-win already works; add a clean level-complete + exit-to-selection.

### Phase 2 — Speed Run (timer + leaderboard)
- Enable finish/goal win for `speedrunner` mode in overhead (lift the platformer-only gate for the
  finish specifically).
- Run timer in the HUD (start on begin / first input, stop on finish).
- Best-time persistence + leaderboard via `/api/speedrun/results` (`SPEEDRUN_SYNC` /
  `SpeedRunnerLeaderboard`), levelId keyed like side-scroll (`player:world`).

### Phase 3 — Arena (PvP versus)
- Overhead Arena launch = the versus modes (Deathmatch / Last-Standing, teams, fixed camera) already
  built. Wire ARENA_SELECT (or an overhead arena prelaunch) to offer overhead arena worlds, pick the
  versus mode + config (kill target / lives / teams), then `OVERHEAD_PLAY` in arena.

### Phase B — DEFERRED roadmap
- Overhead PvE arena: wave scheduler + bot spawner + bot AI driver + wave/score HUD. (docs/FUTURE_ROADMAP.md)

## Constraints
- Single-player + side-scroll play paths unchanged. Overhead-MP (co-op/versus) unchanged.
- `node test/run.js` exit 0 each build; bump build (GAME_VERSION + cache-busters + sw.js) on
  behaviour-changing commits; plain-ASCII tester briefs in `C:\Dev\Steveo-QA\docs\`.
