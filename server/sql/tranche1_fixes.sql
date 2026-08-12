-- ============================================================
-- tranche1_fixes.sql — fixes for the Tranche 1 tester defects. Run in the Supabase
-- SQL editor. Idempotent; safe to re-run.
-- ============================================================

-- T1-1 — rating_avg exists as a PLAIN column (an earlier migration created it, so the later
-- `ADD COLUMN IF NOT EXISTS ... GENERATED` was skipped) and never gets populated, so it always
-- reads 0 and "Top rated" sorts wrong. We DON'T drop it (two views depend on it) — instead we
-- BACKFILL it now and add a trigger that keeps it in sync whenever ratings change.
UPDATE public.worlds
   SET rating_avg = CASE WHEN rating_count > 0 THEN rating_sum::numeric / rating_count ELSE 0 END;

CREATE OR REPLACE FUNCTION public.sync_rating_avg() RETURNS TRIGGER AS $$
BEGIN
  NEW.rating_avg := CASE WHEN NEW.rating_count > 0 THEN NEW.rating_sum::numeric / NEW.rating_count ELSE 0 END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_rating_avg ON public.worlds;
CREATE TRIGGER trg_sync_rating_avg
  BEFORE INSERT OR UPDATE ON public.worlds
  FOR EACH ROW EXECUTE FUNCTION public.sync_rating_avg();

CREATE INDEX IF NOT EXISTS idx_worlds_rating_avg ON public.worlds (rating_avg DESC);

-- (If the UPDATE above errors with "cannot update column rating_avg ... is a generated column",
--  then it IS generated-but-broken, not plain — tell me and I'll give you the CASCADE + view-recreate
--  path instead. Per the tester's diagnosis it's plain, so the trigger approach should just work.)

-- Seam-1 — existing published worlds default downloadable=FALSE, so they read "Not downloadable".
-- Make currently-published worlds downloadable (new publishes set it via the UI).
UPDATE public.worlds SET downloadable = TRUE WHERE is_published = TRUE;

-- Seed a few curated system tags so the tag filter has selectable options.
INSERT INTO public.system_tags (name) VALUES
  ('parkour'), ('puzzle'), ('combat'), ('boss-fight'), ('maze'),
  ('speedrun'), ('kaizo'), ('relaxing'), ('exploration'), ('classic')
ON CONFLICT (name) DO NOTHING;
-- ============================================================
