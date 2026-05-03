import { createClient } from "@supabase/supabase-js";

export type Category = "film-tv" | "commercial" | "music";
export type Role = "Producer" | "Talent";

/**
 * Server-side shape of a video. The `clipUrl` and `posterUrl` fields are
 * absolute Supabase Storage URLs resolved at fetch time so the homepage's
 * Server Components don't need direct Supabase access in client code.
 */
export type Video = {
  id: string;
  hash: string;
  name: string;
  category: Category;
  role: Role;
  clipUrl: string;
  posterUrl: string;
  aspect: number;
};

export const CATEGORIES: { value: Category; label: string }[] = [
  { value: "film-tv", label: "Film/TV" },
  { value: "commercial", label: "Commercials" },
  { value: "music", label: "Music" },
];

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
 * Fetch every video that has finished processing. Public read is gated by RLS
 * (`status = 'ready'`) so the anon key is sufficient.
 *
 * Cache strategy: explicit fetch on each request for now. When the client
 * dashboard ships we'll wrap this in `'use cache'` + `cacheTag('videos')`
 * and call `revalidateTag('videos', 'max')` from the API routes after
 * add/delete (Next 16's two-arg revalidateTag with a cacheLife profile —
 * the single-arg form is deprecated).
 */
export async function listReadyVideos(): Promise<Video[]> {
  const supabase = readClient();
  const { data, error } = await supabase
    .from("videos")
    .select(
      "vimeo_id,vimeo_hash,name,category,role,clip_path,poster_path,aspect_ratio",
    )
    .eq("status", "ready")
    .order("position", { ascending: true });

  if (error) throw error;

  const rows = (data ?? []) as VideoRow[];
  return rows
    .filter((r) => r.clip_path && r.poster_path)
    .map((r) => {
      const clipUrl = supabase.storage
        .from("clips")
        .getPublicUrl(r.clip_path as string).data.publicUrl;
      const posterUrl = supabase.storage
        .from("clips")
        .getPublicUrl(r.poster_path as string).data.publicUrl;
      return {
        id: r.vimeo_id,
        hash: r.vimeo_hash,
        name: r.name,
        category: r.category,
        role: r.role,
        clipUrl,
        posterUrl,
        aspect: Number(r.aspect_ratio ?? 16 / 9),
      } satisfies Video;
    });
}
