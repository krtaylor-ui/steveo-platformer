# SPEED RUNNER — MEGA / EPIC IMPLEMENTATION BRIEF

**For:** a fresh Claude Code session, run overnight, on a NEW branch.
**Author of this brief:** the design session that mapped the codebase (5 parallel explorations, 2026-08-11).
**Source requirements:** Kevin's "Speed Runner Mode: Full Experience Requirements" (Sections 1-17).
**All product decisions below are already made — do NOT re-ask them. Proceed without pausing (overnight
run). Where THIS brief is silent, pick the sensible default, DO it, and note it in the commit + here.**

---

## 0. HOW TO USE THIS BRIEF

- **Branch:** create and work on `speedrunner-overhaul` off `main` (currently build 439). Push each commit
  to `origin/speedrunner-overhaul`. Do NOT touch `main`; do NOT merge — Kevin reviews the branch.
- **Conventions (hard rules):** bump the build via `tools/bump-build.js <N> "note"` on every
  behaviour change (updates GAME_VERSION + cache-busters + sw.js). Keep `node test/run.js` exit 0 —
  add headless tests for every non-UI unit. Commit messages end with
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Gender-neutral copy. `classic`
  stays the default. Cosmetics never change a hitbox.
- **Commit cadence:** commit PER ITEM (each = build bump + green suite), so partial completion is still
  shippable. This brief is bigger than one token budget MIGHT finish — WORK IN THE PRIORITY ORDER in §3
  so the most valuable, lowest-risk wins land first.
