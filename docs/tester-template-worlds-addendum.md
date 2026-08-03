# Tester addendum — Templates (overhead editor)

> Send alongside `TESTER_BRIEF.md`. Same reporting format: **PASS / FAIL / BLOCKED**, one line of
> what you saw, screenshot when visual. Overhead engine only (Sandbox → 🗺 Overhead).

Consolidates the template checks from `TESTER_BRIEF.md` §I (current batch) and
`OVERHEAD_TEST_BRIEF.md` §K (builds 321–322, written for the earlier test round).

## T1 — Tree is an additive template (no black void)
Buildings tab → place a **Tree**. Under and around the canopy you should see **grass (real
ground), NOT black** — the void is gone. The **trunk blocks** movement; you can **walk under
the canopy**. Screenshot.

## T2 — Tree shadow
With Day/Night + shadows on, the tree casts a **cell-accurate** shadow (canopy blob + trunk),
tracking the sun (or fixed if that shadow style is set). The old hard black blob under trees
should be gone. Screenshot at a **low sun angle**, where trunk and canopy shadows separate.

## T3 — Templates palette exists
A **Templates** section appears under Buildings, listing 🧩 **Tree** (the system template) plus
a **"＋ New Template…"** button.

## T4 — Authoring a template (capture region)
Click **"＋ New Template…"**, name it and set X/Y/Z (e.g. **4×4×6**), OK. Build a small
structure (raise some blocks), then **click the map** to place the capture **region**:
- everything outside the region **greys out**;
- cells **above Z** flag **red**.

Press **Enter** → captured, and it appears in the Templates list. **Esc** cancels cleanly
(no half-made template left behind).

## T5 — Placing a captured template
Place your captured template → it stamps **ADDITIVELY**: the ground under it is preserved, no
black void. Then **undo and redo** the placement — both should be clean.

## T6 — Persistence across Test
Enter **Test**, then re-open the editor → both the **placed** stamps and your **custom
templates** are still there.

## T7 — Block filter
Type in the **🔎 filter** box atop the Terrain palette → the block list narrows to matches
live as you type.

---

### Not in scope — roadmap, do not report as bugs
These are designed but **not built** (`TEMPLATE_CREATOR_SPEC.md` round-2 decisions), so their
absence is expected:
- Placement **overlap options** (Overwrite / Merge / Refuse-if-blocked) + ghost preview warning.
- Template **libraries** (System vs Player, account-wide vs world-specific, "Browse my
  templates" gallery).
- **Export/import all templates** to a file, duplicate checksums.
- **Thumbnails** per template.
- **"Apply to all placed instances"** editing, and density / player-height scale warnings.
- Templates carrying **mobs / items / redstone** — by decision, templates are **terrain +
  elevation only**.
