# Steveo Platformer — Future Roadmap & Design Notes

> **Status:** Living doc. Updated 2026‑07‑10 at **build 72** (merged to `main`).
> Records *intent, approach, effort, reuse, and open decisions* — not final specs.
> Latest additions: §13 Ladders, §14 Trampolines/Slime, §15 Online/MP UX direction,
> §16 Mob Variety/Config engine, §17 Item Enchantments, §18 Suspicion meter — plus the
> Smart Mobs line under "Still planned" (specced 2026‑07‑08, not yet built).

## ✅ Shipped since this doc was written (builds 24–67)
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
- **Local‑first / offline worlds** — §6 below. LARGELY DONE (builds 44–50): provenance
  metadata, Play Online/Offline entry + session mode, offline Sandbox via a localStorage
  provider, file import/export + bundled starters, and the explicit Copy‑to‑Online/Offline
  bridge (unified Copy modal). *Remaining:* offline providers for the OTHER modes
  (Normal/Platformer/Arena), F‑key quick‑save reconciliation, login‑sync polish — see §6.
- **Per‑world background theme (Tier 1)** — §9 below. DONE (build 51): a "BG" tab in the
  Sandbox World Settings modal picks Auto/Sky/Cave/Nether/End; forces that backdrop
  everywhere (visual only — gameplay biome regions untouched). Works in Arena + all modes.
- **App icon** — DONE (build 52): PWA raster icons = the player's head (completes the §2 follow‑up).
- **Sandbox/Speed‑Run UX** — DONE (builds 53, 56–57): rename worlds in Sandbox; exit‑test button +
  test‑world HUD (Restart + Return to Sandbox); SR restart button + pause freezes the SR timer;
  sandbox playtest exits to Sandbox with no scoring; full‑column SR finish line.
- **Movement moves** — DONE (builds 54, 58–63): **Auto‑Climb** 1‑block ledges; **double‑jump air‑roll**;
  **wall slide, ledge hang/climb, ground slide** (per‑world toggles) with an articulated climb‑up animation.
- **Unified HTML World Settings panel** — DONE (builds 64–66): data‑driven `world-settings-ui.js`
  replacing the canvas panel (kept as a Konami bonus); mob drops/arena types/background/tooltips/retro;
  **Up‑Arrow + J secondary jump**; Konami ending flipped to **B‑then‑A**. (See "World Settings rebuild" below.)
- **Platformer campaign‑prep** — §12 below, Phase 1. ✅ SHIPPED to main (builds 67–72, browser‑verified):
  multiple + multi‑colour Goal Stars (click‑to‑cycle a touching group), emerald collect+count, opt‑in score
  — groundwork for Campaign mode. Builds 68–72 = editor fixes + the Return‑to‑Sandbox playtest‑exit fix.

## 🔜 Still planned (not built)
- **Smart Mobs** — mob intelligence pass (wayfinding, line-of-sight + sound + action detection,
  pack behaviour, sprint-telegraph, flee-at-low-HP, spider webs) + a trait-based weapon system,
  a crouch/sneak movement state, and Leaves/Bushes concealment blocks. **Fully specced** in the
  *Bug Fixes + Smart Mobs brief* (2026‑07‑08) but **not yet built** — it's the direct foundation
  several items below cross‑reference (§16 mob config, §17 enchantments, §18 suspicion meter).
- **User Guide** — §1 below (not started).
- **Offline providers for Normal / Platformer / Arena** — extend the §6 local provider
  beyond Sandbox (only Sandbox works offline today).
- **World cleanup widget** — see section [7] below (provenance dependency now shipped).
- **Editable background transition zones (Tier 3)** — §9 below; generalize the hardcoded
  depth/column thresholds into designer‑editable zones. Good moment to **revisit Platformer
  mode + bosses** (§10).
- **Warden boss** — §10 below (not started).
- **Tower Defense mode** (roam‑free, wave‑survival — *distinct from "Defend the Tower"*) —
  §11 below (not started).
- **Tower Defense + MOBA + Bot/AI** (the larger action‑TD/MOBA substrate) — §4 below.
- **itch.io release / Tauri desktop installer** — see section [8] below.

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

## 6. Local‑first / offline worlds + optional login sync  *(design agreed 2026‑07‑05; LARGELY SHIPPED builds 44–50)*

> **Status (build 50):** the offline‑Sandbox path is shipped end‑to‑end — Play Offline →
> pre‑loaded starters + create/build/save/reopen/copy/delete/import/export, all local, no
> login — plus the explicit Copy‑to‑Online/Offline bridge. What's left: the local provider
> only covers **Sandbox**; Normal/Platformer/Arena are still guarded offline. The editor
> F‑key quick‑save still uses the legacy `SandboxSaves` store (Save button uses local‑worlds)
> — reconcile. Login‑sync stays "adds cloud, never merges" as designed. All browser‑UNTESTED.

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

