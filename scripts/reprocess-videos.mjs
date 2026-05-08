#!/usr/bin/env node
/**
 * Re-trigger the `process-video` Trigger.dev task for existing rows so the
 * updated pipeline can run on them — useful after pipeline changes (e.g.
 * the black-first-frame thumbnail fallback).
 *
 * Usage:
 *   node scripts/reprocess-videos.mjs                 # all status='ready'
 *   node scripts/reprocess-videos.mjs --status=any    # every row
 *   node scripts/reprocess-videos.mjs --status=failed # only failed rows
 *   node scripts/reprocess-videos.mjs --id=<vimeoId>  # one row
 *   node scripts/reprocess-videos.mjs --dry-run       # list, don't trigger
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and
 * TRIGGER_SECRET_KEY from .env.local. Uses the service-role key so it sees
 * every row (not just status='ready') and bypasses RLS.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { tasks } from "@trigger.dev/sdk";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    if (!a.startsWith("--")) return [a, true];
    const eq = a.indexOf("=");
    return eq < 0 ? [a.slice(2), true] : [a.slice(2, eq), a.slice(eq + 1)];
  }),
);

const envPath = resolve(process.cwd(), ".env.local");
let env = {};
try {
  env = Object.fromEntries(
    readFileSync(envPath, "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      }),
  );
} catch {
  // Fall back to process.env if .env.local is missing (e.g. CI).
}
const get = (k) => env[k] ?? process.env[k];

const supabaseUrl = get("NEXT_PUBLIC_SUPABASE_URL");
const serviceKey = get("SUPABASE_SERVICE_ROLE_KEY");
const triggerKey = get("TRIGGER_SECRET_KEY");

if (!supabaseUrl || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
  process.exit(1);
}
if (!triggerKey && !args["dry-run"]) {
  console.error("Missing TRIGGER_SECRET_KEY in .env.local (needed to trigger)");
  process.exit(1);
}
if (triggerKey) process.env.TRIGGER_SECRET_KEY = triggerKey;

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const status = args.status ?? "ready";
const onlyId = args.id;

let q = supabase
  .from("videos")
  .select("vimeo_id,vimeo_hash,name,category,role,status")
  .order("position", { ascending: true });

if (onlyId) {
  q = q.eq("vimeo_id", onlyId);
} else if (status !== "any") {
  q = q.eq("status", status);
}

const { data, error } = await q;
if (error) {
  console.error("✗ Failed to list videos:", error.message);
  process.exit(1);
}
const rows = data ?? [];
if (rows.length === 0) {
  console.log("No matching rows.");
  process.exit(0);
}

console.log(
  `Reprocessing ${rows.length} video(s)${
    onlyId ? ` (id=${onlyId})` : ` (status=${status})`
  }${args["dry-run"] ? " — DRY RUN" : ""}`,
);

if (args["dry-run"]) {
  for (const r of rows) {
    console.log(`  • ${r.vimeo_id} "${r.name}" [${r.status}]`);
  }
  process.exit(0);
}

// The task itself flips status to 'processing' when it starts, so we skip a
// preemptive update — keeps rows visible on the homepage until the worker
// actually picks them up.
const results = await Promise.allSettled(
  rows.map((r) =>
    tasks.trigger("process-video", {
      vimeoId: r.vimeo_id,
      vimeoHash: r.vimeo_hash,
      name: r.name,
      category: r.category,
      role: r.role,
    }),
  ),
);

let ok = 0;
let fail = 0;
results.forEach((res, i) => {
  const r = rows[i];
  const label = `${r.vimeo_id} "${r.name}" [${r.status}]`;
  if (res.status === "fulfilled") {
    console.log(`  ✓ ${label} → run ${res.value.id}`);
    ok++;
  } else {
    const e = res.reason;
    console.error(`  ✗ ${label} — ${e instanceof Error ? e.message : e}`);
    fail++;
  }
});

console.log(`\nDone. Triggered ${ok} run(s), ${fail} failure(s).`);
