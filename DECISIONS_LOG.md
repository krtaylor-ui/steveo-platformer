# Steveo Platformer — Phase 3 Overnight Run — Decisions Log

Started 2026-07-01. Records assumptions/decisions made during the Phase 3 master-brief run.
Q0 verified: Phase 3B (`players[]`, PvP hit detection, kill attribution, Friendly Fire, Deathmatch)
is committed (`91176fa`) and complete in code. CTF still `comingSoon`. Building on top of it.

## Up-front answers from user (2026-07-01)

### Q1 — Spawn Point System
- **Player Spawn Points are DISTINCT from Survival "Spawn Lines"** (which spawn mobs). New concept.
- All arena games require one player spawn point per supported player count.
- Spawn points are a **sandbox-placeable item** (movable + deletable), NOT hard-coded.
- Auto-migration: **pre-populate 2 spawn points** into each arena map. 3rd/4th are designer-added.
- On save, **warn how many players the map currently supports** (= number of placed spawn points, capped 4).
- Fallback: if making them auto-created-yet-still-deletable/movable proves risky, switch to **flag-only**
  (don't auto-create; just warn/block until a designer places them). Decision on which path taken is
  logged below once implemented.

### Q2 — CTF spawn points
- **4 total, 2 per team** (2v2 max), consistent with the engine's 4-player hard cap.

### Q4 — KOTH contested-zone scoring
- Default = user's **"sticky ownership"** rule: a player gains ownership only when they are the *sole*
  toucher; they keep it until a *different sole* toucher takes it; if 2+ players touch at once, ownership
  does NOT change (owner can hunt others without losing the hill).
- Add a **pre-launch KOTH scoring selector** with three options:
  1. Sticky ownership (DEFAULT — the rule above)
  2. Sole-occupant-only scoring (no one scores while contested)
  3. All-occupants score (everyone in the zone accrues)

### Q5 — Theme persistence
- **Client-side localStorage** per browser (no server schema this pass).

## Logged assumptions (not asked)

### Q3 — Slot assignment strategy
- Spawn points carry a designer-assigned number (1–4). At match start, players are assigned to
  spawn points in ascending number order; unnumbered/extra spawns fall back to join order.

## Implementation decisions

### Spawn Point System (Task 1) — DONE for arena
- Path chosen: **auto-create** (not flag-only). The seeded spawn points are ordinary placed
  objects in `sandbox.placedSpawnPoints`, fully movable + deletable via the same click/popup
  flow as Spawn Lines — so the movable/deletable requirement is satisfied; no fallback needed.
- New sandbox placeable `kind: 'spawnpoint'` (blue flag/banner marker with player #), distinct
  from the purple Survival "Spawn Line" swirl. Cap 4; each carries `slot` 1–4.
- Persisted under world-data key **`playerSpawns`** (distinct from mob `spawnPoints`).
- Arena consumption: `_setupArena` prefers built-in map `m.playerSpawns[i]`, then editor-placed
  spawn point with `slot===i+1` (else i-th by slot order), then legacy auto-spread fallback.
- Auto-migration: `_seedDefaultSpawnPoints()` seeds 2 (slots 1,2) near the level start whenever a
  loaded world has none. Old worlds keep working; designers add #3/#4 for 3–4P maps.
- Save-time warning: `_arenaSettingsWarnings` reports supported player count (0 → auto-start note;
  <4 → "supports up to N"; 4 → full).
- **Partial/deferred:** non-arena modes (Story/Sandbox/God/Speedrunner) still use the world's own
  `spawnX/spawnY` for the player start — spawn point #1 is placed/persisted but does not yet
  override those single-player start positions (low-risk deferral; arena is the primary need for
  KOTH/CTF). Editor shows/persists the points in all modes.

### KOTH 4-player PvP (Task 2) — DONE
- KOTH state generalized from `holdP1/holdP2` to a `hold{p1..p4}` map; ownership + accrual now
  work for 1–4 players. Verified with a 23-assertion headless test against the real arena-modes.js.
- Scoring rule selectable in pre-launch (`cfg.kothScoring`): STICKY (default) / SOLE / ALL — exactly
  as the user described. Single-player keeps the tuned "accrue only while standing" behaviour.
- Friendly Fire defaults ON (unlocked) for KOTH so it plays as a PvP contest; kills flow through the
  existing 3B attribution (counts toward stats). Uncheck FF for a no-combat race.
- HUD shows CONTESTED + per-player times; hill tint extended to P3 green / P4 yellow / contested white.
- Bugfix: `_ownerIds` now derives from `activePlayers()` instead of the legacy `player2?2:1`
  heuristic — corrects Deathmatch leader/HUD for 3–4 players too.

### Phase 3C — CTF + Teams (Task 3) — DONE (playable), one editor tool deferred
- New `js/ctf-system.js` (mirrors emerald/powerup system pattern): flag grab / carry / drop-on-death /
  teammate-return / auto-return (15s = 900 frames) / capture (50 pts). Verified with a 17-assertion
  headless test against the real code.
- Teams: 2 teams, players alternate by index → 2P = 1v1, 4P = P1&P3 (Red) vs P2&P4 (Blue). Team
  assignment + colours set in `CTF_SYSTEM.assignTeams`; `p.teamId`/`p.teamColor` (reserved in 3B) now used.
- **Team-aware friendly fire** added to the arrow PvP in mobs.js: teammates never damage each other
  (guarded by `teamId != null`, so it's a no-op for FFA Deathmatch/KotH). FF forced on for CTF.
- CTF win/score/HUD/winner wired in arena-modes.js; `CAPTURE_FLAG` un-greyed (no longer comingSoon).
- Pre-launch: "Captures to Win" slider (`cfg.captureTarget`, default 3); FF locked on with teammate note.
- Also fixed an adjacent 4-player bug: `_updateArenaCollectibles` now awards emerald pickups to ALL
  active players (P3/P4 were previously skipped).
- **Deferred (documented gap vs brief §4.3):** explicit *flag-placement design tool* in the editor.
  Instead, flag home bases **auto-anchor to each team's player spawn points** (falling back to map
  quarters). This makes CTF fully playable without a new editor placeable; an explicit flag tool can be
  added later using the same placeable pattern as Player Spawn Points if designers want custom bases.
  Per the brief's CTF spawn decision, teams use 2 spawn points per side (2v2 max).

### Theme / Reskin system (Task 4) — DONE
- CSS custom-property token layer at the top of style.css. `:root` = Modern (default: clean dark,
  indigo accent, system sans-serif, no title-shadow); `html[data-theme="retro"]` = the original
  8-bit neon-monospace look (Courier, cyan, dark, 3D title-shadow). Modern is the default per brief.
- Tokenized the dominant identity properties (font, accent colour, page bg, title text-shadow) rather
  than all 140 hardcoded colours — these carry the visual identity; semantic status colours (error red,
  success green) stay fixed across themes by design. The dashboard was already Arial/gradient so it
  changes least; the retro-styled surfaces (auth, in-game HUD DOM, modals, sandbox editor UI) reskin fully.
- `js/theme.js` (`THEME`): get/apply/set/cycle + localStorage `steveo_theme`; live-swaps by toggling the
  `data-theme` attribute (no reload). An inline `<head>` script applies the saved theme before first
  paint (no flash). Toggle button (🌙/👾) in the dashboard header. Preset list is data-driven — adding a
  third theme = one tokens block + one entry in `THEME.THEMES`.
- Persistence: client-side localStorage (per the up-front answer).

### Remaining features audit + completion (Task 5)
Audited current state first (server/*.js + js/*.js), then built the missing pieces. Requires the two
new SQL migrations to be run in Supabase (server/sql/community.sql, server/sql/stats.sql — documented in
MIGRATIONS.md). All backend follows the existing verifyToken + supabaseAdmin + setupXxxRoutes patterns.

- **Publishing:** creator/editor attribution already existed (creator_id/creator_name + editors array).
  Added `published_at` stamp + optional `genre`/`difficulty` on publish, and `original_author`
  preservation on download/fork. Publish now records the World-Builder achievement (fire-and-forget).
- **Community Browse (net-new, headline):** `server/community-routes.js` — browse/search published worlds
  by others (filters: genre/difficulty/mode + sort recent/rating/downloads/name), favorite/unfavorite +
  favorites list, rate (1–5, upsert + recomputed rollups), download (clone published world into own
  sandbox, bumps download_count, preserves attribution). Client: `js/community-ui.js` + `#community-screen`
  + dashboard "Community" button — Browse / Favorites / My Stats tabs with rating stars, favorite toggle,
  download button. Verified backend logic patterns; needs DB migration + browser test to confirm end-to-end.
- **Leaderboards:** extended arena routes with per-world (`world_id`) + recency window
  (`?since=day|week|month|all`) filtering; PvP modes (Deathmatch/CTF) now rankable. Personal-best endpoint
  (`GET /api/stats/personal-best/:mode`, optional worldId). Server-backed. (The speedrunner ghost
  leaderboard remains localStorage-only — server-backed speedrun times deferred; note below.)
- **Achievements + Analytics (conservative per brief):** `server/stats-routes.js` — `player_stats`
  (matches/wins/kills/deaths/captures/published/play-time) + `player_achievements`; 6 meaningful triggers
  (first match/win/capture/publish, sharpshooter, veteran) evaluated server-side. `POST /api/stats/match`
  hooked into arena end (`_recordMatchStats`), `POST /api/stats/publish` on publish; `GET /api/stats/me`
  powers the My Stats tab. Achievement threshold logic headless-verified.
- **Deferred (documented gaps):** genre/difficulty have no editor UI yet (publish route accepts them; browse
  filters work once set); server-backed per-level speedrun ghost leaderboard (still localStorage);
  browser + Supabase end-to-end verification of the new endpoints/UI (couldn't run DB/browser in this env).

---

# Phase 3 — v3 Master Brief Run (2026-07-01)

Builds on the v1/v2 work already committed. v3 added a bug-fix pass, KOTH scoring
rework, 4-player HUD, full theme switch, expanded CTF, and Defend the Tower.

## §2 Quick bug-fix pass
- **"Two mute buttons" + theme switch not showing (root cause, ties §5):** the
  theme toggle wore the `.btn-mute` class, so `MUSIC_CONTROL` (querySelectorAll
  '.btn-mute') attached a mute handler to it AND overwrote its 🌙 icon with the
  speaker glyph — clicking mute toggled both buttons' state (user-confirmed).
  Fix: removed `.btn-mute` from the theme toggle + gave it distinct styling. This
  is why the brief's "remove the left mute button" is interpreted as "de-duplicate
  the control that only looked like a mute button" — the theme switch is kept
  (it's needed for §5), just made visually distinct. Logged as an intentional
  reading of §2.1 vs. a literal delete.
- Online/Community buttons: equal `min-width` + 32px gap.
- **Arena cards as rows (root cause):** `.sandbox-container` lacked `width:100%`,
  so under `body{align-items:center}` it shrank to content width and the
  `auto-fill` grid collapsed to one column. Added `width:100%`+`box-sizing`.
- Pause freezes the arena timer (shift `gameStartTime` by paused duration).
- P2-P4 death sound (`_triggerSecondaryDeath` was silent).
- Deathmatch: mob kills excluded from score (player eliminations only).
- Disable Mobs pre-launch toggle for non-mob modes.
- Spawn-point icon now renders in the sandbox hotbar (missing `kind` branch).
- **§2.9 pickaxe hotbar removal — DEFERRED:** `weaponMode` is a getter hard-wired
  to `selectedSlot` (0=pickaxe) that also drives gamepad dpad bindings, number-key
  selection, arm rendering, and both hotbar renderers. Removing the slot means
  redesigning the universal mining/combat input path — high regression risk that
  cannot be validated without an interactive browser. Deferred to an interactive
  session per the brief's "log a blocker and move on" guidance.
- **§2.8 player-then-team scoring:** implemented in CTF (per-player `ctfCaptures`,
  team total = sum). Deathmatch/KOTH are FFA (no team rollup needed).

## §3 KOTH
- Removed the early hold-target win-check — KOTH now runs the FULL match timer;
  winner = top holder. Hill colour: dropped the white "contested" tint; Sticky
  keeps the owner's colour while contested (owner persists), Sole reverts to
  yellow. HUD shows CONTESTED only for non-Sticky modes.

## §4 4-player HUD
- P1 top-left, P2 top-right (unchanged rich HUD). P3 lower-left + P4 lower-right
  get a new compact health bar + hotbar (`_drawLowerPlayerHUD`), placed directly
  below the P1/P2 hotbars. `_drawCompactHotbar` gained an optional Y arg.

## §5 Theme = full game-wide switch
- Root cause the switch "did nothing": the inline `<head>` `<style>` hardcoded
  the retro identity always. Tokenized body bg/font + all headings (inline style,
  #start-screen splash) + dashboard font. style.css was otherwise already fully
  tokenized. Persistence stays client-side localStorage (per resolved decision).

## §6 CTF (expanded)
- Base zones (3×2, non-solid glow). Capture = carrier reaches own base zone, with
  NO "own flag home" requirement (fixes both-flags-out lockout). One flag at a
  time. Own dropped flag is carried home by a teammate to return it. Carrier
  defeat drops the flag (hooked into both death handlers) so a respawn never
  keeps it. Flag-return timer is pre-launch configurable (`flagReturnSeconds`).
  No combat (attack + shield) while carrying. Team shirt colours. Per-player →
  team scoring.
- **Bases auto-anchor to team spawns / map quarters.** The dedicated sandbox
  **Base placeable** is DEFERRED (consistent with the v1/v2 deferral of the flag
  editor tool): CTF is fully playable and designer-controllable via player-spawn
  placement; adding the placeable follows the spawn-point pattern and is best done
  interactively.

## §7 Defend the Tower (new mode)
- One Tower (4 tall) per player, auto-placed at each spawn. HP 3/6/9/12 (pre-launch);
  3 damage bands over thirds; heal-per-band math verified for all four settings +
  the brief's HP=9 example. Heal Tower pickups (respawn 20s). Damage from
  owner-tagged arrows + adjacent melee; all weapons equal; can't damage own tower;
  shield-crouch still blocks. Sole win = first Tower destroyed; destroyer wins.
- **Tower / Heal Tower editor placeables DEFERRED** (same rationale as the CTF Base
  placeable): towers auto-anchor to spawns and the mode is fully playable.

## Verification
- Headless logic tests: 52/52 (Tower banding/heal all HP settings + worked example,
  tower damage/win, CTF base-zone/one-at-a-time/both-flags-out/per-player→team/
  drop-on-defeat). All touched JS passes `node -c`.
- **Not browser-tested** (no browser in this env): 4-player HUD rendering, theme
  switch visuals, CTF/Tower in-match feel, Community/stats endpoints (need the two
  SQL migrations from MIGRATIONS.md run first).
- Cache-buster bumped `17k2-3b` → `17k3-v3` so the browser reloads changed assets.

---

# Arena Scoring Overhaul (2026-07-01)

Reworked scoring into a unified model. `arenaState.stats{p1..p4}` holds per-player
individual stats — `{ kills, mobKills, emeralds, flagCaptures, towerDamage }` —
always tracked regardless of mode. The per-mode SCORE is *derived* from these by
`ARENA_MODES.playerScore()` (no more direct `arenaState.scores` counter; that
field is removed). Kill/emerald/flag/tower-damage hooks now write stats.

Per-player score by mode:
- **Quick Battle** (the null-mode "vs bots" quick launch): kills + mobKills + emeralds
- **Mob Hunter**: mobKills · **Collect Emeralds**: emeralds
- **King of the Hill**: seconds held · **Deathmatch**: player kills (mob kills excluded)
- **Survival Waves**: waves fully defeated (shared; new `wavesCleared` counter)
- **Capture the Flag**: your team's total captures (shared)
- **Defend the Tower**: no points (health-based)

Team score (`ARENA_MODES.teamScore`): SUMMED for Quick Battle / Mob Hunter /
Emeralds / KOTH / Deathmatch; SHARED (the objective value, not summed) for
Survival Waves / CTF / Defend the Tower.

Defend the Tower winner: destroyer wins immediately; on timeout, the owner of the
tower with the most HP left wins (tie if equal).

End screen now shows a per-player individual-stats table (Score/Kills/Mobs/Gems,
plus Flags for CTF and TwrDmg for Defend the Tower). "Diamond" = the existing
emerald gem (no separate collectible added — confirmed with Kevin).

Headless: test-scoring.js 18/18 (per-mode score, summed-vs-shared team score,
CTF/Tower stat writes); test-v3.js 52/52; test-pause.js 7/7.

---

# Arena Rules Engine — Pass 1: schema + evaluator + parity (2026-07-01)

New `js/arena-rules.js` (standalone — the live match loop is NOT yet wired to it).
A mode is declarative data (a RULESET): `elements` (which world systems are on),
`scoring` (weights on tracked stats), `win` (flat ANY/ALL conditions), plus
`endStructural`, `winnerBy`, `deathEndsMatch`, and a reserved `stages` slot for
sequencing later.

Agreed model:
- **Track everything** scoreable as a per-player stat (`ARENA_STAT_KEYS`: kills,
  deaths, mobKills, emeralds, hillSeconds, hillStreak, flagCaptures, towerDamage,
  towersDestroyed) even when a mode doesn't score it.
- **Three discrete mob-spawn toggles** kept separate: `bots` (ambient; future AI
  players), `waveSpawns` (structural difficulty ramp), `spawnEggs` (designer-placed).
- **Teams stay a pre-launch setting** — the engine only aggregates.
- **Per-player stats SUM for a team; match-level counters (wavesDefeated) are
  SHARED (added once).** This one split covers every summed/shared case
  (individualScore + sharedScore).
- Win logic pass 1 = flat conditions combined ANY/ALL; `stages` reserved for
  sequencing (destroy tower → then capture flag → then hold hill) in a later pass.

The 7 current modes are encoded as `ARENA_RULES.PRESETS`. Parity test (test-rules.js,
run headless) — 32/32 assertions: each preset reproduces the hardcoded scoring,
team aggregation, and end/win conditions, cross-checked against ARENA_MODES.

Next steps (not done yet): (1) live-track the new stats (hillSeconds/hillStreak/
towersDestroyed) in game.js; (2) make Defend the Tower event-driven + multi-tower
(a destroyed tower ends the match only if a win condition references it);
(3) swap game types to run through the engine (delete the switch arms once parity
is green live); (4) the "Custom Rules" mode + authoring UI.

---

# Arena Rules Engine — Pass 2: live game runs through the engine (2026-07-01)

The game types now USE the rules engine (no longer parallel logic):
- `ARENA_MODES.playerScore` / `teamScore` delegate to `ARENA_RULES` via a cached
  `rulesetForMode(modeKey, cfg)` (pre-launch killTarget/captureTarget inject the
  win targets). `score` / `getHUDText` / `winnerText` / `_leader` build on those,
  so they became engine-backed automatically.
- Win-detection for Deathmatch / CTF / Defend the Tower delegates to
  `ARENA_RULES.isEnded` (behavior-preserving; verified by the parity suite).
  KOTH / Survival / Emeralds keep their update() bodies (they carry element
  side-effects — hill accrual, wave spawning — which stay put for now).
- New stats are live-tracked: `hillSeconds` + consecutive `hillStreak` (KOTH
  update), `towersDestroyed` (on a tower kill), `deaths` (both death handlers).
  `arenaState.stats` now seeds from `ARENA_RULES.blankStat()` (all 9 keys).
- End screen shows the enriched stats (adds Deaths always; HillS for KOTH).

BEHAVIOR CHANGE (intentional, per the rules-engine model): **CTF per-player
score is now each player's OWN captures**, and the TEAM score is the sum — where
before every teammate displayed the team total. The CTF HUD (Red X — Y Blue) and
winner still use team totals, so this only affects the per-player stat readout
(which is now more informative). Flag/Tower/KOTH element mechanics unchanged.

Still to do: (1) Defend the Tower multi-tower + placeables (destroying one ends
the match only if a win condition references it — the engine already models this,
tower-system still auto-places one per player); (2) generalize KOTH/Survival
side-effects into element systems so update() is fully engine-driven; (3) the
"Custom Rules" mode + authoring UI. Suite: `node test/run.js` → 109/109.

---

# Sandbox arena placeables + Tower heal config (2026-07-01, build 3)

- **One unified `arenaobj` sandbox placeable** (subtypes base / tower / heal) rather
  than three separate ones — palette + hotbar icon + world marker + click-to-place +
  popup (Base cycles team, Tower cycles owner P1-4, Heal remove-only) + persistence
  (`arenaObjects` world-data key) + load. Placed in the "Other" palette tab; shows in
  the sandbox hotbar when selected.
- **CTF Base** carries the flag inherently (flag spawns at the base centre); the 3×2
  zone is what CTF scoring uses. `_setupArena` derives `game._ctfBases` from placed
  bases; CTF falls back to team spawns / map quarters when none are placed.
- **Towers** are now designer-placeable and multiple are supported. `_setupArena`
  derives `game._arenaTowers`; TOWER_SYSTEM builds from them (owner from the marker
  slot), else auto-places one per player. Destroying one only ends the match if a win
  condition references towersDestroyed (rules engine) — so multi-tower is future-proof.
- **Heal Tower items**: placeable + a pre-launch mode — NONE / PLACED (designer-placed,
  reusable; good for redstone puzzles) / RANDOM (spawn every N min, disappear after a
  lifetime, or "never"). TOWER_SYSTEM honours all three (game._healItems for PLACED).
- **CTF respawn bug** (build 2): a respawning carrier no longer keeps/rescores the flag
  (CTF now treats respawn-timer-active players as downed).

Tests: node test/run.js → 120/120 (adds placed-towers + heal-mode coverage).

---

# Custom Rules mode + win-condition sequencing (2026-07-01, build 4)

The final rules-engine phase — modes are now fully data-driven and end users can
author their own.

- **Win-condition sequencing (stages):** ARENA_RULES.isEnded supports `rs.stages`
  (an ordered list of condition groups) in addition to flat `rs.win` (Any/All).
  Global, monotonic stage progression tracked on `game._stageIndex` (reset per
  match in initMode); stageInfo() drives a "Stage X/Y" HUD readout.
- **Element-driven activation (generalization):** initMode + _setupArena + update
  now gate systems/side-effects by the ruleset's ELEMENTS, not the mode key:
  CTF_SYSTEM/TOWER_SYSTEM init on elements.ctf/.towers; hill accrual + wave
  spawning run via _updateHill/_updateWaves whenever those elements are active;
  Custom mob spawning honours the three discrete sources (bots/spawnEggs/
  waveSpawns). The 7 presets are UNCHANGED (their elements match prior behaviour;
  preset enemy/PvP branches were left intact — only a CUSTOM branch was added).
- **Win-detection unified:** every mode's end now runs through ARENA_RULES.isEnded
  (KOTH has no win conditions → full timer; Survival/Emeralds/Quick end via
  structural conditions). Behaviour verified by the parity suite.
- **CUSTOM mode + authoring UI:** new `js/custom-rules-ui.js` + `#custom-rules-modal`.
  Elements checkboxes → scoring weights → win conditions (Any / All / Sequence).
  Picking "Custom Rules" in the arena Game Type selector opens the builder, which
  emits `arenaConfig.customRuleset`; rulesetForMode('CUSTOM', cfg) normalizes it.
  winnerBy defaults to topScore (destroyer/topTowerHp when towers-only).

Tests: node test/run.js → 128/128 (adds stages sequencing + CUSTOM ruleset).
Deferred still: §2.9 pickaxe hotbar; non-arena spawn override; server-backed
speedrun ghost board; genre/difficulty editor UI.

---

# Custom Rules v2: step builder, reactive scoring, lives, hill/10s (build 7)

- **Win builder redesigned as a step sequence.** Each step is built by adding
  conditions one at a time (logic AND/OR/NOT + condition + value + "Add"); each
  appears with a ✕ to remove. "Add another step" appends the next step. Guidance
  text explains it. Engine `_groupMet` now evaluates per-condition logic
  (and/or/not, left→right, first condition seeds; NOT negates) in addition to the
  presets' any/all combinator. Headless tests cover AND/OR/NOT + sequencing.
- **Scoring reactive + defaulted.** Each scoring row shows only when its element
  is enabled, pre-filled: Player kill 3, Mob kill 1, Emerald 1, 10s-on-hill 3,
  Flag 5, Tower 10, Wave 10.
- **Hill scoring is per 10 seconds** (was per second): individualScore uses
  floor(hillSeconds/10) × perHill10s. KOTH preset weight → perHill10s:1 (its
  headline score()/winner still use hold frames, so only the HUD top-line number
  shifts to 10s-blocks).
- **Player Lives** (Unlimited / 1 / 2 / 3) added to BOTH the standard pre-launch
  modal and the Custom builder. Limited lives decrement on death; a player out of
  lives is eliminated (secondary players are nulled — the existing safe co-op
  path; P1 out ends the match). Last-standing: when a 2+ player match drops to one
  remaining, it ends. Unlimited = current behaviour (default). NOTE: P1 "spectate
  while others continue" in MP is simplified to match-end for now.

Tests: node test/run.js → 135/135.

---

# Custom Rules polish + pause Objectives panel (build 8)

- **Fixed white-on-white buttons** in the builder: the shared .btn-small is white
  text on translucent white (built for the dark dashboard) → invisible on the
  white modal. Overrode #custom-rules-modal .btn-small (indigo; red for remove).
- **Condition options are element-valid:** each step's condition dropdown only
  offers conditions whose required element is enabled (playerKills→pvp,
  flagsCaptured→ctf, towersDestroyed→towers, hill*→hill, emeralds→emeralds;
  totalPoints always). Turning an element off prunes any now-invalid conditions.
- **Objectives status in the pause menu** (Kevin's suggestion — off the HUD): a
  left-side "🎯 Objectives" panel reads ARENA_RULES.objectiveStatus(rs, game) and
  shows either the timer note, the flat conditions (✓/○ with current/target), or
  the step sequence (✓ done / ▸ current / ○ pending, with the active step's
  conditions and their AND/OR/NOT). New engine helpers objectiveStatus() +
  conditionCurrent().

Tests: node test/run.js → 138/138.

---

# Per-player win conditions + progress (build 9)

Win conditions are now evaluated PER PLAYER (was global). Each condition is met
for a player when THEIR value reaches the target; each player has their own stage
pointer (game._stageProgress[id]); the match ends when the first player completes
their win (they win). Confirmed with Kevin:
- **Team-shared progress:** team objectives (flag captures) count the player's
  TEAM total, so teammates progress/complete together; individual stats
  (kills, hill time, emeralds, towers) are per-player.
- Engine: conditionMet/conditionCurrent/_groupMet/stageInfo/objectiveStatus all
  take an `id`; new playerStageIndex/playerWon/winProgress. winner() = whoever met
  their win (tiebreak score); on timeout, furthest by winProgress (which now
  includes FRACTIONAL progress toward unmet conditions, so 6/10 beats 2/10).
- Presets are unaffected (a global "first to N" == per-player "first player to N").
- Pause "Objectives" panel now shows EACH player's progress (headline per player;
  condition detail for 1-2 players); HUD top-line shows per-player [S x/n].

Still to do this batch: end-screen per-player standings + no-winner ranking;
impossible-condition warning (finite cumulative stats in step 2+); config
save/load/export/import (recent-3 local + Supabase named up to 10 + file).

Tests: node test/run.js → 144/144.

---

# Custom Rules save/load/export/import (build 11)

Configurations panel in the builder:
- **Recent (localStorage)** — the last 3 launched configs, reloadable as chips.
- **Saved to profile (Supabase)** — up to 10 named configs. New `custom_rules`
  table + `server/custom-rules-routes.js` (GET/POST/DELETE `/api/custom-rules`,
  cap enforced server-side) + `server/sql/custom_rules.sql` migration. Load/Save/
  Delete from a dropdown.
- **Export / Import** — download the current config as JSON, or import one from a
  file (validated → restored). Works without the DB (recent + file are local).
- `_snapshot()` / `_restore()` capture + reapply the full builder state
  (common settings, elements, scoring weights, steps).

Needs the `custom_rules.sql` migration run for profile save/load; recent + export/
import work immediately. Tests: node test/run.js → 144/144.

---

# Branch phase3-v3-look: clean consistency + retro pixel skin (build 13)

Stacked on phase3-v3-pickaxe (off worktree-phase-3b-pvp). Debug order: look →
pickaxe → base. `git checkout` between branches to fall back.

- **Arena selection = dashboard-style tiles.** arena-select.render now emits
  `.arena-tile` cards (icon + title + desc + Play) in the auto-fill `.world-list`
  grid, matching the dashboard game-mode cards ("more tiles" scales via auto-fill).
- **Retro theme = full pixel-art skin** (confirmed approach: CSS skin on the HTML
  screens, NOT a canvas rewrite). A big `html[data-theme="retro"]` block skins
  panels/cards (dark, 3px cyan borders, no radius, hard drop shadow), headings
  (uppercase neon + pixel shadow), buttons (blocky, monospace, invert on hover,
  press-offset), inputs/selects, tabs, and flips the Custom Rules white modal's
  dark text to light. Clean (Modern) theme is untouched.

All CSS/JS-only; the engine suite stays green (144). BOTH branches are
interactive/visual and UNTESTED in a browser — debug the look branch first.

---

# Leaderboards Redesign + PWA + Mobile + Pause/Controller Brief (2026-07-03)

Session scope (confirmed with Kevin up-front): **attempt all four sections**,
checkpoint each, flag partials. Storage for Speed Run = **hybrid** (local top-5
+ best-effort server sync). Arena Leader surfaces = **skip the load screen**
(arena has none) → end-screen + world-tile button + pause button only.

Audit answers (Q0/§5):
- **Ghost runner is FULLY FUNCTIONAL** (SpeedRunnerGhost in speedrunner-mode.js:
  record/playback/toggle[K]/persist `sr_ghost_${levelId}`). Preserve, don't rebuild.
- Speed Run leaderboard = localStorage-only (`sr_lb_${levelId}`), top-5, anonymous,
  canvas-drawn, NOT themed. Ghost + LB shown on the menu select card + end HUD.
- Arena: `arena_results` already has `world_id` + recency API; APPENDS all rows
  (full history retained) → the "retain >#1" recommendation is already satisfied;
  a Leader is a `limit=1` query. Client just never sent `worldId`.

## §1 Arena per-world Leader (build 24)
- Threaded `worldId` (+ `worldName`) through arena launch → Game options →
  `_submitArenaResultOnce` → `LEADERBOARD_SYSTEM.submit(mode, score, dur, worldId)`.
- New batch endpoint `GET /api/arena/world-leaders?worldIds=` returns the reigning
  leader per (world, mode) in one request (powers the tiles without N×M fetches).
- Surfaces: match-end 👑 LEADER line (async-fetched + cached), world-tile
  "View Leaderboard" button injected ONLY on worlds with a recorded Leader,
  per-world modal (reuses #arena-leaderboard-modal; tabs limited to modes with
  records). Quick Battle (null worldId) still uses the global per-mode board.
- No new migration (world_id column already present/applied).

## §4 HTML pause menu + gamepad nav (build 25)
- Replaced canvas pause with `js/pause-menu.js` + `#pause-overlay`, reconciled
  each frame by `PAUSE_MENU.sync(game, wantOpen)` in Game.update() (covers ESC +
  every button path). Deleted _pauseLayout/_updatePause/_drawPauseOverlay/
  _drawCtrlAssignRows/_drawPauseVolSliders/_confirmLayout; kept
  _drawArenaObjectivesPanel (still drawn on canvas beside the overlay).
- ASSUMPTION: controller-assignment rows show per mode — Arena = activePlayers()
  (1–4), Normal/Platformer = 1 or 2 (twoPlayerMode), Sandbox/online = 0 (World
  Settings shortcut instead). Ported to HTML <select>s (dropped the canvas
  version's KB2-only-if-other-has-KB1 constraint — simplification; browser-untested).
- DECISION (resolves §4a/§4b tension): gamepad-nav.js is active in menus AND while
  the pause overlay is open (which is in-game). Gate = `body:not(.in-game) OR
  PAUSE_MENU.isOpen()`. Since Game.update() early-returns while paused, game.js
  consumes no pad input then, so there's no conflict.
- Pause overlay z-index 1900 < shared modals (2000) so the arena leaderboard modal
  opened from the pause "View Leaderboard" button renders on top of it.
- Retro look: overlay uses `.modal-content` so the build-13 retro SKIN applies in
  both themes. The build-20 customizable FX (scanlines/posterize/pixel-frame) stay
  menu-only (gated `:not(.in-game)`), so they don't apply over live gameplay while
  paused — acceptable; a follow-up could exempt the panel if desired.
- Headless test/test-gamepad-nav.js (22) covers the pure geometry pick; the rest
  is browser+gamepad only. Suite: 182/182.

## §2 Speed Run leaderboard (build 26)
- Ghost runner AUDITED FULLY FUNCTIONAL — preserved as-is (no rebuild needed).
- Hybrid storage: local top-5 stays authoritative + offline; when logged in, runs
  best-effort mirror to new `speedrun_results` (server/speedrun-routes.js +
  server/sql/speedrun.sql, mounted in server.js) and server rows merge into local
  on level load (SPEEDRUN_SYNC.merge, dedup by name+ms). Keyed by the same
  `playerName:worldName` levelId the local board uses (no worldId plumbing needed).
- Account initials: srSaveInitials (keyed to account) remembers the chosen
  initials → PRE-FILLS the arcade name-entry; entries also record the username.
- Theme-aware victory overlay: headings + active slot use the live --accent token;
  leaderboard shows username beside initials.
- DEFERRED (browser-only / ambiguous UI): the world-tile "View Leaderboard" button.
  Speed Run's world select is the canvas legacy menu.js (+ an HTML dashboard entry
  not traced) — an HTML tile button needs an interactive pass. Board still shows
  at end-of-run + on the menu select card. Needs speedrun.sql run in Supabase.

## §3 PWA (build 27)
- manifest.json (standalone, theme/bg colors, SVG icon any+maskable) + icon.svg +
  <head> links/metas + sw.js. SW caches the app shell on-demand ("cache what you
  fetch" → the ?v=bN URLs are what get cached; no file enumeration). Navigations
  network-first→cache; other assets stale-while-revalidate; /api/*, /socket.io/*
  and cross-origin always network → online MP unchanged, offline solo works.
  CACHE_VERSION bumps per build. Follow-up: raster PNG icons (192/512).

## §3 Mobile touch (build 28)
- js/touch-controls.js feeds window.game.input directly (keys + mouse) — no
  input.js changes. Mode layouts: Speed Run auto-run + JUMP; Platformer
  LEFT/RIGHT/JUMP/ACTION; Arena LEFT/RIGHT/JUMP + right-half AIM/FIRE pad
  (twin-stick). Auto-detect touch + manual override (localStorage/URL); optional
  haptics; safe-area + viewport-fit=cover. Clusters z-index above the aim pad.
- v1 SIMPLIFICATIONS (browser-untested here): digital LEFT/RIGHT (not an analog
  stick — KB1 movement is digital); auto-run assumes rightward Speed Run levels;
  no orientation lock (nice-to-have). Normal & Sandbox intentionally excluded.

## Verification / status
- `node test/run.js` → 182/182 (adds test-gamepad-nav.js's 22 geometry assertions
  to the prior 160). All new/changed JS + server files pass `node -c`.
- **Browser-untested** (no browser/device/DB here): the HTML pause overlay + retro
  look, gamepad navigation feel, per-world Leader end-to-end, Speed Run server
  sync, PWA install/offline, and ALL touch controls. Two SQL migrations pending in
  Supabase: server/sql/speedrun.sql (Speed Run times). arena world-leaders needs
  no new migration (world_id already applied).

## §6 Local-first / offline worlds (builds 44–50)

> Gap: builds 29–43 are not individually logged here (assorted fixes + the Speed
> Run race-car model; see git log and FUTURE_ROADMAP "Shipped" list). This section
> resumes the log at the local-first initiative.

### Provenance metadata (build 44)
- DECISION: every world carries `world_data.provenance = { uid, createdAt, updatedAt,
  creator, origin('cloud'|'local'), copiedFrom, copiedAt }`, stamped in
  `GAME_STATE._provenance()` and captured on load (`game._loadedProvenance`). It
  lives INSIDE world_data so it travels for free across export/import/copy and
  local↔cloud. Additive; `copiedFrom/At` populate once the copy flow exists (built 48–50).
- Rationale: foundation for the "copy to online/offline" model (no two-way sync) and
  the future world-cleanup widget (§7), which needs lineage to group copies.

### Play Online/Offline entry + session mode (build 45)
- DECISION (the model — no two-way sync): it's **2 locations + 1 flag**, not 3 states.
  Cloud (Supabase) worlds with a "Published" filter/badge; Local (localStorage) worlds;
  move between them only via explicit Copy. Logging in ADDS cloud access; it never
  reconciles local worlds (that's where sync bugs live).
- New `js/app-mode.js` (`APP_MODE`): 'online' vs 'local', persisted; `body.offline-mode`.
  Start screen offers Play Online / Play Offline; login is triggered only by Play Online
  when there's no valid session (offline needs none). Audio-unlock refactored to a shared
  `window._unlockIntroAudio()` used by both buttons + login success.
- Dashboard adapts to mode: online-only buttons (Online Play, Community) hidden offline;
  a ☁ Go Online button; Guest(offline)/`<user> (offline)` identity; logout hidden for
  guests. The ONLINE path is byte-for-byte unchanged.

### Offline Sandbox via local provider (build 46)
- New `js/local-worlds.js` (`LOCAL_WORLDS`): localStorage store mirroring the server
  world shape ({id, world_name, description, is_published, created_at, world_data}), so
  the Sandbox UI works offline with ONE branch per data call — the online path is
  byte-for-byte unchanged. world_data (incl. provenance) is exactly what
  `GAME_STATE.serialize` emits, so build/save/reopen round-trips.
- `sandbox-ui.js` branches on `APP_MODE.isLocal()` for load/create/edit/save/copy/delete/
  changeMode. Publish greyed offline (community = online); cloud-game/file import hidden
  in the offline browser. Dashboard lets Sandbox through the offline guard; other modes
  stay guarded pending their own providers.
- KNOWN ROUGH EDGE (to reconcile): the editor F-key quick-save still uses the legacy
  `SandboxSaves` store; the Save button is the local-worlds path.

### Offline file import/export + bundled starters (build 47)
- Local IMPORT parses the .json in-browser → `LOCAL_WORLDS.importWorld` (handles both
  server-export wrappers and raw payloads; stamps provenance + copiedFrom lineage).
  Local EXPORT serializes to a downloadable .json in the SAME shape as the server export,
  so it re-imports locally OR online. Both pure client-side; online paths unchanged.
- `LOCAL_WORLDS.seedDefaults()` imports `default-worlds/*` (Normal/Platformer/Speed Run)
  into local storage once on first offline Sandbox open. Those JSONs added to the SW
  precache so seeding works offline.

### Copy-to-Online/Offline bridge (builds 48–50)
- DECISION (build 49): the copy bridge is ONLINE-ONLY. Offline mode shows just your local
  worlds (surfacing cloud worlds while "offline" was confusing). Online shows cloud worlds
  (primary) + a "💾 Your Offline Worlds" section, with Copy buttons both directions.
- `_copyToOnline`: create cloud world + PUT world_data (provenance re-stamped origin:'cloud',
  copiedFrom the local uid). `_copyToOffline`: `LOCAL_WORLDS.importWorld` from the cloud
  world_data (lineage preserved). Single click = a NEW copy (per the copy paradigm).
- Duplicate guard: if a target world shares lineage (`copiedFrom`) or matches name +
  creation time + creator, warn with copy-anyway / rename / cancel. Dropped the
  "(from Offline/Online)" name suffixes so names stay consistent (and the dup check works).
- FINAL SHAPE (build 50): consolidated to ONE "Copy" button per card → a modal (name field
  + destination 💾 Offline / ☁ Online, Online disabled when logged out, defaulting to the
  world's space). Per-world actions (edit/save/delete/mode/publish/export) now branch on the
  WORLD's origin (`_isLocalWorld`) instead of the session mode — so you can edit a local
  world while online and vice-versa. Cross-space cards render via a shared `_worldCard` so
  they match the primary tiles. "Published" label → a green circular ★ badge.

### Verification / status (build 50)
- `node test/run.js` → **182/182**. GAME_VERSION `v3 · build 50`; cache-buster `?v=b50`;
  SW `CACHE_VERSION = steveo-shell-v50`.
- Merged to `main`; **NOT yet pushed to origin/Railway** (origin at build 43).
- Browser-UNTESTED: the entire offline flow (entry, local Sandbox CRUD, import/export,
  seeded starters, the copy modal + duplicate guard). Migration still pending:
  `server/sql/speedrun.sql`.