**Work — status:**
1. ✅ **Guest entry path** + session **mode flag** — DONE build 45 (`js/app-mode.js`
   `APP_MODE`; Play Online/Offline start screen).
2. 🟡 **Local data provider** mirroring the world API against `localStorage` — DONE for
   **Sandbox** build 46 (`js/local-worlds.js` `LOCAL_WORLDS`; `sandbox-ui.js` branches on
   `APP_MODE.isLocal()`). **Still TODO:** the same provider treatment for Normal / Platformer
   / Arena game slots (those modes are still guarded offline).
3. ✅ **Bundled worlds** — DONE build 47 (`LOCAL_WORLDS.seedDefaults()` seeds
   `default-worlds/*`; added to SW precache).
4. ✅ **Copy to Online/Offline** + the opt‑in overwrite‑or‑fork prompt — DONE builds 48–50
   (unified Copy modal; duplicate/lineage guard).
5. ✅ Online‑only features (MP, community browse, cloud leaderboards) **grey out** in guest
   mode — DONE build 45.
6. 🟡 **Follow‑ups:** reconcile the editor F‑key quick‑save (legacy `SandboxSaves`) with the
   local‑worlds Save path; browser‑test the whole offline flow; optional login‑sync polish.

**Entry‑screen UX (proposed):** the initial audio‑trigger screen offers **"Play Offline"** /
**"Play Online"**. Online + not logged in → login, then cloud dashboard; Online + logged in →
cloud dashboard; Offline → guest/local. Logged‑in users can still choose Offline (e.g. on a
plane). Remember the last choice; allow switching modes from the dashboard.

**Effort:** MODERATE (local‑only build) + MODERATE (login‑sync), dominated by the provider
abstraction. Pairs perfectly with the Tauri/itch desktop build [8].

---

## 7. World cleanup widget ("🧹 Manage Worlds")  *(design 2026‑07‑05)*

A self‑contained HTML panel (like the theme‑settings modal) that visualizes all worlds and
tames copy‑sprawl. **Provenance metadata dependency [6] now shipped (build 44) — unblocked.**

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

---

## 9. Background themes + editable transition zones  *(Tier 1 SHIPPED build 51; Tier 3 planned)*

**Goal:** let a Sandbox designer choose a world's backdrop, and (later) control where
backgrounds change.

**How backgrounds work today (the constraint):** there is **no "dimension" state**. The
backdrop is recomputed every frame from the player's grid position — `_playerBiome()`
(`game.js`) returns `plains/cave/nether/end` from column (X) + row (Y), and `_drawSky()`
paints it. Nether/End are just **column ranges** of the same world (constants
`BIOME_CAVE_END=300`, `BIOME_END_START=500`), and gameplay (dragon fight bounds, End‑void
death, portals, music state machine) keys off those same constants. So "visual theme" and
"gameplay biome region" are welded together.

### ✅ Tier 1 — per‑world background picker (build 51)
Decoupled visuals from gameplay: added `_worldAdvSettings.backgroundTheme`
(`'auto'|'sky'|'cave'|'nether'|'end'`, default `'auto'`) + a new `_skyBiome()` that returns
the override when set and falls back to `_playerBiome()` when `'auto'`. `_render` draws from
`_skyBiome()`; `_playerBiome()` (gameplay) is untouched, so forcing a theme never breaks the
Nether/End regions, dragon, void death, or music. A forced Sky/Cave also pins the depth blend
so it ignores player depth. UI = a **"BG" tab** in the canvas World Settings modal (mirrors
the Physics tab); free‑rides the existing `worldAdvSettings` serialize path. Works in Arena
and every mode. Backward‑compatible (older worlds default to Auto).

### 🟠 Tier 3 — editable transition zones (planned)
Make the *boundaries* designer‑editable instead of hardcoded:
- **Vertical (depth):** today the sky→cave blend is hardcoded to rows 24→28 in `_drawSky`
  and row 28 in `_playerBiome`. Generalize into a config table (e.g. `[{theme, fromRow,
  toRow}]`) + UI to set the thresholds. Reasonable scope.
- **Horizontal (columns):** the 150/300/500 boundaries are **load‑bearing gameplay
  constants** (dragon bounds, portals, void death, music). Making these editable is riskier
  and should be scoped separately — likely requires promoting "biome region" to real
  per‑world data rather than global constants.
