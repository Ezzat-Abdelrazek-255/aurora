// Extract the first 2 seconds of each Vimeo video into public/clips/<id>.mp4.
// Vimeo no longer ships progressive download URLs, so we scrape the embed
// page for its HLS playlist and let ffmpeg cut + transcode the segment.
//
// Run: npm run clips
//   --force   regenerate even if output already exists

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = join(dirname(__filename), "..");
const OUT_DIR = join(ROOT, "public", "clips");
const VIDEOS_PATH = join(ROOT, "app", "lib", "videos.ts");

const FORCE = process.argv.includes("--force");

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** Read videos list out of the .ts file with a tiny regex (only id/hash needed). */
function loadVideos() {
  const src = readFileSync(VIDEOS_PATH, "utf8");
  const out = [];
  const re = /id:\s*"(\d+)"\s*,\s*hash:\s*"([0-9a-f]+)"/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    out.push({ id: m[1], hash: m[2] });
  }
  return out;
}

async function fetchEmbed(id, hash) {
  const url = `https://player.vimeo.com/video/${id}?h=${hash}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Referer: "https://vimeo.com/" },
  });
  if (!res.ok) throw new Error(`embed fetch ${id}: ${res.status}`);
  return res.text();
}

/** Pull the playerConfig JS object out of the embed HTML by brace-counting. */
function extractConfig(html) {
  const start = html.indexOf("window.playerConfig");
  if (start < 0) throw new Error("no playerConfig in embed page");
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
  if (!hls) throw new Error("no hls in player config");
  const cdnKey = hls.default_cdn ?? Object.keys(hls.cdns)[0];
  const cdn = hls.cdns[cdnKey];
  return cdn.avc_url ?? cdn.url;
}

function clip(id, hlsUrl) {
  const out = join(OUT_DIR, `${id}.mp4`);
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", [
      "-y",
      "-loglevel",
      "error",
      "-i",
      hlsUrl,
      "-t",
      "2",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "22",
      "-pix_fmt",
      "yuv420p",
      // Every frame is a keyframe — reverse playback via repeated
      // setCurrentTime needs to seek freely without decoding from the prior
      // I-frame each time. Costs ~2× file size vs. default GOP, worth it for
      // a 2s clip.
      "-g",
      "1",
      "-x264-params",
      "keyint=1:min-keyint=1:scenecut=0",
      "-an",
      "-movflags",
      "+faststart",
      "-vf",
      "scale='min(960,iw)':-2",
      out,
    ]);
    let stderr = "";
    ff.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    ff.on("exit", (code) =>
      code === 0
        ? resolve(out)
        : reject(new Error(`ffmpeg exited ${code}\n${stderr}`)),
    );
  });
}

async function main() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const videos = loadVideos();
  console.log(`Clipping ${videos.length} videos -> ${OUT_DIR}`);

  for (const { id, hash } of videos) {
    const out = join(OUT_DIR, `${id}.mp4`);
    if (!FORCE && existsSync(out) && statSync(out).size > 1024) {
      console.log(`  skip ${id} (already ${statSync(out).size} bytes)`);
      continue;
    }
    try {
      const html = await fetchEmbed(id, hash);
      const cfg = extractConfig(html);
      const hlsUrl = pickHlsUrl(cfg);
      await clip(id, hlsUrl);
      const size = statSync(out).size;
      console.log(`  ok  ${id} (${size} bytes)`);
    } catch (e) {
      console.error(`  FAIL ${id}: ${e.message}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
