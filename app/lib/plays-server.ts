// Server-only — must not be imported from a "use client" module.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cacheLife, cacheTag, revalidateTag } from "next/cache";
import type { Play, PlayStatus } from "./plays";
import type { Category, Role } from "./videos";

export const PLAYS_TAG = "plays";

export function revalidatePlays() {
  revalidateTag(PLAYS_TAG, "max");
}

type PlayRow = {
  slug: string;
  name: string;
  category: Category;
  role: Role;
  status: PlayStatus;
  cover_path: string | null;
  gallery_paths: string[] | null;
  aspect_ratio: number | string | null;
};

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
 * Public RLS-gated read of `status = 'ready'` plays. Same caching shape as
 * listReadyVideos so the homepage can fetch both in parallel.
 */
export async function listReadyPlays(): Promise<Play[]> {
  "use cache";
  cacheTag(PLAYS_TAG);
  cacheLife("minutes");

  const supabase = readClient();
  const { data, error } = await supabase
    .from("plays")
    .select(
      "slug,name,category,role,status,cover_path,gallery_paths,aspect_ratio",
    )
    .eq("status", "ready")
    .order("position", { ascending: true });

  if (error) throw error;

  const bucket = supabase.storage.from("clips");
  const rows = (data ?? []) as PlayRow[];
  return rows
    .filter((r) => r.cover_path && r.gallery_paths && r.gallery_paths.length > 0)
    .map((r) => ({
      slug: r.slug,
      name: r.name,
      category: r.category,
      role: r.role,
      coverUrl: bucket.getPublicUrl(r.cover_path as string).data.publicUrl,
      galleryUrls: (r.gallery_paths as string[]).map(
        (p) => bucket.getPublicUrl(p).data.publicUrl,
      ),
      aspect: Number(r.aspect_ratio ?? 1.5),
    }) satisfies Play);
}
