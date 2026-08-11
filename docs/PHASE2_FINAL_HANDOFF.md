# Custom Sprites — Phase 2 FINAL gaps (hand-off) + Phase 3 overview

**For:** the Speed Runner overnight instance, AFTER `main` (Phase 2 @ build 454) is merged into
`speedrunner-overhaul`. Do these three Phase-2 clean-ups FIRST (small, self-contained), then resume the
Speed Runner waves. **Conventions unchanged:** build bump per behaviour change, `node test/run.js`
exit 0, gender-neutral, cosmetics never touch a hitbox, commit co-author line, push to the branch.

Phase 2 (parts-mixer character builder) is otherwise DONE + tester-verified on build 454: Save persists
for CLOUD + LOCAL worlds, custom colours win in the 2D engine, Surprise-Me flips Body, preview enlarged.
Three items remain.

---

## GAP 1 (must fix) — offline-overhead (`oh-`) save no-ops; unify the three store writers

**Symptom (tester, 454, reproduced twice):** building a custom character on an OFFLINE OVERHEAD world
(an `oh-` id) and clicking Save changes nothing — `steveo_overhead_worlds` still holds the old value,
the card still shows the old character, no error. Cloud ✓, local `lw-` ✓, **`oh-` ✗**.

**Why this keeps happening (the real problem):** the "write a field into whichever store owns this id"
logic is DUPLICATED across writers, and the `oh-` branch has now drifted THREE times (the 430 route
404, the 434 `lw-` miss, now the `oh-` builder save). The two current duplicators:
- `js/sandbox-ui.js:388` `changeWorldCharacter(worldId, characterId)` — oh- branch at :394.
- `js/sandbox-ui.js:420` `saveCustomCharacter(worldId, def)` — oh- branch at :423.
Both hand-roll: `_isOfflineOverhead(worldId)` (`:269`, key-in-`steveo_overhead_worlds`) →
`_ohStore()` (`:268`) → mutate `all[worldId]` → `localStorage.setItem`; else `_isLocalWorld` (`:262`)
→ `LOCAL_WORLDS.set*`; else server GET+PUT `/api/worlds/sandbox/:id`.

**Root-cause the oh- no-op first** (likely one of): (a) `_isOfflineOverhead(worldId)` returns false for
the card's id (id/key mismatch between the card's `data-world-id` and the store key) so it falls through
to the SERVER branch, which 404s on an `oh-` id → non-blocking `alert` (easy to miss) → returns false;
or (b) the write lands at the wrong nesting level — `saveCustomCharacter` writes `all[worldId].characterId`
at the RECORD TOP LEVEL, but the play/card read path may expect it under `world_data` (verify how
`_offlineOverheadWorlds` `:270` wraps the raw record and how the overhead PLAY path reads
`worldData.characterId` / `worldData.customCharacter`). Confirm which, with a console repro.

**The fix (do the refactor — the tester explicitly recommended it, and it stops the drift):** extract
ONE shared helper on SANDBOX, e.g.
```
// Persist a shallow patch of world_data fields to whichever store owns `worldId`.
// Returns true on success, false on a handled failure. The SINGLE place that knows oh-/lw-/server.
async _persistWorldData(worldId, patch) { ... }
```
It must: detect the store (`_isOfflineOverhead` → oh- store; `_isLocalWorld` → LOCAL_WORLDS; else
server GET-merge-PUT), write the patch at the SAME nesting the read paths use (make oh-/lw-/cloud
CONSISTENT — pick `world_data.*` and fix whichever store diverges), update the in-memory `this.worlds`
cache, and be the ONLY writer. Then rewrite BOTH `changeWorldCharacter` (patch `{characterId}`) and
`saveCustomCharacter` (patch `{characterId:'custom', customCharacter:def}`) to call it. Also point the
overhead editor's own character/save path at it if it writes these fields.

**Verify:** round-trip all THREE stores (cloud, `lw-`, `oh-`) — set a custom, reload, confirm it stuck;
add a headless test for the store-routing + patch-nesting where the logic is pure (mock localStorage +
a fake server fetch, like `test/test-character-persist.js` does for `LOCAL_WORLDS.setCustomCharacter`).

---

## GAP 2 (verify, likely already fixed by 454 — confirm after GAP 1) — overhead custom palette

