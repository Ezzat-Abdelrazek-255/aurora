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
import { readFileSync, mkdirSync } from "node:fs";
import { writeFile, readFile, unlink } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const VIMEO_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const args = process.argv.slice(2);
const allBlack = args.includes("--all-black");
const targetId = args.find((a) => !a.startsWith("--"));
if (!targetId && !allBlack) {
  console.error(
    "usage: node scripts/swap-poster.mjs <vimeoId>\n       node scripts/swap-poster.mjs --all-black",
  );
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(resolve(process.cwd(), ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing Supabase env vars in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function run(bin, args, opts = {}) {
  return new Promise((resolveP, reject) => {
    const p = spawn(bin, args, opts);
    let stderr = "";
    const chunks = [];
    if (p.stdout) p.stdout.on("data", (d) => chunks.push(Buffer.from(d)));
    if (p.stderr) p.stderr.on("data", (d) => (stderr += d.toString()));
    p.on("exit", (code) =>
      code === 0
        ? resolveP(Buffer.concat(chunks))
        : reject(new Error(`${bin} exited ${code}\n${stderr}`)),
    );
    p.on("error", reject);
  });
}

async function meanLuma(imagePath) {
  const buf = await run("ffmpeg", [
    "-loglevel",
    "error",
    "-i",
    imagePath,
    "-pix_fmt",
    "gray",
    "-f",
    "rawvideo",
    "-",
  ]);
  if (buf.length === 0) return NaN;
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i];
  return sum / buf.length;
}

function extractPlayerConfig(html) {
  const start = html.indexOf("window.playerConfig");
  if (start < 0) throw new Error("playerConfig not found");
  const eq = html.indexOf("=", start);
  const jsonStart = html.indexOf("{", eq);
  let depth = 0,
    i = jsonStart,
    inStr = false,
    esc = false;
  for (; i < html.length; i++) {
    const c = html[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (c === "\\") {
      esc = true;
      continue;
    }
    if (c === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        i++;
        break;
      }
    }
  }
  return JSON.parse(html.slice(jsonStart, i));
}

function pickThumbUrl(cfg) {
  const video = cfg?.video;
  if (!video) return null;
  if (video.thumbs) {
    let best = -1;
    let url = null;
    for (const [k, v] of Object.entries(video.thumbs)) {
      if (typeof v !== "string" || !/^https?:\/\//.test(v)) continue;
      const n = Number(k);
      if (Number.isFinite(n) && n > best) {
        best = n;
        url = v;
      }
    }
    if (url) return url;
  }
  const base = video.thumbnail_url;
  if (typeof base === "string" && /^https?:\/\//.test(base)) {
    return /\.(jpe?g|webp|png)$/i.test(base) ? base : `${base}_1280x720.jpg`;
  }
  return null;
}

async function getVimeoThumbUrl(vimeoId, vimeoHash) {
  const url = `https://player.vimeo.com/video/${vimeoId}?h=${vimeoHash}`;
  const res = await fetch(url, {
    headers: { "User-Agent": VIMEO_UA, Referer: "https://vimeo.com/" },
  });
  if (!res.ok) throw new Error(`Vimeo embed fetch ${vimeoId}: ${res.status}`);
  const html = await res.text();
  return pickThumbUrl(extractPlayerConfig(html));
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

  const scanned = await Promise.all(
    (data ?? [])
      .filter((r) => r.poster_path)
      .map(async (r) => {
        const url = supabase.storage
          .from("clips")
          .getPublicUrl(r.poster_path).data.publicUrl;
        const work = join(tmpdir(), `aurora-scan-${r.vimeo_id}.jpg`);
        const res = await fetch(`${url}?cb=${Date.now()}`);
        if (!res.ok) return { r, luma: NaN };
        await writeFile(work, Buffer.from(await res.arrayBuffer()));
        const luma = await meanLuma(work).catch(() => NaN);
        await unlink(work).catch(() => {});
        return { r, luma };
      }),
  );
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

const swapResults = await Promise.allSettled(rows.map((row) => swapOne(row)));
let ok = 0,
  fail = 0;
swapResults.forEach((res, i) => {
  if (res.status === "fulfilled" && res.value === true) {
    ok++;
  } else {
    fail++;
    if (res.status === "rejected") {
      const row = rows[i];
      console.error(
        `  ✗ ${row.vimeo_id} — ${
          res.reason instanceof Error ? res.reason.message : res.reason
        }`,
      );
    }
  }
});
console.log(`\nDone. Swapped ${ok}, skipped/failed ${fail}.`);
