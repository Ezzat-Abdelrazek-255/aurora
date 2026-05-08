#!/usr/bin/env node
/**
 * Set (or reset) the password for an existing dashboard admin user.
 *
 * Usage: node scripts/set-admin-password.mjs <email> <password>
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from
 * .env.local. Looks up the auth user by email, then calls
 * supabase.auth.admin.updateUserById to set the password.
 */
import { createAdminClient } from "./lib/supabase.mjs";

const [, , email, password] = process.argv;
if (!email || !password) {
  console.error(
    "usage: node scripts/set-admin-password.mjs <email> <password>",
  );
  process.exit(1);
}

const supabase = createAdminClient();

const { data: list, error: listErr } = await supabase.auth.admin.listUsers({
  page: 1,
  perPage: 1000,
});
if (listErr) {
  console.error("listUsers failed:", listErr.message);
  process.exit(1);
}
const target = list.users.find(
  (u) => u.email?.toLowerCase() === email.toLowerCase(),
);
if (!target) {
  console.error(
    `No auth user with email ${email} — run scripts/create-admin-user.mjs first.`,
  );
  process.exit(1);
}

const { error } = await supabase.auth.admin.updateUserById(target.id, {
  password,
  email_confirm: true,
});
if (error) {
  console.error("updateUserById failed:", error.message);
  process.exit(1);
}

console.log(`Password updated for ${target.email}.`);
