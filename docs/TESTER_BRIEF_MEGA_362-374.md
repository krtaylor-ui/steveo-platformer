# Browser test brief — mega session builds 362–374 (branch `mega-20260806`)

**You are a non-headless Claude with a real Chrome. Verify the changes below on screen.**
The whole session was built and unit-tested headlessly (1659 assertions, 0 failed); what a
headless run *cannot* see is pixels, animation, layout, and real timing. That is your job.

## How to run this brief

- **DO NOT STOP after each test.** Run the entire Part A list top to bottom, recording a
  verdict for each as you go, and **write one consolidated report at the very end** (template
  at the bottom). Do not pause to ask whether to continue.
- **Defer anything that needs a human or a second account** (file picker, Chrome permission
  panels, login-gated flows). Skip those inline, note "deferred", and collect them under
  **Part B** at the end so a human can do them in one sitting.
- Record **PASS / FAIL / BLOCKED / NOTE** for every item, with a one-line observation and a
  screenshot filename where a picture settles it. A FAIL is not a failure of the run — it is
  the point of the run. Be specific and honest; optimism here is worse than useless.
- Where a **console check** is given, run it in DevTools — it is faster and more objective than
  eyeballing. The overhead runtime exposes `window.OH_PERF`, `window.OH_WORLD_SETTINGS`,
  `window.OH_SETTINGS`, `window.OH_SOAK`, and (while playing/testing) `window.game`.

## Setup

1. Check out the branch under test and serve the client:
   ```
   git checkout mega-20260806
   npm run static        # → http://localhost:8000  (node server.js)
   ```
   Open **http://localhost:8000** in Chrome with DevTools open (Console + a Network tab).
2. **Confirm the build.** The version badge (bottom of the menu, `.app-version`) must read
   **`v3 build 374 …`**. In the console: `GAME_VERSION.match(/build \d+/)[0]` → `"build 374"`.
   If it says anything lower, you are on the wrong build — stop and fix the checkout/serve.
3. Note that **nothing here is deployed** — you are testing an unmerged branch locally. Most
   tests below work **offline** in Sandbox; the few that need login/backend are in Part B.

## Build the shared fixture (do this once, reuse for most tests)

Create a **dense** overhead world so the density-sensitive fixes (363, 369) are actually exercised:

1. Menu → **Sandbox**. Create a **New Overhead world** (🗺). In the creation dialog set
   **Grid density = 4** (this is the setting that broke A4.7 / pipe-climb at density 1). Pick a
   reasonable size (e.g. 40×30 base). Open it in the overhead editor.
2. In the editor, paint a small test scene and **remember where you put each thing**:
   - a patch of **raised terrain** (elevate some cells to level 2–3) forming a **wall**, with
     open ground just NORTH of it (behind it from the camera);
   - a **pit** in flat ground (a few cells), reachable on foot from all four sides;
   - a **lever** (redstone) sitting on flat ground, and a second lever on top of a raised block;
   - a **pipe** (building) with a destination, and open ground to walk into it from below;
   - one or two **glass** blocks (raised), and a couple of **mobs** and an **item**;
   - a **player spawn** and a **goal star**.
3. **Save.** Keep this world; call it **“Mega Fixture (d4)”**. Also make a quick **density-1**
   copy of a similar layout (“Mega Fixture (d1)”) for the density-1 comparisons in 363/369.

Reach points you will use repeatedly:
- **Overhead editor top bar:** `⚙ Settings`, `⏱ Perf`, `▶ Test`, `💾 Save`, `⬆ Import`,
  `⬇ Export`, `✕ Exit`.
- **World Settings panel:** editor `⚙ Settings` → has an **Advanced** checkbox (top-right) and,
  in the footer, **⏱ Measure performance** and **Reset to defaults**.
