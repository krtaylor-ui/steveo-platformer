# Steveo Platformer — Phase 3 Overnight Run — Decisions Log

## Bow-fire "won't fire on the right side" — root cause + fix (2026-07-19, builds 160–165)
- **Symptom:** in zoomed-out / single-screen play, the bow fired when aiming/right-clicking on the
  LEFT half of the screen but NOT the right; a melee happened instead.
- **Diagnosis (raw-button Debug HUD, build 164):** the SAME physical right-click reports
  `e.button===2` (right) on the left half but `e.button===0` (LEFT) on the right half. So on the
  right it registers as a left-click → melee, and `mouse.rightDown` never goes true → bow never
  charges. Game code reads `e.button` directly with zero position logic (`input.js:246-251`), so this
  is an **external gaming-mouse driver / browser gesture zone-remap** — not fixable from JS.
- **Fix (build 165):** when the BOW is the selected weapon (`weaponMode==='bow'` + a bow owned), the
  **attack button (Space / gamepad X / Insert) now draws + fires the bow** (hold→charge, release→loose);
  its melee is suppressed that frame. Aim still follows the mouse cursor (coords update everywhere), so
  you aim with the mouse and loose with Space — **no right mouse button needed.** Matches the existing
  on-screen "Attack/Bow" hint. Left-click melee and right-click ranged unchanged for normal mice.
- Prior attempts that did NOT fix it (kept as belt-and-suspenders, not harmful): canvas ResizeObserver +
  coord clamp (162), window mouseup / mouseleave / blur button reset (158/160), `e.buttons` bitmask sync
  on mousemove (163). Raw-button Debug HUD line retained (164).

## Aim freeze on the right half — mousemove on window (2026-07-19, build 166)
- **Symptom (after 165 let Space fire the bow):** the bow fired, but the aim LOCKED to wherever the
  cursor crossed left→right — `mouse.x` froze at the visual center in zoomed-out / single-screen play.
- **Root cause:** the `mousemove` listener was on the **canvas element**. The zoom-to-fit view puts
  letterbox bars / an overflow-clipped canvas edge / HUD overlays under the cursor on the right side;
  a canvas-only listener gets no `mousemove` there, so the last coordinate stuck. (Backing is a fixed
  800×500; `world≈800` at `mouse.x≈400` is just the `_srZoom` divide, not part of the bug.)
- **Fix:** attach `mousemove` to the **window** and map through `canvas.getBoundingClientRect()`, clamped
  to the 800×500 backing. Cursor is tracked everywhere on screen; aiming past the visible edge pins to the
  edge instead of freezing. Removed the now-obsolete canvas `mouseleave` reset (window mousemove re-syncs
  button state from `e.buttons` everywhere; window mouseup/blur catch releases).
