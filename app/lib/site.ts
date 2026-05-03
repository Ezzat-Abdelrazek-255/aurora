// Single source of truth for the site's public URL + identity. Metadata,
// sitemap, robots, and JSON-LD all read from here so a domain swap is one edit.

const FALLBACK_URL = "http://localhost:3000";

function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return FALLBACK_URL;
}

export const SITE_URL = resolveSiteUrl();

export const SITE = {
  url: SITE_URL,
  name: "Aurora Leonard",
  shortName: "Aurora Leonard",
  title: "Aurora Leonard — Filmmaker & Producer",
  tagline: "Filmmaker, producer, and founder of Reforest Films",
  description:
    "Aurora Leonard is a filmmaker and producer crafting cinematic, purpose-led work across film, television, theater, and commercials. Selected work, awards, and contact.",
  locale: "en_US",
  twitter: "@auroraleonard",
} as const;
