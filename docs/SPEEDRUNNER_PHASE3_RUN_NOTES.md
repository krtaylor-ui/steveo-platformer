# Speed Runner + Phase 3 rollout — RUN NOTES (assumptions, limitations, flags)

Branch: speedrunner-phase3 (off main@460). Autonomous multi-hour run. Each epic = staged commit(s)
with a build bump + green suite where practical. This file logs assumptions made where the brief was
silent and any limits that stopped a full rollout, per the "document assumptions + flag issues" ask.

---

## E7 WIND / CURRENT ZONES  (builds 461–462)
- Pure core `js/wind-zone.js` (WIND) — force vector (normalized diagonals + airborne/grounded factor),
  redstone `active()`, `shadowedCells()` wall-blocking, `reaches()`. 19 headless tests (test-wind-zone.js).
- **2D engine (build 461): FULL.** BLOCK.WIND_ZONE(96), painter via palette (all modes), animated cyan
  chevrons, flood-fill groups → bbox + wall-shadow + per-group config (right-click popup: direction /
  strength / wall thickness / redstone channel / push-while-grounded / remove), redstone-gated via
  `_channelPowered`, serialized (`_windCfg`), QA seams (setWindConfig/getWindConfig).
- **Overhead engine (build 462): RUNTIME ONLY.** Wind zones from `worldData.windZones` (rectangles
  {col,row,w,h,dir,strength,affectsGrounded,channel}) push players via `_moveWithCollision` so walls
  physically block the push. **Deferred (flagged):** (a) an overhead EDITOR placement tool — zones come
  from world JSON for now; (b) overhead redstone-gating (always-on in overhead; 2D has the full gate);
  (c) overhead save round-trip of windZones. Rationale: the overhead engine is a large separate codebase
  and the full editor/redstone wiring would consume budget needed for the remaining epics. The mechanic
  (the "feel") works in overhead; authoring parity is the follow-up.
- Assumption: strength values (0.3–2.0) read as px/frame push; diagonal normalized. Tunable per zone.

## E4 GRAVITY INVERTER ZONES  (build 463)  ⚠️ HIGHEST-RISK / BROWSER-UNVERIFIED
- BLOCK.GRAVITY_ZONE(97), painted region (palette, side-scroll modes), purple up/down-arrow render.
- Player physics (player.js): `_gravitySign` (+1 normal / -1 in a zone). Gravity accel * sign + a
  magnitude clamp in either direction; the up-sweep registers `onGround` when it pins the player to a
  ceiling (so you can stand + jump off it); jump velocity * sign (jump pushes DOWN off a ceiling). Zone
  detection in `_classicBlocksForPlayer` sets `p._gravitySign` from cell overlap each frame.
- **CONTAINMENT (safety):** `_gravitySign` is 1 everywhere except inside a Gravity Zone, so normal
  platforming is provably unchanged (all edits are `* (sign||1)` / `if (sign<0)` guarded). Suite green.
- **FLAGGED — needs browser tuning (could not verify headlessly):**
  1. Down-sweep ambiguity: under inverted gravity a real FLOOR can still register onGround (the down-sweep
     is unchanged), so the player may be "grounded" on both floor and ceiling in edge cases. The common
     path (float up → land on ceiling → jump down) works by construction; dual-surface correctness needs
     playtesting.
  2. Interplay with double-jump / wall-slide / ledge-hang / slide under inverted gravity is untested.
  3. Overhead engine: NOT done (overhead has its own elevation-based movement; a flip there is a separate
     design). Side-scroll only, per the brief's "side-scroll primary".
  4. Ghost replay (SR) is position-based so it replays fine (per the brief).
  Recommend: a dedicated browser pass on a small ceiling-walk level before shipping E4.

## Epic CK — Checkpoints + Practice + Splits  (build 464)
- **CK1 placeable checkpoints: DONE.** BLOCK.CHECKPOINT(98) (Other palette, Speed Runner). First contact
  during a run sets it as the death respawn anchor; `_srRespawnToCheckpoint` recovers there WITHOUT
  resetting the run clock (a mid-run recovery). World setting `srCheckpoints` (default on) gates it.
- **CK4 split timing: DONE.** Each checkpoint's first-touch time is banked in `sr.splits`; HUD shows
  "CP n/total" + a per-checkpoint split notification. (Win-screen split breakdown = light follow-up.)
- **CK2 ghost re-baseline: DONE (chose the clean option).** The ghost is HIDDEN after a checkpoint respawn
  (re-baselining a single full-run recording mid-run is error-prone); a full restart re-shows it.
