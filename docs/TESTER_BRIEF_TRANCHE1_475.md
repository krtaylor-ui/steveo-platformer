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
