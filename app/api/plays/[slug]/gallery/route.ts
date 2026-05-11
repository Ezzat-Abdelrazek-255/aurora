import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "../../../../lib/admin";
import { revalidatePlays } from "../../../../lib/plays-server";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";

type Ctx = { params: Promise<{ slug: string }> };

const ALLOWED_MIME = /^image\/(jpeg|jpg|png|webp)$/i;

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

// PATCH: reorder a play's gallery. Body must be a permutation of the row's
// current gallery_paths — no additions or removals here, that's POST/DELETE.
const ReorderBody = z.object({
  paths: z.array(z.string().min(1)).min(1).max(200),
});

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const { slug } = await ctx.params;
  const json = await request.json().catch(() => null);
  const parsed = ReorderBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const admin = createSupabaseAdminClient();
  const { data: row, error: readErr } = await admin
    .from("plays")
    .select("gallery_paths")
    .eq("slug", slug)
    .maybeSingle();
  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const current = ((row.gallery_paths as string[] | null) ?? []).slice();
  const next = parsed.data.paths;
  if (
    next.length !== current.length ||
    new Set(next).size !== next.length ||
    next.some((p) => !current.includes(p))
  ) {
    return NextResponse.json(
      {
        error: "invalid_order",
        message: "paths must be a permutation of the existing gallery",
      },
      { status: 400 },
    );
  }

  const { error: updErr } = await admin
    .from("plays")
    .update({ gallery_paths: next })
    .eq("slug", slug);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  revalidatePlays();
  return NextResponse.json({ ok: true, gallery_paths: next });
}

// POST: append new gallery images. Multipart with `images` (1+ files).
export async function POST(request: NextRequest, ctx: Ctx) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const { slug } = await ctx.params;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "invalid_body", message: "Expected multipart/form-data" },
      { status: 400 },
    );
  }
  const files: File[] = [];
  for (const [key, value] of form.entries()) {
    if (key === "images" && value instanceof File) files.push(value);
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

  const admin = createSupabaseAdminClient();
  const { data: row, error: readErr } = await admin
    .from("plays")
    .select("gallery_paths")
    .eq("slug", slug)
    .maybeSingle();
  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const existing = ((row.gallery_paths as string[] | null) ?? []).slice();
  // Pick an index prefix that won't collide with anything already there.
  const usedIndexes = new Set<number>();
  for (const p of existing) {
    const m = p.match(/\/(\d{2,})-/);
    if (m) usedIndexes.add(parseInt(m[1], 10));
  }
  let nextIndex = existing.length + 1;
  while (usedIndexes.has(nextIndex)) nextIndex++;

  const bucket = admin.storage.from("clips");
  const uploaded: string[] = [];
  try {
    for (const file of files) {
      const indexed = String(nextIndex).padStart(2, "0");
      // Suffix with timestamp so re-uploading a same-named file after a delete
      // can't collide with a (cached) deleted object's URL.
      const dest = `plays/${slug}/${indexed}-${Date.now()}-${safeFileName(file.name)}`;
      const buf = Buffer.from(await file.arrayBuffer());
      const { error } = await bucket.upload(dest, buf, {
        contentType: file.type || "image/jpeg",
        upsert: false,
      });
      if (error) throw new Error(`upload ${dest}: ${error.message}`);
      uploaded.push(dest);
      nextIndex++;
      while (usedIndexes.has(nextIndex)) nextIndex++;
    }
  } catch (e) {
    if (uploaded.length > 0) await bucket.remove(uploaded);
    return NextResponse.json(
      { error: "upload_failed", message: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }

  const merged = [...existing, ...uploaded];
  const { error: updErr } = await admin
    .from("plays")
    .update({ gallery_paths: merged })
    .eq("slug", slug);
  if (updErr) {
    await bucket.remove(uploaded);
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  revalidatePlays();
  return NextResponse.json(
    { ok: true, gallery_paths: merged, added: uploaded },
    { status: 201 },
  );
}

// DELETE: remove a single image from the gallery. Body: { path: string }.
const DeleteBody = z.object({ path: z.string().min(1) });

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const { slug } = await ctx.params;
  const json = await request.json().catch(() => null);
  const parsed = DeleteBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const admin = createSupabaseAdminClient();
  const { data: row, error: readErr } = await admin
    .from("plays")
    .select("gallery_paths, cover_path")
    .eq("slug", slug)
    .maybeSingle();
  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const current = ((row.gallery_paths as string[] | null) ?? []).slice();
  if (!current.includes(parsed.data.path)) {
    return NextResponse.json(
      { error: "not_in_gallery", message: "path is not part of this play's gallery" },
      { status: 400 },
    );
  }
  if (current.length <= 1) {
    return NextResponse.json(
      { error: "last_image", message: "Cannot remove the last gallery image" },
      { status: 400 },
    );
  }

  const next = current.filter((p) => p !== parsed.data.path);
  const update: { gallery_paths: string[]; cover_path?: string } = {
    gallery_paths: next,
  };
  // If the cover was sourced from the removed gallery entry, point it at the
  // new head so the grid card keeps rendering.
  if (row.cover_path === parsed.data.path) update.cover_path = next[0];

  const { error: updErr } = await admin
    .from("plays")
    .update(update)
    .eq("slug", slug);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  // Best-effort storage cleanup. If this fails we've already detached the row
  // from the object, so it becomes an orphan — acceptable trade-off.
  await admin.storage.from("clips").remove([parsed.data.path]);

  revalidatePlays();
  return NextResponse.json({ ok: true, gallery_paths: next });
}