- **Play/Test the world:** editor `▶ Test`. In play, the **` (backquote)** key toggles the
  debug HUD (fps / worst-frame / cells-on-screen / tier).

---

# PART A — run all of these, do not stop

### 363 · A4.7 — lever selectable where it draws (density-scaled)
1. Open **Mega Fixture (d4)** in the editor, switch to the **Hand** tool.
2. Click **directly on the visible lever sprite** — on the *arm tip* (top), then the *base*
   (bottom), then ~1–2 cells to the *side* of it. Each click should **select the lever** (the
   action bar with ⚙ / ✥ / 🗑 appears, named "lever · Tx #…").
3. Repeat on the **raised** lever (on the level-2 block).
4. **Compare on Mega Fixture (d1):** at density 1 the lever is ~1 cell; clicking it selects,
   clicking a full cell *above* it should NOT (the sprite doesn't reach there).
- **Expected:** on the dense map you can select a lever anywhere its sprite is drawn (this was
  the bug — it used to select the empty cell and miss the lever). Hover also names the channel.
- **Screenshot** the dense lever selected from its arm tip.

### 365 · stale-key flush across sessions
1. `▶ Test` the fixture. Hold **D** (walk right); while still holding, press **`Esc`** / exit
   Test back to the editor, then `▶ Test` again.
2. On the new run, do **not** touch the keyboard for 2 seconds.
- **Expected:** the player stands still at the start of the new run — it does **not** drift/walk
  on its own from a key "still held" from last time.

### 366 · A1.4 — burst pieces have decaying height over a pit rim
1. In Test, walk the player **into the pit** (approach from the NORTH edge, i.e. up into the
   pit from below a cliff, is the worst case). The death burst plays.
2. Watch the coloured burst pieces near the **pit rim**.
- **Expected:** early frames of a piece can fly **over** the rim; as pieces settle they drop
  **behind** the rim (hidden by it) — height decides it, not a flat pop. No piece hovers
  implausibly on top of a rim block it should be behind once settled.
- **Tip:** the debug HUD (`` ` ``) slows the death to quarter speed — turn it on first to see it.

### 367 · world-card Delete = in-page confirm (no native dialog)
1. Sandbox world list → on any card click **🗑 Delete**. Then, in the editor, open a world and
   click the **🗑** in the editor HUD.
2. For each: a small **in-page** modal appears ("Delete this world? … This cannot be undone.")
   with **Cancel** (focused/primary) and a red **Delete**.
- **Expected:** it is an in-page modal, **never** a native browser `confirm()`. Pressing
  **Enter** immediately (without moving) **cancels** (Cancel is focused) — it must not delete.
  **Esc** or clicking the backdrop cancels. **Delete** removes the world; **Cancel** keeps it.
- Delete a throwaway world to confirm the OK path actually deletes.

### 368 · §40.1 — "Hide from export" hides the Export buttons (owner side)
*(The server-403-for-other-people half is Part B — needs a second account.)*
1. Editor `⚙ Settings` → turn **Advanced** on → **Designer Locks** → toggle **Hide from
   export** ON. Close settings, **Save**.
2. Check the three UI sites for THIS world:
   - the **world card** in the Sandbox list has **no Export button**;
   - the **editor / play-HUD Export** button (`Export`) is gone;
   - the overhead editor top-bar **⬇ Export** is gone.
