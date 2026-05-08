// Client+server safe types and validation for the videos collection.
import { z } from "zod";

export const CATEGORIES = [
  { value: "brands", label: "Brands" },
  { value: "originals", label: "Originals" },
  { value: "theatre", label: "Theatre" },
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
