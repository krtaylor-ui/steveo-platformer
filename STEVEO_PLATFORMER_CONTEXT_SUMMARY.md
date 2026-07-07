# Steveo Platformer — Context Summary

**Updated:** 2026-07-07. See the **CURRENT STATE** section immediately below for
the latest; the Phase-3 sections further down are the historical record.
`DECISIONS_LOG.md` = every decision; `FUTURE_ROADMAP.md` = planned work (User
Guide, **Campaign mode** §10, Tower Defense/bots, world cleanup, itch/Tauri).

## CURRENT STATE (2026-07-07) — build 67 (on branch, pending browser test)

**Where things are:** `main` and `origin/main` are at **build 66** (`5353a14`).
**Build 67 is committed on branch `platformer-campaign-prep` only** —
headless-verified (**182/182**) but **browser-UNTESTED and NOT merged**. Merge to
`main` waits on Kevin's in-browser confirmation. There are **no live users yet**.
Version bumps this build: `GAME_VERSION` = `v3 · build 67`; cache-buster `?v=b67`;
SW `CACHE_VERSION = steveo-shell-v67` (bump ALL THREE every commit).

**Build 67 — platformer campaign-prep (groundwork for FUTURE_ROADMAP §10 Campaign
mode).** Opt-in additions to Platformer levels; no new physics mode.
- **Multiple Goal Stars.** Any goal the player touches ends the level (was a single
  tracked `level.goalCol/goalRow`). Win scans a cached `_getGoalCells()` list;
  the colour index of the goal hit is recorded on `game._wonExitColor` — the hook
  the future Campaign layer will route branch/secret/skip exits on.
- **Goal-Star colours.** 10-colour palette (`GOAL_COLORS` in constants.js; index
  0 = classic gold). In the editor, **re-placing on an existing goal cycles its
  colour**; colours live in `game._goalColorMap` ("r,c"→idx), serialize as
  `world_data.goalStars [{row,col,color}]` (via `GAME_STATE._goalStars`), restore
  in both `_loadPlatformerWorld` + `_loadSandboxWorld`, and render as a colour
  wash + ring overlay (`_drawGoalColorOverlays`, play + sandbox).
- **Emeralds in platformer.** `EMERALD_SYSTEM.init` now also reads
  `game._levelEmeralds` (set on platformer load), so placed emeralds are
  collectible + counted when the **Collect Emeralds** World Setting is on.
- **Score.** Opt-in **Score / Points** setting; `game._score` from emeralds
  (Points/Emerald, dflt 100) + a Level-Clear Bonus (dflt 1000). Top-centre HUD
  pill (`_drawPlatformerScoreHud`) shows `★ score` and/or `💎 n/total`.
- **World Settings.** New **Scoring** group (modes platformer + sandbox):
  `platformerEmeralds`, `platformerScore` toggles + advanced `emeraldPoints`,
  `goalClearPoints`. All default off → classic behaviour unchanged.
- **Known follow-up:** colour authoring is re-click-to-cycle (lean first pass); a
  click-to-open goal popup (like the emerald/spawn-point popups) is the natural
  upgrade to bundle with the Campaign Builder. Undo/redo doesn't snapshot
  `_goalColorMap` (stale entries are harmless — only real GOAL cells are read).

**The Campaign vision (decided this session — see FUTURE_ROADMAP §10 + DECISIONS
2026-07-07).** Kevin wants a playable sequence of levels (secret/skip exits via
coloured goals). Agreed shape: a lightweight **Campaign container**, NOT a new
physics mode — levels stay Platformer levels; the new layer only sequences them,
routes coloured-goal exits, and tracks progression. Build order Kevin chose:
**(1 = done in 67)** make levels campaign-ready (multi-colour goals, emeralds,
score); **(2, later)** a **Campaign Builder** mode to sequence worlds + assign
bonus levels; **(3, later)** cross-level carry-over of **inventory, points,
emeralds, lives** (health RESETS each level); **(4, later)** a **top-down
walkable overworld map** (low-res; may share tech with Tower Defense as a level
type) — Kevin explicitly prefers this over a side-view level-select; **(5, later)**
a portal-based **World Select** level. Start linear (PoC) but keep the data model
map-ready. Colours: 2 used now, palette sized to 10.

