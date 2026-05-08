-- Recategorize video.category from {film-tv, commercial, music} to
-- {brands, originals, theatre}. Run this in the Supabase SQL editor (or
-- via psql) before deploying the matching code change.
--
-- The category column is backed by a Postgres enum type (`video_category`),
-- not a CHECK constraint. Postgres lets you ADD enum values but not DROP
-- them, so the cleanest migration is to:
--   1. cast the column to text,
--   2. drop the old enum,
--   3. UPDATE rows to the new slugs,
--   4. create the new enum,
--   5. cast the column back.
-- All inside one transaction so a failure leaves the table untouched.
--
-- Mapping (per user direction):
--   film-tv     → originals
--   commercial  → brands
--   music       → originals   (no music rows currently exist; included for safety)

BEGIN;

ALTER TABLE public.videos
  ALTER COLUMN category TYPE text USING category::text;

DROP TYPE IF EXISTS public.video_category;

UPDATE public.videos SET category = 'brands'    WHERE category = 'commercial';
UPDATE public.videos SET category = 'originals' WHERE category IN ('film-tv', 'music');

CREATE TYPE public.video_category AS ENUM ('brands', 'originals', 'theatre');

ALTER TABLE public.videos
  ALTER COLUMN category TYPE public.video_category USING category::public.video_category;

-- Sanity check — confirm no row still carries an old slug.
DO $$
DECLARE bad_count integer;
BEGIN
  SELECT count(*) INTO bad_count
  FROM public.videos
  WHERE category::text NOT IN ('brands', 'originals', 'theatre');
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'Migration left % row(s) with an unknown category', bad_count;
  END IF;
END $$;

COMMIT;
