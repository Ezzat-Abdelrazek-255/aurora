-- Create the `plays` table for theatre stills (image-only galleries).
--
-- Mirrors the `videos` table conventions: an enum status with public RLS for
-- ready rows, authed full-access for the dashboard, and an aspect_ratio cached
-- on the row. Image objects live in the existing `clips` bucket under
-- `plays/<slug>/...` so we don't have to provision a new bucket / policies.
--
-- Run in the Supabase SQL editor (or via psql) before deploying the matching
-- code change.

BEGIN;

DO $$ BEGIN
  CREATE TYPE public.play_status AS ENUM ('pending', 'processing', 'ready', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.plays (
  slug          text                 PRIMARY KEY,
  name          text                 NOT NULL,
  category      public.video_category NOT NULL DEFAULT 'theatre',
  -- Stored as text so we don't have to coordinate with whatever enum the
  -- videos table uses for role; the app validates via roleSchema.
  role          text                 NOT NULL DEFAULT 'Talent',
  status        public.play_status   NOT NULL DEFAULT 'pending',
  -- Storage paths inside the `clips` bucket. cover_path is the card thumbnail;
  -- gallery_paths is the ordered set of images shown in the lightbox (cover
  -- included as the first entry).
  cover_path    text,
  gallery_paths text[]               NOT NULL DEFAULT '{}',
  aspect_ratio  numeric              NOT NULL DEFAULT 1.5,
  error_message text,
  position      integer              NOT NULL DEFAULT 0,
  created_at    timestamptz          NOT NULL DEFAULT now()
);

ALTER TABLE public.plays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public reads ready plays" ON public.plays;
CREATE POLICY "public reads ready plays" ON public.plays
  FOR SELECT
  TO anon, authenticated
  USING (status = 'ready');

DROP POLICY IF EXISTS "authed full access" ON public.plays;
CREATE POLICY "authed full access" ON public.plays
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Add to the realtime publication so the dashboard picks up live updates.
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.plays;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
