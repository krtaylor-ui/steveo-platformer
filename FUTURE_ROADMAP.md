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
- **▶ CAMPAIGN MODE (§12) — THE NEXT MAJOR INITIATIVE.** As of 2026-07-26, Kevin is drafting a **large,
  detailed prompt** that will cover: (a) the **Campaign Builder** (how designers sequence existing worlds
  into a campaign — Kevin leans toward an explicit per-exit level *graph*, not a rigid ordered list —
  assign which world each coloured Goal-Star exit routes to, flag bonus/secret levels); (b) **how you
  play through** a campaign (progression save, cross-level carry-over of inventory/points/emeralds/lives
  with health reset per level, game-over on zero lives); and (c) **likely changes to the main landing
  page** (Campaign becoming a flagship entry point — see the §"Landing page / hub" notes below). Phase 1
  groundwork already shipped (builds 67–72: multi-colour Goal Stars, `_wonExitColor`, scoring). **Do not
  start building until Kevin's prompt lands** — the builder needs to be well thought out (his words). Full
  design detail in §12 below.
- **Dedicated per-mode front-ends ("Speed Runner" app + "Platformer" app)** *(idea captured 2026-07-25; deferred by Kevin until fleshed-out dedicated levels exist)* — streamlined landing/entry pages that present ONE mode as a finished game rather than the full build-platform. Feasible TODAY with no data-model change: worlds are already tagged by `mode`, auth is shared Supabase, and the community browser already filters by mode. **Recommended Approach B:** separate entry pages (e.g. `speedrun.html` / `platformer.html`) that boot straight into a mode-filtered curated list + leaderboard, hiding Sandbox/editor chrome; same accounts + same DB underneath. Est. ~one session per app (low–medium). **Blocked on:** a set of dedicated, fully-fleshed-out levels worth fronting — revisit once Campaign mode has produced them.
- **GOD-mode designer settings list (Platformer)** *(idea captured 2026-07-25)* — hide the many minute UX/feel toggles (the "advanced" world settings) behind a **God/Designer mode** so a normal player sees a clean, short settings list while a designer can flip into the full expert set. Essentially a visibility tier on top of the existing `advanced: true` flag each setting already carries — likely a single "Designer Mode" switch that reveals all `advanced` rows regardless of their `dependsOn`. Low effort; deferred by Kevin ("future work for now").
- **Combat & Controls mega-session follow-ups (deferred 2026-07-19; from the build 173–179 run):**
  - **Player / designer-created combos.** Now that Phase 7 ships a **data-driven combo list**
    (`js/combos.js` `COMBOS.DEFS` — each combo = input sequence + finisher + enable flag), the natural
    next step is letting players (or Sandbox designers) DEFINE their own input-sequence combos rather
    than only the two built-ins (Rising Strike / Sweep Slam). **Direct dependency:** builds on Phase 7's
    `COMBOS.DEFS` schema + `COMBOS.advance()` matcher — a custom combo is just another entry in that list.
  - **Combo testing mini-game.** A practice space to drill specific combos, and where designers can
    verify a custom combo (above) is actually executable + feels good. Relevant once custom combos exist.
  - **Jump Attack.** A melee attack variant triggered during a jump — likely two variants (a normal-jump
    one and an air/double-jump one). Deferred by Kevin; captured here. Would slot alongside the Phase 6
    directional-melee system (another `traits.dir`-style context, e.g. an `'air'` variant).
  - **Directional-melee per-weapon-class ANIMATIONS.** Phase 6 shipped the directional mechanics
    (targeting, height dodge, damage/knockback/reach) but NOT distinct per-direction/per-weapon-class
    swing art — `player._attackDir` is set for a future animation pass. This is the flagged art follow-up.
  - **Grapple polish:** reuse the real ledge-climb (`_hangState`) animation for the 1-block climb-over
    (currently a self-contained scripted lerp); optional cable-vs-terrain collision. Feel-tune the swing.
  - **Held-boomerang / held-grapple sprites** (both currently fall back to the generic melee/ranged draw).

- **Session follow-ups (2026-07-19, mentioned but not actioned during the build 114–172 run):**
  - **Companion "!" polish** — when the companion repeats the same failed maneuver twice, try a
    *different* approach before flashing the yellow "!" (summon prompt); and add a **visual cue for
    follow-mode / repeat-mode** so the player can see the bot's state. (Companion summon itself
    shipped: press **C** while "!" is active.)
  - **Touch Controls On/Off/Auto toggle in Settings** — auto-detect (`js/touch-controls.js`) can
    misfire on hybrid touch+mouse laptops. Build 171 made it default to mouse when a fine pointer
    exists, but a user-facing toggle (Auto / Force-on for tablets / Force-off) would make it
    explicit. Root-cause context: the touch aim pad (`.tc-aimpad`) once overlaid the arena screen
    and ate mouse right-clicks — see `DECISIONS_LOG.md` (2026-07-19).
  - _Resolved, no action:_ the old "automatic weapon switch to sword" fallback — the two-button
    scheme (LEFT=melee / RIGHT=ranged, weaponMode is cosmetic) makes it unnecessary; not present.
