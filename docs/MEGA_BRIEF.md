# Mega session brief — correctness, performance and polish

**Hand this file to a fresh session.** It runs start to finish with no pauses: every decision
below is already made. If something genuinely blocks, take the recommended path stated here,
record the assumption in the commit, and keep going.

---

## 0. Where things stand before you start

| | |
|---|---|
| Deployed (`origin/main`, Railway) | **v3 build 361** |
| Branch `card-title-362` | **14 staged fixes, unmerged, pushed** — browser-unverified |
| Suite | Green. `node test/run.js` — check the **exit code**, not the tail |
| Soak | **PASS**, 7h31m: fps flat, heap sawtooth identical across thirds, 0 errors |

**First task: merge `card-title-362` into `main`, run the suite, push.** It is a fast-forward.
That build becomes **362**; bump `GAME_VERSION`, the `?v=bNNN` cache-busters in `index.html`,
and `CACHE_VERSION` in `sw.js` together — a badge that understates the build wrecks a QA run.

Read first: `docs/open-items-after-348.md`, `docs/settings-review-overhead.csv`,
`FUTURE_ROADMAP.md` §40–§44.

### Standing lessons — every one of these cost real builds

1. **`unit` is cell × density, not a cell.** Any offset written in units of it multiplies with
   density: invisible at density 1, badly wrong at density 4. This cost nine builds.
2. **Terrain is ONE flat cached layer.** Draw order can never make it occlude a sprite.
   Anything that should hide behind terrain needs a clip or a re-draw pass.
3. **Resolve settings against defaults on load.** Reading stored settings raw means any newer
   setting is silently absent (this hid the frame-rate cap completely).
4. **An id-scoped CSS rule is a latent bug** the moment the same markup can live elsewhere.
5. **Assertions must read code, not comments.** Strip comments before asserting; this bit twice
   in one day because fixes explain themselves in prose that mentions the thing being removed.
6. **Never verify with `cmd | tail`** — the pipeline's exit status is `tail`'s, so a red suite
   looks green. Capture the exit code.
7. **Measure before fixing anything positional.** `game._deathFx`, `_leftInset`, computed styles
   — instrument, then fix. Inference cost nine builds on one bug.

---

## Phase 1 — small fixes (all independent, headlessly verifiable)

1. **A4.7 lever hit-area.** `_deviceAt` forgives exact cell → one row down → two if raised, and
   it is still not enough. **Do not guess.** Add a temporary debug readout of the click cell and
   the lever's draw origin in the same units, decide from the numbers, then fix. Lesson 7.
2. **A9.6 wrong-engine import says nothing.** It correctly stopped saying "damaged" but is now
   silent. Give it `WORLD_TRANSFER.rejectionMessage()`'s phrasing, as the overhead editor has.
3. **Stale-key input flush.** Clear held keys when a session starts, so a `keydown` without a
   `keyup` cannot walk the player around in the next run.
4. **Burst pieces: small decaying height.** Removes the A1.4 ambiguity permanently — early
   frames legitimately fly over a pit rim, later frames settle behind it.
5. **World-card Delete → in-page confirm.** The last native dialog in the app. A native dialog
   parks the renderer and is invisible to automation; this one blocks unattended QA runs.
6. **§40.1 `allowExport` flag.** Hide Export for a flagged world: the flag, the three UI call
   sites, **and the server-side 403** (without it the flag is bypassed by URL). The owner must
   always be able to export their own world. Label it **"Hide from export"**, never "Protect".
   **Do not build §40.2** — browser-side encryption cannot work and would be dishonest.
7. **`unit`-offset audit at density 4.** Grep `this.unit *` across the overhead engine. Known
   suspects: **pipe climb-in** and **melee swing**. Anything positional expressed in `unit` that
   should be cell-relative is a bug waiting for a dense map.

---

## Phase 2 — overhead settings: schema conversion + Kevin's classification

The overhead panel is hand-written HTML with **no schema**, so it has no advanced tier and no
help text. Converting it is what makes everything below possible, and it makes the future user
guide generatable rather than hand-written.

**Convert `OH_WORLD_SETTINGS._render()` to a declarative schema** in the shape
`world-settings-ui.js` already uses: `{ key, group, type, opts, dflt, label, advanced, hint }`.
Reuse the existing sandbox-only Advanced tier and the "a tab/group with no visible rows hides"
behaviour.

### Kevin's classification — apply exactly

**Basic:** `moveSpeed` (core mechanic) · `climbLevels` · `jumpClear` · `doubleJumpClear` ·
`sprint` · `dodgeAttacks` · `dodgeMobs` · `doubleJump` · `doubleJumpStyle` · `masterZoom` ·
`blockCliffFall`

