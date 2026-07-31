# Steveo Platformer — Test Brief (builds 312–316, overhead + side-scroll glass)

> **Paste everything below the line into the Chrome-enabled Claude session.**
> Target the LOCAL build at http://localhost:8000 (WSL-hosted; not production).
> Relay the PASS/FAIL table + screenshots back to the dev (the WSL session).

---

You are testing an HTML5 canvas game ("Steveo Platformer") in Chrome, focused on the
top-down **Overhead Engine**. Work the checklist; for each item report **PASS / FAIL /
BLOCKED**, one line of what you saw, and a screenshot when the result is visual. End with
a compact table + any red console errors.

## Setup
1. Open **http://localhost:8000**. Hard-refresh (Ctrl+Shift+R). Confirm the debug HUD's top
   line reads **v3 build 316** — if not, refresh again (stale cache).
2. If a login screen appears, pause and let the human log in.
3. Sandbox → switch to the **🗺 Overhead** view → **New Overhead World** (e.g. 40×26, d1),
   OR open an existing overhead world → **Test**.
4. The debug HUD (top-right, in Test mode) is your instrument: build · mode · state; map
   size · density · zoom; player cell/elev/hp/weapon; keys held + sprint; jump-clear +
   day/night; live redstone channels. Backtick ( ` ) toggles it.

## A. Reconfirm the build-312 fixes
- **A1 (lock keys)** Place a **Gold Key** with the Items tool, then hand-click a **Lock**
  block and open its config. **"Accepted keys" must LIST the key** (e.g. "gold"). (This was
  the `[].slice.call(aSet)` bug — always empty before.)
- **A2 (lava migration)** Open a world saved before build 311 that used insta-death lava (or
  set Lava=Death, save, reload). World Settings → Lava must still read **Death**, not silently
  revert to Damage.
- **A3 (world date)** Save an overhead world offline → its Sandbox card shows a **Created:**
  date (not "—").

## B. Glass block + shatter (build 313)
Build a small rig: a **raised glass wall** (Terrain → **Glass**, elevation ≥ 1). Confirm
World Settings → **"Glass can be shattered"** is ON.
- **B1** The glass renders as a **solid, glossy, see-through pane** and blocks movement.
- **B2 (melee)** Stand next to it and **melee-swing** (F / click) → it **breaks into a
  walkable gap**, throwing **jagged shards that scatter and fade**. Screenshot mid-shatter.
- **B3 (ranged)** Shoot it with a **crossbow/trident** → it shatters and the **bolt flies on**.
- **B4 (off)** Set "Glass can be shattered" **OFF** → melee/ranged no longer break it (still
  solid + see-through).

## C. Flat-overlay logic gates (build 313)
- **C1** Place an **AND / NOT / NOR** gate → it renders as a **translucent overlay** on the
  terrain (you can see the ground through/around it), NOT an opaque block. The blue (input)
  / green (output) **side-dots** still show. Screenshot.

## D. Click-to-connect Tx picker + selected-at-top (build 314)
- **D1** Place a lever (Tx), a lamp, then hand-click the **Lamp** → its config shows a
  **"＋ Pick on map"** button.
- **D2** Click it → every transmitter on the map shows a **pulsing ring + #N badge** (blue =
  available). Click the lever → it turns **green** (wired) and a flash says "Listening to Tx #N".
  Click it again → it **disconnects**. **Esc / Enter** reopens the config with `rxIds` updated.
- **D3** In the config checklist, a **selected** transmitter sorts to the **top**, and a
  **"Listening to: Tx #…"** summary line appears.
- **D4** Same "＋ Pick on map" works from a **Drawbridge**'s config.

## E. Hide-redstone-in-play + reveal fix (build 315)
World Settings → **"Redstone wiring in play"**:
- **E1 (Hidden)** Set **Hidden**. In **Test** mode, the **wiring** (dust, gates, lamp, piston)
  is **ghosted/faint** but **levers/plates/locks stay solid** (operable sources visible).
- **E2 (Reveal when active)** Set **Reveal when active**. A dust/lamp is **hidden until its
  lever is flipped ON**, then appears. A wire that **starts powered** (lever placed already-on)
  is **visible from the start** (the reveal fix).
- **E3 (Always shown)** Set **Always shown** → everything draws normally (default).

## F. Regression sanity (should all still work from prior builds)
- **F1** Redstone: lever→dust→lamp lights; the HUD "channels ON" shows ONLY the lever's Tx
  (dust does NOT transmit its own channel); a Lamp/Piston config says **"Receives a signal"**
  (not "Broadcasts as Tx").
- **F2** Drawbridge: default = raised at rest, powering lowers it to cross; the per-bridge
  **"Rests DOWN"** toggle inverts that.
- **F3** Weight sensor (default threshold 1): a solo player standing on it powers its channel.
- **F4** Lava: **Damage** (default) ticks HP down while touching; **Death** insta-kills.
- **F5** Pits deadly → death animation; cliff-fall guard blocks big drops; keys → lock → E
  powers the lock (HUD channel gains the lock's Tx).
- **F6** Click the Test-mode **God** button → toggles to "★ God ON" (does NOT exit the session).

## G. Side-scroll glass (build 316) — switch to a SIDE-SCROLL (platformer) world
Editor → **Mechanics** palette tab → place **Glass**. World Settings → **"Glass Shatters"** ON.
- **G1** Glass renders as a **solid, see-through pane**; the player stands/walks on it and
  can't pass through it.
- **G2 (arrow)** Shoot a glass block with the **bow** → it **shatters** into shards.
- **G3 (head-butt)** Jump up **into** a glass block from below → it shatters.
- **G4 (hard fall)** Fall from a **height** onto a glass floor → you **crash through** (it
  shatters); a **gentle** step onto glass keeps it **solid**.
- **G5 (explosion)** Detonate **TNT** next to glass → it's destroyed (shards on the nether-bed
  blast).
- **G6 (mining)** In **Normal** mode, mine a glass block normally (hold to mine) → it breaks.
- **G7 (off)** Set "Glass Shatters" **OFF** → arrows/falls/explosions no longer break it (still
  minable in Normal).

## Report
A table: `Item | PASS/FAIL/BLOCKED | note`. Attach screenshots inline. Open DevTools console
and list any red errors (should be zero).
