-- Custom Rules — saved arena configurations (Phase 3 v3).
-- Each row is one player's saved Custom Rules config (elements + scoring + win
-- steps + common settings). Capped to 10 per user in the route layer.
-- Safe to re-run.

create table if not exists custom_rules (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  config     jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists custom_rules_user_idx on custom_rules (user_id, created_at desc);
