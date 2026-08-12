## CURRENT STATE (2026-08-12) — TRANCHE 2 + Creative-Tools Phase A/B SHIPPED to `main` @ build 490 (merged + pushed + deploying)

**MERGED to `main` (commit 14b7ec9) + pushed — Railway auto-deploys. Builds 478-490. Suite green.**
Tester-verified clean end-to-end (`reports/tranche2-490-final-2026-08-12.md`). `speedrunner-phase3` is now
merged; back to working on `main`. Shipped:
- **Tranche 2 (8):** Wind Style picker, per-level Achievements (Epic D), Beat Grid (Epic MB), SR Practice
  Mode (CK3), Create-World cleanup + post-create description (Epic C), per-player custom characters
  (Phase 3 engine), community SR play (A3), modal dark unification (Epic UI).
- **Creative-Tools Phase A:** level music — catalog Song picker + auto-BPM (`js/bpm-detect.js`, 6 tests) +
  loops during the SR run. Catalog-only (no per-level upload).
- **Creative-Tools Phase B:** line-stick render mode + **Stick** / **Stick (Skirt)** characters (both
  engines, same hitbox). Cornerstone asset for roadmap Phases D/F.
- **All tester defects closed:** T2-1..T2-6, T3-1 (SR achievement fire — `_srTriggerWin` now calls
  `_fireAchievements` + resets stats per GO), T3-2 (Custom Rules contrast).

**New server routes live:** `POST /api/worlds/sandbox/:id/description`, `GET /api/community/worlds/:id/play`.
**Residual cosmetics (NOT this tranche — future):** the shared "Start Match" indigo primary button at
3.66:1 (app-wide, pre-existing), and the Platformer PRE-GAME window still a light card not the dark shell.
**Live-render follow-up:** two customs SIDE-BY-SIDE in a real 2P match still needs the per-player selection
wiring (483 shipped the engine capability only). **Roadmap:** `docs/CREATIVE_TOOLS_ROADMAP.md` (ladder
Rungs 0-4, Part/Frame Studio, enemy templates, Movement Editor) + `FUTURE_ROADMAP.md` §13/§14
(progression-gated creator features). NEXT candidates: the Creative-Tools studio phases (C→E1→D→F→E2→G),
or the residual cosmetics.

---

## CURRENT STATE (2026-08-12) — TRANCHE 2 tester fixes + Creative-Tools Phase A/B; branch `speedrunner-phase3` @ build 488, PUSHED, NOT merged

**Builds 486-488 on `speedrunner-phase3`, pushed, NOT merged, suite green.** After the Tranche 2 tester
pass (report `reports/tranche2-478-485-test-2026-08-12.md`):
- **486 — the 6 tester defects.** T2-1 Copy World legend (dark-on-dark) flipped light in modern; T2-2 the
  DIALOG family keyed off `prefers-color-scheme:light` but the app has NO light theme -> removed the light
  media queries so dialogs are always dark (a light-OS was turning the Info modal white); T2-3 Speed Lines
  now seamless (manual segments stepping by s/3, world-anchored, like the chevrons); T2-4/T2-5 community
  Play OWNS its exit (wires the shared play-hud Exit/Pause/Restart + routes the HUD Exit AND pause-menu
  Main Menu back to the storefront); T2-6 `.cc-actions` flex-wrap. Tranche 2 brief also copied into the QA
  docs folder (process note).
- **487 — Phase A (Music v1).** New pure `js/bpm-detect.js` (onset-envelope autocorrelation ->
  {bpm,confidence,offsetMs}, 6 tests). Beat Grid modal gains a Song picker (MUSIC_DISCS) + "Detect beat"
  (in-browser decode, decimated ~11kHz, prefills BPM+offset+confidence). `worldAdvSettings.levelMusicId`
  plays looped during the SR run (starts in the GO gesture, reuses `_playBackgroundTrack`). Catalog-only,
  NO per-level upload. Browser-only bits (decode/playback) flagged.
- **488 — Phase B (line-stick render mode).** Two playable characters Stick + Sketch (`feat.stick`, Sketch
  adds `skirt`). Side-scroll: `_limbBar` draws thin round-capped lines when stick (all articulated poses
  free) + `_drawStanding`/`_drawCrouch` stick branches reusing the EXACT joints (walk/run/jump/spin/lean
  animate identically). Overhead: thinner limbs. Cosmetic only — **hitbox unchanged**. Names provisional.
  This is the cornerstone asset for roadmap Phases D (exported template) + F (ghost guide).

**Tester delta brief:** `docs/TESTER_BRIEF_TRANCHE2_FIXES_488.md` (re-checks + Phase A/B + the still-un-run
sec 3 achievements-fire / sec 6 two-customs / Arena+Custom-Rules modal items). **Roadmap grew:**
`FUTURE_ROADMAP.md` §14 = progression-gated creator features (achievements unlock creator power; the
accessibility ladder IS the unlock tree; Creative-vs-Progression mode; aspirational locks). No server
changes since 485. Ship = merge speedrunner-phase3 -> main once tester-clean.

---

## CURRENT STATE (2026-08-12) — TRANCHE 2 COMPLETE (all 8 items); branch `speedrunner-phase3` @ build 485, PUSHED, NOT merged

**`speedrunner-phase3` (off main@460). Builds 478–485. Suite green. Pushed to origin. NOT merged to main.**
Tranche 2 (creator tools, gameplay & visual unification) — all shipped, functional + headless-tested,
**UX-unverified** (awaiting the tester pass in `docs/TESTER_BRIEF_TRANCHE2_485.md`):
- **478 Wind Style picker** — Chevrons/Streamlines/Speed Lines, seamless across cells, flow downwind +
  scales with strength (`js/blocks.js _drawWindZone`; wind popup Style cycle; `_windDirMap` carries style).
- **479 Epic D — per-level Achievements** — creator UI (World Settings → Achievements → Level Challenges,
  `SANDBOX.editAchievements`, stored on `worldAdvSettings.achievements[]`) + in-play tracking (coins/
  stomp+arrow-melee kills/jumps/lava hazard/time) + fire-on-completion (`game._fireAchievements`, toast +
  POST `/api/achievements/world`). `achievement-eval.js` gained `keyOf`. Stats reset per run.
- **480 Epic MB — Beat Grid overlay** — World Settings → Beat Grid → Edit… (tap-tempo/BPM/offset,
  `SANDBOX.editBeatGrid`, `worldAdvSettings.beatGrid`); editor draws beat lines (`game._drawBeatGridOverlay`,
  downbeats every 4th, constant-speed assumption). 🔎 needs-eyeball.
- **481 CK3 — SR Practice Mode** — in-run **T** toggles unranked, **C** drops a personal checkpoint
  (respawn there), PRACTICE HUD badge, best-%/attempts gated when `sr.practice`.
- **482 Epic C — Create World cleanup** — "Overhead" folded into the mode picker (delegates to OH_EDITOR;
  redundant top button hidden) + post-create description edit ("Info" card button → `SANDBOX.editDescription`
  → new `POST /api/worlds/sandbox/:id/description`; `LOCAL_WORLDS.update` for offline).
