// Lifted from scripts/clip-videos.mjs and ported to TypeScript.
// Fetches a Vimeo embed page, scrapes window.playerConfig (brace-counting
// since the JSON is unbounded), and returns the default-CDN HLS playlist URL.

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export async function fetchVimeoEmbed(
  vimeoId: string,
  vimeoHash: string,
): Promise<string> {
  const url = `https://player.vimeo.com/video/${vimeoId}?h=${vimeoHash}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Referer: "https://vimeo.com/" },
  });
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
type Cfg = { request?: { files?: { hls?: Hls } } };

export function pickHlsUrl(cfg: unknown): string {
  const hls = (cfg as Cfg)?.request?.files?.hls;
  if (!hls?.cdns) throw new Error("No HLS streams in player config");
  const key = hls.default_cdn ?? Object.keys(hls.cdns)[0];
  const cdn = hls.cdns[key];
  const url = cdn?.avc_url ?? cdn?.url;
  if (!url) throw new Error("HLS CDN entry has no URL");
  return url;
}

export async function getHlsUrl(
  vimeoId: string,
  vimeoHash: string,
): Promise<string> {
  const html = await fetchVimeoEmbed(vimeoId, vimeoHash);
  const cfg = extractPlayerConfig(html);
  return pickHlsUrl(cfg);
}
