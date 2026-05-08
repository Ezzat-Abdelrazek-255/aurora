// Lifted from scripts/clip-videos.mjs and ported to TypeScript.
// Fetches a Vimeo embed page, scrapes window.playerConfig (brace-counting
// since the JSON is unbounded), and returns the default-CDN HLS playlist URL.

export const VIMEO_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const UA = VIMEO_UA;

export async function fetchVimeoEmbed(
  vimeoId: string,
  vimeoHash: string,
): Promise<string> {
  const url = `https://player.vimeo.com/video/${vimeoId}?h=${vimeoHash}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Referer: "https://vimeo.com/" },
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error(
      `Vimeo refused server-side embed for ${vimeoId} (HTTP ${res.status}). ` +
        "On Vimeo: open the video → Privacy/Embed and set 'Where can this " +
        "be embedded?' to 'Anywhere' (or allow-list this site's domain), " +
        "and confirm 'Who can watch?' isn't 'Private' / password-gated.",
    );
  }
  if (!res.ok) throw new Error(`Vimeo embed fetch ${vimeoId}: ${res.status}`);
  return res.text();
}

/** Extract `window.playerConfig = {...};` JSON via brace-counting. */
export function extractPlayerConfig(html: string): unknown {
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

type Hls = {
  default_cdn?: string;
  cdns?: Record<string, { avc_url?: string; url?: string }>;
};
type VideoMeta = {
  thumbs?: Record<string, string>;
  thumbnail_url?: string;
};
type Cfg = {
  request?: { files?: { hls?: Hls } };
  video?: VideoMeta;
};

export function pickHlsUrl(cfg: unknown): string {
  const hls = (cfg as Cfg)?.request?.files?.hls;
  if (!hls?.cdns) throw new Error("No HLS streams in player config");
  const key = hls.default_cdn ?? Object.keys(hls.cdns)[0];
  const cdn = hls.cdns[key];
  const url = cdn?.avc_url ?? cdn?.url;
  if (!url) throw new Error("HLS CDN entry has no URL");
  return url;
}

/**
 * Vimeo's playerConfig exposes a thumbnail two ways depending on the video:
 *  - `video.thumbnail_url`: a single base CDN URL (most common for current
 *    embeds). Has no size suffix; the CDN serves a default size, but we can
 *    request a specific render by appending `_WIDTHxHEIGHT.jpg`.
 *  - `video.thumbs`: an older shape — `{ "640": "...", "960": "..." }`
 *    keyed by width.
 * We coalesce both shapes and ask for a 1280-wide JPG so the fallback poster
 * has enough resolution for VideoCard at 2x DPR. Returns null only if
 * neither field is present.
 */
export function pickThumbUrl(cfg: unknown): string | null {
  const video = (cfg as Cfg)?.video;
  if (!video) return null;

  const thumbs = video.thumbs;
  if (thumbs) {
    let bestSize = -1;
    let bestUrl: string | null = null;
    for (const [k, v] of Object.entries(thumbs)) {
      if (typeof v !== "string" || !/^https?:\/\//.test(v)) continue;
      const n = Number(k);
      if (Number.isFinite(n) && n > bestSize) {
        bestSize = n;
        bestUrl = v;
      }
    }
    if (bestUrl) return bestUrl;
    for (const v of Object.values(thumbs)) {
      if (typeof v === "string" && /^https?:\/\//.test(v)) return v;
    }
  }

  const base = video.thumbnail_url;
  if (typeof base === "string" && /^https?:\/\//.test(base)) {
    // Vimeo's CDN renders any `_WIDTHxHEIGHT.jpg` suffix on the base URL.
    return /\.(jpe?g|webp|png)$/i.test(base) ? base : `${base}_1280x720.jpg`;
  }

  return null;
}

export async function getHlsUrl(
  vimeoId: string,
  vimeoHash: string,
): Promise<string> {
  const html = await fetchVimeoEmbed(vimeoId, vimeoHash);
  const cfg = extractPlayerConfig(html);
  return pickHlsUrl(cfg);
}

/**
 * Fetch the embed page once and return both the HLS playlist URL and the
 * largest pre-rendered thumbnail. Used by processVideo so we don't pay for
 * two embed fetches when we need both pieces.
 */
export async function getStreamData(
  vimeoId: string,
  vimeoHash: string,
): Promise<{ hlsUrl: string; thumbUrl: string | null }> {
  const html = await fetchVimeoEmbed(vimeoId, vimeoHash);
  const cfg = extractPlayerConfig(html);
  return { hlsUrl: pickHlsUrl(cfg), thumbUrl: pickThumbUrl(cfg) };
}

/**
 * Pull the embed-hash for a video from its public vimeo.com page. Lets us
 * accept bare-ID URLs (https://vimeo.com/<id>) in admin input even when the
 * video is unlisted — the public watch page exposes the player iframe URL,
 * which carries the hash as `?h=…`. Returns null if the page is gone or the
 * hash isn't on it (e.g. password-gated videos).
 */
export async function resolveVimeoHash(
  vimeoId: string,
): Promise<string | null> {
  if (!/^\d+$/.test(vimeoId)) return null;
  const res = await fetch(`https://vimeo.com/${vimeoId}`, {
    headers: { "User-Agent": UA },
  });
  if (!res.ok) return null;
  const html = await res.text();
  const re = new RegExp(
    `player\\.vimeo\\.com/video/${vimeoId}\\?h=([a-f0-9]+)`,
    "i",
  );
  return html.match(re)?.[1] ?? null;
}