**Bridge — builds 52–66 (all on `main`, browser-tested unless noted):**
- **52** — app icon = player's head (PWA raster icons).
- **53** — rename worlds in Sandbox; exit-test button; SR restart + pause-freezes-timer; import naming.
- **54** — Auto-Climb (walk/run up 1-block ledges; universal, per-world).
- **55** — fix white-on-white text in file-import & Modern modals (`.modal-content` colour).
- **56** — Sandbox playtest: exit via pause menu to Sandbox, no scoring.
- **57** — test-world HUD (Restart + Return to Sandbox) + full-column SR finish line.
- **58** — double-jump air-roll animation.
- **59–63** — movement moves: **wall slide, ledge hang/climb, ground slide** (per-world toggles);
  ledge-grab exposed-outcorner fix (61); articulated waist+hip climb-up "FIX" (62); hard-edged limbs (63).
- **64–66** — **unified HTML World Settings panel** (`js/world-settings-ui.js`, data-driven
  `SETTINGS` list: tab/group/advanced/modes/dependsOn) replacing the canvas panel (canvas kept
  as a Konami bonus, `_useClassicPause`); mob drops/arena types/background/tooltips/retro skin (65);
  **Up-Arrow + J secondary jump** + Konami ending flipped to **B-then-A** (66). Also the
  "First Steps Redux" original homage platformer level (`sample-worlds/First_Steps_Redux.json`).

**Build 51 — per-world background theme (§9 Tier 1):** new `_worldAdvSettings.backgroundTheme`
(`'auto'|'sky'|'cave'|'nether'|'end'`, default `'auto'`) + `Game._skyBiome()`, which returns
the override or falls back to the position-based `Game._playerBiome()`. `_render` draws the
backdrop from `_skyBiome()`; `_playerBiome()` (music/void-death/dragon/portals) is UNCHANGED,
so a forced theme is visual-only and never breaks the Nether/End column regions. A forced
Sky/Cave also pins the `_drawSky` depth blend. UI = a new "BG" tab in the canvas World
Settings modal (`_drawWorldSettings`/`_updateWorldSettings`). Free-rides the existing
`worldAdvSettings` serialize/`Object.assign`-on-load path; backward-compatible (old worlds
default to Auto).

**Builds 44–50 (local-first / offline worlds — FUTURE_ROADMAP §6):**
- **44 — World provenance metadata.** Every saved world carries
  `world_data.provenance = { uid, createdAt, updatedAt, creator, origin, copiedFrom,
  copiedAt }` (`GAME_STATE._provenance`, captured on load into
  `game._loadedProvenance`). Travels inside world_data across export/import/copy and
  local↔cloud — the foundation for the copy model + the world-cleanup widget (§7).
- **45 — Play Online/Offline entry + session mode (Phase 1a).** New `js/app-mode.js`
  (`APP_MODE`: 'online' vs 'local', persisted; `body.offline-mode`). Start screen
  offers **Play Online / Play Offline** (login only via Play Online w/o session).
  Dashboard adapts to mode (online-only buttons hidden offline; ☁ Go Online;
  Guest/`<user> (offline)` identity). Online path byte-for-byte unchanged.
- **46 — Offline Sandbox via local provider (Phase 1b).** New `js/local-worlds.js`
  (`LOCAL_WORLDS`): localStorage world store mirroring the server world shape.
  `sandbox-ui.js` branches on `APP_MODE.isLocal()` for load/create/edit/save/copy/
  delete/changeMode — build + save + reopen custom worlds offline, no login.
  Known rough edge: editor F-key quick-save still uses the legacy `SandboxSaves`
  store while the Save button uses local-worlds (to reconcile).
- **47 — Offline file import/export + bundled starters.** Client-side local import
  (parses .json → `LOCAL_WORLDS.importWorld`) and export (server-shaped .json);
  `LOCAL_WORLDS.seedDefaults()` imports `default-worlds/*` (Normal/Platformer/Speed
  Run) into local storage on first offline Sandbox open (added to SW precache).
- **48–50 — Copy-to-Online/Offline bridge.** Explicit copy between spaces (no
  auto-sync): `_copyToOnline` / `_copyToOffline` re-stamp provenance + preserve
  lineage. Landed as a badged cross-space section (48), then online-only + tile
  layout + duplicate guard (49), then consolidated into **one Copy button per card →
  a name+destination modal**, with per-world actions branching on the world's origin
  (`_isLocalWorld`) rather than the session mode (50). "Published" → green ★ badge.

