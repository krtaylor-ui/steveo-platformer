# Creative Tools Roadmap — Audio-Synced Levels & the Sprite Studio

**Author:** design pass with Kevin, 2026-08-12. **Status:** spec / roadmap (not yet built, except where
noted "next bug-fix round"). Follows `docs/BRIEF_AUTHORING.md`. Read `STEVEO_PLATFORMER_CONTEXT_SUMMARY.md`
(CURRENT STATE) + memory `[[speedrunner-tranche2]]` before starting any phase.

This roadmap turns two Tranche-2 seeds — the **Beat Grid** (§Epic MB) and **custom characters / sprite
sheets** (Phase 3) — into a coherent creative suite: **levels choreographed to music**, and a **Sprite
Studio** where creators draw their own characters, enemies, items, and blocks.

---

## 0. The one insight that ties it together

The side-scroll engine already computes a **full animated skeleton** every frame (walk, run, idle, jump,
**double-jump spin**, fall, wall-slide, **ledge-grab + climb**, **bar hand-over-hand / brachiation**,
ground slide, crouch, grapple swing, hurt, weapon swing). That skeleton is the leverage point:

> Build a **stick-figure render mode** once (thin limbs + circle head drawn between the joints the
> animation already computes) and you get **three** things from one asset:
> 1. **Playable stick characters** (drawn by the real engine, animate through every move for free).
> 2. **The template animation sheet** — render the stick figure through every supported pose and
>    **export the frames**; guaranteed-accurate to the game's real timing.
> 3. **The ghost-draw underlay** — those same frames, faded, shown behind the raster in the paint tool
>    so new animators trace real motion (enable/disable, never saved).

Everything below is organized so the low-risk, high-value pieces (audio v1, stick mode) ship first and
feed the bigger pieces (Sprite Studio).

---

## 1. Decisions already made (do not re-ask)

- **Music v1 = pre-loaded catalog only.** A level PICKS a song from the existing `MUSIC_DISCS` catalog
  (`js/constants.js:379`); it PLAYS during the run; BPM is auto-detected from that track. **No per-level
  music upload/storage yet** (server space + licensing deferred). Kevin curates the catalog and will add
  more good-beat, free-to-use tracks.
- **The song is a gameplay cue, not decoration** — including playback is required, not optional.
- **Stick figures = TRUE line-stick render mode** (not a palette-only silhouette). Cosmetic only —
  **same hitbox** as every character (fairness rule). Two variants; **gender-neutral in-app copy** (the
  "man/woman" distinction is purely the visual silhouette, e.g. a skirt-triangle variant).
- **The Sprite Studio is multi-purpose** from day one: characters, enemies, **items, and blocks** — a
  general raster editor, not a character-only tool.
- **The best animation template is engine-exported**, not hand-drawn — it can't drift from the game.
- **`classic` stays the default look everywhere; existing worlds unchanged.**

## 2. Open questions (decide at build time / with Kevin)

- **Stick naming** — proposed neutral names: **"Stick"** (plain) + **"Stick+"** or **"Sketch"** (the
  skirt-silhouette variant). Kevin to confirm final names.
- **Bitmap storage ceiling** — painted/imported sheets stored as data-URI in `world_data`. Cap the sheet
  (e.g. ≤ 512×512, PNG) so saves stay light. Confirm the cap; revisit if worlds bloat.
- **Where the Sprite Studio launches from** — Sandbox top bar? Character screen? Both? (Recommend: a
  "Draw a Sprite" button next to the Parts Mixer, plus an editor-palette entry for block/item art.)
- **Overhead animation set** — the export template covers the rich SIDE skeleton; overhead has a smaller
  4-direction set. Decide whether the template ships side-only first (recommended) or both.

---

## PHASE A — Music v1: level music + auto-BPM  ⏱ NEXT BUG-FIX ROUND

**Goal:** a creator picks a catalog song for a level; it plays during the run; the Beat Grid's BPM/offset
auto-fill from that track so hazards land on the beat.

**Engine:** side-scroll (`Game`). **Modes:** Speed Runner first (Beat Grid lives there); extendable to
Platformer. **Player value:** rhythm-driven levels — the whole point of the Beat Grid.

**Work items (build order):**
1. **`js/bpm-detect.js` (new, PURE module)** — `BPM_DETECT.analyze(float32PCM, sampleRate) ->
   { bpm, confidence, offsetMs }`. Energy/onset envelope → autocorrelation over a plausible BPM window
   (e.g. 70–190). Return low `confidence` on weak/ambient beats. **Headless test** against synthetic
   click tracks at known BPMs (`test/test-bpm-detect.js`, add to `test/run.js`).
