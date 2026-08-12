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

## 0.5 The accessibility ladder (the organizing principle for creation)

The renderer is confirmed to be **parametric pieces (rects/`_limbBar` bars at joint transforms) driven by
an animation framework**, with feat accessories layered on (`js/player.js:1556` `_limbBar`, `:1573`
`_drawStanding`). That means creation is a **spectrum from zero-skill to full-control**, and each rung is
BOTH a complete stopping point and an on-ramp to the next. **Design goal: an absolute beginner who can't
draw or animate still makes something they're proud of.**

| Rung | Creator does | Draw skill | Anim skill | Reuses | Build |
|---|---|---|---|---|---|
| **0 · Pick** | choose 1 of 16 presets | none | none | — | ✅ exists |
| **1 · Mix & recolor** | curated parts (ears/tail/hat) + 5 colours | none | none | Parts Mixer | ✅ exists |
| **2 · Reshape (parametric)** | **sliders**: head size, limb length/width, build, height + swap part *shapes* (round/square head, pointy/floppy ears) | **none** | none | the parametric renderer | NEW |
| **3 · Draw your own pieces** | paint each **part** (head/torso/arm/leg/tail) on a shaped template; engine **skins** them onto the skeleton and animates | medium | **none** | the animation skeleton | NEW — the hybrid |
| **4 · Full frame sheet** | draw **every frame** yourself | high | high | Phase C render path | NEW |

**Rung 3 is the key unlock:** it's *skeletal skinning* — swap the parametric shape at each joint for the
creator's image drawn at the SAME transform, so every move (run/spin/wall-slide/brachiation) animates for
free. A beginner draws a *head and an arm*, not 24 frames.

**The rungs are a hybrid spectrum — they compose three ways:**
- **Per-part source:** each slot is independently *parametric*, *hand-drawn*, or *from a preset*. Custom
  head + parametric arms + preset tail is valid.
- **Graceful degradation:** draw bitmap art for the common poses (idle/run/jump); the **skeleton falls
  back** for rare moves you didn't draw (wall-slide, brachiation). Nobody is forced to draw the whole
  moveset to get a complete, playable character.
- **Proportions + skin:** slider the build (Rung 2), then paint a texture on it (Rung 3).

**Priority read:** for the beginner goal, **Rungs 2 & 3 are the highest creativity-per-effort** and lean
on the animation engine we already have; Rung 4 (full sheets) is the *least* accessible (needs animation
skill), so it comes AFTER — it still earns its place for items/blocks and skilled creators, but it's not
the on-ramp. This reorders the build (see Sequencing): the **skeleton-skinning "Part Studio" leads**, the
frame-by-frame "Frame Studio" follows.

**Beginner-accessibility principles (apply to every studio phase):** never a blank canvas (fork a preset);
a **live animated preview** running the real walk/jump beside the editor (the motivation loop); mirror/
symmetry draw (one arm → both); parametric-first (sliders before pixels); Randomize / "surprise me";
progressive disclosure (advanced tools hidden until asked); shaped templates + the ghost guide for those
who want to draw.

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

**Seeds Rung 3:** the stick branch draws pieces at the skeleton's joint transforms — i.e. it PROVES the
skinning path. Phase E1 (Part Studio) generalizes exactly this: swap the stick/parametric piece for a
user-supplied image at the same transform. Build B with that in mind (keep the per-joint draw calls clean
and enumerable).

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

## PHASE E1 — The Part Studio (Rungs 2–3: reshape + draw-your-own-pieces)  ★ the accessible core

**Goal:** the beginner-first studio — make a distinct, fully-animated character WITHOUT drawing frames.
Two rungs in one tool:
- **Rung 2 — Reshape (no drawing):** sliders for the parametric skeleton (head size, limb length/width,
  body build, height) + shape swaps per part (round/square head, ear styles, tail styles). Pure numbers →
  a distinct silhouette that animates through every move. This is the "can't draw at all" rung.