- **483 Phase 3 — per-player custom characters** — `CHARACTERS.registerCustom(id,def)` multi-slot API so
  several players run DIFFERENT customs; `game._applyPlayerCharacter(p,i)` reads a `playerCharacters`
  launch option (2p + arena). New test `test-phase3-multichar.js`. **Side-scroll builder preview deferred**
  (needs a standalone side renderer — currently overhead-only preview). Sprite-sheet = **how-to artifact**
  (Kevin's scoped deliverable): https://claude.ai/code/artifact/a76d8b6c-ebf1-4269-90c8-fe5256adca54
- **484 A3 — play community SR levels** — storefront SPEEDRUNNER cards get a green **▶ Play** (races in
  place, no clone) via new read-only `GET /api/community/worlds/:id/play` (bumps play_count). NOTE: the
  original A3 canvas SR-landing target is DEAD reference code (HTML dashboard is live) → landed on the
  active storefront instead; a dedicated tabbed SR landing remains a design call for Kevin.
- **485 Epic UI — modal dark unification** — one revertible CSS block (search `§Epic UI — Modal dark
  unification`) moves the whole `.modal-content` family onto the dark shell in the **modern** theme
  (`:not([data-theme=retro])`; retro keeps its skin). Per `docs/UI_STYLE_GUIDE.md` this is the highest-risk
  change → 🔎 needs-eyeball; revert the one block to undo. arena-tile/card grids + inline-colour modals
  remain for follow-up commits.

**Server restarted** for the two new routes (`/description`, `/play`). Ship path when tester-clean =
merge `speedrunner-phase3` → `main` + push + apply any pending SQL (Tranche 1's `server/sql/*` still apply).
**Two open design calls for Kevin:** (a) side-scroll builder preview + full sprite-sheet importer;
(b) whether a dedicated tabbed SR landing is still wanted on the active dashboard.

---

## CURRENT STATE (2026-08-11 night) — TRANCHE 1 (Storefront & Platform) VERIFIED CLEAN; branch `speedrunner-phase3` @ build 477

**`speedrunner-phase3` (off main@460), pushed, NOT merged. Build 477. Suite green.** Tranche 1 storefront
tester-verified (473-477): browse tags/creator/search + play/thumbnail fields, tag routes + 10 seeded
system_tags, creator profiles, Community Picks, thumbnail auto-capture (data-URI, no bucket), downloadable
+ immutable-provenance enforcement, LB re-key SR levelId->worlds.id (game-slot launcher now passes
record.world_id). All Tranche-1 tester defects fixed (T1-1 rating_avg backfill+trigger via
server/sql/tranche1_fixes.sql; T1-2 card CTA contrast; T1-3 game-slot worldId). OPEN (human/deferred):
rating avg-vs-sum ORDERING needs a 2nd account; A3 SR landing-screen tabs deferred to Tranche 2 (canvas,
needs Kevin's review).

**NEXT = TRANCHE 2** (creator tools, gameplay & visual unification): Epic D creator-UI + in-play tracking +
fire; Epic MB editor Beat-Grid overlay; Epic C tabs/overhead-fold/description; CK3 practice mode; Phase 3
MP-per-player + side-scroll preview + sprite-sheet pipeline (+ how-to artifact); Epic UI 12-modal dark
unification; the WIND STYLE picker (chevrons/streamlines/speed-lines, downwind-flow); A3 landing tabs.

---

## CURRENT STATE (2026-08-11 night) — Speed Runner EPICS + Phase 3 on branch `speedrunner-phase3` (builds 461–471, pushed, NOT merged)

**Second-half additions (467–471) on top of 461–466 below:** Epic C safe wins (removed Import-from-Games +
Overhead Demo), Phase 3 roster PICKER (apply saved characters to worlds — roster now create+apply complete),
Epic MB Beat Grid core (`js/beat-grid.js` tap-tempo + time→distance, tested), Epic A/B/LB storefront SERVER
slices (rating sort→rating_avg, Most-Played/Trending sorts, play_count route, publish sets `state` + gates
on the finish validator A2), Epic D3 unlock routes (`/api/achievements/world`). **Deferred with specs
(browser-unverifiable/large UI or net-new modes):** Epic UI 12-modal refactor (style guide written), Epic C
tabs/overhead-fold, Epic MB editor overlay, Epic D creator-UI + in-play tracking, storefront LANDING/browse
UI + downloadable/provenance + LB re-key, CK3 practice, Phase 3 MP/side-preview/sprite-sheet. Suite green
(89 test files). Deliverables: `docs/TESTER_BRIEF_PHASE3_466.md` (through 471), `docs/SPEEDRUNNER_PHASE3_RUN_NOTES.md`.

---

## (earlier this session) — Speed Runner EPICS + Phase 3 on branch `speedrunner-phase3` (builds 461–466)

**Branch `speedrunner-phase3` (off `main`@460), pushed, NOT merged.** Autonomous multi-hour run of the
remaining epics. Suite green (86 test files). SQL applied by Kevin: `speedrunner.sql` + `user_characters.sql`.
- **E7 WIND (flagship): 2D FULL** (WIND_ZONE painter, dir/strength/wall-thickness/redstone config, wall-shadow
  blocking, animated chevrons, QA seams) + **overhead RUNTIME** (worldData.windZones push via collision;
  overhead editor/redstone = follow-ups). Pure core `js/wind-zone.js` (19 tests).
- **E4 GRAVITY INVERTER zones (side-scroll): DONE, ⚠️ HIGHEST-RISK/browser-unverified.** GRAVITY_ZONE(97)
  flips a player's gravity+jump inside it (ceiling-walk); contained so normal play is provably unchanged.
- **Epic CK: DONE** (CK1 placeable CHECKPOINT(98) respawn-keeps-clock + CK4 split HUD + CK2 ghost-hide;
  CK3 practice mode deferred).
- **Epic D: CORE** (`js/achievement-eval.js` evaluator, 5 templates, 17 tests; creator UI + in-play tracking
  + persistence route deferred).
- **Phase 3 roster: SAVE-HALF** (user_characters route + client API + "Save to Roster" builder button; picker
  + MP + side-preview + sprite-sheet deferred).
- **New blocks:** WIND_ZONE 96, GRAVITY_ZONE 97, CHECKPOINT 98.
- **DEFERRED (specs in `docs/SPEEDRUNNER_PHASE3_RUN_NOTES.md`):** Epic C (editor/Create-World), Epic UI
  (12-modal unification), Epic MB (music/beat grid), Epic A/B/LB storefront wiring (SQL applied → unblocked),
  CK3, D wiring, Phase 3 picker/MP/preview/sprite-sheet. Two Kevin-flagged bugs need browser repro.
- **Deliverables:** `docs/TESTER_BRIEF_PHASE3_466.md` (+QA copy), `docs/SPEEDRUNNER_PHASE3_RUN_NOTES.md`.
- **Ship:** Kevin browser-reviews (esp. E4 gravity + E7 wind), then merges `speedrunner-phase3` → `main`.

---

## PRIOR STATE (2026-08-11 late) — Speed Runner + Phase 2 SHIPPED to `main` @ build 460

**`main` == `origin/main` at build 460** (fast-forwarded from `speedrunner-overhaul`; clean FF, pushed —
live on Railway if it auto-deploys `main`). The whole Speed Runner overhaul (440–453), the QA-feedback
fixes + automation seams (455–459), the merge of the concurrent Phase-2 save fix (454), the Phase-2
FINAL gaps (GAP-1 `_persistWorldData` unify / GAP-2 verified / GAP-3 re-render), and the E3 Transport
regroup + SQL (460) are all on `main`. Suite green (84 test files).

**Tester-confirmed PASS:** E1,E2,E8,E9,E10 (Wave 2), E11 (lava), E13, GAP-1/2/3, B6 (client), plus
`selectItem` placement + all the automation seams. **Server-half of A1 (cap 2→20) + B6 were deploy-gated
on the branch** (the QA rig hit a stale API); the push to `main` makes them verifiable in production.

**QA automation seams on `window.SANDBOX` (in-editor):** `selectItem(name)`, `cycleSpikeOrientation(col,row)`
+ `getSpikeDir`, `setBoosterConfig(col,row,{mode,amount,durSec})` + `getBoosterConfig`,
`publishWorld(id,bool)`. Right-click/movement gestures don't arrive via CDP, so these are how the rig
drives E12/E6/E5.

**READY FOR KEVIN:** `server/sql/speedrunner.sql` — one idempotent, decision-made migration file (level
states + provenance trigger, play_count/last_played, rating_avg, tags/tag_requests/system_tags, thumbnail,
per-level achievement world_id, speedrun_results re-key). Prereqs (community.sql/stats.sql) confirmed
present. Apply top-to-bottom in Supabase; it unblocks the DB-gated storefront/state/leaderboard wiring.

**NEXT BATCH (branch off `main`@460):** the remaining Speed Runner epics — E4 gravity zones, **E7 WIND
(flagship)**, Epic CK (checkpoints/practice/splits), Epic C (editor + Create-World), Epic UI (modal
unification refactor), Epic MB (music + Beat Grid), Epic D (achievement templates + evaluator), and the
DB-gated A/B/LB storefront wiring (now unblockable once the SQL is applied) — PLUS **Phase 3** custom
sprites (per-account roster, MP per-player custom, side-scroll preview, studio sprite-sheet packs; see
`docs/PHASE2_FINAL_HANDOFF.md` for the Phase 3 overview).

---

## PRIOR STATE (2026-08-11) — Speed Runner overhaul: builds 440–453 on branch `speedrunner-overhaul` (pushed, NOT merged)

**Branch `speedrunner-overhaul` (off `main` @439), pushed to origin, NOT merged — Kevin reviews.**
Overnight run of the Speed Runner MEGA brief (`docs/SPEEDRUNNER_MEGA_BRIEF.md`). Suite
`node test/run.js` GREEN (added 6 headless test files). Every commit bumps the build via
`tools/bump-build.js`. This was the migration-free slice + build-to-the-SQL-wall; nothing on `main` changed.

**LANDED (each = its own commit + tests):**
- **Wave 1:** E3 (Launch Accel/Lift → Transport group), F1 (verified spike-rides-platform + test), E6
  (SPEED_BOOSTER works outside SR + right-click per-block config Temp/Perm/amount/linger; new
  `js/speed-booster.js`), E11 (`lavaInstaKill` named setting), E12 (per-cell spike orientation up/down/
  left/right, right-click cycles-then-removes, orientation-aware damage; new `js/spike-orient.js` +
  `_spikeDirMap`), E13 (Other-palette + chest mode-filter; new `js/palette-filter.js`).
- **Wave 2:** E1 (Base/Max as precise slider+numbox, Max=Base toggle, Instant accel), E2 (`srConstantSpeed`
  auto-run), E5 (Player Speed Zones = configured SPEED_BOOSTER runs, Permanent = sustained), E8 (attempt
  counter + best-progress %, HUD line, `SpeedRunnerStats`), E9 (`srInstantRetry` no-countdown), E10 (SR
  rule-set presets Classic/Auto-Scroller/Plumber/Shape/Zen in `WORLD_SETTINGS.SR_PRESETS`).
- **Safety/storefront (migration-free slices):** B6 (appropriateness wordlist `js/moderation.js` wired into
  signup + world create/rename, case-folded username uniqueness), A1 (published cap 2→20), A2 (level finish
  validator `js/level-validator.js`, gates future Draft→Live/Published).

**DELIVERABLES:** `docs/SPEEDRUNNER_MIGRATIONS.md` (all DB-gated SQL, ordered, copy-paste, NOT applied),
`docs/UI_STYLE_GUIDE.md` (unified dark/TV modal spec), `docs/TESTER_BRIEF_SPEEDRUNNER_453.md` (+ copied to
`/mnt/c/Dev/Steveo-QA/docs/`).

**DEFERRED (documented, NOT built — budget + risk):** E4 gravity-inverter zones (full ceiling-walk flip =
large high-risk physics rework), E7 WIND/current zones (the epic — both engines + wall-blocking + redstone),
Epic CK (checkpoints/practice/splits), Epic C (editor + Create-World cleanup), Epic UI modal-unification
REFACTOR (only the style guide was written), Epic MB (music per-instance + Beat Grid), Epic D
templates/evaluator, and the DB-gated bodies of Epics A/B + LB re-key (all specced in the migrations doc).

**SHIP =** Kevin browser-reviews the branch, applies `docs/SPEEDRUNNER_MIGRATIONS.md` when ready for the
storefront, then merges `speedrunner-overhaul` → `main`.

---

## CURRENT STATE (2026-08-10) — builds 397–434 ALL MERGED to `main` + pushed; working directly on `main`

**`main` == `origin/main` at build 434, working tree clean, nothing unpushed on any branch.** The big
`overhead-play-modes` + `custom-sprites` stack was fast-forwarded into `main` (build 434, commit
`f72d881`; 59 commits, clean FF) — the old feature branches (`custom-sprites`, `overhead-play-modes`,
`overhead-mp-0f`) and the frozen tester branch `overhead-multiplayer@397` are now **obsolete; work from
`main`.** Deploy: pushed to `origin/main`; if Railway auto-deploys `main` it is live — confirm on the
deploy dashboard. **Kevin is doing a full manual test the night of 2026-08-10 — expect a cleanup pass
after.** Suite `node test/run.js` → green. Every commit bumps `GAME_VERSION` + 88 cache-busters +
`sw.js` via `tools/bump-build.js`.

### The arc that landed on `main` (≈builds 397–434) — three big features
- **Overhead multiplayer + versus** — same-screen 2–4p on one device, each player its own controller.
  Co-op (shared auto-fit camera, per-player pipes/tubes/death/respawn) + versus (Deathmatch /
  Last-Standing, teams, kill-target, winner end-screen + per-player HUD). PvP damage via
  `_enemyPlayers`. **Overhead is LOCAL same-device only — there is no networked/online overhead path.**
- **Overhead real-play modes** (outside the editor Test button): **Platform** (co-op 1–4), **Speed Run**
  (1P, run timer + finish + best-time leaderboard reusing the side-scroll `SpeedRunnerLeaderboard`), and
  **Arena** (versus). Pre-game setup WINDOW is D-pad-navigable per-player panels (P2 edits only P2; P1
  owns global + Start; **B = cancel**). Speed Run skips the window. Plus **overhead Glass Tubes**
  (point-to-point fly-through transport, all players, works in Arena) and **2D tubes for all 4 players**
  (were P1-only), and a **2D Chest** palette/remove pass.
- **Custom Sprites Phase 1** — `js/characters.js` `CHARACTERS` registry: 16 shape-composed characters
  (astronaut/knight/alien/cat/robot/wizard/…) as engine-agnostic DATA (accessory `feat` + default
  palette + side/top views), rendered in BOTH engines (`_ohAccHead/_ohAccBehind` overhead;
  `_sideAccHead/_sideAccBehind/_sideAccTorso` side). Single-pick per world (Sandbox card "Character:"
  dropdown + pre-game "Character" field; per-player field relabeled "Body"=boy/girl). **Accessories are
  COSMETIC ONLY — never change the hitbox (fairness); `classic` is the default everywhere so existing
  worlds / single-player are unchanged.** Phase 2 (parts-mixer) is deferred.
- **In-app modals** (`js/ui-dialog.js` `DIALOG`) — native `alert`/`confirm`/`prompt` are overridden so
  the automated tester never freezes on a system dialog.

### Late fixes worth knowing (builds 429–434)
- **433** overhead P1 controller was dead: `_rawFor` read phantom pad fields (`gp.axes0/rt`); now reads
  P1's ASSIGNED pad via `pGp(0)` with the real InputManager fields (`moveX/moveY/aimX/aimY/triggerR`).
- **434** app version badge shows the number only (`v3 build N`, full note on hover) — the long build
  note was shoving the dashboard Logout button off-screen. + setup-window **B = cancel**.

### Known-open / deferred (for the design session)
- **SpeedRunner mode = Kevin's separate full review** — timer-starts-before-move + timer-runs-past-finish
  flagged, deliberately NOT touched. Don't fix piecemeal; it's a whole-mode review.
- **Local-vs-online gating (asymmetric):** offline mode blocks the Normal/Platformer/Speed-Runner/Arena/
  Campaign dashboard cards (`dashboard.js:201`) — **only Sandbox is reachable offline** (guest can still
  reach the modes via Sandbox → Test World). Truly local-only: the **whole Overhead engine** + **2D
  split-screen 2P co-op** (no online path — networking either would be real netcode work). CHEAP unlock =
  offline dashboard modes; EXPENSIVE = online overhead/2P.
- **Roadmap §45 (NEW 2026-08-10):** auto-generate / procedural random maps for Normal mode — feasibility
  = achievable by extending `tools/gen-sample-worlds.js` (rules-based segment generator) +
  `js/pathfinding.js navReachable` (already-wired solvability BFS); portals/structures stamp into the
  grid (see `js/world.js`). Hard parts: solvability only covers the base moveset, multi-dim portal
  wiring, no side-scroll prefab library yet. Phasing P1–P4 in FUTURE_ROADMAP.md §45.
- Cosmetic backlog: small-Arena-size sprite legibility; overhead "Zib" head faces aim not travel;
  dashboard gamepad focus can drift far-left (needs repro).

---

## PRIOR STATE (2026-08-06) — MEGA SESSION builds 362–374 on branch `mega-20260806`, NOT pushed, NOT merged

**Deployed (`origin/main`, Railway): still build 361.** The soak passed clean on 361 (7h31m,
no leak, 0 errors) and a QA tester will do a browser pass on this branch. **Nothing here is
pushed or merged** — per the brief, `main` was left untouched so the tester's target didn't move
mid-run. A human merges `mega-20260806` → `main` and deploys after the browser pass.

**20 commits, builds 362 → 374. Suite: `node test/run.js` → 1659 passed / 0 failed, exit 0.**
Every commit bumps `GAME_VERSION` + the 88 `?v=bNNN` cache-busters + `sw.js CACHE_VERSION` in
lockstep via `tools/bump-build.js` (added this session; escapes apostrophes so a build note can't
break `constants.js`).

### What landed (each = its own commit)
- **362** merged `card-title-362` (14 staged Part-A QA fixes) as the base + the lockstep bump.
- **363 A4.7** lever hit-area is DENSITY-scaled, not elevation-gated (measured with
  `tools/measure-lever`; the old row+2 branch was gated on the wrong quantity).
- **364 A9.6** the sandbox importer surfaces `unwrap()`'s rejection in-page instead of silently
  re-routing a wrong-engine/non-world file.
- **365** stale-key input flush (`InputManager.clearHeld()`) at every session start.
- **366 A1.4** burst pieces get a small decaying HEIGHT → airborne-over-the-rim vs settled is
  resolved by height, not draw order.
- **367** world-card **Delete** is an in-page confirm (`SANDBOX._confirmAction`), the last native
  dialog in the sandbox flow.
- **368 §40.1** "Hide from export" flag (`hideFromExport`, default off) — hides Export at 3 UI
  sites + server 403 for non-owners; owner always allowed. No §40.2 (browser encryption impossible).
- **369 P1.7** unit-offset audit — fixed pipe climb-in (rim offsets were fixed-cell, buried in the
  pipe at density 4; now unit-based); melee confirmed correct (block-relative, hit+draw share it).
- **370 Phase 2** overhead World Settings converted to a **declarative schema** (Advanced tier +
  help text + empty-group-hide) with Kevin's classification applied; Threats rename;
  doubleJump/style above doubleJumpClear. **Default changes (player-visible): elevOffset 0.22→0.5,
  maxStepDown 1→2, pitMode deadly→block.** Existing worlds inherit via `resolve()`.
- **371 P3.8** MEASURED perf: `OH_PERF.assess()` times the real render per tier + isolates per-pass
  cost; ⏱ buttons in World Settings + editor top bar. `estimate()` stays for instant feedback.
- **372 P3.9** per-pass **Protected / Sacrificeable / Off** quality flags; governor sacrifices the
  cheapest sacrificeable first, then lowers the cap, then a protected pass last. Replaces the tier
  ladder. Defaults keep old behaviour (glare sacrificeable, shadows+night protected).
- **373 P3.10** chunked terrain bake behind a "Loading World" banner + progress, then an eased
  zoom-OUT to the creator's default (fixes the ~8fps synchronous-bake opening).
- **374 §42** depth occlusion — a taller nearer wall hides an entity behind it (bounded per-entity
  occluder repaint, reusing the pit-death technique). **Gated `depthOcclusion`, default OFF** — the
  deployed layering is unchanged until a browser pass turns it on.

### NEEDS A BROWSER (not headlessly verifiable — be explicit with the tester)
- **363** levers selectable where drawn on a **density-4** map (from arm tip / base / side).
- **366** burst pieces reading right over a pit rim.
- **368** the server 403: a **second account** exporting a flagged world (source-verified only).
- **369** the pipe climb-in animation at **density 4** (numbers proven proportional; feel unseen).
- **370** the settings panel look / Advanced toggle / scroll; and the three changed defaults in play.
- **371** the ⏱ measured fps numbers + the temp-game/off-screen render path.
- **372** how a dropped pass looks mid-play.
- **373** the Loading banner + per-frame bake smoothness + zoom-out feel on a big dense map.
- **374 §42** the actual occlusion (flip `depthOcclusion` on): does a wall convincingly hide a mob,
  are feet clipped, is the per-entity cost acceptable with many mobs on a dense map?

### Assumptions made where the brief was silent (all in commit messages)
- Phase 0 was **not a fast-forward** (main had 4 doc-only brief commits after `card-title-362`
  branched); done as a clean disjoint merge on the mega branch, not on `main` (no-push rule).
- §40.1 stored as **`hideFromExport`** (default off) not `allowExport`, to match the mandated
  "Hide from export" label with no inverted-toggle trap; server export kept **owner-only**.
- §42 done as a **per-entity occluder repaint** (not the roadmap's row-band blit) and **default
  off** — lower risk for an unverifiable fundamental render change; abandon by flipping the setting
  or reverting commit 374 alone.

### Deliberately NOT done (out of scope per brief)
§40.2 encryption (impossible) · §41 player-vs-creator split · §43 gate rotation · §44 overhead
playability · the user-guide generator · glass/logic-gates/Tx-picker/§37/§38/§31/§39 · Konami panel.

---

## PRIOR STATE (2026-08-05) — builds 347–358 SHIPPED to `main` + pushed; 359–361 on branch `perf-occlusion-359`

**Deployed (`origin/main`, Railway): build 358.** `main` and `origin/main` are level.

**Branch `perf-occlusion-359` (builds 359–361, pushed, NOT merged):** frame budget + adaptive
quality + pre-launch estimate + soak log. Awaiting Kevin's 5-minute confirmation, then merge +
push so the soak runs against it.

### Where to look
| Need | File |
|---|---|
| Next tester run (Part A verify + Part B soak) | `TESTER_BRIEF_SOAK.md` |
| What is known-open / not to re-report | `docs/open-items-after-348.md` |
| Mega-session priorities + open DECIDEs | `docs/mega-session-candidates.md` |
| Settings basic/advanced review (Kevin's pass applied, ~16 rows open) | `docs/settings-review-2d.md` / `.csv` |
| World file format + sample export | `docs/world-file-format.md` |
| Roadmap §40–43 (export-hiding, player-vs-creator, occlusion, gate rotation) | `FUTURE_ROADMAP.md` |

### 347–358 in one line each
- **347** QA fixes F1/F2/F4/F6 + physics-lock enforcement + Advanced becomes sandbox-only +
  new Multiplayer tab + Debug tab hides + moon-shadow scale + fixed-shadow night fade.
- **348** F12 piston sprite, F14 pipe emerge, F16 pit-fall position, F7 partial, wrapper cleanup.
- **349** editor viewport clip, real rail↔canvas insets, pit-entry margin (later reverted).
- **350–356** the pit-death hunt: nine builds, five wrong diagnoses. Root cause in **355** —
  the sink offset was `size * 0.75` where `size = unit * zoom` and `unit = cell * DENSITY`, so
  on a dense map the body drew 2–3 CELLS from the pit. **356** feet/depth/burst polish.
- **357** the RIGHT rail was never styled (every palette rule scoped to `#oh-rail`).
- **358** right rail reads from its own edge; its arrows mirror the left rail deliberately.

### 359–361 (branch)
- **359** `js/overhead/overhead-perf.js`: governor (tiers + cap, hysteresis, cheapest visual
  first then a lower cap, never above the designer's cap) + pure pre-launch `estimate()`.
- **360** the cap never reached the runtime: settings were read RAW, never resolved against
  defaults, so any setting newer than the world was silently absent. **Fixed — this affected
  every setting, not just the cap.**
- **361** rolling soak log (`OH_SOAK.dump()` / `.csv()`), leak detection by thirds, timestamped
  governor events.

### Still open
- **Part A has never run** — ~20 visual/behaviour items across 347–361 that no headless test
  can see. This is the real verification gap, not the soak.
- **F7 reflow** partial; **§42** occlusion designed not built; **§43** gate rotation parked.
- Suite: 12 test files touched this round; all green.

---

## PRIOR STATE (2026-08-03) — build 346: WORLD EXPORT / IMPORT (both engines)

Closes the tester's **X2** ("a world built in the app can't be backed up through the UI at all") and the
`OVERHEAD_BACKLOG.md` item 5. Import was built alongside export so the QA fixtures restore through the
real code path instead of a hand-written localStorage entry.

- **`js/world-transfer.js` (new)** — the ONE owner of the file format. v1 wrapper
  `{ steveoExport, world_name, description, game_mode_default, view_mode, exportedAt, world_data }`;
  `unwrap()` also accepts a RAW world object so hand-made fixtures + pre-346 files still import.
  `validateOverhead()` refuses a side-scroll / truncated file instead of half-loading it.
- **Per-world Export** on every Sandbox card (both views) — resolves cloud rows, `LOCAL_WORLDS`, AND the
  offline overhead store (`steveo_overhead_worlds`), which is the one that had no export path at all.
  The old play-HUD `exportWorld()` now delegates to the same resolver.
- **Overhead editor `⬇ Export` / `⬆ Import`** in the command bar. Export writes the OPEN in-memory world
  (unsaved edits included) and is built client-side, so offline and signed-in behave identically. Import
  runs `OH_SETTINGS.migrate()`, clears `worldId` (imported = new until saved) and resets the undo stack.
- **`Import from File` is overhead-aware** — an overhead file used to land in the side-scroll store forced
  to NRM (so it vanished from the Overhead view); it now routes to the overhead store / a sandbox row +
  PUT, never clobbering an existing world (dedupes to "name (2)").
- **Docs + fixture for the tester:** `docs/world-file-format.md`, sample export
  `sample-worlds/Overhead_QA_Test.export.json` (generated from `test/fixtures/overhead-qa-test-world.json`).
- **Tests:** `test/test-world-transfer.js` — 39 assertions (format, wrapper+raw unwrap, filename,
  validation refusals, and a full export→import→`OverheadGame` round trip incl. a legacy no-`schemaVersion`
  file). Registered in `test/run.js`; **full suite green**.
- `TESTER_BRIEF.md` rebuilt for build 346: prior results folded in (D1/I4 PASS, D6 partial, X1/X2), the
  tester's two method traps (screenshot-vs-CSS px 1.2557× scaling; measure the DOM, don't eyeball),
  new section **M** (M1–M11), template items I6/I7, and a suggested order. Also published as an Artifact.

**NOT committed / not browser-tested.** Cache-busters + `sw.js` are bumped to b346.

---

## PRIOR STATE (2026-07-30) — builds 279–297 SHIPPED to `main` ✅; `overhead-redstone-bridge` branch at build 306 — NOT merged, browser-UNTESTED

**SHIPPED to `main` (live):** Overhead builds 279–297 + Campaign MVP.

**Branch `overhead-redstone-bridge` (builds 298–306, NOT merged):** Suite green (1005); harnesses + probe clean.
- 298–305: bridges/drawbridges, redstone (devices/gates/numbered wiring), editor 2.0 (rail, selection/clipboard,
  fill/scatter, painting tools), span bridges + single-unit drawbridge.
- **306:** editor **"Hide above elev"** view filter (build inside mountains); **KEY items** (keys/jewels/
  passcard) → player key-ring; **LOCK block** (key → E → redstone signal; config: accepted keys from map,
  consume, toggle). Complete key→lock→redstone loop.
- **Sample worlds:** `tools/gen-overhead-worlds.js` + 3 validated worlds in `tools/overhead-worlds/` (maze /
  valley / temple) — import via Sandbox ▸ Import from file.

**NEXT:** (1) **Scale-unification pass — the whole model is speced in FUTURE_ROADMAP §39** (CANONICAL): Plan A
block-elevation + tiling + nomenclature (block/subcell/density/level/zoom), independent building/item zoom
ratios, the prefab/structure creator (§31, Plan-B detail inside block entities + custom ramps), mining
(block-mined → subcell-yield → density-as-economy), and grid-lock/snap. (2) DOORS + CHESTS (§38). Then build
the 16 Campaign levels; make a mode (Tower Defense) real. **Read §39 before touching scale/elevation.**

**NEEDS BROWSER PLAYTEST** before merging 298–306 to `main`. (This is a large stack — playtest + merge is due.)

---

## PRIOR STATE (2026-07-29) — `overhead-redstone-bridge` at build 305 (span bridges + single-unit drawbridge)

**SHIPPED to `main` (live):** Overhead builds 279–297 + Campaign MVP.

**Branch `overhead-redstone-bridge` (builds 298–305, NOT merged):** Suite green (1005); harnesses + probe clean.
- 298 bridge+drawbridge+`OH_REDSTONE` · 299 editor painting/fill/reveal · 300 rail 2.0+undo-cam · 301 selection/
  clipboard · 302 redstone devices+gates+TX/RX · 303 numbered Tx/Rx+move+H/D/E+scatter · 304 consistent device
  config+Move/Delete modals+1×1 directional gates.
- **305:** bridges are **SPAN entities** (place from Buildings by clicking two cliffs); the **drawbridge raises
  as one complete unit** (~80° perspective tilt about its hinge); plain bridge = a drawbridge that never moves
  (unified); **per-bridge guardrails** in the modal (world setting = the default). Two-click placement +
  preview; hand/double-click → span modal (rail/draw/rxIds/Move/Delete).

**NEXT (roadmap):** extract side-view `js/redstone.js` onto the shared core (§32). This big overhead stack
(bridges/drawbridges/redstone/editor-2.0) is due a browser playtest + merge to `main`.

**NEEDS BROWSER PLAYTEST** before merging 298–305 to `main`.

---

## PRIOR STATE (2026-07-29) — `overhead-redstone-bridge` at build 304 (consistent device config, Move/Delete modals, 1×1 directional gates)

**SHIPPED to `main` (live):** Overhead builds 279–297 + Campaign MVP.

**Branch `overhead-redstone-bridge` (builds 298–304, NOT merged):** Suite green (1005); harnesses + probe clean.
- 298 Bridge+drawbridge+`OH_REDSTONE` · 299 Editor painting/fill/reveal · 300 rail 2.0+undo-cam · 301 selection/
  clipboard+guardrails→setting · 302 redstone devices+gates+TX/RX · 303 numbered Tx/Rx+device-move+H/D/E+animated
  drawbridge+scatter.
- **304:** consistent device roles (sources auto-numbered; sinks have built-in multi-select receivers); Move +
  Delete in every config modal; hand-click opens the modal (dust → click-to-move); logic gates are now **1×1
  DIRECTIONAL** blocks (AND/NOT/NOR) with an input/output SIDE config, engine routes power by side.

**OPEN — drawbridge single-unit render (Kevin's design Q):** current animated drawbridge tilts PER CELL. Kevin
wants the whole span to rise as ONE unit (a bridge connecting two cliffs, flipping up to rest on one edge).
RECOMMENDATION (see below / next batch): rescope bridges to SPAN entities (from-cliff → to-cliff), unify
"static bridge = a drawbridge that never moves", optionally preset lengths (S/M/L). NOT yet implemented.

**NEEDS BROWSER PLAYTEST** before merging 298–304 to `main`.

---

## PRIOR STATE (2026-07-29) — `overhead-redstone-bridge` at build 303 (numbered Tx/Rx, device move, H/D/E, animated drawbridge, scatter)

**SHIPPED to `main` (live):** Overhead builds 279–297 + Campaign MVP.

**Branch `overhead-redstone-bridge` (builds 298–303, NOT merged):** Suite green (1001); harnesses + probe clean.
- 298 Bridge + drawbridge + `OH_REDSTONE` core · 299 Editor painting/fill/reveal · 300 rail 2.0 + undo-camera
  fix · 301 selection + clipboard; guardrails→world setting · 302 redstone devices + gates + TX/RX config.
- **303:** numbered Tx / multi-select Rx (side-scroll model; auto `txId`, `receives()`); Hand-click a device
  = **move** (config on double-click); **H/D/E** tool keys (clip flips → X/Y; typing guard); **drawbridge
  Animated vs Vanishing** style (~80° perspective raise); **scatter brush** (25/50/75%).

**NEXT (roadmap):** extract side-view `js/redstone.js` onto this shared core (§32); the 2-wide bridge
auto-stamp was dropped (bridges use shapes now). Detail in `DECISIONS_LOG.md`.

**NEEDS BROWSER PLAYTEST** before merging 298–303 to `main` — this is a big stack (bridges, drawbridges,
full redstone with devices/gates/numbered wiring, editor 2.0 with selection/clipboard/fill/scatter).

---

## PRIOR STATE (2026-07-29) — `overhead-redstone-bridge` at build 302 (redstone devices + gates + TX/RX config)

**SHIPPED to `main` (live):** Overhead builds 279–297 + Campaign MVP.

**Branch `overhead-redstone-bridge` (builds 298–302, NOT merged):** Suite green (997); harnesses + probe clean.
- 298 Bridge + drawbridge + grid-agnostic `OH_REDSTONE` core.
- 299 Editor painting (shapes for placeables, fill/bucket, eyedropper, cursors, reveal window, tower 3×3).
- 300 Editor rail 2.0 (Hand/Draw/Erase, highlighting, block swatches, undo-camera fix).
- 301 Selection + clipboard (marquee, double-click select-connected, delete, copy/paste, flip/rotate);
  bridge guardrails → world setting.
- 302 **Redstone devices + gates + TX/RX config:** pressure plate, weight block, piston (solid-when-powered
  barrier), AND + NOT gates; every device can transmit/receive on named channels; Hand-click config modals
  (receiver must name a source). Core v2 = bounded fixpoint with gates. Plate/drawbridge share "gate".

**NEXT (specs in FUTURE_ROADMAP):** §36 drawbridge animated vs vanishing style; §37 scatter brush + 2-wide
bridge stamp; §32 extract the side-view `js/redstone.js` onto this shared core; confirm the "dust = AND"
interpretation. Detail in `DECISIONS_LOG.md`.

**NEEDS BROWSER PLAYTEST** before merging 298–302 to `main`.

---

## PRIOR STATE (2026-07-29) — `overhead-redstone-bridge` at build 301 (selection + clipboard)

**SHIPPED to `main` (live):** Overhead builds 279–297 + Campaign MVP.

**Branch `overhead-redstone-bridge` (builds 298–301, NOT merged):** Suite green (989); harnesses + probe clean.
- 298 Bridge + drawbridge + grid-agnostic `OH_REDSTONE` core (levers/dust/lamps/tx/rx + channels).
- 299 Editor painting: shapes for dust/bridge/ramp, fill/bucket, eyedropper, shift-scroll brush, cursors,
  escape flow, character-scaled devices, tower 3×3, reveal window.
- 300 Editor rail 2.0: Hand/Draw/Erase, light-blue highlighting, block swatches, reorder, Bridge in Terrain,
  Redstone own palette, undo/redo camera-jump fix.
- 301 **Selection + clipboard:** Ctrl-drag marquee (start-elevation), **double-click select-connected** (whole
  bridge run), **Delete** (bridge-only keeps terrain), **Ctrl+C copy → click paste**, **H/V flip + T rotate**,
  Esc unwinds paste→selection→hand→quit. **Bridge guardrails are now a WORLD SETTING** (per-bridge checkbox removed).

**NEXT (specs in FUTURE_ROADMAP §32/§36/§37):** redstone devices (plate/weight/piston/AND/NOT) + TX/RX on all
devices + Hand-click config modals (receiver requires a source); drawbridge animated vs vanishing; scatter
brush + 2-wide bridge auto-stamp. Detail in `DECISIONS_LOG.md`.

**NEEDS BROWSER PLAYTEST** before merging 298–301 to `main`.

---

## PRIOR STATE (2026-07-29) — `overhead-redstone-bridge` at build 300 (rail restructure + undo-camera fix)

**SHIPPED to `main` (live):** Overhead builds 279–297 + Campaign MVP.

**Branch `overhead-redstone-bridge` (builds 298–300, NOT merged):** Suite green (989); harnesses + probe clean.
- **298** Bridge deck + guardrails + redstone-driven **drawbridge**; grid-agnostic `OH_REDSTONE` core (levers/
  dust/lamps/tx/rx + channels).
- **299** Editor painting: shapes for dust/bridge/ramp; **fill/bucket** (G); **Alt-click eyedropper**; Shift-
  scroll brush; shape hotkeys; mode cursors; Escape→Hand→quit-modal; character-scaled devices; tower 3×3;
  **reveal window** world setting.
- **300** Editor rail 2.0: **Hand / Draw / Erase** top buttons, light-blue active highlighting, block swatch
  in the Terrain header, reordered groups, **Bridge+Drawbridge in Terrain**, Redstone own palette, and the
  **undo/redo camera-jump FIX**.

**NEXT (specs captured in FUTURE_ROADMAP §32/§36/§37):** redstone devices (pressure plate / weight block /
piston / AND / NOT, character-scaled) + TX/RX on all devices + Hand-click config modals (receiver needs a
required source); drawbridge `animated` (~80° perspective raise/fall) vs `vanishing` style; double-click
select-connected (whole bridge by type+connectivity, start-cell elevation) → Delete; clipboard mirror/rotate
+ scatter brush; the 2-wide bridge auto-stamp. Detail in `DECISIONS_LOG.md`.

**NEEDS BROWSER PLAYTEST** before merging 298–300 to `main`.

---

## PRIOR STATE (2026-07-29) — builds 279–297 SHIPPED to `main` ✅; builds 298–299 (Bridge/Redstone + Editor painting) on `overhead-redstone-bridge`

**SHIPPED to `main` (live):** Overhead builds 279–297 + Campaign MVP.

**Branch `overhead-redstone-bridge` (builds 298–299, NOT merged):** Suite green (989); harnesses + probe clean.
- **298 — Bridge + Redstone core:** grid-agnostic `OH_REDSTONE` (levers/dust/lamps/tx/rx + named channels);
  bridge deck (walk-over-gap), guardrails, and a **drawbridge** that closes on a redstone channel (lever+
  drawbridge default to "gate"). Editor Bridge & Redstone palette.
- **299 — Editor painting tools:** shapes for dust/bridge/ramp; **fill/bucket** (G, 4-conn); **Alt-click
  eyedropper**; **Shift-scroll brush size**; shape hotkeys B/L/R/O/G; mode **cursors** (pen/hand/arrow);
  **Escape → Hand → save/quit modal**; character-scaled levers/lamps; **tower 3×3**; **"Always show player"
  reveal window** (world setting). Design calls + deferred **selection/clipboard** (batch 2) in FUTURE_ROADMAP §37.

**Next (editor batch 2, §37):** marquee select (Ctrl-drag, current-elevation) + Delete + Ctrl+C + click-paste,
the 2-wide bridge auto-stamp, and more tools (elevation brush, replace-all, clipboard mirror/rotate, prefab
library). Plus redstone device set + config modals (§32). Detail in `DECISIONS_LOG.md`.

**NEEDS BROWSER PLAYTEST** before merging 298–299 to `main`.

---

## PRIOR STATE (2026-07-29) — builds 279–297 SHIPPED to `main` ✅; build 298 (Bridge + Redstone core) on `overhead-redstone-bridge`

**SHIPPED:** the whole Overhead engine (builds 279–297) + Campaign MVP (278) fast-forwarded to `main` and
pushed (0d05667) — live on Railway. (Campaign server features need `server/sql/campaigns.sql` in Supabase;
the Overhead engine is client-side.)

**IN PROGRESS on branch `overhead-redstone-bridge` (build 298):** Suite green (989); harnesses + probe clean.
- **Redstone core** (`overhead-redstone.js`, `OH_REDSTONE`): grid-agnostic, pure, headless-tested (12) — levers/
  buttons, dust wire, lamps, tx/rx, and a named-CHANNEL table (the §32 foundation; channels are the reuse seam).
- **Bridge tool:** walk-over-gap deck spanning pits/chasms; Guardrails on/off (block/allow falling off the sides);
  **Drawbridge** starts open, closes while its redstone channel is powered. Lever + Drawbridge default to channel
  "gate" so a lever flip raises/lowers the span. Verified end-to-end headless.
- Editor "Bridge & Redstone" palette (Bridge/Lever/Dust/Lamp) + place/erase/undo/ghosts. Levers flip on E.
- **Next redstone follow-ups:** custom channels, more devices (repeaters/gates/buttons), config modals, the
  "2-wide preset" bridge stamp, and extracting the side-view `js/redstone.js` onto this core. Detail in `DECISIONS_LOG.md`.

**NEEDS BROWSER PLAYTEST** before merge to `main`.

---

## PRIOR STATE (2026-07-29) — OVERHEAD ENGINE dodge/melee/death micro-fixes (build 297) on branch `overhead-engine` — SHIPPED to `main`

Small pre-push polish. Suite green (977); harness + render smoke + probe clean.
- A **dodged ranged bolt flies on** past the player (flagged, not destroyed).
- The **held weapon disappears during a melee swing** (the enlarged swinging weapon stands in).
- **Death-burst pieces scatter outward and settle in place** (no downward gravity — top-down correct) then fade.
- Detail in `DECISIONS_LOG.md`. Prior builds 279–296 unchanged below.

**Kevin is browser-testing this, then pushing `overhead-engine` live.** 19 overhead builds (279–297) stacked. Still deferred: bridge (§36), redstone (§32), seamless caves (§35b).

---

## PRIOR STATE (2026-07-29) — OVERHEAD ENGINE number-key elev / jump-dodge / weapon-accurate melee arc + pit-death polish (build 296) on branch `overhead-engine` — NOT merged, browser-UNTESTED

Tenth playtest batch. Suite green (977 assertions); headless combat harness + render smoke + probe clean.
- **Editor:** number keys 0-8 set the paint elevation directly.
- **Jump-to-dodge:** `dodgeAttacks` + `dodgeMobs`, each none | single (any jump) | double (double-jump only).
- **Melee:** swing draws the ACTUAL held weapon; F melee-swings a held weapon (click still fires); damage cone
  is a configurable `meleeArc` (default tighter 50°) shared by hit + visual; weapon scales to fill wider arcs.
- **Pit death:** flailing figure starts at overhead size and sinks fully into the pit before bursting.
  Detail in `DECISIONS_LOG.md`.
- **Still deferred:** bridge item (§36), redstone-in-overhead (§32, next big rebuild), seamless
  cave↔surface (§35/§35b).

**NEEDS BROWSER PLAYTEST** before merge. 18 overhead builds (279–296) are stacked on this branch.

---

## PRIOR STATE (2026-07-29) — OVERHEAD ENGINE jump-clear / sprint / melee swing / pit-lava death + editor ghost+undo (build 295) on branch `overhead-engine` — NOT merged, browser-UNTESTED

Ninth playtest batch. Suite green (977 assertions); headless gameplay + render harnesses + probe clean.
- **Jump clearance:** `jumpClear` (default 1) + `doubleJumpClear` (+1), additive — a jump can vault/mount
  walls up to N blocks; a walk still can't climb (separate). **Sprint** on Shift (× multiplier). **Melee
  swing** sweeps a weapon through the cone.
- **Pit mode** `deadly` | `block` (block is impassable even in GOD). Pit death: front-facing flailing figure
  SHRINKS ~1s then bursts (family-friendly). **Lava insta-death** option. maxStepDown gains `0`.
- **Editor:** placement GHOST of the selected tool follows the cursor (red-X when a building won't fit);
  undo/redo track only content + settings (never zoom/scroll) and show a notification of what changed.
  Erase already honours the brush size. Detail in `DECISIONS_LOG.md`.
- **Still deferred:** bridge item (§36), redstone-in-overhead (§32, next big rebuild), seamless
  cave↔surface cross-effects (§35/§35b).

**NEEDS BROWSER PLAYTEST** before merge. 17 overhead builds (279–295) are stacked on this branch.

---

## PRIOR STATE (2026-07-29) — OVERHEAD ENGINE pits / death FX / cliff safety + light polish (build 294) on branch `overhead-engine` — NOT merged, browser-UNTESTED

Eighth playtest batch. Suite green (977 assertions); draw-probe + headless safety/render harnesses clean.
- **Deadly PIT block** (`pit` terrain): fall in → die; a world toggle (`pitsDeadly`) makes pits harmless
  hard OBSTACLES instead. **Family-friendly DEATH animation:** player bursts into its own coloured sprite
  blocks (no gore), then Game Over. **Cliff-fall guard** (`blockCliffFall` default ON, `maxStepDown` 1):
  a walk can't drop off a high platform unless near a ramp; pits stay deadly regardless.
- **Lava/light fix:** big lakes now light UNIFORMLY (stride-sampled — the old cap lit only the top). New
  UNIVERSAL `lightRange` + per-object `lavaBrightness`/`glowstoneBrightness`; no more additive blowout.
- **Sun/moon shape** circle|square; **shadows fade** out/in across the dawn/dusk swap (no snap). Erase
  already honours the brush size (confirmed). Detail in `DECISIONS_LOG.md`.
- **Deferred with plans:** bridge item (§36), redstone-in-overhead (§32, the next big rebuild), and the
  seamless cave↔surface cross-effects design (§35/§35b — one active env + world-global channels).

**NEEDS BROWSER PLAYTEST** before merge. 16 overhead builds (279–294) are stacked on this branch.

---

## PRIOR STATE (2026-07-29) — OVERHEAD ENGINE ramps-forgiving + DAY/NIGHT depth (build 293) on branch `overhead-engine` — NOT merged, browser-UNTESTED

Seventh playtest batch. Suite green (975 assertions); draw-probe + a render smoke-test clean.
- **Ramps fixed (for real):** a headless collision harness proved the climb logic was already correct in
  every config — the failure was PLACEMENT landing a cell off from the collision edge (the 2.5D up-left
  offset). Ramps are now **forgiving**: `_rampNear` counts a ramp on the cell OR any orthogonal neighbour,
  used for both current + target cells. Adjacent + one-cell-off both climb; no-ramp control still blocks.
- **Day/Night reworked:** warm dusk/dawn tint REMOVED (clean cool fade); nights up to near-black
  (`nightDarkness` 0.95); faint **toggleable sun/moon disc** tracks the sky; **dynamic elevation shadows**
  from cliff edges away from the body (offscreen-composited, edge-only, toggleable) draw regardless of the
  disc; **glowstone + lava are light sources** punching through the dark (configurable `lightRadius` +
  `lightBrightness`). New pure `OH_DAYNIGHT.body`/`shadow` (27 tests total).
- **Underground/negative elevations:** design-answered — recommend a SEPARATE cave map (day/night off +
  player-centred light) over negative elevations; both written up in FUTURE_ROADMAP §35. Detail in `DECISIONS_LOG.md`.

**NEEDS BROWSER PLAYTEST** before merge. 15 overhead builds (279–293) are stacked on this branch.

---

## PRIOR STATE (2026-07-29) — OVERHEAD ENGINE playtest fixes + DAY/NIGHT cycle (build 292) on branch `overhead-engine` — NOT merged, browser-UNTESTED

Sixth playtest-feedback batch + first slice of §34 (day/night). Suite green (969 assertions); draw-probe clean.
- **Map not hidden by the top bar:** editor render reserves a scaled top inset (content offset + camera
  clamp + mouse-pick offset), so the map + its top edge indicator are fully visible.
- **Tree trunks / thin walls block reliably:** `_moveWithCollision` samples the leading edge at the centre
  + two lateral points (block if any solid); ramps use centre-only so a wide player still climbs a narrow ramp.
- **Ramps climb again:** undo/redo (`_snapshot`/`_restore`) now serialize `ramps` + `settings` (were dropped).
- **Grey mob ring = map-creator only:** removed from the runtime `_drawMob`; live game shows just a shadow.
- **Pipe beside a statue teleports on E:** portals/pipes resolve E before the decoration notice; unlinked pipe says so.
- **NEW Day/Night cycle:** pure `OH_DAYNIGHT` (phase/sky/label/detectMultiplier, 21 tests) → ambient tint
  (midnight-blue→warm dawn→clear noon→dusk), sun/moon clock, +up-to-40% night mob sight. Atmosphere world
  settings (`dayNight` off by default, `dayLengthSec`, `dayStart`, `nightDarkness`). Editor stays in daylight.
  Dynamic elevation shadows + night lamps still deferred (FUTURE_ROADMAP §34). Detail in `DECISIONS_LOG.md`.

**NEEDS BROWSER PLAYTEST** before merge. 14 overhead builds (279–292) are stacked on this branch.

---

## PRIOR STATE (2026-07-29) — OVERHEAD ENGINE move-from-config / weapon switch / map-edge / somersault facing (build 291) on branch `overhead-engine` — NOT merged, browser-UNTESTED

Fifth playtest-feedback batch. Suite green (948 assertions); draw-probe clean.
- **Move from config modals:** portal/pipe, Goal Star, Player Spawn modals gained a **✥ Move** button →
  arms Hand-tool move with a "click to move" ring; next click relocates the object.
- **Weapon switch:** collected `player.weapons[]` + **Q / Tab** to cycle + a compact bottom HOTBAR HUD.
- **Somersault faces the aim direction** (was always down-right).
- **Leaves = one floating level with real height** (gap below) at any elevation; still pass-under.
- **Bolder map-edge:** hazard stripes PLUS a dashed magenta boundary line right on the world edge.
- **Walking-climb:** confirmed collision blocks a 1-level walk-up when climb=None; legacy autoClimb fold
  removed, `rules {}` on new worlds, `climbLevels` coerced. Residual "climb" feel = the 2.5D up-left
  elevation OFFSET decoupling a block's drawn top from its collision cell (illusion) — lever is `elevOffset`.
- **DEFERRED (Kevin OK):** block-built portals + block-built buildings → future **Skin Editor** tool (see
  FUTURE_ROADMAP §31). Detail in `DECISIONS_LOG.md` (Move-from-config / Weapon Switch / Map-Edge / Somersault).

**NEEDS BROWSER PLAYTEST** before merge. All 12 overhead builds (279–291) are stacked on this branch.

---

## PRIOR STATE (2026-07-29) — OVERHEAD ENGINE crash fix + view filters (build 290) on branch `overhead-engine` — NOT merged

- **CRASH FIXED:** the build-289 portal draw used an undefined `cs` → any world with a portal (incl. the
  demo) threw mid-render, hiding mobs/buildings/items and breaking Test. Now uses the block width.
- **View filters** (editor top bar): show/hide Buildings / Mobs / Items.
- **Elevation-map view:** recolours terrain purple(low)→pink(high) with level numbers — a design aid.
Detail in `DECISIONS_LOG.md` (Overhead Engine — Crash Fix + View Filters). The full deferred list is in
the prior entry (Solid Buildings / Vertical Portals / Somersault / Castle).

---

## PRIOR STATE (2026-07-29) — OVERHEAD ENGINE solid buildings / vertical portals / somersault / castle (build 289) on branch `overhead-engine` — NOT merged, browser-UNTESTED

Fourth feedback batch. Suite green.
- **All buildings SOLID** (portals used via proximity + E; teleport lands in front of the dest).
- **Jump no longer mounts 1-walls** (invalid-elevation landing bounces back).
- **Portal = standing vertical 4×5 obsidian frame** (4×1 footprint) + Two-way link. **Leaves** = floating
  canopy (no leaf-sides through low elevations). **Mob grey outline.**
- **Double jump = somersault** (spin kept as an option). **Hand tool moves mobs/items** (click-select, click-move).
- **Ramp = right-triangle prism** (90° face at the high edge). **Buildings blockified**: healer=hospital,
  shop=$ sign, TD core=CASTLE (6×6), MOBA nexus=crystal, pipe=block edges, statue=grey top-down character.
Detail + the **full deferred list** in `DECISIONS_LOG.md` (Overhead Engine — Solid Buildings / Vertical
Portals / Somersault / Castle). Roadmap §35 End Portals added.

---

## PRIOR STATE (2026-07-29) — OVERHEAD ENGINE portals/detection/jump polish (build 288) on branch `overhead-engine` — NOT merged, browser-UNTESTED

Third feedback batch. Suite green.
- **Test-mode God toggle** (invincible). **Mob detection** = absolute blocks setting (default 10),
  replacing the scale factor.
- **Portals/pipes** = proximity + **E** button (both), with a "Press E" glow prompt — fixes the trigger
  offset + accidental walk-through. Portal drawn as a **4×5 obsidian frame** w/ purple centre + **Two-way** link.
- **Trident/boomerang** rebound off too-high walls. **Double jump** is a setting (default on) + spin.
- **Trees** relative to ground elev (leaves only 3 & 4). **3D ramp wedge.** Hazard-striped **map-edge**
  indicator. Buildings non-solid for now.
Detail in `DECISIONS_LOG.md` (Overhead Engine — Portals / Detection / Jump Polish). Deferred: prism ramp,
day/night+shadows (§34), block-based solid buildings, scrollbars.

---

## PRIOR STATE (2026-07-29) — OVERHEAD ENGINE bug fixes + stacked-cube terrain + hand tool (build 287) on branch `overhead-engine` — NOT merged, browser-UNTESTED

Second feedback batch. Suite green. Fixed 3 blocking bugs + big render change + editor tools.
- **Mobs move** now (they lacked an `elev` field → collision NaN-blocked them) + wander when idle.
- **Portals/pipes usable:** enter-type buildings (portal/pipe/shop) walkable, all others solid.
  **E** uses a pipe; portals trigger on walk; both glow purple.
- **Walls block:** collision model changed — raised NON-leaves terrain is SOLID (climb only within the
  climb setting / via a ramp); `leaves` canopy is pass-under (trees block shots at the trunk only).
- **Stacked-cube terrain:** each elevation offsets the top ¼-block up AND left, with darker south+east
  faces — the diagonal depth Kevin asked for. Entities lift to match.
- **Editor:** items render as the real item at player scale; portal #s enlarged/always; active-elevation
  highlight; elevation 0–8; NEW **Hand** tool (pan + click-to-configure, replaced Configure).
- **Trees:** trunk levels 1–2, leaves 3–4 (never covering the trunk). **Ramps** orient to the gap.
- **Deferred:** edge scrollbars (hand/arrows cover it); full prism-ramp geometry (directional wedge shipped).
Detail in `DECISIONS_LOG.md` (Overhead Engine — Bug Fixes + Stacked-Cube Terrain + Hand Tool).

---

## PRIOR STATE (2026-07-29) — OVERHEAD ENGINE mobs-move / LOS attacks / diagonal shadows (build 286) on branch `overhead-engine` — NOT merged, browser-UNTESTED

Playtest feedback. Suite green.
- **Mobs move now:** detection ~10 player-blocks + random **wander** when idle (was ~180px, too short).
- **Pipe + Goal 2×2.** Pipes use the **Action (E)** button; portals trigger on walk; both ends **glow
  purple** on teleport. Portals/pipes **numbered** (#N badge + "#N (c,r)" in the destination picker).
- **Attack wall-height LOS** setting (default 2): obstacle/target 2+ levels above the attacker blocks the
  shot; DOWN always works (high ground behind a 1-wall = safe). Applies to melee + all projectiles.
- **Diagonal shadows:** cliff sides render as slanted parallelograms → elevation reads diagonally.
- **Collision confirmed:** elev+1 blocks at climb 0. OLD worlds (pre-284) resolve legacy autoClimb=1 →
  set climb to 0 in ⚙ Settings. (A "wall" = elev+1; elev+2 is an overhang you pass under, per the model.)
- **Deferred (roadmap §33/§34):** full pipe climb-in/out animation; day/night + dynamic elevation shadows.
Detail in `DECISIONS_LOG.md` (Overhead Engine — Mobs Move / LOS Attacks / Diagonal Shadows).

---

## PRIOR STATE (2026-07-29) — OVERHEAD ENGINE perf cache + shapes/prefabs + building models + config (builds 284–285) on branch `overhead-engine` — NOT merged, browser-UNTESTED

Big feedback batch (4 chunks). Suite green.
- **Perf (density answer):** static terrain is pre-rendered ONCE to an offscreen canvas and blitted per
  frame → dense grids now cost the same as density-1 at runtime. (Not the world-map creator; it was the
  per-cell redraw.)
- **Elevation settings:** `climbLevels` (default 0) + `playerHeight` (default 1); blocks within
  [climb+1..height] above = wall, taller = overhang. **Ramp + Ladder** placeables climb any delta.
- **Shape tools:** line / rectangle / circle-oval + fill/outline (brush = outline width), live preview.
- **Tree prefab** (trunk + 5-Ø leaf canopy overhang). **Pipe** building (acts like a portal).
- **Building models:** distinct pre-built default models at real footprints (Portal 1×4, Healer/Shop 4×4,
  Save 2×2, Spawner 3×3, Statue/Tower 2×2, Nexus/Core 5×5) + a `skin` field (default; skin builder → roadmap §31).
- **Config modals** (⚙ Configure tool): portal/pipe destination or ends-level(goal); goal-star colour;
  spawn↔portal link. Runtime teleports / wins / emerges accordingly.
- **Deferred:** redstone-in-overhead (roadmap §32, LARGE).
Detail in `DECISIONS_LOG.md` (Overhead Engine — Perf Cache + Shapes/Prefabs + Building Models + Config).

---

## PRIOR STATE (2026-07-29) — OVERHEAD ENGINE settings + perf + test-exit (build 283) on branch `overhead-engine` — NOT merged, browser-UNTESTED

Playtest-feedback pass. Suite green.
- **Separate Overhead World Settings menu** (⚙ in the editor, `js/overhead/overhead-settings.js` →
  `OH_WORLD_SETTINGS`; NOT a side-view tab). Per-world tunables on `world.settings`: player speed,
  auto-climb, jump float/scale, **weapon speeds** (crossbow/trident/boomerang) + boomerang range/width,
  melee reach, mob detection ×, control scheme + aim-lock, default zoom, hidden-indicator. Runtime reads them.
- **Faster weapons** by default (boomerang/trident 12, trident-return 15, crossbow 13) + tunable above.
- **Density fixes:** gameplay speed/size now in density-independent UNITS (fixes the player crawling at
  density 4); brush interpolates a LINE between samples (fixes spotty drag); tile renderer skips
  clip/texture/bevel below ~13px (fixes dense-grid slowdown).
- **Test mode:** Esc (or a top-left "◀ Designer" button) returns to the editor instead of the pause menu.
Detail in `DECISIONS_LOG.md` (Overhead Engine — Settings Menu + Perf + Test-Exit).

---

## PRIOR STATE (2026-07-29) — OVERHEAD ENGINE art rev 3 + editor fix (build 282) on branch `overhead-engine` — NOT merged, browser-UNTESTED

Second visual pass + fixed the editor. Suite green.
- **Editor menu FIX:** the build-280 rewrite never created the toolbar div (render guard `if(!bar)return`
  ate it → "vanished"). Rebuilt as a TOP command bar (Undo/Redo/Zoom/Test/Save/Exit) + a LEFT hover-rail
  (Brush/Elevation/Erase + Terrain/Buildings/Mobs/Items tabs opening on hover). Save/Exit at top as before.
- **Limbs connected** (arms=shirt, legs=pants, small hands/feet — no floating parts) + a waist block;
  feet point forward in line with the hips. **Legs follow movement; head/arms/weapon follow aim** (decoupled).
- **Spider:** legs only on the two sides (4 each); leg-free front edge with the red eyes.
- **Blocks:** side = ¼-block per elevation level, noticeably darker, divider line per level; **tops one
  uniform colour** (no elevation lightening — depth reads from the side).
- **Jump:** floats UP + scales up (was dipping down).
- **Thrown trident/boomerang render as the weapon (leave the hand); boomerang bends its return to the
  player's live position.**
- Art artifact updated → rev 3 (same URL). Detail in `DECISIONS_LOG.md` (Overhead Engine — Art Revision 3).

---

## PRIOR STATE (2026-07-29) — OVERHEAD ENGINE art rev 2 (build 281) on branch `overhead-engine` — NOT merged, browser-UNTESTED

Visual feedback pass on top of build 280 (below). All in the shared renderers so editor + runtime +
the art artifact match. Suite green.
- **Player:** smaller head (~half the sprite); arms AND legs swing fore/aft in opposite phase (natural
  gait); **always holds a weapon** pointing where it aims (sword/bow/trident/boomerang/pickaxe; **default
  pickaxe**; Campaign pulls the level-finish weapon via `opts.playerWeapon`, wired now).
- **Mobs:** zombie = player body + green skin (bare-handed); skeleton = bony (front eye sockets, thin
  neck→parallel shoulder-bone, narrow limbs, bow); spider = square + 8 legs + red front eyes.
- **Blocks:** 3D extrusion — bevelled top + darker extruded side, covered by the block in front (only
  front/edge blocks + raised drops show a side; side height meets the block in front). Runtime + editor.
- **Art artifact updated (same URL):** player × each weapon, the 3 new mobs, a 3D block scene.
Detail in `DECISIONS_LOG.md` (Overhead Engine — Art Revision 2). Browser-test the sprite/mob/block look.

---

## PRIOR STATE (2026-07-29) — OVERHEAD ENGINE playtest pass 1 (build 280) on branch `overhead-engine` — NOT merged, browser-UNTESTED

Kevin playtested the MVP foundation (below) and gave a batch of refinements; all built on the same
`overhead-engine` branch. Suite green (133 overhead assertions; +11 for weapons). **Browser-untested.**

**This pass (build 280) — his 3 answers: server-backed storage · top-down shaded tiles · build the art artifact.**
- **Persistence + browser toggle:** overhead worlds now save to the **server** `worlds` table
  (`viewMode:'overhead'`, zero server change — create row then PUT verbatim). The Sandbox browser has a
  **Side-scroll / Overhead** toggle; Edit routes overhead worlds to `OH_EDITOR`; rename/copy/delete work.
- **Density FIXED:** baked into a finer grid at creation (`cell = 32/density`) → denser = more/smaller
  blocks in the same map area. **No map-size limits.** (The blue square Kevin saw was the editor's P1
  spawn marker, not the player.)
- **Friendlier creation modal** (dropdowns; Custom → W×H inputs) replacing the prompt() chain.
- **Left tool-rail palette:** Undo/Redo, Brush, Elevation, Erase on top; hover-slide **Terrain / Buildings
  / Mobs / Items** tabs; selecting sets tool+item. Spawn + Goal moved into Buildings.
- **Full terrain SET** (Grass…Leaves, 20 blocks) as top-down shaded tiles (`OH_PALETTE` + shared
  `drawTerrainTile`). **Elevation-relative collision** (+1 = wall, +2 = overhang you pass under & are
  hidden beneath; lava = hazard; replaces separate decorations) + optional `showHiddenIndicator`.
- **Mobs** (zombie/skeleton-ranged/spider) + **weapon items**: `overhead-weapons.js` (pure, 11 tests) —
  crossbow straight bolt, trident throw+recall (RMB, returns to current pos), **boomerang oval arc**
  out-to-aim-and-back.
- **Undo/redo, Shift+click elevation-scoped erase, keyboard shortcuts** (`[ ]` elevation, `− =` zoom,
  Ctrl+Z/Y) in `OH_EDITOR.KEYS` (bindable-ready).
- **New player sprite** per Kevin's spec (square hair head, shirt shoulders, offset arm-swing, legs
  grounded to distance) via the **`OH_SPRITE` colour palette** (future user-config; **2D should share it**).
- **Art-options Artifact** published (live-rendered player A/B/C, mob blocky/detailed, block
  flat/shaded/bevel) — WYSIWYG, using the same render code, for Kevin to pick a direction per row.

**Browser-test priorities:** density (make a 4× world), the Side/Overhead toggle + save/edit/delete
round-trip, elevation collision + hide-under, boomerang/trident feel, and the new player walk (vs the
Artifact options). Full detail in `DECISIONS_LOG.md` (Overhead Engine — Playtest Pass 1).

---

## PRIOR STATE (2026-07-28) — OVERHEAD ENGINE MVP FOUNDATION (build 279) BUILT on branch `overhead-engine` — NOT merged, largest session yet, browser-UNTESTED

The **Overhead Engine** ("largest single session in the project's history", by Kevin's choice) is BUILT
**depth-first** on branch `overhead-engine` (off `campaign-mode-mvp`, so §9 can hook the Campaign Builder).
A shared top-down substrate — NOT a physics fork — for Campaign's overworld map, Tower Defense, MOBA, etc.
as rulesets on one engine. Suite green (+122 overhead assertions across 4 new test files).

**SHIPPED + headless-tested (the reusable foundation, built with pathfinder-level rigor):**
`js/overhead/overhead-{grid,elevation,buildings,map,movement,controls,combat,modes,campaign-map}.js` —
grid/zoom (fixed size+density, object-scale mode, live master zoom, smooth coords, scrolling clamped
camera), elevation (2.5D staircase Y-offset + cliff + autotile edge bitmask + draw-order sort + tiered
auto-climb + configurable `maxElevationJump` default 0; LOS is an architected STUB only), building taxonomy
registry, Map-vs-World version-linking (snapshot default + non-committing Test overlay + Relink + placement
validation) + Extract-Map tool (mode-aware validity matrix), jump (parabola lift, speed-carry, double-jump,
hazard/gap-only landing edge-detection) + simple limb anim, three control schemes (Move-to-Aim / Twin-Stick /
Free-Aim, world-force vs player-pref, weapon twin-stick override), cone/radius/line combat, mode rulesets +
two-tier tower placement, top-down auto-path A*.

**SHIPPED, browser-UNTESTED (canvas/DOM):** a **playable `OverheadGame` runtime** — Sandbox → **"🗺 Overhead
Demo"** (rendered elevation/cliffs/autotile, scrolling zoomable camera, 3-scheme movement + jump + limb anim,
cone melee, mobs three-state, Goal-Star win). A **functional `OH_EDITOR`** authoring loop — Sandbox → **"🗺 New
Overhead World"** (paint terrain/elevation, place goal/spawn/buildings/mobs/items, brush, elevation selector,
zoom/pan, Test, Save/Load localStorage). A Campaign Builder **"Create World Map"** entry (§9).

**PARTIAL / next-session** (data or hooks present; full loop not wired): TD tower-firing + MOBA lanes/cores/
minion runtime (rulesets + tower-placement constraints proven), Arena-overhead translation, redstone-in-
overhead, the Campaign World-Placement mode + lane preview (auto-path proven; node-binding UI partial),
explicit stairs/ramps placeables, editor refinements (hover tabs / MRU / line-drag brush / path & redstone
placement / server publish), Test-Mode Relink + Extract-Map editor buttons.

**Kevin's 4 up-front answers:** depth-first · jump hazard/gap-only (`maxElevationJump` 0, configurable) ·
twin-stick override = indicator+transition · limb anim = simple best-effort. **Key finding:** the side-view
Wayfinding pathfinder was NOT directly reusable for overhead node-connecting (side-view standable/gravity/
jump-arc model) → a lean top-down A* was written instead. All detail + the 5 §19 resolutions + the honest
shipped/partial/not-built breakdown are in `DECISIONS_LOG.md` (Overhead Engine entry); the standing spec +
status in `FUTURE_ROADMAP.md` §24; the new NPC/Villager idea in §30.

**Least-confident, test-here-first (per §20.5):** elevation rendering + autotile look, jump edge-detection
landing feel, overhead limb animation, editor paint/zoom/pan feel, and the three control schemes in real play
(the maths under all of these are headless-proven; the FEEL is browser-only). **Branch order:** `overhead-
engine` sits on top of `campaign-mode-mvp` (also unmerged) — decide the merge order with Kevin.

---

## PRIOR STATE (2026-07-28) — CAMPAIGN MODE MVP (build 278) BUILT on branch `campaign-mode-mvp` — NOT merged, awaiting Kevin's end-to-end playtest

Built the entire **Campaign MVP** per Kevin's "Campaign Mode MVP" brief, on a NEW branch `campaign-mode-mvp`
(off `main` @ f816694) per his instruction to "build in a new branch and merge as we confirm working."
Headless suite green (added `test/test-campaign.js`, 28 assertions). Everything is **additive/opt-in** — no
existing mode changed; the game.js hooks are all guarded by `game._campaign`.

**What it is:** a lightweight **Campaign container** (NOT a new physics mode) that sequences existing
**Platformer** worlds into **Zones** (each ending in a computed **Boss World** = last in `worldOrder`), routes
their coloured **Goal-Star exits**, and tracks progression. Goal Star 1 (Gold) = next in sequence (or, on a
Boss World, → next Zone / campaign-complete); Goal Stars 2–10 = creator-routed **Bonus** (new out-of-sequence
world) or **Connect** (link to any world in the campaign) exits, with optional **hidden/secret** routes and
per-destination entry points. Reuses the Phase-1 `GOAL_COLORS` / `game._wonExitColor` (builds 67–72) as the
routing key and the Arena spawn-point placeable as entry points.

**New files:** `js/campaign-model.js` (pure model + routing + publish validation), `js/campaign-api.js`
(authedFetch client), `js/campaign-builder.js` (Sandbox-accessible DOM overlay — zone tabs, guided [+] flows,
validation gate, publish), `js/campaign-tracker.js` (per-zone dots/lines progression view — completion screen
+ pause menu; hidden-until-discovered secrets; optional bg image), `js/campaign-play.js` (runtime — boots each
world as a Platformer Game, routes exits, carry-over, lives, progress save), `js/campaign-select.js`
(dashboard → Campaign screen). Server: `server/campaign-routes.js` + `server/sql/campaigns.sql` (`campaigns`
+ `campaign_progress` tables). Integration: additive game.js hooks (`options.campaign`/`campaignCarry`/
`campaignEntry`; win + `_doRespawn` hooks; `campaignSnapshot`/`_applyCampaignCarry`/`_applyCampaignEntry`),
a "🗺 Campaign Progress" pause-menu button, dashboard Campaign card, and a "🎬 Campaign Builder" button on the
Sandbox browser.

**Kevin's 3 up-front answers (2026-07-28):** publish account = **`krtaylor@gmail.com`** (hard-coded
`ADMIN_EMAIL`, server-enforced, one campaign live at a time); storage = **server-backed Supabase**; tracker =
**both** completion-transition + pause-menu. All §14 interpretations resolved + logged in `DECISIONS_LOG.md`.

**Carry-over (§7):** inventory/weapons = true carry (restored onto the fresh player); score = best-ever per
world (total = sum); emeralds/points/lives = running accumulators; health resets each world; `resetInventoryAt`
(never/per-world/per-zone) clears carry + running totals at boundaries. **Flagged MVP simplification:** running
emeralds/points are tracked in progress + shown on the tracker but NOT re-injected into a level's own emerald
counter. Lives default 3 → game-over (Restart offered) when a death occurs at 0.

**BEFORE it works: run `server/sql/campaigns.sql` in the Supabase SQL editor** (creates the two tables), and
the server needs a Railway deploy for the new routes.

**Ship path:** `node test/run.js` (green) → **Kevin playtests end-to-end** (create Campaign → Zone → sequence
worlds → bonus/connect routing → validation gate → publish → play through with carry-over + tracker + lives) →
`git checkout main && git merge campaign-mode-mvp` → push → Railway deploys. **Browser-UNTESTED** (all the
canvas/DOM/round-trip pieces are inherently browser-only; the model/routing/validation logic is what's proven
headlessly). Full detail + assumptions in `DECISIONS_LOG.md` (Campaign MVP entry); roadmap updates
(Overhead Engine §24, Designer Wizard §25, screen capture §26, image-to-block §27, manual save §28, multi-user
publishing §29) in `FUTURE_ROADMAP.md`.

---

## PRIOR STATE (2026-07-28) — MOVING PLATFORMS playtested + wrapped up (builds 254–277) SHIPPED to `main` + deployed ✅

Everything through **build 277** is live on Railway (`origin/main` @ f816694; GAME_VERSION "v3 build 277";
sw cache v277; all 62 `?v=b277` tags). Full headless suite green throughout. This run took the moving-platform
core (245–253) through playtest-driven fixes and then added the remaining features — the platform system is now
considered **feature-complete**.

**Playtest fixes + moving-redstone (254–268):** config MODALS/popups for every new block (replaced multi-click),
rail draft dots now show live, Open/Closed loop is automatic (endpoints coincide), angled rails + travel tubes,
smoother vertical/diagonal ride with persistent rider attachment + edge-grab that travels with the platform,
animated platform DESTRUCTION (shatter debris) with damped bounce, Launch Ramp made directional + power-tunable
(1.0×+), and the big **moving-redstone** effort: redstone rides + functions on a moving platform. Root causes
fixed for the "lamp cross-lighting" saga = stale `getAt` index (`redstone.reindex()`), rail-vs-anchor cell offset
(`_platCell`), collision-safe re-key, and hardcoded chain delay → `_rsStepFrames()` + INSTANT propagation while a
platform carries redstone. **All-sink conduction** (lamps/trapdoors/pistons conduct); **"instant"** redstone speed
option, moved to the World tab.

**Feature builds (269–277):**
- **269 Delete Whole Platform** — Anchor modal button that purges the whole build + all its redstone (fixed the
  orphaned-component class behind the cross-lighting; plain "Remove" only unbinds).
- **270 Weight Sensor** (`BLOCK.WEIGHT_PLATE`) — solid stand-on-top block, players/mobs/both trigger; smooth
  platform-surface detection (no flicker); also fixed pressure-plate-on-platform flicker.
- **271 Conduct toggle on every device + block SKINS** — conduct network (`_applyConductGroup`, instant flood,
  relay gated to explicit conduct so untouched sinks keep 265 behavior); per-block `skin` field (weight/plate)
  rendered in editor+play; PNG-upload-ready.
- **272 Animated skins** — Anchor→Wheel (spins with travel), Direction→Pointer/Steering (faces movement).
- **273 Sticky config + palette reorg** — next placed block inherits last config; "Overworld"→"World" tab now
  holds nether blocks (nether-tinted icons, palette-only); new "Red Stone" tab (dust→sources→Tx/Rx→sinks→logic).
- **274** sticky config extended to brush + Shift-drag placement (`_ensureRsComponent`).
- **275** fix: platform lamps turning red/off while moving (colour snapshot `cell.lampColor`).
- **276** Tier-1 polish — anchor/direction skins render in the editor; lamp on+colour read from captured component.
- **277 BRANCHING RAILS / Rail Switch** (`BLOCK.RAIL_SWITCH`) — pivot + 2 routes, rotates A↔B (flips on listen
  channel OR adjacent redstone), with rail-to-rail hand-off at coincident terminals (guarded to switch-involved).

**Test files added this arc:** `test-moving-platform` (24), `test-weight-sensor` (11), `test-conduct` (16),
`test-block-skins` (20), `test-rail-switch` (13).

**Deferred Tier-2 (not built — pull in when a level needs them):** platform physics feel (max-rotation / slip
angle / ice surfaces); TNT-launcher / player-buildable platforms; the general "redstone dust ON TOP of devices".
**Natural next step:** a showcase world + a short in-game help page for the platform system. See `DECISIONS_LOG.md`
+ the `skins-and-conduct` auto-memory for design rationale.

---

## PRIOR STATE (2026-07-28) — MOVING PLATFORMS core (builds 245–253) — now playtested; superseded by 254–277 above

Overnight mega-session (P1+P2+P3) built the entire remaining moving-platform system, on `main`,
live on Railway. **All builds 245–253 are browser-UNTESTED** — the headless suite is green
throughout (added `test-moving-platform.js`, 24 assertions) but nothing has been playtested;
Kevin will playtest and iterate. The feature is additive + dormant unless the new blocks are used.

- **Pure module** `js/moving-platform.js` (advance / weight / centre-of-mass / ballistic / launch
  / tilt / flood-fill), reusing the Travel-Tube polyline geometry for the rail centerline.
- **New blocks (ids 87–92):** RAIL, ANCHOR_BLOCK, DIRECTION_CONTROLLER, SPEED_SEGMENT, LAUNCH_RAMP,
  RAIL_GATE — all in the Mechanics palette tab.
- **Shipped:** §1 Rail (3 vis states + loops + node editor), §2/§3/§4 Anchor+Platform+Carrying
  (flood-fill group lifted out of the grid, rides the rail, cell-rounded solid collision via the
  isSolid patch, rider carry + depenetration), §5 Pause Nodes, §6 multi-platform weight collision,
  §8 Direction Controller (edge-triggered L/R via TX channels), §9 Speed Segment (eased+persistent),
  §11 Launch Platform (ballistic sim, HIGH RISK), §13 Center of Gravity (tilt, HIGH RISK), §7-Gate +
  §10 Rail Gate (redstone/weight block).
- **DEFERRED (see FUTURE_ROADMAP + DECISIONS_LOG):** §7 Switch/branching mode + the 4 animated
  visual styles; §12 TNT Launcher / player-buildable platforms / One-Way Gate / Platform Coupling;
  on-platform physical redstone; per-block-type weight tuning.
- **KEY LIMITATIONS to know when playtesting:** build platforms DETACHED from terrain (a flood-fill
  >300 blocks is refused); the Direction Controller is WIRELESS (source→transmitter→channel);
  collision is cell-granular (smooth visual, rounded collision); §11/§13 emergent feel needs tuning.
- **Playtest checklist (from the brief §15):** all 4 Anchor movement modes + both Signal Response
  variants; the Direction Controller toggle feel; Speed Segments feeding Launch exit velocity; the
  full Launch sim (catches / wall hits / clean crashes); CoG tilt + slide-off; Rail Gate by redstone
  and by weight; Pause Nodes (duration + reactivate). Full rationale + all assumptions in
  `DECISIONS_LOG.md` ("Moving Platforms — full system" entry).

---

## PRIOR STATE (2026-07-27) — TRAVEL TUBE feature SHIPPED (builds 223–234) to `main` + deployed ✅

Pushed to production `origin/main` @ 1ed30d6 (Railway auto-deploy). **Travel Tube** = a new placeable "fly-through" pipe (distinct from the instant Warp Pipe), built + iterated across builds 223–234:
- **Pure module** `js/travel-tube.js` (headless-tested, test-travel-tube.js — 18 assertions): polyline/elbow build, pointAt, 3-wide footprint, mouths+cardinal, nearest-point.
- **Placement** (sandbox "Travel Tube" in the Plumbing palette): click waypoints, click the last point again to finish; Backspace undoes a point; Esc cancels (consumed so it doesn't also open the pause menu). Solid drafts turn RED with an ✕ if they'd cross a block/object.
- **Edit modal** (click a placed tube): Speed, Look mode, Edit Nodes, Delete. Edit Nodes: click a node to move it, Delete removes it, DOUBLE-CLICK an end node (green) to CONTINUE adding nodes; Esc finishes.
- **4 Look modes** (`tube.mode`): Solid (collidable glass, `BLOCK.TUBE_WALL`=83), Pass-behind (walk behind glass), Pass-in-front (walk in front), Invisible. World settings: `tubeDefaultSpeed`, `tubeRoundedCorners` (small fillet on bends, flat mouths), `tubeBlockStyle` (classic per-cell look).
- **Travel**: enter at a mouth by PUSHING its direction (walk into a side mouth / Down on top / Up into a bottom mouth); fly head-first at the tube's speed; **flow graph** (`_tubeFlowAt`) connects tube ends to other tubes' ends AND middles (T-merges) so you keep flowing; **branches** — hold a direction at a junction to divert (yellow ring shows a junction in sandbox); **direction memory** per axis picks a merge default. Items (coins/emeralds/power-ups) are TUBE DATA on the centerline — collected in flight with no gap.
- **Rendering**: tubes fill as ONE union per layer (rim + glass body, consistent winding) so connected tubes merge seamlessly; mouth "lips" only on open ends; solid walls rebuilt via `_reapplyTubeGrid` (a solid tube's cell always wins → a non-solid crossing can't punch a hole); pass-behind glass clipped out of solid-tube cells. Depenetration safety net (build 225) stops moving platforms/pistons carrying a player through any solid.
- Serialized in `world_data.travelTubes` (+ `pipeEntry` for the unified green-pipe entry side).

**NEXT (in design/discussion, NOT started): MOVING PLATFORMS + a redstone TARGET BLOCK.** See `FUTURE_ROADMAP.md` §"Moving Platforms" for Kevin's vision + my recommendation: build the redstone TARGET BLOCK + "activated dust adjacent to a trigger block powers it" foundation FIRST, then the platform consumes redstone signals. Kevin will write a detailed prompt after we align on the redstone overlap.

## CURRENT STATE (2026-07-26) — builds 216–222 SHIPPED to `main` + deployed ✅ (Classic-Blocks cleanup + Bar polish)

Pushed to production `origin/main` @ afab92d (Railway auto-deploy). **Builds 218–222 = Bar polish**: (218) dropping straight down catches the bar below (release cooldown scoped to the bar you left) + jump-off counts as the second jump (no double-jump after); (219) rebuilt the traverse as a world-space grip simulation (hands plant on the bar, hip shifts onto the weight-bearing hand, torso rocks); (220) added Compact Swing + Compact Lunge hybrids (Big-Swing/Lunge body+leg motion with tight stride + low hand-lift); (221) softened the hybrids + smoothed the weight-shift anchor (no snap/chop); (222) stable arm z-order (each hand fixed front/back layer — the reaching arm no longer pops in front of the head). Six styles in the `barTraverseStyle` world setting, default **Compact Lunge**; also `barMoveSpeed`. A style-lab comparison page (scratchpad `bar-traverse-styles.html`, published as an Artifact) mirrors the exact rendering. **Build 217** adds Hidden-Block contents (Hidden blocks now use the same contents picker as Question/Breakable — an explicit item/power-up pops on reveal; a plain Hidden block still just reveals). **Build 216** was the "one last cleanup batch before Campaign mode":
1. **Jump-Through** now renders as a filled, visually-distinct block (solid top plank + translucent slatted body + ↑ hint) AND the **grappling hook attaches to it** (previously passed through).
2. **Dropped items** (mob/block drops) now render the **real block icon** (scaled `drawBlock`) or a coloured tool token instead of the old yellow ✦ square.
3. **Grapple + Crumbling block:** hanging/swinging from a Crumble block now wears it down as if standing on it; when it crumbles the grapple lets go (momentum preserved).
4. **Swing-Assist strength** is now a world setting (`grappleSwingStrength`, default 0.5 — the old feel was an implicit 1.0 that looped the sprite) + a **hard arc limit** (`GRAPPLE.MAX_SWING_ANGLE = 1.5 rad`) so it can't swing over the top no matter how hard it's driven (gravity + reflect-at-cap). Tested (grapple invariant 7).
5. **Trampoline "Jump to Boost"** + **"Early-Jump Penalty"** world settings: a fresh Jump timed to the upward bounce adds a big boost; holding Jump at contact (too soon) saps the launch.
6. **NEW Bar block** (monkey-bar): non-solid; hang from the bar at the BOTTOM of the cell, ←→ traverse a row of bars with a physics body-swing (reuses `_drawFigureAt`), **Jump = launch off with the double-jump flip**, **Down+Jump = drop straight down**; auto-grip with a world setting (`barRequireGrab`) to require Up; the **grapple works on it** (climb the rope all the way → hang from the bar). Plus a **Bar+Platform** variant (Jump-Through plank on top: stand on it, drop through onto the bar, can't climb bar→platform). Bots skip auto-grip.
7. Fixed the recurring **black edge-lines on Trampoline/Slime** (added to the see-through edge-shadow exclusion).
Deferred to `FUTURE_ROADMAP.md`: dedicated per-mode front-ends, GOD-mode designer settings list.
New blocks: `BLOCK.BAR = 81`, `BLOCK.BAR_PLATFORM = 82`. New settings: `grappleSwingStrength`, `trampJumpBoost`, `trampEarlyPenalty`, `barRequireGrab`.

---

## CURRENT STATE (2026-07-25) — builds 196–215 ALL SHIPPED to `main` + deployed ✅

Everything through **build 215** is live on Railway (`origin/main` @ 866d450). This spans the Combat & Controls
work (196–200: per-mode control profiles, controller overhaul, grapple extras) + the Combat Trainer / combo
model v2 (201–203) + audio fixes (204) + the full **Classic Blocks pack** (205–215): Ladder / Jump-Through /
Trampoline+Slime (spring) / Ice / Conveyor / Crumbling / Warp Pipes (2×2, animated warp, destination linker) /
Question & Breakable blocks (data-driven contents picker incl. power-ups, item rise/pop drops) / Hidden / Coin /
Spikes, plus Day/Night backgrounds and the two editor popups. Full detail in `CLASSIC_BLOCKS_REVIEW.md`.
Nothing is pending a push. Suite green. Next work starts fresh from here.

# Steveo Platformer — Context Summary

**Updated:** 2026-07-10. See the **CURRENT STATE** section immediately below for
the latest; the Phase-3 sections further down are the historical record.
`DECISIONS_LOG.md` = every decision; `FUTURE_ROADMAP.md` = planned work (User
Guide, **Campaign mode** §12, Tower Defense/bots, world cleanup, itch/Tauri,
plus new §13–§18: Ladders, Trampolines, Online/MP UX, Mob-config engine,
Enchantments, Suspicion meter).

## ⚖️ WRITING CONVENTION — gender-neutral wording (project-wide)
**All player-facing wording for the player, sprites, and bots MUST be gender-neutral.**
Players choose any sprite (e.g. Kevin plays Steve and uses the Alex/female sprite for
the co-op companion, referring to that bot as "she" — a personal choice, not the game's
voice). So the GAME must never assume gender: use **"you" / "the player" / "the
companion" / "the bot" / "it" / "they"**, never he/she/his/her in tooltips, notifications,
HUD text, menus, or the future Player's Guide. ("Steve" / "Alex" are the sprite *names*
— fine to use as labels; the rule is about pronouns/gendered terms.) **Check any new
gendered term against this before shipping copy.** (Note added 2026-07-14 at Kevin's
request; also in DECISIONS_LOG + FUTURE_ROADMAP §1.)

## ⚙️ SESSION CONVENTION — overnight / mega-session briefs (added 2026-07-19 at Kevin's request)
**Overnight and multi-phase "mega-session" briefs must be implemented FULLY, with NO pauses for
confirmation partway through.** Ask ALL clarifying questions UP FRONT, in one batch, before
building — then run the whole brief to completion, checkpointing (commit + `DECISIONS_LOG.md`
note) at the end of every phase. Do not stop to ask "should I continue?" between phases; keep
going until the entire session is implemented (or a hard blocker is hit, which should be rare if
questions were front-loaded). Resolve ambiguity with best judgment + document it, rather than
blocking. (These sessions are designed to run unattended.)

## CURRENT STATE (2026-07-24) — builds 204–206 on `main` (LOCAL, headless-green, NOT pushed — awaiting Kevin's playtest)

**Build 206 — Classic Blocks pass 2** (Kevin's playtest feedback; full detail + DEFERRED list in `CLASSIC_BLOCKS_REVIEW.md`):
FIXED Question-block bump (upward collision zeroed `vy` before the pass → now gates on `player._preVy`); added
**Breakable Block** (shatter from below) + **Pipe Stem**; block **content storage** (`_blockContents`, defaults to coin —
setting UI deferred); **Ladder** dark-outline fix (faint backing) + climb animation + world settings **Lock Sideways** /
**Jump Off Mid-Climb**; **Day / Night** backgrounds (static sun/moon top-right, pinned sky). **Deferred (next pass):**
customizable-contents UI, 2×2 pipes + stem-raising, conveyor speed modal + apply-to-connected, and the **slide-on-jump-through
repro** (couldn't reproduce statically — flagged). Suite green.

**Build 204 — audio wiring:** fixed `place-block.mp3`→`placing-block.mp3` (was silent); wired
`enderman-teleport.mp3` (Enderman blink) + `blocked-shot.mp3` (shield deflect). See the audio inventory
Kevin asked for; the 12 "referenced but missing" files still don't exist on disk (drop them in `sounds/` to enable).

**Build 205 — CLASSIC BLOCKS pack** (built autonomously while Kevin was away; full assumptions in
`CLASSIC_BLOCKS_REVIEW.md`). A new Sandbox **"Blocks"** palette tab (block IDs 65–77 in `js/blocks.js`):
**Ladder** (climb, gravity suspend), **Jump-Through Platform** (solid from above; Down-hold≥10f + Jump = drop
through, distinct from the slide), **Trampoline** (FORCE-driven bounce off `player._preVy`), **Ice** (slippery
friction), **Conveyor L/R** (push), **Crumbling Block** (stand→~0.66s→gone), **Warp Pipe** (Down on top → sink +
teleport to a reading-order partner pipe), **Question Block** (bump from below → pops a coin, becomes Used),
**Hidden Block** (invisible until bumped → swaps to a solid Used block; dashed ? in the editor), **Coin**
(collect), **Spikes** (contact damage like lava).
- Interactions in one per-frame pass `game._updateClassicBlocks()` (skipped in the Sandbox editor); player-physics
  hooks in `player.js` (ladder/ice/jump-through + `_overlapsBlock`/`_footBlockIs`); `level.draw` gained `frame`+`editor`
  args; palette tab count 5→6.
- **Deferred/noted (in the review doc):** coin HUD counter, designer-configurable Question contents, crumble
  warning shake, multi-wide/linked warp pipes, ladder jump-off, jump-through climb-down animation, mob interactions.

## CURRENT STATE (2026-07-21) — builds 201–203 COMBO TRAINER + combo model v2 on `main` (LOCAL, headless-green, NOT pushed — awaiting Kevin's playtest)

**Build 203 — combo tuning (Kevin's 2nd combo playtest):**
- **forward/back RESTORED** (they're facing-relative now that the hold locks facing): Rising Strike = **forward,forward,up**; Sweep Slam = **back,back,down**. `_comboDir()` returns forward/back vs the locked facing (was neutral-on-away). test-combos 18.
- **Bigger combo reach** (reachMult ×2.4) and a **more dramatic weapon arc** (smoothstep sweep, angle range ±2.1, weapon scaled 1.35× during the special; dur 26).
- **Dropped the rectangular glow** box around the player (removed from `player.js`); the only success cue is now the expanding **ring** (`_drawComboFx`).
- **Trainer practices ONLY the selected combo by default** (`activeDefs()` = [selected] unless the new **All Combos** toggle is on) — so a wrong-order input no longer lights the tracker / reads as success; `onComboFire` only flashes when the fired def is the selected one.

## CURRENT STATE (2026-07-21) — builds 201–202 (superseded by 203 above)

**Build 202 — combo model REDESIGN (Kevin's playtest of 201):** the combo input changed from "land N
directional melee HITS" to **HOLD melee + key a direction SEQUENCE** (Up/Down/Forward — **no "back"** in this game,
**no trailing attack press**). Holding melee **locks facing** (so Up/Down are free to press). Completing a combo fires
a **special** with a custom weapon arc + a success ring at the player.
- `combos.js` DEFS re-authored: **Rising Strike = ↓↑** (`effect:'rising'` → launches the mob UP, new `launchUp` trait
  in `mobs.playerAttack`), **Sweep Slam = ↑↓** (`effect:'sweep'` → the existing finisher back-toss). test-combos 17.
- `game.js`: removed the old hit-based advance; added `_updateComboInput(meleeHeld)` (hold state machine, one step per
  distinct press, window = `timingMax`), `_comboDir()` (facing-relative, no back), `_fireComboSpecial(def)` (2× dmg,
  hit-all, launch/slam + `_comboAnim` + `_comboFx` ring + notify), `_meleeHeld` (mouse.down or melee button), facing
  lock re-applied after `player.update`, `_drawComboFx` ring. Combos still gated by world enable toggles (trainerDefs in the gym).
- `player.js`: `_drawWeapon` draws the combo arc (`_comboAnim.kind` rising low→high / sweep high→low), advanced in `update`.
- Trainer: step tiles stay lit through the finish flash; **melee lamp now includes left-click** (`mouse.down`) so
  keyboard/mouse melee registers; stats relabelled Steps/Combos/Landed/Damage/DPS.
- **To verify:** the arc feel + the launch/slam knockback, facing-lock feel, and that holding left-click to combo
  doesn't fight normal play (only active when combos are enabled).

## CURRENT STATE (2026-07-21) — build 201 COMBO TRAINER on `main` (LOCAL — superseded by 202 above)

Builds 196–200 (controls + grapple) were **pushed to production** (commit `93d7288`, live on Railway). THEN build 201
adds the **Combo Trainer** — a Sandbox-launched "test gym" for balancing/authoring combos (all additive, isolated
behind a button; doesn't touch other modes). Headless suite green (test-combos 19, others unchanged). **Held local**
because it's heavy ON-CANVAS UI that needs Kevin's browser eyes first; push on his OK.
- **Launch:** `🥋 Combo Trainer` button on the Sandbox editor HUD → `TEST_WORLD.comboTrainer()` → `new Game('normal', {comboTrainer:true, testMode:true})`. Exit/Restart via the existing test-hud; reopens the editor.
- **Flat world:** `buildComboTrainerWorld()` (js/world.js) — level ground, player left, mob right, headroom for panels.
- **`js/combo-trainer.js` (new, `ComboTrainer` class):** on-canvas panels drawn in 800×500 screen space, clicks hit-tested against rebuilt rects (defensive; wrapped in try/catch at the draw site).
  - RIGHT panel: mob picker (all 8 types, default **Zombie**), **Immortal** (restores HP after reading the damage delta → measures DPS without dying), **Passive/Fights-Back** (passive pins the dummy + disarms it), **Reset Mob**, HP bar.
  - LEFT/top panel: combo picker (built-ins + custom), **step feedback** (sequence arrows light green as the running landed seq matches, flash gold on finish), **live input readout** (← → ↑ ↓ JMP ATK RNG SPR lamps), **Slow-Mo** (3× via sim-frame skip in `_loop`), **timing window** −/+, **Melee/Ranged weapon cycle**, **＋New Combo** creator.
  - Bottom strip: **Hits / Finishers / Damage / DPS** (the balance metrics).
  - Creator: build a directional sequence (Forward/Back/Up/Down buttons), Undo/Clear, Save → `COMBOS.addCustom` (localStorage `steveo_custom_combos`).
- **Engine hooks:** `_grantAllWeapons` (sword/spear/axe/trident/boomerang + bow/crossbow + grapple/shield/arrows); combo block uses `COMBOS.trainerDefs()` (built-ins + custom) in the gym and calls `_comboTrainer.onComboHit`; the combo continue-window reads the gym's `timingMax`; `_loop` runs `tickUI()` every frame + gates the sim for Slow-Mo; `_render` draws the panel.
- **`js/combos.js`:** added `loadCustom/saveCustom/addCustom/removeCustom/trainerDefs` (custom combos persisted; matcher unchanged).
- **Deferred/next:** timing **min** gate is display-only (max is the live knob); "above the player" panel is currently a fixed top-left panel (didn't follow the player on screen); world-attached designer configs still deferred. Kevin explicitly OK'd iterating on the canvas UI.

## CURRENT STATE (2026-07-21) — builds 196–200, PUSHED to production (commit 93d7288)

Working directly on `main` (builds 173–195 already shipped + deployed). This batch is BUILT + headless-green
(`node test/run.js`, all files pass; **test-gpbindings 27→49**, **test-grapple 18→23**) but intentionally
**held local** (Kevin: bundle with the controller pass, push together after his playtest; a live tester is on 195).

**Build 196 — Grapple pass 1 (all additive):**
- Grapple settings **moved Combat → Movement tab** (group renamed `Grappling Hook`).
- **Swing Assist** world setting `grappleSwingAssist` = `none | lean | pump` (dflt lean): accelerate a swing
  with Left/Right. Lean = steady push; Pump = timing boost near the bottom of the arc (`cos θ` scaled, only
  with the motion). Pure `GRAPPLE.accelerate(s, dir, mode)` (headless-tested), wired in `_updateGrapple` swing branch.
- **Contextual items usable from ANYWHERE held** (not just the selected hotbar slot): obsidian portal repair,
  eye of ender, wither skull, soul sand. New `_findHeldSlot`/`_consumeHeldSlot` scan hotbar+backpack.

**Build 197 — Controller pass (the big one; all additive/opt-in):**
- **Cursor-persist fix:** the right-stick aim reticle was gated on bow mode (vanished off-bow) → now shows
  whenever a P1 pad is connected in gameplay (`game.js` ~6024). Aims bow/throw/grapple alike.
- **RT + the 4 D-pad directions are now EDITABLE** (moved out of `GP_BINDINGS.FIXED` into `ACTIONS`).
- **New bindable gamepad actions** (default-unassigned unless noted): `sprint`, `grapple`, `grapplePull`,
  `cycleSel` (Change Selected Weapon — context-aware: melee slot→cycle melee, ranged→ranged, else no-op),
  `nextSlot`/`prevHotbar` (hotbar step), `ranged` (=RT). **LB/RB relabelled + rewired → Change Melee /
  Change Ranged** (like keys 1/2). `place` (Y) relabelled **Use Item / Place**; the on-screen context prompt
  now reads the ACTUAL bound button (`_computeContextAction`), so a rebind shows correctly.
- **Left stick = all 4 combo directions:** `isCrouch()` now also fires on L-stick DOWN (past `InputManager.STICK_DIR`=0.6);
  new `isStickUp()` feeds the "up" directional-melee/look-up. Buttons still work too.
- **Button CHORDS:** a binding may be `[modIdx, btnIdx]` (all held to fire). Capture is release-based (hold two,
  release → chord), `resolve`/`label`/`conflicts` are chord-aware (sorted-set keyed; null/unassigned never conflicts).
- **Sprint** is now a bindable gamepad button (`isRun()` reads it; unbound = old auto-run) AND the keyboard `run`
  action relabelled "Sprint (hold)".
- **Stick-swap** toggle (Move ↔ Aim) in `GP_BINDINGS.swapSticks()`; applied at the axis source in `updateGamepad`.
- **Controls UI:** gamepad actions now grouped (Movement/Combat/Weapons/D-Pad/System), each row has a ✕ to clear,
  a Swap-Sticks toggle, and the chord hint. New CSS `.cu-gpbind/.cu-gpclear/.cu-bindwrap/.ws-sub-group`.
- **Grapple-Pull mechanic** (`grapplePull` action, `_startGrapple(aim,'pull')`): reels the player straight to the
  anchor (new `reeling` state — vertical traversal / gap-cross / zip to a gem via `_grappleHitEmerald`), and with
  world toggle **Grapple Enemies** yanks a hooked mob toward you; **Grapple Collectibles** latches emeralds. Both
  toggles added under the Movement→Grappling Hook group.

**Open / browser-verify:** swing feel (lean vs pump), the L-stick down=duck threshold in real play, chord capture UX,
grapple-button + grapple-pull feel, cursor persistence, LB/RB=Change-Melee/Ranged, Use-Item prompt reflecting rebinds.
**Known minor:** a chord's component buttons still also fire their own actions (e.g. Y+RT grapple also triggers Y/RT) —
Kevin accepted the simple model; component-suppression is a possible refinement. P2–P4 LB/RB kept as slot-step (labels
say Change Melee/Ranged) — arena-only, left as-is.

**Build 198 — controller-pass fixes (per Kevin's playtest):** D-pad is NO LONGER a bindable "function" (its 4
directions are just physical buttons / bind targets — read directly again); added discrete **Move Left / Move Right**
actions (unassigned, so the D-pad can drive movement); **Palette / Inventory** action default = **View (8)**; the ✕
clear now **truly unassigns** (stores a `-1` sentinel → "—"; conflicts skip -1) instead of resetting to default; the
rebind list **no longer snaps to top** on capture (scroll preserved across `_render`).

**Build 199 — PER-MODE CONTROL PROFILES (Kevin's game-building-platform vision; see memory `controls-and-platform-vision`):**
Each game mode (platformer/normal/speedrunner/arena/sandbox) now has a **fully independent** control profile — keyboard
+ gamepad + stick tuning — saved per player across sessions. Implementation:
- `KEY_BINDINGS` + `GP_BINDINGS` state restructured to `{version:2, byMode:{<mode>:{…}}}` with a `_mode` + `setMode()`
  and a `_ms()` active-slice accessor; **migration** seeds ALL modes from the old flat v1 config (new storage keys
  `…_v2`; old `…_v1` read once). `ControllerConfig` likewise: assignments stay global, **sens/aim/deadzone are per-mode**.
- New coordinator **`CONTROL_PROFILES`** (in keybindings.js): `setMode` (switches all three stores at once — game.js
  calls it each frame from the live game mode, but SKIPS while the Controls panel is open so the panel owns the mode),
  `copyFrom(src,dest)` ("Start From"), `exportConfig`/`importConfig` (JSON profile = kb+gp+sticks).
- **Controls UI** gains a profile bar: **Game Mode** selector, **Start From (copy another mode)**, and **Export ⭳ /
  Import ⭱** (downloads/uploads `steveo-controls-<mode>.json`). Import sets the mode's default, still editable.
- Tests: test-gpbindings now **62** (added per-mode isolation, copyFrom, export/import, kb-per-mode). Full suite green.
- **DEFERRED (agreed):** (1) the **Sandbox Tools** bindable section (undo/redo/copy/paste/pen/eyedropper/fill/palette
  as bindable actions shown only in sandbox) — needs per-tool wiring, next small pass; (2) **world-attached
  designer-recommended configs** (offered on load) — sits on top of export/import, the follow-on layer.

**Build 200 — controls polish (Kevin's 2nd playtest):**
- **Cursor persistence, real fix:** `_p1GpConnected` (render) now also true in single-player **dual-input** (keyboard P1 + any pad connected) — the earlier gate required P1 to be *assigned* a pad slot, so with the default keyboard P1 + a controller the reticle never showed. Now shows regardless of equipped weapon.
- **Trident/Boomerang recall on the RANGE button:** recall conditions now include `p1JustDown('rangedBtn')` (RT edge), alongside the existing R3/Q throw + mouse-right recall.
- **Grapple-Pull collectibles:** now pulls the GEM back to the player (fly-in via `_startEmeraldPull`/`_updatePulledEmeralds`, collected on arrival by the normal proximity pickup) instead of reeling the player to it.
- **Sandbox Tools bindable section:** new GP actions `sbUndo/sbRedo/sbCopy/sbPaste/sbPenUp/sbPenDown/sbPalette` (`modes:['sandbox']`, unassigned by default), shown only in the Sandbox profile (UI + conflicts mode-filtered), wired in the sandbox controller block. Keyboard sandbox shortcuts (Ctrl+Z/Y/C/V, Shift+scroll) unchanged.
- **Directional Aim** (per-mode personal option `directionalAim`, toggle in Controls panel): aims ranged weapons from the MOVEMENT direction (L/R = horizontal, Up = straight up, Up+L/R = 45°, idle = facing) for players who don't want cursor/stick aim. Stored in the mode's profile (travels with export/import + copy). Wired at `aimWorld` via `_directionalAimPoint()`.
- `KEY_BINDINGS` gained per-mode `getOpt/setOpt` (gameplay options in the profile slice). test-gpbindings now **67**.
- Still DEFERRED: world-attached designer-recommended configs (Kevin wants more thought first).

**Ship (all of 196–200 together):** commit + `push origin main` on Kevin's go after his browser playtest.

## CURRENT STATE (2026-07-20) — builds 180–186, branch `combat-controls-mega` (follow-up; NOT merged)

**Combat/Controls FOLLOW-UP (Kevin's first-playtest bug-fix + polish pass) is BUILT** on the same
branch, on top of the mega-session. Headless suite **689** (`node test/run.js`, all green; adds
test-testworld 11, test-gpbindings 27, boomerang +13). Still additive/opt-in; per-phase commits
(builds 180→186). Detail in `DECISIONS_LOG.md` ("COMBAT/CONTROLS FOLLOW-UP"). What shipped:
- **A (180) — Sandbox test round-trip:** unsaved World Settings no longer lost on returning from Test.
  Root cause was the RETURN path re-fetching the saved file (not the Test launch, which already used the
  live draft); now it reopens the editor from the in-memory snapshot. Nothing persists unless Save.
- **B (181):** Up also triggers ledge grab (`isJump() || isAimUp()`), every control scheme.
- **C (182):** controller mapping display + FULL rebind (`GP_BINDINGS` + click→press-a-button poll);
  `updateGamepad` resolves each button-action through it (byte-identical default; face-swap flows through it).
- **D (183):** pause "Players" selector → 1 Player / 2 Player (Human) / 2 Player (Bot), Bot reusing the
  companion infra (runtime spawn/despawn). Disabled in Sandbox. Full co-op redesign → FUTURE_ROADMAP §23.
- **E (184):** charged-shot glow (brightness + yellow→red by charge); arrow-speed cap 2×→4×; Unlimited/
  Recoverable Arrows moved under a "Ranged" heading (Combat heading gone).
- **F (185) — Boomerang completion:** palette placeable (gated by the world toggle); dual-slot display
  (Boomerang + Trident mirror into the ranged slot, swap via melee only); wall settings (Pass Through /
  Stop→Early-Return|Stick) + Auto/Click-to-Return; isometric vertical squash. **Acquisition model
  changed: enabling a new weapon = available/placeable content, no longer auto-granted (pickup required).**
- **G (186) — Grappling Hook completion:** now an acquired item (enable = available/placeable; pickup to
  use); Look-Up-Aim flips controls only once a grapple is HELD, not on world availability.

**Ship path unchanged** (suite 689 → Kevin browser-tests → `merge --ff-only combat-controls-mega` →
push). **Browser-verify items:** the Sandbox round-trip (A), gamepad capture (C), the 2P-Bot spawn (D),
boomerang/grapple canvas render + save/continue persistence (F/G), and all the feel items from the
mega-session still stand.

## CURRENT STATE (2026-07-19) — builds 173–179, branch `combat-controls-mega` (mega-session; NOT merged; awaiting playtest)

**The Combat & Controls mega-session (7 phases) is BUILT** on branch `combat-controls-mega` off
`bot-ai`(==`main` @ build 172). Headless suite **638** (`node test/run.js`, all green; adds
test-keybindings 40, test-boomerang 10, test-grapple 16, test-directional 7, test-combos 13).
**Everything is additive/opt-in — default behaviour is byte-identical** (the input rebind migration
resolves to the historical keys with no overrides). Each phase is its own commit (builds 173→179).
Full detail + every assumption in `DECISIONS_LOG.md` ("COMBAT & CONTROLS MEGA-SESSION"); the roadmap
follow-ups are in `FUTURE_ROADMAP.md`. What shipped, one commit each:
- **Phase 1 (173) — Tier-1 QoL:** companion "!" only when genuinely stuck (escapes exhausted, with a
  different-approach retry) + a cyan follow/mirror cue; Touch Controls Auto/On/Off toggle; co-op
  companion on/off + character moved to the start splash (off World Settings).
- **Phase 2 (174) — Controls-Config UI:** `js/keybindings.js` (per-player key/mouse binding map,
  byte-compatible defaults) + `js/controls-ui.js` (rebind grid, click→press capture, conflict
  detection, reset, presets Default/Minecraft/Legacy Jump + gamepad Xbox/Switch). `input.js` migrated.
- **Phase 3 (175) — Boomerang:** dual-mode melee + auto-returning throw (guided substrate; decelerates,
  steers to cursor both legs, returns to player; 2D/isometric spin; opt-in per world).
- **Phase 4 (176) — Arrow/Bow/Crossbow:** independent opt-ins for Straight Flight, Arrow Speed, and
  Charged Shots (charge→1–3× damage); one generic `_arrowFireParams` charge resolver.
- **Phase 5 (177) — Grappling Hook:** cast/swing/reel-in/1-block-climb-over/release; `js/grapple.js`
  pure math with all 5 §5e invariants headless-verified; Up/W = look-up aim (jump→J) across all ranged.
- **Phase 6 (178) — Directional melee:** one Advanced Attacks toggle; Up/Down/Forward/Back variants +
  the crouch/short height dodge (PvP + PvE).
- **Phase 7 (179) — Combos:** data-driven `js/combos.js`; per-combo toggles; Rising Strike + Sweep Slam;
  cooldown-cancel chaining; finisher reuses the slide-launch toss; gold glow from the 2nd hit.

**Ship path (unchanged):** `node test/run.js` (638) → bump the THREE markers (done through build 179) →
**Kevin browser-tests** (much of this — grapple swing FEEL, rebind key CAPTURE, boomerang look, combo
feel, directional animations — is inherently browser-only; the invariants/logic are what's proven) →
`git checkout main && git merge --ff-only combat-controls-mega` → `git push origin main`. **NEXT / needs
Kevin's hands-on playtest before "done":** the Grappling Hook and Advanced Combat/Combos especially.

## CURRENT STATE (2026-07-19) — build 172, MERGED to `main` + DEPLOYED to Railway ✅

**Shipped to production this session** (origin/main fast-forwarded build 113 → 172; Railway
auto-deploys `main`). Headless suite **554** (`node test/run.js`, all green). `bot-ai` == `main`.

Highlights of builds 123–172 (all now live):
- **Arena bow-fire bug — ROOT CAUSE FOUND + FIXED (builds 160–172).** Right-click didn't fire
  the bow on the RIGHT HALF of the screen, in ARENA only. It masqueraded as a mouse-driver
  zone-remap for many builds; `document.elementFromPoint` finally proved the culprit:
  **`DIV.tc-aimpad`** — the mobile touch-controls arena aim/fire pad — overlays the right half
  and its `pointerdown` rewrote a mouse right-click into a left-click/melee. It was auto-enabled
  on a touchscreen laptop that also has a mouse. Fix (build 171, `js/touch-controls.js`):
  `detect()` auto-enables touch ONLY when there is no fine pointer (`any-pointer: fine`); touch
  handlers ignore `pointerType==='mouse'`; the overlay drops `pointer-events` while a mouse is
  active. Two-button combat (LEFT=melee / RIGHT=ranged) restored in build 172 after the
  workarounds (Space-fires-bow 165, window-mousemove 166, left-click-fires-bow 168) were peeled
  back — window-level mousemove/mousedown (166/167) stay. Full trail in `DECISIONS_LOG.md`.
- **Playtest fixes (builds ~154–159):** new-game Platformer spawns at the designed spawn point
  (not the sandbox editor position); world-select button reads "Start Game" vs "Continue";
  wall-slide needs a wall ≥2 blocks tall; **companion is summoned by pressing C** (gated on the
  yellow "!") instead of aggressive auto-teleport; players no longer shove each other into walls
  + a `playersPassThrough` world setting; **Debug toggles (Perf HUD / Bot-Mob Paths / Nav Grid)
  added to the in-game Settings/pause menu for ALL modes** (the World Settings Debug tab stays).
- **Mob performance fix (builds ~145–153):** 8–10 mobs no longer tank the framerate. The A*
  `nav` adapter now uses BASE block solidity (`BLOCK_DATA[...]`) instead of the monkey-patched
  `level.isSolid` (which iterated every redstone piston per call); plus a per-frame recompute
  budget + nearest-N pathfinder selection + O(1) piston-head lookup (`js/redstone.js`).
- **Bot maze execution (builds 134–138):** consecutive double-jumps, air control, jump
  commitment, take-off-node launch — the two-level climb now completes.

The **Bot AI mega-brief (Phases 0–7, build 122)** is included in this deploy and is now
browser-validated by Kevin's arena/platformer playtests. Detail:

**BOT AI (Competitive + Cooperative) — the full mega-session brief is BUILT, Phases 0–7.**
Branch `bot-ai` sits on top of the un-merged wayfinding work (Bot AI depends on the
pathfinder), so it inherits wayfinding's "browser-UNTESTED, awaiting Kevin's playtest"
status. Headless suite **468** (`node test/run.js`; new `test/test-bot-ai.js` = 97
assertions). Everything is **additive/opt-in** — no bots unless a match is configured
with them, so human-only play is byte-identical. Full detail in `DECISIONS_LOG.md`
("Bot AI" section) + `BOT_TELEMETRY_SCHEMA.md`.

Core idea: **a bot occupies a real player SLOT (P2–P4) and drives SYNTHETIC input**
through the same `input.pXxx(i)` pipeline a human uses (`input.js botInput`) — so CTF
carry, KOTH zone-standing, Tower damage, weapon traits, friendly-fire, and scoring all
work for a bot automatically (no parallel bot-entity type). New files: `js/bot-ai.js`
(BotController: brain-tick + goal executor + nav actuator), `js/bot-telemetry.js`.

- **Phase 0 (wayfinding retest):** pathfinder suite 371/371 + a static-objective smoke
  test 27/27 → greenlit; no pathfinder changes.
- **Phase 1 (foundation, build 117):** slot + synthetic input; brain/act loops; goal
  executor (path to a cell + context action); highest-threat-blend PvP; per-slot
  Human/Easy/Medium/Hard picker in the arena pre-launch modal.
- **Phase 2 (element strategies, 118):** strategies keyed to Arena Rules ELEMENTS (not
  mode names) — kills, KOTH (Sticky/Sole/All), CTF, Defend-the-Tower, Emeralds,
  Waves/Mob-Hunter.
- **Phase 3 (co-op, 119):** complementary-role heuristics (grab-vs-defend, attack-vs-
  defend, hold-vs-intercept, split emeralds/mobs); reads bot + human teammate state.
- **Phase 4 (companion, 120):** friendly follower for Platformer/Normal/Campaign —
  follow-band, fights mobs not the player, loot priority (time-delay + redundant
  handoff). Opt-in via `_worldAdvSettings.companionBot`; no pre-launch UI toggle yet.
- **Phase 5 (difficulty, arch in P1):** real wired params (`BOT_DIFFICULTY_PRESETS`);
  Medium calibrated, Easy/Hard flagged for playtest.
- **Phase 6 (Custom Rules, 121):** dispatch verified against the REAL `arena-rules.js`
  — **fixed a key mismatch** (engine uses ctf/towers/waveSpawns, not flags/tower/waves)
  that would have made CTF/Tower/Waves bots fall back to plain kills.
- **Phase 7 (telemetry, 122):** per-bot-per-match logs + sampled decision trace,
  accumulated + exportable (`BOT_TELEMETRY.download()`); `BOT_TELEMETRY_SCHEMA.md` data
  dictionary; `saves/bot-telemetry-samples.json` (36 sample records) via
  `tools/gen-bot-telemetry-samples.js`.

**Bump all THREE markers each commit** (GAME_VERSION build N, `?v=bN`, `steveo-shell-vN`).
**Ship path (used this session):** `node test/run.js` (554) → Kevin browser-tests → `git push
origin bot-ai:main` (fast-forward) → Railway auto-deploys `main`. **NEXT / watch-items:**
companion "!" retry-before-Yellow + a follow-mode visual cue; a **Touch Controls On/Off/Auto
toggle in Settings** (auto-detect can misfire on hybrid touch+mouse laptops — see the
touch-aimpad fix); companion pre-launch UI toggle; per-tier EASY/HARD bot calibration from
telemetry. Bot AI + wayfinding are now browser-validated by Kevin's playtests.

---

## PRIOR STATE (2026-07-14) — build 116, on branch `smart-mobs-wayfinding` (NOT merged)

**Build 116 — wayfinding playtest polish (Kevin tested 114, "looks great").** (1) Short
mobs (Cave Spider, 16px) now HOP a 1-block obstacle instead of hanging — they can't
`_mobPhysics` auto-step like tall bodies; `_followPath` jumps a foot-level step when
`height <= BLOCK_SIZE`. (2) Crowd-adaptive throttle: mobs set `_wayfinding` when actively
pathing; `MobManager._activePathCount` feeds `_crowdAdjustedPathCfg()` — above
`PATH_CROWD_THRESHOLD` (8) mobs, routes recompute ×2.5 less often + ×0.6 radius to hold
framerate (Kevin saw slowdown ~10 on screen). First-route recompute jitter desyncs packs.
All levers in `constants.js` (`PATH_CROWD_*`). Suite **371**. Browser-UNTESTED.

**Build 115 — new-Platformer default World Settings preset (on top of the wayfinding
work below).** Newly-CREATED Platformer worlds now spawn seeded with a curated snapshot
of **Kevin's World!** gameplay settings (movement moves, scoring, weapons, Smart-Mobs
behavior incl. §6 wayfinding). One shared preset `js/platformer-defaults.js`
(`worldModeDefaults(mode)`) consumed by BOTH creation paths — `LOCAL_WORLDS.create`
(offline) + server `emptyWorldData` (online `require`) — so client/server can't drift.
Applies ONLY to new PLT worlds; other modes + all existing worlds untouched. Scope =
gameplay/level settings only (audio/controller/chat/teleport/arena/SR/boss excluded).
Source committed at `saves/Kevins_World_PLT_2026-07-14.json`. `physicsLocked:true` is
carried (flagged — see DECISIONS build 115; easy to drop). Suite **362**. Server change
needs a Railway deploy for ONLINE creation. Browser-UNTESTED.

---

## SMART MOBS §6 WAYFINDING (2026-07-13) — build 114, same branch

**Smart Mobs §6 — WAYFINDING — is BUILT, and this CLOSES the original Smart Mobs brief
entirely.** Branch `smart-mobs-wayfinding` off `main` @ build 113. Headless-verified
(suite **329**), **browser-UNTESTED, NOT merged/pushed** — awaiting Kevin's playtest.
`GAME_VERSION` = build 114; bump all THREE markers each commit. As always, **everything
is additive/opt-in** — the new "Path-Aware Mobs" toggle is default-off = byte-identical
legacy chase.

- **Phase A (commit `693b293`):** `js/pathfinding.js` — the shared tile-grid A* / reachability
  subsystem, the SINGLE source of truth for platformer traversal. Movement model ported
  VERBATIM from the Speed-Run reachability validator (`tools/gen-sample-worlds.js`), which
  now `require()`s `navReachable()` back from it (one model, can't drift; sample worlds
  regenerate byte-identical). `findMobPath()` = bounded A* returning `{path,cost}`|null.
  Verified by `test/test-pathfinding.js` (the 5 brief cases) BEFORE any mob wiring.
- **Phase B (commit `19d3b89`, build 114):** own opt-in **"Path-Aware Mobs"** toggle (Mob
  Settings tab; independent of Smart Detection — it also improves classic-aggro worlds).
  `Mob._pathStep`/`_followPath` give a cached route + recompute cadence (~12f) + bounded
  radius (24bl) + terrain-change invalidation + graceful null fallback. All 8 classes route
  through it: ground chasers (Zombie/CaveSpider/Piglin/WitherSkeleton/Creeper) fully path,
  Skeleton paths its approach, Blaze (flight)+Enderman (teleport) keep native movement.
  **Stretches shipped (both):** §5 Pack surround now paths flankers AROUND to the far side;
  §8 low-HP flee routes around walls. **"Ambush from above" is EMERGENT** from the edge-cost
  model (cheap drops) — not deliberate vantage-seeking (that's T3, out of scope; see
  DECISIONS build 114 for the honest feel note + the feel/perf levers to retune).
- **Playtest watch-items for Kevin (flagged):** the jump heuristic in `_followPath` (mobs
  over/under-jumping on real geometry) and the two "try it" levers — Path Update cadence +
  Path Range — are the most likely to want hand-tuning. `PATH_*` in `js/constants.js`.
- **NEXT per Kevin's priority order = Arena objective-bots (T2)** — the intended next consumer
  of this shared pathfinder (FUTURE_ROADMAP §4). The Smart Mobs brief is now fully done.

**Ship path:** `node test/run.js` (329) → bump the THREE markers (done: build 114, `?v=b114`,
`steveo-shell-v114`) → **Kevin browser-tests** → `git checkout main && git merge --ff-only
smart-mobs-wayfinding` → `git push origin main`.

---

## PRIOR STATE (2026-07-13) — build 107 → 113, Smart Mobs Batch 2 (MERGED to main)

Batch 2 (§4–§10 detection/pack/sprint/flee/webs, builds 102–107) plus builds 108–113
(Solid Leaves, Mob-Settings tab consolidation, min world height 15, World-Settings scroll
preservation, End-Portal fix) are all **on `main`**. `main` == `origin/main` @ build 113.
The historical Batch 2 detail below is kept for provenance.

## PRIOR-BATCH-2 DETAIL (2026-07-13) — build 107, on branch `smart-mobs-detection`

**Smart Mobs Batch 2 — the mob-intelligence half of the brief (§4–§10) — is BUILT** on
branch `smart-mobs-detection` (off `main` @ build 101), **headless-verified (suite 293),
browser-UNTESTED, NOT yet merged/pushed** — awaiting Kevin's playtest. `GAME_VERSION` =
build 107; bump all THREE markers each commit. **Every behavior is additive/opt-in —
NONE changes default mob behavior unless a World-Settings → Combat toggle is turned on**
(the hard rule from the brief). What shipped, one build each:
- **§10 — build 102:** decorative foliage. New **"Decor" palette tab** with non-solid
  **Bush** + **Leaves** blocks, each in **front/back** layers (encoded in the block id) +
  **green/yellow/orange** colours (re-click a placed cell to cycle; overlay map, mirrors
  Goal-Star colours, serialized as `world_data.foliage`). Bushes **occlude mob sight**
  (`game._blocksSight` / `foliageOccludesSight`) — the §4 dependency; leaves are cosmetic.
  Drawn in dedicated back/front passes (front reuses the `_drawEndPortalForeground`
  technique); front/back look **distinct in the editor, identical in play**. Existing Oak
  Leaves untouched.
- **§4 — build 103:** DETECTION core. `Mob._shouldChase()` gate (default-off = legacy
  distance aggro across all 8 mob classes; on = chase only once `_alerted`). Sight =
  frontal-cone raycast blocked by walls + bushes; Sound = block tiers (gravel loud /
  grass silent / normal walk-run) reusing the footstep/landing flags via
  `game._emitMovementNoise`; Action = attack/jump noise. Master toggle + per-axis
  sub-toggles + ranges in World Settings → Combat → Detection. Alerting is **sticky**.
- **§5 — build 104:** PACK behavior (one `packAlert` toggle). Alert propagation (one
  alerted mob rouses neighbours within `packRadius`, ripples over frames) + surround
  (clustered melee mobs get alternating `_flankOffset`s via `_chaseTargetX` — a left/right
  heuristic, not pathfinding).
- **§7 — build 105:** SPRINTING MOBS (own `sprintingMobs` toggle, independent of the
  detection master). Ground melee chasers occasionally sprint; **always telegraphed** —
  a ~0.7s wind-up (slow + pulsing "!" ring + mob voice), then a 2.4× burst with streaks.
- **§8 — build 106:** RETREATING MOBS (per-mob-type `lowHpAction` **variable** =
  None/Flee, extensible; advanced per-type HP-% threshold, default 20%). Wired for
  Zombie/Skeleton/CaveSpider/Piglin/WitherSkeleton; Creeper/Blaze/Enderman excluded
  (their low-HP behavior is explode/fly/teleport). Coexists with skeleton kiting.
- **§9 — build 107:** SPIDER WEBS (`spiderWebs` toggle). Cave Spiders spit slowing `Web`
  globs (no damage); player slows via `applyWeb` (default 33%→67% speed, 3s) with visible
  webbing; optional **Stacking** compounds (0.67→~0.4489) + resets the timer.

**Tests:** `node test/run.js` → **293** (adds test-foliage 16, test-detection 38,
test-webs 10). New/changed: `js/mobs.js` (detection/pack/sprint/flee/web engine + Web
class), `js/game.js` (`_detectionConfig`/`_fleeConfig`/`_webConfig`, foliage draw+overlay,
noise emit), `js/player.js` (sprint/jump/web flags + applyWeb + web overlay),
`js/blocks.js` + `js/level.js` + `js/game-state.js` (foliage), `js/world-settings-ui.js`
(Combat rows), `js/constants.js` (DETECT_*/SPRINT_* + GAME_VERSION).

**Ship path (unchanged):** `node test/run.js` → bump the THREE markers → commit → **Kevin
browser-tests** → `git checkout main && git merge --ff-only smart-mobs-detection` →
`git push origin main`.

### §6 Wayfinding — ✅ BUILT in build 114 (see CURRENT STATE). The recommendation below was followed (shared navmesh-style subsystem; retrofitted chase/surround/flee). Kept for provenance.
### §6 Wayfinding — the (former) ONLY remaining piece of the Smart Mobs brief (recommendation)
Deferred by design (no pathfinding exists; it pervasively touches aggro/pathing across all
8 classes). Batch 2 surfaced concrete reasons it's next and what it must fix:
- **Sticky alert:** an alerted mob never de-aggros and can't route around terrain — §6
  should add path-aware pursuit + a de-aggro/return-to-post rule (or fold in the §18
  Suspicion decay).
- **§5 surround is a left/right heuristic** (mobs are non-solid, so "flankers" currently
  overlap the player) — real flanking wants navigation.
- **Ambush-from-above** + reaching a player behind walls both need the tile A*/navmesh.
Recommend building §6 as a **shared navmesh subsystem** (also unlocks Arena objective-bots
+ TD/MOBA per FUTURE_ROADMAP §4), then retrofitting detection-driven chase, surround, and
flee-to-cover onto it. Treat it as its own mini-project.

---

## PRIOR STATE (2026-07-13) — build 99, SHIPPED to main + origin

**Builds 73–99 (the weapon/UX half of the Smart Mobs work) are MERGED to `main`
and pushed**, browser-verified by Kevin across many playtest rounds. Test suite
**233/233**. `GAME_VERSION` = build 99; bump all THREE markers each commit.
The **mob-intelligence half of the brief (§4–§10) is the next batch — NOT started**
(see REMAINING below). What shipped in 73–99:
- **§1 — build 73:** World Settings routing (Arena Settings + new all-mode ⚙ World
  Settings button open the HTML panel; `WORLD_SETTINGS.open(game, tab)`).
- **§2 — build 74:** composable **weapon-trait system** (`WEAPON_TRAITS` +
  `Game._meleeTraits/_rangedTraits` + trait-driven `playerAttack`). Sword
  cleave-by-tier, Spear cone, Axe knockback, Crossbow pierce, Trident throw +
  Combat→Weapons config. Enchantment foundation (§17).
- **§3 — build 75:** crouch = the **sneak state** (`player.isSneaking` for §4).
- **build 76:** playtest fixes — placed-items serializer regression (was reading
  the play-mode array in the editor → stripped placed items on save/test), hotbar
  kept across the test round-trip, gear palette grouped by type, footstep/landing
  SFX (`sounds/footstep.mp3` + `sounds/land.mp3`, per-sound volume).
- **builds 77–81 = weapon-UX redesign** (Kevin: collect+switch all weapons, but
  compact; Minecraft-Dungeons two-button combat; distinct visuals; controller config):
  - **77** collection + cycle: `player.meleeOwned/rangedOwned` (one per class,
    best tier) + `acquireWeapon`/`cycleWeapon`; re-press a weapon slot to cycle;
    HUD `▸N` badge. All acquisition routed through it.
  - **78** separate **melee/ranged/place inputs**: LMB melee, RMB ranged, **Shift+LMB
    place** (Normal), gamepad X melee / RT ranged; both weapons always live.
    Remappable via `input.isMeleeAttack()/isRangedAttackDown()`.
  - **79** spear **slide-attack** (opt-in Combat→Special Moves): ground-slide launches
    mobs spinning into the air; generic on a `WEAPON_TRAITS.slide` trait.
  - **80** distinct weapon visuals: sword/axe **swipe**, spear/trident **stab** +
    per-class head shapes.
  - **81** controller presets: gamepad face-button remap (identity default; **Nintendo
    Switch** swap) + Controller-Layout picker in pause Settings.
- **builds 82–95 = playtest fixes + polish** (Kevin's rounds 2–4):
  - **82** FIX black screen (isSandbox temporal-dead-zone crash in the build-78 combat refactor).
  - **83** dev: skip/auto-clean the service worker on localhost/LAN IPs (WSL2 localhost-forward
    drops were masked by a stale SW cache — this made local dev reliable).
  - **84** FIX redstone state lost on platformer/normal resume (missing `sandboxPlaced`);
    spawn-egg **initial burst** so clustered eggs near start all fire on load.
  - **85/90/91/93** weapon + armour **icons** — drawn pixel art per class (spear/axe/trident/
    crossbow + helmet/chest/legs/boots), matching the held sprites; in hotbar/palette/placed items.
  - **86** wall-slide only on 2+ block walls; synth footstep/land fallback when mp3s absent.
  - **87** active-hand weapon sprite (shows what you last attacked with) + melee/ranged mutual
    exclusion (melee wins ties).
  - **88/89/91/92** trident throw + arrow recovery: throw (RMB, hold-charge, straight, sticks),
    **swept projectile collision** (no more tunnelling → tridents recoverable), pickup + recall;
    **Recoverable Arrows** setting; and the real **weapon-switching fix** (pickups now COLLECT via
    `acquireWeapon` — `_collectPlatformerItem` had bypassed it; tap 1/2 cycles).
  - **92** FIX player block-tunnelling at speed/slide (horizontal collision now checks every
    spanned row, not just head+feet); starting-weapon **None** option.
  - **94** trident **recall on right-click** (boomerang: throw doesn't switch weapons; 2nd
    right-click recalls); **stay crouched** when a slide ends in a 1-block-high tunnel.
  - **95** equipped **armour now shows during the ledge climb** (`_drawFigureAt` overlays).

**NEXT BATCH — the actual mob intelligence (§4–§10 of the brief, NOT started).**
Everything shipped so far was weapons/UX/bugs; the "Smart Mobs" AI itself is untouched.
Recommended playtest-friendly slice order (each its own build+playtest loop, since these
pervasively rewrite mob aggro/pathing across all 8 mob classes):
1. **§10 Leaves/Bushes** first — isolated (new non-solid block + a front/back render pass
   reusing `_drawEndPortalForeground`); unblocks §4a foliage line-of-sight. Low risk.
2. **§4 Detection** (the core) — directional/frontal line-of-sight (raycast, occluded by
   blocks + leaves), sound tiers (Gravel=Loud / Grass=Quiet / Normal, keyed off the §3
   `isSneaking` + the movement noise events already emitted), action detection (attack/jump).
   Add per-world tuning knobs; keep additive/opt-in to avoid breaking current aggro.
3. **§5 Pack** (alert propagation + surround positioning) → **§7 Sprint w/ telegraph** →
   **§8 Flee-at-low-HP** (per-mob Retreating toggle) → **§9 Spider webs**.
4. **§6 Wayfinding & ambush-from-above** — biggest (no pathfinding exists today; wants a
   tile A*/navmesh). Do last or as its own mini-project.

**Other queued (not next):** full **controls-config UI** (arbitrary rebind grid + Minecraft
preset — FUTURE_ROADMAP §19; foundation shipped build 81); a **boomerang** (reuses the generic
`guided`/`steerGuided` substrate from build 96); FUTURE_ROADMAP §13–§18 (ladders, trampolines,
enchantments, etc.). Drop real `sounds/footstep.mp3` + `sounds/land.mp3` in anytime (synth
fallback covers it meanwhile).

**Ship path:** `node test/run.js` → bump the THREE version markers (`GAME_VERSION`,
`?v=bN` in index.html, `CACHE_VERSION` in sw.js) → commit → Kevin browser-tests →
`git checkout main && git merge --ff-only <branch>` → `git push origin main`.

## PRIOR STATE (2026-07-08) — build 72 (superseded by build 99 above)

**Where things are:** `main` and `origin/main` are both at **build 72** (`6c3b562`),
fast-forwarded from build 66. Builds **67–72 are shipped and browser-verified by
Kevin** (the `platformer-campaign-prep` branch is merged; safe to delete). Test
suite **182/182**. There are **no live users yet**. `GAME_VERSION` = `v3 · build
72`; cache-buster `?v=b72`; SW `CACHE_VERSION = steveo-shell-v72` (bump ALL THREE
every commit).

**Builds 67–72 = the platformer campaign-prep feature set (FUTURE_ROADMAP §12
Campaign mode, Phase 1) + its fixes.** Opt-in additions to Platformer levels; no
new physics mode. Summary of what changed across the run:
- **67** — the core (detailed below): multi-colour Goal Stars, emerald collect+count, score.
- **68–69** — fixes from Kevin's first test: goal-colour **click-to-cycle** (see the
  corrected authoring note below), placeable **ghost icons** in the editor (emerald/
  powerup/spawn no longer show a stale Goal-Star ghost), correct **hotbar selection
  labels** for every placeable kind, and the block palette **widened to 10 columns**
  (pw 470) so the 34-item "Other" tab fits with no scrollbar (wheel still cycles the
  hotbar). `_paletteGridGeom` / `_paletteTabGeom` are the shared draw+click geometry.
- **70–72** — fixed the **"Return to Sandbox" playtest-exit freeze**. Root cause
  (found via [EXIT] console tracing): `js/test-world.js` referenced the sandbox-UI
  singleton as `SANDBOX_UI`, but it is `const SANDBOX` (js/sandbox-ui.js). The
  undefined global made `choose()` capture `_wid = null` and `exit()` reach no
  return path → the test game was destroyed with nothing reopened → frozen. Fixed to
  `SANDBOX` (all 8 refs). exit() also now destroys the live game before reopening
  (Game._loop re-schedules off its own instance; nulling window.game doesn't stop it).

**Build 67 — platformer campaign-prep (groundwork for FUTURE_ROADMAP §12 Campaign
mode).** Opt-in additions to Platformer levels; no new physics mode.
- **Multiple Goal Stars.** Any goal the player touches ends the level (was a single
  tracked `level.goalCol/goalRow`). Win scans a cached `_getGoalCells()` list;
  the colour index of the goal hit is recorded on `game._wonExitColor` — the hook
  the future Campaign layer will route branch/secret/skip exits on.
- **Goal-Star colours.** 10-colour palette (`GOAL_COLORS` in constants.js; index
  0 = classic gold). In the editor (build 69), **click a placed goal with the Goal
  Star tool selected to cycle its colour**, and the whole **4-connected touching
  group** (a stack/line) recolours together (`_cycleGoalGroupColor` /
  `_connectedGoalCells`); a new goal inherits an adjacent goal's colour
  (`_adjacentGoalColor`). Colours live in `game._goalColorMap` ("r,c"→idx), serialize
  as `world_data.goalStars [{row,col,color}]` (via `GAME_STATE._goalStars`), restore
  in both `_loadPlatformerWorld` + `_loadSandboxWorld`, and render as a colour
  wash + ring overlay (`_drawGoalColorOverlays`, play + sandbox).
- **Emeralds in platformer.** `EMERALD_SYSTEM.init` now also reads
  `game._levelEmeralds` (set on platformer load), so placed emeralds are
  collectible + counted when the **Collect Emeralds** World Setting is on.
- **Score.** Opt-in **Score / Points** setting; `game._score` from emeralds
  (Points/Emerald, dflt 100) + a Level-Clear Bonus (dflt 1000). Top-centre HUD
  pill (`_drawPlatformerScoreHud`) shows `★ score` and/or `💎 n/total`.
- **World Settings.** New **Scoring** group (modes platformer + sandbox):
  `platformerEmeralds`, `platformerScore` toggles + advanced `emeraldPoints`,
  `goalClearPoints`. All default off → classic behaviour unchanged.
- **Known follow-up:** colour authoring is re-click-to-cycle (lean first pass); a
  click-to-open goal popup (like the emerald/spawn-point popups) is the natural
  upgrade to bundle with the Campaign Builder. Undo/redo doesn't snapshot
  `_goalColorMap` (stale entries are harmless — only real GOAL cells are read).

**The Campaign vision (decided this session — see FUTURE_ROADMAP §10 + DECISIONS
2026-07-07).** Kevin wants a playable sequence of levels (secret/skip exits via
coloured goals). Agreed shape: a lightweight **Campaign container**, NOT a new
physics mode — levels stay Platformer levels; the new layer only sequences them,
routes coloured-goal exits, and tracks progression. Build order Kevin chose:
**(1 = done in 67)** make levels campaign-ready (multi-colour goals, emeralds,
score); **(2, later)** a **Campaign Builder** mode to sequence worlds + assign
bonus levels; **(3, later)** cross-level carry-over of **inventory, points,
emeralds, lives** (health RESETS each level); **(4, later)** a **top-down
walkable overworld map** (low-res; may share tech with Tower Defense as a level
type) — Kevin explicitly prefers this over a side-view level-select; **(5, later)**
a portal-based **World Select** level. Start linear (PoC) but keep the data model
map-ready. Colours: 2 used now, palette sized to 10.

**Bridge — builds 52–66 (all on `main`, browser-tested unless noted):**
- **52** — app icon = player's head (PWA raster icons).
- **53** — rename worlds in Sandbox; exit-test button; SR restart + pause-freezes-timer; import naming.
- **54** — Auto-Climb (walk/run up 1-block ledges; universal, per-world).
- **55** — fix white-on-white text in file-import & Modern modals (`.modal-content` colour).
- **56** — Sandbox playtest: exit via pause menu to Sandbox, no scoring.
- **57** — test-world HUD (Restart + Return to Sandbox) + full-column SR finish line.
- **58** — double-jump air-roll animation.
- **59–63** — movement moves: **wall slide, ledge hang/climb, ground slide** (per-world toggles);
  ledge-grab exposed-outcorner fix (61); articulated waist+hip climb-up "FIX" (62); hard-edged limbs (63).
- **64–66** — **unified HTML World Settings panel** (`js/world-settings-ui.js`, data-driven
  `SETTINGS` list: tab/group/advanced/modes/dependsOn) replacing the canvas panel (canvas kept
  as a Konami bonus, `_useClassicPause`); mob drops/arena types/background/tooltips/retro skin (65);
  **Up-Arrow + J secondary jump** + Konami ending flipped to **B-then-A** (66). Also the
  "First Steps Redux" original homage platformer level (`sample-worlds/First_Steps_Redux.json`).

**Build 51 — per-world background theme (§9 Tier 1):** new `_worldAdvSettings.backgroundTheme`
(`'auto'|'sky'|'cave'|'nether'|'end'`, default `'auto'`) + `Game._skyBiome()`, which returns
the override or falls back to the position-based `Game._playerBiome()`. `_render` draws the
backdrop from `_skyBiome()`; `_playerBiome()` (music/void-death/dragon/portals) is UNCHANGED,
so a forced theme is visual-only and never breaks the Nether/End column regions. A forced
Sky/Cave also pins the `_drawSky` depth blend. UI = a new "BG" tab in the canvas World
Settings modal (`_drawWorldSettings`/`_updateWorldSettings`). Free-rides the existing
`worldAdvSettings` serialize/`Object.assign`-on-load path; backward-compatible (old worlds
default to Auto).

**Builds 44–50 (local-first / offline worlds — FUTURE_ROADMAP §6):**
- **44 — World provenance metadata.** Every saved world carries
  `world_data.provenance = { uid, createdAt, updatedAt, creator, origin, copiedFrom,
  copiedAt }` (`GAME_STATE._provenance`, captured on load into
  `game._loadedProvenance`). Travels inside world_data across export/import/copy and
  local↔cloud — the foundation for the copy model + the world-cleanup widget (§7).
- **45 — Play Online/Offline entry + session mode (Phase 1a).** New `js/app-mode.js`
  (`APP_MODE`: 'online' vs 'local', persisted; `body.offline-mode`). Start screen
  offers **Play Online / Play Offline** (login only via Play Online w/o session).
  Dashboard adapts to mode (online-only buttons hidden offline; ☁ Go Online;
  Guest/`<user> (offline)` identity). Online path byte-for-byte unchanged.
- **46 — Offline Sandbox via local provider (Phase 1b).** New `js/local-worlds.js`
  (`LOCAL_WORLDS`): localStorage world store mirroring the server world shape.
  `sandbox-ui.js` branches on `APP_MODE.isLocal()` for load/create/edit/save/copy/
  delete/changeMode — build + save + reopen custom worlds offline, no login.
  Known rough edge: editor F-key quick-save still uses the legacy `SandboxSaves`
  store while the Save button uses local-worlds (to reconcile).
- **47 — Offline file import/export + bundled starters.** Client-side local import
  (parses .json → `LOCAL_WORLDS.importWorld`) and export (server-shaped .json);
  `LOCAL_WORLDS.seedDefaults()` imports `default-worlds/*` (Normal/Platformer/Speed
  Run) into local storage on first offline Sandbox open (added to SW precache).
- **48–50 — Copy-to-Online/Offline bridge.** Explicit copy between spaces (no
  auto-sync): `_copyToOnline` / `_copyToOffline` re-stamp provenance + preserve
  lineage. Landed as a badged cross-space section (48), then online-only + tile
  layout + duplicate guard (49), then consolidated into **one Copy button per card →
  a name+destination modal**, with per-world actions branching on the world's origin
  (`_isLocalWorld`) rather than the session mode (50). "Published" → green ★ badge.

**Work remaining on §6 (not built):** guest access to the OTHER modes (only Sandbox
has a local provider so far — Normal/Platformer/Arena still guarded offline);
reconciling the editor F-key quick-save with local-worlds; optional login-sync
polish. See FUTURE_ROADMAP §6.

**Migrations still to run in Supabase for full function:** `server/sql/speedrun.sql`
(Speed Run server times). Everything else degrades gracefully without it.

**Ship / push loop (current):** build on a feature branch (build 67 is on
`platformer-campaign-prep`) → `node test/run.js` (**182/182**) → bump the THREE
version markers (`GAME_VERSION` in `js/constants.js`, all `?v=bN` in `index.html`,
SW `CACHE_VERSION` in `sw.js`) → commit → **Kevin browser-tests** → `git checkout
main && git merge --ff-only <branch>` → `git push origin main`. Direct edits on
`main` also work for small changes. `main` == `origin/main` at build 66; **build
67 is NOT yet merged** (awaiting browser test). Recent builds (59–66) used
feature branches merged straight to `main` ("finalize on main" commits); the older
`phase3-v3-look` / `.claude/worktrees` worktree flow is no longer the primary path.

---

## Prior state (builds 12–22, on main, live on Railway)

`GAME_VERSION` was `v3 · build 22`; cache-buster `?v=b22`.

**Working model (important):** the harness makes edits go through a git worktree
under `.claude/worktrees/phase-3b-pvp` (branch `phase3-v3-look`, kept identical to
`main`). The ship loop each change is: edit in the worktree → `node test/run.js`
(expect **160/160**) → bump `GAME_VERSION` + `?v=bN` → commit → from the primary
checkout `git -C <primary-root> merge --ff-only phase3-v3-look` → `git push origin
main`. (Direct edits to the shared/primary checkout are rejected by the harness.)

**Supabase migrations:** `community.sql`, `custom_rules.sql`, `stats.sql` are all
**VERIFIED ALREADY APPLIED** (read-only probe against the live DB) — nothing
outstanding for deploy.

**Builds 12–22 (stacked on the Phase-3 v3 base, build 11):**
- **12** — Pickaxe removed from the hotbar; mining is now an always-active
  capability (`Game._miningEnabled`, Normal-only) with a HUD badge. Hotbar =
  sword(0) + bow(1) + inventory(2–8).
- **13** — Arena picker restyled as dashboard tiles; full **retro pixel-art CSS
  skin** (`html[data-theme="retro"]`).
- **14** — Fixes: platformer new-world spawns at the Player-1 spawn point; apple
  → hotbar slot 3; Normal-mode **redstone device state + ground item drops now
  persist** across leave/re-enter.
- **15** — **Live-mob tracking**: mobs alive at save time are serialized and
  restored (pos/hp/facing/state/fuse) instead of respawning — both Normal and
  Platformer, both cloud (`GAME_STATE`) and localStorage (`NormalProgress`).
  Reuses `mobManager.serializeMobs`/`adoptSerializedMobs`. New `test/test-mobs.js`.
- **16** — **Arena world selection overhaul**: full-width blue overlay (was
  black/narrow/single-column), 3-per-row responsive tiles, game-type filter
  (based on placed design elements: hill→KOTH, bases→CTF, tower→Defend, emeralds,
  spawns→bots) with per-tile chips, client-side pagination, scrollable long modals.
- **17** — Fixed "click twice to enter dashboard" (start screen was shown before
  an async session check resolved; now hidden until `DASHBOARD.init` reveals it).
- **18** — Legacy canvas `MenuSystem` no longer auto-starts (was flashing the old
  rendered menu on load). Kept as a reference; re-enable via `window.menu.start()`.
- **19** — Game canvas view hidden until a match starts (`body.pre-game`), killing
  the empty-canvas boot flash. `Game()` reveals it + re-fires resize.
- **20** — **Customizable Retro FX** (the big one). `theme.js` now drives seven
  independent effects: pixel frame (ONE runtime-generated 9-slice `border-image`
  skins all buttons/panels), pixel sprites, posterize (SVG `feComponentTransfer`),
  chromatic aberration (SVG channel split), scanlines, dither (Bayer overlay), CRT
  vignette. A 🎛️ gear on the dashboard opens a Theme modal (Modern⇄Retro +
  per-effect toggles + palette-levels slider). State = `data-fx-*` attrs on
  `<html>` + localStorage `steveo_retro_fx`; applied pre-paint. **Menu-only** —
  gated by `body:not(.in-game)` (Game adds `in-game`, destroy clears it), so
  gameplay is never filtered. Frame/dither generated on canvas (no binary assets).
- **21** — Fixed the gear inheriting `.btn-mute` (music.js wires all `.btn-mute`
  → mute + icon-swap); gear now has its own `.theme-settings-open`. Palette levels
  default 8, range 3–8.
- **22** — The gear is hidden in clean/modern mode (retro-only); 🌙 toggle still
  enters retro.

**Test suite:** `node test/run.js` → **160/160** (test-pause 7, test-v3 63,
test-scoring 18, test-rules 56, test-mobs 16).

**Key files touched this session:** `js/theme.js` (retro-FX engine + settings
modal wiring), `js/arena-select.js` (fetch-all + filter + pagination + badges),
`js/game.js` (`_miningEnabled`, `body.pre-game`/`in-game`, live-mob restore,
platformer spawn), `js/saves.js` + `js/game-state.js` + `js/mobs.js` (redstone/
drops/mob persistence), `index.html` (SVG filter defs, FX overlay layers,
pre-paint FX, gear + Theme modal), `style.css` (arena grid + `data-fx-*` rules +
modal styling), `js/constants.js` (GAME_VERSION), `js/menu.js` (boot start disabled).

**Still browser-untested:** builds 12–22 are headless-verified (160/160) only.
Deployed to Railway; a browser pass is warranted — the notable watch-item is the
retro posterize/aberration SVG filter applied to `body` (menus), which interacts
with `position:fixed` screens; if a modal/screen mispositions with those effects
on, it's a one-line scope change. No pixel `@font-face` yet (letterforms use the
theme monospace) — a drop-in bitmap font is the planned finishing touch.

---
_The sections below are the historical Phase-3 record (kept for provenance)._

## Stack
- Client: vanilla JS, canvas-rendered game + DOM overlay screens. ~45 files in `js/`, entry `index.html`
  (authoritative script load order + cache-buster `?v=17k2-3b`).
- Server: Node/Express + Socket.IO + Supabase. Entry `server.js`; route modules in `server/*-routes.js`;
  SQL DDL in `server/sql/`.
- Constants: `js/constants.js` — MAX_PLAYERS=4, PLAYER_COLORS, physics/combat tuning, GAME_VERSION.

## Phase 3B (pre-existing, verified this run)
`players[]` model (getters `player`/`player2` over slots 0/1, `getPlayer(i)`, `activePlayers()`,
`Game.ownerId(i)`), 1–4 local players (P1 keyboard + P2–P4 gamepads), 4-player camera/HUD, arrow PvP
(`mobManager.pvpEnabled`, owner-tagged `_ownerId`, `onPlayerKill`), Friendly Fire, Deathmatch. Arena-only.

## Phase 3 (this run) — all committed as checkpoints on the branch
1. **Player Spawn Points** — new sandbox placeable `kind:'spawnpoint'` (blue flag, slot 1–4, movable +
   deletable), distinct from Survival "Spawn Lines". Persisted as world-data key `playerSpawns`.
   `_setupArena` assigns players to placed spawns by slot (legacy auto-spread fallback). Auto-seeds 2 on
   load when none. Arena settings warns supported player count. (Non-arena single-start override deferred.)
   Files: sandbox.js, game.js, game-state.js.
2. **King of the Hill → 1–4P PvP** — `hold{p1..p4}` map; pre-launch scoring selector STICKY(default)/SOLE/
   ALL; FF defaults on for KOTH; HUD CONTESTED + per-player times; P3/P4 hill tints. Fixed `_ownerIds` to
   use `activePlayers()` (also fixes Deathmatch 3–4P). Files: arena-modes.js, arena-prelaunch.js, game.js, index.html.
3. **Capture the Flag + Teams** — `js/ctf-system.js`: 2 teams (alternating; 2P=1v1, 4P=2v2), grab/carry/
   capture (50pts), drop-on-death, teammate-return, 15s auto-return. Team-aware friendly fire in mobs.js
   (teammates never hit each other; no-op for FFA). `CAPTURE_FLAG` un-greyed; win/score/HUD/winner in
   arena-modes.js; pre-launch Captures-to-Win. Flag bases auto-anchor to team spawns (explicit flag editor
   tool deferred). Fixed P3/P4 emerald award gap. Files: ctf-system.js, mobs.js, arena-modes.js, game.js, index.html, arena-prelaunch.js.
4. **Theme / Reskin** — CSS custom-property tokens: `:root` Modern (default, dark/indigo/sans) vs
   `html[data-theme=retro]` (original neon-monospace). `js/theme.js` live-swaps + localStorage; inline
   `<head>` script applies before paint; toggle in dashboard header. Files: style.css, theme.js, index.html.
5. **Community / Leaderboards / Achievements** — `server/community-routes.js` (browse/search/favorite/rate/
   download), `server/stats-routes.js` (player_stats + player_achievements, 6 triggers, personal-best),
   arena leaderboards gained per-world + recency filters + PvP ranking. Client `js/community-ui.js` +
   `#community-screen` (Browse/Favorites/My Stats). **Requires SQL migrations + browser test.**
   Files: community-routes.js, stats-routes.js, arena-leaderboard-routes.js, worlds-routes.js, server.js,
   community-ui.js, sandbox-ui.js, game.js, index.html, style.css, sql/community.sql, sql/stats.sql.

## Verification status
- Headless logic tests (node-vm against real code): KOTH 23/23, CTF 17/17, achievements thresholds OK.
- All `js/*.js` + `server/*.js` pass `node -c`.
- **Not browser-tested** (no browser/Supabase in this env): 4-player arena play, KOTH/CTF/theme UI,
  and the Community/stats endpoints (need the two SQL migrations run first).

## Required before deploy
_(Historical — as of 2026-07-03 all three migrations are **applied**; see CURRENT STATE.)_
Run `server/sql/community.sql`, `server/sql/custom_rules.sql`, and `server/sql/stats.sql` in the
Supabase SQL editor (additive, safe). Without them the `/api/community/*`, `/api/custom-rules/*`, and
`/api/stats/*` endpoints 500 but the rest of the game is fine.

## Phase 3 — v3 Master Brief run (2026-07-01)
Built on top of the v1/v2 commits. New work (all committed on `worktree-phase-3b-pvp`):
1. **Bug-fix pass (§2):** theme toggle de-duplicated from the mute control (root cause
   of "two mute buttons" + the theme switch not appearing); Online/Community button
   sizing; arena cards render as cards again (`.sandbox-container` width fix); pause
   freezes the match timer; P2-P4 death sound; Deathmatch excludes mob kills; "Disable
   Mobs" pre-launch toggle; spawn-point hotbar icon. Pickaxe-hotbar removal DEFERRED
   (invasive core input redesign; needs browser testing).
2. **KOTH (§3):** runs the full match timer (no early hold-target end); Sticky keeps the
   owner's hill colour while contested, Sole reverts to yellow.
3. **4-player HUD (§4):** P3 lower-left + P4 lower-right get compact health bar + hotbar.
4. **Theme (§5):** now a full game-wide switch — the inline `<head>` style + splash +
   dashboard font were tokenized (they hardcoded retro before). Client-side persistence.
5. **CTF (§6):** base zones (3×2), both-flags-out scoring fixed, one-flag-at-a-time,
   own-flag carry-recovery, drop-on-defeat, configurable return timer, no-combat-while-
   carrying, team shirt colours, per-player→team scoring. New `js/ctf-system.js` logic.
   Bases auto-anchor to team spawns (dedicated sandbox Base placeable deferred).
6. **Defend the Tower (§7):** new `js/tower-system.js` + `DEFEND_TOWER` mode. One Tower/
   player at spawn, HP 3/6/9/12, 3 damage bands, Heal Tower pickups, arrow+melee damage,
   sole win = first Tower destroyed. Editor placeables (Tower/Heal/CTF Base) deferred;
   modes auto-anchor to spawns and are fully playable.
7. **Remaining features (§8):** audited — Publishing/Community/Leaderboards/Achievements
   from the earlier run are intact and already follow the theme tokens; still need the
   two SQL migrations (MIGRATIONS.md) for the /api/community + /api/stats endpoints.

New file: `js/tower-system.js`. Cache-buster bumped `17k2-3b` → `17k3-v3`.
Headless: 52/52 v3 logic assertions pass. Not browser-tested (no browser/Supabase here).
