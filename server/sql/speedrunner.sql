-- ============================================================================
-- speedrunner.sql — migrations for the Speed Runner storefront / level-state /
-- leaderboard work. Run top-to-bottom in the Supabase SQL editor. Idempotent
-- (IF NOT EXISTS / guarded), so re-running is safe. Nothing here is applied by the
-- app; the code that USES these columns is gated until you run this.
--
-- Prereqs verified 2026-08-11: server/sql/community.sql and server/sql/stats.sql
-- are already applied (worlds community columns + player_achievements exist).
-- ============================================================================

-- 1. LEVEL STATES — Draft / Live / Published, downloadable opt-in, immutable creator.
alter table worlds
  add column if not exists state text not null default 'draft'
    check (state in ('draft','live','published')),
  add column if not exists downloadable boolean not null default false,
  add column if not exists original_author uuid references users(id);

-- Backfill: anything already published becomes 'published', the rest stay 'draft'.
update worlds set state = 'published' where is_published = true and state = 'draft';

-- Provenance is stamped once and must never change (so a downloader can't rewrite
-- who made a level). Immutability enforced by a trigger.
create or replace function lock_original_author() returns trigger as $$
begin
  if OLD.original_author is not null
     and NEW.original_author is distinct from OLD.original_author then
    raise exception 'original_author is immutable';
  end if;
  return NEW;
end;
$$ language plpgsql;

drop trigger if exists trg_lock_original_author on worlds;
create trigger trg_lock_original_author
  before update on worlds
  for each row execute function lock_original_author();

-- 2. PLAY COUNT + RECENCY — Most-Played / Trending sorts. (App increments play_count
--    and stamps last_played_at on each successful play launch.)
alter table worlds
  add column if not exists play_count integer not null default 0,
  add column if not exists last_played_at timestamptz;

-- 3. RATING AVERAGE — fixes the sum-vs-avg sort (was ordering by rating_sum, which
--    favours many-mediocre over few-excellent). Generated column + index.
alter table worlds
  add column if not exists rating_avg numeric
    generated always as (
      case when rating_count > 0 then rating_sum::numeric / rating_count else 0 end
    ) stored;
create index if not exists idx_worlds_rating_avg on worlds (rating_avg desc);

-- 4. TAGS — GIN-indexed array + a curated system tag list + a request queue.
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
  status text not null default 'pending'
    check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);

-- 5. THUMBNAILS — column for the capture URL / data-URI. (ALSO create a public
--    Storage bucket named 'world-thumbnails' in the Supabase dashboard; that step
--    is manual and can't be scripted here.)
alter table worlds add column if not exists thumbnail text;

-- 6. PER-LEVEL ACHIEVEMENT UNLOCKS — world scope on the existing table (Option A).
alter table player_achievements add column if not exists world_id uuid references worlds(id);
create index if not exists idx_player_ach_world on player_achievements (player_id, world_id);

-- 7. LEADERBOARD RE-KEY — move speedrun_results.level_id ("author:worldName") to
--    worlds.id. Add the column + backfill what resolves; unresolved rows keep the
--    old level_id string. (Client switches its levelId + sr_* localStorage keys to
--    the world id in lockstep — see docs/SPEEDRUNNER_MIGRATIONS.md §7.)
alter table speedrun_results add column if not exists world_id uuid references worlds(id);

update speedrun_results r
   set world_id = w.id
  from worlds w
  join users u on u.id = w.creator_id
 where r.world_id is null
   and r.level_id = u.username || ':' || w.world_name;

create index if not exists idx_speedrun_world on speedrun_results (world_id);

-- Published cap (2 -> 20) is CODE, not SQL — already shipped in
-- server/worlds-routes.js (PUBLISH_CAP = 20). Listed for completeness.
-- ============================================================================
