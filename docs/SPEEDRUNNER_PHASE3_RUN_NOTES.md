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