3. Turn the flag **OFF** again, Save — all three Export buttons return.
- **Expected:** the flag hides Export everywhere in the owner's own UI, and the owner restores
  it by turning the flag off. (No claim of "protection"/encryption — the label is only "Hide
  from export".)

### 369 · pipe climb-in animation at density 4
1. In Test on **Mega Fixture (d4)**, walk into the **pipe** from below.
- **Expected:** the "reach up → grab the rim → pull up → sink in" animation plays **relative to
  the pipe** — the player grabs the pipe's rim and climbs, it does **not** collapse to a tiny
  motion buried at the pipe's centre (that was the density-4 bug). Compare against the pipe on
  **Mega Fixture (d1)**: the two should read the *same*, just scaled.

### 370 · Phase 2 — overhead World Settings schema + classification + new defaults
1. Editor `⚙ Settings`. With **Advanced OFF**, confirm you see only **basic** rows: e.g.
   *Player speed, Levels a walk can climb, Blocks a jump can clear, Double jump + style, Sprint,
   Jump-to-dodge, Default zoom, Stop players walking off cliffs*, etc. The **Weapons** group is
   **hidden entirely** (all its rows are advanced). There is no standalone "Mobs" group.
2. Turn **Advanced ON**: advanced rows appear — *Player height, 3D height offset, Jump float/
   scale, Sprint ×, the whole Weapons group, Day start, Shadow style/dir, Max walk-down, Pit
   blocks, Lava, Lava damage, Glass shatter, Mob detection range*. Hover a row label → a
   **tooltip/help text** shows.
3. Confirm the group is named **"Threats"** (not "Safety — Falling & Pits"), and that
   **Mob detection range** lives inside Threats. Confirm **Double jump** + **Double-jump style**
   sit **above** "Extra blocks the double jump adds".
4. **Changed defaults on a FRESH overhead world** (make a new one, don't touch these rows):
   - **3D height offset per level = 0.50** (stacks look taller than before);
   - **Max walk-down = 2 levels**;
   - **Pit blocks = "Solid obstacle"** (walking into a pit is blocked, **not** instant death).
   Play-test: walk into a pit on the fresh default world → you're **stopped**, not killed.
- **Expected:** panel scrolls cleanly, Advanced toggles rows, empty groups vanish, help text is
  present. The three defaults are as above. **These defaults also change existing overhead
  worlds** that never set those rows — note if any of your older worlds now look/behave
  differently (taller stacks / solid pits); that is intended.

### 371 · P3.8 — ⏱ measured performance
1. Editor `⏱ Perf` (top bar) on **Mega Fixture (d4)**. An overlay appears with **per-tier fps**
   (Full → Flat) and a **per-pass ms** breakdown (Live shadows / Night / Glass glare).
2. Also open `⚙ Settings` → footer **⏱ Measure performance** → same overlay.
3. Console cross-check (during `▶ Test`, so a live game exists):
   ```
   window.game.measurePerformance()
   ```
   → an object `{ baselineMs, tiers:[…{label,fps,msPerFrame}], passes:{shadowsLive,night,glare} }`.
- **Expected:** Full tier reports a **lower** fps than Flat; the numbers are plausible for your
  machine (not all 60, not all 0); live shadows is the largest per-pass cost. The button must
  **never freeze or break the editor** even if it can't measure (it falls back to a prediction).

### 372 · P3.9 — per-pass Protected / Sacrificeable / Off
1. `⚙ Settings` → Advanced ON → **Atmosphere** group: three selectors — **Shadows /
   Night lighting / Glass glare — when frames drop** — each Protected / Sacrificeable / Off.
2. Set **Glass glare = Off**, Save, Test: glass glare never draws.
3. Set **Shadows = Sacrificeable**, force load (big/dense map, zoom out) and watch the debug
   HUD tier — under sustained load, sacrificeable passes drop **before** protected ones.
   Console: `window.game._gov.flags` shows your policy; `window.game._gov._stack` is the drop
   order; `window.game._gov.cfg()` shows what's currently active.
- **Expected:** an **Off** pass never draws; under load the governor drops the cheapest
  **sacrificeable** pass first, then lowers the cap, and only touches a **protected** pass last.
  Defaults (fresh world): glare Sacrificeable, shadows + night Protected.

### 373 · P3.10 — chunked bake + "Loading World" + zoom-out
1. Make/open a **big, dense** overhead world (density 4, large size) and `▶ Test` it.
- **Expected on entry:** a **"Loading World…"** banner with a **progress bar** that fills
  (NOT an ~8fps frozen screen). When it completes, the view is **zoomed in on the player**, then
  **animates zooming OUT** to the world's default zoom, and the banner drops. The zoom happens
  **after** the load, never during. On a small world it may be near-instant — use a big one.
- **Screenshot** the Loading banner mid-progress.

### 374 · §42 — depth occlusion (walls hide things behind them) — **default OFF**
1. `⚙ Settings` → Advanced ON → **View & Controls** → turn **Walls hide things behind them
   (depth occlusion)** ON. Save. `▶ Test`.
2. Position so a **mob/item stands just NORTH of (behind) your raised wall**, camera looking
   "down".
- **Expected with it ON:** the taller wall **hides** the mob/item behind it (previously
  everything drew on top of every wall). A mob standing **high on a tall wall** is **not** hidden
  by a **shorter** wall one row to the south. Turn it **OFF** → everything draws on top again
  (the current/deployed behaviour).
- **Judgement calls to report** (this is a first cut): does a wall *convincingly* hide a mob?
  Are the mob's **feet clipped** by the block it stands on? Does the frame rate suffer with
  **many mobs** on a dense map (`⏱ Perf` with occlusion on vs off)? These decide whether it
  ships default-on.

### Regressions to spot-check (these were touched; confirm they still work)
- **A9.6 (364):** *(the happy paths — the file-picker rejection itself is Part B)* importing a
  normal side-scroll world and an overhead world still land in the right list with a success
  message; nothing silently vanishes.
- General overhead **play** still works end to end: move, aim, fire, melee (F), jump (Space),
  action (E), zoom (wheel), win on the goal star, pause (Esc), exit. No console errors during a
  1–2 minute play (`window.OH_SOAK.dump()` after → `errors 0`).
- The **editor** still paints/selects/moves/deletes, undo works, Save persists.

---

# PART B — deferred (needs a human, a file, or a second account) — do these LAST, together

1. **A9.6 file import rejection (364).** Sandbox → **Import from File** → choose a **non-world
   JSON** file (any random `.json`), and a **wrong-engine** file. *Expected:* an **in-page** error
   ("…not a Steveo world — no map data for either engine"), **not** a native dialog, and nothing
   is imported. *(Deferred: needs the OS file picker.)*
2. **§40.1 server 403 (368).** With **two accounts**: owner marks a world **Hide from export**
   and publishes/shares it; the **other** account tries to hit the export endpoint directly —
   `GET /api/worlds/sandbox/<id>/export` — and must get **403** ("creator has turned off export").
   The **owner** hitting the same URL must still get the file (200). *(Deferred: needs login +
   two accounts + the real backend, not `node server.js` static.)*
3. **Any Chrome permission / system panels** (e.g. download-location prompts on Export, storage
   prompts) — note anything that pops a browser-level dialog. *(Deferred: needs a human click.)*
4. **PWA / cache** sanity: after loading build 374, the version badge stays 374 across a reload
   (the `sw.js` cache key bumped to `steveo-shell-v374`). If it shows an older build after
   reload, note it (service-worker cache). *(Deferred if it needs manual "Update on reload".)*

---

# Report template (fill this in at the END, not per-test)

```
MEGA 362–374 BROWSER PASS — <date>, Chrome <version>, build badge: <…>

PART A
363 A4.7 lever hit-area (d4/d1) ........ PASS/FAIL/NOTE  — <obs> [shot]
365 stale-key flush .................... …
366 A1.4 burst height over rim ......... …
367 delete in-page confirm ............. …
368 Hide-from-export (owner UI) ........ …
369 pipe climb-in at d4 ................ …
370 settings schema + defaults ......... …   (defaults seen: elevOffset=?, maxStepDown=?, pitMode=?)
371 ⏱ measured perf .................... …   (Full ?fps / Flat ?fps; passes shadows/night/glare = ?/?/?)
372 quality flags Prot/Sac/Off ......... …
373 chunked bake + loading + zoom ...... …
374 §42 occlusion (flag on) ........... …   (feet clipping? perf with many mobs?)
Regressions (play/editor/import happy) . …

PART B (deferred)
A9.6 file rejection .................... DONE/PASS/FAIL or STILL-DEFERRED
§40.1 server 403 (two accounts) ........ …
Chrome system panels ................... …
PWA/cache version after reload ......... …

TOP ISSUES (most important first):
1. …
OVERALL: <ship / fix-then-ship / not-ready> — <one sentence>
```

Remember: **push through all of Part A without stopping**, defer Part B, and hand back one report.