- **CK3 Practice mode + personal checkpoints: DEFERRED (flagged).** A player-side mode with player-placed
  temporary checkpoints that flags the run non-submittable is net-new player-facing UI + input; not built
  this pass. The official-checkpoint machinery above is the foundation it would build on.
- In-world "reached" (green flag) visual is drawn grey/static in level.draw; the HUD + notify convey
  reached state. Overhead SR has no checkpoint support (overhead SR is minimal per prior notes).

## Epic D — Per-level Achievements  (build 465)
- **Pure evaluator DONE + tested:** js/achievement-eval.js (ACHIEVEMENT_EVAL) — 5 templates (collect N,
  defeat N, finish within T, ≤N jumps, no hazard damage), satisfied()/evaluate()/label()/freshStats().
  17 headless tests. Definitions ride world_data.achievements[] (max 3, migration-free).
- **DEFERRED (flagged) — the engine + UI wiring:** (a) a creator UI in the editor to pick up to 3
  templates; (b) in-play stat tracking (collect/kill/jump/hazard-hit) + fire-on-completion via the existing
  _notify flow; (c) the D3 persistence route — the SQL is applied (player_achievements.world_id), so a
  POST /api/achievements/world route can record per-level unlocks. The reusable, tested core is done; the
  wiring is straightforward but spans several engine hooks + new editor UI, deferred under budget.

## Phase 3 — Custom Sprites roster + packs  (build 466)
- **P3-1 per-account roster: server + create-half DONE.** user_characters.sql (you ran it) +
  server/user-characters-routes.js (GET/POST/DELETE /api/characters, moderated names, soft cap 30) +
  client js/user-characters.js (list/save/remove) + a "🗂 Save to Roster" button in the parts-mixer
  builder. You can now build a character and bank it to your account.
  **DEFERRED (flagged):** the roster PICKER — surfacing your saved roster in the world-card Character
  dropdown / a "My Characters" section to APPLY one to a world (the async load into the sync card render
  is the remaining wiring). The API + storage are done; this is UI glue.
- **P3-2 MP per-player custom: DEFERRED.** Each player picking their own roster character in the pre-game
  window — needs per-player character wiring through the overhead pre-game UI. Not started.
