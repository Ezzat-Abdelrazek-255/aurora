import { createSupabaseAdminClient } from "./supabase/admin";

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

export async function getAboutContent(): Promise<AboutContent> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("about_content")
    .select("content")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) return DEFAULT_ABOUT;
  return { ...DEFAULT_ABOUT, ...(data.content as Partial<AboutContent>) };
}
