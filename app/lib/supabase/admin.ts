import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. SERVER-ONLY — bypasses RLS, full database + storage
 * access. Never import from a "use client" file. Used by API routes and the
 * Trigger.dev task to write videos rows and upload to Storage.
 */
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
