import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "./supabase/server";

/**
 * Allow-list check for the dashboard / admin APIs.
 *
 * `ALLOWED_ADMIN_EMAIL` is a comma-separated list of emails. Whitespace
 * around entries is trimmed; comparison is case-insensitive.
 */
export function isAllowedAdmin(
  email: string | null | undefined,
): boolean {
  if (!email) return false;
  const raw = process.env.ALLOWED_ADMIN_EMAIL;
  if (!raw) return false;
  const needle = email.toLowerCase();
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(needle);
}

/**
 * Defense-in-depth allow-list check used by every admin route handler.
 * The proxy already gates these routes; we re-verify in-handler so a
 * direct invocation that bypasses the proxy still 401s/403s.
 *
 * Returns `{ ok: true }` on success or `{ ok: false, res }` with a ready-
 * to-return JSON response on failure.
 */
export async function requireAdmin(): Promise<
  { ok: true } | { ok: false; res: NextResponse }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAllowedAdmin(user.email)) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: user ? "forbidden" : "unauthorized" },
        { status: user ? 403 : 401 },
      ),
    };
  }
  return { ok: true };
}
