#!/usr/bin/env node
/**
 * Replace a video's poster with its Vimeo thumbnail without touching the
 * clip. Useful when the HLS stream is unrecoverable (so processVideo can't
 * run end-to-end) but the existing clip is fine and only the poster is
 * black.
 *
 * Usage:
 *   node scripts/swap-poster.mjs <vimeoId>            # one row
 *   node scripts/swap-poster.mjs --all-black          # scan + fix every black poster
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from
 * .env.local. Requires ffmpeg on PATH.
 */
import { mkdirSync } from "node:fs";
import { writeFile, readFile, unlink } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mapPool } from "./lib/concurrency.mjs";
import { createAdminClient } from "./lib/supabase.mjs";
import { getVimeoThumbUrl, VIMEO_UA } from "./lib/vimeo.mjs";

const args = process.argv.slice(2);
const allBlack = args.includes("--all-black");
const targetId = args.find((a) => !a.startsWith("--"));
if (!targetId && !allBlack) {
  console.error(
    "usage: node scripts/swap-poster.mjs <vimeoId>\n       node scripts/swap-poster.mjs --all-black",
  );
  process.exit(1);
}

const supabase = createAdminClient();

function run(bin, args, { stdin } = {}) {
  return new Promise((resolveP, reject) => {
    const p = spawn(bin, args);
    let stderr = "";
    const chunks = [];
    p.stdout.on("data", (d) => chunks.push(Buffer.from(d)));
    p.stderr.on("data", (d) => (stderr += d.toString()));
    p.on("exit", (code) =>
      code === 0
        ? resolveP(Buffer.concat(chunks))
        : reject(new Error(`${bin} exited ${code}\n${stderr}`)),
    );
    p.on("error", reject);
    if (stdin) p.stdin.end(stdin);
  });
}

/** Mean Y from a JPEG. Accepts either a file path or a Buffer (piped on stdin). */
async function meanLuma(input) {
  const fromBuffer = Buffer.isBuffer(input);
  const buf = await run(
    "ffmpeg",
    [
      "-loglevel",
      "error",
      "-i",
      fromBuffer ? "pipe:0" : input,
      "-pix_fmt",
      "gray",
      "-f",
      "rawvideo",
      "-",
    ],
    fromBuffer ? { stdin: input } : {},
  );
  if (buf.length === 0) return NaN;
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i];
  return sum / buf.length;
}

async function swapOne(row) {
  const { vimeo_id, vimeo_hash, name, poster_path } = row;
  const label = `${vimeo_id} "${name}"`;
  console.log(`→ ${label}`);

  const work = join(tmpdir(), `aurora-swap-${vimeo_id}`);
  mkdirSync(work, { recursive: true });
  const rawPath = join(work, "thumb.raw");
  const outPath = join(work, "thumb.jpg");

  try {
    const thumbUrl = await getVimeoThumbUrl(vimeo_id, vimeo_hash);
    if (!thumbUrl) {
      console.warn(`  ✗ no Vimeo thumbnail available`);
      return false;
    }
    const thumbRes = await fetch(thumbUrl, {
      headers: { "User-Agent": VIMEO_UA, Referer: "https://vimeo.com/" },
    });
    if (!thumbRes.ok) {
      console.warn(`  ✗ thumb fetch ${thumbRes.status}`);
      return false;
    }
    await writeFile(rawPath, Buffer.from(await thumbRes.arrayBuffer()));
    await run("ffmpeg", [
      "-y",
      "-loglevel",
      "error",
      "-i",
      rawPath,
      "-vf",
      "scale='min(960,iw)':-2",
      "-q:v",
      "3",
      outPath,
    ]);
    const luma = await meanLuma(outPath);
    console.log(`  thumb mean luma=${luma.toFixed(2)}`);
    if (!(luma > 8)) {
      console.warn(`  ✗ thumbnail itself looks black; refusing to swap`);
      return false;
    }
    const bytes = await readFile(outPath);
    const key = poster_path || `${vimeo_id}.jpg`;
    const up = await supabase.storage
      .from("clips")
      .upload(key, bytes, { contentType: "image/jpeg", upsert: true });
    if (up.error) throw up.error;
    if (!poster_path) {
      await supabase
        .from("videos")
        .update({ poster_path: key })
        .eq("vimeo_id", vimeo_id);
    }
    console.log(`  ✓ swapped poster (${bytes.byteLength} bytes)`);
    return true;
  } finally {
    await Promise.all(
      [rawPath, outPath].map((p) => unlink(p).catch(() => {})),
    );
  }
}

let rows;
if (allBlack) {
  const { data, error } = await supabase
    .from("videos")
    .select("vimeo_id,vimeo_hash,name,poster_path,clip_path,status")
    .order("position");
  if (error) throw error;

  const scanCandidates = (data ?? []).filter((r) => r.poster_path);
  const scanned = await mapPool(scanCandidates, 6, async (r) => {
    const url = supabase.storage
      .from("clips")
      .getPublicUrl(r.poster_path).data.publicUrl;
    const res = await fetch(`${url}?cb=${Date.now()}`);
    if (!res.ok) return { r, luma: NaN };
    const bytes = Buffer.from(await res.arrayBuffer());
    const luma = await meanLuma(bytes).catch(() => NaN);
    return { r, luma };
  });
  for (const { r, luma } of scanned) {
    console.log(
      `  ${r.vimeo_id} "${r.name}" luma=${
        Number.isFinite(luma) ? luma.toFixed(2) : "?"
      }`,
    );
  }
  rows = scanned
    .filter(({ luma }) => Number.isFinite(luma) && luma < 16)
    .map(({ r }) => r);
  console.log(`\nFound ${rows.length} black poster(s) to swap.\n`);
} else {
  const { data, error } = await supabase
    .from("videos")
    .select("vimeo_id,vimeo_hash,name,poster_path,clip_path,status")
    .eq("vimeo_id", targetId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    console.error(`✗ vimeo_id=${targetId} not found`);
    process.exit(1);
  }
  rows = [data];
}

const swapResults = await mapPool(rows, 4, async (row) => {
  try {
    return { ok: await swapOne(row) === true };
  } catch (e) {
    console.error(
      `  ✗ ${row.vimeo_id} — ${e instanceof Error ? e.message : e}`,
    );
    return { ok: false };
  }
});
const ok = swapResults.filter((r) => r.ok).length;
const fail = swapResults.length - ok;
console.log(`\nDone. Swapped ${ok}, skipped/failed ${fail}.`);
