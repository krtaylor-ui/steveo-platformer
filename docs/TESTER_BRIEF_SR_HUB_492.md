# Tester Brief — Speed Runner Level Hub (build 492, branch sr-level-hub)

Replaces the 4 Speed Runner save-slots with a three-tab hub: System / My Levels / Community.
Normal + Platformer keep their 4 slots (unchanged). Plain ASCII.

## STEP 0 - APPLY THE SQL FIRST (nothing works without it)
Run `server/sql/sr_level_hub.sql` in the Supabase SQL editor. It adds:
- worlds.is_system, worlds.sort_order, worlds.is_live
- table world_added (the personal "Added" library)
Then restart the API server (already restarted in this dev env). The community browse is
resilient if the table is missing, but the hub tabs need the columns.

## STEP 0b - SEED SOME SYSTEM LEVELS (admin = krtaylor)
Two ways:
1. In-app: log in as krtaylor -> Speed Runner -> My Levels -> set a world Live (from Sandbox first)
   -> the row shows a "★ System" button -> click it to promote to the System list.
2. SQL (bulk): uncomment the last UPDATE in sr_level_hub.sql with your creator_id.
Admin identity = the ADMIN_EMAILS env (defaults to krtaylor@gmail.com). Non-admins never see
the ★/reorder/✕ controls.

## System tab
- Lists admin-curated SR levels in admin order (numbered 1., 2., ...).
- Admin only: ▲▼ reorder (persists to sort_order), ✕ removes from System.
- Everyone: ▶ Race plays it; best time shows if you have one; leaderboards are shared (keyed to
  worlds.id).
- PASS/FAIL: non-admin sees a clean numbered list + Race only; admin sees reorder/remove and the
  order persists across reloads.

## My Levels tab
- Lists YOUR OWN worlds set Live (is_live), SPEEDRUNNER mode only.
- To make one appear: Sandbox -> a cloud SR world card -> the "○ In Process / ● Live" button ->
  set Live. (Local/offline worlds don't have this - cloud only.)
- PASS/FAIL: only Live SR worlds appear; toggling In Process removes it from the list; Race works.

## Community tab
- Lists worlds you've ADDED from the store.
- "➕ Browse community levels to add" opens the store filtered to Speed Runner; each card has a
  "＋ Add" / "✓ Added" toggle; Back returns to this hub (not the dashboard).
- "Remove" on a row takes it out of your list.
- PASS/FAIL: Add in the store -> appears here; Remove works; Back lands on the hub.

## Play + exit (all tabs)
- ▶ Race launches the level; Exit Game AND Esc->Pause->Main Menu both return to the HUB (same
  fix pattern as the community Play). Play count bumps.

## Regression checks
- Normal + Platformer game-selection still show the 4 slots (Create/Continue/Restart/Copy/Delete).
- Community store still loads for logged-in users even if world_added didn't exist yet (resilient).

## Known / by design
- Live is cloud-only (offline worlds can't be Live).
- Soft cap on Live levels (20) is NOT enforced yet - deferred.
- Global high-score display uses the existing SR leaderboard; System levels share it via worlds.id.
