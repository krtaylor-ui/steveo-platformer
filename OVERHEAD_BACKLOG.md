# Overhead / Redstone backlog (design-locked, not yet built)

Worklist captured during the build-307→312 QA loop. Nothing here is implemented yet.
Each item has the agreed behavior + the open decisions + a rough effort read.

**Palette convention (always be explicit):**
- **Overhead redstone palette** = `js/overhead/overhead-editor.js` + `overhead-redstone.js` (the 🗺 map view).
- **Side-scroll redstone palette** = `js/game.js` + its editor (the platformer view).
These are separate engines; when a change lands in both, call out each side.

---

## 1. Glass block — BOTH engines  ✅ spec locked
A see-through, solid block for the overhead **and** side-scroll palettes.

- **Solid + transparent** (blocks movement; you can see through it).
- **Always minable in Normal mode** (like any block; side-scroll has mining today, overhead mining is future — so in overhead the live behavior is shatter).
- **World setting: "Glass can be shattered" (on/off)** in both engines. Off = indestructible except mining.
- **Shatter triggers (when enabled): ALL of —**
  - ranged hits (arrows / bolts / trident),
  - explosions (TNT / creeper blast radius),
  - melee / any attack swing (not just mining),
  - hard impact / fall-through (player or mob landing on / hitting it at speed).
- **On shatter: a real shatter ANIMATION** — the block breaks into **jagged glass shards that fall to the ground and fade**, leaving a gap (permanent; does not reform). Reuse the death-burst particle pattern, glass-tinted, with gravity (side-scroll) / settle-in-place (overhead top-down).

**Effort:** medium-large. Overhead first (contained, headless-testable): palette entry + transparent `drawTerrainCube` variant + `glassShatter` setting + shatter hooks on melee/ranged/impact + shard FX. Then side-scroll: `BLOCK` enum entry + sprite + solid collision + mining + shatter hooks (projectile/explosion/melee/impact) + shard FX + setting. Side-scroll touches the mature engine — do it as its own careful pass with tests.

---