- **Pairs well with revisiting Platformer mode + bosses (§10):** authored vertical zones
  (sky → cave → nether descent) would give Platformer levels real environmental variety and
  natural boss‑arena backdrops. Consider doing Tier 3 and the Platformer/boss pass together.

**Effort:** Tier 3 vertical = MODERATE; horizontal/full region‑as‑data = LARGE.

---

## 10. Warden boss + Platformer boss pass  *(idea captured 2026‑07‑03)*

**Warden boss** — a new heavy melee/ranged boss in the Minecraft‑Warden vein (high HP, area
attack, slow but punishing). Reuses the existing boss infrastructure (Wither/Dragon: HP bar,
`bossHealthMultiplier`/`bossDamageMultiplier`/`bossAttackRateMultiplier` scaling in
`_worldAdvSettings`, boss AI patterns in `mobs.js`). Open design points: signature attack
(sonic boom / shockwave?), trigger (sculk‑style proximity, or a summon block), which
dimensions/areas it spawns in, and loot.

**Platformer boss pass** — Platformer mode currently has no dedicated bosses. Revisit it to
add boss encounters (Warden being one candidate), ideally with authored background transition
zones (§9 Tier 3) framing the arenas. Group this with the Tier 3 work.

**Effort:** single new boss = MODERATE (heavy reuse of the boss/mob systems); the Platformer
encounter framing depends on how much §9 Tier 3 lands first.

---

## 11. Tower Defense mode (standalone)  *(idea captured 2026‑07‑03 — DISTINCT from "Defend the Tower")*

**Not** the existing Arena **Defend the Tower** PvP mode (`tower-system.js`, first‑tower‑
destroyed wins). This is a **dedicated single/co‑op Tower Defense game mode**: waves of mobs
advance toward a goal/core along a route; the player places and upgrades towers (emerald
economy) to stop them; survive N waves to win.

**Relationship to §4:** §4 describes the *full* "Action Tower Defense + MOBA" substrate
(authored lanes, waypoint minions, allied creeps, team targeting, objective bots) — a LARGE
multi‑phase vision. This §11 is the **smaller, shippable first cut**: one route, a few tower
types, wave survival, protect the core — effectively the "Single‑player TD prototype" called
out in §4e, promoted to its own roadmap line because it's a concrete standalone mode the user
wants, separate from the Arena Defend‑the‑Tower confusion.

**Reuse (already in the codebase):** `EMERALD_SYSTEM` (currency), `arena-modes.js`
`_updateWaves`/`wavesCleared` + `arena-rules.js` win conditions (waves), `placedSpawnLines`
(authorable enemy spawns), `TOWER_SYSTEM` (a core/base with HP to defend), reactive mob AI
(`_createMob`). The genuinely new piece is **path/waypoint following** for the advancing wave
(see §4b) + tower placement/upgrade UI.

**Effort:** MODERATE for the standalone prototype (heavy reuse); grows into §4 if extended to
lanes/MOBA/bots.

---

## World Settings rebuild (HTML) — ✅ SHIPPED (builds 64–66)

**Done.** The unified HTML World Settings panel shipped as `js/world-settings-ui.js` — a data-driven
`SETTINGS` list (each row tagged tab/group/advanced/modes/dependsOn/get/set), with mode-aware tab
filtering, mob-drops/arena-types/background/tooltips, an advanced-vs-regular colour split, and the retro
skin. The canvas panel is kept as a **Konami-code bonus** (`_useClassicPause`). The Campaign-prep
**Scoring** group (build 67) plugs straight into this schema. Original planning note kept below.

The per-world config list is outgrowing the fixed-size **canvas** World Settings panel (the Physics tab is
already full at 9 rows). New movement toggles (Auto-Climb, Wall Slide, Ledge Hang, Ground Slide + their
sub-options) currently live in the **HTML pause-menu** physics section because the canvas panel can't take
more rows without overflowing.

**Plan:** rebuild World Settings as a proper **HTML** UI with a **Simple / Advanced** split — surface the
handful of common knobs up front, tuck the long tail (physics, movement moves, redstone, boss scaling,
locks) behind an "Advanced" disclosure. Group by theme (Movement, Physics, Arena, Display, Boss). Keep the
existing **canvas "rendered" menu as a Konami-code bonus in Sandbox** (it's already gated behind
`_useClassicPause`/Konami) — a nostalgic extra, not the primary path.

Movement config keys to fold in: `airJumpEnabled`, `autoStepUp`, `wallSlideEnabled`, `wallJumpLockAway`,
`ledgeHangEnabled`, `slideEnabled`, `slideInvincible`, `slideDurationFrames`, `slideSpeedMult`.

