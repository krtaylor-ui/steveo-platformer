# Sample Worlds — Concept List (Phase A)

**Prepared:** 2026-07-04 · **Author:** Claude Code content pass · **For:** Kevin's review
**Batch scope (chosen by Kevin):** *Focused (~9)* — 3 Speed Run + 1 flagship per Arena category (6).
**Delivery:** each world is a `.json` in the raw `GAME_STATE.serialize()` shape, imported via the
offline **Import** button. See `SAMPLE_WORLDS_README.md` for the exact import steps (one caveat:
imports land as **Normal** mode — set the intended mode via the world card's **Mode** dropdown afterward).

All worlds are prefixed **`[Sample]`** in their name so you can spot them at a glance, and carry
`provenance` marking them as generated test content.

---

## Movement physics basis (from `js/constants.js`)

Every jump/gap below was designed against the *real* constants, not by guesswork:

| Constant | Value | Meaning |
|---|---|---|
| `GRAVITY` | 0.66 px/f² | |
| `JUMP_VELOCITY` | −12.0 px/f | initial jump speed |
| `MOVE_SPEED` | 6.0 px/f | ground run speed (non-sprint) |
| `MAX_FALL_SPEED` | 21.6 px/f | terminal velocity |
| `BLOCK_SIZE` | 32 px | |

- **Max jump height** = v₀²/2g = 144/1.32 = **109 px ≈ 3.4 blocks** → comfortably clears a 3-block step up, cannot clear 4.
- **Airtime (same level)** = 2·v₀/g = **36.4 frames**.
- **Max horizontal gap (same level)** = 6.0 × 36.4 = **218 px ≈ 6.8 blocks**. Jumps that land *lower* reach farther.
- **Design rule used:** platform gaps ≤ **4 blocks** and step-ups ≤ **3 blocks** for a comfortable feel; the automated reachability check flags anything needing > 6-block / > 3-up (physically impossible without sprint/double-jump, both off by default).

Feel note for Kevin: at 6 px/f the run is fairly brisk and the 3.4-block apex is floaty-generous — good for forgiving Speed Run. If you ever want *tighter, twitchier* Speed Run feel, nudging `JUMP_VELOCITY` toward −11 and `GRAVITY` toward 0.72 would tighten the arc without breaking these maps (they're built with margin). Not changed in this pass.

---

## SPEED RUNNER (3 attempts — varied difficulty & theme)

Single-path routes (keeps ghost-replay + per-world leaderboard assumptions intact). Each uses a
**unique `worldName`** so its `levelId` (`playerName:worldName`) is distinct → separate ghosts/leaderboards.
Finish = `GOAL` block; start = `playerPx/playerPy`; `SPEED_ITEM` collectibles + `SPEED_BOOSTER` strips + `JUMP_PAD` launches used per the SR mode.

### 1. `[Sample] SR · First Steps`
- **Category:** Speed Runner (easy / intro) · **Players:** 1
- **Size:** Scrolling, **900 × 40** cols · **Theme:** Overworld (sky) — grass/dirt/stone palette
- **Pitch:** A forgiving on-ramp. Wide (4–6 wide) platforms, gaps of 2–3 blocks, gentle 1–2 block step-ups, a couple of `JUMP_PAD` "wheee" moments and a line of `SPEED_ITEM`s down an easy straight so a new player feels fast without dying. No hazards below most of the route (soft landings on lower ledges rather than pits).
- **Key placeables:** ~5 `SPEED_ITEM`, 3 `SPEED_BOOSTER` strips, 2 `JUMP_PAD`, 1 stacked `GOAL` gate at the end.

### 2. `[Sample] SR · Cavern Dash`
- **Category:** Speed Runner (medium / technical) · **Players:** 1
- **Size:** Scrolling, **1050 × 46** cols · **Theme:** Cave — deepslate/stone/gravel palette, `backgroundTheme: cave`
- **Pitch:** Rhythm-platforming. Tighter 3–4 block gaps, alternating high/low ledges, a `SPEED_BOOSTER`→gap combo where carried speed matters, and short drops over shallow hazard gaps (fall = respawn at start, SR-standard). Rewards flow.
- **Key placeables:** ~7 `SPEED_ITEM`, 4 `SPEED_BOOSTER`, 3 `JUMP_PAD`, hazard gaps (open pits), `GOAL` gate.

### 3. `[Sample] SR · Nether Gauntlet`
- **Category:** Speed Runner (hard / hazard) · **Players:** 1
- **Size:** Scrolling, **1200 × 50** cols · **Theme:** Nether — netherrack/soul-sand/obsidian, `backgroundTheme: nether`, **lava** below
- **Pitch:** The spicy one. A continuous **lava floor** under most of the route so a missed jump ends the run; precise 3–4 block jumps, `JUMP_PAD` chains over wide lava spans, soul-sand "slow" accents to punish sloppy timing, boosters to recover pace. Built with margin (no jump exceeds 4 blocks / 3 up) but *feels* dangerous.
- **Key placeables:** ~8 `SPEED_ITEM`, 5 `SPEED_BOOSTER`, 5 `JUMP_PAD`, continuous lava hazard, `GOAL` gate.

---

## ARENA (6 categories × 1 flagship map)

All Arena worlds: `arenaViewType: 'single'` + `arenaZoomMode: 'NONE'` → the engine auto-fits the whole
map on a fixed single screen (`_fitZoom`), the classic arena feel. Biomes set via `backgroundTheme`.
**Biome coverage requirement met:** Overworld ✓ (FFA, Defend), Cave ✓ (KOTH, Creative), Nether ✓ (CTF), End ✓ (2v2).

### A. `[Sample] Arena · Grassland Melee` — **4-Player FFA**
- **Category:** 4-Player FFA (Deathmatch / Mob Hunter / Collect Emeralds / Survival Waves) · **Players:** up to 4
- **Size:** 50 × 26 · **Theme:** Overworld (sky)
- **Pitch:** An open grassy bowl with two raised mesa platforms and a central pit-bridge — enough verticality for chaotic 4-way combat, no single dominating perch. 4 spawn points pushed to the four corners for fairness. Emeralds (2 groups) in contested middle; a `SPEED`/`HEALTH` power-up on each mesa. A pair of mob spawn lines so Mob Hunter / Survival Waves also work here.
- **Key placeables:** 4 spawn points (corners), ~8 emeralds (2 groups), 2 power-ups, 2 spawn lines, 2 spawn eggs (zombie/skeleton).

### B. `[Sample] Arena · Void Twins` — **2v2 / Team**
- **Category:** 2v2 Team (KOTH / Deathmatch+FF / team play) · **Players:** 4 (2v2)
- **Size:** 46 × 26 · **Theme:** End (`backgroundTheme: end`) — obsidian/deepslate islands over the void
- **Pitch:** Mirror-symmetric floating islands over a void drop (fall = death, End-style). Two team islands (slots 1&3 vs 2&4) flank a shared central island reachable by symmetric jump routes from both sides — perfect for KOTH or team Deathmatch. Fully symmetric so neither team has an edge.
- **Key placeables:** 4 spawn points (2 per side, mirrored), central `placedHill` (KOTH-ready), 4 emeralds mirrored, 2 power-ups mirrored.

### C. `[Sample] Arena · Fortress Rush` — **Capture the Flag**
- **Category:** Capture the Flag (2v2 max) · **Players:** 4 (2v2)
- **Size:** 60 × 24 · **Theme:** Nether (`backgroundTheme: nether`) — netherrack/obsidian fortress, lava moat accents
- **Pitch:** Two mirrored nether-brick fortresses at each end, each with a **CTF Base** (flag inherent) on its rampart. Three horizontal lanes between them — a fast top ridge (exposed), a mid corridor, and a low route past small lava pinches — so flag-runners have route choice and defenders have chokepoints. Roughly symmetric, lanes tuned so a full run is contestable, not trivial.
- **Key placeables:** 2 CTF Bases (team 0 / team 1, mirrored), 4 spawn points (2 per team, at each fortress), 2 power-ups (mid-lane), light lava hazard on the low lane only (never under a base or spawn).

### D. `[Sample] Arena · Crater Crown` — **King of the Hill**
- **Category:** King of the Hill (up to 4) · **Players:** up to 4
- **Size:** 40 × 24 · **Theme:** Cave (`backgroundTheme: cave`) — deepslate cavern
- **Pitch:** A central raised **hill zone** on a plateau in the middle of a cavern, approachable from **four directions** (two ground ramps, two side ledges you jump to) so no single approach dominates the sightlines — you can be contested from multiple angles, discouraging one-spot camping. 4 spawns ring the crater at equal distance to the hill.
- **Key placeables:** central `placedHill` (4×2) on a plateau, 4 spawn points (equidistant ring), 2 power-ups on the mid ledges, 4 emeralds.

### E. `[Sample] Arena · Keep Siege` — **Defend the Tower**
- **Category:** Defend the Tower · **Players:** 2–4 (one Tower per player/team)
- **Size:** 48 × 26 · **Theme:** Overworld (sky) — stone-keep aesthetic
- **Pitch:** Two defensible stone keeps on opposite raised platforms, each with a **Tower** (owner-tagged) set back behind a rampart so attackers must commit down a lane and up steps to reach it — defensible but not unassailable. A **Heal Tower** (PLACED) sits mid-map as a contested repair pickup, deliberately equidistant so grabbing it means leaving your own tower exposed — a real risk/reward, not an afterthought. Symmetric attacker lanes between the keeps.
- **Key placeables:** 2 Towers (slot 1 & slot 2, one per keep), 1 Heal Tower (PLACED, centre), 4 spawn points (2 per keep), 2 power-ups on the approach lanes.

### F. `[Sample] Arena · Switch & Sever` — **Creative / Other (redstone puzzle)**
- **Category:** Creative / Other · **Players:** up to 4
- **Size:** 44 × 26 · **Theme:** Cave (`backgroundTheme: cave`) — deepslate dungeon
- **Pitch:** The redstone experiment. A central emerald **vault** is sealed behind a **trapdoor door** wired to a **lever** by a visible redstone-dust line (modeled directly on the working lever→dust→trapdoor construction in `Platformer - V2`). Flipping the lever (L key) opens the vault — a simple, legible mechanic that gates the map's richest reward, so players race to trip it. A **second lever→dust→trapdoor door** opens a side alcove holding a power-up. Deliberately *simple* (per brief) — two one-lever/one-door circuits, not a contraption. (I used the **trapdoor door** as the reliable primitive rather than a piston gate — see the redstone assessment in `SAMPLE_WORLDS_README.md` for why, and what a piston follow-up should test.)
- **Key placeables:** 2 levers + 2 dust lines + 2 trapdoor doors; emerald vault (6 emeralds, 1 group) behind door 1; a power-up in the alcove behind door 2; 4 spawn points.
- **Custom Rules pairing:** none required to function (works on any FFA-type mode). Notes in the deliverable on whether a Custom Rules "reach-the-vault" objective would be a good follow-up.

---

## Proposed new block types (flagged as proposals — NOT built this pass)

None strictly required — existing palette reads each biome adequately (grass/dirt/stone = overworld,
deepslate/gravel = cave, netherrack/soul-sand/obsidian = nether, obsidian/deepslate + End sky = End).
One *palette-only* idea for a future pass (low-risk, sprite/color only, same mechanics): a dedicated
**End Stone** block (currently End reads via obsidian + the End sky theme; a pale end-stone sprite would
read cleaner). Left as a proposal for Kevin, not added.

---

## Build vs. defer status

All 9 concepts above are targeted for Phase B in this same session. If time runs short, priority order:
the 3 Speed Run worlds → CTF → KOTH → Defend Tower → 4P FFA → 2v2 → Creative/redstone (redstone last as
it's the experimental one). Final built/deferred list recorded in `DECISIONS_LOG.md`.