2. **Level Music setting** — in `js/world-settings-ui.js`, add a Speed Runner "Level Music" cycle/dropdown
   sourced from `MUSIC_DISCS` (`constants.js:379`), stored on `worldAdvSettings.levelMusicId`. "None" =
   silent (today's behaviour).
3. **Auto-BPM wiring** — when a track is chosen (or in the Beat Grid modal `SANDBOX.editBeatGrid`), decode
   the file via `AudioContext.decodeAudioData` → `BPM_DETECT.analyze` → prefill `beatGrid.bpm` +
   `offsetMs`, show the confidence, keep the manual fields as the correction. **Cache** the result per
   `audioFile` (analysis is deterministic per track) so it's computed once.
4. **Playback during the run** — in `js/game.js` SR launch/countdown, if `levelMusicId` is set, start that
   track (loop, respect the existing music-mute + volume settings) and stop it on death/win/exit. Reuse
   the existing music-disc playback path (don't add a second audio system).

**Acceptance:** pick a track → BPM auto-fills with a confidence read-out → the track plays during the run,
muted by the existing mute → beat lines line up with the audio (tightest under Constant Speed).
**Browser-only:** decode + playback + on-beat alignment (flag for the tester).

**Judgment calls:** BPM window bounds; confidence threshold below which we don't auto-apply (just suggest);
whether analysis runs on-select (simplest) or lazily on modal open.

---

## PHASE B — Stick-figure render mode + 2 playable stick sprites  ⏱ NEXT BUG-FIX ROUND

**Goal:** two playable "stick" characters drawn by the real engine, animating through every move.
Additive + opt-in (existing characters untouched). **Cosmetic only — identical hitbox.**

**Engines:** BOTH side-scroll (`js/player.js`) + overhead (`js/overhead/*` player draw). **Player value:**
a clean, iconic look — and the cornerstone asset for Phases D + F.

**Work items:**
1. **`stick` feat** — add to `js/characters.js` `LIST`: two entries (`stick`, `stickB`) with
   `feat: { stick: 1 }` (+ a `skirt: 1` on the second for the silhouette variant), neutral palette,
   `views: BOTH`. Names per Open Questions.
2. **Side-scroll stick draw** — in `js/player.js`, where the body/limbs draw from computed joint
   positions/angles (see the animation params near `js/player.js:774` — stride/rock/lift/legSwing/lean,
   plus `_rollFrames` spin, `_hangState` climb, brachiation), add a `if (feat.stick)` branch that draws
   **thin capsules/lines between the same joints + a circle head** instead of the blocky rects. Because it
   reuses the existing joints, run/jump/spin/climb/brachiation all animate with no new animation code.
   `skirt` adds a triangle between hip joints.
3. **Overhead stick draw** — mirror the branch in the overhead player renderer (4-direction, simpler).
4. **Verify hitbox unchanged** (fairness) + `classic` still default. Add a small headless sanity test if
   feasible (feat present, hitbox constant).

**Acceptance:** select "Stick" → the player is a line figure that runs, jumps, spins on double-jump,
wall-slides, grabs/climbs ledges, and swings hand-over-hand on bars, in both engines, with the same
hitbox. **Browser-only:** the actual look/animation (flag for the tester).

**Judgment calls:** line thickness (scale with sprite size), joint radius, whether the skirt variant also
tweaks the run cycle. Keep it readable at ~40px tall.

---

## PHASE C — Bitmap sprite render path  (foundation for all bitmap art)

**Goal:** the engine can draw an arbitrary **frame-sheet image** as a sprite (character/enemy/item/block).
This is the missing backend both the paint tool (Phase E) and the importer (Phase G) sit on.

**Work items:**
1. **Data model** — a sprite def `{ kind:'bitmap', frameW, frameH, cols, rows, rowMap, sheet:<dataURI> }`
   stored where the entity's look lives (`world_data.customCharacter` for players; block/item skin fields
   for those). Reuse the sheet spec already published in the how-to guide.
2. **Slicer + frame picker** — a pure helper `SPRITE_SHEET.frameRect(def, animRow, frameIdx)` (+ tests):
   maps (animation, frame) → source rect.
3. **Render integration** — in the side-scroll player draw and the block/item draw, when a look is
   `kind:'bitmap'`, `drawImage` the current frame instead of the parts/blocky path. Animation row chosen
   from player state (idle/run/jump/fall), frame from the existing walk/anim timer. Overhead: same, 4-dir
   rows.
4. **Storage guard** — enforce the size cap (Open Questions) on save; `log`/warn if exceeded.

**Acceptance:** a hand-authored test sheet assigned to a player renders + animates in both engines.
**Depends on:** nothing. **Blocks:** E, G. **Defer:** per-level music-style server upload (data-URI only
for now).

---

## PHASE D — Engine-exported animation template sheet

**Goal:** the reference sheet creators draw against — produced BY the engine so it matches real timing.

**Work items:**
1. **Enumerate the supported animations** (verify against `js/player.js`): idle, walk, run, jump-rise,
   fall, double-jump spin (nospin/simple/natural), wall-slide, ledge-grab, climb-up, climb-down, bar hang,
   brachiation crawl (smooth/brachiation/bigswing), ground slide, crouch, hurt, weapon swing. (Overhead:
   idle + 4-direction walk.)
2. **Offscreen exporter** — drive a stick figure (Phase B) through each animation at fixed frame steps,
   render each pose into a grid cell on an offscreen canvas, label the rows, and export a PNG + a JSON
   `rowMap`. Ship as: (a) a downloadable reference artifact now, (b) a "Load animation guide" source for
   Phase F later.

**Acceptance:** a labeled sheet with one row per animation, frames across, feet-aligned, exported from the
game itself. **Depends on:** B. **Interim (pre-B):** ship a hand-made blank template + row map as a
reference artifact so creators can start (the how-to guide already specs the format).

---

## PHASE E — The Sprite Studio (multi-purpose pixel/raster editor)

**Goal:** an in-app tool to draw characters, enemies, **items, and blocks**, output to the sheet format.

**Design:** a NEW self-contained editor (do **not** fork the overhead world editor — it's built around
world blocks/camera/level tools). **Lift the world-builder's patterns as a guide:** colour palette +
swatches, drag-to-paint pointer handling, and the undo/redo stack.

**Tools:** pencil, eraser, fill (bucket), eyedropper, line, rectangle, ellipse/circle, spray/airbrush,
mirror-draw (symmetry), colour palette (+ custom colours). **Canvas:** fixed pixel grid (e.g. 48×48,
selectable 32/48/64), transparency, zoom, pixel grid overlay. **Frames:** per-frame tabs + onion-skin
(previous frame faint). **Output:** the Phase-C sheet format; assignable to a character (via the Parts
Mixer neighbourhood), an enemy, an item, or a block skin.

**Acceptance:** draw a few frames → save → the sprite renders/animates in-game via Phase C. **Depends on:**
C. **Defer:** advanced tools (layers, gradients, dithering brushes) to a v2.

---

## PHASE F — Ghost-draw animation guide

**Goal:** new animators trace the real motion. In the Sprite Studio, a faded stick-figure underlay of the
current animation frame, shown behind the raster. **Enable/disable toggle; NEVER saved — display only.**

**Work items:** load the Phase-D exported frames; for the selected animation + frame index, draw them at
low opacity beneath the user's pixels; a checkbox toggles it; it's excluded from the exported sheet.

**Acceptance:** toggle on → faint stick pose appears behind the drawing for the current frame; toggle off →
gone; saved sheet contains only the user's art. **Depends on:** D + E.

---

## PHASE G — Sprite-sheet importer (the earlier Phase-3 deferral)

**Goal:** the "Import Sprite Sheet" button the how-to guide promises: PNG upload → set frame size / cols /
rows → preview → name → save, rendered via Phase C. **Depends on:** C. Reuses the published spec +
size guard.

---

## Deferred / later (explicitly NOT now)

- **Per-level music UPLOAD + server storage + licensing** — Phase A is catalog-only on purpose.
- **Jukebox filtering/tagging** for the growing catalog — nice, not urgent.
- **Top-down (overhead) dedicated animation rows** for imported sheets — side rows first.
- **Sprite Studio v2** — layers, gradients, palette import, community sprite sharing.

## Sequencing (recommended)

1. **Next bug-fix round (with the tester pass):** Phase A (music v1) + Phase B (stick mode + 2 sprites) —
   both are direct extensions of Tranche-2 features, so the tester validates them alongside the fixes.
2. **Then:** Phase C (bitmap render path) → D (exported template) → E (Sprite Studio) → F (ghost guide) →
   G (importer). C is the gate; D/E can overlap once C lands.

## Guardrails (every phase)

- Bump the build per behaviour change (`tools/bump-build.js`), keep `node test/run.js` green.
- Additive + opt-in; `classic` default; existing worlds + single-player unchanged.
- **Cosmetics NEVER change the hitbox** (stick sprites + bitmap sprites alike).
- Gender-neutral copy; sprite names may be whimsical but descriptions carry no he/she.
- Branch work; **no merge to `main` without Kevin's OK**. Commit co-author:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