---

## 12. Campaign mode — sequenced levels with branching exits  *(vision agreed 2026‑07‑07; Phase 1 SHIPPED to main, builds 67–72)*

Kevin's vision: a playable **sequence of levels** (Mario-Bros-style) where each level leads to the next,
with **secret levels** and **skip paths** — the different coloured Goal Stars are the branch exits. This is
"an action version of normal mode" turned into a progression.

**Core decision (UX + low-complexity):** build a lightweight **Campaign container**, **NOT a new physics
mode**. Individual levels stay **Platformer** levels (all in-level tech already exists). The new layer only:
(a) **sequences** levels, (b) **routes coloured-goal exits → destination levels**, (c) tracks
**progression**. This keeps complexity in one well-scoped place instead of forking gameplay.

**Build order (Kevin's chosen cut):**
- **Phase 1 — make levels campaign-ready — ✅ SHIPPED to main (builds 67–72).** Multiple Goal Stars end the level;
  10-colour palette (`GOAL_COLORS`, re-click to cycle in editor, serialized as `world_data.goalStars`);
  `game._wonExitColor` records which coloured exit was taken; emerald collect+count + a rough score system,
  all opt-in via the **Scoring** World-Settings group. See DECISIONS 2026‑07‑07 + CONTEXT_SUMMARY build 67.
- **Phase 2 — Campaign Builder mode (later).** A dedicated builder that sequences existing worlds into a
  campaign, assigns which world each level/exit points to, and flags **bonus/secret levels**. Kevin: "the
  campaign build will need to be well thought out" — worried a rigid ordered-list is too limiting, so the
  builder should support explicit per-exit destinations (a small level graph), not just linear order.
- **Phase 3 — cross-level carry-over (later).** Carry **inventory, points, emeralds, lives** between
  levels; **health RESETS at the start of each level**. (Lives → arcade game-over on zero.)
- **Phase 4 — top-down walkable overworld map (later).** Low-res/low-quality is fine. Kevin explicitly
  **prefers an overhead map over a side-view level-select** — and it "may complement Tower Defense (§11)
  as a different level type" (shared top-down substrate). Start the PoC **linear** but keep the data model
  **map-ready** so this drops in without rework.
- **Phase 5 — portal-based "World Select" level (later).** A hub level with **portals to multiple worlds**
  (complements the overhead map); the up-to-10 goal colours map naturally to multiple portal destinations.

**Colours:** 2 exit types used now (gold = normal, one alt = secret/skip); palette sized to **10** so future
exits (skip-ahead, bonus, per-portal) each get a colour.

**Reuse:** Platformer level runtime (unchanged), `GOAL_COLORS` + `goalStars` serialize + `_wonExitColor`
(build 67), `EMERALD_SYSTEM` (currency/score), World-Settings schema (`world-settings-ui.js`), world
provenance/`uid` (§6, for referencing levels in a campaign graph), local-worlds store (§6). Genuinely new:
the campaign data model (level graph + progression save) + the Builder UI + the overworld map renderer.

**Effort:** Phase 1 done. Phase 2–3 MODERATE (mostly UI + a save schema). Phase 4 LARGER (new top-down
renderer/navigation — but shareable with §11 TD). Phase 5 SMALL once the graph + map exist.

**Open decisions (for when we start Phase 2):** ordered-list-plus-skip vs. explicit per-exit graph (Kevin
leans flexible/graph); how a campaign is stored + shared (one object referencing world `uid`s); checkpoints
within/between levels; lives count + game-over behaviour.

---

## 13. Ladders  *(idea captured 2026‑07‑08)*

New climbable block — player can climb up/down with a dedicated climbing animation.
Note for whoever builds this: the codebase already has **wall‑slide and ledge‑hang** (builds 59–61,
per‑world toggles `wallSlideEnabled` / `ledgeHangEnabled`) — ladder input needs to clearly take
**priority** over those when a player is adjacent to both, rather than the two systems fighting for
control of the same up/down input. (The new **crouch/sneak** state from the Smart Mobs brief also
claims an up/down‑adjacent binding — settle the input‑precedence order across ladder / wall‑slide /
ledge‑hang / crouch as one decision, not four.)

**Effort:** MODERATE.

---

## 14. Trampolines / Slime Blocks  *(idea captured 2026‑07‑08)*

Distinct from the existing **jump pad** (which gives a fixed impulse — see the Speed Run `JUMP_PAD`
launch envelope the reachability validator already models). This needs to take the player's incoming
vertical speed and **invert it with a small added bounce**, so consecutive bounces escalate (jump
higher each time). Proposed advanced settings: a **boost** amount added per bounce, and a **max
height** cap at which boost tapers to 0. Open implementation question for later: is boost additive
per‑bounce, and is max‑height a per‑bounce ceiling or a cap on accumulated velocity? Not resolved —
decide when this is actually scoped.

**Effort:** MODERATE — genuinely new physics interaction, not a jump‑pad reskin.

---

## 15. Online / Multiplayer UX direction  *(discussion captured 2026‑07‑08 — not yet built)*

Current "Online Play" hub is one UI serving two different needs. Direction agreed:
- **Public matchmaking** (find a match with strangers) → this is what Arena's eventual online
  rework should become. Keep "Online Play" as this hub, once Arena's online engine is reworked.
- **Private co‑op with friends** (Campaign, Normal, Platformer) → doesn't need a hub. An
  **"Allow friends to join"** toggle directly on the game‑creation/continue screen is the right
  spot, since the player is already there deciding to start that specific save.

World Selection redesign (Sandbox "Made by" filter + search, Arena quickplay → "Random Map") are
low‑risk wins that don't depend on this — do those independent of timing. The bigger nav
restructure (Campaign becoming the flagship first button, Tower Defense's own campaign + Arena
mode) is intentionally **deferred until Campaign mode (§12) is real enough to design the menu
around** — redesigning navigation now risks redoing it once Campaign actually exists.

Three‑campaign‑slot idea (Main / Private / System Add‑on, swap loses progress) — no concerns,
reasonable tradeoff for a later feature.

Campaign's Phase 4 overworld map (§12) and Tower Defense's proposed top‑down secondary view (§11/§4)
are both low‑res top‑down renderers — build one shared substrate if/when both happen, don't
duplicate.

---

## 16. Mob Variety / Configuration Engine  *(idea captured 2026‑07‑08 — explicitly NOT part of the Smart Mobs build)*

A more sophisticated mob engine allowing Sandbox designers to pick which mobs are supported in a
world and configure basic parameters per mob. Selected mobs become available in the mob
configuration tool and as spawn eggs. Longer‑term payoff: enables alternate game modes/worlds
built around non‑Minecraft mobs, not just the fixed default roster.

**Relationship to the Smart Mobs work (specced 2026‑07‑08, not yet built — see the *Bug Fixes +
Smart Mobs brief*):** Smart Mobs adds intelligence (wayfinding, detection, pack behavior, etc.) to
the *existing* mob roster. This item is a separate, later effort — a designer‑facing mob
*roster/config* system. Smart Mobs' per‑mob‑type behavior parameters (aggression, retreat
threshold, etc.) are a natural fit to eventually expose through this engine's configuration UI,
once both exist.

