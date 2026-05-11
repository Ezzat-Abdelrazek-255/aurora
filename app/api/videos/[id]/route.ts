import { NextResponse, type NextRequest } from "next/server";
import { tasks } from "@trigger.dev/sdk";
import { z } from "zod";
import { requireAdmin } from "../../../lib/admin";
import { createSupabaseAdminClient } from "../../../lib/supabase/admin";
import { uploadCustomPoster } from "../../../lib/customPoster";
import { categorySchema, roleSchema } from "../../../lib/videos";
import { revalidateVideos } from "../../../lib/videos-server";
import type { processVideo } from "../../../../trigger/processVideo";

const PatchBody = z.object({
  name: z.string().min(1).max(120).optional(),
  category: categorySchema.optional(),
  role: roleSchema.optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_request: NextRequest, ctx: Ctx) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const { id } = await ctx.params;
  const admin = createSupabaseAdminClient();

  const { data: row, error: readErr } = await admin
    .from("videos")
    .select("clip_path,poster_path,custom_poster_path")
    .eq("vimeo_id", id)
    .maybeSingle();
  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Best-effort storage cleanup.
  const objects = [row.clip_path, row.poster_path, row.custom_poster_path].filter(
    (p): p is string => !!p,
  );
  if (objects.length > 0) {
    await admin.storage.from("clips").remove(objects);
  }

  const { error: delErr } = await admin
    .from("videos")
    .delete()
    .eq("vimeo_id", id);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  revalidateVideos();
  return new NextResponse(null, { status: 204 });
}

/**
 * POST /api/videos/<id> — re-trigger processing for a row that's stuck in
 * 'failed'. Resets status to 'pending' and fires the task again.
 */
export async function POST(_request: NextRequest, ctx: Ctx) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const { id } = await ctx.params;
  const admin = createSupabaseAdminClient();

  const { data: row, error: readErr } = await admin
    .from("videos")
    .select("vimeo_id,vimeo_hash,name,category,role")
    .eq("vimeo_id", id)
    .maybeSingle();
  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await admin
    .from("videos")
    .update({ status: "pending", error_message: null })
    .eq("vimeo_id", id);

  try {
    const handle = await tasks.trigger<typeof processVideo>("process-video", {
      vimeoId: row.vimeo_id,
      vimeoHash: row.vimeo_hash,
      name: row.name,
      category: row.category,
      role: row.role,
    });
    revalidateVideos();
    return NextResponse.json({ ok: true, runId: handle.id }, { status: 202 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await admin
      .from("videos")
      .update({ status: "failed", error_message: `trigger: ${msg}` })
      .eq("vimeo_id", id);
    return NextResponse.json(
      { error: "trigger_failed", message: msg },
      { status: 502 },
    );
  }
}

/**
 * PATCH /api/videos/<id> — edit name / category / role and/or replace the
 * custom thumbnail. Accepts JSON for the metadata-only path or multipart for
 * thumbnail uploads. The Vimeo URL itself is immutable (it's the primary
 * key); to swap to a different video, delete this row and add a new one.
 */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const { id } = await ctx.params;

  const ct = request.headers.get("content-type") ?? "";
  let metaInput: Record<string, unknown> = {};
  let thumbnail: File | null = null;
  let removeThumbnail = false;
  if (ct.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json(
        { error: "invalid_body", message: "Expected multipart/form-data" },
        { status: 400 },
      );
    }
    for (const key of ["name", "category", "role"] as const) {
      const v = form.get(key);
      if (typeof v === "string" && v.length > 0) metaInput[key] = v;
    }
    const thumb = form.get("thumbnail");
    if (thumb instanceof File && thumb.size > 0) thumbnail = thumb;
    removeThumbnail = form.get("removeThumbnail") === "true";
  } else {
    metaInput = (await request.json().catch(() => null)) ?? {};
  }

  const parsed = PatchBody.safeParse(metaInput);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  if (
    Object.keys(parsed.data).length === 0 &&
    !thumbnail &&
    !removeThumbnail
  ) {
    return NextResponse.json(
      { error: "invalid_body", message: "At least one field is required" },
      { status: 400 },
    );
  }

  const admin = createSupabaseAdminClient();

  // Need the existing custom_poster_path to delete the old object after a
  // successful replacement (or on explicit removal).
  let previousCustomPoster: string | null = null;
  if (thumbnail || removeThumbnail) {
    const { data: existing, error: readErr } = await admin
      .from("videos")
      .select("custom_poster_path")
      .eq("vimeo_id", id)
      .maybeSingle();
    if (readErr) {
      return NextResponse.json({ error: readErr.message }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    previousCustomPoster = existing.custom_poster_path ?? null;
  }

  const update: Record<string, unknown> = { ...parsed.data };
  let uploadedKey: string | null = null;
  if (thumbnail) {
    try {
      uploadedKey = await uploadCustomPoster(admin, id, thumbnail);
      update.custom_poster_path = uploadedKey;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json(
        { error: "thumbnail_upload_failed", message: msg },
        { status: 500 },
      );
    }
  } else if (removeThumbnail) {
    update.custom_poster_path = null;
  }

  const { data, error } = await admin
    .from("videos")
    .update(update)
    .eq("vimeo_id", id)
    .select("vimeo_id,name,category,role,custom_poster_path")
    .maybeSingle();
  if (error) {
    if (uploadedKey) {
      await admin.storage.from("clips").remove([uploadedKey]);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    if (uploadedKey) {
      await admin.storage.from("clips").remove([uploadedKey]);
    }
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Purge the previous custom poster object after the row has flipped.
  if (
    previousCustomPoster &&
    previousCustomPoster !== data.custom_poster_path
  ) {
    await admin.storage.from("clips").remove([previousCustomPoster]);
  }

  revalidateVideos();
  return NextResponse.json({ ok: true, video: data });
}
