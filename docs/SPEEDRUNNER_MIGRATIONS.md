# SPEED RUNNER — SQL MIGRATIONS TO LINE UP

**Run these in one sitting when you're ready to unlock the DB-gated storefront / level-state / leaderboard
work.** Everything on branch `speedrunner-overhaul` that does NOT need these was built and is green; the
items below are the schema wall the overnight run stopped at (per the migration-deferred principle). Each
block is copy-paste-ready with a one-line *why*. Apply in order. Nothing here has been applied.

> Convention note: this project's Supabase tables are `worlds`, `users`, `speedrun_results`,
> `player_achievements`, plus the community columns in `server/sql/community.sql`. Verify step 0 FIRST —
> several existing routes 500 if `community.sql` / `stats.sql` were never applied.

---

## 0. VERIFY the already-authored SQL is actually applied (do this first)

```sql
-- Are the community columns present? (server/sql/community.sql)
select column_name from information_schema.columns
 where table_name = 'worlds'
   and column_name in ('published_at','genre','difficulty','download_count','rating_sum','rating_count','original_author');

-- Is the stats/achievements table present? (server/sql/stats.sql)
select to_regclass('public.player_achievements');
```
*Why:* the publish route stamps `published_at`/`genre`, the community browse reads `rating_sum`, and the
achievements route reads `player_achievements`. If those returned nothing above, apply
`server/sql/community.sql` and `server/sql/stats.sql` before the rest.

---

## 1. Level states: Draft / Live / Published + downloadable + immutable provenance  (Epic A1)

```sql
alter table worlds
  add column if not exists state text not null default 'draft'
    check (state in ('draft','live','published')),
  add column if not exists downloadable boolean not null default false,
  add column if not exists original_author uuid references users(id);

-- Backfill: existing published worlds become 'published'; everything else 'draft'.
update worlds set state = 'published' where is_published = true and state = 'draft';

-- Provenance is set once (on create / legitimate download) and must never change afterwards, so a
-- downloader can't rewrite who made a level (§2). Enforce immutability with a trigger.
create or replace function lock_original_author() returns trigger as $$
begin
  if OLD.original_author is not null and NEW.original_author is distinct from OLD.original_author then
    raise exception 'original_author is immutable';
  end if;
  return NEW;
end; $$ language plpgsql;

drop trigger if exists trg_lock_original_author on worlds;
create trigger trg_lock_original_author before update on worlds
  for each row execute function lock_original_author();
```
*Why:* today only `is_published` (bool) exists. The three-state model + the downloadable opt-in + an
un-editable original-creator stamp are the spine of the landing screen, the storefront, and
Campaign-eligibility. Client controls + the validator gate (`js/level-validator.js`, shipped) are already
built; wire the publish/state route to `state` once this is in.
*Published cap:* raised to 20 in code already (build 453, `server/worlds-routes.js`) — no SQL needed.

---

## 2. Play count + last-played (Most-Played / Trending sorts)  (Epic B2)

```sql
alter table worlds
  add column if not exists play_count integer not null default 0,
  add column if not exists last_played_at timestamptz;
```
*Why:* the storefront "Most-Played" and time-decayed "Trending" sorts need a counter + recency. Add an
increment route (`POST /api/worlds/:id/played`) that bumps `play_count` and stamps `last_played_at` on
each successful play launch.

---

## 3. Rating average (fix the sum-vs-avg sort bug)  (Epic B2)

```sql
alter table worlds
  add column if not exists rating_avg numeric
    generated always as (case when rating_count > 0 then rating_sum::numeric / rating_count else 0 end) stored;
create index if not exists idx_worlds_rating_avg on worlds (rating_avg desc);
```
*Why:* `server/community-routes.js` sorts "Highest-Rated" by `rating_sum`, which favours many-but-mediocre
ratings over few-but-excellent. A generated `rating_avg` column lets PostgREST order by the true average
(`query.order('rating_avg', { ascending:false })`).

