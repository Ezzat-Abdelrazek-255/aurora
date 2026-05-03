// End-to-end spike of the Trigger.dev task body, run as a plain Node script.
// Exercises every line that will execute inside the Trigger.dev container:
//   • Vimeo HLS scrape (same regex/brace-counting parser as the task)
//   • ffmpeg → 3s all-keyframe MP4
//   • ffmpeg → first-frame JPG poster
//   • ffprobe → aspect ratio
//   • Supabase Storage uploads (clip + poster)
//   • UPSERT into public.videos with status='processing' → 'ready'
//
// Trigger.dev's container only adds ffmpeg via a build extension and exposes
// FFMPEG_PATH/FFPROBE_PATH; locally we fall back to system ffmpeg, which is
// what we already use in npm run clips. So a green run here proves the
// complete pipeline works.

import { spawn } from "node:child_process";
import { readFile, mkdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createClient } from "@supabase/supabase-js";

const VIMEO_ID = process.env.SPIKE_VIMEO_ID ?? "1185506426";
const VIMEO_HASH = process.env.SPIKE_VIMEO_HASH ?? "51eee0e281";
const NAME = process.env.SPIKE_NAME ?? "Spike: Viva La Vulva";
const CATEGORY = process.env.SPIKE_CATEGORY ?? "commercial";
const ROLE = process.env.SPIKE_ROLE ?? "Talent";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.error("missing supabase env vars (URL or SERVICE_ROLE_KEY)");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH ?? "ffprobe";
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function run(bin, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args);
    let stderr = "";
    p.stderr.on("data", (d) => (stderr += d.toString()));
    p.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${bin} exited ${code}\n${stderr}`)),
    );
    p.on("error", reject);
  });
}

function probe(bin, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args);
    let out = "",
      err = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("exit", (code) =>
      code === 0
        ? resolve(out.trim())
        : reject(new Error(`${bin} exited ${code}\n${err}`)),
    );
    p.on("error", reject);
  });
}

async function fetchVimeoEmbed(id, hash) {
  const url = `https://player.vimeo.com/video/${id}?h=${hash}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Referer: "https://vimeo.com/" },
  });
  if (!res.ok) throw new Error(`Vimeo embed fetch ${id}: ${res.status}`);
  return res.text();
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

function pickHlsUrl(cfg) {
  const hls = cfg?.request?.files?.hls;
  if (!hls?.cdns) throw new Error("no hls cdns");
  const key = hls.default_cdn ?? Object.keys(hls.cdns)[0];
  const cdn = hls.cdns[key];
  return cdn.avc_url ?? cdn.url;
}

async function main() {
  const t0 = Date.now();
  console.log(`→ spike start vimeo_id=${VIMEO_ID} hash=${VIMEO_HASH}`);

  // Seed row as 'processing'
  {
    const { error } = await supabase.from("videos").upsert(
      {
        vimeo_id: VIMEO_ID,
        vimeo_hash: VIMEO_HASH,
        name: NAME,
        category: CATEGORY,
        role: ROLE,
        status: "processing",
      },
      { onConflict: "vimeo_id" },
    );
    if (error) throw error;
    console.log("  seeded videos row → status=processing");
  }

  const work = join(tmpdir(), `aurora-${VIMEO_ID}`);
  if (!existsSync(work)) await mkdir(work, { recursive: true });
  const mp4 = join(work, `${VIMEO_ID}.mp4`);
  const jpg = join(work, `${VIMEO_ID}.jpg`);

  try {
    console.log("→ fetching Vimeo embed and resolving HLS URL");
    const html = await fetchVimeoEmbed(VIMEO_ID, VIMEO_HASH);
    const cfg = extractPlayerConfig(html);
    const hlsUrl = pickHlsUrl(cfg);
    console.log(`  hls (truncated): ${hlsUrl.slice(0, 90)}…`);

    console.log("→ ffmpeg: 3s all-keyframe clip");
    await run(FFMPEG, [
      "-y",
      "-loglevel",
      "error",
      "-i",
      hlsUrl,
      "-t",
      "3",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "22",
      "-pix_fmt",
      "yuv420p",
      "-g",
      "1",
      "-x264-params",
      "keyint=1:min-keyint=1:scenecut=0",
      "-an",
      "-movflags",
      "+faststart",
      "-vf",
      "scale='min(960,iw)':-2",
      mp4,
    ]);
    const mp4Bytes = await readFile(mp4);
    console.log(`  mp4 ${mp4Bytes.byteLength} bytes`);

    console.log("→ ffmpeg: first-frame poster");
    await run(FFMPEG, [
      "-y",
      "-loglevel",
      "error",
      "-i",
      mp4,
      "-frames:v",
      "1",
      "-q:v",
      "3",
      jpg,
    ]);
    const jpgBytes = await readFile(jpg);
    console.log(`  jpg ${jpgBytes.byteLength} bytes`);

    const wh = await probe(FFPROBE, [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "csv=p=0",
      mp4,
    ]);
    const [w, h] = wh.split(",").map((n) => Number(n.trim()));
    const aspect = w && h ? w / h : 16 / 9;
    console.log(`  aspect ${aspect.toFixed(4)} (${w}x${h})`);

    console.log("→ uploading clip + poster to Supabase Storage");
    const up1 = await supabase.storage
      .from("clips")
      .upload(`${VIMEO_ID}.mp4`, mp4Bytes, {
        contentType: "video/mp4",
        upsert: true,
      });
    if (up1.error) throw up1.error;
    const up2 = await supabase.storage
      .from("clips")
      .upload(`${VIMEO_ID}.jpg`, jpgBytes, {
        contentType: "image/jpeg",
        upsert: true,
      });
    if (up2.error) throw up2.error;

    const { error: updErr } = await supabase
      .from("videos")
      .update({
        status: "ready",
        clip_path: `${VIMEO_ID}.mp4`,
        poster_path: `${VIMEO_ID}.jpg`,
        aspect_ratio: aspect,
        error_message: null,
      })
      .eq("vimeo_id", VIMEO_ID);
    if (updErr) throw updErr;

    const { data: clipPub } = supabase.storage
      .from("clips")
      .getPublicUrl(`${VIMEO_ID}.mp4`);
    const { data: posterPub } = supabase.storage
      .from("clips")
      .getPublicUrl(`${VIMEO_ID}.jpg`);

    const elapsed = Math.round((Date.now() - t0) / 1000);
    console.log(`\n✓ SPIKE OK in ${elapsed}s`);
    console.log(`  clip:   ${clipPub.publicUrl}`);
    console.log(`  poster: ${posterPub.publicUrl}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase
      .from("videos")
      .update({ status: "failed", error_message: msg })
      .eq("vimeo_id", VIMEO_ID);
    console.error(`\n✗ SPIKE FAIL: ${msg}`);
    process.exit(1);
  } finally {
    await Promise.all([mp4, jpg].map((p) => unlink(p).catch(() => {})));
  }
}

main();