- **THE MIGRATION-DEFERRED PRINCIPLE (Kevin's explicit instruction):** "Build everything right up to the
  SQL migration. Anything too risky to implement before the SQL changes are in can wait — but take it as
  far as possible and line that up at the end." So for every DB-gated feature: build ALL the code that
  does NOT require the new schema (client UI shells, pure logic, the moderation wordlist, thumbnail
  CAPTURE, the in-level achievement evaluator), WRITE the migration SQL into `server/sql/`, wire the
  server routes, and STOP before anything that can only be verified once the SQL is applied. Accumulate
  every required migration into a single **`docs/SPEEDRUNNER_MIGRATIONS.md`** (ordered, copy-paste-ready,
  with "why") as the LAST deliverable, so Kevin runs them in one sitting.
- **Overnight style:** no mid-run confirmations. If you hit a genuine blocker, document it here under the
  item and move on to the next independent item — don't stall the whole run.
- **Final deliverables (last steps):** (1) `docs/SPEEDRUNNER_MIGRATIONS.md`; (2) a plain-ASCII tester
  brief in `docs/` AND copied to `/mnt/c/Dev/Steveo-QA/docs/` (controller items in a SEPARATE file per
  the established pattern); (3) update memory (`STEVEO_PLATFORMER_CONTEXT_SUMMARY.md` CURRENT STATE + a
  speedrunner memory note); (4) a run-summary comment.

---

## 1. DECISION LOG (locked — do not re-litigate)

- **Session split:** this branch builds the migration-free gameplay/editor/UI work fully, and takes the
  DB-gated storefront/state-model/leaderboard work AS FAR AS POSSIBLE without applying SQL, lining the
  migrations up at the end. (Kevin.)
- **§6 UI:** UNIFY onto ONE modal style — the **dark** family — but **scaled up for controller/TV play:
  large fonts, big buttons**, clean/consistent, and **fully retro-theme compliant**. Produce a written
  style guide as a real deliverable. This is built for Kevin to CONFIRM before wide rollout (the branch
  model already gates that). Convert the inline-JS dark modals to shared themeable classes FIRST.
- **§16:** include all four — Wind/current zones, Timed cycling gates, Practice-mode personal checkpoints,
  Split/segment timing. **WIND is the EPIC feature:** a placed region with DIRECTION + STRENGTH, working
  in **overhead AND side-scroll, in ALL play modes**, **blockable by a wall of sufficient size** and
  **redstone enable/disable** so creators can build wind puzzles.
- **§12 Campaign:** ship Platformer-first; do NOT generalize the campaign data model now. (A Speed-Run
  campaign is a later ~1-field + 2-hook change — out of scope here.) The Speed Runner landing "collections"
  are INDEPENDENT of Campaign.
- **§5 Create World:** HIDE/disable the World-View (overhead/side) toggle for Normal mode (Normal has no
  overhead configuration).
- **§2 published cap:** keep a generous cap (raise the current max-2 to **20**).
- **§3 difficulty:** DEFERRED (computed-from-play-data later). Do not build difficulty rating now.
- **Leaderboard identity:** re-key SR levels from the fragile `author:worldName` string to `worlds.id`
  (with a migration for existing `speedrun_results.level_id` rows) — this is DB-gated; see Epic B/LB.

---

## 2. CODEBASE MAP (from the exploration — use these, don't re-discover)

**Two SR engines** (feature sets DIVERGE — every SR gameplay item must consider both or explicitly scope):
- 2D side-scroll: `js/game.js` `_sr` state machine — init `_initSpeedRunnerMode` (game.js:17847), load
  `_loadSpeedRunnerWorld` (17902), per-frame speed (18116-18143), countdown (18087), perfect-start
  (18145), goals `_srCheckGoals`/`_srTriggerWin` (21231), death `_srTriggerDeath` (21193), restart
  `_srRestartRun` (21329), pause-aware clock `_srShiftClocks` (21314).
- Overhead: `js/overhead/overhead-game.js` `_srMode`/`_srTick` (1298) — starts on first movement, NO
  countdown/perfect-start/ghost/boost. Finish = goal cell / portal isGoal (545,558).
- Shared: `js/speedrunner-mode.js` — `SR_CONFIG` (6-27), `SpeedRunnerGhost` (32-72, localStorage
  `sr_ghost_<levelId>`, 2D-only), `SpeedRunnerLeaderboard` (105-144, localStorage `sr_lb_<levelId>` top-5),
  `SPEEDRUN_SYNC` (147-176 → `/api/speedrun/results`). `levelId` = `author:worldName` (game.js:17930,
  overhead-game.js:1303) — FRAGILE, collision-prone.

**Speed settings:** defaults `game.js:131-142` (`srBaseSpeed, srMaxMultiplier, srBoostPct, srAccel:0.5,
srDecel:2, srTimeBoost*, srDistBoost*, srMinZoomSpeed, srMaxZoomSpeed`). UI World-Settings SR tab
`world-settings-ui.js:176-180`, cycler option arrays `game.js:10903-10905`. Model is ACCEL-TO-FIXED-MAX
(no constant-scroll). `player.srControlled` hands vx to SR.

**Launch Accel/Lift:** `world-settings-ui.js:140-141` (group 'Physics', tab 'movement'); Transport group
already exists at `world-settings-ui.js:162-165`. Move = change `group:'Physics'`→`'Transport'`.
`jumpPadVForce` also `game.js:145`, `platformer-defaults.js:24`.

**Reuse targets:**
- Zone-with-effect: Warp-Pipe link mode `game.js:3385-3389` (`_pipeLinkMode`, `_pipeLinks`); non-solid
  trigger block `SPEED_BOOSTER=56` (`_srCheckBoosterBlocks` game.js:18234) / `SPIKES=67`.
- Moving platforms: `js/moving-platform.js` + `game.js:548-566`. **SPEED_SEGMENT=90** (blocks.js:109,
  `_speedSegs` game.js:560, `_speedSegPopup` 2167, serialized `game-state.js:305`) — a range+ramp
  template for player Speed Zones. Flood-fill `isPlatBlock` (game.js:19086) carries ANY block incl spikes.
- Goal-star colour cycle (WRAPPING) idiom: `_cycleGoalGroupColor` game.js:5271-5280, per-cell
  `_goalColorMap` (5234), serialized game-state.js:16. Model for spike-orientation cycling.
- Preset pattern: Arena Custom Rules (`js/custom-rules-ui.js`, `custom-rules-routes.js`) + Platformer
  Scoring groups — a preset SETS defaults, leaves settings editable.
- Music: `MUSIC_PLAYER=50`, right-click `game.js:3555`→`_openMusicPlayerUI` (22328); library `MUSIC_DISCS`
  `constants.js:379`; per-block `configuredSongs`. WORKS today.
- Achievements: `server/stats-routes.js` `ACHIEVEMENTS` array (28-35), `evaluateAchievements` (43),
  `player_achievements` table, client notify `game.js:13677/_notify`, display `community-ui.js:96`.
- Sandbox top bar `index.html:362-399`; create-world modal `index.html:459-522` + `sandbox-ui.js:609-681`;
  world-list filter `sandbox-ui.js:231-232` (view) + `#mode-filter` (231); `_isOverhead` `sandbox-ui.js:217`.
  Overhead editor create modal (control scheme `#ohc-scheme`) `overhead-editor.js:121-176`.
- Modals: WHITE `.modal-content` (style.css:670, ~12 modals) vs DARK `.ws-panel` (style.css:1205),
  `.ohc-panel` (inline `overhead-editor.js:338`), `#sb-confirm-modal` (inline `sandbox-ui.js:717`).
  Theme system `js/theme.js` (modern/retro + retro FX), retro modal skin `style.css:1931`, `.ws-panel`
  retro `style.css:1258`.
- Palette "Other" tab: static `OTHER_PALETTE_ITEMS` `sandbox.js:114-140`, routing `sandbox.js:1165`,
  mirror `game.js:4341`. NOT mode-filtered.

**DB reality (see §5 migrations):** worlds table has `is_published` only (no draft/live/published);
community columns in `server/sql/community.sql` (published_at, genre, difficulty, download_count,
rating_sum/count, original_author) MAY NOT BE APPLIED. NO `play_count`, `tags`, `thumbnail`,
`downloadable` column, NO per-level achievement table, NO moderation. `speedrun_results` is GLOBAL per
`level_id`. Existing community/publish routes: `server/community-routes.js`, `server/worlds-routes.js:543`.

**§13 VERIFY RESULTS (already checked — confirm quickly, don't re-investigate blind):**
- Insta-death: EXISTS/WORKS (Lava+Void hardwired, game.js:18208); NO named setting.
- Speed Boost Zones (`SPEED_BOOSTER`): work IN SR only; inert outside SR (no non-SR handler) = the "does
  nothing" report. Fix = add overlap handler in `_classicBlocksForPlayer` (game.js:18280+).
- Spike-on-platform moving obstacle: ALREADY WORKS (flood-fill carries spikes). VERIFY + document only.
- Music right-click config: WORKS (the "broken" report is locked non-default discs being unselectable).
- Checkpoints: only hardcoded bed-columns for the built-in Normal world (game.js:3916, constants.js:150).
  Placeable SR checkpoints = NET-NEW engine work (+ ghost re-baselining, ghost is a full-run recording).
- Thumbnails: none stored; `_buildMiniPreview` colour-strip (menu.js:1086) is a 2D starting point.
- No beat/BPM system exists.

---

## 3. BUILD ORDER (priority — do in this order; stop-anywhere leaves value banked)

**Wave 1 — migration-free quick wins + bug-fixes (Epic F + easy Epic E):** launch-accel move (E3),
spike-on-platform verify (F), speed-boost-zone fix + settings (E6), insta-death named toggle (E11),
spike orientation (E12), "Other" palette mode-filter (E13).
**Wave 2 — speed model + core mechanics (Epic E):** speed-settings split + precision input (E1),
constant/auto-speed mode (E2), player Speed Zones (E5), Gravity Inverter zones (E4), attempt-counter +
best-percent (E8), Instant Retry (E9), rule-set presets (E10).
**Wave 3 — WIND (the epic, cross-engine) (E7).**
**Wave 4 — Checkpoints engine + Practice mode + Split timing (Epic CK).**
**Wave 5 — Editor cleanup + Create World modal + description edit (Epic C).**
**Wave 6 — UI unification + style guide (Epic UI).**
**Wave 7 — Music per-instance track + Beat Grid overlay (Epic MB).**
**Wave 8 — Achievements: creator-defined templates + in-level evaluator (Epic D, evaluator is
migration-free; storage is gated).**
**Wave 9 — DB-gated build-to-SQL: Level states (Epic A) + Storefront (Epic B) + leaderboard re-key +
moderation wordlist. Write code + SQL, stop at the schema line.**
**Wave 10 — deliverables: MIGRATIONS.md, tester brief, memory, summary.**

Rationale: Waves 1-7 are fully self-contained and shippable without any DB change; they're the bulk of the
"feel" of Speed Runner and carry the least risk. Waves 8-9 are where the schema wall is — build up to it.

---

## 4. EPICS

### Epic F — Bug verification (Wave 1) — §13
- **F1 Spike-on-platform:** VERIFY a spike built onto a moving-platform anchor rides it (flood-fill
  `isPlatBlock`, game.js:19086). Add a headless test asserting a SPIKES cell in a platform group is
  carried. No engine change expected; if it already works, document + test only.
- **F2 Music player:** confirm right-click config opens + selects a built-in track; if the only issue is
  locked discs, add a one-line hint in the config UI ("locked tracks unlock in play") — no bug fix needed.

### Epic E — Speed/movement settings + gameplay mechanics (Waves 1-3) — §8,§9,§10,§13,§14,§15
- **E3 (Wave 1) Move Launch Accel/Lift → Transport:** `world-settings-ui.js:140-141` group Physics→
  Transport. Trivial. Verify they still read at game.js:145/platformer-defaults.js:24.
- **E6 (Wave 1) Speed Boost Zone fix + settings:** add a `SPEED_BOOSTER` overlap handler in
  `_classicBlocksForPlayer` (game.js:18280+) so it affects the player OUTSIDE SR too. THEN add per-block
  config (right-click, reuse the popup pattern): **Permanent vs Temporary**, boost amount, duration. Test
  the multiplier application + the permanent/temporary decay.
- **E11 (Wave 1) Insta-death named setting:** surface the existing Lava/Void insta-death as a named
  world setting `instaDeath` (default = current behaviour), and honor a configurable "deadly pit / one-hit
  hazard" flag. Keep default behaviour identical for existing worlds.
- **E12 (Wave 1) Spike orientation — §14:** add a per-cell `_spikeDirMap` (mirror `_goalColorMap`
  game.js:5234, serialize like game-state.js:16). Spikes placeable up/down/left/right; DEFAULT inferred
  from the adjacent solid surface at placement; right-click CYCLES through the VALID orientations for that
  context; **after the last valid orientation, the next click REMOVES the spike** (terminal — NOT a wrap,
  deliberately unlike the goal-star cycle). Update `_drawSpikes` (blocks.js:1809) to render per direction.
  Damage overlap must respect orientation. Headless test the valid-set-by-context + terminal-remove logic.
- **E13 (Wave 1) "Other" palette mode-filter — §15:** give each `OTHER_PALETTE_ITEMS` entry (sandbox.js:114)
  a `modes:[]` set; filter the Other tab (and the chest mirror game.js:4341) by the world's current
  gameModeDefault, showing items valid in >=1 of the world's modes. Items with no `modes` = all modes.
- **E1 (Wave 2) Speed settings split — §8:** separate the THREE concepts cleanly: (1) Base + Max speed
  (independent; add a "Max = Base" preset that removes the ceiling), (2) Acceleration curve incl. a "no
  acceleration / instant full speed" option (drives `srAccel`), (3) Constant/Auto-speed = E2. Precision
  input: slider + a manual text box to one decimal. Wire into `game.js:18116-18143` + world-settings-ui.
- **E2 (Wave 2) Constant/Auto-speed mode — §8:** net-new flag `srConstantSpeed`; when on, force
  `accel=true` + clamp `sr.vx = maxSpeed` (game.js:18130+), true fixed auto-scroll. Confirm ghost stays in
  sync (the model is deterministic by design, game.js:18118). This mode is the recommended base for the
  Beat Grid (E-MB).
- **E5 (Wave 2) Player Speed Zones — §10:** a placed region that sets/ramps the PLAYER's run speed over a
  length. Reuse the SPEED_SEGMENT range+targetSpeed+ramp template (game.js:560) but write to `sr.vx`/a
  boost multiplier, NOT platform speed. Both engines if cheap; side-scroll is primary.
- **E4 (Wave 2) Gravity Inverter zones — §10:** placed zone that flips effective gravity within it
  (ceiling↔floor, jump inverts). Reuse the non-solid trigger-block detection + optional Warp-Pipe-style
  config. Side-scroll primary. Handle player physics + the ghost (position-based, so it replays fine).
- **E8 (Wave 2) Attempt counter + best-percent — §10:** per-level attempt count + furthest-progress %
  (track max x reached / level length per attempt), shown even on a FAILED run. Cheap localStorage keyed by
  the level id (use the re-keyed id from Wave 9 when available; until then the current levelId). HUD line.
- **E9 (Wave 2) Instant Retry — §10:** a creator flag to disable the restart countdown so a failed run
  restarts immediately (auto or on click); when on, SKIP the start-signal speed boost (accepted tradeoff).
  Touches `_srRestartRun` (game.js:21329) + countdown (18087).
- **E10 (Wave 2) Rule-set presets — §10:** named presets ("Plumber Mode", "Shape Run", …) that populate a
  batch of settings (speed mode, accel, gravity, etc.) then leave every setting editable. Reuse the Arena
  Custom-Rules preset pattern. Tuck the individual settings behind an "Advanced Options" disclosure.
- **E7 (Wave 3) WIND / CURRENT ZONES — §16 EPIC:** a placed region with **direction (8-way or vector) +
  strength**, pushing the player while airborne (and optionally while grounded, tunable). REQUIREMENTS:
  works in **BOTH engines (2D + overhead)** and in **ALL play modes** (not SR-only). **Blockable by a wall
  of sufficient size** — a solid barrier of >= a configurable thickness within/across the zone stops the
  wind past it (raycast/flood from the emitter). **Redstone enable/disable** — wire the zone as a redstone
  sink (reuse the transmitter/receiver/gate model, `game.js` redstone + overhead redstone) so creators can
  toggle wind on/off for puzzles. Palette entry via `OTHER_PALETTE_ITEMS` + an overhead building. Headless
  test: force vector application, wall-blocking, redstone gating. This is the largest single new mechanic —
  budget accordingly.

### Epic CK — Checkpoints + Practice + Splits (Wave 4) — §10,§16
- **CK1 Placeable checkpoints:** a checkpoint block/marker a designer places mid-level; on touch, save
  mid-run state (position, clock anchor, mobs/redstone snapshot — reuse `_srRespawn`'s snapshot at
  game.js:21343). On death, respawn to the last checkpoint instead of the start line, IF the creator
  enabled checkpoints for the level.
- **CK2 Ghost re-baselining:** the ghost is a single-`startMs` full-run recording (speedrunner-mode.js:32);
  a mid-run checkpoint respawn desyncs it. Re-baseline ghost playback to the checkpoint time on respawn (or
  disable ghost between checkpoints) — pick the cleaner option, document it.
- **CK3 Practice mode + personal checkpoints — §16:** a player-side mode with player-placed TEMPORARY
  checkpoints, separate from official checkpoints and NOT eligible for leaderboard submission (flag the run
  as practice so it never posts a time). 
- **CK4 Split/segment timing — §16:** per-checkpoint split times shown in the HUD + on the win screen.
- Headless-test the checkpoint save/restore + split accumulation.

### Epic C — Sandbox editor cleanup + Create World (Wave 5) — §4,§5
- **C1 Top bar:** reduce to "Back to Dashboard", a "Sandbox Mode" label, and a single "Create World".
  REMOVE `overhead-new-btn` + `overhead-demo-btn` (index.html:367-368) — overhead becomes a toggle in the
  Create World modal. Move `campaign-builder-btn` to its OWN entry point BELOW the world list.
- **C2 World-list mode tabs:** replace the `#mode-filter` dropdown (index.html:382) with LEFT-SIDE TABS
  (Platformer / Speed Runner / Normal / Arena), consistent with the SR landing + storefront. Side-scroll vs
  overhead becomes a SECONDARY toggle within each tab (reuse `_isOverhead` sandbox-ui.js:217 + the existing
  view toggle). 
- **C3 Create World modal — §5:** fields = World View (Overhead/Side — HIDE for Normal per §5), Game Mode,
  World Name, Description, Map Size (H+L side / L+W overhead), Grid Density (overhead only). REMOVE Control
  Scheme (it lives in the overhead editor create modal `overhead-editor.js:145` — drop it from creation;
  it's already in overhead settings post-create). Fold the overhead create path into THIS modal so there's
  one creation entry point.
- **C4 Description editable post-create:** add a Description field to the World Settings (or an edit
  affordance on the card). The API already accepts it — `PUT /api/worlds/sandbox/:id` applies
  `description` (worlds-routes.js:454); `saveWorld()` (sandbox-ui.js:1174) must include it. UI-only change.
- **C5 Remove "Import from Games"** (index.html:398) — replaced by the Storefront Downloadable flow. Keep
  "Import from File".

### Epic UI — Modal unification + style guide (Wave 6) — §6
- **UI1 Style guide doc:** write `docs/UI_STYLE_GUIDE.md` — type scale, spacing scale, colour tokens,
  button styles — sized for **controller/TV** (large fonts, big tap targets) and defining the RETRO
  overrides for each token.
- **UI2 Refactor inline-JS modals to classes FIRST:** `.ohc-panel` (overhead-editor.js:338) and
  `#sb-confirm-modal` (sandbox-ui.js:717) carry their palette inline — extract to shared themeable classes
  so the audit can reach them.
- **UI3 Unify onto the dark family, scaled up:** one shared modal shell (base on `.ws-panel` style.css:1205)
  with LARGE fonts + BIG buttons, applied across all ~12 white `.modal-content` modals. Re-derive the
  `html[data-theme="retro"]` overrides (style.css:1931/1258) for the unified base. WATCH the white→dark
  inversion traps (dark-on-dark text: labels #333 style.css:697, headings #333 :685, warning boxes) — flip
  every hardcoded text colour. This is browser-unverifiable overnight → land it, and the tester brief +
  Kevin's branch review are the gate before it ships. Note in the brief that this is the highest-risk
  visual change; keep it in its own commits so it can be reverted independently.

### Epic MB — Music per-instance track + Beat Grid (Wave 7) — §11
- **MB1 Per-instance track:** the music player config UI already lists `MUSIC_DISCS`; confirm a placed
  instance can pick a SPECIFIC track and it plays that. Extend if the current UI only multi-selects.
- **MB2 Beat Grid overlay (net-new):** an EDITOR overlay showing beats mapped onto world-space distance so
  creators align hazards to music. Build BOTH: **Tap-to-tempo** (standalone — must NOT depend on
  autodetect; creator taps to set BPM + offset) and **automatic BPM detection** (offered only if it's
  reliable "more often than not"; manually correctable). The grid maps time→distance, so it's most
  predictable under Constant/Auto-speed (E2) — default the overlay to assume constant speed and warn under
  variable speed. Closed curated library only (no uploads).

### Epic D — Per-level Achievements (Wave 8) — §7
- **D1 Templates (migration-free):** creators define up to 3 per-level achievements from parameterized
  templates: Collect N of [collectible], Defeat N mobs, Complete within T seconds, Don't jump more than N
  times, "Avoid all obstacles" = **complete without taking damage from a designer-tagged hazard** (reuse
  the hazard tagging — Lava/Spikes; confirm the exact tag set). Store defs in `world_data.achievements[]`
  (max 3) — this rides existing world save, NO migration.
- **D2 In-level evaluator (migration-free):** a client evaluator that tracks the trigger conditions during
  play (collectibles, mob kills, timer, jump count, hazard-hit flag) and fires on level completion. Reuse
  the existing unlock→`_notify`→display flow (game.js:13677, community-ui.js:96).
- **D3 Persistence (GATED):** per-level unlock storage needs `world_id` on `player_achievements` (or a new
  `world_achievements` unlock table). WRITE the migration; wire the route; leave the actual cross-session
  unlock ledger behind the SQL. Until applied, unlocks can show in-session (evaluator works) but not persist.

### Epic A — Landing screen + Level states (Wave 9, build-to-SQL) — §1,§2
- **A1 Level states (GATED):** Draft / Live / Published (+ Downloadable opt-in flag, + immutable
  original-creator provenance). Today only `is_published` exists. WRITE a migration adding a `state`
  enum/text (draft|live|published), a `downloadable` bool, and an IMMUTABLE `original_author` guard (DB
  trigger/RLS — provenance must be un-editable by the downloader, §2). Build the client state controls +
  the server route changes; gate the parts that need the columns. Raise the published cap to 20
  (worlds-routes.js:559).
- **A2 Level validator (migration-free):** a validator that a level has >= 1 finish/goal before Live/
  Published — must handle BOTH representations (2D grid `BLOCK.GOAL` scan game.js:17945 + overhead
  `world.goal`/portal isGoal). Pure logic, headless-testable, NO migration. Gate the STATE transition on it.
- **A3 Landing screen (build UI, data partly gated):** replace the 4-slot screen for Speed Runner with
  LEFT-SIDE TABS filtering a rich card list: **System** (admin `creator_id === SYSTEM_USER_ID`, admin-
  ordered, global leaderboards), **My Levels** (own Live/Published), **Community** (explicitly added/
  downloaded). Build the tabbed UI + card rendering (reuse the storefront card style) against
  `/api/worlds` + community; the System ordering + the download-into-account flow are gated on Epic B.
  NOTE: launching still needs a game/`gameId` — either relax the 4-slot uniqueness to auto-create/reuse a
  game row per world on play, or launch worlds directly (SR's game-save layer is near-vestigial). Pick the
  lower-risk path (likely: auto-create a single reusable game row on play) and document it.

### Epic B — Storefront (Wave 9, build-to-SQL) — §3
- **B1 Thumbnails:** build the CAPTURE (auto canvas snapshot at save/first-successful-playtest; reuse the
  `_buildMiniPreview` colour-strip game.js/menu.js:1086 for 2D as a fallback; overhead needs its own
  snapshot). Storing needs a `thumbnail` column + a storage bucket → migration + Kevin provisions the
  bucket. Build capture + display; gate the persistence.
- **B2 Storefront browse:** extend `community-ui.js` / `community-routes.js` with Sorting (Newest, Most-
  Played [needs `play_count` migration + an increment route], Highest-Rated [fix the sum-vs-avg bug
  community-routes.js:46], Trending [time-decayed — needs `play_count`/`last_played_at`]); tab-per-game-
  type; multi-select Arena game-type filter; Duration ranges (tunable buckets); Search-as-you-type (reuse
  the sandbox browser pattern). Difficulty DEFERRED. Clicking a username → that creator's profile pre-
  filtered to their Published levels (lightweight profile: name + published list + a few stats, NO bios).
- **B3 System Tags:** admin-curated tag list + a "Request a new tag" queue for admin review. Needs a
  `tags text[]` column (+ GIN) and a tag-request table → migration. Build the UI + route; gate storage.
- **B4 Downloadable + provenance enforcement:** the download route (community-routes.js:165) must honor the
  `downloadable` flag and set immutable `original_author`. A level is Campaign-eligible only if you're the
  creator (built or legitimately downloaded) AND it's Live/Published (§2). Enforce in the route + DB.
- **B5 Community-Nominated Picks:** reuse the ACHIEVEMENTS system (a new achievement definition for
  completing+rating a cycle's picks) — NOT a parallel badge system. A manually-triggered admin "generate
  this cycle's picks from trending" action is an acceptable start.
- **B6 Moderation (migration-free, SAFETY — do this even if the rest is gated):** a wordlist-based
  appropriateness filter for usernames + world names + descriptions (standard blocklist, buildable in
  code). Username uniqueness is already enforced (auth-routes.js:32) but NOT case-folded — add case-fold.
  There is NO moderation anywhere today; a public storefront for a young audience must not ship without at
  least this. Build the filter + wire it into the create/rename/publish paths.

### LB — Leaderboard re-key (Wave 9, build-to-SQL)
- Re-key SR levels from `author:worldName` (game.js:17930, overhead-game.js:1303) to `worlds.id`. Update
  both engines + the `sr_lb_`/`sr_ghost_` localStorage keys + `speedrun_results.level_id`. Add a migration
  to backfill/relabel existing `speedrun_results` rows (or accept a clean cut, documented). Then express
  "System levels = global shared board; others = per-account" — `player_id` already exists on
  `speedrun_results` (speedrun-routes.js), so scope reads by `player_id` for non-system levels
  (`.eq('player_id', …)`) and leave system levels global. Gate the schema-touching parts.

---

## 5. MIGRATIONS TO LINE UP (write these into docs/SPEEDRUNNER_MIGRATIONS.md, do NOT apply)

Accumulate every `CREATE`/`ALTER` the above needs, ordered, copy-paste-ready, each with a one-line why:
1. `worlds`: `state` (draft|live|published), `downloadable` bool, immutable `original_author` (trigger/RLS).
2. `worlds`: `play_count` int + `last_played_at` (Most-Played/Trending) + an increment route.
3. `worlds`: `tags text[]` + GIN index; a `tag_requests` table; a curated `system_tags` table.
4. `worlds`: `thumbnail` (url/text) + a Supabase Storage bucket (Kevin provisions).
5. `player_achievements`: add `world_id` (per-level unlocks) OR a new `world_achievements` unlock table.
6. `speedrun_results`: re-key `level_id` to worlds.id + backfill; confirm `player_id` scoping.
7. VERIFY existing `community.sql` + `stats.sql` are actually applied (routes 500 if not).
8. Raise published cap to 20 (code, not SQL — worlds-routes.js:559).

---

## 6. FINAL DELIVERABLES (last commits)
1. `docs/SPEEDRUNNER_MIGRATIONS.md` (above).
2. Plain-ASCII tester brief `docs/TESTER_BRIEF_SPEEDRUNNER_<build>.md` + copy to `/mnt/c/Dev/Steveo-QA/docs/`
   — controller items in a SEPARATE `CONTROLLER_*` file. Cover every landed item; mark DB-gated items
   BLOCKED-UNTIL-SQL. Note the UI unification needs Kevin's visual confirm.
3. `docs/UI_STYLE_GUIDE.md`.
4. Update `STEVEO_PLATFORMER_CONTEXT_SUMMARY.md` CURRENT STATE + a speedrunner memory note.
5. A run-summary: what landed, what's blocked on SQL, what needs Kevin's confirm, suite status.
