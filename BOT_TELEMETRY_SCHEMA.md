# Bot AI Telemetry — Data Dictionary (`steveo-bot-telemetry/v1`)

**Purpose.** This is the single, authoritative reference for what the Bot AI
telemetry collects and how to interpret every field. Kevin hands an exported batch
of these logs to **Claude Code** or **Claude (web)** for review/tuning; this doc
exists so both tools read the same field the same way instead of guessing.

Telemetry is produced by `js/bot-telemetry.js` (`BOT_TELEMETRY`) at the end of each
arena match, one record **per bot per match**, accumulated in `localStorage`
(`steveo_bot_telemetry`) across sessions and exported as one JSON batch.

> **Companion bots** (Platformer/Normal/Campaign) are not yet logged — telemetry
> covers **arena** bots (competitive + co-op). See "Known limitations."

---

## How to produce / export logs

- **Play matches with bots.** Configure 1–3 arena bots in the pre-launch modal
  (per-slot Human/Easy/Medium/Hard) and play. Each match appends one record per bot.
- **Accumulate.** Records are **never overwritten** — play several matches per mode
  across one or more sessions to build a dataset.
- **Export a batch.** In the browser console: `BOT_TELEMETRY.download()` writes a
  `.json` batch (the `exportBatch()` shape below). `BOT_TELEMETRY.summarize()`
  prints a quick per-mode×difficulty win-rate/score roll-up. `BOT_TELEMETRY.clear()`
  resets the store.
- **Batch shape** (top-level wrapper — what you paste/attach for review):

```json
{
  "schema": "steveo-bot-telemetry/v1",
  "dataDictionary": "BOT_TELEMETRY_SCHEMA.md",
  "exportedAt": 1752460000000,
  "matchCount": 6,
  "matches": [ /* array of MATCH-BOT RECORDS (below) */ ]
}
```

---

## Match-bot record (one per bot per match)

