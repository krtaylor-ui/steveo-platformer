# World file format (export / import) — build 346

The format used by every Export button and accepted by every Import path, in both
engines. Owned by one module: `js/world-transfer.js`.

## The wrapper (v1)

```json
{
  "steveoExport": 1,
  "world_name": "Overhead QA Test",
  "description": "",
  "game_mode_default": "NRM",
  "view_mode": "overhead",
  "exportedAt": "2026-08-03T00:00:00.000Z",
  "world_data": { "...": "the world object the engine actually loads" }
}
```

| Field | Meaning |
|---|---|
| `steveoExport` | Wrapper version. Currently `1`. |
| `world_name` | Name the world imports under. Falls back to `world_data.name`, then the file's basename. |
| `game_mode_default` | `NRM` / `PLT` / `RUN` / `ARN`. Overhead worlds are always `NRM` (their ruleset lives in `world_data.mode`). |
| `view_mode` | `"overhead"` or `"side"` — derived from `world_data.viewMode`, and what decides which store an import lands in. |
| `world_data` | The world itself, verbatim. For overhead that includes `viewMode: "overhead"` and `schemaVersion`. |

## Raw worlds are accepted too

`unwrap()` also takes a **bare world object** with no wrapper — anything with a
`world_data` key is treated as wrapped, otherwise the whole object is the world. That's
why hand-made fixtures and files from builds before 346 still import.

## What makes a world "overhead"

`world_data.viewMode === "overhead"`. Nothing else. The overhead importer additionally
requires (`validateOverhead()`):

- `mapSnapshot` present, with `gridW > 0` and `gridH > 0`
- `mapSnapshot.ground` an array whose length equals `gridH`

Fail any of those and the import is **refused with the reason** rather than half-loaded.
A side-scroll file dropped into the overhead editor's ⬆ Import gets told to use the
Sandbox list instead.

## Migration on import

Overhead imports run `OH_SETTINGS.migrate(world)` on the way in — the same migrator a
normal load uses (build 345). A pre-345 file with no `schemaVersion` upgrades silently;
a file from a *newer* build is left alone rather than downgraded.

## Sample file

`sample-worlds/Overhead_QA_Test.export.json` — the regression fixture as a real export.
Import it via **Sandbox → Import from File** or the overhead editor's **⬆ Import**.

Regenerate with `node tools/gen-sample-export.js`; it derives the file from
`test/fixtures/overhead-qa-test-world.json` and writes a description from the world's
actual contents, so the two can't drift.

**What it actually contains** (40×26 @ density 1, mode platformer): 52 redstone devices
including AND/NOT/NOR gates, 3 bridges, 6 ramps, 3 key items, 1 spawn, 53 pit cells,
2 lava, 1 ice, 1 glowstone.

**It has NO glass**, and its hazard settings differ from a hand-built QA board — so don't
substitute it where those matter:

| Setting | This sample | Note |
|---|---|---|
| glass cells | **0** | glass/shatter is covered by `test/test-overhead-glass.js`, not this fixture |
| `pitMode` | **`block`** | pits are solid obstacles here — you **cannot** fall in, so it's wrong for any "fall into the pit" check |
| `lavaMode` | **`death`** | insta-kill, not the damage-over-time variant |

Build 346 shipped this file described as having a "glass wall" it never had. Corrected in 347.

## Where the buttons are

| Where | Button | Notes |
|---|---|---|
| Sandbox world card (both views) | **Export** | Per-world. Works for cloud, offline side-scroll, and offline overhead worlds. |
| Sandbox list header | **Import from File** | Routes overhead files to the overhead store, side-scroll files to the side-scroll store. |
| Overhead editor command bar | **⬇ Export** | Exports the **open in-memory world** — unsaved edits included, no save needed first. |
| Overhead editor command bar | **⬆ Import** | Replaces the open world (confirms first). Fresh undo stack; `worldId` cleared, so Save creates a new world. |
| Side-scroll play HUD | **Export** | Pre-existing; now shares the same format. |

Export is always built client-side, so it behaves identically offline and signed-in.
