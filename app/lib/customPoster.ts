// Server-only — uploads admin-supplied poster overrides into the `clips`
// bucket. Custom posters live alongside the trigger-generated ones and take
// precedence at read time.
import type { SupabaseClient } from "@supabase/supabase-js";

const ALLOWED_MIME = /^image\/(jpeg|jpg|png|webp)$/i;

export function customPosterKey(vimeoId: string, ext: string): string {
  // Random suffix busts CDN/browser cache when the admin re-uploads.
  const rand = Math.random().toString(36).slice(2, 10);
  return `videos/${vimeoId}/custom-poster-${rand}.${ext}`;
}

function extFromMime(mime: string): string {
  if (/jpeg|jpg/i.test(mime)) return "jpg";
  if (/png/i.test(mime)) return "png";
  if (/webp/i.test(mime)) return "webp";
  return "jpg";
}

export async function uploadCustomPoster(
  admin: SupabaseClient,
  vimeoId: string,
  file: File,
): Promise<string> {
  if (!ALLOWED_MIME.test(file.type)) {
    throw new Error(
      `${file.type || "unknown"} is not an allowed image type (jpeg/png/webp)`,
    );
  }
  const key = customPosterKey(vimeoId, extFromMime(file.type));
  const buf = Buffer.from(await file.arrayBuffer());
  const { error } = await admin.storage.from("clips").upload(key, buf, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(`upload ${key}: ${error.message}`);
  return key;
}