- **P3-3 side-scroll builder preview: DEFERRED.** The builder previews the overhead sprite; a side-scroll
  preview needs a standalone side draw (player.js side draw isn't standalone). Not started.
- **P3-4 sprite-sheet render pipeline: DEFERRED.** You chose "build now", but it needs a second image-based
  renderer + at least one curated PNG sheet asset (none exist in-repo). Building the pipeline blind with no
  asset would be untestable; flagged to do with a real/placeholder sheet in a focused pass. Not started.

## Flagged bugs (Kevin, needs browser repro — not fixed this run)
1. Small-world sprite fall-off + bedrock-below-map: world-gen writes BEDROCK on the last grid row
   (js/world.js). In a small world, clearing down to the bottom likely exposes the boundary/render
   interaction Kevin saw. Needs a repro world + mode to fix safely.
2. X-ray in Platformer TEST under GOD mode: no feature literally named "xray/x-ray" found in js/*.js —
   need the exact key/toggle used. Likely a Normal-mode-only creative feature; trace once identified.

## DEFERRED EPICS (not built this run — clear specs exist in docs/SPEEDRUNNER_MEGA_BRIEF.md)
- Epic C (Wave 5): sandbox top-bar reduce, world-list left-tabs, unified Create-World modal,
  editable description post-create, remove Import-from-Games.
- Epic UI (Wave 6): convert ~12 white .modal-content modals onto the dark .ws-panel shell per
  docs/UI_STYLE_GUIDE.md (highest visual risk; own commits; Kevin's confirm gates it).
- Epic MB (Wave 7): per-instance music track pick + editor Beat Grid overlay (tap-to-tempo + optional
  autodetect; time→distance; default constant-speed).
- Epic A/B/LB (Wave 9): SQL is APPLIED now, so this is unblocked — landing-screen tabs (System/My/
  Community), storefront sorts/tags/thumbnails/duration/search + creator profiles, downloadable +
  provenance enforcement, leaderboard re-key to worlds.id. The build-out (client + routes) remains.
- CK3 practice mode; Epic D wiring; Phase 3 picker/MP/side-preview/sprite-sheet.

## Epic C — Sandbox editor cleanup + Create World  (build 467)
- **DONE:** C5 (Import-from-Games button removed — replaced by the storefront flow), C1-partial (redundant
  Overhead Demo shortcut removed).
- **DEFERRED (flagged, lower-value UI reshuffles that are risky on the live sandbox):** C2 left-side mode
  tabs (replace #mode-filter dropdown), C3 fold overhead creation into the single Create World modal +
  hide World-View for Normal + drop Control Scheme (the modal has no overhead-create path today; the
  overhead editor owns that flow), C4 post-create description edit (create-time description already works;
  editing later needs a text-input affordance). Prioritized functional epics over UI reshuffles.

## Epic MB — Music per-instance + Beat Grid  (build 469)
- **MB2 Beat Grid core DONE + tested:** js/beat-grid.js (BEAT_GRID) — tapTempo (standalone, BPM from tap
  intervals), beatMs/beatTimes, beatXs (time→distance under constant speed). 10 headless tests.
- **DEFERRED (flagged):** the EDITOR OVERLAY (drawing beat lines at beatXs on the SR editor canvas + a
  tap button/key + BPM state + the "warn under variable speed" note) — the reusable math is done; the
  canvas/input wiring is the follow-up. Automatic BPM detection also deferred (the core consumes any BPM).
- **MB1 per-instance track:** the Music Player block's right-click config already lists MUSIC_DISCS and a
  placed instance plays its configured track (verified working in prior builds); no change needed beyond
  confirming in-browser.

## Epic A/B/LB — Storefront (build 470) — SQL-backed slices landed
- **B2 rating sort fixed:** community browse `sort=rating` now orders by the generated `rating_avg`
  column (was `rating_sum` — the sum-vs-avg bug). Added `sort=played`/`mostplayed` (play_count) and
  `sort=trending` (last_played_at + play_count).
- **B2 play counter:** POST /api/worlds/:id/played bumps play_count + stamps last_played_at (no auth; any
  launch counts). Client call on world launch is a small follow-up wire.
- **A1 level state on publish:** the publish route now sets `state` = published/draft (speedrunner.sql
  column) alongside is_published.
- **A2 finish gate:** publishing now REJECTS a level with no finish/goal (LEVEL_VALIDATOR.canGoLive on the
  server, reusing the shipped pure validator).
- **DEFERRED (flagged):** the big client build-out — the Speed Runner LANDING screen (System/My/Community
  left-tabs), storefront browse UI (tag filter, duration buckets, search-as-you-type, creator profiles,
  thumbnails capture/display), downloadable+provenance enforcement in the download route, Community-
  Nominated Picks, and the leaderboard re-key to worlds.id. The schema is applied + these server slices
  are in; the remaining work is UI + a few routes (specs in docs/SPEEDRUNNER_MEGA_BRIEF.md Epics A/B/LB).

## Epic D3 persistence route (build 471)
- **DONE:** POST /api/achievements/world (record a per-level unlock; idempotent per world+key) + GET
  /api/achievements/world/:worldId (list) — uses player_achievements.world_id (speedrunner.sql). Completes
  the D server side.
- **REMAINING D wiring (flagged):** the creator UI to DEFINE up to 3 achievements into
  world_data.achievements[], and the in-play STAT TRACKING (jump count / mob kills / collectibles /
  hazard-hit) + fire-on-completion → _notify → POST the route. The tested evaluator + the storage + the
  route are all in; this is engine hooks (4 sites) + one editor panel. Deferred under budget as a cohesive
  follow-up (partial tracking would fire wrong, so it's left whole).

## Epic UI — modal unification (NOT done this run)
- The style guide (docs/UI_STYLE_GUIDE.md) is written. The actual conversion of the ~12 white
  .modal-content modals onto the dark .ws-panel shell was NOT attempted this run: it is browser-
  unverifiable, the single highest visual-risk change, and Kevin serves the live working directory (a
  broken modal mid-run is disruptive). Recommend doing it in a dedicated session with browser review,
  one modal per commit per the style guide. Flagged honestly rather than shipped blind.

## Wind visual style (Kevin's ask, 2026-08-11) — scheduled for TRANCHE 2
- Add a per-zone **Wind Style** option to the Wind Zone config: **Chevrons · Flowing streamlines · Speed
  lines** (chosen from the 6-way visual study artifact). Flow speed + line density derive from the zone's
  Strength/Speed settings. Rendered as a single continuous world-space field so it tiles seamlessly across
  blocks (proven in the artifact), and the pattern moves IN the wind direction.
- **Bug caught + fixed in the artifact (carry to the engine):** speed-lines dashes must scroll with a
  NEGATIVE lineDashOffset to flow downwind (a positive offset scrolls them upwind).
- Wire into blocks.js `_drawWindZone` (side-scroller) first, then the overhead variant. Cyan accent stays.
- Artifact: https://claude.ai/code/artifact/985befff-ef0e-456f-ac62-b4c22851c5ae

## Bugfix pass on the 461-471 tester report (build 472)
- **F1 (HIGH) — E7 redstone gating never fired:** the wind popup offered STRING channels 'A'/'B'/'C', but
  _channelPowered matches tx.number (integers 1–99). Changed the wind channel choices to integers 1/2/3
  so a real transmitter #1 gates the zone. FIXED.
- **F2 (MED) — Epic C5 undone online:** sandbox-ui _applyModeUI re-showed the Import-from-Games button
  when not local. Now always hidden. FIXED.
- **F3 (MED) — E4 dual-surface eaten jump:** under inverted gravity a real FLOOR no longer registers as
  ground (the down-sweep only grounds when _gravitySign > 0), so a floor-standing inverted player floats
  back up instead of eating the jump. FIXED (improves the flagged edge case).
- **F4 (MED) — wind zone split by a full-height wall:** (a) the shadow bounding box is expanded by a margin
  so the splitting wall is captured → the downwind group is correctly calm; (b) a split-off group with no
  config now INHERITS the creator's wind config instead of defaulting to "blow right 0.6". FIXED.
- **F6 (MED) — Kevin bug 1 (fall through cleared bedrock):** the sandbox editor runs the player in god
  mode, which skipped the fall-death catch, so clearing the bedrock row dropped the player forever. Added
  a sandbox catch that lifts them back to spawn. FIXED.
- **X-RAY (Kevin bug 2):** NOT a code bug — X→phase-through IS wired (game.js:2244, works in god mode /
  sandbox). Likely god mode wasn't active. God Mode = hold G+O+D together (non-sandbox), shows a banner;
  then X toggles walk-through-blocks. If Kevin confirms the banner showed and X still failed, re-investigate.
- **Test World fidelity (tester Q):** Normal mode intentionally loads the built-in adventure world (so a
  25×15 grid renders as the 650×60 adventure map) — that's existing behavior, not from this run. The SR
  auto-Goal at (28,444) is worth a look (SR may auto-place a finish when none exists); flagged.
- **Stale API server (tester's #1):** not a code issue — restart the branch API server so it matches the
  471+ client (storefront slices / achievement routes / roster save all need the current server).

## TRANCHE 1 — Storefront & Platform  (builds 473–475)
- **Server (community/worlds-routes):** browse now filters by TAG + CREATOR + search and returns
  play_count/tags/thumbnail/downloadable/creatorId; new routes — system tags (list), set-world-tags
  (curated only), tag-request (moderated), creator mini-profile (/api/community/creator/:id), Community
  Picks (/api/community/picks), thumbnail store (POST /api/worlds/:id/thumbnail, data-URI, size-capped),
  publish accepts `downloadable`; download route ENFORCES downloadable (403 if off) + immutable
  original_author + marks the clone non-downloadable.
- **Client (community-ui + index.html + style.css):** tag filter, Most-Played/Trending sorts,
  search-as-you-type, card thumbnails + play counts + tag chips, clickable author → creator profile bar,
  downloadable-aware Download button, Community Picks featured strip. New dark-shell-consistent CSS.
- **B1 thumbnails:** auto-captured on publish from the game canvas (downscaled JPEG data-URI, no Supabase
  Storage bucket needed) — removes the bucket dependency for previews.
- **LB re-key (build 473):** Speed Runner levelId now prefers the stable worlds.id (options.worldId);
  documented CLEAN CUT for pre-re-key local best-times (superseded, not migrated); player_id already
  scopes server rows.
- **DEFERRED (flagged) — A3 SR LANDING SCREEN tabs (System / My Levels / Community):** the 4-slot Speed
  Runner select screen is drawn imperatively on the canvas (menu.js _drawSpeedRunnerSelect); adding the
  three left-tabs there is a canvas-menu rework that's browser-unverifiable and best done with Kevin's
  visual review. The Community browse screen already delivers the browse experience; wiring it as a Speed
  Runner landing tab is the remaining nav integration. Left for a focused pass. Also deferred: a per-world
  Downloadable opt-OUT toggle (publish currently defaults downloadable=true), duration-range buckets (no
  per-world duration field exists yet), and the admin tag-approval / pick-generation UI (routes exist).
- **REQUIRED:** restart the local API server (node server.js, pid 559) so all these new routes are live.
