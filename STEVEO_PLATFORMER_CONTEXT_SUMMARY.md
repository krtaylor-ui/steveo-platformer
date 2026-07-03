# Steveo Platformer — Context Summary (post Phase 3 overnight run)

**Updated:** 2026-07-01. Branch: `worktree-phase-3b-pvp`. This file reflects the state after the
Phase 3 master-brief run (Spawn Points, KOTH PvP, CTF+Teams, Themes, Community/Leaderboards/Achievements).
See `DECISIONS_LOG.md` for every decision/assumption and `MIGRATIONS.md` for required Supabase SQL.

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
Run `server/sql/community.sql` and `server/sql/stats.sql` in the Supabase SQL editor (additive, safe).
Without them the new `/api/community/*` and `/api/stats/*` endpoints 500 but the rest of the game is fine.

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