## 2. Flat-overlay logic gates + hide-redstone-in-play — overhead first, then side-scroll
- **Gates as flat overlays** (like dust) instead of opaque full-cell blocks, so they don't read as walls / can be hidden. Data + collision already treat gates as terrain overlays (they live in `redstone[]`, are walkable) — this is a **one-function render change** (`drawGate` → semi-transparent glyph over terrain, keep the blue/green I/O side-dots).
- **World setting "Redstone in play": Always shown / Hidden / Reveal when active** — applies to dust trails + logic/devices. Editor always shows them (ghosted when they'd be hidden in play).
- **Reveal fix (BOTH engines):** reveal if `everTriggered || currently-active` (side-scroll currently keys only off `everTriggered`, set on first *transition* — a signal that is **active at rest and never toggles**, e.g. a mid-play save with `on:true, everTriggered:false`, renders hidden). Using "or currently active" makes starts-active signals appear.

**Open decisions:** (a) world-level default + per-device override, or world-only? (b) in Reveal mode, **sticky** (stay visible once revealed — current side-scroll) or **live** (hide when the signal drops)? (c) does "Hidden" also hide **interactive sources** (levers/buttons/plates the player must operate), or keep those visible and hide only wiring + logic + passive sinks?

---

## 3. Rx / Tx — RESOLVED: keep them in side-scroll  ✅
Decision (Kevin, 2026-07-30): **keep the dedicated Rx / Tx blocks in the side-scroll
palette.** The overhead palette never had them (transmit/receive is built into every
overhead device), so there is nothing to retire there. No change to make — Rx/Tx stay as
they are in side-scroll (they cover the wireless→wired relay case).

---

## 4. Click-to-connect Tx picker + selected-at-top — overhead (and drawbridge modal)
The Tx checklist gets long. Add a **"＋ Pick transmitters on the map"** button to the sink modal **and** the drawbridge modal (both share `_txChecklist`). It reuses the click-to-move arming pattern:
1. Closes the modal, arms a `_pickTx` mode (like `_startMove`).
2. Highlights every transmitter on the map with a glowing ring + its **`#N` badge** (green if already listened-to, blue if available) + banner "Click transmitters to toggle · Esc when done".
3. A click on a transmitter **toggles** it in the sink's `rxIds` (connect *and* disconnect), with a flash; clicking a non-transmitter → "not a transmitter".
4. Esc/Enter reopens the modal with the checklist updated.

Plus: **selected Tx always sorted to the top** of `_txChecklist` (and/or a "Currently listening: T3, T7" summary line). **Hybrid** — keep the checklist, add click-to-connect. One build covers sinks + drawbridges.

**Effort:** moderate. New pieces = pick-mode state, one highlight render pass, click routing branch; everything else (hit-test, arming, indicator, flash, reopen) exists.

---

## 5. Export World — overhead editor  ✅ SHIPPED build 346 (2026-08-03)
Built with Import as well (the tester needed it to restore the old fixtures through the
real code path). Shipped: per-world **Export** on every Sandbox card, **⬇ Export / ⬆ Import**
in the overhead editor command bar, and **Import from File** made overhead-aware. One shared
module `js/world-transfer.js` owns the format — documented in `docs/world-file-format.md`,
sample export at `sample-worlds/Overhead_QA_Test.export.json`, 39 assertions in
`test/test-world-transfer.js`. Both open decisions below were answered YES. Original spec follows.

### (original spec)
The side-scroll side has export in **two** places — `SANDBOX_UI.exportWorld()`
(`js/sandbox-ui.js:715`, the Sandbox card's `sb-export-btn`) and the canvas Load-menu
per-world Export button (`MENU._exportWorldFromMenu`, `js/menu.js:613`). The **overhead
editor has neither**: `js/overhead/overhead-editor.js` only has `_save()` (line 1208) →
localStorage `steveo_overhead_worlds` when offline, or `PUT /api/worlds/sandbox/:id` when
signed in. There is no way to get an overhead world out as a file.

**Build:** an **Export** button on the overhead editor rail/toolbar beside Save / Test,
downloading the open world as pretty-printed JSON. Reuse the sandbox payload shape so the
two engines' files stay interchangeable:

    { world_name, description, game_mode_default: 'NRM',
      world_data: <this.world + viewMode:'overhead', schemaVersion>, exportedAt }

- Export the **in-memory `this.world`** (same object `_save()` serializes), so an unsaved
  edit exports what is on screen — not the last saved copy. Stamp `viewMode:'overhead'` and
  the current `OH_SETTINGS.SCHEMA` exactly as `_save()` does, so the migrator can read it back.
- Filename `<safe-world-name>-<YYYY-MM-DD>.json` (menu.js convention).
- Works **offline and signed-in** — build the blob client-side from `this.world` rather than
  hitting `/api/worlds/sandbox/:id/export`; that avoids needing a save first and is one code
  path for both modes.
- `_flash('Exported ✓')` for feedback, matching Save.

**Open decisions:** (a) also add **Import** (file-picker → validate `viewMode==='overhead'` →
run the migrator → load into the editor)? Kevin only asked for export, but import is the
natural pair and the offline-import path has a known **lands-as-NRM** caveat to respect.
(b) Should the Sandbox card's existing Export button also cover overhead worlds stored in
`steveo_overhead_worlds` (a different store from `LOCAL_WORLDS`, so it does not today)?

**Effort:** small — one button + ~20 lines lifted from `exportWorld()`, plus a headless test
that the exported JSON round-trips through the migrator. Import (if taken) adds a modest pass.

---

### Also confirmed this loop (already shipped, builds 307–312)
debug HUD · lit lamps + cleaner shadows · dust-is-wire · sinks receive-only · click-coords fix · offline overhead list · live sprint HUD · drawbridge polarity toggle · weight threshold 1 · two-state lava · lock-keys fix · lava editor migration · world dates · QA regression fixtures.
