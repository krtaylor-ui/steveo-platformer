# Steveo Platformer — Future Roadmap & Design Notes

> **Status:** Living doc. Updated 2026‑07‑05 at **build 43** (merged to `main`, live on Railway).
> Records *intent, approach, effort, reuse, and open decisions* — not final specs.

## ✅ Shipped since this doc was written (builds 24–43)
- **Installable version (PWA)** — §2 below. DONE (build 27): `manifest.json` + `sw.js`
  offline app shell + install support. *Follow‑up left:* raster PNG icons (192/512).
- **Mobile mode (touch)** — §3 below. DONE (build 28): responsive canvas + touch overlay;
  Speed Run auto‑run→accelerate button, Platformer d‑pad, Arena twin‑stick.
- **HTML pause menu + universal controller nav** — §5 below. DONE (builds 25, 32–36):
  tabbed mode‑aware HTML pause overlay + `js/gamepad‑nav.js`; classic canvas menu kept
  behind the Konami combo.
- **Leaderboards revamp** — arena per‑world Leader + browse feed; Speed Run hybrid
  (local + server sync) with account initials. DONE (builds 24, 30, 26).
- **Speed Runner race‑car model** — countdown + perfect start, accelerate/coast, actual‑speed
  %, per‑run level reset, fast configurable redstone. DONE (builds 38–43).

## 🔜 Still planned (not built)
- **User Guide** — §1 below (not started).
- **Local‑first / offline worlds + login sync** — see new section [6] below (design agreed
  2026‑07‑05; provenance metadata landed build 44, structure next).
- **World cleanup widget** — see new section [7] below.
- **Tower Defense + MOBA + Bot/AI** — §4 below (not started).
- **itch.io release / Tauri desktop installer** — see new section [8] below.

---

> _Original planning notes (2026‑07‑02, build 15) follow. Some are now shipped (above)._

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

## 5. HTML pause menu + universal controller navigation

Queued to land **with the leaderboard revamp** (that work touches this menu anyway).
Decided direction (2026-07-03).

### 5a. Rebuild the pause menu as HTML
Today it's canvas-rendered in `js/game.js` (`_pauseLayout`, `_drawPauseOverlay`, its
click/gamepad handling, `_drawCtrlAssignRows`, `_drawPauseVolSliders`). Replace with an
HTML modal overlay shown while `game.state === 'paused'`:
- Tabs Pause / Settings / Help (same content). Buttons: Resume, Main Menu, Level Select
  (conditional). **No "Save World"** (removed build 23). **Add "View Leaderboard."**
- Settings: volume sliders → `_worldAdvSettings` + live audio; input-assignment rows for
  **up to 4 players** (reuse `ControllerConfig`; the canvas `_drawCtrlAssignRows` already
  takes any player count — port to HTML `<select>`s).
- Inherits theme tokens + the retro FX (`data-fx-*`, `body.in-game`) → looks right in
  clean AND retro for free. Keep the exit-dialog save-before-quit + F/B quick-save.
- Freeze/resume the loop as now; show/hide overlay on pause; delete the dead canvas paths.

### 5b. Universal controller navigation (new `js/gamepad-nav.js`)
One module drives **every** HTML screen/modal with a gamepad. **Both** modes, together
(user decision — build both):
- **D-pad/stick = spatial focus** — highlight jumps to the nearest focusable element in the
  pressed direction, by bounding-rect geometry (NOT DOM order). Visible focus ring (clean +
  retro).
- **Left stick = virtual cursor** — free DOM pointer; **A** clicks via
  `document.elementFromPoint`. Universal fallback for anything focus can't reach.
- **A** = activate focused element / cursor target; **B** = back (drive the screen's
  back/close/cancel; add a `[data-gp-back]` hook + match `.btn-back` / `.ts-close` /
  `#*-cancel-btn`).
- Focusables = visible+enabled `button,a,input,select,.btn,.toggle,[role=button]` in the
  **top-most visible screen/modal only** (re-scope on screen switch).
