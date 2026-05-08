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
import { createAdminClient } from "./lib/supabase.mjs";

const email = process.argv[2];
if (!email) {
  console.error("usage: node scripts/create-admin-user.mjs <email>");
  process.exit(1);
}

const supabase = createAdminClient();

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
