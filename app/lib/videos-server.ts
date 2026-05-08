// Server-only — must not be imported from a "use client" module.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cacheLife, cacheTag, revalidateTag } from "next/cache";
import type { Category, Role, Video } from "./videos";

export const VIDEOS_TAG = "videos";

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

// Lazy so a misconfigured env throws on first call instead of at import,
// which would break Next's prerender introspection.
let client: SupabaseClient | null = null;
function readClient() {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }
  client = createClient(url, anon, { auth: { persistSession: false } });
  return client;
}

/**
 * Public RLS-gated read of `status = 'ready'` videos. Tag-revalidated from
 * mutation routes; the 'minutes' lifetime is the safety net for trigger
 * task completions, which can't call revalidateTag directly.
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
