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