---

## 4. System tags + tag-request queue  (Epic B3)

```sql
alter table worlds add column if not exists tags text[] not null default '{}';
create index if not exists idx_worlds_tags on worlds using gin (tags);

create table if not exists system_tags (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  created_at timestamptz not null default now()
);

create table if not exists tag_requests (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references users(id),
  name text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);
```
*Why:* admin-curated tags + a "request a new tag" queue for review. GIN index makes tag filtering fast.

---

## 5. Thumbnails  (Epic B1)

```sql
alter table worlds add column if not exists thumbnail text;   -- storage URL or data-URI
```
Plus (manual, in the Supabase dashboard): create a public Storage bucket `world-thumbnails`.
*Why:* thumbnail CAPTURE is buildable client-side (the 2D `_buildMiniPreview` colour-strip is a starting
point; overhead needs its own snapshot), but STORING needs a column + a bucket you provision.

---

## 6. Per-level achievement unlocks  (Epic D3)

```sql
-- Option A (simplest): add world scope to the existing table.
alter table player_achievements add column if not exists world_id uuid references worlds(id);
create index if not exists idx_player_ach_world on player_achievements (player_id, world_id);

-- Option B (cleaner separation) — a dedicated table instead of Option A:
-- create table if not exists world_achievements (
--   id uuid primary key default gen_random_uuid(),
--   player_id uuid references users(id),
--   world_id  uuid references worlds(id),
--   ach_key   text not null,
--   unlocked_at timestamptz not null default now(),
--   unique (player_id, world_id, ach_key)
-- );
```
*Why:* creator-defined per-level achievements (the templates data model rides `world_data.achievements[]`,
migration-free) need a place to record cross-session unlocks. The in-level evaluator can fire + notify in
one session without this; persistence is what's gated.

---

## 7. Leaderboard re-key: `author:worldName` → `worlds.id`  (LB)

```sql
-- speedrun_results.level_id is today the fragile "author:worldName" string. Move to worlds.id.
alter table speedrun_results add column if not exists world_id uuid references worlds(id);

-- Backfill where the string can be resolved to a world (best-effort; unresolved rows keep level_id).
-- Adjust the match to however author:worldName was composed if needed.
update speedrun_results r
   set world_id = w.id
  from worlds w, users u
 where u.id = w.creator_id
   and r.level_id = u.username || ':' || w.world_name
   and r.world_id is null;

create index if not exists idx_speedrun_world on speedrun_results (world_id);
```
*Why:* `author:worldName` collides (two creators, same title) and breaks on rename. Re-keying to `worlds.id`
makes SR leaderboards stable. `player_id` already exists on `speedrun_results`, so scope non-system boards
per account (`.eq('player_id', …)`) and leave System-level boards global. **Client note:** the SR engines
build `levelId` from `author:worldName` (`js/game.js` `_sr.levelId`, `js/overhead/overhead-game.js`) and the
`sr_lb_`/`sr_ghost_`/`sr_attempts_`/`sr_bestpct_` localStorage keys derive from it — switch those to the
world id in lockstep with this migration (do NOT do it before, or local best-times orphan).

---

## 8. (No SQL) Published cap → 20

Already done in code (build 453, `server/worlds-routes.js`). Listed here only so the checklist is complete.

---

### After applying, wire these (code already scaffolded / specced on the branch):
- Epic A: switch the publish route to write `state`; gate Draft→Live/Published on
  `LEVEL_VALIDATOR.canGoLive` (shipped, `js/level-validator.js`); build the landing tabs (System / My
  Levels / Community).
- Epic B: storefront sorts (Newest/Most-Played/Highest-Rated/Trending), tag filter, duration buckets,
  search-as-you-type, creator mini-profiles, downloadable + provenance enforcement in the download route.
- Epic D: persist unlocks via the new column/table.
- LB: swap the SR `levelId` to `worlds.id` (see §7 client note).
