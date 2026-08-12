# Tester Brief — Tranche 2 (builds 478–485)

**Base:** `main` @ build **485**, deployed. Server was restarted (two new routes below need it — if you
run your own copy, restart `node server.js`). Headless suite: **all green**. Everything below is
functional + headless-tested but **UX-unverified** — that's what this pass is for.

**How to read this:** each item = what changed, where to find it, and what "good" looks like. Flag
anything that looks off. Two items are explicitly flagged as **needs-your-eyeball** (canvas/CSS I can't
see): the **modal dark unification** (§8) and the **Beat Grid overlay** (§2).

---

## 1. Wind Style picker (build 478)
**Where:** Sandbox editor → place a Wind Zone → click it → popup has a new **Style** cycle
(Chevrons / Streamlines / Speed Lines).
**Check:**
- Each style renders as flowing lines (not arrows) and **flows in the wind's direction** (the earlier
  speed-lines-going-upwind bug should be gone).
- Lines are **seamless across adjacent wind cells** (no hard break at block edges).
- Flow speed tracks the wind **strength/speed** settings.

## 2. Beat Grid editor overlay 🔎 needs-eyeball (build 480)
**Where:** World Settings (Speed Runner world) → **Beat Grid → Edit…**. Set a BPM (type it or **Tap tempo**),
tick "Show beat lines", Save. Back in the editor you should see vertical beat lines.
**Check:**
- Tap tempo produces a sensible BPM after a few taps.
- Beat lines appear in the editor; **downbeats (every 4th) are brighter + numbered**.
- Line spacing looks proportional to Base Speed (it's derived under the constant-speed assumption —
  most exact with **Constant Speed ON**). Rough spacing is expected off-constant-speed; flag if wildly off.

## 3. Per-level Achievements / "Level Challenges" (build 479)
**Where:** World Settings → **Achievements → Level Challenges → Edit…**. Add up to 3 goals
(Collect N coins / Defeat N enemies / Finish under Ns / Few jumps / No hazard damage). Save the **world**.
**Check:**
- Play the level and satisfy a goal → a **🏆 toast fires on completion** (reach the Goal Star in
  platformer; finish line in Speed Runner).
- Goals that track: coins collected, enemies defeated (stomp + arrow/melee), jumps used, hazard damage
  taken (lava), finish time. Retrying resets the counters.
- Logged-in + cloud world: an unlock POSTs to `/api/achievements/world` (no visible UI yet — just
  shouldn't error).

## 4. Speed Runner Practice Mode (build 481)
**Where:** During a Speed Runner run: press **T** to toggle Practice, **C** to drop a personal checkpoint.
**Check:**
- **T** shows "Practice Mode: ON (unranked)" + a persistent **PRACTICE · UNRANKED** badge top-center.
- **C** drops a checkpoint; dying respawns you **there** (not the level start), badge shows "C-checkpoint set".
- While in Practice, **attempts and best-%% do NOT change** (it's unranked). Turn T off → back to normal.

## 5. Create World cleanup (build 482)
**Where:** Sandbox → **+ Create World**.
**Check:**
- Mode dropdown now has **"Overhead (top-down)"**. Picking it hides the side-scroll size fields; clicking
  Create opens the **overhead editor's** own new-world setup. (The old top-bar "New Overhead World"
  button is gone — folded into this one door.)
- World cards have a new **Info** button → edits the **storefront description** after creation. Works for
  both cloud worlds (saves via `/description`) and offline worlds.

## 6. Per-player custom characters (build 483)
**Engine capability** — several players can now each run a **different** custom character at once (was one
per world). No new selection UI this round (that's the follow-up); verify nothing regressed:
**Check:** single-player + 2-player + arena still show the correct character; a world's custom character
still renders. (Headless test covers the multi-slot registration.)

## 7. Play community Speed Run levels (build 484)
**Where:** Community storefront → a **Speed Runner** world card now has a green **▶ Play** button.
**Check:**
- **▶ Play** races the level **in place** (no clone into your sandbox — Download still does that).
- The level's play counter bumps. Exiting returns you to the storefront.
- Non-SR worlds show only Download (unchanged).

> Note: the original A3 idea was tabs on the *canvas* Speed Runner landing — that screen turned out to be
> dead reference code (the HTML dashboard is the live UI), so the Community-play intent landed on the
> **active storefront** instead. If you want a dedicated tabbed SR landing, that's a design call to make.

## 8. Modal dark unification 🔎 needs-eyeball (build 485)
**What:** Every HTML modal (Create World, Copy, Import, Arena settings/pre-launch, Custom Rules, Theme,
Test-World…) used to flash **white** on the dark app in the default **modern** theme. They're now on the
**dark shell**.
**Check (modern theme):** open each modal and confirm **no white cards** and **no invisible (dark-on-dark)
text** — headings, labels, inputs, dropdowns, buttons, the import warning box, and the Custom-Rules
builder rows should all be readable on the dark surface.
**Check (retro theme):** unchanged from before (retro keeps its own neon skin).
> This is the tranche's **highest-risk** change and is UX-unverified. If a modal looks wrong, it's one
> revertible CSS block — search `style.css` for `§Epic UI — Modal dark unification`.

---

## New sprite-sheet how-to (artifact, not in-app)
A creator guide for custom-character **sprite sheets** was published as an artifact (the format/spec +
how-to, per Kevin's "how-to guide for now" ask). Link is in the run report. Nothing to test in-app.

## Server note
Two new server routes need the API server running the latest code (restarted for you):
`POST /api/worlds/sandbox/:id/description` (§5) and `GET /api/community/worlds/:id/play` (§7).
Both are auth-gated (401 without a token = mounted correctly).
