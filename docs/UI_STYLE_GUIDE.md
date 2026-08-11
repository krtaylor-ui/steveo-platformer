# Steveo Platformer — UI STYLE GUIDE (unified dark family, controller/TV-scaled)

**Status:** deliverable for Epic UI (Speed Runner brief §6). This guide defines the ONE modal style Kevin
signed off on: the **dark** family, **scaled up for controller / TV play** (large fonts, big buttons),
clean and consistent, and fully retro-theme compliant. The refactor that MOVES all ~12 white
`.modal-content` modals onto this system is the highest-risk visual change and is intentionally NOT done
blind overnight — this doc is the spec so it can be applied in reviewable, independently-revertible commits
with Kevin's visual confirm.

The canonical dark base already exists: **`.ws-panel`** (World Settings) in `style.css:1205`. Everything
below is derived from its real values so a converted modal looks identical to Settings.

---

## 1. Theme tokens (the source of truth)

Colours come from CSS custom properties on `:root`, overridden under `html[data-theme="retro"]`
(`style.css:8` and `:18`; managed by `js/theme.js`). ALWAYS reference the token, never a raw hex, so a
converted modal automatically gets its retro skin.

| Token | Modern (`:root`) | Retro (`[data-theme="retro"]`) | Use |
|---|---|---|---|
| `--font` | `system-ui, …, sans-serif` | `'Courier New', monospace` | all text |
| `--bg` | `#16181f` | `#0d0d1a` | app background |
| `--accent` | `#7c8cff` | `#7ec8e3` | active tab, ON switch, focus, primary button |
| `--accent-2` | `#a06cff` | `#667eea` | secondary accent / gradients |
| `--border` | `#363a46` | `#333` | panel + control borders |
| `--ui-radius` | `12px` | `4px` | panel/control corner radius |
| `--title-shadow` | `none` | `1px 1px 0 #004466, …` | headings (retro gets the blocky shadow) |
| `--title-transform` | `none` | `uppercase` | headings/labels |
| `--title-spacing` | `0.5px` | `3px` | heading letter-spacing |

**Panel surface palette** (from `.ws-panel`, use these for any converted modal):
`background #1b1e2a` · `text #e9ebf4` · `heading #fff` · `muted text #9aa0b8` · `dividers #2a2e3e` ·
`control fill #242838` (hover `#2f3446`) · `advanced amber #f0b354` · `group caption #8b95c9`.

> **Inversion trap (must-fix on every conversion):** the white `.modal-content` family hardcodes DARK text
> on light — labels/headings `#333` (`style.css:697`, `:685`), plus warning boxes. When you move markup into
> the dark shell, FLIP every hardcoded near-black text colour to `#e9ebf4` (body) / `#fff` (heading) /
> `#9aa0b8` (muted), or dark-on-dark makes the text vanish. Grep the modal's CSS for `#333`, `#222`,
> `color:#000`, and any `background:#fff` before shipping it.

---

## 2. Type scale (scaled up for a TV across the room)

Base the modal ~15–20% larger than the current Settings panel so it's legible on a couch. Relative units
(`rem`) so the whole thing scales with one root font-size bump if a bigger TV needs it.

| Role | Size | Weight | Notes |
|---|---|---|---|
| Modal title (`h2`) | `1.35rem` | 700 | was `1.05rem` in `.ws-head h2`; bump for TV |
| Section/group caption | `0.8rem` | 600 | uppercase, `letter-spacing .12em`, colour `#8b95c9` |
| Row label | `1.05rem` | 500 | was `0.92rem` `.ws-lbl`; bump |
| Control value / button text | `1.0rem` | 600 | big enough to read the current setting at a glance |
| Help / hint (`ⓘ` tooltip) | `0.9rem` | 400 | muted `#9aa0b8` |

Never go below `0.8rem` for anything a player must read from the couch.

---

## 3. Spacing scale

Use an 8px rhythm (with 4px half-steps). Bigger touch/nav targets than the current panel.

| Token | px | Use |
|---|---|---|
| `space-1` | 4 | icon gaps |
| `space-2` | 8 | control internal padding |
| `space-3` | 12 | row gap, panel head padding |
| `space-4` | 16 | body horizontal padding |
| `space-5` | 24 | group separation |

- **Row min-height: 44px** (was 34px). 44px is the minimum comfortable D-pad / touch target.
- Panel: `width: min(640px, 94vw)` (was 560), `max-height: 88vh`, radius `var(--ui-radius)`.

---

## 4. Controls (the shared, themeable classes)

Reuse the existing `.ws-*` classes — they're already theme-token-aware. Scaled-up values in **bold**.

- **Toggle** `.ws-switch` — pill, **52×28px** (was 44×24), fill `#3a3f52`, ON = `var(--accent)`; knob slides.
- **Cycle** `.ws-cyc` — `‹ value ›`, arrows are big hit-targets (**min 40×40**), value centred, `1.0rem`.
- **Slider** `.ws-slider` — full-width range; pair with a live value read-out.
- **Number box** (`numbox`, new this branch) — slider + a one-decimal `<input type=number>`, synced. Use for
  any precise numeric setting (see Speed Runner Base/Max Speed).
- **Button** `.ws-btn` — **`padding: 10px 20px`** (was 6×14), radius `var(--ui-radius)`, border
  `var(--border)`, fill `#242838` (hover `#2f3446`); PRIMARY button fill = `var(--accent)`, text `#0f1320`.
- **Tabs** `.ws-tab` — active tab = `var(--accent)` fill, dark text, weight 600. Left-side tabs for the SR
  landing / storefront / world-list (brief §5) share this look.

Focus state (controller nav): every focusable control gets a **2px `var(--accent)` outline** on
`:focus-visible`, so a gamepad user can always see where they are on a TV.

---

## 5. The shared modal shell (target structure)

```
.modal-shell               ← rename/alias of .ws-panel; background #1b1e2a, token border+radius
  .modal-head              ← title (1.35rem, #fff) + optional right-side control + ✕ close
  .modal-tabs (optional)   ← left- or top-tabs, .ws-tab
  .modal-body              ← scrolls; group captions + rows
  .modal-foot (optional)   ← primary/secondary buttons, right-aligned
```

Convert a white `.modal-content` modal by (1) swapping the outer class to `.modal-shell`, (2) flipping the
inversion-trap colours (§1), (3) re-labelling its buttons to `.ws-btn` (+ a `primary` variant), (4) checking
it in BOTH themes. Keep each modal's conversion in its OWN commit so a regression is a one-line revert.

---

## 6. Retro compliance

Because everything references tokens, `html[data-theme="retro"]` re-skins the shell for free: monospace font,
near-black `#0d0d1a` ground, cyan `#7ec8e3` accent, 4px corners, uppercase headings with the blocky
text-shadow. Two things to re-derive per converted modal (the retro overrides already exist for `.ws-panel`
at `style.css:1258` and the retro modal skin at `style.css:1931` — extend them, don't invent new ones):
1. Any bespoke background/border the old white modal used → point at `--bg` / `--border`.
2. Any heading → let it inherit `--title-shadow` / `--title-transform` / `--title-spacing`.

Verify BOTH themes on every conversion; the retro pass is where dark-on-dark and missing-shadow regressions
hide.

---

## 7. Do / don't

- **Do** reference tokens; **don't** hardcode hex in a converted modal.
- **Do** keep 44px+ rows and `:focus-visible` outlines (TV/controller).
- **Do** one modal per commit; **don't** batch the whole audit into one un-revertable change.
- **Don't** ship a conversion without eyeballing it in light+retro — this is browser-unverifiable in the
  headless suite; Kevin's branch review is the gate.
