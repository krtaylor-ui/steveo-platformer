================================================================================
TESTER BRIEF - SPEED RUNNER OVERHAUL (branch speedrunner-overhaul, builds 440-453)
================================================================================

Branch:  speedrunner-overhaul  (off main @ build 439; NOT merged - Kevin reviews)
Builds:  440 -> 453
Suite:   node test/run.js  -> all green (added 6 new headless test files)
Scope:   the migration-free slice of the Speed Runner MEGA brief. DB-gated storefront/
         level-state/leaderboard work was taken up to the SQL wall and specced in
         docs/SPEEDRUNNER_MIGRATIONS.md (nothing there is applied yet).

No controller-specific items were added this session, so there is no separate
CONTROLLER_* brief for this round.

HOW TO TEST: play in the browser on the branch. Most items are in Sandbox (build a
world), World Settings, or Speed Runner play. Default behaviour of EXISTING worlds
must be unchanged - every new setting is opt-in / defaulted to the old behaviour.

--------------------------------------------------------------------------------
WAVE 1 - QUICK WINS + BUG FIXES
--------------------------------------------------------------------------------

[E3] Launch Accel/Lift moved to Transport group          (build 440)
  - World Settings > Movement tab > TRANSPORT group now holds "Platform Launch
    Accel" and "Platform Launch Lift" (they used to be under Physics).
  - PASS = they still work: a moving platform hitting a Launch Ramp flings the
    player the same as before. Pure reorg; feel unchanged.

[F1] Spike-on-a-moving-platform (VERIFY ONLY, no code change)
  - Build a moving platform (rail + anchor) with a SPIKES block in the group.
  - PASS = the spike rides the platform as a solid moving obstacle and draws as a
    spike. NOTE: a lifted/moving spike is a solid obstacle (avoid it), it does not
    deal contact damage while moving - matches the design call. Flag if you expected
    a damaging moving spike (that's a documented future option).

[E6] Speed Boost Zone works OUTSIDE Speed Runner + config (build 441)
  - Place a SPEED_BOOSTER (Other palette) in a NORMAL/PLATFORMER/ARENA world.
  - Walk onto it: you should visibly SPEED UP (it used to do nothing outside SR).
  - Right-click the block WITH IT SELECTED -> config popup: Mode (Temporary /
    Permanent), Boost +25%..+200%, Linger 1..8s (temporary only).
  - PASS: Temporary = fast on the block, lingers, then back to normal; Permanent =
    stays fast the rest of the life. Save + reload keeps the config.

[E11] Lava Instant Death is a named setting               (build 442)
  - World Settings > World > Blocks > "Lava: Instant Death" (default ON).
  - ON (default) = touching lava is a one-hit kill (classic). OFF = lava deals heavy
    damage with brief invulnerability, so a quick brush is survivable.
  - PASS = default worlds behave exactly as before; OFF makes lava survivable.
    Void / falling off the map is ALWAYS deadly regardless.

[E12] Spike orientation (up/down/left/right)              (build 443)
  - Place SPIKES against different surfaces. Default points away from the surface
    (floor -> up, ceiling -> down, wall -> sideways).
  - Right-click a spike (spikes selected) CYCLES the valid orientations for that
    spot; one click PAST the last valid orientation REMOVES the spike (deliberate -
    not a wrap like goal-star colours).
  - PASS = spike renders pointing the chosen way; damage only on the exposed (tip)
    side, not the side buried in the wall. Save/reload keeps orientation.

[E13] "Other" palette filters by world play-mode          (build 444)
  - Open a world's mode (Sandbox card > Set play mode) then open the Other palette.
  - PASS: a SPEED RUNNER or PLATFORMER world HIDES arena objectives (Hill, Spawn
    Line, CTF Base/Tower/Heal, Power-Up, Player Spawn); an ARENA world hides the
    survival/dimensional gear (nether/end portals, respawn anchor, wither altar/head,
    eye of ender). Universal items (Chest, Music, Speed Boost, Jump Pad, arrows,
    spawn eggs) always show. Same filter applies inside a Chest's Other tab.

--------------------------------------------------------------------------------
WAVE 2 - SPEED MODEL + MECHANICS  (all in World Settings > Speed Run tab)
--------------------------------------------------------------------------------

[E1] Pace split + precision inputs                        (build 446)
  - Base Speed + Max Speed are now SLIDER + a one-decimal NUMBER BOX (type a value
    like 1.3). "Max = Base (no speed-up)" toggle makes the runner cruise at Base
    (hides Max). Acceleration has a new "Instant" option (no ramp).
  - PASS = precise values stick; Instant = full speed immediately; Max=Base = flat
    cruise, no speed-up.

[E2] Constant Speed (auto-run)                            (build 445)
  - "Constant Speed (auto-run)" toggle. ON = a true auto-scroller pinned at Max
    the whole run; you steer jumps, not pace. Ghost stays in sync.
  - PASS = with it ON the runner moves on its own at a fixed speed.

[E5] Player Speed Zones                                    (build 449)
  - In a Speed Runner world, place a run of SPEED_BOOSTER blocks as a "zone".
    Per-block config (E6 popup) sets its strength; Permanent = a SUSTAINED zone
    (stays fast after you leave), Temporary = a burst.
  - PASS = running through the zone raises the runner's speed accordingly (capped
    at 1.5x max for fairness/ghost).

