# Tester Brief — Campaign §28 + §29 (builds 508-509, branch sr-level-hub)

No SQL to apply (both ride existing tables/columns). Server was restarted. Plain ASCII.

## §29 — Multi-user campaign publishing + selection UI (build 508)
- Any account can now PUBLISH its OWN campaign (was admin-only), and MULTIPLE campaigns can be live at
  once (the old one-published-at-a-time limit is gone). Names are moderation-checked on publish.
- Dashboard -> Campaign now lists ALL published campaigns (neon cards) to Play, each with a LIVE badge
  ('YOURS - LIVE' on your own), plus your drafts to playtest, plus the Campaign Builder button.
- PASS/FAIL:
  1. As a NON-admin account: build a campaign in the Builder, Publish it -> it should succeed (no "admin
     only" error) and appear in the published list.
  2. Publish a second campaign (same or another account) -> BOTH stay published (no auto-unpublish).
  3. The select screen lists all published campaigns; Play launches each; your own shows 'YOURS - LIVE'.
  4. A rude campaign name is rejected on publish (moderation).

## §28 — Campaign manual save / resume-exact (build 509)
- While playing a campaign level, the exact state (position/health/inventory) is banked every ~8s.
- Esc -> Main Menu (or closing the tab) and later 'Play' on that campaign should RESUME THE EXACT SPOT,
  not the level start.
- Winning a level, running out of lives, or Restart Campaign all CLEAR the resume point (fresh next time).
- PASS/FAIL:
  1. Start a campaign level, move partway in, wait a few seconds, Esc -> Main Menu.
  2. Re-enter the campaign -> Play -> you should resume roughly where you left off (within ~8s of play),
     with your health/inventory, NOT at the level start.
  3. Beat a level -> next time you enter that level it starts fresh (no stale resume).
  4. Game Over / Restart -> fresh run.

## NPCs
Not built this pass (it's undesigned + large). A full build-ready design spec was written:
docs/NPC_DESIGN_SPEC.md (both engines + dialogue model + v1/v2/v3). Nothing to test yet.