**Work remaining on §6 (not built):** guest access to the OTHER modes (only Sandbox
has a local provider so far — Normal/Platformer/Arena still guarded offline);
reconciling the editor F-key quick-save with local-worlds; optional login-sync
polish. See FUTURE_ROADMAP §6.

**Migrations still to run in Supabase for full function:** `server/sql/speedrun.sql`
(Speed Run server times). Everything else degrades gracefully without it.

**Ship / push loop (current):** build on a feature branch (build 67 is on
`platformer-campaign-prep`) → `node test/run.js` (**182/182**) → bump the THREE
version markers (`GAME_VERSION` in `js/constants.js`, all `?v=bN` in `index.html`,
SW `CACHE_VERSION` in `sw.js`) → commit → **Kevin browser-tests** → `git checkout
main && git merge --ff-only <branch>` → `git push origin main`. Direct edits on
`main` also work for small changes. `main` == `origin/main` at build 66; **build
67 is NOT yet merged** (awaiting browser test). Recent builds (59–66) used
feature branches merged straight to `main` ("finalize on main" commits); the older
`phase3-v3-look` / `.claude/worktrees` worktree flow is no longer the primary path.

---

## Prior state (builds 12–22, on main, live on Railway)

`GAME_VERSION` was `v3 · build 22`; cache-buster `?v=b22`.

**Working model (important):** the harness makes edits go through a git worktree
under `.claude/worktrees/phase-3b-pvp` (branch `phase3-v3-look`, kept identical to
`main`). The ship loop each change is: edit in the worktree → `node test/run.js`
(expect **160/160**) → bump `GAME_VERSION` + `?v=bN` → commit → from the primary
checkout `git -C <primary-root> merge --ff-only phase3-v3-look` → `git push origin
main`. (Direct edits to the shared/primary checkout are rejected by the harness.)

**Supabase migrations:** `community.sql`, `custom_rules.sql`, `stats.sql` are all
**VERIFIED ALREADY APPLIED** (read-only probe against the live DB) — nothing
outstanding for deploy.

**Builds 12–22 (stacked on the Phase-3 v3 base, build 11):**
- **12** — Pickaxe removed from the hotbar; mining is now an always-active
  capability (`Game._miningEnabled`, Normal-only) with a HUD badge. Hotbar =
  sword(0) + bow(1) + inventory(2–8).
- **13** — Arena picker restyled as dashboard tiles; full **retro pixel-art CSS
  skin** (`html[data-theme="retro"]`).
- **14** — Fixes: platformer new-world spawns at the Player-1 spawn point; apple
  → hotbar slot 3; Normal-mode **redstone device state + ground item drops now
  persist** across leave/re-enter.
- **15** — **Live-mob tracking**: mobs alive at save time are serialized and
  restored (pos/hp/facing/state/fuse) instead of respawning — both Normal and
  Platformer, both cloud (`GAME_STATE`) and localStorage (`NormalProgress`).
  Reuses `mobManager.serializeMobs`/`adoptSerializedMobs`. New `test/test-mobs.js`.
- **16** — **Arena world selection overhaul**: full-width blue overlay (was
  black/narrow/single-column), 3-per-row responsive tiles, game-type filter
  (based on placed design elements: hill→KOTH, bases→CTF, tower→Defend, emeralds,
  spawns→bots) with per-tile chips, client-side pagination, scrollable long modals.
- **17** — Fixed "click twice to enter dashboard" (start screen was shown before
  an async session check resolved; now hidden until `DASHBOARD.init` reveals it).
- **18** — Legacy canvas `MenuSystem` no longer auto-starts (was flashing the old
  rendered menu on load). Kept as a reference; re-enable via `window.menu.start()`.
- **19** — Game canvas view hidden until a match starts (`body.pre-game`), killing
  the empty-canvas boot flash. `Game()` reveals it + re-fires resize.
- **20** — **Customizable Retro FX** (the big one). `theme.js` now drives seven
  independent effects: pixel frame (ONE runtime-generated 9-slice `border-image`
  skins all buttons/panels), pixel sprites, posterize (SVG `feComponentTransfer`),
  chromatic aberration (SVG channel split), scanlines, dither (Bayer overlay), CRT
  vignette. A 🎛️ gear on the dashboard opens a Theme modal (Modern⇄Retro +
  per-effect toggles + palette-levels slider). State = `data-fx-*` attrs on
  `<html>` + localStorage `steveo_retro_fx`; applied pre-paint. **Menu-only** —
  gated by `body:not(.in-game)` (Game adds `in-game`, destroy clears it), so
  gameplay is never filtered. Frame/dither generated on canvas (no binary assets).
