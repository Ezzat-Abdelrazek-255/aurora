import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { logger, task } from "@trigger.dev/sdk";
import { createClient } from "@supabase/supabase-js";

import { getStreamData, VIMEO_UA } from "./lib/vimeo";

type Payload = {
  vimeoId: string;
  vimeoHash: string;
  // Optional metadata for fresh inserts (when the API route hasn't pre-created
  // the row). For the production flow the API route inserts the row first.
  name?: string;
  category?: "brands" | "originals" | "theatre";
  role?: "Producer" | "Talent";
};

function ffmpegBin(): string {
  return process.env.FFMPEG_PATH ?? "ffmpeg";
}
function ffprobeBin(): string {
  return process.env.FFPROBE_PATH ?? "ffprobe";
}

function run(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args);
    let stderr = "";
    p.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    p.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${bin} exited ${code}\n${stderr}`)),
    );
    p.on("error", reject);
  });
}

function runProbe(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args);
    let stdout = "",
      stderr = "";
    p.stdout.on("data", (d) => (stdout += d.toString()));
    p.stderr.on("data", (d) => (stderr += d.toString()));
    p.on("exit", (code) =>
      code === 0
        ? resolve(stdout.trim())
        : reject(new Error(`${bin} exited ${code}\n${stderr}`)),
    );
    p.on("error", reject);
  });
}

function runCapture(bin: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args);
    const chunks: Buffer[] = [];
    let stderr = "";
    p.stdout.on("data", (d) => chunks.push(Buffer.from(d)));
    p.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    p.on("exit", (code) =>
      code === 0
        ? resolve(Buffer.concat(chunks))
        : reject(new Error(`${bin} exited ${code}\n${stderr}`)),
    );
    p.on("error", reject);
  });
}

/**
 * Decode the first frame of `videoPath` to raw 8-bit grayscale and return
 * the mean pixel value (0..255). Returns NaN if ffmpeg fails so callers can
 * fall back to leaving the first-frame poster in place.
 */
async function meanLumaOfFirstFrame(
  ffmpeg: string,
  videoPath: string,
): Promise<number> {
  // -frames:v 1 + rawvideo on stdout gives us width*height bytes of Y.
  const buf = await runCapture(ffmpeg, [
    "-loglevel",
    "error",
    "-i",
    videoPath,
    "-frames:v",
    "1",
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

export const processVideo = task({
  id: "process-video",
  maxDuration: 180,
  // ffmpeg + HLS fetch + Supabase upload OOMs on the default 1 GB machine.
  // small-2x gives us 2 GB / 1 vCPU which is comfortable for a 3s 960p clip.
  machine: "small-2x",
  run: async (payload: Payload) => {
    const { vimeoId, vimeoHash } = payload;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!supabaseUrl || !serviceKey) {
      throw new Error(
        "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in task env",
      );
    }
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const setStatus = async (
      status: "processing" | "ready" | "failed",
      patch: Record<string, unknown> = {},
    ) => {
      await supabase
        .from("videos")
        .update({ status, ...patch })
        .eq("vimeo_id", vimeoId);
    };

    // Upsert the row for spike convenience. In the real flow the API route
    // already inserted the row before triggering this task.
    {
      const seed: Record<string, unknown> = {
        vimeo_id: vimeoId,
        vimeo_hash: vimeoHash,
        status: "processing",
      };
      if (payload.name) seed.name = payload.name;
      if (payload.category) seed.category = payload.category;
      if (payload.role) seed.role = payload.role;
      const { error: upsertErr } = await supabase
        .from("videos")
        .upsert(seed, { onConflict: "vimeo_id" });
      if (upsertErr) throw upsertErr;
    }

    const work = join(tmpdir(), `aurora-${vimeoId}`);
    await mkdir(work, { recursive: true });
    const mp4Path = join(work, `${vimeoId}.mp4`);
    const jpgPath = join(work, `${vimeoId}.jpg`);
    const thumbRawPath = join(work, `${vimeoId}-vimeo-thumb`);

    try {
      logger.log("Resolving HLS playlist + thumbnail");
      const { hlsUrl, thumbUrl } = await getStreamData(vimeoId, vimeoHash);

      logger.log("Encoding 3s all-keyframe clip");
      await run(ffmpegBin(), [
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
        mp4Path,
      ]);

      logger.log("Extracting first-frame poster");
      await run(ffmpegBin(), [
        "-y",
        "-loglevel",
        "error",
        "-i",
        mp4Path,
        "-frames:v",
        "1",
        "-q:v",
        "3",
        jpgPath,
      ]);

      // Some clips fade in from black, which leaves us with a useless
      // all-black poster. Decode the first frame to grayscale and compute
      // the mean pixel value; if it's near zero, swap in Vimeo's
      // pre-rendered thumbnail instead. False positives just cost one HTTP
      // fetch + re-encode; false negatives leave a useless poster on screen.
      const BLACK_LUMA_THRESHOLD = 16;
      let posterSource: "first_frame" | "vimeo_thumbnail" = "first_frame";
      let meanLuma = NaN;
      let probeError: string | null = null;
      try {
        meanLuma = await meanLumaOfFirstFrame(ffmpegBin(), mp4Path);
      } catch (e) {
        probeError = e instanceof Error ? e.message : String(e);
        logger.warn(
          `mean-luma probe failed: ${probeError}; keeping first-frame poster`,
        );
      }
      logger.log(
        `First-frame mean luma=${
          Number.isFinite(meanLuma) ? meanLuma.toFixed(2) : "n/a"
        } / 255 (threshold ${BLACK_LUMA_THRESHOLD}) thumbUrl=${
          thumbUrl ? "present" : "null"
        }`,
      );

      if (Number.isFinite(meanLuma) && meanLuma < BLACK_LUMA_THRESHOLD) {
        if (!thumbUrl) {
          logger.warn(
            "First-frame poster is black but Vimeo did not expose a thumbnail; keeping first-frame poster",
          );
        } else {
          logger.log(`First-frame poster is black; falling back to ${thumbUrl}`);
          const thumbRes = await fetch(thumbUrl, {
            headers: { "User-Agent": VIMEO_UA, Referer: "https://vimeo.com/" },
          });
          if (!thumbRes.ok) {
            throw new Error(
              `Vimeo thumbnail fetch ${vimeoId}: ${thumbRes.status}`,
            );
          }
          const thumbBytes = Buffer.from(await thumbRes.arrayBuffer());
          await writeFile(thumbRawPath, thumbBytes);
          // Normalize through ffmpeg so the saved poster matches the clip's
          // width and JPEG quality regardless of the original thumb format.
          await run(ffmpegBin(), [
            "-y",
            "-loglevel",
            "error",
            "-i",
            thumbRawPath,
            "-vf",
            "scale='min(960,iw)':-2",
            "-q:v",
            "3",
            jpgPath,
          ]);
          posterSource = "vimeo_thumbnail";
        }
      }

      const aspectStr = await runProbe(ffprobeBin(), [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height",
        "-of",
        "csv=p=0",
        mp4Path,
      ]);
      const [w, h] = aspectStr.split(",").map((n) => Number(n.trim()));
      const aspect = w && h ? w / h : 16 / 9;
      logger.log(`Aspect ratio ${aspect.toFixed(4)} (${w}x${h})`);

      const [mp4Bytes, jpgBytes] = await Promise.all([
        readFile(mp4Path),
        readFile(jpgPath),
      ]);

      const clipKey = `${vimeoId}.mp4`;
      const posterKey = `${vimeoId}.jpg`;
      logger.log("Uploading clip + poster to Supabase Storage");
      const up1 = await supabase.storage
        .from("clips")
        .upload(clipKey, mp4Bytes, {
          contentType: "video/mp4",
          upsert: true,
        });
      if (up1.error) throw up1.error;
      const up2 = await supabase.storage
        .from("clips")
        .upload(posterKey, jpgBytes, {
          contentType: "image/jpeg",
          upsert: true,
        });
      if (up2.error) throw up2.error;

      await setStatus("ready", {
        clip_path: clipKey,
        poster_path: posterKey,
        aspect_ratio: aspect,
        error_message: null,
      });

      const { data: pub } = supabase.storage.from("clips").getPublicUrl(clipKey);
      const { data: posterPub } = supabase.storage
        .from("clips")
        .getPublicUrl(posterKey);

      return {
        ok: true,
        vimeoId,
        clipUrl: pub.publicUrl,
        posterUrl: posterPub.publicUrl,
        aspect,
        posterSource,
        meanLuma: Number.isFinite(meanLuma) ? Number(meanLuma.toFixed(3)) : null,
        thumbUrlPresent: thumbUrl !== null,
        probeError,
        bytes: { mp4: mp4Bytes.byteLength, jpg: jpgBytes.byteLength },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`processVideo failed: ${msg}`);
      await setStatus("failed", { error_message: msg });
      throw err;
    } finally {
      // Best-effort cleanup; tasks run in ephemeral containers anyway.
      await Promise.all(
        [mp4Path, jpgPath, thumbRawPath].map((p) =>
          unlink(p).catch(() => {}),
        ),
      );
    }
  },
});