- **Rung 3 — Draw pieces (skeletal skinning):** paint each **part** (head, torso, upper/lower arm,
  upper/lower leg, tail, optional props) on a **shaped, labeled template** in a neutral pose. The engine
  pins each piece to its joint and animates it — no frames, no timing knowledge. Generalizes Phase B's
  per-joint draw.

**Enabling work (the skinning layer):** give each drawable part a slot `{ source: 'parametric'|'image',
image?, pivot, anchorJoint }`. In the player draw, at each joint transform, if the slot is an image
`drawImage` it (positioned/rotated/scaled by the SAME transform that drives the parametric shape today);
else draw the parametric shape. Per-part source = the hybrid. Store on the character def; render path
shared by both engines.

**Design (UI):** live **animated preview** running the real walk/jump beside the part canvas (draw → see
it run instantly); **mirror draw** (one arm → both); fork-a-preset (never blank); Randomize; the ghost
template shows where each part sits. Lift the world-builder's palette/shape/undo patterns.

**Acceptance:** slider a body + paint a head/arm → the character runs/jumps/spins in-game with those parts,
same hitbox. **Depends on:** B (proves the per-joint skinning). **Priority:** LEADS the studio work —
highest creativity-per-effort for the beginner goal.

---

## PHASE E2 — The Frame Studio (Rung 4: full sheets + items + blocks)

**Goal:** the full frame-by-frame pixel editor for skilled creators, and the ONLY path for **items and
blocks** (static, single-frame — the simplest case) and **non-humanoid** sprites.

**Design:** a NEW self-contained editor (do **not** fork the overhead world editor). **Lift** the
world-builder's palette/shape/undo patterns. **Tools:** pencil, eraser, fill, eyedropper, line, rectangle,
ellipse/circle, spray/airbrush, mirror-draw, colour palette (+ custom). **Canvas:** fixed pixel grid
(32/48/64), transparency, zoom, grid overlay. **Frames:** per-frame tabs + onion-skin. **Output:** the
Phase-C sheet format; assignable to a character, enemy, item, or block skin. Items/blocks skip the frame
machinery (one cell).

**Acceptance:** draw frames → save → renders/animates in-game via Phase C; a one-cell item/block skin
renders on the block. **Depends on:** C. **Defer:** layers, gradients, dithering brushes → v2.

---

## PHASE E3 — Enemy model templates (reskinnable movement + style presets)

**Goal:** offer a small library of **enemy MODELS** — each a controlled, system-generated movement + style
(e.g. the **spider** gait, a hopper, a flyer, a walker) — that a creator **reskins** (Rung 1–3) without
authoring the AI or the animation. Pick a model = pick how it moves + a base look; then recolor / reshape /
repaint its parts.

**Design:** treat an enemy model as `{ behavior: <existing mob AI id>, skeleton/anim: <preset>, skin:
<parts or bitmap> }`. The movement + animation come from the existing mob roster (Skeleton, CaveSpider,
etc. in `js/mobs.js`); the creator only supplies the SKIN via the same rungs as characters. Humanoid mobs
use the skeleton/Part-Studio path; non-humanoid (spider) use their own preset anim + a bitmap/parts skin.

**Acceptance:** pick "Spider" → reskin it → it patrols/attacks with spider movement but the creator's look.
**Depends on:** E1/E2 (for the skin) + a small enemy-model picker. **Player value:** custom enemies without
touching AI — huge for "make the game their own." Extends naturally to a shareable model library.

---

## PHASE F — Ghost-draw animation guide

**Goal:** new animators trace the real motion. In the Sprite Studio, a faded stick-figure underlay of the
current animation frame, shown behind the raster. **Enable/disable toggle; NEVER saved — display only.**

**Work items:** load the Phase-D exported frames; for the selected animation + frame index, draw them at
low opacity beneath the user's pixels; a checkbox toggles it; it's excluded from the exported sheet.

