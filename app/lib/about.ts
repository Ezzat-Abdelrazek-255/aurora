import { cacheLife, cacheTag, revalidateTag } from "next/cache";
import { createSupabaseAdminClient } from "./supabase/admin";

export const ABOUT_TAG = "about";

/** Mark the cached /about page stale (stale-while-revalidate). */
export function revalidateAbout() {
  revalidateTag(ABOUT_TAG, "max");
}

export type AboutLink = { label: string; url: string };
export type AboutAward = { year: string; kind: string; body: string };

export type AboutContent = {
  bio: string;
  awards: AboutAward[];
  production_email: string;
  commercial: { name: string; email: string };
  reforest: { body: string; links: AboutLink[] };
  connect_links: AboutLink[];
};

export const DEFAULT_ABOUT: AboutContent = {
  bio: "",
  awards: [],
  production_email: "",
  commercial: { name: "", email: "" },
  reforest: { body: "", links: [] },
  connect_links: [],
};

/**
 * Public read for /about. Cached under tag `about` with `cacheLife('hours')`
 * since content changes rarely; the admin PUT route calls
 * `revalidateAbout()` for instant updates after edits.
 */
export async function getAboutContent(): Promise<AboutContent> {
  "use cache";
  cacheTag(ABOUT_TAG);
  cacheLife("hours");

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("about_content")
    .select("content")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) return DEFAULT_ABOUT;
  return { ...DEFAULT_ABOUT, ...(data.content as Partial<AboutContent>) };
}