**Effort:** LARGE — new Sandbox tooling, spawn egg system extension, config schema per mob.

---

## 17. Item Enchantment System  *(idea captured 2026‑07‑08)*

Captured directly from the trait‑based weapon system in the Smart Mobs brief (specced 2026‑07‑08,
not yet built): the Crossbow's piercing/multi‑hit trait is to be built as a generic, **composable
attack trait** rather than a Crossbow‑only special case, specifically so it can later be granted to
other weapons (e.g. a Bow) via an enchantment rather than being hardcoded. This item is the
enchantment system itself — a general mechanism for granting/upgrading weapon traits (piercing,
damage, cleave count, etc.) independent of base weapon type.

**Reuse:** the weapon‑trait architecture from the Smart Mobs build is the direct foundation —
enchantments should read as "grant/modify a trait," not introduce a parallel system.

**Effort:** MODERATE‑LARGE, depends heavily on how many enchantment types are in scope for v1.

---

## 18. Suspicion / Alert Threshold Detection Meter  *(idea captured 2026‑07‑08 — fast‑follow to Smart Mobs' detection system)*

The Smart Mobs build (specced 2026‑07‑08, not yet built) uses **instant per‑axis detection** —
sight, sound, or action triggers alert immediately, whichever axis fires. A more forgiving and
skill‑expressive alternative: an accumulating **suspicion meter** per mob that fills based on
detection signals (partial sight, faint sound, proximity) and decays over time if the player breaks
contact, only triggering a full alert once it crosses a threshold. This rewards partial stealth (a
near‑miss doesn't instantly fail the player) in a way instant detection can't.

Deliberately deferred rather than built alongside instant detection — it's a genuine refinement,
not a requirement, and doubling up on both detection models in one pass isn't worth the risk.

**Effort:** MODERATE — builds directly on the detection‑signal plumbing from Smart Mobs.