- **21** — Fixed the gear inheriting `.btn-mute` (music.js wires all `.btn-mute`
  → mute + icon-swap); gear now has its own `.theme-settings-open`. Palette levels
  default 8, range 3–8.
- **22** — The gear is hidden in clean/modern mode (retro-only); 🌙 toggle still
  enters retro.

**Test suite:** `node test/run.js` → **160/160** (test-pause 7, test-v3 63,
test-scoring 18, test-rules 56, test-mobs 16).

**Key files touched this session:** `js/theme.js` (retro-FX engine + settings
modal wiring), `js/arena-select.js` (fetch-all + filter + pagination + badges),
`js/game.js` (`_miningEnabled`, `body.pre-game`/`in-game`, live-mob restore,
platformer spawn), `js/saves.js` + `js/game-state.js` + `js/mobs.js` (redstone/
drops/mob persistence), `index.html` (SVG filter defs, FX overlay layers,
pre-paint FX, gear + Theme modal), `style.css` (arena grid + `data-fx-*` rules +
modal styling), `js/constants.js` (GAME_VERSION), `js/menu.js` (boot start disabled).

**Still browser-untested:** builds 12–22 are headless-verified (160/160) only.
Deployed to Railway; a browser pass is warranted — the notable watch-item is the
retro posterize/aberration SVG filter applied to `body` (menus), which interacts
with `position:fixed` screens; if a modal/screen mispositions with those effects
on, it's a one-line scope change. No pixel `@font-face` yet (letterforms use the
theme monospace) — a drop-in bitmap font is the planned finishing touch.

---
_The sections below are the historical Phase-3 record (kept for provenance)._

## Stack
- Client: vanilla JS, canvas-rendered game + DOM overlay screens. ~45 files in `js/`, entry `index.html`
  (authoritative script load order + cache-buster `?v=17k2-3b`).
- Server: Node/Express + Socket.IO + Supabase. Entry `server.js`; route modules in `server/*-routes.js`;
  SQL DDL in `server/sql/`.
- Constants: `js/constants.js` — MAX_PLAYERS=4, PLAYER_COLORS, physics/combat tuning, GAME_VERSION.

## Phase 3B (pre-existing, verified this run)
`players[]` model (getters `player`/`player2` over slots 0/1, `getPlayer(i)`, `activePlayers()`,
`Game.ownerId(i)`), 1–4 local players (P1 keyboard + P2–P4 gamepads), 4-player camera/HUD, arrow PvP
(`mobManager.pvpEnabled`, owner-tagged `_ownerId`, `onPlayerKill`), Friendly Fire, Deathmatch. Arena-only.

## Phase 3 (this run) — all committed as checkpoints on the branch
1. **Player Spawn Points** — new sandbox placeable `kind:'spawnpoint'` (blue flag, slot 1–4, movable +
   deletable), distinct from Survival "Spawn Lines". Persisted as world-data key `playerSpawns`.
   `_setupArena` assigns players to placed spawns by slot (legacy auto-spread fallback). Auto-seeds 2 on
   load when none. Arena settings warns supported player count. (Non-arena single-start override deferred.)
   Files: sandbox.js, game.js, game-state.js.
2. **King of the Hill → 1–4P PvP** — `hold{p1..p4}` map; pre-launch scoring selector STICKY(default)/SOLE/
   ALL; FF defaults on for KOTH; HUD CONTESTED + per-player times; P3/P4 hill tints. Fixed `_ownerIds` to
   use `activePlayers()` (also fixes Deathmatch 3–4P). Files: arena-modes.js, arena-prelaunch.js, game.js, index.html.
3. **Capture the Flag + Teams** — `js/ctf-system.js`: 2 teams (alternating; 2P=1v1, 4P=2v2), grab/carry/
   capture (50pts), drop-on-death, teammate-return, 15s auto-return. Team-aware friendly fire in mobs.js
   (teammates never hit each other; no-op for FFA). `CAPTURE_FLAG` un-greyed; win/score/HUD/winner in
   arena-modes.js; pre-launch Captures-to-Win. Flag bases auto-anchor to team spawns (explicit flag editor
   tool deferred). Fixed P3/P4 emerald award gap. Files: ctf-system.js, mobs.js, arena-modes.js, game.js, index.html, arena-prelaunch.js.
