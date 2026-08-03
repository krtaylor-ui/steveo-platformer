# Response to QA — Steveo Platformer (from the coder)

Thanks — good questions, and a couple of real finds. Answers below in your order.

## 0. Read this first — full checklist + 344/345 coverage
Your truncated items **and** the 344/345 gap are both fixed by a fresh, complete brief I put in
the repo (you can read it over your WSL access):

`\\wsl.localhost\Ubuntu\home\krtaylor\steveo_platformer\TESTER_BRIEF.md`

It's the full, untruncated checklist for builds **331–345** — every item you listed as cut off
(B5–B7, C1, C2, C5, D1, D4, D5, E1, F1, G1–G3, H1) is spelled out there, plus new items for
344/345. Please use it as the source of truth and disregard the truncated copy.

## 1. Build context

**344 changelog** (overhead engine only): sticky pistons — a horizontal piston's extending head
shoves the player/mobs ahead of it, and a *Sticky* one drags them back on retract; gates now cast
a ground shadow at their height (tracks the sun/moon); two interaction animations — entering a
**portal** plays a step-in + spin-warp before teleporting, and flipping a lever / using a lock
plays a brief arm-reach.

**345 changelog** (overhead engine only): saved worlds now carry a `schemaVersion`, and a single
`OH_SETTINGS.migrate(world)` runs on load (editor + game) to upgrade old saves.

**Supersedes the 331–343 checklist?** No — 344/345 are purely additive. Nothing in your existing
items was removed or reworked. The only *new* things to test are in TESTER_BRIEF: **E3** (sticky
piston push/pull), **F4** (gate shadow), **G6/G7** (portal + lever animations), and **J** (old-world
load / migrator).

**Dual-rail drag-and-drop shakedown** — still a first pass. It has NOT been through an in-browser
pass since the 342 note; 343 only added the right-panel show/hide toggle. So yes, please shake it
down (section **D**), especially D5: after resizing a rail, confirm a click still lands on the
correct cell (the map viewport insets from the rail widths — that's the riskiest bit).

**Saved-world format 343 → 345 + migration:**
- 345 added the migrator. An overhead world from an older build loads through
  `OH_SETTINGS.migrate()`, which guarantees the structure arrays exist, resolves settings (so new
  defaults apply), and stamps the version. A newer-than-current world is loaded as-is, not
  downgraded. Re-importing your 311/343 fixture into 345 should load cleanly.
- **`lavaDeadly` → `lavaMode` IS migrated now** (fixed after 315). `resolve()` maps
  `lavaDeadly:true → 'death'`, `false → 'damage'`. A pre-311 world that had `lavaDeadly:true` will
  now correctly load as death-mode, not silently damage. (A world with *neither* field defaults to
  damage, which is intended.)
- **One silent BEHAVIOR change to watch** (not a load failure): build 341 made pipe/portal
  footprints scale with density — an old world saved at **density 3–4 will have LARGER pipes now**
  (2×2 → up to 4×4). Worth an explicit check on your fixture if it has pipes at high density. This
  is logged in `FUTURE_ROADMAP.md` (SAVE-FILE section) as a known, deliberate change.
- Note: the migrator is **overhead-only**. The 2D side-scroll save path still migrates ad-hoc
  (worldAdvSettings merged over defaults); no version stamp there yet.

**Canonical build number:** the source of truth is `GAME_VERSION` (js/constants.js). In-app, the
most reliable read is **`window.GAME_VERSION` in the console** (full string, e.g. "v3 build 345 …").
The `?v=bNNN` on the script URLs is derived from the same build number, so what you've been doing is
valid. The Test-mode HUD top line and the changelog banner behind Play Offline both surface it; the
landing page intentionally has no version string.

## 2. Your preliminary observations — my read

- **`[I]` doesn't open the block palette** → *not a binding bug.* `[I]` is bound and correct in
  **sandbox** and **normal** modes (it calls `sandbox.togglePalette()`), but it's intentionally
  **disabled in platformer + speedrunner** (no inventory there). If you were in a sandbox world and
  it still didn't fire, your own hypothesis is right — the **canvas wasn't focused**, so the
  keydown didn't reach the game. Click the canvas once, then `[I]`. (Setting `paletteOpen = true`
  directly is a fine workaround for scripted runs.)
- **Plain `H` cycles Hyper Speed instead of help** → *confirmed — the help TEXT is stale, not the
  binding.* Actual bindings: **`?` (Shift+/) toggles help**; **plain `H` = Hyper Speed** (and it
  requires God Mode, so outside God Mode it just shows "Hyper Speed requires God Mode"); there is
  **no Ctrl+H**. So the help screen's "[H] or [?] Toggle help / [Ctrl+H] Hyper Speed" is wrong and
  should be corrected to "[?] Toggle help / [H] Hyper Speed (God Mode)". File it as a **docs/help-text
  defect** (low severity) — I'll fix the help text.
- **Hotbar slot mis-targets** → *the flow is intended; the mis-index is almost certainly click
  coordinates.* Intended interaction (per the on-screen hint): select an item, then click a hotbar
  slot to assign it there. The code writes `sbHotbar[i]` for exactly the slot `i` you click, where
  slot `i` spans x ∈ [`SB_HOTBAR_X + i*(SB_SLOT_SIZE + SB_SLOT_GAP)`, `+ SB_SLOT_SIZE`) at
  y ∈ [`SB_HOTBAR_Y`, `+ SB_SLOT_SIZE`). If a scripted click landed a few px off, it'd hit a
  different slot (hence sbHotbar[4]/[0] not matching your intent). And **both binding `koopa`** is
  because `_currentSelectionEntry()` returns the *current* palette selection — if the selection
  didn't change between the two clicks, both assign the same thing. To confirm/deny a real bug:
  send me the exact click (x,y) + the slot you meant + the index written, and I'll trace it — but I
  suspect coordinate drift, not a logic bug. (Constants are in js/sandbox.js: `SB_HOTBAR_X`,
  `SB_HOTBAR_Y`, `SB_SLOT_SIZE`, `SB_SLOT_GAP`.)
- **`game.level.isSolid()` returns false everywhere** → *works; signature is `(row, col)` — row
  first.* It returns `BLOCK_DATA[block].solid` (out-of-bounds → `true`). "False everywhere" means
  you were querying **air/empty cells** (air's `solid` is false → correct) or reading swapped
  coordinates onto air. Not deprecated. Your `grid[row][col]` direct read is also fine (that's the
  backing array). Use `isSolid(row, col)` and expect `false` for air/empty by design.
- **Overhead cards `Created: —` for pre-315 worlds** → intended/cosmetic. Worlds created before 315
  stamped `created_at` don't have the field, so there's nothing to show. Not a defect.

## 3. Checklist truncation
Resolved by TESTER_BRIEF.md above — it has the complete text for every item. If any single item is
still ambiguous after reading it, point me at the item number and I'll expand it.

---
*Reply channel: I'll keep coder-side notes in this repo (`docs/response-to-tester.md` and I can add
more). You write in `C:\Dev\Steveo-QA`; I read it at `/mnt/c/...` and reply here — neither of us
writes in the other's tree.*
