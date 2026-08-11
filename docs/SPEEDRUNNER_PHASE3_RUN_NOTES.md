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