4. **Theme / Reskin** — CSS custom-property tokens: `:root` Modern (default, dark/indigo/sans) vs
   `html[data-theme=retro]` (original neon-monospace). `js/theme.js` live-swaps + localStorage; inline
   `<head>` script applies before paint; toggle in dashboard header. Files: style.css, theme.js, index.html.
5. **Community / Leaderboards / Achievements** — `server/community-routes.js` (browse/search/favorite/rate/
   download), `server/stats-routes.js` (player_stats + player_achievements, 6 triggers, personal-best),
   arena leaderboards gained per-world + recency filters + PvP ranking. Client `js/community-ui.js` +
   `#community-screen` (Browse/Favorites/My Stats). **Requires SQL migrations + browser test.**
   Files: community-routes.js, stats-routes.js, arena-leaderboard-routes.js, worlds-routes.js, server.js,
   community-ui.js, sandbox-ui.js, game.js, index.html, style.css, sql/community.sql, sql/stats.sql.

## Verification status
- Headless logic tests (node-vm against real code): KOTH 23/23, CTF 17/17, achievements thresholds OK.
- All `js/*.js` + `server/*.js` pass `node -c`.
- **Not browser-tested** (no browser/Supabase in this env): 4-player arena play, KOTH/CTF/theme UI,
  and the Community/stats endpoints (need the two SQL migrations run first).

## Required before deploy
_(Historical — as of 2026-07-03 all three migrations are **applied**; see CURRENT STATE.)_
Run `server/sql/community.sql`, `server/sql/custom_rules.sql`, and `server/sql/stats.sql` in the
Supabase SQL editor (additive, safe). Without them the `/api/community/*`, `/api/custom-rules/*`, and
`/api/stats/*` endpoints 500 but the rest of the game is fine.

## Phase 3 — v3 Master Brief run (2026-07-01)
Built on top of the v1/v2 commits. New work (all committed on `worktree-phase-3b-pvp`):
1. **Bug-fix pass (§2):** theme toggle de-duplicated from the mute control (root cause
   of "two mute buttons" + the theme switch not appearing); Online/Community button
   sizing; arena cards render as cards again (`.sandbox-container` width fix); pause
   freezes the match timer; P2-P4 death sound; Deathmatch excludes mob kills; "Disable
   Mobs" pre-launch toggle; spawn-point hotbar icon. Pickaxe-hotbar removal DEFERRED
   (invasive core input redesign; needs browser testing).
2. **KOTH (§3):** runs the full match timer (no early hold-target end); Sticky keeps the
   owner's hill colour while contested, Sole reverts to yellow.
3. **4-player HUD (§4):** P3 lower-left + P4 lower-right get compact health bar + hotbar.
4. **Theme (§5):** now a full game-wide switch — the inline `<head>` style + splash +
   dashboard font were tokenized (they hardcoded retro before). Client-side persistence.
5. **CTF (§6):** base zones (3×2), both-flags-out scoring fixed, one-flag-at-a-time,
   own-flag carry-recovery, drop-on-defeat, configurable return timer, no-combat-while-
   carrying, team shirt colours, per-player→team scoring. New `js/ctf-system.js` logic.
   Bases auto-anchor to team spawns (dedicated sandbox Base placeable deferred).
6. **Defend the Tower (§7):** new `js/tower-system.js` + `DEFEND_TOWER` mode. One Tower/
   player at spawn, HP 3/6/9/12, 3 damage bands, Heal Tower pickups, arrow+melee damage,
   sole win = first Tower destroyed. Editor placeables (Tower/Heal/CTF Base) deferred;
   modes auto-anchor to spawns and are fully playable.
7. **Remaining features (§8):** audited — Publishing/Community/Leaderboards/Achievements
   from the earlier run are intact and already follow the theme tokens; still need the
   two SQL migrations (MIGRATIONS.md) for the /api/community + /api/stats endpoints.

New file: `js/tower-system.js`. Cache-buster bumped `17k2-3b` → `17k3-v3`.
Headless: 52/52 v3 logic assertions pass. Not browser-tested (no browser/Supabase here).
