================================================================================
TESTER BRIEF — TRANCHE 1: STOREFRONT & PLATFORM (branch speedrunner-phase3, 473–475)
================================================================================
Prereq: server/sql/speedrunner.sql + user_characters.sql applied (done). RESTART the
local API server (node server.js) so the new routes are live. Log in (storefront +
publish need auth). Suite: node test/run.js green.

[Publish gate + state] (473/470)
  - Try to publish a world with NO Goal → rejected ("Add at least one Goal…").
  - Add a Goal, publish → succeeds; worlds.state becomes 'published', downloadable=true.

[Community browse — new filters/sorts] (473/474)
  - Community screen → Browse. New sort options: Most played, Trending (alongside Top
    rated which now uses the true AVERAGE, not sum). Search box filters as you type.
  - New "All tags" dropdown (populated from curated system_tags — add rows to that
    table to see options). Selecting a tag filters the grid.
  - Cards now show: a thumbnail (if the world has one), play count (▶ N), tag chips,
    and the author as a LINK.

[Creator profiles] (473/474)
  - Click an author link on any card → a creator bar appears (name, published count,
    total downloads/plays) and the grid filters to THAT creator's published worlds.
    "← All creators" clears it.

[Downloadable + provenance] (473)
  - A published world's Download button works and clones it to your sandbox with the
    original author preserved (immutable) and the clone marked non-downloadable.
  - (To test the block: set a world's downloadable=false in the DB → its card shows
    "⬇ Not downloadable" disabled, and POST download → 403.)

[Thumbnails] (475)
  - Publish a world from inside the editor (canvas showing the world) → a thumbnail is
    auto-captured (POST /api/worlds/:id/thumbnail) and appears on its community card.

[Community Picks] (475)
  - Browse shows a "✨ Community Picks" strip of the top-played worlds at the top
    (hidden while viewing a single creator).

[Leaderboard re-key] (473)
  - Speed Runner best-times/ghosts now key by the world's DB id (worlds.id) instead of
    author:worldName. NOTE: pre-existing LOCAL best-times (old key) are a documented
    clean cut — they won't carry over; new runs bank under the new key. Server rows are
    per-account (player_id).

DEFERRED (documented in run notes): the Speed Runner LANDING screen tabs (System/My/
Community) on the canvas menu; a per-world Downloadable opt-OUT toggle; duration
buckets; admin tag-approval / pick-generation UI (routes exist).

SERVER-DEPENDENT: everything above needs the RESTARTED local server. If you hit a
stale server the publish gate / sorts / routes will look broken — restart first.
================================================================================


================================================================================
RE-CHECK — Tranche 1 fixes (build 476 + tranche1_fixes.sql APPLIED)
================================================================================
Prereq: build 476 pulled + server RESTARTED (node server.js) + server/sql/tranche1_fixes.sql
applied (rating_avg backfill+trigger, downloadable backfill, 10 seed tags).

[T1-1 — "Top rated" now sorts] (was HIGH, SQL + trigger)
  - Verify the column is populated: rating_avg should now equal rating_sum/rating_count
    (not 0). A rating change should update it live (the trigger recomputes on any worlds
    update).
  - End-to-end order needs TWO accounts (world_ratings is unique per user+world): from
    two accounts, rate world A 5★ and world B 2★, then Browse → sort "Top rated" → A
    ranks above B and above unrated worlds.

[T1-2 — community card buttons visible] (was HIGH, CSS)
  - Every card's Download + Favorite buttons are now readable (solid Download, bordered
    Favorite; gold when favorited) in BOTH light and dark themes. No more white-on-white.

[T1-3 — Speed Runner LB re-key fires] (was HIGH, launcher)
  - Launch a Speed Runner game bound to a CLOUD world that has a DB id → game._sr.levelId
    should be that worlds.id (a UUID), NOT "author:worldName". game._launchWorldId should
    be non-null.
  - KNOWN/EXPECTED: a purely LOCAL SR save (SandboxSaves) has no DB id, so it still uses
    the legacy author:worldName key — that's fine (local worlds have no shared server
    board). Only worlds launched with a DB id re-key.

[Seam-1 — existing published worlds downloadable]
  - The 5 previously-published worlds now show an enabled ⬇ Download (not "Not
    downloadable"); a normal user can download/clone them.

[Seam-2 — publish seam aligned]
  - SANDBOX.publishWorld now sends downloadable like the UI button (identical behavior).

[Tag filtering — now testable]
  - The "All tags" dropdown now lists 10 seeded tags (#parkour, #puzzle, …). Set a
    world's tags (POST /api/worlds/:id/tags with curated names) then filter by that tag →
    only tagged worlds show.

Regression watch: re-confirm the earlier passes still hold (publish gate, thumbnail
capture, download/provenance immutability, sorts, creator profile, Picks).
================================================================================


================================================================================
RE-CHECK ROUND 2 (build 477 + 10 system_tags seeded)
================================================================================
Pull 477, restart node server.js. system_tags now has 10 rows (verified count=10).

[T1-3 — LB re-key, real fix] launch a Speed Runner game from a GAME SLOT bound to a
  cloud world (this is the path that was broken; game-play.js now passes
  record.world_id). Expect game._launchWorldId = the world's UUID and game._sr.levelId
  = that UUID (NOT "sr_unsaved_testworld" or author:worldName). The earlier SR-select-
  screen launcher was also patched.

[T1-2 — Favorite in LIGHT] measure contrast in DEFAULT/system-light theme:
  - Download (solid dark indigo #33499e on the card) → white text ≥ 4.5:1.
  - Favorite (dark text on the light pill) → ≥ 4.5:1; light text only appears in real
    dark / retro (retro/dark already passed at 9.28:1 last round).

[Tags — now testable] the "All tags" dropdown lists 10 (#parkour, #puzzle, …). Set a
  world's tags via POST /api/worlds/:id/tags with curated names → they stick; passing a
  NON-curated tag now returns a `rejected` list + note (no silent vanish). Filter the
  grid by a tag → only tagged worlds show.
================================================================================
