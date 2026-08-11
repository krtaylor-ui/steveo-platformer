-- ============================================================
-- user_characters.sql — Phase 3 (Custom Sprites): a per-ACCOUNT reusable roster of
-- custom characters (build several, name them, reuse across any world). One row per
-- saved character. Run in the Supabase SQL editor (additive; safe to re-run).
-- Format model: server/sql/community.sql (UPPERCASE keywords, public. schema prefix,
-- IF NOT EXISTS everywhere so it's idempotent; access is via the server admin client).
-- ============================================================

-- ── Roster: one row per (user, saved character) ─────────────────────
-- definition holds the Phase-2 parts-mixer mix { name, body, sel, pal } as JSONB, so
-- the same shape-composed renderer draws it in both engines (no new columns per part).
CREATE TABLE IF NOT EXISTS public.user_characters (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  name        TEXT NOT NULL,
  definition  JSONB NOT NULL,           -- { name, body:'boy'|'girl', sel:{part:opt}, pal:{skin,hair,...} }
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A player lists their own roster by user_id; a soft cap is enforced in code, not here.
CREATE INDEX IF NOT EXISTS idx_user_characters_user ON public.user_characters (user_id, updated_at DESC);
