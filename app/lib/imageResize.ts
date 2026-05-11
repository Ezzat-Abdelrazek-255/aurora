// Client-only — uses <canvas>, createImageBitmap.
//
// Resize-and-recompress an image before upload. Keeps the network payload
// sane (and the storage bucket cheap) without needing a server-side `sharp`
// dependency. Uses createImageBitmap so EXIF orientation is honored on
// Chromium and Safari. Falls back to <img> if createImageBitmap is missing.

const MAX_DIM = 2400;
const QUALITY = 0.82;

export type ResizedImage = {
  blob: Blob;
  width: number;
  height: number;
  name: string;
};

export async function resizeImage(
  file: File,
  opts: { maxDim?: number; quality?: number } = {},
): Promise<ResizedImage> {
  const maxDim = opts.maxDim ?? MAX_DIM;
  const quality = opts.quality ?? QUALITY;
  const bitmap: ImageBitmap | HTMLImageElement = await createBitmap(file);
  const w0 =
    "width" in bitmap ? bitmap.width : (bitmap as HTMLImageElement).naturalWidth;
  const h0 =
    "height" in bitmap ? bitmap.height : (bitmap as HTMLImageElement).naturalHeight;
  const scale = Math.min(1, maxDim / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * scale));
  const h = Math.max(1, Math.round(h0 * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, w, h);
  if ("close" in bitmap) bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
  if (!blob) throw new Error("toBlob returned null");
  const stem = file.name.replace(/\.[^.]+$/, "") || "image";
  return { blob, width: w, height: h, name: `${stem}.jpg` };
}

async function createBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Fall through to <img> path on browsers that throw on certain MIME types.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}
