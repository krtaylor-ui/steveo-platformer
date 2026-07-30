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

## 3. Retire Rx / Tx from the palette  (keep engine kinds for legacy loads)
Transmit is built into every source, receive into every sink, so dedicated Rx/Tx blocks are redundant for the common flows. **Remove them from the palette; keep the `tx`/`rx` kinds in the engine** so old saves still load.

**Open decision:** the one capability `tx` uniquely had is a **relay / wireless→wired bridge** ("receive channel A, re-emit onto a dust wire or channel B"). The engine already lets a *source* listen to channels (rxOn) and conduct — it's just not exposed in the editor. If we ever want relays, expose an **"also listen to channel(s)"** option on transmitters (strictly better than a dedicated block). **Do we need wireless→wired bridging / channel relays?** If no → Rx/Tx can vanish from the UI entirely.

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

### Also confirmed this loop (already shipped, builds 307–312)
debug HUD · lit lamps + cleaner shadows · dust-is-wire · sinks receive-only · click-coords fix · offline overhead list · live sprint HUD · drawbridge polarity toggle · weight threshold 1 · two-state lava · lock-keys fix · lava editor migration · world dates · QA regression fixtures.
