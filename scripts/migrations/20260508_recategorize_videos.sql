-- Recategorize video.category from {film-tv, commercial, music} to
-- {brands, originals, theatre}. Run this in the Supabase SQL editor (or
-- via psql) before deploying the matching code change.
--
-- Mapping (per user direction):
--   film-tv     → originals
--   commercial  → brands
--   music       → originals   (no music rows currently exist; included for safety)
--
-- Strategy: drop the old CHECK constraint first so we can write the new
-- values, migrate the data, then add the new constraint. All inside a
-- transaction so a failure leaves the table untouched.

BEGIN;

-- 1. Drop whichever CHECK constraint enforces the category enum.
--    Default Supabase naming is `<table>_<column>_check`; if your migration
--    used a custom name, adjust this line.
ALTER TABLE public.videos
  DROP CONSTRAINT IF EXISTS videos_category_check;

-- 2. Migrate existing rows.
UPDATE public.videos SET category = 'brands'    WHERE category = 'commercial';
UPDATE public.videos SET category = 'originals' WHERE category IN ('film-tv', 'music');

-- 3. Add the new CHECK constraint.
ALTER TABLE public.videos
  ADD CONSTRAINT videos_category_check
  CHECK (category IN ('brands', 'originals', 'theatre'));

-- 4. Sanity check — confirm no row still carries an old slug.
DO $$
DECLARE bad_count integer;
BEGIN
  SELECT count(*) INTO bad_count
  FROM public.videos
  WHERE category NOT IN ('brands', 'originals', 'theatre');
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'Migration left % row(s) with an unknown category', bad_count;
  END IF;
END $$;

COMMIT;
