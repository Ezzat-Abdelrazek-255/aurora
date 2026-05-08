import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const CATEGORIES = [
  { value: "film-tv", label: "Film/TV" },
  { value: "commercial", label: "Commercials" },
  { value: "music", label: "Music" },
] as const;

export const ROLES = ["Producer", "Talent"] as const;

export type Category = (typeof CATEGORIES)[number]["value"];
export type Role = (typeof ROLES)[number];

export const CATEGORY_VALUES = CATEGORIES.map((c) => c.value) as readonly Category[];

// Single source of truth for category / role validation. Routes that accept
// these values import the schema instead of re-declaring `z.enum([...])`.
export const categorySchema = z.enum(
  CATEGORIES.map((c) => c.value) as [Category, ...Category[]],
);
export const roleSchema = z.enum(ROLES as unknown as [Role, ...Role[]]);

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

/** Public read gated by RLS (`status = 'ready'`); anon key is sufficient. */
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