- **Net player-facing result:** aim with the mouse anywhere on screen; fire the bow with **Space** when the
  bow is selected (mouse-free, immune to the driver's right-click zone-remap) OR right-click where the mouse
  behaves. Both share the same cursor aim, which now tracks the full screen.

## Right-click → left-click on the right screen half: CONCLUSIVE + final fix (2026-07-19, builds 167–168)
- **Definitive diagnostic (build 167 `lastDown` HUD line):** LEFT part of screen — right-click → `btn:2
  buttons:2`, left-click → `btn:0 buttons:1` (both correct). RIGHT part of screen — EVERY press, including a
  physical right-click, arrives as `btn:0 buttons:1` (LEFT).
- **Conclusion:** `e.button`/`e.buttons` are set by the browser before any game code runs; the game reads them
  directly and has NO position-based button logic, NO synthetic mouse events, and (verified) NO
  pointer-capture / pointer-lock / CSS `zoom`/`transform` that could alter pointer delivery. So the remap is
  **upstream of the page** — a gaming-mouse driver (G HUB / Synapse / iCUE) or a mouse-gesture extension with
  a screen-zone mapping. "Only in zoom mode" = only when the fixed wide view lets the cursor reach the right
  screen zone (follow-cam keeps the action centered, off the remap zone). Not fixable by reading the button.
- **Final fix (build 168):** the LEFT button is delivered correctly everywhere, so when the BOW is the
  SELECTED weapon, a held LEFT mouse button now draws + fires it (hold→charge, release→loose) and no longer
  melees/mines; aim follows the cursor. Select the bow, left-click anywhere (incl. the right side) to shoot.
  Space/gamepad (165) and right-click (where it works) still fire too. Sword slot keeps left-click melee.
- **User-side note:** the right-click remap can likely be removed by disabling per-zone/gesture button
  mapping in the mouse software or the offending browser extension — not required now that left-click + Space
  both fire the bow.

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

---

## Sample Worlds content pass (2026-07-04) — [Sample] test batch

**What:** a content-generation session (not a code feature). Produced a batch of playable
**test** worlds for Kevin to try before an official release. Deliverables:
`SAMPLE_WORLDS_CONCEPTS.md` (Phase A concepts), `SAMPLE_WORLDS_README.md` (import steps +
physics writeup + redstone assessment + what-to-try-first), `tools/gen-sample-worlds.js`
(generator + structural validator), and 9 world files in `sample-worlds/`.

### Up-front decisions (Kevin, in-session)
- **Scope:** *Focused (~9)* — 3 Speed Run + 1 flagship per Arena category (6). (Options offered:
  lean ~15 / full ~24 / focused ~9.)
- **Delivery:** JSON import, accepted **with the caveat** that offline file-import hardcodes
  `requestedMode='NRM'` (`js/sandbox-ui.js` handleFileSelect/importFile) — every imported world
  lands as **Normal**, so Kevin sets the real mode via the per-card **Mode dropdown** (all 4 modes,
  `_worldCard`). No code changes; documented in the README. (No `seedDefaults` patch.)
- **Redstone reference:** Kevin copied `Platformer_-_V2_PLT_2026-07-04.json` into `saves/`
  (the published V2 is unreachable here — cloud, other account, no browser/Supabase). Studied it
  directly instead of first-principles.

### Data model confirmed (by reading the code, for the generator)
- Worlds authored in the **raw `GAME_STATE.serialize()` shape** (top-level `grid`, `worldName`,
  `gameModeDefault`, placeables, `worldAdvSettings`, `provenance`). `importFile` reads
  `parsed.world_data || parsed` and `world_name || worldName` — raw shape imports cleanly.
- **Grid = `grid[row][col]`**, H rows × W cols, row 0 top. Block ids per `BLOCK` enum; solidity per
  `BLOCK_DATA.solid` (leaves/lava/goal/lever/booster/speed-item non-solid; trapdoor solid-when-closed
  via `redstone.isTrapdoorOpen`).
- **Speed Run:** `GOAL` (id 10) = finish; `playerPx/playerPy` = start; `levelId = playerName:worldName`
  (must be unique → all use playerName `Sample` + distinct worldName); `SPEED_ITEM`/`SPEED_BOOSTER`/`JUMP_PAD`
  supported. sr* tuning keys default in engine (game.js 94–104); stated explicitly anyway.
- **Arena:** placeable shapes — spawnpoint `{col,row,wx,wy,slot}`, arenaobj `{type:'base'|'tower'|'heal',…,team|slot}`,
  hill `{col,row,w,h}`, emerald/powerup/spawnline/egg. `arenaViewType:'single'` + `arenaZoomMode:'NONE'`
  → engine auto-fits whole map on a fixed screen (`_arenaActiveZoom`→`_fitZoom`). `backgroundTheme`
  (`sky|cave|nether|end`) themes the biome (build 51 feature).
- **Redstone:** lever(27)/trapdoor(23)/piston(24)/tx(34)/rx(35) live in the grid AND their arrays; dust
  is overlay-only (`dustBlocks`). Propagation = lever→orthogonally-adjacent dust chain→adjacent device
  (OR-logic), per `js/redstone.js` + `game.js` `_rsStartFromSource`/`_rsProcessQueue`.

### Physics basis (Section 2A)
GRAVITY 0.66, JUMP_VELOCITY −12.0, MOVE_SPEED 6.0 → **apex ≈ 3.4 blocks**, **airtime 36.4 f**,
**max same-level gap ≈ 6.8 blocks**. Design rule: jumps lip-to-lip ≤ 4, rise ≤ 2, raised arena
platforms ≤ 3 up → reachable by construction. Feel note logged: jump is floaty/forgiving; a
tighter feel would want ~−11 / ~0.72 (not changed this pass).

### Structural check (Section 2) — best-effort, catches broken not bad
`tools/gen-sample-worlds.js` validates each world: (a) spawns/hill/bases/towers/heal on solid
ground with 2-block headroom; (b) physics-honest BFS reachability (≤3 up, ≤6 across shrinking with
rise, drop-offs, lava/void non-standable) from start to every objective; (c) arena spawn counts.
**Bugs the check caught during authoring:** `B.OAK_PLANKS` typo (undefined → `null` cells → non-solid
platform in Keep Siege), and several jumps exceeding the 3-up / lip-to-lip budget (SR gaps, FFA mesas
at 5-up, KOTH ledges at 6-up). All fixed; final run = **9/9 pass**, plus a cross-file integrity pass
(dims, no null cells, unique SR levelIds, GOAL present, arena ≥2 spawns).

### Built (9/9) — all pass structural check
| World | Mode | Biome | Category |
|---|---|---|---|
| `[Sample] SR · First Steps` | RUN | Overworld | Speed Run (easy) |
| `[Sample] SR · Cavern Dash` | RUN | Cave | Speed Run (medium) |
| `[Sample] SR · Nether Gauntlet` | RUN | Nether | Speed Run (hard, lava) |
| `[Sample] Arena · Grassland Melee` | ARN | Overworld | 4-Player FFA |
| `[Sample] Arena · Void Twins` | ARN | End | 2v2 / Team |
| `[Sample] Arena · Fortress Rush` | ARN | Nether | Capture the Flag |
| `[Sample] Arena · Crater Crown` | ARN | Cave | King of the Hill |
| `[Sample] Arena · Keep Siege` | ARN | Overworld | Defend the Tower |
| `[Sample] Arena · Switch & Sever` | ARN | Cave | Creative + redstone |

Biome coverage requirement met: Overworld ✓ Cave ✓ Nether ✓ End ✓. Deferred: nothing (full focused
scope built).

### Redstone assessment (gates the follow-up) — SOLID, greenlight with a note
lever→dust→trapdoor-door primitive verified wired + walled in `Switch & Sever` (2 circuits), modeled on
V2's proven construction. Used trapdoor doors (reliable) over pistons (block-push semantics riskier blind).
Follow-up (full platformer puzzle levels) is greenlit; **first browser-validate a piston gate + AND/NOT
gate logic** — the two primitives not shipped here. Fun-in-arena unproven; natural pairing = a Custom
Rules "reach the vault" objective (not built, flagged).

### Not done / notes
- No Supabase/migration/code changes (content-only pass, as scoped). No browser test possible in this env —
  the structural check is the substitute; combat balance/pacing/fun are Kevin's playtest call.
- Proposed (not built): palette-only **End Stone** block for cleaner End reads.

---

## Build 53 (2026-07-04) — world-creation workflow fixes (Kevin feedback)

Four UX fixes from Kevin's first playtest of the sample-worlds batch. Also added
`world_creation.md` as the ongoing feedback-loop doc (read it first each content pass).

- **Rename worlds from the Sandbox world-select screen.** New **Rename** button on every
  world card (`_worldCard`/`_wireCards`) → `SANDBOX_UI.renameWorld` (window.prompt). Branches on
  origin: local → new `LOCAL_WORLDS.rename(id,name)`; cloud → new server route
  `POST /api/worlds/sandbox/:id/name` (updates `world_name` only — deliberately does NOT touch
  `world_data`, unlike the save PUT which merges/overwrites it). Cache kept in sync + `loadWorlds()`.
- **Exit affordance when testing a level.** `SANDBOX_UI.launchArenaTest` now passes
  `testMode:true`, so the "Test in Arena" path gets the existing `✕ EXIT TEST` button (drawn in
  `_drawHUD`, which runs for all modes incl. arena) + Esc-to-editor. (Universal Test World already
  had it; arena-test was the gap — it launched a full persistent match with no visible exit.)
- **Speed Runner on-screen Restart button.** New `#play-hud-restart` in the play HUD, shown only
  when `GAME_PLAY.gameMode==='speedrunner'`, next to Pause/Exit. → `GAME_PLAY._restartSpeedRun`
  (unpauses if paused) → `Game._srRestartRun()` (clears won/dead/nameEntry/showLeaderboard, then
  `_srRespawn()` resets position/boosts/items/mobs/redstone + re-runs the countdown). Hidden again on
  return to selection.
- **Pausing Speed Runner pauses the timer.** The race clock is wall-clock (`Date.now()−startMs`), so
  it used to keep counting while paused. New pause hook in `_update` records `_srPausedAt` on
  pause-enter and, on resume, shifts all SR time-anchors forward by the paused duration via
  `Game._srShiftClocks` (startMs, countdownStart, goMs, deathMs, boost itemExpiresMs) — elapsed now
  excludes paused time. Works for both the HUD Pause button and Esc pause.

Files: index.html (restart btn + `?v=b53`), sw.js (`steveo-shell-v53`), js/constants.js (GAME_VERSION
build 53), js/game-play.js, js/game.js, js/sandbox-ui.js, js/local-worlds.js, server/worlds-routes.js.
Tests: `node test/run.js` → **182/182**. All modified files pass `node -c`. Browser-UNTESTED (no browser
here) — logic-verified; the SR-restart/pause-timer and rename flows warrant a quick click-through.
Not committed/pushed (left for Kevin). Server `/name` route needs a deploy to work for cloud worlds;
local rename works offline immediately.

### Build 53 addendum — import naming
- **Imports no longer default to "Imported World" when a name is available.** Root cause: the offline
  path checked `world_name || worldName` but the **server** `/import-file` path only checked
  `parsed.world_name` — so a raw-serialize file using `worldName` (like the `[Sample]` batch) imported
  online got the generic name. Also neither path checked a name nested inside `world_data`, nor fell
  back to the filename.
- Fix: new `SANDBOX_UI._worldNameFromImport(parsed, wd, fileName)` → embedded name (top-level OR nested
  in `world_data`, either casing) → **file basename** (`SR_First_Steps.json` → "SR First Steps") →
  "Imported World". The uploaded `fileName` is now threaded through `handleFileSelect` →
  `pendingFileImport` → `confirmImport` → `importFile`, and sent to the server, which applies the same
  fallback chain. Files: js/sandbox-ui.js, server/worlds-routes.js.

---

## Build 54 (2026-07-04) — Auto-Climb (walk up 1-block ledges)

Requested for Speed Runner; implemented universally + configurable per world.

- **Engine (js/player.js):** new `Player._tryAutoStep(level, c, bRowT, bRowB)` called from the horizontal
  collision sweep in `_applyPhysics`. When movement is blocked by an obstacle that is exactly **one
  block high with clear headroom** (feet-row solid, head-row + the row above the step clear at the
  obstacle column, and no low ceiling over the player's current span) AND the player is on the ground,
  it lifts the player onto the step (`y = bRowB*BLOCK_SIZE - height`) and lets the horizontal move
  complete instead of stopping. 2-block+ walls still block (→ jump). Gated by `player._autoStepUp`.
- **Config (universal, per world):** new `worldAdvSettings.autoStepUp` (default **false**). Applied to
  every player each frame via `_applyMovementConfig` (`p._autoStepUp = !!aws.autoStepUp`), so it works
  in all modes and toggles live. Free-rides the existing serialize/Object.assign path.
- **UI:** new **Auto-Climb** row in the canvas World Settings → Physics tab (row 6, after Sprint). To
  fit a 9th row, physics-tab row spacing tightened 48→42px in both the draw and click handlers (last
  row lands where it did before; `RY(k)=FIRST_ROW+k*42` helper). Also added an Auto-Climb toggle to the
  HTML pause menu Physics section (normal/platformer/sandbox).
- **Sample worlds:** the 3 Speed Run worlds now ship with `autoStepUp:true` (regenerated); arenas
  unchanged. Existing imports can enable it via World Settings → Physics.

Files: js/player.js, js/game.js, js/pause-menu.js, tools/gen-sample-worlds.js, sample-worlds/SR_*.json,
index.html (`?v=b54`), sw.js (`steveo-shell-v54`), js/constants.js (build 54), world_creation.md.
Tests: `node test/run.js` → **182/182**; all modified files pass `node -c`. Browser-UNTESTED — the
step-up feel + the tightened physics-panel layout warrant a quick look.

---

## Speed Run content pass v2 (2026-07-04) — Batch-1 feedback (content-only, no app-code change)

Kevin's first playtest of the sample Speed Run worlds → rebuilt all 3 via `tools/gen-sample-worlds.js`.
Codified 6 design rules (see `world_creation.md` "Speed Run design rules v2"):

1. **No stranding floor.** SR void-death only fires when `player.y+height > level.pixelHeight`. The old
   SR1/SR2 had a full-width **bedrock bottom row** that caught fallers and stranded them — removed, so
   gaps are now **bottomless** (fatal fall → respawn). SR3 keeps **lava-channel gaps** (already worked).
2. **Long runs, few gaps.** Rebuilt from a left→right **segment script** (run/ramp/gap/pad/boost) with
   long runs (90–130 blocks) between a small number of gaps. Levels lengthened: **1118 / 1318 / 1304**.
3. **Telegraphed gaps.** Gold-ore **ground warning strip** on each takeoff + a **sky marker** (bar,
   thickness varies per gap); jump-pads use the green pad + a **glowstone sky gateway**. **Zone bands**
   vary the sub-surface body block by region (dirt→stone→gravel etc.) for visual identity.
4. **Auto-climb ramps.** 1-block staircases (build 54 auto-step) for elevation; jumps reserved for gaps.
5. **Ground jump-pads.** 4-wide `JUMP_PAD` laid ON the running surface (SR checks the block under the
   feet) so the player runs over and launches across wider gaps.
6. **Tactical boosters.** `SPEED_BOOSTER` strips placed to help time a jump or as a **trap** before a gap.

Generator: `buildSpeedRun` rewritten to a script builder; **reachability validator made pad-aware**
(PAD_JUMP_UP/DX envelope) so wide pad-jumps validate. Added ore/glowstone block ids + solidity.
All 9 worlds still pass the structural check. Files: tools/gen-sample-worlds.js, sample-worlds/SR_*.json,
world_creation.md. No js/ or GAME_VERSION change (content-only).

---

## Build 55 (2026-07-04) — fix: white-on-white text in file-import & Modern modals

The Modern `.modal-content` is `background:white` but set no default text color, so bare descendants
(the file-input's filename/"No file chosen" text, the mode-override `<span>`, stray `<p>`s) inherited the
body's **white** → invisible on white. Prior fixes patched specific elements (leaderboard, pause, success
message) but not the import modal's generic text. Fix: one default `color:#2a2a3a` on `.modal-content`
(Modern); Retro already overrides bg+color to dark/light. Elements with their own color keep it via
specificity/source-order. Files: style.css (+ `?v=b55`, SW `steveo-shell-v55`, GAME_VERSION build 55).

---

## Build 56 (2026-07-04) — Sandbox playtest: easy exit via pause menu + no scoring

Feedback: no easy exit from a test world in Sandbox; want the normal pause options but exiting to
Sandbox, and no high-score recording in test mode.

- **Esc now opens the pause menu in test mode** (was: hard-exit on the first Esc, so the pause options
  never appeared). The pause overlay's exit already routes through `_onReturnToMenu`, which for a
  Sandbox-launched test IS the editor-reopen callback (`TEST_WORLD._launch` / `launchArenaTest`) — so
  **Exit returns to the Sandbox editor, not the main menu**. The ✕ EXIT TEST button stays for one-click exit.
- **Pause menu relabeled in test mode:** the danger button reads **"Exit to Sandbox"** (not "Main Menu");
  the confirm dialog reads "Exit test — back to Sandbox? / This was a playtest — nothing is saved or
  scored." Arena "View Leaderboard" is hidden in test mode. `_confirmExit` skips `_saveNormalProgress`
  when `_testMode` (playtests never persist).
- **No high scores in test mode:** `_srTriggerWin` now early-returns in `_testMode` — no ghost save
  (`SpeedRunnerGhost.saveIfBest`) and no leaderboard entry/name-prompt; it shows the read-only board and
  Space returns to the editor. (Arena results were already gated in `_submitArenaResultOnce`.)

Files: js/game.js (Esc handler + `_srTriggerWin`), js/pause-menu.js (labels, confirm text, skip save),
js/constants.js (build 56), index.html (`?v=b56`), sw.js (`steveo-shell-v56`). Tests 182/182; `node -c` clean.

---

## Build 57 (2026-07-04) — test-world HUD (Restart + Return to Sandbox) + full-column finish

Feedback: still no visible exit in a Sandbox test (the canvas ✕ button was skipped by the Speed-Runner
HUD's early return in `_drawHUD`), Esc "froze" the game (opened a pause overlay that wasn't a usable exit
in the test context), and the finish line (a discrete block) missed jumpers.

- **New `#test-hud`** — an always-on-top HTML bar (fixed top-centre, z-index 3000) shown whenever a
  Sandbox playtest runs, with **↺ Restart** and **← Return to Sandbox** buttons + a "🧪 Test" badge.
  Reliable in every mode (unlike the canvas button). Wired in `TEST_WORLD` (`_showControls`/`_hideControls`).
- **`TEST_WORLD` refactor:** captures the edited world ONCE (so Restart replays the exact layout);
  `_launch` shows the HUD, sets the Game's exit callback (Return/Esc/pause/end all route through it →
  reopen editor), and Restart relaunches the same test. The "Test in Arena" button now routes through
  `TEST_WORLD.choose('arena')` so it shares the HUD.
- **Esc in test mode exits to the editor** (no pause-freeze). App-level.
- **No high scores in test** (build 56) retained: `_srTriggerWin` early-returns; arena gated.
- **Full-column finish line:** `_srCheckGoals` now wins on any horizontal contact with the goal's
  COLUMN, at any height — so jumpers are caught. Works for ALL Speed Run worlds wherever a GOAL block is
  placed (engine-level). The generator also draws the finish as a full-height GOAL banner (regenerated
  SR worlds).

Files: js/game.js (Esc + `_srCheckGoals`), js/test-world.js (HUD + capture-once), js/sandbox-ui.js
(arena-test reroute), index.html (#test-hud + `?v=b57`), style.css (#test-hud), sw.js
(`steveo-shell-v57`), js/constants.js (build 57), tools/gen-sample-worlds.js + sample-worlds/SR_*.json.
Tests 182/182; `node -c` clean; structural check 9/9.

---

## Builds 59–63 (2026-07-07) — movement moves: wall slide, ledge hang, ground slide (+ climb animation)

Merged the `ledge-wall-moves` branch to `main`. Three new **opt-in per-world** movement moves (default
off, toggled in the pause-menu Physics section — the canvas World Settings panel is full; see
FUTURE_ROADMAP "World Settings rebuild"). All live in `js/player.js`; settings via
`worldAdvSettings` + `_applyMovementConfig`.

- **Wall slide (59):** airborne + pressing into an adjacent wall → clamped fall (~2.6 px/f) + a lean
  pose (leading hand on the wall). Wall jump = a normal jump. Optional **`wallJumpLockAway`** forces the
  arc away and disables steering until you land / hit a wall / grab a ledge (`_ctrlLock`).
- **Ledge hang (59–63):** grab an EXPOSED top-corner from the air while holding jump; up/jump = climb up,
  down = drop; crawl to the lip + press into the drop = climb down to hang. **Crawl edge-guard** (always
  on when crouching) stops you at the lip so you can reach the exact edge. Grab validated so it only
  latches a genuinely exposed edge and never embeds the sprite (`_hangBoxClear`) — fixes the earlier
  pass-through/tunneling glitch (61). Climb-up is an **articulated waist+hip animation** (`_drawHangFigure`
  / `_drawFigureAt` / `_limbBar`): straight-leg pull-up with the waist+head bending forward (arms pivot on
  the hands), flowing into the legs swinging up as the body straightens and rises, with a small end hop —
  ~1.25s (62), drawn hard-edged to match the blocky sprite (63). Designed/approved via an HTML
  side-by-side animation review tool.
- **Ground slide (59):** jump + down → slide; adopts the crouch hitbox (fits 1-block gaps). Configs:
  `slideDurationFrames`, `slideSpeedMult`, `slideInvincible`; cancel early by jumping (60).

New `worldAdvSettings`: `wallSlideEnabled`, `wallJumpLockAway`, `ledgeHangEnabled`, `slideEnabled`,
`slideInvincible`, `slideDurationFrames`, `slideSpeedMult`. Verified with headless harnesses (mechanics
+ grab-edge + climb/draw) and the full suite (**182/182**); browser-tested by Kevin on the branch.
Also merged earlier: build 58 (double-jump air-roll).

---

## Builds 64–66 (2026-07-07) — unified HTML World Settings + input tweaks

Merged `world-settings-html` → main.
- **Unified HTML World Settings panel** (`js/world-settings-ui.js`): one tabbed screen for every
  per-world setting, data-driven from a flat SETTINGS list (each tagged tab/group/advanced/modes/
  dependsOn — re-tabbing or advanced-flagging is a one-line change). Tabs World / Movement / Speed Run /
  Arena / Combat / Mob Drops; a tab shows only if it has rows for the mode (Sandbox sees all; SR-only and
  Arena-only settings isolated). Sub-configs hide until their parent toggle is on; a master ⚙ Advanced
  toggle reveals `advanced` settings (amber-coloured, matching the header toggle). ⓘ tooltips per setting.
  Opens via sandbox **P** key and the pause-menu **⚙ World Settings** launcher; counts as an input
  overlay (`_htmlSettingsOpen`), Esc closes. The classic canvas panel stays behind the Konami code.
- **Mob Drops** ported to HTML (its own sandbox tab). **Arena Game Types** group (7 toggles →
  `arenaEnabledTypes`). **Background** added to World tab. **Night Spawn Rate** + **Full-Moon HP Boost**
  amount are configurable (advanced sub-settings; wired into the mob manager, `fullMoonHpMult`).
- **Moved to the pause menu as player/device settings:** Show Player Health Bars, Disable Chat (+ Audio,
  Controls already there).
- **Input:** Up Arrow + J are secondary jump keys (guarded off when a 2nd local player shares the
  keyboard). Konami ending flipped to the classic **B, A**.
Schema/logic validated headlessly (55 settings); suite 182/182.

---

## Sample world: "First Steps Redux" (2026-07-07) — new-moves platformer homage

Added an original beginner Platformer level (`sample-worlds/First_Steps_Redux.json`) built to showcase
the new moves — NOT a copy of any existing game's level. Solid earth throughout (no bottomless pits);
a tube hop, a forced **double-jump** onto a high platform (wall blocks the ground route), a short
double-jump climb, a tall **edge-grab** ledge, an optional **slide** tunnel (shortcut under a jump-over
roof), auto-climb staircase to a full-height goal. Ships with airJump/ledgeHang/slide/autoStepUp enabled.
Generator (`tools/gen-sample-worlds.js`): `buildHomage()` + the reachability validator now takes a
per-world `{maxUp,maxDx}` envelope so double-jump platforms verify honestly (validated 10/10). No app
code changed.

---

## Platformer campaign-prep (2026-07-07, build 67) — decisions

Answered Kevin's design questions about coloured goals / emeralds / a Campaign mode. Key decisions:

- **Campaign is a new MODE but a *thin container*, not a new physics engine.** The vision (a playable
  sequence of levels with secret/skip exits) is a **meta-layer** over existing Platformer levels. Levels
  stay Platformer levels; the Campaign layer only sequences them, routes coloured-goal exits, and tracks
  progression. Rationale: maximise reuse, keep complexity in one place, avoid forking gameplay. (Full plan
  = FUTURE_ROADMAP §12.)
- **Goal Star still ends a Platformer level — confirmed.** Was a *single* tracked goal
  (`level.goalCol/goalRow`); build 67 makes it **multi-goal** (any goal touched wins) so levels can have
  several exits.
- **Coloured Goal Stars = the branch mechanism.** 10-colour palette (`GOAL_COLORS`), **2 used now**
  (gold = normal, one alt = secret/skip), sized to 10 for future exit types / World-Select portals. The
  colour of the goal that ends a level is recorded on `game._wonExitColor` for future routing.
- **Emeralds + score are OPT-IN World Settings on Platformer** (`platformerEmeralds`, `platformerScore`),
  not always-on — classic Platformer behaviour is unchanged by default. Score sources (decided, "rough"):
  emeralds (`emeraldPoints`, dflt 100) + a level-clear bonus (`goalClearPoints`, dflt 1000); enemy-defeat
  points deferred (current levels have no enemies).
- **Authoring colours = re-click-to-cycle** in the editor for now (lean first pass). A click-to-open goal
  popup (like emerald/spawn-point popups) is the planned upgrade, to bundle with the Campaign Builder.
- **Carry-over (deferred to Campaign Phase 3):** inventory, points, emeralds, **lives** carry between
  levels; **health resets each level**. Lives → arcade game-over.
- **Navigation (deferred to Campaign Phase 4):** Kevin wants a **top-down walkable overworld map**
  (low-res OK), explicitly *preferred over a side-view level-select*; may share a top-down substrate with
  Tower Defense (§11). Start linear (PoC) but keep the data model map-ready. Plus a portal-based
  **World Select** hub level (Phase 5).
- **Build order Kevin chose:** Phase 1 (campaign-ready levels) NOW = build 67; Campaign Builder, carry-over,
  overworld map, World-Select portals all LATER, in that rough order.

Headless suite 182/182 + targeted smoke test (goalStars serialize round-trip, emerald init from
`_levelEmeralds`, palette size). Browser-UNTESTED; on branch `platformer-campaign-prep`, not merged.

---

## 2026-07-10 — Smart Mobs + weapons build (see the "Bug Fixes + Smart Mobs brief")

Kevin greenlit the FULL build ("Full build, checkpoint per section"). Recon (3 agents) first
mapped mob AI, weapons/combat, and rendering/movement/settings. Key up-front findings that shaped
the work: **no pathfinding exists** (straight-line + 1-block step/jump), **detection is
omnidirectional/through-walls**, **no pack/alert/flee infra**, mobs are **non-solid**, per-mob
stats are **hardcoded in constructors**, **melee already hits every mob in an 80px radius** (so
cleave/arc are constraints to ADD), **arrows hard-stop on first hit** (one pierce insertion point),
and a **crouch input already exists** (S / gamepad B, used by shield-deflect + slides).

### §1 — World Settings routing (build 73, SHIPPED to branch)
- Bug #1: sandbox editor ⚙ Arena Settings opened the retired **canvas** menu; now opens the HTML
  `WORLD_SETTINGS` panel on the **Arena tab** (`WORLD_SETTINGS.open(game, tab)` gained a landing-tab arg).
- Bug #2: added a top-right **⚙ World Settings** button in the sandbox editor for **all non-arena
  modes** (Arena keeps its own button). Single click vs the old Esc→Settings→World Settings (3 clicks).
  **Speed Runner worlds land on the Speed Run tab**; others on the World tab. Per Kevin's answer.

### §2 — Weapon trait system (build 74)
- **Architecture (answers Q11.0):** composable `WEAPON_TRAITS` registry keyed by weapon *class*
  (constants.js), merged with per-world overrides in `_worldAdvSettings.weapons[class]`. A single
  trait resolver (`Game._meleeTraits` / `_rangedTraits`) feeds `MobManager.playerAttack(player,
  owner, traits)`. This is the enchantment foundation (FUTURE_ROADMAP §17) — piercing etc. are
  generic traits, NOT weapon-specific code.
- **Integration decision:** TOOL_DATA `type` still routes a crafted tool to its slot
  ('sword'→melee, 'bow'→ranged); a new **`weaponClass`** field selects the trait set. So Spear/Axe/
  Trident ride the existing melee-slot plumbing and Crossbow the bow slot, with zero changes to the
  slot/hotbar/draw model. Low-risk.
- **Sword** cleave scales by tier (Wood/Stone=1, Iron/Diamond=2, Netherite=3) — `swordCleaveForTier`.
- **Spear (Q11.2):** reachMult 1.55, a **narrow 65° cone**, hits up to **3** mobs, 0.7× damage.
  (Documented choice: longer thrust, lower damage, multi-hit in a line — vs the sword's all-around single-ish hit.)
- **Axe:** 1.45× damage, 1.9× knockback, 1.7× swing cooldown (heavy/slow). Single-target.
- **Crossbow:** piercing arrows (arrow no longer `break`s on first mob; tracks hit mobs to hit each
  once), 1.25× damage. **Piercing is the generic trait, defaulted on** — grantable to a Bow later.
- **Trident (Q11.1):** melee thrust + **throwable, auto-return (loyalty-style)** projectile.
  Throw input = **Q / right-click / gamepad R3 (btn11)**. Chose R3 because both shoulders were taken
  (LB=prevSlot, RB=context); documented deviation from the brief's "shoulder button" preference.
  Recovery model = **auto-return when the thrown projectile lands/hits/expires** (a physical
  pick-up-to-recover is a follow-up). P2–P4 throw parity is a follow-up (P1 only this pass).
- **Config (Kevin's ask):** World Settings → **Combat → Weapons** — a `startingMelee`/`startingRanged`
  selector (equips the weapon on spawn; makes all six testable in Sandbox) + per-weapon advanced
  rows: Damage, Attack Speed, Knockback, Hit-All-Mobs (melee), Piercing (ranged), Throwable (trident).
  "Piercing" and "Hit all mobs" implemented as distinct traits (ranged vs melee) per Kevin's defer.
- **Acquisition:** only Swords tier-up (cleave-by-tier). Spear/Axe/Trident/Crossbow are single
  craftable recipes + the starting-weapon selector. Avoids bloating the crafting menu with 5 tiers each.
- New headless test `test/test-weapons.js` (14 assertions: cleave-by-tier, cleave cap, hit-cone,
  knockback/damage forwarding, pierce + throwable flags). Suite now **196/196**.
- **Test-harness note:** the vm sandbox proxies unknown globals to `1`; `Infinity` must be stubbed
  or `cleave: 0 → Infinity` collapses to 1. Real browser is unaffected. Stubbed in the new test.

### 2026-07-10 — Playtest fixes from Kevin (build 76, on `smart-mobs`)
Four quick items from Kevin's first playtest of the branch:
1. **Placed-items serializer regression (root-caused via a recon agent).** `GAME_STATE.serialize`
   read `game._platformerItems` for `placedItems` — but that array is only populated during
   platformer/normal PLAY; in the sandbox EDITOR it's `[]` while `game.sandbox.placedItems` holds
   the design. So every editor save/test/auto-save emitted `placedItems:[]` and re-saving an older
   world **stripped all its placed items**. NOT a smart-mobs regression — surfaced when persistence
   moved from `SandboxSaves.save` (read the right array) to `GAME_STATE.serialize`. Fix: prefer
   `game.sandbox.placedItems` in the editor, fall back to `_platformerItems` for mid-play progress
   saves (mirrors the emeralds/powerups/spawnEggs fields right beside it). `js/game-state.js`.
2. **Hotbar kept across the test round-trip.** `TEST_WORLD.choose()` now snapshots the editor
   player's hotbar/inventory/equipped tools; `exit()` restores them after the async `editWorld`
   reopens the editor (deep-copied slots). `js/test-world.js`.
3. **Gear palette grouped by type.** `GEAR_PALETTE_ITEMS` was in TOOL_DATA insertion order
   (pickaxe/sword interleaved per tier). Now sorted by weapon class — pickaxes, swords, spears,
   axes, tridents, bows, crossbows, shield, flint — tiers ascending within each group. Uses
   `weaponClass` (falls back to `type`) so the new melee weapons that share type 'sword' still get
   their own groups. `js/sandbox.js`.
4. **Footstep + landing SFX** (Kevin uploading mp3s). Files: **`sounds/footstep.mp3`** and
   **`sounds/land.mp3`**. Player emits per-frame noise events (`_sfxFootstep` on a gait-scaled
   cadence, `_sfxLand` = impact speed on landing after a real fall); `Game._playMovementSfx` plays
   them. **Per-sound volume: yes** — `_playSound(file, volMult)` already supports it; footsteps at
   0.4× (0.18× while sneaking), landing scales 0.35→0.7× with impact. Tunable master consts
   `FOOTSTEP_SFX_VOL` / `LAND_SFX_VOL` (constants.js) — can be promoted to World-Settings sliders.
   Gated off in the sandbox editor. These noise events are the hook §4b sound-detection will reuse.

### 2026-07-10/11 — Weapon collection UX (Kevin: two slots, collect & cycle, remappable attacks)
Kevin's direction after playtest: player should collect all weapons and switch between them, but
weapons must stay compact in the hotbar (platformer needs item space). Also wants distinct weapon
visuals + attack motions (sword/axe swipe, spear/trident stab), a melee-vs-ranged split (Minecraft
Dungeons style, "only one at a time"), place→Shift+Left-Click so right-click is a consistent ranged
attack, and eventually a FULL user-configurable key/button remap (Xbox + Switch out of the box).
Agreed sequencing (not over-engineering IF phased): 77 collection/cycle → 78 input split →
79 controls-config UI + presets → 80 distinct visuals. Building each as its own commit for rollback.

**Build 77 — weapon collection + cycle (two slots).** Each weapon "slot" (melee slot 0, ranged
slot 1) now holds a COLLECTION cycled through, so N weapons cost only 2 hotbar slots.
- `player.meleeOwned`/`rangedOwned` (one entry per weapon CLASS, best tier of each) +
  `acquireWeapon(key)` (new class → append+equip; higher tier of owned class → upgrade in place;
  equal/lower → keep). `this.sword`/`this.bow` mirror the active pick so all existing code works.
  `cycleWeapon(slot)` rotates; `normalizeWeapons()` folds a deserialized active weapon back in.
- All acquisition routed through it: `craftTool` (player), `_autoEquipTool` + `_platEquipItem` +
  `_applyStartingWeapons` (game). Platformer pickup now ACCEPTS a new weapon class (doesn't reject
  because you hold a sword) and only drops the displaced weapon on a same-class upgrade.
- Cycle input: **re-press an already-active weapon slot** (number key / d-pad 0-1) →
  `_selectOrCycleSlot` cycles that slot's weapon + name toast. HUD shows a `▸N` collected-count
  badge + per-class icon on the weapon slots.
- Added input plumbing for build 78 (non-breaking, not yet wired into dispatch): `mouse.rightDown`
  held-state, `input.isMeleeAttack()` / `isRangedAttackDown()`; `isThrow()` dropped right-click
  (reserved for the ranged attack in 78), keeps Q / gamepad R3.
- test-weapons.js +11 assertions (collection acquire/upgrade/cycle/normalize). Suite 207/207.

**Build 78 — melee/ranged/place input split ("Minecraft Dungeons" style).** Melee and ranged are
now SEPARATE, always-live inputs (not gated by the selected slot), so both weapons are instantly
usable and you rarely switch slots. Per Kevin's Shift+Left-click decision, place moved off left-
click so right-click is a consistent ranged attack in every mode.
- Defaults: **melee** = Space / gamepad X / plain left-click (when not mining or Shift-placing);
  **ranged** = right-mouse held / gamepad RT (hold to charge, release to fire); **place** (Normal)
  = **Shift+Left-click**; trident throw = Q / gamepad R3.
- Refactored the P1 `if(bow) else if(sword) else if(pickaxe)` exclusive chain into independent
  ranged + melee blocks (game.js). Dead pickaxe-melee branch removed (weaponMode never returns
  'pickaxe'). Bow now cursor/right-stick aimed always (dropped keyboard snap-aim for P1).
  Left-click melee is suppressed in the sandbox editor (a click there = build).
- Inputs go through `input.isMeleeAttack()` / `isRangedAttackDown()` + `mouse.rightDown` — the
  remappable seam build 79's controls UI will drive.
- **Known gaps for playtest:** keyboard-only-no-mouse players can't fire ranged until the rebind
  UI (build 79) — right-mouse/RT only for now. P2-P4 still use their existing selected-slot attack
  (pAttack) path — the two-button model is P1-only this pass. Browser-UNTESTED.

**Build 79 — spear slide-attack (Kevin's son's idea).** Opt-in Combat setting: ground-slide with a
spear launches nearby mobs into the air, spinning. Built GENERICALLY for future weapon specials.
- Trigger keys off a trait, not the class name: `WEAPON_TRAITS.spear.slide = 'launch'`. `Game.
  _updateSlideAttack()` fires while `_slideFrames > 0` + the active weapon's `slide === 'launch'` +
  the `slideAttack` setting; a per-slide Set stops double-hitting a mob.
- `MobManager.slideLaunch(player, dmg, hitSet)`: mobs overlapping the sliding player take
  `weaponDamage × dmgMult × slideAttackDmg`, get vy=-13 + random vx + a random spin; AI suppressed
  via knockbackTimer. Survivors land and resume; lethal hits set `_tossDeath` so the mob flies +
  spins + fades, THEN vanishes (death/drops resolve when it flips alive=false). Spin/fade done by
  wrapping the mob draw loop (no per-subclass draw edits). Sprite uses the swing/thrust pose.
- Settings: Combat → **Special Moves** → `slideAttack` toggle (default off) + advanced
  `slideAttackDmg` mult (dependsOn slideAttack). test-weapons.js +6 (launch/lethal-toss/dedup);
  suite 213/213. Browser-UNTESTED — watch the launch feel + toss-death timing.

**Build 80 — distinct weapon visuals + attack motions.** `_drawWeapon` now branches on the active
melee class: swords/axes **swipe** (the rotational lunge), spears/tridents **stab** (held near-
horizontal, thrust out+back via translation). New head shapes `_drawSpearHead` (long shaft + leaf
tip), `_drawAxeHead` (offset blade wedge), `_drawTridentHead` (3 prongs + crossbar), tinted by the
weapon's tier colour. Sword/bow/pickaxe unchanged. The slide-attack reuses the thrust pose.
Crossbow still draws as a bow for now (HUD icon + name toast distinguish it) — a crossbow-specific
sprite is a polish follow-up. Canvas visuals are browser-UNTESTED (can't verify headless).

**Build 81 — controller presets (Xbox / Switch out of the box).** A SAFE, additive slice of the
full controls-config ask. The gamepad face buttons (A/B/X/Y = indices 0-3) now pass through a
`_faceRemap` in `input.updateGamepad`; **identity by default = zero regression**. `setControllerPreset
('switch')` mirrors the face buttons (A↔B, X↔Y) for Switch Pro/Joy-Con; 'default'/'xbox' = identity.
Persists to localStorage, reloads on boot. Surfaced as a **Controller Layout** dropdown in the pause
menu Settings tab (top of the controls section). test-weapons.js +6 (identity default, Switch swap,
persistence, fallback). Suite 219/219.
- **DEFERRED (needs a live-testing session): the full arbitrary-key/button rebind UI.** The input
  layer is already remap-ready (named actions: isMeleeAttack/isRangedAttackDown/isThrow + the face
  remap). The remaining work is a capture grid ("click an action → press a key/button") + a
  Minecraft keyboard preset (right-click=place). Spec added to FUTURE_ROADMAP. Not shipped overnight
  because live key/button capture can't be verified headless and a bad map would break all input.

### 2026-07-13 — Playtest batch #2 (Kevin's 8 items → builds 84–88, on `smart-mobs`)
- **#7 redstone-on-resume (build 84):** platformer/normal/speedrun loaders created lever/trapdoor/
  pressure_plate/tnt WITHOUT `sandboxPlaced:true`, so the save serializer dropped their state. Added
  the flag (matches `_loadSandboxWorld`). State round-trips now.
- **#8 spawn burst (build 84):** clustered eggs near start were suppressed by the min-dist/on-screen/
  200px gates. `MobManager.spawnInitialBurst(level, startCx)` fires once on a fresh (non-resumed)
  level, spawning every egg within activation range of the START, bypassing those gates; far eggs
  still ambient-gated; arena unaffected; resume suppressed via `adoptSerializedMobs`.
- **#3 icons (build 85):** shared `weaponIconFor()`/`WEAPON_CLASS_ICON` by weaponClass — spear/axe/
  trident/crossbow read distinctly in hotbar + palette. Crossbow = 🎯 placeholder (no emoji exists).
- **#2 wall-slide (build 86):** `_detectWallSlide` now needs a wall ≥2 blocks tall (counts solid
  cells in the column) — a lone 1-block ledge no longer triggers a slide.
- **#1 synth SFX (build 86):** `_movementSound` plays the mp3 if present, else a synthesized WebAudio
  tick/thud (low-pass noise burst); mp3 wins once dropped in; per-file 'missing' flag.
- **#4/#5 active-hand (build 87):** the on-sprite weapon follows `player.activeHand` (last attack),
  not the selected slot — LMB melee shows the melee weapon, RMB shows bow/crossbow. Melee/ranged are
  mutually exclusive per frame (melee wins ties; blocked while bow charging). Cycle sets the hand
  active so the swap is visible.
- **#6 trident/arrow recovery (build 88):** per Kevin's answers — **throw the trident** (RMB when
  trident equipped, else RMB fires the bow), **hold-to-charge**, **Q recalls now**. Trident throws
  straight (low gravity, no spin), sticks where it lands/hits; on throw the next melee weapon auto-
  equips (`throwActiveTrident`); walk over it to pick up (`collectStuckArrows` → `recoverTrident`);
  Q sets the thrown trident `returning` (homes back). A lost/expired thrown trident auto-returns so
  it's never permanently lost. **Recoverable Arrows** Combat setting (hidden when Unlimited Arrows):
  arrows that miss every mob stick + are collectable; arrows that hit a mob are NOT recoverable
  (crossbow pierces the full path then isn't recoverable). Arrow gains stuck/returning/recoverable/
  _hitAnyMob. test-weapons/-mobs +14; suite 233/233. Automatic auto-return is a later enchant.

---

# Smart Mobs Batch 2 — Detection Core + Behavior Layer (2026-07-13)

Mob-intelligence half of the Smart Mobs brief (§4–§10). Built on a fresh branch
`smart-mobs-detection` off `main` (build 101). **Every behavior here is additive /
opt-in — default-off never changes existing mob behavior** (the hard rule from the
brief, since aggro/behavior is shared across all 8 mob classes). Build order per the
brief: §10 → §4 → §5 → §7 → §8 → §9. Up-front Q&A with Kevin resolved:
- **Detection (§4):** master **Smart Detection** toggle (default OFF) + per-axis
  Sight/Sound/Action sub-toggles under Advanced.
- **Foliage (§10):** do BOTH — existing Oak Leaves stay decorative/behind & non-
  occluding; NEW **Bush** concealment block. Colours (green/yellow/orange) for leaves
  AND bushes; a new **"Decor" palette tab** for non-solid front/back foliage.
- **Sprint (§7):** opt-in "Sprinting Mobs"; melee chasers (Zombie/Piglin/Wither
  Skeleton/Cave Spider).
- **Flee (§8):** **per-mob-type**, and the low-HP response is a `lowHpAction`
  **variable** (`none`/`flee`) built so new actions can be added later + advanced
  per-type HP-% threshold (default 20%).

## §10 — Decorative foliage (build 102)
- **Model chosen:** 4 new non-solid block ids — `BUSH_BACK`(59)/`BUSH_FRONT`(60)/
  `DECO_LEAVES_BACK`(61)/`DECO_LEAVES_FRONT`(62). The render **LAYER is encoded in the
  id** (so the grid + serializer carry it for free); the **COLOUR** (green/yellow/
  orange) lives in a `game._foliageColorMap` "r,c"→idx overlay, exactly mirroring the
  Goal-Star colour model (serialized as `world_data.foliage`, restored by both
  loaders via `_restoreFoliageColors`).
- **Occlusion (feeds §4a):** `foliageOccludesSight(id)` → **bushes conceal**, leaves
  don't (Kevin: oak leaves stay non-blocking). `game._blocksSight(col,row)` = solid OR
  bush — the single sight-occlusion API §4 raycasts against.
- **Rendering:** `Level.draw` skips foliage ids (like TX/RX); drawn by two dedicated
  passes — `_drawFoliageBack` (after terrain, before entities) and `_drawFoliageFront`
  (after players, beside `_drawEndPortalForeground`, reusing that same second-pass
  technique per brief §8.1). Art = see-through leafy blobs (transparent gaps) so FRONT
  foliage only partially conceals. **Sandbox-only cue:** front cells get a bright
  dashed outline + ▲ tick, back cells a faint dotted outline — so the two variants are
  visually **distinct in the editor** but **identical in play** (brief §3).
- **Authoring:** new **"Decor"** palette tab (`SANDBOX_PALETTE_BLOCKS.decorative`,
  tab count 4→5). Placed via the normal block path; **re-click a placed foliage cell**
  (with a foliage block selected) cycles its colour green→yellow→orange (mirrors the
  Goal-Star re-click cycle); a new cell inherits a touching cell's colour. Removal
  clears the colour-map entry.
- Existing `OAK_LEAVES` (id 5) is UNTOUCHED — no existing world changes. New test
  `test/test-foliage.js` (16 assertions: block flags, occlusion helpers, colour
  serialize round-trip). Suite green. Browser-UNTESTED (canvas rendering + the editor
  front/back cue + colour cycle warrant Kevin's look).

## §4 — Detection core (build 103)
- **Additive gate:** every mob's chase decision now routes through `Mob._shouldChase()`
  — when `_detect` is null/disabled (default) it returns the legacy "chase whenever in
  range" behavior, so existing worlds are byte-for-byte unchanged. When Smart Detection
  is ON, a mob only chases once `_alerted` latches (instant per-axis model; the decaying
  Suspicion Meter stays deferred §18). Applied to all mob classes: the wander/chase
  state-machine mobs (Zombie/Skeleton/Creeper) gate the state line; the always-chase
  mobs (CaveSpider/Piglin/WitherSkeleton) wander until alerted; Enderman gates its
  `aggro`; Blaze gates approach + fireball; leash/idle otherwise.
- **Sight (§4a):** `MobManager._updateDetection` — target must be within `sightRange`,
  inside the mob's **frontal cone** (`sightArcDeg` around `mob.facing`, so you can sneak
  up from behind), and on an **unobstructed line** (`_lineBlocked` samples every ½ block;
  occluded by solids **and bushes** via `foliageOccludesSight` — the §10 dependency).
- **Sound (§4b):** `blockSoundTier(id)` — real 3-tier rating (Gravel=loud, Grass=quiet,
  else normal). Player-side `game._emitMovementNoise` reuses the EXISTING footstep/
  landing flags (no parallel movement system): gravel = wide alert even while crouching;
  grass = zero sound always; normal = silent when still/crouching, walk vs run radius
  otherwise. Fall landings emit unless on grass, gated by a **physics-honest 2-block**
  threshold (derived from impact speed + this world's gravity). `emitNoise` alerts mobs
  in radius through walls (no LoS) — correct for hearing.
- **Action (§4c):** attacks (`_emitActionNoise` at the melee-fire + bow/trident-release
  sites) and jumps (`player._sfxJump` → `_emitMovementNoise`) emit an action-tier noise,
  hooked into the existing named-action combat paths per brief §8.0.
- **Config (§4d):** World Settings → Combat → **Detection** group — master `smartDetection`
  toggle (default OFF) + advanced per-axis Sight/Sound/Action sub-toggles + ranges (Sight
  Range/Cone, Walk/Run/Loud sound radii, Attack/Jump radius). Defaults in constants.js
  (`DETECT_*`), ranges authored in BLOCKS, converted to px in `game._detectionConfig()`.
- **Known limitations (flagged for playtest + the §6 Wayfinding session):** alerting is
  **sticky** (once seen/heard, a mob stays aggro — no de-aggro this build; the leash only
  applies while wandering). Sight uses a single eye-ray to the player's upper body. No
  pathfinding, so an alerted mob still can't route around terrain (as designed — §6). New
  `test/test-detection.js` (18 assertions). Suite 263. Browser-UNTESTED — **detection
  range/radius FEEL is Kevin's playtest call** (the "technically correct vs. feels right"
  bar from world_creation.md).

## §5 — Pack behavior (build 104)
- **Single Combat-tab toggle `packAlert`** (default OFF), per the brief ("one toggle;
  per-mob-type later — don't over-build"). Enables BOTH pieces:
- **Alert propagation** (`MobManager._propagatePackAlerts`): any alerted mob rouses
  un-alerted mobs within `packRadius` (default 7 bl, advanced). One hop/frame — the
  alerted set is snapshotted first so it ripples outward over frames instead of flooding
  instantly. Runs before the AI loop so roused mobs chase the same frame.
- **Surround** (`_assignSurround` + `Mob._chaseTargetX`): clustered melee mobs
  (Zombie/CaveSpider/Piglin/WitherSkeleton within 8 bl of the player) get alternating
  `_flankOffset`s so they approach from OPPOSITE sides instead of stacking. A deliberate
  left/right position preference, **not pathfinding** (brief §5 explicitly allows this;
  true flanking-around-terrain is the deferred §6). `_chaseTargetX` shifts the chaser's
  steer target past the player; zero offset (default / pack off) = beeline, so it's a
  no-op when off. Ranged kiters (Skeleton/Blaze) + Enderman excluded.
- Additive: both no-op unless `packAlert` is on. test-detection.js +6 (propagation
  radius + gating, opposite-side surround, reset-when-off); suite 269. Browser-UNTESTED —
  surround FEEL (do the flankers read as "surrounding"? without pathfinding they walk
  through the player, who is non-solid) is a playtest watch-item + a §6 candidate.

## §7 — Sprint with telegraph (build 105)
- **Opt-in `sprintingMobs` toggle** (Combat → Sprint), INDEPENDENT of the master
  detection toggle (a designer can add sprinting mobs without full stealth) — gated in
  `MobManager._updateSprint` on `detectCfg.sprintMobs`, not `.enabled`.
- **Scope:** ground melee chasers only (`_isSprinter` = Zombie/Piglin/WitherSkeleton/
  CaveSpider); ranged kiters (Skeleton/Blaze) + Enderman excluded (per the up-front Q&A).
- **State machine** (per mob, timers): idle → (random chance while chasing + in a 3–12
  block band) telegraph → burst → cooldown. `_sprintBoost` (the only movement effect) is
  read by the shared `_mobPhysics` speed line, so no per-subclass movement edits.
- **Telegraph (the requirement):** the wind-up phase (`SPRINT_TELE_FRAMES` ~0.7s) SLOWS
  the mob (`SPRINT_WINDUP_MULT` 0.35 — it visibly gathers itself) and draws a pulsing red
  ring + bobbing "!" over it (in `MobManager.draw`, so no per-mob draw edits), plus plays
  the mob's own voice (existing `mob-*.mp3` assets — works out of the box). THEN the burst
  (`SPRINT_SPEED_MULT` 2.4) fires with trailing speed streaks. So a fast approach always
  reads as a fair, reactable threat.
- Additive: `_sprintBoost` defaults 1 (no-op when off / non-sprinters). test-detection.js
  +8 (phase transitions, boost values, off-gating, non-sprinter exclusion); suite 277.
  Browser-UNTESTED — **telegraph timing FEEL** (is 0.7s enough warning?) is a key
  playtest watch-item, flagged per the brief's deliverable §4.

## §8 — Flee at low HP / Retreating Mobs (build 106)
- **Per mob type** (Kevin's ask), and the low-HP response is a **variable** `lowHpAction`
  (`none` default / `flee`) built so new actions can be added later without reworking the
  plumbing — plus an **advanced per-type HP-% threshold** (`lowHpThreshold_<key>`,
  default 20%). Settings live on Combat → **Retreating Mobs** (action non-advanced,
  threshold advanced + dependsOn action≠none), generated by `_fleeRows`.
- **Behavior:** `Mob._shouldFlee()` (hp/maxHp ≤ threshold + action 'flee') → `_fleeIfHurt`
  drives the mob AWAY from the player (facing the player so it reads as a retreat, hopping
  obstacles). Gated at the top of each mob's update (priority over chase/attack).
  **Additive to Skeleton kiting** — a very low Skeleton fully retreats instead of holding
  range (brief: the two coexist).
- **Scope:** wired for the 5 mobs where fleeing is coherent — Zombie, Skeleton, CaveSpider,
  Piglin, WitherSkeleton. **Creeper (explodes), Blaze (flies), Enderman (teleports)** are
  intentionally EXCLUDED (those ARE their low-HP behaviors) — no dead settings.
- `mobManager.fleeCfg` built per frame by `game._fleeConfig()` (only non-'none' types
  included; null when none). test-detection.js +6 (threshold boundary, flee-away
  direction, none/null = no flee); suite 283. Browser-UNTESTED.

## §9 — Spider Webs (build 107) — FINAL feature of this batch
- **Opt-in `spiderWebs` toggle** (Combat → Spider Webs, default OFF → Cave Spiders behave
  as before). When on, a chasing Cave Spider spits a `Web` projectile on a cooldown from
  range (`webShootTimer`).
- **`Web` class** (new, mirrors BlazeShot): a slow-arc glob; on overlapping the player it
  calls `player.applyWeb(...)` (NO damage) then dies; also dies on a wall / after its
  lifetime. Added to `MobManager.webs` (update + draw alongside blazeShots); CaveSpider
  dispatch now passes `this.webs` + `_webCfg`.
- **Player slow** (`applyWeb` + `_webSlowMult`/`_webSlowTimer`): the move-speed calc
  multiplies by `_webSlowMult` while the timer runs; timer decays each frame, mult resets
  to 1 on expiry. **Advanced settings** (all default per brief): Slowness (33% →
  67% speed), Duration (3s), **Stacking** (off) — when on, a second web while still
  slowed **compounds** (0.67 → ~0.4489 ≈ 44%); **every** web resets the duration timer to
  full. Verified: `applyWeb(0.33,·,stack)` twice → 0.4489.
- **Visible webbing** (`_drawWebOverlay`): a translucent radial web net over the player
  while slowed, fading as it wears off.
- New `test/test-webs.js` (10: Web travel/apply/expire/wall, applyWeb reduction + stacking
  compounding + timer reset). Suite **293**. Browser-UNTESTED — web feel + the overlay.

## Batch 2 wrap-up (builds 102–107)
- **Shipped (headless-verified, browser-UNTESTED):** §10 foliage, §4 detection, §5 pack,
  §7 sprint, §8 flee, §9 webs — each its own build + additive/opt-in (confirmed: NONE
  change default mob behavior unless a World-Settings toggle is turned on; defaults are
  all off/legacy). Suite 293 (adds test-foliage 16, test-detection 38, test-webs 10 to
  the prior 233 minus overlap; run.js lists all).
- **NOT changed by default:** verified every new behavior gates on an opt-in setting
  (smartDetection / packAlert / sprintingMobs / lowHpAction_* / spiderWebs), and the
  §10 blocks are new ids (existing Oak Leaves untouched).
- **Deferred / out of scope (unchanged):** §6 Wayfinding & ambush-from-above — still the
  ONLY remaining piece of the original Smart Mobs brief. This batch surfaced concrete
  §6 candidates: (a) sticky alert (mobs never de-aggro) wants path-aware repositioning;
  (b) §5 surround is a left/right heuristic — real flanking-around-terrain needs pathing;
  (c) an alerted mob still can't route around walls to reach the player.
- **Playtest watch-items for Kevin (the "feels right" bar):** detection sight-range +
  sound radii; sprint telegraph timing (~0.7s enough warning?); foliage front/back editor
  cue + colour cycle; surround readability (mobs are non-solid, so flankers overlap the
  player); web slow strength/stacking feel.

## Build 108 (Kevin feedback) — opaque "Solid Leaves" decor block
Kevin liked the new bushes/leaves but wanted the ORIGINAL opaque leaves look available
front/back + coloured too ("both the original fully solid and the new semi-transparent
version"). Added:
- **`LEAF_SOLID_BACK`(63) / `LEAF_SOLID_FRONT`(64)** — opaque full-cell leaves (`_drawFoliage`
  shape `'leaves_solid'`: green/index-0 reuses the exact classic `_drawLeaves` so it matches
  the original; yellow/orange tint the same pattern). Front/back layers + the shared 3-colour
  re-click cycle, in the **Decor** tab.
- **Non-collision + non-occluding** (matches the original leaves — Kevin: existing leaves are
  non-blocking and should stay so). Only **Bushes** occlude mob sight; all leaves (semi + solid)
  are cosmetic. The FRONT variant renders over the player so it can partly hide them.
- **Oak Leaves palette tile MOVED** from Overworld → Decor (the Solid Leaves is its
  repurposed front/back/coloured replacement). **Block id 5 is untouched** — existing worlds +
  world-gen (trees) render exactly as before; it's just no longer a palette tile (new
  placements use the Decor Solid Leaves). Decor tab now: Bush / Leaves (semi) / Solid Leaves,
  each front/back + colours (6 tiles).
- test-foliage.js +2 (solid-leaves ids non-occluding + flags); suite 295.

## Build 110 (Kevin) — consolidate mob settings into a "Mob Settings" tab
Kevin wanted all mob switches grouped in one place (was worried about mess; resolved by
the existing progressive-disclosure pattern). Decision: **all mob behavior**, not just
flee+sprint.
- **Renamed the 'mobs' tab label "Mob Drops" → "Mob Settings"** and made it host schema
  rows too (it was special-render-only). Retagged **Detection, Pack, Sprint, Retreating
  (`_fleeRows`), Spider Webs** from `tab:'combat'` → `tab:'mobs'`. The **Combat** tab now
  holds only player-facing gear (Boss Scaling, Combat/arrows, Special Moves, Weapons).
- **Render/visibility:** `_render` now draws the mobs tab's schema rows (master-switch
  order: Detection → Pack → Sprint → Retreating → Spider Webs) and, **in sandbox only**,
  appends the special mob-drops table below them; wiring wires both. `_tabHasRows('mobs')`
  = true in sandbox (drops) OR when it has visible behavior rows (so it now also appears
  in Normal/Platformer/Arena, where those settings used to live under Combat).
- **Mess worry addressed by the existing schema**: masters are plain toggles; every knob
  is `sub`+`dependsOn` (hidden until its master is on) and the fine-tuning is `advanced`
  (hidden behind the ⚙ Advanced toggle) — so the tab shows ~5 clean switches by default.
- No behavior/logic change — pure settings-surface reorg. Suite 295.

## Build 109 (Kevin) — min world height 15
Server `HEIGHT_MIN` 30 → 15 for non-arena create-world (client input/validation, arena,
and the offline path already allowed 15). Server-only.

## Build 111 (Kevin) — hide items behind foliage + height hint fix
- **Items over foliage:** sandbox placement was gated by `target === BLOCK.AIR`, so a
  non-solid decorative-foliage cell (non-air grid block) blocked dropping items there.
  Non-grid placeables (egg/emerald/power-up/spawn point/spawn line/arena-obj/tool/
  block-item) live in their OWN arrays (not the level grid), so overlaying them on a
  foliage cell is safe. Extended the condition to `target === AIR || (isFoliageBlock(target)
  && _placeableSel)`. Grid blocks still can't share a cell (one block per cell). Render
  order already does the hiding: FRONT-layer foliage draws after all entities/items, so an
  item under a front bush/leaves is concealed; a back-layer foliage sits behind it. Both
  placement orders work (item-then-foliage already worked — the grid cell stays AIR).
  Browser-UNTESTED (UI-click path).
- **Height hint:** the create-world height `<small>` still read "30-500"; fixed to
  "15-500". (The input min + client JS + server floor already allow 15 as of build 109 —
  but note the **server change needs a Railway deploy** to take effect for ONLINE world
  creation, and the SW-cached index.html may need a reload cycle to pick up the client.)

## Build 112 (Kevin) — World Settings: keep scroll position on setting change
Every setting change calls `WORLD_SETTINGS._render()`, which rebuilds the panel's
innerHTML → a fresh `.ws-body` with scrollTop 0, so the view snapped back to the top
after each adjustment (very noticeable on the Mob Drops table). Fix: `_render` now
captures the `.ws-body` scrollTop before the rebuild and restores it after — but only
for SAME-tab re-renders (tracked via `_lastRenderedTab`), so switching tabs still starts
at the top. Rows can change height when a toggle reveals/hides sub-settings, but the same
pixel offset keeps the user essentially in place. Suite 295.

## Build 113 (Kevin bug) — End Portal: wasted eyes + won't activate
Symptom: using Eyes of Ender said "nowhere to put them" but consumed the eye and the
portal never activated. Two root causes (both PRE-EXISTING, not from the Smart Mobs work):
1. **Consume-on-failure:** `_tryPlaceEyeFromHotbar` found a frame, called `_tryPlaceEye`,
   then consumed the eye UNCONDITIONALLY — even when `_tryPlaceEye` failed. Fixed:
   `_tryPlaceEye` now returns a boolean; the caller consumes only on success and keeps
   scanning other frames otherwise.
2. **Anchor-map dependency:** `_tryPlaceEye` placed an eye only if a matching entry existed
   in `_endPortalAnchors`. Frames present in the grid with no registered anchor (imported
   worlds, hand-placed frames, or a serialize gap) failed every time → "No inactive portal
   frame here". Fixed: when no stored anchor matches, derive one from the grid via
   `_endPortalFrameRun` (a contiguous run of ≥5 frame blocks on the row), counting existing
   eyed frames, and register it — so ANY 5-in-a-row frame set activates.
Both `_tryPlaceEye` callers checked (hotbar consumes on success; sandbox palette ignores
the return). Suite 295. Browser-UNTESTED — can't drive the canvas headlessly; if a
specific world still won't activate, need to know how its portal was authored.

## Build 114 (Smart Mobs §6) — Wayfinding & ambush-from-above (closes the brief)
The last and biggest piece of the Smart Mobs brief: replace "chase in a straight
line" with real pathfinding. Built in two verified phases.

**Phase A — the pathfinder (shared subsystem, committed separately).** New
`js/pathfinding.js` is the SINGLE source of truth for platformer-physics
traversal. Its movement model was ported VERBATIM from the Speed-Run
reachability validator in `tools/gen-sample-worlds.js` (standable/passable/dropTo
+ the arc-gated, pad-aware jump envelope), and then the generator was refactored
to `require()` `navReachable()` back from it — so the level validator and the mob
pathfinder share one model and can never drift. Proof: regenerating the sample
worlds produced byte-identical files (reach counts unchanged), so a level
validated as completable for a PLAYER is, by construction, sane for MOB pathing.
- `navReachable(nav, sc, sr)` → reachable-cell Set (generator validator).
- `findMobPath(nav, start, goal, opts)` → `{path, cost}` | null via A*, bounded by
  a search radius + node cap. Grid-agnostic `nav` adapter (`solid/hazard/pad` by
  col,row) runs against both the browser Level and the Node grid.
- Headless `test/test-pathfinding.js` (17): the 5 brief cases — corridor, jumpable
  gap, too-wide gap + legal detour, unreachable island = null, ambush drop — plus
  the search bound and a jump pad. Verified BEFORE touching any mob behavior.

**Ambush from above — HONEST NOTE (brief §1/§3 ask).** Built as scoped: it is an
EMERGENT result of the edge-cost model, not a deliberate vantage-seeking tactic.
Dropping costs ~0.05/block, climbing ~0.6/block, horizontal ~1/block, so when a
short drop and a long walk-around both reach the target the search prefers the
drop — the mob falls on the player from a ledge. My read: for the common case
(mob on a platform above the player's path) this delivers a genuinely satisfying
"it dropped on me!" moment. What it does NOT do is have a mob *seek out* a ledge
to lie in wait when it isn't already near one — that's T3-tactical AI and was
explicitly out of scope. If the emergent version feels too passive in playtest,
deliberate vantage-seeking is the natural follow-up (flag it).

**Phase B — integration.** Own opt-in toggle "Path-Aware Mobs" (NOT gated under
Smart Detection — brief §3 wants pathing to help classic-aggro worlds too, and it
matches the Sprint precedent). Everything default-off = byte-identical legacy.
- Per-mob cached route + recompute cadence + bounded radius + invalidation live on
  the `Mob` base (`_pathStep`/`_followPath`/`_pathStale`); each of the 8 classes'
  pursuit routes through it. Ground chasers (Zombie/CaveSpider/Piglin/
  WitherSkeleton/Creeper) fully path; Skeleton paths its approach-to-range; Blaze
  (flight) + Enderman (teleport) KEEP native movement — ground-cell A* doesn't
  model a flyer/teleporter, so forcing it on them would be wrong, not thorough.
- Stretches (both, per Kevin): §5 Pack surround now biases the path GOAL past the
  player (`_pathFlankBias`) so flankers route AROUND to the far side instead of the
  old overlap-the-player nudge; §8 low-HP flee routes to a reachable retreat cell
  around walls instead of backing straight into terrain (falls back to
  straight-away if no route).

**Defaults chosen (the "try it and adjust" feel/perf levers — Kevin picked the
Balanced profile).** These are the main things to retune in playtest:
- `PATH_RECOMPUTE_FRAMES = 12` (~5 recomputes/sec) — lower = snappier pursuit but
  costlier + more path flip-flop; advanced World-Setting "Path Update" (8/12/20).
- `PATH_SEARCH_RADIUS = 24` blocks — player beyond this → mob reverts to simple
  chase/wander (an A* to an unactionable far target is wasted cost); advanced
  "Path Range" (16/24/32).
- `PATH_MAX_EXPANSIONS = 5000` (A* node cap, runaway backstop — not user-facing).
- `PATH_FLANK_BIAS_BLOCKS = 2.5` (surround goal offset per side).
- Jump feel in `_followPath` (jump for rise ≥2 near the target column, or a gap
  directly ahead; `jumpMult` 0.85–1.0 scaled by rise) is heuristic and the most
  likely thing to want hand-tuning if mobs over/under-jump on real geometry.

Suite 329 (+17 pathfinding, +17 wayfinding). Browser-UNTESTED (canvas + feel is
Kevin's playtest). This CLOSES the original Smart Mobs brief entirely; next per
Kevin's priority order = Arena objective-bots (T2), which is the intended next
consumer of this shared pathfinder (FUTURE_ROADMAP §4).

## Build 115 — New-Platformer default World Settings preset (snapshot of "Kevin's World!")
Kevin asked: snapshot the World Settings on **Kevin's World!** and make them the
default for **newly-created Platformer worlds** (existing worlds untouched).

**Where new-world settings come from (two paths):** `LOCAL_WORLDS.create` (offline)
and `POST /api/worlds/sandbox/create` → `emptyWorldData` (online). Both previously
seeded only a few movement keys and let everything else fall back to
`Game._worldAdvSettings` engine defaults.

**Implementation — one shared preset, no drift.** New `js/platformer-defaults.js`
(UMD, same pattern as `js/pathfinding.js`) exports `PLATFORMER_DEFAULTS` +
`worldModeDefaults(mode)` (returns a fresh deep copy for 'PLT', `{}` for every
other mode). BOTH creation paths consume it: local via the browser global, server
via `require('../js/platformer-defaults.js')` — so client + server can't diverge.
Merged only when `gameModeDefault === 'PLT'`; Normal/Speed-Run/Arena and all
existing worlds are unaffected.

**Snapshot scope = GAMEPLAY/LEVEL settings only (Kevin's choice).** Source =
`saves/Kevins_World_PLT_2026-07-14.json` (committed for provenance). Included:
movement moves (auto-climb, double jump, wall-slide + lock-away, ledge hang,
ground slide + invincible), physics (gravity, jump-pad, redstone speed 2, XP-speed
off, **physicsLocked**), scoring (score on, emerald/goal points), combat/weapons
(slide-attack, guided/auto-return trident, weapon traits, unlimited+recoverable
arrows), Smart-Mobs behavior (detection + detectActionRange 12, pack, sprint,
webs+stacking, **pathAwareMobs** §6, zombie/piglin flee), day/night, background.
**Excluded** (per the chosen scope — per-player/display/instance prefs): audio
volumes, controller sensitivity/aim/deadzone, chat, online-health-bars,
compact-hotbar, worldZoom, twoPlayerMode, customTeleportPoints (tied to that
world's geometry), and all arena-*/speed-run-*/boss-* keys (irrelevant to PLT).

**Flagged for Kevin:** `physicsLocked: true` is the most likely to surprise — it
means a fresh Platformer world's physics is locked against player override by
default (the creator would toggle it off in World Settings to tweak). Kept because
it faithfully mirrors his world; easy to drop from the preset if unwanted.

Because the preset references build-114 keys (`pathAwareMobs`), this rides on the
`smart-mobs-wayfinding` branch as **build 115** (his world already uses those
features) — it ships when wayfinding merges. Server change needs a Railway deploy
to affect ONLINE creation (offline works on client reload). Test:
`test/test-platformer-defaults.js` (PLT gets preset, other modes empty, scope
exclusions, fresh-copy safety, merge simulation). Suite 362. Browser-UNTESTED.

## Build 116 — Wayfinding playtest polish (Kevin): spider hang + crowd throttle
Kevin playtested build 114 wayfinding ("looks great"). Two items:

**1. Cave Spider hung on a 1-block obstacle (bug).** The path told the spider "rise
of 1 → no jump, let auto-step handle it" — but `_mobPhysics`' 1-block auto step-up
only works for a body that spans ≥2 grid rows (head cell above feet cell). The
Cave Spider is 16px tall (≤1 block), so its head + feet share a row → the step-up
branch never fires → it stalls against the ledge. (Tall mobs — Zombie 48, Piglin
44, etc. — auto-step fine, which is why only the spider hung.) Fix: `_followPath`
now detects a solid block directly ahead at foot level (with headroom above) and,
for a SHORT body (`height <= BLOCK_SIZE`), returns jump=true so it hops the step;
tall bodies still auto-step smoothly (no behavior change for them).

**2. Framerate dropped ~10 mobs on screen (perf).** Per-mob A* adds up. Added a
crowd-adaptive throttle: each frame every mob sets `_wayfinding` when it's actively
following a route; the manager counts them (`_activePathCount`) and, when the count
exceeds `PATH_CROWD_THRESHOLD = 8` (Kevin's number), hands all mobs a DEGRADED
config for the next frame — recompute interval ×2.5 (12f → 30f, ~2/sec) and search
radius ×0.6 (24 → 14 bl, + node cap ×0.6) via `_crowdAdjustedPathCfg()`. Uses last
frame's count (1-frame lag, imperceptible). Also: a mob's FIRST route reset gets a
random 0..recompute jitter so a pack that all start chasing the same frame don't
then recompute in lockstep (spreads A* cost across frames). All tunable in
constants.js (`PATH_CROWD_*`). Trades pursuit snappiness for framerate only under
load; ≤8 pathers = full-quality behavior, unchanged.

Tests: test-wayfinding.js +3 (short-mob hop vs tall-mob auto-step; crowd throttle
degrades cfg above threshold; active-pather count). Suite 371. Browser-UNTESTED —
Kevin to confirm the spider hops cleanly + the throttle holds framerate at ~10+.
Both `PATH_CROWD_THRESHOLD` and the multipliers are "try it and adjust" levers.

---

# Bot AI (Competitive + Cooperative) — mega session (2026-07-14, branch `bot-ai` off `smart-mobs-wayfinding`)

Building the full Bot AI brief (Phases 0–7). Branch `bot-ai` sits on top of the
un-merged wayfinding work (Bot AI depends on the pathfinder), so it inherits
wayfinding's "browser-UNTESTED, awaiting Kevin's playtest" status. Everything is
additive/opt-in — no bots unless a match is configured with them; human-only play
is byte-identical.

## Up-front answers from Kevin (2026-07-14)
- **Q1 Bot setup UI → PER-BOT difficulty.** Each non-P1 slot in the arena
  pre-launch modal is Human / Easy Bot / Medium Bot / Hard Bot.
- **Q2 PvP targeting → HIGHEST-THREAT BLEND with configurable weights.** Kevin:
  "go with 3 [the blend], but have configurable thresholds (may hide later, but
  makes fine tuning easier)." So the blend weights are real wired tunables
  (`BOT_THREAT_WEIGHTS` in constants.js), not hardcoded.
- **Q3 Companion loot → time-delayed eligibility + a redundant-downgrade handoff.**
  Kevin picked #3 (an unclaimed pickup becomes companion-eligible only after a
  delay) AND added: "anything redundant the player picks up that is as good or
  worse than what the player has equipped is automatically given to the bot."
  Both to be implemented in Phase 4.
- **Q4 Mob Hunter aggressiveness → "compete harder for mob kills," NOT PvP.**
  Confirmed; matches the code (mode scores mobKills only).

## Phase 0 — Wayfinding further testing (DONE — greenlight to build on it)
- Re-ran the existing pathfinder suite: **371/371 pass** (incl. test-pathfinding's
  5 brief cases + ambush + bound + pad, and test-wayfinding's mob integration).
- Wrote an ADDITIONAL static-objective smoke test (bots path to fixed objective
  tiles, not just a moving player): 4 spawns → one static hill tile across arena
  terrain; air-marker objective (snaps to ground); drop/ambush approach; long
  distance (113 blocks) + clean null fallback when radius too small; raised
  tower-top objective via staircase; unreachable-across-void → null (no hang).
  **27/27 pass.** (Kept in scratchpad — it exercises the same `findMobPath`
  entry the permanent suite already covers; the permanent coverage is enough.)
- Two initial "failures" in the smoke test were MY hand-drawn ASCII-map bugs
  (objectives placed against the top out-of-bounds ceiling — `navStandable`
  requires `r>=1` with headroom — and a void exactly 6 wide = the max jump range,
  so the pathfinder correctly leapt it). The pathfinder behaved correctly in
  every case (null for genuinely unreachable, snapping for air markers).
  **Conclusion: the pathfinder handles static-point objective targets correctly.
  Greenlit to build Bot AI on it.** No pathfinder changes made.

## Phase 1 — Bot player foundation (DONE, headless-verified; browser-UNTESTED)
- **A bot occupies a real player SLOT (P2–P4) and drives SYNTHETIC INPUT** through
  the same `input.pXxx(i)` pipeline a human's keyboard/gamepad feeds. In
  `js/input.js`, a per-slot `botInput[i]` override is consulted first by
  `pLeft/pRight/pJump/pCrouch/pAttack/pMoveX/pGp/pGpSlot/pJustDown`; a human slot
  falls through to the hardware path unchanged. `pGpSlot` returns ≥0 for a bot so
  the free-aim combat branch is used; `pJustDown` edge-detects against a per-frame
  snapshot (`_botPrev`, taken in `updateGamepad`). So a bot is "just another input
  source" into the existing movement/combat/objective code — CTF carry, KOTH
  zone-standing, Tower damage, weapon traits, friendly-fire, scoring all apply for
  free (no parallel bot-entity type), exactly as the brief requires.
- **DECISION: bots occupy slots P2–P4 (index ≥1); P1 stays human.** This covers
  every deliverable (competitive human-vs-bots; co-op human+bot teammates;
  companion human+bot P2; telemetry = Kevin plays P1 while bots fill the rest) and
  keeps injection clean through the existing per-index path. The `botInput`
  mechanism is universal (all 4 indices) but only slots ≥1 are wired; a P1 bot
  would additionally need the P1 mouse-aim/mining combat path overridden — noted
  as a future extension, not needed for any deliverable.
- **`js/bot-ai.js`** — `BOT_AI` helpers (buildNav = same nav adapter mobs use;
  navFollow = mob `_followPath`-style steering adapted for a ~2-block player;
  cellOf; elementsFor) + `class BotController` (one per bot slot):
  - **Two loops** (same reasoning as wayfinding's recompute cadence): a periodic
    **BRAIN** (`difficulty.brainTick`) picks a GOAL; an every-frame **ACT**uator
    translates the goal into virtual input (path to the goal cell via `findMobPath`
    + the goal's context action).
  - **Goal executor** (shared infra for all later phases): path to an arbitrary
    cell (cached + recomputed on the difficulty cadence, graceful null → hold) and
    do a context action (Phase 1 = combat; Phase 2 adds hill/flag/tower/etc.).
  - **`_think` dispatches on the active ruleset ELEMENTS** (`ARENA_RULES
    .rulesetForMode(...).elements`), not mode names — the roadmap's "the system
    that defines modes tells a bot how to play them," which is why Custom Rules
    get bot support for free (Phase 6). Phase 1 implements the pvp/kills strategy
    (highest-threat blend engage; hunt nearest when none in range; idle/recentre
    when no opponents) + element stubs for Phase 2.
  - **Combat**: aim at target (+ difficulty aim error, resampled), charge the bow
    to `fireChargeMin` then release one frame to fire; per-target reaction delay so
    it doesn't snap-fire on decision. Archer approaches to ~`BOT_ARCHER_RANGE_BLOCKS`
    (9) then holds + fires (was `detectRange*0.5` — too far, froze the bot; fixed).
- **Difficulty = REAL WIRED PARAMS** (`BOT_DIFFICULTY_PRESETS` in constants.js):
  brainTick, reactionFrames, navRecompute, navPrecision, detectRange, aggression,
  aimError, aimJitter, fireChargeMin, alwaysRun, loseInterest. **MEDIUM is the ONE
  calibrated baseline; EASY/HARD are best-guess starting values explicitly flagged
  for playtest calibration (that's what Phase 7 telemetry is for).** Chosen
  starting values (per the brief's requirement to log them):
  - EASY: brainTick 30, reaction 24, navRecompute 20, navPrecision 0.55,
    detect 12, aggression 0.40, aimError 0.42, fireChargeMin 0.35, dawdles.
  - MEDIUM: brainTick 15, reaction 10, navRecompute 12, navPrecision 0.82,
    detect 22, aggression 0.70, aimError 0.20, fireChargeMin 0.55, always-run.
  - HARD: brainTick 8, reaction 3, navRecompute 8, navPrecision 1.0, detect 40,
    aggression 1.0, aimError 0.05, fireChargeMin 0.75, always-run, near-perfect aim.
  Threat blend weights (Q2, tunable): proximity 1.0, lowHp 0.6, recentDamage 0.9;
  recent-damage window 180f (~3s). "recentDamage" is approximated: when the bot's
  hp drops, the nearest opponent is credited as the recent attacker for the window.
- **Wiring** (game.js): `_setupArena` builds a `BotController` for each slot whose
  `arenaConfig.playerTypes[i]` names a difficulty (else human); `_update` ticks all
  controllers right after controller-assignment, BEFORE players/combat consume
  input; each controller self-guards on dead/respawning/not-playing (neutral no-op).
  All 4 bot-input slots are cleared at setup so nothing leaks between matches.
- **UI** (arena pre-launch): per-slot Human/Easy/Medium/Hard dropdowns for P2–P4,
  shown for the active player count; `_start` emits `cfg.playerTypes`.
- **NOTE found while wiring (flagged):** the existing `arenaConfig.botCount` spawns
  ambient enemy **Skeletons** (`_createMob('Skeleton')`) — a totally separate
  concept from these slot-occupying player-bots. They coexist; the new bots are
  distinct and additive.
- **Tests:** new `test/test-bot-ai.js` (30 assertions) — the InputManager synthetic
  seam (setBotInput→pXxx / justDown edge / clearBotInput), navFollow/buildNav/cellOf,
  the threat blend (nearer wins same-HP; wounded wins same-distance; out-of-range
  not picked), goal selection (engage/hunt/idle), actuation (moveX+aim toward
  target), dead→neutral, and the goal executor routing around a wall. **Suite now
  401** (`node test/run.js`). Browser-UNTESTED (no browser here) — the natural first
  real-world check is a Deathmatch with 1–3 Medium bots.

## Phase 2 — ruleset-element strategies (build 118, DONE, headless-verified)
Strategies are keyed to the Arena Rules Engine's declared ELEMENTS (via
`ARENA_RULES.rulesetForMode(mode,cfg).elements`), NOT mode names — so Custom Rules
get bot support for free (Phase 6). `_think` dispatch order: flags -> hill -> tower
-> emeralds -> waves -> kills -> idle. Every objective goal carries an `approach`:
**'reach'** (occupy the cell — hill/flag/emerald) vs **'range'** (stop at firing
distance — kills/tower/mob); the actuator uses it to decide when to stop moving,
and a separate opportunistic `targetRef` lets the bot shoot nearby enemies WHILE
pursuing an objective (independent combat + movement blocks in `_act`).
- **Kills/PvP:** highest-threat blend (Q2) engage in range; hunt nearest when none
  in range; idle/recentre when no opponents.
- **Hill (KOTH) — sub-mode-aware (brief 2):** off-hill -> approach; on-hill:
  **SOLE** displaces the current occupant (targets the enemy standing on the hill),
  **STICKY** holds + fights off challengers, **ALL** just stays present. Reuses
  `ARENA_MODES._onHill` for the exact occupancy test (no drift). Hill-less KOTH
  worlds fall back to the arena-centre.
- **Flags (CTF):** carrying -> run to own base to capture; else grab a FREE enemy
  flag (offense priority per brief); else if a teammate already has the enemy flag
  AND an enemy stole ours -> chase that carrier; else defend own base. Grab/capture
  are proximity-automatic in CTF_SYSTEM, so the bot just needs to REACH the cell.
- **Tower (Defend the Tower):** attack the nearest live enemy tower (aim + fire
  arrows at its centre — the tower is wrapped as a {cx,cy,hp} combat target); if
  our tower <=1/3 HP AND an enemy is near it -> switch to defend. Co-op attack/defend
  SPLIT is Phase 3. `_ownsTower` treats a teammate's tower as ours in team modes.
- **Emeralds:** navigate to the nearest uncollected live emerald
  (`EMERALD_SYSTEM._activeEmeralds`); pickup is proximity-automatic.
- **Waves / Mob Hunter (Q4 confirmed):** engage the nearest live mob; higher
  `aggression` biases toward mobs an OPPONENT is also near (race to steal the kill)
  — NOT toward attacking players (Mob Hunter isn't PvP).
- Tests: test-bot-ai.js +17 (hill approach/hold/SOLE-displace, flag grab/capture/
  defend, tower attack/defend, nearest-emerald, nearest-mob, element dispatch).
  **Suite 418.** Browser-UNTESTED.

## Phase 3 — co-op team coordination (build 119, DONE, headless-verified)
Simple complementary-role heuristics (NOT deep planning — no comms, no counter-
strategy, per the brief's explicit scope). Applied in `_coopAdjust(goal)` at the
end of `_think`, AFTER the element strategy picks a goal. Reads teammate state the
SAME way for bots (their live `goal`, via `game._botControllers`) and humans
(inferred from CTF/tower/position state). FFA (teamId null) → no coordination.
- **CTF:** two teammates don't both chase the same free enemy flag — the farther
  one switches to `flag-escort` (defend base). A human teammate carrying the flag
  counts as "committed" (read via `CTF_SYSTEM.isCarrying`).
- **Tower:** if a teammate is already attacking the enemy tower (bot goal, or a
  human standing near it) and we own a tower → `tower-defend` instead of piling on.
- **Hill:** if a teammate already holds the hill and the sub-mode isn't ALL →
  `hill-intercept` approaching enemies rather than crowding the zone.
- **Emeralds / Mobs:** don't dogpile — a bot whose nearest target is already
  claimed by a teammate bot picks the next-nearest unclaimed one.
- Tests: test-bot-ai.js +9 (CTF/Tower/Emerald/Mob splits + FFA-no-coordination).
  **Suite 427.** Browser-UNTESTED.

## Phase 4 — companion bot (build 120, DONE, headless-verified; browser-UNTESTED)
A FRIENDLY follower for Platformer/Normal/Campaign — a distinct role from arena
bots. Occupies the P2 slot; drives the same P2 input/combat path (so it works with
zero new combat code). Opt-in via `_worldAdvSettings.companionBot` = EASY|MEDIUM|
HARD; `_maybeSetupCompanion()` (lazy, offline, non-arena) creates P2 + a
`role:'companion'` controller and arms it with a sword.
- **Follow band:** `_thinkCompanion` follows P1 within [BOT_FOLLOW_NEAR=3,
  BOT_FOLLOW_FAR=9] blocks with hysteresis (catch up past FAR, stop within NEAR) —
  "not glued, not left behind."
- **Inverted targeting:** engages the nearest hostile MOB in range; NEVER targets
  the player (companion goals never pick a player as targetRef).
- **Hazard safety:** inherent — the pathfinder never routes through lava/void
  (same reachability model as the Speed-Run validator), so the companion won't path
  itself into an avoidable death.
- **Loot priority (Q3 — BOTH mechanisms):**
  1. *Time-delayed leftover pickup* — `BOT_AI.companionShouldGrab` lets the
     companion grab a placed item only after it's been available near it for
     BOT_COMPANION_LOOT_DELAY (150f ~2.5s) AND the player is farther from it. The
     player always gets first pick.
  2. *Redundant-downgrade handoff* — `_collectPlatformerItem` now takes a
     `collector`; when P1 picks up a weapon/tool that is equal/worse than what they
     have equipped (previously it just vanished), `_handToCompanion` gives it to the
     companion instead (best-tier gated).
- Tests: test-bot-ai.js +8 (follow-band idle/catch-up, mob-not-player targeting,
  loot delay + player-first). **Suite 435.** Browser-UNTESTED — natural check is a
  Platformer world with `companionBot:'MEDIUM'` set. NOTE: no pre-launch UI toggle
  yet for the companion (set via world settings/flag) — a small follow-up; the
  mechanism is complete.

## Phase 5 — difficulty tuning architecture (DONE — architecture landed in Phase 1)
The difficulty system is REAL WIRED PARAMETERS (`BOT_DIFFICULTY_PRESETS`), built in
Phase 1 and used throughout: brainTick (decision cadence), reactionFrames (reaction
time), navRecompute + navPrecision (nav movement precision — Kevin's Emerald example:
Easy = imprecise/dawdles, Hard = tight/always-running), detectRange (how far it
notices targets/objectives), aggression (mob-kill competition — Kevin's Mob Hunter
example), aimError + aimJitter, fireChargeMin, alwaysRun, loseInterest. Per Kevin's
Q1, difficulty is PER-BOT (each arena slot picks Easy/Medium/Hard). The PvP threat
blend weights (Q2) are separately tunable (`BOT_THREAT_WEIGHTS`).
- **MEDIUM is the ONE calibrated baseline; EASY/HARD are best-guess presets flagged
  for playtest calibration** (that's what Phase-7 telemetry is for). Starting values
  logged under Phase 1.
- Phase 5 work = VERIFY the params are wired + differentiate tiers (not just
  defined): test-bot-ai.js +10 — monotonic preset ordering (harder = faster/farther/
  tighter/more-accurate/more-aggressive), detectRange actually gates engagement (a
  15-block opponent is invisible to EASY, engaged by MEDIUM/HARD), and HARD's mean
  aim error is measurably smaller than EASY's over 400 frames. **Suite 445.**

## Phase 6 — Custom Rules support (build 121, DONE, headless-verified) + real-engine fix
Because Phase 2 keyed strategies to ruleset ELEMENTS, Custom Rules support fell out —
BUT verifying against the REAL arena-rules.js surfaced a genuine bug (exactly what
this phase is for): the engine's element keys are **ctf / towers / waveSpawns / bots
/ spawnEggs / hill / emeralds / pvp**, whereas the bot dispatch (and the earlier test
mock) used `flags` / `tower` / `waves`. Against the real engine that would have made
CTF, Defend-the-Tower, and Survival-Waves bots silently fall through to plain kills.
- **FIX:** `_think` now dispatches on the real keys with availability guards and a
  clear priority: ctf → hill → towers → emeralds(if gems) → mobs(waveSpawns|bots|
  spawnEggs, if live mobs) → pvp(if opponents) → idle. Test mock updated to the real
  keys too. (`_hasLiveMobs` helper added.)
- **Custom Rules verified** against the real `ARENA_RULES.rulesetForMode('CUSTOM',
  {customRuleset})`: {hill}→hill, {ctf}→flag, {towers}→tower, {emeralds,pvp}→emerald,
  {pvp}→kills. Preset element keys verified for all 6 objective modes + Mob Hunter.
- **Best-effort gaps flagged (per brief):** (1) with a mixed custom ruleset the bot
  follows the fixed priority above rather than the ruleset's SCORING weights — e.g.
  {emeralds,pvp} makes it collect gems even if kills score higher; (2) multi-stage /
  sequenced custom win conditions aren't reasoned about — the bot plays the currently-
  active elements, not the stage graph. Common single-objective + simple-combo customs
  work; exotic designer rulesets are not guaranteed.
- Tests: test-bot-ai.js +12 (real preset keys + custom dispatch). **Suite 457.**

## Phase 7 — Learning Mode / telemetry (build 122, DONE, headless-verified)
`js/bot-telemetry.js` (`BOT_TELEMETRY`) — one structured record PER BOT PER MATCH,
accumulated in localStorage (`steveo_bot_telemetry`, never overwritten, capped 500),
exportable as ONE JSON batch. Recorded once at arena match end via
`_submitArenaResultOnce` (records even in Test World — it's local dev/tuning data,
not a leaderboard entry).
- **Record fields:** schema, matchId, ts, mode, rulesetId, custom, durationSec, bot
  {slot, ownerId, role, difficulty}, outcome {result, score}, stats {kills, deaths,
  mobKills, emeralds, hillSeconds, flagCaptures, towerDamage, towersDestroyed},
  goalCounts, decisionTrace.
- **Sampled decision trace:** the BotController already records one snapshot per
  brain-tick (`telemetry.decisions`); the exporter run-length-COLLAPSES consecutive
  identical decisions into `{fromFrame, toFrame, kind, reason, target, cell,
  samples}` runs — compact "what was it trying to do, and when," not a per-frame
  replay.
- **Export / review helpers:** `exportBatch()` (wrapper naming the schema + the data
  dictionary), `download()` (browser .json), `all()`, `clear()`, and `summarize()`
  (per mode×difficulty win-rate/avg-score roll-up — the same reduction Claude
  Code/web would run).
- **DATA DICTIONARY — `BOT_TELEMETRY_SCHEMA.md`** (the critical deliverable): every
  field, its meaning/units, score-by-mode, goal kinds, trace interpretation, a
  "what to look for when tuning EASY/HARD" section, and honest limitations — so a
  batch handed to Claude Code OR Claude (web) is read identically.
- **Sample logs — `tools/gen-bot-telemetry-samples.js`** → `saves/bot-telemetry-
  samples.json`: drives the REAL bot brains through 3 simulated matches × 6 modes
  (36 bot-records; decision traces + goalCounts are genuine, stats/outcomes
  synthesized + difficulty-scaled). Demonstrates ACCUMULATION (many records per mode)
  + BATCH round-trip; the summary shows Hard > Medium > Easy as intended. (Companion
  telemetry not logged yet — arena bots only; flagged in the schema doc.)
- Tests: test-bot-ai.js +11 (record fields, trace collapse, batch wrapper,
  summarize). **Suite 468. Bot AI brief COMPLETE (Phases 0–7).**

## Bot AI — SESSION WRAP-UP (2026-07-14): shipped / partial / blockers, phase by phase
The whole brief (Phases 0–7) landed in one run on branch `bot-ai`. Suite **468**,
all green. **Everything is browser-UNTESTED** (no browser in this env) and the branch
is **NOT merged** — it stacks on the un-merged wayfinding branch, so it merges only
after Kevin validates wayfinding, then Bot AI.

| Phase | Status | Notes |
|---|---|---|
| 0 Wayfinding retest | ✅ shipped | 371/371 + 27/27 static-objective smoke; greenlit, no pathfinder change. |
| 1 Foundation | ✅ shipped | slot + synthetic input, brain/act, goal executor, per-slot difficulty UI. |
| 2 Element strategies | ✅ shipped | kills/hill(3 submodes)/ctf/tower/emeralds/waves. |
| 3 Co-op | ✅ shipped | complementary roles; reads bot + human teammate state. |
| 4 Companion | 🟡 shipped, one gap | controller + loot logic complete; **no pre-launch UI toggle** (set via `_worldAdvSettings.companionBot`); companion not in telemetry yet. |
| 5 Difficulty | ✅ shipped | real wired params; **Medium calibrated, Easy/Hard need playtest tuning**. |
| 6 Custom Rules | ✅ shipped | verified vs real engine; best-effort on mixed/multi-stage customs (flagged). |
| 7 Telemetry | ✅ shipped | logs + trace + schema doc + 36 sample records. Companion telemetry TODO. |

**Blockers / needs-Kevin:** none hard. All browser-untested — first real check =
Deathmatch with 1–3 Medium bots; then KOTH/CTF/Tower/Emeralds/Mob-Hunter; then a
Custom ruleset. **NEXT session pick-ups:** (1) companion pre-launch UI toggle; (2)
calibrate EASY/HARD from real-match telemetry (play several matches/mode, export via
`BOT_TELEMETRY.download()`, review against `BOT_TELEMETRY_SCHEMA.md`); (3) optionally
log companion telemetry; (4) P1-as-bot (needs the P1 mouse-aim/combat path overridden)
if Kevin ever wants bot-vs-bot spectating. **Watch-items (feel/tuning levers in
`constants.js`):** `BOT_DIFFICULTY_PRESETS`, `BOT_THREAT_WEIGHTS`, `BOT_ARCHER_RANGE_
BLOCKS`, `BOT_FOLLOW_NEAR/FAR`, `BOT_COMPANION_LOOT_DELAY`.

## Bot AI — Companion World-Settings toggle (build 123)
Closes the Phase-4 gap (no UI). Added `companionBot` to `world-settings-ui.js`
(World Settings → Players → "Companion Bot": Off/Easy/Medium/Hard; modes = normal/
platformer/sandbox). It free-rides the `worldAdvSettings` serialize path, so it saves
with the world; `_maybeSetupCompanion()` reads it on first update. Set it, (re)start
the level, and P2 becomes the companion. NOTE: takes effect at level start (not live
mid-match); if `twoPlayerMode` is also on, the companion claims the P2 slot. Suite
468 (settings entry is data-only). Browser-UNTESTED — the companion combat/loot path
gets its first real exercise here.

## Wayfinding fix — companion trapped "vibrating" under a one-block overhang (build 125)
Kevin (2-player platformer companion co-op): the companion got stuck under a ledge
with a one-block overhang, vibrating instead of backing up to jump over it.
- **ROOT CAUSE (shared pathfinder `navNeighbors`):** the A* jump loop offered an
  UPWARD jump to any standable destination without checking whether the actor could
  physically rise — i.e. whether a ceiling sat directly on its head. From under an
  overhang it therefore generated a cheap "jump straight up onto the ledge" edge that
  is impossible to follow; being cheaper than going around, A* returned it, the bot
  bonked the canopy every recompute → vibration.
- **FIX:** in `navNeighbors`, drop all upward jumps (dr<0) when the cell above the
  head (`nav.solid(c, r-2)`, a 2-tall body's head is r-1) is solid. A* now routes OUT
  sideways/back to a spot with headroom and jumps from there ("back up and jump over").
  This is in the SHARED subsystem, so **mobs benefit too**. Verified: test-pathfinding
  (+8: navNeighbors offers no up-jump under a ceiling but keeps walk neighbours;
  findMobPath's first move steps out, not up), full suite **481**, and the 9 sample
  worlds STILL pass the reachability validator (no over-restriction of real geometry).
- **Actuator hardening (`bot-ai.js`, belt-and-suspenders):** (1) `navFollow` won't
  issue a jump when a ceiling is directly above the head (no wasted bonk if momentarily
  under a canopy) — keeps walking so the route carries it out; (2) a **stuck-escape**:
  when the bot intends to move but makes ~no horizontal progress for a short window
  (scaled by skill: HARD ~18f → EASY ~33f), it backs away from the target and jumps
  for 16 frames, then re-paths — a general safety net for local traps the coarse path
  model can't express (wedged on a wall, shallow pit, path flip-flop). Tests +4.
- **Edge cases still coarse (honest):** the jump model is an envelope, not a swept
  arc, so extremely tight diagonal squeezes could still mislead; the escape reverses
  "away from the target," which is usually but not always the exit — but it guarantees
  the bot won't sit and vibrate forever. Suite 481. Browser-UNTESTED.

## Companion wayfinding — stuck on a 4-tall tree (build 126)
Kevin (co-op): companion stuck on a 4-block tree (branches at h1 near / h2 far),
"jumping away then reversing at the midpoint and back" = the build-125 escape firing,
ending, re-approaching, repeating. Root reality: an OAK_LOG trunk is SOLID and a
4-tall wall > the 3-block max jump, with no gap at ground level → on flat ground
there is NO nav route over/around it. So the fixes are behavioural, not a new path:
- **Escape cap (`BOT_ESCAPE_MAX`=2):** after 2 fruitless escapes on one goal, stop
  escaping and drop the goal to re-decide — a bot never paces a dead-end forever.
- **Companion teleport catch-up (standard co-op follower behaviour):** when the
  companion is way behind (`>BOT_COMPANION_WARP_DIST` 22 blocks) OR makes no closing
  progress for `BOT_COMPANION_WARP_STUCK` (90f) while still far, it WARPS to a
  standable cell beside the leader (`_warpNearLeader`), with a "Companion caught up"
  toast. Gated to the companion role (arena bots never teleport). This resolves
  trees, tall walls, pits, and unreachable platforms in one robust stroke.
- Tests: test-bot-ai +4 (escape cap re-decides; companion warps to a far leader).
  Suite 483. Browser-UNTESTED. NOTE: deeper *arc-aware* jumping (so bots could climb
  branch staircases / route around shorter obstacles instead of warping) is a future
  nav improvement — flagged, not built.

## Co-op loot sharing — duplicate / hand-me-down gear → companion (build 127)
Kevin: in Platformer/Normal bot co-op, gear the player picks up but can't use should
go to the bot, not vanish. Reworked `_collectPlatformerItem` to a benefit model:
- **Beneficial** pickup (new class / higher tier / empty slot): the collector equips
  it; if it DISPLACES an old piece (armor or pickaxe upgrade — e.g. diamond helmet
  over iron), the OLD piece **hands down to the companion** (`_giveKeyToCompanion`,
  best-tier gated). Weapons are a cycling collection (keep every class' best), so no
  hand-me-down there — only new/upgrade benefits.
- **Redundant** pickup (equal/worse than equipped): with a companion → the NEW item
  goes to the bot; with NO companion (single-player / HUMAN 2-player) → LEFT ON THE
  GROUND for the player (never silently consumed — a small improvement over the old
  "consume + lose").
- Only P1's pickups hand down (bot never steals from the player); the companion's own
  leftover pickups (time-delayed, player-farther gated) still apply.
- Browser-UNTESTED (Game-method gameplay code, like the rest of _collectPlatformerItem
  — no headless harness). node -c clean; suite 483.

## Movement-aware wayfinding + teleport World Setting (build 128)
Kevin: the bot drives the real player, so if Double Jump / Ledge Hang / Wall Slide
are enabled it can clear more height — the pathfinder must account for that (else it
underestimates reachability and warps instead of climbing).
- **Planning envelope (`_jumpEnvelope`):** `_pathToward` now passes `maxUp/maxDx` to
  `findMobPath` derived from `worldAdvSettings`: base = `jumpHeightBlocks||3`; Double
  Jump → +~a second jump's height (+3 dx airtime); Ledge Hang → +1 (grab at apex +
  pull up). Capped (≤8 up / ≤10 dx). Bot-only (mobs keep the basic envelope). Wall-
  jump scaling is ITERATIVE, not a static envelope → NOT modelled (flagged).
- **Double-jump actuation (`_jumpControl`):** the player's air-jump is EDGE-triggered
  (fresh press while airborne), so a held jump only single-jumps. For a rise taller
  than one jump with air-jump enabled, the controller holds while rising, RELEASES one
  frame near the apex (`vy > -4`) to arm the edge, then presses again → the air-jump
  fires. Ledge-hang needs no special handling (auto-fires on a held jump near a ledge
  apex, which the single-jump hold already does).
- **Companion Teleport = a World Setting** (`companionTeleport`, default ON, in World
  Settings → Players). Kevin turns it OFF to stress-test the nav so the bot must
  genuinely path rather than warp out of trouble.
- Tests: test-bot-ai +8 (envelope reflects moves; double-jump pulse edge sequence;
  teleport-off disables the warp). Suite 492. Browser-UNTESTED.
- **FLAGGED for next (Kevin's ideas):** (1) wall-jump-aware scaling in the envelope;
  (2) a "stuck" state — yellow "!" over the bot's head, then when a player is nearby it
  enters a timed MIRROR-FOLLOW mode (copy the player's inputs to thread a tricky
  tunnel). Neat; deferred as its own feature.

## Female character sprite + selection (build 129)
Kevin: add a female sprite option (loosely Alex — green shirt, ginger/red hair, a
ponytail out the back under the helmet lip); pick it in Arena setup + the 2-player
section for Platformer/Normal (full customization later).
- **Player.charType** = 'male' (Steve: brown hair, blue shirt) | 'female' (Alex-ish:
  ginger `#A83A1E` hair, green `#3FA34D` default shirt, ponytail). Cosmetic; a CTF/
  team `shirtColor` still overrides the shirt. Palette helpers `_charHair/_charShirt/
  _hasPonytail` + `_drawPonytailFlat`; wired into all 3 figure poses (standing,
  crouch, climb/`_drawFigureAt`) — the ponytail draws behind the head, below the
  helmet lip, so it shows even with a helmet on.
- **Selection UI:** Arena pre-launch — a per-slot character dropdown (Steve/Alex)
  beside each P1–P4 row → `cfg.playerCharTypes`, applied in `_setupArena`. Platformer/
  Normal — World Settings → Players → "P1 Character" + "P2 / Companion Character"
  (`p1Char`/`p2Char`), applied live each frame to `this.player`/`this.player2`.
- Browser-UNTESTED (canvas pixel-art — no headless render check). Suite 492.
- **NOTE:** full sprite customization (colours, per-account skins) remains a future
  arena feature per Kevin; this is the male/female first pass he asked for.

## Companion tuning: responsiveness, teleport range, stuck-behaviors, wall-jump (build 130)
Kevin's co-op tuning pass:
- **Responsiveness:** tighter follow band (`BOT_FOLLOW_FAR` 9→5, `NEAR` 3→2) + a fast
  companion decision cadence (`BOT_COMPANION_BRAINTICK` 6, regardless of difficulty)
  so it starts following almost immediately instead of lagging.
- **Teleport = DIRECT distance + configurable Range.** `_companionAssist` warps on
  Euclidean `hypot(dx,dy)` (so VERTICAL levels count, not just horizontal) once past
  `companionTeleportRange` (World Setting, default 20 blocks). It was firing too early;
  now it's predictable + tunable.
- **Warp stays on the leader's LEVEL (cave-drop bug fixed).** `_warpNearLeader` no
  longer uses `navDropTo` (which could fall ~40 blocks into a cave below the player);
  it searches the leader's row first, then a ±1 step, then places exactly on the
  leader. Never a cave-drop.
- **"If Companion Gets Stuck" (World Setting, used when Teleport is OFF)** —
  `companionStuckBehavior`: **Do nothing** (stress-test: shows "!", keeps trying, no
  warp) / **Teleport to you** (shows "!" briefly → warp) / **Follow mode** (DEFAULT):
  shows a bobbing yellow "!" over the bot (`player._stuckMark`, drawn in player.js like
  the mob sprint telegraph), waits for the player to come within `BOT_MIRROR_RANGE`,
  then MIRRORS the player's live inputs (`_mirrorAct` copies P1 moveX/jump/crouch) to
  thread the same route; warps as a last resort if it drags on. Stuck is LATCHED so
  the player approaching (to guide it) doesn't read as "un-stuck" before mirroring.
- **Wall-jump-aware pathing.** `navNeighbors` gains a bot-gated `wallClimb` param: from
  a wall-adjacent cell it can reach standable cells up to N blocks up along the wall —
  only UPWARD, wall-backed edges (never an open-gap crossing, so no false plans). Fed
  by `_jumpEnvelope` when `wallSlideEnabled`. Mobs + the sample-world generator pass 0
  → unaffected (verified: 9/9 sample worlds still pass). Honest limit: the actuator's
  wall-jump EXECUTION is best-effort (works best in chimneys); if it can't, the
  escape + teleport/stuck safety nets catch it.
- Tests: test-pathfinding +2 (wall-climb reachability), test-bot-ai +7 (vertical-
  distance teleport, none/teleport/follow behaviors, mirror engage, level-safe warp).
  Suite 503. Browser-UNTESTED.
- **STILL FLAGGED for next:** wall-jump actuator reliability (chimney execution); and
  Kevin's note — possibly drop the "Teleport" option from the stuck-behavior list once
  fast response + range prove enough.

## CONVENTION — gender-neutral wording (build 130, 2026-07-14)
Kevin's request: keep all player-facing wording gender-neutral to avoid injecting
gender bias. Players choose any sprite for themselves and the co-op companion (Kevin
plays Steve, uses the Alex/female sprite for the bot and calls it "she" personally —
a player's choice, not the game's voice). **Rule:** in tooltips, notifications, HUD,
menus, and the future Player's Guide, use "you" / "the player" / "the companion" /
"the bot" / "it" / "they" — NEVER he/she/his/her. ("Steve"/"Alex" are sprite NAMES,
fine as labels — the rule targets pronouns/gendered terms.) Audit done at this point:
no gendered pronouns in any current player-facing string (existing companion copy uses
"it"/"you"/"the companion"). Mirrored in CONTEXT_SUMMARY (top) + FUTURE_ROADMAP §1.

## Double Jump Style — animation option (build 131)
Kevin: keep weapons visible during the air-jump flip + a more natural body shape
(hip bend); make it an advanced setting with three looks.
- **World Setting `doubleJumpStyle`** (Movement → Moves, advanced, shown under Double
  Jump): **No Spin** ('nospin') / **Simple Spin** ('simple', DEFAULT = current) /
  **Natural Spin** ('natural'). Applied to the player via `_applyMovementConfig`
  (`p._doubleJumpStyle`).
- **player.js draw:** 'nospin' → `rolling` is skipped, so the air-jump renders like a
  normal jump (weapon shown via the existing `!special` path, no rotation). 'simple' →
  unchanged (tucked 360, weapon hidden). 'natural' → 360 spin BUT (a) a gentler tuck
  (×0.4) + a `hipBend` (new `_drawStanding` param rotating the legs at the hip through
  the arc) for a natural shape, and (b) the weapon is drawn INSIDE the roll transform
  (`flipX=false`, since the ctx is already flipped) so it spins in-hand with the body.
- Browser-UNTESTED (canvas animation). Suite 503.

## Natural Spin polish — visible hip bend (build 132)
Kevin: Natural Spin's bend was barely visible. Root cause: it peaked at only ~0.5 rad
(28°) for a couple frames mid-arc, lost under the 360° rotation. Fix: hold the bend
across the WHOLE spin — `hipBend = rollDir * (0.75 + 0.4·sin(rprog·π))` (≈43°→66°,
always bent), both legs pike (left ×1.0, right ×0.85), + slightly more leg lift
(natural tuck 0.4→0.5). Reads as a bent-body silhouette through the flip. Browser-
UNTESTED (canvas). Suite 503.

## Maze-ready bot pathing (build 133)
Prep for Kevin's maze test — the two fixes agreed + a maze heuristic.
- **Bigger A* budget (bot-only):** `BOT_PATH_MAX_RADIUS` 48→64, `BOT_PATH_MAX_EXPANSIONS`
  6000→12000, and the companion radius floor raised (`max(30, detectRange+12)`). Mazes
  fan the search out (path length >> straight-line), so more room = it finds long
  corridor routes instead of giving up. Mobs keep their own smaller budget; the
  sample-world generator (BFS) is unaffected (9/9 still pass).
- **Maze-focusing heuristic (opt-in `opts.vBias`, bots pass 0.4):** the base heuristic
  is horizontal-only (admissible) which floods a maze; a small vertical pull focuses
  the search so it reaches farther within the budget (mildly non-optimal — fine for
  following/objectives). Default 0 → mobs/tests/generator unchanged.
- **Stuck-fallback warp even with Teleport ON:** teleport fires on STRAIGHT-LINE
  distance, but a maze corridor can be far longer — so a bot could be straight-line-
  close yet unreachable and just sit. Now, with Teleport ON, a long genuine stall
  (`> BOT_COMPANION_WARP_STUCK×3`, ~2.25s, still beyond FOLLOW_FAR) also warps — closes
  the "trapped near a wall" gap without firing during normal nav.
- **Design note for Kevin (recorded):** what he described (explore → dead-end →
  backtrack to the last split → try the other branch) is exactly what A* does, computed
  before moving rather than physical trial-and-error. "Simplifying barriers" isn't
  needed — A* handles arbitrary/concave shapes as grid cells; bounding-box simplifying
  would LOSE valid routes. "Smarter = longer path" == bigger search radius/budget (tied
  to difficulty). Trapping came from budget + the teleport gap, both addressed here.
- Tests: test-pathfinding +3 (vBias solves a vertical climb; default still works),
  test-bot-ai +2 (teleport-ON no early warp, but stuck-fallback warps after a stall).
  Suite 508. Browser-UNTESTED.

## Bot pathing — partial "get close" routes + debug overlay (build 134)
Kevin: companion "just hops" directly below the player and can't route around a
platform ("doesn't seem to be mapping"). Two fixes + observability:
- **Partial path (`opts.partial`, bots pass true):** `findMobPath` now tracks the
  reachable cell with the best heuristic; if the exact goal is unreachable within
  budget, it returns a route to that closest cell (flagged `partial:true`) instead of
  null. So the bot navigates AROUND an obstacle TOWARD the player even when it can't
  reach the player's exact cell — vs. giving up / hopping in place. Requires real
  progress (best h < start h) else still null. Default off → mobs/tests unchanged.
- **Debug overlay (`showBotPaths` World Setting, Display, advanced):** `_drawBotDebug`
  draws each bot's planned A* route (green dots+line), its goal cell (magenta ring),
  and a red ✕ over the bot when it has NO path. Turns "it's not mapping" into
  something we can watch — Kevin can see whether the planner finds a route, and where.
- Likely root cause of the report (to confirm with the overlay): the exact-goal route
  onto the player's platform exceeded the envelope/budget, so it returned null and the
  actuator hopped. Partial path should make it route around/toward now; the overlay
  will show if the plan is right but the ACTUATOR fails to execute a specific climb
  (the next thing to fix if so).
- Tests: test-pathfinding +3 (partial returns a toward-goal route on an unreachable
  island; null by default). Suite 511. Browser-UNTESTED.

## Bot maze debug — nav-solidity overlay + co-op-menu note (build 135)
Kevin's maze test: the debug path drew a straight line THROUGH the "grass" maze walls,
and adding a block didn't change it — "sees all blocks as non-solid for movement but
knows where to stand." Diagnosis: the maze walls are almost certainly a NON-SOLID
Decor block (Bush / Leaves / Oak Leaves / "Solid Leaves" — the last is `solid:false`
despite the name), so both the player and the pathfinder pass through them. The ground
IS solid (hence "knows where to stand").
- **Debug upgrade (`_drawBotDebug`):** "Show Bot Paths" now also **outlines every cell
  the pathfinder considers SOLID** (orange) in a window around the bot, and **colors
  jump/climb path segments yellow** vs. walk segments green. So Kevin can SEE whether
  the maze walls register as solid (they won't, if they're Decor foliage) and tell a
  legit hop-over from a route-through.
- **Fix is content, not code:** build maze walls from a real solid block (Grass id 1 /
  Dirt / Stone / Planks / Logs), not the Decor foliage. Flagged the "Solid Leaves"
  naming footgun (looks opaque, is non-solid).
- **Removing the companion from Platformer for now:** it's opt-in — World Settings →
  Players → Companion Bot → **Off**. (Kevin: co-op/companion selection should
  eventually live in the Platformer START menu + the continue-game screen, NOT World
  Settings — recorded as a TODO in FUTURE_ROADMAP.)
- Suite 511. Browser-UNTESTED.

## MAZE BUG — jumps passed through solid walls (build 136) — real root-cause fix
Kevin's maze test: the planned path ran straight THROUGH solid dirt/grass walls (the
same block it stood on it also passed through), and adding a block didn't reroute it —
"the path is being calculated incorrectly." Confirmed by a repro: two rooms separated
by a floor-to-ceiling wall returned path `[[1,2],[2,2],[8,2]]` — A* jumped from col2 to
col8 straight through the col5 wall into a sealed room.
- **ROOT CAUSE (`navNeighbors` jump model):** the jump envelope only checked that the
  DESTINATION cell was standable + within arc budget — it never checked the cells
  BETWEEN takeoff and landing. So a horizontal/diagonal jump could pass straight through
  a wall as long as the far side was valid. Invisible in open terrain; fatal in a maze
  (walls between corridors) — the planner "solved" mazes by jumping through the walls.
- **FIX (`navJumpClear`):** a multi-cell jump is now rejected unless every intermediate
  column has a 2-tall passable gap within the arc's vertical reach (min-row − jUp .. lower
  endpoint). A floor-to-ceiling wall → no gap → jump rejected (route around / through an
  opening); a SHORT wall open above → gap exists → hop still allowed (not over-strict).
  Applied to all jumps with |dc|>1 or |dr|>1; walk/drop/wall-climb neighbours unaffected.
  This is in the SHARED pathfinder, so **mobs get the fix too** (they no longer path
  through walls either).
- **Impact check:** all headless tests pass (suite 514; test-pathfinding +3 maze cases —
  sealed wall → null, open control → route, short wall → still hoppable). 8/9 sample
  worlds still validate. The 9th ("Switch & Sever" redstone puzzle) now flags its
  gated chambers as statically-unreachable — it had been a FALSE PASS (the validator was
  jumping through the chamber walls via this very bug). Also made the generator's
  reachability treat TRAPDOOR/PISTON as passable (redstone-openable doors), but that one
  puzzle world's authored geometry still relies on more than the door — a known
  redstone-validator limitation, not a gameplay problem (the world plays fine; you open
  the doors). Content-only; doesn't affect the test suite or real play.

## MAZE BUG pt.2 — vertical jumps through platforms (build 137)
Kevin (with the debug overlay): the orange overlay confirmed the platform IS solid,
but a YELLOW (jump) line ran straight UP through it to the player directly above —
even when adjacent. Build 136 only checked HORIZONTAL clearance (intermediate
columns); a VERTICAL jump (dc=0) has no columns, so it skipped the check and jumped
straight up through a platform (when there's air between the bot and the platform, so
the headroom check doesn't fire).
- **FIX:** `navJumpClear` now does an EXISTENCE-OF-ARC check — it sweeps a tent arc
  (peaking at `hiRow − arch`) for arch = 0..jUp and accepts the jump iff SOME arc keeps
  the 2-tall body clear of terrain. Low arcs (arch 0) clear ceilings / cross flat gaps;
  high arcs clear tall walls. A platform directly overhead or a floor-to-ceiling wall
  has NO clear arc → rejected → route around (verified: bot now steps to the side and
  jumps onto a 1-wide platform edge instead of through it). `arch` starts at 0 so flat
  gap-crossings/hops aren't wrongly lifted out of bounds (that regressed 6 tests mid-fix;
  fixed).
- Handles vertical, horizontal, AND diagonal jumps. Shared pathfinder → mobs too.
- Tests: test-pathfinding maze cases green; **suite 514**. 8/9 sample worlds validate
  (the redstone puzzle's gated chambers still flag — validator limitation, was a
  false-pass before; content-only).
- **DEFERRED nav features Kevin flagged (recorded in FUTURE_ROADMAP §21):**
  (1) pathing through TRAPDOOR / PISTON doors (dynamic openable obstacles — treat as
  passable-when-openable + trigger the lever); (2) crawling through 1-tall gaps (the
  crouch state — a shorter body profile in the nav for reachability).

## Precise-jump execution — air control + jump commitment (build 138)
Kevin: winding path now correct, but the bot gets "tied up" on a tight jumping path
(single-block platform 3-left/2-up, then another 3-left/2-up) — "!" stuck. Diagnosis:
the PLAN is fine (jumps within envelope); it's an EXECUTION problem — a reactive
actuator overshoots single blocks and waffles mid-air. (Confirmed the player has FULL
mid-air horizontal control: `vx = speed * moveX` every frame.)
- **Air-control landing (`_applyMove` airborne branch):** while airborne, steer moveX
  toward the TARGET cell's column (`navFollow` now returns `tx`) and EASE to 0 as we
  near it, so the bot settles onto a small/single-block platform instead of flying past.
  Accuracy scales with `navPrecision` (skill).
- **Jump commitment (`_act`):** only (re)plan the path while ON THE GROUND — a mid-air
  replan could flip direction and miss the landing. The plan is frozen through the jump.
- Ground stuck-detection no longer counts while airborne (apex ≠ "wedged").
- Tests: test-bot-ai +2 (airborne seeks the column when far, eases to 0 when over it);
  suite 516. Browser-UNTESTED.
- **Honest note for Kevin:** pixel-precise single-block platforming is the hardest part
  of platformer AI. This should markedly improve it, but the very tightest chains may
  still occasionally miss — the Follow-mode mirror + teleport safety nets cover those.
  If a specific chain still fails, the next lever is TAKEOFF-speed control (launch
  slower for short hops) — easy to add once we see it.

## Jumping onto high platforms — two-phase air control (build 139)
Kevin: bot stuck UNDER a platform edge (platform 4 up, on flat ground), "bouncing
under the edge, can't move out far enough to jump." Repro confirmed PLANNING is fine —
from under the platform the path is [[5,6],[3,6],[4,1],[5,1]]: walk OUT to the edge
(col3), then jump up onto the platform. So it's the ACTUATOR: build-138's air control
steered toward the target column IMMEDIATELY, so on a tall jump it dove UNDER the
overhang and bonked the underside before gaining height.
- **FIX — two-phase air control (`_applyMove` airborne):** `navFollow` now returns the
  target ROW (`tr`) too. While the landing is ABOVE us (feet row > tr): mostly RISE,
  only a gentle drift (0.2) toward the target — so it goes up BESIDE the edge (clears
  the platform top / lets Ledge-Grab catch the edge) instead of diving under. Once at/
  above the landing row: TRAVERSE onto the column + ease (the build-138 precise land).
- Tests: test-bot-ai air-control test now covers both phases (below-ledge → gentle
  rise; at-row → traverse; over-column → ease to 0). Suite 517. Browser-UNTESTED.
- **Honest note:** if the tightest high-ledge jumps STILL bonce under the edge, the next
  levers are (a) pure-vertical rise (drift 0.2→0) so it rises dead-straight beside the
  edge and relies on edge-grab/apex-traverse, and (b) softer takeoff horizontal for
  steep (rise≥4) jumps so it launches more vertically. Easy follow-ups once observed.

## Bot climbing — hang-climb, staircase preference, apex double-jump (build 140)
Kevin: bot got STUCK HANGING from a ledge with a "!" (path frozen), air-jumping at the
BOTTOM of the arc, and the planner chose a 6-block climb over 3 small steps. Also asked
for wayfinding best practices.
- **Ledge-hang climb (the frozen-"!" bug):** ledge-GRAB fires by HOLDING jump, but
  climbing UP needs a fresh jump EDGE — so a held jump hangs forever (no new edge) and,
  since we don't replan while airborne, the path freezes too. Fix: while `p._hangState
  === 'hang'`, the bot PULSES jump (release↔press) to make the climb edge; it climbs up,
  lands, and replans. (`tick()`, before the brain.)
- **Staircase preference (Kevin's request):** `_navEdgeCost` now penalises a big single
  climb SUPER-linearly (`NAV_BIGJUMP_PENALTY` per block above NAV_MAX_JUMP_UP). A 6-block
  climb costs ~13 vs ~9.6 for three 2-block steps → A* prefers the steps when the terrain
  offers them. Only affects tall-envelope BOTS (mobs' envelope is 3, never rise>3), and
  A* selection only (navReachable/BFS + generator unaffected).
- **Apex double-jump:** `_jumpControl` now releases-to-arm the air-jump at `vy > -2.5`
  (nearly the apex) instead of -4, so the 2nd jump fires at the TOP for max height
  (was firing low).
- Tests: test-bot-ai +2 (hang → jump pulses, never crouches); cost arithmetic verified
  (stairs 9.6 < big 13.1). Suite 519. Browser-UNTESTED.

## Bot wayfinding — best practices (Kevin asked; recorded for reference)
1. **Plan then execute** (don't physically trial-and-error): A* computes the full route
   over a tile grid; the actuator follows it. Backtracking at dead-ends is the SEARCH's
   job, done virtually. ✅ have.
2. **Cost model encodes "easy/reliable":** cheap walks/drops, pricier climbs, super-
   linear on risky big jumps → prefers safe staircases. ✅ (build 140).
3. **Plan within what the actuator can EXECUTE:** size the jump envelope to enabled moves
   (double-jump/ledge-hang/wall-slide) AND bias toward the most reliable mechanic (ledge-
   grab for tall ledges). ✅ envelope + hang-climb.
4. **Arc/clearance-correct neighbours:** never plan a jump through terrain (builds 136-137).
5. **Handle special movement STATES explicitly** (hang/wall-slide) in the actuator. 🟡
   hang done; wall-jump execution still best-effort.
6. **Two-phase precise jumps:** rise beside a ledge, then traverse onto it; air-control
   to land on small platforms (builds 138-139).
7. **Never freeze/pace forever:** stuck-escape, re-decide caps, and companion teleport/
   follow safety nets (builds 125-133). 🟡 also: don't freeze the path while airborne
   indefinitely (hang-climb fixes the common case; a hard airborne-timeout replan is a
   possible future safety).
8. **Difficulty = knobs, not different code:** reaction/precision/detrange/aggression.
   ✅ BOT_DIFFICULTY_PRESETS.

## Node-by-node path following (build 141)
Kevin (both scenarios): the bot wasn't LANDING on the first path node before moving to
the next — it flew past node A toward node B (in double-jump range) as if A were a
fly-by waypoint, and missed both. Asked to "mandate it follow the path."
- **Root cause:** the follower (`BOT_AI.navFollow`) used a nearest-cell + look-ahead
  scan, so mid-jump the target advanced from A→B before landing on A.
- **FIX — `_followStep` (replaces navFollow in the controller):** track `_pathIdx` and
  target ONE node; only advance to the next once `_reachedNode` is true, which REQUIRES
  `onGround` (so a jump node counts as reached only after the bot lands on it). Jumps
  are only INITIATED from the ground. `_pathIdx` resets to 1 on every replan. This makes
  the bot complete each jump/step and land on each node — including walking fully OUT to
  a takeoff node before jumping (Kevin's Scenario 2 "not coming out far enough").
- `BOT_AI.navFollow` kept (pure helper, still unit-tested); the controller now uses
  `_followStep`. Air-control + jumpControl + stuck-escape unchanged.
- **On Kevin's telegraph question:** the dots ARE single A*-MOVE targets (each reachable
  from the previous in one move). A double-jump is ONE edge (up to ~6 up), so a dot CAN
  require a double-jump — we can't add a mid-air dot (nothing to stand on there), but
  node-commitment + the two-phase/apex double-jump handles executing that one edge. A*
  now also prefers staircases (build 140), so double-jump edges appear only when needed.
- Tests: test-bot-ai +2 (airborne-over-node does NOT advance; landed → advances).
  Suite 521. Browser-UNTESTED.

## Jump arc — straight-up beside a platform, proportional horizontal (build 142)
Kevin: launching from the block directly LEFT of a platform 3 up, the bot angled
right INTO the platform side as it rose. "It needs to jump straight up (unless
horizontal is needed) — the arc has to hit the edge or clear the top."
- **FIX (`_applyMove`):** compute how horizontally OFFSET the target node is (`dxB`).
  A near-vertical target (|dxB| <= 1.2, rise >= 2) = a "beside-a-platform" climb →
  `verticalJump`: the TAKE-OFF frame launches straight up (moveX 0) and the RISE phase
  stays straight (moveX 0), so it goes up beside the edge (ledge-grab catches it / it
  steps on at the top) instead of clipping the platform side/underside. An OFFSET
  target drifts/launches horizontally PROPORTIONAL to the offset (min .25 → cap .6),
  so longer diagonal jumps still cover ground during the arc. Traverse + ease at the
  landing row unchanged.
- Tests: test-bot-ai +3 (vertical takeoff straight up; rise straight; offset takeoff
  carries horizontal); updated the two-phase test for the new proportional drift.
  Suite 524. Browser-UNTESTED.

## Double-jump + ledge-grab actually fire; Climb Speed setting (build 143)
Kevin: bots weren't double-jumping OR grabbing/climbing edges (double-jump preferred —
faster). Also asked for a configurable climb-animation speed.
- **ROOT CAUSE:** build-141's node-by-node `_followStep` only set `jump=true` while
  ON THE GROUND. So the instant the bot left the ground, jump input released →
  `_jumpControl` never got wantJump=true airborne (double-jump never fired), AND the
  held-jump ledge-grab (player needs jump held near the apex) never triggered either.
  One flag broke both.
- **FIX:** `_followStep` keeps `jump=true` while AIRBORNE and still below a higher node
  (rise ≥ 1). `_jumpControl` reworked: hold jump the whole rise (`vy < -1`) for full
  height + to keep it held through the apex (ledge-grab); the double-jump arms near the
  apex (`vy > -2.5`) and re-presses. So single-jump, double-jump, AND ledge-grab all
  work now.
- **Cost tuning:** lowered `NAV_BIGJUMP_PENALTY` 2.5 → 0.8 so A* PREFERS a fast
  double-jump for moderate 4-5 heights (4-up: 4.2 < two steps 4.4), while extreme 6+
  climbs stay borderline vs a staircase. Matches Kevin's "double-jump is faster."
- **NEW — Climb Speed setting** (World Settings → Movement → Moves, advanced, under
  Ledge Hang): `climbSpeed` multiplier (0.5–3×, default 1) scales the ledge climb-up
  (75f) + climb-down (45f) animation. `p._climbSpeed` via `_applyMovementConfig`.
- Tests: test-bot-ai +2 (airborne keeps jump-intent toward a higher node; double-jump
  edge sequence verified). Suite 526. Browser-UNTESTED.

## Double-jump timing — fire at the apex, not late (build 144)
Kevin: "the bot is still air-jumping too late — it needs to air-jump at the top of the
arc." Root cause: `_jumpControl` decided `wantDouble` from the LIVE remaining rise
(`step.rise`, recomputed each frame). As the bot climbs, the remaining rise shrinks
below the single-jump height → wantDouble flips OFF mid-ascent (no arming during the
rise); then near/after the apex the bot falls, remaining rise GROWS again → wantDouble
flips back ON and it finally arms + fires the air-jump WHILE FALLING (too late).
- **FIX:** lock the jump's TOTAL height at take-off (`this._jumpRise = riseNeeded` on the
  ground frame) and use that for the wantDouble decision throughout the jump — stable, so
  the air-jump arms during the ascent and fires at the peak. Also tightened the apex
  threshold (`vy > -1.5`, was -2.5) so it releases-to-arm right at the top for max height.
- Tests: test-bot-ai +2 (holds below apex incl. vy -3; fires at vy -1; shrunk live rise
  still double-jumps via the locked total). Suite 528. Browser-UNTESTED.

## Down-path fix — drop-through-platform (build 145)
Kevin: with the player BELOW the bot, tracking broke back to a straight line through
blocks. Repro: bot on a platform, player directly below → path was [[3,1],[3,5]] (straight
DOWN through the platform at (3,2)).
- **ROOT CAUSE:** `navJumpClear`'s arc sweep skipped endpoint bodies with `x===nc &&
  y<=nr`. On a VERTICAL move the takeoff and landing share a column (c===nc), so
  `y<=nr` skipped the ENTIRE column → the platform between was never checked → the
  straight-down "jump" was accepted. (The build-137 fix handled horizontal/diagonal but
  this range-skip was too broad for pure-vertical.)
- **FIX:** skip only the actual endpoint BODY cells — `(y===r||y===r-1)` at the takeoff
  column and `(y===nr||y===nr-1)` at the landing column — so intermediate cells (incl.
  a platform straight below/above) are always checked. Now the down path routes AROUND
  ([[3,1],[2,1],[1,5],[3,5]] — walk to the edge, drop off, to the player). Up/ledge/
  gap/maze cases all still pass.
- Tests: test-pathfinding +3 (down routes around, not straight through). Suite 531.
  Browser-UNTESTED. Sample worlds: still only the redstone puzzle flags (unchanged).

## Two-level climb execution — consecutive double-jumps (build 146)
Kevin: on a maze's final two-level climb the bot double-jumps to an interim platform
but then only SINGLE-jumps on the next one and can't reach it. Diagnosed by building a
frame-by-frame physics sim (real Player + real bot actuator; test/test-bot-climb.js) —
this exposed a *chain* of actuator/planner bugs the earlier decision-only tests couldn't:
- **Take-off position:** the `nearCol` gate delayed an up-and-across jump until the bot
  had walked horizontally near the TARGET column — by which point it had walked in under
  the target platform (head-blocked) or off its own platform edge. Node-by-node already
  guarantees we're standing on the jump's take-off node, so now it LAUNCHES immediately
  and arcs across.
- **Mid-flight head-room re-check:** `canRise = !solid(cc,cr-2)` was evaluated every
  frame; while rising toward a platform, the cell 2 above is the TARGET's underside →
  read as "overhang → stop jumping", so the button released and the mid-air double-jump
  armed far too LATE (past the apex, after falling back). Head-room is now a TAKE-OFF
  gate only (ground); airborne the arc is committed.
- **Head-blocked on the ground:** if the take-off column has a canopy/upper-platform
  directly overhead, back up to the previous path node (A* chose it *because* it has
  clear head-room) and launch there — instead of vibrating under the overhang.
- **Air control too slow:** the below-landing drift was capped at 0.6, so a long diagonal
  jump landed ~4 columns short. The player has no horizontal inertia, so overshoot is
  free — now full speed until lined up over the column.
- **Envelope too generous:** maxUp 6 / (ledge-hang) let A* emit 6-up single leaps and
  skip interim platforms; the bot then head-bonked the upper ledge. Capped at a RELIABLE
  double-jump (single 3 + air-jump 2 = **5 up**, **9 dx**); ledge-hang is an execution
  aid, not a planning extension. A* now routes via interim platforms (staircase of
  double-jumps) — which is what Kevin expected.
- **"Arrived" mid-jump:** the companion follow-band (straight-line distance) is satisfied
  as the arc grazes a leader perched at the top of a climb — both the brain (→ idle) and
  the actuator (→ stop) then dropped the path and the bot fell back down. Neither settles
  while AIRBORNE now; it finishes onto the ledge first.
- Also bumped the planner's arc gate: the "horizontal reach shrinks with height" budget
  subtracted the FULL climb; a double-jump is a second impulse (adds airtime), so the
  shrink is capped at a single jump's height (NAV_MAX_JUMP_UP) — a legit 4-up/6-across
  double-jump was being wrongly rejected, yielding a partial (floor) route.
- Tests: NEW test/test-bot-climb.js (4 real-physics climb scenarios) + updated envelope
  assertions in test-bot-ai. Suite 536, all green. Browser-UNTESTED.
- STILL OPEN (Kevin's same message): the yellow "!" appears too fast + should try a few
  different approaches before giving up + a visual cue for follow/mirror mode — deferred
  to its own build (the climb fix removes most stuck cases; "!" timing is best tuned after
  Kevin re-tests). Recorded in FUTURE_ROADMAP.

## Mob pathfinding PERFORMANCE — bounded "smart" nav (build 147)
Kevin: the maze climb (146) runs clean, but a regular platformer level with 8-10 mobs
became "super slow, impossible to play." He suspected many entities sharing the route
planner and suggested "simple nav for most mobs, smart nav for a few." Correct diagnosis.
- **Root cause:** `platformer-defaults.js` sets `pathAwareMobs: true` (it's `false`
  everywhere else), so EVERY mob runs the A* route planner. Benchmarked findMobPath at
  the mob envelope on a representative level: **~5 ms per call (reachable goal), up to
  ~25 ms (far / in-range-but-unreachable — a whole frame in ONE call)**. 8-10 mobs ×
  that = 50-250 ms/frame. (A precomputed flat solidity grid barely helped — the cost is
  the algorithm: navNeighbors does arc-sweep jump-clearance per node.)
- **Fix — bounded pathfinding (the "few smart mobs" design):**
  1. **Path budget:** each frame only the NEAREST `MOB_PATH_BUDGET` (=4) in-range chasers
     are "smart" (get a path config); everyone else uses the cheap legacy beeline+hop
     (`_selectPathfinders` → a Set; non-members get `_pathCfg = null`).
  2. **Per-frame A* cap:** a shared token (`MOB_PATH_RECOMPUTES_PER_FRAME` = 2) caps how
     many findMobPath runs happen per FRAME across ALL mobs. When spent, a mob follows its
     cached route or beelines — crucially INCLUDING mobs whose last search failed (null
     path, unreachable player), which otherwise re-ran the full doomed search every frame.
     Token lives on each mob (`mob._recomputeBudget`, one shared object), NOT the cfg —
     mutating the shared cfg leaked a stale token across the test suite.
  3. `PATH_MAX_EXPANSIONS` 5000 → 2500 (a 24-radius route fits well under it; caps the
     worst single call ~10 ms).
  4. `PATH_CROWD_THRESHOLD` → 4 (= budget): the nearest few run at FULL config (snappy);
     the per-frame cap, not crowd-degrade, is the framerate guard.
- **Measured (real MobManager + 10 real Zombies, 180 frames):** reachable goals → avg
  0.55 A* calls/frame, MAX 1, ~0.6 ms worst frame. In-range-unreachable → MAX 2/frame
  (= the cap), ~1.3 ms. Was effectively unbounded (50 ms+) before.
- Distant mobs beelining is fine in a platformer (off-screen / not the threat); the
  nearest 4 navigate smartly, and the set re-picks as the player moves.
- Tests: +2 groups in test-wayfinding (budget selects nearest ≤4; per-frame cap ≤2 with
  10 mobs) + updated the crowd-throttle constants mock. Suite 542, all green. Browser-UNTESTED.
- Levers (constants.js): MOB_PATH_BUDGET, MOB_PATH_RECOMPUTES_PER_FRAME, PATH_MAX_EXPANSIONS.

## Mob performance pt.2 — the FLEE path was the real killer (build 148)
Kevin: build 147 didn't fix it — still "exceptionally slow, kicked AFTER the computer
engaged the mobs." He suspected detection/speed/flee checks. Profiled each:
- **Detection** early-returns once a mob is `_alerted`, so its line-of-sight raycasts
  STOP after engagement — not the post-engagement cost. Sprint/physics are trivial.
- **FLEE was the culprit.** `_fleePathStep` calls A* — but (1) it BYPASSED the build-147
  per-frame cap entirely, and (2) it runs findMobPath UP TO 3× per recompute (it retries
  progressively shorter retreat distances), and (3) on a FAILED search (cornered mob,
  unreachable retreat) `_fleePath` stayed null → stale every frame → it re-ran all 3
  searches EVERY frame. `platformer-defaults` sets `lowHpAction: 'flee'`, so as soon as
  combat hurt the mobs they ALL fled → measured **12 A* calls/frame, every frame** (4
  budgeted mobs × 3 retries), each up to ~25 ms when the retreat is unreachable → the
  freeze. (Build 147 only capped the CHASE path.)
- **Fix:** flee now (a) shares the same per-frame recompute token as chase (each of the
  ≤3 retries consumes one; stops when the frame budget is spent), and (b) throttles on
  the recompute cadence even after a FAILED search (a cornered mob retries once per
  `recompute` frames, beelining away in between) instead of hammering A* every frame.
- **Measured (10 hurt/fleeing mobs, real MobManager):** 12 A*/frame → avg 0.69, MAX 2
  (= the cap). FULL update() incl. detection/sprint/flee/physics = **0.66 ms/frame** for
  10 mobs (was effectively unbounded — hundreds of ms with unreachable retreats).
- Tests: +flee-cap regression in test-wayfinding (10 fleeing mobs → ≤2 A*/frame). Suite
  543, all green. Browser-UNTESTED.

## Perf profiler — locate the real slowdown (build 149)
Kevin: builds 147 AND 148 didn't fix it — platformer still "still slow" when mobs engage.
Since the mob AI is provably cheap headless (full mobManager.update = ~0.66 ms/frame for
10 mobs, incl. detection/sprint/flee/physics), the bottleneck is NOT the mob AI. I'd been
benching only `mobManager.update()` — not the full game loop (render, bot AI, redstone,
draw). Rather than guess a third time, this build INSTRUMENTS the real frame:
- `_loop` times `_update` vs `_render`; subsystem calls stamp `this._prof` (mobs / bot /
  redstone / mobDraw). A rolling frame-time avg is kept.
- Slow frames (>24 ms) `console.warn` a one-line breakdown (throttled).
- An on-screen HUD auto-appears when the rolling avg > 18 ms (or `window._perfHud=true`),
  showing FPS + update/render + mobs/bot/redstone/mobDraw + mob/arrow counts.
- Zero behaviour change; near-zero cost when frames are fast.
- Ruled OUT along the way: the monkey-patched `level.isSolid` (calls `isPistonHeadAt`,
  which iterates all redstone components, on every call) — benchmarked at only +10-30% on
  A*, not the culprit. Detection stops once a mob is alerted (early-return), so it's not
  the post-engagement cost either.
- STRONGEST untested hypothesis: the COMPANION BOT. Its A* envelope is far larger than a
  mob's (maxExpansions 12000, radius 64 vs 2500/24) and it is NOT subject to the mob
  per-frame cap; if a companion is fighting 8-10 mobs it may replan every few frames at
  ~25-100 ms each. The HUD's `bot` bucket will confirm or clear this.
- Next: Kevin reproduces, reads the HUD, reports which bucket dominates → targeted fix.
- Suite 543 green (game.js syntax-checked; profiler is browser-only).

## THE mob-perf fix — O(1) piston-head lookup (build 151)
The build-149/150 perf HUD (on Kevin's machine) showed `update` = `mobs` = **1000-2000 ms/
frame**, and the pt.2 split showed **A\* itself was >1000 ms** with the per-frame cap
holding at ≤2 calls — i.e. a SINGLE A\* call cost ~500-1000 ms. Headless the same call is
~5 ms. The only O(large) work in the pathfinding hot path:
- The game monkey-patches `level.isSolid` (trapdoors/pistons/portals). For the common case
  (any normal block) it calls `redstone.isPistonHeadAt(col,row)`, which **looped over EVERY
  component in the level** (wires, torches, plates… not just pistons). A\* calls `isSolid`
  ~hundreds of thousands of times per route (2500 expansions × ~100 neighbour candidates ×
  ~3 solidity checks), so on a component-heavy/large level that's isSolid-calls × components
  = **billions of ops per A\* call**. Nothing to do with the mob AI logic (which is ~0.66 ms)
  — builds 147/148 fixed the wrong thing.
- **Fix:** `isPistonHeadAt` is now an O(1) lookup into a `_pistonHeads` Set (numeric cell
  keys) rebuilt once per frame in `updatePistonAnimations` (+ on sandbox add/remove). A\*
  cost is component-count-independent again — bench: 2000 components went 27 ms → 6 ms/call
  (≈ the zero-component baseline); the Set-based isSolid is flat regardless of component count.
- Kept the perf HUD/profiler (builds 149-150) so Kevin can SEE the fix (`A* Ncall Xms`
  should drop to a few ms).
- Tests: NEW test/test-redstone.js (8 assertions — head cell solid, body/non-piston/empty
  not, retract/extend + add/remove refresh the cache). Suite 550, all green. Browser-UNTESTED
  but the mechanism is benched.

## THE mob-perf fix — pathfinding bypasses the monkey-patched isSolid (build 152)
Build 151 (O(1) piston cache) did NOT fix Kevin's slowdown — the HUD still showed
`mobs` ≈ `A*` ≈ `aiLoop` = **1000-2000 ms/frame**. Benched every angle:
- A single A* call on a large open level with CHEAP solidity = ~6-14 ms (fine).
- The game monkey-patches `level.isSolid` (trapdoor/piston/portal). Even post-151 (O(1)
  piston) the patch adds constant per-call overhead; A* calls `solid()` ~hundreds of
  thousands of times per route, so that overhead × volume dominates — and if the browser
  had a PRE-151 cached build, the O(components) `isPistonHeadAt` made it ~80 ms/call at
  3000 components (→ 100s of ms on bigger/heavier levels). Either way the per-call
  solidity cost was the bottleneck, not the mob AI (which is ~0.66 ms).
- **THE fix:** the pathfinding nav (`Mob._navFor` AND `BOT_AI.buildNav`) now reads BASE
  block solidity directly — `const d = BLOCK_DATA[level.get(r,c)]; return d ? d.solid : true`
  — instead of `level.isSolid`. That's a plain table lookup, component- AND patch- AND
  cache-independent, so A* is ~6-14 ms/call on ANY level. Mob/bot PHYSICS still uses the
  real `level.isSolid`, so they never clip a trapdoor/piston — this only trades a little
  routing nicety around dynamic blocks for a guaranteed bound (A* ≤ ~28 ms/frame at the
  2-recompute cap, vs 1000-2000 ms).
- This makes build 151's isSolid work moot for pathfinding, but 151 still helps every
  OTHER isSolid caller (player physics, etc.), so it stays.
- **Debug tab** (Kevin asked to keep all the dev tools): NEW "Debug" tab in World Settings
  with Performance HUD (the 149/150 profiler overlay), Show Bot/Mob Paths, and Show Nav
  Grid (the orange solid-cell overlay — split out from showBotPaths). May be hidden later.
- Tests: exposed BLOCK_DATA in the nav-using test sandboxes; fixed the path-stale test to
  mutate `get` (nav's new solidity source); +test-redstone from 151. Suite 550, all green.

## World-select: new-game spawn + Continue/Start button (build 155)
Kevin: (1) launching a platformer world from the world-select screen spawned the player
wherever they were in the Sandbox editor, not the designed spawn point (Sandbox "Test"
was correct); (2) the slot button always said "Continue" even for a never-played game.
- **Root cause (server-verified):** `POST /api/games/create` sets `game_data = world_data`
  — a FULL copy of the source world, which includes the editor's `playerProgress` (god-mode
  loadout + editor POSITION). `game-play.js` then ran `GAME_STATE.deserialize` unconditionally,
  restoring that editor position ON TOP of the world's spawn point. (Sandbox "Test" doesn't
  deserialize, so it kept the spawn point → the discrepancy.)
- **Signal:** a game row has `last_played_at = null` on create (only the first save sets it),
  so `!last_played_at` = "never played / new".
- **Fixes:**
  - `game-state.js deserialize(game, data, {newGame})` — on a new game, skip playerProgress
    entirely: the world load already placed the player at its spawn point and
    `_applyStartingWeapons` supplies the DESIGNED loadout (not the editor's god inventory).
  - `game-play.js` — `isNew = !record.last_played_at`; pass `options.newGame` + deserialize opts.
  - `game-selection.js` — button text = `last_played_at ? 'Continue' : 'Start Game'`.
  - `server/games-routes.js` — Restart now also clears `last_played_at` (a restarted game is
    fresh: spawn point + "Start Game"). **Needs a server redeploy to take effect.**
- Suite 554, all green. Browser/DB-UNTESTED.

## World-select new-game fixes pt.2 — robust "never played" signal (build 156)
Build 155 keyed "new game" on `last_played_at === null`, but the games table's column
apparently DEFAULTs to now() on insert, so a fresh game already had a timestamp → every
game read as "played": the slot button stayed "Continue" and P1's editor position was
restored (the companion is placed separately, so it looked correct — Kevin's exact report).
- **Client fix (works WITHOUT a redeploy):** a game is "new" when its `game_data` has no
  `playerProgress` OR `last_played_at ≈ created_at` (bumped only by a real save; a <3 s gap
  = never saved). Used by both the Start/Continue button (game-selection `_isNewGame`) and
  game-play's `isNew` (→ skips restoring the editor position, so P1 spawns at the designed
  spawn point via `_loadPlatformerWorld`).
- **Server fix (needs redeploy for full effect):** `create` and `restart` now store
  `freshGameData(world_data)` — the world data with the editor's `playerProgress` STRIPPED
  — so a new/restarted game can't inherit the editor position/loadout, and its absence is a
  clean "never played" marker. Reverted the build-155 `last_played_at:null` on restart (that
  column may be NOT NULL → would have errored).
- Suite 554, all green. Browser/DB-UNTESTED (verified against server code).
