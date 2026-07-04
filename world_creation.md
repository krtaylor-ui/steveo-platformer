# World Creation — Working Doc & Feedback Loop

**Purpose:** make Claude-assisted world creation get *incrementally better each pass*. Kevin drops
feedback here (per world or general); each session Claude reads this first, folds the feedback into
the generator/authoring, and appends what changed. Goal: less re-explaining, more compounding.

**Related files:** `SAMPLE_WORLDS_CONCEPTS.md` (concepts), `SAMPLE_WORLDS_README.md` (import + physics +
redstone), `tools/gen-sample-worlds.js` (the generator/validator), `DECISIONS_LOG.md` (history).

---

## How to give feedback (fastest for Claude to act on)

For each world, a one-liner in the log below is enough. The most actionable shapes:
- **Keep / Edit / Discard** + why (e.g. "Edit — jumps too easy, tighten gaps to 4–5").
- **Specific coordinates or sections** ("the lava stretch around the middle is unfair").
- **Feel words** ("floaty", "too punishing", "boring middle", "great opener").
- **Global rules** ("all Speed Runs should have a mid checkpoint", "arenas need more cover").

Anything you can't describe precisely, just say "regenerate this one, try X" — a fresh attempt is cheap
via the generator.

---

## Data-model cheatsheet (so every pass starts informed)

- **Delivery:** worlds are `sample-worlds/*.json` (raw `GAME_STATE.serialize()` shape). Import offline →
  they land as **Normal**; set real mode via the world card **Mode dropdown**. (Renaming from the card is
  now supported too — build 53.)
- **Grid:** `grid[row][col]`, H rows × W cols, row 0 = top. Block ids = `BLOCK` enum; solidity = `BLOCK_DATA.solid`.
- **Physics (constants.js):** GRAVITY 0.66, JUMP_VELOCITY −12.0, MOVE_SPEED 6.0 → **apex ≈ 3.4 blocks**,
  same-level gap ≈ 6.8. Design rule: jumps lip-to-lip ≤ 4, rise ≤ 2, raised platforms ≤ 3 up.
- **Auto-Climb (build 54):** per-world `worldAdvSettings.autoStepUp` — walk/run up **1-block** ledges
  with no jump (universal; toggle in World Settings → Physics → Auto-Climb, or the pause menu). ON by
  default in the sample Speed Run worlds. Only affects single-block steps; 2+ still need a jump — so
  level geometry can still use height for pacing.
- **Speed Run:** `GOAL` (10) = finish, `playerPx/playerPy` = start, `levelId = playerName:worldName` (unique
  per world), `SPEED_ITEM`/`SPEED_BOOSTER`/`JUMP_PAD` supported. Respawn = back to start (no mid checkpoints
  in SR mode today — see open questions).
- **Arena:** `arenaViewType:'single'`+`arenaZoomMode:'NONE'` = auto-fit whole map on fixed screen. Placeables:
  spawnpoint `{col,row,slot}`, arenaobj `{type:'base'|'tower'|'heal',…,team|slot}`, hill `{col,row,w,h}`,
  emerald/powerup/spawnline/egg. `backgroundTheme` = `sky|cave|nether|end`.
- **Redstone (works):** lever(grid 27)→orthogonally-adjacent dust chain(`dustBlocks`, overlay)→adjacent
  trapdoor(23)/piston(24), OR-logic. Reference build = `saves/Platformer_-_V2_PLT_2026-07-04.json`.
- **Regenerate:** `node tools/gen-sample-worlds.js` (writes files + runs the structural reachability check;
  non-zero exit = a broken map).

## Structural check the generator enforces (catches broken, not bad)
Spawns/objectives on solid ground w/ headroom; physics-honest BFS reachability from start to every
objective; arena spawn counts. **Does not** judge fun/fairness/pacing — that's Kevin's playtest call.

---

## Open questions / candidate improvements (edit freely)

- **Speed Run checkpoints:** SR currently respawns at the start on death (no mid-level checkpoints). Long/hard
  runs (e.g. Nether Gauntlet) may want them. Worth adding a checkpoint mechanic to SR mode? (Would be an
  engine change, not just content.)
- **Jump feel:** current arc is floaty/forgiving. Want a tighter global feel (~JUMP −11 / GRAVITY 0.72)? If so,
  say the word and all maps get regenerated with the new margins.
- **Arena cover/verticality:** first-draft arenas are fairly open. More cover? More layers?
- **Redstone ambition:** trapdoor-door primitive is proven. Greenlight a follow-up that tries piston gates +
  AND/NOT logic puzzles (needs a browser test first).
- **New blocks:** proposed palette-only **End Stone** for cleaner End reads (not built).

---

## Feedback log (newest at top)

### 2026-07-04 — Batch 1 (the [Sample] worlds) — Kevin reviewing
_Kevin's per-world verdicts go here as he plays. Template:_
- `SR · First Steps` — _(pending)_
- `SR · Cavern Dash` — _(pending)_
- `SR · Nether Gauntlet` — _(pending)_
- `Arena · Grassland Melee` (FFA) — _(pending)_
- `Arena · Void Twins` (2v2) — _(pending)_
- `Arena · Fortress Rush` (CTF) — _(pending)_
- `Arena · Crater Crown` (KOTH) — _(pending)_
- `Arena · Keep Siege` (Defend) — _(pending)_
- `Arena · Switch & Sever` (redstone) — _(pending)_

**Workflow asks that came up during review (being addressed in build 53):**
- Rename worlds in Sandbox from the world-select screen. ✔ (build 53)
- Visible way to exit a level test in Sandbox. ✔ ("Test in Arena" now shows ✕ EXIT TEST + Esc) (build 53)
- Speed Runner: on-screen **Restart** button next to Pause/Exit (not just a keyboard shortcut). ✔ (build 53)
- Speed Runner: **pausing should pause the timer**. ✔ (build 53)
- Imports named "Imported World" — now use the embedded name / filename. ✔ (build 53)
