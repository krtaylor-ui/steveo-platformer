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

## Speed Run design rules (v2 — from Kevin's Batch 1 playtest, 2026-07-04)

These are now **hard rules** baked into `tools/gen-sample-worlds.js` (`buildSpeedRun`). Apply to every
future Speed Run level:

1. **No stranding floor — a fall must kill.** SR void-death triggers only when `player.y+height >
   level.pixelHeight` (below the grid). So gaps must be **bottomless** (no bedrock/solid floor beneath),
   OR filled with **lava** (SR void/lava death → respawn). The old SR1/SR2 had a full-width bedrock
   bottom row that caught fallers and stranded them — removed. (SR3's lava-in-gaps already worked.)
2. **Long runs, few gaps.** Frequent gaps make a level unlearnable/unfair. Levels should be **mostly
   running** with a **small number of well-spaced gaps** (~5–8 per level), long continuous stretches
   between them, and every gap **doable** (≤4-block jump, or a jump-pad for wider ones). Prefer longer
   overall length over more obstacles.
3. **Telegraph every gap with learnable visual cues.** Players memorize a level run-by-run, so each
   obstacle must be **recognizable in advance**. Use:
   - a **ground "warning strip"** — the last ~3 surface blocks before a gap are a distinct bright block
     (type-coded: e.g. gold = normal gap, the green jump-pad itself = pad-jump);
   - a **sky marker** floating above the approach (a bar for a small gap; a taller pillar "gateway" for a
     pad-jump);
   - **zone bands** under the running path — vary the sub-surface body block by region (e.g. dirt →
     stone → gravel) so different areas look distinct and the player knows *where* they are.
4. **Use Auto-Climb for ramps.** 1-block steps are climbed automatically (no jump), so build **ramps**
   (short 1-block staircases) for elevation changes instead of forcing jumps. Reserve jumps for gaps.
5. **Jump pads on the ground.** Place JUMP_PAD at the **running surface** so the player naturally runs
   over and launches (SR checks the block under the feet). If a pad is a **landing target** (elevated),
   make it **≥4 wide** so it's a forgiving target.
6. **Speed boosters are tactical.** Place SPEED_BOOSTER strips deliberately: either **before a gap to help
   build speed** for the jump, or as a **trap** just before a spot where extra speed tempts an early/long
   jump and overshoots. Not decorative filler.

## Feedback log (newest at top)

### 2026-07-04 — Batch 1 Speed Run feedback (Kevin) → SR content pass v2 (generator rewrite; no app-code change)
- `SR · First Steps` / `Cavern Dash` — **Edit:** had a bedrock floor under the gaps → falling stranded
  the player. Fixed (bottomless gaps = void death). Rebuilt per rules 1–6 above. Now 1118 / 1318 blocks.
- `SR · Nether Gauntlet` — lava-in-gaps worked; rebuilt per rules 2–6 (longer runs, fewer gaps, cues,
  ramps, ground pads, tactical boosters). Now 1304 blocks with lava-channel gaps.
- Global rules 1–6 codified above and enforced in `buildSpeedRun`. The reachability validator is now
  **pad-aware** (models the jump-pad launch envelope) so wider pad-jumps verify honestly.

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