- **Smart Mobs** — LARGELY BUILT. The weapon/UX half (traits, crouch/sneak, Leaves/Bushes)
  shipped builds 73–99; the **mob-intelligence half (§4–§10): detection (sight/sound/action),
  pack behaviour, sprint-telegraph, flee-at-low-HP, spider webs, + decorative foliage** shipped
  builds **102–107** on branch `smart-mobs-detection` (headless-verified, browser-UNTESTED,
  awaiting Kevin's playtest + merge). **Only §6 Wayfinding & ambush-from-above remains** — its
  own mini-project (needs a tile A*/navmesh; see CONTEXT_SUMMARY "§6 Wayfinding" recommendation
  + the shared-navmesh note in §4 below). Still the foundation §16/§17/§18 cross-reference.
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
- **GENDER-NEUTRAL WORDING (hard rule, project-wide).** Players pick any sprite for
  themselves and their co-op companion/bot, so the game must never assume gender. Use
  "you" / "the player" / "the companion" / "the bot" / "it" / "they" — never he/she/his/her
  — in this guide AND in all tooltips, notifications, HUD, and menu copy. ("Steve" / "Alex"
  are sprite names and are fine as labels.) Check every gendered term against this rule.
  (Kevin's request, 2026-07-14; mirrored in CONTEXT_SUMMARY + DECISIONS_LOG.)
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

## 12. Campaign mode — sequenced levels with branching exits  *(vision agreed 2026‑07‑07; Phase 1 SHIPPED builds 67–72; **MVP SHIPPED build 278, 2026‑07‑28 — see below**)*

> **STATUS 2026-07-28 — FINALIZED / SUPERSEDED.** The Campaign **MVP shipped** per Kevin's "Campaign Mode
> MVP" brief (2026-07-27), on branch `campaign-mode-mvp` (build 278), awaiting his end-to-end playtest before
> merge to `main`. What shipped: the Campaign container (Zones of sequenced Platformer worlds ending in a
> computed Boss World), coloured Goal-Star exit routing (star 1 = next / boss→next-zone; 2–10 = bonus/connect,
> incl. hidden secret routes), the **Campaign Builder** (Sandbox tool + Campaign screen: zone tabs, guided [+]
> flows, publish validation gate), server-backed storage (`campaigns`/`campaign_progress`; only
> `krtaylor@gmail.com` publishes, one live at a time), carry-over + best-ever-score + lives, and a per-zone
> progression tracker (completion screen + pause menu). New files `js/campaign-{model,api,builder,tracker,
> play,select}.js`, `server/campaign-routes.js`, `server/sql/campaigns.sql`; minimal additive game.js hooks.
> Full rationale + every assumption in `DECISIONS_LOG.md` (Campaign MVP entry). **The Overhead Engine** (the
> free-roam top-down world map / elevation / buildings / towers that Phase 4 below implied) was deliberately
> **split off as its own major initiative — now §24 below.** The remaining Phase-1 vision text is kept for
> provenance.

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

## 19. Full controls‑config UI (arbitrary key/button rebinding)  *(spec 2026‑07‑12 — foundation shipped, capture UI deferred)*

**Shipped (Smart Mobs builds 77–81):** the input layer is now remap‑ready — combat routes through
named actions (`input.isMeleeAttack()` / `isRangedAttackDown()` / `isThrow()`), and gamepad **face
buttons pass through `_faceRemap`** with **controller presets** (Xbox/Default identity, **Nintendo
Switch** face‑swap) selectable in the pause‑menu Settings tab and persisted to localStorage.

**Deferred (needs a live‑testing session — key/button *capture* can't be verified headless):**
- **Rebind grid:** a Controls settings panel listing every action (jump, move L/R, crouch, melee,
  ranged, place, throw, hotbar slots, inventory, …) with a "click → press a key / press a button"
  capture flow, per‑player (up to 4). Store overrides in localStorage; migrate the currently‑
  hardcoded `input.js` helpers (jump/move/crouch/hotbar) to read the binding map (combat + face
  remap already do).
- **Presets:** Default, **Minecraft** (right‑click = place, left = attack/mine — i.e. undo the
  Shift+Left‑click place default), Xbox, Switch. Auto‑suggest a controller preset from `gamepad.id`.
- **Conflict detection** (warn when two actions share a binding) + reset‑to‑preset.
- **Effort:** MODERATE. The seams exist; the bulk is the capture UI + the full action‑map migration
  + browser/gamepad testing. Do it in a session where the app can be driven live.

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

## 20. Co-op / Companion selection UI placement  *(flagged 2026-07-14)*
Companion-bot + co-op selection currently lives in **World Settings → Players**
(`companionBot`, `p1Char`/`p2Char`, `companionTeleport`, etc.). Kevin wants co-op/
companion selection to move to the **Platformer START menu** (choosing to start a
platformer game), and eventually the **continue-game screen** — it's a per-session
play choice, not a world property. World Settings can keep the advanced knobs
(teleport range, stuck behavior) but the "play with a companion? which character?"
choice belongs at game-start. Low effort once there's a platformer start/continue
screen to hang it on. Until then, `companionBot = Off` removes it.

## 21. Bot navigation — openable doors & crawl gaps  *(flagged 2026-07-14, deferred)*
Kevin flagged two nav capabilities to add after the core maze pathing is solid:
- **Redstone doors (trapdoor / piston):** the bot should treat an openable door as a
  passable route and actually operate it (path to the lever, toggle, go through). Today
  closed trapdoors/pistons are solid to the nav (the Speed-Run generator's *validator*
  now treats them as passable for reachability, but the live bot doesn't open them).
  Needs: nav "conditionally-passable" edges + an actuator step to trigger the linked
  lever/plate. Ties into the redstone graph (`redstone.js`).
- **Crawl through 1-tall gaps:** a 2-tall bot can't fit a 1-tall opening, but with the
  crouch/sneak state it could crawl. Needs a shorter body profile in `navStandable`/
  `navJumpClear` (1-tall) for cells the bot can only pass while crouched, and the
  actuator holding crouch through them. Reuses the Smart-Mobs crouch state.
Both are MODERATE; do after maze/platform nav feels right.

## 22. Companion "stuck" detection, retry, and follow-mode cues  *(flagged 2026-07-14)*
Kevin, after the two-level climb fix (build 146): the yellow "!" appears too fast, and he
wants smarter give-up behaviour + a visible follow-mode cue. Plan:
- **"!" only when GENUINELY stuck.** Today it fires purely on a distance-stall timer
  (`_ccStuck > BOT_COMPANION_WARP_STUCK`, ~0.75 s) in the teleport-OFF path. Gate it on the
  actuator having actually EXHAUSTED its escape attempts (`_escapeCount > BOT_ESCAPE_MAX`
  → the "back up and jump, then re-decide" cycle) so the "!" means "tried and failed",
  not "hasn't arrived yet." (The climb fix already removes most stalls, so re-tune the
  threshold against real post-146 behaviour.)
- **Self-detect a repeated pattern + try a DIFFERENT approach.** The escape logic already
  varies the retry (reverse dir + jump, then drop-goal/re-path). Extend to: on the 2nd
  identical failed pattern, deliberately perturb — try the OTHER take-off side, a longer
  run-up, or a different path node — before escalating to "!". Kevin: "try a different
  approach if it repeats the same pattern twice, and only after a few attempts → Yellow."
- **Visual cue for Follow / mirror mode.** When `_mirrorTimer > 0` (copying the player's
  inputs to thread a route), draw a distinct marker over the bot (e.g. a small linked-arrows
  / footsteps icon, or a coloured outline) so it's obvious the bot is in "repeat mode."
  Pairs with the existing yellow "!" (stuck) mark in player.js `_stuckMark`.
- Kevin's aspiration: a model smart enough that follow-mode isn't needed — treat mirror
  mode as the safety net, and keep improving autonomous climbing so it rarely triggers.
LOW–MODERATE; best done right after Kevin re-tests the 146 climb fix.

## 23. Platformer/Normal Co-op UX Redesign *(idea captured 2026-07-20 — deferred until Campaign mode's dashboard/landing page rebuild)*

Currently 2-player co-op for Platformer/Normal is toggled from the Settings page. Planned redesign:
- A game-start-time choice (1 player vs. 2-player co-op) rather than a settings-page toggle,
  including the ability to continue a previously-started 1-player game.
- Likely requires a new top-level layout: single-player games, multiplayer games, online play,
  as distinct sections rather than the current flat structure.
- A dedicated 2-player popup/menu (skin selection, bot-vs-human, per-player control settings)
  rather than folding all of this into the existing pause-menu dropdown.
- The bot-vs-human split (immediate fix, shipped 2026-07-20 — the pause "Players" selector now
  offers 1 Player / 2 Player (Human) / 2 Player (Bot), the Bot case reusing the companion-bot
  infrastructure) is the interim solution until this redesign happens.

**Effort:** LARGE — tied to the broader dashboard rebuild, not a standalone change.

---

## Moving Platforms + redstone Target Block  *(vision captured 2026‑07‑27; in design — Kevin to write a detailed prompt after we align on the redstone overlap)*

**Kevin's vision.** Platforms that ride a designer‑drawn TRACK:
- **Movement triggers:** (a) moves only while the player STANDS on it (stops when they step off);
  (b) moves on its own automatically; (c) triggered by the player stepping on — then it does NOT stop.
- **Path behaviour:** ONE‑WAY (doesn't return) or BOUNCE (back‑and‑forth along the path).
- **The platform** = connected blocks the creator places.
- **The track** = a separate PATH (reuse the Travel‑Tube placement engine — click waypoints).
  Shown as a solid track, a non‑solid track, or an invisible non‑solid path.
- **Direction blocks** (hit by the sprite OR shot with a ranged weapon) → flip the platform's
  direction along the track.
- **Conditional / switchable track pieces** that appear/rotate when a CONDITION is met:
  a pressure plate pressed, a target block hit by an arrow, a block hit by the player. A piece can
  **rotate down like a drawbridge** to connect two paths (if it isn't closed in time the platform
  falls); or **appear out of a wall**. Switchable pieces can be invisible if the main track is.
- **Redstone compatibility (the key ask):** the trigger blocks (direction‑turn + track
  appear/disappear/rotate) should work with redstone. For consistency a transmitter/receiver can
  pass a signal — BUT the main requirement: **if an ACTIVATED redstone‑dust path is TOUCHING a
  trigger block, that should activate the block too** (even if it wasn't physically hit).
- **New redstone item to add alongside: the TARGET BLOCK.** Hit by an arrow → sends a redstone
  pulse, OR (designer option) toggles ON; if toggle mode, hitting it again with any attack
  (arrow / trident / melee) turns it OFF.

**Extra ideas (my additions for the platform system):**
- Speed + easing per platform (constant, or ease at the ends of a bounce).
- Pause‑at‑waypoints (dwell N frames at a marked stop) — great for timed puzzles.
- "Sticky top" so riders (player, mobs, dropped items) move WITH the platform cleanly (the build‑225
  depenetration already stops carry‑through‑solids; carrying needs a proper rider‑delta apply).
- Carry mobs + dropped items, not just the player.
- Multiple platforms per track (spaced) / a platform that spans a gap only while a drawbridge is down.
- Collision: a platform pushing a player into a wall should shove/stop them (reuse depenetration).
- Fall behaviour when a drawbridge times out (platform + rider drop; rider takes fall damage or not,
  per setting).

**MY RECOMMENDATION on the redstone question (do we flesh out redstone first?): YES — build a small
redstone FOUNDATION first, then the platform is a clean consumer of it.** Reasons:
1. The whole "trigger blocks → turn direction / show‑hide / rotate track" system IS a redstone
   consumer. If we model triggers as redstone SINKS from day one, the drawbridge/appear/direction
   logic all runs off one signal path — no bespoke wiring, and it composes with existing
   levers/plates/pistons.
2. The **Target Block** is a natural redstone SOURCE (pulse or toggle) — build it as part of the
   foundation; it then powers platform triggers, pistons, doors, anything, for free.
3. The "activated dust touching a trigger powers it" rule is a general **redstone‑adjacency** rule —
   worth adding to the redstone engine once (helps all consumers), not special‑cased to platforms.

**Suggested phase order:**
- **Phase R (redstone foundation):** Target Block (pulse + toggle‑off‑on‑hit); the
  adjacent‑activated‑dust‑powers‑a‑consumer rule; confirm transmitter/receiver still bridge. Small.
- **Phase P1 (platform core):** platform = connected blocks; track via the tube placement engine
  (solid/non‑solid/invisible); movement modes (rider‑powered / auto / triggered‑continuous);
  one‑way vs bounce; rider carry (player first). Medium‑large.
- **Phase P2 (triggers):** direction blocks (hit or shoot) + redstone‑driven direction flip.
- **Phase P3 (switchable track):** drawbridge‑rotate, appear‑from‑wall, condition‑to‑show, invisible
  switchables — all driven by the Phase‑R redstone signals; timeout‑fall behaviour.

**Open questions for the detailed prompt:** how a platform's block‑group is authored + bound to a
track; how the track direction maps to platform facing on turns; whether platforms collide with
each other; multiplayer (do all riders move; who "owns" a rider‑powered platform).

---

## Moving Platforms — status (mega session builds 245–253 → playtest + wrap-up 254–277)

**The moving-platform system is now FEATURE-COMPLETE and shipped/deployed (through build 277).** Core
(rail, anchor, platform, carrying, pause nodes, multi-platform weight collision, direction controller,
speed segments, launch platform, center of gravity, rail gate) plus everything below.

**✅ SHIPPED since the mega session:**
- **§7 Switchable Rail Segment — SWITCH / branching (build 277).** `BLOCK.RAIL_SWITCH`: a pivoting
  2-point rail (pivot → live route end) that rotates A↔B (flips on listen channel OR adjacent redstone),
  with rail-to-rail hand-off at coincident terminals. Integrated via `isSwitch` on the `_rails` model.
- **On-platform physical redstone (builds 262–268).** Redstone now rides + FUNCTIONS on a moving
  platform (captured into `_carriedRs`, re-keyed each cell-crossing, INSTANT propagation while carried).
  The Direction Controller can now also read adjacent on-platform inputs, not only wireless channels.
- **Weight Sensor (270), conduct toggle on all devices (271), animated + block skins (271/272),
  sticky config (273/274), platform-lamp render fixes (275/276), Delete Whole Platform (269).**

**Still deferred (pull in when a level needs them):**
- **§7 — the 4 ANIMATED visual styles** (Drawbridge / Rise-from-Below / Extend-Retract /
  Dissolve-Materialize) + the "arrived mid-transition → platform falls" race. (The Rail Switch covers
  branching; these are the *decorative* appear/rotate styles.)
- **§12 TNT Launcher** — motivates LIVE/dynamic platform-connectivity recompute (destroyable platform
  blocks mid-game), which the "flood-fill once at load" model does not do.
- **§12 In-game / player-buildable platforms** (authoring is Sandbox-only today).
- **§12 One-Way Gate segments** and **Platform Coupling** — out of scope, captured only.
- **Platform physics feel** — max-rotation / slip angle / ice surfaces (Kevin deferred).
- **Per-block-type weights** — `_blockWeight` exists but every type is 1; needs only a lookup table.
- **Redstone dust placed ON TOP of devices** — the general form of the conduct toggle (Kevin floated it).

---

## 24. Overhead Engine — free-roam top-down substrate  *(SCALE MODEL now speced in §39 — read that first)*

> **See §39** for the agreed scale/nomenclature model (Plan A block-elevation, tiling, mining, grid-lock, independent zoom ratios).

### 24-orig. Overhead Engine — free-roam top-down substrate  *(split from Campaign §12 2026-07-27; **MVP FOUNDATION BUILT build 279, branch `overhead-engine`, 2026-07-28** — see status note)*

> **STATUS 2026-07-28 — MVP FOUNDATION BUILT (depth-first), browser-UNTESTED, NOT merged.** Built per the
> "Overhead Engine (FULL BUILD — MEGA SESSION)" brief on branch `overhead-engine`. **SHIPPED + headless-tested
> (122 assertions):** the full pure substrate — `js/overhead/overhead-{grid,elevation,buildings,map,movement,
> controls,combat,modes,campaign-map}.js` (grid/zoom, staircase elevation + autotile, building taxonomy,
> Map/World version-linking + Test overlay + Extract-Map matrix, jump + limb anim, 3 control schemes, cone/
> radius/line combat, mode rulesets + two-tier tower placement, top-down auto-path A*). **SHIPPED browser-
> untested:** a playable `OverheadGame` runtime (Sandbox → "🗺 Overhead Demo") and a functional `OH_EDITOR`
> authoring loop (Sandbox → "🗺 New Overhead World"), plus a Campaign Builder "Create World Map" entry.
> **PARTIAL / next-session:** TD/MOBA gameplay loops (rulesets + constraints proven, not run), Arena-overhead
> translation, redstone-in-overhead, the World-Placement mode + lane preview (auto-path proven; node-binding
> UI partial), explicit stairs/ramps placeables, editor refinements (hover tabs / MRU / line-drag / path &
> redstone placement / server publish), Test-Mode Relink + Extract-Map editor buttons. **NOT built (scope
> §17):** full LOS/ranged-blocking (architected stub only), Sports/RTS, MOBA hero mechanics, touch controls,
> live multiplayer. **KEY FINDING:** the side-view Wayfinding pathfinder was NOT directly reusable for
> overhead node-connecting (side-view standable/gravity/jump-arc model) — a lean top-down A* was written
> instead. Full detail + all assumptions in `DECISIONS_LOG.md` (Overhead Engine entry). The remaining vision
> below stays the standing spec for the next passes.

**This is its own major project, NOT part of the Campaign MVP.** Campaign's MVP progression UI is a simple
non-interactive per-zone dot tracker; the Overhead Engine is the future free-roam, top-down, spatial world.
Kevin's explicit direction: build it as **one shared "Overhead Engine" substrate** (mirroring how Arena's
Rules Engine made modes data-driven) with **Campaign's overworld map, Tower Defense, MOBA, Sports, and RTS**
as different rulesets/configs ON TOP of one engine — not five separate top-down engines. **Honest scope
note:** this is likely the least-code-reuse, highest-novel-complexity system we've attempted; the rendering
foundation alone (grid / elevation / zoom-layers / autotile) probably deserves its own dedicated session
BEFORE any placement/gameplay features are attempted.

**Rendering foundation (do this first, on its own):**
- **4-concept zoom model:** (1) **grid size** — fixed at world creation, sprite-unit based; (2) **grid
  density** — 1×1 to 4×4 sub-block resolution per cell; (3) an **object-layer scale** that can be independent
  of, or configurably track, the background layer's scale; (4) a separate **live master zoom** applied to
  everything together.
- **Elevation (2.5D "staircase" trick):** Y-offset per level + a cliff-face texture + draw-order sort by
  (row + elevation); an **autotile system** for directional walls (bitmask tile selection from neighbouring
  cells); per-world settings for how many elevation levels block line-of-sight / ranged attacks and how many
  hide a character; explicit **Stairs / Ramp** placeables; a tiered **Auto-Climb** setting
  (disabled / 1-level / 2-level / unlimited).

**Content schema (designed so new types are DATA, not bespoke code — unlike the historical ad-hoc
Nether/End/Wither portals):**
- **Building taxonomy:** `category`, `footprint`, `blocksMovement`, `interactionType`
  (`enter | interact-on-approach | passive-visual`), `skinVariants[]` (reusing the click-to-cycle pattern
  from decorations), `elevationOffset`, `onInteract`. Future building types = new schema entries.
- **Teleportation:** each zone/portal independently configures its OWN destination (NOT automatic
  reading-order pairing — a deliberate departure from the Warp Pipe's simpler pairing, following the Nether
  Portal precedent).

**Gameplay layers (on top of the substrate):**
- **Mob movement — a three-state cycle:** fixed-path (Tower Defense) → free-roam-on-detection (MOBA-style,
  reusing the `roams: true` escape hatch already sketched in §4b) → **automatically resume fixed-path once no
  enemies remain in detection range.** Roll out fixed-path first, then the reactive switch, then full
  Smart-Mobs-style free-roam.
- **Tower placement — a two-tier constraint model:** global per-world defaults (spacing, distance-from-path,
  elevation restrictions), overridable **per tower TYPE** (e.g. a "floating tower" type ignoring normal
  placement rules) — never per individual tower instance.
- **Weapons:** a genuinely separate weapon system for the Overhead Engine (guns, magic, etc.) — not required
  to mechanically match side-view combat; cross-view consistency (if a designer builds in both) is the
  designer's responsibility, not the engine's.
- **Multiplayer:** architect for it (the same way Arena's `players[]` model works), but solo-only is fine for
  the initial build.
- **Authoring tools:** brushes, templates, and similar productivity tooling for designers building these
  larger/denser worlds.

---

## 25. Game Designer Wizard / disaster-check tool  *(first two checks now exist — Campaign MVP build 278)*

A designer-facing "sanity wizard" that catches level/campaign mistakes before publish, growing incrementally
as real mistakes surface. **Its first two concrete checks now exist**, in the Campaign publish validation
gate (`CAMPAIGN_MODEL.validateForPublish`, §6 of the Campaign MVP brief): (1) every included World has at
least one placed Goal Star; (2) every placed Goal Star has a resolved route. Future checks fold in here as
patterns emerge (unreachable worlds, orphaned zones, a Goal-Star colour placed but no matching route type,
soft-locks, etc.). **Tips/hints library seed:** the concrete sample tip already shipped in the Builder —
*"place an early secret exit in a later World that loops back to an earlier completed one, since players can't
otherwise revisit a completed World"* — is the first entry for a future contextual-tips library.

---

## 26. Native screen capture  *(idea captured 2026-07-27; V2+ polish, low–moderate effort)*

Client-side gameplay recording with **no server involvement**: `canvas.captureStream()` + `MediaRecorder`,
optionally routing game audio in via a `MediaStreamAudioDestinationNode`. A "Record" toggle + "Save Clip"
button is a reasonable scope. Not critical.

---

## 27. Image-to-block converter  *(idea captured 2026-07-27)*

A **decorative/mosaic** tool: downsample an uploaded image to a target grid resolution and match each cell to
the nearest available block colour (colour quantization). **Explicitly a mosaic tool, NOT a level-structure
generator** — inferring walls/spawns/gameplay from an arbitrary photo is a much harder, unreliable problem and
is out of scope. Useful for both the existing side-view Sandbox and the future Overhead Engine (§24).

---

## 28. Explicit manual save-points for Campaign mode  *(partially shipped 2026-08-13; explicit save-points still deferred)*

**Shipped (build 509):** resume-exact-spot **autosave** — a mid-level snapshot is banked every ~8s and on
exit, so leaving mid-level resumes at the exact position/health/inventory (not just at the last transition).
There is intentionally **no player-facing "manual save" button** — saving is automatic.

**Still deferred:** letting players place *explicit* save points / checkpoints for more deliberate control
over where a run resumes. Revisit once Campaign is live and there's real player feedback on whether the
autosave feels sufficient.

---

## 29. Multi-user Campaign publishing + selection UI  *(deferred from the Campaign MVP, 2026-07-28)*

The Campaign MVP supports exactly ONE published campaign system-wide, publishable only by `krtaylor@gmail.com`
(the data model + server routes already support many campaigns; only the publish policy is restricted). When
publishing opens up beyond that single account, players need a UI to **browse/select among multiple published
Campaigns** — likely modelled on the existing Community Browse / world-selection patterns. Lifting the
restriction is a small server change (`ADMIN_EMAIL` gate + the single-published invariant in
`server/campaign-routes.js`); the new selection/browse UI is the real work.

---

## 30. NPCs / Villagers  *(idea captured 2026-07-28)*

> **DESIGN SPEC (2026-08-13):** full build-ready brief now at docs/NPC_DESIGN_SPEC.md (both engines, dialogue model, v1/v2/v3 tiers). Kevin flagged P1 + 'also need side scroll'.

Surfaced during Overhead Engine design discussion (the universal Action button was explicitly
designed to eventually support "talk to NPCs" alongside opening chests / triggering levers / entering
buildings). Likely scope when this gets designed for real: a dialogue system, possibly trading/quests
eventually. Not designed further than that — deserves its own full discussion when the time comes,
same treatment as Sports / RTS / MOBA Hero mechanics.

**Effort:** LARGE, genuinely undesigned beyond this note.

---

## 31. Overhead building/sprite SKIN BUILDER  *(now also the PREFAB / structure creator — see §39)*  *(idea captured 2026-07-29)*

The Overhead Engine draws each building type from a data-driven `drawBuilding(type, …, skin)`
with a `skin` field on every placed instance (only the `'default'` skin ships today). Eventually:
an in-game **Skin Builder** where players design custom skins for buildings (and player/mob sprites,
which already route through the `OH_SPRITE` colour palette) and save them per-account, selectable per
placement. Scope when designed: a small pixel/shape editor + a skin store keyed by type; the render
layer already dispatches on `skin`, so it's additive. **Effort:** MEDIUM–LARGE; undesigned beyond this.

**Folded in here (Kevin, 2026-07-29, build 291):** **block-built portals + block-built buildings** —
rather than the current single procedural `drawBuilding` model per type, let a designer ASSEMBLE a
building/portal out of actual blocks (e.g. an obsidian frame around glowing-purple portal blocks) drawn
from a **larger, hidden palette** (portal-glow, obsidian, decorative blocks not on the main terrain rail).
This is really the same Skin Builder need at the "map-creator" scale — a mini-map editor with an expanded
palette whose output becomes a building/portal skin. Deferred here so the base engine ships first; when
built, the assembled block-grid becomes just another `skin` the render layer already dispatches on.

## 32. Redstone in the Overhead Engine  *(STEP 1 SHIPPED build 298 — grid-agnostic core + channels; more devices/config still to do)*

**Done (build 298, branch `overhead-redstone-bridge`):** a NEW pure, grid-agnostic core `overhead-redstone.js`
(`OH_REDSTONE`: levers/buttons, dust wire, lamps, tx/rx, a named-channel table, `evaluate()`), wired into the
overhead runtime (evaluated per frame; levers flip on E) and editor (Lever/Dust/Lamp palette). The drawbridge
consumes it via channels. **Still to do — KEVIN'S SPEC (2026-07-29, batch 3):**
- **New devices, sized to the player sprite** (character-scale like levers now are): **pressure plates**,
  **weight-detecting blocks** (reuse the side-view weight-sensor idea), **pistons** (push/retract a block —
  a natural drawbridge-alternative + puzzle piece), **AND gate**, **NOT gate**. "Treat redstone PATHS as
  natural AND gates" — interpret dust junctions/logic so a path only conducts when its feeding inputs agree
  (confirm with Kevin whether he means dust = AND at merges, vs. standard OR + explicit AND-gate devices;
  ship the explicit AND/NOT gate devices regardless).
- **Transmitters + receivers on ALL sinks and sources** (keep redstone dust for local logic too): every
  device can optionally TX (broadcast a channel) and/or RX (listen to a channel). The drawbridge already
  auto-acts as an RX on "gate" — generalise it.
- **Config modals via Hand-click** (like the side-view device popups): clicking a device with the Hand opens
  a modal. Receiving devices get an **optional transmitter SOURCE selector that cannot be left unset** (if a
  device is set to receive, it must pick a valid source channel/transmitter — validate on save).
- Then the original goal: **extract the side-view `js/redstone.js` onto this same core** so both grids share
  one engine. The remaining plan (unchanged):

Kevin wants the existing redstone engine (levers, dust, target block, pulse converter, tx/rx,
adjacency) usable in Overhead worlds, with config modals — and has explicitly flagged it as the next major
piece ("another big rebuild"). This is a substantial integration — the side-view redstone (`js/redstone.js`
+ the `game.js` `_rs*` layer) is tightly coupled to the side-view grid/collision.

**Recommended approach when tackled (its own focused session):**
1. **Extract the propagation core** from `js/redstone.js` into a grid-agnostic module (power sources,
   dust spread, adjacency, pulse/tx-rx, delay) that takes a neighbour function + a cell store — so BOTH the
   side-view and the overhead grid can drive it. This is the bulk of the work and de-risks the rest.
2. **Overhead overlay:** a redstone layer on the overhead grid (devices placed like buildings/ramps),
   evaluated each tick by the extracted core; render wires/power state on the top-down tiles.
3. **NAMED CHANNELS as the integration seam:** reuse the tx/rx channel idea as the world-global channel
   table — this is also what §35b (cross-environment cave↔surface effects) and the switch/weight-sensor
   devices need, so build the channel table once and share it.
4. **Config modals** mirroring the side-view device popups (already the pattern used by portals/pipes/goal).

**Effort:** LARGE — plan for a dedicated session; step 1 (core extraction) is the gate for everything else.

---

## 33. Overhead pipe/portal travel ANIMATIONS  *(idea captured 2026-07-29; a light version shipped)*

Shipped: portals/pipes teleport, both ends glow purple briefly, pipes are Action-triggered. Kevin's full
vision: the player **climbs onto** the pipe, **drops in**, **pops out** the destination and **climbs down**
(and the same sequence when a level starts/ends via a portal-linked spawn). Needs a short transition state
machine that freezes input, plays a scripted climb-in → fade → climb-out animation, then hands control back.
Portals: a walk-in → destination-glow → walk-out flourish. **Effort:** MEDIUM; deferred from the 2026-07-29
batch (the teleport + glow + numbering shipped; the elaborate animation did not).

## 34. Overhead day/night cycle + dynamic elevation shadows  *(idea captured 2026-07-29 — Kevin's "curveball"; MOST OF IT SHIPPED builds 292–293)*

**Shipped in build 292 (base cycle):** per-world **Day / Night** setting + pure `OH_DAYNIGHT` model (phase,
cycle length, ambient tint, on-screen clock, +up-to-40% night mob sight). **Shipped in build 293 (depth):**
the warm dusk/dawn tint was REMOVED for a clean cool fade; nights go up to near-black (`nightDarkness` 0.95);
a faint **toggleable sun/moon disc** tracks the sky; **dynamic elevation shadows** cast from cliff edges away
from the sun/moon (offscreen-composited, edge-only, toggleable) render regardless of the disc; and
**glowstone + lava are light sources** that punch through the dark with configurable reach + brightness.
**Still deferred (the ambitious remainder):** shadows cast by MOBS/PLAYER (entity blob shadows in the sun
direction), a true per-frame heightmap shadow-projection re-bake tied to the static-terrain cache (the
current pass is edge-quads, not a full projected silhouette), and placeable non-terrain lamp objects.

Kevin's original vision: a **day/night cycle** in Overhead mode — a very faint, highly-transparent **sun** (and a
bluish **moon** at night) tracking across the level (L→R / top→bottom / corner→corner). The hard part:
**elevated terrain casts dynamic shadows based on the sun/moon position** (subtle, slightly stretched),
with a smooth darken/transition between day and night. Mobs + players cast shadows too. At night, **lamps
/ light sources** illuminate (and only the sun/moon cast shadows, never light sources). This is a large
rendering feature — dynamic shadow projection from an elevation heightmap per frame (or cached per
sun-step), a time-of-day tint pass, and a light/emission layer. **Approach when tackled:** project each
elevated cell's shadow as a parallelogram offset by the sun vector (reuse the static-terrain cache idea —
re-bake the shadow layer only when the sun moves a step, not every frame); tint the whole scene by
time-of-day; add an additive light layer for lamps at night; give entities a simple offset blob shadow in
the sun direction. **Effort:** LARGE (arguably its own session). Deferred; captured here in full so the
vision isn't lost.

---

## 35. Overhead END PORTALS  *(idea captured 2026-07-29)*

The overhead portal already renders as a standing obsidian frame — a natural base for **End portals**.
When designed: support **Eye of Ender placement** into the frame (fill the frame slots one eye at a time,
like the side-view End portal) and **portal powering** (the portal activates only once fully charged /
eyes placed), then it teleports (or ends the level) as configured. Reuse the existing eye-of-ender item +
the side-view End-portal completion logic where possible. **Effort:** MEDIUM. Depends on the overhead
inventory/items pass being fleshed out (currently items are pickups only).

## 35. Overhead UNDERGROUND / cave mode (negative elevations vs. a separate cave map)  *(design captured 2026-07-29)*

Kevin's idea: let players descend **below level 0** in Overhead view and have it become a **cave** with
limited light (reusing the build-293 day/night darkening + light sources), able to **disable day/night**
down there. Two ways to build it:

**Option A — negative elevations (one map, seamless).** Allow `elevation` cells to go below 0. *What it
touches:* `_elev` returns `row[c] | 0` (fine for negatives), but several render assumptions bake in
elev ≥ 0 — the stacked-cube offset `-elev*Q` would push sub-zero cells DOWN-right (they'd need to render
UNDER neighbours with the opposite face exposed), the static-terrain cache `pad` is a one-sided top margin
sized for positive lift, the draw-order sort keys on `row+elev`, and the overhang/hide pass keys on
`elev > player.elev`. None are unfixable, but it's a real render-model change (two-sided offset + cache pad,
a "depth" shading ramp, and a rule for when going negative flips to "indoors/cave" lighting). *Effort:*
LARGE. *Upside:* seamless surface↔cave in one level.

**Option B — separate cave map (recommended first).** Model the cave as its OWN overhead world with
`dayNight` OFF and a small **ambient light radius around the player** (a new "cave lighting" setting: a
darkness overlay with a player-centred light hole, reusing the exact `_drawNight` punch-through), reached by
a **portal/pipe** from the surface. *Upside:* zero elevation-math changes, reuses everything shipped in
builds 292–293, and each map keeps its own atmosphere — no fighting to balance surface + cave in one scene.
*Downside:* a load/teleport seam between surface and cave (acceptable — pipes already do this).

**Recommendation:** ship Option B when caves are wanted (it's mostly a "player-centred light" setting + a
mode flag), and only pursue Option A if seamless vertical descent becomes a hard requirement. The
player-centred cave light is a small, self-contained addition to the existing night compositor.

### 35b. Seamless surface↔cave in ONE world, with cross-effects  *(Kevin, 2026-07-29 — "not critical, helpful to understand limits")*

Question: can a single world hold BOTH environments, travel between them seamlessly, and have actions in one
affect the other? **Feasible — here's the shape + the limits.**
- **Container:** a world holds an array of *environments* (each its own `mapSnapshot` + entities + settings/
  atmosphere), plus links (a portal/pipe in env A targets a cell in env B). This is the same multi-map
  container Campaign mode wants — build once, reuse.
- **Travel:** the existing portal/pipe teleport already carries the player between maps; extend the target to
  name an environment id + cell. Seamless = a quick fade, not a level reload (same runtime instance).
- **State persistence:** keep every environment's ENTITY STATE in memory (mobs, items, switch/redstone
  states) even while it is not the active/rendered one — so returning finds it as you left it. Cheap:
  it's just data.
- **Cross-effects (the interesting part):** model shared state as **named channels** (exactly how redstone
  §32 will work): a lever/weight-sensor/switch in the cave writes channel "gate-7"; a door/platform on the
  surface listens to "gate-7". The channel table is world-global, so a change in the inactive environment is
  observed when you return (or live, if we tick the inactive env — see limit below).
- **The real limit — simultaneous simulation.** Rendering + fully simulating BOTH environments every frame
  (so a surface timer keeps ticking while you're in the cave) roughly doubles per-frame cost and needs both
  terrain caches resident. Recommended default: **one active (fully simulated + rendered) environment; the
  inactive one holds state and only its CHANNEL outputs are evaluated** (a cheap logic-only tick), not its
  mobs/physics. That gives "a switch here opens a door there" without the cost of running two full games.
  True concurrent simulation is possible but is a perf/complexity step-up — do it only if a puzzle needs the
  inactive world physically moving in real time.
- **Effort:** MEDIUM for the container + travel + persistent state + channel cross-effects (logic-only
  inactive tick); LARGE if full concurrent simulation of both is required. Pairs naturally with §32 (redstone
  channels) and the Campaign multi-map container.

## 36. Overhead BRIDGE item  *(SHIPPED build 298 — walk-over-gap deck + guardrails + redstone drawbridge; 2-wide preset still to do)*

**Done (build 298):** `world.bridges` cell layer; a closed deck spans pits/gaps (walkable, overrides terrain);
Guardrails block/allow falling off the sides; a Drawbridge starts open and closes on its redstone channel
(lever+drawbridge default to "gate"). Editor Bridge tool with Guardrails + Drawbridge toggles; ghosts/undo/erase.
**Still to do:** the "2-wide preset" auto-stamp (bridges currently paint free-form, so you draw the width by
hand); per-bridge channel selection in a config modal; and connecting-different-heights niceties (currently the
creator sets each cell's elevation and the forgiving-ramp climb handles the transition).

**Drawbridge STYLE — Kevin's spec (2026-07-29), a new world setting `drawbridgeStyle: 'animated' | 'vanishing'`:**
- *vanishing* (current) — the deck just appears/disappears when the channel toggles.
- *animated* — when "up" the span lifts to ~80° with a bit of PERSPECTIVE so the raised part reads bigger
  toward the viewer; dropping animates it swinging down and easing the angle back to flat. If the two ends
  sit at different elevation levels, keep a little perspective in the raised pose. Needs a per-drawbridge
  animation phase (0=down..1=up) eased over a few frames on channel change, and a perspective quad render
  for the lifting deck. Original spec below.

A placeable **bridge** that spans gaps/pits and connects cliff edges (possibly of different heights).
Kevin's spec: a preset **2-block-wide** (character-sprite blocks) walkway, painted along a run, with a
user-selectable **"guardrails or not"** — guardrails STOP the player falling off the sides; no guardrails
means they can fall off (into whatever is below).

**Design when built:** a new editor TOOL (like ramp/ladder) storing `world.bridges = [{col,row,rail,elev}]`
(auto-stamp a 2-wide strip perpendicular to the drag direction). Runtime collision: a bridge cell is
**walkable-over-a-gap** (you don't fall through it) at its `elev`; entering/leaving the ends uses the
existing forgiving-ramp climb so different-height connections work. **Guardrails:** with `rail`, moving from
a bridge cell OFF the long side onto a gap/lower cell is blocked (you can only exit at the ends); without,
that move falls through (gap → `_fall`, or into a pit → death). Rendering: plank deck + optional side rails.
Pairs directly with the build-294 pits (bridge a deadly pit) and the cliff-fall guard (a railed bridge is a
sanctioned way across; a railless one is a risk the creator opts into). **Effort:** MEDIUM.

## 37. Overhead editor — selection/clipboard + more painting tools  *(batch 2, captured 2026-07-29)*

**Batch 1 shipped (build 299):** shape tools for dust/bridge/ramp, fill/bucket, eyedropper (Alt-click),
Shift-scroll brush size, shape hotkeys, mode cursors, Escape→Hand→quit-modal, character-scaled devices,
tower 3×3, reveal window.

**Batch 2 — marquee SELECTION + CLIPBOARD (deferred; the interacting, higher-risk piece):**
- **Ctrl + drag** → highlight a rectangular selection, restricted to the CURRENT elevation (only cells whose
  elevation matches the active level are selected — so you can grab one layer of a stack).
- **Delete** → clear all selected cells (terrain + entities on them).
- **Ctrl + C** → copy the selected pattern (relative cells + their keys/elev/entities) onto the cursor as an
  active "stamp".
- **Click** → paste the copied group at the cursor (anchored to the hovered cell).
- Implementation notes: a `this._sel = {c0,r0,c1,r1}` marquee + a `this._clip = [{dc,dr,key,elev,...}]`
  clipboard; a paste ghost preview; Escape clears the selection/clipboard. Keep it on the current-elevation
  filter for select + delete; paste writes at the active elevation. Undo already snapshots the whole world,
  so paste/delete are undoable for free.
- **DOUBLE-CLICK select-connected (Kevin's spec, 2026-07-29):** double-click a cell to select ALL connected
  cells of the SAME type (a flood-fill selection like the bucket, 4-connectivity), then **Delete** removes
  them in one shot — primary use case: pull up a whole bridge run at once. Restricted to ONE elevation, but
  determined by the STARTING cell's elevation — so a bridge that spans two different elevation ends is still
  selected as one unit (match by type/layer + connectivity, using the start elevation, not a per-cell elev
  gate). Works for terrain AND placeable layers (bridges/dust): double-clicking a bridge cell selects the
  whole connected bridge.
- **Clipboard MIRROR / ROTATE + SCATTER brush (Kevin approved):** flip a copied stamp H/V or rotate 90°
  before pasting; a scatter/randomize brush that places with a % chance for natural foliage/rubble.

**Additional painting tools worth considering (Kevin asked "any others?"):**
- **2-wide bridge auto-stamp** — bridges paint free-form today; a preset stamps a 2-cell strip perpendicular
  to the drag direction (the requested default width).
- **Elevation BRUSH / raise-lower** — a tool that only changes elevation (+/-) without repainting the block,
  so you can sculpt terrain height quickly (scroll or drag to raise/lower).
- **Replace-all (global bucket)** — swap every cell of key A → key B across the map (or within the selection).
- **Mirror / rotate the clipboard** — flip a copied stamp H/V or rotate 90° before pasting (great for symmetry).
- **Stamp/prefab library** — save a selection as a named prefab (like the Tree) and re-drop it; a natural
  home for Kevin's future block-built buildings/portals (§31) and rooms.
- **Line-of-elevation ramp** — auto-fill a staircase of ascending elevations between two points.
- **Randomize/scatter brush** — paint a cell with a % chance (for natural-looking foliage/rubble fields).
- **Rectangular select → fill/outline with the pen** (a selection-scoped version of the shape tools).

## 38. Overhead DOORS + CHESTS + key-driven puzzles  *(Kevin, 2026-07-30 — keys + lock block SHIPPED build 306; doors + chests deferred)*

**Shipped (build 306):** KEY items (coloured keys / jewels / passcard) collected onto the player key-ring;
a LOCK block (redstone source) that a matching key powers on E — config picks accepted keys (from keys on
the map), consume-on-use, and toggle-off. Complete key → lock → redstone loop. Plus the editor
"Hide above elevation" view filter for building hidden interiors.

**DOORS (deferred — full spec):** a span entity like the bridge. Placed as a WALL between two waypoints (the
creator sets a HEIGHT). Anchored to the FIRST-clicked point; the door PIVOTS about that anchor (swing
animation). Settings in its modal: swing DIRECTION, INVERT the anchor point, HEIGHT, SKIN (multiple skins),
and how it opens — (a) redstone channel (rxIds, like the drawbridge), (b) a KEY (accepted-keys list + consume,
like the lock block → but here the door itself is locked), or (c) the ACTION button (E) to push it open. A
plain door = openable by E; a locked door needs the key/redstone. Reuse the bridge span infra + the lock's
key logic + the drawbridge's channel/animation. Collision: closed door = solid wall along the span; open =
passable. **Effort:** MEDIUM–LARGE (own batch).

**CHESTS (deferred — full spec):** a placeable that holds a configurable list of items (weapons / keys /
coins), set in its modal. Opening (E, or a proximity trigger) plays an open/close lid ANIMATION and grants
the contents to the player (weapons → hotbar, keys → key-ring, coins → score). Optionally lockable (reuse the
key logic). **Effort:** MEDIUM.

## 39. Overhead SCALE MODEL & authoring tiers — CANONICAL DESIGN SPEC  *(agreed with Kevin 2026-07-30; supersedes the scale bits of §24/§31; NOT yet implemented)*

The reference for how density, size, elevation, mining, and prefabs relate in the overhead engine.
Distilled from the 2026-07-30 design conversation + the comparison artifact (Current vs Plan A vs Plan B).

### 39.1 Nomenclature (use these words going forward)
- **Block** (tile) = one player-sprite footprint = 32 world-px = `unit`. **The gameplay ruler** — distances,
  speeds, elevation, reach, detection are all in blocks. The player is always 1 block; density never resizes it.
- **Subcell** = one fine grid cell = `32 ÷ density` px. **The painting/detail resolution only** — never a size.
- **Density** = subcells per block per axis (1,2,3,4…). A *detail* knob, not a scale knob.
- **Level** = one step of elevation = **one block of height** (Plan A).
- **Zoom** (`masterZoom`) = camera magnification only; zero gameplay effect.
- Quote world size to creators in **blocks** (baseW × baseH), never the fine-grid dims.

### 39.2 The scale decision — PLAN A (chosen), Plan B (rejected for the world)
Root cause of Kevin's pain: elevation + structures render in **subcells** (`elevOffset = cell*0.22`) while the
player/mobs/items render in **blocks** (`unit`), so structures shrink as density rises.
- **PLAN A (chosen):** measure elevation in BLOCKS. One level = one block tall at any density. Fix = a
  render-scale change (`elevOffset`/jump-lift/building/bridge/ramp visuals use `unit`, not `cell`) + elevation
  painting quantized to blocks. **Ramps/collision/climb/jump UNCHANGED.** Density stays purely horizontal.
- **PLAN B (rejected for the open world):** subdivide height by density (N subcells = 1 level). Same look as A
  for a block-tall wall, but forces ramps to climb `density` steps/block and re-defines every "level" — the big
  rework. NOT done in the world; instead allowed *inside prefabs* (see 39.5).
- **Surface vs height split:** the block's TOP SURFACE stays subcell-resolution (fine texture/detail); only
  HEIGHT quantizes to blocks. So Plan A keeps the horizontal detail benefit of high density.
- **Tiling, not stretching:** when a block spans density² subcells, TILE/duplicate the surface pattern (constant
  texel size); do not stretch one texture over the block.

### 39.3 Object scale references (per-thing ruler)
- **Player-scale (block, density-independent), DEFAULT:** player, mobs, items, keys, weapons, redstone devices,
  interactive objects, ramps, bridges, doors, chests, elevation. Footprints defined in **blocks**.
- **Subcell-scale (density-scaled):** raw ground tiles / textures / fine decorative detail (the resolution layer).
- **Independent ZOOM RATIOS (world settings, planned):** buildings carry their OWN zoom ratio so a creator can do
  RPG-style small towns; items/mobs/interactive objects default to **player scale** but each gets an optional
  world-setting override. Ramps scale like structures (block-scaled visual).

### 39.4 Ramps under Plan A
Gameplay unchanged (a per-block "climb the delta here" cell). Visual becomes block-scaled (reads as a full
block-tall wedge). Long-term, replace neighbour-inference with **explicit low-edge / high-edge** ramps authored
in the prefab creator and **rotated** on placement (see 39.5).

### 39.5 Two authoring tiers — coarse world + detailed PREFABS (the §31 creator)
- **World** = Plan A (coarse, block-scaled, gameplay-clean; no ramp rework).
- **Prefab / structure creator** = author with Plan-B-level detail INSIDE a block-bounded box (fine sub-block
  elevation, decorated relief, custom ramps). Standard "prefab/tileset/structure-block" pattern.
- **Placement** = drop the prefab at whole-block positions as a single **block-sized entity** (like a building),
  with **rotation** (0/90/180/270).
- A prefab stores: **footprint** (in blocks), **internal art** (subcell res), a **gameplay profile** the world
  reads per-block (solid / walkable / hazard / ramp-with-explicit-low+high-edges / floor-at-elev-N), **edge
  ports** for redstone (which sides accept/emit), an **interaction** hook (door/chest/lever/lock), and rotation.
- **Depth decision:** start with **(a) OPAQUE** prefabs — the world uses the prefab's summary per-block profile
  (visual detail is cosmetic; gameplay is block-level). Covers custom ramps, decorated buildings, statues,
  lock-doors. Only build **(b) EXPANDED** (stamp internal subcells so the player traverses real sub-block
  geometry) if a level truly needs it.

### 39.6 Mining (overhead "normal" mode) — block-mined, subcell-yielded  *(Kevin's model)*
- Mining is **block-based** (you mine a whole block), but the **YIELD = the subcells within that block.** So a
  density-4 block yields **16** subcell-worth of materials (density², flat surface layer) — or **64** (density³)
  if blocks are treated as volumetric. Default = flat surface = **density²**.
- Consequence (intended): higher density = **much more material per mine**, so recipe/ingredient **costs scale up
  to match** — density becomes a deliberate **economy lever**, not just detail. (Alternative if we ever want it
  neutral: normalize yield per block regardless of density.)
- Because traits live on the **subcell surface layer** (39.2), a block can contain **mixed ores** — mining it
  collects each subcell's trait. No "which trait wins" problem. Pairs with grid-lock (39.7) if a creator wants
  uniform-trait blocks.
- **No density restriction needed** for normal/mining worlds — the model scales at any density.

### 39.7 Grid-lock + placement (the player is CONTINUOUS)
- The player moves in continuous world-coords; collision is point-sampled. **Grid alignment is never required for
  movement/collision** — it's an authoring convenience + matters only to inherently cell-based systems (mining,
  redstone).
- **Grid-lock paint mode (planned):** a "snap to block" brush that lays a whole block (density² subcells) of one
  terrain type, snapped to block boundaries — for clean block-aligned terrain and uniform-trait blocks. (Same
  mechanism as Plan A's block-quantized elevation brush.)
- **Placement:** buildings default to **block-snap** (block-scaled structures look right aligned, nudge to subcell
  allowed); mobs/items/keys/decorations place **freely on subcells**; a global **"snap to block" toggle** covers
  "make everything line up."

### 39.8 Implementation order (when we return, after shipping 298–306)
1. **Scale-unification pass (Plan A):** structure/elevation visuals → `unit` (block); tile surfaces; quantize the
   elevation brush to blocks; building footprints in blocks; re-tune the 3 sample worlds. Small, reversible.
2. **Independent zoom ratios** (world settings: building zoom; item/mob/interactive default player-scale + overrides).
3. **Prefab / structure creator (§31)** — opaque prefabs first; custom ramps (explicit low/high + rotation); the
   home for detailed structures + doors/chests.
4. **Mining + grid-lock** (if/when normal-mode-in-overhead ships): block-mine → subcell-yield; grid-lock paint;
   snap toggle.

## Overhead — Fog of War (roadmap, requested 2026-08)
Feasible. A per-cell visibility mask around the player (+ optional line-of-sight),
revealed as the player moves; unseen cells drawn dark, previously-seen cells dimmed
("explored" memory). Implementation sketch: a Uint8 visibility grid updated each frame
from the player cell within a radius (world setting), rendered as a dark overlay in the
overhead game AFTER terrain/entities (respecting the LEFT/TOP/RIGHT viewport insets); the
editor gets a world setting (Fog of war: off / radius / line-of-sight) + a Test-mode toggle.
Cost is low (one grid + one overlay pass). Pairs naturally with the elevation model (taller
terrain could block sight later). Not started.

## ⚠ SAVE-FILE FORMAT & MIGRATION (read before adding any world field) — noted 2026-08
World-building is starting, so old saves must keep loading. Current state + rules:

### Current converters (keep these updated)
- **Overhead settings:** `OH_SETTINGS.resolve(world)` (js/overhead/overhead-settings.js) is
  the migrator. It merges `defaults()` over the saved `settings` and folds legacy fields
  (controlScheme, angleLockDeg, showHiddenIndicator, lavaDeadly→lavaMode). It's called on
  BOTH load paths — the editor (`open`) and the game constructor (overhead-game.js:30) — so
  any NEW setting added to `defaults()` automatically reaches old worlds. ✅ up to date
  (elevOffset, lockZoom, portalStepAnim, leverReachAnim all flow through).
- **Non-settings structure** (buildings/mobs/items/redstone/bridges/GATES/templates) has NO
  central converter — old worlds survive only because each load site defaults gracefully
  (`worldData.gates || []`, `near.config || {}`, pistons with no `dir` = legacy barrier, etc.).
- **2D worlds:** same pattern — ad-hoc legacy handling in the load path (spawnEggs/EGG_TO_MOB,
  worldAdvSettings merged over defaults). No version stamp.

### ⚠ There is NO world `schemaVersion` anywhere
Migrations are ad-hoc + field-by-field. Recommend (before the format grows further): add a
`schemaVersion` int to saved worlds + a single `migrateWorld(world)` that runs versioned
steps, so future format changes are safe + centralized. Until then, follow the RULE below.

### RULE when adding a world field
1. It MUST default gracefully when absent (old saves won't have it).
2. If it's a SETTING → add it to `OH_SETTINGS.defaults()` (it then flows through `resolve()`).
   If it's world STRUCTURE → default it at every load site (`|| []` / `|| {}` / legacy branch).
3. NOTE it in this section + update the converter/migrator.

### Recent changes that touch existing saves (audit)
- `world.gates[]` — additive; old worlds default to []. Safe. Now in undo/redo snapshot too.
- Piston `dir`/`reach`/`sticky` on redstone devices — a piston with no `dir` = legacy on/off
  barrier (back-compat branch in `_pistonSolidAt`). Safe.
- `world.buildings[].config.dest` (portal/pipe links) — defaulted to {} on read. Safe.
- New settings elevOffset / lockZoom / portalStepAnim / leverReachAnim — via defaults(). Safe.
- **⚠ Pipe/portal density-scaling (build 341) is RETROACTIVE:** `footprintOf()` grows a 2×2
  pipe to `max(2, density)` cells, so EXISTING worlds at density 3–4 will suddenly have LARGER
  pipes/portals (collision + render). This can overlap neighbours or block a path that used to
  be clear. Decide: accept it, gate it behind a per-world flag, or bake the old size into a
  migration for worlds saved before build 341. (New worlds are fine.)
- Building auto-snap (build 341) only changes NEW placements; saved buildings keep their `level`.

## Additional Mario-style jump enemies (roadmap, requested 2026-08 — non-critical)
Beyond Goomba/Koopa/Shell (built): a SPINY / un-stompable enemy (hurts you if stomped — needs
`stompable:false`, already supported by the stomp pass), a flying/paratroopa (bobs; first stomp
grounds it, second squishes), a hopper, a piranha (rises from a pipe on a timer). All reuse the
existing Mob base + stomp hooks (_isStomp/onStomp/squish). Not started.

## Water block + world (roadmap) — already captured in WATER_AND_HYBRID_ROADMAP.md
Water terrain (swim/float/drown) + the overhead↔2D hybrid vision. See that doc. Not started.

---

## §40 — Non-exportable levels ("don't let people take my world")

**Status:** roadmap, not built. Raised by Kevin 2026-08-03 alongside the build-346 export
feature. Two separate asks, with very different feasibility — worth keeping them apart.

### 40.1 Hide the Export option (feasible, honest)

A per-world `allowExport` flag (default **on**, so nothing changes for existing worlds),
set in World Settings ▸ Designer Locks next to Lock Physics. When off:

- the Sandbox card's **Export** button is not rendered for that world;
- the overhead editor's **⬇ Export** is not rendered;
- the play-HUD Export is not rendered;
- the server's `GET /api/worlds/sandbox/:id/export` returns 403 for a world flagged
  non-exportable **unless the requester owns it** — otherwise the flag is trivially
  bypassed by hitting the endpoint directly.

The **owner must always be able to export their own world**, or the flag becomes a way to
lose your own work. So this is "don't let *other people* take it", not "lock it away".

Cost: small. One flag, four call sites, one server check. Reuses the `_advancedAllowed`
/ lock pattern from build 347.

### 40.2 Preventing the JSON being read at all (NOT achievable client-side)

Kevin's observation is correct: the world data is in the browser, so it can be read. It
is worth being straight about what is and isn't possible, because this is the kind of
feature that is easy to *appear* to ship.

**Encryption in the browser cannot solve this.** To render a level the client must hold
the plaintext, which means it must also hold (or be able to fetch) the key. Anyone who
can open DevTools can read the decrypted object out of memory, or just call the app's own
loader. Shipping an encrypted blob plus the key to decrypt it is **obfuscation, not
encryption** — it raises effort, it does not prevent copying. Claiming otherwise in the UI
would be a promise the code can't keep.

What genuinely helps, in increasing order of cost:

1. **Remove the convenient path** (= 40.1). Most people who would casually grab a world
   won't open DevTools. This is the bulk of the practical benefit.
2. **Don't serve what isn't needed.** For play-only access, the server could send a
   *reduced* payload — no editor-only metadata, no template/authoring data. The player
   gets what renders; the creator's authoring artefacts stay server-side.
3. **Server-authoritative play** for the parts worth protecting: the client asks for the
   next chunk / room as the player reaches it rather than receiving the whole map up
   front. Real protection, and a large architectural change — only worth it if
   world-stealing becomes an actual problem.
4. **Watermarking / provenance**: stamp an owner id into the world data and have Import
   surface "created by …". Doesn't prevent copying but makes passing a copy off as your
   own visible, which is usually the real concern.

**Recommendation:** build 40.1, and describe it accurately in the UI — something like
"Hide from export" rather than "Protect"/"Encrypt". Revisit 2–3 only if copying actually
happens. Explicitly do **not** ship a decorative encryption layer.

---

## §41 — Which settings belong to PLAYERS at all (+ a cheat mode)

**Status:** open question, deliberately deferred. Kevin, 2026-08-03.

Build 347 made the Advanced tier sandbox-only and enforced Lock Physics, which exposed a
bigger question: **most of these settings arguably belong to the world CREATOR, not the
player.** A player in Normal or Platformer can currently still reach ~60 basic rows, many
of which are level-design choices rather than preferences.

The decision to make later, per mode:

1. **What should a player legitimately change mid-game?** Likely: input, audio, zoom,
   accessibility/comfort switches (sprint, auto-climb, ladder behaviour). Probably not:
   mob detection, drops, day length, scoring — those change the level the creator built.
2. **What moves behind the designer wall** (sandbox-only, like Advanced is now)?
3. **What belongs in a CHEAT MODE instead** — an explicit, labelled "I am changing the
   rules" surface (god mode, unlimited arrows, boss scaling down, gravity), rather than
   settings that quietly alter a level's difficulty. A cheat mode is also the honest home
   for anything that would invalidate a leaderboard or speed-run time — which means it
   probably needs to *flag the run* when enabled.

Not a refactor: the machinery already exists (`modes:` gating, `advanced`, `_lockedOut`).
This is a classification pass plus a new surface for the cheat set. Do it after the
settings review lands, and before the user guide is generated — the guide's "what players
can change" chapter depends entirely on this answer.

---

## §42 — Depth-correct entity occlusion (walls hide mobs, items, gates)

**Status:** designed, NOT built. Deferred deliberately from build 359. Kevin, 2026-08-05.

Mobs, items, gates and devices render **on top of every wall**, whatever the elevations. Same
root cause as the nine-build pit-death hunt: **terrain is one baked cache blitted with a single
`drawImage`**, so everything drawn afterwards paints over all of it. Entities are depth-sorted
among themselves (`drawKey = row * 1000 + level`) but never against terrain.

### The design (option B, recommended)

Blit the terrain cache in **horizontal row bands** instead of one rectangle, and emit entities
between bands by the same depth key. Because a raised cube paints up-left, each band's source
rect extends upward by `maxElev × elevOffset`; overlapping bands drawn in order then give
correct occlusion for free.

- Cost: ~50 `drawImage` calls per frame instead of 1 — negligible next to the per-cell passes.
- Effort: about half a day including tests, contained to `_render` plus a **per-row
  max-elevation table** computed alongside the cache.

**The subtlety that decides whether this takes one build or three:** depth is `row + elevation`,
but terrain bands are row-only, so a mob standing on a **tall wall** would be wrongly occluded
by a **shorter** wall one row south. Fix by giving each band a depth of
`row * 1000 + maxElevInRow` and merging bands and entities into one sorted list.

Rejected: un-caching terrain and drawing per cell in depth order — correct but it reinstates
the original performance disaster (112,000 cells at density 4 on a 100×70 map).

**Why it was deferred:** it changes how *everything* layers, in both play and editor. That is
the exact class of change that cost nine builds on the pit death, and it must not land
untested hours before an unattended soak. Give it its own build and its own browser pass, and
audit the **pipe climb-in** and **melee swing** `unit`-based offsets at density 4 in the same
pass (see §41 note / build 355: `unit` is cell × density, not a cell).

---

## §43 — Gates that swing as solid objects (free rotation, off-grid)

**Status:** parked at Kevin's suggestion, 2026-08-05.

Today a gate is a **line of grid cells** snapped to 45°, and swinging re-derives which cells it
occupies (`gateCells`). Kevin would like it to rotate **smoothly as one solid object** — open
and closed — rather than stepping through cell sets.

This is a genuine divergence from how the engine works, which is why it is parked rather than
scheduled. Everything downstream of a gate assumes **cell occupancy**: collision (`solid` set),
shadow casting, the editor hit-test, the redstone/obstruction check that stops a gate closing
through a player.

Sketch, if it is taken up:

1. Keep the **authored** representation (hinge + length + angle) and add a continuous
   `angleDeg` instead of a snapped one.
2. Render as a rotated quad (`ctx.translate/rotate`), not stacked cell cubes — that part is
   easy and is most of the visual win.
3. **Collision is the real work.** Either (a) keep rasterising the swept line to cells each
   frame at the continuous angle — cheap, and keeps every consumer working, with the panel
   simply occupying a slightly different cell set as it turns; or (b) introduce a true
   segment-vs-circle collision for the player and mobs, which is more correct and touches the
   movement code that everything else depends on.
4. (a) is the pragmatic path: continuous *visuals*, rasterised *collision*. It gets the look
   Kevin wants without a physics divergence, and the cell set it rasterises is exactly what
   shadows, the editor and the obstruction check already consume.

**Recommendation:** do §42 first. §42 is the one players notice constantly; a smoothly swinging
gate is a nice-to-have on top of it, and (a) becomes easier once bands/depth are sorted out.

---

## §44 — Overhead worlds are only reachable through the builder's Test button

**Status:** gap, raised by Kevin 2026-08-05. Not built.

There is no way to PLAY an overhead world. The only route in is the editor's **▶ Test**, which
is a designer aid — it launches with `testMode: true`, shows the Designer / God chrome, and
returns to the editor on exit. A player who has not opened the builder cannot reach one at all.

Everything needed already exists: `OVERHEAD.launchWorld(worldData, opts, onExit)` takes a plain
`testMode: false`, overhead worlds already live in the Sandbox list with a 🗺 badge, and the
runtime already handles win/lose, the Goal Star and the pause menu.

What is missing is the **entry point and the exit contract**:

1. **A launch route** from the world card (a Play button next to Edit) and/or from the mode
   dashboard, for a world whose `world_data.viewMode === 'overhead'`.
2. **Which mode owns it.** Kevin's steer is that overhead worlds should be playable from
   **Platformer** mode alongside side-scroll levels. That means the Platformer mode's world list
   must offer overhead worlds and dispatch to the overhead runtime rather than the 2D engine —
   the two runtimes are separate, so the dispatch has to happen at launch, not inside the game.
3. **Exit behaviour** — where does the player go on win, death or quit? Test returns to the
   editor; a player needs the world list or the dashboard.
4. **Campaign interaction (§12).** Campaign sequences *Platformer* worlds. If overhead worlds
   become Platformer-playable, decide whether a Campaign zone may contain them, since the Goal
   Star exit routing would need to work in the overhead runtime too (it already has Goal Stars).

**Effort:** small-to-moderate for 1 and 3 (a launch button and an exit target). Moderate for 2,
because it changes what "Platformer mode" means. Decide 4 before building 2, or it gets built
twice.

---

## Overhead Glass Tubes (point-to-point VISIBLE transport)  — requested 2026-08-07

Kevin wants the overhead engine to have glass tubes like the side-scroll ones: point-to-point
transport where you SEE the player(s) fly through the tube (not the pipe's enter-then-teleport).

Distinction from what overhead already has:
- **Pipe / portal** (exists): enter a building, a short climb/step animation, then teleport to the
  linked end. No visible transit between the ends.
- **Glass tube** (this item): a visible tube laid cell-to-cell between two points; entering it
  sends the player ALONG the tube path, rendered inside the glass, arriving at the far end. In
  co-op, several players can be in transit at once.

Why it's cheap AFTER Phase 0c (per-player transport): 0c makes transit state per-player
(`p._climb`/`p._transit`) and fixes the loop so one player in transit doesn't freeze the others.
A glass tube is the same per-player transit state with (a) a path of cells instead of a single
dest, (b) a "fly along the path" driver instead of the climb timeline, and (c) tube-segment
rendering. The per-pipe "pull everyone / this player only" toggle (0c) applies to tubes too.

Build sketch:
- Data: a `tube` mechanism = an ordered list of cells (a drawn path) + two mouths; store on the
  world like buildings/rails. Reuse the side-scroll model where sensible (`travelTubes` +
  `pipeLinks` in js/game.js are the reference), adapted to the overhead grid.
- Editor: a tube tool (drag a path between two mouths), mouth config (one-way/two-way, group vs
  single travel — same toggle as pipes).
- Runtime: on entering a mouth, set `p._transit = {path, t, ...}`; a per-frame driver advances the
  player along the path (visible), releasing at the far mouth; render the glass segments + the
  player tinted "inside glass" (mirror the side-scroll TUBE_WALL band look, top-down).
- Camera: transit respects the shared auto-fit camera (0d); a "this player only" long tube uses
  the same edge-hold rule as a solo pipe.

Effort: moderate (its own phase, after the MP foundation + modes). Slots in as the natural
extension of the transport pass — do NOT build mid-foundation.

## §45 — Auto-generate / procedural random maps for NORMAL mode  *(Kevin, 2026-08-10 — "gauge feasibility, add to roadmap")*

Idea: the platform randomizes a fresh side-scroll world from a rules set, for NORMAL mode. Should be
able to populate nether + end portals and stamp in structures. VERDICT after a code sweep: **feasible
by EXTENDING what already exists — a medium feature, not a from-scratch build.** Three load-bearing
pieces are already in the repo:

1. **A rules-based side-scroll generator already exists** — `tools/gen-sample-worlds.js`
   `buildSpeedRun()` builds a level left->right from a SEGMENT SCRIPT of `{run|boost|ramp|gap|pad}`
   primitives with baked design rules (bottomless/lava gaps, telegraph cues, jump-pads for wide gaps,
   auto-climb ramps), plus a schema-correct `world()` payload assembler. Today it's deterministic (no
   RNG) and a Node CLI. Randomizer = port the pure functions into a browser module + swap the fixed
   segment scripts for seeded RNG.
2. **A physics-honest solvability checker already exists and is already wired in** —
   `js/pathfinding.js navReachable()` (envelope `NAV_MAX_JUMP_UP=3`, `NAV_MAX_JUMP_DX=6`).
   `gen-sample-worlds.js validate()` already runs a spawn->goal->all-POI reachability BFS and FAILS a
   world that isn't beatable. So we can GUARANTEE a completable level: generate -> navReachable ->
   repair, loop until solvable. The overhead generator `tools/gen-overhead-worlds.js` already
   demonstrates exactly this RNG+validate-until-solvable loop (for the other engine).
3. **Portals + structures stamp into the grid with NO engine change** — nether/end are data-driven:
   paint frame+portal blocks (`js/blocks.js`: NETHER_PORTAL_FRAME 26, NETHER_PORTAL 20, END_PORTAL 39,
   END_PORTAL_FRAME 40/41) into the grid and emit matching `portalLinks`/`ruinedPortals`/
   `endPortalAnchors` (`js/game-state.js:183-228`). `js/world.js:52-176` is a complete worked example
   (Plains->Cave->Nether->End as column bands linked by portal destLabel routing).

### The 3-4 hardest parts (call these out before starting)
- **Solvability under the FULL move-set.** `navReachable` models only the base envelope + jump-pads.
  Double-jump / ledge-hang / slide / jump-velocity overrides (`js/player.js:558-679`) are NOT in the
  nav model, so a level that REQUIRES them can't be proven beatable. Safe path for v1: generate
  strictly to the base 3-up/6-across envelope (provably solvable), treat abilities as optional
  shortcuts. Extending the nav model to abilities is its own sub-project.
- **Multi-dimension portal wiring.** A nether/end sub-area needs frame+portal blocks, matching
  `portalLinks` with consistent label/destLabel routing (`js/game.js:5843-5860`), return portals,
  obsidian fill slots, End-portal anchors/eye counts. The only working example (`js/world.js`) is
  hardcoded column bands, not composable — the generator must reproduce that wiring and keep both
  dimensions mutually reachable.
- **No side-scroll PREFAB library.** The clean voxel-template/stamp system exists only for OVERHEAD
  (`js/overhead/overhead-templates.js`). Normal-mode structures are built imperatively today. To
  "place structures" we author a side-scroll prefab set (or capture regions into reusable functions)
  and ensure each stamp lands on standable ground without breaking reachability.
- **Emitting a complete valid payload.** `serialize()` (`js/game-state.js`) has ~60 fields; a
  malformed generated field risks a broken load. Track schema drift (`saveVersion:2`), default every
  array the loaders touch.

### Suggested phasing
- **P1 — "Surprise Me" flat randomizer:** RNG segment-script -> grid + spawn/goal + navReachable gate,
  base envelope only. Ships the core loop; no portals/structures yet. Reuses buildSpeedRun + validate.
- **P2 — Rules panel:** expose knobs (length, difficulty/gap-frequency, biome, hazard mix, coins/
  enemies density) -> seed the RNG. Save a generated world into a slot like any other.
- **P3 — Structures:** author a side-scroll prefab set; stamp N per level on standable ground,
  re-validate.
- **P4 — Nether/End:** generate the portal sub-areas + wiring (the hardest part); reuse js/world.js as
  the reference implementation.

---

## §13. Creative Tools — Audio-Synced Levels & the Sprite Studio  (full spec: docs/CREATIVE_TOOLS_ROADMAP.md)

Turns the Tranche-2 seeds (Beat Grid + custom characters) into a creative suite. **The lever:** the
side-scroll engine already computes a full animated skeleton — build a **stick-figure render mode** once
and get (a) playable stick characters, (b) an engine-EXPORTED animation template sheet, and (c) a
ghost-draw underlay for the paint tool, from one asset.

- **Phase A — Music v1 (catalog song per level + auto-BPM):** pick from `MUSIC_DISCS`, plays during the
  run, BPM auto-detected (`js/bpm-detect.js`, pure) to prefill the Beat Grid. NO per-level upload yet.
  → next bug-fix round.
- **Phase B — Stick render mode + 2 playable stick sprites** (both engines, cosmetic/same-hitbox,
  opt-in). → next bug-fix round.
- **Phase C — Bitmap sprite render path** (foundation: draw an arbitrary frame-sheet as a sprite).
- **Phase D — Engine-exported animation template sheet** (drive the stick figure through every move).
- **Phase E1 — Part Studio (LEADS)** — the beginner-accessible core: **Rung 2 reshape (sliders, no
  drawing)** + **Rung 3 draw-your-own-pieces (skeletal skinning — paint parts, engine animates)**.
- **Phase E2 — Frame Studio** — Rung 4 full frame-by-frame sheets + the only path for items/blocks
  (static) and non-humanoid sprites. Do NOT fork the overhead editor; lift its palette/shape/undo.
- **Phase E3 — Enemy model templates** — reskinnable movement+style presets (spider gait, hopper, flyer)
  that a creator recolors/reshapes/repaints without touching AI.
- **Phase F — Ghost-draw animation guide** (faded stick underlay, enable/disable, never saved).
- **Phase G — Sprite-sheet importer** (PNG upload → slice → render via C).
- **Phase H — Movement Editor (FAR FUTURE)** — Kevin's vision: pose the stick-man reference into up to ~10
  keyframes + speed; the engine tweens joints between poses. Emotes/dances = feasible visual layer; new
  *gameplay mechanics* are separate engine work (animation must never change the hitbox).

**The accessibility ladder (Rungs 0–4)** is the organizing principle: 0 Pick · 1 Mix&recolor (both exist) ·
2 Reshape (parametric sliders) · 3 Draw pieces (skinning) · 4 Full sheet. Rungs compose (per-part source,
graceful degradation to skeleton, proportions+skin). Beginner-first: Rungs 2–3 lead; Rung 4 follows.
Deferred: per-level music upload + storage + licensing; jukebox filtering; overhead animation rows.
Sequence: A+B next tester pass; then C → **E1 (leads)** → D → F → E2 → G; then E3; far-future H.

---

## §14. Progression-gated creator features (achievements unlock design power)

**Kevin's idea (2026-08-12):** the incentive for earning achievements = **unlocking creator/design
features**. Start with limited config, sprites, and controls; earning achievements (largely via the
campaign) unlocks new settings, blocks, sprite rungs, and controls. Gives achievements a real reward and
makes PLAYING feed CREATING (the game's core value), and gives Campaign mode a job.

**Key insight — the accessibility ladder IS the unlock tree.** Don't build a separate gating system; gate
the ladder rungs + setting GROUPS we already have:
- Rungs 0–1 (pick / mix+recolor) free from the start.
- Rung 2 (reshape sliders) → early achievement.
- Rung 3 (draw-your-own-pieces) → deeper achievement.
- Exotic blocks (wind/gravity zones), advanced world settings, enemy-model templates, and
  achievement-AUTHORING itself → later unlocks.

**Plumbing already half-built:** Epic D shipped the achievement evaluator + a per-WORLD server ledger
(`/api/achievements/world`). The missing piece is a **per-ACCOUNT unlock ledger** (same pattern, new
scope) + an unlock-check at each gated feature + the aspirational-lock UI.

**Guardrails so it doesn't wall the garden (build these in from day one):**
- **Creative vs Progression mode** toggle (Minecraft-style): Creative unlocks everything; Progression gates.
  Never force gating on someone who just wants to build.
- **Never gate the basics** — a complete, playable level is always makeable; gate only the fancy stuff.
- **Aspirational locks** — show locked features as "🔒 earn X to unlock" (visible, not hidden) so they pull
  the player forward instead of confusing them.
- Unlocks are **permanent per account**.

**Scope:** cross-cutting rework (every gated setting/tool needs an unlock check + UI) — a big future
initiative, but it can PILOT incrementally (gate 2–3 marquee features first, not all at once). Ties to:
Campaign mode (§12), the Creative Tools ladder (§13), and Epic D achievements.

---

## §15b. Skin System — player-selectable visual skins × orthogonal Retro FX  (agreed 2026-08-12; NOT built)

**Kevin's idea:** more visual variety than today's single modern/retro switch — a set of **skins** players
choose from, PLUS the ability to apply the **retro/CRT vibe on top of** any skin.

**Key architecture — TWO orthogonal axes (don't conflate them like modern/retro does today):**
1. **Skin** = the palette + treatment language (colours, accent, button/panel style, iconography). A token
   set on the root, e.g. `data-skin="neon|pixel|modern|…"`. Drives everything through CSS custom props —
   the dark-modal unification (build 485) already pushed most components onto tokens, which is the
   foundation.
2. **Retro FX** = an overlay effect (scanlines, CRT curve, chromatic aberration, pixel font), a SEPARATE
   on/off flag that composites over ANY skin. Today's `retro` theme ≈ "Pixel skin + Retro FX on".

   So: `data-skin` (palette) × `retroFx` (overlay) → e.g. Neon+FX = neon with scanlines; Neon-FX = clean neon.

**First skins** (curated — each must look right on EVERY screen, not just one): **Modern** (today's clean
dark), **Neon** (seeded by the SR-hub side rail @495 — its `--srh-*` accent tokens are the start), **Pixel/
Blocks** (flat/blocky, on-brand). Retro FX = the orthogonal toggle. Later candidates: Terminal (green-on-
black), Vaporwave (pink/cyan), Parchment (fantasy; could auto-apply in adventure worlds).

**Decisions to lock before building:** (a) scope = **player preference** first (like the retro toggle),
optional per-world creator override later; (b) how the current `retro` preset maps onto skin×FX.

**Cost:** big cross-cutting effort (every component must read tokens, no hardcoded colours) but pilots
incrementally — ship Neon end-to-end first, add Pixel later. **Great fit as a PROGRESSION UNLOCK** (§14):
earn skins via achievements (cosmetic-only, aspirational). Generalizes `js/theme.js` (data-theme →
data-skin + retroFx). Ties to §14 (gating) and the build-485 modal token work.