| Field | Type | Meaning / how to interpret |
|---|---|---|
| `schema` | string | Always `"steveo-bot-telemetry/v1"`. Bump if the shape changes. |
| `matchId` | string | Groups all bot records from the SAME match. Records sharing a `matchId` were teammates/opponents in one game. |
| `ts` | number | Unix epoch **milliseconds** when the match ended (client clock). Sort/segment by this. |
| `mode` | string | Arena game-mode key: `DEATHMATCH`, `KING_OF_HILL`, `CAPTURE_FLAG`, `DEFEND_TOWER`, `COLLECT_EMERALDS`, `SURVIVAL_WAVES`, `MOB_HUNTER`, `CUSTOM`, `QUICK_BATTLE`. |
| `rulesetId` | string | Same as `mode` today (reserved so a named custom ruleset can be identified later). |
| `custom` | boolean | `true` if this was a Custom-Rules match (`mode === "CUSTOM"`). |
| `durationSec` | number\|null | Match length in seconds (`null` if unknown). |
| `bot.slot` | number | Player slot, 1-based (P1..P4) — matches the on-screen HUD. Bots are P2–P4. |
| `bot.ownerId` | string | Internal owner tag `p1`..`p4` (keys `stats` and winner). |
| `bot.role` | string | `competitive` (solo arena), `coop` (team arena), or `companion` (friendly follower — not logged yet). |
| `bot.difficulty` | string | `EASY` \| `MEDIUM` \| `HARD` — the preset this bot ran. **MEDIUM is the calibrated baseline; EASY/HARD are being tuned — this is the field to correlate against outcomes.** |
| `outcome.result` | string | `win`, `loss`, or `unknown` (winner couldn't be resolved, e.g. a draw/timeout with no single winner). |
| `outcome.score` | number | The bot's per-mode score (from `ARENA_MODES.playerScore`) — see "Score by mode" below. |
| `stats.*` | number | Objective stats, ALWAYS tracked regardless of mode (interpret per mode — see below). |
| `goalCounts` | object | `{ goalKind: count }` — how many brain-ticks chose each goal kind over the match. A quick behavior fingerprint (e.g. lots of `hunt` = it spent the match chasing, rarely engaging). |
| `decisionTrace` | array | The SAMPLED decision trace, run-length-collapsed (see below). |

### `stats` fields

| Field | Meaning | Primary in mode |
|---|---|---|
| `kills` | Player eliminations by this bot. | Deathmatch, KOTH, CTF, Tower |
| `deaths` | Times this bot was eliminated. | all (survivability signal) |
| `mobKills` | Mobs killed. | Mob Hunter, Survival Waves, Quick Battle |
| `emeralds` | Emeralds collected. | Collect Emeralds, Quick Battle |
| `hillSeconds` | Seconds spent controlling the hill. | King of the Hill |
| `flagCaptures` | Flags captured (this bot's own count; team total = sum). | Capture the Flag |
| `towerDamage` | Damage dealt to enemy towers. | Defend the Tower |
| `towersDestroyed` | Enemy towers destroyed by this bot. | Defend the Tower |

### Score by mode (how `outcome.score` is derived)

- **Deathmatch** = player `kills`. **Mob Hunter** = `mobKills`. **Collect Emeralds** = `emeralds`.
- **King of the Hill** = `hillSeconds` (scaled per the mode). **Capture the Flag** = team captures.
- **Defend the Tower** = health-based (no point score; read `towerDamage`/`towersDestroyed`).
- **Quick Battle** = `kills + mobKills + emeralds`.
- If in doubt, compare `stats` directly — they're mode-agnostic and always present.

### `decisionTrace` entries (sampled, run-length-collapsed)

The BotController records ONE snapshot per brain-tick (the decision cadence, not
per-frame). Consecutive identical decisions are collapsed into a run:

| Field | Meaning |
|---|---|
| `fromFrame` / `toFrame` | Frame range this goal was active (60 frames ≈ 1 second). |
| `kind` | The goal kind (see "Goal kinds" below). |
| `reason` | Short human-readable rationale the bot logged when it chose the goal. |
| `target` | The goal's target id (`p1`..`p4`, `hill`, `enemyFlag`, `tower:pN`, `mob<n>`, `emerald`, `defend`, `leader`, or `null`). |
| `cell` | `[col,row]` the bot was pathing to at the moment of the sample (or `null`). |
| `samples` | How many brain-ticks this run covered (run length). |

**Reading a trace:** each run answers "what was this bot trying to do, and for how
long." A healthy competitive bot shows runs of `engage`/`hunt` (kills), or the
mode's objective kind (`hill-hold`, `flag-grab`, `tower-attack`, …). Long `idle`
runs, or thrashing between many short runs, flag a tuning problem (can't reach the
objective, target flip-flop, stuck).

### Goal kinds (the `kind` values you'll see)

`engage`, `hunt`, `idle` (kills / fallback); `hill-approach`, `hill-hold`,
`hill-intercept` (KOTH); `flag-grab`, `flag-capture`, `flag-defend`, `flag-escort`
(CTF); `tower-attack`, `tower-defend` (Defend the Tower); `emerald`; `mob`
(waves/Mob Hunter); `companion-follow`, `companion-fight`, `companion-idle`
(companion — when that role is logged later).

---

## What to look for when tuning (EASY/HARD calibration)

1. **Win rate by difficulty** (`BOT_TELEMETRY.summarize` → `winRate`): against human
   or Medium opponents, Easy should lose more, Hard should win more. If Easy wins as
   often as Hard, the knobs aren't spread enough — widen `aimError`, `reactionFrames`,
   `detectRange`, `navPrecision` between tiers (`constants.js BOT_DIFFICULTY_PRESETS`).
2. **avgKills / avgDeaths by difficulty** — Hard should trade up (more kills, fewer
   deaths). A Hard bot with high deaths suggests it over-commits (raise caution) or
   its aim is wasted (check `aimError`).
3. **`goalCounts` balance** — an objective mode (KOTH/CTF/Tower) dominated by `hunt`
   or `idle` means the bot isn't playing the objective enough; a mode dominated by
   `hill-approach` but little `hill-hold` means it can't stay on the hill.
4. **Long `idle` runs in the trace** — usually "can't path to the objective" (map
   geometry) or "no target in range" (raise `detectRange`).

---

## Known limitations (be honest with the data)

- **Companion bots aren't logged yet** — arena bots only.
- **`recentDamage` in the threat blend is approximated** (nearest opponent credited
  when the bot's HP drops), so it's a heuristic, not exact attacker attribution.
- **Mixed Custom rulesets** follow the bot's fixed element PRIORITY, not the
  ruleset's scoring weights — a bot may optimize a different element than the one
  worth the most points. Multi-stage/sequenced win conditions aren't reasoned about.
- **Outcome `unknown`** appears for draws/timeouts with no single winner; treat those
  as neither win nor loss in win-rate math (`summarize` counts only explicit wins).
- The trace is **sampled at the brain-tick cadence** and run-length-collapsed — it
  reconstructs intent over time, not a frame-exact replay.
