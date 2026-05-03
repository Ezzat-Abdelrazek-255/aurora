// One-shot: upload the 14 existing public/clips/<id>.{mp4,jpg} to Supabase
// Storage and insert the matching rows into public.videos with status='ready'.
// Idempotent — uses upsert on vimeo_id + storage upsert:true.

import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CLIPS_DIR = join(ROOT, "public", "clips");

// The 14 records live here as a one-time seed. After this migration they're
// removed from the codebase entirely — Supabase becomes the source of truth.
const seed = [
  { id: "1185495857", hash: "b229874bcf", name: "Apple",          category: "commercial", role: "Talent" },
  { id: "1185506426", hash: "51eee0e281", name: "Libresse",       category: "commercial", role: "Talent" },
  { id: "1185578722", hash: "b0cfdcb19a", name: "Like Sugar",     category: "music",      role: "Talent" },
  { id: "1185699012", hash: "05324b8bff", name: "Apple",          category: "commercial", role: "Talent" },
  { id: "1185671764", hash: "d9afa817da", name: "Apple",          category: "commercial", role: "Talent" },
  { id: "1185677642", hash: "223271c8dd", name: "Nike",           category: "commercial", role: "Talent" },
  { id: "1185679955", hash: "d9130ae9de", name: "John Lewis",     category: "commercial", role: "Talent" },
  { id: "1185677828", hash: "619ba28358", name: "Nike",           category: "commercial", role: "Talent" },
  { id: "1185677076", hash: "a03be8533b", name: "Bodyform",       category: "commercial", role: "Talent" },
  { id: "1185671998", hash: "0086da9e04", name: "Cadbury",        category: "commercial", role: "Talent" },
  { id: "1185678996", hash: "d4e32bed54", name: "Nike",           category: "commercial", role: "Talent" },
  { id: "1185678936", hash: "54abb94ff0", name: "Audi",           category: "commercial", role: "Talent" },
  { id: "1185681938", hash: "24f5a03e14", name: "Tokyo Olympics", category: "film-tv",    role: "Talent" },
  { id: "1185680078", hash: "3b2ad7abff", name: "Sport England",  category: "commercial", role: "Talent" },
];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("missing supabase env vars");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

function probeAspect(mp4) {
  return new Promise((resolve, reject) => {
    const p = spawn("ffprobe", [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=width,height",
      "-of", "csv=p=0",
      mp4,
    ]);
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("exit", (code) => {
      if (code !== 0) return reject(new Error(`ffprobe ${code}: ${err}`));
      const [w, h] = out.trim().split(",").map((n) => Number(n.trim()));
      resolve(w && h ? w / h : 16 / 9);
    });
    p.on("error", reject);
  });
}

async function migrate() {
  console.log(`Migrating ${seed.length} videos to Supabase`);
  let ok = 0, fail = 0;

  for (const [idx, v] of seed.entries()) {
    const mp4Path = join(CLIPS_DIR, `${v.id}.mp4`);
    const jpgPath = join(CLIPS_DIR, `${v.id}.jpg`);
    try {
      await stat(mp4Path);
      await stat(jpgPath);
    } catch {
      console.error(`  ✗ ${v.id} (${v.name}) — local files missing`);
      fail++;
      continue;
    }

    try {
      const aspect = await probeAspect(mp4Path);
      const [mp4Bytes, jpgBytes] = await Promise.all([
        readFile(mp4Path),
        readFile(jpgPath),
      ]);

      const mp4Up = await supabase.storage.from("clips").upload(
        `${v.id}.mp4`, mp4Bytes,
        { contentType: "video/mp4", upsert: true },
      );
      if (mp4Up.error) throw mp4Up.error;

      const jpgUp = await supabase.storage.from("clips").upload(
        `${v.id}.jpg`, jpgBytes,
        { contentType: "image/jpeg", upsert: true },
      );
      if (jpgUp.error) throw jpgUp.error;

      const { error: upsertErr } = await supabase.from("videos").upsert(
        {
          vimeo_id:     v.id,
          vimeo_hash:   v.hash,
          name:         v.name,
          category:     v.category,
          role:         v.role,
          clip_path:    `${v.id}.mp4`,
          poster_path:  `${v.id}.jpg`,
          aspect_ratio: aspect,
          status:       "ready",
          position:     idx,
        },
        { onConflict: "vimeo_id" },
      );
      if (upsertErr) throw upsertErr;

      console.log(`  ✓ ${v.id.padEnd(11)} ${v.name.padEnd(18)} mp4=${mp4Bytes.byteLength} jpg=${jpgBytes.byteLength} aspect=${aspect.toFixed(3)}`);
      ok++;
    } catch (e) {
      console.error(`  ✗ ${v.id} (${v.name}) — ${e?.message ?? e}`);
      fail++;
    }
  }

  console.log(`\nDone. ok=${ok} fail=${fail}`);
  if (fail > 0) process.exit(1);
}

migrate().catch((e) => {
  console.error(e);
  process.exit(1);
});
