// Server-only data + cache surface for the videos collection. Imports
// next/cache, so this file must NEVER be imported (transitively) from a
// "use client" module — see app/lib/videos.ts for the client-safe split.
import { createClient } from "@supabase/supabase-js";
import { cacheLife, cacheTag, revalidateTag } from "next/cache";
import type { Category, Role, Video } from "./videos";

export const VIDEOS_TAG = "videos";

/** Mark the cached homepage video list stale (stale-while-revalidate). */
export function revalidateVideos() {
  revalidateTag(VIDEOS_TAG, "max");
}

type VideoRow = {
  vimeo_id: string;
  vimeo_hash: string;
  name: string;
  category: Category;
  role: Role;
  clip_path: string | null;
  poster_path: string | null;
  aspect_ratio: number | string | null;
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function readClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }
  return createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false },
  });
}

/**
 * Public read gated by RLS (`status = 'ready'`); anon key is sufficient.
 *
 * Cached under tag `videos` with `cacheLife('minutes')` so trigger-task
 * completions (background → ready transitions) propagate within ~5 min
 * worst case. Direct admin actions (add/edit/delete/reorder) call
 * `revalidateVideos()` from their route handlers for instant updates.
 */
export async function listReadyVideos(): Promise<Video[]> {
  "use cache";
  cacheTag(VIDEOS_TAG);
  cacheLife("minutes");

  const supabase = readClient();
  const { data, error } = await supabase
    .from("videos")
    .select(
      "vimeo_id,vimeo_hash,name,category,role,clip_path,poster_path,aspect_ratio",
    )
    .eq("status", "ready")
    .order("position", { ascending: true });

  if (error) throw error;

  const bucket = supabase.storage.from("clips");
  const rows = (data ?? []) as VideoRow[];
  return rows
    .filter((r) => r.clip_path && r.poster_path)
    .map((r) => ({
      id: r.vimeo_id,
      hash: r.vimeo_hash,
      name: r.name,
      category: r.category,
      role: r.role,
      clipUrl: bucket.getPublicUrl(r.clip_path as string).data.publicUrl,
      posterUrl: bucket.getPublicUrl(r.poster_path as string).data.publicUrl,
      aspect: Number(r.aspect_ratio ?? 16 / 9),
    }) satisfies Video);
}
