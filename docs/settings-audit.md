# Settings audit — basic vs advanced, by engine and mode

Groundwork for the player-facing user guide. Measured from the code on build 347, not
from memory: the 2D numbers come from evaluating `WORLD_SETTINGS.SETTINGS` in
`js/world-settings-ui.js`; the overhead numbers from `OH_SETTINGS.defaults` +
`OH_WORLD_SETTINGS._render()` in `js/overhead/overhead-settings.js`.

## Headline

The 2D engine **already has** both axes the guide needs — a per-setting `advanced: true`
flag and per-setting `modes: [...]` gating — in one schema. The overhead engine has
**neither**, and no schema at all (its panel is hand-written HTML).

| | 2D (side-scroll) | Overhead |
|---|---|---|
| Settings | **164** | **58** |
| Defined as | one declarative schema | hand-written HTML rows |
| Basic / advanced tier | **yes** (84 advanced, 80 basic) | **no** |
| Per-mode gating | **yes** (`modes:`) | n/a (one ruleset) |
| Per-setting help text | **yes** (`hint:`, user-facing prose) | **no** |

## 2D — by tab

| Tab | Basic | Advanced | Sub-rows | Groups |
|---|---|---|---|---|
| World | 12 | 7 | 6 | Look, Day/Night, Enemies, Display, Players, Scoring, Designer Locks, Redstone |
| Movement | 23 | 20 | 18 | Physics, Moves, Grappling Hook |
| Speed Run | 5 | 6 | 2 | Pace, Boosts, Camera |
| Arena | 13 | 0 | 1 | Camera, Match, Game Types |
| Combat | 13 | **32** | 11 | Boss Scaling, Ranged, Special Moves, Weapons, + 7 per-weapon groups |
| Mob Settings | 11 | 19 | 20 | Detection, Pack, Sprint, Wayfinding, Retreating Mobs, Spider Webs |
| Debug | 3 | **0** | 0 | Overlays |

## 2D — by mode

`sandbox` sees everything; the play modes see a filtered subset.

| Mode | Total visible | Basic | Advanced | Exclusive to it |
|---|---|---|---|---|
| Normal | 134 | 60 | 74 | 0 |
| Platformer | 138 | 62 | 76 | 4 (Scoring, in World) |
| Speed Runner | **14** | 8 | 6 | 11 (the whole Speed Run tab) |
| Arena | 131 | 63 | 68 | 13 (the whole Arena tab) |
| Sandbox | 164 | 80 | 84 | — |

Reading: Normal / Platformer / Arena share almost the same surface (~130 each) and differ
by a handful of exclusives. **Speed Runner is the outlier** — 14 settings total. Only
three tabs are genuinely mode-specific: Speed Run, Arena, and the Scoring group.

So the guide does **not** need a per-mode chapter for Normal / Platformer / Arena. One
shared chapter plus three short mode sections covers it, which is a much smaller guide
than "one per mode" implies.

## Grouping problems worth fixing before the guide is written

1. **"Advanced" means two different things in the product.** The design-time HTML panel
   (`world-settings-ui.js`, opened from Sandbox) treats advanced as a **tier** spanning
   every tab. The in-play canvas panel (`game.js`, `_wsTab`) has **"Advanced" as a tab
   name**, alongside Drops / Time / Input / Audio / Multi / SR / Physics / BG / Arena.
   A player who reads "see Advanced settings" will look for a tab in one place and a
   hidden tier in the other. **Pick one meaning before the guide names it.**
2. **Combat is 71% advanced** (32 of 45), almost entirely the 7 per-weapon groups. Right
   call, but it means the Combat chapter is a thin basic section plus a large annex.
3. **Debug: 3 rows, none flagged advanced.** Perf HUD, bot paths, nav grid are developer
   overlays. They should be advanced at minimum, and arguably out of the player guide.
4. **`sub` and `advanced` have drifted apart** — 10 sub-rows are not advanced, and 36
   advanced rows are not sub-rows. The two axes are independent by design (`sub` = a
   child of the row above; `advanced` = tier), but the overlap looks accidental in
   places. One consistency pass would stop the guide inheriting the inconsistency.
5. **Arena has 0 advanced rows** across 13 settings — plausible, but it's the only tab
   where nobody has made the call, so it's worth a deliberate look rather than assuming.

## Overhead — no tier yet

58 settings in 7 hand-written groups: Movement & Elevation (14), Weapons, Mobs,
View & Controls, Atmosphere — Day/Night, Safety — Falling & Pits, Interaction animations.

Because there's no schema, there's no place to hang `advanced` or help text. Adding the
tier means converting `_render()` to a declarative schema like the 2D one. That is the
same work as making the overhead settings **documentable**, so it's worth doing once
rather than bolting on a flag.

Candidate advanced rows on a first read (needs your call): `elevOffset`, `jumpFloat`,
`jumpScale`, `sprintMultiplier`, the four weapon-speed sliders, `tridentReturnSpeed`,
and the Interaction-animation zoom/speed knobs — all fine-tuning behind a working
default. Candidate basic: climb levels, player height, sprint on/off, double jump,
pit/lava safety modes, day-night on/off, control scheme, default zoom.

## The recommendation

**Generate the guide from the schema, don't hand-write it.** The 2D schema already
carries 164 `hint:` strings that are user-facing prose written for exactly this purpose
— that is a large fraction of the guide's body text, already in sync with the code. A
generator can emit basic rows into the guide flow and advanced rows into a linked annex,
which is precisely the structure asked for, and it cannot drift as settings change.

Hand-written guide text would be stale within a few builds at this pace.

Sequence that follows from this:

1. Decide the two open calls above (what "advanced" means; overhead tier).
2. Convert overhead settings to a schema (adds `advanced` + `hint` in one pass).
3. Write the generator: schema → guide page per chapter, basic inline, advanced annexed.
4. Emit a **screenshot slot list** from the same schema — one named slot per group
   (e.g. `2d/movement-moves.png`, `overhead/atmosphere-daynight.png`).
5. Hand the tester that list so their soak screenshots land in named slots instead of
   an unstructured folder.

Step 4 is the one that matters for timing: the tester is already taking screenshots, so
the slot list is worth producing **before** the soak, not after.
