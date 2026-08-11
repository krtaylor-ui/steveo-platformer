# How we author work briefs (workflow + template)

Kevin's preferred loop (2026-08-10):
1. **Kevin brings** a list of requirements + an overview of the feature.
2. **Claude designs the actual brief** from it (this doc's structure).
3. **Kevin runs the brief in a FRESH session** (usually this terminal; sometimes web).
4. Continuity is guaranteed by (a) Claude's persistent memory in this project, and
   (b) `STEVEO_PLATFORMER_CONTEXT_SUMMARY.md` (kept current — read it first).

The point of this file: any session that authors a brief does it consistently, and Kevin knows
exactly what to bring so the brief comes out complete on the first pass.

---

## What Kevin brings (requirements intake — fill what you can, "?" is fine)
- **Feature name / one-line goal** — what it is in a sentence.
- **Why / the player value** — the problem it solves or the fun it adds.
- **Engine(s)** — side-scroll (`Game`/`js/game.js`), overhead (`OverheadGame`/`js/overhead/*`), or both.
- **Mode(s)** — Normal / Platformer / Speed Runner / Arena / Campaign / Sandbox / editor.
- **In scope** — the specific behaviours you want.
- **Out of scope / defer** — things NOT to build now (prevents scope creep).
- **Decisions already made** — anything you've settled, so I don't re-ask (defaults, look, values).
- **Open questions** — where you want a recommendation vs where you'll decide.
- **Constraints** — must-not-break, fairness rules, look-must-match-existing-menus, etc.
- **Size / urgency** — quick fix, medium feature, or overnight/mega run.

## What Claude produces (the brief)
A brief has up to three parts; include what the work needs:

1. **Implementation brief** (for the coding session) —
   - Numbered work items in build order, each = a commit + build bump + green suite.
   - For each item: the files/functions to touch (with `file:line` anchors), the approach, and the
     acceptance check. Flag anything browser-only (not headlessly verifiable).
   - "Judgment calls" section: where the coder should pick a sensible default and note it.
   - Guardrails (branch or direct-to-`main`, what must stay unchanged, tests to add).
2. **Tester brief** (for the QA/browser pass) — **plain ASCII only** (relay-safe), saved to
   `C:\Dev\Steveo-QA\docs\` (reachable at `/mnt/c/Dev/Steveo-QA/docs/`) AND a repo copy in `docs/`.
   Per-item PASS/FAIL/NOTE lines + the exact values to capture; "run without stopping" style.
3. **Roadmap/memory updates** — if the feature is multi-phase, add a `FUTURE_ROADMAP.md` section and a
   memory note so the next session inherits it.

---

## Hard conventions every brief must respect (project rules — do not violate)
- **Build bump:** behaviour changes bump the build via `tools/bump-build.js <N> "short note"` (updates
  `GAME_VERSION` + 88 `?v=bNNN` cache-busters + `sw.js`). Verify `node test/run.js` exits 0.
- **Version badge:** the app shows only the number ("v3 build N"); the note lives in the commit.
- **Gender-neutral** all player/sprite/bot copy (no he/she). "Steve"/"Alex" are sprite names only.
- **`classic` is the default** character/look everywhere; existing worlds + single-player unchanged.
- **Accessories/cosmetics NEVER change the hitbox** (fairness) — overhead + side both.
- **Don't merge to `main` without Kevin's explicit OK** (unless the brief says work directly on `main`).
- **Overnight/mega briefs run fully in one pass, no mid-run confirmation** — ask all questions up front.
- **Commit messages** end with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Overhead is local same-device only** (no networked path) — don't assume online overhead exists.
- Read `STEVEO_PLATFORMER_CONTEXT_SUMMARY.md` (CURRENT STATE) + relevant memory before starting.
