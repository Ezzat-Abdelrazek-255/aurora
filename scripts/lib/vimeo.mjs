// Mirror of trigger/lib/vimeo.ts — keep in sync. Duplicated rather than
// shared because the trigger version is TypeScript and Node can't directly
// import .ts from .mjs scripts without a build step.

export const VIMEO_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export async function fetchVimeoEmbed(vimeoId, vimeoHash) {
  const url = `https://player.vimeo.com/video/${vimeoId}?h=${vimeoHash}`;
  const res = await fetch(url, {
    headers: { "User-Agent": VIMEO_UA, Referer: "https://vimeo.com/" },
  });
  if (!res.ok) throw new Error(`Vimeo embed fetch ${vimeoId}: ${res.status}`);
  return res.text();
}

/** Extract the JSON object assigned to `window.playerConfig` via brace-counting. */
export function extractPlayerConfig(html) {
  const start = html.indexOf("window.playerConfig");
  if (start < 0) throw new Error("playerConfig not found in embed page");
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

export function pickThumbUrl(cfg) {
  const video = cfg?.video;
  if (!video) return null;
  if (video.thumbs) {
    let bestSize = -1;
    let bestUrl = null;
    for (const [k, v] of Object.entries(video.thumbs)) {
      if (typeof v !== "string" || !/^https?:\/\//.test(v)) continue;
      const n = Number(k);
      if (Number.isFinite(n) && n > bestSize) {
        bestSize = n;
        bestUrl = v;
      }
    }
    if (bestUrl) return bestUrl;
    for (const v of Object.values(video.thumbs)) {
      if (typeof v === "string" && /^https?:\/\//.test(v)) return v;
    }
  }
  const base = video.thumbnail_url;
  if (typeof base === "string" && /^https?:\/\//.test(base)) {
    return /\.(jpe?g|webp|png)$/i.test(base) ? base : `${base}_1280x720.jpg`;
  }
  return null;
}

export async function getVimeoThumbUrl(vimeoId, vimeoHash) {
  const html = await fetchVimeoEmbed(vimeoId, vimeoHash);
  return pickThumbUrl(extractPlayerConfig(html));
}
