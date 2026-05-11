-- Add a `kind` column to `plays` so the dashboard can separate stills
-- (single-image) from plays (multi-image galleries) explicitly, rather than
-- relying on a gallery-count heuristic that breaks for pending uploads or
-- single-image plays.
--
-- Existing rows default to 'play'; they can be re-tagged from the dashboard
-- (or with an UPDATE) if any of them are actually stills.
--
-- Run in the Supabase SQL editor (or via psql) before deploying.

BEGIN;

DO $$ BEGIN
  CREATE TYPE public.play_kind AS ENUM ('play', 'still');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.plays
  ADD COLUMN IF NOT EXISTS kind public.play_kind NOT NULL DEFAULT 'play';

COMMIT;
