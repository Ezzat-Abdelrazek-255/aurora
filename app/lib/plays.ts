// Client+server safe types for the plays collection (theatre image galleries).
// Mirrors app/lib/videos.ts so the FilterBar / FilteredCell etc. can treat a
// Play uniformly with a Video.
import { z } from "zod";
import { CATEGORIES, ROLES, type Category, type Role } from "./videos";

export type PlayStatus = "pending" | "processing" | "ready" | "failed";

/**
 * Discriminates regular plays (multi-image theatre galleries) from stills
 * (single-image). Stored on the row so the dashboard can separate them
 * cleanly regardless of gallery state during upload.
 */
export type PlayKind = "play" | "still";
export const PLAY_KINDS = ["play", "still"] as const;
export const playKindSchema = z.enum(PLAY_KINDS as unknown as [PlayKind, ...PlayKind[]]);

/**
 * Server-side shape of a play. `coverUrl` and `galleryUrls` are absolute
 * Supabase Storage URLs resolved at fetch time so client components don't need
 * direct Supabase access.
 */
export type Play = {
  slug: string;
  name: string;
  category: Category;
  role: Role;
  /** First-frame thumbnail used for the grid card. */
  coverUrl: string;
  /** Ordered set of full-size images shown in the lightbox. Includes cover. */
  galleryUrls: string[];
  aspect: number;
};

// Same enums as videos — plays are always theatre/Talent in practice but we
// validate against the same vocabularies so the dashboard form can reuse them.
export const playCategorySchema = z.enum(
  CATEGORIES.map((c) => c.value) as [Category, ...Category[]],
);
export const playRoleSchema = z.enum(ROLES as unknown as [Role, ...Role[]]);

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
export const slugSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(SLUG_RE, "lowercase letters, numbers, hyphens; no leading/trailing hyphen");

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
