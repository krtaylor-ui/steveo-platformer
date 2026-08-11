================================================================================
TESTER BRIEF — SPEED RUNNER EPICS + PHASE 3 (branch speedrunner-phase3, builds 461–466)
================================================================================

Branch:  speedrunner-phase3 (off main@460).  NOT merged.
Builds:  461 → 466.  Suite: node test/run.js → all green (added test-wind-zone.js,
         test-achievement-eval.js; 86 files total).
Prereq:  server/sql/speedrunner.sql AND server/sql/user_characters.sql are applied.
Serve:   run the branch working directory locally (that's how prior "branch build N"
         runs worked). Assumptions + deferrals: docs/SPEEDRUNNER_PHASE3_RUN_NOTES.md.

QA automation seams on window.SANDBOX (must be INSIDE a Sandbox world so window.game
exists): selectItem, cycleSpikeOrientation/getSpikeDir, setBoosterConfig/getBoosterConfig,
setWindConfig/getWindConfig, publishWorld. Use these to place + configure blocks (the
right-click/movement gestures don't arrive via CDP).

--------------------------------------------------------------------------------
E7 — WIND / CURRENT ZONES  (the flagship)
--------------------------------------------------------------------------------
2D (FULL):
  - Sandbox → Other palette → "Wind Zone". Paint a region of cells (all modes).
  - Right-click a wind cell (with Wind Zone selected): popup sets Direction (8-way),
    Strength, Wall Thickness, Redstone (Always On / Channel A-C), Push While Grounded,
    Remove.  Or scriptable: SANDBOX.setWindConfig(col,row,{dir:'right',strength:1.5}).
  - PASS: a player in the zone is pushed the set direction while airborne (and while
    grounded if that toggle is on). Cyan chevrons animate in the wind direction.
  - WALL-BLOCKING: put a solid wall (>= the Wall Thickness) inside the zone; cells in
    its DOWNWIND shadow get no push (walk behind the wall = calm).
  - REDSTONE: set a zone's Redstone to Channel A and wire a lever→channel A; the wind
    only blows while powered.
Overhead (RUNTIME only): overhead worlds with a worldData.windZones array push players
  (walls block via collision). No overhead editor tool yet (author via JSON) + no
  overhead redstone gating — both flagged as follow-ups.

--------------------------------------------------------------------------------
E4 — GRAVITY INVERTER ZONES   ⚠️ HIGHEST-RISK, please scrutinize
--------------------------------------------------------------------------------
  - Other palette → "Gravity Zone" (side-scroll modes). Paint a region, ideally with a
    ceiling above it.
  - PASS: a player entering the zone FALLS UP, lands on the ceiling, can run along it,
    and JUMP pushes back down. Leaving the zone drops them normally.
  - This is a contained physics change (only active inside a zone; normal play is
    provably unchanged — verify normal jumping/falling elsewhere is identical).
  - KNOWN-SOFT (report what you see): dual-surface edge cases (standing on a real floor
    while inverted), interplay with double-jump / wall-slide / ledge-hang / slide.
    Overhead engine is NOT supported (side-scroll only).

--------------------------------------------------------------------------------
Epic CK — CHECKPOINTS + SPLITS  (Speed Runner)
--------------------------------------------------------------------------------
  - Other palette → "Checkpoint" (Speed Runner). Place one or more mid-level.
  - World Settings ▸ Speed Run ▸ "Checkpoints" (default ON).
  - PASS: touching a checkpoint pops "Checkpoint N <time>" and the HUD shows "CP n/total"
    under the timer (a split time is banked). Die after a checkpoint → you respawn AT the
    checkpoint with the run clock still running (not a full restart). The best-run ghost
    hides after a checkpoint respawn; a fresh run (from the start) re-shows it + resets CPs.
  - OFF: deaths always restart from the start line even with checkpoints placed.
  - Practice mode + player-placed personal checkpoints = deferred (not in this build).

--------------------------------------------------------------------------------
Epic D — PER-LEVEL ACHIEVEMENTS  (core only)
--------------------------------------------------------------------------------
  - The evaluator logic is shipped + unit-tested (ACHIEVEMENT_EVAL: collect N / defeat N /
    finish within T / <=N jumps / no-damage). NOT yet player-visible: the creator UI to
    define them, the in-play tracking + fire-on-completion, and the unlock-persistence
    route are deferred (documented). Nothing to click-test this round.

--------------------------------------------------------------------------------
Phase 3 — CHARACTER ROSTER  (save-half)
--------------------------------------------------------------------------------
  - Requires user_characters.sql (applied) + being logged in.
  - Open the parts-mixer builder (world card Character dropdown → "Custom…"). Build a
    character, click "🗂 Save to Roster".
  - PASS: "Saved '<name>' to your roster." and a row appears in public.user_characters
    for your user_id (definition JSONB = the mix). Offensive names are rejected. Logged
    out → a friendly "sign in" message.
  - The roster PICKER (apply a saved character to a world), MP per-player custom, the
    side-scroll builder preview, and the sprite-sheet pack pipeline are DEFERRED
    (documented in the run notes).

--------------------------------------------------------------------------------
DEFERRED THIS RUN (documented, not built — see run notes for specs)
--------------------------------------------------------------------------------
- Epic C (editor top-bar/world-list/Create-World cleanup), Epic UI (12-modal dark
  unification), Epic MB (music per-instance + Beat Grid), Epic A/B/LB storefront wiring
  (SQL is applied; the client/route build-out remains), CK3 practice mode, D wiring,
  Phase 3 picker/MP/preview/sprite-sheet.

--------------------------------------------------------------------------------
BUGS FLAGGED BY KEVIN — need browser repro (not fixed this run)
--------------------------------------------------------------------------------
1. Small world: after clearing blocks the sprite fell off the bottom + bedrock appeared
   below the cleared area (world-gen puts bedrock on the last grid row; likely a
   small-world boundary/render interaction). Needs a repro world + which mode.
2. X-ray did not work in Platformer TEST under GOD mode. No feature by that literal name
   was found in code — need to know the exact key/toggle you used so it can be traced.
Both are logged in the run notes as needs-investigation.
================================================================================


================================================================================
ADDENDUM — builds 467–471 (roster picker, storefront, achievements server, tidy)
================================================================================
(All on branch speedrunner-phase3. Server-dependent items need the BRANCH server running.)

[Phase 3 roster PICKER] (468)
  - Build + "🗂 Save to Roster" a character (466), then on ANY world card open the Character dropdown:
    a "My Characters" group lists your saved roster. Pick one → it applies to that world (card shows
    "★ <name>"). PASS = the saved character applies and persists.

[Epic C tidy] (467)
  - The Sandbox top bar no longer shows "Overhead Demo"; the controls no longer show "Import from Games"
    (replaced by the storefront flow). "Import from File" + "New Overhead World" remain. PASS = both gone,
    everything else works.

[Storefront server slices] (470) — needs the branch server + community browse UI/API:
  - Community browse sort=rating now orders by TRUE AVERAGE (rating_avg), not sum. New sorts: played /
    mostplayed (play_count), trending (last_played_at).
  - POST /api/worlds/:id/played increments play_count (any launch).
  - Publish now REJECTS a level with no finish/goal ("Add at least one Goal…") and sets state=published.
    Test: try to publish a world with no Goal Star → rejected; add a Goal → publishes.

[Achievements server] (465 core, 471 routes) — no player-facing UI yet:
  - Evaluator unit-tested (5 templates). POST/GET /api/achievements/world record/list per-level unlocks
    (needs speedrunner.sql). The creator UI + in-play tracking + fire are NOT wired yet (nothing to
    click-test); the server + evaluator are ready.

[Beat Grid core] (469) — no editor overlay yet:
  - js/beat-grid.js (tap-tempo + time→distance) unit-tested. The editor overlay UI is deferred.

STILL DEFERRED (documented in SPEEDRUNNER_PHASE3_RUN_NOTES.md; not click-testable this run):
  Epic UI 12-modal dark unification; Epic C left-tabs + overhead-fold + post-create description; Epic MB
  editor overlay; Epic D creator UI + in-play tracking; storefront LANDING screen + browse UI + downloadable
  /provenance + LB re-key; CK3 practice mode; Phase 3 MP-per-player + side-scroll preview + sprite-sheet.
================================================================================