[E8] Attempt counter + best-progress %                    (build 448)
  - Play a Speed Runner level, die partway, retry a few times.
  - PASS = under the timer: "Attempt #N  .  Best NN%". The best % climbs as you get
    further and shows EVEN ON A FAILED run; a clear banks 100%. Persists per level
    (localStorage) across sessions.

[E9] Instant Retry                                         (build 447)
  - Speed Run tab > "Instant Retry" (default off). ON = a death restarts with NO
    3-2-1 countdown the moment the death animation clears (no wait for a key).
  - PASS = ON restarts instantly (no perfect-start boost, by design); OFF = classic
    countdown.

[E10] Rule-set presets                                     (build 450)
  - Speed Run tab > PRESETS group: Classic Runner / Auto-Scroller / Plumber Mode /
    Shape Run / Zen Flow. Click "Apply".
  - PASS = the Pace settings jump to that preset's batch, and every individual knob
    is still editable afterwards. "Classic Runner" restores defaults.

--------------------------------------------------------------------------------
SAFETY + STOREFRONT (migration-free slices)
--------------------------------------------------------------------------------

[B6] Appropriateness filter (usernames/world names/descriptions)  (build 451)
  - Try to sign up with an offensive username, or create/rename a world with an
    offensive name/description.
  - PASS = rejected with "That ... isn't allowed - please choose another." Ordinary
    names (incl. "Scunthorpe", "assassin castle") pass. Usernames are now
    case-folded: if "Steve" exists, "steve"/"STEVE" are "already taken".
  - Server-enforced; the client also has window.MODERATION for instant feedback.

[A1] Published cap raised 2 -> 20                          (build 453)
  - PASS = you can now publish up to 20 worlds (was 2). (Requires being logged in.)

[A2] Level finish validator (logic shipped; state gate is DB-gated)
  - Not directly visible yet. LEVEL_VALIDATOR.canGoLive checks a level has >= 1
    Goal before it can go Live/Published (both 2D goal blocks and overhead
    goal/portal). Wired to the state transition once the state column exists.

--------------------------------------------------------------------------------
BLOCKED-UNTIL-SQL (built to the wall; apply docs/SPEEDRUNNER_MIGRATIONS.md first)
--------------------------------------------------------------------------------
- Level states Draft/Live/Published + downloadable + immutable provenance (Epic A)
- Storefront sorts/tags/thumbnails/duration/search + creator profiles (Epic B)
- Per-level achievement PERSISTENCE (Epic D3; templates+evaluator design is ready)
- Speed-Runner leaderboard re-key author:worldName -> worlds.id (LB)
These are specced in docs/SPEEDRUNNER_MIGRATIONS.md. Do not test until SQL is applied.

