#!/usr/bin/env node
/**
 * Pre-create a Supabase auth user for the dashboard allow-list.
 *
 * Usage: node scripts/create-admin-user.mjs <email>
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from
 * .env.local. Creates the user with email_confirm=true so they can request
 * a magic link without going through email verification.
 *
 * Safe to run multiple times — if the user already exists, prints a notice
 * and exits 0.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const email = process.argv[2];
if (!email) {
  console.error("usage: node scripts/create-admin-user.mjs <email>");
  process.exit(1);
}

const envPath = resolve(process.cwd(), ".env.local");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await supabase.auth.admin.createUser({
  email,
  email_confirm: true,
});

if (error) {
  if (/already.*registered|exists/i.test(error.message)) {
    console.log(`User ${email} already exists — nothing to do.`);
    process.exit(0);
  }
  console.error("createUser failed:", error.message);
  process.exit(1);
}

console.log(`Created user ${data.user.email} (id: ${data.user.id}).`);
