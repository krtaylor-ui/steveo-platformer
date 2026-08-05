# Mega-session candidates — prioritised

For the next mega session (fresh conversation). Kevin's standing rule: a mega brief runs
start-to-finish with no pauses, so **every decision below marked DECIDE must be answered in
the brief itself** or it becomes my judgement call mid-run.

Ordering principle used here: **things that make later work measurable or safer come first**;
things that change how everything renders get their own build and their own browser pass.

---

## Tier 1 — do these first, in this order

### 1. §42 Depth-correct entity occlusion (walls hide mobs, items, gates)
**Effort:** ~half a day. **Risk:** high blast radius, low technical uncertainty.
Full design is in `FUTURE_ROADMAP.md` §42, including the one subtlety that decides whether
it takes one build or three (bands are row-only, depth is `row + elevation`, so a mob on a
tall wall must not be occluded by a shorter wall one row south).
**Why first:** it is the most-noticed visual defect left, and it is designed and ready.
**DECIDE:** nothing — the design is settled. Ship it as its own build.

### 2. Audit `unit`-based offsets at density 4
**Effort:** 1–2 hours. **Risk:** low. **Do it in the same build as §42.**
`unit = cell × density`, so any offset written in units of it silently multiplies with
density — invisible on a density-1 map, badly wrong at density 4. That was the nine-build
pit bug. Known suspects: **pipe climb-in**, **melee swing**. Grep `this.unit *` and check each.

### 3. Performance assessment button (measure, don't predict)
**Effort:** ~a day. **Risk:** low, additive.
Renders the real world off-screen for ~60 frames per quality tier, times them, and reports
**measured** fps per configuration plus per-pass cost. Turns the estimator's guess into a
number for *this* machine and *this* world.
**Why here:** it makes items 4 and 5 measurable instead of guesswork.
**DECIDE:** where the button lives — World Settings panel, or the pre-launch screen, or both.

---

## Tier 2 — worth doing, cheaper after Tier 1

### 4. Protected / Sacrificeable quality flags
**Effort:** ~half a day. **Risk:** low.
Per-pass flags (shadows, night, glare, …) marked Protected / Sacrificeable / Off; the governor
sacrifices the cheapest sacrificeable one first. **Recommended over drag-and-drop ordering** —
same control, no ordering puzzle, and it answers the real question ("never take my shadows").
**DECIDE:** accept flags instead of drag-ordering? (My recommendation: yes.)

### 5. Chunked terrain bake + "Loading World" zoom-out
**Effort:** ~a day. **Risk:** moderate — touches the cache everything depends on.
The 8fps opening is **one synchronous 112,000-cell bake** that blocks the main thread, so a
zoom animation cannot play during it as currently imagined. Bake N rows per frame and yield;
then the zoom-out genuinely tracks progress and the banner is honest. Removes the freeze too.
Default zoom + locking the player to it **already exist** (`Lock zoom in play`).
**DECIDE:** does the loading zoom start fully zoomed in on the player (Kevin's sketch) or at a
fixed frame? (My recommendation: on the player — it doubles as "here you are".)

### 6. §40.1 Non-exportable levels (`allowExport` flag)
**Effort:** small — one flag, four call sites, one server check.
Hides Export for a world; **must include the server-side 403** or it is bypassed by URL. The
owner must always be able to export their own world. Label it "Hide from export", not
"Protect" — see §40.2: browser-side encryption cannot work, and shipping something that looks
like protection would be dishonest.
**DECIDE:** nothing. Do not build §40.2.

---

## Tier 3 — needs your input before it can start

### 7. §41 Player-vs-creator settings split (+ cheat mode)
**Blocked on you.** The classification pass is `docs/settings-review-2d.md` / `.csv` — your
first pass is applied, **~16 rows still flagged**. Until those are decided, this can't proceed.
A cheat mode probably has to **flag the run** so it can't silently invalidate leaderboards.

### 8. Overhead settings → schema conversion
**Effort:** ~half a day. **Risk:** low, mechanical.
The overhead panel is hand-written HTML with **no schema**, so it has no advanced tier and no
help text. Converting it gives both — and makes the **user guide generatable** from code
rather than hand-written. See `docs/settings-audit.md`.
**Pairs with:** the user-guide generator, which is the actual prize.

### 9. §43 Gates swinging as solid objects
**Parked by you.** Design sketch in `FUTURE_ROADMAP.md` §43.
**DECIDE:** continuous *visuals* with rasterised *collision* (recommended — gets the look with
no physics divergence, and shadows/editor/obstruction checks keep working unchanged), or true
segment collision (more correct, touches movement code everything depends on).

---

## Explicitly NOT in a mega session

- **Anything found by Part A or the soak.** Fix those first, in small builds, so a mega session
  starts from a verified base.
- **§40.2 encryption.** Cannot work client-side; documented why.
- **A second settings UI.** The Konami canvas panel is an Easter egg and stays as-is.

## Standing lessons to carry in

1. **`unit` is cell × density, not a cell.** Offsets in `unit` are invisible at density 1.
2. **Terrain is one flat cached layer** — draw order can never make it occlude a sprite;
   anything that should hide behind terrain needs a clip or a re-draw pass.
3. **An id-scoped CSS rule is a latent bug** the moment the same markup can live somewhere else.
4. **Ask for a screenshot early.** One picture ended a nine-build hunt after five wrong fixes.
5. **Resolve settings against defaults on load** — reading stored settings raw means any newer
   setting is silently absent (this hid the frame-rate cap entirely).
