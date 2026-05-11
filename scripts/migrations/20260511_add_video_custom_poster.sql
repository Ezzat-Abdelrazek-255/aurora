-- Add an optional admin-supplied poster override for videos.
--
-- The trigger task continues to populate `poster_path` from the first frame
-- (with a Vimeo-thumbnail fallback for fade-in clips). When the dashboard
-- uploads a custom thumbnail it lands in `custom_poster_path`, and the
-- public read path prefers the custom one.

BEGIN;

ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS custom_poster_path text;

COMMIT;
