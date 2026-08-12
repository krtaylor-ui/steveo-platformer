-- ============================================================
-- tranche1_fixes.sql — fixes for the Tranche 1 tester defects. Run in the Supabase
-- SQL editor. Idempotent-ish; safe to re-run.
-- ============================================================

-- T1-1 — rating_avg was created as a PLAIN column by an earlier migration, so the later
-- `ADD COLUMN IF NOT EXISTS rating_avg ... GENERATED` was silently SKIPPED (IF NOT EXISTS
-- discards the generated-ness). Result: the column exists but always reads 0, so
-- "Top rated" sorts wrong. Drop it and re-add it as a GENERATED column.
ALTER TABLE public.worlds DROP COLUMN IF EXISTS rating_avg;
ALTER TABLE public.worlds ADD COLUMN rating_avg NUMERIC
  GENERATED ALWAYS AS (CASE WHEN rating_count > 0 THEN rating_sum::numeric / rating_count ELSE 0 END) STORED;
CREATE INDEX IF NOT EXISTS idx_worlds_rating_avg ON public.worlds (rating_avg DESC);

-- Verify it's actually generated now (should return 'ALWAYS'):
-- SELECT is_generated FROM information_schema.columns
--  WHERE table_name = 'worlds' AND column_name = 'rating_avg';

-- Seam-1 — `downloadable` defaults FALSE and the backfill only set `state`, so the 5 existing
-- published worlds read "Not downloadable" and can't be reached by the download flow. Make
-- currently-published worlds downloadable (new publishes set it via the UI).
UPDATE public.worlds SET downloadable = TRUE WHERE is_published = TRUE;

-- Optional — seed a few curated system tags so the tag filter has selectable options.
INSERT INTO public.system_tags (name) VALUES
  ('parkour'), ('puzzle'), ('combat'), ('boss-fight'), ('maze'),
  ('speedrun'), ('kaizo'), ('relaxing'), ('exploration'), ('classic')
ON CONFLICT (name) DO NOTHING;
-- ============================================================
