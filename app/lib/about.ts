import { cacheLife, cacheTag, revalidateTag } from "next/cache";
import { createSupabaseAdminClient } from "./supabase/admin";

export const ABOUT_TAG = "about";

export function revalidateAbout() {
  revalidateTag(ABOUT_TAG, "max");
}

export type AboutLink = { label: string; url: string };
export type AboutAward = { year: string; kind: string; body: string };
export type AboutContact = { label: string; name: string; email: string };

export type AboutContent = {
  bio: string;
  awards: AboutAward[];
  contacts: AboutContact[];
  reforest: { body: string; links: AboutLink[] };
  connect_links: AboutLink[];
};

export const DEFAULT_ABOUT: AboutContent = {
  bio: "",
  awards: [],
  contacts: [],
  reforest: { body: "", links: [] },
  connect_links: [],
};

type LegacyAbout = Partial<AboutContent> & {
  production_email?: string;
  commercial?: { name?: string; email?: string };
};

// Synthesize the contacts list from legacy fixed fields when present, so
// content saved before contacts became a dynamic list still shows up.
function migrateContacts(raw: LegacyAbout): AboutContact[] {
  if (raw.contacts && raw.contacts.length > 0) return raw.contacts;
  const out: AboutContact[] = [];
  if (raw.production_email) {
    out.push({ label: "Production", name: "", email: raw.production_email });
  }
  if (raw.commercial?.email) {
    out.push({
      label: "Commercial",
      name: raw.commercial.name ?? "",
      email: raw.commercial.email,
    });
  }
  return out;
}

/** Cached at 'hours' since content rarely changes; PUT /api/about revalidates. */
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
  const raw = data.content as LegacyAbout;
  return {
    ...DEFAULT_ABOUT,
    ...raw,
    contacts: migrateContacts(raw),
  };
}