**Symptom (tester, 454):** for a hand-side-loaded overhead custom, `drawOverheadPlayer` received the
PLAYER palette (shirt `#4a8fd4`…), not the custom palette (shirt `#d23b3b`…). Skin/accent matched only
because they equalled the defaults.

**Most likely NOT a code bug — a test artifact entangled with GAP 1.** Build 454 already added the
override in `js/overhead/overhead-game.js` `_drawPlayer` (search the block right after
`_pal.accent = CHARACTERS.get(this._characterId).pal.accent`): it applies `CHARACTERS.getCustom().pal`
(and body) over `_pal` when `this._characterId === 'custom'`, preserving a team shirt. The overhead
CONSTRUCTOR (`overhead-game.js:59`+) calls `CHARACTERS.setCustom(worldData.customCharacter)` and sets
`this._characterId` — BUT only from the world's own data at load. The tester side-loaded data into a
RUNNING game, so `this._characterId` stayed the original (not `'custom'`) and the guard skipped — hence
player values. Because the `oh-` save no-ops (GAP 1), they couldn't get a REAL builder-saved custom onto
an overhead world to test it end-to-end.

**Action:** once GAP 1 lets a builder-saved custom persist to an `oh-` world, launch it and confirm the
override fires (custom palette + body render). Only if it STILL shows player colours: debug the guard —
check `this._characterId === 'custom'` is true at render and `CHARACTERS.getCustom()` is non-null.
Match the 2D rule already shipped in `js/player.js` `_looksField` (custom pal wins, team shirt overrides).

---

## GAP 3 (cosmetic, quick) — Cancel leaves the card dropdown blank

**Symptom:** choosing "Custom…" then Cancel leaves the card's Character `<select>` blank
(`selectedIndex -1`) until the list re-renders. Data is fine; it self-heals; but it reads as "cleared."

**Cause:** the change handler (`js/sandbox-ui.js` ~:379, the `.char-select` listener) sets
`e.currentTarget.value = ''` after opening the builder, and Cancel does no re-render.
**Fix:** instead of `''`, reset the select back to the world's CURRENT character value (`custom` if set,
else `classic`) so it shows the real selection whether the user saves or cancels. (Or re-render the card
on builder close regardless of save.)

---

# PHASE 3 OVERVIEW (do NOT build now — capture so it isn't lost)

Phase 1 = the 16-character roster (both engines). Phase 2 = the per-world parts-mixer builder (this
work). **Phase 3 = "roster + packs"** — make custom characters reusable, per-player, and extensible to
studio art. Sequenced proposal (for a future dedicated effort, likely its own brief):

1. **Per-account reusable roster.** Today a custom is ONE per world (`world_data.customCharacter`,
   `characterId:'custom'`). Phase 3: a player builds + names several characters saved to their ACCOUNT
   and reuses them across worlds. Needs account-scoped storage (a `user_characters` table or per-account
   localStorage) + a picker. The per-player `_characterId` hook is already reserved in both engines.
2. **MP per-player custom.** Each player in a co-op/versus game picks their OWN character (built-in or a
   roster custom) in the pre-game window — wire per-player `_characterId` + palette through the existing
   per-player render path (PLAYER_LOOKS already per-player; custom would slot in the same way).
3. **Side-scroll live preview in the builder.** The Phase-2 builder previews the OVERHEAD sprite only
   (`drawOverheadPlayer` renders standalone). Add a side-scroll preview — the harder half is that
   `player.js`'s side draw isn't standalone; either factor a static side-sprite draw or render a tiny
   offscreen Player. Nice-to-have, not blocking.
4. **Sprite-sheet render path for studio-curated / licensed packs.** A SECOND, image-based render
   pipeline (PNG sprite sheets) alongside the shape-composed one, for premium/licensed characters.
   **NOT open user upload** — moderation + IP risk. Studio-curated only; ties to a future
   verified/paid-creator concept. Largest, most speculative piece — defer hardest.
5. **(Optional) Share a built character to the community.** Only behind the same moderation wordlist +
   review the storefront needs; treat as part of the storefront/moderation epic, not standalone.

Dependencies/risks to remember: roster storage is a schema/DB decision (mirror the level-state migration
work); MP per-player interacts with team-shirt overrides; the sprite-sheet path is a separate renderer,
not a tweak. Fairness rule stays absolute across all of Phase 3: **cosmetics never change the hitbox.**
