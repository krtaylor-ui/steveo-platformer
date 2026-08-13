# NPCs / Villagers — Design Spec (build-ready brief)

**Status:** design spec authored 2026-08-13 (overnight). Roadmap `FUTURE_ROADMAP.md §30` — Kevin flagged
P1 with the note *"Also need to be made for side scroll."* This is the "full discussion" the roadmap asked
for, written as a brief so it can be built in a focused session. **Not yet built** — the overnight pass
delivered the design; the block-system integration is the build.

---

## 1. Vision & scope

An NPC is a **placeable, non-combat character a player can talk to.** v1 is a dialogue foundation; trade
and quests come later. The universal Action button (overhead) was explicitly designed to eventually
"talk to NPCs" — this realizes that, and mirrors it in side-scroll.

**Hard rules (project-wide):** gender-neutral copy (NPCs never assume the player's gender); NPCs are
**cosmetic to collision** (they don't fight, don't block fairness-critical space — a player can pass
through or stop at them, TBD below); `classic`-style default look; additive/opt-in.

### Tiers
- **v1 — Dialogue foundation (this brief):** place an NPC, give it a name + a list of dialogue lines,
  choose a look; the player interacts to read the lines (advance through them). Both engines.
- **v2 — Branching + quests:** multiple dialogue nodes with player choices; quest flags (talk-to-X,
  bring-item, reach-area); reward hooks (unlock an exit, grant an item, fire an achievement — ties to
  Epic D + the progression system §14).
- **v3 — Trade:** an NPC shop (offer/ask lists, emerald economy) — reuses the arena emerald economy.

This brief specs **v1** fully and sketches v2/v3.

---

## 2. Data model (shared by both engines)

An NPC is stored per placement (NOT a global). Keep it in the same per-world structures the other
placeable-with-config blocks use (`_blockContents`-style side maps that serialize into `world_data`).

```
npc = {
  name:    string,            // shown as the speaker; gender-neutral, moderated on publish
  look:    string,            // a CHARACTERS id ('classic', 'stick', 'sketch', … reuse the roster) OR a palette
  lines:   string[],          // ordered dialogue lines (v1: linear; v2 adds nodes/choices)
  facing:  'left'|'right'|'auto', // side-scroll only; auto = face the player
  repeat:  boolean            // may be re-talked (default true); false = one-shot (greys after)
}
```
- Reuse the **character roster** for the look so NPCs get the same sprites (and later, custom/bitmap
  sprites) for free — no new art. A "villager" look can be a new roster entry.
- Serialize via the existing world-save path (a `npcs` map keyed by `row,col` in side-scroll; the overhead
  object list for overhead). No new DB — rides `world_data`.

---

## 3. Side-scroll integration (`js/game.js`, `js/blocks.js`, `js/sandbox-ui.js`)

1. **BLOCK.NPC** — new block id (next free id; there's headroom past the classic-blocks pack). Add to the
   Sandbox palette under a "Characters/NPC" group (`palette-filter` mode = adventure/all).
2. **Config popup** — on placing/clicking an NPC in the editor, open a `_classicPopup`-style modal (same
   pattern as the wind/beat-grid/contents popups): fields = Name, Look (roster dropdown), Dialogue lines
   (a multiline textarea → split on newline), Repeat toggle, Facing. Store into an `_npcs` Map keyed by
   `row,col`; serialize with the world (add to `SandboxSaves.save` + `GAME_STATE`/save-migrations like the
   other side maps).
3. **Render** — draw the NPC by reusing the player sprite renderer at the cell (a standalone draw of the
   chosen roster look, idle pose, facing the player). Reuse `drawOverheadPlayer`-style standalone draw or a
   small side-sprite pass. A subtle "❞" / "!" indicator floats above when the player is in range.
4. **Interaction** — in the play update loop, when the player is within ~1.2 cells of an NPC AND presses
   the **interact key** (reuse the existing Action/Use binding; the grapple/contextual-item work already
   established a "contextual action" — bind NPC-talk there) → open the **dialogue box** (§5). Consume the
   press so it doesn't also do something else.
5. **Non-combat** — the NPC cell is NOT solid (player passes through) so it never blocks a jump; OR make it
   a soft stop (stand in front). **Decision needed** (Open Questions). Default: pass-through + a talk
   prompt, simplest + fairness-safe.

## 4. Overhead integration (`js/overhead/*`)

The overhead engine already has a placeable-object model + the universal **Action button**. Add NPC as an
object type: place it in the overhead editor with the same config modal; render via `drawOverheadPlayer`
with the chosen look; on Action-button press while adjacent, open the same dialogue box. This is the piece
§30 originally imagined; the config modal + dialogue box are shared with side-scroll.

## 5. The dialogue box (shared UI, `js/` new module e.g. `js/dialogue-ui.js`)

A single reusable overlay used by both engines:
- Bottom-anchored panel (neon-styled to match the hub): speaker name + portrait (the NPC's look sprite) +
  the current line; **Space / Action advances**; last line closes. Pauses the game while open (set
  `game.state = 'paused'` equivalent, or a lighter input-capture).
- v2: render choice buttons when a node branches; return the chosen branch to a small dialogue-graph
  runner (`js/dialogue-model.js`, pure + headless-testable).
- Gender-neutral, moderated text; supports `\n`-split lines authored in the editor.

## 6. Build plan (v1)

1. `js/dialogue-ui.js` (+ a pure `js/dialogue-model.js` for line/branch advancement, headless tests).
2. `BLOCK.NPC` + palette + the config popup + the `_npcs` side map + serialization (side maps: save,
   migrations, GAME_STATE) — model on the Music Player / block-contents pattern.
3. Side-scroll render + proximity + interact → dialogue box.
4. Overhead: NPC object + Action-button → same dialogue box.
5. Moderation on NPC name + lines at publish; gender-neutral defaults.
6. Headless tests for the dialogue model + serialization round-trip; browser test the placement/talk.

## 7. Open questions (decide before building)

- **Collision:** pass-through (recommended, fairness-safe) vs soft-stop in front of the NPC?
- **Interact input:** reuse the existing Action/Use binding, or a dedicated Talk key? (Recommend reuse +
  a controller face-button, consistent with overhead's Action button.)
- **Look source:** roster ids only for v1 (simplest), or allow a custom/bitmap sprite now? (Recommend
  roster for v1; bitmap arrives with the Sprite Studio, §13.)
- **Where lines live:** per-placement (recommended) vs a shared NPC library the world references.
- **v2 quest hooks:** wire into Epic D achievements + the progression ledger (§14) when built.

## 8. Effort

v1 = **medium–large** (a new configurable block in TWO engines + a dialogue UI). The dialogue UI + model
are the reusable core; the two engine integrations are the bulk. v2/v3 are separate initiatives.