--------------------------------------------------------------------------------
DEFERRED THIS SESSION (documented, NOT built - see RUN SUMMARY in the summary doc)
--------------------------------------------------------------------------------
- E4 Gravity Inverter zones (full ceiling-walk flip = a large, high-risk physics
  rework; deferred rather than shipped half-done).
- E7 WIND / current zones (the epic - both engines + wall-blocking + redstone).
- Epic CK Checkpoints/Practice/Splits; Epic C editor/Create-World cleanup; Epic UI
  modal unification (spec written: docs/UI_STYLE_GUIDE.md); Epic MB music/Beat Grid.

--------------------------------------------------------------------------------
NEEDS KEVIN'S VISUAL CONFIRM
--------------------------------------------------------------------------------
- The unified-modal refactor (Epic UI) was NOT applied - only the style guide is
  written (docs/UI_STYLE_GUIDE.md). No modal look changed this session.
- All Speed Runner HUD/settings changes are best confirmed on a TV/controller for
  legibility (the point of the scaled-up spec).
================================================================================


================================================================================
ADDENDUM - responses to the 440-453 test feedback (builds 455-456)
================================================================================

[B6] FIXED (build 455). Root cause: the cloud RENAME uses a dedicated endpoint
  POST /api/worlds/sandbox/:id/name that was never wired, and offline/local (lw-)
  worlds never hit the server at all. Now: client-side MODERATION.check in
  SANDBOX.createWorld (name + description) and SANDBOX.renameWorld, PLUS the /name
  server route. Re-test: creating/renaming any world (local or cloud) with an
  offensive name should now be rejected with an alert / 400.
  NOTE: if you test client files against the PRODUCTION API, the server half won't
  reject until this branch's server is deployed - but the client-side check now
  blocks it regardless.

[E8] per-level key collision FIXED (build 456). An un-saved editor "Test World" had
  no name, so levelId collapsed to ":" and every such run shared one key. It now
  falls back to "sr_unsaved_testworld". Real SAVED worlds always had a name and were
  never affected. (The permanent worlds.id re-key is still in the migrations doc.)

[QA UNBLOCK] new SANDBOX.selectItem(name) hook (build 456) - this is the "cheapest
  fix" you asked for. In Sandbox, select any palette BLOCK by name WITHOUT opening
  the canvas palette, then click the canvas to place it:
    SANDBOX.selectItem('SPIKES')          -> returns the block id (67), or null if unknown
    SANDBOX.selectItem('SPEED_BOOSTER')   -> 56
    SANDBOX.selectItem('LAVA')            -> then click canvas to place lava
    SANDBOX.selectItem('ANCHOR_BLOCK')    -> for moving-platform tests
  After placing, right-click the placed block (with it still selected) to open its
  config popup (E6 booster / E12 spike orient). This unblocks F1, E6, E12, E5, and
  the behavioural halves of E3/E11. Block names are the BLOCK enum keys in
  js/blocks.js (SPIKES, SPEED_BOOSTER, LAVA, JUMP_PAD, RAIL, ANCHOR_BLOCK, GOAL...).

[E3] note: Platform Launch Accel/Lift are ADVANCED settings - tick the "Advanced"
  checkbox in the World Settings header or they render on no tab. (They live under
  Movement > Transport when Advanced is on.)

[E13] note: otherItemVisibleInMode takes an ITEM OBJECT, not a block id. Pass the
  palette entry shape: otherItemVisibleInMode({ modes:['arena'] }, 'speedrunner')
  === false; otherItemVisibleInMode({ modes:['arena'] }, 'arena') === true; an item
  with no `modes` key is universal (true everywhere). Real palette items live in
  OTHER_PALETTE_ITEMS. The in-app behaviour (open the Other palette in worlds of
  each mode) is the more meaningful check.

[A1] published cap 2->20 still needs a manual run (publish 3+ worlds) - next session.
