#!/usr/bin/env node
/**
 * One-shot seed for the `plays` table. Uploads pre-optimized JPGs from
 * /tmp/aurora-plays/<slug>/ into the `clips` bucket under `plays/<slug>/`,
 * then inserts (or upserts) the matching rows in `ready` status.
 *
 * Run AFTER applying scripts/migrations/20260509_create_plays.sql.
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
 */
import { readFile, readdir, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { createAdminClient } from "./lib/supabase.mjs";

const PLAYS = [
  {
    slug: "a-view-from-the-bridge",
    name: "A View From the Bridge",
    role: "Talent",
    sourceDir: "/tmp/aurora-plays/bridge",
  },
  {
    slug: "native-gardens",
    name: "Native Gardens",
    role: "Talent",
    sourceDir: "/tmp/aurora-plays/native-gardens",
  },
];

const supabase = createAdminClient();
const bucket = supabase.storage.from("clips");

function identify(path) {
  return new Promise((resolveP, reject) => {
    const p = spawn("/usr/bin/identify", ["-format", "%w %h", path]);
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("exit", (code) => {
      if (code !== 0) return reject(new Error(`identify: ${err}`));
      const [w, h] = out.trim().split(/\s+/).map(Number);
      if (!w || !h) return reject(new Error(`identify parse: ${out}`));
      resolveP({ w, h });
    });
    p.on("error", reject);
  });
}

async function uploadOne(localPath, destPath) {
  const bytes = await readFile(localPath);
  const { error } = await bucket.upload(destPath, bytes, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (error) throw error;
  return bytes.byteLength;
}

async function seedPlay({ slug, name, role, sourceDir }, position) {
  console.log(`\n→ ${slug} ("${name}")`);
  const entries = (await readdir(sourceDir))
    .filter((f) => f.toLowerCase().endsWith(".jpg"))
    .sort(); // alphabetical → cover is first
  if (entries.length === 0) {
    throw new Error(`No .jpg files in ${sourceDir}`);
  }

  const galleryPaths = [];
  let totalBytes = 0;
  for (const file of entries) {
    const local = join(sourceDir, file);
    const dest = `plays/${slug}/${file}`;
    const size = await uploadOne(local, dest);
    totalBytes += size;
    galleryPaths.push(dest);
    console.log(`  ✓ ${dest} (${size} bytes)`);
  }
  const coverPath = galleryPaths[0];
  const dim = await identify(join(sourceDir, entries[0]));
  const aspect = dim.w / dim.h;

  const row = {
    slug,
    name,
    category: "theatre",
    role,
    status: "ready",
    cover_path: coverPath,
    gallery_paths: galleryPaths,
    aspect_ratio: aspect,
    position,
  };
  const { error } = await supabase.from("plays").upsert(row, {
    onConflict: "slug",
  });
  if (error) throw error;
  console.log(
    `  → row upserted (cover ${dim.w}x${dim.h}, aspect ${aspect.toFixed(3)}, ${entries.length} images, ${(totalBytes / 1024).toFixed(0)} KB)`,
  );
}

// Find the highest existing play position so re-runs don't fight existing rows.
const { data: existing, error: posErr } = await supabase
  .from("plays")
  .select("slug,position")
  .order("position", { ascending: false })
  .limit(1);
if (posErr) throw posErr;
let nextPos = (existing?.[0]?.position ?? -1) + 1;

for (const play of PLAYS) {
  // If this slug already exists, keep its position; otherwise allocate next.
  const { data: prev } = await supabase
    .from("plays")
    .select("position")
    .eq("slug", play.slug)
    .maybeSingle();
  const pos = prev?.position ?? nextPos++;
  await seedPlay(play, pos);
}

// Verify what's there.
const { data: rows, error: listErr } = await supabase
  .from("plays")
  .select("slug,name,status,position,gallery_paths,aspect_ratio")
  .order("position");
if (listErr) throw listErr;
console.log("\nFinal `plays` state:");
for (const r of rows ?? []) {
  console.log(
    `  ${r.position}: ${r.slug} (${r.status}, ${r.gallery_paths.length} images, aspect ${Number(r.aspect_ratio).toFixed(3)})`,
  );
}

// Sanity: ensure cover URLs resolve.
console.log("\nCover URLs:");
for (const r of rows ?? []) {
  const url = bucket.getPublicUrl(`${r.gallery_paths[0]}`).data.publicUrl;
  console.log(`  ${r.slug}: ${url}`);
}

await stat("/tmp/aurora-plays").catch(() => {});
console.log("\nDone.");