- **Dropdowns:** focused `<select>` → D-pad up/down cycles the value directly (don't rely on
  native open — can't drive it via gamepad). Sliders → D-pad left/right nudges. **Text
  inputs:** focus works but typing needs a real keyboard → on-screen keyboard is a separate
  future item (note, don't build).
- Runs its **own rAF poll, active only when `body:not(.in-game)`** so it never fights the
  in-game controller handling in `game.js`. Reuse `input.js` `updateGamepad`/`gpJustDown` +
  `controller-config.js`; use player-1's assignment.

**Effort:** medium–large but build-once, applies to all ~20 screens/modals. **Gotchas:** works
in both themes; never active during gameplay; handles screen switching; add a headless unit
test for the pure "nearest element in direction" pick function (rects → chosen index) — the
rest is browser+gamepad only.

**Reuse:** `input.js` (gamepad poll), `controller-config.js` (per-player assignment), theme
tokens + retro FX (build 20), `body.in-game` gate (build 19/20).

---

*Living document — update as decisions land and features ship. Keep `DECISIONS_LOG.md` for what
*was* built; this file is for what's *planned*.*

---

## 6. Local‑first / offline worlds + optional login sync  *(design agreed 2026‑07‑05)*

**Goal:** the app works fully **offline with no login** — pre‑loaded worlds, build custom
worlds, save games (all local) — and login is an *optional upgrade* that adds cloud worlds,
downloading, and online play.

**Current reality (why this is a refactor, not a feature):** today every world lives in
**Supabase**, even unpublished ("published" is just an `is_published` flag on the same row).
Solo *progress* uses `localStorage` (`NormalProgress`) and the `SandboxSaves` localStorage
helpers exist but are **dormant** (only the disabled canvas `menu.js` used them). The HTML UI
calls `authedFetch('/api/worlds…')` directly in ~10 files.

**The model (decided — no two‑way sync):** it's **2 locations + 1 flag**, not 3 states.
- **Cloud** (Supabase) worlds; "Published" = a filter/badge on some of them.
- **Local** (localStorage) worlds.
- Move between them only via **explicit "Copy to Online" / "Copy to Offline"** — never an
  automatic merge, never a login‑time "which is newer?" prompt (that's where sync bugs live).
- Logging in from offline **adds** cloud access; it does **not** reconcile local worlds.
- Tame copy‑sprawl with: **provenance metadata** (see below) + an **opt‑in "update existing
  copy vs save as new"** prompt when a same‑lineage copy already exists in the target.

**Provenance metadata (LANDED build 44):** `world_data.provenance = { uid, createdAt,
updatedAt, creator, origin('cloud'|'local'), copiedFrom, copiedAt }`, stamped in
`GAME_STATE._provenance()` and captured on load (`game._loadedProvenance`). Travels inside
world_data across export/import/copy. `copiedFrom/At` get populated by the copy flow.

**Work remaining:**
1. **Guest entry path** + a session **mode flag** (local vs online) — see the entry‑screen
   idea in [8]/below.
2. **Local data provider** mirroring the world/game API against `localStorage`, so the
   dashboard / game slots / sandbox browser list local worlds in guest mode (the core
   refactor; abstract the ~10 `authedFetch` call sites behind one provider interface).
3. **Bundled worlds** — curate more `default-worlds/*.json` as read‑only starters (copy‑to‑play).
4. **Copy to Online/Offline** actions + the opt‑in overwrite‑or‑fork prompt.
5. Online‑only features (MP, community browse, cloud leaderboards) **grey out** in guest mode.

**Entry‑screen UX (proposed):** the initial audio‑trigger screen offers **"Play Offline"** /
**"Play Online"**. Online + not logged in → login, then cloud dashboard; Online + logged in →
cloud dashboard; Offline → guest/local. Logged‑in users can still choose Offline (e.g. on a
plane). Remember the last choice; allow switching modes from the dashboard.

**Effort:** MODERATE (local‑only build) + MODERATE (login‑sync), dominated by the provider
abstraction. Pairs perfectly with the Tauri/itch desktop build [8].

---

## 7. World cleanup widget ("🧹 Manage Worlds")  *(design 2026‑07‑05)*

A self‑contained HTML panel (like the theme‑settings modal) that visualizes all worlds and
tames copy‑sprawl. **Depends on the provenance metadata [6] existing.**

- **Lineage tree** grouping each root world with its copies (cloud ☁ / local 💾 badges,
  published tag), drawn from `copiedFrom`.
- **Per‑world metrics** — all cheap, derived from `world_data` JSON: block count (non‑air
  cells), placed‑object counts, dimensions, last‑edited (`updatedAt`); **block‑level diff**
  between two worlds ("differ by N cells" / "identical" via a grid hash) for pre‑delete compare.
- **Suggested cleanup** — flag exact duplicates and older/subset copies superseded by a newer
  descendant; one‑click delete (individual or all‑flagged).
- **Honest limits:** compares **snapshots**, not per‑edit history; the connection graph needs
  provenance (else only fuzzy name+creator grouping). **Effort:** LOW–MODERATE (mostly pure
  functions: count/hash/diff + display).

---

## 8. itch.io release / Tauri desktop installer  *(feasibility 2026‑07‑05)*

**Caveat:** client + server app. itch hosts the **client**; the Node/Express + Supabase
backend stays on Railway. Any itch build must point API + Socket.IO at the Railway URL
(client uses relative `/api/…` today; server already runs `app.use(cors())` all‑origins and
Bearer tokens, so **no server CORS change needed** — just a configurable client base URL).

- **Route A — HTML5 web build:** zip the static client, upload as an in‑browser itch game.
- **Route B — Tauri desktop installer (recommended):** wrap the web client → `.exe`/`.dmg`/
  `.AppImage` for itch download (Tauri ≈ tiny OS‑webview; Electron heavier). Optional code‑signing.
- **Prerequisite:** add a configurable **API/socket base URL** (defaults to same‑origin so
  Railway + local keep working; set to Railway for the itch build).
- Best combined with the local‑first mode [6]: offline‑capable desktop app that *optionally*
  signs in for cloud/online.