**Acceptance:** toggle on → faint stick pose appears behind the drawing for the current frame; toggle off →
gone; saved sheet contains only the user's art. **Depends on:** D + E2 (also aids E1 part templates).

---

## PHASE G — Sprite-sheet importer (the earlier Phase-3 deferral)

**Goal:** the "Import Sprite Sheet" button the how-to guide promises: PNG upload → set frame size / cols /
rows → preview → name → save, rendered via Phase C. **Depends on:** C. Reuses the published spec +
size guard.

---

## PHASE H — Movement Editor (custom emotes / dances / move-looks)  ☆ FAR FUTURE, not soon

**Kevin's vision (logged so we don't lose it):** because the renderer animates by moving JOINT positions,
a creator could author their OWN animations by posing the **stick-man reference** — a keyframe pose tool.
The system tweens between poses and scales/renders the motion onto whatever skin the character wears.

**Shape:** up to **~10 keyframe poses** on a timeline + a **speed control**; the engine **interpolates the
joints between poses** (ease in/out). Example: pose1 stand → pose2 hands above head → pose3 bend over,
hands on ground → pose4 forward roll → pose5 stand; play it as a loop or one-shot. This is classic keyframe
skeletal animation, and it's **architecturally compatible today**: a custom animation is just an *alternate
joint-pose provider* feeding the same draw path the procedural moves use.

**Two honest tiers of ambition:**
- **Emotes / dances / idle / victory poses** — pure VISUAL, no physics interaction. **Feasible** on top of
  the skeleton with a pose+timeline editor. Great, low-risk fun. This is the realistic first version.
- **New *gameplay* moves** — the animation is the easy part; the **mechanic/physics/collision** for a new
  move needs real engine support, and per the fairness rule **a custom animation must NEVER change the
  hitbox or physics**. So the editor supplies the LOOK; actual new mechanics are separate engine work.

**Depends on:** the stick skeleton (Phase B) + the Part-Studio skinning (E1). **Status:** roadmap only —
revisit after the studios land. Filed here so the "why the stick-man reference matters" thread isn't lost.

---

## Deferred / later (explicitly NOT now)

- **Per-level music UPLOAD + server storage + licensing** — Phase A is catalog-only on purpose.
- **Jukebox filtering/tagging** for the growing catalog — nice, not urgent.
- **Top-down (overhead) dedicated animation rows** for imported sheets — side rows first.
- **Studio v2** — layers, gradients, palette import, community sprite/part/model sharing.
- **Movement Editor (Phase H)** — far-future; emotes/dances feasible, new *mechanics* are separate.

## Sequencing (recommended)

1. **Next bug-fix round (with the tester pass):** Phase A (music v1) + Phase B (stick mode + 2 sprites) —
   both are direct extensions of Tranche-2 features, so the tester validates them alongside the fixes.
2. **Then (studio core, beginner-first):** Phase C (bitmap render path) → **E1 (Part Studio, Rungs 2–3 —
   LEADS)** → D (exported template) → F (ghost guide) → **E2 (Frame Studio, Rung 4 + items/blocks)** →
   G (importer). C gates the bitmap path; E1's skinning layer builds on B and can start in parallel with C.
3. **Then:** E3 (enemy model templates) once a skin path exists.
4. **Far future:** H (Movement Editor).

> **Reprioritized vs the first draft:** the beginner-accessible **Part Studio (E1, skeleton skinning)** now
> LEADS the studio work — Rung 4 full-sheet drawing (E2) follows, since it needs animation skill and mainly
> serves items/blocks + skilled creators.

## Guardrails (every phase)

- Bump the build per behaviour change (`tools/bump-build.js`), keep `node test/run.js` green.
- Additive + opt-in; `classic` default; existing worlds + single-player unchanged.
- **Cosmetics NEVER change the hitbox** (stick sprites + bitmap sprites alike).
- Gender-neutral copy; sprite names may be whimsical but descriptions carry no he/she.
- Branch work; **no merge to `main` without Kevin's OK**. Commit co-author:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
