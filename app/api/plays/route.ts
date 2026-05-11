import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "../../lib/admin";
import {
  playCategorySchema,
  playKindSchema,
  playRoleSchema,
  slugSchema,
  slugify,
} from "../../lib/plays";
import { revalidatePlays } from "../../lib/plays-server";
import { createSupabaseAdminClient } from "../../lib/supabase/admin";

// Multipart form: name + role + category + aspect + kind + images (1+ files,
// first is the cover). Slug is derived from the name unless one is supplied.
const META_KEYS = new Set(["name", "role", "category", "aspect", "slug", "kind"]);

const Meta = z.object({
  name: z.string().min(1).max(120),
  role: playRoleSchema,
  category: playCategorySchema.default("theatre"),
  aspect: z.coerce.number().positive().finite(),
  slug: slugSchema.optional(),
  kind: playKindSchema.default("play"),
});

function safeFileName(name: string, fallbackExt = "jpg"): string {
  const lastDot = name.lastIndexOf(".");
  const stem = (lastDot >= 0 ? name.slice(0, lastDot) : name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "image";
  const ext =
    lastDot >= 0 && /^[a-z0-9]{2,4}$/i.test(name.slice(lastDot + 1))
      ? name.slice(lastDot + 1).toLowerCase()
      : fallbackExt;
  return `${stem}.${ext}`;
}

const ALLOWED_MIME = /^image\/(jpeg|jpg|png|webp)$/i;

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "invalid_body", message: "Expected multipart/form-data" },
      { status: 400 },
    );
  }

  const meta: Record<string, string> = {};
  const files: File[] = [];
  let coverFile: File | null = null;
  for (const [key, value] of form.entries()) {
    if (META_KEYS.has(key) && typeof value === "string") {
      meta[key] = value;
    } else if (key === "images" && value instanceof File) {
      files.push(value);
    } else if (key === "cover" && value instanceof File) {
      coverFile = value;
    }
  }
  const parsed = Meta.safeParse(meta);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  if (files.length === 0) {
    return NextResponse.json(
      { error: "invalid_body", message: "At least one image is required" },
      { status: 400 },
    );
  }
  for (const f of files) {
    if (!ALLOWED_MIME.test(f.type)) {
      return NextResponse.json(
        {
          error: "unsupported_image",
          message: `${f.name}: ${f.type || "unknown"} is not an allowed image type`,
        },
        { status: 415 },
      );
    }
  }
  if (coverFile && !ALLOWED_MIME.test(coverFile.type)) {
    return NextResponse.json(
      {
        error: "unsupported_image",
        message: `${coverFile.name}: ${coverFile.type || "unknown"} is not an allowed image type`,
      },
      { status: 415 },
    );
  }

  const slug = parsed.data.slug ?? slugify(parsed.data.name);
  if (!slug) {
    return NextResponse.json(
      { error: "invalid_slug", message: "Could not derive a slug from the name" },
      { status: 400 },
    );
  }

  const admin = createSupabaseAdminClient();

  // Reserve the row first so a duplicate slug fails before we burn time on
  // uploads. We start it 'pending' and flip to 'ready' once images are in.
  const { data: existing } = await admin
    .from("plays")
    .select("slug")
    .eq("slug", slug)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: "already_exists", slug },
      { status: 409 },
    );
  }

  // Position = max(existing) + 1 so the new play lands at the end of the grid.
  const { data: tail } = await admin
    .from("plays")
    .select("position")
    .order("position", { ascending: false })
    .limit(1);
  const position = (tail?.[0]?.position ?? -1) + 1;

  const { error: insertErr } = await admin.from("plays").insert({
    slug,
    name: parsed.data.name,
    category: parsed.data.category,
    role: parsed.data.role,
    kind: parsed.data.kind,
    aspect_ratio: parsed.data.aspect,
    status: "pending",
    position,
  });
  if (insertErr) {
    return NextResponse.json(
      { error: "insert_failed", message: insertErr.message },
      { status: 500 },
    );
  }

  const bucket = admin.storage.from("clips");
  const galleryPaths: string[] = [];
  let coverPath: string | null = null;
  try {
    let i = 0;
    for (const file of files) {
      const indexed = String(i + 1).padStart(2, "0");
      const dest = `plays/${slug}/${indexed}-${safeFileName(file.name)}`;
      const buf = Buffer.from(await file.arrayBuffer());
      const { error } = await bucket.upload(dest, buf, {
        contentType: file.type || "image/jpeg",
        upsert: true,
      });
      if (error) throw new Error(`upload ${dest}: ${error.message}`);
      galleryPaths.push(dest);
      i++;
    }
    if (coverFile) {
      const dest = `plays/${slug}/cover-${safeFileName(coverFile.name)}`;
      const buf = Buffer.from(await coverFile.arrayBuffer());
      const { error } = await bucket.upload(dest, buf, {
        contentType: coverFile.type || "image/jpeg",
        upsert: true,
      });
      if (error) throw new Error(`upload ${dest}: ${error.message}`);
      coverPath = dest;
    }
  } catch (e) {
    // Roll back: delete row + any objects we managed to upload.
    const cleanup = [...galleryPaths];
    if (coverPath) cleanup.push(coverPath);
    if (cleanup.length > 0) {
      await bucket.remove(cleanup);
    }
    await admin.from("plays").delete().eq("slug", slug);
    return NextResponse.json(
      { error: "upload_failed", message: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }

  const { error: readyErr } = await admin
    .from("plays")
    .update({
      cover_path: coverPath ?? galleryPaths[0],
      gallery_paths: galleryPaths,
      status: "ready",
    })
    .eq("slug", slug);
  if (readyErr) {
    const cleanup = [...galleryPaths];
    if (coverPath) cleanup.push(coverPath);
    await bucket.remove(cleanup);
    await admin.from("plays").delete().eq("slug", slug);
    return NextResponse.json(
      { error: "finalize_failed", message: readyErr.message },
      { status: 500 },
    );
  }

  revalidatePlays();
  return NextResponse.json(
    { ok: true, slug, gallery_paths: galleryPaths },
    { status: 201 },
  );
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("plays")
    .select("*")
    .order("position");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ plays: data ?? [] });
}