**Advanced:** `playerHeight` (**default 1**) · `elevOffset` (**default 0.5, the maximum**) ·
`jumpFloat` · `jumpScale` · `sprintMultiplier` · **the entire Weapons group** including
`attackBlockHeight` (**default 2**) · `dayStart` · `shadowStyle` · `shadowDir` · `maxStepDown`
(**default 2**) · `pitMode` (**default OFF — pits are obstacles, not deadly**) · `lavaMode`
(**default damage**) · `lavaDamage` · `glassShatter` (**default on**) · `mobDetectBlocks`

**Moves:** `mobDetectBlocks` moves into the renamed Threats group. `doubleJump` and
`doubleJumpStyle` move **above `doubleJumpClear`**, so the switch precedes the knob that
depends on it.

**Rename:** the group "Safety — Falling & Pits" becomes **"Threats"**.

Rows not named above keep their current tier. Where a default changes, existing worlds inherit
it through `resolve()` — that is intended, and it is exactly what lesson 3 unblocked.

---

## Phase 3 — performance

8. **Performance assessment button — MEASURE, don't predict.** Render the real world off-screen
   for ~60 frames per quality tier, time them, report **measured** fps per configuration plus a
   per-pass cost breakdown (live shadows / night / glare). The existing pure `OH_PERF.estimate()`
   stays as instant feedback while sliders move; this button gives the honest number for *this*
   machine and *this* world. **Put it in the World Settings panel, and a button on the editor top
   bar.** Build this before 9 and 10 — it makes them measurable rather than guesswork.
9. **Protected / Sacrificeable quality flags.** Per-pass flags (shadows, night, glare) marked
   Protected / Sacrificeable / Off; the governor sacrifices the cheapest *sacrificeable* pass
   first. **This replaces drag-ordering** — same control, no ordering puzzle, and it answers the
   real question ("never take my shadows"). Keep the existing policy underneath: cheapest visual
   first, then lower the cap, and only then sacrifice a protected-by-default pass.
10. **Chunked terrain bake + "Loading World".** The ~8fps opening is **one synchronous
    112,000-cell bake** blocking the main thread — which is why a zoom animation cannot play
    *during* it today. Bake N rows per frame and yield. Then: hold the view **zoomed in on the
    player** with a clearly visible "Loading World" banner; when the bake completes, **animate
    the zoom out** to the creator's default and drop the banner. Zoom happens **after** the load,
    not during. `Lock zoom in play` and the default-zoom setting already exist — reuse them.

---

## Phase 4 — §42 depth-correct occlusion (LAST, and alone)

Full design in `FUTURE_ROADMAP.md` §42. Blit the terrain cache in **horizontal row bands** and
emit entities between bands by depth; each band's source extends upward by
`maxElev × elevOffset`, and overlapping bands drawn in order give correct occlusion for free.

**The subtlety that decides one build vs three:** depth is `row + elevation` but bands are
row-only, so a mob on a **tall** wall must not be occluded by a **shorter** wall one row south.
Give each band a depth of `row * 1000 + maxElevInRow` and merge bands and entities into one
sorted list.

**Do it last, in its own commit, touching nothing else.** It changes how everything layers in
both engines and cannot be verified headlessly — isolated, it can be reverted without losing the
rest of the session.

---

## Out of scope — do not start these

§41 player-vs-creator settings split (**blocked**: ~16 rows in `docs/settings-review-2d.csv` are
still undecided) · §43 gate free rotation · §44 overhead playability (needs the Campaign decision
first) · glass block in both engines · flat-overlay logic gates · click-to-connect Tx picker ·
§38 doors and chests · §37 editor clipboard batch 2 · §31/§39.5 prefab and skin builder · §39
scale model · campaign levels and Phases 4–5 · Tower Defense · mob variety · water/hybrid ·
the user-guide generator (wants Phase 2 landed first) · §40.2 encryption (impossible) ·
the Konami canvas panel (deliberate Easter egg).

---

## How to work

- **Commit per item**, with the reasoning in the message — not just what changed but why the
  previous state was wrong. This project's commit log is its design record.
- **Bump the build number** on each commit that changes behaviour; keep `GAME_VERSION`,
  `index.html` cache-busters and `sw.js` in step.
- **Tests**: extend the existing files (`test/test-overhead-perf.js`,
  `test-overhead-editor-perf.js`, `test-overhead-rails.js`, `test-qa-fixes-347.js`). Assert the
  *reason*, so a regression fails loudly — e.g. that the elevation gate stays gone, that no
  palette rule is `#oh-rail`-scoped.
- **Do not change the deployed build while a tester is verifying it.** Stage on a branch.
- Update `docs/open-items-after-348.md` and the CURRENT STATE block in
  `STEVEO_PLATFORMER_CONTEXT_SUMMARY.md` as you go, so the next session starts informed.
- Anything visual you cannot verify headlessly: say so plainly in the summary rather than
  implying it works.
