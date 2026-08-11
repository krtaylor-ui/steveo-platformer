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
