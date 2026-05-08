// Service-role Supabase client for scripts. Mirrors app/lib/supabase/admin.ts
// — bypasses RLS, full DB + Storage access. Never use from a browser context.
import { createClient } from "@supabase/supabase-js";
import { loadEnv, requireEnv } from "./env.mjs";

export function createAdminClient(env = loadEnv()) {
  const url = requireEnv(env, "NEXT_PUBLIC_SUPABASE_URL");
  const key = requireEnv(env, "SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
