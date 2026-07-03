# Steveo Platformer — Future Roadmap & Design Notes

> **Status:** Planning / design capture. **Nothing here is built yet.**
> Captured from design discussion on 2026‑07‑02, at game **build 15** (branch `phase3-v3-look`).
> This doc seeds later implementation sessions. It records *intent, approach, effort, reuse,
> and open decisions* — not final specs. Update it as decisions are made.

The engine is vanilla‑JS + `<canvas>`, served as static files (`index.html` + `js/*.js`
with `?v=bN` cache‑busters), backed by Node/Express + Socket.IO + Supabase.

Four initiatives, in the order they were discussed:

1. [User Guide](#1-user-guide)
2. [Installable version (PWA)](#2-installable-version-pwa)
3. [Mobile mode (touch)](#3-mobile-mode-touch)
4. [Tower Defense + MOBA + Bot/AI intelligence](#4-tower-defense--moba--botai-intelligence)

At the end: a consolidated [Open Decisions](#open-decisions) list and a
[Reuse Map](#reuse-map-what-each-initiative-leans-on) tying features to existing code.

---

## 1. User Guide

**Goal:** player‑facing instructions — one page per mode: **Normal, Platformer, Speed Run,
Sandbox** (long — all shortcut keys), **Arena** (long — modes + rules).

**Why we build it in‑repo (not via a browser/PDF tool):** the *authoritative source for
controls lives in the code*, and only in‑repo tooling can read it accurately.

- `input.js` maps everything to physical **`e.code`** values (`this.keys[e.code]`), so every
  binding is extractable rather than guessed. Example facts already confirmed:
  - Player‑2 keyboard fallback = **I J K L** move + **U** attack (`constants.js` `P2_KEY_*`).
  - Sandbox brush size = **Digit1 / Digit2 / Digit3** (`game.js` ~L1796).
  - Sandbox has **Ctrl+Z / Y / C / V** (undo / redo / copy / paste) (`input.js` ~L151).
- There is also **gamepad support** (`controller-config.js`, `controller-input.js`) — so
  "controls" means keyboard **and** controller.

**Format:** styled **HTML artifacts** in the game's retro identity (like the mob‑persistence
page), one page per mode. More maintainable than a PDF, and print‑to‑PDF covers the file case.

**Caveats to honor when writing it:**
- Document what the code *does*, not an idealized spec. Flag anything that looks buggy rather
  than writing it up as intended behavior.
- Sandbox/Arena shortcuts are **scattered inline** across the large `game.js` sandbox update
  loop — not a single table. Those pages require a careful grep‑and‑verify pass over every
  `isJustDown` / `isDown` / `keys[...]` in the sandbox path.
- Reconcile wording with any existing in‑game help text (`menu.js`, `sandbox-ui.js`).

**Effort:** Normal / Platformer / Speed Run pages are quick (shared movement core). **Sandbox
and Arena are the long ones** — the bulk of the work is the shortcut trace‑and‑verify pass.

---

## 2. Installable version (PWA)

**Goal:** installs and runs locally, still connects to online multiplayer when online.

**Approach — Progressive Web App:** add `manifest.json` (name, icons, `display: standalone`,
theme colors) + a **service worker** that caches the app shell (~40 JS files + audio + sprites).

- **Installs to desktop and mobile** with one implementation (Win/Mac/Android/iOS).
- **Offline single‑player works today** — local play / Sandbox / Speed Run persist to
  `localStorage` (`SandboxSaves`, `NormalProgress`).
- **Online MP still works** — the SW caches only the shell; when online, Socket.IO/Supabase
  calls go to the hosted server unchanged.

**Important nuance:** "installed locally" = the **client** is local. Online MP still reaches the
**cloud server**. Bundling a local Node server for offline LAN play is a much bigger lift —
**out of scope for v1.** Clean story: *offline → local saves + solo/local‑splitscreen; online →
cloud saves + multiplayer.*

**Effort tiers:**
- **PWA — LOW.** ~a session (service worker + icons + offline‑cache testing). Highest‑leverage
  single move; it *also* unlocks mobile install. **Do this first.**
- **Tauri / Capacitor — MODERATE.** Only if we later want a signed `.exe`/`.dmg` or App/Play
  Store listing. Wraps the same web app; adds build + code‑signing overhead.

---

## 3. Mobile mode (touch)

**Key architectural insight (makes this cheaper than it looks):** `input.js` already abstracts
input into **virtual actions**, and the existing gamepad layer proves the abstraction holds. A
touch layer just **sets the same virtual button states** — game logic is untouched.

**Two real pieces of work:**
1. **Responsive canvas** — scale fixed `CANVAS_W/H` to the viewport; handle DPR + orientation.
2. **Touch overlay** — on‑screen controls that feed the virtual inputs.

**Per‑mode fit + "dazzle" ideas:**

| Mode | Fit | Idea |
|---|---|---|
| **Speed Run** | Excellent | **Auto‑run**: move forward automatically, one big **Jump**, hold for higher jumps — classic mobile‑runner feel, arguably *better* than keyboard. |
| **Platformer** | Excellent | Virtual joystick/D‑pad + Jump + context action. |
| **Arena** | Good | **Twin‑stick**: left thumb moves, right thumb aims+fires the bow; optional aim‑assist. |
| **Tower Defense** (new) | Ideal | Tap to place, tap tower to upgrade — mobile‑first by nature. |
| **Normal** | Harder — *phase 2* | Needs tap‑to‑target reticle for mine/place + touch redesign of hotbar/crafting. |
| **Sandbox** | Desktop‑only | Precision mouse + keyboard‑shortcut tool; full touch authoring is a big redesign for little payoff. Consider a stripped view/tweak mode at most. |

**Cheap extra juice:** `navigator.vibrate` haptics on hits/jumps; landscape lock for gameplay;
auto‑detect touch to enable mobile controls (with a manual toggle for hybrid devices).

**Effort:** responsive canvas + touch layer + Speed Run/Platformer/Arena controls = **MODERATE.**
Normal‑mode touch = a follow‑on.

---

## 4. Tower Defense + MOBA + Bot/AI intelligence

The player runs around as a platformer character **and** builds — "**Action Tower Defense**."
The multiplayer vision is **League‑of‑Legends‑style**: players push lanes alongside **allied
minion waves** toward an enemy core.

### 4a. The big unlock — TD and MOBA are the *same substrate*

Co‑op Tower Defense and the LoL vision are **two configurations of one substrate**. Build it once:

| Substrate piece | Co‑op TD config | MOBA config (LoL vision) |
|---|---|---|
| **Lanes** (authored paths) | enemies march to your core | both teams' minions march at each other |
| **Waypoint minions** | the attackers | your allies **and** their attackers |
| **Lane towers** | your defenses | each team's turrets |
| **Core / nexus** (`TOWER_SYSTEM`) | protect it | destroy theirs, defend yours |
| **Win condition** (rules engine) | survive N waves | enemy core destroyed |

**Recommendation:** ship **co‑op TD first** (proves the substrate, less balancing risk); treat
team‑vs‑team MOBA as the **v2 config** of the same systems.

### 4b. Path system (the pathing simplification)

Enemies/minions follow **authored waypoint lanes** placed in Sandbox — seek the next node,
walk toward it, hop when it's higher. This is deliberately chosen because it **sidesteps the
"mobs get stuck on arbitrary terrain" risk**: the path *is* the design — deterministic, reliable,
cheap.

- **Multiple paths per wave** — assign each spawn/wave a lane; rotate lanes across waves for
  variety. Trivial once paths are a placeable.
- **Allied minions** = same system, opposite direction, enemy‑team target — LoL creeps for free.
- **Free‑roam escape hatch** — a per‑spawn **`roams: true`** flag drops a mob out of
  path‑following back into the existing wander/chase AI (seek core / aggro nearest enemy). So we
  support disciplined lane creeps **and** chaotic free‑roamers with one toggle — not either/or.

### 4c. Team‑aware targeting (the one genuinely new mechanic)

Mobs currently target *nearest player* (`mobs.js` `_nearestPlayer`). Minions/allies need
*nearest **enemy‑team** unit* with a priority order (other minions → players → towers → core).
Infra already exists — `p.teamId`, `p.teamColor`, `_ownerId` (p1–p4), the `teamOf` map, and
arrows already skip teammates (`mobs.js` ~L1644–1667); CTF bases carry `team: 0|1`. So this is an
**extension**: tag each mob with an **allegiance** and point targeting at the opposing team.

**Bonus primitive:** this instantly enables **allied mobs in any mode** (summon a wolf in Normal,
a golem in Arena) — reusable well beyond TD/MOBA.

### 4d. Bot / AI intelligence (cross‑cutting — all modes)

Current state: **Arena "bots" are just enemy Skeletons** (`game.js` `botCount` →
`_createMob('Skeleton', …)`) running reactive chase/shoot AI. There is **no AI that plays an
objective** — that's the gap ("Arena bot play").

**Four‑tier model** so each mode pulls the level it needs:

| Tier | What | Status | Used by |
|---|---|---|---|
| **T0 — Scripted / path** | follow waypoints, attack in range | **new, easy** | TD/MOBA minions |
| **T1 — Reactive** | wander → aggro → chase/shoot nearest | **exists today** | Arena skeletons, free‑roam, Normal survival |
| **T2 — Objective bots** | play the *mode*: hold hill, grab/return flag, push lane & retreat | **the gap** | Arena AI opponents/teammates, MOBA |
| **T3 — Tactical** | grouping, target prioritization, influence maps | future | — |

**Killer reuse for T2:** the **rules engine already declares each mode's objective**
(`arena-rules.js` — `elements.hill`, `elements.flags`, tower, win conditions). A bot reads the
*same RULESET* to decide its goal (`if elements.hill → path to hill and hold`;
`if elements.flags → flag behavior`). **The system that *defines* modes doubles as the system
that tells a bot *how to play* them** — add a mode once, the bots understand it.

**Honest hard parts (keep the spec realistic):**
1. **Pathfinding is the foundational investment.** "Follow ground, jump 1‑block gaps" is fine for
   lanes but too fragile for bots/free‑roamers heading to an *arbitrary* spot. Smart movement
   everywhere eventually wants a **tile‑grid A* / navmesh** over the level grid. Waypoint lanes
   let us ship TD *and* MOBA without it; Arena objective‑bots will want it — so plan it as a
   **shared subsystem**, not a per‑mode hack.
2. **Difficulty tuning** — bot skill via reaction time, aim error, aggression, decision cadence
   (easy/medium/hard presets).
3. **Fight‑or‑flee & target selection** — the difference between a bot that feels alive and one
   that suicides into a wall.

**Arena bot rollout order (easiest → hardest):**
**Deathmatch** (hunt nearest player — closest to today's skeleton behavior) →
**KOTH** (path to hill, contest, hold) →
**CTF** (multi‑step: fetch, carry, evade, return — the real test).

### 4e. Effort

- **Single‑player TD prototype** (one lane, 2–3 towers, emerald economy, wave survival, protect
  core) — **MODERATE**, thanks to heavy reuse (see Reuse Map).
- **Full vision** (multi‑route maps, upgrade trees, Sandbox authoring of TD maps, polished co‑op,
  then MOBA config, then objective bots) — **LARGE, multi‑phase.**

---

## Open Decisions

Resolve these to sharpen the eventual spec docs (User Guide, Mobile, Installable, TD/AI).

**User Guide**
- One combined artifact with mode navigation, or five separate pages?
- Include controller/gamepad mappings, or keyboard‑only?
- True PDF deliverable required, or is a shareable web page fine?
- Audience: brand‑new players (more "what is this mode"), or players who just need controls?

**Installable**
- PWA‑only for v1, or also plan the Tauri/Capacitor store path?

**Mobile**
- Confirm v1 mode set (Speed Run + Platformer + Arena; Normal deferred; Sandbox desktop‑only).
- Bake the auto‑run / twin‑stick ideas into the spec?

**Tower Defense / MOBA / Bots**
- **MOBA scope:** co‑op TD first, MOBA as v2 config? *(recommended)*
- **Pathfinding:** commit to tile A* / navmesh as a shared subsystem now, or stay waypoint‑only
  until Arena bots force the issue?
- **Arena bots:** all three objective types, or Deathmatch + KOTH first and defer CTF bots?
- **Allied minions:** MOBA‑only, or expose "summon an ally" as a general cross‑mode primitive?
- **Economy:** emeralds‑only, or multiple resources (e.g., emeralds for towers, wood/stone for
  walls)?

---

## Reuse Map (what each initiative leans on)

Confirmed existing systems the future work builds on:

| Need | Existing system / file |
|---|---|
| Input abstraction (keyboard) | `input.js` (`e.code` → `keys[]`), `constants.js` `P2_KEY_*` |
| Gamepad | `controller-config.js`, `controller-input.js` |
| Currency / rounds | `EMERALD_SYSTEM` (`emerald-system.js`) |
| Waves + win conditions | `arena-modes.js` `_updateWaves` / `wavesCleared`; `arena-rules.js` `survivedAllWaves`, `perWaveDefeated`, `totalWaves` |
| Enemy spawners (authorable) | `placedSpawnLines` (`game-state.js`, sandbox) |
| Core / base to defend | `TOWER_SYSTEM` (`tower-system.js` — HP, banding, heal, destroyed) |
| Mode‑as‑data (drives bot goals too) | `arena-rules.js` RULESET (`elements`, `scoring`, win) |
| Teams + friendly‑fire | `mobs.js` `teamOf` / arrow team‑skip; `game.js` `p.teamId` / `_ownerId` / CTF `team:0\|1` |
| Mob targeting hook | `mobs.js` `_nearestPlayer`, `_targetPlayers`, `_pvpPlayerList` |
| Existing (reactive) bots | `game.js` `botCount` → `_createMob('Skeleton', …)` |
| Mob serialize/restore (for persistence) | `mobs.js` `serializeMobs` / `adoptSerializedMobs` (see build 15) |
| Local saves (offline PWA) | `SandboxSaves`, `NormalProgress` (`saves.js`) |
| Cloud saves / MP | `GAME_STATE` (`game-state.js`), Socket.IO + Supabase |

---

*Living document — update as decisions land and features ship. Keep `DECISIONS_LOG.md` for what
*was* built; this file is for what's *planned*.*
