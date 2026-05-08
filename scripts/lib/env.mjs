// Tiny .env.local loader shared across scripts. Returns a Record<string, string>
// merging file values with process.env (process.env wins, so a CI override of
// e.g. SUPABASE_SERVICE_ROLE_KEY takes precedence over the local file).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function loadEnv(filename = ".env.local") {
  let fileEnv = {};
  try {
    fileEnv = Object.fromEntries(
      readFileSync(resolve(process.cwd(), filename), "utf8")
        .split("\n")
        .filter((l) => l && !l.startsWith("#") && l.includes("="))
        .map((l) => {
          const i = l.indexOf("=");
          return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
        }),
    );
  } catch {
    // File missing is fine — fall back to process.env entirely.
  }
  return { ...fileEnv, ...process.env };
}

/** Read one var, throwing a helpful message if it's missing in both file and env. */
export function requireEnv(env, key) {
  const v = env[key];
  if (!v) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return v;
}
